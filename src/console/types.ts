import type { Instance, MarketplaceMod } from '../services/tauri';
import type { ConsoleLogLevel } from '../constants/console';

export type ConsoleOutputKind = 'command' | 'info' | 'success' | 'warn' | 'error';
export type ConsoleCommandVisibility = 'public' | 'internal';

export type ConsoleModuleDefinition = {
  id: string;
  description: string;
};

export type ConsoleThemeDefinition = {
  id: string;
  label: string;
};

export type ConsoleOutputEntry = {
  id: string;
  kind: ConsoleOutputKind;
  text: string;
  atMs: number;
};

export type ConsoleArgSchema = {
  name: string;
  required?: boolean;
  variadic?: boolean;
  choices?: readonly string[];
};

export type ConsoleCommandContext = {
  appVersion: string;
  routePath: string;
  reducedMotionActive: boolean;
  authName: string | null;
  authUuid: string | null;
  instances: Instance[];
  themes: ConsoleThemeDefinition[];
  modules: ConsoleModuleDefinition[];
  showInternalCommands: boolean;
  setShowInternalCommands: (next: boolean) => void;
  hostServersUnlocked: boolean;
  setHostServersUnlocked: (next: boolean) => void;
  logLevel: ConsoleLogLevel;
  setLogLevel: (next: ConsoleLogLevel) => void;
  setTheme: (themeId: string) => void;
  getAppearanceSnapshot: () => Record<string, string>;
  setUiScale: (value: number) => { mappedDensity: string };
  setReducedMotion: (enabled: boolean) => void;
  openCosmeticsModMenu: () => void;
  listInstances: () => Promise<Instance[]>;
  createInstance: (name: string) => Promise<Instance>;
  removeInstance: (instanceId: string) => Promise<void>;
  renameInstance: (instanceId: string, name: string) => Promise<Instance>;
  launchInstance: (instanceId: string) => Promise<void>;
  openInstance: (instanceId: string) => void;
  cloneInstance: (sourceId: string, targetName: string) => Promise<Instance>;
  updateInstanceVersion: (instanceId: string, version: string) => Promise<Instance>;
  updateInstanceLoader: (instanceId: string, loader: 'vanilla' | 'fabric') => Promise<Instance>;
  openInstanceConfig: (instanceId: string) => void;
  getInstancePath: (instanceId: string) => Promise<string>;
  searchMarketplaceMods: (
    query: string,
    source?: 'all' | 'modrinth' | 'curseforge',
    loader?: string,
    gameVersion?: string
  ) => Promise<MarketplaceMod[]>;
  installMarketplaceMod: (instanceId: string, source: 'modrinth' | 'curseforge', projectId: string) => Promise<string>;
  installFabricApi: (instanceId: string) => Promise<string>;
  getModuleEnabled: (moduleId: string) => boolean;
  setModuleEnabled: (moduleId: string, enabled: boolean) => void;
  reloadApp: () => void;
  dumpConfig: () => Record<string, string>;
  resetLayout: () => void;
  mockNotification: () => void;
  inspectTheme: () => Record<string, string>;
};

export type ConsoleCommandResult = {
  kind?: Exclude<ConsoleOutputKind, 'command'>;
  lines?: string[];
  clearOutput?: boolean;
};

export type ConsoleCommandHandler = (
  args: string[],
  context: ConsoleCommandContext
) => Promise<ConsoleCommandResult | void> | ConsoleCommandResult | void;

export type ConsoleAutocompleteProvider = (
  args: string[],
  context: ConsoleCommandContext
) => string[] | Promise<string[]>;

export type ConsoleCommandDefinition = {
  name: string;
  aliases?: string[];
  category: string;
  description: string;
  usage: string;
  args?: ConsoleArgSchema[];
  visibility?: ConsoleCommandVisibility;
  validate?: (args: string[], context: ConsoleCommandContext) => string | null;
  autocomplete?: ConsoleAutocompleteProvider;
  handler: ConsoleCommandHandler;
};

export type ConsoleResolvedCommand = {
  definition: ConsoleCommandDefinition;
  aliasUsed: string;
  args: string[];
};

export type ConsoleParseResult =
  | { ok: true; tokens: string[] }
  | { ok: false; message: string };

export type ConsoleExecutionResult =
  | { ok: true; result: ConsoleCommandResult }
  | { ok: false; message: string; usage?: string };

export type ConsoleSuggestion = {
  value: string;
  description: string;
  category: string;
};
