import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Clock3, Play, Plus, RefreshCcw, Settings, Trash2 } from 'lucide-react';
import { useInstances } from '../hooks/useInstances';
import { CreateInstanceModal } from '../components/CreateInstanceModal';
import { useDownloader } from '../hooks/useDownloader';
import { useAuth } from '../hooks/useAuth';
import { PageWidgets, type PageWidget } from '../components/PageWidgets';

export function Instances() {
  const navigate = useNavigate();
  const location = useLocation();
  const { instances, loading, error, loadInstances, deleteInstance, createInstance } = useInstances();
  const { startDownload, activeDownloads, disableIncompatibleMods } = useDownloader();
  const { authState } = useAuth();
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('action') === 'create') setIsCreateOpen(true);
  }, [location.search]);

  const headerWidget = (
    <section className="g-panel-strong p-6">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[10px] font-extrabold tracking-[0.2em] uppercase g-accent-text">Instances</p>
            <h1 className="text-5xl font-extrabold mt-1">Your Library</h1>
            <p className="text-sm g-muted mt-1">Select an instance to open full edit mode.</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => { void loadInstances(); }} className="g-btn h-11 px-4 text-xs font-extrabold uppercase tracking-[0.12em] inline-flex items-center gap-2"><RefreshCcw size={13} /> Refresh</button>
            <button onClick={() => setIsCreateOpen(true)} className="g-btn-accent h-11 px-5 text-xs font-extrabold uppercase tracking-[0.12em] inline-flex items-center gap-2"><Plus size={13} /> Create</button>
          </div>
        </div>
        {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
      </section>
  );

  const libraryWidget = loading ? (
    <section className="g-panel p-8 text-center text-sm font-extrabold tracking-[0.16em] uppercase g-muted">Loading instances...</section>
  ) : instances.length === 0 ? (
    <section className="g-panel p-10 text-center">
          <p className="text-2xl font-extrabold">No instances yet</p>
          <p className="text-sm g-muted mt-1">Create one to start.</p>
        </section>
  ) : (
    <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {instances.map((inst) => {
            const d = activeDownloads[inst.id];
            const installing = !!d && d.status !== 'Complete';

            return (
              <article key={inst.id} onClick={() => navigate(`/instance-editor?id=${encodeURIComponent(inst.id)}`)} className="group g-panel p-5 cursor-pointer hover:bg-white/[0.08]">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl border border-white/15 bg-white/[0.05] overflow-hidden flex items-center justify-center">
                        {inst.iconDataUrl ? <img src={inst.iconDataUrl} className="w-full h-full object-cover" /> : <span className="text-lg font-extrabold">{inst.name.slice(0, 1).toUpperCase()}</span>}
                      </div>
                      <h3 className="text-3xl font-extrabold truncate">{inst.name}</h3>
                    </div>
                    <p className="mt-2 text-xs g-muted inline-flex items-center gap-2"><Clock3 size={12} /> {inst.loader.toUpperCase()} {inst.mcVersion} • {new Date(inst.updatedAt).toLocaleString()}</p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={(event) => { event.stopPropagation(); void startDownload(inst, authState); }}
                      disabled={installing}
                      className="opacity-0 group-hover:opacity-100 transition-opacity g-btn-accent h-9 px-3 text-[10px] font-extrabold uppercase tracking-[0.12em] inline-flex items-center gap-1 disabled:opacity-50"
                    >
                      <Play size={12} /> {installing ? 'Running' : 'Launch'}
                    </button>
                    <button onClick={(event) => { event.stopPropagation(); navigate(`/instance-editor?id=${encodeURIComponent(inst.id)}&tab=settings`); }} className="g-btn h-9 w-9 inline-flex items-center justify-center"><Settings size={13} /></button>
                    <button onClick={(event) => { event.stopPropagation(); void deleteInstance(inst.id); }} className="g-btn h-9 w-9 inline-flex items-center justify-center text-red-300"><Trash2 size={13} /></button>
                  </div>
                </div>

                {d && (
                  <div className="mt-3">
                    <div className="h-1.5 rounded-full bg-[var(--g-track)] overflow-hidden">
                      <div className="h-full g-accent-grad" style={{ width: `${Math.max(0, Math.min(100, d.progress))}%` }} />
                    </div>
                    <p className="mt-1 text-[10px] uppercase tracking-[0.12em] font-extrabold text-white/50">{d.status}</p>
                    {d.remediation === 'disable_essential_conflict' && (
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          void disableIncompatibleMods(inst.id);
                        }}
                        className="mt-2 g-btn h-8 px-3 text-[10px] font-extrabold uppercase tracking-[0.12em] text-red-200 border-red-300/40"
                      >
                        Disable incompatible mods
                      </button>
                    )}
                  </div>
                )}
              </article>
            );
          })}
    </section>
  );

  const featuredModsWidget = (
    <section className="g-panel p-5 h-full">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-extrabold">Featured SMP Creator Mods</h2>
        <span className="text-[10px] uppercase tracking-[0.12em] font-extrabold g-muted">Community picks</span>
      </div>
      <p className="text-xs g-muted mt-1">Common performance/QOL mods used in SMP creator packs.</p>
      <div className="mt-4 space-y-2">
        {[
          { name: 'Sodium', type: 'Performance renderer' },
          { name: 'Lithium', type: 'Game logic optimization' },
          { name: 'FerriteCore', type: 'Memory optimization' },
          { name: 'Entity Culling', type: 'Render culling' },
          { name: 'No Chat Reports', type: 'Chat signing controls' },
          { name: 'Simple Voice Chat', type: 'Proximity voice' }
        ].map((mod) => (
          <div key={mod.name} className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
            <p className="text-sm font-extrabold">{mod.name}</p>
            <p className="text-xs g-muted">{mod.type}</p>
          </div>
        ))}
      </div>
      <button onClick={() => navigate('/mods')} className="mt-4 g-btn h-9 px-3 text-[10px] font-extrabold uppercase tracking-[0.12em]">
        Browse Mods Market
      </button>
    </section>
  );

  const widgets: PageWidget[] = [
    { id: 'instances-hero', title: 'Header', defaultSlot: 'hero', content: headerWidget },
    { id: 'instances-library', title: 'Library', defaultSlot: 'leftTop', content: libraryWidget },
    { id: 'instances-featured-mods', title: 'Featured Mods', defaultSlot: 'rightTop', content: featuredModsWidget }
  ];

  return (
    <>
      <PageWidgets pageKey="instances" widgets={widgets} />
      <CreateInstanceModal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} onSubmit={createInstance} />
    </>
  );
}

