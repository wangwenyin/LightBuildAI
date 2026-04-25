import { readBody } from 'h3'
import { createTokenHubChatCompletion, type TokenHubChatMessage } from '../utils/tokenhub-chat'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  const {
    message,
    history,
  } = await readBody<{
    message?: string
    history?: TokenHubChatMessage[]
  }>(event)

  const normalizedMessage = message?.trim()

  if (!normalizedMessage) {
    throw createError({
      statusCode: 400,
      statusMessage: '消息内容不能为空',
    })
  }

  return createTokenHubChatCompletion({
    message: normalizedMessage,
    history: Array.isArray(history) ? history : [],
    apiKey: config.tokenHubChatApiKey,
  })
})
