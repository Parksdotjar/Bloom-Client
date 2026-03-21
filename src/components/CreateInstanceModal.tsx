import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronLeft, ChevronRight, ImageIcon, Sparkles, Sword, Wrench, X } from 'lucide-react';
import { animate, remove, set } from 'animejs';
import { Instance } from '../services/tauri';
import { useMojang } from '../hooks/useMojang';
import { useFabric } from '../hooks/useFabric';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: Instance) => Promise<void>;
  onRefresh?: () => Promise<void>;
}

type WizardStep = 'name' | 'loader' | 'version' | 'visuals';
type LoaderType = 'vanilla' | 'fabric';
type InstallLoaderStyle = 'orbit' | 'bars' | 'prism' | 'pulse';
const STEPS: WizardStep[] = ['name', 'loader', 'version', 'visuals'];
const INSTANCE_INSTALL_LOADING_STYLE_KEY = 'bloom_instance_install_loading_style';

interface DropdownOption<T extends string> {
  value: T;
  label: string;
  hint?: string;
}

interface PickerDropdownProps<T extends string> {
  label: string;
  value: T;
  valueLabel: string;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  options: DropdownOption<T>[];
  onSelect: (value: T) => void;
  disabled?: boolean;
}

function readInstallLoaderStyle(): InstallLoaderStyle {
  const stored = localStorage.getItem(INSTANCE_INSTALL_LOADING_STYLE_KEY);
  return stored === 'orbit' || stored === 'bars' || stored === 'prism' || stored === 'pulse' ? stored : 'orbit';
}

function InstallLoaderArt({ style }: { style: InstallLoaderStyle }) {
  if (style === 'bars') {
    return (
      <div className="flex h-16 items-end justify-center gap-2">
        {[0, 1, 2, 3].map((index) => (
          <span
            key={index}
            className="w-2.5 rounded-full bg-white/92 animate-pulse"
            style={{ height: `${22 + index * 8}px`, animationDelay: `${index * 120}ms`, animationDuration: '1100ms' }}
          />
        ))}
      </div>
    );
  }
  if (style === 'prism') {
    return (
      <div className="relative h-20 w-20">
        <div className="absolute inset-0 rounded-[24px] border border-white/18 bg-white/[0.02]" />
        <div className="absolute inset-3 animate-spin rounded-[16px] border border-white/65" style={{ animationDuration: '1800ms' }} />
        <div className="absolute inset-[26px] rotate-45 rounded-[8px] bg-white/92 shadow-[0_0_18px_rgba(255,255,255,0.26)]" />
      </div>
    );
  }
  if (style === 'pulse') {
    return (
      <div className="relative h-20 w-20">
        <span className="absolute inset-2 rounded-full border border-white/25 animate-ping" style={{ animationDuration: '1400ms' }} />
        <span className="absolute inset-4 rounded-full border border-white/45 animate-ping" style={{ animationDuration: '1400ms', animationDelay: '200ms' }} />
        <span className="absolute inset-[30px] rounded-full bg-white/92 shadow-[0_0_14px_rgba(255,255,255,0.3)]" />
      </div>
    );
  }
  return (
    <div className="relative h-20 w-20">
      <span className="absolute inset-2 rounded-full border border-white/18" />
      <span className="absolute inset-4 rounded-full border border-white/55 animate-spin" style={{ animationDuration: '1600ms' }} />
      <span className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/92 shadow-[0_0_14px_rgba(255,255,255,0.28)]" />
      <span className="absolute left-1/2 top-2 h-3 w-3 -translate-x-1/2 rounded-full bg-white/78 animate-spin" style={{ transformOrigin: '50% 32px', animationDuration: '1600ms' }} />
    </div>
  );
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

async function cropBanner(dataUrl: string, xRatio: number, yRatio: number, zoom: number): Promise<string> {
  const image = new Image();
  image.src = dataUrl;
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('Failed to load banner image'));
  });

  const outW = 1200;
  const outH = 375;
  const targetAspect = outW / outH;
  const iw = image.naturalWidth;
  const ih = image.naturalHeight;

  let cropW: number;
  let cropH: number;
  if (iw / ih > targetAspect) {
    cropH = ih / Math.max(1, zoom);
    cropW = cropH * targetAspect;
  } else {
    cropW = iw / Math.max(1, zoom);
    cropH = cropW / targetAspect;
  }

  const maxX = Math.max(0, iw - cropW);
  const maxY = Math.max(0, ih - cropH);
  const sx = Math.min(maxX, Math.max(0, maxX * xRatio));
  const sy = Math.min(maxY, Math.max(0, maxY * yRatio));

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl;
  ctx.drawImage(image, sx, sy, cropW, cropH, 0, 0, outW, outH);
  return canvas.toDataURL('image/jpeg', 0.92);
}

function LoaderGlyph({ loader }: { loader: LoaderType }) {
  if (loader === 'fabric') return <Wrench size={16} className="text-[var(--g-accent)]" />;
  return <Sword size={16} className="text-white/82" />;
}

function PickerDropdown<T extends string>({
  label,
  value,
  valueLabel,
  open,
  onToggle,
  onClose,
  options,
  onSelect,
  disabled
}: PickerDropdownProps<T>) {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onMouseDown = (event: MouseEvent) => {
      const node = event.target as Node;
      if (rootRef.current && !rootRef.current.contains(node)) onClose();
    };
    window.addEventListener('mousedown', onMouseDown);
    return () => window.removeEventListener('mousedown', onMouseDown);
  }, [onClose]);

  return (
    <div ref={rootRef} className="relative z-[220]">
      <p className="mb-2 text-[10px] font-black tracking-[0.18em] uppercase text-white/42">{label}</p>
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        className="inline-flex h-12 w-full items-center justify-between gap-3 rounded-[18px] border border-white/10 bg-black/35 px-4 text-sm font-bold text-white transition hover:bg-white/[0.06] disabled:opacity-50"
      >
        <span className="truncate">{valueLabel}</span>
        <ChevronDown size={15} className={open ? 'rotate-180 transition-transform' : 'transition-transform'} />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-[54px] z-[320] rounded-[20px] border border-white/10 bg-[rgba(10,10,12,0.98)] p-1.5 shadow-[0_18px_40px_rgba(0,0,0,0.42)] backdrop-blur-xl">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                onSelect(option.value);
                onClose();
              }}
              className={`w-full rounded-[14px] px-3 py-2.5 text-left transition ${option.value === value ? 'bg-white/[0.1]' : 'hover:bg-white/[0.06]'}`}
            >
              <span className="block text-sm font-bold">{option.label}</span>
              {option.hint && <span className="mt-0.5 block text-[11px] text-white/48">{option.hint}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function CreateInstanceModal({ isOpen, onClose, onSubmit, onRefresh }: Props) {
  const [stepIndex, setStepIndex] = useState(0);
  const [name, setName] = useState('');
  const [mcVersion, setMcVersion] = useState('1.21.1');
  const [loader, setLoader] = useState<LoaderType>('vanilla');
  const [showSnapshots, setShowSnapshots] = useState(false);
  const [fabricVersion, setFabricVersion] = useState('');

  const [versionOpen, setVersionOpen] = useState(false);
  const [fabricOpen, setFabricOpen] = useState(false);

  const [iconDataUrl, setIconDataUrl] = useState<string | undefined>(undefined);
  const [bannerSource, setBannerSource] = useState<string | undefined>(undefined);
  const [bannerDataUrl, setBannerDataUrl] = useState<string | undefined>(undefined);
  const [bannerX, setBannerX] = useState(0.5);
  const [bannerY, setBannerY] = useState(0.5);
  const [bannerZoom, setBannerZoom] = useState(1.15);
  const [draggingBanner, setDraggingBanner] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState('Preparing instance...');
  const [installLoaderStyle, setInstallLoaderStyle] = useState<InstallLoaderStyle>(() => readInstallLoaderStyle());

  const shellRef = useRef<HTMLDivElement | null>(null);
  const bannerDragStart = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null);
  const submitLockRef = useRef(false);

  const { releases, snapshots, loading: versionsLoading } = useMojang();
  const { versions: fabricVersions, loading: fabricLoading, latestStable } = useFabric(mcVersion, loader === 'fabric');

  useEffect(() => {
    if (latestStable && !fabricVersion) setFabricVersion(latestStable);
  }, [latestStable, fabricVersion]);

  useEffect(() => {
    if (!bannerSource) {
      setBannerDataUrl(undefined);
      return;
    }
    let cancelled = false;
    void cropBanner(bannerSource, bannerX, bannerY, bannerZoom).then((next) => {
      if (!cancelled) setBannerDataUrl(next);
    });
    return () => {
      cancelled = true;
    };
  }, [bannerSource, bannerX, bannerY, bannerZoom]);

  useEffect(() => {
    if (!isOpen || !shellRef.current) return;
    setInstallLoaderStyle(readInstallLoaderStyle());
    const node = shellRef.current;
    remove(node);
    set(node, { opacity: 0, scale: 0.96, translateY: 14 });
    const animation = animate(node, {
      opacity: [0, 1],
      scale: [0.96, 1],
      translateY: [14, 0],
      duration: 260,
      ease: 'outQuad',
      frameRate: 14
    });
    return () => {
      animation.pause();
    };
  }, [isOpen]);

  const step = STEPS[stepIndex];
  const canAdvanceCore = name.trim().length > 0 && mcVersion.trim().length > 0 && (loader === 'vanilla' || fabricVersion.trim().length > 0);
  const versionOptions = useMemo<DropdownOption<string>[]>(() => {
    const releaseOptions = releases.slice(0, 70).map((entry) => ({
      value: entry.id,
      label: entry.id,
      hint: 'Release build'
    }));
    const snapshotOptions = showSnapshots
      ? snapshots.slice(0, 40).map((entry) => ({
          value: entry.id,
          label: entry.id,
          hint: 'Snapshot build'
        }))
      : [];
    return [...releaseOptions, ...snapshotOptions];
  }, [releases, showSnapshots, snapshots]);
  const fabricOptions = useMemo<DropdownOption<string>[]>(() => {
    if (fabricLoading) return [{ value: '', label: 'Loading loaders...', hint: 'Fetching Fabric metadata' }];
    if (fabricVersions.length === 0) return [{ value: '', label: 'No loader versions found', hint: 'Try another game version' }];
    return fabricVersions.map((entry) => ({
      value: entry.loader.version,
      label: entry.loader.version,
      hint: entry.loader.stable ? 'Stable loader' : 'Preview loader'
    }));
  }, [fabricLoading, fabricVersions]);
  const resetAll = () => {
    setStepIndex(0);
    setName('');
    setMcVersion('1.21.1');
    setLoader('vanilla');
    setShowSnapshots(false);
    setFabricVersion('');
    setVersionOpen(false);
    setFabricOpen(false);
    setIconDataUrl(undefined);
    setBannerSource(undefined);
    setBannerDataUrl(undefined);
    setBannerX(0.5);
    setBannerY(0.5);
    setBannerZoom(1.15);
    setError(null);
    setLoadingLabel('Preparing instance...');
  };

  const closeModal = () => {
    onClose();
    setTimeout(resetAll, 120);
  };

  const onIconFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIconDataUrl(await fileToDataUrl(file));
  };

  const onBannerFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const data = await fileToDataUrl(file);
    setBannerSource(data);
  };

  const onBannerPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    bannerDragStart.current = { x: event.clientX, y: event.clientY, startX: bannerX, startY: bannerY };
    setDraggingBanner(true);
  };

  const onBannerPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!bannerDragStart.current) return;
    const dx = event.clientX - bannerDragStart.current.x;
    const dy = event.clientY - bannerDragStart.current.y;
    setBannerX(Math.min(1, Math.max(0, bannerDragStart.current.startX - dx / 420)));
    setBannerY(Math.min(1, Math.max(0, bannerDragStart.current.startY - dy / 180)));
  };

  const onBannerPointerUp = () => {
    bannerDragStart.current = null;
    setDraggingBanner(false);
  };

  const stepTitle = useMemo(() => {
    switch (step) {
      case 'name': return 'Pick A Name';
      case 'loader': return 'Choose Loader';
      case 'version': return 'Choose Version';
      case 'visuals': return 'Visual Options';
      default: return 'Create Instance';
    }
  }, [step]);

  const stepDescription = useMemo(() => {
    switch (step) {
      case 'name': return 'Start with the instance name Bloom will show across the launcher.';
      case 'loader': return 'Pick whether this starts as a clean Vanilla install or a Fabric-ready base.';
      case 'version': return 'Choose the Minecraft version with the custom Bloom picker, then lock the Fabric loader if needed.';
      case 'visuals': return 'Optional icon and banner customization before your first launch.';
      default: return 'Create a new instance.';
    }
  }, [step]);

  const canAdvanceStep = useMemo(() => {
    switch (step) {
      case 'name':
        return name.trim().length > 0;
      case 'loader':
        return true;
      case 'version':
        return mcVersion.trim().length > 0 && (loader === 'vanilla' || fabricVersion.trim().length > 0);
      case 'visuals':
        return canAdvanceCore;
      default:
        return canAdvanceCore;
    }
  }, [canAdvanceCore, fabricVersion, loader, mcVersion, name, step]);

  const handleCreate = async () => {
    if (!canAdvanceCore || submitLockRef.current) return;
    submitLockRef.current = true;
    setLoading(true);
    setError(null);
    try {
      setLoadingLabel('Creating base instance...');
      const created: Instance = {
        id: crypto.randomUUID(),
        name: name.trim(),
        mcVersion,
        loader,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        iconDataUrl,
        coverDataUrl: bannerDataUrl,
        colorTag: '#9a65ff',
        iconFrame: 'rounded',
        java: {},
        memoryMb: 4096,
        jvmArgs: [],
        fabricLoaderVersion: loader === 'fabric' ? fabricVersion : undefined,
        resolution: { width: 854, height: 480, fullscreen: false }
      };
      await onSubmit(created);

      setLoadingLabel('Refreshing library...');
      if (onRefresh) await onRefresh();
      closeModal();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      submitLockRef.current = false;
      setLoadingLabel('Preparing instance...');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120] app-region-no-drag flex items-center justify-center overflow-hidden bg-black p-3 md:p-5">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.24),transparent_20%),radial-gradient(circle_at_bottom_left,rgba(255,255,255,0.04),transparent_28%),linear-gradient(180deg,#030303_0%,#050505_100%)]" />
      <div className="absolute left-[-10%] top-[-14%] h-[58vh] w-[45vw] rotate-[-18deg] bg-[linear-gradient(180deg,rgba(255,255,255,0.22),rgba(255,255,255,0.02)_38%,transparent_72%)] blur-[26px] opacity-90" />
      <div className="absolute inset-0 bg-black/38 backdrop-blur-[1px]" />

      <div ref={shellRef} className="relative z-[2] w-full max-w-[860px] overflow-hidden rounded-[34px] border border-white/10 bg-[rgba(8,8,10,0.95)] shadow-[0_30px_90px_rgba(0,0,0,0.58)]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.08),transparent_28%),radial-gradient(circle_at_bottom,rgba(255,255,255,0.04),transparent_36%)]" />
        <div className="absolute inset-0 opacity-[0.16]" style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.18) 0.85px, transparent 0.85px)', backgroundSize: '16px 16px' }} />
        <div className="relative flex max-h-[min(860px,calc(100vh-24px))] flex-col">
          {loading && (
            <div className="absolute inset-0 z-[30] flex items-center justify-center bg-black/72 backdrop-blur-xl">
              <div className="flex w-full max-w-[360px] flex-col items-center px-8 text-center">
                <InstallLoaderArt style={installLoaderStyle} />
                <p className="mt-7 text-[11px] font-black uppercase tracking-[0.24em] text-white/42">Installing Instance</p>
                <p className="mt-3 text-2xl font-black text-white">{loadingLabel}</p>
                <p className="mt-2 text-sm text-white/55">Bloom is working. This step is locked until the install finishes.</p>
              </div>
            </div>
          )}
          <div className="px-5 pt-5 md:px-7 md:pt-6">
            <div className="flex items-center justify-center gap-3">
              {STEPS.map((item, idx) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setStepIndex(idx)}
                  className={`h-1.5 rounded-full transition-all ${idx === stepIndex ? 'w-9 bg-white shadow-[0_0_14px_rgba(255,255,255,0.22)]' : 'w-6 bg-white/24 hover:bg-white/40'}`}
                  aria-label={`Go to ${item}`}
                />
              ))}
            </div>

            <button onClick={closeModal} className="absolute right-5 top-5 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/12 bg-white/[0.04] text-white/72 transition hover:bg-white/[0.08]" title="Close">
              <X size={15} />
            </button>

            <div className="mx-auto mt-5 flex max-w-[520px] flex-col items-center text-center">
              <div className="flex h-[104px] w-[104px] items-center justify-center rounded-[30px] border border-white/50 bg-[linear-gradient(180deg,rgba(255,255,255,0.14),rgba(255,255,255,0.02))] shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_24px_70px_rgba(0,0,0,0.34)]">
                <div className="flex h-[74px] w-[74px] items-center justify-center rounded-[22px] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_56%),rgba(8,8,10,0.92)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                  {step === 'name' && <Sparkles size={28} className="text-white/82" />}
                  {step === 'loader' && <Wrench size={28} className="text-white/82" />}
                  {step === 'version' && <ChevronDown size={28} className="text-white/82" />}
                  {step === 'visuals' && <ImageIcon size={28} className="text-white/82" />}
                </div>
              </div>
              <p className="mt-6 text-[10px] font-black uppercase tracking-[0.28em] text-white/38">Create Instance</p>
              <h2 className="mt-3 text-[clamp(2.2rem,5vw,3.2rem)] font-black leading-[0.95] text-white">{stepTitle}</h2>
              <p className="mt-4 max-w-[480px] text-sm leading-7 text-white/60">{stepDescription}</p>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-4 md:px-7 md:pb-7">
            <div className="mx-auto flex w-full max-w-[760px] flex-col gap-4">
              <div className="rounded-[28px] border border-white/10 bg-[rgba(255,255,255,0.03)] p-4 md:p-5">
                <div className="space-y-5">
          {step === 'name' && (
            <div className="rounded-[26px] border border-white/10 bg-black/28 p-5 md:p-6">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/38">Instance Name</p>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Bloom SMP"
                className="mt-4 w-full rounded-[22px] border border-white/12 bg-black/45 px-5 py-4 text-2xl font-black text-white placeholder:text-white/22 focus:border-white/30 focus:outline-none"
              />
              <p className="mt-3 text-sm text-white/52">This is the label shown in your library, launch cards, and editor.</p>
            </div>
          )}

          {step === 'loader' && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <button
                type="button"
                onClick={() => setLoader('vanilla')}
                className={`rounded-[26px] border p-5 text-left transition ${loader === 'vanilla' ? 'border-white/45 bg-white/[0.09]' : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'}`}
              >
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-[18px] border border-white/10 bg-black/35">
                  <LoaderGlyph loader="vanilla" />
                </div>
                <p className="text-xl font-black text-white">Vanilla</p>
                <p className="mt-2 text-sm leading-6 text-white/60">No mod loader, good for standard survival, snapshots, or clean testing.</p>
              </button>
              <button
                type="button"
                onClick={() => setLoader('fabric')}
                className={`rounded-[26px] border p-5 text-left transition ${loader === 'fabric' ? 'border-white/45 bg-white/[0.09]' : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'}`}
              >
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-[18px] border border-white/10 bg-black/35">
                  <LoaderGlyph loader="fabric" />
                </div>
                <p className="text-xl font-black text-white">Fabric</p>
                <p className="mt-2 text-sm leading-6 text-white/60">Lightweight loader for modern performance mods and flexible setups.</p>
              </button>
            </div>
          )}

          {step === 'version' && (
            <div className="space-y-4">
              <div className="rounded-[26px] border border-white/10 bg-black/28 p-5">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/38">Minecraft Version</p>
                  <label className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-white/42">
                    <input type="checkbox" checked={showSnapshots} onChange={(e) => setShowSnapshots(e.target.checked)} className="accent-white" />
                    Snapshots
                  </label>
                </div>
                <PickerDropdown
                  label="Version"
                  value={mcVersion}
                  valueLabel={versionsLoading ? 'Loading versions...' : mcVersion}
                  open={versionOpen}
                  onToggle={() => setVersionOpen((v) => !v)}
                  onClose={() => setVersionOpen(false)}
                  options={versionOptions}
                  onSelect={setMcVersion}
                  disabled={versionsLoading || versionOptions.length === 0}
                />
              </div>

              {loader === 'fabric' && (
                <div className="rounded-[26px] border border-white/10 bg-black/28 p-5">
                  <PickerDropdown
                    label="Fabric Loader"
                    value={fabricVersion}
                    valueLabel={fabricVersion || (fabricLoading ? 'Loading loaders...' : 'Select loader')}
                    open={fabricOpen}
                    onToggle={() => setFabricOpen((v) => !v)}
                    onClose={() => setFabricOpen(false)}
                    options={fabricOptions}
                    onSelect={(value) => {
                      if (value) setFabricVersion(value);
                    }}
                    disabled={fabricLoading || fabricOptions.every((option) => option.value === '')}
                  />
                </div>
              )}
            </div>
          )}

          {step === 'visuals' && (
            <div className="rounded-[24px] border border-white/10 bg-black/25 p-4">
              <p className="mb-3 text-[10px] font-black uppercase tracking-[0.18em] text-white/38">Visuals</p>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-[180px_1fr]">
                <div>
                  <div className="flex h-36 items-center justify-center overflow-hidden rounded-[20px] border border-white/10 bg-black/35">
                    {iconDataUrl ? <img src={iconDataUrl} className="h-full w-full object-cover" /> : <ImageIcon size={24} className="text-white/36" />}
                  </div>
                  <label className="mt-3 inline-flex cursor-pointer rounded-[16px] border border-white/12 bg-white/[0.05] px-4 py-2.5 text-xs font-black uppercase tracking-[0.16em] text-white">
                    Upload Icon
                    <input type="file" accept="image/*" onChange={(e) => { void onIconFile(e); }} className="hidden" />
                  </label>
                </div>

                <div>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/38">Banner</p>
                    <label className="inline-flex cursor-pointer rounded-[14px] border border-white/12 bg-white/[0.05] px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-white">
                      Upload Banner
                      <input type="file" accept="image/*" onChange={(e) => { void onBannerFile(e); }} className="hidden" />
                    </label>
                  </div>
                  <div
                    onPointerDown={onBannerPointerDown}
                    onPointerMove={onBannerPointerMove}
                    onPointerUp={onBannerPointerUp}
                    onPointerLeave={onBannerPointerUp}
                    className={`relative h-44 overflow-hidden rounded-[20px] border border-white/10 bg-black/35 ${draggingBanner ? 'cursor-grabbing' : 'cursor-grab'}`}
                  >
                    {bannerSource && (
                      <img
                        src={bannerSource}
                        className="absolute inset-0 h-full w-full object-cover select-none pointer-events-none"
                        style={{ transform: `translate(${(0.5 - bannerX) * 36}px, ${(0.5 - bannerY) * 28}px) scale(${bannerZoom})` }}
                      />
                    )}
                    <div className="pointer-events-none absolute left-1/2 top-1/2 aspect-[3.2/1] w-[72%] -translate-x-1/2 -translate-y-1/2 rounded-xl border-2 border-white/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.38)]" />
                  </div>
                </div>
              </div>
            </div>
          )}

                {error && <p className="text-sm text-red-300">{error}</p>}
              </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button onClick={() => setStepIndex((v) => Math.max(0, v - 1))} disabled={stepIndex === 0 || loading} className="inline-flex items-center gap-1.5 rounded-[18px] border border-white/12 bg-white/[0.04] px-4 py-2.5 text-sm font-bold text-white/82 transition hover:bg-white/[0.08] disabled:opacity-45">
                    <ChevronLeft size={14} /> Back
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  {stepIndex < STEPS.length - 1 ? (
                    <button onClick={() => setStepIndex((v) => Math.min(STEPS.length - 1, v + 1))} disabled={!canAdvanceStep || loading} className="inline-flex items-center gap-2 rounded-[18px] border border-white/16 bg-white/[0.08] px-5 py-2.5 text-sm font-black text-white transition hover:bg-white/[0.12] disabled:opacity-45">
                      Next <ChevronRight size={14} />
                    </button>
                  ) : (
                    <button onClick={() => { void handleCreate(); }} disabled={loading || !canAdvanceCore} className="inline-flex items-center gap-2 rounded-[18px] border border-white/16 bg-white/[0.1] px-5 py-2.5 text-sm font-black text-white transition hover:bg-white/[0.14] disabled:opacity-45">
                      <Check size={14} /> {loading ? 'Creating...' : 'Create Instance'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}




