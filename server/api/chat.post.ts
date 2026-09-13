import { getRequestURL, readBody } from 'h3'
import { runAgent } from '../utils/agent'
import { validateChatRequestBody } from '../utils/validation'

/**
 * 聊天接口 —— 已从「纯转发模型 API」改造为「真正的 Agent 应用」。
 *
 * 请求体保持兼容：{ message, history }
 * 响应体向后兼容并新增轨迹：
 *   { reply, model, requestId, steps, toolCalls, iterations }
 * 其中 steps 记录了 Agent 的「思考 / 工具调用 / 观察」过程，供前端可视化。
 */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  const body = await readBody<{
    message?: string
    history?: Array<{ role?: string, content?: string }>
  }>(event)
  const { message, history } = validateChatRequestBody(body)

  const result = await runAgent({
    message,
    history,
    options: {
      apiKey: config.tokenHubChatApiKey,
      model: config.agentChatModel,
      maxIterations: config.agentMaxIterations,
      enableGenerate: config.agentEnableGenerate,
      mockLlm: config.agentMockLlm,
      generate: {
        secretId: config.tencentcloudSecretId,
        secretKey: config.tencentcloudSecretKey,
        region: config.tencentcloudRegion,
        tokenHubApiKey: config.tokenHubImageApiKey,
        publicOrigin: getRequestURL(event).origin,
        ossRegion: config.ossRegion,
        ossAccessKeyId: config.ossAccessKeyId,
        ossAccessKeySecret: config.ossAccessKeySecret,
        ossBucket: config.ossBucket,
        ossEndpoint: config.ossEndpoint,
      },
    },
  })

  return {
    reply: result.reply,
    model: result.model,
    requestId: result.requestId,
    steps: result.steps,
    toolCalls: result.toolCalls,
    iterations: result.iterations,
  }
})
