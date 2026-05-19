import { readBody } from 'h3'
import { createTokenHubChatCompletion, type TokenHubChatMessage } from '../utils/tokenhub-chat'
import { validateChatRequestBody } from '../utils/validation'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  const body = await readBody<{
    message?: string
    history?: TokenHubChatMessage[]
  }>(event)
  const { message, history } = validateChatRequestBody(body)

  return createTokenHubChatCompletion({
    message,
    history,
    apiKey: config.tokenHubChatApiKey,
  })
})
