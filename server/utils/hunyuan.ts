import {
  type HunyuanCredentials,
  type QueryNightImageJobResult,
  type SubmitNightImageJobParams,
  type SubmitNightImageJobResult,
} from './hunyuan-shared'
import { submitLegacyHunyuanTextToImageJob, queryHunyuanTextToImageJob } from './hunyuan-legacy'
import { submitTokenHubReferenceImageJob, queryTokenHubImageJob } from './hunyuan-tokenhub'

export async function submitNightImageJob({
  originalUrl,
  prompt,
  negativePrompt,
  revise,
  secretId,
  secretKey,
  region,
  tokenHubApiKey,
  publicOrigin,
  imageWidth,
  imageHeight,
}: SubmitNightImageJobParams): Promise<SubmitNightImageJobResult> {
  if (originalUrl) {
    if (!tokenHubApiKey) {
      throw new Error('参考图生成已固定走 TokenHub，请在 .env 中配置 TOKENHUB_API_KEY_IMAGE')
    }

    return submitTokenHubReferenceImageJob({
      originalUrl,
      prompt,
      negativePrompt,
      revise,
      tokenHubApiKey,
      publicOrigin,
      imageWidth,
      imageHeight,
    })
  }

  return submitLegacyHunyuanTextToImageJob({
    prompt,
    negativePrompt,
    revise,
    secretId,
    secretKey,
    region,
    imageWidth,
    imageHeight,
  })
}

export async function queryNightImageJob(
  jobId: string,
  credentials: HunyuanCredentials,
): Promise<QueryNightImageJobResult> {
  if (jobId.startsWith('tokenhub:')) {
    return queryTokenHubImageJob(jobId.slice('tokenhub:'.length), credentials.tokenHubApiKey)
  }

  return queryHunyuanTextToImageJob(jobId, credentials)
}
