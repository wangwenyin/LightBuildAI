# LightBuildAI

## Setup

Install dependencies:

```bash
npm install
```

Create local environment variables:

```bash
cp .env.example .env
```

Then fill in the Tencent Cloud credentials in `.env`:

```env
TENCENTCLOUD_SECRET_ID=your_secret_id
TENCENTCLOUD_SECRET_KEY=your_secret_key
TENCENTCLOUD_REGION=ap-beijing
TOKENHUB_API_KEY_IMAGE=your_TOKENHUB_API_KEY_IMAGE
TOKENHUB_API_KEY_CHAT=your_TOKENHUB_API_KEY_CHAT
OSS_REGION=oss-cn-guangzhou
OSS_ACCESS_KEY_ID=your_oss_access_key_id
OSS_ACCESS_KEY_SECRET=your_oss_access_key_secret
OSS_BUCKET=your_oss_bucket
HUNYUAN_MAX_POLL_DURATION_MS=300000
```

## Development

Start the dev server on `http://localhost:3000`:

```bash
npm run dev
```

If the generate API reports missing Tencent Cloud credentials, check whether `.env` contains valid `TENCENTCLOUD_SECRET_ID` and `TENCENTCLOUD_SECRET_KEY` values.

If image generation is slow, increase `HUNYUAN_MAX_POLL_DURATION_MS`. The default is `300000` milliseconds (5 minutes).

## AI Agent（聊天已从「纯转发」改造为 Agent）

聊天接口 `POST /api/chat` 不再是一次性的模型转发，而是一个**具备自主循环与工具调用的 Agent**。

### 运行机制（ReAct）

服务端 `server/utils/agent/index.ts` 里是一个手写的 `while` 循环：

1. 带上「工具定义」向模型提问：下一步做什么？
2. 若模型返回 `tool_calls` → 执行工具 → 把观察结果作为 `tool` 消息喂回模型 → 回到第 1 步；
3. 若模型直接返回文本 → 作为最终答案，循环结束；
4. 最多迭代 `AGENT_MAX_ITERATIONS` 次（默认 6），超限则强制做一次不带工具的总结，避免死循环。

### 工具集

| 工具 | 类型 | 作用 |
|---|---|---|
| `get_prompt_guide` | 知识检索 | 返回夜景提示词的结构规范、必需要素清单、负向规则与示例 |
| `compose_night_prompt` | 确定性计算 | 把结构化需求组装成完整正向 / 负向提示词 |
| `review_night_prompt` | 自我反思 | 自检提示词，返回得分、缺失要素与改进建议 |
| `generate_night_image` | 行动（默认关闭） | 真正触发出图，返回任务 id 与状态 |

### 响应结构

```json
{
  "reply": "最终回答",
  "model": "deepseek-v4-flash",
  "requestId": "...",
  "steps": [{ "type": "tool", "name": "compose_night_prompt", "args": {}, "result": {}, "ok": true, "durationMs": 0 }],
  "toolCalls": ["get_prompt_guide", "compose_night_prompt", "review_night_prompt"],
  "iterations": 4
}
```

`steps` 用于前端渲染「思考过程」，请求体 `{ message, history }` 保持不变，向后兼容。

### 本地无 Key 演示

没有 `TOKENHUB_API_KEY_CHAT` 时，可用脚本化 Mock 模型跑通整个循环（用于验证链路，不产生真实回答）：

```bash
AGENT_MOCK_LLM=true npm run dev
```

### 出图开关

`AGENT_ENABLE_GENERATE` 默认 `false`。开启后 Agent 才能调用 `generate_night_image` 真正出图（耗时且消耗额度，建议按需开启）。

## OSS Direct Upload

This project now uses browser direct upload for reference images when OSS is configured:

```txt
Browser -> /api/upload (get signed PUT URL) -> Browser PUT to OSS -> /api/generate
```

This avoids proxying file bytes through Vercel Functions, which is more stable for OSS buckets in mainland China.

Required OSS environment variables:

```env
OSS_REGION=oss-cn-guangzhou
OSS_ACCESS_KEY_ID=your_oss_access_key_id
OSS_ACCESS_KEY_SECRET=your_oss_access_key_secret
OSS_BUCKET=your_oss_bucket
OSS_ENDPOINT=
OSS_DIR=uploads
```

### OSS CORS

CORS must be configured in the Alibaba Cloud OSS console. Environment variables alone are not enough.

Recommended CORS values:

| Item | Value |
|---|---|
| AllowedOrigin | `http://localhost:3000` |
| AllowedOrigin | `https://ai.winghouse.xyz` |
| AllowedMethod | `PUT,GET,HEAD,OPTIONS` |
| AllowedHeader | `Content-Type,Origin,Accept,x-oss-*` |
| ExposeHeader | `ETag,x-oss-request-id` |
| MaxAgeSeconds | `3600` |

If your local dev server uses another port, replace `http://localhost:3000` with the actual local origin.

## Deploy to Vercel

This is a Nuxt 3 SSR app. Vercel can detect the Nuxt build automatically.

1. Push the repository to GitHub/GitLab/Bitbucket.
2. Import the project in Vercel.
3. Use the default settings:
   - Framework Preset: Nuxt.js
   - Install Command: `npm install`
   - Build Command: `npm run build`
4. Add these Environment Variables in Vercel:
   - `TENCENTCLOUD_SECRET_ID`
   - `TENCENTCLOUD_SECRET_KEY`
   - `TENCENTCLOUD_REGION`
   - `TOKENHUB_API_KEY_IMAGE`
   - `TOKENHUB_API_KEY_CHAT`
   - `OSS_REGION`
   - `OSS_ACCESS_KEY_ID`
   - `OSS_ACCESS_KEY_SECRET`
   - `OSS_BUCKET`
   - `OSS_ENDPOINT` optional
   - `OSS_DIR` optional
   - `HUNYUAN_MAX_POLL_DURATION_MS` optional

Vercel serverless functions do not provide persistent public file storage. With the current direct upload flow, OSS variables should be configured in Vercel for reference image upload to work correctly.
