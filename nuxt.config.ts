// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  css: ['~/app/assets/styles/reset.css'],
  ssr: true, // Nuxt3 默认开启 SSR，保持开启
  nitro: {
    preset: 'vercel', // 显式指定 Vercel 预设，避免自动检测异常
    vercel: {
      regions: ['hkg1'], // 边缘函数区域（serverless 函数区域见下面 functions.regions）
      // 关键：函数时长/资源必须在 Nitro 层配置。Nitro 会把它写进构建产物
      // .vercel/output/functions/__fallback.func/.vc-config.json，路径永远匹配。
      // ⚠️ 不要在 vercel.json 的 functions 里用 "server/api/xxx.ts" 这类源码路径 ——
      // 那是标准项目（api/ 目录）的写法；Nuxt 会被 Nitro 打包成单个 __fallback 函数，
      // 因而报 "pattern ... doesn't match any Serverless Functions" 构建失败（2026-09 踩坑）。
      functions: {
        maxDuration: 120, // 生图 / Agent 聊天为长任务；Hobby 上限 300s（Fluid compute）
        memory: 1024,
        regions: ['hkg1'], // serverless 函数部署区域（顶部 vercel.regions 仅对 edge 生效）
      },
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
