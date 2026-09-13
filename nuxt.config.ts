// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  css: ['~/app/assets/styles/reset.css'],
  ssr: true, // Nuxt3 默认开启 SSR，保持开启
  nitro: {
    preset: 'vercel', // 显式指定 Vercel 预设，避免自动检测异常
    vercel: {
      regions: ['hkg1'] // 选香港节点，国内访问更快（可选）
    }
  },
  experimental: {
    appManifest: false,
  },
  appDir: 'app',
  runtimeConfig: {
    tencentcloudSecretId: process.env.TENCENTCLOUD_SECRET_ID,
    tencentcloudSecretKey: process.env.TENCENTCLOUD_SECRET_KEY,
    tencentcloudRegion: process.env.TENCENTCLOUD_REGION || 'ap-guangzhou',
    tokenHubImageApiKey: process.env.TOKENHUB_API_KEY_IMAGE,
    tokenHubChatApiKey: process.env.TOKENHUB_API_KEY_CHAT,
    ossRegion: process.env.OSS_REGION,
    ossAccessKeyId: process.env.OSS_ACCESS_KEY_ID,
    ossAccessKeySecret: process.env.OSS_ACCESS_KEY_SECRET,
    ossBucket: process.env.OSS_BUCKET,
    ossEndpoint: process.env.OSS_ENDPOINT,
    ossDir: process.env.OSS_DIR || 'uploads',
    hunyuanMaxPollDurationMs: Number.parseInt(process.env.HUNYUAN_MAX_POLL_DURATION_MS || '', 10) || 300000,
    // ---- Agent 运行时配置 ----
    agentChatModel: process.env.AGENT_CHAT_MODEL || 'deepseek-v4-flash',
    agentMaxIterations: Number.parseInt(process.env.AGENT_MAX_ITERATIONS || '', 10) || 8,
    agentRewriteAttempts: Number.parseInt(process.env.AGENT_REWRITE_ATTEMPTS || '', 10) || 1,
    agentEnableGenerate: process.env.AGENT_ENABLE_GENERATE === 'true',
    agentMockLlm: process.env.AGENT_MOCK_LLM === 'true',
    // Mock 剧本变体：withGenerate 时会多走一次出图工具，便于本地验收出图链路
    agentMockMode: (process.env.AGENT_MOCK_MODE === 'withGenerate' ? 'withGenerate' : 'default') as 'default' | 'withGenerate',
  },
})
