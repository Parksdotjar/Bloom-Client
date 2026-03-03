import { useMemo, useRef, useState, useEffect } from 'react';
import { ChevronDown, Download, Package2, Search, Sparkles, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { TauriApi, type MarketplacePack } from '../services/tauri';
import { PageWidgets, type PageWidget } from '../components/PageWidgets';

type SourceFilter = 'all' | 'modrinth' | 'curseforge';

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
  const sourceRef = useRef<HTMLDivElement | null>(null);

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
    };
    window.addEventListener('mousedown', onMouseDown);
    return () => window.removeEventListener('mousedown', onMouseDown);
  }, []);

  useEffect(() => {
    if (!versionModalFor) return;
    setSelectedVersion(availableVersions[0] || '1.21.1');
  }, [versionModalFor, availableVersions]);

  const runSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    setStatus(null);
    try {
      const rows = await TauriApi.marketplaceSearchModpacks(query.trim(), source);
      setResults(rows);
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
                      {pack.source} {pack.author ? `• ${pack.author}` : ''} • {compactDownloads(pack.downloads)} downloads • {versionCount} versions • {loaderText}
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
          {results.length === 0 && <p className="text-sm g-muted py-6 text-center">Search to load modpacks.</p>}
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
            <div className="mt-3">
              <select
                value={selectedVersion}
                onChange={(event) => setSelectedVersion(event.target.value)}
                className="g-select-trigger w-full h-11 px-3 text-sm font-bold"
              >
                {availableVersions.map((version) => (
                  <option key={version} value={version} className="text-black">{version}</option>
                ))}
                {availableVersions.length === 0 && <option value="1.21.1" className="text-black">1.21.1</option>}
              </select>
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
