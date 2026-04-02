# Animated Cape Studio

## Architecture summary
- Frontend: `src/pages/AnimatedCapeStudio.tsx` + typed service APIs in `src/services/animatedCapeStudio.ts`.
- Orchestration: Supabase Edge Function routes in `supabase/functions/main/index.ts`.
- Database + pricing + wallet + jobs + RLS: `supabase/migrations/20260331193000_animated_cape_studio.sql`.
- Worker: `workers/animated-cape` (Node + ffmpeg/ffprobe + sharp).
- Runtime preview model: `src/services/animatedCapeRuntime.ts` + `src/components/cosmetics/AnimatedCapeCanvasPreview.tsx`.

## End-to-end pipeline
1. Client asks `/animated-cape/upload-url`.
2. Client uploads source GIF/MP4 to signed path in `animated-cape-uploads`.
3. Client registers upload metadata via `/animated-cape/register-upload`.
4. Client submits `/animated-cape/order` with tier + crop + idempotency key.
5. RPC `commerce_create_animated_cape_order` atomically:
   - validates tier server-side,
   - resolves authoritative price,
   - row-locks wallet,
   - debits wallet + ledger,
   - creates order,
   - enqueues media job.
6. Worker claims `queued` jobs from `/animated-cape/worker/claim`.
7. Worker downloads source, probes media, crops, samples frames, packs atlas pages (max 4096x2048/page), writes manifest/thumbnail/preview.
8. Worker uploads processed outputs to `animated-cape-processed`.
9. Worker completes via `/animated-cape/worker/complete`, which finalizes cosmetic ownership/equip + runtime metadata.
10. Client subscribes to order updates (realtime + polling fallback), then can equip from studio inventory.

## Storage layout
- Source uploads (`animated-cape-uploads` private):
  - `animated-capes/{user_id}/{upload_id}/source.{gif|mp4}`
- Processed outputs (`animated-cape-processed` public):
  - `animated-capes/{user_id}/{order_id}/manifest.json`
  - `animated-capes/{user_id}/{order_id}/thumb.png`
  - `animated-capes/{user_id}/{order_id}/preview.webp` (optional)
  - `animated-capes/{user_id}/{order_id}/page_{n}.png`

## Runtime manifest contract
The runtime format is atlas+manifest only (not GIF):

```json
{
  "version": 1,
  "cosmeticType": "cape",
  "atlasPages": [
    { "path": "animated-capes/<user>/<order>/page_0.png", "width": 4096, "height": 2048 }
  ],
  "frameWidth": 640,
  "frameHeight": 320,
  "fps": 15,
  "durationSeconds": 5,
  "frameCount": 75,
  "loopMode": "repeat",
  "frames": [
    { "index": 0, "page": 0, "x": 0, "y": 0, "w": 640, "h": 320, "durationMs": 67 }
  ]
}
```

Shared TS type:
- `src/types/animatedCapeManifest.ts`

## Worker processing details
- ffprobe validation (duration/width/height).
- Hard tier validation:
  - FPS: `12 | 15 | 24`
  - Duration: `3 | 4 | 5`
  - `24 FPS` only supports `3s`
- Crop normalization to 2:1 (logical 64x32 frame shape).
- Frame extraction at selected FPS and duration.
- Vertical-first packing:
  - top-to-bottom,
  - then next column,
  - then next page.
- Auto frame-size selection by frame count with max atlas page size constraints.
- Failure handling:
  - retryable errors stay queued/failed for retry,
  - terminal errors call refund path.

## Atomic billing/refund design
- Charge is performed only in server RPC (`commerce_create_animated_cape_order`) with wallet row lock.
- Client never sends trusted price.
- Ledger rows include idempotency keys to prevent duplicate debits/refunds.
- Refund RPC (`commerce_refund_animated_cape_order`) credits wallet + appends refund ledger atomically.

## API contracts
### User-facing (bearer token required)
- `POST /animated-cape/upload-url`
  - body: `{ file_name, content_type, media_type }`
- `POST /animated-cape/register-upload`
  - body: `{ media_type, storage_path, original_file_name, content_type, file_size_bytes, source_duration_ms?, source_width?, source_height? }`
- `POST /animated-cape/order`
  - body: `{ upload_media_id, selected_fps, selected_duration_seconds, idempotency_key, crop_x, crop_y, crop_w, crop_h }`
- `GET /animated-cape/orders?limit=60`
- `GET /animated-cape/orders/:id`

### Worker-only (secret header `x-bloom-worker-secret`)
- `POST /animated-cape/worker/claim`
  - body: `{ worker_id, lease_seconds }`
- `POST /animated-cape/worker/complete`
  - body includes manifest/path/frame/atlas metadata.
- `POST /animated-cape/worker/fail`
  - body: `{ order_id, error_code, error_message, retryable, refund }`

## In-game renderer integration contract
For Bloom Cosmetics runtime:
1. Resolve equipped cape runtime from `v_commerce_equipped_cape_runtime` by player UUID.
2. If animated fields exist (`manifest_storage_path`, `atlas_pages`), fetch `manifest.json`.
3. Preload atlas page textures asynchronously.
4. Step frames by game time using `durationMs`.
5. Bind current frame UV rect from `{page,x,y,w,h}`.
6. Invalidate cached runtime when equipped cape or asset version changes.

Important:
- Never decode GIF in game.
- Use processed atlas+manifest only.
- Keep texture registration off render hot-path; upload once and reuse.

## Local setup
1. Apply migration:
   - `supabase/migrations/20260331193000_animated_cape_studio.sql`
2. Deploy edge function:
   - `supabase/functions/main/index.ts`
3. Set edge env:
   - `ANIMATED_CAPE_WORKER_SECRET`
4. Run worker:
   - `cd workers/animated-cape`
   - copy `.env.example` to `.env`
   - `npm install`
   - `npm run dev`
5. Run client:
   - `npm run dev`
   - open `/animated-cape-studio`
