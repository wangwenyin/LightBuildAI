import { generateQueue } from '../utils/mq'

export default defineEventHandler(async (event) => {
  const { taskId } = getQuery(event)
  const normalizedTaskId = Array.isArray(taskId) ? taskId[0] : taskId

  if (!normalizedTaskId) {
    throw createError({
      statusCode: 400,
      statusMessage: '缺少 taskId',
    })
  }

  const job = await generateQueue.getJob(normalizedTaskId)

  if (!job) {
    return { status: 'not_found' }
  }

  if (!job.finishedOn) {
    return { status: 'processing' }
  }

  return {
    status: 'done',
    imageUrl: (job.returnvalue as { imageUrl?: string } | undefined)?.imageUrl,
  }
})
