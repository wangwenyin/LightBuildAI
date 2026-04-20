import { readBody } from 'h3'
import { submitNightImageJob } from '../utils/hunyuan'
import { buildNightPrompt } from '../../shared/nightPrompt'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  const { originalUrl, customPrompt } = await readBody<{
    originalUrl?: string
    customPrompt?: string
  }>(event)

  const prompt = buildNightPrompt(customPrompt)
  const normalizedOriginalUrl = originalUrl?.trim() || undefined

  const result = await submitNightImageJob({
    originalUrl: normalizedOriginalUrl,
    prompt,
    secretId: config.tencentcloudSecretId,
    secretKey: config.tencentcloudSecretKey,
    region: config.tencentcloudRegion,
  })

  return {
    taskId: result.jobId,
    jobId: result.jobId,
    status: 'processing',
  }
})
