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
HUNYUAN_MAX_POLL_DURATION_MS=300000
```

## Development

Start the dev server on `http://localhost:3000`:

```bash
npm run dev
```

If the generate API reports missing Tencent Cloud credentials, check whether `.env` contains valid `TENCENTCLOUD_SECRET_ID` and `TENCENTCLOUD_SECRET_KEY` values.

If image generation is slow, increase `HUNYUAN_MAX_POLL_DURATION_MS`. The default is `300000` milliseconds (5 minutes).
