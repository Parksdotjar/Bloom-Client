import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { WorkerError, type FramePlacement } from './types.js';
import { ensureDir } from './ffmpeg.js';

export const ATLAS_PAGE_WIDTH = 4096;
export const ATLAS_PAGE_HEIGHT = 2048;

export function chooseFrameSize(frameCount: number) {
  const candidates = [1024, 896, 768, 640, 512, 384, 320, 256, 192, 160, 128, 96, 64];
  for (const width of candidates) {
    const height = Math.max(32, Math.round(width / 2));
    const cols = Math.floor(ATLAS_PAGE_WIDTH / width);
    const rows = Math.floor(ATLAS_PAGE_HEIGHT / height);
    const perPage = cols * rows;
    if (perPage <= 0) continue;
    const pages = Math.ceil(frameCount / perPage);
    if (pages <= 3) {
      return { frameWidth: width, frameHeight: height };
    }
  }
  return { frameWidth: 64, frameHeight: 32 };
}

export function packFramesVerticalFirst(framePaths: string[], frameWidth: number, frameHeight: number, frameDurationMs: number) {
  if (frameWidth <= 0 || frameHeight <= 0) {
    throw new WorkerError('invalid_frame_dimensions', 'Frame dimensions must be positive.', false);
  }
  const placements: FramePlacement[] = [];
  let page = 0;
  let x = 0;
  let y = 0;

  for (let index = 0; index < framePaths.length; index += 1) {
    if (y + frameHeight > ATLAS_PAGE_HEIGHT) {
      y = 0;
      x += frameWidth;
    }
    if (x + frameWidth > ATLAS_PAGE_WIDTH) {
      page += 1;
      x = 0;
      y = 0;
    }

    placements.push({
      index,
      framePath: framePaths[index],
      page,
      x,
      y,
      w: frameWidth,
      h: frameHeight,
      durationMs: frameDurationMs
    });

    y += frameHeight;
  }

  const pages = placements.reduce((maxPage, frame) => Math.max(maxPage, frame.page), 0) + 1;
  return { placements, pageCount: pages };
}

export async function renderAtlasPages(params: {
  placements: FramePlacement[];
  pageCount: number;
  outputDir: string;
}) {
  await ensureDir(params.outputDir);
  const outputs: Array<{ pageIndex: number; filePath: string; width: number; height: number }> = [];

  for (let pageIndex = 0; pageIndex < params.pageCount; pageIndex += 1) {
    const pageFrames = params.placements.filter((frame) => frame.page === pageIndex);
    const filePath = path.join(params.outputDir, `page_${pageIndex}.png`);
    const image = sharp({
      create: {
        width: ATLAS_PAGE_WIDTH,
        height: ATLAS_PAGE_HEIGHT,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      }
    });

    const composites = await Promise.all(
      pageFrames.map(async (frame) => ({
        input: await fs.readFile(frame.framePath),
        left: frame.x,
        top: frame.y
      }))
    );

    await image.composite(composites).png({ compressionLevel: 9 }).toFile(filePath);
    outputs.push({
      pageIndex,
      filePath,
      width: ATLAS_PAGE_WIDTH,
      height: ATLAS_PAGE_HEIGHT
    });
  }

  return outputs;
}

export async function makeThumbnail(firstFramePath: string, outputPath: string) {
  await sharp(firstFramePath)
    .resize({
      width: 320,
      height: 160,
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      kernel: sharp.kernel.nearest
    })
    .png({ compressionLevel: 9 })
    .toFile(outputPath);
}
