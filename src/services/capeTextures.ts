import { resolveMinecraftCapeTemplate, type AtlasRegion } from './minecraftCapeLayout';

export type CapeTextureAsset = {
  cacheKey: string;
  slug: string;
  textureUrl: string;
  objectUrl: string;
  width: number;
  height: number;
  bytes: number;
  fromDiskCache: boolean;
  viaDirectUrl?: boolean;
  generatedAt: number;
};

const CAPE_CACHE_NAME = 'bloom-cape-textures-v2';
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47];

function keyFor(slug: string, textureUrl: string) {
  return `${slug.trim().toLowerCase()}::${textureUrl.trim()}`;
}

function logPrefix(slug: string) {
  return `[CapeTextureLoader] slug=${slug}`;
}

function makeCacheRequest(cacheKey: string) {
  return new Request(`https://bloom.local/cape-cache/${encodeURIComponent(cacheKey)}`);
}

function hasPngSignature(bytes: Uint8Array) {
  if (bytes.length < PNG_SIGNATURE.length) return false;
  for (let i = 0; i < PNG_SIGNATURE.length; i += 1) {
    if (bytes[i] !== PNG_SIGNATURE[i]) return false;
  }
  return true;
}

function plausibleCapeDimensions(width: number, height: number) {
  if (width < 16 || height < 16) return false;
  if (width > 4096 || height > 4096) return false;
  return true;
}

async function getDiskCache() {
  if (typeof caches === 'undefined') return null;
  try {
    return await caches.open(CAPE_CACHE_NAME);
  } catch {
    return null;
  }
}

function createCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function drawContain(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  target: AtlasRegion
) {
  const scale = Math.min(target.width / sourceWidth, target.height / sourceHeight);
  const drawWidth = Math.max(1, Math.round(sourceWidth * scale));
  const drawHeight = Math.max(1, Math.round(sourceHeight * scale));
  const drawX = Math.round(target.x + (target.width - drawWidth) / 2);
  const drawY = Math.round(target.y + (target.height - drawHeight) / 2);
  ctx.drawImage(source, 0, 0, sourceWidth, sourceHeight, drawX, drawY, drawWidth, drawHeight);
}

async function canvasToBlob(canvas: HTMLCanvasElement) {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png', 1));
  if (!blob) throw new Error('cape_canvas_encode_failed');
  return blob;
}

async function blobToBitmap(blob: Blob): Promise<ImageBitmap> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(blob);
    } catch {
      // continue to image decode fallback
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('image_decode_failed'));
    });
    if (typeof createImageBitmap === 'function') {
      const canvas = createCanvas(image.naturalWidth || image.width, image.naturalHeight || image.height);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('canvas_context_unavailable');
      ctx.drawImage(image, 0, 0);
      return createImageBitmap(canvas);
    }
    throw new Error('image_bitmap_unavailable');
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function normalizeCapeBlob(slug: string, blob: Blob) {
  const bitmap = await blobToBitmap(blob);
  try {
    const width = bitmap.width;
    const height = bitmap.height;
    if (width <= 0 || height <= 0) {
      throw new Error('invalid_dimensions');
    }
    if (width === height * 2) {
      const canvas = createCanvas(width, width);
      const ctx = canvas.getContext('2d', { alpha: true });
      if (!ctx) throw new Error('cape_normalize_context_unavailable');
      ctx.clearRect(0, 0, width, width);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(bitmap, 0, 0, width, height, 0, 0, width, height);
      const normalizedBlob = await canvasToBlob(canvas);
      console.debug(`${logPrefix(slug)} normalized_legacy_atlas from=${width}x${height} to=${width}x${width}`);
      return {
        blob: normalizedBlob,
        width,
        height: width,
        normalized: true
      };
    }

    if (width !== height) {
      const targetSize = Math.max(64, Math.min(4096, Math.ceil(Math.max(width, height) / 64) * 64));
      const canvas = createCanvas(targetSize, targetSize);
      const ctx = canvas.getContext('2d', { alpha: true });
      if (!ctx) throw new Error('cape_square_context_unavailable');
      ctx.clearRect(0, 0, targetSize, targetSize);
      ctx.imageSmoothingEnabled = false;

      const template = resolveMinecraftCapeTemplate(targetSize, targetSize);
      drawContain(ctx, bitmap, width, height, template.front);
      drawContain(ctx, bitmap, width, height, template.back);

      const squareBlob = await canvasToBlob(canvas);
      console.debug(`${logPrefix(slug)} normalized_face_art from=${width}x${height} to=${targetSize}x${targetSize}`);
      return {
        blob: squareBlob,
        width: targetSize,
        height: targetSize,
        normalized: true
      };
    }

    return {
      blob,
      width,
      height,
      normalized: false
    };
  } finally {
    bitmap.close();
  }
}

class CapeTextureLoader {
  private memory = new Map<string, CapeTextureAsset>();
  private inflight = new Map<string, Promise<CapeTextureAsset>>();

  private async readFromDisk(cacheKey: string) {
    const cache = await getDiskCache();
    if (!cache) return null;
    try {
      const response = await cache.match(makeCacheRequest(cacheKey));
      if (!response) return null;
      return await response.blob();
    } catch {
      return null;
    }
  }

  private async writeToDisk(cacheKey: string, blob: Blob) {
    const cache = await getDiskCache();
    if (!cache) return;
    try {
      await cache.put(makeCacheRequest(cacheKey), new Response(blob, { headers: { 'content-type': 'image/png' } }));
    } catch {
      // best effort only
    }
  }

  private async fetchRemote(slug: string, textureUrl: string) {
    const started = performance.now();
    let response: Response;
    try {
      response = await fetch(textureUrl, { method: 'GET', cache: 'force-cache' });
    } catch (error) {
      console.error(`${logPrefix(slug)} fetch_exception reason=${error instanceof Error ? error.message : String(error)} url=${textureUrl}`);
      throw error;
    }
    const status = response.status;
    if (!response.ok) {
      console.error(`${logPrefix(slug)} fetch_failed status=${status} url=${textureUrl}`);
      throw new Error(`http_${status}`);
    }

    const blob = await response.blob();
    const bodyBytes = new Uint8Array(await blob.arrayBuffer());
    const bytes = bodyBytes.byteLength;
    if (!hasPngSignature(bodyBytes)) {
      console.error(`${logPrefix(slug)} non_png_payload status=${status} bytes=${bytes} url=${textureUrl}`);
      throw new Error('not_png');
    }

    const normalized = await normalizeCapeBlob(slug, blob);
    const width = normalized.width;
    const height = normalized.height;
    if (!plausibleCapeDimensions(width, height)) {
      console.error(`${logPrefix(slug)} invalid_dimensions=${width}x${height} status=${status} bytes=${bytes} url=${textureUrl}`);
      throw new Error('invalid_dimensions');
    }

    console.debug(
      `${logPrefix(slug)} cache_miss status=${status} bytes=${bytes} decoded=${width}x${height} ms=${Math.round(performance.now() - started)} url=${textureUrl}`
    );
    return normalized.blob;
  }

  async loadFull(slug: string, textureUrl: string): Promise<CapeTextureAsset> {
    const cacheKey = keyFor(slug, textureUrl);
    const memory = this.memory.get(cacheKey);
    if (memory) {
      console.debug(`${logPrefix(slug)} full_cache_hit memory url=${textureUrl}`);
      return memory;
    }

    const pending = this.inflight.get(cacheKey);
    if (pending) return pending;

    const promise = (async () => {
      let fromDiskCache = false;
      let sourceBlob: Blob | null = null;
      let viaDirectUrl = false;

      try {
        sourceBlob = await this.readFromDisk(cacheKey);
        if (sourceBlob) {
          fromDiskCache = true;
          console.debug(`${logPrefix(slug)} full_cache_hit disk bytes=${sourceBlob.size} url=${textureUrl}`);
        } else {
          sourceBlob = await this.fetchRemote(slug, textureUrl);
          await this.writeToDisk(cacheKey, sourceBlob);
        }
      } catch (error) {
        console.error(
          `${logPrefix(slug)} full_fetch_or_decode_failed reason=${error instanceof Error ? error.message : String(error)} url=${textureUrl}`
        );
        viaDirectUrl = true;
      }

      let width = 64;
      let height = 32;
      let bytes = 0;
      let objectUrl = textureUrl;
      if (sourceBlob) {
        const bitmap = await blobToBitmap(sourceBlob);
        width = bitmap.width;
        height = bitmap.height;
        bitmap.close();
        bytes = sourceBlob.size;
        objectUrl = URL.createObjectURL(sourceBlob);
      }

      const asset: CapeTextureAsset = {
        cacheKey,
        slug,
        textureUrl,
        objectUrl,
        width,
        height,
        bytes,
        fromDiskCache,
        viaDirectUrl,
        generatedAt: Date.now()
      };
      this.memory.set(cacheKey, asset);
      console.debug(
        `${logPrefix(slug)} full_registered width=${width} height=${height} bytes=${bytes} from_disk=${fromDiskCache} direct_url=${viaDirectUrl} url=${textureUrl}`
      );
      return asset;
    })()
      .catch((error) => {
        console.error(`${logPrefix(slug)} full_load_failed reason=${error instanceof Error ? error.message : String(error)} url=${textureUrl}`);
        throw error;
      })
      .finally(() => {
        this.inflight.delete(cacheKey);
      });

    this.inflight.set(cacheKey, promise);
    return promise;
  }
}

export const capeTextureLoader = new CapeTextureLoader();
