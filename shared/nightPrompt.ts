export const defaultNightPromptRules = [
  '基于原图进行高质量图像编辑，保留原始主体结构、空间透视、镜头视角和画面构图，避免无关元素增删。',
  '主体表达清晰明确，画面重点突出，层次分明，主体与背景关系自然，不杂乱、不堆砌。',
  '构图完整平衡，边缘裁切自然，比例协调，前景、中景、背景过渡清楚，视觉重心稳定。',
  '光线方向统一，明暗关系真实，曝光准确，不过曝不过暗，高光与阴影细节完整。',
  '色彩搭配和谐统一，饱和度适中，冷暖关系自然，整体氛围高级、干净、通透。',
  '材质纹理真实可辨，细节清晰，边缘干净，表面反射、阴影和质感符合真实物理规律。',
  '整体风格符合现代高品质商业视觉标准，画面精致、自然、具有审美统一性和专业感。',
  '输出高清晰度、高细节画面，避免模糊、噪点、涂抹感、重影、畸变、脏污、低分辨率、水印和错乱文字。',
] as const

export function buildNightPrompt(customPrompt?: string) {
  const normalizedCustomPrompt = customPrompt?.trim()

  return [
    ...defaultNightPromptRules,
    normalizedCustomPrompt ? `额外要求：${normalizedCustomPrompt}。` : '',
  ]
    .filter(Boolean)
    .join(' ')
}
