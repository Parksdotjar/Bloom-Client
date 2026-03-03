import { useMemo, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

type WidgetDef = {
  id: string;
  title: string;
  description: string;
};

type WidgetPageDef = {
  pageKey: string;
  label: string;
  route: string;
  storageType: 'home' | 'pagewidgets';
  widgets: WidgetDef[];
};

const WIDGET_PAGES: WidgetPageDef[] = [
  {
    pageKey: 'home',
    label: 'Account',
    route: '/',
    storageType: 'home',
    widgets: [
      { id: 'hero', title: 'Hero', description: 'Main account header and quick launch panel.' },
      { id: 'instances', title: 'Instances', description: 'Instance cards and quick status.' },
      { id: 'account', title: 'Account', description: 'Account controls and launch target selector.' },
      { id: 'metrics', title: 'Metrics', description: 'Theme and launcher status cards.' },
      { id: 'clock', title: 'Clock', description: 'PC-synced clock and date.' },
      { id: 'stopwatch', title: 'Stopwatch', description: 'Start/pause/reset stopwatch widget.' }
    ]
  },
  {
    pageKey: 'instances',
    label: 'Instances',
    route: '/instances',
    storageType: 'pagewidgets',
    widgets: [
      { id: 'instances-hero', title: 'Header', description: 'Instances page header actions.' },
      { id: 'instances-library', title: 'Library', description: 'Instance cards list.' },
      { id: 'instances-featured-mods', title: 'Featured Mods', description: 'Popular SMP creator mod picks.' }
    ]
  },
  {
    pageKey: 'mods',
    label: 'Mods',
    route: '/mods',
    storageType: 'pagewidgets',
    widgets: [
      { id: 'mods-hero', title: 'Header', description: 'Mods page hero section.' },
      { id: 'mods-filters', title: 'Search', description: 'Search/filter controls.' },
      { id: 'mods-results', title: 'Results', description: 'Mod search results list.' }
    ]
  },
  {
    pageKey: 'modpacks',
    label: 'Modpacks',
    route: '/modpacks',
    storageType: 'pagewidgets',
    widgets: [
      { id: 'modpacks-hero', title: 'Header', description: 'Modpacks page hero section.' },
      { id: 'modpacks-search', title: 'Search', description: 'Search controls.' },
      { id: 'modpacks-results', title: 'Results', description: 'Modpack search results list.' }
    ]
  },
  {
    pageKey: 'resourcepacks',
    label: 'Resource Packs',
    route: '/resourcepacks',
    storageType: 'pagewidgets',
    widgets: [
      { id: 'resourcepacks-hero', title: 'Header', description: 'Resource packs hero section.' },
      { id: 'resourcepacks-search', title: 'Search', description: 'Search controls.' },
      { id: 'resourcepacks-results', title: 'Results', description: 'Resource pack results list.' }
    ]
  },
  {
    pageKey: 'downloads',
    label: 'Downloads',
    route: '/downloads',
    storageType: 'pagewidgets',
    widgets: [
      { id: 'downloads-hero', title: 'Header', description: 'Downloads page hero section.' },
      { id: 'downloads-queue', title: 'Queue', description: 'Current download queue.' }
    ]
  },
  {
    pageKey: 'skins',
    label: 'Skins',
    route: '/skins',
    storageType: 'pagewidgets',
    widgets: [
      { id: 'skins-hero', title: 'Header', description: 'Skin studio header.' },
      { id: 'skins-auth', title: 'Account', description: 'Account/login skin controls.' },
      { id: 'skins-preview', title: 'Preview', description: '3D skin preview.' },
      { id: 'skins-presets', title: 'Presets', description: 'Saved presets and apply controls.' }
    ]
  }
];

const HOME_WIDGETS_STORAGE_KEY = 'bloom_home_widgets';

function readVisibility(page: WidgetPageDef): Record<string, boolean> {
  if (page.storageType === 'home') {
    try {
      const raw = localStorage.getItem(HOME_WIDGETS_STORAGE_KEY);
      const arr = raw ? (JSON.parse(raw) as Array<{ id: string; visible: boolean }>) : [];
      const map: Record<string, boolean> = {};
      for (const widget of page.widgets) {
        const found = arr.find((entry) => entry.id === widget.id);
        map[widget.id] = found ? found.visible : true;
      }
      return map;
    } catch {
      return Object.fromEntries(page.widgets.map((widget) => [widget.id, true]));
    }
  }

  try {
    const raw = localStorage.getItem(`bloom_widget_visible_${page.pageKey}`);
    const obj = raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
    const map: Record<string, boolean> = {};
    for (const widget of page.widgets) map[widget.id] = obj[widget.id] ?? true;
    return map;
  } catch {
    return Object.fromEntries(page.widgets.map((widget) => [widget.id, true]));
  }
}

function writeVisibility(page: WidgetPageDef, visibility: Record<string, boolean>) {
  if (page.storageType === 'home') {
    localStorage.setItem(
      HOME_WIDGETS_STORAGE_KEY,
      JSON.stringify(page.widgets.map((widget) => ({ id: widget.id, visible: visibility[widget.id] ?? true })))
    );
    return;
  }
  localStorage.setItem(`bloom_widget_visible_${page.pageKey}`, JSON.stringify(visibility));
}

export function Widgets() {
  const [selectedPageKey, setSelectedPageKey] = useState<string>('home');
  const selectedPage = useMemo(
    () => WIDGET_PAGES.find((page) => page.pageKey === selectedPageKey) || WIDGET_PAGES[0],
    [selectedPageKey]
  );
  const [visibility, setVisibility] = useState<Record<string, boolean>>(() => readVisibility(WIDGET_PAGES[0]));

  const selectPage = (pageKey: string) => {
    const nextPage = WIDGET_PAGES.find((page) => page.pageKey === pageKey);
    if (!nextPage) return;
    setSelectedPageKey(pageKey);
    setVisibility(readVisibility(nextPage));
  };

  const toggleWidget = (widgetId: string) => {
    const next = { ...visibility, [widgetId]: !visibility[widgetId] };
    setVisibility(next);
    writeVisibility(selectedPage, next);
  };

  const enableAll = () => {
    const next = Object.fromEntries(selectedPage.widgets.map((widget) => [widget.id, true])) as Record<string, boolean>;
    setVisibility(next);
    writeVisibility(selectedPage, next);
  };

  const disableAll = () => {
    const next = Object.fromEntries(selectedPage.widgets.map((widget) => [widget.id, false])) as Record<string, boolean>;
    setVisibility(next);
    writeVisibility(selectedPage, next);
  };

  return (
    <div className="max-w-[1200px] mx-auto min-h-full space-y-4">
      <section className="g-panel-strong p-6">
        <p className="text-[10px] uppercase tracking-[0.2em] font-extrabold g-accent-text">Widgets</p>
        <h1 className="text-5xl font-extrabold text-white mt-1">Widget Manager</h1>
        <p className="text-sm g-muted mt-1">Choose a page and enable the widgets you want visible there.</p>
      </section>

      <section className="g-panel p-4">
        <p className="text-xs uppercase tracking-[0.14em] font-extrabold text-white/60 mb-2">Pages</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {WIDGET_PAGES.map((page) => (
            <button
              key={page.pageKey}
              onClick={() => selectPage(page.pageKey)}
              className={`rounded-lg border p-2 text-left ${selectedPage.pageKey === page.pageKey ? 'g-btn-accent' : 'border-white/10 bg-white/[0.03]'}`}
            >
              <p className="text-sm font-extrabold text-white">{page.label}</p>
              <p className="text-[10px] uppercase tracking-[0.12em] text-white/45">{page.route}</p>
            </button>
          ))}
        </div>
      </section>

      <section className="g-panel p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <p className="text-xs uppercase tracking-[0.14em] font-extrabold text-white/60">Widgets For {selectedPage.label}</p>
            <p className="text-xs g-muted">Toggle visibility per widget.</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={enableAll} className="g-btn h-8 px-3 text-[10px] font-extrabold uppercase tracking-[0.12em]">Enable all</button>
            <button onClick={disableAll} className="g-btn h-8 px-3 text-[10px] font-extrabold uppercase tracking-[0.12em]">Disable all</button>
          </div>
        </div>

        <div className="space-y-2">
          {selectedPage.widgets.map((widget) => (
            <div key={widget.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-extrabold text-white">{widget.title}</p>
                <p className="text-xs g-muted truncate">{widget.description}</p>
                <p className="text-[10px] uppercase tracking-[0.12em] text-white/35 mt-1">{widget.id}</p>
              </div>
              <button
                onClick={() => toggleWidget(widget.id)}
                className="h-8 w-8 rounded-md border border-white/10 text-white/70 inline-flex items-center justify-center shrink-0"
                title={visibility[widget.id] ? 'Disable widget' : 'Enable widget'}
              >
                {visibility[widget.id] ? <Eye size={14} /> : <EyeOff size={14} />}
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
