import { createClient } from 'redis'

let redis: ReturnType<typeof createClient> | null = null
let connectPromise: ReturnType<ReturnType<typeof createClient>['connect']> | null = null

export async function getRedis() {
  if (!redis) {
    redis = createClient({
      url: 'redis://localhost:6379',
    })
  }

  if (!redis.isOpen) {
    connectPromise ||= redis.connect()
    await connectPromise
  }

  return redis
}
