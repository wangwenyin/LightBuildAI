import { createUpstreamError, parseJsonResponse } from '../hunyuan-shared'
import type { LlmMessage, ModelCaller } from './types'

const TOKENHUB_CHAT_URL = 'https://tokenhub.tencentmaas.com/v1/chat/completions'

/**
 * 真实模型调用：走 TokenHub 的 OpenAI 兼容 /chat/completions，开启 function calling。
 * 这是 Agent 循环里唯一一次「问模型下一步做什么」的出口。
 */
export const callTokenHubWithTools: ModelCaller = async ({ messages, tools, apiKey, model }) => {
  let response: Response

  try {
    response = await fetch(TOKENHUB_CHAT_URL, {
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
        stream: false,
      }),
    })
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
 * Mock 模型调用器：无需任何 API Key，用剧本模拟
 * 「查规范 → 组装提示词 → 自检 → 收尾」的完整 ReAct 循环。
 * 依据「已执行了几轮工具」推进剧本，仅用于本地演示与冒烟测试。
 */
export function createScriptedCaller(): ModelCaller {
  return async ({ messages, model }) => {
    const toolRounds = messages.filter(message => message.role === 'tool').length
    const step = MOCK_SCRIPT[Math.min(toolRounds, MOCK_SCRIPT.length - 1)]!

    if (step.toolCall) {
      return {
        message: {
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: `mock-call-${toolRounds + 1}`,
              type: 'function',
              function: {
                name: step.toolCall.name,
                arguments: step.toolCall.arguments,
              },
            },
          ],
        },
        model: `${model} (mock)`,
        requestId: 'mock-request',
        finishReason: 'tool_calls',
      }
    }

    return {
      message: { role: 'assistant', content: step.text || '' },
      model: `${model} (mock)`,
      requestId: 'mock-request',
      finishReason: 'stop',
    }
  }
}

const MOCK_SCRIPT: Array<{ toolCall?: { name: string, arguments: string }, text?: string }> = [
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
    toolCall: {
      name: 'review_night_prompt',
      arguments: JSON.stringify({
        prompt: '深蓝色夜空背景带几颗星星；树木底部被暖黄色光打亮；悬挂带「福」字的八面圆柱形灯笼 5-10 个；发光藤球灯 5-10 个；沿街商铺橱窗透出柔和灯光；地面投影花朵图案；广告牌全部点亮内透清晰；整体呈现现代商业综合体夜景氛围；禁止室内灯光亮度高于室外灯光。',
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

function extractErrorMessage(data: any, fallback: string) {
  return data?.error?.message
    || data?.message
    || data?.msg
    || data?.detail
    || fallback
}
