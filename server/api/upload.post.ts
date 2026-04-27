import { readMultipartFormData } from 'h3'
import { uploadOSS } from '../utils/oss'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  const form = await readMultipartFormData(event)
  const file = form?.find((entry) => entry.name === 'file')

  if (!file || !file.filename) {
    throw createError({
      statusCode: 400,
      statusMessage: '未找到上传文件',
    })
  }

  const url = await uploadOSS(file.data, file.filename, {
    ossRegion: config.ossRegion,
    ossAccessKeyId: config.ossAccessKeyId,
    ossAccessKeySecret: config.ossAccessKeySecret,
    ossBucket: config.ossBucket,
    ossEndpoint: config.ossEndpoint,
    ossDir: config.ossDir,
  })

  return { url }
})
