import { readBody } from 'h3'
import fs from 'fs/promises'
import path from 'path'
import tencentcloud from 'tencentcloud-sdk-nodejs'

const { hunyuan } = tencentcloud
const HunyuanClient = hunyuan.v20230901.Client

const POLL_INTERVAL_MS = 2000
const MAX_POLL_TIMES = 30
const MAX_CONTENT_IMAGE_BASE64_BYTES = 8 * 1024 * 1024

type GenerateNightImageParams = {
  originalUrl: string
  prompt: string
  secretId?: string
  secretKey?: string
  region?: string
}

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
    '专业建筑夜景效果图，保留原始建筑结构与视角。',
    '夜晚灯光效果自然，建筑轮廓灯、窗户暖光、景观照明清晰。',
    '真实摄影风格，画面干净通透，高细节，无水印。',
  ].join(' ')

  const result = await generateNightImage({
    originalUrl,
    prompt,
    secretId: config.tencentcloudSecretId,
    secretKey: config.tencentcloudSecretKey,
    region: config.tencentcloudRegion,
  })

  return {
    nightImageUrl: result.imageUrl,
    jobId: result.jobId,
  }
})

async function generateNightImage({
  originalUrl,
  prompt,
  secretId,
  secretKey,
  region,
}: GenerateNightImageParams) {
  const client = createHunyuanClient({ secretId, secretKey, region })
  const contentImage = await createContentImage(originalUrl)

  const submitResult = await client.SubmitHunyuanImageJob({
    Prompt: prompt,
    Resolution: '1024:1024',
    Num: 1,
    Revise: 1,
    LogoAdd: 0,
    ContentImage: contentImage,
  })

  const jobId = submitResult.JobId
  if (!jobId) {
    throw new Error('混元接口未返回任务 ID')
  }

  for (let i = 0; i < MAX_POLL_TIMES; i += 1) {
    await sleep(POLL_INTERVAL_MS)
    const queryResult = await client.QueryHunyuanImageJob({ JobId: jobId })
    const statusCode = String(queryResult.JobStatusCode || '')

    if (statusCode === '4') {
      const imageUrl = queryResult.ResultImage?.[0]
      if (!imageUrl) {
        throw new Error('混元任务已完成，但未返回图片地址')
      }

      return {
        imageUrl,
        jobId,
      }
    }

    if (statusCode === '3') {
      throw new Error(queryResult.JobErrorMsg || '混元生成任务失败')
    }
  }

  throw new Error('混元生成超时，请稍后重试')
}

async function createContentImage(originalUrl: string) {
  if (isHttpUrl(originalUrl)) {
    return {
      ImageUrl: originalUrl,
    }
  }

  if (!originalUrl.startsWith('/uploads/')) {
    throw createError({
      statusCode: 400,
      statusMessage: '图片地址格式不合法，请先通过上传接口上传图片',
    })
  }

  const uploadPath = decodeURIComponent(originalUrl.split('?')[0])
  const uploadFilePath = path.resolve(process.cwd(), `public${uploadPath}`)
  const uploadDir = path.resolve(process.cwd(), 'public/uploads')

  if (!uploadFilePath.startsWith(`${uploadDir}${path.sep}`)) {
    throw createError({
      statusCode: 400,
      statusMessage: '图片地址格式不合法',
    })
  }

  const imageBuffer = await fs.readFile(uploadFilePath)
  const imageBase64 = imageBuffer.toString('base64')

  if (Buffer.byteLength(imageBase64, 'utf8') > MAX_CONTENT_IMAGE_BASE64_BYTES) {
    throw createError({
      statusCode: 400,
      statusMessage: '图片过大，请上传更小的 jpg、jpeg 或 png 图片',
    })
  }

  return {
    ImageBase64: imageBase64,
  }
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function createHunyuanClient({
  secretId,
  secretKey,
  region,
}: {
  secretId?: string
  secretKey?: string
  region?: string
}) {
  if (!secretId || !secretKey) {
    throw new Error('缺少腾讯云密钥，请在 .env 中配置 TENCENTCLOUD_SECRET_ID 和 TENCENTCLOUD_SECRET_KEY')
  }

  return new HunyuanClient({
    credential: {
      secretId,
      secretKey,
    },
    region: region || 'ap-beijing',
    profile: {
      httpProfile: {
        endpoint: 'hunyuan.tencentcloudapi.com',
      },
    },
  })
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
