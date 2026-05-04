import { useEffect, useMemo, useRef, useState } from 'react';
import { FlyingAnimation, IdleAnimation, SkinViewer } from 'skinview3d';
import { BufferAttribute, Mesh } from 'three';
import { Pause, Play } from 'lucide-react';
import { capeTextureLoader, type CapeTextureAsset } from '../../services/capeTextures';
import { CapeMeshRenderer } from './CapeMeshRenderer';
import { buildMinecraftCapeUvData } from '../../services/minecraftCapeLayout';

type MinecraftPlayerPreviewProps = {
  playerUuid: string | null;
  playerName: string;
  playerSkinUrl?: string | null;
  capeSlug: string;
  capeId?: string | null;
  capeTextureUrl: string;
  capeTextureObjectUrl?: string | null;
  appearance?: {
    exposure: number;
    brightness: number;
    contrast: number;
    saturation: number;
    turn_rate: number;
    camera_light_intensity: number;
    global_light_intensity: number;
  };
  backEquipment?: 'cape' | 'elytra';
  className?: string;
};

const DEFAULT_APPEARANCE = {
  exposure: 1.9,
  brightness: 1.42,
  contrast: 1.1,
  saturation: 1.06,
  turn_rate: 0.45,
  camera_light_intensity: 1.72,
  global_light_intensity: 1.22
};

const animatedManifestCache = new Map<string, { fps: number; frameIndexes: number[]; loadedAt: number }>();
const animatedFrameUrlCache = new Map<string, string>();
const MAX_ANIMATED_FRAME_CACHE = 512;

function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalizeUuid(value: string | null) {
  if (!value) return null;
  const clean = value.trim().replace(/-/g, '');
  if (!/^[0-9a-f]{32}$/i.test(clean)) return null;
  return clean.toLowerCase();
}

async function loadImageDimensions(url: string): Promise<{ width: number; height: number }> {
  const image = new Image();
  image.decoding = 'async';
  image.src = url;
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('image_dimensions_load_failed'));
  });
  return {
    width: Math.max(1, image.naturalWidth || image.width || 64),
    height: Math.max(1, image.naturalHeight || image.height || 32)
  };
}

function applyMinecraftCapeUvs(viewer: SkinViewer, textureWidth = 64, textureHeight = 64) {
  const capeMesh = (viewer.playerObject as { cape?: { cape?: { geometry?: { attributes?: { uv?: BufferAttribute } } } } }).cape?.cape;
  const uv = capeMesh?.geometry?.attributes?.uv;
  if (uv) {
    uv.set(buildMinecraftCapeUvData(textureWidth, textureHeight));
    uv.needsUpdate = true;
  }
}

function getAnimatedFrameCacheKey(capeId: string, frameIndex: number) {
  return `${capeId}::${frameIndex}`;
}

async function loadAnimatedFrameObjectUrl(base: string, capeId: string, frameIndex: number) {
  const key = getAnimatedFrameCacheKey(capeId, frameIndex);
  const cached = animatedFrameUrlCache.get(key);
  if (cached) return cached;

  const frameUrl = `${base}/functions/v1/main/gif-cape/capes/${encodeURIComponent(capeId)}/frames/${frameIndex}`;
  const response = await fetch(frameUrl, { cache: 'force-cache' });
  if (!response.ok) {
    throw new Error(`animated_frame_http_${response.status}`);
  }
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  animatedFrameUrlCache.set(key, objectUrl);

  if (animatedFrameUrlCache.size > MAX_ANIMATED_FRAME_CACHE) {
    const oldest = animatedFrameUrlCache.keys().next().value;
    if (oldest) {
      const evictedUrl = animatedFrameUrlCache.get(oldest);
      if (evictedUrl) URL.revokeObjectURL(evictedUrl);
      animatedFrameUrlCache.delete(oldest);
    }
  }

  return objectUrl;
}

export function MinecraftPlayerPreview({
  playerUuid,
  playerName,
  playerSkinUrl,
  capeSlug,
  capeId,
  capeTextureUrl,
  capeTextureObjectUrl,
  appearance,
  backEquipment = 'cape',
  className
}: MinecraftPlayerPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewerRef = useRef<SkinViewer | null>(null);
  const [asset, setAsset] = useState<CapeTextureAsset | null>(null);
  const [capeFailed, setCapeFailed] = useState(false);
  const [viewerReady, setViewerReady] = useState(false);
  const [viewerFailed, setViewerFailed] = useState(false);
  const [animatedFrameIndexes, setAnimatedFrameIndexes] = useState<number[]>([]);
  const [animatedFps, setAnimatedFps] = useState<number>(10);
  const [animatedFrameCursor, setAnimatedFrameCursor] = useState(0);
  const [animatedBaseUrl, setAnimatedBaseUrl] = useState<string>('');
  const [dragging, setDragging] = useState(false);
  const [autoSpinEnabled, setAutoSpinEnabled] = useState(true);
  const autoSpinEnabledRef = useRef(true);
  const resolvedAppearance = useMemo(
    () => ({
      exposure: clampNumber(appearance?.exposure ?? DEFAULT_APPEARANCE.exposure, 0.8, 3.1),
      brightness: clampNumber(appearance?.brightness ?? DEFAULT_APPEARANCE.brightness, 0.8, 2.2),
      contrast: clampNumber(appearance?.contrast ?? DEFAULT_APPEARANCE.contrast, 0.75, 1.5),
      saturation: clampNumber(appearance?.saturation ?? DEFAULT_APPEARANCE.saturation, 0.75, 1.65),
      turn_rate: clampNumber(appearance?.turn_rate ?? DEFAULT_APPEARANCE.turn_rate, 0, 1.8),
      camera_light_intensity: clampNumber(
        appearance?.camera_light_intensity ?? DEFAULT_APPEARANCE.camera_light_intensity,
        0.5,
        2.8
      ),
      global_light_intensity: clampNumber(
        appearance?.global_light_intensity ?? DEFAULT_APPEARANCE.global_light_intensity,
        0.2,
        2.1
      )
    }),
    [appearance]
  );
  const skinSources = useMemo(() => {
    const uuid = normalizeUuid(playerUuid);
    const list: string[] = [];
    if (playerSkinUrl?.trim()) {
      list.push(playerSkinUrl.trim());
    }
    if (uuid) {
      list.push(`https://crafatar.com/skins/${uuid}?default=MHF_Steve`);
      list.push(`https://mc-heads.net/skin/${uuid}`);
    }
    if (playerName?.trim()) {
      list.push(`https://mc-heads.net/skin/${encodeURIComponent(playerName.trim())}`);
    }
    return Array.from(new Set(list));
  }, [playerName, playerSkinUrl, playerUuid]);

  useEffect(() => {
    let cancelled = false;
    setAsset(null);
    setCapeFailed(false);
    if (capeTextureObjectUrl?.trim()) {
      void loadImageDimensions(capeTextureObjectUrl)
        .then(({ width, height }) => {
          if (cancelled) return;
          setAsset({
            cacheKey: `${capeSlug}::inline`,
            slug: capeSlug,
            textureUrl: capeTextureObjectUrl,
            objectUrl: capeTextureObjectUrl,
            width,
            height,
            bytes: 0,
            fromDiskCache: false,
            generatedAt: Date.now()
          });
        })
        .catch(() => {
          if (cancelled) return;
          setCapeFailed(true);
        });
      return () => {
        cancelled = true;
      };
    }
    void capeTextureLoader
      .loadFull(capeSlug, capeTextureUrl)
      .then((next) => {
        if (cancelled) return;
        setAsset(next);
      })
      .catch(() => {
        if (cancelled) return;
        setCapeFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [capeSlug, capeTextureObjectUrl, capeTextureUrl]);

  useEffect(() => {
    let cancelled = false;
    setAnimatedFrameIndexes([]);
    setAnimatedFrameCursor(0);
    setAnimatedBaseUrl('');
    if (!capeId) return () => {
      cancelled = true;
    };

    const base = (() => {
      const raw = String(import.meta.env.VITE_SUPABASE_URL || '').trim();
      try {
        return new URL(raw).origin;
      } catch {
        return raw.replace(/\/+$/, '');
      }
    })();
    setAnimatedBaseUrl(base);
    const cacheKey = capeId.trim();
    const cachedManifest = animatedManifestCache.get(cacheKey);
    if (cachedManifest && cachedManifest.frameIndexes.length > 0) {
      setAnimatedFps(cachedManifest.fps);
      setAnimatedFrameIndexes(cachedManifest.frameIndexes);
      return () => {
        cancelled = true;
      };
    }

    void fetch(`${base}/functions/v1/main/gif-cape/capes/${encodeURIComponent(capeId)}/manifest`)
      .then((response) => response.json())
      .then((payload: unknown) => {
        if (cancelled) return;
        const manifest = (payload as { manifest?: { fps?: number; frames?: Array<{ index?: number; blank?: boolean }> } })?.manifest;
        if (!manifest) return;
        const fps = Math.max(1, Math.min(24, Math.round(Number(manifest.fps ?? 10))));
        const indexes = (manifest.frames ?? [])
          .filter((frame) => frame && frame.blank !== true)
          .map((frame) => Number(frame.index))
          .filter((value) => Number.isFinite(value) && value >= 0)
          .map((value) => Math.round(value));
        if (indexes.length === 0) return;
        setAnimatedFps(fps);
        setAnimatedFrameIndexes(indexes);
        animatedManifestCache.set(cacheKey, { fps, frameIndexes: indexes, loadedAt: Date.now() });
      })
      .catch(() => {
        if (!cancelled) {
          setAnimatedFrameIndexes([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [capeId, capeSlug]);

  useEffect(() => {
    if (!capeId || !animatedBaseUrl || animatedFrameIndexes.length === 0) return;
    const sample = animatedFrameIndexes.slice(0, Math.min(animatedFrameIndexes.length, 12));
    void Promise.allSettled(sample.map((idx) => loadAnimatedFrameObjectUrl(animatedBaseUrl, capeId, idx)));
  }, [animatedBaseUrl, animatedFrameIndexes, capeId]);

  useEffect(() => {
    if (animatedFrameIndexes.length <= 1) return;
    const frameMs = Math.max(16, Math.floor(1000 / animatedFps));
    const timer = window.setInterval(() => {
      setAnimatedFrameCursor((current) => (current + 1) % animatedFrameIndexes.length);
    }, frameMs);
    return () => window.clearInterval(timer);
  }, [animatedFps, animatedFrameIndexes]);

  useEffect(() => {
    autoSpinEnabledRef.current = autoSpinEnabled;
  }, [autoSpinEnabled]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let disposed = false;
    try {
      const viewer = new SkinViewer({
        canvas,
        width: Math.max(1, canvas.clientWidth || 320),
        height: Math.max(1, canvas.clientHeight || 320),
        enableControls: true,
        renderPaused: false,
        pixelRatio: 'match-device',
        preserveDrawingBuffer: false
      });
      viewer.background = null;
      viewer.fov = 41;
      viewer.zoom = 0.83;
      viewer.autoRotate = true;
      viewer.autoRotateSpeed = DEFAULT_APPEARANCE.turn_rate;
      viewer.animation = new IdleAnimation();
      viewer.animation.speed = 0.75;
      viewer.playerObject.backEquipment = backEquipment;
      viewer.playerObject.skin.visible = true;
      applyMinecraftCapeUvs(viewer);
      viewer.controls.enableZoom = false;
      viewer.controls.enablePan = false;
      viewer.controls.enableRotate = true;
      viewer.controls.rotateSpeed = 0.6;
      viewer.controls.enableDamping = true;
      viewer.controls.dampingFactor = 0.1;
      viewer.cameraLight.intensity = DEFAULT_APPEARANCE.camera_light_intensity;
      viewer.cameraLight.color.setRGB(1, 0.97, 0.92);
      viewer.cameraLight.position.set(18, 24, 28);
      viewer.globalLight.intensity = DEFAULT_APPEARANCE.global_light_intensity;
      viewer.renderer.shadowMap.enabled = false;
      viewer.renderer.toneMappingExposure = DEFAULT_APPEARANCE.exposure;

      viewer.playerObject.traverse((node) => {
        const mesh = node as unknown as Mesh;
        if (!mesh.isMesh) return;
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const material of materials) {
          const lit = material as unknown as { roughness?: number; metalness?: number; shininess?: number; needsUpdate?: boolean };
          if (typeof lit.roughness === 'number') lit.roughness = 1;
          if (typeof lit.metalness === 'number') lit.metalness = 0;
          if (typeof lit.shininess === 'number') lit.shininess = 0;
          if (typeof lit.needsUpdate === 'boolean') lit.needsUpdate = true;
        }
      });

      const resize = () => {
        if (disposed) return;
        const rect = canvas.getBoundingClientRect();
        viewer.setSize(Math.max(1, rect.width), Math.max(1, rect.height));
      };
      resize();

      const observer = new ResizeObserver(resize);
      observer.observe(canvas);

      const onPointerDown = () => {
        setDragging(true);
        viewer.autoRotate = false;
      };
      const onPointerUp = () => {
        setDragging(false);
        window.setTimeout(() => {
          if (viewerRef.current === viewer && autoSpinEnabledRef.current) viewer.autoRotate = true;
        }, 650);
      };

      canvas.addEventListener('pointerdown', onPointerDown);
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointercancel', onPointerUp);

      viewerRef.current = viewer;
      setViewerReady(true);
      setViewerFailed(false);

      return () => {
        disposed = true;
        observer.disconnect();
        canvas.removeEventListener('pointerdown', onPointerDown);
        window.removeEventListener('pointerup', onPointerUp);
        window.removeEventListener('pointercancel', onPointerUp);
        if (viewerRef.current === viewer) viewerRef.current = null;
        viewer.dispose();
      };
    } catch {
      setViewerFailed(true);
      return () => {
        disposed = true;
      };
    }
  }, []);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    viewer.playerObject.backEquipment = backEquipment;
    const nextAnimation = backEquipment === 'elytra' ? new FlyingAnimation() : new IdleAnimation();
    nextAnimation.speed = backEquipment === 'elytra' ? 0.58 : 0.75;
    viewer.animation = nextAnimation;
  }, [backEquipment]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    if (skinSources.length === 0) return;
    let cancelled = false;
    const run = async () => {
      for (const source of skinSources) {
        try {
          await viewer.loadSkin(source, { model: 'auto-detect' });
          if (!cancelled) {
            console.debug(`[MinecraftPlayerPreview] skin_loaded source=${source}`);
          }
          return;
        } catch (error) {
          console.warn(
            `[MinecraftPlayerPreview] skin_load_failed source=${source} reason=${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
      if (!cancelled) {
        console.error('[MinecraftPlayerPreview] all skin sources failed; keeping current viewer skin');
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [skinSources]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    if (animatedFrameIndexes.length > 0 && capeId) {
      const frameIndex = animatedFrameIndexes[animatedFrameCursor % animatedFrameIndexes.length] ?? 0;
      const base = animatedBaseUrl || (() => {
        const raw = String(import.meta.env.VITE_SUPABASE_URL || '').trim();
        try {
          return new URL(raw).origin;
        } catch {
          return raw.replace(/\/+$/, '');
        }
      })();
      void loadAnimatedFrameObjectUrl(base, capeId, frameIndex)
        .then((objectUrl) => viewer.loadCape(objectUrl, { backEquipment }))
        .catch(() => {
          setCapeFailed(true);
        });
      return;
    }
    if (!asset) return;
    applyMinecraftCapeUvs(viewer, asset.width, asset.height);
    void viewer.loadCape(asset.objectUrl, { backEquipment }).catch(() => {
      setCapeFailed(true);
    });
  }, [animatedFrameCursor, animatedFrameIndexes, asset, backEquipment, capeId]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    viewer.autoRotateSpeed = resolvedAppearance.turn_rate;
    viewer.renderer.toneMappingExposure = resolvedAppearance.exposure;
    viewer.cameraLight.intensity = resolvedAppearance.camera_light_intensity;
    viewer.globalLight.intensity = resolvedAppearance.global_light_intensity;
  }, [resolvedAppearance]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    viewer.autoRotate = autoSpinEnabled && !dragging;
  }, [autoSpinEnabled, dragging]);

  const previewFilter = `brightness(${resolvedAppearance.brightness}) contrast(${resolvedAppearance.contrast}) saturate(${resolvedAppearance.saturation})`;

  if (viewerFailed) {
    return (
      <CapeMeshRenderer
        slug={capeSlug}
        textureUrl={capeTextureUrl}
        name={playerName}
        className={className}
        glowColor={null}
        sway={false}
      />
    );
  }

  return (
    <div className={`relative ${className ?? 'h-full w-full'}`}>
      <canvas
        ref={canvasRef}
        className={`h-full w-full [image-rendering:pixelated] ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        style={{ filter: previewFilter }}
        aria-label={`${playerName} minecraft player preview`}
      />
      <button
        type="button"
        onClick={() => setAutoSpinEnabled((current) => !current)}
        className="absolute right-2 top-2 h-7 w-7 rounded-md border border-white/18 bg-black/45 text-white/85 transition hover:border-white/35 hover:bg-black/60 flex items-center justify-center"
        aria-label={autoSpinEnabled ? 'Pause preview spin' : 'Play preview spin'}
        title={autoSpinEnabled ? 'Pause spin' : 'Resume spin'}
      >
        {autoSpinEnabled ? <Pause size={12} /> : <Play size={12} className="translate-x-[0.5px]" />}
      </button>
      {capeFailed && viewerReady && (
        <div className="pointer-events-none absolute inset-0 grid place-items-end pb-2">
          <span className="bg-black/45 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.1em] text-white/65">
            Cape texture unavailable
          </span>
        </div>
      )}
    </div>
  );
}
