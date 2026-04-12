import { queryNightImageJob } from '../utils/hunyuan'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  const { taskId } = getQuery(event)
  const normalizedTaskId = Array.isArray(taskId) ? taskId[0] : taskId

  if (!normalizedTaskId) {
    throw createError({
      statusCode: 400,
      statusMessage: '缺少 taskId',
    })
  }

  try {
    const result = await queryNightImageJob(normalizedTaskId, {
      secretId: config.tencentcloudSecretId,
      secretKey: config.tencentcloudSecretKey,
      region: config.tencentcloudRegion,
    })

    return {
      taskId: normalizedTaskId,
      ...result,
    }
  } catch (error) {
    console.error('读取任务状态失败', error)

    throw createError({
      statusCode: 500,
      statusMessage: error instanceof Error ? error.message : '读取任务状态失败',
    })
  }
})
