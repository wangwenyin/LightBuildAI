import type { AgentStep } from '../../../shared/agent'

export type { AgentStep }

/** 传给模型的消息（含工具调用相关字段，OpenAI 兼容格式） */
export type LlmMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: ToolCallRequest[]
  tool_call_id?: string
  name?: string
}

export type ToolCallRequest = {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

/** 工具定义（JSON Schema），直接塞进 tools 字段 */
export type ToolSpec = {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export type ModelCallParams = {
  messages: LlmMessage[]
  tools: ToolSpec[]
  apiKey: string
  model: string
}

export type ModelCallResult = {
  message: LlmMessage
  model: string
  requestId: string
  finishReason: string
}

/** 模型调用器：可注入（真实 TokenHub 调用 / Mock），便于测试与本地演示 */
export type ModelCaller = (params: ModelCallParams) => Promise<ModelCallResult>

/** 流式回调：模型边生成边把文本增量吐出来（用于 SSE 实时呈现） */
export type ModelStreamHandler = (delta: string) => void

/**
 * 可流式的模型调用器。返回结构与 ModelCaller 一致，
 * 区别在于生成过程中会通过 onDelta 回调持续推送文本增量。
 */
export type StreamingModelCaller = (
  params: ModelCallParams & { onDelta?: ModelStreamHandler },
) => Promise<ModelCallResult>

export type AgentGenerateContext = {
  secretId?: string
  secretKey?: string
  region?: string
  tokenHubApiKey?: string
  publicOrigin?: string
  ossRegion?: string
  ossAccessKeyId?: string
  ossAccessKeySecret?: string
  ossBucket?: string
  ossEndpoint?: string
}

export type AgentOptions = {
  apiKey?: string
  model: string
  maxIterations: number
  /** 是否允许 Agent 真正触发出图（默认关闭，避免误触消耗额度） */
  enableGenerate: boolean
  /** 本地无 Key 演示模式：用脚本化的 Mock 模型跑通循环 */
  mockLlm: boolean
  generate: AgentGenerateContext
  /** 允许上层注入自定义模型调用器（测试用） */
  callModel?: ModelCaller
}

export type AgentRunParams = {
  message: string
  history: Array<{ role: 'system' | 'user' | 'assistant', content: string }>
  options: AgentOptions
  /** 流式事件回调：用于 SSE 逐事件推送（思考/工具/回答增量） */
  onEvent?: (event: AgentStreamEvent) => void
}

/** Agent 运行过程中向外推送的事件（SSE 的载荷） */
export type AgentStreamEvent =
  | { type: 'start', model: string }
  | { type: 'iteration', index: number }
  | { type: 'thought', text: string }
  | { type: 'tool', name: string, args: Record<string, unknown>, result: unknown, ok: boolean, durationMs: number }
  | { type: 'rewrite', reason: string, attempt: number }
  | { type: 'delta', text: string }
  | { type: 'final', text: string }
  | { type: 'done', reply: string, model: string, requestId: string, steps: AgentStep[], toolCalls: string[], iterations: number, truncated: boolean }
  | { type: 'error', message: string }

export type AgentRunResult = {
  reply: string
  model: string
  requestId: string
  steps: AgentStep[]
  toolCalls: string[]
  iterations: number
  truncated: boolean
}
