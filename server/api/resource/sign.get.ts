import { createSignedOSSUrl, extractObjectKeyFromOSSUrl } from '../../utils/oss'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  const { url, objectKey } = getQuery(event)
  const normalizedUrl = Array.isArray(url) ? url[0] : url
  const normalizedObjectKey = Array.isArray(objectKey) ? objectKey[0] : objectKey

  if (!normalizedUrl && !normalizedObjectKey) {
    throw createError({
      statusCode: 400,
      statusMessage: '缺少 url 或 objectKey',
    })
  }

  const resolvedObjectKey = normalizedObjectKey
    || (normalizedUrl
      ? extractObjectKeyFromOSSUrl(normalizedUrl, {
          ossRegion: config.ossRegion,
          ossAccessKeyId: config.ossAccessKeyId,
          ossAccessKeySecret: config.ossAccessKeySecret,
          ossBucket: config.ossBucket,
          ossEndpoint: config.ossEndpoint,
        })
      : null)

  if (!resolvedObjectKey) {
    throw createError({
      statusCode: 400,
      statusMessage: '无法识别 OSS 对象路径',
    })
  }

  return {
    url: createSignedOSSUrl(resolvedObjectKey, {
      ossRegion: config.ossRegion,
      ossAccessKeyId: config.ossAccessKeyId,
      ossAccessKeySecret: config.ossAccessKeySecret,
      ossBucket: config.ossBucket,
      ossEndpoint: config.ossEndpoint,
    }, 3600),
    objectKey: resolvedObjectKey,
  }
})
