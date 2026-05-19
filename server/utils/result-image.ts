import { buildResultObjectKey } from './resource-path'
import { uploadOSS } from './oss'

type PersistResultImageConfig = {
  ossRegion?: string
  ossAccessKeyId?: string
  ossAccessKeySecret?: string
  ossBucket?: string
  ossEndpoint?: string
  ossDir?: string
}

export async function persistGeneratedImage({
  imageUrl,
  taskId,
  sessionId,
  config,
}: {
  imageUrl: string
  taskId: string
  sessionId: string
  config: PersistResultImageConfig
}) {
  if (isManagedAssetUrl(imageUrl)) {
    return imageUrl
  }

  const response = await fetch(imageUrl)

  if (!response.ok) {
    throw new Error(`下载生成结果失败：${response.status}`)
  }

  const contentType = normalizeImageContentType(response.headers.get('content-type'))
  const arrayBuffer = await response.arrayBuffer()
  const extension = inferExtension(contentType, imageUrl)
  const objectKey = buildResultObjectKey({
    taskId,
    sessionId,
    extension,
    baseDir: config.ossDir,
  })

  return uploadOSS(Buffer.from(arrayBuffer), `${taskId}.${extension}`, {
    ...config,
    contentType,
    objectKey,
  })
}

function isManagedAssetUrl(url: string) {
  return url.startsWith('/uploads/') || url.startsWith('/uploads%2F') || url.startsWith('data:image/')
}

function normalizeImageContentType(value: string | null) {
  const normalized = value?.split(';')[0]?.trim().toLowerCase()

  if (normalized === 'image/png' || normalized === 'image/webp' || normalized === 'image/gif') {
    return normalized
  }

  return 'image/jpeg'
}

function inferExtension(contentType: string, imageUrl: string) {
  if (contentType === 'image/png') {
    return 'png'
  }

  if (contentType === 'image/webp') {
    return 'webp'
  }

  if (contentType === 'image/gif') {
    return 'gif'
  }

  const pathname = safeParseUrlPathname(imageUrl)
  const matched = pathname.match(/\.([a-zA-Z0-9]+)$/)
  return matched?.[1]?.toLowerCase() || 'jpg'
}

function safeParseUrlPathname(url: string) {
  try {
    return new URL(url).pathname
  } catch {
    return url
  }
}
