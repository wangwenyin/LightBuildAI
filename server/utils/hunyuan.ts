import { createError } from 'h3'
import fs from 'node:fs/promises'
import path from 'node:path'
import tencentcloud from 'tencentcloud-sdk-nodejs'

const { hunyuan } = tencentcloud
const HunyuanClient = hunyuan.v20230901.Client
const { aiart } = tencentcloud
const AiartClient = aiart.v20221229.Client

const MAX_REFERENCE_IMAGE_BYTES = 6 * 1024 * 1024

type HunyuanCredentials = {
  secretId?: string
  secretKey?: string
  region?: string
}

type SubmitNightImageJobParams = HunyuanCredentials & {
  originalUrl?: string
  prompt: string
  negativePrompt?: string
  revise?: boolean
}

type ContentImagePayload =
  | { ImageUrl: string }
  | { ImageBase64: string }

type AiartImagePayload =
  | { Url: string }
  | { Base64: string }

export async function submitNightImageJob({
  originalUrl,
  prompt,
  negativePrompt,
  revise,
  secretId,
  secretKey,
  region,
}: SubmitNightImageJobParams) {
  if (originalUrl) {
    try {
      return await generateFromReferenceImage({
        originalUrl,
        prompt,
        secretId,
        secretKey,
        region,
      })
    } catch (error) {
      if (!shouldFallbackToHunyuan(error)) {
        throw error
      }

      console.warn('AIArt 参考图生成不可用，回退到混元参考图任务：', summarizeError(error))
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
  })
}

async function submitHunyuanImageJob({
  originalUrl,
  prompt,
  negativePrompt,
  revise,
  secretId,
  secretKey,
  region,
}: SubmitNightImageJobParams) {
  const client = createHunyuanClient({ secretId, secretKey, region })
  const contentImage = originalUrl ? await createContentImage(originalUrl) : undefined

  const submitParams = {
    Prompt: prompt,
    ...(negativePrompt ? { NegativePrompt: negativePrompt } : {}),
    Resolution: '1024:1024',
    Num: 1,
    Revise: revise === false ? 0 : 1,
    LogoAdd: 0,
    ...(contentImage ? { ContentImage: contentImage } : {}),
  }

  console.log('SubmitHunyuanImageJob params:', summarizeSubmitParams(submitParams))

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
  }
}

async function generateFromReferenceImage({
  originalUrl,
  prompt,
  secretId,
  secretKey,
  region,
}: Required<Pick<SubmitNightImageJobParams, 'originalUrl' | 'prompt'>> &
  Pick<SubmitNightImageJobParams, 'secretId' | 'secretKey' | 'region'>) {
  const client = createAiartClient({ secretId, secretKey, region })
  const referenceImage = await createAiartImagePayload(originalUrl)
  const submitParams = {
    Prompt: limitUtf8Text(buildReferenceImagePrompt(prompt), 256),
    Image: referenceImage,
    RspImgType: 'url',
    LogoAdd: 0,
  }

  console.log('TextToImageRapid reference params:', summarizeReferenceImageParams(submitParams))

  const submitResult = await client.TextToImageRapid(submitParams)
  const imageUrl = submitResult.ResultImage
  const requestId = submitResult.RequestId

  if (!imageUrl) {
    throw new Error('AIArt 参考图生成接口未返回图片地址')
  }

  return {
    jobId: requestId ? `aiart:${requestId}` : `aiart:${Date.now()}`,
    imageUrl,
    requestId,
    provider: 'aiart-reference-image' as const,
  }
}

export async function queryNightImageJob(
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

async function createAiartImagePayload(originalUrl: string): Promise<AiartImagePayload> {
  if (isHttpUrl(originalUrl)) {
    return {
      Url: originalUrl,
    }
  }

  const imageBuffer = await readUploadImageBuffer(originalUrl)

  return {
    Base64: imageBuffer.toString('base64'),
  }
}

async function createContentImage(originalUrl: string): Promise<ContentImagePayload> {
  if (isHttpUrl(originalUrl)) {
    return {
      ImageUrl: originalUrl,
    }
  }

  const imageBuffer = await readUploadImageBuffer(originalUrl)

  return {
    ImageBase64: imageBuffer.toString('base64'),
  }
}

async function readUploadImageBuffer(originalUrl: string) {
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

  if (imageBuffer.byteLength > MAX_REFERENCE_IMAGE_BYTES) {
    throw createError({
      statusCode: 400,
      statusMessage: '图片过大，请上传更小的 jpg、jpeg 或 png 图片',
    })
  }

  return imageBuffer
}

function summarizeSubmitParams(params: {
  Prompt: string
  NegativePrompt?: string
  Resolution: string
  Num: number
  Revise: number
  LogoAdd: number
}) {
  return {
    PromptLength: params.Prompt.length,
    NegativePromptLength: params.NegativePrompt?.length,
    Resolution: params.Resolution,
    Num: params.Num,
    Revise: params.Revise,
    LogoAdd: params.LogoAdd,
  }
}

function summarizeReferenceImageParams(params: {
  Prompt: string
  Image: AiartImagePayload
  RspImgType: string
  LogoAdd: number
}) {
  return {
    PromptLength: params.Prompt.length,
    Image:
      'Url' in params.Image
        ? {
            type: 'Url',
            value: params.Image.Url,
          }
        : {
            type: 'Base64',
            base64Length: params.Image.Base64.length,
          },
    RspImgType: params.RspImgType,
    LogoAdd: params.LogoAdd,
  }
}

function summarizeError(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function buildReferenceImagePrompt(prompt: string) {
  return [
    '以参考图真实改夜景，保持主体、构图、视角、透视、位置不变，只改昼夜和灯光。',
    prompt,
  ].join(' ')
}

function shouldFallbackToHunyuan(error: unknown) {
  const message = summarizeError(error)

  return [
    '资源不足',
    'Resource',
    'Insufficient',
    'quota',
    '额度',
    '余额',
    'Server Error',
  ].some(keyword => message.includes(keyword))
}

function limitUtf8Text(value: string, maxLength: number) {
  return value.length <= maxLength ? value : value.slice(0, maxLength)
}

function createAiartClient({
  secretId,
  secretKey,
  region,
}: HunyuanCredentials) {
  if (!secretId || !secretKey) {
    throw new Error('缺少腾讯云密钥，请在 .env 中配置 TENCENTCLOUD_SECRET_ID 和 TENCENTCLOUD_SECRET_KEY')
  }

  return new AiartClient({
    credential: {
      secretId,
      secretKey,
    },
    region: region || 'ap-guangzhou',
    profile: {
      httpProfile: {
        endpoint: 'aiart.tencentcloudapi.com',
      },
    },
  })
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
