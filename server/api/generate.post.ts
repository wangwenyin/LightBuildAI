import { readBody } from 'h3'
import { submitNightImageJob } from '../utils/hunyuan'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  const { originalUrl } = await readBody<{ originalUrl?: string }>(event)

  if (!originalUrl) {
    throw createError({
      statusCode: 400,
      statusMessage: '请先上传原图',
    })
  }

  const prompt = [
    '专业建筑夜景效果图，保留原始建筑结构与视角。',
    '夜晚灯光效果自然，建筑轮廓灯、窗户暖光、景观照明清晰。',
    '真实摄影风格，画面干净通透，高细节，无水印。',
  ].join(' ')

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
