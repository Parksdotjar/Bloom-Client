import { getProcessedCapePublicUrl, loadAnimatedCapeManifestFromStoragePath } from './animatedCapeStudio';
import type { AnimatedCapeManifest as RuntimeManifest, AnimatedCapeManifestFrame as RuntimeManifestFrame } from '../types/animatedCapeManifest';

export type AnimatedCapeAtlasPage = {
  path: string;
  width: number;
  height: number;
  image: HTMLImageElement;
  url: string;
};

export type AnimatedCapeFrameSample = {
  frame: RuntimeManifestFrame;
  page: AnimatedCapeAtlasPage;
};

function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.decoding = 'async';
  image.crossOrigin = 'anonymous';
  image.src = url;
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error(`atlas_page_load_failed:${url}`));
  });
  return image;
}

function normalizeManifest(manifest: RuntimeManifest): RuntimeManifest {
  const frameCount = Math.max(1, Number(manifest.frameCount) || manifest.frames.length || 1);
  const fps = clampNumber(Number(manifest.fps) || 12, 1, 120);
  const frames = (manifest.frames ?? [])
    .map((frame, index) => ({
      index: Number(frame.index ?? index),
      page: Math.max(0, Number(frame.page ?? 0)),
      x: Math.max(0, Number(frame.x ?? 0)),
      y: Math.max(0, Number(frame.y ?? 0)),
      w: Math.max(1, Number(frame.w ?? manifest.frameWidth ?? 64)),
      h: Math.max(1, Number(frame.h ?? manifest.frameHeight ?? 32)),
      durationMs: Math.max(1, Number(frame.durationMs ?? Math.round(1000 / fps)))
    }))
    .slice(0, frameCount);

  return {
    version: 1,
    cosmeticType: 'cape',
    atlasPages: (manifest.atlasPages ?? []).map((page) => ({
      path: String(page.path),
      width: Math.max(1, Number(page.width || 1)),
      height: Math.max(1, Number(page.height || 1))
    })),
    frameWidth: Math.max(1, Number(manifest.frameWidth || 64)),
    frameHeight: Math.max(1, Number(manifest.frameHeight || 32)),
    fps,
    durationSeconds: Math.max(1, Number(manifest.durationSeconds || Math.ceil(frameCount / fps))),
    frameCount,
    loopMode: manifest.loopMode === 'once' ? 'once' : 'repeat',
    frames
  };
}

export class AnimatedCapeRuntime {
  readonly manifest: RuntimeManifest;
  readonly pages: AnimatedCapeAtlasPage[];
  readonly totalDurationMs: number;

  private constructor(manifest: RuntimeManifest, pages: AnimatedCapeAtlasPage[]) {
    this.manifest = manifest;
    this.pages = pages;
    this.totalDurationMs = Math.max(1, this.manifest.frames.reduce((sum, frame) => sum + frame.durationMs, 0));
  }

  static async fromManifest(manifest: RuntimeManifest, resolveUrl: (path: string) => string): Promise<AnimatedCapeRuntime> {
    const normalized = normalizeManifest(manifest);
    const pages = await Promise.all(
      normalized.atlasPages.map(async (descriptor) => {
        const url = resolveUrl(descriptor.path);
        const image = await loadImage(url);
        return {
          ...descriptor,
          image,
          url
        };
      })
    );
    return new AnimatedCapeRuntime(normalized, pages);
  }

  static async fromManifestStoragePath(storagePath: string): Promise<AnimatedCapeRuntime> {
    const manifest = await loadAnimatedCapeManifestFromStoragePath(storagePath);
    return AnimatedCapeRuntime.fromManifest(manifest, (path) => getProcessedCapePublicUrl(path));
  }

  getFrameAtTime(elapsedMs: number): AnimatedCapeFrameSample | null {
    if (!this.manifest.frames.length || !this.pages.length) return null;
    const loopedMs = this.manifest.loopMode === 'once'
      ? clampNumber(elapsedMs, 0, this.totalDurationMs - 1)
      : ((elapsedMs % this.totalDurationMs) + this.totalDurationMs) % this.totalDurationMs;

    let cursor = 0;
    for (const frame of this.manifest.frames) {
      cursor += frame.durationMs;
      if (loopedMs < cursor) {
        const page = this.pages[frame.page] ?? this.pages[0];
        return { frame, page };
      }
    }

    const fallback = this.manifest.frames[this.manifest.frames.length - 1];
    const fallbackPage = this.pages[fallback.page] ?? this.pages[0];
    return { frame: fallback, page: fallbackPage };
  }

  drawFrame2D(
    ctx: CanvasRenderingContext2D,
    elapsedMs: number,
    dx: number,
    dy: number,
    dw: number,
    dh: number
  ) {
    const sample = this.getFrameAtTime(elapsedMs);
    if (!sample) return;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      sample.page.image,
      sample.frame.x,
      sample.frame.y,
      sample.frame.w,
      sample.frame.h,
      dx,
      dy,
      dw,
      dh
    );
  }

  drawFrameToCanvas(canvas: HTMLCanvasElement, elapsedMs: number) {
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    this.drawFrame2D(ctx, elapsedMs, 0, 0, canvas.width, canvas.height);
  }
}

export async function renderAnimatedCapeFrameToObjectUrl(
  runtime: AnimatedCapeRuntime,
  elapsedMs: number,
  width = runtime.manifest.frameWidth,
  height = runtime.manifest.frameHeight
): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, width);
  canvas.height = Math.max(1, height);
  runtime.drawFrameToCanvas(canvas, elapsedMs);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png', 1));
  if (!blob) {
    throw new Error('frame_blob_encode_failed');
  }
  return URL.createObjectURL(blob);
}


