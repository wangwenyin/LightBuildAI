// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  appDir: 'app',
  runtimeConfig: {
    tencentcloudSecretId: process.env.TENCENTCLOUD_SECRET_ID,
    tencentcloudSecretKey: process.env.TENCENTCLOUD_SECRET_KEY,
    tencentcloudRegion: process.env.TENCENTCLOUD_REGION || 'ap-guangzhou',
    tokenHubApiKey: process.env.TOKENHUB_API_KEY || process.env.TOKENHUB_API_KEY,
    hunyuanMaxPollDurationMs: Number.parseInt(process.env.HUNYUAN_MAX_POLL_DURATION_MS || '', 10) || 300000,
  },
})
