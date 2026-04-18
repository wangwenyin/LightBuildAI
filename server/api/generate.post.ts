import { readBody } from 'h3'
import { submitNightImageJob } from '../utils/hunyuan'
import { buildNightPrompt } from '../../shared/nightPrompt'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  const { originalUrl, customPrompt } = await readBody<{
    originalUrl?: string
    customPrompt?: string
  }>(event)

  if (!originalUrl) {
    throw createError({
      statusCode: 400,
      statusMessage: '请先上传原图',
    })
  }

  const prompt = buildNightPrompt(customPrompt)

  const result = await submitNightImageJob({
    originalUrl,
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
