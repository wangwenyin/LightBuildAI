// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  appDir: 'app',
  runtimeConfig: {
    tencentcloudSecretId: process.env.TENCENTCLOUD_SECRET_ID,
    tencentcloudSecretKey: process.env.TENCENTCLOUD_SECRET_KEY,
    tencentcloudRegion: process.env.TENCENTCLOUD_REGION || 'ap-beijing',
  },
})
