import { defaultNightNegativePromptRules } from '../../../shared/nightPrompt'

/**
 * 夜景提示词领域知识 + 纯函数工具逻辑（无副作用，便于单测）。
 * 这里承载的是「业务规则」，对应传统后端写死在 if/else 里的那部分——
 * 在 Agent 架构里，它变成了模型可以主动调用的工具。
 */

export type ChecklistItem = {
  key: string
  label: string
  keywords: string[]
  suggestion: string
}

/** 一张合格夜景图应当覆盖的要素（来自 prompt.txt 的沉淀） */
export const NIGHT_ELEMENT_CHECKLIST: ChecklistItem[] = [
  {
    key: 'sky',
    label: '夜空背景（深蓝 + 星星）',
    keywords: ['夜空', '星', '深蓝'],
    suggestion: '补充「深蓝色夜空背景带几颗星星，高清无噪点」。',
  },
  {
    key: 'tree-light',
    label: '树木暖光（底部暖黄 / 灌木暖白）',
    keywords: ['树木', '灌木', '暖黄', '暖白'],
    suggestion: '说明树木底部被暖黄光打亮、近处灌木矮树被暖白光提亮。',
  },
  {
    key: 'lantern',
    label: '「福」字圆柱灯笼（5-10 个）',
    keywords: ['灯笼', '福'],
    suggestion: '加入「树枝悬挂带『福』字的黄颜色八面圆柱形灯笼，5-10 个」。',
  },
  {
    key: 'rattan-ball',
    label: '发光藤球灯（5-10 个）',
    keywords: ['藤球', '藤球灯'],
    suggestion: '加入「随机颜色的发光藤球灯，5-10 个」。',
  },
  {
    key: 'shop-window',
    label: '沿街商铺橱窗与内透光',
    keywords: ['商铺', '橱窗', '店内', '内透'],
    suggestion: '描述商铺内部透出清晰橱窗贴图和柔和灯光。',
  },
  {
    key: 'ground-projection',
    label: '地面投影灯（花朵图案）',
    keywords: ['地面', '投影'],
    suggestion: '补充「地面用投影灯投射鲜艳花朵图案」。',
  },
  {
    key: 'billboard',
    label: '广告牌点亮、内透清晰',
    keywords: ['广告牌', '招牌', '广告'],
    suggestion: '说明广告牌全部点亮、内透灯光清晰、画面明亮锐利、以品牌广告为主。',
  },
  {
    key: 'atmosphere',
    label: '夜晚商业区活力氛围',
    keywords: ['氛围', '活力', '节日', '繁华'],
    suggestion: '点明整体氛围——夜晚商业区的活力、节日与繁华气息。',
  },
  {
    key: 'style',
    label: '现代商业综合体夜景风格',
    keywords: ['现代', '商业综合体', '渲染', '夜景风格'],
    suggestion: '收口风格描述：现代商业综合体夜景渲染，色彩层次丰富、灯光对比强烈。',
  },
]

/** 负向规则：来自项目共享定义，再补夜景特有条目 */
export const NIGHT_NEGATIVE_GUIDE: string[] = [
  ...defaultNightNegativePromptRules,
  '室内灯光亮度高于室外灯光',
]

/** 一段可直接参考的示例夜景提示词（用户此前沉淀的 prompt.txt） */
export const EXAMPLE_NIGHT_PROMPT = [
  '将图片生成夜景：1、深蓝色夜空背景带几颗星星，高清无噪点；',
  '2、树木：所有树木底部被隐隐约约的暖黄色光打亮，近处灌木、矮树全部被暖白色灯光照亮；',
  '树叶树枝：装带「福」字的黄颜色八面圆柱形灯笼，数量随机、树冠大小随机安装 5-10 个；',
  '树叶树枝：装随机颜色的发光藤球灯，数量随机、树冠大小随机安装 5-10 个；',
  '沿街商铺：商铺内部透出清晰的橱窗贴图，透出柔和的灯光；',
  '地面：用投影灯投射出鲜艳的花朵图案效果；',
  '广告牌：全部点亮，内透灯光清晰，文字和画面明亮锐利，广告画面图片内容清晰，以品牌广告为主；',
  '3、整个环境应有夜晚商业区的活力氛围；',
  '4、整体风格为现代商业综合体夜景渲染，色彩层次丰富，灯光对比强烈，画面充满节日与繁华气息；',
  '5、禁止室内灯光亮度高于室外灯光。',
].join('')

export const PROMPT_GUIDE_SECTIONS: Record<string, string> = {
  all: '全部内容',
  structure: '结构规范',
  elements: '必需要素清单',
  negative: '负向规则',
  example: '示例提示词',
}

/** 结构规范说明 */
export const PROMPT_STRUCTURE_GUIDE = [
  '一条好的夜景提示词建议按「背景 → 主体元素 → 灯光 → 地面 → 广告牌 → 氛围 → 风格 → 禁止项」的顺序组织，',
  '每段用「标签：描述」的形式，用分号或序号分隔，便于模型按序执行。',
  '要素要具体到「数量、颜色、位置、亮度关系」，避免「好看一点」这类不可执行的形容词。',
  '必须显式写出亮度关系约束（如「禁止室内灯光亮度高于室外灯光」）。',
].join('')

/** 组装提示词：把结构化需求变成可投喂的正向 / 负向提示词 */
export function composeNightPrompt(input: {
  theme?: string
  elements?: string[]
  lightingStyle?: string
  extraConstraints?: string
  negativeExtra?: string
}) {
  const theme = normalizeText(input.theme) || '将建筑照片渲染为现代商业综合体夜景'
  const elements = (input.elements || []).map(normalizeText).filter(Boolean)
  const lightingStyle = normalizeText(input.lightingStyle)
  const extraConstraints = normalizeText(input.extraConstraints)
  const negativeExtra = normalizeText(input.negativeExtra)

  const segments: string[] = [theme]

  if (elements.length > 0) {
    segments.push(`必需要素：${elements.join('；')}。`)
  }

  if (lightingStyle) {
    segments.push(`灯光风格：${lightingStyle}。`)
  }

  segments.push('亮度关系：禁止室内灯光亮度高于室外灯光，室外灯光层次分明、明暗对比强烈。')

  if (extraConstraints) {
    segments.push(`额外约束：${extraConstraints}。`)
  }

  const prompt = segments.join('')

  const negativePrompt = [
    ...NIGHT_NEGATIVE_GUIDE,
    negativeExtra ? `额外负向约束：${negativeExtra}。` : '',
  ].filter(Boolean).join('；')

  const missing = NIGHT_ELEMENT_CHECKLIST
    .filter(item => !elements.some(element => item.keywords.some(keyword => element.includes(keyword))))
    .map(item => item.label)

  return {
    prompt,
    negativePrompt,
    coveredElementCount: elements.length,
    suggestedMissingElements: missing,
    note: missing.length > 0
      ? '以上要素尚未在入参中显式出现，建议补齐后再投喂出图。'
      : '入参已覆盖主要夜景要素。',
  }
}

/** 自检提示词：返回满意度、缺失要素与改进建议（让 Agent 能「反思」） */
export function reviewNightPrompt(input: { prompt?: string }) {
  const prompt = normalizeText(input.prompt)

  if (!prompt) {
    return {
      score: 0,
      satisfied: [] as string[],
      missing: NIGHT_ELEMENT_CHECKLIST.map(item => item.label),
      warnings: ['提示词为空，无法自检。'],
      suggestions: ['请先提供一条夜景提示词。'],
    }
  }

  const satisfied: string[] = []
  const missing: string[] = []

  for (const item of NIGHT_ELEMENT_CHECKLIST) {
    const hit = item.keywords.some(keyword => prompt.includes(keyword))
    if (hit) {
      satisfied.push(item.label)
    } else {
      missing.push(item.label)
    }
  }

  const warnings: string[] = []

  if (!/禁止|不得|避免/.test(prompt)) {
    warnings.push('未显式写出禁止项，模型可能自由发挥导致不符合预期。')
  }

  if (/好看|漂亮|精美/.test(prompt)) {
    warnings.push('包含「好看 / 漂亮」等不可执行形容词，建议替换为具体灯光与材质描述。')
  }

  if (prompt.length < 40) {
    warnings.push('提示词偏短，约束不足，容易产生随机结果。')
  }

  const suggestions = NIGHT_ELEMENT_CHECKLIST
    .filter(item => missing.includes(item.label))
    .map(item => item.suggestion)

  const total = NIGHT_ELEMENT_CHECKLIST.length
  const rawScore = Math.round((satisfied.length / total) * 100)
  const score = Math.max(0, rawScore - warnings.length * 5)

  return { score, satisfied, missing, warnings, suggestions }
}

/** 按分区取知识（供 get_prompt_guide 工具用） */
export function getPromptGuide(section?: string) {
  const normalized = normalizeText(section).toLowerCase() || 'all'

  if (normalized === 'structure') {
    return { section: 'structure', content: PROMPT_STRUCTURE_GUIDE }
  }

  if (normalized === 'elements') {
    return {
      section: 'elements',
      checklist: NIGHT_ELEMENT_CHECKLIST.map(item => ({
        label: item.label,
        suggestion: item.suggestion,
      })),
    }
  }

  if (normalized === 'negative') {
    return { section: 'negative', rules: NIGHT_NEGATIVE_GUIDE }
  }

  if (normalized === 'example') {
    return { section: 'example', example: EXAMPLE_NIGHT_PROMPT }
  }

  return {
    section: 'all',
    structure: PROMPT_STRUCTURE_GUIDE,
    checklist: NIGHT_ELEMENT_CHECKLIST.map(item => item.label),
    negativeRules: NIGHT_NEGATIVE_GUIDE,
    example: EXAMPLE_NIGHT_PROMPT,
  }
}

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}
