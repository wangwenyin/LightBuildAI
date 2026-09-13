import { createError } from 'h3'
import { readFile } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import {
  createUpstreamError,
  parseJsonResponse,
  type QueryNightImageJobResult,
  type SubmitNightImageJobResult,
} from './hunyuan-shared'
import { downloadOSSObject } from './oss'

/**
 * 自定义 Undici Agent：显式设置连接超时。
 * Vercel（海外节点）调用腾讯国内 API 时，默认 ~10s 的 TCP 连接超时
 * 会直接抛 UND_ERR_CONNECT_TIMEOUT。加大到 30s 给跨境链路更多时间窗口。
 *
 * 注意：如果腾讯 API 对 Vercel IP 段不可达（GFW/运营商策略），
 * 再长的 connectTimeout 也无法解决——此时需要「国内中转」方案（见下方 catch 分支提示）。
 */
let tokenHubAgent: any = undefined
try {
  // 用同步 require 而非顶层 await import——Nitro 默认目标 es2019 不支持 top-level await
  const undici = require('undici') as any
  tokenHubAgent = new undici.Agent({ connectTimeout: 30_000 })
} catch {
  // undici 在部分 Node.js 运行时可能不可用，降级为无 Agent（使用默认 fetch 行为）
}

const MAX_REFERENCE_IMAGE_BYTES = 1024 * 1024
/**
 * 混元生图 Hy-Image-3.0（model=hy-image-v3）是**同步接口**：
 * POST /v1/wand/hunyuan-image/v3-generation 一次请求直接返回图片 URL，无需 submit+query。
 *
 * 注意与**异步**接口 /v1/api/image/submit（对应 hy-image-v3.0 模型）的区别——
 * 代码历史上错误地把同步模型名 hy-image-v3 配到了异步端点，导致
 * "请求中的模型或服务 ID hy-image-v3 不存在" 报错（400004）。
 *
 * 详见官方文档：
 * - https://cloud.tencent.com/document/product/1823/135745（同步 Hy 生图调用指南）
 * - https://cloud.tencent.com/document/product/1823/135744（图像生成模型调用概览）
 */
const TOKENHUB_GENERATE_URL = 'https://tokenhub.tencentmaas.com/v1/wand/hunyuan-image/v3-generation'
const TOKENHUB_MODEL = 'hy-image-v3'
// 同步生图通常 10-30s，少数情况下会到 60s+。设 90s 作为服务端兜底超时。
// 注意：Vercel Serverless Function 的 maxDuration 必须 >= 此值；
// 当前 vercel.json 已配置 server/api/generate.post.ts 的 maxDuration=60，
// 如果遇到 504，请把 vercel.json 里该端点的 maxDuration 调到 120 或 300（Pro plan）。
const TOKENHUB_SYNC_TIMEOUT_MS = 90_000

export async function submitTokenHubReferenceImageJob({
  originalUrl,
  originalObjectKey,
  prompt,
  negativePrompt,
  revise,
  tokenHubApiKey,
  publicOrigin,
  imageWidth,
  imageHeight,
  ossRegion,
  ossAccessKeyId,
  ossAccessKeySecret,
  ossBucket,
  ossEndpoint,
}: {
  originalUrl: string
  originalObjectKey?: string
  prompt: string
  negativePrompt?: string
  revise?: boolean
  tokenHubApiKey: string
  publicOrigin?: string
  imageWidth?: number
  imageHeight?: number
  ossRegion?: string
  ossAccessKeyId?: string
  ossAccessKeySecret?: string
  ossBucket?: string
  ossEndpoint?: string
}): Promise<SubmitNightImageJobResult> {
  if (!tokenHubApiKey) {
    throw createError({
      statusCode: 500,
      statusMessage: '缺少 TokenHub API Key，请在 Vercel 环境变量中配置 TOKENHUB_API_KEY_IMAGE',
      data: {
        message: '缺少 TokenHub API Key，请在 Vercel 环境变量中配置 TOKENHUB_API_KEY_IMAGE',
      },
    })
  }

  const image = await createTokenHubImageInput(originalUrl, {
    publicOrigin,
    originalObjectKey,
    ossRegion,
    ossAccessKeyId,
    ossAccessKeySecret,
    ossBucket,
    ossEndpoint,
  })
  const size = buildTokenHubSize(imageWidth, imageHeight)
  const seed = createSeed()
  // TokenHub /v1/wand/hunyuan-image/v3-generation 同步接口的官方字段：
  //   model / prompt / images / size / seed / revise / footnote
  // 字段类型严格按官方文档（详见 https://cloud.tencent.com/document/product/1823/135745）：
  //   - size: `${宽}x${高}`，例如 `1024x1024`
  //   - revise: boolean（不是 0/1 数字）
  //   - seed: [1, 4294967295]
  // 注意：wand 同步接口的输入参数列表里**没有** negative_prompt 字段，
  //       传了会被服务端当作"未知字段"，历史上曾因此直接 500，因此这里只拼合到 prompt 头尾部。
  const fullPrompt = buildReferenceImagePrompt(prompt, negativePrompt)
  const payload = {
    model: TOKENHUB_MODEL,
    prompt: fullPrompt,
    images: [image],
    size,
    seed,
    revise: revise === false ? false : true,
  }

  console.log('[tokenhub] sync generate params:', summarizeSyncParams(payload))

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TOKENHUB_SYNC_TIMEOUT_MS)

  try {
    const fetchOptions: any = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenHubApiKey}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    }
    if (tokenHubAgent) {
      fetchOptions.dispatcher = tokenHubAgent
    }

    const response = await fetch(TOKENHUB_GENERATE_URL, fetchOptions)

    const data = await parseJsonResponse(response, 'TokenHub 同步生图接口')
    // 无论成功失败，都把上游原始响应打到服务端日志，便于排查字段名差异。
    console.log('[tokenhub] sync generate raw response:', JSON.stringify(data).slice(0, 2000))

    // TokenHub 部分错误会用 HTTP 200 + {"error": {...}} 返回（而非 4xx），
    // 必须在「响应正常」时也检测 error 字段，否则会被后面的兜底逻辑当成 [unhandled] 抛出。
    if (!response.ok || data?.error) {
      throw createUpstreamError(
        response.status || 502,
        extractTokenHubErrorMessage(data, 'TokenHub 同步生图失败'),
        data,
      )
    }

    const imageUrl = readSyncImageUrl(data)
    const revisedPrompt = readSyncRevisedPrompt(data)
    const requestId = readSyncRequestId(data)

    if (!imageUrl) {
      throw createUpstreamError(502, `TokenHub 同步生图成功，但响应中未识别到图片字段。${summarizeRawData(data)}`, data)
    }

    return {
      jobId: `tokenhub-sync:${requestId || createSeed()}`,
      imageUrl,
      requestId,
      provider: 'tokenhub-reference-image' as const,
      seed,
      size,
    }
  } catch (error) {
    // 已经格式化的 H3 错误直接抛出，便于前端拿到具体消息。
    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }

    if (error instanceof Error && error.name === 'AbortError') {
      throw createError({
        statusCode: 504,
        statusMessage: `TokenHub 同步生图超时（${TOKENHUB_SYNC_TIMEOUT_MS / 1000}s）。请稍后重试，或换一张更小的参考图。`,
        data: {
          message: `TokenHub 同步生图超时（${TOKENHUB_SYNC_TIMEOUT_MS / 1000}s）。请稍后重试，或换一张更小的参考图。`,
        },
      })
    }

    // 跨境网络不可达时的特殊提示（UND_ERR_CONNECT_TIMEOUT / ECONNREFUSED 等）
    if (error instanceof Error) {
      const cause: any = (error as any).cause
      const causeCode = typeof cause?.code === 'string' ? cause.code : ''
      const isConnectError = causeCode === 'UND_ERR_CONNECT_TIMEOUT'
        || causeCode === 'ECONNREFUSED'
        || causeCode === 'ENOTFOUND'
        || error.message.includes('CONNECT_TIMEOUT')
        || error.message.includes('ECONNREFUSED')
        || error.message.includes('fetch failed')

      if (isConnectError) {
        console.error('[tokenhub] 连接 TokenHub API 失败（可能为跨境网络不可达）:', causeCode || error.message)
        throw createError({
          statusCode: 502,
          statusMessage: `无法连接到生图服务（${causeCode || 'NETWORK_ERROR'}）。如果部署在 Vercel 等海外平台，需要配置国内中转服务。`,
          data: {
            message: `无法连接到生图服务。错误码: ${causeCode || 'UNKNOWN'}。这通常是因为 Vercel 等海外服务器无法直接访问腾讯国内 API，需要部署一个国内中转层。`,
            code: causeCode || 'UNKNOWN',
            hint: 'PROXY_REQUIRED',
          },
        })
      }
    }

    const message = error instanceof Error ? error.message : String(error)
    throw createError({
      statusCode: 500,
      statusMessage: `TokenHub 同步生图失败：${message}`,
      data: {
        message: `TokenHub 同步生图失败：${message}`,
      },
    })
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 同步通道下，/api/generate 已经在响应里返回 imageUrl，前端不会再轮询。
 * 保留此函数仅为了兼容旧的调用入口（queryNightImageJob / /api/task）：
 * - `tokenhub-sync:*` 任务表示同步通道已完成，结果已在 /api/generate 响应中给出，
 *   无需再 query，返回 failed（带说明），前端拿到后会退出轮询。
 * - 其他前缀视为历史异步通道残留：返回 done，让前端退出轮询。
 */
export async function queryTokenHubImageJob(taskId: string, _tokenHubApiKey?: string): Promise<QueryNightImageJobResult> {
  if (taskId.startsWith('tokenhub-sync:')) {
    return {
      status: 'failed' as const,
      errorMessage: '同步通道任务不需要轮询，结果已在 /api/generate 响应中返回',
    }
  }

  return {
    status: 'failed' as const,
    errorMessage: '历史异步通道任务已废弃，请重新提交（当前使用 Hy-Image-3.0 同步通道）',
  }
}

async function createTokenHubImageInput(originalUrl: string, options: {
  publicOrigin?: string
  originalObjectKey?: string
  ossRegion?: string
  ossAccessKeyId?: string
  ossAccessKeySecret?: string
  ossBucket?: string
  ossEndpoint?: string
}) {
  if (isImageDataUrl(originalUrl)) {
    return originalUrl
  }

  if (options.originalObjectKey && options.ossBucket) {
    const { buffer, contentType } = await downloadOSSObject(options.originalObjectKey, {
      ossRegion: options.ossRegion,
      ossAccessKeyId: options.ossAccessKeyId,
      ossAccessKeySecret: options.ossAccessKeySecret,
      ossBucket: options.ossBucket,
      ossEndpoint: options.ossEndpoint,
    })

    return `data:${normalizeTokenHubMimeType(contentType)};base64,${buffer.toString('base64')}`
  }

  if (isHttpUrl(originalUrl)) {
    return originalUrl
  }

  const absoluteUrl = resolveTokenHubImageUrl(originalUrl, options.publicOrigin)

  if (absoluteUrl) {
    return absoluteUrl
  }

  const imageBuffer = await readUploadImageBuffer(originalUrl)
  const mimeType = detectImageMimeType(originalUrl)

  return `data:${mimeType};base64,${imageBuffer.toString('base64')}`
}

async function readUploadImageBuffer(originalUrl: string, maxBytes = MAX_REFERENCE_IMAGE_BYTES) {
  if (!originalUrl.startsWith('/uploads/')) {
    throw createError({
      statusCode: 400,
      statusMessage: '图片地址格式不合法，请先通过上传接口上传图片',
    })
  }

  const uploadPath = decodeURIComponent(originalUrl.split('?')[0])
  const uploadFilePath = resolve(`public${uploadPath}`)
  const uploadDir = resolve('public/uploads')

  if (!uploadFilePath.startsWith(`${uploadDir}${sep}`)) {
    throw createError({
      statusCode: 400,
      statusMessage: '图片地址格式不合法',
    })
  }

  const imageBuffer = await readFile(uploadFilePath)

  if (imageBuffer.byteLength > maxBytes) {
    throw createError({
      statusCode: 400,
      statusMessage: maxBytes === MAX_REFERENCE_IMAGE_BYTES
        ? 'TokenHub Base64 参考图需不超过 1MB，请压缩后重试'
        : '图片过大，请上传更小的 jpg、jpeg 或 png 图片',
    })
  }

  return imageBuffer
}

function buildReferenceImagePrompt(prompt: string, negativePrompt?: string) {
  const parts = [
    '以参考图真实改夜景，保持主体、构图、视角、透视、位置不变，只改昼夜和灯光。',
    prompt,
  ]

  if (negativePrompt) {
    parts.push(`Negative: ${negativePrompt}`)
  }

  return parts.join(' ')
}

function resolveTokenHubImageUrl(originalUrl: string, publicOrigin?: string) {
  if (isHttpUrl(originalUrl)) {
    return originalUrl
  }

  if (!publicOrigin || isPrivateOrigin(publicOrigin)) {
    return undefined
  }

  try {
    return new URL(originalUrl, publicOrigin).toString()
  } catch {
    return undefined
  }
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function isImageDataUrl(value: string) {
  return /^data:image\/(?:png|jpe?g|webp);base64,/i.test(value)
}

function isPrivateOrigin(value: string) {
  try {
    const url = new URL(value)
    return ['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(url.hostname)
  } catch {
    return true
  }
}

function detectImageMimeType(filePath: string) {
  const normalized = filePath.toLowerCase()

  if (normalized.endsWith('.png')) {
    return 'image/png'
  }

  if (normalized.endsWith('.webp')) {
    return 'image/webp'
  }

  return 'image/jpeg'
}

function normalizeTokenHubMimeType(contentType: string) {
  const normalized = contentType.split(';')[0]?.trim().toLowerCase()

  if (normalized === 'image/png' || normalized === 'image/webp') {
    return normalized
  }

  return 'image/jpeg'
}

/**
 * 同步接口 size 格式：${宽}x${高}（如 `1024x1024`），宽高 [512, 2048]，面积 ≤ 1024×1024。
 * 详见 https://cloud.tencent.com/document/product/1823/135745
 */
const TOKENHUB_SIZE_CANDIDATES = [
  '2048x512',
  '1280x720',
  '1024x768',
  '1024x1024',
  '768x1024',
  '720x1280',
  '512x2048',
] as const

function buildTokenHubSize(width?: number, height?: number) {
  return pickClosestSize(width, height, TOKENHUB_SIZE_CANDIDATES, '1024x1024')
}

function pickClosestSize(
  width: number | undefined,
  height: number | undefined,
  candidates: readonly string[],
  fallback: string,
) {
  if (!width || !height) {
    return fallback
  }

  const ratio = width / height
  let bestSize = fallback
  let bestDistance = Number.POSITIVE_INFINITY

  for (const candidate of candidates) {
    const [candidateWidth, candidateHeight] = candidate.split('x').map(Number)

    if (!candidateWidth || !candidateHeight) {
      continue
    }

    const candidateRatio = candidateWidth / candidateHeight
    const distance = Math.abs(Math.log(ratio / candidateRatio))

    if (distance < bestDistance) {
      bestDistance = distance
      bestSize = candidate
    }
  }

  return bestSize
}

function createSeed() {
  return Math.floor(Math.random() * 1_000_000_000)
}

function summarizeSyncParams(params: {
  model: string
  prompt: string
  images: string[]
  size: string
  seed: number
  revise: boolean
}) {
  return {
    model: params.model,
    promptLength: params.prompt.length,
    imagePreview: params.images[0]?.slice(0, 80),
    size: params.size,
    seed: params.seed,
    revise: params.revise,
    negativePromptIncluded: params.prompt.includes('Negative:'),
  }
}

function extractTokenHubErrorMessage(data: any, fallback: string) {
  const errorObj = data?.error

  const message = errorObj?.message_zh
    || errorObj?.message
    || data?.message_zh
    || data?.message
    || data?.msg
    || data?.detail

  if (message) {
    return message
  }

  // fallback 时把上游响应的字段摘要带回去，方便定位字段命名差异
  return `${fallback}。${summarizeRawData(data)}`
}

function readSyncImageUrl(data: any) {
  // OpenAI 兼容：data.data[0].url | data.data[0].b64_json
  const openAiImage = data?.data?.[0]

  if (typeof openAiImage === 'string') {
    return openAiImage
  }

  if (openAiImage) {
    if (typeof openAiImage.url === 'string') {
      return openAiImage.url
    }

    if (typeof openAiImage.image_url === 'string') {
      return openAiImage.image_url
    }

    if (typeof openAiImage.b64_json === 'string') {
      return `data:image/png;base64,${openAiImage.b64_json}`
    }
  }

  // 部分接口使用 images: [{ url | b64_json | image_url }]
  const wandImage = data?.images?.[0]

  if (typeof wandImage === 'string') {
    return wandImage
  }

  if (wandImage) {
    if (typeof wandImage.url === 'string') {
      return wandImage.url
    }

    if (typeof wandImage.image_url === 'string') {
      return wandImage.image_url
    }

    if (typeof wandImage.b64_json === 'string') {
      return `data:image/png;base64,${wandImage.b64_json}`
    }
  }

  // 腾讯 wand/混元风格：data.output.url / image_url / image
  const output = data?.output

  if (output) {
    if (typeof output.url === 'string') {
      return output.url
    }

    if (typeof output.image_url === 'string') {
      return output.image_url
    }

    if (typeof output.image === 'string') {
      return output.image
    }
  }

  // OpenAI Chat 多模态：data.choices[0].message.content[] 含 type=image_url 项
  const choicesContent = data?.choices?.[0]?.message?.content

  if (Array.isArray(choicesContent)) {
    for (const part of choicesContent) {
      const url = part?.image_url?.url || part?.image_url || part?.url
      if (typeof url === 'string') {
        return url
      }
    }
  }

  // 顶层字段兜底
  for (const key of ['image_url', 'imageUrl', 'url', 'image', 'result_image', 'result']) {
    const value = data?.[key]

    if (typeof value === 'string') {
      return value
    }
  }

  // results: [{ url | ... }]
  const firstResult = data?.results?.[0]

  if (typeof firstResult === 'string') {
    return firstResult
  }

  if (firstResult) {
    if (typeof firstResult.url === 'string') {
      return firstResult.url
    }

    if (typeof firstResult.image_url === 'string') {
      return firstResult.image_url
    }
  }

  return undefined
}

/**
 * 当 statusMessage 走到 fallback（即上游响应里没有 error.message 等已知字段）时，
 * 把原始响应的浅层 keys + 摘要拼成可读字符串塞进 statusMessage，
 * 便于前端和 Vercel 日志直接看到上游返回结构，定位字段命名差异。
 */
function summarizeRawData(data: any) {
  try {
    const json = JSON.stringify(data)
    const keys = data && typeof data === 'object' ? Object.keys(data).join(',') : '(non-object)'
    return `上游响应 keys=[${keys}] preview=${json.slice(0, 300)}`
  } catch {
    return '上游响应无法序列化'
  }
}

function readSyncRevisedPrompt(data: any) {
  return data?.data?.[0]?.revised_prompt || data?.revised_prompt
}

function readSyncRequestId(data: any) {
  return data?.request_id || data?.requestId
}
