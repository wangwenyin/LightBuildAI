import fs from 'node:fs/promises'
import path from 'node:path'
import { createHmac, randomUUID } from 'node:crypto'

const publicDir = path.join(process.cwd(), 'public')

type OssRuntimeConfig = {
  ossRegion?: string
  ossAccessKeyId?: string
  ossAccessKeySecret?: string
  ossBucket?: string
  ossEndpoint?: string
  ossDir?: string
  contentType?: string
  objectKey?: string
}

export async function uploadOSS(buffer: Buffer, filename: string, config: OssRuntimeConfig = {}) {
  const contentType = config.contentType || detectContentType(filename)
  const objectKey = config.objectKey || buildObjectName(filename, config.ossDir)

  if (hasOssConfig(config)) {
    const date = new Date().toUTCString()
    const endpoint = normalizeEndpoint(config)
    const resource = `/${config.ossBucket}/${objectKey}`
    const signature = createOssSignature({
      method: 'PUT',
      contentType,
      date,
      resource,
      accessKeySecret: config.ossAccessKeySecret!,
    })
    const url = `https://${config.ossBucket}.${endpoint}/${encodeObjectPath(objectKey)}`
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `OSS ${config.ossAccessKeyId}:${signature}`,
        Date: date,
        'Content-Type': contentType,
      },
      body: new Uint8Array(buffer),
    })

    if (!response.ok) {
      throw new Error(`OSS 上传失败：${response.status} ${await response.text()}`)
    }

    return url
  }

  if (process.env.VERCEL) {
    return `data:${contentType};base64,${buffer.toString('base64')}`
  }

  const normalizedRelativePath = objectKey
    .replace(/^\/+/, '')
    .split('/')
    .filter(Boolean)
  const destination = path.join(publicDir, ...normalizedRelativePath)
  const destinationDir = path.dirname(destination)

  await fs.mkdir(destinationDir, { recursive: true })
  await fs.writeFile(destination, buffer)

  return `/${['uploads', ...normalizedRelativePath].map(segment => encodeURIComponent(segment)).join('/')}`
}

export async function downloadOSSObject(objectKey: string, config: OssRuntimeConfig = {}) {
  if (!hasOssConfig(config)) {
    throw new Error('缺少 OSS 配置，无法读取私有对象')
  }

  const normalizedObjectKey = objectKey.replace(/^\/+/, '')
  const contentType = config.contentType || ''
  const date = new Date().toUTCString()
  const endpoint = normalizeEndpoint(config)
  const resource = `/${config.ossBucket}/${normalizedObjectKey}`
  const signature = createOssSignature({
    method: 'GET',
    contentType,
    date,
    resource,
    accessKeySecret: config.ossAccessKeySecret!,
  })
  const url = `https://${config.ossBucket}.${endpoint}/${encodeObjectPath(normalizedObjectKey)}`
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `OSS ${config.ossAccessKeyId}:${signature}`,
      Date: date,
    },
  })

  if (!response.ok) {
    throw new Error(`OSS 读取失败：${response.status} ${await response.text()}`)
  }

  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get('content-type') || detectContentType(normalizedObjectKey),
  }
}

export function createSignedOSSUrl(
  objectKey: string,
  config: OssRuntimeConfig = {},
  expiresInSeconds = 3600,
) {
  if (!hasOssConfig(config)) {
    throw new Error('缺少 OSS 配置，无法生成签名地址')
  }

  const normalizedObjectKey = objectKey.replace(/^\/+/, '')
  const endpoint = normalizeEndpoint(config)
  const expires = Math.floor(Date.now() / 1000) + expiresInSeconds
  const resource = `/${config.ossBucket}/${normalizedObjectKey}`
  const signature = createOssSignature({
    method: 'GET',
    contentType: '',
    date: String(expires),
    resource,
    accessKeySecret: config.ossAccessKeySecret!,
  })
  const url = new URL(`https://${config.ossBucket}.${endpoint}/${encodeObjectPath(normalizedObjectKey)}`)
  url.searchParams.set('OSSAccessKeyId', config.ossAccessKeyId!)
  url.searchParams.set('Expires', String(expires))
  url.searchParams.set('Signature', signature)
  return url.toString()
}

export function extractObjectKeyFromOSSUrl(url: string, config: OssRuntimeConfig = {}) {
  const normalizedDir = normalizeObjectDir(config.ossDir)
  const normalizedInput = url.trim()

  if (!normalizedInput) {
    return null
  }

  if (normalizedInput.startsWith('/')) {
    const pathnameObjectKey = decodeURIComponent(normalizedInput.replace(/^\/+/, ''))

    if (pathnameObjectKey.startsWith(`${normalizedDir}/`)) {
      return pathnameObjectKey
    }

    return null
  }

  const parsed = new URL(normalizedInput)
  const endpoint = normalizeEndpoint(config)
  const expectedHost = config.ossBucket ? `${config.ossBucket}.${endpoint}` : ''
  const normalizedPathname = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''))

  if (expectedHost && parsed.host === expectedHost) {
    return trimBucketPrefix(normalizedPathname, config.ossBucket)
  }

  const withoutBucketPrefix = trimBucketPrefix(normalizedPathname, config.ossBucket)

  if (withoutBucketPrefix.startsWith(`${normalizedDir}/`)) {
    return withoutBucketPrefix
  }

  return null
}

function hasOssConfig(config: OssRuntimeConfig) {
  return Boolean(
    config.ossRegion
    && config.ossAccessKeyId
    && config.ossAccessKeySecret
    && config.ossBucket,
  )
}

function buildObjectName(filename: string, dir = 'uploads') {
  const normalizedDir = normalizeObjectDir(dir)
  const safeName = sanitizeFilename(filename)
  const date = new Date().toISOString().slice(0, 10)

  return `${normalizedDir}/${date}/${Date.now()}-${randomUUID()}-${safeName}`
}

function sanitizeFilename(filename: string) {
  return filename
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w.\-\u4e00-\u9fa5]/g, '')
    || 'upload.jpg'
}

function normalizeEndpoint(config: OssRuntimeConfig) {
  const endpoint = config.ossEndpoint?.trim()

  if (endpoint) {
    return endpoint.replace(/^https?:\/\//, '').replace(/\/+$/, '')
  }

  return `${config.ossRegion}.aliyuncs.com`
}

function normalizeObjectDir(dir?: string) {
  return dir?.replace(/^\/+|\/+$/g, '') || 'uploads'
}

function trimBucketPrefix(pathname: string, bucket?: string) {
  if (!bucket) {
    return pathname
  }

  const normalizedBucketPrefix = `${bucket}/`
  return pathname.startsWith(normalizedBucketPrefix)
    ? pathname.slice(normalizedBucketPrefix.length)
    : pathname
}

function createOssSignature({
  method,
  contentType,
  date,
  resource,
  accessKeySecret,
}: {
  method: string
  contentType: string
  date: string
  resource: string
  accessKeySecret: string
}) {
  const canonicalString = [
    method,
    '',
    contentType,
    date,
    resource,
  ].join('\n')

  return createHmac('sha1', accessKeySecret)
    .update(canonicalString)
    .digest('base64')
}

function encodeObjectPath(objectName: string) {
  return objectName
    .split('/')
    .map(segment => encodeURIComponent(segment))
    .join('/')
}

function detectContentType(filename: string) {
  const normalized = filename.toLowerCase()

  if (normalized.endsWith('.png')) {
    return 'image/png'
  }

  if (normalized.endsWith('.webp')) {
    return 'image/webp'
  }

  if (normalized.endsWith('.gif')) {
    return 'image/gif'
  }

  return 'image/jpeg'
}
