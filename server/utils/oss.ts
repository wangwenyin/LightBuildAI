import fs from 'node:fs/promises'
import path from 'node:path'
import { createHmac, randomUUID } from 'node:crypto'

const uploadDir = path.join(process.cwd(), 'public/uploads')

type OssRuntimeConfig = {
  ossRegion?: string
  ossAccessKeyId?: string
  ossAccessKeySecret?: string
  ossBucket?: string
  ossEndpoint?: string
  ossDir?: string
}

export async function uploadOSS(buffer: Buffer, filename: string, config: OssRuntimeConfig = {}) {
  if (hasOssConfig(config)) {
    const objectName = buildObjectName(filename, config.ossDir)
    const contentType = detectContentType(filename)
    const date = new Date().toUTCString()
    const endpoint = normalizeEndpoint(config)
    const resource = `/${config.ossBucket}/${objectName}`
    const signature = createOssSignature({
      method: 'PUT',
      contentType,
      date,
      resource,
      accessKeySecret: config.ossAccessKeySecret!,
    })
    const url = `https://${config.ossBucket}.${endpoint}/${encodeObjectPath(objectName)}`
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
    return `data:${detectContentType(filename)};base64,${buffer.toString('base64')}`
  }

  await fs.mkdir(uploadDir, { recursive: true })

  const safeName = sanitizeFilename(filename)
  const name = `${Date.now()}-${safeName}`
  const destination = path.join(uploadDir, name)

  await fs.writeFile(destination, buffer)

  return `/uploads/${name}`
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
  const normalizedDir = dir.replace(/^\/+|\/+$/g, '') || 'uploads'
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
