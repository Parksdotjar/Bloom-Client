import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Eye, EyeOff, GripVertical } from 'lucide-react';

type WidgetSlot = 'hero' | 'leftTop' | 'rightTop' | 'leftBottom' | 'rightBottom';

export type PageWidget = {
  id: string;
  title: string;
  defaultSlot: WidgetSlot;
  content: ReactNode;
  visibleByDefault?: boolean;
};

const SHOW_WIDGET_DOCKER_KEY = 'bloom_show_widget_docker';
const HIDE_EMPTY_WIDGET_SLOTS_KEY = 'bloom_hide_empty_widget_slots';
const EXTRA_CHANGE_EVENT = 'bloom-extra-change';

const SLOT_LABELS: Record<WidgetSlot, string> = {
  hero: 'Hero',
  leftTop: 'Left Top',
  rightTop: 'Right Top',
  leftBottom: 'Left Bottom',
  rightBottom: 'Right Bottom'
};
const SLOT_RENDER_ORDER: WidgetSlot[] = ['hero', 'leftTop', 'rightTop', 'leftBottom', 'rightBottom'];

type LayoutMap = Record<string, WidgetSlot>;
type VisibilityMap = Record<string, boolean>;

export function PageWidgets({ pageKey, widgets }: { pageKey: string; widgets: PageWidget[] }) {
  const layoutStorageKey = `bloom_widget_layout_${pageKey}`;
  const visibleStorageKey = `bloom_widget_visible_${pageKey}`;

  const [showWidgetDocker, setShowWidgetDocker] = useState<boolean>(() => localStorage.getItem(SHOW_WIDGET_DOCKER_KEY) === 'true');
  const [hideEmptyWidgetSlots, setHideEmptyWidgetSlots] = useState<boolean>(() => localStorage.getItem(HIDE_EMPTY_WIDGET_SLOTS_KEY) === 'true');
  const [draggingWidget, setDraggingWidget] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ widgetId: string; x: number; y: number } | null>(null);

  const draggingWidgetRef = useRef<string | null>(null);
  const lastHoverSlotRef = useRef<WidgetSlot | null>(null);
  const slotRefs = useRef<Record<WidgetSlot, HTMLDivElement | null>>({
    hero: null,
    leftTop: null,
    rightTop: null,
    leftBottom: null,
    rightBottom: null
  });

  const defaultLayout = useMemo<LayoutMap>(() => {
    const map: LayoutMap = {};
    for (const widget of widgets) map[widget.id] = widget.defaultSlot;
    return map;
  }, [widgets]);

  const [layout, setLayout] = useState<LayoutMap>(() => {
    try {
      const raw = localStorage.getItem(layoutStorageKey);
      if (!raw) return defaultLayout;
      const parsed = JSON.parse(raw) as LayoutMap;
      return { ...defaultLayout, ...parsed };
    } catch {
      return defaultLayout;
    }
  });

  const [visible, setVisible] = useState<VisibilityMap>(() => {
    try {
      const raw = localStorage.getItem(visibleStorageKey);
      if (!raw) {
        const initial: VisibilityMap = {};
        for (const widget of widgets) initial[widget.id] = widget.visibleByDefault ?? true;
        return initial;
      }
      const parsed = JSON.parse(raw) as VisibilityMap;
      const merged: VisibilityMap = {};
      for (const widget of widgets) merged[widget.id] = parsed[widget.id] ?? (widget.visibleByDefault ?? true);
      return merged;
    } catch {
      const initial: VisibilityMap = {};
      for (const widget of widgets) initial[widget.id] = widget.visibleByDefault ?? true;
      return initial;
    }
  });

  useEffect(() => {
    const onExtraChange = (event: Event) => {
      const custom = event as CustomEvent<{ showWidgetDocker?: boolean; hideEmptyWidgetSlots?: boolean }>;
      setShowWidgetDocker(custom.detail?.showWidgetDocker === true);
      if (typeof custom.detail?.hideEmptyWidgetSlots === 'boolean') {
        setHideEmptyWidgetSlots(custom.detail.hideEmptyWidgetSlots);
      }
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
    localStorage.setItem(layoutStorageKey, JSON.stringify(layout));
  }, [layout, layoutStorageKey]);

  useEffect(() => {
    localStorage.setItem(visibleStorageKey, JSON.stringify(visible));
  }, [visible, visibleStorageKey]);

  const assignWidgetToSlot = (widgetId: string, targetSlot: WidgetSlot) => {
    const occupant = Object.keys(layout).find((id) => layout[id] === targetSlot);
    const currentSlot = layout[widgetId];
    if (!currentSlot || currentSlot === targetSlot) return;

    const next = { ...layout, [widgetId]: targetSlot };
    if (occupant && occupant !== widgetId) next[occupant] = currentSlot;
    setLayout(next);
  };

  const toggleVisible = (widgetId: string) => {
    setVisible((prev) => ({ ...prev, [widgetId]: !prev[widgetId] }));
  };

  const hideWidget = (widgetId: string) => {
    setVisible((prev) => ({ ...prev, [widgetId]: false }));
  };

  const endDrag = () => {
    setDraggingWidget(null);
    draggingWidgetRef.current = null;
    lastHoverSlotRef.current = null;
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
  };

  const beginWidgetDrag = (widgetId: string, event: React.MouseEvent) => {
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

  const openWidgetContextMenu = (widgetId: string, event: React.MouseEvent) => {
    event.preventDefault();
    setContextMenu({ widgetId, x: event.clientX, y: event.clientY });
  };

  const widgetById: Record<string, PageWidget> = {};
  for (const widget of widgets) widgetById[widget.id] = widget;

  const widgetAtSlot = (slot: WidgetSlot): PageWidget | null => {
    const id = Object.keys(layout).find((key) => layout[key] === slot);
    if (!id) return null;
    const widget = widgetById[id];
    if (!widget) return null;
    if (!visible[id]) return null;
    return widget;
  };

  const renderSlot = (slot: WidgetSlot, className?: string) => {
    const widget = widgetAtSlot(slot);
    if (!widget) {
      if (hideEmptyWidgetSlots && !draggingWidget) {
        return <div ref={(el) => { slotRefs.current[slot] = el; }} className={className || ''} />;
      }
      return (
        <div
          ref={(el) => { slotRefs.current[slot] = el; }}
          className={`w-full rounded-2xl border border-dashed border-white/20 bg-white/[0.02] p-4 min-h-[96px] flex items-center justify-center text-xs font-extrabold uppercase tracking-[0.14em] text-white/40 transition-all duration-300 ${className || ''}`}
        >
          Empty Slot: {SLOT_LABELS[slot]}
        </div>
      );
    }

    return (
      <div
        ref={(el) => { slotRefs.current[slot] = el; }}
        onContextMenu={(event) => openWidgetContextMenu(widget.id, event)}
        className={`w-full rounded-2xl border border-white/10 bg-white/[0.02] p-2 transition-all duration-300 ${draggingWidget ? 'ring-1 ring-white/15' : ''} ${className || ''}`}
      >
        <div
          onMouseDown={(event) => beginWidgetDrag(widget.id, event)}
          className={`flex items-center justify-between px-2 py-2 cursor-grab active:cursor-grabbing rounded-xl border border-white/10 bg-white/[0.02] ${draggingWidget === widget.id ? 'opacity-80' : ''}`}
        >
          <p className="text-[10px] font-extrabold tracking-[0.14em] uppercase text-white/50">
            {SLOT_LABELS[slot]} - {widget.title}
          </p>
          <GripVertical size={13} className="text-white/40" />
        </div>
        {widget.content}
      </div>
    );
  };

  return (
    <div className="max-w-[1400px] mx-auto min-h-full space-y-4">
      {showWidgetDocker && (
        <details className="g-panel p-3 js-giga-reveal">
          <summary className="cursor-pointer select-none text-xs font-extrabold uppercase tracking-[0.12em] text-white/60">
            Widget Docking
          </summary>
          <div className="flex flex-col gap-2 mt-3">
            {widgets.map((widget) => (
              <div key={widget.id} className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 flex items-center justify-between gap-3">
                <span className="text-xs font-extrabold text-white uppercase tracking-[0.12em]">{widget.title}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <select
                    value={layout[widget.id] || widget.defaultSlot}
                    onChange={(event) => assignWidgetToSlot(widget.id, event.target.value as WidgetSlot)}
                    className="h-8 rounded-md border border-white/15 bg-white/[0.04] px-2 text-[11px] font-bold text-white outline-none"
                  >
                    {(Object.keys(SLOT_LABELS) as WidgetSlot[]).map((slot) => (
                      <option key={slot} value={slot} className="text-black">
                        {SLOT_LABELS[slot]}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => toggleVisible(widget.id)}
                    className="h-7 w-7 rounded-md border border-white/10 text-white/70 inline-flex items-center justify-center"
                  >
                    {visible[widget.id] ? <Eye size={12} /> : <EyeOff size={12} />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </details>
      )}

      <div className="flex flex-col gap-4">
        {SLOT_RENDER_ORDER.map((slot) => (
          <div key={slot} className="js-giga-reveal">{renderSlot(slot)}</div>
        ))}
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
