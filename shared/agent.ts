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
