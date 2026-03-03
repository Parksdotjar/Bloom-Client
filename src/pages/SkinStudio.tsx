import { useEffect, useMemo, useRef, useState, type ChangeEventHandler } from 'react';
import { Download, Search, Shirt, Upload } from 'lucide-react';
import { IdleAnimation, SkinViewer } from 'skinview3d';
import { invoke } from '@tauri-apps/api/core';
import { animate, remove, set, stagger } from 'animejs';
import { useAuth } from '../hooks/useAuth';
import {
  MOTION_ANIM_DURATION_KEY,
  MOTION_EASING_PRESET_KEY,
  MOTION_EASING_X1_KEY,
  MOTION_EASING_X2_KEY,
  MOTION_EASING_Y1_KEY,
  MOTION_EASING_Y2_KEY,
  MOTION_FADE_DURATION_KEY,
  MOTION_OFFSET_X_KEY,
  MOTION_OFFSET_Y_KEY,
  MOTION_STAGGER_KEY,
  MOTION_TUNING_DEFAULTS,
  MOTION_TUNING_EVENT,
  clampMotionTuning,
  resolveMotionEase
} from '../constants/motion';
import { PageWidgets, type PageWidget } from '../components/PageWidgets';

type SkinPreset = {
  id: string;
  name: string;
  skinDataUrl: string;
  previewDataUrl: string;
  model: 'classic' | 'slim';
  createdAt: number;
};

type StoredActiveSkin = {
  skinDataUrl: string;
  model: 'classic' | 'slim';
};

function toDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed reading skin file.'));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

function dataUrlToBytes(dataUrl: string): number[] {
  const parts = dataUrl.split(',');
  const base64 = parts.length > 1 ? parts[1] : '';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return Array.from(bytes);
}

function bytesToDataUrl(bytes: number[]): string {
  const binary = String.fromCharCode(...new Uint8Array(bytes));
  return `data:image/png;base64,${btoa(binary)}`;
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed loading skin image.'));
    image.src = source;
  });
}

async function generateAngledHeadshot(skinDataUrl: string): Promise<string> {
  const image = await loadImage(skinDataUrl);
  const sourceCanvas = document.createElement('canvas');
  sourceCanvas.width = image.width;
  sourceCanvas.height = image.height;
  const sourceCtx = sourceCanvas.getContext('2d');
  if (!sourceCtx) return skinDataUrl;
  sourceCtx.imageSmoothingEnabled = false;
  sourceCtx.drawImage(image, 0, 0);

  const out = document.createElement('canvas');
  out.width = 196;
  out.height = 196;
  const ctx = out.getContext('2d');
  if (!ctx) return skinDataUrl;
  ctx.imageSmoothingEnabled = false;

  const scale = 10;
  const sideScale = 0.55;
  const topScale = 0.5;
  const originX = 34;
  const originY = 62;

  const drawPixel = (sx: number, sy: number, dx: number, dy: number, w: number, h: number) => {
    const data = sourceCtx.getImageData(sx, sy, 1, 1).data;
    if (data[3] === 0) return;
    ctx.fillStyle = `rgba(${data[0]},${data[1]},${data[2]},${data[3] / 255})`;
    ctx.fillRect(Math.round(dx), Math.round(dy), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
  };

  const drawFront = (sx: number, sy: number, dx: number, dy: number) => {
    for (let y = 0; y < 8; y += 1) {
      for (let x = 0; x < 8; x += 1) {
        drawPixel(sx + x, sy + y, dx + x * scale, dy + y * scale, scale, scale);
      }
    }
  };

  const drawRight = (sx: number, sy: number, dx: number, dy: number) => {
    for (let y = 0; y < 8; y += 1) {
      for (let x = 0; x < 8; x += 1) {
        drawPixel(sx + x, sy + y, dx + x * scale * sideScale, dy + y * scale, scale * sideScale, scale);
      }
    }
  };

  const drawTop = (sx: number, sy: number, dx: number, dy: number) => {
    for (let y = 0; y < 8; y += 1) {
      for (let x = 0; x < 8; x += 1) {
        drawPixel(sx + x, sy + y, dx + x * scale, dy + y * scale * topScale, scale, scale * topScale);
      }
    }
  };

  // Base head
  drawTop(8, 0, originX, originY - scale * 4);
  drawRight(0, 8, originX + scale * 8, originY);
  drawFront(8, 8, originX, originY);
  // Hat layer
  drawTop(40, 0, originX, originY - scale * 4);
  drawRight(32, 8, originX + scale * 8, originY);
  drawFront(40, 8, originX, originY);

  return out.toDataURL('image/png');
}

export function SkinStudio() {
  const { authState, uploadSkin } = useAuth();
  const [skinModel, setSkinModel] = useState<'classic' | 'slim'>('classic');
  const [activeSkin, setActiveSkin] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [username, setUsername] = useState('');
  const [resolvingUsername, setResolvingUsername] = useState(false);
  const [presets, setPresets] = useState<SkinPreset[]>([]);
  const [motionTuning, setMotionTuning] = useState(() =>
    clampMotionTuning({
      animDurationMs: Number(localStorage.getItem(MOTION_ANIM_DURATION_KEY) ?? MOTION_TUNING_DEFAULTS.animDurationMs),
      fadeDurationMs: Number(localStorage.getItem(MOTION_FADE_DURATION_KEY) ?? MOTION_TUNING_DEFAULTS.fadeDurationMs),
      staggerMs: Number(localStorage.getItem(MOTION_STAGGER_KEY) ?? MOTION_TUNING_DEFAULTS.staggerMs),
      offsetX: Number(localStorage.getItem(MOTION_OFFSET_X_KEY) ?? MOTION_TUNING_DEFAULTS.offsetX),
      offsetY: Number(localStorage.getItem(MOTION_OFFSET_Y_KEY) ?? MOTION_TUNING_DEFAULTS.offsetY),
      easingPreset: (localStorage.getItem(MOTION_EASING_PRESET_KEY) as typeof MOTION_TUNING_DEFAULTS.easingPreset) ?? MOTION_TUNING_DEFAULTS.easingPreset,
      easingX1: Number(localStorage.getItem(MOTION_EASING_X1_KEY) ?? MOTION_TUNING_DEFAULTS.easingX1),
      easingY1: Number(localStorage.getItem(MOTION_EASING_Y1_KEY) ?? MOTION_TUNING_DEFAULTS.easingY1),
      easingX2: Number(localStorage.getItem(MOTION_EASING_X2_KEY) ?? MOTION_TUNING_DEFAULTS.easingX2),
      easingY2: Number(localStorage.getItem(MOTION_EASING_Y2_KEY) ?? MOTION_TUNING_DEFAULTS.easingY2)
    })
  );

  const classicCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const slimCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const classicViewportRef = useRef<HTMLDivElement | null>(null);
  const slimViewportRef = useRef<HTMLDivElement | null>(null);
  const uploadRef = useRef<HTMLInputElement | null>(null);
  const classicViewerRef = useRef<SkinViewer | null>(null);
  const slimViewerRef = useRef<SkinViewer | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const presetsStorageKey = useMemo(() => (authState ? `bloom_skin_presets_${authState.profile.id}` : null), [authState]);
  const activeSkinStorageKey = useMemo(() => (authState ? `bloom_skin_active_${authState.profile.id}` : null), [authState]);

  useEffect(() => {
    if (!authState) {
      setActiveSkin(null);
      setPresets([]);
      return;
    }

    const fallbackSkin = authState.profile.skinUrl || `https://crafatar.com/skins/${authState.profile.id}`;
    let restored = false;
    if (activeSkinStorageKey) {
      try {
        const rawActive = localStorage.getItem(activeSkinStorageKey);
        if (rawActive) {
          const parsed = JSON.parse(rawActive) as StoredActiveSkin;
          if (parsed?.skinDataUrl) {
            setActiveSkin(parsed.skinDataUrl);
            setSkinModel(parsed.model === 'slim' ? 'slim' : 'classic');
            restored = true;
          }
        }
      } catch {
        // ignore and fallback
      }
    }
    if (!restored) setActiveSkin(fallbackSkin);

    if (!presetsStorageKey) return;
    try {
      const raw = localStorage.getItem(presetsStorageKey);
      if (!raw) {
        setPresets([]);
        return;
      }
      const parsed = JSON.parse(raw) as Array<Partial<SkinPreset>>;
      const migrated = parsed
        .filter((entry) => entry && typeof entry.name === 'string' && typeof entry.previewDataUrl === 'string')
        .map((entry) => ({
          id: entry.id || crypto.randomUUID(),
          name: entry.name || 'preset.png',
          skinDataUrl: entry.skinDataUrl || entry.previewDataUrl || '',
          previewDataUrl: entry.previewDataUrl || entry.skinDataUrl || '',
          model: (entry.model === 'slim' ? 'slim' : 'classic') as 'classic' | 'slim',
          createdAt: typeof entry.createdAt === 'number' ? entry.createdAt : Date.now()
        }));
      setPresets(migrated);
    } catch {
      setPresets([]);
    }
  }, [authState, presetsStorageKey, activeSkinStorageKey]);

  useEffect(() => {
    if (!presetsStorageKey) return;
    localStorage.setItem(presetsStorageKey, JSON.stringify(presets));
  }, [presetsStorageKey, presets]);

  useEffect(() => {
    if (!activeSkinStorageKey || !activeSkin) return;
    const payload: StoredActiveSkin = { skinDataUrl: activeSkin, model: skinModel };
    localStorage.setItem(activeSkinStorageKey, JSON.stringify(payload));
  }, [activeSkinStorageKey, activeSkin, skinModel]);

  useEffect(() => {
    if (!classicCanvasRef.current || classicViewerRef.current) return;
    const viewport = classicViewportRef.current;
    const viewer = new SkinViewer({
      canvas: classicCanvasRef.current,
      width: 280,
      height: 320,
      model: 'default'
    });
    viewer.animation = new IdleAnimation();
    viewer.autoRotate = true;
    viewer.autoRotateSpeed = 0.8;
    viewer.zoom = 0.9;
    viewer.camera.position.set(16, 18, 34);
    viewer.camera.lookAt(0, 14, 0);
    classicViewerRef.current = viewer;

    let observer: ResizeObserver | null = null;
    if (viewport) {
      observer = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry) return;
        const width = Math.max(200, Math.round(entry.contentRect.width));
        const height = Math.max(240, Math.round(entry.contentRect.height));
        viewer.width = width;
        viewer.height = height;
      });
      observer.observe(viewport);
    }

    return () => {
      observer?.disconnect();
      viewer.dispose();
      classicViewerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!slimCanvasRef.current || slimViewerRef.current) return;
    const viewport = slimViewportRef.current;
    const viewer = new SkinViewer({
      canvas: slimCanvasRef.current,
      width: 280,
      height: 320,
      model: 'slim'
    });
    viewer.animation = new IdleAnimation();
    viewer.autoRotate = true;
    viewer.autoRotateSpeed = 0.8;
    viewer.zoom = 0.9;
    viewer.camera.position.set(16, 18, 34);
    viewer.camera.lookAt(0, 14, 0);
    slimViewerRef.current = viewer;

    let observer: ResizeObserver | null = null;
    if (viewport) {
      observer = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry) return;
        const width = Math.max(200, Math.round(entry.contentRect.width));
        const height = Math.max(240, Math.round(entry.contentRect.height));
        viewer.width = width;
        viewer.height = height;
      });
      observer.observe(viewport);
    }

    return () => {
      observer?.disconnect();
      viewer.dispose();
      slimViewerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!activeSkin) return;
    void classicViewerRef.current?.loadSkin(activeSkin, { model: 'default' });
    void slimViewerRef.current?.loadSkin(activeSkin, { model: 'slim' });
  }, [activeSkin]);

  useEffect(() => {
    const onMotionTuningChange = (event: Event) => {
      const custom = event as CustomEvent<{
        animDurationMs?: number;
        fadeDurationMs?: number;
        staggerMs?: number;
        offsetX?: number;
        offsetY?: number;
        easingPreset?: typeof MOTION_TUNING_DEFAULTS.easingPreset;
        easingX1?: number;
        easingY1?: number;
        easingX2?: number;
        easingY2?: number;
      }>;
      setMotionTuning(clampMotionTuning(custom.detail || {}));
    };
    window.addEventListener(MOTION_TUNING_EVENT, onMotionTuningChange as EventListener);
    return () => window.removeEventListener(MOTION_TUNING_EVENT, onMotionTuningChange as EventListener);
  }, []);

  useEffect(() => {
    if (!rootRef.current) return;
    const nodes = rootRef.current.querySelectorAll('.js-skin-reveal');
    remove(nodes);
    set(nodes, { opacity: 0, translateX: motionTuning.offsetX, translateY: motionTuning.offsetY });
    const moveAnimation = animate(nodes, {
      translateX: [motionTuning.offsetX, 0],
      translateY: [motionTuning.offsetY, 0],
      delay: stagger(motionTuning.staggerMs),
      duration: motionTuning.animDurationMs,
      ease: resolveMotionEase(motionTuning)
    });
    const fadeAnimation = animate(nodes, {
      opacity: [0, 1],
      delay: stagger(motionTuning.staggerMs),
      duration: motionTuning.fadeDurationMs,
      ease: resolveMotionEase(motionTuning)
    });
    return () => {
      moveAnimation.pause();
      fadeAnimation.pause();
    };
  }, [motionTuning]);

  const savePreset = async (name: string, skinDataUrl: string, model: 'classic' | 'slim') => {
    let previewDataUrl = skinDataUrl;
    try {
      previewDataUrl = await generateAngledHeadshot(skinDataUrl);
    } catch {
      previewDataUrl = skinDataUrl;
    }
    setPresets((prev) => {
      const next = [{ id: crypto.randomUUID(), name, skinDataUrl, previewDataUrl, model, createdAt: Date.now() }, ...prev].slice(0, 40);
      if (presetsStorageKey) {
        localStorage.setItem(presetsStorageKey, JSON.stringify(next));
      }
      return next;
    });
  };

  const applySkinDataUrl = async (name: string, dataUrl: string, model: 'classic' | 'slim') => {
    if (!authState) throw new Error('Sign in first.');
    setUploading(true);
    setStatus('Applying skin...');
    try {
      await uploadSkin(name, dataUrlToBytes(dataUrl), model);
      setActiveSkin(dataUrl);
      setSkinModel(model);
      setStatus('Skin applied.');
    } finally {
      setUploading(false);
    }
  };

  const onUploadFile: ChangeEventHandler<HTMLInputElement> = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.png')) {
      setStatus('Upload a .png skin file.');
      return;
    }
    void (async () => {
      try {
        const dataUrl = await toDataUrl(file);
        await applySkinDataUrl(file.name, dataUrl, skinModel);
        await savePreset(file.name, dataUrl, skinModel);
      } catch (err) {
        setStatus(err instanceof Error ? err.message : String(err));
      }
    })();
    event.target.value = '';
  };

  const importByUsername = async () => {
    setResolvingUsername(true);
    setStatus('Looking up username...');
    try {
      const imported = await invoke<{
        resolvedName: string;
        uuid: string;
        model: string;
        imageBytes: number[];
      }>('auth_pull_skin_by_username', { username });
      const model: 'classic' | 'slim' = imported.model === 'slim' ? 'slim' : 'classic';
      const dataUrl = bytesToDataUrl(imported.imageBytes);
      setActiveSkin(dataUrl);
      setSkinModel(model);
      await savePreset(`${imported.resolvedName}.png`, dataUrl, model);
      setStatus(`Imported skin from ${imported.resolvedName}.`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setResolvingUsername(false);
    }
  };

  const heroWidget = (
    <section className="g-panel-strong p-6 js-skin-reveal">
      <p className="text-[10px] font-extrabold tracking-[0.2em] uppercase g-accent-text">Skin Studio</p>
      <h1 className="text-5xl font-extrabold mt-1 inline-flex items-center gap-2"><Shirt size={34} /> Avatar Workshop</h1>
      <p className="text-sm g-muted mt-1">Preview both body types in live 3D and manage skin presets.</p>
    </section>
  );

  if (!authState) {
    const widgets: PageWidget[] = [
      { id: 'skins-hero', title: 'Header', defaultSlot: 'hero', content: heroWidget },
      {
        id: 'skins-auth',
        title: 'Account',
        defaultSlot: 'leftTop',
        content: (
          <section className="g-panel p-8 text-center js-skin-reveal">
            <p className="text-xl font-extrabold">Sign in to use Skin Studio</p>
            <p className="text-sm g-muted mt-2">This page needs your linked Minecraft account.</p>
          </section>
        )
      }
    ];
    return <div ref={rootRef}><PageWidgets pageKey="skins" widgets={widgets} /></div>;
  }

  const previewWidget = (
    <section className="grid grid-cols-1 lg:grid-cols-[1fr_1fr_360px] gap-4 js-skin-reveal">
      <div className="g-panel p-4">
        <p className="text-xs uppercase tracking-[0.14em] font-extrabold g-muted">Default Model (Wide)</p>
        <div ref={classicViewportRef} className="mt-2 rounded-xl border border-white/10 bg-white/[0.03] overflow-hidden h-[320px]">
          <canvas ref={classicCanvasRef} className="w-full h-full block" />
        </div>
      </div>
      <div className="g-panel p-4">
        <p className="text-xs uppercase tracking-[0.14em] font-extrabold g-muted">Slim Model</p>
        <div ref={slimViewportRef} className="mt-2 rounded-xl border border-white/10 bg-white/[0.03] overflow-hidden h-[320px]">
          <canvas ref={slimCanvasRef} className="w-full h-full block" />
        </div>
      </div>
      <div className="g-panel p-4 space-y-3">
        <p className="text-xs uppercase tracking-[0.14em] font-extrabold g-muted">Apply Skin</p>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setSkinModel('classic')} className={skinModel === 'classic' ? 'g-btn-accent h-10 text-xs font-extrabold uppercase tracking-[0.12em]' : 'g-btn h-10 text-xs font-extrabold uppercase tracking-[0.12em]'}>Classic</button>
          <button onClick={() => setSkinModel('slim')} className={skinModel === 'slim' ? 'g-btn-accent h-10 text-xs font-extrabold uppercase tracking-[0.12em]' : 'g-btn h-10 text-xs font-extrabold uppercase tracking-[0.12em]'}>Slim</button>
        </div>

        <input ref={uploadRef} type="file" accept="image/png" className="hidden" onChange={onUploadFile} />
        <button onClick={() => uploadRef.current?.click()} disabled={uploading} className="w-full g-btn-accent h-11 text-xs font-extrabold uppercase tracking-[0.12em] inline-flex items-center justify-center gap-2 disabled:opacity-50">
          <Upload size={14} /> {uploading ? 'Uploading...' : 'Upload Skin PNG'}
        </button>

        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <p className="text-[10px] uppercase tracking-[0.14em] font-extrabold g-muted">Import by Username</p>
          <div className="mt-2 flex gap-2">
            <input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Minecraft username" className="flex-1 h-10 g-input px-3 text-sm font-semibold outline-none" />
            <button onClick={() => { void importByUsername(); }} disabled={resolvingUsername} className="g-btn h-10 px-3 text-xs font-extrabold uppercase tracking-[0.12em] inline-flex items-center gap-1 disabled:opacity-50">
              <Search size={13} /> Pull
            </button>
          </div>
        </div>

        {activeSkin && (
          <button onClick={() => void applySkinDataUrl('imported-skin.png', activeSkin, skinModel)} disabled={uploading} className="w-full g-btn h-10 text-xs font-extrabold uppercase tracking-[0.12em] inline-flex items-center justify-center gap-2 disabled:opacity-50">
            <Download size={14} /> Apply Current Preview
          </button>
        )}

        {status && <p className="text-xs g-muted">{status}</p>}
      </div>
    </section>
  );

  const presetsWidget = (
    <section className="g-panel p-4 js-skin-reveal">
      <p className="text-xs uppercase tracking-[0.14em] font-extrabold g-muted">Saved Presets</p>
      <div className="mt-3 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {presets.map((preset) => (
          <div key={preset.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-2">
            <button onClick={() => { setActiveSkin(preset.skinDataUrl); setSkinModel(preset.model); }} className="w-full h-24 rounded-lg border border-white/10 overflow-hidden">
              <img src={preset.previewDataUrl} alt={preset.name} className="w-full h-full object-cover" />
            </button>
            <p className="mt-1 text-[11px] font-extrabold truncate">{preset.name}</p>
            <p className="text-[10px] g-muted uppercase tracking-wider">{preset.model}</p>
            <button onClick={() => { void applySkinDataUrl(preset.name, preset.skinDataUrl, preset.model); }} className="mt-2 w-full g-btn h-8 text-[10px] font-extrabold uppercase tracking-[0.12em]">
              Apply
            </button>
          </div>
        ))}
        {presets.length === 0 && <p className="text-sm g-muted col-span-full">No presets saved yet.</p>}
      </div>
    </section>
  );

  const widgets: PageWidget[] = [
    { id: 'skins-hero', title: 'Header', defaultSlot: 'hero', content: heroWidget },
    { id: 'skins-preview', title: 'Preview', defaultSlot: 'leftTop', content: previewWidget },
    { id: 'skins-presets', title: 'Presets', defaultSlot: 'leftBottom', content: presetsWidget }
  ];

  return <div ref={rootRef}><PageWidgets pageKey="skins" widgets={widgets} /></div>;
}
