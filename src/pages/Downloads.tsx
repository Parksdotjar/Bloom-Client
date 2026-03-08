import { open } from '@tauri-apps/plugin-dialog';
import { FolderUp, Package2, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageWidgets, type PageWidget } from '../components/PageWidgets';
import { TauriApi, type MarketplacePack } from '../services/tauri';
import { useInstances } from '../hooks/useInstances';

type SourceFilter = 'modrinth';

function compactDownloads(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return `${value}`;
}

export function Downloads() {
  const navigate = useNavigate();
  const { instances, loadInstances } = useInstances();
  const [query, setQuery] = useState('Fabulously Optimized');
  const [gameVersion, setGameVersion] = useState('1.21.1');
  const [source] = useState<SourceFilter>('modrinth');
  const [results, setResults] = useState<MarketplacePack[]>([]);
  const [searching, setSearching] = useState(false);
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [localImporting, setLocalImporting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const totalInstances = instances.length;

  const featuredTitle = useMemo(() => {
    const top = results[0];
    return top ? top.title : 'Modpack Importer';
  }, [results]);

  const runSearch = async () => {
    const effectiveQuery = query.trim();
    if (!effectiveQuery) {
      setStatus('Enter a modpack name to search Modrinth.');
      return;
    }
    setSearching(true);
    setStatus(null);
    try {
      const rows = await TauriApi.marketplaceSearchModpacks(effectiveQuery, source);
      const filtered = rows
        .filter((row) => row.source === 'modrinth')
        .sort((a, b) => b.downloads - a.downloads);
      setResults(filtered);
      if (filtered.length === 0) setStatus('No Modrinth modpacks matched that search.');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(`Search failed: ${message}`);
    } finally {
      setSearching(false);
    }
  };

  const installFromMarketplace = async (pack: MarketplacePack) => {
    const rowId = `${pack.source}:${pack.id}`;
    setInstallingId(rowId);
    setStatus(`Importing ${pack.title} for ${gameVersion}...`);
    try {
      const instance = await TauriApi.marketplaceInstallModpackInstance('modrinth', pack.id, gameVersion);
      await loadInstances();
      setStatus(`Created instance "${instance.name}".`);
      navigate(`/instance-editor?id=${encodeURIComponent(instance.id)}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(`Import failed: ${message}`);
    } finally {
      setInstallingId(null);
    }
  };

  const importLocalFile = async () => {
    setLocalImporting(true);
    setStatus(null);
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'Modpacks', extensions: ['mrpack', 'zip'] }]
      });
      if (!selected || Array.isArray(selected)) return;

      const instance = await TauriApi.importLocalModpackInstance(selected, gameVersion);
      await loadInstances();
      setStatus(`Imported ${instance.name} from local archive.`);
      navigate(`/instance-editor?id=${encodeURIComponent(instance.id)}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(`Local import failed: ${message}`);
    } finally {
      setLocalImporting(false);
    }
  };

  const heroWidget = (
    <section className="g-panel-strong p-6">
      <p className="text-[10px] uppercase tracking-[0.2em] font-extrabold g-accent-text">Importer</p>
      <h1 className="mt-1 text-5xl font-extrabold text-white">Modpack Importer</h1>
      <p className="mt-1 text-sm g-muted">Pull Modrinth packs into a fresh instance or import a local `.mrpack` or `.zip`.</p>
    </section>
  );

  const modrinthWidget = (
    <section className="g-panel p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-white/55">Modrinth Import</p>
          <p className="mt-1 text-sm g-muted">Search Modrinth and create a new instance from the selected pack.</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-right">
          <p className="text-[10px] uppercase tracking-[0.14em] text-white/40">Instances</p>
          <p className="text-lg font-extrabold text-white">{totalInstances}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_140px_120px]">
        <div className="flex h-12 items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4">
          <Search size={15} className="text-white/50" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void runSearch();
            }}
            placeholder="Search Modrinth modpacks..."
            className="w-full bg-transparent text-sm font-semibold text-white outline-none placeholder:text-white/35"
          />
        </div>
        <input
          value={gameVersion}
          onChange={(event) => setGameVersion(event.target.value)}
          className="g-input h-12 px-4 text-sm font-semibold outline-none"
          placeholder="1.21.1"
        />
        <button onClick={() => { void runSearch(); }} disabled={searching} className="g-btn-accent h-12 px-4 text-xs font-extrabold uppercase tracking-[0.12em] disabled:opacity-50">
          {searching ? 'Searching' : 'Search'}
        </button>
      </div>

      <div className="space-y-3">
        {results.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-sm g-muted">
            Search results appear here. Featured query: {featuredTitle}.
          </div>
        ) : (
          results.slice(0, 8).map((pack) => {
            const rowId = `${pack.source}:${pack.id}`;
            return (
              <article key={rowId} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-3">
                      <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-white/[0.04]">
                        {pack.iconUrl ? <img src={pack.iconUrl} alt={pack.title} className="h-full w-full object-cover" /> : <Package2 size={18} className="text-white/45" />}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-xl font-extrabold text-white">{pack.title}</p>
                        <p className="mt-1 text-xs text-white/55">
                          Modrinth {pack.author ? `| ${pack.author}` : ''} | {compactDownloads(pack.downloads)} downloads
                        </p>
                      </div>
                    </div>
                    <p className="mt-3 text-sm g-muted">{pack.description || 'No description provided.'}</p>
                  </div>
                  <button
                    onClick={() => { void installFromMarketplace(pack); }}
                    disabled={installingId === rowId}
                    className="g-btn-accent h-11 px-4 text-xs font-extrabold uppercase tracking-[0.12em] disabled:opacity-50"
                  >
                    {installingId === rowId ? 'Importing...' : 'Create Instance'}
                  </button>
                </div>
              </article>
            );
          })
        )}
      </div>
    </section>
  );

  const localWidget = (
    <section className="g-panel p-6 space-y-4">
      <div>
        <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-white/55">Local Archive Import</p>
        <p className="mt-1 text-sm g-muted">Pick a local `.mrpack` or `.zip`. `.mrpack` imports will unpack overrides and downloads automatically.</p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <label className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-white/45">Minecraft Version</label>
        <input
          value={gameVersion}
          onChange={(event) => setGameVersion(event.target.value)}
          className="g-input mt-2 h-11 w-full px-4 text-sm font-semibold outline-none"
          placeholder="1.21.1"
        />
        <button onClick={() => { void importLocalFile(); }} disabled={localImporting} className="g-btn mt-4 h-11 w-full px-4 text-xs font-extrabold uppercase tracking-[0.12em] disabled:opacity-50 inline-flex items-center justify-center gap-2">
          <FolderUp size={14} />
          {localImporting ? 'Importing...' : 'Choose .mrpack or .zip'}
        </button>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-white/45">Importer Notes</p>
        <div className="mt-3 space-y-2 text-sm g-muted">
          <p>Modrinth marketplace packs create a new Fabric instance directly.</p>
          <p>Local `.mrpack` imports unpack pack contents and write an install report into the instance folder.</p>
          <p>Local `.zip` imports are stored with the instance so you can manage the pack manually afterward.</p>
        </div>
      </div>

      {status && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/75">
          {status}
        </div>
      )}
    </section>
  );

  const widgets: PageWidget[] = [
    { id: 'importer-hero', title: 'Header', defaultSlot: 'hero', content: heroWidget },
    { id: 'importer-modrinth', title: 'Modrinth', defaultSlot: 'leftTop', content: modrinthWidget },
    { id: 'importer-local', title: 'Local Import', defaultSlot: 'rightTop', content: localWidget }
  ];

  return <PageWidgets pageKey="importer" widgets={widgets} />;
}
