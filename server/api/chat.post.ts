import { getRequestURL, readBody } from 'h3'
import { runAgent } from '../utils/agent'
import { validateChatRequestBody } from '../utils/validation'
import type { AgentStreamEvent } from '../utils/agent/types'

/**
 * 聊天接口（SSE 流式）—— 把 Agent 的运行过程实时推给前端。
 *
 * 演进路径：纯转发模型 API（非 Agent）→ 手写 ReAct 循环 → 现在叠加 SSE，边思考边推送。
 *
 * 事件流（data 为 JSON）：
 *   start / iteration / thought / tool / rewrite / delta / done / error
 * 其中 delta 是模型回答的文本增量，用于打字机效果。
 */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  const body = await readBody<{
    message?: string
    history?: Array<{ role?: string, content?: string }>
  }>(event)
  const { message, history } = validateChatRequestBody(body)

  const runtimeConfig = {
    apiKey: config.tokenHubChatApiKey,
    model: config.agentChatModel,
    maxIterations: config.agentMaxIterations,
    rewriteAttempts: config.agentRewriteAttempts,
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
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: AgentStreamEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`))
      }

      try {
        const result = await runAgent({
          message,
          history,
          options: runtimeConfig,
          onEvent: send,
        })

        // 收尾事件：附带完整结果，前端据此落库（含 steps）
        send({
          type: 'done',
          reply: result.reply,
          model: result.model,
          requestId: result.requestId,
          steps: result.steps,
          toolCalls: result.toolCalls,
          iterations: result.iterations,
          truncated: result.truncated,
        })
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : '服务暂时不可用，请稍后重试'
        send({ type: 'error', message: errorMessage })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      // 关闭网关缓冲，保证逐帧到达
      'X-Accel-Buffering': 'no',
    },
  })
})
