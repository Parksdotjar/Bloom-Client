import { Download, FileText, Pause, Wrench } from 'lucide-react';
import { useDownloader } from '../hooks/useDownloader';
import { useInstances } from '../hooks/useInstances';
import { PageWidgets, type PageWidget } from '../components/PageWidgets';

export function Downloads() {
  const { activeDownloads } = useDownloader();
  const { instances } = useInstances();

  const activeId = Object.keys(activeDownloads).find((id) => activeDownloads[id].status !== 'Complete') || null;
  const activeEvent = activeId ? activeDownloads[activeId] : null;
  const activeInstance = activeId ? instances.find((item) => item.id === activeId) : null;

  const progress = activeEvent?.progress ?? 0;

  const heroWidget = (
    <section className="g-panel-strong p-6">
      <p className="text-[10px] uppercase tracking-[0.2em] font-extrabold g-accent-text">Downloads</p>
      <h1 className="text-5xl font-extrabold text-white mt-1">Install Queue</h1>
      <p className="text-sm g-muted mt-1">Live progress for runtime and asset installs.</p>
    </section>
  );

  const queueWidget = (
    <section className="g-panel p-6">
      {!activeEvent ? (
        <div className="text-center py-10">
          <Download className="mx-auto text-white/45" size={34} />
          <p className="mt-3 text-2xl font-extrabold text-white">No active downloads</p>
          <p className="text-sm g-muted mt-1">Launch an instance to begin install.</p>
        </div>
      ) : (
        <>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-2xl font-extrabold text-white">{activeInstance?.name || 'Installing'}</p>
              <p className="text-sm g-muted mt-1">{activeEvent.status}</p>
            </div>
            <p className="text-4xl font-extrabold g-accent-text">{Math.floor(progress)}%</p>
          </div>

          <div className="mt-4 h-3 rounded-full bg-[var(--g-track)] overflow-hidden">
            <div className="h-full g-accent-grad" style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
          </div>

          <div className="mt-4 flex gap-2">
            <button className="g-btn h-10 px-4 text-xs font-extrabold uppercase tracking-[0.12em] inline-flex items-center gap-1"><Pause size={12} /> Pause</button>
            <button className="g-btn h-10 px-4 text-xs font-extrabold uppercase tracking-[0.12em] inline-flex items-center gap-1"><Wrench size={12} /> Repair</button>
            <button className="g-btn h-10 px-4 ml-auto text-xs font-extrabold uppercase tracking-[0.12em] inline-flex items-center gap-1"><FileText size={12} /> Logs</button>
          </div>
        </>
      )}
    </section>
  );

  const widgets: PageWidget[] = [
    { id: 'downloads-hero', title: 'Header', defaultSlot: 'hero', content: heroWidget },
    { id: 'downloads-queue', title: 'Queue', defaultSlot: 'leftTop', content: queueWidget }
  ];

  return <PageWidgets pageKey="downloads" widgets={widgets} />;
}
