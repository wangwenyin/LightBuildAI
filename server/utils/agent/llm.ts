import { createUpstreamError, parseJsonResponse } from '../hunyuan-shared'
import type { LlmMessage, ModelCaller, StreamingModelCaller, ToolCallRequest } from './types'

const TOKENHUB_CHAT_URL = 'https://tokenhub.tencentmaas.com/v1/chat/completions'

function buildRequestInit(
  { messages, tools, apiKey, model }: { messages: LlmMessage[], tools: any[], apiKey: string, model: string },
  stream: boolean,
) {
  return {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      ...(tools.length > 0
        ? {
            tools: tools.map(tool => ({ type: 'function', function: tool })),
            tool_choice: 'auto',
          }
        : {}),
      stream,
    }),
  }
}

/**
 * 真实模型调用（非流式）：走 TokenHub 的 OpenAI 兼容 /chat/completions，开启 function calling。
 * 这是 Agent 循环里唯一一次「问模型下一步做什么」的出口。
 */
export const callTokenHubWithTools: ModelCaller = async ({ messages, tools, apiKey, model }) => {
  let response: Response

  try {
    response = await fetch(TOKENHUB_CHAT_URL, buildRequestInit({ messages, tools, apiKey, model }, false))
  } catch {
    throw createUpstreamError(502, 'TokenHub 聊天服务暂时不可用，请稍后重试')
  }

  let data: any

  try {
    data = await parseJsonResponse(response, 'TokenHub 聊天服务')
  } catch {
    throw createUpstreamError(502, 'TokenHub 聊天服务返回了无法解析的响应')
  }

  if (!response.ok) {
    throw createUpstreamError(
      response.status >= 500 ? 502 : response.status,
      extractErrorMessage(data, 'TokenHub 聊天服务调用失败'),
    )
  }

  const choice = data?.choices?.[0]
  const rawMessage = choice?.message

  if (!rawMessage) {
    throw createUpstreamError(502, 'TokenHub 聊天服务未返回有效消息')
  }

  const message: LlmMessage = {
    role: 'assistant',
    content: typeof rawMessage.content === 'string' ? rawMessage.content : null,
    ...(Array.isArray(rawMessage.tool_calls) && rawMessage.tool_calls.length > 0
      ? { tool_calls: rawMessage.tool_calls }
      : {}),
  }

  return {
    message,
    model: data?.model || model,
    requestId: response.headers.get('x-request-id') || data?.id || data?.request_id || '',
    finishReason: choice?.finish_reason || '',
  }
}

/**
 * 真实模型调用（流式）：以 SSE 读取上游增量，
 * - 文本增量通过 onDelta 实时外推（前端打字机效果）；
 * - tool_calls 的分片（按 index 聚合）在结束时拼装完整。
 */
export const streamTokenHubWithTools: StreamingModelCaller = async ({
  messages,
  tools,
  apiKey,
  model,
  onDelta,
}) => {
  let response: Response

  try {
    response = await fetch(TOKENHUB_CHAT_URL, buildRequestInit({ messages, tools, apiKey, model }, true))
  } catch {
    throw createUpstreamError(502, 'TokenHub 聊天服务暂时不可用，请稍后重试')
  }

  if (!response.ok) {
    let data: any
    try {
      data = await parseJsonResponse(response, 'TokenHub 聊天服务')
    } catch {
      data = {}
    }
    throw createUpstreamError(
      response.status >= 500 ? 502 : response.status,
      extractErrorMessage(data, 'TokenHub 聊天服务调用失败'),
    )
  }

  if (!response.body) {
    throw createUpstreamError(502, 'TokenHub 聊天服务未返回流式响应体')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const toolAccumulator = new Map<number, ToolCallRequest>()
  let content = ''
  let buffer = ''
  let upstreamModel = model
  let finishReason = ''

  while (true) {
    const { done, value } = await reader.read()

    if (done) {
      break
    }

    buffer += decoder.decode(value, { stream: true })

    const lines = buffer.split('\n')
    buffer = lines.pop() || '' // 最後一行可能不完整，留到下一轮

    for (const line of lines) {
      const trimmed = line.trim()

      if (!trimmed || !trimmed.startsWith('data:')) {
        continue
      }

      const payload = trimmed.slice(5).trim()

      if (payload === '[DONE]') {
        continue
      }

      let chunk: any

      try {
        chunk = JSON.parse(payload)
      } catch {
        continue
      }

      upstreamModel = chunk?.model || upstreamModel
      const choice = chunk?.choices?.[0]
      const delta = choice?.delta

      if (choice?.finish_reason) {
        finishReason = choice.finish_reason
      }

      if (!delta) {
        continue
      }

      if (typeof delta.content === 'string' && delta.content) {
        content += delta.content
        onDelta?.(delta.content)
      }

      if (Array.isArray(delta.tool_calls)) {
        for (const piece of delta.tool_calls) {
          const index = typeof piece.index === 'number' ? piece.index : 0
          const current = toolAccumulator.get(index) || {
            id: '',
            type: 'function' as const,
            function: { name: '', arguments: '' },
          }

          if (piece.id) {
            current.id = piece.id
          }

          if (piece.function?.name) {
            current.function.name += piece.function.name
          }

          if (typeof piece.function?.arguments === 'string') {
            current.function.arguments += piece.function.arguments
          }

          toolAccumulator.set(index, current)
        }
      }
    }
  }

  const toolCalls = [...toolAccumulator.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, value]) => value)

  const message: LlmMessage = {
    role: 'assistant',
    content: content || null,
    ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
  }

  return {
    message,
    model: upstreamModel,
    requestId: response.headers.get('x-request-id') || '',
    finishReason,
  }
}

/**
 * Mock 模型调用器：无需任何 API Key，用剧本模拟
 * 「查规范 → 组装提示词 → 自检 → 收尾」的完整 ReAct 循环。
 * 依据「已执行了几轮工具」推进剧本，仅用于本地演示与冒烟测试。
 */
export function createScriptedCaller({ stream = false, withGenerate = false } = {}): StreamingModelCaller {
  const script = withGenerate ? MOCK_SCRIPT_WITH_GENERATE : MOCK_SCRIPT

  return async ({ messages, model, onDelta }) => {
    const toolRounds = messages.filter(message => message.role === 'tool').length
    const step = script[Math.min(toolRounds, script.length - 1)]!

    if (step.toolCall) {
      const call = typeof step.toolCall === 'function' ? step.toolCall(toolRounds) : step.toolCall

      return {
        message: {
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: `mock-call-${toolRounds + 1}`,
              type: 'function',
              function: {
                name: call.name,
                arguments: call.arguments,
              },
            },
          ],
        },
        model: `${model} (mock)`,
        requestId: 'mock-request',
        finishReason: 'tool_calls',
      }
    }

    const text = step.text || ''

    // 模拟流式：把最终文本分片吐给上层，让前端也能看到打字机效果
    if (stream && onDelta && text) {
      for (const chunk of chunkText(text, 24)) {
        onDelta(chunk)
        await sleep(30)
      }
    }

    return {
      message: { role: 'assistant', content: text },
      model: `${model} (mock)`,
      requestId: 'mock-request',
      finishReason: 'stop',
    }
  }
}

const MOCK_SCRIPT: Array<{ toolCall?: { name: string, arguments: string } | ((toolRounds: number) => { name: string, arguments: string }), text?: string }> = [
  {
    toolCall: {
      name: 'get_prompt_guide',
      arguments: JSON.stringify({ section: 'all' }),
    },
  },
  {
    toolCall: {
      name: 'compose_night_prompt',
      arguments: JSON.stringify({
        theme: '将建筑照片渲染为现代商业综合体夜景',
        elements: [
          '深蓝色夜空背景带几颗星星，高清无噪点',
          '树木底部被暖黄色光打亮，近处灌木矮树被暖白色灯光照亮',
          '树枝悬挂带「福」字的黄颜色八面圆柱形灯笼 5-10 个',
          '树枝安装随机颜色的发光藤球灯 5-10 个',
          '沿街商铺橱窗贴图清晰、透出柔和灯光',
          '地面用投影灯投射鲜艳花朵图案',
          '广告牌全部点亮、内透清晰、以品牌广告为主',
        ],
        lightingStyle: '暖黄主光 + 冷色夜色，明暗对比强烈，节日繁华氛围',
      }),
    },
  },
  {
    // 第一版自检：故意给出缺失项，触发 Agent「回炉重写」
    toolCall: {
      name: 'review_night_prompt',
      arguments: JSON.stringify({
        prompt: '深蓝色夜空背景带几颗星星；树木底部被暖黄色光打亮；广告牌全部点亮内透清晰。',
      }),
    },
  },
  {
    // 第二版自检：补齐后达标
    toolCall: {
      name: 'review_night_prompt',
      arguments: JSON.stringify({
        prompt: '深蓝色夜空背景带几颗星星，高清无噪点；树木底部被暖黄色光打亮，近处灌木矮树被暖白色灯光照亮；悬挂带「福」字的八面圆柱形灯笼 5-10 个；发光藤球灯 5-10 个；沿街商铺橱窗贴图清晰、透出柔和灯光；地面用投影灯投射鲜艳花朵图案；广告牌全部点亮、内透清晰、以品牌广告为主；整体呈现现代商业综合体夜景的活力与繁华氛围，色彩层次丰富、灯光对比强烈；禁止室内灯光亮度高于室外灯光。',
      }),
    },
  },
  {
    text: [
      '（演示模式 Mock）已跑通「知识检索 → 提示词组装 → 自检」三步循环，',
      '这说明 Agent 的自主循环与工具调用链路是通的。',
      '',
      '最终可直接使用的夜景提示词：',
      '',
      '```',
      '将建筑照片渲染为现代商业综合体夜景。深蓝色夜空背景带几颗星星，高清无噪点；',
      '树木底部被暖黄色光打亮，近处灌木矮树被暖白色灯光照亮；',
      '树枝悬挂带「福」字的黄颜色八面圆柱形灯笼 5-10 个，并安装随机颜色的发光藤球灯 5-10 个；',
      '沿街商铺橱窗贴图清晰、透出柔和灯光；地面用投影灯投射鲜艳花朵图案；',
      '广告牌全部点亮、内透清晰，以品牌广告为主；',
      '整体为现代商业综合体夜景风格，色彩层次丰富、灯光对比强烈，充满节日与繁华气息；',
      '禁止室内灯光亮度高于室外灯光。',
      '```',
      '',
      '负向提示词：白天场景；室内灯光亮度高于室外灯光；模糊文字；乱码文字；噪点；畸变；过曝。',
      '',
      '> 配置 TOKENHUB_API_KEY_CHAT 后即切换为真实模型，可多轮对话并自主决定调用哪些工具。',
    ].join('\n'),
  },
]

/**
 * 带出图的 Mock 剧本：与上面相同，但在提示词达标后追加一次 generate_night_image 调用。
 * 用于在无 Key 的情况下验收「AI 聊天直接出图 + 结果卡片 + 跨 tab 交接」这条链路。
 */
const MOCK_SCRIPT_WITH_GENERATE: typeof MOCK_SCRIPT = [
  ...MOCK_SCRIPT.slice(0, 4),
  {
    toolCall: {
      name: 'generate_night_image',
      arguments: JSON.stringify({
        prompt: '将建筑照片渲染为现代商业综合体夜景。深蓝色夜空背景带几颗星星，高清无噪点；树木底部被暖黄色光打亮，近处灌木矮树被暖白色灯光照亮；树枝悬挂带「福」字的黄颜色八面圆柱形灯笼 5-10 个，并安装随机颜色的发光藤球灯 5-10 个；沿街商铺橱窗贴图清晰、透出柔和灯光；地面用投影灯投射鲜艳花朵图案；广告牌全部点亮、内透清晰，以品牌广告为主；整体为现代商业综合体夜景风格，色彩层次丰富、灯光对比强烈，充满节日与繁华气息；禁止室内灯光亮度高于室外灯光。',
        negativePrompt: '白天场景；室内灯光明显高于室外灯光；模糊不清的广告牌文字；乱码文字；低清晰度；噪点；涂抹感；重影；畸变；过曝',
        revise: false,
      }),
    },
  },
  {
    text: [
      '（演示模式 Mock）提示词已自检达标，并已提交夜景渲染。',
      '',
      '**渲染任务**：已通过 generate_night_image 工具提交到出图服务，任务信息见下方结果卡片。',
      '',
      '最终可直接使用的夜景提示词：',
      '',
      '```',
      '将建筑照片渲染为现代商业综合体夜景。深蓝色夜空背景带几颗星星，高清无噪点；',
      '树木底部被暖黄色光打亮，近处灌木矮树被暖白色灯光照亮；',
      '树枝悬挂带「福」字的黄颜色八面圆柱形灯笼 5-10 个，并安装随机颜色的发光藤球灯 5-10 个；',
      '沿街商铺橱窗贴图清晰、透出柔和灯光；地面用投影灯投射鲜艳花朵图案；',
      '广告牌全部点亮、内透清晰，以品牌广告为主；',
      '整体为现代商业综合体夜景风格，色彩层次丰富、灯光对比强烈，充满节日与繁华气息；',
      '禁止室内灯光亮度高于室外灯光。',
      '```',
    ].join('\n'),
  },
]

function extractErrorMessage(data: any, fallback: string) {
  return data?.error?.message
    || data?.message
    || data?.msg
    || data?.detail
    || fallback
}

function chunkText(text: string, size: number): string[] {
  const chunks: string[] = []

  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size))
  }

  return chunks
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
