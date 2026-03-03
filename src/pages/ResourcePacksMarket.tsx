import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Download, ImageIcon, Search } from 'lucide-react';
import { useInstances } from '../hooks/useInstances';
import { TauriApi, type MarketplacePack } from '../services/tauri';
import { PageWidgets, type PageWidget } from '../components/PageWidgets';

type SourceFilter = 'all' | 'modrinth' | 'curseforge';

function compactDownloads(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return `${value}`;
}

export function ResourcePacksMarket() {
  const { instances } = useInstances();
  const [query, setQuery] = useState('');
  const [source, setSource] = useState<SourceFilter>('all');
  const [selectedInstanceId, setSelectedInstanceId] = useState<string>('');
  const [sourceOpen, setSourceOpen] = useState(false);
  const [instanceOpen, setInstanceOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [results, setResults] = useState<MarketplacePack[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const sourceRef = useRef<HTMLDivElement | null>(null);
  const instanceRef = useRef<HTMLDivElement | null>(null);

  const selectedInstance = useMemo(
    () => instances.find((instance) => instance.id === selectedInstanceId) || null,
    [instances, selectedInstanceId]
  );

  useEffect(() => {
    const onMouseDown = (event: MouseEvent) => {
      const node = event.target as Node;
      if (sourceRef.current && !sourceRef.current.contains(node)) setSourceOpen(false);
      if (instanceRef.current && !instanceRef.current.contains(node)) setInstanceOpen(false);
    };
    window.addEventListener('mousedown', onMouseDown);
    return () => window.removeEventListener('mousedown', onMouseDown);
  }, []);

  const runSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    setStatus(null);
    try {
      const version = selectedInstance?.mcVersion || '1.21.1';
      const rows = await TauriApi.marketplaceSearchResourcepacks(query.trim(), source, version);
      setResults(rows);
      if (rows.length === 0) {
        if (source === 'curseforge') setStatus('No results. If CurseForge is empty, set CURSEFORGE_API_KEY for full access.');
        else setStatus('No resource packs matched this search.');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(`Search failed: ${message}`);
    } finally {
      setSearching(false);
    }
  };

  const installPack = async (pack: MarketplacePack) => {
    if (!selectedInstance) {
      setStatus('Pick an instance first.');
      return;
    }
    const rowId = `${pack.source}:${pack.id}`;
    setInstallingId(rowId);
    setStatus(`Installing ${pack.title}...`);
    try {
      const file = await TauriApi.marketplaceInstallResourcepack(selectedInstance.id, pack.source, pack.id, selectedInstance.mcVersion);
      setStatus(`Installed ${file} into ${selectedInstance.name}/resourcepacks.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(`Install failed: ${message}`);
    } finally {
      setInstallingId(null);
    }
  };

  const heroWidget = (
    <section className="g-panel-strong p-6">
        <p className="text-[10px] font-extrabold tracking-[0.2em] uppercase g-accent-text">Resource Packs</p>
        <h1 className="text-5xl font-extrabold mt-1">Discover & Install</h1>
        <p className="text-sm g-muted mt-1">Search Modrinth + CurseForge resource packs and install to an instance.</p>
      </section>
  );

  const searchWidget = (
    <section className="g-panel p-4 space-y-3 relative z-[120]">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_220px_280px_140px] gap-2">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 h-11 flex items-center gap-2">
            <Search size={14} className="text-white/60" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void runSearch();
              }}
              placeholder="Search resource packs..."
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

          <div ref={instanceRef} className="relative z-[140]">
            <button onClick={() => setInstanceOpen((v) => !v)} className="g-select-trigger w-full h-11 px-3 text-sm font-bold inline-flex items-center justify-between">
              <span className="truncate">
                {selectedInstance ? `${selectedInstance.name} (${selectedInstance.mcVersion})` : 'Select instance...'}
              </span>
              <ChevronDown size={14} className={instanceOpen ? 'rotate-180 transition-transform' : 'transition-transform'} />
            </button>
            {instanceOpen && (
              <div className="absolute left-0 right-0 top-[46px] z-[400] g-select-menu p-1.5 max-h-[260px] overflow-y-auto">
                {instances.map((instance) => (
                  <button
                    key={instance.id}
                    onClick={() => {
                      setSelectedInstanceId(instance.id);
                      setInstanceOpen(false);
                    }}
                    className="g-select-option w-full text-left px-3 py-2 text-sm font-bold"
                  >
                    {instance.name} ({instance.loader} {instance.mcVersion})
                  </button>
                ))}
                {instances.length === 0 && <p className="px-3 py-2 text-xs g-muted">No instances yet.</p>}
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
          {results.map((pack) => {
            const rowId = `${pack.source}:${pack.id}`;
            const versionCount = pack.availableVersions.length;
            return (
              <article key={rowId} className="rounded-xl border border-white/10 bg-white/[0.03] p-3 flex items-center justify-between gap-3">
                <div className="min-w-0 flex items-center gap-3">
                  <div className="w-12 h-12 rounded-lg border border-white/10 bg-white/[0.04] overflow-hidden flex items-center justify-center">
                    {pack.iconUrl ? <img src={pack.iconUrl} alt={pack.title} className="w-full h-full object-cover" /> : <ImageIcon size={15} className="text-white/50" />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-base font-extrabold truncate">{pack.title}</p>
                    <p className="text-xs g-muted truncate">{pack.description}</p>
                    <p className="text-[10px] uppercase tracking-[0.12em] g-muted mt-1">
                      {pack.source} {pack.author ? `• ${pack.author}` : ''} • {compactDownloads(pack.downloads)} downloads • {versionCount} versions
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => { void installPack(pack); }}
                  disabled={installingId === rowId || !selectedInstance}
                  className="g-btn-accent h-10 px-4 text-xs font-extrabold uppercase tracking-[0.12em] inline-flex items-center gap-1 disabled:opacity-45"
                >
                  <Download size={13} /> {installingId === rowId ? 'Installing...' : 'Install'}
                </button>
              </article>
            );
          })}
          {results.length === 0 && <p className="text-sm g-muted py-6 text-center">Search to load resource packs.</p>}
        </div>
      </section>
  );

  const widgets: PageWidget[] = [
    { id: 'resourcepacks-hero', title: 'Header', defaultSlot: 'hero', content: heroWidget },
    { id: 'resourcepacks-search', title: 'Search', defaultSlot: 'rightTop', content: searchWidget },
    { id: 'resourcepacks-results', title: 'Results', defaultSlot: 'leftTop', content: resultsWidget }
  ];

  return <PageWidgets pageKey="resourcepacks" widgets={widgets} />;
}
