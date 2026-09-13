import { submitNightImageJob } from '../hunyuan'
import {
  composeNightPrompt,
  getPromptGuide,
  reviewNightPrompt,
} from './knowledge'
import type { AgentOptions, ToolSpec } from './types'

/**
 * 工具定义：这些 JSON Schema 会作为 tools 字段发给模型，
 * 模型据此「自主决定」调用哪个工具、传什么参数。
 */
export function buildToolSpecs(): ToolSpec[] {
  return [
    {
      name: 'get_prompt_guide',
      description:
        '获取夜景提示词的写作规范、必需要素清单、负向规则与示例。在开始撰写或修改提示词前应先调用。',
      parameters: {
        type: 'object',
        properties: {
          section: {
            type: 'string',
            enum: ['all', 'structure', 'elements', 'negative', 'example'],
            description: '想获取的知识分区，默认 all（全部）。',
          },
        },
      },
    },
    {
      name: 'compose_night_prompt',
      description:
        '把结构化需求组装成完整的夜景正向提示词与负向提示词，并返回尚未覆盖的要素清单。',
      parameters: {
        type: 'object',
        properties: {
          theme: { type: 'string', description: '整体主题，例如「现代商业综合体夜景」。' },
          elements: {
            type: 'array',
            items: { type: 'string' },
            description: '需要包含的具体要素列表，越具体越好（数量、颜色、位置、亮度关系）。',
          },
          lightingStyle: { type: 'string', description: '灯光风格描述。' },
          extraConstraints: { type: 'string', description: '额外正向约束。' },
          negativeExtra: { type: 'string', description: '额外负向约束。' },
        },
        required: ['theme'],
      },
    },
    {
      name: 'review_night_prompt',
      description:
        '对给定提示词做自检，返回得分、已满足要素、缺失要素、风险警告与改进建议。产出一版提示词后应调用它做反思。',
      parameters: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: '待自检的夜景提示词全文。' },
        },
        required: ['prompt'],
      },
    },
    {
      name: 'generate_night_image',
      description:
        '真正触发一次夜景图渲染，返回任务 id 与状态。耗时且消耗额度，仅在用户明确要求「生成 / 出图」时调用。',
      parameters: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: '正向提示词全文。' },
          negativePrompt: { type: 'string', description: '负向提示词，可选。' },
          referenceImageUrl: { type: 'string', description: '参考图 URL，可选；不传则为纯文生图。' },
          imageWidth: { type: 'number', description: '出图宽度，可选。' },
          imageHeight: { type: 'number', description: '出图高度，可选。' },
          revise: { type: 'boolean', description: '是否让模型改写提示词，默认 false。' },
        },
        required: ['prompt'],
      },
    },
  ]
}

/** 执行工具：把模型的「调用意图」变成真实副作用或数据。 */
export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  options: AgentOptions,
): Promise<unknown> {
  switch (name) {
    case 'get_prompt_guide':
      return getPromptGuide(asString(args.section))

    case 'compose_night_prompt':
      return composeNightPrompt({
        theme: asString(args.theme),
        elements: asStringArray(args.elements),
        lightingStyle: asString(args.lightingStyle),
        extraConstraints: asString(args.extraConstraints),
        negativeExtra: asString(args.negativeExtra),
      })

    case 'review_night_prompt':
      return reviewNightPrompt({ prompt: asString(args.prompt) })

    case 'generate_night_image':
      return generateNightImage(args, options)

    default:
      return { error: `未知工具：${name}` }
  }
}

async function generateNightImage(args: Record<string, unknown>, options: AgentOptions) {
  if (!options.enableGenerate) {
    return {
      enabled: false,
      message:
        '出图工具当前未启用（服务端 AGENT_ENABLE_GENERATE 未开启）。请把上面的提示词复制到页面的生成面板手动出图。',
    }
  }

  const prompt = asString(args.prompt)

  if (!prompt) {
    return { enabled: true, error: '缺少 prompt，无法触发出图。' }
  }

  const referenceImageUrl = asString(args.referenceImageUrl)
  const { generate } = options

  if (referenceImageUrl && !generate.tokenHubApiKey) {
    return { enabled: true, error: '参考图出图需要配置 TOKENHUB_API_KEY_IMAGE。' }
  }

  const result = await submitNightImageJob({
    originalUrl: referenceImageUrl || undefined,
    prompt,
    negativePrompt: asString(args.negativePrompt) || undefined,
    revise: typeof args.revise === 'boolean' ? args.revise : false,
    imageWidth: asNumber(args.imageWidth),
    imageHeight: asNumber(args.imageHeight),
    secretId: generate.secretId,
    secretKey: generate.secretKey,
    region: generate.region,
    tokenHubApiKey: generate.tokenHubApiKey,
    publicOrigin: generate.publicOrigin,
    ossRegion: generate.ossRegion,
    ossAccessKeyId: generate.ossAccessKeyId,
    ossAccessKeySecret: generate.ossAccessKeySecret,
    ossBucket: generate.ossBucket,
    ossEndpoint: generate.ossEndpoint,
  })

  return {
    enabled: true,
    taskId: result.jobId,
    status: result.imageUrl ? 'done' : 'processing',
    imageUrl: result.imageUrl,
    provider: result.provider,
    requestId: result.requestId,
  }
}

function asString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as string[]
  }

  return value.map(item => (typeof item === 'string' ? item.trim() : '')).filter(Boolean)
}

function asNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}
