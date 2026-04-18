import { readBody } from 'h3'
import { submitNightImageJob } from '../utils/hunyuan'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  const { originalUrl } = await readBody<{ originalUrl?: string }>(event)

  if (!originalUrl) {
    throw createError({
      statusCode: 400,
      statusMessage: '请先上传原图',
    })
  }

  const prompt = [
    '基于原图生成高质量商业街夜景效果图，保留原始建筑结构、店铺位置、树木形态、道路关系与拍摄视角，不改变构图，不新增或删减主体。',
    '天空改为干净通透的深蓝色夜空，可点缀少量星星，整体画面高清、真实、无噪点。',
    '所有树木底部加入隐约的暖黄色地灯照明，近处灌木和矮树使用柔和暖白色灯光打亮，形成自然的景观层次。',
    '树冠与树枝间悬挂带“福”字的黄色八面圆柱形灯笼，每棵树根据树冠大小自然分布 5 到 10 个，营造节日氛围。',
    '树冠与树枝间随机点缀彩色发光藤球灯，每棵树根据树冠大小自然分布 5 到 10 个，灯光细腻明亮但不过曝。',
    '沿街商铺室内呈现清晰橱窗与陈列贴图，透出柔和且真实的室内光线，增强商业街营业状态。',
    '地面增加投影灯效果，投射出鲜艳清晰的花朵图案，投影应自然贴合地面透视关系。',
    '店招、广告牌与发光字整体点亮，文字边缘清晰锐利，画面内容可辨识，以品牌广告视觉为主，避免模糊与脏污。',
    '整体环境呈现夜晚商业街区的繁华活力，具有人气、温暖、现代、热闹的氛围。',
    '整体风格为现代商业综合体夜景渲染，色彩层次丰富，冷暖对比鲜明，灯光表现强烈但自然，画面充满节日与繁华气息。',
    '禁止室内灯光亮度高于室外主景灯光，禁止出现过曝、失真、模糊、低清晰度、水印、错乱文字、结构变形。',
  ].join(' ')

  const result = await submitNightImageJob({
    originalUrl,
    prompt,
    secretId: config.tencentcloudSecretId,
    secretKey: config.tencentcloudSecretKey,
    region: config.tencentcloudRegion,
  })

  return {
    taskId: result.jobId,
    jobId: result.jobId,
    status: 'processing',
  }
})
