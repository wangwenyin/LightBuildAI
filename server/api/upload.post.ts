import { createError, readBody } from 'h3'
import { buildSourceObjectKey } from '../utils/resource-path'
import { createOSSObjectUrl, createSignedOSSUploadUrl, hasOssConfig } from '../utils/oss'
import { validateUploadPrepareBody } from '../utils/validation'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  try {
    const body = await readBody<{
      filename?: string
      contentType?: string
      size?: number
      sessionId?: string
    }>(event)
    const validatedBody = validateUploadPrepareBody(body)

    if (!hasOssConfig(config)) {
      throw createError({
        statusCode: 503,
        statusMessage: '未配置 OSS，当前环境不支持浏览器直传',
      })
    }

    const { objectKey, requestId } = buildSourceObjectKey({
      filename: validatedBody.filename,
      sessionId: validatedBody.sessionId || 'anonymous',
      baseDir: config.ossDir,
    })

    const signedUpload = createSignedOSSUploadUrl(objectKey, {
      ossRegion: config.ossRegion,
      ossAccessKeyId: config.ossAccessKeyId,
      ossAccessKeySecret: config.ossAccessKeySecret,
      ossBucket: config.ossBucket,
      ossEndpoint: config.ossEndpoint,
      ossDir: config.ossDir,
    }, {
      contentType: validatedBody.contentType,
    })

    return {
      uploadUrl: signedUpload.uploadUrl,
      uploadMethod: 'PUT',
      uploadHeaders: signedUpload.headers,
      expiresAt: signedUpload.expiresAt,
      url: createOSSObjectUrl(objectKey, {
        ossRegion: config.ossRegion,
        ossAccessKeyId: config.ossAccessKeyId,
        ossAccessKeySecret: config.ossAccessKeySecret,
        ossBucket: config.ossBucket,
        ossEndpoint: config.ossEndpoint,
      }),
      objectKey,
      requestId,
      sessionId: validatedBody.sessionId || 'anonymous',
    }
  } catch (error) {
    console.error('[upload] prepare failed', {
      message: error instanceof Error ? error.message : String(error),
      ossRegion: config.ossRegion,
      ossBucket: config.ossBucket,
      ossEndpoint: config.ossEndpoint,
      hasAccessKeyId: Boolean(config.ossAccessKeyId),
      hasAccessKeySecret: Boolean(config.ossAccessKeySecret),
    })
    throw error
  }
})
