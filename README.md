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
   - `OSS_REGION` optional
   - `OSS_ACCESS_KEY_ID` optional
   - `OSS_ACCESS_KEY_SECRET` optional
   - `OSS_BUCKET` optional
   - `OSS_ENDPOINT` optional
   - `OSS_DIR` optional
   - `HUNYUAN_MAX_POLL_DURATION_MS` optional

Vercel serverless functions do not provide persistent public file storage. If OSS variables are configured, uploads are stored in OSS and TokenHub receives the OSS URL. If OSS variables are not configured, uploads are sent to TokenHub as a Base64 data URL, which works for the current 1MB compressed reference image flow. Local development still falls back to `public/uploads` when OSS variables are not configured.
