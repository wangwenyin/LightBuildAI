import { createError, readMultipartFormData } from 'h3'
import { uploadOSS } from '../utils/oss'
import { buildSourceObjectKey } from '../utils/resource-path'
import { validateSessionId, validateUploadFile } from '../utils/validation'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  const form = await readMultipartFormData(event)
  const file = form?.find((entry) => entry.name === 'file')
  const sessionId = validateSessionId(form?.find((entry) => entry.name === 'sessionId')?.data?.toString('utf8'))

  if (!file) {
    throw createError({
      statusCode: 400,
      statusMessage: '未找到上传文件',
    })
  }

  const validatedFile = validateUploadFile(file)
  const { objectKey, requestId } = buildSourceObjectKey({
    filename: file.filename,
    sessionId: sessionId || 'anonymous',
    baseDir: config.ossDir,
  })

  const url = await uploadOSS(file.data, file.filename, {
    ossRegion: config.ossRegion,
    ossAccessKeyId: config.ossAccessKeyId,
    ossAccessKeySecret: config.ossAccessKeySecret,
    ossBucket: config.ossBucket,
    ossEndpoint: config.ossEndpoint,
    ossDir: config.ossDir,
    contentType: validatedFile.mimeType,
    objectKey,
  })

  return {
    url,
    objectKey,
    requestId,
    sessionId: sessionId || 'anonymous',
  }
})
