import { createError } from 'h3'
import tencentcloud from 'tencentcloud-sdk-nodejs'

const { hunyuan } = tencentcloud
const HunyuanClient = hunyuan.v20230901.Client

export type HunyuanCredentials = {
  secretId?: string
  secretKey?: string
  region?: string
  tokenHubApiKey?: string
}

export type SubmitNightImageJobParams = HunyuanCredentials & {
  originalUrl?: string
  originalObjectKey?: string
  prompt: string
  negativePrompt?: string
  revise?: boolean
  publicOrigin?: string
  imageWidth?: number
  imageHeight?: number
  ossRegion?: string
  ossAccessKeyId?: string
  ossAccessKeySecret?: string
  ossBucket?: string
  ossEndpoint?: string
}

export type NightImageProvider =
  | 'tokenhub-reference-image'
  | 'hunyuan-text-to-image'

export type SubmitNightImageJobResult = {
  jobId: string
  imageUrl?: string
  requestId?: string
  provider: NightImageProvider
  seed?: number
  size?: string
}

export type QueryNightImageJobResult =
  | {
    status: 'done'
    imageUrl: string
    revisedPrompt?: string
    statusCode?: string
    statusMessage?: string
    requestId?: string
  }
  | {
    status: 'failed'
    errorMessage: string
    errorCode?: string
    statusCode?: string
    statusMessage?: string
    requestId?: string
  }
  | {
    status: 'processing'
    revisedPrompt?: string
    statusCode?: string
    statusMessage?: string
    requestId?: string
  }

export function createUpstreamError(statusCode: number, statusMessage: string, rawData?: unknown) {
  const cause = rawData && typeof rawData === 'object'
    ? (rawData as { error?: { code?: string, request_id?: string, requestId?: string } }).error
    : undefined
  const errorCode = cause?.code
  const requestId = cause?.request_id || cause?.requestId

  return createError({
    statusCode,
    statusMessage,
    data: {
      message: statusMessage,
      errorMessage: statusMessage,
      ...(errorCode ? { errorCode } : {}),
      ...(requestId ? { requestId } : {}),
    },
  })
}

export async function parseJsonResponse(response: Response, fallbackContext = '上游接口') {
  const text = await response.text()

  if (!text) {
    return {}
  }

  try {
    return JSON.parse(text)
  } catch {
    const createUpstreamParseError = (globalThis as { createError?: typeof createError }).createError

    if (createUpstreamParseError) {
      throw createUpstreamParseError({
        statusCode: 502,
        statusMessage: `${fallbackContext}返回了无法解析的响应：${text.slice(0, 200)}`,
        data: {
          message: `${fallbackContext}返回了无法解析的响应`,
        },
      })
    }

    throw new Error(`${fallbackContext}返回了无法解析的响应：${text.slice(0, 200)}`)
  }
}

export function createHunyuanClient({
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
