import { createError } from 'h3'
import { AGENT_SYSTEM_PROMPT } from './prompt'
import { buildToolSpecs, executeTool } from './tools'
import { callTokenHubWithTools, createScriptedCaller, streamTokenHubWithTools } from './llm'
import type {
  AgentOptions,
  AgentRunResult,
  AgentStreamEvent,
  LlmMessage,
  ModelCaller,
  StreamingModelCaller,
  ToolCallRequest,
} from './types'

type AgentExtendedOptions = AgentOptions & { rewriteAttempts?: number }

/**
 * Agent 主循环（ReAct）—— 整个「Agent 应用」的心脏。
 *
 * 它做的事，本质上就是一个 while 循环：
 *   1. 问模型「下一步做什么」（携带工具定义）
 *   2. 如果模型要求调用工具 → 执行工具 → 把观察结果喂回模型 → 回到第 1 步
 *   3. 如果模型直接给出文本 → 那就是最终答案，循环结束
 *
 * 「和纯转发模型 API 的区别」就在这个循环里：模型不再只回答一次，而是能自主决策、动手、再看结果。
 *
 * 额外能力：
 * - 全程通过 onEvent 外推流式事件（思考 / 工具 / 回答增量），供 SSE 实时呈现；
 * - 自检未达标时自动「回炉重写」（rewrite），模仿人类改稿。
 */
export async function runAgent(params: {
  message: string
  history: Array<{ role: 'system' | 'user' | 'assistant', content: string }>
  options: AgentExtendedOptions
  onEvent?: (event: AgentStreamEvent) => void
}): Promise<AgentRunResult> {
  const { message, history, options, onEvent } = params
  const rewriteAttempts = clampInt(options.rewriteAttempts, 0, 3, 0)
  const useMock = options.mockLlm

  if (!useMock && !options.apiKey) {
    throw createError({
      statusCode: 500,
      statusMessage: '缺少 TokenHub Chat API Key，请在 .env 中配置 TOKENHUB_API_KEY_CHAT（或用 AGENT_MOCK_LLM=true 本地演示）',
    })
  }

  const streamingCaller: StreamingModelCaller = options.callModel
    ? (async p => options.callModel!(p))
    : useMock
      ? createScriptedCaller({ stream: true })
      : streamTokenHubWithTools

  const fallbackCaller: ModelCaller = options.callModel ?? (useMock ? createScriptedCaller() : callTokenHubWithTools)

  const tools = buildToolSpecs()
  const maxIterations = Math.max(1, options.maxIterations)

  // 上下文 = 系统提示词 + 历史对话 + 本轮用户输入
  const messages: LlmMessage[] = [
    { role: 'system', content: AGENT_SYSTEM_PROMPT },
    ...history.map(turn => ({ role: turn.role, content: turn.content })),
    { role: 'user', content: message },
  ]

  const steps: AgentStreamEvent[] = []
  const toolCallNames: string[] = []
  let iterations = 0
  let model = options.model
  let requestId = ''

  onEvent?.({ type: 'start', model: options.model })

  while (iterations < maxIterations) {
    iterations += 1
    onEvent?.({ type: 'iteration', index: iterations })

    let turnText = ''

    const result = await streamingCaller({
      messages,
      tools,
      apiKey: options.apiKey || '',
      model: options.model,
      onDelta: (delta) => {
        turnText += delta
        onEvent?.({ type: 'delta', text: delta })
      },
    })

    model = result.model || model
    requestId = result.requestId || requestId

    const toolCalls = result.message.tool_calls ?? []
    const thought = (result.message.content || turnText || '').trim()

    // 情况 A：模型没有要求调用工具 → 这就是最终答案，收工
    if (toolCalls.length === 0) {
      if (thought) {
        steps.push({ type: 'final', text: thought })
      }

      return {
        reply: thought,
        model,
        requestId,
        steps: toAgentSteps(steps),
        toolCalls: toolCallNames,
        iterations,
        truncated: false,
      }
    }

    // 情况 B：模型要求调用工具 → 记录它的「思考」，执行工具，把结果喂回去
    if (thought) {
      steps.push({ type: 'thought', text: thought })
      onEvent?.({ type: 'thought', text: thought })
    }

    messages.push({
      role: 'assistant',
      content: result.message.content ?? '',
      tool_calls: toolCalls,
    })

    for (const toolCall of toolCalls) {
      const observation = await runSingleTool(toolCall, options, onEvent)
      toolCallNames.push(observation.name)
      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        name: observation.name,
        content: observation.content,
      })

      // 工具步骤同时计入 steps（供 done 事件与持久化使用）
      steps.push({
        type: 'tool',
        name: observation.name,
        args: observation.args,
        result: observation.result,
        ok: observation.ok,
        durationMs: observation.durationMs,
      })

      // 自检不达标 → 注入一条「重写」引导，让模型回炉（最多 rewriteAttempts 次）
      const rewrite = buildRewriteInstruction(observation)

      if (rewrite && countRewrites(steps) < rewriteAttempts) {
        const attempt = countRewrites(steps) + 1
        steps.push({ type: 'rewrite', reason: rewrite.reason, attempt })
        onEvent?.({ type: 'rewrite', reason: rewrite.reason, attempt })
        messages.push({ role: 'user', content: rewrite.instruction })
      }
    }
  }

  // 达到最大步数仍未收敛：强制让模型不带工具地做一次总结
  const finalized = await finalizeWithoutTools(fallbackCaller, messages, options)

  steps.push({ type: 'final', text: finalized })

  return {
    reply: finalized,
    model,
    requestId,
    steps: toAgentSteps(steps),
    toolCalls: toolCallNames,
    iterations,
    truncated: true,
  }
}

/** 自检结果不达标时，生成一条引导消息，让模型「回炉重写」 */
export function buildRewriteInstruction(observation: { name: string, content: string }) {
  if (observation.name !== 'review_night_prompt') {
    return null
  }

  let parsed: any

  try {
    parsed = JSON.parse(observation.content)
  } catch {
    return null
  }

  const missing: string[] = Array.isArray(parsed?.missing) ? parsed.missing : []
  const warnings: string[] = Array.isArray(parsed?.warnings) ? parsed.warnings : []
  const score = typeof parsed?.score === 'number' ? parsed.score : 100

  if (score >= 80 && missing.length === 0 && warnings.length === 0) {
    return null
  }

  const reasons: string[] = []

  if (missing.length > 0) {
    reasons.push(`缺失要素：${missing.join('、')}`)
  }

  if (warnings.length > 0) {
    reasons.push(`警告：${warnings.join('；')}`)
  }

  return {
    reason: reasons.join(' ｜ ') || `自检得分偏低（${score}）`,
    instruction: [
      '你上一版提示词未通过自检，请务必重写一版。',
      reasons.length > 0 ? `问题：${reasons.join('；')}。` : '',
      '要求：调用 compose_night_prompt 补齐上述缺失要素与约束，再用 review_night_prompt 复检，直到得分不低于 80 且无缺失项。',
    ].filter(Boolean).join('\n'),
  }
}

function countRewrites(steps: AgentStreamEvent[]) {
  return steps.filter(step => step.type === 'rewrite').length
}

function toAgentSteps(steps: AgentStreamEvent[]): AgentRunResult['steps'] {
  return steps.filter(
    (step): step is Extract<AgentStreamEvent, { type: 'thought' | 'tool' | 'final' }> =>
      step.type === 'thought' || step.type === 'tool' || step.type === 'final',
  )
}

async function runSingleTool(
  toolCall: ToolCallRequest,
  options: AgentOptions,
  onEvent?: (event: AgentStreamEvent) => void,
): Promise<{ name: string, content: string, args: Record<string, unknown>, result: unknown, ok: boolean, durationMs: number }> {
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

  const durationMs = Date.now() - startedAt

  onEvent?.({ type: 'tool', name, args, result, ok, durationMs })

  return {
    name,
    args,
    result,
    ok,
    durationMs,
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

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const num = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10)

  if (!Number.isFinite(num)) {
    return fallback
  }

  return Math.min(max, Math.max(min, Math.trunc(num)))
}
