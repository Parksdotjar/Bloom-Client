# Bloom Animated Cape Worker

Dedicated VPS worker for Animated Cape Studio jobs.

## Responsibilities
- Claim queued animated media jobs via edge route.
- Download source GIF/MP4 from Supabase Storage.
- Run ffprobe/ffmpeg processing (trim, crop, fps sampling).
- Pack frames into 4096x2048 atlas pages (vertical-first packing).
- Generate `manifest.json`, `thumb.png`, optional `preview.webp`.
- Upload processed assets and finalize order.
- Mark failures and trigger refund path for non-retryable errors.

## Setup
1. Copy `.env.example` to `.env`.
2. Fill required secrets:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `BLOOM_ANIMATED_CAPE_WORKER_SECRET`
3. Ensure `ffmpeg` and `ffprobe` are available on PATH (or set custom bin envs).
4. Install and run:
   ```bash
   npm install
   npm run dev
   ```

## Build
```bash
npm run build
npm start
```
