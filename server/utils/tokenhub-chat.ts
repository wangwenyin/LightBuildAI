import { createError } from 'h3'
import { createUpstreamError, parseJsonResponse } from './hunyuan-shared'

const TOKENHUB_CHAT_URL = 'https://tokenhub.tencentmaas.com/v1/chat/completions'
const TOKENHUB_CHAT_MODEL = 'deepseek-v4-pro'

export type TokenHubChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export async function createTokenHubChatCompletion({
  message,
  history = [],
  apiKey,
  model = TOKENHUB_CHAT_MODEL,
}: {
  message: string
  history?: TokenHubChatMessage[]
  apiKey?: string
  model?: string
}) {
  if (!apiKey) {
    throw createError({
      statusCode: 500,
      statusMessage: '缺少 TokenHub Chat API Key，请在 .env 中配置 TOKENHUB_API_KEY_CHAT',
    })
  }

  const normalizedHistory = history
    .filter(item => ['system', 'user', 'assistant'].includes(item.role) && item.content.trim())
    .slice(-20)
    .map(item => ({
      role: item.role,
      content: item.content.trim(),
    }))

  let response: Response

  try {
    response = await fetch(TOKENHUB_CHAT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          ...normalizedHistory,
          {
            role: 'user',
            content: message.trim(),
          },
        ],
        stream: false,
      }),
    })
  } catch {
    throw createUpstreamError(502, 'TokenHub 聊天服务暂时不可用，请稍后重试')
  }

  let data: any

  try {
    data = await parseJsonResponse(response)
  } catch {
    throw createUpstreamError(502, 'TokenHub 聊天服务返回了无法解析的响应')
  }

  if (!response.ok) {
    throw createUpstreamError(
      response.status >= 500 ? 502 : response.status,
      extractTokenHubChatErrorMessage(data, 'TokenHub 聊天服务调用失败'),
    )
  }

  const reply = extractReplyText(data)

  if (!reply) {
    throw createUpstreamError(502, 'TokenHub 聊天服务未返回有效回复')
  }

  return {
    reply,
    model: data?.model || model,
    requestId: response.headers.get('x-request-id') || data?.id || data?.request_id || '',
  }
}

function extractReplyText(data: any) {
  const content = data?.choices?.[0]?.message?.content

  if (typeof content === 'string') {
    return content.trim()
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string') {
          return item
        }

        if (typeof item?.text === 'string') {
          return item.text
        }

        return ''
      })
      .join('')
      .trim()
  }

  return ''
}

function extractTokenHubChatErrorMessage(data: any, fallback: string) {
  return data?.error?.message
    || data?.message
    || data?.msg
    || data?.detail
    || fallback
}
