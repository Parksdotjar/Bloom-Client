import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Eye, EyeOff, GripVertical, Play, Shield, Sparkles, UserRound } from 'lucide-react';
import { useInstances } from '../hooks/useInstances';
import { useAuth } from '../hooks/useAuth';
import { useDownloader } from '../hooks/useDownloader';

type HomeWidgetId = 'hero' | 'instances' | 'account' | 'metrics' | 'clock' | 'stopwatch';
type HomeWidget = { id: HomeWidgetId; visible: boolean };
type WidgetSlot = 'hero' | 'leftTop' | 'rightTop' | 'leftBottom' | 'rightBottom';

const WIDGETS_STORAGE_KEY = 'bloom_home_widgets';
const WIDGET_LAYOUT_STORAGE_KEY = 'bloom_home_widget_layout';
const ACCOUNT_LAUNCH_INSTANCE_KEY = 'bloom_account_launch_instance';
const SHOW_WIDGET_DOCKER_KEY = 'bloom_show_widget_docker';
const EXTRA_CHANGE_EVENT = 'bloom-extra-change';

const SLOT_LABELS: Record<WidgetSlot, string> = {
  hero: 'Hero',
  leftTop: 'Left Top',
  rightTop: 'Right Top',
  leftBottom: 'Left Bottom',
  rightBottom: 'Right Bottom'
};

const DEFAULT_LAYOUT: Record<HomeWidgetId, WidgetSlot> = {
  hero: 'hero',
  instances: 'leftTop',
  account: 'rightTop',
  metrics: 'leftBottom',
  clock: 'rightBottom',
  stopwatch: 'rightBottom'
};

export function Home() {
  const { instances } = useInstances();
  const { authState } = useAuth();
  const { startDownload, activeDownloads, disableIncompatibleMods } = useDownloader();

  const selected = instances[0] || null;
  const download = selected ? activeDownloads[selected.id] : undefined;
  const progress = download?.progress ?? 0;
  const [draggingWidget, setDraggingWidget] = useState<HomeWidgetId | null>(null);
  const [contextMenu, setContextMenu] = useState<{ widgetId: HomeWidgetId; x: number; y: number } | null>(null);
  const [showWidgetDocker, setShowWidgetDocker] = useState<boolean>(() => localStorage.getItem(SHOW_WIDGET_DOCKER_KEY) === 'true');
  const [accountLaunchInstanceId, setAccountLaunchInstanceId] = useState<string>(() => localStorage.getItem(ACCOUNT_LAUNCH_INSTANCE_KEY) || '');
  const [now, setNow] = useState<Date>(() => new Date());
  const [stopwatchRunning, setStopwatchRunning] = useState(false);
  const [stopwatchElapsedMs, setStopwatchElapsedMs] = useState(0);

  const chips = useMemo(
    () => [selected?.loader?.toUpperCase() || 'VANILLA', selected?.mcVersion || '1.21.1', authState ? authState.profile.name : 'OFFLINE'],
    [selected, authState]
  );

  const [widgets, setWidgets] = useState<HomeWidget[]>(() => {
    const defaults: HomeWidget[] = [
      { id: 'hero', visible: true },
      { id: 'instances', visible: true },
      { id: 'account', visible: true },
      { id: 'metrics', visible: true },
      { id: 'clock', visible: true },
      { id: 'stopwatch', visible: false }
    ];

    try {
      const raw = localStorage.getItem(WIDGETS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as HomeWidget[];
        const byId = new Map(parsed.map((entry) => [entry.id, entry.visible]));
        return defaults.map((entry) => ({ ...entry, visible: byId.get(entry.id) ?? entry.visible }));
      }
    } catch {
      // ignore
    }
    return defaults;
  });

  const [layout, setLayout] = useState<Record<HomeWidgetId, WidgetSlot>>(() => {
    try {
      const raw = localStorage.getItem(WIDGET_LAYOUT_STORAGE_KEY);
      if (!raw) return DEFAULT_LAYOUT;
      const parsed = JSON.parse(raw) as Partial<Record<HomeWidgetId, WidgetSlot>>;
      return {
        hero: parsed.hero || DEFAULT_LAYOUT.hero,
        instances: parsed.instances || DEFAULT_LAYOUT.instances,
        account: parsed.account || DEFAULT_LAYOUT.account,
        metrics: parsed.metrics || DEFAULT_LAYOUT.metrics,
        clock: parsed.clock || DEFAULT_LAYOUT.clock,
        stopwatch: parsed.stopwatch || DEFAULT_LAYOUT.stopwatch
      };
    } catch {
      return DEFAULT_LAYOUT;
    }
  });
  const draggingWidgetRef = useRef<HomeWidgetId | null>(null);
  const lastHoverSlotRef = useRef<WidgetSlot | null>(null);
  const slotRefs = useRef<Record<WidgetSlot, HTMLDivElement | null>>({
    hero: null,
    leftTop: null,
    rightTop: null,
    leftBottom: null,
    rightBottom: null
  });

  useEffect(() => {
    const onExtraChange = (event: Event) => {
      const custom = event as CustomEvent<{ showWidgetDocker?: boolean }>;
      setShowWidgetDocker(custom.detail?.showWidgetDocker === true);
    };
    window.addEventListener(EXTRA_CHANGE_EVENT, onExtraChange as EventListener);
    return () => window.removeEventListener(EXTRA_CHANGE_EVENT, onExtraChange as EventListener);
  }, []);

  useEffect(() => {
    draggingWidgetRef.current = draggingWidget;
  }, [draggingWidget]);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [contextMenu]);

  useEffect(() => {
    if (instances.length === 0) {
      setAccountLaunchInstanceId('');
      localStorage.removeItem(ACCOUNT_LAUNCH_INSTANCE_KEY);
      return;
    }

    const stillExists = instances.some((inst) => inst.id === accountLaunchInstanceId);
    if (!stillExists) {
      const next = instances[0].id;
      setAccountLaunchInstanceId(next);
      localStorage.setItem(ACCOUNT_LAUNCH_INSTANCE_KEY, next);
      return;
    }

    localStorage.setItem(ACCOUNT_LAUNCH_INSTANCE_KEY, accountLaunchInstanceId);
  }, [accountLaunchInstanceId, instances]);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!stopwatchRunning) return;
    const timer = setInterval(() => {
      setStopwatchElapsedMs((prev) => prev + 30);
    }, 30);
    return () => clearInterval(timer);
  }, [stopwatchRunning]);

  const persistLayout = (next: Record<HomeWidgetId, WidgetSlot>) => {
    setLayout(next);
    localStorage.setItem(WIDGET_LAYOUT_STORAGE_KEY, JSON.stringify(next));
  };

  const assignWidgetToSlot = (widgetId: HomeWidgetId, targetSlot: WidgetSlot) => {
    const occupant = (Object.keys(layout) as HomeWidgetId[]).find((id) => layout[id] === targetSlot);
    const currentSlot = layout[widgetId];
    if (!currentSlot) return;
    if (currentSlot === targetSlot) return;

    const next = { ...layout, [widgetId]: targetSlot };
    if (occupant && occupant !== widgetId) {
      next[occupant] = currentSlot;
    }
    persistLayout(next);
  };

  const endDrag = () => {
    setDraggingWidget(null);
    draggingWidgetRef.current = null;
    lastHoverSlotRef.current = null;
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
  };

  const beginWidgetDrag = (widgetId: HomeWidgetId, event: React.MouseEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    setDraggingWidget(widgetId);
    draggingWidgetRef.current = widgetId;
    lastHoverSlotRef.current = layout[widgetId] || null;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'grabbing';

    const onMouseMove = (moveEvent: MouseEvent) => {
      const current = draggingWidgetRef.current;
      if (!current) return;
      const x = moveEvent.clientX;
      const y = moveEvent.clientY;
      const slots = Object.keys(slotRefs.current) as WidgetSlot[];
      for (const slot of slots) {
        const el = slotRefs.current[slot];
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        const inside = x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
        if (!inside) continue;
        if (lastHoverSlotRef.current !== slot) {
          assignWidgetToSlot(current, slot);
          lastHoverSlotRef.current = slot;
        }
        break;
      }
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      endDrag();
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const toggleWidget = (id: HomeWidgetId) => {
    const next = widgets.map((w) => (w.id === id ? { ...w, visible: !w.visible } : w));
    setWidgets(next);
    localStorage.setItem(WIDGETS_STORAGE_KEY, JSON.stringify(next));
  };

  const hideWidget = (id: HomeWidgetId) => {
    const next = widgets.map((w) => (w.id === id ? { ...w, visible: false } : w));
    setWidgets(next);
    localStorage.setItem(WIDGETS_STORAGE_KEY, JSON.stringify(next));
  };

  const isWidgetVisible = (id: HomeWidgetId) => widgets.find((widget) => widget.id === id)?.visible ?? false;
  const accountLaunchInstance = instances.find((inst) => inst.id === accountLaunchInstanceId) ?? selected;
  const widgetTitles: Record<HomeWidgetId, string> = {
    hero: 'Hero',
    instances: 'Instances',
    account: 'Account',
    metrics: 'Metrics',
    clock: 'Clock',
    stopwatch: 'Stopwatch'
  };

  const formatStopwatch = (ms: number) => {
    const totalCs = Math.floor(ms / 10);
    const cs = totalCs % 100;
    const totalSeconds = Math.floor(totalCs / 100);
    const seconds = totalSeconds % 60;
    const minutes = Math.floor(totalSeconds / 60);
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
  };

  const widgetMap: Record<HomeWidgetId, ReactNode> = {
    hero: (
      <section className="g-panel-strong p-6 relative overflow-hidden h-full">
        {selected?.coverDataUrl && <img src={selected.coverDataUrl} className="absolute inset-0 w-full h-full object-cover opacity-30" />}
        <div className="relative">
          <p className="text-[10px] font-extrabold tracking-[0.2em] uppercase g-accent-text">Welcome</p>
          <div className="mt-2 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
            <div>
              <h1 className="text-5xl font-extrabold leading-[0.95] text-white">{selected ? selected.name : 'Create your first instance'}</h1>
              <p className="mt-2 text-sm g-muted">Dark control panel style with launcher logic intact.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {chips.map((chip) => (
                  <span key={chip} className="g-chip px-3 py-1 text-[10px] uppercase tracking-[0.14em] font-extrabold text-white/80">{chip}</span>
                ))}
                {selected?.colorTag && <span className="g-chip px-3 py-1 text-[10px] uppercase tracking-[0.14em] font-extrabold text-white/80" style={{ borderColor: selected.colorTag }}>{selected.colorTag}</span>}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                disabled={!selected}
                onClick={() => selected && startDownload(selected, authState)}
                className="g-btn-accent h-11 px-5 text-sm font-extrabold uppercase tracking-[0.12em] inline-flex items-center gap-2 disabled:opacity-45"
              >
                <Play size={14} /> Launch
              </button>
              <Link to="/instances" className="g-btn h-11 px-5 text-sm font-extrabold uppercase tracking-[0.12em] inline-flex items-center gap-2">Manage</Link>
            </div>
          </div>
          {download && (
            <div className="mt-4 rounded-xl border border-white/12 bg-white/[0.03] p-3">
              <div className="h-2 rounded-full bg-[var(--g-track)] overflow-hidden">
                <div className="h-full g-accent-grad" style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
              </div>
              <div className="mt-2 flex items-center justify-between text-[11px] font-bold text-white/70">
                <span>{download.status}</span>
                <span>{Math.floor(progress)}%</span>
              </div>
              {download.remediation === 'disable_essential_conflict' && selected && (
                <button
                  onClick={() => { void disableIncompatibleMods(selected.id); }}
                  className="mt-3 g-btn h-9 px-3 text-[10px] font-extrabold uppercase tracking-[0.12em] text-red-200 border-red-300/40"
                >
                  Disable incompatible mods
                </button>
              )}
            </div>
          )}
        </div>
      </section>
    ),
    instances: (
      <section className="g-panel p-5 h-full">
        <div className="flex items-center justify-between">
          <h2 className="text-3xl font-extrabold text-white">Instances</h2>
          <span className="text-xs font-extrabold uppercase tracking-[0.12em] text-white/50">{instances.length} total</span>
        </div>
        <div className="mt-4 space-y-2">
          {instances.slice(0, 6).map((instance) => (
            <Link key={instance.id} to={`/instance-editor?id=${encodeURIComponent(instance.id)}`} className="block rounded-xl border border-white/10 bg-white/[0.03] p-3 hover:bg-white/[0.06]">
              <div className="flex items-center gap-3">
                <div
                  className={
                    instance.iconFrame === 'diamond'
                      ? 'rotate-45 rounded-lg'
                      : instance.iconFrame === 'square'
                        ? 'rounded-md'
                        : 'rounded-xl'
                  }
                  style={{ border: `1px solid ${instance.colorTag || 'rgba(255,255,255,0.15)'}`, width: 40, height: 40, overflow: 'hidden' }}
                >
                  {instance.iconDataUrl ? <img src={instance.iconDataUrl} className="w-full h-full object-cover" /> : <div className="w-full h-full bg-white/10" />}
                </div>
                <div>
                  <p className="text-lg font-extrabold text-white">{instance.name}</p>
                  <p className="text-xs g-muted mt-1">{instance.loader.toUpperCase()} {instance.mcVersion}</p>
                </div>
              </div>
            </Link>
          ))}
          {instances.length === 0 && <p className="text-sm g-muted">No instances yet.</p>}
        </div>
      </section>
    ),
    account: (
      <section className="g-panel p-4 h-full">
        <div className="inline-flex items-center gap-2 text-white/75"><UserRound size={15} /><p className="text-xs font-extrabold uppercase tracking-[0.14em]">Account</p></div>
        <p className="mt-2 text-xl font-extrabold text-white">{authState ? authState.profile.name : 'Not signed in'}</p>
        <p className="mt-1 text-xs g-muted">{accountLaunchInstance ? `Launch target: ${accountLaunchInstance.name}` : 'No instance selected yet.'}</p>
        <div className="mt-3 space-y-2">
          <select
            value={accountLaunchInstanceId}
            onChange={(event) => setAccountLaunchInstanceId(event.target.value)}
            className="w-full h-10 rounded-lg border border-white/12 bg-white/[0.04] px-3 text-sm font-bold text-white outline-none"
          >
            {instances.map((inst) => (
              <option key={inst.id} value={inst.id} className="text-black">
                {inst.name} - {inst.loader.toUpperCase()} {inst.mcVersion}
              </option>
            ))}
          </select>
          <button
            disabled={!accountLaunchInstance}
            onClick={() => accountLaunchInstance && startDownload(accountLaunchInstance, authState)}
            className="w-full g-btn-accent h-10 px-4 text-xs font-extrabold uppercase tracking-[0.12em] inline-flex items-center justify-center gap-2 disabled:opacity-45"
          >
            <Play size={13} /> Launch Instance
          </button>
        </div>
      </section>
    ),
    metrics: (
      <section className="space-y-4 h-full">
        <div className="g-panel p-4">
          <div className="inline-flex items-center gap-2 text-white/75"><Sparkles size={15} /><p className="text-xs font-extrabold uppercase tracking-[0.14em]">Theme</p></div>
          <p className="mt-2 text-sm g-muted">GIGACAT-inspired shell active across pages.</p>
        </div>
        <div className="g-panel p-4">
          <div className="inline-flex items-center gap-2 text-white/75"><Shield size={15} /><p className="text-xs font-extrabold uppercase tracking-[0.14em]">Status</p></div>
          <p className="mt-2 text-sm g-muted">Install, auth, mod tools, and launch flow are still active.</p>
        </div>
      </section>
    ),
    clock: (
      <section className="g-panel p-4 h-full">
        <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-white/50">PC Clock</p>
        <p className="mt-2 text-4xl font-extrabold text-white">{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</p>
        <p className="mt-1 text-sm g-muted">{now.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })}</p>
      </section>
    ),
    stopwatch: (
      <section className="g-panel p-4 h-full">
        <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-white/50">Stopwatch</p>
        <p className="mt-2 text-4xl font-extrabold text-white tabular-nums">{formatStopwatch(stopwatchElapsedMs)}</p>
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={() => setStopwatchRunning((prev) => !prev)}
            className="g-btn-accent h-9 px-3 text-[10px] font-extrabold uppercase tracking-[0.12em]"
          >
            {stopwatchRunning ? 'Pause' : 'Start'}
          </button>
          <button
            onClick={() => {
              setStopwatchRunning(false);
              setStopwatchElapsedMs(0);
            }}
            className="g-btn h-9 px-3 text-[10px] font-extrabold uppercase tracking-[0.12em]"
          >
            Reset
          </button>
        </div>
      </section>
    )
  };

  const widgetAtSlot = (slot: WidgetSlot): HomeWidgetId | null => {
    const found = (Object.keys(layout) as HomeWidgetId[]).find((id) => layout[id] === slot);
    return found || null;
  };

  const renderSlot = (slot: WidgetSlot, className?: string) => {
    const widgetId = widgetAtSlot(slot);
    if (!widgetId || !isWidgetVisible(widgetId)) {
      return (
        <div
          ref={(el) => { slotRefs.current[slot] = el; }}
          className={`rounded-2xl border border-dashed border-white/20 bg-white/[0.02] p-4 min-h-[120px] flex items-center justify-center text-xs font-extrabold uppercase tracking-[0.14em] text-white/40 transition-all duration-300 ${className || ''}`}
        >
          Empty Slot: {SLOT_LABELS[slot]}
        </div>
      );
    }

    return (
      <div
        ref={(el) => { slotRefs.current[slot] = el; }}
        onContextMenu={(event) => {
          event.preventDefault();
          setContextMenu({ widgetId, x: event.clientX, y: event.clientY });
        }}
        className={`rounded-2xl border border-white/10 bg-white/[0.02] p-2 transition-all duration-300 ${draggingWidget ? 'ring-1 ring-white/15' : ''} ${className || ''}`}
      >
        <div
          onMouseDown={(event) => beginWidgetDrag(widgetId, event)}
          className={`flex items-center justify-between px-2 py-1.5 cursor-grab active:cursor-grabbing ${draggingWidget === widgetId ? 'opacity-80' : ''}`}
        >
          <p className="text-[10px] font-extrabold tracking-[0.14em] uppercase text-white/50">
            {SLOT_LABELS[slot]} - {widgetTitles[widgetId]}
          </p>
          <GripVertical size={13} className="text-white/40" />
        </div>
        {widgetMap[widgetId]}
      </div>
    );
  };

  return (
    <div className="max-w-[1400px] mx-auto min-h-full space-y-4">
      {showWidgetDocker && (
        <details className="g-panel p-3">
          <summary className="cursor-pointer select-none text-xs font-extrabold uppercase tracking-[0.12em] text-white/60">
            Widget Docking
          </summary>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-3">
            {(Object.keys(widgetMap) as HomeWidgetId[]).map((widgetId) => (
              <div
                key={widgetId}
                className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-2 flex items-center justify-between"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-extrabold text-white capitalize">{widgetId}</span>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={layout[widgetId]}
                    onChange={(event) => assignWidgetToSlot(widgetId, event.target.value as WidgetSlot)}
                    className="h-8 rounded-md border border-white/15 bg-white/[0.04] px-2 text-[11px] font-bold text-white outline-none"
                  >
                    {(Object.keys(SLOT_LABELS) as WidgetSlot[]).map((slot) => (
                      <option key={slot} value={slot} className="text-black">
                        {SLOT_LABELS[slot]}
                      </option>
                    ))}
                  </select>
                  <button onClick={() => toggleWidget(widgetId)} className="h-7 w-7 rounded-md border border-white/10 text-white/70 inline-flex items-center justify-center">{isWidgetVisible(widgetId) ? <Eye size={12} /> : <EyeOff size={12} />}</button>
                </div>
              </div>
            ))}
          </div>
        </details>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-12">{renderSlot('hero')}</div>
        <div className="lg:col-span-8">{renderSlot('leftTop')}</div>
        <div className="lg:col-span-4">{renderSlot('rightTop')}</div>
        <div className="lg:col-span-6">{renderSlot('leftBottom')}</div>
        <div className="lg:col-span-6">{renderSlot('rightBottom')}</div>
      </div>

      {contextMenu && (
        <div
          className="g-context-menu fixed z-[2147483000] min-w-[150px] rounded-xl p-1.5 shadow-2xl"
          style={{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <button
            onClick={() => {
              hideWidget(contextMenu.widgetId);
              setContextMenu(null);
            }}
            className="g-context-item w-full rounded-lg px-3 py-2 text-left text-xs font-extrabold uppercase tracking-[0.12em]"
          >
            Hide Widget
          </button>
        </div>
      )}
    </div>
  );
}
