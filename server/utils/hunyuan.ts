import { createError } from 'h3'
import fs from 'node:fs/promises'
import path from 'node:path'
import tencentcloud from 'tencentcloud-sdk-nodejs'

const { hunyuan } = tencentcloud
const HunyuanClient = hunyuan.v20230901.Client

const MAX_REFERENCE_IMAGE_BYTES = 1024 * 1024
const TOKENHUB_SUBMIT_URL = 'https://tokenhub.tencentmaas.com/v1/api/image/submit'
const TOKENHUB_QUERY_URL = 'https://tokenhub.tencentmaas.com/v1/api/image/query'
const TOKENHUB_MODEL = 'hy-image-v3.0'

type HunyuanCredentials = {
  secretId?: string
  secretKey?: string
  region?: string
  tokenHubApiKey?: string
}

type SubmitNightImageJobParams = HunyuanCredentials & {
  originalUrl?: string
  prompt: string
  negativePrompt?: string
  revise?: boolean
  publicOrigin?: string
  imageWidth?: number
  imageHeight?: number
}

type ContentImagePayload =
  | { ImageUrl: string }
  | { ImageBase64: string }

export async function submitNightImageJob({
  originalUrl,
  prompt,
  negativePrompt,
  revise,
  secretId,
  secretKey,
  region,
  tokenHubApiKey,
  publicOrigin,
  imageWidth,
  imageHeight,
}: SubmitNightImageJobParams) {
  if (originalUrl && tokenHubApiKey) {
    try {
      return await submitTokenHubReferenceImageJob({
        originalUrl,
        prompt,
        negativePrompt,
        revise,
        tokenHubApiKey,
        publicOrigin,
        imageWidth,
        imageHeight,
      })
    } catch (error) {
      if (!shouldFallback(error)) {
        throw error
      }

      console.warn('TokenHub 参考图生成不可用，回退到旧混元参考图任务：', summarizeError(error))
    }
  }

  return submitHunyuanImageJob({
    originalUrl,
    prompt,
    negativePrompt,
    revise,
    secretId,
    secretKey,
    region,
    imageWidth,
    imageHeight,
  })
}

export async function queryNightImageJob(
  jobId: string,
  credentials: HunyuanCredentials,
) {
  if (jobId.startsWith('tokenhub:')) {
    return queryTokenHubImageJob(jobId.slice('tokenhub:'.length), credentials.tokenHubApiKey)
  }

  return queryLegacyHunyuanImageJob(jobId, credentials)
}

async function submitTokenHubReferenceImageJob({
  originalUrl,
  prompt,
  negativePrompt,
  revise,
  tokenHubApiKey,
  publicOrigin,
  imageWidth,
  imageHeight,
}: {
  originalUrl: string
  prompt: string
  negativePrompt?: string
  revise?: boolean
  tokenHubApiKey: string
  publicOrigin?: string
  imageWidth?: number
  imageHeight?: number
}) {
  const image = await createTokenHubImageInput(originalUrl, publicOrigin)
  const resolution = buildTokenHubResolution(imageWidth, imageHeight)
  const seed = createSeed()
  const payload = {
    model: TOKENHUB_MODEL,
    prompt: buildReferenceImagePrompt(prompt),
    images: [image],
    Resolution: resolution,
    extra_body: {
      seed,
      revise: revise === false ? false : true,
    },
    ...(negativePrompt ? { negative_prompt: negativePrompt } : {}),
  }

  console.log('TokenHub submit params:', summarizeTokenHubSubmitParams(payload))

  const response = await fetch(TOKENHUB_SUBMIT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenHubApiKey}`,
    },
    body: JSON.stringify(payload),
  })

  const data = await parseJsonResponse(response)

  if (!response.ok) {
    throw createUpstreamError(response.status, extractTokenHubErrorMessage(data, 'TokenHub 提交任务失败'))
  }

  const taskId = readTokenHubTaskId(data)

  if (!taskId) {
    throw new Error('TokenHub 未返回任务 ID')
  }

  return {
    jobId: `tokenhub:${taskId}`,
    imageUrl: undefined,
    requestId: readTokenHubRequestId(data),
    provider: 'tokenhub-reference-image' as const,
    seed,
    size: resolution,
  }
}

async function queryTokenHubImageJob(taskId: string, tokenHubApiKey?: string) {
  if (!tokenHubApiKey) {
    throw new Error('缺少 TokenHub API Key，请在 .env 中配置 TokenHub_API_KEY')
  }

  const response = await fetch(TOKENHUB_QUERY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenHubApiKey}`,
    },
    body: JSON.stringify({
      model: TOKENHUB_MODEL,
      id: taskId,
    }),
  })

  const data = await parseJsonResponse(response)

  if (!response.ok) {
    throw createUpstreamError(response.status, extractTokenHubErrorMessage(data, 'TokenHub 查询任务失败'))
  }

  const status = readTokenHubTaskStatus(data)
  const imageUrl = readTokenHubImageUrl(data)
  const revisedPrompt = readTokenHubRevisedPrompt(data)
  const requestId = readTokenHubRequestId(data)

  if (status === 'completed' || status === 'succeeded' || status === 'succeed') {
    if (!imageUrl) {
      throw new Error('TokenHub 任务已完成，但未返回图片地址')
    }

    return {
      status: 'done' as const,
      imageUrl,
      revisedPrompt,
      statusCode: status,
      statusMessage: 'TokenHub 任务已完成',
      requestId,
    }
  }

  if (status === 'failed') {
    return {
      status: 'failed' as const,
      errorMessage: extractTokenHubErrorMessage(data, 'TokenHub 生成任务失败'),
      statusCode: status,
      statusMessage: 'TokenHub 任务失败',
      requestId,
    }
  }

  return {
    status: 'processing' as const,
    revisedPrompt,
    statusCode: status || 'processing',
    statusMessage: 'TokenHub 任务处理中',
    requestId,
  }
}

async function submitHunyuanImageJob({
  originalUrl,
  prompt,
  negativePrompt,
  revise,
  secretId,
  secretKey,
  region,
  imageWidth,
  imageHeight,
}: SubmitNightImageJobParams) {
  const client = createHunyuanClient({ secretId, secretKey, region })
  const contentImage = originalUrl ? await createContentImage(originalUrl) : undefined
  const resolution = buildLegacyResolution(imageWidth, imageHeight)

  const submitParams = {
    Prompt: prompt,
    ...(negativePrompt ? { NegativePrompt: negativePrompt } : {}),
    Resolution: resolution,
    Num: 1,
    Revise: revise === false ? 0 : 1,
    LogoAdd: 0,
    ...(contentImage ? { ContentImage: contentImage } : {}),
  }

  console.log('SubmitHunyuanImageJob params:', summarizeLegacySubmitParams(submitParams))

  const submitResult = await client.SubmitHunyuanImageJob(submitParams)
  const jobId = submitResult.JobId

  if (!jobId) {
    throw new Error('混元接口未返回任务 ID')
  }

  return {
    jobId,
    imageUrl: undefined,
    requestId: undefined,
    provider: (contentImage
      ? 'hunyuan-reference-fallback'
      : 'hunyuan-text-to-image') as 'hunyuan-reference-fallback' | 'hunyuan-text-to-image',
    seed: undefined,
    size: undefined,
  }
}

async function queryLegacyHunyuanImageJob(
  jobId: string,
  credentials: HunyuanCredentials,
) {
  const client = createHunyuanClient(credentials)
  const queryResult = await client.QueryHunyuanImageJob({ JobId: jobId })
  const statusCode = String(queryResult.JobStatusCode || '')
  const statusMessage = queryResult.JobStatusMsg || ''
  const requestId = queryResult.RequestId || ''
  const errorCode = queryResult.JobErrorCode || ''
  const errorMessage = queryResult.JobErrorMsg || ''

  if (statusCode === '5') {
    const imageUrl = queryResult.ResultImage?.[0]

    if (!imageUrl) {
      throw new Error('混元任务已完成，但未返回图片地址')
    }

    return {
      status: 'done' as const,
      imageUrl,
      revisedPrompt: queryResult.RevisedPrompt?.[0],
      statusCode,
      statusMessage,
      requestId,
    }
  }

  if (statusCode === '4') {
    return {
      status: 'failed' as const,
      errorMessage: errorMessage || '混元生成任务失败',
      errorCode,
      statusCode,
      statusMessage,
      requestId,
    }
  }

  return {
    status: 'processing' as const,
    revisedPrompt: queryResult.RevisedPrompt?.[0],
    statusCode,
    statusMessage,
    requestId,
  }
}

async function createTokenHubImageInput(originalUrl: string, publicOrigin?: string) {
  if (isHttpUrl(originalUrl)) {
    return originalUrl
  }

  const absoluteUrl = resolveTokenHubImageUrl(originalUrl, publicOrigin)

  if (absoluteUrl) {
    return absoluteUrl
  }

  const imageBuffer = await readUploadImageBuffer(originalUrl)
  const mimeType = detectImageMimeType(originalUrl)

  return `data:${mimeType};base64,${imageBuffer.toString('base64')}`
}

async function createContentImage(originalUrl: string): Promise<ContentImagePayload> {
  if (isHttpUrl(originalUrl)) {
    return {
      ImageUrl: originalUrl,
    }
  }

  const imageBuffer = await readUploadImageBuffer(originalUrl, 6 * 1024 * 1024)

  return {
    ImageBase64: imageBuffer.toString('base64'),
  }
}

async function readUploadImageBuffer(originalUrl: string, maxBytes = MAX_REFERENCE_IMAGE_BYTES) {
  if (!originalUrl.startsWith('/uploads/')) {
    throw createError({
      statusCode: 400,
      statusMessage: '图片地址格式不合法，请先通过上传接口上传图片',
    })
  }

  const uploadPath = decodeURIComponent(originalUrl.split('?')[0])
  const uploadFilePath = path.resolve(`public${uploadPath}`)
  const uploadDir = path.resolve('public/uploads')

  if (!uploadFilePath.startsWith(`${uploadDir}${path.sep}`)) {
    throw createError({
      statusCode: 400,
      statusMessage: '图片地址格式不合法',
    })
  }

  const imageBuffer = await fs.readFile(uploadFilePath)

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

function summarizeTokenHubSubmitParams(params: {
  model: string
  prompt: string
  images: string[]
  Resolution: string
  extra_body: {
    seed: number
    revise: boolean
  }
  negative_prompt?: string
}) {
  return {
    model: params.model,
    promptLength: params.prompt.length,
    imagePreview: params.images[0]?.slice(0, 80),
    Resolution: params.Resolution,
    seed: params.extra_body.seed,
    revise: params.extra_body.revise,
    negativePromptLength: params.negative_prompt?.length,
  }
}

function summarizeLegacySubmitParams(params: {
  Prompt: string
  NegativePrompt?: string
  Resolution: string
  Num: number
  Revise: number
  LogoAdd: number
}) {
  return {
    promptLength: params.Prompt.length,
    negativePromptLength: params.NegativePrompt?.length,
    resolution: params.Resolution,
    num: params.Num,
    revise: params.Revise,
    logoAdd: params.LogoAdd,
  }
}

function summarizeError(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}

function buildReferenceImagePrompt(prompt: string) {
  return [
    '以参考图真实改夜景，保持主体、构图、视角、透视、位置不变，只改昼夜和灯光。',
    prompt,
  ].join(' ')
}

function shouldFallback(error: unknown) {
  const message = summarizeError(error)

  return [
    '资源不足',
    'Resource',
    'Insufficient',
    'quota',
    '额度',
    '余额',
    'Server Error',
    '429',
    '500',
    'timeout',
  ].some(keyword => message.includes(keyword))
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

function buildTokenHubResolution(width?: number, height?: number) {
  if (!width || !height) {
    return '1024:1024'
  }

  const ratio = width / height

  if (ratio >= 3.2) {
    return '2048:512'
  }

  if (ratio >= 1.55) {
    return '1280:720'
  }

  if (ratio >= 1.2) {
    return '1024:768'
  }

  if (ratio <= 0.31) {
    return '512:2048'
  }

  if (ratio <= 0.68) {
    return '720:1280'
  }

  if (ratio <= 0.84) {
    return '768:1024'
  }

  return '1024:1024'
}

function buildLegacyResolution(width?: number, height?: number) {
  if (!width || !height) {
    return '1024:1024'
  }

  const ratio = width / height

  if (ratio > 1.15) {
    return '1024:768'
  }

  if (ratio < 0.87) {
    return '768:1024'
  }

  return '1024:1024'
}

function createSeed() {
  return Math.floor(Math.random() * 1_000_000_000)
}

function createUpstreamError(statusCode: number, statusMessage: string) {
  return createError({
    statusCode,
    statusMessage,
    data: {
      message: statusMessage,
      errorMessage: statusMessage,
    },
  })
}

async function parseJsonResponse(response: Response) {
  const text = await response.text()

  if (!text) {
    return {}
  }

  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`上游接口返回了无法解析的响应：${text.slice(0, 200)}`)
  }
}

function extractTokenHubErrorMessage(data: any, fallback: string) {
  return data?.error?.message
    || data?.message
    || data?.msg
    || data?.detail
    || fallback
}

function readTokenHubTaskId(data: any) {
  return data?.id || data?.data?.id || data?.task_id || data?.data?.task_id
}

function readTokenHubRequestId(data: any) {
  return data?.request_id || data?.data?.request_id || data?.requestId
}

function readTokenHubTaskStatus(data: any) {
  return String(
    data?.status
    || data?.data?.status
    || data?.task_status
    || data?.data?.task_status
    || '',
  ).toLowerCase()
}

function readTokenHubImageUrl(data: any) {
  const image = data?.data?.[0] || data?.data?.images?.[0] || data?.images?.[0] || data?.output?.[0]

  if (typeof image === 'string') {
    return image
  }

  return image?.url || image?.image_url || data?.image_url || data?.result_image
}

function readTokenHubRevisedPrompt(data: any) {
  return data?.data?.revised_prompt || data?.revised_prompt || data?.output?.revised_prompt
}

function createHunyuanClient({
  secretId,
  secretKey,
  region,
}: HunyuanCredentials) {
  if (!secretId || !secretKey) {
    throw new Error('缺少腾讯云密钥，请在 .env 中配置 TENCENTCLOUD_SECRET_ID 和 TENCENTCLOUD_SECRET_KEY')
  }

  return new HunyuanClient({
    credential: {
      secretId,
      secretKey,
    },
    region: region || 'ap-guangzhou',
    profile: {
      httpProfile: {
        endpoint: 'hunyuan.tencentcloudapi.com',
      },
    },
  })
}
