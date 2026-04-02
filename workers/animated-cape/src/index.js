import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import sharp from 'sharp';
import { createClient } from '@supabase/supabase-js';

const env = {
  supabaseUrl: process.env.SUPABASE_URL || '',
  serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  edgeBase: (process.env.BLOOM_MAIN_EDGE_URL || '').replace(/\/+$/, ''),
  workerSecret: process.env.ANIMATED_CAPE_WORKER_SECRET || '',
  pollMs: Number(process.env.POLL_INTERVAL_MS || 2500),
  leaseSeconds: Number(process.env.CLAIM_LEASE_SECONDS || 300),
  maxPagesTarget: Number(process.env.MAX_PAGES_TARGET || 4),
  tmpDir: process.env.TMP_DIR || path.join(os.tmpdir(), 'bloom-animated-cape')
};

if (!env.supabaseUrl || !env.serviceKey || !env.edgeBase || !env.workerSecret) {
  console.error('[ANIM_WORKER] Missing required env.');
  process.exit(1);
}

const supabase = createClient(env.supabaseUrl, env.serviceKey, { auth: { persistSession: false } });
const workerId = `worker-${os.hostname()}-${process.pid}`;

const FRAME_CANDIDATES = [
  { w: 512, h: 256 },
  { w: 384, h: 192 },
  { w: 256, h: 128 },
  { w: 192, h: 96 },
  { w: 128, h: 64 },
  { w: 64, h: 32 }
];
const PAGE_W = 4096;
const PAGE_H = 2048;

function run(cmd, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => { out += d.toString(); });
    child.stderr.on('data', (d) => { err += d.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve({ out, err });
      else reject(new Error(`${cmd} exited ${code}: ${err || out}`));
    });
  });
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

async function claimJob() {
  const res = await fetch(`${env.edgeBase}/animated-cape/worker/claim`, {
    method: 'POST',
    headers: {
      'x-bloom-worker-secret': env.workerSecret,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ worker_id: workerId, lease_seconds: env.leaseSeconds })
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`claim_failed:${res.status}:${json?.error || 'unknown'}`);
  return json.job || null;
}

async function edgeComplete(payload) {
  const res = await fetch(`${env.edgeBase}/animated-cape/worker/complete`, {
    method: 'POST',
    headers: {
      'x-bloom-worker-secret': env.workerSecret,
      'content-type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`complete_failed:${res.status}:${json?.error || 'unknown'}:${json?.message || ''}`);
  return json;
}

async function edgeFail(orderId, errorCode, errorMessage, retryable = false, refund = true) {
  const res = await fetch(`${env.edgeBase}/animated-cape/worker/fail`, {
    method: 'POST',
    headers: {
      'x-bloom-worker-secret': env.workerSecret,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      order_id: orderId,
      worker_id: workerId,
      error_code: errorCode,
      error_message: errorMessage,
      retryable,
      refund
    })
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`fail_failed:${res.status}:${json?.error || 'unknown'}:${json?.message || ''}`);
  return json;
}

async function getOrder(orderId) {
  const { data, error } = await supabase
    .from('v_commerce_animated_cape_orders')
    .select('*')
    .eq('id', orderId)
    .maybeSingle();
  if (error || !data) throw new Error(`order_fetch_failed:${error?.message || 'not_found'}`);
  return data;
}

async function downloadSource(storagePath, outPath) {
  const { data, error } = await supabase.storage.from('animated-cape-uploads').download(storagePath);
  if (error || !data) throw new Error(`download_source_failed:${error?.message || 'unknown'}`);
  const buf = Buffer.from(await data.arrayBuffer());
  await fs.writeFile(outPath, buf);
}

async function ffprobeMeta(inputPath) {
  const { out } = await run('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', inputPath]);
  const parsed = JSON.parse(out);
  const video = (parsed.streams || []).find((s) => s.codec_type === 'video') || parsed.streams?.[0] || {};
  const width = Number(video.width || 0);
  const height = Number(video.height || 0);
  const formatDur = Number(parsed.format?.duration || 0);
  const streamDur = Number(video.duration || 0);
  const duration = Number.isFinite(streamDur) && streamDur > 0 ? streamDur : formatDur;
  return { width, height, durationSeconds: duration > 0 ? duration : 0 };
}

function chooseFrameSize(frameCount) {
  for (const c of FRAME_CANDIDATES) {
    const rows = Math.floor(PAGE_H / c.h);
    const cols = Math.floor(PAGE_W / c.w);
    const capacity = Math.max(1, rows * cols);
    const pages = Math.ceil(frameCount / capacity);
    if (pages <= env.maxPagesTarget) return { ...c, pages, rows, cols, capacity };
  }
  const c = FRAME_CANDIDATES[FRAME_CANDIDATES.length - 1];
  const rows = Math.floor(PAGE_H / c.h);
  const cols = Math.floor(PAGE_W / c.w);
  const capacity = Math.max(1, rows * cols);
  const pages = Math.ceil(frameCount / capacity);
  return { ...c, pages, rows, cols, capacity };
}

function buildFilter({ srcW, srcH, crop, outW, outH }) {
  const cx = clamp(Number(crop?.crop_x ?? crop?.cropX ?? crop?.x ?? 0), 0, 1);
  const cy = clamp(Number(crop?.crop_y ?? crop?.cropY ?? crop?.y ?? 0), 0, 1);
  const cw = clamp(Number(crop?.crop_w ?? crop?.cropW ?? crop?.w ?? 1), 0.01, 1);
  const ch = clamp(Number(crop?.crop_h ?? crop?.cropH ?? crop?.h ?? 1), 0.01, 1);

  const targetRatio = 1 / 2;
  const regionW = Math.max(2, Math.floor(srcW * cw));
  const regionH = Math.max(2, Math.floor(srcH * ch));
  const regionX = Math.floor(clamp(srcW * cx, 0, Math.max(0, srcW - regionW)));
  const regionY = Math.floor(clamp(srcH * cy, 0, Math.max(0, srcH - regionH)));

  let cropW = regionW;
  let cropH = regionH;
  if (cropW / cropH > targetRatio) cropW = Math.floor(cropH * targetRatio);
  else cropH = Math.floor(cropW / targetRatio);
  cropW = Math.max(2, cropW);
  cropH = Math.max(2, cropH);

  const cropX = regionX + Math.floor((regionW - cropW) / 2);
  const cropY = regionY + Math.floor((regionH - cropH) / 2);
  return `crop=${cropW}:${cropH}:${cropX}:${cropY},scale=${outW}:${outH}:flags=lanczos`;
}

async function extractFrames({ inputPath, outDir, fps, durationSeconds, crop, srcW, srcH, outW, outH }) {
  await ensureDir(outDir);
  const vf = buildFilter({ srcW, srcH, crop, outW, outH });
  await run('ffmpeg', [
    '-y',
    '-i', inputPath,
    '-t', String(durationSeconds),
    '-vf', `${vf},fps=${fps}`,
    '-vsync', '0',
    path.join(outDir, 'frame_%05d.png')
  ]);
  const files = (await fs.readdir(outDir))
    .filter((f) => f.startsWith('frame_') && f.endsWith('.png'))
    .sort();
  if (!files.length) throw new Error('no_frames_extracted');
  return files.map((f) => path.join(outDir, f));
}

async function buildAtlases(framePaths, outDir, fps, frameW, frameH) {
  await ensureDir(outDir);
  const packed = chooseFrameSize(framePaths.length);
  const atlasPages = [];
  const frames = [];

  for (let p = 0; p < packed.pages; p += 1) {
    const pageImage = sharp({
      create: { width: PAGE_W, height: PAGE_H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
    });
    const composites = [];

    for (let i = 0; i < packed.capacity; i += 1) {
      const frameIndex = p * packed.capacity + i;
      if (frameIndex >= framePaths.length) break;
      const row = i % packed.rows;
      const col = Math.floor(i / packed.rows);
      const x = col * packed.w;
      const y = row * packed.h;

      const frameBuffer = await sharp(framePaths[frameIndex])
        .resize({ width: packed.w, height: packed.h, fit: 'fill' })
        .png()
        .toBuffer();

      composites.push({ input: frameBuffer, left: x, top: y });
      frames.push({
        index: frameIndex,
        page: p,
        x,
        y,
        w: packed.w,
        h: packed.h,
        durationMs: Math.round(1000 / Math.max(1, fps))
      });
    }

    const pagePath = path.join(outDir, `page_${p}.png`);
    await pageImage.composite(composites).png().toFile(pagePath);
    atlasPages.push({ pageIndex: p, path: pagePath, width: PAGE_W, height: PAGE_H });
  }

  return {
    frameWidth: packed.w,
    frameHeight: packed.h,
    atlasPages,
    frames
  };
}

async function uploadFile(bucket, storagePath, localPath, contentType) {
  const body = await fs.readFile(localPath);
  const { error } = await supabase.storage.from(bucket).upload(storagePath, body, { contentType, upsert: true });
  if (error) throw new Error(`upload_failed:${storagePath}:${error.message}`);
}

function publicUrl(bucket, storagePath) {
  return supabase.storage.from(bucket).getPublicUrl(storagePath).data.publicUrl;
}

async function processJob(job) {
  const orderId = job.order_id;
  const order = await getOrder(orderId);
  const workDir = path.join(env.tmpDir, orderId);
  const srcPath = path.join(workDir, `source.${order.source_type === 'gif' ? 'gif' : 'mp4'}`);
  const framesDir = path.join(workDir, 'frames');
  const outDir = path.join(workDir, 'out');
  await ensureDir(workDir);

  try {
    console.log('[ANIM_WORKER] processing', orderId);
    await downloadSource(order.source_storage_path, srcPath);
    const probe = await ffprobeMeta(srcPath);
    const duration = Math.max(0.2, Math.min(Number(order.selected_duration_seconds || 3), probe.durationSeconds || Number(order.selected_duration_seconds || 3)));

    const frameCount = Math.max(1, Math.floor(duration * Number(order.selected_fps || 12)));
    const frameSizeGuess = chooseFrameSize(frameCount);

    const framePaths = await extractFrames({
      inputPath: srcPath,
      outDir: framesDir,
      fps: Number(order.selected_fps || 12),
      durationSeconds: duration,
      crop: {
        crop_x: order.crop_x,
        crop_y: order.crop_y,
        crop_w: order.crop_w,
        crop_h: order.crop_h
      },
      srcW: Math.max(2, probe.width || 1920),
      srcH: Math.max(2, probe.height || 1080),
      outW: frameSizeGuess.w,
      outH: frameSizeGuess.h
    });

    const packed = await buildAtlases(framePaths, outDir, Number(order.selected_fps || 12), frameSizeGuess.w, frameSizeGuess.h);

    const manifestStoragePath = `animated-capes/${order.user_id}/${orderId}/manifest.json`;
    const thumbnailStoragePath = `animated-capes/${order.user_id}/${orderId}/thumb.png`;
    const previewStoragePath = `animated-capes/${order.user_id}/${orderId}/preview.webp`;

    const atlasUploadEntries = [];
    for (const page of packed.atlasPages) {
      const storagePath = `animated-capes/${order.user_id}/${orderId}/page_${page.pageIndex}.png`;
      await uploadFile('animated-cape-processed', storagePath, page.path, 'image/png');
      atlasUploadEntries.push({ page_index: page.pageIndex, storage_path: storagePath, width: page.width, height: page.height });
    }

    const thumbLocal = path.join(outDir, 'thumb.png');
    await sharp(framePaths[0]).resize({ width: packed.frameWidth, height: packed.frameHeight, fit: 'fill' }).png().toFile(thumbLocal);
    await uploadFile('animated-cape-processed', thumbnailStoragePath, thumbLocal, 'image/png');

    const previewLocal = path.join(outDir, 'preview.webp');
    await sharp(framePaths[0]).resize({ width: packed.frameWidth, height: packed.frameHeight, fit: 'fill' }).webp({ quality: 88 }).toFile(previewLocal);
    await uploadFile('animated-cape-processed', previewStoragePath, previewLocal, 'image/webp');

    const manifest = {
      version: 1,
      cosmeticType: 'cape',
      atlasPages: atlasUploadEntries.map((p) => ({ path: p.storage_path, width: p.width, height: p.height })),
      frameWidth: packed.frameWidth,
      frameHeight: packed.frameHeight,
      fps: Number(order.selected_fps || 12),
      durationSeconds: Number(duration.toFixed(3)),
      frameCount: packed.frames.length,
      loopMode: 'repeat',
      frames: packed.frames
    };

    const manifestLocal = path.join(outDir, 'manifest.json');
    await fs.writeFile(manifestLocal, JSON.stringify(manifest, null, 2), 'utf8');
    await uploadFile('animated-cape-processed', manifestStoragePath, manifestLocal, 'application/json');

    await edgeComplete({
      order_id: orderId,
      worker_id: workerId,
      manifest_storage_path: manifestStoragePath,
      thumbnail_storage_path: thumbnailStoragePath,
      preview_storage_path: previewStoragePath,
      manifest,
      frame_width: packed.frameWidth,
      frame_height: packed.frameHeight,
      frame_count: packed.frames.length,
      atlas_page_count: atlasUploadEntries.length,
      atlas_pages: atlasUploadEntries,
      thumbnail_url: publicUrl('animated-cape-processed', thumbnailStoragePath),
      preview_url: publicUrl('animated-cape-processed', previewStoragePath),
      name: order.cosmetic_name || 'Animated Cape'
    });

    console.log('[ANIM_WORKER] completed', orderId, `frames=${packed.frames.length}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[ANIM_WORKER] failed', orderId, message);
    await edgeFail(orderId, 'worker_processing_error', message, false, true);
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function loop() {
  await ensureDir(env.tmpDir);
  console.log('[ANIM_WORKER] started', { workerId, edge: env.edgeBase });

  while (true) {
    try {
      const job = await claimJob();
      if (!job) {
        await new Promise((r) => setTimeout(r, env.pollMs));
        continue;
      }
      await processJob(job);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[ANIM_WORKER] loop error', msg);
      await new Promise((r) => setTimeout(r, env.pollMs));
    }
  }
}

loop().catch((err) => {
  console.error('[ANIM_WORKER] fatal', err);
  process.exit(1);
});
