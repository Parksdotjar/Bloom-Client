import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Download, ImageIcon, Package2, Search, Sparkles, X } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useInstances } from '../hooks/useInstances';
import { TauriApi, type MarketplaceMod, type MarketplacePack } from '../services/tauri';

type SourceFilter = 'all' | 'modrinth' | 'curseforge';
type MarketTab = 'modpacks' | 'mods' | 'resourcepacks' | 'shaders';

const FEATURED_QUERIES: Record<MarketTab, string[]> = {
  modpacks: ['Fabulously Optimized', 'Adrenaline', 'Simply Optimized'],
  mods: ['Sodium', 'Iris', 'Lithium'],
  resourcepacks: ['Faithful', 'Fresh Animations', 'Complementary'],
  shaders: ['Complementary', 'BSL', 'Photon']
};

function compactDownloads(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return `${value}`;
}

export function Marketplace() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { instances, loadInstances } = useInstances();
  const initialTab = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState<MarketTab>(initialTab === 'modpacks' || initialTab === 'resourcepacks' || initialTab === 'shaders' ? initialTab : 'mods');
  const [source, setSource] = useState<SourceFilter>('all');
  const [selectedInstanceId, setSelectedInstanceId] = useState('');
  const [queryByTab, setQueryByTab] = useState<Record<MarketTab, string>>({
    modpacks: 'Fabulously Optimized',
    mods: 'Sodium',
    resourcepacks: 'Faithful',
    shaders: 'Complementary'
  });
  const [resultsByTab, setResultsByTab] = useState<{
    modpacks: MarketplacePack[];
    mods: MarketplaceMod[];
    resourcepacks: MarketplacePack[];
    shaders: MarketplacePack[];
  }>({ modpacks: [], mods: [], resourcepacks: [], shaders: [] });
  const [searching, setSearching] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [instanceOpen, setInstanceOpen] = useState(false);
  const [versionOpen, setVersionOpen] = useState(false);
  const [versionModalFor, setVersionModalFor] = useState<MarketplacePack | null>(null);
  const [selectedVersion, setSelectedVersion] = useState('');
  const [loadedTabs, setLoadedTabs] = useState<Record<MarketTab, boolean>>({
    modpacks: false,
    mods: false,
    resourcepacks: false,
    shaders: false
  });

  const sourceRef = useRef<HTMLDivElement | null>(null);
  const instanceRef = useRef<HTMLDivElement | null>(null);
  const versionRef = useRef<HTMLDivElement | null>(null);
  const selectedInstance = useMemo(() => instances.find((instance) => instance.id === selectedInstanceId) || null, [instances, selectedInstanceId]);
  const availableVersions = useMemo(() => {
    if (!versionModalFor) return [];
    const unique = Array.from(new Set(versionModalFor.availableVersions)).filter(Boolean);
    unique.sort((a, b) => b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' }));
    return unique;
  }, [versionModalFor]);

  useEffect(() => {
    const nextTab = searchParams.get('tab');
    if (nextTab === 'modpacks' || nextTab === 'mods' || nextTab === 'resourcepacks' || nextTab === 'shaders') setActiveTab(nextTab);
  }, [searchParams]);

  useEffect(() => {
    const onMouseDown = (event: MouseEvent) => {
      const node = event.target as Node;
      if (sourceRef.current && !sourceRef.current.contains(node)) setSourceOpen(false);
      if (instanceRef.current && !instanceRef.current.contains(node)) setInstanceOpen(false);
      if (versionRef.current && !versionRef.current.contains(node)) setVersionOpen(false);
    };
    window.addEventListener('mousedown', onMouseDown);
    return () => window.removeEventListener('mousedown', onMouseDown);
  }, []);

  useEffect(() => {
    if (!versionModalFor) return;
    setSelectedVersion(availableVersions[0] || '1.21.1');
    setVersionOpen(false);
  }, [versionModalFor, availableVersions]);

  const runSearch = async (tab: MarketTab, forcedQuery?: string) => {
    const effectiveQuery = (forcedQuery ?? queryByTab[tab]).trim();
    if (!effectiveQuery) return;
    setSearching(true);
    setStatus(null);
    try {
      if (tab === 'mods') {
        const rows = await TauriApi.marketplaceSearchMods(effectiveQuery, source, selectedInstance?.loader || 'fabric', selectedInstance?.mcVersion || '1.21.1');
        setResultsByTab((prev) => ({ ...prev, mods: rows }));
      } else if (tab === 'resourcepacks') {
        const rows = await TauriApi.marketplaceSearchResourcepacks(effectiveQuery, source, selectedInstance?.mcVersion || '1.21.1');
        setResultsByTab((prev) => ({ ...prev, resourcepacks: rows }));
      } else if (tab === 'shaders') {
        const rows = await TauriApi.marketplaceSearchShaders(effectiveQuery, source, selectedInstance?.mcVersion || '1.21.1');
        setResultsByTab((prev) => ({ ...prev, shaders: rows }));
      } else {
        const rows = await TauriApi.marketplaceSearchModpacks(effectiveQuery, source);
        const sorted = [...rows].sort((a, b) => {
          const aScore = a.title.toLowerCase() === 'fabulously optimized' ? 2 : a.title.toLowerCase().includes('fabulously optimized') ? 1 : 0;
          const bScore = b.title.toLowerCase() === 'fabulously optimized' ? 2 : b.title.toLowerCase().includes('fabulously optimized') ? 1 : 0;
          if (aScore !== bScore) return bScore - aScore;
          return b.downloads - a.downloads;
        });
        setResultsByTab((prev) => ({ ...prev, modpacks: sorted }));
      }
      setLoadedTabs((prev) => ({ ...prev, [tab]: true }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(`Search failed: ${message}`);
    } finally {
      setSearching(false);
    }
  };

  useEffect(() => {
    if (loadedTabs[activeTab]) return;
    void runSearch(activeTab, FEATURED_QUERIES[activeTab][0]);
  }, [activeTab, loadedTabs]);

  const switchTab = (tab: MarketTab) => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  const installCurrentItem = async (item: MarketplaceMod | MarketplacePack) => {
    if (activeTab === 'modpacks') {
      setVersionModalFor(item as MarketplacePack);
      return;
    }
    if (!selectedInstance) {
      setStatus('Pick an instance first.');
      return;
    }
    const rowId = `${item.source}:${item.id}`;
    setInstallingId(rowId);
    setStatus(`Installing ${item.title}...`);
    try {
      if (activeTab === 'mods') {
        const file = await TauriApi.marketplaceInstallMod(selectedInstance.id, item.source, item.id);
        setStatus(`Installed ${file} into ${selectedInstance.name}.`);
      } else if (activeTab === 'shaders') {
        const file = await TauriApi.marketplaceInstallShaderpack(selectedInstance.id, item.source, item.id, selectedInstance.mcVersion);
        setStatus(`Installed ${file} into ${selectedInstance.name}/shaderpacks.`);
      } else {
        const file = await TauriApi.marketplaceInstallResourcepack(selectedInstance.id, item.source, item.id, selectedInstance.mcVersion);
        setStatus(`Installed ${file} into ${selectedInstance.name}/resourcepacks.`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(`Install failed: ${message}`);
    } finally {
      setInstallingId(null);
    }
  };

  const installModpack = async () => {
    if (!versionModalFor || !selectedVersion) return;
    const rowId = `${versionModalFor.source}:${versionModalFor.id}`;
    setInstallingId(rowId);
    setStatus(`Installing ${versionModalFor.title} for ${selectedVersion}...`);
    try {
      const instance = await TauriApi.marketplaceInstallModpackInstance(versionModalFor.source, versionModalFor.id, selectedVersion);
      await loadInstances();
      setStatus(`Created instance "${instance.name}".`);
      setVersionModalFor(null);
      navigate(`/instance-editor?id=${encodeURIComponent(instance.id)}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(`Install failed: ${message}`);
    } finally {
      setInstallingId(null);
    }
  };

  const currentResults = resultsByTab[activeTab];
  const currentQuery = queryByTab[activeTab];

  return (
    <>
      <div className="mx-auto max-w-[1360px] min-h-full px-4 py-6">
        <div
          className="relative overflow-hidden border"
          style={{
            borderRadius: 'calc(30px * var(--g-roundness-mult))',
            borderColor: 'var(--g-border)',
            background: 'color-mix(in srgb, var(--g-shell-strong) 96%, transparent)',
            boxShadow: 'var(--g-panel-strong-shadow)'
          }}
        >
          <div className="relative z-[1] p-5 md:p-6">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.28em] g-accent-text">Marketplace</p>
                <h1 className="mt-2 text-4xl font-black text-white">One place for packs, mods, and textures</h1>
                <p className="mt-2 max-w-[48rem] text-sm text-white/60">Built like a proper launcher marketplace instead of three disconnected pages.</p>
              </div>
              <div className="px-4 py-3 text-right g-panel">
                <p className="text-[10px] uppercase tracking-[0.18em] text-white/40">Active target</p>
                <p className="mt-1 text-sm font-bold text-white">{selectedInstance ? `${selectedInstance.name} (${selectedInstance.mcVersion})` : 'No instance selected'}</p>
              </div>
            </div>

            <div
              className="border p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
              style={{
                borderRadius: 'calc(28px * var(--g-roundness-mult))',
                borderColor: 'var(--g-border)',
                background: 'color-mix(in srgb, var(--g-surface-strong) 78%, transparent)',
                backdropFilter: 'blur(calc(var(--g-panel-strong-backdrop) * var(--g-glass-blur-mult)))'
              }}
            >
              <div className="space-y-4">
                  <div className="grid grid-cols-4 gap-2 border bg-black/25 p-2" style={{ borderRadius: 'calc(22px * var(--g-roundness-mult))', borderColor: 'var(--g-border)' }}>
                    {(['modpacks', 'mods', 'resourcepacks', 'shaders'] as MarketTab[]).map((tab) => (
                      <button
                        key={tab}
                        onClick={() => switchTab(tab)}
                        className={`px-4 py-3 text-xs font-black uppercase tracking-[0.18em] transition ${activeTab === tab ? 'text-white shadow-[0_0_0_1px_rgba(255,255,255,0.08)]' : 'text-white/55 hover:bg-white/[0.04] hover:text-white/85'}`}
                        style={{
                          borderRadius: 'calc(16px * var(--g-roundness-mult))',
                          background: activeTab === tab ? 'var(--g-accent-gradient)' : 'transparent'
                        }}
                      >
                        {tab === 'modpacks' ? 'Modpacks' : tab === 'mods' ? 'Mods' : tab === 'resourcepacks' ? 'Resourcepacks' : 'Shaders'}
                      </button>
                    ))}
                  </div>

                  <div className={`grid grid-cols-1 gap-3 ${activeTab === 'modpacks' ? 'lg:grid-cols-[1fr_190px_130px]' : 'lg:grid-cols-[1fr_190px_260px_130px]'}`}>
                    <div className="flex h-12 items-center gap-3 border px-4" style={{ borderRadius: 'calc(18px * var(--g-roundness-mult))', borderColor: 'color-mix(in srgb, var(--g-accent) 24%, var(--g-border))', background: 'color-mix(in srgb, var(--g-soft) 84%, #000 16%)' }}>
                      <Search size={15} className="text-white/55" />
                      <input
                        value={currentQuery}
                        onChange={(event) => setQueryByTab((prev) => ({ ...prev, [activeTab]: event.target.value }))}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') void runSearch(activeTab);
                        }}
                        placeholder={`Search ${activeTab}...`}
                        className="w-full bg-transparent text-sm font-semibold text-white outline-none placeholder:text-white/28"
                      />
                    </div>

                    <div ref={sourceRef} className="relative">
                      <button onClick={() => setSourceOpen((v) => !v)} className="g-select-trigger h-12 w-full px-4 text-sm font-bold inline-flex items-center justify-between">
                        <span>{source === 'all' ? 'All Sources' : source === 'modrinth' ? 'Modrinth' : 'CurseForge'}</span>
                        <ChevronDown size={14} className={sourceOpen ? 'rotate-180 transition-transform' : 'transition-transform'} />
                      </button>
                      {sourceOpen && (
                        <div className="absolute left-0 right-0 top-[54px] z-[320] g-select-menu p-1.5">
                          {(['all', 'modrinth', 'curseforge'] as SourceFilter[]).map((item) => (
                            <button key={item} onClick={() => { setSource(item); setSourceOpen(false); }} className="g-select-option w-full px-3 py-2 text-left text-sm font-bold">
                              {item === 'all' ? 'All Sources' : item === 'modrinth' ? 'Modrinth' : 'CurseForge'}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {activeTab !== 'modpacks' && (
                      <div ref={instanceRef} className="relative">
                        <button onClick={() => setInstanceOpen((v) => !v)} className="g-select-trigger h-12 w-full px-4 text-sm font-bold inline-flex items-center justify-between">
                          <span className="truncate">{selectedInstance ? `${selectedInstance.name} (${selectedInstance.mcVersion})` : 'Select instance'}</span>
                          <ChevronDown size={14} className={instanceOpen ? 'rotate-180 transition-transform' : 'transition-transform'} />
                        </button>
                        {instanceOpen && (
                          <div className="absolute left-0 right-0 top-[54px] z-[320] max-h-[260px] overflow-y-auto g-select-menu p-1.5">
                            {instances.map((instance) => (
                              <button key={instance.id} onClick={() => { setSelectedInstanceId(instance.id); setInstanceOpen(false); }} className="g-select-option w-full px-3 py-2 text-left text-sm font-bold">
                                {instance.name} ({instance.loader} {instance.mcVersion})
                              </button>
                            ))}
                            {instances.length === 0 && <p className="px-3 py-2 text-xs text-white/45">No instances yet.</p>}
                          </div>
                        )}
                      </div>
                    )}

                    <button onClick={() => { void runSearch(activeTab); }} disabled={searching} className="h-12 px-4 text-xs font-black uppercase tracking-[0.18em] text-white disabled:opacity-50" style={{ borderRadius: 'calc(18px * var(--g-roundness-mult))', background: 'var(--g-accent-gradient)', boxShadow: '0 10px 24px color-mix(in srgb, var(--g-accent) 34%, transparent)' }}>
                      {searching ? 'Searching' : 'Search'}
                    </button>
                  </div>

                  {status && <p className="text-xs text-white/55">{status}</p>}

                  <div className="space-y-3">
                    {currentResults.map((item) => {
                      const rowId = `${item.source}:${item.id}`;
                      const versionCount = 'availableVersions' in item ? item.availableVersions.length : 0;
                      const tags = 'supportedLoaders' in item ? item.supportedLoaders.slice(0, 4) : [];
                      return (
                        <article
                          key={rowId}
                          className="grid grid-cols-[70px_1fr_auto] items-center gap-4 border px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                          style={{
                            borderRadius: 'calc(22px * var(--g-roundness-mult))',
                            borderColor: 'color-mix(in srgb, var(--g-border) 82%, transparent)',
                            background: 'linear-gradient(180deg, color-mix(in srgb, var(--g-surface-strong) 82%, transparent), color-mix(in srgb, var(--g-shell-strong) 88%, #000 12%))'
                          }}
                        >
                          <div className="flex h-16 w-16 items-center justify-center overflow-hidden border bg-black/35" style={{ borderRadius: 'calc(18px * var(--g-roundness-mult))', borderColor: 'var(--g-border)' }}>
                            {item.iconUrl ? <img src={item.iconUrl} alt={item.title} className="h-full w-full object-cover" /> : activeTab === 'resourcepacks' ? <ImageIcon size={18} className="text-white/45" /> : activeTab === 'mods' || activeTab === 'shaders' ? <Sparkles size={18} className="text-white/45" /> : <Package2 size={18} className="text-white/45" />}
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h2 className="truncate text-xl font-black text-white">{item.title}</h2>
                              {item.title.toLowerCase().includes('fabulously optimized') && <span className="rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.16em]" style={{ borderColor: 'color-mix(in srgb, var(--g-success) 42%, transparent)', background: 'color-mix(in srgb, var(--g-success) 18%, transparent)', color: 'var(--g-text)' }}>Extra Featured</span>}
                            </div>
                            <p className="mt-1 line-clamp-2 text-sm text-white/62">{item.description || 'No description provided.'}</p>
                            <div className="mt-3 flex flex-wrap gap-2">
                              <span className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white/72">{item.source}</span>
                              {'author' in item && item.author && <span className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white/72">{item.author}</span>}
                              {'supportedLoaders' in item && tags.map((tag) => <span key={tag} className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white/72">{tag}</span>)}
                              {versionCount > 0 && <span className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white/72">{versionCount} versions</span>}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-3">
                            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/45">{compactDownloads(item.downloads)} downloads</p>
                            <button
                              onClick={() => { void installCurrentItem(item); }}
                              disabled={installingId === rowId || ((activeTab === 'mods' || activeTab === 'resourcepacks' || activeTab === 'shaders') && !selectedInstance)}
                              className="inline-flex h-10 items-center gap-2 border px-4 text-[10px] font-black uppercase tracking-[0.16em] disabled:opacity-50"
                              style={{
                                borderRadius: 'calc(12px * var(--g-roundness-mult))',
                                borderColor: 'color-mix(in srgb, var(--g-success) 44%, transparent)',
                                background: 'color-mix(in srgb, var(--g-success) 18%, transparent)',
                                color: 'color-mix(in srgb, var(--g-success) 68%, #ffffff 32%)'
                              }}
                            >
                              <Download size={12} />
                              {installingId === rowId ? 'Installing' : 'Install'}
                            </button>
                          </div>
                        </article>
                      );
                    })}
                    {currentResults.length === 0 && <div className="border bg-black/20 px-5 py-10 text-center text-sm text-white/48" style={{ borderRadius: 'calc(22px * var(--g-roundness-mult))', borderColor: 'var(--g-border)' }}>Featured results will load here, then search can narrow them down.</div>}
                  </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {versionModalFor && createPortal(
        <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div
            className="w-full max-w-md border p-5 shadow-[0_30px_80px_rgba(0,0,0,0.5)]"
            style={{
              borderRadius: 'calc(24px * var(--g-roundness-mult))',
              borderColor: 'color-mix(in srgb, var(--g-accent) 32%, var(--g-border))',
              background: 'color-mix(in srgb, var(--g-shell-strong) 94%, #000 6%)'
            }}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] g-accent-text">Install Modpack</p>
                <h3 className="mt-2 text-xl font-black text-white">{versionModalFor.title}</h3>
              </div>
              <button onClick={() => setVersionModalFor(null)} className="g-window-btn"><X size={14} /></button>
            </div>
            <div ref={versionRef} className="relative mt-4 z-[520]">
              <button onClick={() => setVersionOpen((v) => !v)} className="g-select-trigger h-11 w-full px-3 text-sm font-bold inline-flex items-center justify-between">
                <span>{selectedVersion || 'Select version'}</span>
                <ChevronDown size={14} className={versionOpen ? 'rotate-180 transition-transform' : 'transition-transform'} />
              </button>
              {versionOpen && (
                <div className="absolute left-0 right-0 top-[46px] z-[540] max-h-[240px] overflow-y-auto g-select-menu p-1.5">
                  {(availableVersions.length > 0 ? availableVersions : ['1.21.1']).map((version) => (
                    <button key={version} onClick={() => { setSelectedVersion(version); setVersionOpen(false); }} className="g-select-option w-full px-3 py-2 text-left text-sm font-bold">
                      {version}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button onClick={() => setVersionModalFor(null)} className="g-btn h-10 text-xs font-extrabold uppercase tracking-[0.12em]">Cancel</button>
              <button
                onClick={() => { void installModpack(); }}
                className="h-10 border text-xs font-extrabold uppercase tracking-[0.12em]"
                style={{
                  borderRadius: 'calc(12px * var(--g-roundness-mult))',
                  borderColor: 'color-mix(in srgb, var(--g-success) 44%, transparent)',
                  background: 'color-mix(in srgb, var(--g-success) 18%, transparent)',
                  color: 'color-mix(in srgb, var(--g-success) 68%, #ffffff 32%)'
                }}
              >
                Install
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
