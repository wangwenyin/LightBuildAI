/**
 * Agent 轨迹类型：服务端产出，前端消费（用于渲染「思考过程」）。
 * 放在 shared/ 下，前后端共用同一份定义。
 */

export type AgentStep =
  | {
    type: 'thought'
    text: string
  }
  | {
    type: 'tool'
    name: string
    args: Record<string, unknown>
    result: unknown
    ok: boolean
    durationMs: number
  }
  | {
    type: 'rewrite'
    reason: string
    attempt: number
  }
  | {
    type: 'final'
    text: string
  }

export type ChatResponsePayload = {
  reply: string
  model: string
  requestId?: string
  steps?: AgentStep[]
  toolCalls?: string[]
  iterations?: number
}

/** SSE 流式事件（与 server/utils/agent/types.ts 中的 AgentStreamEvent 对应） */
export type AgentStreamEvent =
  | { type: 'start', model: string }
  | { type: 'iteration', index: number }
  | { type: 'thought', text: string }
  | { type: 'tool', name: string, args: Record<string, unknown>, result: unknown, ok: boolean, durationMs: number }
  | { type: 'rewrite', reason: string, attempt: number }
  | { type: 'delta', text: string }
  | { type: 'final', text: string }
  | {
    type: 'done'
    reply: string
    model: string
    requestId: string
    steps: AgentStep[]
    toolCalls: string[]
    iterations: number
    truncated: boolean
  }
  | { type: 'error', message: string }
