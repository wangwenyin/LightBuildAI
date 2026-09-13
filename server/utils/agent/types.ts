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

export type AgentRunResult = {
  reply: string
  model: string
  requestId: string
  steps: AgentStep[]
  toolCalls: string[]
  iterations: number
  truncated: boolean
}
