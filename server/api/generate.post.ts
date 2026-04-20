import { readBody } from 'h3'
import { submitNightImageJob } from '../utils/hunyuan'
import { buildNightNegativePrompt, buildNightPrompt } from '../../shared/nightPrompt'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  const {
    originalUrl,
    customPrompt,
    customNegativePrompt,
    revise,
  } = await readBody<{
    originalUrl?: string
    customPrompt?: string
    customNegativePrompt?: string
    revise?: boolean
  }>(event)

  const prompt = buildNightPrompt(customPrompt)
  const negativePrompt = buildNightNegativePrompt(customNegativePrompt)
  const normalizedOriginalUrl = originalUrl?.trim() || undefined

  const result = await submitNightImageJob({
    originalUrl: normalizedOriginalUrl,
    prompt,
    negativePrompt,
    revise,
    secretId: config.tencentcloudSecretId,
    secretKey: config.tencentcloudSecretKey,
    region: config.tencentcloudRegion,
  })

  return {
    taskId: result.jobId,
    jobId: result.jobId,
    status: 'processing',
    debug: {
      reviseRequested: revise ?? true,
      hasReferenceImage: Boolean(normalizedOriginalUrl),
    },
  }
})
