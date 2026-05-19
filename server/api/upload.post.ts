import { createError, readMultipartFormData } from 'h3'
import { uploadOSS } from '../utils/oss'
import { validateUploadFile } from '../utils/validation'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  const form = await readMultipartFormData(event)
  const file = form?.find((entry) => entry.name === 'file')

  if (!file) {
    throw createError({
      statusCode: 400,
      statusMessage: '未找到上传文件',
    })
  }

  const validatedFile = validateUploadFile(file)

  const url = await uploadOSS(file.data, file.filename, {
    ossRegion: config.ossRegion,
    ossAccessKeyId: config.ossAccessKeyId,
    ossAccessKeySecret: config.ossAccessKeySecret,
    ossBucket: config.ossBucket,
    ossEndpoint: config.ossEndpoint,
    ossDir: config.ossDir,
    contentType: validatedFile.mimeType,
  })

  return { url }
})
