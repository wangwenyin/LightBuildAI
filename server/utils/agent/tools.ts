import { submitNightImageJob } from '../hunyuan'
import {
  composeNightPrompt,
  getPromptGuide,
  reviewNightPrompt,
} from './knowledge'
import { NIGHT_TEMPLATES, getNightTemplateById, searchNightTemplates } from '../../../shared/nightTemplates'
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
      name: 'list_night_templates',
      description:
        '列出/检索团队沉淀的夜景提示词模板库。当用户的需求近似某个成熟场景（节日商业街、高端住宅、极简冷调、赛博霓虹、冬日暖光、滨水度假）时，'
        + '优先调用它拿到现成模板作为起点，再按用户具体需求微调，这样质量更稳、更省步数。',
      parameters: {
        type: 'object',
        properties: {
          keyword: {
            type: 'string',
            description: '检索关键词（如「节日」「住宅」「极简」）。留空则返回全部模板。',
          },
        },
      },
    },
    {
      name: 'get_night_template',
      description:
        '按 id 取某条模板的完整内容（正向提示词、负向提示词、设计要点），拿到后可直接作为基线微调或投喂出图。',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '模板 id，来自 list_night_templates 的返回。' },
        },
        required: ['id'],
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

    case 'list_night_templates':
      return listNightTemplates(asString(args.keyword))

    case 'get_night_template':
      return getNightTemplate(asString(args.id))

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

/** 列出模板：只返回轻量摘要，避免把全量提示词塞进上下文 */
function listNightTemplates(keyword: string) {
  const matched = searchNightTemplates(keyword)

  return {
    total: matched.length,
    keyword: keyword || '',
    templates: matched.map(item => ({
      id: item.id,
      name: item.name,
      summary: item.summary,
      tags: item.tags,
    })),
    note: matched.length === 0
      ? '没有匹配的模板，请改用 compose_night_prompt 从零组装。'
      : '拿到 id 后可用 get_night_template 取完整提示词。',
  }
}

/** 取模板全文 */
function getNightTemplate(id: string) {
  if (!id) {
    return { error: '缺少模板 id。可先调用 list_night_templates 查看可用模板。' }
  }

  const template = getNightTemplateById(id)

  if (!template) {
    return {
      error: `未找到 id 为「${id}」的模板。`,
      available: NIGHT_TEMPLATES.map(item => item.id),
    }
  }

  return {
    id: template.id,
    name: template.name,
    summary: template.summary,
    tags: template.tags,
    prompt: template.prompt,
    negativePrompt: template.negativePrompt,
    highlights: template.highlights,
    usage: '可将 prompt 作为基线，按用户具体需求微调后再调用 review_night_prompt 自检。',
  }
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
