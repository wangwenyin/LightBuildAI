export const defaultNightPromptRules = [
] as const

export const defaultNightNegativePromptRules = [
  '白天场景',
  '室内灯光明显高于室外灯光',
  '模糊不清的广告牌文字',
  '乱码文字',
  '低清晰度',
  '噪点',
  '涂抹感',
  '重影',
  '畸变',
  '脏污',
  '过曝',
  '死黑阴影',
  '无关装饰物',
  '不真实灯光',
  '灯笼和藤球灯缺失',
  '商业氛围不足',
] as const

export function buildNightPrompt(customPrompt?: string) {
  const normalizedCustomPrompt = customPrompt?.trim()

  return [
    normalizedCustomPrompt
  ]
    .filter(Boolean)
    .join(' ')
}

export function buildNightNegativePrompt(customNegativePrompt?: string) {
  const normalizedCustomNegativePrompt = customNegativePrompt?.trim()

  return [
    ...defaultNightNegativePromptRules,
    normalizedCustomNegativePrompt ? `额外负向约束：${normalizedCustomNegativePrompt}。` : '',
  ]
    .filter(Boolean)
    .join('；')
}
