import { useEffect, useMemo, useRef, useState, type ChangeEventHandler } from 'react';
import { Plus, RefreshCcw, Search, Upload } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { useAuth } from '../hooks/useAuth';

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

const STARTER_SKINS = [
  { id: 'steve', label: 'Steve', model: 'classic' as const, previewUrl: 'https://mc-heads.net/body/Steve/right' },
  { id: 'alex', label: 'Alex', model: 'slim' as const, previewUrl: 'https://mc-heads.net/body/Alex/right' },
  { id: 'kai', label: 'Kai', model: 'classic' as const, previewUrl: 'https://mc-heads.net/body/Kai/right' },
  { id: 'sunny', label: 'Sunny', model: 'classic' as const, previewUrl: 'https://mc-heads.net/body/Sunny/right' },
  { id: 'efe', label: 'Efe', model: 'classic' as const, previewUrl: 'https://mc-heads.net/body/Efe/right' },
  { id: 'noor', label: 'Noor', model: 'slim' as const, previewUrl: 'https://mc-heads.net/body/Noor/right' }
];

function toDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed reading skin file.'));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed reading image data.'));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
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
  out.height = 252;
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

  drawTop(8, 0, originX, originY - scale * 4);
  drawRight(0, 8, originX + scale * 8, originY);
  drawFront(8, 8, originX, originY);
  drawTop(40, 0, originX, originY - scale * 4);
  drawRight(32, 8, originX + scale * 8, originY);
  drawFront(40, 8, originX, originY);

  return out.toDataURL('image/png');
}

async function fetchStarterSkin(name: string): Promise<string> {
  const response = await fetch(`https://mc-heads.net/skin/${encodeURIComponent(name)}`);
  if (!response.ok) throw new Error(`Could not load ${name}.`);
  const blob = await response.blob();
  return blobToDataUrl(blob);
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
  const [selectedCardId, setSelectedCardId] = useState<string>('current');
  const [viewerLoading, setViewerLoading] = useState(true);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const uploadRef = useRef<HTMLInputElement | null>(null);
  const viewerRef = useRef<import('skinview3d').SkinViewer | null>(null);

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
        // keep fallback
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
    if (!canvasRef.current) return;

    let cancelled = false;
    let observer: ResizeObserver | null = null;

    void (async () => {
      try {
        const { SkinViewer } = await import('skinview3d');
        if (cancelled || !canvasRef.current) return;

        const viewer = new SkinViewer({
          canvas: canvasRef.current,
          width: 280,
          height: 460,
          model: 'default'
        });
        viewer.autoRotate = false;
        viewer.zoom = 0.78;
        viewer.camera.position.set(18, 20, 42);
        viewer.camera.lookAt(0, 14, 0);
        viewer.controls.enableZoom = false;
        viewer.controls.enablePan = false;
        viewerRef.current = viewer;
        setViewerLoading(false);

        if (viewportRef.current) {
          observer = new ResizeObserver((entries) => {
            const entry = entries[0];
            if (!entry) return;
            viewer.width = Math.max(240, Math.round(entry.contentRect.width));
            viewer.height = Math.max(360, Math.round(entry.contentRect.height));
          });
          observer.observe(viewportRef.current);
        }
      } catch (err) {
        if (!cancelled) {
          setViewerLoading(false);
          setStatus(err instanceof Error ? err.message : String(err));
        }
      }
    })();

    return () => {
      cancelled = true;
      observer?.disconnect();
      viewerRef.current?.dispose();
      viewerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!activeSkin || !viewerRef.current) return;
    void viewerRef.current.loadSkin(activeSkin, { model: skinModel === 'slim' ? 'slim' : 'default' });
  }, [activeSkin, skinModel]);

  const savePreset = async (name: string, skinDataUrl: string, model: 'classic' | 'slim') => {
    let previewDataUrl = skinDataUrl;
    try {
      previewDataUrl = await generateAngledHeadshot(skinDataUrl);
    } catch {
      previewDataUrl = skinDataUrl;
    }
    setPresets((prev) => {
      const deduped = prev.filter((entry) => entry.name !== name || entry.skinDataUrl !== skinDataUrl);
      return [{ id: crypto.randomUUID(), name, skinDataUrl, previewDataUrl, model, createdAt: Date.now() }, ...deduped].slice(0, 40);
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

  const handleSelectSkin = (id: string, dataUrl: string, model: 'classic' | 'slim') => {
    setSelectedCardId(id);
    setActiveSkin(dataUrl);
    setSkinModel(model);
    setStatus(null);
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
        handleSelectSkin(`preset:${file.name}:${Date.now()}`, dataUrl, skinModel);
        await applySkinDataUrl(file.name, dataUrl, skinModel);
        await savePreset(file.name, dataUrl, skinModel);
      } catch (err) {
        setStatus(err instanceof Error ? err.message : String(err));
      }
    })();
    event.target.value = '';
  };

  const importByUsername = async () => {
    const trimmed = username.trim();
    if (!trimmed) {
      setStatus('Enter a username first.');
      return;
    }
    setResolvingUsername(true);
    setStatus('Looking up username...');
    try {
      const imported = await invoke<{
        resolvedName: string;
        uuid: string;
        model: string;
        imageBytes: number[];
      }>('auth_pull_skin_by_username', { username: trimmed });
      const model: 'classic' | 'slim' = imported.model === 'slim' ? 'slim' : 'classic';
      const dataUrl = bytesToDataUrl(imported.imageBytes);
      handleSelectSkin(`preset:${imported.uuid}`, dataUrl, model);
      await savePreset(`${imported.resolvedName}.png`, dataUrl, model);
      setStatus(`Imported skin from ${imported.resolvedName}.`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setResolvingUsername(false);
    }
  };

  const importStarterSkin = async (name: string, model: 'classic' | 'slim') => {
    setResolvingUsername(true);
    setStatus(`Loading ${name}...`);
    try {
      const dataUrl = await fetchStarterSkin(name);
      handleSelectSkin(`starter:${name}`, dataUrl, model);
      setStatus(`${name} loaded into preview.`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setResolvingUsername(false);
    }
  };

  if (!authState) {
    return (
      <div className="mx-auto max-w-[1320px] px-4 py-6">
        <section className="g-panel-strong p-8 text-center">
          <p className="text-xl font-extrabold text-white">Sign in to use Skins</p>
          <p className="mt-2 text-sm text-white/55">This page needs your linked Minecraft account.</p>
        </section>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1320px] px-4 py-6">
      <div
        className="overflow-hidden border"
        style={{
          borderRadius: 'calc(28px * var(--g-roundness-mult))',
          borderColor: 'color-mix(in srgb, var(--g-accent) 20%, var(--g-border))',
          background: 'linear-gradient(180deg, color-mix(in srgb, var(--g-shell-strong) 96%, #000 4%), color-mix(in srgb, var(--g-shell) 98%, #000 2%))',
          boxShadow: 'var(--g-panel-strong-shadow)'
        }}
      >
        <div className="grid gap-8 p-6 lg:grid-cols-[240px_minmax(0,1fr)] lg:p-8">
          <aside className="flex flex-col items-start">
            <div className="flex items-center gap-3">
              <h1 className="text-[2.1rem] font-black tracking-[-0.04em] text-white">Skins</h1>
              <span
                className="rounded-full border px-2 py-0.5 text-[11px] font-black uppercase tracking-[0.14em]"
                style={{
                  borderColor: 'color-mix(in srgb, var(--g-success) 45%, transparent)',
                  background: 'color-mix(in srgb, var(--g-success) 18%, transparent)',
                  color: 'var(--g-text)'
                }}
              >
                Beta
              </span>
            </div>

            <div
              className="mt-12 rounded-xl border px-4 py-2 text-[1.05rem] font-black text-white"
              style={{
                borderRadius: 'calc(14px * var(--g-roundness-mult))',
                borderColor: 'color-mix(in srgb, var(--g-accent) 20%, var(--g-border))',
                background: 'color-mix(in srgb, var(--g-surface-strong) 62%, transparent)'
              }}
            >
              {authState.profile.name}
            </div>

            <div
              ref={viewportRef}
              className="mt-5 h-[360px] w-full overflow-hidden rounded-[28px] border"
              style={{
                borderRadius: 'calc(28px * var(--g-roundness-mult))',
                borderColor: 'transparent',
                background: 'transparent'
              }}
            >
              {viewerLoading && <div className="flex h-full w-full items-center justify-center text-sm font-bold text-white/45">Loading viewer...</div>}
              <canvas ref={canvasRef} className="block h-full w-full" />
            </div>

            <p className="mt-5 w-full text-center text-sm text-white/55">Drag to rotate</p>

            <button
              type="button"
              disabled
              className="mt-8 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full border px-4 text-sm font-black text-white/35 opacity-60"
              style={{
                borderRadius: 'calc(999px * var(--g-roundness-mult))',
                borderColor: 'var(--g-border)',
                background: 'color-mix(in srgb, var(--g-surface) 42%, transparent)'
              }}
            >
              <RefreshCcw size={15} />
              Change cape
            </button>
          </aside>

          <main className="min-w-0">
            <section>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-[1.9rem] font-black tracking-[-0.04em] text-white">Saved skins</h2>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex overflow-hidden rounded-xl border" style={{ borderRadius: 'calc(14px * var(--g-roundness-mult))', borderColor: 'var(--g-border)' }}>
                    <button onClick={() => setSkinModel('classic')} className={`h-10 px-4 text-xs font-black uppercase tracking-[0.14em] ${skinModel === 'classic' ? 'text-white' : 'text-white/55'}`} style={{ background: skinModel === 'classic' ? 'var(--g-accent-gradient)' : 'transparent' }}>Classic</button>
                    <button onClick={() => setSkinModel('slim')} className={`h-10 px-4 text-xs font-black uppercase tracking-[0.14em] ${skinModel === 'slim' ? 'text-white' : 'text-white/55'}`} style={{ background: skinModel === 'slim' ? 'var(--g-accent-gradient)' : 'transparent' }}>Slim</button>
                  </div>
                  <button
                    onClick={() => activeSkin && void applySkinDataUrl('selected-skin.png', activeSkin, skinModel)}
                    disabled={!activeSkin || uploading}
                    className="h-10 rounded-xl border px-4 text-xs font-black uppercase tracking-[0.14em] text-white disabled:opacity-50"
                    style={{
                      borderRadius: 'calc(14px * var(--g-roundness-mult))',
                      borderColor: 'color-mix(in srgb, var(--g-success) 42%, transparent)',
                      background: 'color-mix(in srgb, var(--g-success) 18%, transparent)'
                    }}
                  >
                    {uploading ? 'Applying' : 'Apply selected'}
                  </button>
                </div>
              </div>

              <input ref={uploadRef} type="file" accept="image/png" className="hidden" onChange={onUploadFile} />

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <button
                  onClick={() => uploadRef.current?.click()}
                  className="flex min-h-[205px] flex-col items-center justify-center gap-4 border text-white/78 transition hover:text-white"
                  style={{
                    borderRadius: 'calc(18px * var(--g-roundness-mult))',
                    borderColor: 'var(--g-border)',
                    background: 'linear-gradient(180deg, color-mix(in srgb, var(--g-surface-strong) 74%, transparent), color-mix(in srgb, var(--g-surface) 86%, transparent))'
                  }}
                >
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04]">
                    <Plus size={28} />
                  </div>
                  <div className="text-center">
                    <p className="text-[1.15rem] font-bold text-white">Add a skin</p>
                    <p className="mt-1 text-sm text-white/42">Upload a PNG and save it here.</p>
                  </div>
                </button>

                {presets.map((preset) => {
                  const selected = selectedCardId === preset.id || (activeSkin === preset.skinDataUrl && skinModel === preset.model);
                  return (
                    <button
                      key={preset.id}
                      onClick={() => handleSelectSkin(preset.id, preset.skinDataUrl, preset.model)}
                      className="group overflow-hidden border text-left"
                      style={{
                        borderRadius: 'calc(18px * var(--g-roundness-mult))',
                        borderColor: selected ? 'color-mix(in srgb, var(--g-success) 62%, transparent)' : 'var(--g-border)',
                        background: selected
                          ? 'linear-gradient(180deg, color-mix(in srgb, var(--g-success) 18%, var(--g-surface-strong)), color-mix(in srgb, var(--g-success) 10%, var(--g-surface)))'
                          : 'linear-gradient(180deg, color-mix(in srgb, var(--g-surface-strong) 72%, transparent), color-mix(in srgb, var(--g-surface) 84%, transparent))',
                        boxShadow: selected ? '0 0 0 1px color-mix(in srgb, var(--g-success) 40%, transparent)' : 'none'
                      }}
                    >
                      <div className="flex h-[205px] items-end justify-center overflow-hidden">
                        <img src={preset.previewDataUrl} alt={preset.name} className="h-full w-full object-contain transition duration-300 group-hover:scale-[1.03]" />
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            <div className="mt-6 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border px-3" style={{ borderRadius: 'calc(14px * var(--g-roundness-mult))', borderColor: 'var(--g-border)', background: 'color-mix(in srgb, var(--g-surface) 62%, transparent)' }}>
                <Search size={15} className="text-white/45" />
                <input
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void importByUsername();
                  }}
                  placeholder="Import by username"
                  className="h-11 w-full bg-transparent text-sm font-semibold text-white outline-none placeholder:text-white/28"
                />
                <button
                  onClick={() => { void importByUsername(); }}
                  disabled={resolvingUsername}
                  className="rounded-lg border px-3 py-2 text-[11px] font-black uppercase tracking-[0.14em] text-white disabled:opacity-50"
                  style={{ borderColor: 'var(--g-border)', background: 'color-mix(in srgb, var(--g-surface-strong) 78%, transparent)' }}
                >
                  {resolvingUsername ? 'Pulling' : 'Pull'}
                </button>
              </div>

              <button
                onClick={() => uploadRef.current?.click()}
                disabled={uploading}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border px-4 text-xs font-black uppercase tracking-[0.14em] text-white disabled:opacity-50"
                style={{
                  borderRadius: 'calc(14px * var(--g-roundness-mult))',
                  borderColor: 'color-mix(in srgb, var(--g-accent) 26%, var(--g-border))',
                  background: 'var(--g-accent-gradient)'
                }}
              >
                <Upload size={14} />
                Upload skin
              </button>
            </div>

            {status && <p className="mt-3 text-sm text-white/55">{status}</p>}

            <section className="mt-8">
              <h2 className="text-[1.9rem] font-black tracking-[-0.04em] text-white">Default skins</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {STARTER_SKINS.map((skin) => {
                  const selected = selectedCardId === `starter:${skin.label}`;
                  return (
                    <button
                      key={skin.id}
                      onClick={() => { void importStarterSkin(skin.label, skin.model); }}
                      className="group overflow-hidden border text-left"
                      style={{
                        borderRadius: 'calc(18px * var(--g-roundness-mult))',
                        borderColor: selected ? 'color-mix(in srgb, var(--g-success) 62%, transparent)' : 'var(--g-border)',
                        background: 'linear-gradient(180deg, color-mix(in srgb, var(--g-surface-strong) 74%, transparent), color-mix(in srgb, var(--g-surface) 86%, transparent))',
                        boxShadow: selected ? '0 0 0 1px color-mix(in srgb, var(--g-success) 40%, transparent)' : 'none'
                      }}
                    >
                      <div className="flex h-[205px] items-end justify-center overflow-hidden">
                        <img src={skin.previewUrl} alt={skin.label} className="h-full w-full object-contain transition duration-300 group-hover:scale-[1.03]" loading="lazy" />
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}
