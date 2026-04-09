import { useEffect, useMemo, useRef, useState } from 'react';
import { clsx } from 'clsx';
import { Coins, ImagePlus, Play, Upload } from 'lucide-react';
import { MinecraftPlayerPreview } from './MinecraftPlayerPreview';
import {
  addSpriteCapeBlankFrame,
  createSpriteCapeProject,
  publishSpriteCapeProject,
  uploadSpriteCapeFrame
} from '../../services/animatedSpriteCape';
import { CUSTOM_CAPE_EXPORT_PRESETS, loadImageElementFromUrl } from '../../services/customCapeAtlas';
import { resolveMinecraftCapeTemplate } from '../../services/minecraftCapeLayout';

type LayoutMode = 'horizontal' | 'vertical' | 'grid';

const ACCEPTED_SHEET_TYPES = ['image/png', 'image/webp'];
const MAX_FRAMES = 64;
const FPS_PRESETS = [4, 6, 8, 10];
const PUBLISH_PRICE_BB = 2000;
const LIVE_PREVIEW_MAX_WIDTH = 1024;

function getResolutionLabel(width: number) {
  return `${width}x${Math.floor(width / 2)}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getOriginBaseUrl() {
  const raw = String(import.meta.env.VITE_SUPABASE_URL || 'https://sb.bloomclient.org').trim();
  try {
    return new URL(raw).origin.replace(/\/+$/, '');
  } catch {
    return raw.replace(/\/+$/, '');
  }
}

function computeAvailableFrames(sheetWidth: number, sheetHeight: number, frameWidth: number, frameHeight: number, layout: LayoutMode) {
  const cols = Math.floor(sheetWidth / frameWidth);
  const rows = Math.floor(sheetHeight / frameHeight);
  if (cols <= 0 || rows <= 0) return 0;
  if (layout === 'horizontal') return cols;
  if (layout === 'vertical') return rows;
  return cols * rows;
}

function resolveFrameRect(index: number, frameWidth: number, frameHeight: number, sheetWidth: number, sheetHeight: number, layout: LayoutMode) {
  const cols = Math.max(1, Math.floor(sheetWidth / frameWidth));
  const rows = Math.max(1, Math.floor(sheetHeight / frameHeight));
  if (layout === 'horizontal') {
    return { sx: index * frameWidth, sy: 0, sw: frameWidth, sh: frameHeight };
  }
  if (layout === 'vertical') {
    return { sx: 0, sy: index * frameHeight, sw: frameWidth, sh: frameHeight };
  }
  const x = (index % cols) * frameWidth;
  const y = Math.floor(index / cols) * frameHeight;
  if (y >= rows * frameHeight) return { sx: 0, sy: 0, sw: frameWidth, sh: frameHeight };
  return { sx: x, sy: y, sw: frameWidth, sh: frameHeight };
}

function extractFrameDataUrl(
  image: HTMLImageElement,
  frameWidth: number,
  frameHeight: number,
  index: number,
  layout: LayoutMode
) {
  const { sx, sy, sw, sh } = resolveFrameRect(index, frameWidth, frameHeight, image.naturalWidth, image.naturalHeight, layout);
  const canvas = document.createElement('canvas');
  canvas.width = frameWidth;
  canvas.height = frameHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas_context_unavailable');
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, frameWidth, frameHeight);
  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, frameWidth, frameHeight);
  return canvas.toDataURL('image/png');
}

function extractFramePreviewDataUrl(
  image: HTMLImageElement,
  frameWidth: number,
  frameHeight: number,
  index: number,
  layout: LayoutMode
) {
  const { sx, sy, sw, sh } = resolveFrameRect(index, frameWidth, frameHeight, image.naturalWidth, image.naturalHeight, layout);
  const scale = Math.min(1, LIVE_PREVIEW_MAX_WIDTH / Math.max(1, frameWidth));
  const targetWidth = Math.max(1, Math.round(frameWidth * scale));
  const targetHeight = Math.max(1, Math.round(frameHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas_context_unavailable');
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, targetWidth, targetHeight);
  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, targetWidth, targetHeight);
  return canvas.toDataURL('image/png');
}

function drawCapeUvGuide(ctx: CanvasRenderingContext2D, frameWidth: number, frameHeight: number) {
  const t = resolveMinecraftCapeTemplate(frameWidth, frameHeight);
  const drawRect = (x: number, y: number, w: number, h: number, color: string) => {
    if (w <= 0 || h <= 0) return;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, Math.round(frameWidth / 512));
    ctx.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.max(1, Math.round(w) - 1), Math.max(1, Math.round(h) - 1));
    ctx.restore();
  };

  drawRect(t.front.x, t.front.y, t.front.width, t.front.height, 'rgba(250, 204, 21, 0.95)');
  drawRect(t.back.x, t.back.y, t.back.width, t.back.height, 'rgba(14, 165, 233, 0.95)');
  drawRect(t.left.x, t.left.y, t.left.width, t.left.height, 'rgba(99, 102, 241, 0.95)');
  drawRect(t.right.x, t.right.y, t.right.width, t.right.height, 'rgba(225, 29, 72, 0.95)');
  drawRect(t.top.x, t.top.y, t.top.width, t.top.height, 'rgba(34, 197, 94, 0.95)');
  drawRect(t.bottom.x, t.bottom.y, t.bottom.width, t.bottom.height, 'rgba(168, 85, 247, 0.95)');
}

type AnimatedSpriteSheetStudioProps = {
  playerUuid: string | null;
  playerName: string;
  playerSkinUrl?: string | null;
};

export function AnimatedSpriteSheetStudio({ playerUuid, playerName, playerSkinUrl }: AnimatedSpriteSheetStudioProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [capeName, setCapeName] = useState('Animated Sprite Cape');
  const [layout, setLayout] = useState<LayoutMode>('horizontal');
  const [fps, setFps] = useState(10);
  const [frameWidth, setFrameWidth] = useState(256);
  const [sheetImage, setSheetImage] = useState<HTMLImageElement | null>(null);
  const [sheetUrl, setSheetUrl] = useState<string | null>(null);
  const [sheetName, setSheetName] = useState<string>('No file selected');
  const [sheetSize, setSheetSize] = useState<number>(0);
  const [frameCount, setFrameCount] = useState(1);
  const [play, setPlay] = useState(true);
  const [previewFrame, setPreviewFrame] = useState(0);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string>('');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [publishedCapeId, setPublishedCapeId] = useState<string | null>(null);
  const [livePreviewTextureUrl, setLivePreviewTextureUrl] = useState<string>('');

  const frameHeight = useMemo(() => Math.floor(frameWidth / 2), [frameWidth]);

  const availableFrames = useMemo(() => {
    if (!sheetImage) return 0;
    return computeAvailableFrames(sheetImage.naturalWidth, sheetImage.naturalHeight, frameWidth, frameHeight, layout);
  }, [sheetImage, frameWidth, frameHeight, layout]);

  const maxUsableFrames = useMemo(() => Math.max(0, Math.min(MAX_FRAMES, availableFrames)), [availableFrames]);

  useEffect(() => {
    const next = clamp(frameCount, 1, Math.max(1, maxUsableFrames));
    if (next !== frameCount) setFrameCount(next);
  }, [frameCount, maxUsableFrames]);

  useEffect(() => {
    if (!sheetImage || !play) return;
    const frameMs = Math.max(16, Math.floor(1000 / fps));
    const timer = window.setInterval(() => {
      setPreviewFrame((current) => (current + 1) % Math.max(1, frameCount));
    }, frameMs);
    return () => window.clearInterval(timer);
  }, [sheetImage, play, fps, frameCount]);

  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!sheetImage) return;
    const { sx, sy, sw, sh } = resolveFrameRect(
      previewFrame % Math.max(1, frameCount),
      frameWidth,
      frameHeight,
      sheetImage.naturalWidth,
      sheetImage.naturalHeight,
      layout
    );
    ctx.drawImage(sheetImage, sx, sy, sw, sh, 0, 0, frameWidth, frameHeight);
    drawCapeUvGuide(ctx, frameWidth, frameHeight);
  }, [frameCount, frameHeight, frameWidth, layout, previewFrame, sheetImage]);

  useEffect(() => {
    if (!sheetImage) {
      setLivePreviewTextureUrl('');
      return;
    }
    try {
      const dataUrl = extractFramePreviewDataUrl(
        sheetImage,
        frameWidth,
        frameHeight,
        previewFrame % Math.max(1, frameCount),
        layout
      );
      setLivePreviewTextureUrl(dataUrl);
    } catch {
      setLivePreviewTextureUrl('');
    }
  }, [frameCount, frameHeight, frameWidth, layout, previewFrame, sheetImage]);

  useEffect(() => {
    return () => {
      if (sheetUrl) URL.revokeObjectURL(sheetUrl);
    };
  }, [sheetUrl]);

  const publishedTextureUrl = useMemo(() => {
    if (!publishedCapeId) return '';
    return `${getOriginBaseUrl()}/functions/v1/main/gif-cape/capes/${publishedCapeId}/frames/0`;
  }, [publishedCapeId]);

  const activePreviewTextureUrl = publishedCapeId ? publishedTextureUrl : livePreviewTextureUrl;

  const handleSelectSheet = async (file: File) => {
    if (!ACCEPTED_SHEET_TYPES.includes(file.type)) {
      setError('Only PNG/WEBP sprite sheets are allowed.');
      return;
    }
    setError(null);
    setStatus(null);
    const nextUrl = URL.createObjectURL(file);
    const image = await loadImageElementFromUrl(nextUrl);
    if (sheetUrl) URL.revokeObjectURL(sheetUrl);
    setSheetUrl(nextUrl);
    setSheetImage(image);
    setSheetName(file.name);
    setSheetSize(file.size);
    setPreviewFrame(0);
    setPublishedCapeId(null);
    const detected = computeAvailableFrames(image.naturalWidth, image.naturalHeight, frameWidth, frameHeight, layout);
    setFrameCount(Math.max(1, Math.min(MAX_FRAMES, detected || 1)));
  };

  const handlePublish = async (autoEquip: boolean) => {
    if (!sheetImage) {
      setError('Upload a sprite sheet first.');
      return;
    }
    if (maxUsableFrames <= 0) {
      setError('Selected resolution/layout does not fit this sheet.');
      return;
    }
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const safeFrameCount = clamp(frameCount, 1, maxUsableFrames);
      setProgress('Creating project...');
      const projectPayload = await createSpriteCapeProject({
        name: capeName.trim() || 'Animated Sprite Cape',
        frameWidth,
        frameHeight,
        fps
      });

      const projectId = projectPayload.project.id;
      for (let i = 1; i < safeFrameCount; i += 1) {
        setProgress(`Preparing frame slots (${i + 1}/${safeFrameCount})...`);
        await addSpriteCapeBlankFrame(projectId);
      }

      for (let i = 0; i < safeFrameCount; i += 1) {
        const dataUrl = extractFrameDataUrl(sheetImage, frameWidth, frameHeight, i, layout);
        setProgress(`Uploading frames (${i + 1}/${safeFrameCount})...`);
        await uploadSpriteCapeFrame(projectId, i, dataUrl);
      }

      setProgress(autoEquip ? 'Publishing + equipping...' : 'Publishing...');
      const published = await publishSpriteCapeProject(projectId, autoEquip);
      setPublishedCapeId(published.cape_id);
      setStatus(
        autoEquip
          ? `Published + equipped: ${published.frame_count} frames @ ${published.fps} FPS`
          : `Published: ${published.frame_count} frames @ ${published.fps} FPS`
      );
      setProgress('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setProgress('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="grid grid-cols-1 xl:grid-cols-[320px_minmax(0,1fr)_340px] gap-4 min-h-0">
      <aside className="g-panel p-4 min-h-0 overflow-y-auto">
        <p className="text-[10px] uppercase tracking-[0.16em] font-extrabold text-white/55">Animated (Sprite Sheet)</p>

        <input
          value={capeName}
          onChange={(event) => setCapeName(event.target.value)}
          className="mt-3 h-10 w-full rounded-lg border border-white/15 bg-white/[0.04] px-3 text-sm text-white outline-none"
          placeholder="Cape name"
        />

        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/webp"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleSelectSheet(file);
            event.currentTarget.value = '';
          }}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="g-btn-accent mt-3 h-10 w-full text-[11px] font-extrabold uppercase tracking-[0.12em] inline-flex items-center justify-center gap-2"
        >
          <ImagePlus size={14} />
          Upload Sprite Sheet
        </button>

        <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <p className="text-[10px] uppercase tracking-[0.12em] font-extrabold text-white/55">Selected Sheet</p>
          <p className="mt-1 text-sm font-bold text-white truncate">{sheetName}</p>
          <p className="text-xs text-white/55">{sheetImage ? `${sheetImage.naturalWidth}x${sheetImage.naturalHeight}` : 'Unknown size'} · {sheetSize > 0 ? `${Math.round(sheetSize / 1024)} KB` : '-'}</p>
        </div>

        <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <p className="text-[10px] uppercase tracking-[0.12em] font-extrabold text-white/55">Frame Resolution</p>
          <div className="mt-2 grid grid-cols-3 gap-1">
            {CUSTOM_CAPE_EXPORT_PRESETS.map((preset) => (
              <button
                key={preset}
                onClick={() => setFrameWidth(preset)}
                className={clsx(
                  'h-7 rounded-md border text-[10px] font-extrabold uppercase tracking-[0.1em]',
                  frameWidth === preset ? 'g-btn-accent' : 'border-white/10 bg-white/[0.03] text-white/72'
                )}
              >
                {getResolutionLabel(preset)}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <p className="text-[10px] uppercase tracking-[0.12em] font-extrabold text-white/55">Sheet Layout</p>
          <div className="mt-2 grid grid-cols-3 gap-1">
            {(['horizontal', 'vertical', 'grid'] as LayoutMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setLayout(mode)}
                className={clsx(
                  'h-8 rounded-md border text-[10px] font-extrabold uppercase tracking-[0.1em]',
                  layout === mode ? 'g-btn-accent' : 'border-white/10 bg-white/[0.03] text-white/72'
                )}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <p className="text-[10px] uppercase tracking-[0.12em] font-extrabold text-white/55">FPS</p>
          <div className="mt-2 grid grid-cols-4 gap-1">
            {FPS_PRESETS.map((value) => (
              <button
                key={value}
                onClick={() => setFps(value)}
                className={clsx(
                  'h-8 rounded-md border text-[10px] font-extrabold uppercase tracking-[0.1em]',
                  fps === value ? 'g-btn-accent' : 'border-white/10 bg-white/[0.03] text-white/72'
                )}
              >
                {value}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <p className="text-[10px] uppercase tracking-[0.12em] font-extrabold text-white/55">Frames</p>
          <p className="mt-1 text-xs text-white/65">Available: {maxUsableFrames} (max {MAX_FRAMES})</p>
          <input
            type="number"
            min={1}
            max={Math.max(1, maxUsableFrames)}
            value={frameCount}
            onChange={(event) => setFrameCount(clamp(Number(event.target.value) || 1, 1, Math.max(1, maxUsableFrames)))}
            className="mt-2 h-9 w-full rounded-lg border border-white/15 bg-white/[0.04] px-3 text-sm text-white outline-none"
          />
        </div>

        <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <p className="text-[10px] uppercase tracking-[0.12em] font-extrabold text-white/55">Publish Cost</p>
          <p className="mt-1 text-lg font-extrabold text-white">{PUBLISH_PRICE_BB.toLocaleString()} BB</p>
          <p className="text-xs text-white/55 mt-1">Creates/updates your animated cape and publishes it to your locker.</p>
        </div>

        <button
          onClick={() => {
            void handlePublish(false);
          }}
          disabled={busy || !sheetImage}
          className="g-btn mt-3 h-10 w-full text-[11px] font-extrabold uppercase tracking-[0.12em] inline-flex items-center justify-center gap-2 disabled:opacity-45"
        >
          <Coins size={14} />
          {busy ? 'Publishing...' : `Publish (${PUBLISH_PRICE_BB.toLocaleString()} BB)`}
        </button>

        <button
          onClick={() => {
            void handlePublish(true);
          }}
          disabled={busy || !sheetImage}
          className="g-btn-accent mt-2 h-10 w-full text-[11px] font-extrabold uppercase tracking-[0.12em] inline-flex items-center justify-center gap-2 disabled:opacity-45"
        >
          <Upload size={14} />
          {busy ? 'Publishing...' : `Publish + Equip (${PUBLISH_PRICE_BB.toLocaleString()} BB)`}
        </button>

        {progress && <p className="mt-2 text-xs font-bold text-white/70">{progress}</p>}
        {status && <p className="mt-2 text-xs font-bold text-emerald-300">{status}</p>}
        {error && <p className="mt-2 text-xs font-bold text-red-300">{error}</p>}
      </aside>

      <div className="g-panel p-4 min-h-0 flex flex-col">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] uppercase tracking-[0.16em] font-extrabold text-white/55">Sprite Sheet Frame Preview</p>
          <button
            type="button"
            onClick={() => setPlay((current) => !current)}
            className="g-btn h-8 px-2.5 text-[10px] font-extrabold uppercase tracking-[0.12em] inline-flex items-center gap-1"
          >
            <Play size={12} />
            {play ? 'Pause' : 'Play'}
          </button>
        </div>
        <div className="mt-3 flex-1 min-h-[420px] border border-white/12 bg-black/35 grid place-items-center">
          <canvas
            ref={previewCanvasRef}
            width={frameWidth}
            height={frameHeight}
            className="max-w-full max-h-full [image-rendering:pixelated]"
          />
        </div>
        <p className="mt-2 text-xs text-white/60">
          Frame {Math.min(frameCount, previewFrame + 1)} / {Math.max(1, frameCount)} · {fps} FPS
        </p>
      </div>

      <aside className="g-panel p-4 min-h-0 flex flex-col">
        <p className="text-[10px] uppercase tracking-[0.16em] font-extrabold text-white/55">3D Preview</p>
        <div className="relative mt-3 border border-white/10 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.1),transparent_60%),rgba(0,0,0,0.35)] p-3 select-none">
          <div className="h-[310px]">
            {sheetImage && activePreviewTextureUrl ? (
              <MinecraftPlayerPreview
                playerUuid={playerUuid}
                playerName={playerName}
                playerSkinUrl={playerSkinUrl ?? null}
                capeId={publishedCapeId}
                capeSlug={publishedCapeId ? `gif-${publishedCapeId.replace(/-/g, '').slice(0, 12)}` : `sprite-live-${frameWidth}x${frameHeight}`}
                capeTextureUrl={activePreviewTextureUrl}
                capeTextureObjectUrl={publishedCapeId ? undefined : activePreviewTextureUrl}
                className="h-full w-full"
              />
            ) : (
              <div className="h-full w-full border border-white/12 bg-black/25 grid place-items-center text-xs text-white/55">
                Upload a sprite sheet to preview the cape live.
              </div>
            )}
          </div>
        </div>
      </aside>
    </section>
  );
}
