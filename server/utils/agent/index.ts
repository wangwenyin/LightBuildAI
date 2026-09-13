import { createError } from 'h3'
import { AGENT_SYSTEM_PROMPT } from './prompt'
import { buildToolSpecs, executeTool } from './tools'
import { callTokenHubWithTools, createScriptedCaller } from './llm'
import type { AgentOptions, AgentRunResult, AgentStep, LlmMessage, ModelCaller, ToolCallRequest } from './types'

/**
 * Agent 主循环（ReAct）—— 整个「Agent 应用」的心脏。
 *
 * 它做的事，本质上就是一个 while 循环：
 *   1. 问模型「下一步做什么」（携带工具定义）
 *   2. 如果模型要求调用工具 → 执行工具 → 把观察结果喂回模型 → 回到第 1 步
 *   3. 如果模型直接给出文本 → 那就是最终答案，循环结束
 *
 * 「和纯转发模型 API 的区别」就在这个循环里：模型不再只回答一次，而是能自主决策、动手、再看结果。
 */
export async function runAgent(params: {
  message: string
  history: Array<{ role: 'system' | 'user' | 'assistant', content: string }>
  options: AgentOptions
}): Promise<AgentRunResult> {
  const { message, history, options } = params
  const useMock = options.mockLlm

  if (!useMock && !options.apiKey) {
    throw createError({
      statusCode: 500,
      statusMessage: '缺少 TokenHub Chat API Key，请在 .env 中配置 TOKENHUB_API_KEY_CHAT（或用 AGENT_MOCK_LLM=true 本地演示）',
    })
  }

  const callModel: ModelCaller = options.callModel
    ?? (useMock ? createScriptedCaller() : callTokenHubWithTools)

  const tools = buildToolSpecs()
  const maxIterations = Math.max(1, options.maxIterations)

  // 上下文 = 系统提示词 + 历史对话 + 本轮用户输入
  const messages: LlmMessage[] = [
    { role: 'system', content: AGENT_SYSTEM_PROMPT },
    ...history.map(turn => ({ role: turn.role, content: turn.content })),
    { role: 'user', content: message },
  ]

  const steps: AgentStep[] = []
  const toolCallNames: string[] = []
  let iterations = 0
  let model = options.model
  let requestId = ''

  while (iterations < maxIterations) {
    iterations += 1

    const result = await callModel({
      messages,
      tools,
      apiKey: options.apiKey || '',
      model: options.model,
    })

    model = result.model || model
    requestId = result.requestId || requestId

    const toolCalls = result.message.tool_calls ?? []
    const thought = (result.message.content || '').trim()

    // 情况 A：模型没有要求调用工具 → 这就是最终答案，收工
    if (toolCalls.length === 0) {
      if (thought) {
        steps.push({ type: 'final', text: thought })
      }

      return {
        reply: thought,
        model,
        requestId,
        steps,
        toolCalls: toolCallNames,
        iterations,
        truncated: false,
      }
    }

    // 情况 B：模型要求调用工具 → 记录它的「思考」，执行工具，把结果喂回去
    if (thought) {
      steps.push({ type: 'thought', text: thought })
    }

    messages.push({
      role: 'assistant',
      content: result.message.content ?? '',
      tool_calls: toolCalls,
    })

    for (const toolCall of toolCalls) {
      const observation = await runSingleTool(toolCall, options, steps)
      toolCallNames.push(observation.name)
      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        name: observation.name,
        content: observation.content,
      })
    }
  }

  // 达到最大步数仍未收敛：强制让模型不带工具地做一次总结
  const finalized = await finalizeWithoutTools(callModel, messages, options)

  steps.push({ type: 'final', text: finalized })

  return {
    reply: finalized,
    model,
    requestId,
    steps,
    toolCalls: toolCallNames,
    iterations,
    truncated: true,
  }
}

async function runSingleTool(
  toolCall: ToolCallRequest,
  options: AgentOptions,
  steps: AgentStep[],
): Promise<{ name: string, content: string }> {
  const name = toolCall.function?.name || 'unknown'
  const startedAt = Date.now()

  let args: Record<string, unknown> = {}
  let ok = true
  let result: unknown

  try {
    args = parseToolArguments(toolCall.function?.arguments)
    result = await executeTool(name, args, options)
  } catch (error) {
    ok = false
    result = { error: error instanceof Error ? error.message : String(error) }
  }

  steps.push({
    type: 'tool',
    name,
    args,
    result,
    ok,
    durationMs: Date.now() - startedAt,
  })

  return {
    name,
    content: stringifyToolResult(result),
  }
}

async function finalizeWithoutTools(
  callModel: ModelCaller,
  messages: LlmMessage[],
  options: AgentOptions,
): Promise<string> {
  try {
    const result = await callModel({
      messages: [
        ...messages,
        {
          role: 'user',
          content: '请基于以上已完成的分析，直接给出最终可用的结论与提示词，不要再调用工具。',
        },
      ],
      tools: [],
      apiKey: options.apiKey || '',
      model: options.model,
    })

    const text = (result.message.content || '').trim()

    if (text) {
      return text
    }
  } catch {
    // 忽略收尾失败，下面回退到兜底文案
  }

  return '（推理步数已达上限）我先把已经完成的部分给你，若还需继续，请再追问一句。'
}

function parseToolArguments(raw: string | undefined): Record<string, unknown> {
  if (!raw) {
    return {}
  }

  try {
    const parsed = JSON.parse(raw)

    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }

    return {}
  } catch {
    return {}
  }
}

function stringifyToolResult(result: unknown): string {
  try {
    const text = JSON.stringify(result)

    // 防止超长观察结果撑爆上下文
    return text.length > 6000 ? `${text.slice(0, 6000)}...(已截断)` : text
  } catch {
    return String(result)
  }
}
