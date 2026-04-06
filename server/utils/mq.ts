import { Queue, Worker } from 'bullmq'

type GenerateJobData = {
  originalUrl: string
}

type GenerateJobResult = {
  imageUrl: string
}

const connection = {
  host: 'localhost',
  port: 6379,
}

export const generateQueue = new Queue<GenerateJobData, GenerateJobResult>('night-image-generate', {
  connection,
})

export const worker = new Worker<GenerateJobData, GenerateJobResult>(
  'night-image-generate',
  async (job) => {
    const { originalUrl } = job.data

    void originalUrl

    return {
      imageUrl: 'https://your-ai-output.png',
    }
  },
  {
    connection,
  }
)
