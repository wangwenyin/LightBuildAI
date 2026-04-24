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
      tokenHubApiKey: config.tokenHubApiKey,
    })

    return {
      taskId: normalizedTaskId,
      ...result,
    }
  } catch (error) {
    console.error('读取任务状态失败', error)

    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }

    const cause = error as {
      code?: string
      message?: string
      requestId?: string
      response?: {
        data?: {
          Response?: {
            Error?: {
              Code?: string
              Message?: string
            }
            RequestId?: string
          }
        }
      }
    }
    const responseError = cause.response?.data?.Response?.Error
    const requestId = cause.requestId || cause.response?.data?.Response?.RequestId
    const message = responseError?.Message || cause.message || '读取任务状态失败'
    const errorCode = responseError?.Code || cause.code

    throw createError({
      statusCode: 500,
      statusMessage: message,
      data: {
        source: normalizedTaskId.startsWith('tokenhub:')
          ? 'tokenhub'
          : 'hunyuan',
        message,
        errorMessage: message,
        errorCode,
        requestId,
      },
    })
  }
})
