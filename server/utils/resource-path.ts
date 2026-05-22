import { randomUUID } from 'node:crypto'

export function buildSourceObjectKey({
  filename,
  sessionId,
  baseDir = 'uploads',
  requestId = createRequestId(),
  date = createDatePrefix(),
}: {
  filename: string
  sessionId: string
  baseDir?: string
  requestId?: string
  date?: string
}) {
  const normalizedBaseDir = trimSlashes(baseDir) || 'uploads'
  const normalizedSessionId = sanitizePathSegment(sessionId) || 'anonymous'
  const safeName = createSafeAssetFilename(filename)

  return {
    objectKey: `${normalizedBaseDir}/source/${date}/${normalizedSessionId}/${requestId}-${safeName}`,
    requestId,
  }
}

export function buildResultObjectKey({
  taskId,
  sessionId,
  extension,
  baseDir = 'uploads',
  date = createDatePrefix(),
}: {
  taskId: string
  sessionId: string
  extension: string
  baseDir?: string
  date?: string
}) {
  const normalizedBaseDir = trimSlashes(baseDir) || 'uploads'
  const normalizedSessionId = sanitizePathSegment(sessionId) || 'anonymous'
  const normalizedTaskId = sanitizePathSegment(taskId) || 'task'
  const normalizedExtension = extension.replace(/^\.+/, '') || 'png'

  return `${normalizedBaseDir}/result/${date}/${normalizedSessionId}/${normalizedTaskId}.${normalizedExtension}`
}

export function createRequestId() {
  return `req_${randomUUID()}`
}

function createDatePrefix() {
  return new Date().toISOString().slice(0, 10)
}

function sanitizeFilename(filename: string) {
  return filename
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w.\-\u4e00-\u9fa5]/g, '')
    || 'upload.jpg'
}

function createSafeAssetFilename(filename: string) {
  const extension = readFileExtension(filename)
  return extension ? `upload.${extension}` : 'upload.jpg'
}

function readFileExtension(filename: string) {
  const matched = filename.toLowerCase().match(/\.([a-z0-9]+)$/)
  return matched?.[1]
}

function sanitizePathSegment(value: string) {
  return value
    .trim()
    .replace(/[^\w.-]/g, '-')
    .replace(/-+/g, '-')
}

function trimSlashes(value: string) {
  return value.replace(/^\/+|\/+$/g, '')
}
