import {
  createHunyuanClient,
  type HunyuanCredentials,
  type QueryNightImageJobResult,
  type SubmitNightImageJobParams,
  type SubmitNightImageJobResult,
} from './hunyuan-shared'

export async function submitLegacyHunyuanTextToImageJob({
  prompt,
  negativePrompt,
  revise,
  secretId,
  secretKey,
  region,
  imageWidth,
  imageHeight,
}: SubmitNightImageJobParams): Promise<SubmitNightImageJobResult> {
  const client = createHunyuanClient({ secretId, secretKey, region })
  const resolution = buildHunyuanTextToImageResolution(imageWidth, imageHeight)

  const submitParams = {
    Prompt: prompt,
    ...(negativePrompt ? { NegativePrompt: negativePrompt } : {}),
    Resolution: resolution,
    Num: 1,
    Revise: revise === false ? 0 : 1,
    LogoAdd: 0,
  }

  console.log('Hunyuan text-to-image submit params:', summarizeHunyuanTextToImageSubmitParams(submitParams))

  const submitResult = await client.SubmitHunyuanImageJob(submitParams)
  const jobId = submitResult.JobId

  if (!jobId) {
    throw new Error('混元接口未返回任务 ID')
  }

  return {
    jobId,
    imageUrl: undefined,
    requestId: undefined,
    provider: 'hunyuan-text-to-image' as const,
    seed: undefined,
    size: undefined,
  }
}

export async function queryHunyuanTextToImageJob(
  jobId: string,
  credentials: HunyuanCredentials,
): Promise<QueryNightImageJobResult> {
  const client = createHunyuanClient(credentials)
  const queryResult = await client.QueryHunyuanImageJob({ JobId: jobId })
  const statusCode = String(queryResult.JobStatusCode || '')
  const statusMessage = queryResult.JobStatusMsg || ''
  const requestId = queryResult.RequestId || ''
  const errorCode = queryResult.JobErrorCode || ''
  const errorMessage = queryResult.JobErrorMsg || ''

  if (statusCode === '5') {
    const imageUrl = queryResult.ResultImage?.[0]

    if (!imageUrl) {
      throw new Error('混元任务已完成，但未返回图片地址')
    }

    return {
      status: 'done' as const,
      imageUrl,
      revisedPrompt: queryResult.RevisedPrompt?.[0],
      statusCode,
      statusMessage,
      requestId,
    }
  }

  if (statusCode === '4') {
    return {
      status: 'failed' as const,
      errorMessage: errorMessage || '混元生成任务失败',
      errorCode,
      statusCode,
      statusMessage,
      requestId,
    }
  }

  return {
    status: 'processing' as const,
    revisedPrompt: queryResult.RevisedPrompt?.[0],
    statusCode,
    statusMessage,
    requestId,
  }
}

function summarizeHunyuanTextToImageSubmitParams(params: {
  Prompt: string
  NegativePrompt?: string
  Resolution: string
  Num: number
  Revise: number
  LogoAdd: number
}) {
  return {
    promptLength: params.Prompt.length,
    negativePromptLength: params.NegativePrompt?.length,
    resolution: params.Resolution,
    num: params.Num,
    revise: params.Revise,
    logoAdd: params.LogoAdd,
  }
}

const HUNYUAN_TEXT_TO_IMAGE_RESOLUTION_CANDIDATES = [
  '1024:768',
  '1024:1024',
  '768:1024',
] as const

function buildHunyuanTextToImageResolution(width?: number, height?: number) {
  return pickClosestResolution(width, height, HUNYUAN_TEXT_TO_IMAGE_RESOLUTION_CANDIDATES, '1024:1024')
}

function pickClosestResolution(
  width: number | undefined,
  height: number | undefined,
  candidates: readonly string[],
  fallback: string,
) {
  if (!width || !height) {
    return fallback
  }

  const ratio = width / height
  let bestResolution = fallback
  let bestDistance = Number.POSITIVE_INFINITY

  for (const candidate of candidates) {
    const [candidateWidth, candidateHeight] = candidate.split(':').map(Number)

    if (!candidateWidth || !candidateHeight) {
      continue
    }

    const candidateRatio = candidateWidth / candidateHeight
    const distance = Math.abs(Math.log(ratio / candidateRatio))

    if (distance < bestDistance) {
      bestDistance = distance
      bestResolution = candidate
    }
  }

  return bestResolution
}
