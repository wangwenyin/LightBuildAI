import { getRequestURL, readBody } from 'h3'
import { submitNightImageJob } from '../utils/hunyuan'
import { buildNightNegativePrompt, buildNightPrompt } from '../../shared/nightPrompt'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  const {
    originalUrl,
    originalImageWidth,
    originalImageHeight,
    imageWidth,
    imageHeight,
    customPrompt,
    customNegativePrompt,
    revise,
  } = await readBody<{
    originalUrl?: string
    originalImageWidth?: number
    originalImageHeight?: number
    imageWidth?: number
    imageHeight?: number
    customPrompt?: string
    customNegativePrompt?: string
    revise?: boolean
  }>(event)

  const prompt = buildNightPrompt(customPrompt)
  const negativePrompt = buildNightNegativePrompt(customNegativePrompt)
  const normalizedOriginalUrl = originalUrl?.trim() || undefined

  console.log('Generate request image dimensions:', {
    originalImageWidth,
    originalImageHeight,
    uploadedImageWidth: imageWidth,
    uploadedImageHeight: imageHeight,
  })

  const result = await submitNightImageJob({
    originalUrl: normalizedOriginalUrl,
    prompt,
    negativePrompt,
    revise,
    imageWidth,
    imageHeight,
    secretId: config.tencentcloudSecretId,
    secretKey: config.tencentcloudSecretKey,
    region: config.tencentcloudRegion,
    tokenHubApiKey: config.tokenHubApiKey,
    publicOrigin: getRequestURL(event).origin,
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
      seed: result.seed,
      size: result.size,
    },
  }
})
