import { Queue } from 'bullmq'

type GenerateJobData = {
  originalUrl?: string
}

type GenerateJobResult = {
  imageUrl: string
}

const connection = {
  host: 'localhost',
  port: 6379,
}

let generateQueue: Queue<GenerateJobData, GenerateJobResult> | null = null

export function getGenerateQueue() {
  if (!generateQueue) {
    generateQueue = new Queue<GenerateJobData, GenerateJobResult>('night-image-generate', {
      connection,
    })
  }

  return generateQueue
}
