import { createError } from 'h3'
import fs from 'node:fs/promises'
import path from 'node:path'
import tencentcloud from 'tencentcloud-sdk-nodejs'

const { hunyuan } = tencentcloud
const HunyuanClient = hunyuan.v20230901.Client

const MAX_CONTENT_IMAGE_BASE64_BYTES = 8 * 1024 * 1024

type HunyuanCredentials = {
  secretId?: string
  secretKey?: string
  region?: string
}

type SubmitNightImageJobParams = HunyuanCredentials & {
  originalUrl?: string
  prompt: string
}

type ContentImagePayload =
  | { ImageUrl: string }
  | { ImageBase64: string }

export async function submitNightImageJob({
  originalUrl,
  prompt,
  secretId,
  secretKey,
  region,
}: SubmitNightImageJobParams) {
  const client = createHunyuanClient({ secretId, secretKey, region })
  const contentImage = originalUrl ? await createContentImage(originalUrl) : undefined

  const submitParams = {
    Prompt: prompt,
    Resolution: '1024:1024',
    Num: 1,
    Revise: 1,
    LogoAdd: 0,
    ...(contentImage ? { ContentImage: contentImage } : {}),
  }

  console.log('SubmitHunyuanImageJob params:', summarizeSubmitParams(submitParams))

  const submitResult = await client.SubmitHunyuanImageJob(submitParams)
  const jobId = submitResult.JobId

  if (!jobId) {
    throw new Error('混元接口未返回任务 ID')
  }

  return { jobId }
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
    statusCode,
    statusMessage,
    requestId,
  }
}

async function createContentImage(originalUrl: string): Promise<ContentImagePayload> {
  if (isHttpUrl(originalUrl)) {
    return {
      ImageUrl: originalUrl,
    }
  }

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
  const imageBase64 = imageBuffer.toString('base64')

  if (imageBase64.length > MAX_CONTENT_IMAGE_BASE64_BYTES) {
    throw createError({
      statusCode: 400,
      statusMessage: '图片过大，请上传更小的 jpg、jpeg 或 png 图片',
    })
  }

  return {
    ImageBase64: imageBase64,
  }
}

function summarizeSubmitParams(params: {
  Prompt: string
  Resolution: string
  Num: number
  Revise: number
  LogoAdd: number
  ContentImage?: ContentImagePayload
}) {
  return {
    PromptLength: params.Prompt.length,
    Resolution: params.Resolution,
    Num: params.Num,
    Revise: params.Revise,
    LogoAdd: params.LogoAdd,
    ContentImage:
      !params.ContentImage
        ? undefined
        : 'ImageUrl' in params.ContentImage
        ? {
            type: 'ImageUrl',
            value: params.ContentImage.ImageUrl,
          }
        : {
            type: 'ImageBase64',
            base64Length: params.ContentImage.ImageBase64.length,
          },
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
