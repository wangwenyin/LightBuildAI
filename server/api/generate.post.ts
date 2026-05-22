import { getRequestURL, readBody } from 'h3'
import { submitNightImageJob } from '../utils/hunyuan'
import { buildNightNegativePrompt, buildNightPrompt } from '../../shared/nightPrompt'
import { validateGenerateRequestBody } from '../utils/validation'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  const body = await readBody<{
    originalUrl?: string
    originalImageWidth?: number
    originalImageHeight?: number
    imageWidth?: number
    imageHeight?: number
    customPrompt?: string
    customNegativePrompt?: string
    revise?: boolean
  }>(event)
  const {
    sessionId,
    originalUrl,
    originalObjectKey,
    originalImageWidth,
    originalImageHeight,
    imageWidth,
    imageHeight,
    customPrompt,
    customNegativePrompt,
    revise,
  } = validateGenerateRequestBody(body)

  const prompt = buildNightPrompt(customPrompt)
  const negativePrompt = buildNightNegativePrompt(customNegativePrompt)
  const normalizedOriginalUrl = originalUrl || undefined

  console.log('Generate request image dimensions:', {
    sessionId,
    originalImageWidth,
    originalImageHeight,
    uploadedImageWidth: imageWidth,
    uploadedImageHeight: imageHeight,
  })

  const result = await submitNightImageJob({
    originalUrl: normalizedOriginalUrl,
    originalObjectKey,
    prompt,
    negativePrompt,
    revise,
    imageWidth,
    imageHeight,
    secretId: config.tencentcloudSecretId,
    secretKey: config.tencentcloudSecretKey,
    region: config.tencentcloudRegion,
    tokenHubApiKey: config.tokenHubImageApiKey,
    publicOrigin: getRequestURL(event).origin,
    ossRegion: config.ossRegion,
    ossAccessKeyId: config.ossAccessKeyId,
    ossAccessKeySecret: config.ossAccessKeySecret,
    ossBucket: config.ossBucket,
    ossEndpoint: config.ossEndpoint,
  })

  return {
    taskId: result.jobId,
    jobId: result.jobId,
    imageUrl: result.imageUrl,
    requestId: result.requestId,
    status: result.imageUrl ? 'done' : 'processing',
    debug: {
      reviseRequested: revise ?? true,
      hasReferenceImage: Boolean(normalizedOriginalUrl),
      provider: result.provider,
      sessionId: sessionId || 'anonymous',
      seed: result.seed,
      size: result.size,
    },
  }
})
