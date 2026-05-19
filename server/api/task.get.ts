import { queryNightImageJob } from '../utils/hunyuan'
import { persistGeneratedImage } from '../utils/result-image'
import { validateSessionId } from '../utils/validation'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  const { taskId, sessionId } = getQuery(event)
  const normalizedTaskId = Array.isArray(taskId) ? taskId[0] : taskId
  const normalizedSessionId = validateSessionId(Array.isArray(sessionId) ? sessionId[0] : sessionId)

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
      tokenHubApiKey: config.tokenHubImageApiKey,
    })

    const imageUrl = result.status === 'done' && result.imageUrl
      ? await persistGeneratedImage({
          imageUrl: result.imageUrl,
          taskId: normalizedTaskId,
          sessionId: normalizedSessionId || 'anonymous',
          config: {
            ossRegion: config.ossRegion,
            ossAccessKeyId: config.ossAccessKeyId,
            ossAccessKeySecret: config.ossAccessKeySecret,
            ossBucket: config.ossBucket,
            ossEndpoint: config.ossEndpoint,
            ossDir: config.ossDir,
          },
        })
      : result.status === 'done'
        ? result.imageUrl
        : undefined

    return {
      taskId: normalizedTaskId,
      ...result,
      ...(imageUrl ? { imageUrl } : {}),
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
