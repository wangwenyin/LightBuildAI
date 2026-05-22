import { createError } from 'h3'

const ALLOWED_UPLOAD_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const
const MAX_UPLOAD_FILE_BYTES = 5 * 1024 * 1024
const MAX_CHAT_MESSAGE_LENGTH = 4000
const MAX_CHAT_HISTORY_MESSAGES = 20
const MAX_PROMPT_LENGTH = 2000
const MAX_IMAGE_DIMENSION = 8192

type UploadMimeType = typeof ALLOWED_UPLOAD_MIME_TYPES[number]

type RawChatMessage = {
  role?: unknown
  content?: unknown
}

export type ValidatedChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export type ValidatedGenerateBody = {
  sessionId?: string
  originalUrl?: string
  originalObjectKey?: string
  originalImageWidth?: number
  originalImageHeight?: number
  imageWidth?: number
  imageHeight?: number
  customPrompt?: string
  customNegativePrompt?: string
  revise?: boolean
}

export type ValidatedUploadFile = {
  filename: string
  mimeType: UploadMimeType
  size: number
}

export function validateSessionId(value: unknown, fieldName = 'sessionId') {
  const sessionId = normalizeOptionalString(value, {
    fieldName,
    maxLength: 128,
    trim: true,
  })

  if (!sessionId) {
    return undefined
  }

  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{5,127}$/.test(sessionId)) {
    throw badRequest(`${fieldName} 格式不合法`)
  }

  return sessionId
}

export function validateChatRequestBody(body: unknown) {
  const normalizedBody = asRecord(body, '请求体格式不合法')
  const message = normalizeOptionalString(normalizedBody.message, {
    fieldName: 'message',
    maxLength: MAX_CHAT_MESSAGE_LENGTH,
    trim: true,
  })

  if (!message) {
    throw badRequest('消息内容不能为空')
  }

  return {
    message,
    history: normalizeChatHistory(normalizedBody.history),
  }
}

export function validateGenerateRequestBody(body: unknown): ValidatedGenerateBody {
  const normalizedBody = asRecord(body, '请求体格式不合法')
  const sessionId = validateSessionId(normalizedBody.sessionId)
  const originalUrl = normalizeOptionalString(normalizedBody.originalUrl, {
    fieldName: 'originalUrl',
    maxLength: 2048,
    trim: true,
  })
  const originalObjectKey = normalizeOptionalString(normalizedBody.originalObjectKey, {
    fieldName: 'originalObjectKey',
    maxLength: 2048,
    trim: true,
  })
  const originalImageWidth = normalizeOptionalInteger(normalizedBody.originalImageWidth, 'originalImageWidth')
  const originalImageHeight = normalizeOptionalInteger(normalizedBody.originalImageHeight, 'originalImageHeight')
  const imageWidth = normalizeOptionalInteger(normalizedBody.imageWidth, 'imageWidth')
  const imageHeight = normalizeOptionalInteger(normalizedBody.imageHeight, 'imageHeight')
  const customPrompt = normalizeOptionalString(normalizedBody.customPrompt, {
    fieldName: 'customPrompt',
    maxLength: MAX_PROMPT_LENGTH,
    trim: true,
  })
  const customNegativePrompt = normalizeOptionalString(normalizedBody.customNegativePrompt, {
    fieldName: 'customNegativePrompt',
    maxLength: MAX_PROMPT_LENGTH,
    trim: true,
  })
  const revise = normalizeOptionalBoolean(normalizedBody.revise, 'revise')

  if ((imageWidth === undefined) !== (imageHeight === undefined)) {
    throw badRequest('imageWidth 与 imageHeight 需要同时传入')
  }

  if ((originalImageWidth === undefined) !== (originalImageHeight === undefined)) {
    throw badRequest('originalImageWidth 与 originalImageHeight 需要同时传入')
  }

  return {
    sessionId,
    originalUrl,
    originalObjectKey,
    originalImageWidth,
    originalImageHeight,
    imageWidth: ensureDimensionRange(imageWidth, 'imageWidth'),
    imageHeight: ensureDimensionRange(imageHeight, 'imageHeight'),
    customPrompt,
    customNegativePrompt,
    revise,
  }
}

export function validateUploadFile(file: {
  filename?: string
  data?: Buffer
  type?: string
}) {
  if (!file.filename || !file.data) {
    throw badRequest('未找到上传文件')
  }

  if (file.data.byteLength === 0) {
    throw badRequest('上传文件不能为空')
  }

  if (file.data.byteLength > MAX_UPLOAD_FILE_BYTES) {
    throw badRequest(`上传文件不能超过 ${Math.floor(MAX_UPLOAD_FILE_BYTES / 1024 / 1024)}MB`)
  }

  const detectedMimeType = detectImageMimeType(file.data)

  if (!detectedMimeType) {
    throw badRequest('仅支持 jpg、png、webp、gif 图片上传')
  }

  const declaredMimeType = normalizeOptionalString(file.type, {
    fieldName: 'type',
    maxLength: 100,
    trim: true,
  })

  if (declaredMimeType && declaredMimeType !== detectedMimeType) {
    throw badRequest('上传文件类型与文件内容不一致')
  }

  return {
    filename: file.filename,
    mimeType: detectedMimeType,
    size: file.data.byteLength,
  } satisfies ValidatedUploadFile
}

function normalizeChatHistory(history: unknown) {
  if (history === undefined) {
    return []
  }

  if (!Array.isArray(history)) {
    throw badRequest('history 必须是数组')
  }

  return history
    .slice(0, MAX_CHAT_HISTORY_MESSAGES)
    .map((item, index) => normalizeChatMessage(item, index))
    .filter((item): item is ValidatedChatMessage => Boolean(item))
}

function normalizeChatMessage(item: unknown, index: number) {
  const message = asRecord(item, `history[${index}] 格式不合法`) as RawChatMessage
  const role = normalizeOptionalString(message.role, {
    fieldName: `history[${index}].role`,
    maxLength: 20,
    trim: true,
  })
  const content = normalizeOptionalString(message.content, {
    fieldName: `history[${index}].content`,
    maxLength: MAX_CHAT_MESSAGE_LENGTH,
    trim: true,
  })

  if (!role || !content) {
    return null
  }

  if (!['system', 'user', 'assistant'].includes(role)) {
    throw badRequest(`history[${index}].role 不合法`)
  }

  return {
    role: role as ValidatedChatMessage['role'],
    content,
  }
}

function normalizeOptionalString(
  value: unknown,
  options: {
    fieldName: string
    maxLength: number
    trim?: boolean
  },
) {
  if (value === undefined || value === null) {
    return undefined
  }

  if (typeof value !== 'string') {
    throw badRequest(`${options.fieldName} 必须是字符串`)
  }

  const normalized = options.trim ? value.trim() : value

  if (!normalized) {
    return undefined
  }

  if (normalized.length > options.maxLength) {
    throw badRequest(`${options.fieldName} 长度不能超过 ${options.maxLength} 个字符`)
  }

  return normalized
}

function normalizeOptionalInteger(value: unknown, fieldName: string) {
  if (value === undefined || value === null || value === '') {
    return undefined
  }

  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw badRequest(`${fieldName} 必须是正整数`)
  }

  return value
}

function normalizeOptionalBoolean(value: unknown, fieldName: string) {
  if (value === undefined || value === null) {
    return undefined
  }

  if (typeof value !== 'boolean') {
    throw badRequest(`${fieldName} 必须是布尔值`)
  }

  return value
}

function ensureDimensionRange(value: number | undefined, fieldName: string) {
  if (value === undefined) {
    return undefined
  }

  if (value > MAX_IMAGE_DIMENSION) {
    throw badRequest(`${fieldName} 不能超过 ${MAX_IMAGE_DIMENSION}`)
  }

  return value
}

function asRecord(value: unknown, fallbackMessage: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw badRequest(fallbackMessage)
  }

  return value as Record<string, unknown>
}

function detectImageMimeType(buffer: Buffer): UploadMimeType | null {
  if (buffer.byteLength >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg'
  }

  if (
    buffer.byteLength >= 8
    && buffer[0] === 0x89
    && buffer[1] === 0x50
    && buffer[2] === 0x4e
    && buffer[3] === 0x47
    && buffer[4] === 0x0d
    && buffer[5] === 0x0a
    && buffer[6] === 0x1a
    && buffer[7] === 0x0a
  ) {
    return 'image/png'
  }

  if (
    buffer.byteLength >= 12
    && buffer.toString('ascii', 0, 4) === 'RIFF'
    && buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp'
  }

  if (
    buffer.byteLength >= 6
    && (buffer.toString('ascii', 0, 6) === 'GIF87a' || buffer.toString('ascii', 0, 6) === 'GIF89a')
  ) {
    return 'image/gif'
  }

  return null
}

function badRequest(message: string) {
  return createError({
    statusCode: 400,
    statusMessage: message,
  })
}
