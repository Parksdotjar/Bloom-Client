import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronLeft, ChevronRight, ImageIcon, Package2, Search, SkipForward, Sparkles, Sword, Wrench, X } from 'lucide-react';
import { animate, remove, set } from 'animejs';
import { Instance, MarketplaceMod, MarketplacePack, TauriApi } from '../services/tauri';
import { useMojang } from '../hooks/useMojang';
import { useFabric } from '../hooks/useFabric';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: Instance) => Promise<void>;
  onRefresh?: () => Promise<void>;
}

type WizardStep = 'core' | 'modpack' | 'mods' | 'resourcepacks' | 'visuals';
type SourceFilter = 'all' | 'modrinth' | 'curseforge';
type LoaderType = 'vanilla' | 'fabric';
const STEPS: WizardStep[] = ['core', 'modpack', 'mods', 'resourcepacks', 'visuals'];

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

const SOURCE_OPTIONS: DropdownOption<SourceFilter>[] = [
  { value: 'modrinth', label: 'Modrinth', hint: 'Best metadata coverage' },
  { value: 'curseforge', label: 'CurseForge', hint: 'Broad catalog' },
  { value: 'all', label: 'All Sources', hint: 'Merge both results' }
];

const LOADER_OPTIONS: DropdownOption<LoaderType>[] = [
  { value: 'vanilla', label: 'Vanilla', hint: 'Clean Minecraft, no loader overhead' },
  { value: 'fabric', label: 'Fabric', hint: 'Lightweight mod loader for modern packs' }
];

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

function compactDownloads(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return `${value}`;
}

function sourceLabel(value: SourceFilter): string {
  if (value === 'modrinth') return 'Modrinth';
  if (value === 'curseforge') return 'CurseForge';
  return 'All Sources';
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
        className="g-select-trigger h-12 w-full px-4 text-sm font-bold inline-flex items-center justify-between gap-3 disabled:opacity-50"
      >
        <span className="truncate">{valueLabel}</span>
        <ChevronDown size={15} className={open ? 'rotate-180 transition-transform' : 'transition-transform'} />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-[54px] z-[320] g-select-menu p-1.5">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                onSelect(option.value);
                onClose();
              }}
              className={`g-select-option w-full px-3 py-2.5 text-left ${option.value === value ? 'bg-[var(--g-accent-soft)]' : ''}`}
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

function ResultCard({
  title,
  description,
  meta,
  iconUrl,
  selected,
  onClick,
  featured
}: {
  title: string;
  description: string;
  meta: string;
  iconUrl?: string | null;
  selected?: boolean;
  onClick: () => void;
  featured?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-[24px] border p-4 text-left transition ${
        selected
          ? 'border-[var(--g-accent)] bg-[var(--g-accent-soft)]/80 shadow-[0_18px_44px_rgba(0,0,0,0.34)]'
          : 'border-white/12 bg-white/[0.04] hover:bg-white/[0.08]'
      }`}
    >
      <div className="flex items-start gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-[18px] border border-white/10 bg-white/[0.06]">
          {iconUrl ? <img src={iconUrl} alt={title} className="h-full w-full object-cover" /> : <Package2 size={18} className="text-white/48" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-base font-black text-white">{title}</p>
            {featured && (
              <span className="rounded-full border border-[var(--g-accent)]/45 bg-[var(--g-accent-soft)] px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.18em] text-white">
                Featured
              </span>
            )}
          </div>
          <p className="mt-1 line-clamp-2 text-sm text-white/70">{description || 'No description provided.'}</p>
          <p className="mt-2 text-[10px] uppercase tracking-[0.14em] text-white/45">{meta}</p>
        </div>
      </div>
    </button>
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
  const [loaderOpen, setLoaderOpen] = useState(false);
  const [fabricOpen, setFabricOpen] = useState(false);
  const [modpackSourceOpen, setModpackSourceOpen] = useState(false);
  const [modsSourceOpen, setModsSourceOpen] = useState(false);
  const [resourceSourceOpen, setResourceSourceOpen] = useState(false);

  const [modpackQuery, setModpackQuery] = useState('');
  const [modpackSource, setModpackSource] = useState<SourceFilter>('modrinth');
  const [modpackRows, setModpackRows] = useState<MarketplacePack[]>([]);
  const [modpackLoading, setModpackLoading] = useState(false);
  const [selectedModpack, setSelectedModpack] = useState<MarketplacePack | null>(null);

  const [modsQuery, setModsQuery] = useState('');
  const [modsSource, setModsSource] = useState<SourceFilter>('modrinth');
  const [modsRows, setModsRows] = useState<MarketplaceMod[]>([]);
  const [modsLoading, setModsLoading] = useState(false);
  const [selectedMods, setSelectedMods] = useState<MarketplaceMod[]>([]);

  const [resourceQuery, setResourceQuery] = useState('');
  const [resourceSource, setResourceSource] = useState<SourceFilter>('modrinth');
  const [resourceRows, setResourceRows] = useState<MarketplacePack[]>([]);
  const [resourceLoading, setResourceLoading] = useState(false);
  const [selectedResources, setSelectedResources] = useState<MarketplacePack[]>([]);

  const [iconDataUrl, setIconDataUrl] = useState<string | undefined>(undefined);
  const [bannerSource, setBannerSource] = useState<string | undefined>(undefined);
  const [bannerDataUrl, setBannerDataUrl] = useState<string | undefined>(undefined);
  const [bannerX, setBannerX] = useState(0.5);
  const [bannerY, setBannerY] = useState(0.5);
  const [bannerZoom, setBannerZoom] = useState(1.15);
  const [draggingBanner, setDraggingBanner] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [didLoadFeatured, setDidLoadFeatured] = useState(false);

  const shellRef = useRef<HTMLDivElement | null>(null);
  const bannerDragStart = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null);

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
  const featuredSummary = useMemo(
    () => [
      `${loader === 'fabric' ? 'Fabric-ready' : 'Vanilla-ready'} setup`,
      selectedModpack ? selectedModpack.title : 'No modpack locked',
      `${selectedMods.length} mods queued`,
      `${selectedResources.length} resource packs queued`
    ],
    [loader, selectedModpack, selectedMods.length, selectedResources.length]
  );
  const previewMeta = useMemo(
    () =>
      selectedModpack
        ? `${selectedModpack.source} | ${selectedModpack.author || 'Unknown author'} | ${compactDownloads(selectedModpack.downloads)} downloads`
        : `${loader === 'fabric' ? 'Fabric' : 'Vanilla'} | Minecraft ${mcVersion}`,
    [loader, mcVersion, selectedModpack]
  );

  const resetAll = () => {
    setStepIndex(0);
    setName('');
    setMcVersion('1.21.1');
    setLoader('vanilla');
    setShowSnapshots(false);
    setFabricVersion('');
    setVersionOpen(false);
    setLoaderOpen(false);
    setFabricOpen(false);
    setModpackSourceOpen(false);
    setModsSourceOpen(false);
    setResourceSourceOpen(false);
    setModpackQuery('');
    setModpackRows([]);
    setSelectedModpack(null);
    setModsQuery('');
    setModsRows([]);
    setSelectedMods([]);
    setResourceQuery('');
    setResourceRows([]);
    setSelectedResources([]);
    setIconDataUrl(undefined);
    setBannerSource(undefined);
    setBannerDataUrl(undefined);
    setBannerX(0.5);
    setBannerY(0.5);
    setBannerZoom(1.15);
    setError(null);
    setDidLoadFeatured(false);
  };

  const closeModal = () => {
    onClose();
    setTimeout(resetAll, 120);
  };

  const searchModpacks = async (overrideQuery?: string) => {
    const effectiveQuery = (overrideQuery ?? modpackQuery).trim();
    if (!effectiveQuery) return;
    setModpackLoading(true);
    setError(null);
    try {
      const rows = await TauriApi.marketplaceSearchModpacks(effectiveQuery, modpackSource);
      setModpackRows(
        [...rows].sort((a, b) => {
          const aScore = a.title.toLowerCase() === 'fabulously optimized' ? 2 : a.title.toLowerCase().includes('fabulously optimized') ? 1 : 0;
          const bScore = b.title.toLowerCase() === 'fabulously optimized' ? 2 : b.title.toLowerCase().includes('fabulously optimized') ? 1 : 0;
          if (aScore !== bScore) return bScore - aScore;
          return b.downloads - a.downloads;
        })
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setModpackLoading(false);
    }
  };

  const searchMods = async (overrideQuery?: string) => {
    const effectiveQuery = (overrideQuery ?? modsQuery).trim();
    if (!effectiveQuery) return;
    setModsLoading(true);
    setError(null);
    try {
      const rows = await TauriApi.marketplaceSearchMods(effectiveQuery, modsSource, loader, mcVersion);
      setModsRows(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setModsLoading(false);
    }
  };

  const searchResources = async (overrideQuery?: string) => {
    const effectiveQuery = (overrideQuery ?? resourceQuery).trim();
    if (!effectiveQuery) return;
    setResourceLoading(true);
    setError(null);
    try {
      const rows = await TauriApi.marketplaceSearchResourcepacks(effectiveQuery, resourceSource, mcVersion);
      setResourceRows(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setResourceLoading(false);
    }
  };

  const toggleModSelection = (row: MarketplaceMod) => {
    setSelectedMods((prev) => prev.some((m) => m.id === row.id) ? prev.filter((m) => m.id !== row.id) : [...prev, row]);
  };

  const toggleResourceSelection = (row: MarketplacePack) => {
    setSelectedResources((prev) => prev.some((m) => m.id === row.id) ? prev.filter((m) => m.id !== row.id) : [...prev, row]);
  };

  useEffect(() => {
    if (!isOpen || didLoadFeatured) return;
    setDidLoadFeatured(true);
    setModpackQuery('Fabulously Optimized');
    setModsQuery('Sodium');
    setResourceQuery('Faithful');
    void searchModpacks('Fabulously Optimized');
    void searchMods('Sodium');
    void searchResources('Faithful');
  }, [didLoadFeatured, isOpen]);

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
      case 'core': return 'Core Setup';
      case 'modpack': return 'Install Modpack';
      case 'mods': return 'Install Mods';
      case 'resourcepacks': return 'Install Resource Pack';
      case 'visuals': return 'Visuals';
      default: return 'Create Instance';
    }
  }, [step]);

  const handleCreate = async () => {
    if (!canAdvanceCore) return;
    setLoading(true);
    setError(null);
    try {
      let instance: Instance;
      if (selectedModpack) {
        instance = await TauriApi.marketplaceInstallModpackInstance(selectedModpack.source, selectedModpack.id, mcVersion);
        const customized: Instance = {
          ...instance,
          name: name.trim() || instance.name,
          mcVersion: instance.mcVersion || mcVersion,
          loader: instance.loader || loader,
          fabricLoaderVersion: instance.loader === 'fabric' ? (instance.fabricLoaderVersion || fabricVersion || undefined) : undefined,
          iconDataUrl,
          coverDataUrl: bannerDataUrl,
          updatedAt: Date.now()
        };
        await TauriApi.instancesUpdate(customized.id, customized);
        instance = customized;
      } else {
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
        instance = created;
      }

      for (const mod of selectedMods) {
        await TauriApi.marketplaceInstallMod(instance.id, mod.source, mod.id);
      }
      for (const pack of selectedResources) {
        await TauriApi.marketplaceInstallResourcepack(instance.id, pack.source, pack.id, mcVersion);
      }

      if (onRefresh) await onRefresh();
      closeModal();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120] app-region-no-drag flex items-center justify-center bg-black/82 p-3 backdrop-blur-sm md:p-5">
      <div className="absolute inset-0 onboarding-space-solid" />
      <div className="absolute inset-0 onboarding-stars-far" />
      <div className="absolute inset-0 onboarding-stars-near" />
      <div className="absolute inset-0 onboarding-stars-glow" />

      <div ref={shellRef} className="relative z-[2] w-full max-w-6xl overflow-hidden rounded-[34px] border border-white/12 bg-[#03060d]/92 shadow-[0_30px_90px_rgba(0,0,0,0.55)]">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/45 to-transparent" />
        <div className="grid min-h-[760px] grid-cols-1 lg:grid-cols-[1.05fr_0.95fr]">
          <section className="relative overflow-hidden border-b border-white/8 px-6 py-7 md:px-8 lg:border-b-0 lg:border-r lg:border-white/8">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.06),transparent_55%)]" />
            <div className="relative">
              <div className="mb-8 flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-black tracking-[0.28em] uppercase text-white/42">Create Instance</p>
                  <h2 className="mt-3 text-4xl font-black text-white">{stepTitle}</h2>
                  <p className="mt-3 max-w-[32rem] text-sm leading-6 text-white/66">
                    {step === 'core' && 'Give the instance a name, pick the loader, and lock the version before anything installs.'}
                    {step === 'modpack' && 'Featured packs show first so the page feels useful before the user searches.'}
                    {step === 'mods' && 'Queue direct installs for the instance, with strong defaults loaded up front.'}
                    {step === 'resourcepacks' && 'Add the visual layer before launch so the instance lands finished.'}
                    {step === 'visuals' && 'Set the icon and banner that represent the instance inside the launcher.'}
                  </p>
                </div>
                <button onClick={closeModal} className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/14 bg-white/[0.04] text-white/72 hover:bg-white/[0.08]" title="Close">
                  <X size={15} />
                </button>
              </div>

              <div className="mb-8 flex items-center justify-center gap-2">
                {STEPS.map((item, idx) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setStepIndex(idx)}
                    className={`h-2.5 rounded-full transition-all ${idx === stepIndex ? 'w-11 bg-white shadow-[0_0_16px_rgba(255,255,255,0.36)]' : 'w-2.5 bg-white/28 hover:bg-white/45'}`}
                    aria-label={`Go to ${item}`}
                  />
                ))}
              </div>

              <div className="space-y-6">
          {step === 'core' && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setLoader('vanilla')}
                  className={`rounded-[28px] border p-5 text-left transition ${loader === 'vanilla' ? 'border-white/55 bg-white/[0.1]' : 'border-white/12 bg-white/[0.04] hover:bg-white/[0.08]'}`}
                >
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-[18px] border border-white/12 bg-black/30">
                    <LoaderGlyph loader="vanilla" />
                  </div>
                  <p className="text-lg font-black text-white">Vanilla</p>
                  <p className="mt-2 text-sm leading-6 text-white/64">Clean install, no loader, ideal for pure survival, snapshots, and server baseline testing.</p>
                </button>
                <button
                  type="button"
                  onClick={() => setLoader('fabric')}
                  className={`rounded-[28px] border p-5 text-left transition ${loader === 'fabric' ? 'border-[var(--g-accent)] bg-[var(--g-accent-soft)]/70' : 'border-white/12 bg-white/[0.04] hover:bg-white/[0.08]'}`}
                >
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-[18px] border border-white/12 bg-black/30">
                    <LoaderGlyph loader="fabric" />
                  </div>
                  <p className="text-lg font-black text-white">Fabric</p>
                  <p className="mt-2 text-sm leading-6 text-white/64">Lightweight modding setup with cleaner performance tooling and better pack flexibility.</p>
                </button>
              </div>

              <div className="rounded-[28px] border border-white/12 bg-white/[0.04] p-5">
                <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.18em] text-white/42">Instance Name</label>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Bloom SMP" className="w-full rounded-[18px] border border-white/12 bg-black/30 px-4 py-3 text-base font-semibold text-white placeholder:text-white/28 focus:border-[var(--g-accent)] focus:outline-none" />
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="rounded-[28px] border border-white/12 bg-white/[0.04] p-5">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/42">Minecraft Version</p>
                    <label className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-white/45">
                      <input type="checkbox" checked={showSnapshots} onChange={(e) => setShowSnapshots(e.target.checked)} className="accent-[var(--g-accent)]" />
                      Snapshots
                    </label>
                  </div>
                  <PickerDropdown
                    label="Version Picker"
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
                <div className="rounded-[28px] border border-white/12 bg-white/[0.04] p-5">
                  <PickerDropdown
                    label="Loader"
                    value={loader}
                    valueLabel={loader === 'fabric' ? 'Fabric' : 'Vanilla'}
                    open={loaderOpen}
                    onToggle={() => setLoaderOpen((v) => !v)}
                    onClose={() => setLoaderOpen(false)}
                    options={LOADER_OPTIONS}
                    onSelect={setLoader}
                  />
                </div>
              </div>

              {loader === 'fabric' && (
                <div className="rounded-[28px] border border-white/12 bg-white/[0.04] p-5">
                  <PickerDropdown
                    label="Fabric Loader Version"
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

          {step === 'modpack' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-[220px_1fr_140px]">
                <PickerDropdown
                  label="Source"
                  value={modpackSource}
                  valueLabel={sourceLabel(modpackSource)}
                  open={modpackSourceOpen}
                  onToggle={() => setModpackSourceOpen((v) => !v)}
                  onClose={() => setModpackSourceOpen(false)}
                  options={SOURCE_OPTIONS}
                  onSelect={setModpackSource}
                />
                <div className="flex h-12 items-center gap-3 rounded-[20px] border border-white/12 bg-black/30 px-4">
                  <Search size={15} className="text-white/50" />
                  <input
                    value={modpackQuery}
                    onChange={(e) => setModpackQuery(e.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') void searchModpacks();
                    }}
                    placeholder="Search modpacks..."
                    className="w-full bg-transparent text-sm font-semibold text-white outline-none placeholder:text-white/28"
                  />
                </div>
                <button onClick={() => { void searchModpacks(); }} disabled={modpackLoading} className="h-12 rounded-[18px] border border-white/16 bg-white/[0.06] px-4 text-xs font-black uppercase tracking-[0.16em] text-white">
                  {modpackLoading ? 'Searching' : 'Search'}
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                {['Fabulously Optimized', 'Adrenaline', 'Simply Optimized'].map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => {
                      setModpackQuery(item);
                      void searchModpacks(item);
                    }}
                    className="rounded-full border border-white/12 bg-white/[0.04] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-white/78"
                  >
                    {item}
                  </button>
                ))}
              </div>

              <div className="grid max-h-[400px] grid-cols-1 gap-3 overflow-y-auto pr-1">
                {modpackRows.length === 0 && <div className="rounded-[24px] border border-white/12 bg-white/[0.04] p-5 text-sm text-white/56">Featured modpacks will load here. Search still works, but the first screen should already be useful.</div>}
                {modpackRows.map((row) => (
                  <ResultCard
                    key={`${row.source}:${row.id}`}
                    title={row.title}
                    description={row.description}
                    meta={`${row.source} | ${row.author || 'Unknown author'} | ${compactDownloads(row.downloads)} downloads`}
                    iconUrl={row.iconUrl}
                    featured={row.title.toLowerCase().includes('fabulously optimized')}
                    selected={selectedModpack?.id === row.id && selectedModpack?.source === row.source}
                    onClick={() => setSelectedModpack(row)}
                  />
                ))}
              </div>
            </div>
          )}

          {step === 'mods' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-[220px_1fr_140px]">
                <PickerDropdown
                  label="Source"
                  value={modsSource}
                  valueLabel={sourceLabel(modsSource)}
                  open={modsSourceOpen}
                  onToggle={() => setModsSourceOpen((v) => !v)}
                  onClose={() => setModsSourceOpen(false)}
                  options={SOURCE_OPTIONS}
                  onSelect={setModsSource}
                />
                <div className="flex h-12 items-center gap-3 rounded-[20px] border border-white/12 bg-black/30 px-4">
                  <Search size={15} className="text-white/50" />
                  <input
                    value={modsQuery}
                    onChange={(e) => setModsQuery(e.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') void searchMods();
                    }}
                    placeholder="Search mods..."
                    className="w-full bg-transparent text-sm font-semibold text-white outline-none placeholder:text-white/28"
                  />
                </div>
                <button onClick={() => { void searchMods(); }} disabled={modsLoading} className="h-12 rounded-[18px] border border-white/16 bg-white/[0.06] px-4 text-xs font-black uppercase tracking-[0.16em] text-white">
                  {modsLoading ? 'Searching' : 'Search'}
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                {['Sodium', 'Iris', 'Lithium'].map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => {
                      setModsQuery(item);
                      void searchMods(item);
                    }}
                    className="rounded-full border border-white/12 bg-white/[0.04] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-white/78"
                  >
                    {item}
                  </button>
                ))}
              </div>

              <div className="grid max-h-[340px] grid-cols-1 gap-3 overflow-y-auto pr-1">
                {modsRows.length === 0 && <div className="rounded-[24px] border border-white/12 bg-white/[0.04] p-5 text-sm text-white/56">Featured mods will load here so the first view is useful.</div>}
                {modsRows.map((row) => {
                  const selected = selectedMods.some((m) => m.id === row.id);
                  return (
                    <ResultCard
                      key={`${row.source}:${row.id}`}
                      title={row.title}
                      description={row.description}
                      meta={`${row.source} | ${row.author || 'Unknown author'} | ${compactDownloads(row.downloads)} downloads`}
                      iconUrl={row.iconUrl}
                      selected={selected}
                      onClick={() => toggleModSelection(row)}
                    />
                  );
                })}
              </div>
              <p className="text-xs uppercase tracking-[0.16em] text-white/46">Queued mods: {selectedMods.length}</p>
            </div>
          )}

          {step === 'resourcepacks' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-[220px_1fr_140px]">
                <PickerDropdown
                  label="Source"
                  value={resourceSource}
                  valueLabel={sourceLabel(resourceSource)}
                  open={resourceSourceOpen}
                  onToggle={() => setResourceSourceOpen((v) => !v)}
                  onClose={() => setResourceSourceOpen(false)}
                  options={SOURCE_OPTIONS}
                  onSelect={setResourceSource}
                />
                <div className="flex h-12 items-center gap-3 rounded-[20px] border border-white/12 bg-black/30 px-4">
                  <Search size={15} className="text-white/50" />
                  <input
                    value={resourceQuery}
                    onChange={(e) => setResourceQuery(e.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') void searchResources();
                    }}
                    placeholder="Search resource packs..."
                    className="w-full bg-transparent text-sm font-semibold text-white outline-none placeholder:text-white/28"
                  />
                </div>
                <button onClick={() => { void searchResources(); }} disabled={resourceLoading} className="h-12 rounded-[18px] border border-white/16 bg-white/[0.06] px-4 text-xs font-black uppercase tracking-[0.16em] text-white">
                  {resourceLoading ? 'Searching' : 'Search'}
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                {['Faithful', 'Fresh Animations', 'Complementary'].map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => {
                      setResourceQuery(item);
                      void searchResources(item);
                    }}
                    className="rounded-full border border-white/12 bg-white/[0.04] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-white/78"
                  >
                    {item}
                  </button>
                ))}
              </div>

              <div className="grid max-h-[340px] grid-cols-1 gap-3 overflow-y-auto pr-1">
                {resourceRows.length === 0 && <div className="rounded-[24px] border border-white/12 bg-white/[0.04] p-5 text-sm text-white/56">Featured resource packs will load here so users do not start from an empty search state.</div>}
                {resourceRows.map((row) => {
                  const selected = selectedResources.some((m) => m.id === row.id);
                  return (
                    <ResultCard
                      key={`${row.source}:${row.id}`}
                      title={row.title}
                      description={row.description}
                      meta={`${row.source} | ${row.author || 'Unknown author'} | ${compactDownloads(row.downloads)} downloads`}
                      iconUrl={row.iconUrl}
                      selected={selected}
                      onClick={() => toggleResourceSelection(row)}
                    />
                  );
                })}
              </div>
              <p className="text-xs uppercase tracking-[0.16em] text-white/46">Queued resource packs: {selectedResources.length}</p>
            </div>
          )}

          {step === 'visuals' && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="rounded-[28px] border border-white/12 bg-white/[0.04] p-5">
                  <p className="mb-3 text-[10px] font-black uppercase tracking-[0.18em] text-white/42">Instance Icon</p>
                  <div className="flex h-36 items-center justify-center overflow-hidden rounded-[24px] border border-white/12 bg-black/30">
                    {iconDataUrl ? <img src={iconDataUrl} className="h-full w-full object-cover" /> : <ImageIcon size={26} className="text-white/40" />}
                  </div>
                  <label className="mt-4 inline-flex cursor-pointer rounded-[16px] border border-white/14 bg-white/[0.05] px-4 py-2.5 text-xs font-black uppercase tracking-[0.16em] text-white">
                    Upload Icon
                    <input type="file" accept="image/*" onChange={(e) => { void onIconFile(e); }} className="hidden" />
                  </label>
                </div>
                <div className="rounded-[28px] border border-white/12 bg-white/[0.04] p-5">
                  <p className="mb-3 text-[10px] font-black uppercase tracking-[0.18em] text-white/42">Banner Upload</p>
                  <div className="flex h-36 items-center justify-center overflow-hidden rounded-[24px] border border-white/12 bg-black/30">
                    {bannerSource ? <img src={bannerSource} className="h-full w-full object-cover" /> : <Sparkles size={24} className="text-white/40" />}
                  </div>
                  <label className="mt-4 inline-flex cursor-pointer rounded-[16px] border border-white/14 bg-white/[0.05] px-4 py-2.5 text-xs font-black uppercase tracking-[0.16em] text-white">
                    Upload Banner
                    <input type="file" accept="image/*" onChange={(e) => { void onBannerFile(e); }} className="hidden" />
                  </label>
                </div>
              </div>

              <div className="rounded-[28px] border border-white/12 bg-white/[0.04] p-5">
                <p className="mb-3 text-[10px] font-black uppercase tracking-[0.18em] text-white/42">Banner Crop</p>
                <div
                  onPointerDown={onBannerPointerDown}
                  onPointerMove={onBannerPointerMove}
                  onPointerUp={onBannerPointerUp}
                  onPointerLeave={onBannerPointerUp}
                  className={`relative h-56 overflow-hidden rounded-[24px] border border-white/12 bg-black/35 ${draggingBanner ? 'cursor-grabbing' : 'cursor-grab'}`}
                >
                  {bannerSource && (
                    <img
                      src={bannerSource}
                      className="absolute inset-0 h-full w-full object-cover select-none pointer-events-none"
                      style={{
                        transform: `translate(${(0.5 - bannerX) * 36}px, ${(0.5 - bannerY) * 28}px) scale(${bannerZoom})`
                      }}
                    />
                  )}
                  <div className="pointer-events-none absolute left-1/2 top-1/2 aspect-[3.2/1] w-[72%] -translate-x-1/2 -translate-y-1/2 rounded-xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.38)]" />
                </div>
                <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
                  <label className="text-xs text-white/68">Horizontal
                    <input type="range" min={0} max={1} step={0.01} value={bannerX} onChange={(e) => setBannerX(Number(e.target.value))} className="mt-2 w-full" />
                  </label>
                  <label className="text-xs text-white/68">Vertical
                    <input type="range" min={0} max={1} step={0.01} value={bannerY} onChange={(e) => setBannerY(Number(e.target.value))} className="mt-2 w-full" />
                  </label>
                  <label className="text-xs text-white/68">Zoom
                    <input type="range" min={1} max={2.5} step={0.01} value={bannerZoom} onChange={(e) => setBannerZoom(Number(e.target.value))} className="mt-2 w-full" />
                  </label>
                </div>
              </div>
            </div>
          )}

                {error && <p className="text-sm text-red-300">{error}</p>}

                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                  <div className="flex items-center gap-2">
                    <button onClick={() => setStepIndex((v) => Math.max(0, v - 1))} disabled={stepIndex === 0 || loading} className="inline-flex items-center gap-1.5 rounded-[16px] border border-white/14 bg-white/[0.05] px-4 py-2.5 text-xs font-black uppercase tracking-[0.16em] text-white/82 disabled:opacity-45">
                      <ChevronLeft size={13} /> Back
                    </button>
                    {step !== 'core' && step !== 'visuals' && (
                      <button onClick={() => setStepIndex((v) => Math.min(STEPS.length - 1, v + 1))} disabled={loading} className="inline-flex items-center gap-1.5 rounded-[16px] border border-white/14 bg-white/[0.05] px-4 py-2.5 text-xs font-black uppercase tracking-[0.16em] text-white/82">
                        <SkipForward size={13} /> Skip
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {stepIndex < STEPS.length - 1 ? (
                      <button onClick={() => setStepIndex((v) => Math.min(STEPS.length - 1, v + 1))} disabled={(step === 'core' && !canAdvanceCore) || loading} className="inline-flex items-center gap-1.5 rounded-[16px] border border-[var(--g-accent)] bg-[var(--g-accent-soft)] px-5 py-2.5 text-xs font-black uppercase tracking-[0.16em] text-white disabled:opacity-45">
                        Next <ChevronRight size={13} />
                      </button>
                    ) : (
                      <button onClick={() => { void handleCreate(); }} disabled={loading || !canAdvanceCore} className="inline-flex items-center gap-1.5 rounded-[16px] border border-emerald-500/55 bg-emerald-500/20 px-5 py-2.5 text-xs font-black uppercase tracking-[0.16em] text-emerald-200 disabled:opacity-45">
                        <Check size={13} /> {loading ? 'Creating...' : 'Create Instance'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </section>

          <aside className="relative overflow-hidden px-6 py-7 md:px-8">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(69,108,209,0.14),transparent_52%)]" />
            <div className="relative flex h-full flex-col">
              <div className="rounded-[28px] border border-white/12 bg-black/30 p-6">
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-white/40">Live Preview</p>
                <div className="mt-5 overflow-hidden rounded-[26px] border border-white/10 bg-[#05080f]">
                  <div className="relative h-44 border-b border-white/8 bg-black">
                    {bannerDataUrl ? (
                      <img src={bannerDataUrl} alt="Banner preview" className="h-full w-full object-cover" />
                    ) : selectedModpack?.iconUrl ? (
                      <div className="absolute inset-0 bg-gradient-to-br from-[rgba(42,73,146,0.4)] via-black to-[rgba(16,21,33,0.92)]">
                        <img src={selectedModpack.iconUrl} alt={selectedModpack.title} className="absolute right-6 top-6 h-24 w-24 rounded-[22px] border border-white/15 object-cover shadow-[0_16px_36px_rgba(0,0,0,0.35)]" />
                      </div>
                    ) : (
                      <div className="absolute inset-0 bg-gradient-to-br from-[rgba(48,72,122,0.3)] via-black to-[rgba(7,10,16,0.95)]" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/18 to-transparent" />
                    <div className="absolute bottom-6 left-6 flex items-end gap-4">
                      <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-[24px] border border-white/14 bg-white/[0.05] shadow-[0_18px_40px_rgba(0,0,0,0.34)]">
                        {iconDataUrl ? (
                          <img src={iconDataUrl} alt="Icon preview" className="h-full w-full object-cover" />
                        ) : selectedModpack?.iconUrl ? (
                          <img src={selectedModpack.iconUrl} alt={selectedModpack.title} className="h-full w-full object-cover" />
                        ) : (
                          <Sparkles size={24} className="text-white/48" />
                        )}
                      </div>
                      <div className="pb-1">
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/50">Instance Preview</p>
                        <h3 className="mt-2 text-2xl font-black text-white">{name.trim() || selectedModpack?.title || 'Untitled Instance'}</h3>
                        <p className="mt-1 text-[11px] uppercase tracking-[0.14em] text-white/50">{previewMeta}</p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-5 p-6">
                    <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
                      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/42">What this build includes</p>
                      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {featuredSummary.map((item) => (
                          <div key={item} className="rounded-[18px] border border-white/10 bg-black/25 px-4 py-3 text-sm font-semibold text-white/80">
                            {item}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
                      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/42">Selected spotlight</p>
                      <div className="mt-4 rounded-[20px] border border-white/10 bg-black/25 p-4">
                        <div className="flex items-start gap-4">
                          <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-[18px] border border-white/10 bg-white/[0.05]">
                            {selectedModpack?.iconUrl ? (
                              <img src={selectedModpack.iconUrl} alt={selectedModpack.title} className="h-full w-full object-cover" />
                            ) : (
                              <Package2 size={18} className="text-white/46" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-base font-black text-white">{selectedModpack?.title || (loader === 'fabric' ? 'Fabric base instance' : 'Vanilla base instance')}</p>
                            <p className="mt-1 text-sm leading-6 text-white/66">
                              {selectedModpack?.description ||
                                (loader === 'fabric'
                                  ? 'This starts with a Fabric foundation so mods, APIs, and performance tools can be layered in cleanly.'
                                  : 'This starts as a clean Minecraft install with no mod loader, good for stock gameplay or server baseline testing.')}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}




