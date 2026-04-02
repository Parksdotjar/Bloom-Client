import { useEffect, useRef, useState } from 'react';
import { capeTextureLoader, type CapeTextureAsset } from '../../services/capeTextures';
import { resolveMinecraftCapeTemplate } from '../../services/minecraftCapeLayout';

type CapeMeshRendererProps = {
  slug: string;
  textureUrl: string;
  name: string;
  className?: string;
  glowColor?: string | null;
  sway?: boolean;
};

type CapeUv = {
  front: { x: number; y: number; w: number; h: number };
  side: { x: number; y: number; w: number; h: number };
};

type CapeRenderMode = 'atlas' | 'full-image';
const CAPE_VISUAL_RATIO = 16 / 10; // vanilla cape face ratio

function resolveCapeUv(width: number, height: number): CapeUv {
  const template = resolveMinecraftCapeTemplate(width, height);
  return {
    front: { x: template.front.x, y: template.front.y, w: template.front.width, h: template.front.height },
    side: { x: template.right.x, y: template.right.y, w: Math.max(template.right.width, 1), h: template.right.height }
  };
}

function drawPlaceholder(ctx: CanvasRenderingContext2D, width: number, height: number, label: string) {
  ctx.clearRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = false;
  const capeW = Math.floor(width * 0.36);
  const capeH = Math.floor(capeW * CAPE_VISUAL_RATIO);
  const x = Math.floor((width - capeW) / 2);
  const y = Math.floor((height - capeH) / 2);
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(x, y, capeW, capeH);
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, capeW - 1, capeH - 1);

  ctx.fillStyle = 'rgba(255,255,255,0.52)';
  ctx.font = '700 9px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(label, width / 2, y + capeH + 16);
}

function drawCapeMesh(
  ctx: CanvasRenderingContext2D,
  texture: HTMLImageElement,
  width: number,
  height: number,
  glowColor: string | null,
  phase: number,
  mode: CapeRenderMode
) {
  ctx.clearRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = false;

  const uv = resolveCapeUv(texture.naturalWidth || texture.width, texture.naturalHeight || texture.height);
  const capeW = Math.floor(width * 0.38);
  const capeH = Math.floor(capeW * CAPE_VISUAL_RATIO);
  const baseX = Math.floor((width - capeW) / 2);
  const y = Math.floor((height - capeH) / 2);
  const swayX = Math.round(Math.sin(phase) * 1.5);
  const x = baseX + swayX;
  const sideW = 1;

  if (glowColor) {
    ctx.save();
    ctx.globalAlpha = 0.24;
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 20;
    ctx.fillStyle = glowColor;
    ctx.fillRect(x - 6, y + 6, capeW + 12, capeH - 2);
    ctx.restore();
  }

  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(x + 3, y + 5, capeW, capeH);

  if (mode === 'atlas') {
    ctx.drawImage(texture, uv.front.x, uv.front.y, uv.front.w, uv.front.h, x, y, capeW, capeH);
  } else {
    ctx.drawImage(texture, 0, 0, texture.naturalWidth || texture.width, texture.naturalHeight || texture.height, x, y, capeW, capeH);
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, capeW - 1, capeH - 1);

  if (mode === 'atlas') {
    ctx.globalAlpha = 0.9;
    ctx.drawImage(texture, uv.side.x, uv.side.y, uv.side.w, uv.side.h, x + capeW - 1, y + 1, sideW, capeH - 2);
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(x + capeW - 1, y + 1, sideW, capeH - 2);
  }
}

function detectRenderMode(texture: HTMLImageElement): CapeRenderMode {
  const width = texture.naturalWidth || texture.width;
  const height = texture.naturalHeight || texture.height;
  if (!width || !height) return 'full-image';
  // Generated Minecraft cape atlases are square (64x64 scaled). Legacy/non-atlas
  // cape URLs (often raw art) should be rendered as a full image fallback.
  if ((width === height || width === height * 2) && width >= 64) return 'atlas';
  return 'full-image';
}

export function CapeMeshRenderer({ slug, textureUrl, name, className, glowColor, sway = true }: CapeMeshRendererProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [asset, setAsset] = useState<CapeTextureAsset | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setAsset(null);
    setFailed(false);
    void capeTextureLoader
      .loadFull(slug, textureUrl)
      .then((next) => {
        if (cancelled) return;
        setAsset(next);
      })
      .catch(() => {
        if (cancelled) return;
        setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [slug, textureUrl]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let frame = 0;
    let image: HTMLImageElement | null = null;
    let disposed = false;
    let phase = 0;

    const scheduleRender = () => {
      if (disposed) return;
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(render);
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      scheduleRender();
    };

    const render = () => {
      if (disposed) return;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (!width || !height) {
        scheduleRender();
        return;
      }
      if (failed || !asset) {
        drawPlaceholder(ctx, width, height, failed ? 'Cape unavailable' : 'Loading cape');
        return;
      }
      if (!image) {
        image = new Image();
        image.decoding = 'async';
        image.onload = () => {
          if (disposed) return;
          scheduleRender();
        };
        image.onerror = () => {
          if (disposed) return;
          scheduleRender();
        };
        image.src = asset.objectUrl;
      }
      if (image.complete && image.naturalWidth > 0 && image.naturalHeight > 0) {
        drawCapeMesh(ctx, image, width, height, glowColor ?? null, phase, detectRenderMode(image));
      } else {
        drawPlaceholder(ctx, width, height, 'Loading cape');
      }
      phase += sway ? 0.035 : 0;
      if (sway) {
        scheduleRender();
      }
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    frame = window.requestAnimationFrame(render);

    return () => {
      disposed = true;
      observer.disconnect();
      window.cancelAnimationFrame(frame);
    };
  }, [asset, failed, glowColor, sway]);

  return (
    <div className={className ?? 'h-full w-full'}>
      <canvas ref={canvasRef} className="h-full w-full [image-rendering:pixelated]" aria-label={`${name} cape mesh preview`} />
    </div>
  );
}
