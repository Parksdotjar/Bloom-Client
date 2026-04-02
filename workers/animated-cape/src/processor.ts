import fs from 'node:fs/promises';
import path from 'node:path';
import {
  chooseFrameSize,
  makeThumbnail,
  packFramesVerticalFirst,
  renderAtlasPages
} from './atlas.js';
import { workerConfig } from './config.js';
import { ensureDir, extractFrames, makePreviewWebp, probeMedia, removeDir } from './ffmpeg.js';
import { logger } from './logger.js';
import {
  downloadSourceMedia,
  fetchAnimatedCapeOrder,
  getProcessedPublicUrl,
  uploadProcessedFile
} from './supabaseClient.js';
import { WorkerError, type AnimatedCapeManifest, type CropRect, type ProcessedOrderResult } from './types.js';

const TARGET_CAPE_ASPECT = 2; // 64x32 logical ratio

function isValidTier(fps: number, durationSeconds: number) {
  if (![12, 15, 24].includes(fps)) return false;
  if (![3, 4, 5].includes(durationSeconds)) return false;
  if (fps === 24 && durationSeconds !== 3) return false;
  return true;
}

function toEven(value: number, min = 2) {
  const rounded = Math.max(min, Math.floor(value));
  return rounded % 2 === 0 ? rounded : rounded - 1;
}

function normalizeCropRect(args: {
  sourceWidth: number;
  sourceHeight: number;
  cropX: number | null;
  cropY: number | null;
  cropW: number | null;
  cropH: number | null;
}): CropRect {
  let x = 0;
  let y = 0;
  let width = args.sourceWidth;
  let height = args.sourceHeight;

  if (
    args.cropX !== null &&
    args.cropY !== null &&
    args.cropW !== null &&
    args.cropH !== null &&
    args.cropW > 0 &&
    args.cropH > 0
  ) {
    x = Math.max(0, Math.floor(args.cropX * args.sourceWidth));
    y = Math.max(0, Math.floor(args.cropY * args.sourceHeight));
    width = Math.max(1, Math.floor(args.cropW * args.sourceWidth));
    height = Math.max(1, Math.floor(args.cropH * args.sourceHeight));
  }

  if (x + width > args.sourceWidth) width = args.sourceWidth - x;
  if (y + height > args.sourceHeight) height = args.sourceHeight - y;

  const currentAspect = width / height;
  if (currentAspect > TARGET_CAPE_ASPECT) {
    const nextWidth = height * TARGET_CAPE_ASPECT;
    x += Math.floor((width - nextWidth) / 2);
    width = Math.floor(nextWidth);
  } else if (currentAspect < TARGET_CAPE_ASPECT) {
    const nextHeight = width / TARGET_CAPE_ASPECT;
    y += Math.floor((height - nextHeight) / 2);
    height = Math.floor(nextHeight);
  }

  width = toEven(Math.min(width, args.sourceWidth - x), 2);
  height = toEven(Math.min(height, args.sourceHeight - y), 2);
  x = Math.max(0, toEven(Math.min(x, args.sourceWidth - width), 0));
  y = Math.max(0, toEven(Math.min(y, args.sourceHeight - height), 0));

  if (width <= 0 || height <= 0) {
    throw new WorkerError('invalid_crop_rect', 'Computed crop rectangle is invalid.', false);
  }

  return { x, y, width, height };
}

function buildStoragePrefix(userId: string, orderId: string) {
  return `animated-capes/${userId}/${orderId}`;
}

function buildManifest(params: {
  frameWidth: number;
  frameHeight: number;
  fps: number;
  durationSeconds: number;
  pagePaths: Array<{ path: string; width: number; height: number }>;
  placements: Array<{ index: number; page: number; x: number; y: number; w: number; h: number; durationMs: number }>;
}): AnimatedCapeManifest {
  return {
    version: 1,
    cosmeticType: 'cape',
    atlasPages: params.pagePaths,
    frameWidth: params.frameWidth,
    frameHeight: params.frameHeight,
    fps: params.fps,
    durationSeconds: params.durationSeconds,
    frameCount: params.placements.length,
    loopMode: 'repeat',
    frames: params.placements.map((placement) => ({
      index: placement.index,
      page: placement.page,
      x: placement.x,
      y: placement.y,
      w: placement.w,
      h: placement.h,
      durationMs: placement.durationMs
    }))
  };
}

export async function processAnimatedCapeOrder(orderId: string): Promise<ProcessedOrderResult> {
  const order = await fetchAnimatedCapeOrder(orderId);
  if (!isValidTier(order.selected_fps, order.selected_duration_seconds)) {
    throw new WorkerError('invalid_fps_duration_tier', 'Selected FPS/duration tier is not allowed.', false);
  }

  const workRoot = path.join(workerConfig.tmpRoot, order.user_id, order.id);
  const sourcePath = path.join(workRoot, `source.${order.source_type === 'gif' ? 'gif' : 'mp4'}`);
  const framesDir = path.join(workRoot, 'frames');
  const atlasDir = path.join(workRoot, 'atlas');
  const outputDir = path.join(workRoot, 'output');

  await removeDir(workRoot);
  await ensureDir(workRoot);
  await ensureDir(framesDir);
  await ensureDir(atlasDir);
  await ensureDir(outputDir);

  try {
    logger.info('order_processing_started', {
      orderId: order.id,
      userId: order.user_id,
      sourceType: order.source_type,
      fps: order.selected_fps,
      durationSeconds: order.selected_duration_seconds
    });

    const sourceBuffer = await downloadSourceMedia(order.source_storage_path);
    await fs.writeFile(sourcePath, sourceBuffer);

    const metadata = await probeMedia(sourcePath);
    const cropRect = normalizeCropRect({
      sourceWidth: metadata.width,
      sourceHeight: metadata.height,
      cropX: order.crop_x,
      cropY: order.crop_y,
      cropW: order.crop_w,
      cropH: order.crop_h
    });

    if (metadata.durationSeconds + 0.02 < order.selected_duration_seconds) {
      throw new WorkerError(
        'source_duration_too_short',
        `Source media is shorter than selected tier duration (${order.selected_duration_seconds}s).`,
        false
      );
    }

    const targetDurationSeconds = order.selected_duration_seconds;
    const maxFrames = Math.max(1, Math.round(order.selected_fps * order.selected_duration_seconds));
    const frameSize = chooseFrameSize(maxFrames);

    logger.info('order_processing_stage', {
      orderId: order.id,
      stage: 'extract_frames',
      sourceWidth: metadata.width,
      sourceHeight: metadata.height,
      sourceDurationSeconds: metadata.durationSeconds,
      cropX: cropRect.x,
      cropY: cropRect.y,
      cropW: cropRect.width,
      cropH: cropRect.height,
      frameWidth: frameSize.frameWidth,
      frameHeight: frameSize.frameHeight,
      maxFrames
    });

    const extracted = await extractFrames({
      sourcePath,
      outputDir: framesDir,
      fps: order.selected_fps,
      durationSeconds: targetDurationSeconds,
      cropX: cropRect.x,
      cropY: cropRect.y,
      cropWidth: cropRect.width,
      cropHeight: cropRect.height,
      frameWidth: frameSize.frameWidth,
      frameHeight: frameSize.frameHeight,
      maxFrames
    });

    const frameDurationMs = Math.max(1, Math.round(1000 / Math.max(1, order.selected_fps)));
    const { placements, pageCount } = packFramesVerticalFirst(
      extracted,
      frameSize.frameWidth,
      frameSize.frameHeight,
      frameDurationMs
    );

    const renderedPages = await renderAtlasPages({
      placements,
      pageCount,
      outputDir: atlasDir
    });

    const thumbnailPath = path.join(outputDir, 'thumb.png');
    await makeThumbnail(extracted[0], thumbnailPath);

    const previewPath = path.join(outputDir, 'preview.webp');
    let previewExists = false;
    try {
      await makePreviewWebp({
        framesDir,
        fps: order.selected_fps,
        outputPath: previewPath,
        width: Math.max(256, Math.min(640, frameSize.frameWidth * 2))
      });
      previewExists = true;
    } catch (error) {
      logger.warn('preview_generation_failed', {
        orderId: order.id,
        message: error instanceof Error ? error.message : String(error)
      });
    }

    const storagePrefix = buildStoragePrefix(order.user_id, order.id);
    const atlasPages: Array<{ page_index: number; storage_path: string; width: number; height: number }> = [];

    for (const page of renderedPages) {
      const storagePath = `${storagePrefix}/page_${page.pageIndex}.png`;
      const data = await fs.readFile(page.filePath);
      await uploadProcessedFile(storagePath, data, 'image/png');
      atlasPages.push({
        page_index: page.pageIndex,
        storage_path: storagePath,
        width: page.width,
        height: page.height
      });
    }

    const thumbnailStoragePath = `${storagePrefix}/thumb.png`;
    const thumbnailBuffer = await fs.readFile(thumbnailPath);
    await uploadProcessedFile(thumbnailStoragePath, thumbnailBuffer, 'image/png');

    let previewStoragePath: string | null = null;
    if (previewExists) {
      previewStoragePath = `${storagePrefix}/preview.webp`;
      const previewBuffer = await fs.readFile(previewPath);
      await uploadProcessedFile(previewStoragePath, previewBuffer, 'image/webp');
    }

    const manifestStoragePath = `${storagePrefix}/manifest.json`;
    const manifest = buildManifest({
      frameWidth: frameSize.frameWidth,
      frameHeight: frameSize.frameHeight,
      fps: order.selected_fps,
      durationSeconds: order.selected_duration_seconds,
      pagePaths: atlasPages.map((page) => ({
        path: page.storage_path,
        width: page.width,
        height: page.height
      })),
      placements
    });
    const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2), 'utf8');
    await uploadProcessedFile(manifestStoragePath, manifestBytes, 'application/json');

    logger.info('order_processing_completed', {
      orderId: order.id,
      frameCount: manifest.frameCount,
      atlasPageCount: atlasPages.length,
      frameWidth: frameSize.frameWidth,
      frameHeight: frameSize.frameHeight
    });

    return {
      manifestStoragePath,
      thumbnailStoragePath,
      previewStoragePath,
      frameWidth: frameSize.frameWidth,
      frameHeight: frameSize.frameHeight,
      frameCount: manifest.frameCount,
      atlasPageCount: atlasPages.length,
      atlasPages,
      manifest,
      thumbnailUrl: getProcessedPublicUrl(thumbnailStoragePath),
      previewUrl: previewStoragePath ? getProcessedPublicUrl(previewStoragePath) : null
    };
  } finally {
    await removeDir(workRoot);
  }
}
