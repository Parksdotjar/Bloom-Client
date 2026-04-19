import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type ComponentProps } from 'react';
import Editor from '@monaco-editor/react';
import {
  Braces,
  Bug,
  ChevronDown,
  Download,
  FileCode2,
  FolderUp,
  Play,
  RotateCcw,
  Sparkles,
  Upload
} from 'lucide-react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { PageWidgets, type PageWidget } from '../components/PageWidgets';
import { useAuth } from '../hooks/useAuth';
import { useDownloader } from '../hooks/useDownloader';
import { useInstances } from '../hooks/useInstances';
import { APP_VERSION } from '../constants/version';
import {
  CONSOLE_LOG_LEVEL_KEY,
  CONSOLE_SETTINGS_CHANGE_EVENT,
  CONSOLE_SHOW_DEV_COMMANDS_KEY,
  type ConsoleLogLevel
} from '../constants/console';
import { requestCosmeticsModMenuOpen } from '../constants/cosmeticsModMenu';
import { readHostServersUnlocked, setHostServersUnlocked as writeHostServersUnlocked } from '../constants/hostServerAccess';
import { CONSOLE_MODULES, CONSOLE_THEMES, createConsoleRegistry } from '../console/registry';
import type { ConsoleCommandContext } from '../console/types';
import { TauriApi, type Instance } from '../services/tauri';
import { createBloomScriptCommandIndex } from '../ide/bridge';
import { analyzeBloomScript } from '../ide/parser';
import { executeBloomScript } from '../ide/runtime';
import {
  applyBloomScriptTheme,
  BLOOM_SCRIPT_LANGUAGE_ID,
  BLOOM_SCRIPT_THEME_ID,
  ensureBloomScriptLanguage,
  registerBloomScriptCompletionProvider,
  toMonacoMarkers
} from '../ide/language';
import type { BloomScriptOutputKind, BloomScriptOutputLine } from '../ide/types';

const SCRIPT_STUDIO_SOURCE_KEY = 'bloom_script_studio_source_v1';
const SCRIPT_STUDIO_LAST_TEMPLATE_KEY = 'bloom_script_studio_last_template';

const THEME_STORAGE_KEY = 'bloom_theme_mode';
const THEME_CHANGE_EVENT = 'bloom-theme-change';
const DENSITY_STORAGE_KEY = 'bloom_density_mode';
const DENSITY_CHANGE_EVENT = 'bloom-density-change';
const MOTION_STORAGE_KEY = 'bloom_motion_mode';
const MOTION_CHANGE_EVENT = 'bloom-motion-change';
const SHOW_WIDGET_DOCKER_KEY = 'bloom_show_widget_docker';
const HIDE_EMPTY_WIDGET_SLOTS_KEY = 'bloom_hide_empty_widget_slots';
const SHOW_GAMES_SECTION_KEY = 'bloom_show_games_section';
const ROUTE_TAB_ANIMATIONS_KEY = 'bloom_route_tab_animations_enabled';
const STARTUP_SCENE_ENABLED_KEY = 'bloom_startup_scene_enabled';
const STARTUP_SCENE_THEME_KEY = 'bloom_startup_scene_theme';
const STARTUP_SCENE_SOUND_PROFILE_KEY = 'bloom_startup_scene_sound_profile';
const STARTUP_SCENE_CHANGE_EVENT = 'bloom-startup-scene-change';
const EXTRA_CHANGE_EVENT = 'bloom-extra-change';

const APPEARANCE_KEYS = [
  'bloom_theme_mode',
  'bloom_accent_mode',
  'bloom_background_mode',
  'bloom_density_mode',
  'bloom_font_pack',
  'bloom_sidebar_mode',
  'bloom_sidebar_position',
  'bloom_card_style',
  'bloom_button_theme',
  'bloom_motion_mode',
  'bloom_icon_pack',
  'bloom_roundness_level',
  'bloom_glass_amount'
] as const;

type ScriptTemplate = {
  id: string;
  label: string;
  description: string;
  code: string;
};

type StudioMenu = 'file' | 'edit' | 'run' | 'view' | 'help';

type MenuAction = {
  id: string;
  label: string;
  shortcut?: string;
  onClick: () => void;
};

const SCRIPT_TEMPLATES: ScriptTemplate[] = [
  {
    id: 'starter',
    label: 'Starter Workflow',
    description: 'Create an instance, configure it, and inspect your appearance snapshot.',
    code: `# BloomScript starter
let pack = "Neon Practice"
mkinc $pack
instance.set-version $pack "1.21.1"
instance.set-loader $pack fabric
theme.set ocean
appearance.show
print "ready =>" $pack
instance.list`
  },
  {
    id: 'module-tune',
    label: 'Module Tuning',
    description: 'Toggle launcher modules and motion behavior for fast testing.',
    code: `# Module and UI tuning
module.list
module.enable widget-docker
module.enable games-section
motion.reduce on
ui.scale 1.08
whoami
bloom`
  },
  {
    id: 'batch-instances',
    label: 'Batch Instances',
    description: 'Demonstrate variables and sequential instance operations.',
    code: `# Batch instance flow
let base = "Training"
instance.create $base
instance.clone $base "Training Copy"
instance.rename "Training Copy" "Training Ranked"
instance.path "Training Ranked"
instance.config "Training Ranked"
instance.list`
  },
  {
    id: 'dev-playground',
    label: 'Dev Playground',
    description: 'Run internal diagnostics and visual debug commands.',
    code: `# Dev playground (requires dev commands enabled in Settings)
dev.inspect-theme
dev.dump-config
dev.mock-notification
dev.log-level debug
help --dev`
  },
  {
    id: 'theme-tour',
    label: 'Theme Tour',
    description: 'Cycle through a few themes with timed pauses and print the final appearance snapshot.',
    code: `# Theme showcase
print "Running Bloom theme tour..."
theme.set ocean
sleep 350
theme.set forest
sleep 350
theme.set sunset
sleep 350
theme.set true-dark
appearance.show`
  },
  {
    id: 'power-user-mode',
    label: 'Power User Mode',
    description: 'Apply a faster, cleaner launcher profile for daily grinding.',
    code: `# Performance + utility tuning
module.enable widget-docker
module.enable games-section
module.enable route-animations
ui.scale 0.96
motion.reduce on
theme.set gray
appearance.show
print "Power-user profile applied."`
  },
  {
    id: 'fabric-quickstart',
    label: 'Fabric Quickstart',
    description: 'Create a Fabric instance, set version, and install a few common mods.',
    code: `# Fabric quickstart pack
let pack = "Fabric Quickstart 1.21.1"
mkinc $pack
instance.set-loader $pack fabric
instance.set-version $pack "1.21.1"
mod.install-fabric-api $pack
mod.install $pack sodium
mod.install $pack iris
instance.config $pack
print "Ready:" $pack`
  },
  {
    id: 'instance-maintenance',
    label: 'Instance Maintenance',
    description: 'Clone, rename, open config, and inspect path for maintenance workflows.',
    code: `# Maintenance workflow
let source = "Training"
let clone = "Training Backup"
instance.clone $source $clone
instance.rename $clone "Training Backup 2"
instance.path "Training Backup 2"
instance.config "Training Backup 2"
instance.list`
  },
  {
    id: 'host-unlock',
    label: 'Host Unlock',
    description: 'Run the hidden host-tools unlock phrase and verify state.',
    code: `# Hidden host tools unlock
petals.power.the.server.rack
module.list
print "Host tools should now be visible in navigation."`
  },
  {
    id: 'relock-host',
    label: 'Host Relock',
    description: 'Hide host tools again and keep the launcher surface clean.',
    code: `# Hide host tools
server.lock
print "Host tools hidden again."`
  },
  {
    id: 'status-card',
    label: 'Status Card',
    description: 'Generate a quick status readout for account, version, and modules.',
    code: `# Quick status panel output
version
whoami
module.list
appearance.show`
  },
  {
    id: 'safe-reset',
    label: 'Safe Reset',
    description: 'Reset widget layout keys and re-apply a stable baseline.',
    code: `# Safe reset profile
dev.reset-layout
module.enable widget-docker
motion.reduce off
ui.scale 1
theme.set dark
print "Layout reset and baseline reapplied."`
  }
];

const DEFAULT_SCRIPT = SCRIPT_TEMPLATES[0].code;

type MonacoApi = Parameters<NonNullable<ComponentProps<typeof Editor>['beforeMount']>>[0];
type MonacoEditorInstance = Parameters<NonNullable<ComponentProps<typeof Editor>['onMount']>>[0];

function readConsoleBool(key: string, fallback: boolean) {
  const raw = localStorage.getItem(key);
  if (raw === null) return fallback;
  return raw !== 'false';
}

function readConsoleLogLevel(): ConsoleLogLevel {
  const raw = localStorage.getItem(CONSOLE_LOG_LEVEL_KEY);
  return raw === 'error' || raw === 'warn' || raw === 'info' || raw === 'debug' ? raw : 'info';
}

function outputClass(kind: BloomScriptOutputKind) {
  switch (kind) {
    case 'command':
      return 'text-[var(--g-accent)]';
    case 'success':
      return 'text-emerald-300';
    case 'warn':
      return 'text-amber-300';
    case 'error':
      return 'text-rose-300';
    default:
      return 'text-white/78';
  }
}

function formatDuration(durationMs: number) {
  if (durationMs < 1000) return `${durationMs}ms`;
  return `${(durationMs / 1000).toFixed(2)}s`;
}

function exportTextFile(fileName: string, text: string) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function ScriptStudio() {
  const navigate = useNavigate();
  const location = useLocation();
  const { authState } = useAuth();
  const { instances, loadInstances, createInstance, updateInstance, deleteInstance } = useInstances();
  const { startDownload } = useDownloader();

  const [showInternalCommands, setShowInternalCommands] = useState<boolean>(() => readConsoleBool(CONSOLE_SHOW_DEV_COMMANDS_KEY, false));
  const [logLevel, setLogLevel] = useState<ConsoleLogLevel>(() => readConsoleLogLevel());
  const [commandFilter, setCommandFilter] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(() => {
    const stored = localStorage.getItem(SCRIPT_STUDIO_LAST_TEMPLATE_KEY);
    return SCRIPT_TEMPLATES.some((template) => template.id === stored) ? (stored as string) : SCRIPT_TEMPLATES[0].id;
  });
  const [code, setCode] = useState<string>(() => localStorage.getItem(SCRIPT_STUDIO_SOURCE_KEY) || DEFAULT_SCRIPT);
  const [outputs, setOutputs] = useState<BloomScriptOutputLine[]>([]);
  const [running, setRunning] = useState(false);
  const [cursor, setCursor] = useState<{ line: number; column: number }>({ line: 1, column: 1 });
  const [lastRunMeta, setLastRunMeta] = useState<{ ok: boolean; durationMs: number; executedStatements: number } | null>(null);
  const [menuOpen, setMenuOpen] = useState<StudioMenu | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ left: number; top: number } | null>(null);
  const [widgetRevision, setWidgetRevision] = useState(0);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const monacoRef = useRef<MonacoApi | null>(null);
  const editorRef = useRef<MonacoEditorInstance | null>(null);
  const completionDisposableRef = useRef<{ dispose: () => void } | null>(null);
  const cursorDisposableRef = useRef<{ dispose: () => void } | null>(null);
  const menuBarRef = useRef<HTMLDivElement | null>(null);
  const menuSurfaceRef = useRef<HTMLDivElement | null>(null);

  const consoleCommands = useMemo(() => createConsoleRegistry(), []);
  const commandIndex = useMemo(() => createBloomScriptCommandIndex(consoleCommands), [consoleCommands]);
  const analysis = useMemo(() => analyzeBloomScript(code, commandIndex), [code, commandIndex]);

  const commandIndexRef = useRef(commandIndex);
  const consoleContextRef = useRef<ConsoleCommandContext | null>(null);
  const variablesRef = useRef<string[]>(analysis.program.variables);

  useEffect(() => {
    commandIndexRef.current = commandIndex;
  }, [commandIndex]);

  useEffect(() => {
    variablesRef.current = analysis.program.variables;
  }, [analysis.program.variables]);

  useEffect(() => {
    localStorage.setItem(SCRIPT_STUDIO_SOURCE_KEY, code);
  }, [code]);

  useEffect(() => {
    localStorage.setItem(SCRIPT_STUDIO_LAST_TEMPLATE_KEY, selectedTemplateId);
  }, [selectedTemplateId]);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (menuBarRef.current?.contains(target || null)) return;
      if (menuSurfaceRef.current?.contains(target || null)) return;
      setMenuOpen(null);
      setMenuPosition(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(null);
        setMenuPosition(null);
      }
    };
    const closeOnViewportChange = () => {
      setMenuOpen(null);
      setMenuPosition(null);
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', closeOnEscape);
    window.addEventListener('resize', closeOnViewportChange);
    window.addEventListener('scroll', closeOnViewportChange, true);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', closeOnEscape);
      window.removeEventListener('resize', closeOnViewportChange);
      window.removeEventListener('scroll', closeOnViewportChange, true);
    };
  }, [menuOpen]);

  const setShowInternalCommandsFromStudio = useCallback((next: boolean) => {
    setShowInternalCommands(next);
    localStorage.setItem(CONSOLE_SHOW_DEV_COMMANDS_KEY, next ? 'true' : 'false');
    window.dispatchEvent(new CustomEvent(CONSOLE_SETTINGS_CHANGE_EVENT));
  }, []);

  const setLogLevelFromStudio = useCallback((next: ConsoleLogLevel) => {
    setLogLevel(next);
    localStorage.setItem(CONSOLE_LOG_LEVEL_KEY, next);
    window.dispatchEvent(new CustomEvent(CONSOLE_SETTINGS_CHANGE_EVENT));
  }, []);

  const createStudioInstance = useCallback(async (name: string): Promise<Instance> => {
    const trimmed = name.trim();
    if (!trimmed) throw new Error('Instance name cannot be empty.');
    const duplicate = instances.some((instance) => instance.name.trim().toLowerCase() === trimmed.toLowerCase());
    if (duplicate) throw new Error(`Instance "${trimmed}" already exists.`);

    const now = Date.now();
    const payload: Instance = {
      id: crypto.randomUUID(),
      name: trimmed,
      mcVersion: '1.21.1',
      loader: 'vanilla',
      renderer: 'opengl',
      createdAt: now,
      updatedAt: now,
      iconDataUrl: undefined,
      coverDataUrl: undefined,
      colorTag: '#9a65ff',
      iconFrame: 'rounded',
      java: {},
      memoryMb: 4096,
      jvmArgs: [],
      fabricLoaderVersion: undefined,
      resolution: { width: 854, height: 480, fullscreen: false }
    };

    await createInstance(payload);
    return payload;
  }, [createInstance, instances]);

  const removeStudioInstance = useCallback(async (instanceId: string) => {
    await deleteInstance(instanceId);
  }, [deleteInstance]);

  const renameStudioInstance = useCallback(async (instanceId: string, nextName: string): Promise<Instance> => {
    const current = await TauriApi.instancesGet(instanceId);
    const trimmed = nextName.trim();
    if (!trimmed) throw new Error('Instance name cannot be empty.');

    const duplicate = instances.some((instance) => instance.id !== instanceId && instance.name.trim().toLowerCase() === trimmed.toLowerCase());
    if (duplicate) throw new Error(`Instance "${trimmed}" already exists.`);

    const updated: Instance = { ...current, name: trimmed, updatedAt: Date.now() };
    await updateInstance(instanceId, updated);
    return updated;
  }, [instances, updateInstance]);

  const launchStudioInstance = useCallback(async (instanceId: string) => {
    const target = instances.find((instance) => instance.id === instanceId);
    if (!target) throw new Error('Instance not found.');
    await startDownload(target, authState);
  }, [authState, instances, startDownload]);

  const cloneStudioInstance = useCallback(async (sourceId: string, targetName: string): Promise<Instance> => {
    const source = await TauriApi.instancesGet(sourceId);
    const trimmed = targetName.trim();
    if (!trimmed) throw new Error('Target instance name cannot be empty.');

    const duplicate = instances.some((instance) => instance.name.trim().toLowerCase() === trimmed.toLowerCase());
    if (duplicate) throw new Error(`Instance "${trimmed}" already exists.`);

    const now = Date.now();
    const cloned: Instance = {
      ...source,
      id: crypto.randomUUID(),
      name: trimmed,
      createdAt: now,
      updatedAt: now
    };

    await createInstance(cloned);
    return cloned;
  }, [createInstance, instances]);

  const updateStudioInstanceVersion = useCallback(async (instanceId: string, version: string): Promise<Instance> => {
    const current = await TauriApi.instancesGet(instanceId);
    const nextVersion = version.trim();
    if (!nextVersion) throw new Error('Version cannot be empty.');

    const updated: Instance = { ...current, mcVersion: nextVersion, updatedAt: Date.now() };
    await updateInstance(instanceId, updated);
    return updated;
  }, [updateInstance]);

  const updateStudioInstanceLoader = useCallback(async (instanceId: string, loader: 'vanilla' | 'fabric'): Promise<Instance> => {
    const current = await TauriApi.instancesGet(instanceId);
    const updated: Instance = {
      ...current,
      loader,
      renderer: loader === 'fabric' ? (current.renderer || 'opengl') : 'opengl',
      fabricLoaderVersion: loader === 'fabric' ? (current.fabricLoaderVersion || 'latest') : undefined,
      updatedAt: Date.now()
    };

    await updateInstance(instanceId, updated);
    return updated;
  }, [updateInstance]);

  const getStudioInstancePath = useCallback(async (instanceId: string) => {
    const paths = await TauriApi.pathsGet() as { instances?: string };
    const root = String(paths.instances || '');
    if (!root) return instanceId;
    const joiner = root.endsWith('\\') || root.endsWith('/') ? '' : '\\';
    return `${root}${joiner}${instanceId}`;
  }, []);

  const resetStudioLayout = useCallback(() => {
    const removableKeys: string[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key) continue;
      if (key.startsWith('bloom_widget_layout_') || key.startsWith('bloom_widget_visible_')) {
        removableKeys.push(key);
      }
    }

    removableKeys.push('bloom_home_widgets', 'bloom_home_widget_layout');
    for (const key of removableKeys) {
      localStorage.removeItem(key);
    }

    localStorage.setItem(SHOW_WIDGET_DOCKER_KEY, 'false');
    localStorage.setItem(HIDE_EMPTY_WIDGET_SLOTS_KEY, 'false');
    window.dispatchEvent(new CustomEvent(EXTRA_CHANGE_EVENT, {
      detail: { showWidgetDocker: false, hideEmptyWidgetSlots: false }
    }));
  }, []);

  const dumpStudioConfig = useCallback(() => {
    const out: Record<string, string> = {};
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key || !key.startsWith('bloom_')) continue;
      out[key] = localStorage.getItem(key) ?? '';
    }
    return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
  }, []);

  const inspectStudioTheme = useCallback(() => {
    const root = document.documentElement;
    const computed = getComputedStyle(root);
    const keys = ['--g-accent', '--g-accent-soft', '--g-text', '--g-surface', '--g-shell'];
    const cssVars: Record<string, string> = {};
    for (const key of keys) {
      cssVars[key] = computed.getPropertyValue(key).trim();
    }

    return {
      'data-theme': root.getAttribute('data-theme') || 'unknown',
      'data-button-theme': root.getAttribute('data-button-theme') || 'unknown',
      'data-icon-pack': root.getAttribute('data-icon-pack') || 'unknown',
      ...cssVars
    };
  }, []);

  const moduleConfig = useMemo(() => ({
    'widget-docker': {
      get: () => localStorage.getItem(SHOW_WIDGET_DOCKER_KEY) === 'true',
      set: (enabled: boolean) => {
        localStorage.setItem(SHOW_WIDGET_DOCKER_KEY, enabled ? 'true' : 'false');
        window.dispatchEvent(new CustomEvent(EXTRA_CHANGE_EVENT, { detail: { showWidgetDocker: enabled } }));
      }
    },
    'games-section': {
      get: () => localStorage.getItem(SHOW_GAMES_SECTION_KEY) === 'true',
      set: (enabled: boolean) => {
        localStorage.setItem(SHOW_GAMES_SECTION_KEY, enabled ? 'true' : 'false');
        window.dispatchEvent(new CustomEvent(EXTRA_CHANGE_EVENT, { detail: { showGamesSection: enabled } }));
      }
    },
    'route-animations': {
      get: () => localStorage.getItem(ROUTE_TAB_ANIMATIONS_KEY) === 'true',
      set: (enabled: boolean) => {
        localStorage.setItem(ROUTE_TAB_ANIMATIONS_KEY, enabled ? 'true' : 'false');
        window.dispatchEvent(new CustomEvent(EXTRA_CHANGE_EVENT, { detail: { routeTabAnimationsEnabled: enabled } }));
      }
    },
    'startup-scene': {
      get: () => localStorage.getItem(STARTUP_SCENE_ENABLED_KEY) !== 'false',
      set: (enabled: boolean) => {
        localStorage.setItem(STARTUP_SCENE_ENABLED_KEY, enabled ? 'true' : 'false');
        window.dispatchEvent(new CustomEvent(STARTUP_SCENE_CHANGE_EVENT, {
          detail: {
            enabled,
            theme: localStorage.getItem(STARTUP_SCENE_THEME_KEY) || 'nova',
            soundProfile: localStorage.getItem(STARTUP_SCENE_SOUND_PROFILE_KEY) || 'off'
          }
        }));
      }
    }
  }), []);

  const consoleContext = useMemo<ConsoleCommandContext>(() => ({
    appVersion: APP_VERSION,
    routePath: location.pathname,
    reducedMotionActive: localStorage.getItem(MOTION_STORAGE_KEY) === 'off',
    authName: authState?.profile.name ?? null,
    authUuid: authState?.profile.id ?? null,
    instances,
    themes: CONSOLE_THEMES.map((theme) => ({ id: theme.id, label: theme.label })),
    modules: CONSOLE_MODULES.map((module) => ({ id: module.id, description: module.description })),
    showInternalCommands,
    setShowInternalCommands: setShowInternalCommandsFromStudio,
    hostServersUnlocked: readHostServersUnlocked(),
    setHostServersUnlocked: (next: boolean) => {
      writeHostServersUnlocked(next);
    },
    logLevel,
    setLogLevel: setLogLevelFromStudio,
    setTheme: (themeId: string) => {
      localStorage.setItem(THEME_STORAGE_KEY, themeId);
      window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: { theme: themeId } }));
    },
    getAppearanceSnapshot: () => {
      const snapshot: Record<string, string> = {};
      for (const key of APPEARANCE_KEYS) {
        snapshot[key] = localStorage.getItem(key) ?? '';
      }
      snapshot['data-theme'] = document.documentElement.getAttribute('data-theme') || '';
      return snapshot;
    },
    setUiScale: (value: number) => {
      const clamped = Math.max(0.8, Math.min(1.2, Number(value.toFixed(2))));
      const mappedDensity = clamped < 0.95 ? 'compact' : clamped > 1.05 ? 'spacious' : 'cozy';
      localStorage.setItem(DENSITY_STORAGE_KEY, mappedDensity);
      window.dispatchEvent(new CustomEvent(DENSITY_CHANGE_EVENT, { detail: { density: mappedDensity } }));
      return { mappedDensity };
    },
    setReducedMotion: (enabled: boolean) => {
      const next = enabled ? 'off' : 'standard';
      localStorage.setItem(MOTION_STORAGE_KEY, next);
      window.dispatchEvent(new CustomEvent(MOTION_CHANGE_EVENT, { detail: { motion: next } }));
    },
    openCosmeticsModMenu: () => {
      requestCosmeticsModMenuOpen();
      navigate('/cosmetics');
    },
    listInstances: async () => {
      await loadInstances();
      return TauriApi.instancesList();
    },
    createInstance: createStudioInstance,
    removeInstance: removeStudioInstance,
    renameInstance: renameStudioInstance,
    launchInstance: launchStudioInstance,
    openInstance: (instanceId: string) => navigate(`/instance-editor?id=${encodeURIComponent(instanceId)}`),
    cloneInstance: cloneStudioInstance,
    updateInstanceVersion: updateStudioInstanceVersion,
    updateInstanceLoader: updateStudioInstanceLoader,
    openInstanceConfig: (instanceId: string) => navigate(`/instance-editor?id=${encodeURIComponent(instanceId)}&tab=settings`),
    getInstancePath: getStudioInstancePath,
    searchMarketplaceMods: (query: string, source?: 'all' | 'modrinth' | 'curseforge', loader?: string, gameVersion?: string) =>
      TauriApi.marketplaceSearchMods(query, source, loader, gameVersion),
    installMarketplaceMod: (instanceId: string, source: 'modrinth' | 'curseforge', projectId: string) =>
      TauriApi.marketplaceInstallMod(instanceId, source, projectId),
    installFabricApi: (instanceId: string) =>
      TauriApi.instanceInstallFabricApi(instanceId),
    getModuleEnabled: (moduleId: string) => moduleConfig[moduleId as keyof typeof moduleConfig]?.get() ?? false,
    setModuleEnabled: (moduleId: string, enabled: boolean) => {
      const module = moduleConfig[moduleId as keyof typeof moduleConfig];
      if (!module) return;
      module.set(enabled);
    },
    reloadApp: () => window.location.reload(),
    dumpConfig: dumpStudioConfig,
    resetLayout: resetStudioLayout,
    mockNotification: () => {
      window.dispatchEvent(new CustomEvent('bloom-script-studio-notification', {
        detail: { message: 'Bloom Script Studio notification test.' }
      }));
    },
    inspectTheme: inspectStudioTheme
  }), [
    location.pathname,
    authState?.profile.id,
    authState?.profile.name,
    instances,
    showInternalCommands,
    setShowInternalCommandsFromStudio,
    logLevel,
    setLogLevelFromStudio,
    loadInstances,
    createStudioInstance,
    removeStudioInstance,
    renameStudioInstance,
    launchStudioInstance,
    navigate,
    cloneStudioInstance,
    updateStudioInstanceVersion,
    updateStudioInstanceLoader,
    getStudioInstancePath,
    moduleConfig,
    dumpStudioConfig,
    resetStudioLayout,
    inspectStudioTheme
  ]);

  useEffect(() => {
    consoleContextRef.current = consoleContext;
  }, [consoleContext]);

  const filteredCommands = useMemo(() => {
    const q = commandFilter.trim().toLowerCase();
    if (!q) return commandIndex.allCommandNames.slice(0, 28);
    return commandIndex.allCommandNames.filter((command) => command.includes(q)).slice(0, 28);
  }, [commandFilter, commandIndex.allCommandNames]);

  const selectedTemplate = useMemo(
    () => SCRIPT_TEMPLATES.find((template) => template.id === selectedTemplateId) || SCRIPT_TEMPLATES[0],
    [selectedTemplateId]
  );

  const insertTextAtCursor = useCallback((text: string) => {
    const editor = editorRef.current;
    if (!editor) {
      setCode((current) => `${current}${current.endsWith('\n') ? '' : '\n'}${text}`);
      return;
    }

    const selection = editor.getSelection();
    if (!selection) {
      setCode((current) => `${current}${current.endsWith('\n') ? '' : '\n'}${text}`);
      return;
    }

    editor.executeEdits('bloom-script-studio', [
      {
        range: selection,
        text,
        forceMoveMarkers: true
      }
    ]);
    editor.focus();
  }, []);

  const loadTemplate = useCallback((template: ScriptTemplate, mode: 'replace' | 'append') => {
    setSelectedTemplateId(template.id);
    if (mode === 'replace') {
      setCode(template.code);
      return;
    }
    setCode((current) => `${current.trimEnd()}\n\n${template.code}`);
  }, []);

  const clearEditor = useCallback(() => {
    setCode('# BloomScript\n');
  }, []);

  const clearOutput = useCallback(() => {
    setOutputs([]);
    setLastRunMeta(null);
  }, []);

  const validateScript = useCallback(() => {
    if (analysis.diagnostics.length === 0) {
      setOutputs([
        {
          id: `validation-${Date.now()}`,
          kind: 'success',
          text: 'No diagnostics found. Script is ready to run.',
          line: null,
          atMs: Date.now()
        }
      ]);
      return;
    }

    setOutputs(analysis.diagnostics.map((diagnostic, index) => ({
      id: `diag-${Date.now()}-${index}`,
      kind: diagnostic.severity === 'error' ? 'error' : 'warn',
      text: `line ${diagnostic.line}: ${diagnostic.message}`,
      line: diagnostic.line,
      atMs: Date.now()
    })));
  }, [analysis.diagnostics]);

  const runScript = useCallback(async () => {
    setRunning(true);
    try {
      const result = await executeBloomScript(code, {
        commandIndex,
        commands: consoleCommands,
        consoleContext,
        stopOnError: true
      });

      setOutputs(result.outputs);
      setLastRunMeta({
        ok: result.ok,
        durationMs: result.durationMs,
        executedStatements: result.executedStatements
      });
    } finally {
      setRunning(false);
    }
  }, [code, commandIndex, consoleCommands, consoleContext]);

  const onEditorChange = useCallback((value: string | undefined) => {
    setCode(value ?? '');
  }, []);

  const onImportClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const onImportFile = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onerror = () => {
      setOutputs([
        {
          id: `import-error-${Date.now()}`,
          kind: 'error',
          text: 'Failed to read script file.',
          line: null,
          atMs: Date.now()
        }
      ]);
    };
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      if (!text) return;
      setCode(text);
      setOutputs([
        {
          id: `import-ok-${Date.now()}`,
          kind: 'success',
          text: `Imported ${file.name}`,
          line: null,
          atMs: Date.now()
        }
      ]);
    };
    reader.readAsText(file);
    event.target.value = '';
  }, []);

  const onExportFile = useCallback(() => {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    exportTextFile(`bloom-script-${stamp}.bloomscript`, code);
  }, [code]);

  const onUndo = useCallback(() => {
    editorRef.current?.trigger('studio', 'undo', null);
  }, []);

  const onRedo = useCallback(() => {
    editorRef.current?.trigger('studio', 'redo', null);
  }, []);

  const onSelectAll = useCallback(() => {
    editorRef.current?.trigger('studio', 'editor.action.selectAll', null);
  }, []);

  const onFormatCompact = useCallback(() => {
    setCode((current) => current.split(/\r?\n/).map((line) => line.replace(/\s+$/g, '')).join('\n'));
  }, []);

  const toggleHideEmptySlots = useCallback(() => {
    const current = localStorage.getItem(HIDE_EMPTY_WIDGET_SLOTS_KEY) === 'true';
    const next = !current;
    localStorage.setItem(HIDE_EMPTY_WIDGET_SLOTS_KEY, next ? 'true' : 'false');
    window.dispatchEvent(new CustomEvent(EXTRA_CHANGE_EVENT, { detail: { hideEmptyWidgetSlots: next } }));
  }, []);

  const toggleWidgetDocker = useCallback(() => {
    const current = localStorage.getItem(SHOW_WIDGET_DOCKER_KEY) === 'true';
    const next = !current;
    localStorage.setItem(SHOW_WIDGET_DOCKER_KEY, next ? 'true' : 'false');
    window.dispatchEvent(new CustomEvent(EXTRA_CHANGE_EVENT, { detail: { showWidgetDocker: next } }));
  }, []);

  const resetStudioWidgets = useCallback(() => {
    localStorage.removeItem('bloom_widget_layout_script-studio');
    localStorage.removeItem('bloom_widget_visible_script-studio');
    setWidgetRevision((value) => value + 1);
  }, []);

  const handleBeforeMount = useCallback((monaco: MonacoApi) => {
    ensureBloomScriptLanguage(monaco);
    applyBloomScriptTheme(monaco);
  }, []);

  const handleEditorMount = useCallback((editor: MonacoEditorInstance, monaco: MonacoApi) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    ensureBloomScriptLanguage(monaco);
    applyBloomScriptTheme(monaco);

    completionDisposableRef.current?.dispose();
    completionDisposableRef.current = registerBloomScriptCompletionProvider(monaco, {
      getCommandIndex: () => commandIndexRef.current,
      getConsoleContext: () => consoleContextRef.current || consoleContext,
      getVariables: () => variablesRef.current
    });

    cursorDisposableRef.current?.dispose();
    cursorDisposableRef.current = editor.onDidChangeCursorPosition((event) => {
      setCursor({ line: event.position.lineNumber, column: event.position.column });
    });

    const model = editor.getModel();
    if (model) {
      monaco.editor.setModelMarkers(model, BLOOM_SCRIPT_LANGUAGE_ID, toMonacoMarkers(monaco, analysis.diagnostics));
    }
  }, [analysis.diagnostics, consoleContext]);

  useEffect(() => {
    return () => {
      completionDisposableRef.current?.dispose();
      cursorDisposableRef.current?.dispose();
      completionDisposableRef.current = null;
      cursorDisposableRef.current = null;
    };
  }, []);

  useEffect(() => {
    const monaco = monacoRef.current;
    const editor = editorRef.current;
    const model = editor?.getModel();
    if (!monaco || !model) return;
    monaco.editor.setModelMarkers(model, BLOOM_SCRIPT_LANGUAGE_ID, toMonacoMarkers(monaco, analysis.diagnostics));
  }, [analysis.diagnostics]);

  useEffect(() => {
    const applyTheme = () => {
      if (!monacoRef.current) return;
      applyBloomScriptTheme(monacoRef.current);
    };

    const events = [
      THEME_CHANGE_EVENT,
      'bloom-accent-change',
      'bloom-font-change',
      'bloom-motion-change',
      'bloom-glass-amount-change',
      'bloom-roundness-change'
    ];

    for (const eventName of events) {
      window.addEventListener(eventName, applyTheme as EventListener);
    }

    const observer = new MutationObserver(() => {
      applyTheme();
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'style']
    });

    return () => {
      for (const eventName of events) {
        window.removeEventListener(eventName, applyTheme as EventListener);
      }
      observer.disconnect();
    };
  }, []);

  const diagnosticsBySeverity = useMemo(() => {
    const errors = analysis.diagnostics.filter((diagnostic) => diagnostic.severity === 'error').length;
    const warnings = analysis.diagnostics.filter((diagnostic) => diagnostic.severity === 'warning').length;
    return { errors, warnings };
  }, [analysis.diagnostics]);

  const menuActions = useMemo<Record<StudioMenu, MenuAction[]>>(() => ({
    file: [
      { id: 'new', label: 'New Script', shortcut: 'Ctrl+N', onClick: clearEditor },
      { id: 'import', label: 'Import Script', shortcut: 'Ctrl+O', onClick: onImportClick },
      { id: 'export', label: 'Export Script', shortcut: 'Ctrl+S', onClick: onExportFile }
    ],
    edit: [
      { id: 'undo', label: 'Undo', shortcut: 'Ctrl+Z', onClick: onUndo },
      { id: 'redo', label: 'Redo', shortcut: 'Ctrl+Shift+Z', onClick: onRedo },
      { id: 'select-all', label: 'Select All', shortcut: 'Ctrl+A', onClick: onSelectAll },
      { id: 'format', label: 'Trim Trailing Spaces', onClick: onFormatCompact }
    ],
    run: [
      { id: 'run', label: running ? 'Running...' : 'Run Script', shortcut: 'Ctrl+Enter', onClick: runScript },
      { id: 'validate', label: 'Validate Script', onClick: validateScript },
      { id: 'clear', label: 'Clear Output', onClick: clearOutput }
    ],
    view: [
      { id: 'toggle-docker', label: 'Toggle Widget Docker', onClick: toggleWidgetDocker },
      { id: 'toggle-empty', label: 'Toggle Hide Empty Slots', onClick: toggleHideEmptySlots },
      { id: 'reset-layout', label: 'Reset Widget Layout', onClick: resetStudioWidgets }
    ],
    help: [
      { id: 'starter', label: 'Load Starter Template', onClick: () => loadTemplate(SCRIPT_TEMPLATES[0], 'replace') },
      { id: 'instances', label: 'Open Instances', onClick: () => navigate('/instances') }
    ]
  }), [
    clearEditor,
    onImportClick,
    onExportFile,
    onUndo,
    onRedo,
    onSelectAll,
    onFormatCompact,
    running,
    runScript,
    validateScript,
    clearOutput,
    toggleWidgetDocker,
    toggleHideEmptySlots,
    resetStudioWidgets,
    loadTemplate,
    navigate
  ]);

  const studioWidgets = useMemo<PageWidget[]>(() => [
    {
      id: 'studio-editor',
      title: 'Editor',
      defaultSlot: 'hero',
      content: (
        <div className="p-2">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
            <div className="flex items-center gap-2 text-white/70">
              <Braces size={14} className="g-accent-text" />
              <span className="text-[11px] font-extrabold uppercase tracking-[0.14em]">BloomScript</span>
              <span className="text-[11px] text-white/45">{selectedTemplate.label}</span>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-white/55">
              <span>Errors: {diagnosticsBySeverity.errors}</span>
              <span>Warnings: {diagnosticsBySeverity.warnings}</span>
            </div>
          </div>
          <div className="relative mt-2 h-[460px] overflow-hidden rounded-2xl border border-white/12 bg-black/35">
            <Editor
              value={code}
              language={BLOOM_SCRIPT_LANGUAGE_ID}
              theme={BLOOM_SCRIPT_THEME_ID}
              beforeMount={handleBeforeMount}
              onMount={handleEditorMount}
              onChange={onEditorChange}
              options={{
                automaticLayout: true,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                wordWrap: 'on',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                fontSize: 13,
                lineHeight: 20,
                smoothScrolling: true,
                cursorBlinking: 'smooth',
                bracketPairColorization: { enabled: true },
                renderWhitespace: 'selection',
                suggest: {
                  preview: true,
                  snippetsPreventQuickSuggestions: false
                },
                quickSuggestions: {
                  comments: false,
                  strings: true,
                  other: true
                }
              }}
            />
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] text-white/58">
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1">
                <Sparkles size={12} className="g-accent-text" />
                BloomScript v1
              </span>
              <span>line {cursor.line}, col {cursor.column}</span>
              <span>{analysis.program.variables.length} vars</span>
            </div>
            {lastRunMeta ? (
              <span className={lastRunMeta.ok ? 'text-emerald-300' : 'text-rose-300'}>
                last run {formatDuration(lastRunMeta.durationMs)} | {lastRunMeta.executedStatements} statements
              </span>
            ) : (
              <span>ready</span>
            )}
          </div>
        </div>
      )
    },
    {
      id: 'studio-templates',
      title: 'Templates',
      defaultSlot: 'leftTop',
      content: (
        <div className="p-2">
          <div className="space-y-2 max-h-[240px] overflow-y-auto pr-1">
            {SCRIPT_TEMPLATES.map((template) => (
              <button
                key={template.id}
                onClick={() => loadTemplate(template, 'replace')}
                className="w-full rounded-lg border px-2.5 py-2 text-left transition"
                style={{
                  borderColor: template.id === selectedTemplate.id ? 'color-mix(in srgb, var(--g-accent) 40%, transparent)' : 'rgba(255,255,255,0.08)',
                  background: template.id === selectedTemplate.id ? 'color-mix(in srgb, var(--g-accent) 12%, transparent)' : 'rgba(255,255,255,0.02)'
                }}
              >
                <p className="text-xs font-black text-white">{template.label}</p>
                <p className="mt-1 text-[11px] text-white/55">{template.description}</p>
              </button>
            ))}
          </div>
          <button onClick={() => loadTemplate(selectedTemplate, 'append')} className="g-btn mt-2 h-8 w-full text-[10px] font-extrabold uppercase tracking-[0.12em]">
            Append Template
          </button>
        </div>
      )
    },
    {
      id: 'studio-commands',
      title: 'Commands',
      defaultSlot: 'rightTop',
      content: (
        <div className="p-2">
          <input
            value={commandFilter}
            onChange={(event) => setCommandFilter(event.target.value)}
            placeholder="Filter commands"
            className="g-input h-8 w-full px-2 text-[11px]"
          />
          <div className="mt-2 max-h-[250px] overflow-y-auto space-y-1 pr-1">
            {filteredCommands.map((commandName) => (
              <button
                key={commandName}
                onClick={() => insertTextAtCursor(`${commandName} `)}
                className="w-full rounded-md border border-transparent bg-white/[0.02] px-2 py-1.5 text-left transition hover:border-white/12 hover:bg-white/[0.06]"
              >
                <p className="font-mono text-[11px] text-white/86">{commandName}</p>
              </button>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button onClick={onImportClick} className="g-btn h-8 text-[10px] font-extrabold uppercase tracking-[0.12em] inline-flex items-center justify-center gap-1.5">
              <Upload size={12} /> Import
            </button>
            <button onClick={onExportFile} className="g-btn h-8 text-[10px] font-extrabold uppercase tracking-[0.12em] inline-flex items-center justify-center gap-1.5">
              <Download size={12} /> Export
            </button>
          </div>
        </div>
      )
    },
    {
      id: 'studio-diagnostics',
      title: 'Diagnostics',
      defaultSlot: 'leftBottom',
      content: (
        <div className="p-2">
          <div className="max-h-[220px] overflow-y-auto space-y-2 pr-1">
            {analysis.diagnostics.length === 0 ? (
              <p className="text-[12px] text-emerald-300">No live diagnostics.</p>
            ) : (
              analysis.diagnostics.slice(0, 20).map((diagnostic, index) => (
                <div key={`${diagnostic.line}-${diagnostic.column}-${index}`} className="rounded-lg border border-white/10 bg-black/20 px-2 py-1.5">
                  <p className={diagnostic.severity === 'error' ? 'text-[11px] text-rose-300' : 'text-[11px] text-amber-300'}>
                    line {diagnostic.line}: {diagnostic.message}
                  </p>
                </div>
              ))
            )}
          </div>
          <div className="mt-2 rounded-lg border border-white/10 bg-white/[0.02] px-2 py-2 text-[11px] text-white/62">
            <p>Use <span className="font-mono text-white/82">$variable</span> references after <span className="font-mono text-white/82">let</span>.</p>
            <p className="mt-1">Use dot or spaced commands: <span className="font-mono text-white/82">instance.create</span> / <span className="font-mono text-white/82">instance create</span>.</p>
          </div>
        </div>
      )
    },
    {
      id: 'studio-output',
      title: 'Output',
      defaultSlot: 'rightBottom',
      content: (
        <div className="p-2">
          <div className="rounded-xl border border-white/10 bg-black/30 min-h-[220px] overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-white/55">Execution Output</p>
              <span className="text-[10px] text-white/45">{outputs.length} lines</span>
            </div>
            <div className="max-h-[220px] overflow-y-auto px-3 py-2 font-mono text-[12px] leading-6">
              {outputs.length === 0 ? (
                <p className="text-white/45">Run a script to view command output.</p>
              ) : (
                outputs.map((entry) => (
                  <p key={entry.id} className={outputClass(entry.kind)}>
                    {entry.line ? `[${entry.line}] ` : ''}
                    {entry.text}
                  </p>
                ))
              )}
            </div>
          </div>
        </div>
      )
    }
  ], [
    analysis.diagnostics,
    analysis.program.variables.length,
    code,
    commandFilter,
    cursor.column,
    cursor.line,
    diagnosticsBySeverity.errors,
    diagnosticsBySeverity.warnings,
    filteredCommands,
    handleBeforeMount,
    handleEditorMount,
    insertTextAtCursor,
    lastRunMeta,
    loadTemplate,
    onEditorChange,
    onExportFile,
    onImportClick,
    outputs,
    selectedTemplate,
    selectedTemplate.id
  ]);

  const runMenuAction = (action: MenuAction) => {
    action.onClick();
    setMenuOpen(null);
    setMenuPosition(null);
  };

  const toggleMenu = (menu: StudioMenu, event: React.MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setMenuOpen((current) => {
      const next = current === menu ? null : menu;
      setMenuPosition(next ? { left: rect.left, top: rect.bottom + 6 } : null);
      return next;
    });
  };

  return (
    <div className="mx-auto max-w-[1500px] min-h-full space-y-3">
      <input
        ref={fileInputRef}
        type="file"
        accept=".bloomscript,.bloom,.txt"
        className="hidden"
        onChange={onImportFile}
      />

      <section className="g-panel-strong px-3 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] g-accent-text">Script Studio</p>
            <h1 className="text-xl font-extrabold text-white">BloomScript IDE</h1>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={runScript} disabled={running} className="g-btn-accent h-9 px-3 text-[10px] font-extrabold uppercase tracking-[0.12em] inline-flex items-center gap-1.5 disabled:opacity-60">
              <Play size={13} />
              {running ? 'Running' : 'Run'}
            </button>
            <button onClick={validateScript} className="g-btn h-9 px-3 text-[10px] font-extrabold uppercase tracking-[0.12em] inline-flex items-center gap-1.5">
              <Bug size={13} /> Validate
            </button>
            <button onClick={clearOutput} className="g-btn h-9 px-3 text-[10px] font-extrabold uppercase tracking-[0.12em] inline-flex items-center gap-1.5">
              <RotateCcw size={13} /> Clear
            </button>
          </div>
        </div>

        <div ref={menuBarRef} className="mt-3 flex flex-wrap items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] p-1.5">
          {(['file', 'edit', 'run', 'view', 'help'] as StudioMenu[]).map((menu) => (
            <div key={menu} className="relative">
              <button
                onClick={(event) => toggleMenu(menu, event)}
                className={`h-8 rounded-lg border px-3 text-[11px] font-extrabold uppercase tracking-[0.12em] inline-flex items-center gap-1.5 transition ${menuOpen === menu ? 'border-[var(--g-accent)]/45 bg-[var(--g-accent-soft)] text-white' : 'border-transparent bg-white/[0.02] text-white/75 hover:border-white/15 hover:bg-white/[0.06]'}`}
              >
                {menu}
                <ChevronDown size={12} />
              </button>
            </div>
          ))}
          <div className="ml-auto inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] text-white/45">
            <FileCode2 size={12} />
            <span>compact mode</span>
          </div>
        </div>
      </section>

      {menuOpen && menuPosition && createPortal(
        <div
          ref={menuSurfaceRef}
          className="g-dropdown-surface fixed min-w-[220px] rounded-xl p-1.5 shadow-2xl"
          style={{ left: `${menuPosition.left}px`, top: `${menuPosition.top}px` }}
        >
          {menuActions[menuOpen].map((action) => (
            <button
              key={action.id}
              onClick={() => runMenuAction(action)}
              className="g-select-option flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-[11px] font-bold"
            >
              <span>{action.label}</span>
              {action.shortcut ? <span className="text-[10px] text-white/45">{action.shortcut}</span> : null}
            </button>
          ))}
        </div>,
        document.body
      )}

      <PageWidgets
        key={widgetRevision}
        pageKey="script-studio"
        widgets={studioWidgets}
        dense
      />

      <div className="g-panel px-3 py-2 text-[11px] text-white/58 inline-flex items-center gap-2">
        <FolderUp size={12} />
        <button onClick={() => navigate('/instances')} className="underline underline-offset-2">
          Open Instances
        </button>
      </div>
    </div>
  );
}
