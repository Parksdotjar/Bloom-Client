import { useMemo, useRef, useState, useEffect } from 'react';
import { ChevronDown, Download, Package2, Search, Sparkles, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { TauriApi, type MarketplacePack } from '../services/tauri';
import { PageWidgets, type PageWidget } from '../components/PageWidgets';

type SourceFilter = 'all' | 'modrinth' | 'curseforge';
const BLOOM_FEATURED_PACK = {
  id: 'bloom-performance-overdrive',
  title: 'Bloom Preformance | Overdrive',
  description:
    'Bloom-curated Fabric 1.21.11 performance and utility pack with Sodium/Lithium/C2ME core optimizations plus Flashback, Essential, Simple Voice Chat, JourneyMap, Zoomify, Freecam, and other client QoL mods.',
  minecraftVersion: '1.21.11',
  modCount: 51
} as const;

function compactDownloads(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return `${value}`;
}

export function ModpacksMarket() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [source, setSource] = useState<SourceFilter>('all');
  const [sourceOpen, setSourceOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [results, setResults] = useState<MarketplacePack[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [versionModalFor, setVersionModalFor] = useState<MarketplacePack | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<string>('');
  const [versionOpen, setVersionOpen] = useState(false);
  const [didLoadFeatured, setDidLoadFeatured] = useState(false);
  const sourceRef = useRef<HTMLDivElement | null>(null);
  const versionRef = useRef<HTMLDivElement | null>(null);

  const availableVersions = useMemo(() => {
    if (!versionModalFor) return [];
    const unique = Array.from(new Set(versionModalFor.availableVersions)).filter(Boolean);
    unique.sort((a, b) => b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' }));
    return unique;
  }, [versionModalFor]);

  useEffect(() => {
    const onMouseDown = (event: MouseEvent) => {
      const node = event.target as Node;
      if (sourceRef.current && !sourceRef.current.contains(node)) setSourceOpen(false);
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

  const runSearch = async (forcedQuery?: string) => {
    const effectiveQuery = (forcedQuery ?? query).trim();
    if (!effectiveQuery) return;
    setSearching(true);
    setStatus(null);
    try {
      const rows = await TauriApi.marketplaceSearchModpacks(effectiveQuery, source);
      const sorted = [...rows].sort((a, b) => {
        const aScore = a.title.toLowerCase() === 'fabulously optimized' ? 2 : a.title.toLowerCase().includes('fabulously optimized') ? 1 : 0;
        const bScore = b.title.toLowerCase() === 'fabulously optimized' ? 2 : b.title.toLowerCase().includes('fabulously optimized') ? 1 : 0;
        if (aScore !== bScore) return bScore - aScore;
        return b.downloads - a.downloads;
      });
      setResults(sorted);
      if (rows.length === 0) {
        if (source === 'curseforge') setStatus('No results. If CurseForge is empty, set CURSEFORGE_API_KEY for full access.');
        else setStatus('No modpacks matched this search.');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(`Search failed: ${message}`);
    } finally {
      setSearching(false);
    }
  };

  useEffect(() => {
    if (didLoadFeatured) return;
    setDidLoadFeatured(true);
    setQuery('Fabulously Optimized');
    void runSearch('Fabulously Optimized');
  }, [didLoadFeatured]);

  const openInstallModal = (pack: MarketplacePack) => {
    setVersionModalFor(pack);
  };

  const installPack = async () => {
    if (!versionModalFor || !selectedVersion) return;
    const rowId = `${versionModalFor.source}:${versionModalFor.id}`;
    setInstallingId(rowId);
    setStatus(`Installing ${versionModalFor.title} for ${selectedVersion}...`);
    try {
      const instance = await TauriApi.marketplaceInstallModpackInstance(versionModalFor.source, versionModalFor.id, selectedVersion);
      setStatus(`Created instance "${instance.name}". You can now customize name and icon.`);
      setVersionModalFor(null);
      navigate(`/instance-editor?id=${encodeURIComponent(instance.id)}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(`Install failed: ${message}`);
    } finally {
      setInstallingId(null);
    }
  };

  const installFeaturedPack = async () => {
    const rowId = `featured:${BLOOM_FEATURED_PACK.id}`;
    setInstallingId(rowId);
    setStatus(`Installing ${BLOOM_FEATURED_PACK.title}...`);
    try {
      const instance = await TauriApi.featuredInstallModpack(BLOOM_FEATURED_PACK.id);
      setStatus(`Created instance "${instance.name}". You can now customize name and icon.`);
      navigate(`/instance-editor?id=${encodeURIComponent(instance.id)}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(`Install failed: ${message}`);
    } finally {
      setInstallingId(null);
    }
  };

  const heroWidget = (
    <section className="g-panel-strong p-6">
        <p className="text-[10px] font-extrabold tracking-[0.2em] uppercase g-accent-text">Modpacks</p>
        <h1 className="text-5xl font-extrabold mt-1">Browse & Create Instance</h1>
        <p className="text-sm g-muted mt-1">Install a modpack and auto-create a new instance from it.</p>
      </section>
  );

  const searchWidget = (
    <section className="g-panel p-4 space-y-3 relative z-[120]">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_220px_140px] gap-2">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 h-11 flex items-center gap-2">
            <Search size={14} className="text-white/60" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void runSearch();
              }}
              placeholder="Search modpacks..."
              className="w-full bg-transparent text-sm font-semibold outline-none text-[var(--g-text)]"
            />
          </div>

          <div ref={sourceRef} className="relative z-[140]">
            <button onClick={() => setSourceOpen((v) => !v)} className="g-select-trigger w-full h-11 px-3 text-sm font-bold inline-flex items-center justify-between">
              <span>{source === 'all' ? 'All Sources' : source === 'modrinth' ? 'Modrinth' : 'CurseForge'}</span>
              <ChevronDown size={14} className={sourceOpen ? 'rotate-180 transition-transform' : 'transition-transform'} />
            </button>
            {sourceOpen && (
              <div className="absolute left-0 right-0 top-[46px] z-[400] g-select-menu p-1.5">
                {(['all', 'modrinth', 'curseforge'] as SourceFilter[]).map((item) => (
                  <button
                    key={item}
                    onClick={() => {
                      setSource(item);
                      setSourceOpen(false);
                    }}
                    className="g-select-option w-full text-left px-3 py-2 text-sm font-bold"
                  >
                    {item === 'all' ? 'All Sources' : item === 'modrinth' ? 'Modrinth' : 'CurseForge'}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button onClick={() => { void runSearch(); }} disabled={searching} className="g-btn-accent h-11 text-xs font-extrabold uppercase tracking-[0.12em] disabled:opacity-50">
            {searching ? 'Searching...' : 'Search'}
          </button>
        </div>
        {status && <p className="text-xs g-muted">{status}</p>}
      </section>
  );

  const resultsWidget = (
    <section className="g-panel p-4 relative z-[10]">
        <p className="text-xs uppercase tracking-[0.14em] font-extrabold g-muted">Results</p>
        <div className="mt-3 space-y-2">
          <article className="rounded-xl border border-[color-mix(in_srgb,var(--g-accent)_28%,transparent)] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--g-soft)_82%,#07110d_18%),color-mix(in_srgb,var(--g-shell-strong)_94%,#000_6%))] p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="inline-flex items-center gap-2 rounded-full border border-[color-mix(in_srgb,var(--g-success)_32%,transparent)] bg-[color-mix(in_srgb,var(--g-success)_14%,transparent)] px-3 py-1 text-[10px] font-black uppercase tracking-[0.24em] text-[color-mix(in_srgb,var(--g-success)_70%,#fff_30%)]">
                  <Sparkles size={12} /> Bloom Featured
                </div>
                <h2 className="mt-3 text-2xl font-black text-white">{BLOOM_FEATURED_PACK.title}</h2>
                <p className="mt-2 text-sm text-white/66">{BLOOM_FEATURED_PACK.description}</p>
                <p className="mt-3 text-[10px] uppercase tracking-[0.16em] text-white/52">MC {BLOOM_FEATURED_PACK.minecraftVersion} | {BLOOM_FEATURED_PACK.modCount} mods</p>
              </div>
              <button
                onClick={() => { void installFeaturedPack(); }}
                disabled={installingId === `featured:${BLOOM_FEATURED_PACK.id}`}
                className="g-btn-accent h-10 px-4 text-xs font-extrabold uppercase tracking-[0.12em] disabled:opacity-45"
              >
                {installingId === `featured:${BLOOM_FEATURED_PACK.id}` ? 'Installing...' : 'Install Featured'}
              </button>
            </div>
          </article>
          {results.map((pack) => {
            const rowId = `${pack.source}:${pack.id}`;
            const loaderText = pack.supportedLoaders.length > 0 ? pack.supportedLoaders.join(', ') : 'loader unknown';
            const versionCount = pack.availableVersions.length;
            return (
              <article key={rowId} className="rounded-xl border border-white/10 bg-white/[0.03] p-3 flex items-center justify-between gap-3">
                <div className="min-w-0 flex items-center gap-3">
                  <div className="w-12 h-12 rounded-lg border border-white/10 bg-white/[0.04] overflow-hidden flex items-center justify-center">
                    {pack.iconUrl ? <img src={pack.iconUrl} alt={pack.title} className="w-full h-full object-cover" /> : <Package2 size={15} className="text-white/50" />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-base font-extrabold truncate">{pack.title}</p>
                    <p className="text-xs g-muted truncate">{pack.description}</p>
                    <p className="text-[10px] uppercase tracking-[0.12em] g-muted mt-1">
                      {pack.source} {pack.author ? `| ${pack.author}` : ''} | {compactDownloads(pack.downloads)} downloads | {versionCount} versions | {loaderText}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => openInstallModal(pack)}
                  disabled={installingId === rowId}
                  className="g-btn-accent h-10 px-4 text-xs font-extrabold uppercase tracking-[0.12em] inline-flex items-center gap-1 disabled:opacity-45"
                >
                  <Download size={13} /> {installingId === rowId ? 'Installing...' : 'Install'}
                </button>
              </article>
            );
          })}
          {results.length === 0 && <p className="text-sm g-muted py-6 text-center">Featured modpacks load here first, then search can refine it.</p>}
        </div>
      </section>
  );

  const widgets: PageWidget[] = [
    { id: 'modpacks-hero', title: 'Header', defaultSlot: 'hero', content: heroWidget },
    { id: 'modpacks-search', title: 'Search', defaultSlot: 'rightTop', content: searchWidget },
    { id: 'modpacks-results', title: 'Results', defaultSlot: 'leftTop', content: resultsWidget }
  ];

  return (
    <>
      <PageWidgets pageKey="modpacks" widgets={widgets} />
      {versionModalFor && createPortal(
        <div className="fixed inset-0 z-[500] bg-black/65 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md g-panel-strong p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-extrabold text-white">Select Version</h3>
              <button onClick={() => setVersionModalFor(null)} className="g-window-btn"><X size={14} /></button>
            </div>
            <p className="text-sm g-muted mt-1">{versionModalFor.title}</p>
            <p className="text-xs g-muted mt-1">Choose one supported Minecraft version before install.</p>
            <div ref={versionRef} className="relative mt-3 z-[520]">
              <button onClick={() => setVersionOpen((v) => !v)} className="g-select-trigger w-full h-11 px-3 text-sm font-bold inline-flex items-center justify-between">
                <span>{selectedVersion || 'Select version'}</span>
                <ChevronDown size={14} className={versionOpen ? 'rotate-180 transition-transform' : 'transition-transform'} />
              </button>
              {versionOpen && (
                <div className="absolute left-0 right-0 top-[46px] z-[540] g-select-menu p-1.5 max-h-[240px] overflow-y-auto">
                  {(availableVersions.length > 0 ? availableVersions : ['1.21.1']).map((version) => (
                    <button
                      key={version}
                      onClick={() => {
                        setSelectedVersion(version);
                        setVersionOpen(false);
                      }}
                      className="g-select-option w-full text-left px-3 py-2 text-sm font-bold"
                    >
                      {version}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button onClick={() => setVersionModalFor(null)} className="g-btn h-10 text-xs font-extrabold uppercase tracking-[0.12em]">Cancel</button>
              <button onClick={() => { void installPack(); }} className="g-btn-accent h-10 text-xs font-extrabold uppercase tracking-[0.12em] inline-flex items-center justify-center gap-1">
                <Sparkles size={12} /> Install
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}


