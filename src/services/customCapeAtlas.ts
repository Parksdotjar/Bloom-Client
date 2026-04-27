import {
  resolveMinecraftCapeTemplate,
  type AtlasRegion
} from './minecraftCapeLayout';

export const CUSTOM_CAPE_EXPORT_PRESETS = [64, 128, 256, 512, 1024, 2048, 4096] as const;

export type CustomCapeExportWidth = (typeof CUSTOM_CAPE_EXPORT_PRESETS)[number];

export type NormalizedCrop = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type GenerateCustomCapeAtlasInput = {
  image: CanvasImageSource;
  sourceWidth: number;
  sourceHeight: number;
  crop: NormalizedCrop;
  exportWidth: number;
  watermarkText?: string | null;
};

export type GeneratedCapeAtlas = {
  blob: Blob;
  width: number;
  height: number;
  visibleFaceBlob: Blob;
  visibleFaceWidth: number;
  visibleFaceHeight: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function clampCrop(crop: NormalizedCrop): NormalizedCrop {
  const width = clamp(crop.width, 0.01, 1);
  const height = clamp(crop.height, 0.01, 1);
  const x = clamp(crop.x, 0, 1 - width);
  const y = clamp(crop.y, 0, 1 - height);
  return { x, y, width, height };
}

function normalizeExportWidth(value: number) {
  const bounded = clamp(Math.round(value), 64, 4096);
  const snapped = Math.max(64, Math.floor(bounded / 64) * 64);
  return snapped;
}

function createCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

async function canvasToBlob(canvas: HTMLCanvasElement) {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png', 1));
  if (!blob) throw new Error('atlas_blob_encode_failed');
  return blob;
}

function drawWatermark(
  ctx: CanvasRenderingContext2D,
  text: string,
  region: AtlasRegion
) {
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.translate(region.x + region.width / 2, region.y + region.height / 2);
  ctx.rotate((-32 * Math.PI) / 180);
  const fontSize = Math.max(8, Math.floor(region.height * 0.13));
  ctx.font = `900 ${fontSize}px Inter, Manrope, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.lineWidth = Math.max(1, Math.floor(fontSize * 0.12));
  ctx.strokeText(text, 0, 0);
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

function drawEdgeStrip(
  ctx: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  sourceX: number,
  sourceY: number,
  sourceWidth: number,
  sourceHeight: number,
  target: AtlasRegion
) {
  ctx.drawImage(source, sourceX, sourceY, sourceWidth, sourceHeight, target.x, target.y, target.width, target.height);
}

function drawImageFill(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  target: AtlasRegion
) {
  ctx.drawImage(source, 0, 0, sourceWidth, sourceHeight, target.x, target.y, target.width, target.height);
}

function drawElytraWingMasked(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  target: AtlasRegion
) {
  const cutX = Math.max(1, target.width * 0.34);
  const cutY = Math.max(1, target.height * 0.24);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(target.x, target.y);
  ctx.lineTo(target.x + target.width - cutX, target.y);
  ctx.lineTo(target.x + target.width, target.y + cutY);
  ctx.lineTo(target.x + target.width, target.y + target.height);
  ctx.lineTo(target.x + cutX, target.y + target.height);
  ctx.lineTo(target.x, target.y + target.height - cutY);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(source, 0, 0, sourceWidth, sourceHeight, target.x, target.y, target.width, target.height);
  ctx.restore();
}

export async function generateCustomCapeAtlas(input: GenerateCustomCapeAtlasInput): Promise<GeneratedCapeAtlas> {
  const exportWidth = normalizeExportWidth(input.exportWidth);
  const exportHeight = Math.floor(exportWidth / 2);
  const crop = clampCrop(input.crop);
  const template = resolveMinecraftCapeTemplate(exportWidth, exportHeight);

  const atlas = createCanvas(exportWidth, exportHeight);
  const atlasCtx = atlas.getContext('2d', { alpha: true });
  if (!atlasCtx) throw new Error('atlas_context_unavailable');

  atlasCtx.clearRect(0, 0, exportWidth, exportHeight);
  atlasCtx.imageSmoothingEnabled = false;

  const sourceX = Math.floor(crop.x * input.sourceWidth);
  const sourceY = Math.floor(crop.y * input.sourceHeight);
  const sourceW = Math.max(1, Math.floor(crop.width * input.sourceWidth));
  const sourceH = Math.max(1, Math.floor(crop.height * input.sourceHeight));

  const visibleFaceCanvas = createCanvas(Math.round(template.front.width), Math.round(template.front.height));
  const faceCtx = visibleFaceCanvas.getContext('2d', { alpha: true });
  if (!faceCtx) throw new Error('visible_face_context_unavailable');

  faceCtx.clearRect(0, 0, visibleFaceCanvas.width, visibleFaceCanvas.height);
  faceCtx.imageSmoothingEnabled = false;
  const croppedSourceCanvas = createCanvas(sourceW, sourceH);
  const croppedSourceCtx = croppedSourceCanvas.getContext('2d', { alpha: true });
  if (!croppedSourceCtx) throw new Error('crop_source_context_unavailable');
  croppedSourceCtx.clearRect(0, 0, sourceW, sourceH);
  croppedSourceCtx.imageSmoothingEnabled = false;
  croppedSourceCtx.drawImage(input.image, sourceX, sourceY, sourceW, sourceH, 0, 0, sourceW, sourceH);
  drawImageFill(faceCtx, croppedSourceCanvas, sourceW, sourceH, {
    x: 0,
    y: 0,
    width: visibleFaceCanvas.width,
    height: visibleFaceCanvas.height
  });

  // Keep launcher preview and in-game rendering consistent across cape samplers.
  atlasCtx.drawImage(
    visibleFaceCanvas,
    0,
    0,
    visibleFaceCanvas.width,
    visibleFaceCanvas.height,
    template.front.x,
    template.front.y,
    template.front.width,
    template.front.height
  );
  atlasCtx.drawImage(
    visibleFaceCanvas,
    0,
    0,
    visibleFaceCanvas.width,
    visibleFaceCanvas.height,
    template.back.x,
    template.back.y,
    template.back.width,
    template.back.height
  );

  drawEdgeStrip(atlasCtx, visibleFaceCanvas, 0, 0, 1, visibleFaceCanvas.height, template.left);
  drawEdgeStrip(
    atlasCtx,
    visibleFaceCanvas,
    visibleFaceCanvas.width - 1,
    0,
    1,
    visibleFaceCanvas.height,
    template.right
  );
  drawEdgeStrip(atlasCtx, visibleFaceCanvas, 0, 0, visibleFaceCanvas.width, 1, template.top);
  drawEdgeStrip(
    atlasCtx,
    visibleFaceCanvas,
    0,
    visibleFaceCanvas.height - 1,
    visibleFaceCanvas.width,
    1,
    template.bottom
  );

  // Populate only the inner Elytra wing paint area; surrounding UV slots stay transparent.
  drawElytraWingMasked(atlasCtx, visibleFaceCanvas, visibleFaceCanvas.width, visibleFaceCanvas.height, template.elytra.front);

  if (input.watermarkText && input.watermarkText.trim()) {
    drawWatermark(atlasCtx, input.watermarkText.trim(), template.front);
    drawWatermark(atlasCtx, input.watermarkText.trim(), template.back);
    drawWatermark(atlasCtx, input.watermarkText.trim(), template.elytra.front);
  }

  const [blob, visibleFaceBlob] = await Promise.all([canvasToBlob(atlas), canvasToBlob(visibleFaceCanvas)]);
  return {
    blob,
    width: exportWidth,
    height: exportHeight,
    visibleFaceBlob,
    visibleFaceWidth: visibleFaceCanvas.width,
    visibleFaceHeight: visibleFaceCanvas.height
  };
}

export async function loadImageElementFromUrl(url: string) {
  const image = new Image();
  image.decoding = 'async';
  image.crossOrigin = 'anonymous';
  image.src = url;
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('image_load_failed'));
  });
  if (!image.naturalWidth || !image.naturalHeight) {
    throw new Error('image_dimensions_missing');
  }
  return image;
}
