import { useEffect, useRef, useState, type ChangeEvent, type PointerEventHandler, type ReactNode, type WheelEvent } from 'react';
import { clsx } from 'clsx';
import { APP_VERSION } from '../constants/version';
import { TauriApi } from '../services/tauri';
import { UniversalLoadingOverlay } from '../components/UniversalLoadingOverlay';
import {
  getDefaultShopRarityCustomColors,
  readShopRarityThemeSettings,
  SHOP_RARITY_ORDER,
  SHOP_RARITY_PRESETS,
  writeShopRarityThemeSettings,
  type ShopRarityKey,
  type ShopRarityPresetId,
  type ShopRarityThemeSettings
} from '../services/shopTheme';
import { eventToDisplayShortcut } from '../utils/shortcuts';
import {
  CONSOLE_HOTKEY_DEFAULT,
  CONSOLE_PERSIST_HISTORY_KEY,
  CONSOLE_SETTINGS_CHANGE_EVENT,
  CONSOLE_SHOW_DEV_COMMANDS_KEY,
  CONSOLE_SHOW_STARTUP_TIP_KEY,
  SHORTCUT_CONSOLE_KEY
} from '../constants/console';
import {
  checkForLauncherUpdate,
  downloadAndInstallLauncherUpdate,
  readUpdatePreferences,
  writeUpdatePreferences,
  type ExternalUpdate
} from '../services/updater';

type LauncherTheme = 'light' | 'light-gray' | 'dark' | 'gray' | 'true-dark' | 'ocean' | 'forest' | 'sunset' | 'paper' | 'crt' | 'synthwave' | 'sandstone' | 'minecraft' | 'cartoon' | 'strength-smp' | 'blueprint' | 'holo-grid' | 'lavaforge' | 'candy-pop' | 'mono-ink';
type AccentMode = 'purple' | 'cyan' | 'emerald' | 'amber' | 'rose' | 'rainbow';
type BackgroundMode = 'none' | 'plus' | 'particles' | 'aurora' | 'scanlines' | 'nebula' | 'custom';
type DensityMode = 'compact' | 'cozy' | 'spacious';
type FontPackMode = 'manrope' | 'space-grotesk' | 'sora';
type SidebarMode = 'rail' | 'classic' | 'expanded';
type SidebarPosition = 'left' | 'right' | 'top' | 'bottom';
type CardStyleMode = 'glass' | 'solid' | 'outline';
type TaskbarLogoBackgroundMode = 'default' | 'discord' | 'accent' | 'glass' | 'none';
type ButtonThemeMode = 'default' | 'simple' | 'cartoon' | 'glass' | 'neon' | 'pixel' | 'brutalist' | 'pill' | 'terminal' | 'arcade';
type MotionMode = 'off' | 'subtle' | 'standard' | 'cinematic';
type MotionEasingPreset = 'out-quad' | 'out-cubic' | 'in-out-cubic' | 'out-back' | 'out-elastic' | 'linear' | 'custom';
type IconPackMode = 'default' | 'bold' | 'rounded' | 'pixel';
type StartupSceneTheme = 'nova' | 'horizon' | 'matrix';
type StartupSceneSoundProfile = 'off' | 'shimmer' | 'impact';
type InstanceInstallLoadingStyle = 'orbit' | 'bars' | 'prism' | 'pulse';

type AppearancePresetPayload = {
  themeMode: LauncherTheme;
  accentMode: AccentMode;
  backgroundMode: BackgroundMode;
  backgroundVisualOpacity: number;
  taskbarSurfaceOpacity: number;
  dropdownOpacity: number;
  densityMode: DensityMode;
  fontPackMode: FontPackMode;
  sidebarMode: SidebarMode;
  sidebarPosition: SidebarPosition;
  cardStyleMode: CardStyleMode;
  taskbarLogoBackgroundMode: TaskbarLogoBackgroundMode;
  buttonTheme: ButtonThemeMode;
  motionMode: MotionMode;
  motionFps: number;
  motionAnimDurationMs: number;
  motionFadeDurationMs: number;
  motionStaggerMs: number;
  motionOffsetX: number;
  motionOffsetY: number;
  motionEasingPreset: MotionEasingPreset;
  motionEasingX1: number;
  motionEasingY1: number;
  motionEasingX2: number;
  motionEasingY2: number;
  uiAssetPixelLevel: number;
  iconPackMode: IconPackMode;
  roundnessLevel: number;
  buttonRoundnessLevel: number;
  glassAmount: number;
  customBackgroundDataUrl?: string | null;
};

type AppearancePresetRecord = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  payload: AppearancePresetPayload;
};

type AppearancePresetExportFileV1 = {
  type: 'bloom-appearance-preset';
  version: 1;
  preset: AppearancePresetRecord;
};

type SettingsTab = 'general' | 'appearance' | 'keybinds' | 'widgets' | 'updates' | 'extra';
type AppearanceSection = 'animation' | 'background' | 'sidebar' | 'style' | 'presets' | 'shop';
type SidebarTabId = 'home' | 'instances' | 'marketplace' | 'importer' | 'widgets' | 'cosmetics' | 'custom-cape' | 'chat' | 'script-studio' | 'host-server' | 'games' | 'help' | 'information';
type SidebarTabsVisibility = Record<SidebarTabId, boolean>;

const APPEARANCE_SECTIONS: { id: AppearanceSection; label: string; description: string }[] = [
  { id: 'animation', label: 'Animation', description: 'FPS, easing, and motion profile settings.' },
  { id: 'background', label: 'Background', description: 'Background mode, opacity, and custom image controls.' },
  { id: 'sidebar', label: 'Sidebar', description: 'Sidebar style, position, and dock visuals.' },
  { id: 'style', label: 'Style', description: 'Buttons, roundness, card style, icon pack, and glass.' },
  { id: 'presets', label: 'Presets', description: 'Save, import, export, and apply appearance presets.' },
  { id: 'shop', label: 'Shop', description: 'Rarity palette and cosmetic storefront color overrides.' }
];

const SIDEBAR_TABS_VISIBILITY_DEFAULTS: SidebarTabsVisibility = {
  home: true,
  instances: true,
  marketplace: true,
  importer: true,
  widgets: true,
  cosmetics: true,
  'custom-cape': true,
  chat: false,
  'script-studio': false,
  'host-server': false,
  games: false,
  help: true,
  information: true
};

const THEME_STORAGE_KEY = 'bloom_theme_mode';
const THEME_CHANGE_EVENT = 'bloom-theme-change';
const ACCENT_STORAGE_KEY = 'bloom_accent_mode';
const ACCENT_CHANGE_EVENT = 'bloom-accent-change';
const BACKGROUND_STORAGE_KEY = 'bloom_background_mode';
const BACKGROUND_CHANGE_EVENT = 'bloom-background-change';
const BACKGROUND_VISUAL_OPACITY_KEY = 'bloom_background_visual_opacity';
const BACKGROUND_VISUAL_OPACITY_CHANGE_EVENT = 'bloom-background-visual-opacity-change';
const DENSITY_STORAGE_KEY = 'bloom_density_mode';
const DENSITY_CHANGE_EVENT = 'bloom-density-change';
const FONT_STORAGE_KEY = 'bloom_font_pack';
const FONT_CHANGE_EVENT = 'bloom-font-change';
const SIDEBAR_STORAGE_KEY = 'bloom_sidebar_mode';
const SIDEBAR_CHANGE_EVENT = 'bloom-sidebar-change';
const SIDEBAR_POSITION_STORAGE_KEY = 'bloom_sidebar_position';
const SIDEBAR_POSITION_CHANGE_EVENT = 'bloom-sidebar-position-change';
const CARD_STYLE_STORAGE_KEY = 'bloom_card_style';
const CARD_STYLE_CHANGE_EVENT = 'bloom-card-style-change';
const TASKBAR_LOGO_BACKGROUND_KEY = 'bloom_taskbar_logo_background';
const TASKBAR_LOGO_BACKGROUND_CHANGE_EVENT = 'bloom-taskbar-logo-background-change';
const TASKBAR_SURFACE_OPACITY_KEY = 'bloom_taskbar_surface_opacity';
const TASKBAR_SURFACE_OPACITY_CHANGE_EVENT = 'bloom-taskbar-surface-opacity-change';
const DROPDOWN_OPACITY_KEY = 'bloom_dropdown_opacity';
const DROPDOWN_OPACITY_CHANGE_EVENT = 'bloom-dropdown-opacity-change';
const BUTTON_THEME_STORAGE_KEY = 'bloom_button_theme';
const BUTTON_THEME_CHANGE_EVENT = 'bloom-button-theme-change';
const MOTION_STORAGE_KEY = 'bloom_motion_mode';
const MOTION_CHANGE_EVENT = 'bloom-motion-change';
const MOTION_FPS_STORAGE_KEY = 'bloom_motion_fps';
const MOTION_FPS_CHANGE_EVENT = 'bloom-motion-fps-change';
const MOTION_TUNING_EVENT = 'bloom-motion-tuning-change';
const MOTION_ANIM_DURATION_KEY = 'bloom_motion_anim_duration';
const MOTION_FADE_DURATION_KEY = 'bloom_motion_fade_duration';
const MOTION_STAGGER_KEY = 'bloom_motion_stagger';
const MOTION_OFFSET_X_KEY = 'bloom_motion_offset_x';
const MOTION_OFFSET_Y_KEY = 'bloom_motion_offset_y';
const MOTION_EASING_PRESET_KEY = 'bloom_motion_easing_preset';
const MOTION_EASING_X1_KEY = 'bloom_motion_easing_x1';
const MOTION_EASING_Y1_KEY = 'bloom_motion_easing_y1';
const MOTION_EASING_X2_KEY = 'bloom_motion_easing_x2';
const MOTION_EASING_Y2_KEY = 'bloom_motion_easing_y2';
const SHOW_WIDGET_DOCKER_KEY = 'bloom_show_widget_docker';
const HIDE_EMPTY_WIDGET_SLOTS_KEY = 'bloom_hide_empty_widget_slots';
const SHOW_GAMES_SECTION_KEY = 'bloom_show_games_section';
const EXTRA_CHANGE_EVENT = 'bloom-extra-change';
const SIDEBAR_DOCK_HOVER_ENABLED_KEY = 'bloom_sidebar_dock_hover_enabled';
const SIDEBAR_DOCK_GROW_SIZE_KEY = 'bloom_sidebar_dock_grow_size';
const SIDEBAR_DOCK_GROW_SPEED_KEY = 'bloom_sidebar_dock_grow_speed';
const SIDEBAR_TAB_GAP_KEY = 'bloom_sidebar_tab_gap';
const SIDEBAR_TABS_VISIBILITY_KEY = 'bloom_sidebar_tabs_visibility';
const UI_ASSET_PIXEL_LEVEL_KEY = 'bloom_ui_asset_pixel_level';
const UI_ASSET_PIXEL_LEVEL_CHANGE_EVENT = 'bloom-ui-asset-pixel-level-change';
const ICON_PACK_KEY = 'bloom_icon_pack';
const ICON_PACK_CHANGE_EVENT = 'bloom-icon-pack-change';
const ROUNDNESS_KEY = 'bloom_roundness_level';
const ROUNDNESS_CHANGE_EVENT = 'bloom-roundness-change';
const BUTTON_ROUNDNESS_KEY = 'bloom_button_roundness_level';
const BUTTON_ROUNDNESS_CHANGE_EVENT = 'bloom-button-roundness-change';
const GLASS_AMOUNT_KEY = 'bloom_glass_amount';
const GLASS_AMOUNT_CHANGE_EVENT = 'bloom-glass-amount-change';
const SHORTCUT_SEARCH_KEY = 'bloom_shortcut_search';
const SHORTCUT_CREATE_INSTANCE_KEY = 'bloom_shortcut_create_instance';
const SHORTCUT_SETTINGS_KEY = 'bloom_shortcut_settings';
const SHORTCUT_REPLAY_STARTUP_SCENE_KEY = 'bloom_shortcut_replay_startup_scene';
const SHORTCUTS_CHANGE_EVENT = 'bloom-shortcuts-change';
const EXTRA_KEYBINDS_STORAGE_KEY = 'bloom_extra_keybinds';
const STARTUP_SCENE_ENABLED_KEY = 'bloom_startup_scene_enabled';
const STARTUP_SCENE_THEME_KEY = 'bloom_startup_scene_theme';
const STARTUP_SCENE_SOUND_PROFILE_KEY = 'bloom_startup_scene_sound_profile';
const STARTUP_SCENE_CHANGE_EVENT = 'bloom-startup-scene-change';
const ROUTE_TAB_ANIMATIONS_KEY = 'bloom_route_tab_animations_enabled';
const INSTANCE_INSTALL_LOADING_STYLE_KEY = 'bloom_instance_install_loading_style';
const APPEARANCE_PRESETS_KEY = 'bloom_appearance_presets';

const THEMES: { id: LauncherTheme; label: string; description: string }[] = [
  { id: 'dark', label: 'Dark', description: 'Deep contrast with glow.' },
  { id: 'gray', label: 'Gray', description: 'Desaturated graphite palette.' },
  { id: 'true-dark', label: 'True Dark', description: 'OLED-friendly blackout.' },
  { id: 'ocean', label: 'Ocean', description: 'Blue-cyan neon vibe.' },
  { id: 'forest', label: 'Forest', description: 'Emerald tactical look.' },
  { id: 'sunset', label: 'Sunset', description: 'Warm orange-magenta glow.' },
  { id: 'paper', label: 'Paper', description: 'Editorial UI with crisp ink contrast.' },
  { id: 'crt', label: 'CRT', description: 'Retro phosphor with scanline glass.' },
  { id: 'synthwave', label: 'Synthwave', description: 'Neon night with arcade highlights.' },
  { id: 'sandstone', label: 'Sandstone', description: 'Soft clay surfaces with warm depth.' },
  { id: 'minecraft', label: 'Minecraft', description: 'Pixel-grass UI with blocky terrain energy.' },
  { id: 'cartoon', label: 'Cartoon', description: 'Bold outlines and punchy comic contrast.' },
  { id: 'strength-smp', label: 'Strength SMP', description: 'Rugged PvP steel-and-crimson look.' },
  { id: 'blueprint', label: 'Blueprint', description: 'Technical grid style with cyan drafting lines.' },
  { id: 'holo-grid', label: 'Holo Grid', description: 'Sci-fi cyan HUD with scanning lattice.' },
  { id: 'lavaforge', label: 'Lavaforge', description: 'Molten metal UI with ember depth.' },
  { id: 'candy-pop', label: 'Candy Pop', description: 'Sticker-bright playful interface style.' },
  { id: 'mono-ink', label: 'Mono Ink', description: 'Monochrome print look with halftone texture.' }
];

const ICON_PACKS: { id: IconPackMode; label: string; description: string }[] = [
  { id: 'default', label: 'Default', description: 'Current icon style.' },
  { id: 'bold', label: 'Bold', description: 'Thicker, stronger strokes.' },
  { id: 'rounded', label: 'Rounded', description: 'Soft modern icon finish.' },
  { id: 'pixel', label: 'Pixel', description: 'Sharper Minecraft-like look.' }
];

const TASKBAR_LOGO_BACKGROUNDS: { id: TaskbarLogoBackgroundMode; label: string; description: string; preview: string }[] = [
  { id: 'default', label: 'Default', description: 'Matches the current dock tile.', preview: 'color-mix(in srgb, white 5%, transparent)' },
  { id: 'discord', label: 'Discord', description: 'Dense charcoal block like Discord.', preview: 'linear-gradient(180deg, rgba(47,49,54,0.98), rgba(32,34,37,0.98))' },
  { id: 'accent', label: 'Accent', description: 'Use your launcher accent gradient.', preview: 'var(--g-accent-gradient)' },
  { id: 'glass', label: 'Glass', description: 'Transparent frosted tile.', preview: 'linear-gradient(180deg, rgba(255,255,255,0.16), rgba(255,255,255,0.05))' },
  { id: 'none', label: 'None', description: 'Show just the Bloom logo.', preview: 'linear-gradient(135deg, transparent 0 40%, rgba(255,255,255,0.12) 40% 60%, transparent 60% 100%)' }
];

const BUTTON_THEMES: { id: ButtonThemeMode; label: string; description: string }[] = [
  { id: 'default', label: 'Default', description: 'Balanced launcher style.' },
  { id: 'simple', label: 'Simple', description: 'Quiet minimal buttons.' },
  { id: 'cartoon', label: 'Cartoon', description: 'Bold comic outline feel.' },
  { id: 'glass', label: 'Glass', description: 'Soft blurred elevated buttons.' },
  { id: 'neon', label: 'Neon', description: 'Glowing cyber accent edges.' },
  { id: 'pixel', label: 'Pixel', description: 'Chunky retro game switch look.' },
  { id: 'brutalist', label: 'Brutalist', description: 'Hard edges and block shadows.' },
  { id: 'pill', label: 'Pill', description: 'Rounded capsule controls.' },
  { id: 'terminal', label: 'Terminal', description: 'Mono dashed command style.' },
  { id: 'arcade', label: 'Arcade', description: 'Punchy cabinet-button depth.' }
];

const STARTUP_SCENE_THEMES: { id: StartupSceneTheme; label: string; description: string }[] = [
  { id: 'nova', label: 'Nova', description: 'Neon burst intro.' },
  { id: 'horizon', label: 'Horizon', description: 'Sunrise gradient flow.' },
  { id: 'matrix', label: 'Matrix', description: 'Grid pulse style.' }
];

const INSTANCE_INSTALL_LOADING_STYLES: { id: InstanceInstallLoadingStyle; label: string; description: string }[] = [
  { id: 'orbit', label: 'Orbit', description: 'Single orbit ring around a center core.' },
  { id: 'bars', label: 'Bars', description: 'Quiet vertical bars with staggered motion.' },
  { id: 'prism', label: 'Prism', description: 'Rotating diamond frame with a bright core.' },
  { id: 'pulse', label: 'Pulse', description: 'Soft expanding rings with a minimal center.' }
];

const KEYBIND_GROUPS = [
  {
    title: 'Global',
    bindings: [
      { id: 'search', label: 'Open Search', description: 'Focus the launcher search overlay.', defaultValue: 'Ctrl+K', wired: true },
      { id: 'create', label: 'Create Instance', description: 'Jump straight into the instance create flow.', defaultValue: 'Ctrl+N', wired: true },
      { id: 'settings', label: 'Open Settings', description: 'Open the main settings page.', defaultValue: 'Ctrl+,', wired: true },
      { id: 'console', label: 'Open Console', description: 'Toggle the Bloom developer console overlay.', defaultValue: CONSOLE_HOTKEY_DEFAULT, wired: true },
      { id: 'replay-startup-scene', label: 'Replay Startup Scene', description: 'Replay the Bloom intro scene.', defaultValue: 'Ctrl+Shift+J', wired: true },
      { id: 'open-help', label: 'Open Help', description: 'Open the help page.', defaultValue: '', wired: true },
      { id: 'open-marketplace', label: 'Open Marketplace', description: 'Jump to the marketplace page.', defaultValue: '', wired: true }
    ]
  },
  {
    title: 'Instance Editor',
    bindings: [
      { id: 'save-instance-settings', label: 'Save Instance Settings', description: 'Save the active instance editor form.', defaultValue: '', wired: true },
      { id: 'next-instance-tab', label: 'Next Instance Tab', description: 'Move between Mods, Resource Packs, Shaders, and Settings.', defaultValue: '', wired: true },
      { id: 'previous-instance-tab', label: 'Previous Instance Tab', description: 'Move back across the editor tabs.', defaultValue: '', wired: true },
      { id: 'switch-installed-view', label: 'Switch To Installed Tab', description: 'Switch to the Installed library view.', defaultValue: '', wired: true },
      { id: 'switch-install-view', label: 'Switch To Install Tab', description: 'Switch to the Install library view.', defaultValue: '', wired: true },
      { id: 'copy-instance-options', label: 'Copy Instance Options', description: 'Copy the current instance option files.', defaultValue: '', wired: true },
      { id: 'paste-instance-options', label: 'Paste Instance Options', description: 'Apply copied options to the current instance.', defaultValue: '', wired: true }
    ]
  },
  {
    title: 'Library and Widgets',
    bindings: [
      { id: 'refresh-active-page', label: 'Refresh Active Page', description: 'Reload the active page data.', defaultValue: '', wired: true },
      { id: 'open-active-folder', label: 'Open Active Folder', description: 'Open the current mods/resourcepacks/shaders folder.', defaultValue: '', wired: true },
      { id: 'toggle-widget-docker', label: 'Toggle Widget Docker', description: 'Show or hide the widget docker.', defaultValue: '', wired: true },
      { id: 'focus-page-search', label: 'Focus Page Search', description: 'Focus search inputs inside supported pages.', defaultValue: '', wired: true },
      { id: 'quick-launch-selected', label: 'Quick Launch Selected', description: 'Launch the first visible instance on the library page.', defaultValue: '', wired: true },
      { id: 'open-downloads', label: 'Open Downloads', description: 'Open the downloads/import page.', defaultValue: '', wired: true }
    ]
  }
] as const;

const STARTUP_SCENE_SOUND_PROFILES: { id: StartupSceneSoundProfile; label: string; description: string }[] = [
  { id: 'off', label: 'Off', description: 'Silent startup.' },
  { id: 'shimmer', label: 'Shimmer', description: 'Light rising tone.' },
  { id: 'impact', label: 'Impact', description: 'Punchier digital hit.' }
];

const SHOP_RARITY_LABELS: Record<ShopRarityKey, string> = {
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  epic: 'Epic',
  legendary: 'Legendary',
  mythic: 'Mythic',
  unique: 'Unique',
  featured: 'Featured',
  partner: 'Partner',
  custom: 'Custom'
};

type BackgroundTargetSize = { width: number; height: number };
type CustomBackgroundMediaKind = 'image' | 'video' | null;

function resolveBackgroundTarget(_width: number, _height: number): BackgroundTargetSize {
  return { width: 1920, height: 1080 };
}

function clamp01(value: number) {
  return Math.max(-1, Math.min(1, value));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function loadImageElement(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to load image.'));
    image.src = src;
  });
}

async function fileToDataUrl(file: File) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read selected image.'));
    reader.readAsDataURL(file);
  });
}

async function renderCustomBackgroundImage(
  src: string,
  target: BackgroundTargetSize,
  zoom: number,
  panX: number,
  panY: number
) {
  const image = await loadImageElement(src);
  const canvas = document.createElement('canvas');
  canvas.width = target.width;
  canvas.height = target.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to prepare background canvas.');
  const baseScale = Math.max(target.width / image.naturalWidth, target.height / image.naturalHeight);
  const scaledWidth = image.naturalWidth * baseScale * zoom;
  const scaledHeight = image.naturalHeight * baseScale * zoom;
  const overflowX = Math.max(0, (scaledWidth - target.width) / 2);
  const overflowY = Math.max(0, (scaledHeight - target.height) / 2);
  const offsetX = target.width / 2 - scaledWidth / 2 - overflowX * clamp01(panX);
  const offsetY = target.height / 2 - scaledHeight / 2 - overflowY * clamp01(panY);
  ctx.drawImage(image, offsetX, offsetY, scaledWidth, scaledHeight);
  return canvas.toDataURL('image/jpeg', 0.94);
}

function dataUrlToBytes(dataUrl: string) {
  const [, payload = ''] = dataUrl.split(',');
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return Array.from(bytes);
}

function clampSidebarDockGrowSize(value: number) {
  return Math.max(0, Math.min(140, Math.round(value)));
}

function clampSidebarDockGrowSpeed(value: number) {
  return Math.max(60, Math.min(450, Math.round(value)));
}

function clampSidebarTabGap(value: number) {
  return Math.max(0, Math.min(30, Math.round(value)));
}

function clampUiAssetPixelLevel(value: number) {
  return Math.max(0, Math.min(5, Math.round(value)));
}

function clampRoundness(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function readSidebarTabsVisibility(): SidebarTabsVisibility {
  try {
    const raw = localStorage.getItem(SIDEBAR_TABS_VISIBILITY_KEY);
    if (!raw) return { ...SIDEBAR_TABS_VISIBILITY_DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<Record<SidebarTabId, unknown>>;
    return {
      home: typeof parsed.home === 'boolean' ? parsed.home : SIDEBAR_TABS_VISIBILITY_DEFAULTS.home,
      instances: typeof parsed.instances === 'boolean' ? parsed.instances : SIDEBAR_TABS_VISIBILITY_DEFAULTS.instances,
      marketplace: typeof parsed.marketplace === 'boolean' ? parsed.marketplace : SIDEBAR_TABS_VISIBILITY_DEFAULTS.marketplace,
      importer: typeof parsed.importer === 'boolean' ? parsed.importer : SIDEBAR_TABS_VISIBILITY_DEFAULTS.importer,
      widgets: typeof parsed.widgets === 'boolean' ? parsed.widgets : SIDEBAR_TABS_VISIBILITY_DEFAULTS.widgets,
      cosmetics: typeof parsed.cosmetics === 'boolean' ? parsed.cosmetics : SIDEBAR_TABS_VISIBILITY_DEFAULTS.cosmetics,
      'custom-cape': typeof parsed['custom-cape'] === 'boolean' ? parsed['custom-cape'] : SIDEBAR_TABS_VISIBILITY_DEFAULTS['custom-cape'],
      chat: typeof parsed.chat === 'boolean' ? parsed.chat : SIDEBAR_TABS_VISIBILITY_DEFAULTS.chat,
      'script-studio': typeof parsed['script-studio'] === 'boolean' ? parsed['script-studio'] : SIDEBAR_TABS_VISIBILITY_DEFAULTS['script-studio'],
      'host-server': typeof parsed['host-server'] === 'boolean' ? parsed['host-server'] : SIDEBAR_TABS_VISIBILITY_DEFAULTS['host-server'],
      games: typeof parsed.games === 'boolean' ? parsed.games : SIDEBAR_TABS_VISIBILITY_DEFAULTS.games,
      help: typeof parsed.help === 'boolean' ? parsed.help : SIDEBAR_TABS_VISIBILITY_DEFAULTS.help,
      information: typeof parsed.information === 'boolean' ? parsed.information : SIDEBAR_TABS_VISIBILITY_DEFAULTS.information
    };
  } catch {
    return { ...SIDEBAR_TABS_VISIBILITY_DEFAULTS };
  }
}

function clampGlassAmount(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function clampBackgroundOpacity(value: number) {
  return Math.max(10, Math.min(100, Math.round(value)));
}

function clampDropdownOpacity(value: number) {
  return Math.max(35, Math.min(100, Math.round(value)));
}

function readBooleanSetting(key: string, fallback: boolean) {
  const raw = localStorage.getItem(key);
  if (raw === null) return fallback;
  return raw !== 'false';
}

function sanitizePresetName(input: string) {
  return input.trim().slice(0, 64);
}

function slugifyPresetName(name: string) {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return slug || 'appearance-preset';
}

function triggerJsonDownload(fileName: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function saveJsonWithFilePicker(fileName: string, payload: unknown) {
  const text = JSON.stringify(payload, null, 2);
  const picker = (window as unknown as {
    showSaveFilePicker?: (options: {
      suggestedName?: string;
      types?: Array<{ description?: string; accept: Record<string, string[]> }>;
    }) => Promise<{
      createWritable: () => Promise<{ write: (data: string) => Promise<void>; close: () => Promise<void> }>;
    }>;
  }).showSaveFilePicker;

  if (!picker) {
    triggerJsonDownload(fileName, payload);
    return true;
  }

  try {
    const handle = await picker({
      suggestedName: fileName,
      types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }]
    });
    const writable = await handle.createWritable();
    await writable.write(text);
    await writable.close();
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return false;
    }
    triggerJsonDownload(fileName, payload);
    return true;
  }
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseAppearancePresetPayload(raw: unknown): AppearancePresetPayload | null {
  if (!isObjectRecord(raw)) return null;

  const isTheme = (value: unknown): value is LauncherTheme => THEMES.some((theme) => theme.id === value);
  const isAccent = (value: unknown): value is AccentMode => ACCENTS.some((accent) => accent.id === value);
  const isBackground = (value: unknown): value is BackgroundMode =>
    value === 'none' || value === 'plus' || value === 'particles' || value === 'aurora' || value === 'scanlines' || value === 'nebula' || value === 'custom';
  const isDensity = (value: unknown): value is DensityMode => value === 'compact' || value === 'cozy' || value === 'spacious';
  const isFont = (value: unknown): value is FontPackMode => value === 'manrope' || value === 'space-grotesk' || value === 'sora';
  const isSidebarMode = (value: unknown): value is SidebarMode => value === 'rail' || value === 'classic' || value === 'expanded';
  const isSidebarPosition = (value: unknown): value is SidebarPosition => value === 'left' || value === 'right' || value === 'top' || value === 'bottom';
  const isCardStyle = (value: unknown): value is CardStyleMode => value === 'glass' || value === 'solid' || value === 'outline';
  const isTaskbarLogo = (value: unknown): value is TaskbarLogoBackgroundMode =>
    value === 'default' || value === 'discord' || value === 'accent' || value === 'glass' || value === 'none';
  const isButtonTheme = (value: unknown): value is ButtonThemeMode =>
    value === 'default' || value === 'simple' || value === 'cartoon' || value === 'glass' || value === 'neon' || value === 'pixel' || value === 'brutalist' || value === 'pill' || value === 'terminal' || value === 'arcade';
  const isMotionMode = (value: unknown): value is MotionMode => value === 'off' || value === 'subtle' || value === 'standard' || value === 'cinematic';
  const isMotionEasingPreset = (value: unknown): value is MotionEasingPreset =>
    value === 'out-quad' || value === 'out-cubic' || value === 'in-out-cubic' || value === 'out-back' || value === 'out-elastic' || value === 'linear' || value === 'custom';
  const isIconPack = (value: unknown): value is IconPackMode => value === 'default' || value === 'bold' || value === 'rounded' || value === 'pixel';

  if (!isTheme(raw.themeMode)) return null;
  if (!isAccent(raw.accentMode)) return null;
  if (!isBackground(raw.backgroundMode)) return null;
  if (!isDensity(raw.densityMode)) return null;
  if (!isFont(raw.fontPackMode)) return null;
  if (!isSidebarMode(raw.sidebarMode)) return null;
  if (!isSidebarPosition(raw.sidebarPosition)) return null;
  if (!isCardStyle(raw.cardStyleMode)) return null;
  if (!isTaskbarLogo(raw.taskbarLogoBackgroundMode)) return null;
  if (!isButtonTheme(raw.buttonTheme)) return null;
  if (!isMotionMode(raw.motionMode)) return null;
  if (!isMotionEasingPreset(raw.motionEasingPreset)) return null;
  if (!isIconPack(raw.iconPackMode)) return null;

  const tuning = clampMotionTuning({
    animDurationMs: Number(raw.motionAnimDurationMs),
    fadeDurationMs: Number(raw.motionFadeDurationMs),
    staggerMs: Number(raw.motionStaggerMs),
    offsetX: Number(raw.motionOffsetX),
    offsetY: Number(raw.motionOffsetY),
    easingPreset: raw.motionEasingPreset,
    easingX1: Number(raw.motionEasingX1),
    easingY1: Number(raw.motionEasingY1),
    easingX2: Number(raw.motionEasingX2),
    easingY2: Number(raw.motionEasingY2)
  });

  return {
    themeMode: raw.themeMode,
    accentMode: raw.accentMode,
    backgroundMode: raw.backgroundMode,
    backgroundVisualOpacity: clampBackgroundOpacity(Number(raw.backgroundVisualOpacity)),
    taskbarSurfaceOpacity: clampPercent(Number(raw.taskbarSurfaceOpacity)),
    dropdownOpacity: Number.isFinite(Number(raw.dropdownOpacity)) ? clampDropdownOpacity(Number(raw.dropdownOpacity)) : 92,
    densityMode: raw.densityMode,
    fontPackMode: raw.fontPackMode,
    sidebarMode: raw.sidebarMode,
    sidebarPosition: raw.sidebarPosition,
    cardStyleMode: raw.cardStyleMode,
    taskbarLogoBackgroundMode: raw.taskbarLogoBackgroundMode,
    buttonTheme: raw.buttonTheme,
    motionMode: raw.motionMode,
    motionFps: Math.max(14, Math.min(30, Math.round(Number(raw.motionFps)))),
    motionAnimDurationMs: tuning.animDurationMs,
    motionFadeDurationMs: tuning.fadeDurationMs,
    motionStaggerMs: tuning.staggerMs,
    motionOffsetX: tuning.offsetX,
    motionOffsetY: tuning.offsetY,
    motionEasingPreset: tuning.easingPreset,
    motionEasingX1: tuning.easingX1,
    motionEasingY1: tuning.easingY1,
    motionEasingX2: tuning.easingX2,
    motionEasingY2: tuning.easingY2,
    uiAssetPixelLevel: clampUiAssetPixelLevel(Number(raw.uiAssetPixelLevel)),
    iconPackMode: raw.iconPackMode,
    roundnessLevel: clampRoundness(Number(raw.roundnessLevel)),
    buttonRoundnessLevel: clampRoundness(Number(raw.buttonRoundnessLevel)),
    glassAmount: clampGlassAmount(Number(raw.glassAmount)),
    customBackgroundDataUrl: typeof raw.customBackgroundDataUrl === 'string' ? raw.customBackgroundDataUrl : null
  };
}

function parseAppearancePresetRecord(raw: unknown): AppearancePresetRecord | null {
  if (!isObjectRecord(raw)) return null;
  const payload = parseAppearancePresetPayload(raw.payload);
  if (!payload) return null;
  const name = sanitizePresetName(String(raw.name ?? 'Preset'));
  return {
    id: typeof raw.id === 'string' && raw.id.trim() ? raw.id : crypto.randomUUID(),
    name: name || 'Preset',
    createdAt: Number.isFinite(Number(raw.createdAt)) ? Number(raw.createdAt) : Date.now(),
    updatedAt: Number.isFinite(Number(raw.updatedAt)) ? Number(raw.updatedAt) : Date.now(),
    payload
  };
}

function readStoredAppearancePresets(): AppearancePresetRecord[] {
  try {
    const raw = localStorage.getItem(APPEARANCE_PRESETS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(parseAppearancePresetRecord)
      .filter((preset): preset is AppearancePresetRecord => Boolean(preset))
      .slice(0, 100);
  } catch {
    return [];
  }
}

function AppearanceDropdown(props: { title: string; description: string; children: ReactNode }) {
  const { title, description, children } = props;
  return (
    <details open className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <summary className="cursor-pointer list-none">
        <p className="text-xs uppercase tracking-[0.14em] font-extrabold text-white/60">{title}</p>
        <p className="text-xs g-muted mt-1">{description}</p>
      </summary>
      <div className="mt-4 space-y-4">
        {children}
      </div>
    </details>
  );
}

function parseShopColorHex(value: string) {
  const raw = value.trim();
  const hex = raw.match(/^#([0-9a-f]{6})$/i);
  if (hex) return `#${hex[1].toLowerCase()}`;
  const rgba = raw.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!rgba) return '#a979ff';
  const toHex = (channel: string) => Math.max(0, Math.min(255, Number(channel) || 0)).toString(16).padStart(2, '0');
  return `#${toHex(rgba[1])}${toHex(rgba[2])}${toHex(rgba[3])}`;
}

function writeShopColorValue(hex: string, current: string) {
  if (!current.trim().toLowerCase().startsWith('rgba')) return hex.toLowerCase();
  const alphaMatch = current.match(/rgba\(\d+,\s*\d+,\s*\d+,\s*([0-9.]+)\)/i);
  const alpha = alphaMatch ? Math.max(0, Math.min(1, Number(alphaMatch[1]) || 0)).toFixed(2) : '0.45';
  const clean = hex.replace('#', '');
  const r = Number.parseInt(clean.slice(0, 2), 16);
  const g = Number.parseInt(clean.slice(2, 4), 16);
  const b = Number.parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function ShopColorField(props: { label: string; value: string; onChange: (next: string) => void }) {
  const { label, value, onChange } = props;
  return (
    <div className="rounded-lg border border-white/15 bg-white/[0.04] p-2 space-y-2">
      <p className="text-[10px] font-black uppercase tracking-[0.12em] text-white/55">{label}</p>
      <input
        type="color"
        value={parseShopColorHex(value)}
        onChange={(event) => onChange(writeShopColorValue(event.target.value, value))}
        className="h-9 w-full rounded-md border border-white/15 bg-black/30"
      />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 w-full rounded-md border border-white/15 bg-black/35 px-2 text-xs text-white placeholder:text-white/35 outline-none"
      />
    </div>
  );
}

function LoadingScreenPreviewGlyph({ style }: { style: InstanceInstallLoadingStyle }) {
  if (style === 'bars') {
    return (
      <div className="flex h-16 items-end justify-center gap-1.5">
        {[0, 1, 2, 3].map((index) => (
          <span
            key={index}
            className="w-2 rounded-full bg-white/85"
            style={{ height: `${20 + index * 7}px`, opacity: 0.45 + index * 0.12 }}
          />
        ))}
      </div>
    );
  }
  if (style === 'prism') {
    return (
      <div className="relative h-16 w-16">
        <div className="absolute inset-0 rotate-45 rounded-[18px] border border-white/70" />
        <div className="absolute inset-[18px] rotate-45 rounded-[8px] bg-white/90" />
      </div>
    );
  }
  if (style === 'pulse') {
    return (
      <div className="relative h-16 w-16">
        <div className="absolute inset-2 rounded-full border border-white/30" />
        <div className="absolute inset-5 rounded-full border border-white/60" />
        <div className="absolute inset-[26px] rounded-full bg-white/92" />
      </div>
    );
  }
  return (
    <div className="relative h-16 w-16">
      <div className="absolute inset-1 rounded-full border border-white/22" />
      <div className="absolute inset-4 rounded-full border border-white/70" />
      <div className="absolute left-1/2 top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/92" />
      <div className="absolute left-1/2 top-2 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-white/78" />
    </div>
  );
}

const ACCENTS: { id: AccentMode; label: string; swatch: string }[] = [
  { id: 'purple', label: 'Purple', swatch: 'linear-gradient(90deg,#8f58ff,#ba96ff)' },
  { id: 'cyan', label: 'Cyan', swatch: 'linear-gradient(90deg,#3bc8ff,#90e9ff)' },
  { id: 'emerald', label: 'Emerald', swatch: 'linear-gradient(90deg,#28cf7d,#89f4bd)' },
  { id: 'amber', label: 'Amber', swatch: 'linear-gradient(90deg,#ffad2f,#ffd57f)' },
  { id: 'rose', label: 'Rose', swatch: 'linear-gradient(90deg,#ff5c89,#ff9cb7)' },
  { id: 'rainbow', label: 'Rainbow', swatch: 'linear-gradient(90deg,#ff5f6d,#ffc371,#47e0ff,#60ff9f,#b57bff)' }
];

const EASING_PRESETS: { id: MotionEasingPreset; label: string; description: string }[] = [
  { id: 'out-quad', label: 'Out Quad', description: 'Default launcher feel.' },
  { id: 'out-cubic', label: 'Out Cubic', description: 'Smoother stop.' },
  { id: 'in-out-cubic', label: 'In Out Cubic', description: 'Balanced in/out.' },
  { id: 'out-back', label: 'Out Back', description: 'Small overshoot snap.' },
  { id: 'out-elastic', label: 'Out Elastic', description: 'Springy finish.' },
  { id: 'linear', label: 'Linear', description: 'Constant speed.' },
  { id: 'custom', label: 'Custom Flow', description: 'Adobe-style bezier.' }
];

const MOTION_TUNING_DEFAULTS = {
  animDurationMs: 420,
  fadeDurationMs: 300,
  staggerMs: 45,
  offsetX: 0,
  offsetY: 10,
  easingPreset: 'out-quad' as MotionEasingPreset,
  easingX1: 0.25,
  easingY1: 0.1,
  easingX2: 0.25,
  easingY2: 1
};

function clampMotionTuning(input: Partial<typeof MOTION_TUNING_DEFAULTS>) {
  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, Math.round(value)));
  const clampFloat = (value: number, min: number, max: number) => Math.max(min, Math.min(max, Number(value.toFixed(2))));
  const easingPreset = input.easingPreset;
  const normalizedPreset: MotionEasingPreset = easingPreset === 'out-quad' || easingPreset === 'out-cubic' || easingPreset === 'in-out-cubic' || easingPreset === 'out-back' || easingPreset === 'out-elastic' || easingPreset === 'linear' || easingPreset === 'custom'
    ? easingPreset
    : MOTION_TUNING_DEFAULTS.easingPreset;
  return {
    animDurationMs: clamp(input.animDurationMs ?? MOTION_TUNING_DEFAULTS.animDurationMs, 120, 1400),
    fadeDurationMs: clamp(input.fadeDurationMs ?? MOTION_TUNING_DEFAULTS.fadeDurationMs, 80, 1400),
    staggerMs: clamp(input.staggerMs ?? MOTION_TUNING_DEFAULTS.staggerMs, 0, 220),
    offsetX: clamp(input.offsetX ?? MOTION_TUNING_DEFAULTS.offsetX, -70, 70),
    offsetY: clamp(input.offsetY ?? MOTION_TUNING_DEFAULTS.offsetY, -70, 70),
    easingPreset: normalizedPreset,
    easingX1: clampFloat(input.easingX1 ?? MOTION_TUNING_DEFAULTS.easingX1, 0, 1),
    easingY1: clampFloat(input.easingY1 ?? MOTION_TUNING_DEFAULTS.easingY1, 0, 1),
    easingX2: clampFloat(input.easingX2 ?? MOTION_TUNING_DEFAULTS.easingX2, 0, 1),
    easingY2: clampFloat(input.easingY2 ?? MOTION_TUNING_DEFAULTS.easingY2, 0, 1)
  };
}

function serializeKeybindMap(map: Record<string, string>) {
  return JSON.stringify(Object.entries(map).sort(([left], [right]) => left.localeCompare(right)));
}

export function Settings() {
  const [tab, setTab] = useState<SettingsTab>('general');
  const [appearanceSection, setAppearanceSection] = useState<AppearanceSection>('animation');
  const [showWidgetDocker, setShowWidgetDocker] = useState<boolean>(() => localStorage.getItem(SHOW_WIDGET_DOCKER_KEY) === 'true');
  const [hideEmptyWidgetSlots, setHideEmptyWidgetSlots] = useState<boolean>(() => localStorage.getItem(HIDE_EMPTY_WIDGET_SLOTS_KEY) === 'true');
  const [showGamesSection, setShowGamesSection] = useState<boolean>(() => localStorage.getItem(SHOW_GAMES_SECTION_KEY) === 'true');
  const [routeTabAnimationsEnabled, setRouteTabAnimationsEnabled] = useState<boolean>(() => localStorage.getItem(ROUTE_TAB_ANIMATIONS_KEY) === 'true');
  const [sidebarDockHoverEnabled, setSidebarDockHoverEnabled] = useState<boolean>(() => localStorage.getItem(SIDEBAR_DOCK_HOVER_ENABLED_KEY) === 'true');
  const [sidebarDockGrowSize, setSidebarDockGrowSize] = useState<number>(() => {
    const stored = Number(localStorage.getItem(SIDEBAR_DOCK_GROW_SIZE_KEY));
    if (Number.isFinite(stored)) return clampSidebarDockGrowSize(stored);
    return 60;
  });
  const [sidebarDockGrowSpeed, setSidebarDockGrowSpeed] = useState<number>(() => {
    const stored = Number(localStorage.getItem(SIDEBAR_DOCK_GROW_SPEED_KEY));
    if (Number.isFinite(stored)) return clampSidebarDockGrowSpeed(stored);
    return 180;
  });
  const [sidebarTabGap, setSidebarTabGap] = useState<number>(() => {
    const stored = Number(localStorage.getItem(SIDEBAR_TAB_GAP_KEY));
    if (Number.isFinite(stored)) return clampSidebarTabGap(stored);
    return 8;
  });
  const [sidebarTabsVisibility, setSidebarTabsVisibility] = useState<SidebarTabsVisibility>(() => readSidebarTabsVisibility());
  const [uiAssetPixelLevel, setUiAssetPixelLevel] = useState<number>(() => {
    const stored = Number(localStorage.getItem(UI_ASSET_PIXEL_LEVEL_KEY));
    if (Number.isFinite(stored)) return clampUiAssetPixelLevel(stored);
    return 0;
  });
  const [iconPackMode, setIconPackMode] = useState<IconPackMode>(() => {
    const stored = localStorage.getItem(ICON_PACK_KEY);
    return stored === 'default' || stored === 'bold' || stored === 'rounded' || stored === 'pixel' ? stored : 'default';
  });
  const [roundnessLevel, setRoundnessLevel] = useState<number>(() => {
    const stored = Number(localStorage.getItem(ROUNDNESS_KEY));
    if (Number.isFinite(stored)) return clampRoundness(stored);
    return 50;
  });
  const [buttonRoundnessLevel, setButtonRoundnessLevel] = useState<number>(() => {
    const stored = Number(localStorage.getItem(BUTTON_ROUNDNESS_KEY));
    if (Number.isFinite(stored)) return clampRoundness(stored);
    return 100;
  });
  const [glassAmount, setGlassAmount] = useState<number>(() => {
    const stored = Number(localStorage.getItem(GLASS_AMOUNT_KEY));
    if (Number.isFinite(stored)) return clampGlassAmount(stored);
    return 70;
  });
  const [shortcutSearch, setShortcutSearch] = useState<string>(() => localStorage.getItem(SHORTCUT_SEARCH_KEY) || 'Ctrl+K');
  const [shortcutCreateInstance, setShortcutCreateInstance] = useState<string>(() => localStorage.getItem(SHORTCUT_CREATE_INSTANCE_KEY) || 'Ctrl+N');
  const [shortcutSettings, setShortcutSettings] = useState<string>(() => localStorage.getItem(SHORTCUT_SETTINGS_KEY) || 'Ctrl+,');
  const [shortcutConsole, setShortcutConsole] = useState<string>(() => localStorage.getItem(SHORTCUT_CONSOLE_KEY) || CONSOLE_HOTKEY_DEFAULT);
  const [shortcutReplayStartupScene, setShortcutReplayStartupScene] = useState<string>(() => localStorage.getItem(SHORTCUT_REPLAY_STARTUP_SCENE_KEY) || 'Ctrl+Shift+J');
  const [draftShortcutSearch, setDraftShortcutSearch] = useState<string>(() => localStorage.getItem(SHORTCUT_SEARCH_KEY) || 'Ctrl+K');
  const [draftShortcutCreateInstance, setDraftShortcutCreateInstance] = useState<string>(() => localStorage.getItem(SHORTCUT_CREATE_INSTANCE_KEY) || 'Ctrl+N');
  const [draftShortcutSettings, setDraftShortcutSettings] = useState<string>(() => localStorage.getItem(SHORTCUT_SETTINGS_KEY) || 'Ctrl+,');
  const [draftShortcutConsole, setDraftShortcutConsole] = useState<string>(() => localStorage.getItem(SHORTCUT_CONSOLE_KEY) || CONSOLE_HOTKEY_DEFAULT);
  const [draftShortcutReplayStartupScene, setDraftShortcutReplayStartupScene] = useState<string>(() => localStorage.getItem(SHORTCUT_REPLAY_STARTUP_SCENE_KEY) || 'Ctrl+Shift+J');
  const [consolePersistHistory, setConsolePersistHistory] = useState<boolean>(() => readBooleanSetting(CONSOLE_PERSIST_HISTORY_KEY, true));
  const [consoleShowStartupTip, setConsoleShowStartupTip] = useState<boolean>(() => readBooleanSetting(CONSOLE_SHOW_STARTUP_TIP_KEY, true));
  const [consoleShowDevCommands, setConsoleShowDevCommands] = useState<boolean>(() => readBooleanSetting(CONSOLE_SHOW_DEV_COMMANDS_KEY, false));
  const [extraKeybinds, setExtraKeybinds] = useState<Record<string, string>>(() => {
    try {
      const raw = localStorage.getItem(EXTRA_KEYBINDS_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) as Record<string, string> : {};
      return typeof parsed === 'object' && parsed ? parsed : {};
    } catch {
      return {};
    }
  });
  const [draftExtraKeybinds, setDraftExtraKeybinds] = useState<Record<string, string>>(() => {
    try {
      const raw = localStorage.getItem(EXTRA_KEYBINDS_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) as Record<string, string> : {};
      return typeof parsed === 'object' && parsed ? parsed : {};
    } catch {
      return {};
    }
  });
  const [capturingShortcut, setCapturingShortcut] = useState<string | null>(null);
  const [keybindSaveState, setKeybindSaveState] = useState<'idle' | 'saved'>('idle');
  const [savingOverlayOpen, setSavingOverlayOpen] = useState(false);
  const [startupSceneEnabled, setStartupSceneEnabled] = useState<boolean>(() => localStorage.getItem(STARTUP_SCENE_ENABLED_KEY) !== 'false');
  const [startupSceneTheme, setStartupSceneTheme] = useState<StartupSceneTheme>(() => {
    const stored = localStorage.getItem(STARTUP_SCENE_THEME_KEY);
    return stored === 'nova' || stored === 'horizon' || stored === 'matrix' ? stored : 'nova';
  });
  const [startupSceneSoundProfile, setStartupSceneSoundProfile] = useState<StartupSceneSoundProfile>(() => {
    const stored = localStorage.getItem(STARTUP_SCENE_SOUND_PROFILE_KEY);
    return stored === 'off' || stored === 'shimmer' || stored === 'impact' ? stored : 'shimmer';
  });
  const [instanceInstallLoadingStyle, setInstanceInstallLoadingStyle] = useState<InstanceInstallLoadingStyle>(() => {
    const stored = localStorage.getItem(INSTANCE_INSTALL_LOADING_STYLE_KEY);
    return stored === 'orbit' || stored === 'bars' || stored === 'prism' || stored === 'pulse' ? stored : 'orbit';
  });
  const [availableUpdate, setAvailableUpdate] = useState<ExternalUpdate | null>(null);
  const [updaterStatus, setUpdaterStatus] = useState<string>('No update check run yet.');
  const [updaterProgress, setUpdaterProgress] = useState<number | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [installingUpdate, setInstallingUpdate] = useState(false);
  const [updateAutoCheckEnabled, setUpdateAutoCheckEnabled] = useState<boolean>(() => readUpdatePreferences().autoCheck);
  const [updateNotificationsEnabled, setUpdateNotificationsEnabled] = useState<boolean>(() => readUpdatePreferences().notifications);
  const [themeMode, setThemeMode] = useState<LauncherTheme>(() => {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'light' || stored === 'light-gray') return 'true-dark';
    return stored === 'light' || stored === 'light-gray' || stored === 'dark' || stored === 'gray' || stored === 'true-dark' || stored === 'ocean' || stored === 'forest' || stored === 'sunset' || stored === 'paper' || stored === 'crt' || stored === 'synthwave' || stored === 'sandstone' || stored === 'minecraft' || stored === 'cartoon' || stored === 'strength-smp' || stored === 'blueprint' || stored === 'holo-grid' || stored === 'lavaforge' || stored === 'candy-pop' || stored === 'mono-ink'
      ? stored
      : 'dark';
  });
  const [accentMode, setAccentMode] = useState<AccentMode>(() => {
    const stored = localStorage.getItem(ACCENT_STORAGE_KEY);
    return stored === 'purple' || stored === 'cyan' || stored === 'emerald' || stored === 'amber' || stored === 'rose' || stored === 'rainbow'
      ? stored
      : 'purple';
  });
  const [backgroundMode, setBackgroundMode] = useState<BackgroundMode>(() => {
    const stored = localStorage.getItem(BACKGROUND_STORAGE_KEY);
    return stored === 'none' || stored === 'plus' || stored === 'particles' || stored === 'aurora' || stored === 'scanlines' || stored === 'nebula' || stored === 'custom'
      ? stored
      : 'particles';
  });
  const [customBackgroundSaved, setCustomBackgroundSaved] = useState<string | null>(null);
  const [customBackgroundSource, setCustomBackgroundSource] = useState<string | null>(null);
  const [customBackgroundRenderPreview, setCustomBackgroundRenderPreview] = useState<string | null>(null);
  const [customBackgroundMediaKind, setCustomBackgroundMediaKind] = useState<CustomBackgroundMediaKind>('image');
  const [customBackgroundTarget, setCustomBackgroundTarget] = useState<BackgroundTargetSize>({ width: 1920, height: 1080 });
  const [customBackgroundZoom, setCustomBackgroundZoom] = useState(1);
  const [customBackgroundPanX, setCustomBackgroundPanX] = useState(0);
  const [customBackgroundPanY, setCustomBackgroundPanY] = useState(0);
  const [customBackgroundSaving, setCustomBackgroundSaving] = useState(false);
  const [customBackgroundError, setCustomBackgroundError] = useState<string | null>(null);
  const [draggingCustomBackground, setDraggingCustomBackground] = useState(false);
  const customBackgroundPointerRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const customBackgroundAutosaveTimerRef = useRef<number | null>(null);
  const [appearancePresets, setAppearancePresets] = useState<AppearancePresetRecord[]>(() => readStoredAppearancePresets());
  const [appearancePresetName, setAppearancePresetName] = useState('');
  const [appearancePresetStatus, setAppearancePresetStatus] = useState<string | null>(null);
  const [appearancePresetError, setAppearancePresetError] = useState<string | null>(null);
  const [shopRarityTheme, setShopRarityTheme] = useState<ShopRarityThemeSettings>(() => readShopRarityThemeSettings());
  const appearanceImportRef = useRef<HTMLInputElement | null>(null);
  const [backgroundVisualOpacity, setBackgroundVisualOpacity] = useState<number>(() => {
    const stored = Number(localStorage.getItem(BACKGROUND_VISUAL_OPACITY_KEY));
    if (Number.isFinite(stored)) return clampBackgroundOpacity(stored);
    return 20;
  });
  const [taskbarSurfaceOpacity, setTaskbarSurfaceOpacity] = useState<number>(() => {
    const stored = Number(localStorage.getItem(TASKBAR_SURFACE_OPACITY_KEY));
    if (Number.isFinite(stored)) return clampPercent(stored);
    return 92;
  });
  const [dropdownOpacity, setDropdownOpacity] = useState<number>(() => {
    const stored = Number(localStorage.getItem(DROPDOWN_OPACITY_KEY));
    if (Number.isFinite(stored)) return clampDropdownOpacity(stored);
    return 92;
  });
  const [densityMode, setDensityMode] = useState<DensityMode>(() => {
    const stored = localStorage.getItem(DENSITY_STORAGE_KEY);
    return stored === 'compact' || stored === 'cozy' || stored === 'spacious' ? stored : 'cozy';
  });
  const [fontPackMode, setFontPackMode] = useState<FontPackMode>(() => {
    const stored = localStorage.getItem(FONT_STORAGE_KEY);
    return stored === 'manrope' || stored === 'space-grotesk' || stored === 'sora' ? stored : 'manrope';
  });
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>(() => {
    const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    return stored === 'rail' || stored === 'classic' || stored === 'expanded' ? stored : 'rail';
  });
  const [sidebarPosition, setSidebarPosition] = useState<SidebarPosition>(() => {
    const stored = localStorage.getItem(SIDEBAR_POSITION_STORAGE_KEY);
    return stored === 'left' || stored === 'right' || stored === 'top' || stored === 'bottom' ? stored : 'left';
  });
  const [cardStyleMode, setCardStyleMode] = useState<CardStyleMode>(() => {
    const stored = localStorage.getItem(CARD_STYLE_STORAGE_KEY);
    return stored === 'glass' || stored === 'solid' || stored === 'outline' ? stored : 'glass';
  });
  const [taskbarLogoBackgroundMode, setTaskbarLogoBackgroundMode] = useState<TaskbarLogoBackgroundMode>(() => {
    const stored = localStorage.getItem(TASKBAR_LOGO_BACKGROUND_KEY);
    return stored === 'default' || stored === 'discord' || stored === 'accent' || stored === 'glass' || stored === 'none' ? stored : 'default';
  });
  const [buttonTheme, setButtonTheme] = useState<ButtonThemeMode>(() => {
    const stored = localStorage.getItem(BUTTON_THEME_STORAGE_KEY);
    return stored === 'default' || stored === 'simple' || stored === 'cartoon' || stored === 'glass' || stored === 'neon' || stored === 'pixel' || stored === 'brutalist' || stored === 'pill' || stored === 'terminal' || stored === 'arcade'
      ? stored
      : 'brutalist';
  });
  const [motionMode, setMotionMode] = useState<MotionMode>(() => {
    const stored = localStorage.getItem(MOTION_STORAGE_KEY);
    return stored === 'off' || stored === 'subtle' || stored === 'standard' || stored === 'cinematic' ? stored : 'standard';
  });
  const [motionFps, setMotionFps] = useState<number>(() => {
    const stored = Number(localStorage.getItem(MOTION_FPS_STORAGE_KEY));
    if (Number.isFinite(stored)) return Math.max(14, Math.min(30, Math.round(stored)));
    return 14;
  });
  const [motionAnimDurationMs, setMotionAnimDurationMs] = useState<number>(() => {
    const stored = Number(localStorage.getItem(MOTION_ANIM_DURATION_KEY));
    if (Number.isFinite(stored)) return clampMotionTuning({ animDurationMs: stored }).animDurationMs;
    return MOTION_TUNING_DEFAULTS.animDurationMs;
  });
  const [motionFadeDurationMs, setMotionFadeDurationMs] = useState<number>(() => {
    const stored = Number(localStorage.getItem(MOTION_FADE_DURATION_KEY));
    if (Number.isFinite(stored)) return clampMotionTuning({ fadeDurationMs: stored }).fadeDurationMs;
    return MOTION_TUNING_DEFAULTS.fadeDurationMs;
  });
  const [motionStaggerMs, setMotionStaggerMs] = useState<number>(() => {
    const stored = Number(localStorage.getItem(MOTION_STAGGER_KEY));
    if (Number.isFinite(stored)) return clampMotionTuning({ staggerMs: stored }).staggerMs;
    return MOTION_TUNING_DEFAULTS.staggerMs;
  });
  const [motionOffsetX, setMotionOffsetX] = useState<number>(() => {
    const stored = Number(localStorage.getItem(MOTION_OFFSET_X_KEY));
    if (Number.isFinite(stored)) return clampMotionTuning({ offsetX: stored }).offsetX;
    return MOTION_TUNING_DEFAULTS.offsetX;
  });
  const [motionOffsetY, setMotionOffsetY] = useState<number>(() => {
    const stored = Number(localStorage.getItem(MOTION_OFFSET_Y_KEY));
    if (Number.isFinite(stored)) return clampMotionTuning({ offsetY: stored }).offsetY;
    return MOTION_TUNING_DEFAULTS.offsetY;
  });
  const [motionEasingPreset, setMotionEasingPreset] = useState<MotionEasingPreset>(() => {
    const stored = localStorage.getItem(MOTION_EASING_PRESET_KEY);
    return stored === 'out-quad' || stored === 'out-cubic' || stored === 'in-out-cubic' || stored === 'out-back' || stored === 'out-elastic' || stored === 'linear' || stored === 'custom'
      ? stored
      : MOTION_TUNING_DEFAULTS.easingPreset;
  });
  const [motionEasingX1, setMotionEasingX1] = useState<number>(() => {
    const stored = Number(localStorage.getItem(MOTION_EASING_X1_KEY));
    if (Number.isFinite(stored)) return clampMotionTuning({ easingX1: stored }).easingX1;
    return MOTION_TUNING_DEFAULTS.easingX1;
  });
  const [motionEasingY1, setMotionEasingY1] = useState<number>(() => {
    const stored = Number(localStorage.getItem(MOTION_EASING_Y1_KEY));
    if (Number.isFinite(stored)) return clampMotionTuning({ easingY1: stored }).easingY1;
    return MOTION_TUNING_DEFAULTS.easingY1;
  });
  const [motionEasingX2, setMotionEasingX2] = useState<number>(() => {
    const stored = Number(localStorage.getItem(MOTION_EASING_X2_KEY));
    if (Number.isFinite(stored)) return clampMotionTuning({ easingX2: stored }).easingX2;
    return MOTION_TUNING_DEFAULTS.easingX2;
  });
  const [motionEasingY2, setMotionEasingY2] = useState<number>(() => {
    const stored = Number(localStorage.getItem(MOTION_EASING_Y2_KEY));
    if (Number.isFinite(stored)) return clampMotionTuning({ easingY2: stored }).easingY2;
    return MOTION_TUNING_DEFAULTS.easingY2;
  });
  const keybindsDirty =
    draftShortcutSearch !== shortcutSearch
    || draftShortcutCreateInstance !== shortcutCreateInstance
    || draftShortcutSettings !== shortcutSettings
    || draftShortcutConsole !== shortcutConsole
    || draftShortcutReplayStartupScene !== shortcutReplayStartupScene
    || serializeKeybindMap(draftExtraKeybinds) !== serializeKeybindMap(extraKeybinds);
  const applyTheme = (next: LauncherTheme) => {
    setThemeMode(next);
    localStorage.setItem(THEME_STORAGE_KEY, next);
    window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: { theme: next } }));
  };

  const applyUiAssetPixelLevel = (next: number) => {
    const clamped = clampUiAssetPixelLevel(next);
    setUiAssetPixelLevel(clamped);
    localStorage.setItem(UI_ASSET_PIXEL_LEVEL_KEY, String(clamped));
    window.dispatchEvent(new CustomEvent(UI_ASSET_PIXEL_LEVEL_CHANGE_EVENT, { detail: { level: clamped } }));
  };

  const applyIconPack = (next: IconPackMode) => {
    setIconPackMode(next);
    localStorage.setItem(ICON_PACK_KEY, next);
    window.dispatchEvent(new CustomEvent(ICON_PACK_CHANGE_EVENT, { detail: { iconPack: next } }));
  };

  const applyTaskbarLogoBackground = (next: TaskbarLogoBackgroundMode) => {
    setTaskbarLogoBackgroundMode(next);
    localStorage.setItem(TASKBAR_LOGO_BACKGROUND_KEY, next);
    window.dispatchEvent(new CustomEvent(TASKBAR_LOGO_BACKGROUND_CHANGE_EVENT, { detail: { background: next } }));
  };

  const applyRoundness = (next: number) => {
    const clamped = clampRoundness(next);
    setRoundnessLevel(clamped);
    localStorage.setItem(ROUNDNESS_KEY, String(clamped));
    window.dispatchEvent(new CustomEvent(ROUNDNESS_CHANGE_EVENT, { detail: { roundness: clamped } }));
  };

  const applyButtonRoundness = (next: number) => {
    const clamped = clampRoundness(next);
    setButtonRoundnessLevel(clamped);
    localStorage.setItem(BUTTON_ROUNDNESS_KEY, String(clamped));
    window.dispatchEvent(new CustomEvent(BUTTON_ROUNDNESS_CHANGE_EVENT, { detail: { roundness: clamped } }));
  };

  const applyGlassAmount = (next: number) => {
    const clamped = clampGlassAmount(next);
    setGlassAmount(clamped);
    localStorage.setItem(GLASS_AMOUNT_KEY, String(clamped));
    window.dispatchEvent(new CustomEvent(GLASS_AMOUNT_CHANGE_EVENT, { detail: { amount: clamped } }));
  };

  const applyShortcuts = (partial: { search?: string; create?: string; settings?: string; console?: string; replayStartupScene?: string }) => {
    setDraftShortcutSearch(partial.search ?? draftShortcutSearch);
    setDraftShortcutCreateInstance(partial.create ?? draftShortcutCreateInstance);
    setDraftShortcutSettings(partial.settings ?? draftShortcutSettings);
    setDraftShortcutConsole(partial.console ?? draftShortcutConsole);
    setDraftShortcutReplayStartupScene(partial.replayStartupScene ?? draftShortcutReplayStartupScene);
    setKeybindSaveState('idle');
  };

  const applyExtraKeybind = (id: string, value: string) => {
    setDraftExtraKeybinds((current) => ({ ...current, [id]: value }));
    setKeybindSaveState('idle');
  };

  const clearShortcut = (id: string) => {
    if (id === 'search') applyShortcuts({ search: '' });
    else if (id === 'create') applyShortcuts({ create: '' });
    else if (id === 'settings') applyShortcuts({ settings: '' });
    else if (id === 'console') applyShortcuts({ console: '' });
    else if (id === 'replay-startup-scene') applyShortcuts({ replayStartupScene: '' });
    else applyExtraKeybind(id, '');
  };

  const saveKeybinds = () => {
    setSavingOverlayOpen(true);
    setShortcutSearch(draftShortcutSearch);
    setShortcutCreateInstance(draftShortcutCreateInstance);
    setShortcutSettings(draftShortcutSettings);
    setShortcutConsole(draftShortcutConsole);
    setShortcutReplayStartupScene(draftShortcutReplayStartupScene);
    setExtraKeybinds(draftExtraKeybinds);
    localStorage.setItem(SHORTCUT_SEARCH_KEY, draftShortcutSearch);
    localStorage.setItem(SHORTCUT_CREATE_INSTANCE_KEY, draftShortcutCreateInstance);
    localStorage.setItem(SHORTCUT_SETTINGS_KEY, draftShortcutSettings);
    localStorage.setItem(SHORTCUT_CONSOLE_KEY, draftShortcutConsole);
    localStorage.setItem(SHORTCUT_REPLAY_STARTUP_SCENE_KEY, draftShortcutReplayStartupScene);
    localStorage.setItem(EXTRA_KEYBINDS_STORAGE_KEY, JSON.stringify(draftExtraKeybinds));
    window.dispatchEvent(new CustomEvent(SHORTCUTS_CHANGE_EVENT, {
      detail: {
        search: draftShortcutSearch,
        create: draftShortcutCreateInstance,
        settings: draftShortcutSettings,
        console: draftShortcutConsole,
        replayStartupScene: draftShortcutReplayStartupScene,
        extras: draftExtraKeybinds
      }
    }));
    setKeybindSaveState('saved');
    window.setTimeout(() => setSavingOverlayOpen(false), 420);
  };

  const applyConsoleSettings = (partial: {
    persistHistory?: boolean;
    showStartupTip?: boolean;
    showDevCommands?: boolean;
  }) => {
    const nextPersistHistory = partial.persistHistory ?? consolePersistHistory;
    const nextShowStartupTip = partial.showStartupTip ?? consoleShowStartupTip;
    const nextShowDevCommands = partial.showDevCommands ?? consoleShowDevCommands;
    setConsolePersistHistory(nextPersistHistory);
    setConsoleShowStartupTip(nextShowStartupTip);
    setConsoleShowDevCommands(nextShowDevCommands);
    localStorage.setItem(CONSOLE_PERSIST_HISTORY_KEY, nextPersistHistory ? 'true' : 'false');
    localStorage.setItem(CONSOLE_SHOW_STARTUP_TIP_KEY, nextShowStartupTip ? 'true' : 'false');
    localStorage.setItem(CONSOLE_SHOW_DEV_COMMANDS_KEY, nextShowDevCommands ? 'true' : 'false');
    window.dispatchEvent(new CustomEvent(CONSOLE_SETTINGS_CHANGE_EVENT, {
      detail: {
        persistHistory: nextPersistHistory,
        showStartupTip: nextShowStartupTip,
        showDevCommands: nextShowDevCommands
      }
    }));
  };

  const applyStartupScene = (partial: { enabled?: boolean; theme?: StartupSceneTheme; soundProfile?: StartupSceneSoundProfile }) => {
    const nextEnabled = partial.enabled ?? startupSceneEnabled;
    const nextTheme = partial.theme ?? startupSceneTheme;
    const nextSound = partial.soundProfile ?? startupSceneSoundProfile;
    setStartupSceneEnabled(nextEnabled);
    setStartupSceneTheme(nextTheme);
    setStartupSceneSoundProfile(nextSound);
    localStorage.setItem(STARTUP_SCENE_ENABLED_KEY, nextEnabled ? 'true' : 'false');
    localStorage.setItem(STARTUP_SCENE_THEME_KEY, nextTheme);
    localStorage.setItem(STARTUP_SCENE_SOUND_PROFILE_KEY, nextSound);
    window.dispatchEvent(new CustomEvent(STARTUP_SCENE_CHANGE_EVENT, { detail: { enabled: nextEnabled, theme: nextTheme, soundProfile: nextSound } }));
  };

  const applyInstanceInstallLoadingStyle = (value: InstanceInstallLoadingStyle) => {
    setInstanceInstallLoadingStyle(value);
    localStorage.setItem(INSTANCE_INSTALL_LOADING_STYLE_KEY, value);
  };

  const applyUpdatePreferences = (partial: { autoCheck?: boolean; notifications?: boolean }) => {
    const nextAutoCheck = partial.autoCheck ?? updateAutoCheckEnabled;
    const nextNotifications = partial.notifications ?? updateNotificationsEnabled;
    setUpdateAutoCheckEnabled(nextAutoCheck);
    setUpdateNotificationsEnabled(nextNotifications);
    writeUpdatePreferences({ autoCheck: nextAutoCheck, notifications: nextNotifications });
  };

  const loadSavedCustomBackground = async () => {
    try {
      const videoAsset = await TauriApi.launcherBackgroundVideoLoad();
      if (videoAsset) {
        const videoUrl = videoAsset.dataUrl ?? videoAsset.path;
        setCustomBackgroundMediaKind('video');
        setCustomBackgroundSaved(videoUrl);
        setCustomBackgroundSource(videoUrl);
        setCustomBackgroundRenderPreview(videoUrl);
        return;
      }
      const dataUrl = await TauriApi.launcherBackgroundLoad();
      setCustomBackgroundMediaKind(dataUrl ? 'image' : null);
      setCustomBackgroundSaved(dataUrl);
      if (!customBackgroundSource && dataUrl) {
        setCustomBackgroundSource(dataUrl);
      }
    } catch (error) {
      setCustomBackgroundError(error instanceof Error ? error.message : String(error));
    }
  };

  const persistCustomBackground = async (
    source: string,
    target: BackgroundTargetSize,
    zoom: number,
    panX: number,
    panY: number
  ) => {
    if (customBackgroundMediaKind !== 'image') return;
    setCustomBackgroundSaving(true);
    setCustomBackgroundError(null);
    const rendered = await renderCustomBackgroundImage(source, target, zoom, panX, panY);
    await TauriApi.launcherBackgroundSave(dataUrlToBytes(rendered));
    setCustomBackgroundSaved(rendered);
    applyBackground('custom');
    window.dispatchEvent(new CustomEvent(BACKGROUND_CHANGE_EVENT, { detail: { background: 'custom', previewDataUrl: rendered, previewVideoUrl: null, previewMediaType: 'image' } }));
  };

  const onCustomBackgroundFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setCustomBackgroundError(null);
      if (file.type.startsWith('video/')) {
        const objectUrl = URL.createObjectURL(file);
        const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
        await TauriApi.launcherBackgroundVideoSave(file.name, file.type || 'video/mp4', bytes);
        setCustomBackgroundMediaKind('video');
        setCustomBackgroundSaved(objectUrl);
        setCustomBackgroundSource(objectUrl);
        setCustomBackgroundRenderPreview(objectUrl);
        applyBackground('custom');
        window.dispatchEvent(new CustomEvent(BACKGROUND_CHANGE_EVENT, { detail: { background: 'custom', previewDataUrl: null, previewVideoUrl: objectUrl, previewMediaType: 'video' } }));
        return;
      }
      const dataUrl = await fileToDataUrl(file);
      const image = await loadImageElement(dataUrl);
      const nextTarget = resolveBackgroundTarget(image.naturalWidth, image.naturalHeight);
      setCustomBackgroundMediaKind('image');
      setCustomBackgroundSource(dataUrl);
      setCustomBackgroundTarget(nextTarget);
      setCustomBackgroundZoom(1);
      setCustomBackgroundPanX(0);
      setCustomBackgroundPanY(0);
    } catch (error) {
      setCustomBackgroundError(error instanceof Error ? error.message : String(error));
    } finally {
      event.target.value = '';
    }
  };

  const clearCustomBackground = async () => {
    try {
      await TauriApi.launcherBackgroundClear();
      setCustomBackgroundMediaKind(null);
      setCustomBackgroundSaved(null);
      setCustomBackgroundSource(null);
      setCustomBackgroundRenderPreview(null);
      setCustomBackgroundError(null);
      if (backgroundMode === 'custom') {
        applyBackground('particles');
      }
      window.dispatchEvent(new CustomEvent(BACKGROUND_CHANGE_EVENT, { detail: { background: 'particles', previewDataUrl: null, previewVideoUrl: null, previewMediaType: null } }));
    } catch (error) {
      setCustomBackgroundError(error instanceof Error ? error.message : String(error));
    }
  };

  const buildCurrentAppearancePayload = (): AppearancePresetPayload => ({
    themeMode,
    accentMode,
    backgroundMode,
    backgroundVisualOpacity,
    taskbarSurfaceOpacity,
    dropdownOpacity,
    densityMode,
    fontPackMode,
    sidebarMode,
    sidebarPosition,
    cardStyleMode,
    taskbarLogoBackgroundMode,
    buttonTheme,
    motionMode,
    motionFps,
    motionAnimDurationMs,
    motionFadeDurationMs,
    motionStaggerMs,
    motionOffsetX,
    motionOffsetY,
    motionEasingPreset,
    motionEasingX1,
    motionEasingY1,
    motionEasingX2,
    motionEasingY2,
    uiAssetPixelLevel,
    iconPackMode,
    roundnessLevel,
    buttonRoundnessLevel,
    glassAmount,
    customBackgroundDataUrl: customBackgroundMediaKind === 'image' ? customBackgroundSaved : null
  });

  const applyAppearancePresetPayload = async (payload: AppearancePresetPayload, presetLabel?: string) => {
    setAppearancePresetError(null);
    applyTheme(payload.themeMode);
    applyAccent(payload.accentMode);
    applyBackgroundVisualOpacity(payload.backgroundVisualOpacity);
    applyTaskbarSurfaceOpacity(payload.taskbarSurfaceOpacity);
    applyDropdownOpacity(payload.dropdownOpacity);
    applyDensity(payload.densityMode);
    applyFontPack(payload.fontPackMode);
    applySidebar(payload.sidebarMode);
    applySidebarPosition(payload.sidebarPosition);
    applyCardStyle(payload.cardStyleMode);
    applyTaskbarLogoBackground(payload.taskbarLogoBackgroundMode);
    applyButtonTheme(payload.buttonTheme);
    applyMotion(payload.motionMode);
    applyMotionFps(payload.motionFps);
    applyMotionTuning({
      animDurationMs: payload.motionAnimDurationMs,
      fadeDurationMs: payload.motionFadeDurationMs,
      staggerMs: payload.motionStaggerMs,
      offsetX: payload.motionOffsetX,
      offsetY: payload.motionOffsetY,
      easingPreset: payload.motionEasingPreset,
      easingX1: payload.motionEasingX1,
      easingY1: payload.motionEasingY1,
      easingX2: payload.motionEasingX2,
      easingY2: payload.motionEasingY2
    });
    applyUiAssetPixelLevel(payload.uiAssetPixelLevel);
    applyIconPack(payload.iconPackMode);
    applyRoundness(payload.roundnessLevel);
    applyButtonRoundness(payload.buttonRoundnessLevel);
    applyGlassAmount(payload.glassAmount);

    if (payload.backgroundMode === 'custom') {
      const hasCustomData = Boolean(payload.customBackgroundDataUrl && payload.customBackgroundDataUrl.startsWith('data:image/'));
      if (hasCustomData) {
        const customData = payload.customBackgroundDataUrl as string;
        await TauriApi.launcherBackgroundSave(dataUrlToBytes(customData));
        setCustomBackgroundSaved(customData);
        setCustomBackgroundSource(customData);
        setCustomBackgroundRenderPreview(customData);
        try {
          const image = await loadImageElement(customData);
          setCustomBackgroundTarget(resolveBackgroundTarget(image.naturalWidth, image.naturalHeight));
        } catch {
          setCustomBackgroundTarget({ width: 1920, height: 1080 });
        }
        applyBackground('custom');
      } else if (customBackgroundSaved) {
        applyBackground('custom');
      } else {
        applyBackground('particles');
        setAppearancePresetError('Preset requested a custom background, but no custom image data was included. Switched to Particles.');
      }
    } else {
      applyBackground(payload.backgroundMode);
    }

    if (presetLabel) {
      setAppearancePresetStatus(`Applied preset "${presetLabel}".`);
    } else {
      setAppearancePresetStatus('Applied appearance preset.');
    }
  };

  const saveAppearancePreset = () => {
    const cleanedName = sanitizePresetName(appearancePresetName);
    const presetName = cleanedName || `Preset ${appearancePresets.length + 1}`;
    const now = Date.now();
    const nextPreset: AppearancePresetRecord = {
      id: crypto.randomUUID(),
      name: presetName,
      createdAt: now,
      updatedAt: now,
      payload: buildCurrentAppearancePayload()
    };
    setAppearancePresets((current) => [nextPreset, ...current].slice(0, 100));
    setAppearancePresetName('');
    setAppearancePresetError(null);
    setAppearancePresetStatus(`Saved preset "${presetName}".`);
  };

  const deleteAppearancePreset = (id: string) => {
    setAppearancePresets((current) => current.filter((preset) => preset.id !== id));
    setAppearancePresetStatus('Preset removed.');
    setAppearancePresetError(null);
  };

  const exportAppearancePreset = async (preset: AppearancePresetRecord) => {
    const payload: AppearancePresetExportFileV1 = {
      type: 'bloom-appearance-preset',
      version: 1,
      preset
    };
    const fileName = `bloom-appearance-${slugifyPresetName(preset.name)}.json`;
    const didSave = await saveJsonWithFilePicker(fileName, payload);
    if (!didSave) {
      setAppearancePresetStatus('Export cancelled.');
      return;
    }
    setAppearancePresetError(null);
    setAppearancePresetStatus(`Exported preset "${preset.name}".`);
  };

  const exportCurrentAppearance = async () => {
    const cleanedName = sanitizePresetName(appearancePresetName) || 'Current Appearance';
    const now = Date.now();
    const preset: AppearancePresetRecord = {
      id: crypto.randomUUID(),
      name: cleanedName,
      createdAt: now,
      updatedAt: now,
      payload: buildCurrentAppearancePayload()
    };
    await exportAppearancePreset(preset);
  };

  const onImportAppearancePresetFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setAppearancePresetError(null);
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      let record: AppearancePresetRecord | null = null;

      if (isObjectRecord(parsed) && parsed.type === 'bloom-appearance-preset' && Number(parsed.version) === 1) {
        record = parseAppearancePresetRecord(parsed.preset);
      } else {
        record = parseAppearancePresetRecord(parsed);
      }

      if (!record) {
        throw new Error('Invalid preset file format.');
      }

      const importedPreset: AppearancePresetRecord = {
        ...record,
        id: crypto.randomUUID(),
        name: sanitizePresetName(record.name) || 'Imported Preset',
        updatedAt: Date.now()
      };

      setAppearancePresets((current) => [importedPreset, ...current].slice(0, 100));
      await applyAppearancePresetPayload(importedPreset.payload, importedPreset.name);
      setAppearancePresetStatus(`Imported and applied "${importedPreset.name}".`);
    } catch (error) {
      setAppearancePresetError(error instanceof Error ? error.message : String(error));
    } finally {
      event.target.value = '';
    }
  };

  const onCustomBackgroundPointerDown: PointerEventHandler<HTMLDivElement> = (event) => {
    if (!customBackgroundSource || customBackgroundMediaKind !== 'image') return;
    customBackgroundPointerRef.current = {
      x: event.clientX,
      y: event.clientY,
      panX: customBackgroundPanX,
      panY: customBackgroundPanY
    };
    setDraggingCustomBackground(true);
  };

  const onCustomBackgroundPointerMove: PointerEventHandler<HTMLDivElement> = (event) => {
    if (!customBackgroundPointerRef.current || customBackgroundMediaKind !== 'image') return;
    const deltaX = event.clientX - customBackgroundPointerRef.current.x;
    const deltaY = event.clientY - customBackgroundPointerRef.current.y;
    setCustomBackgroundPanX(clamp01(customBackgroundPointerRef.current.panX + deltaX / 220));
    setCustomBackgroundPanY(clamp01(customBackgroundPointerRef.current.panY + deltaY / 220));
  };

  const onCustomBackgroundPointerUp = () => {
    customBackgroundPointerRef.current = null;
    setDraggingCustomBackground(false);
  };

  const onCustomBackgroundWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (!customBackgroundSource || customBackgroundMediaKind !== 'image') return;
    event.preventDefault();
    const factor = event.deltaY < 0 ? 1.08 : 0.92;
    setCustomBackgroundZoom((current) => clamp(current * factor, 1, 2.8));
  };

  const runUpdateCheck = async () => {
    setCheckingUpdate(true);
    setUpdaterProgress(null);
    setUpdaterStatus('Checking for updates...');
    const { update, error } = await checkForLauncherUpdate();
    if (error) {
      setAvailableUpdate(null);
      setUpdaterStatus(`Update check failed: ${error}`);
      setCheckingUpdate(false);
      return;
    }
    if (!update) {
      setAvailableUpdate(null);
      setUpdaterStatus('You are up to date.');
      setCheckingUpdate(false);
      return;
    }
    setAvailableUpdate(update);
    setUpdaterStatus(`Update available: v${update.version}`);
    setCheckingUpdate(false);
  };

  const runUpdateInstall = async () => {
    if (!availableUpdate) return;
    setInstallingUpdate(true);
    setUpdaterProgress(null);
    setUpdaterStatus(`Downloading v${availableUpdate.version} installer...`);
    try {
      await downloadAndInstallLauncherUpdate(availableUpdate);
      setUpdaterStatus('Installer launched. Closing app to apply update...');
    } catch (error) {
      setUpdaterStatus(`Update install failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setInstallingUpdate(false);
    }
  };

  useEffect(() => {
    if (!capturingShortcut) return;
    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Escape') {
        setCapturingShortcut(null);
        return;
      }
      const shortcut = eventToDisplayShortcut(event);
      if (!shortcut) return;
      if (capturingShortcut === 'search') applyShortcuts({ search: shortcut });
      else if (capturingShortcut === 'create') applyShortcuts({ create: shortcut });
      else if (capturingShortcut === 'settings') applyShortcuts({ settings: shortcut });
      else if (capturingShortcut === 'console') applyShortcuts({ console: shortcut });
      else if (capturingShortcut === 'replay-startup-scene') applyShortcuts({ replayStartupScene: shortcut });
      else applyExtraKeybind(capturingShortcut, shortcut);
      setCapturingShortcut(null);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [capturingShortcut, shortcutSearch, shortcutCreateInstance, shortcutSettings, shortcutConsole, shortcutReplayStartupScene, extraKeybinds]);

  useEffect(() => {
    const handleSettingsTabOpen = (event: Event) => {
      const detail = (event as CustomEvent<{ tab?: SettingsTab }>).detail;
      if (detail?.tab) setTab(detail.tab);
    };
    window.addEventListener('bloom-settings-open-tab', handleSettingsTabOpen as EventListener);
    return () => window.removeEventListener('bloom-settings-open-tab', handleSettingsTabOpen as EventListener);
  }, []);

  useEffect(() => {
    const syncConsoleSettings = () => {
      setConsolePersistHistory(readBooleanSetting(CONSOLE_PERSIST_HISTORY_KEY, true));
      setConsoleShowStartupTip(readBooleanSetting(CONSOLE_SHOW_STARTUP_TIP_KEY, true));
      setConsoleShowDevCommands(readBooleanSetting(CONSOLE_SHOW_DEV_COMMANDS_KEY, false));
    };
    window.addEventListener(CONSOLE_SETTINGS_CHANGE_EVENT, syncConsoleSettings as EventListener);
    return () => window.removeEventListener(CONSOLE_SETTINGS_CHANGE_EVENT, syncConsoleSettings as EventListener);
  }, []);

  useEffect(() => {
    localStorage.setItem(APPEARANCE_PRESETS_KEY, JSON.stringify(appearancePresets));
  }, [appearancePresets]);

  useEffect(() => {
    void loadSavedCustomBackground();
  }, []);

  useEffect(() => {
    if (!customBackgroundSource) return;
    if (customBackgroundAutosaveTimerRef.current !== null) {
      window.clearTimeout(customBackgroundAutosaveTimerRef.current);
    }
    customBackgroundAutosaveTimerRef.current = window.setTimeout(() => {
      void persistCustomBackground(
        customBackgroundSource,
        customBackgroundTarget,
        customBackgroundZoom,
        customBackgroundPanX,
        customBackgroundPanY
      )
        .catch((error) => {
          setCustomBackgroundError(error instanceof Error ? error.message : String(error));
        })
        .finally(() => {
          setCustomBackgroundSaving(false);
        });
    }, 280);
    return () => {
      if (customBackgroundAutosaveTimerRef.current !== null) {
        window.clearTimeout(customBackgroundAutosaveTimerRef.current);
        customBackgroundAutosaveTimerRef.current = null;
      }
    };
  }, [customBackgroundMediaKind, customBackgroundSource, customBackgroundTarget, customBackgroundZoom, customBackgroundPanX, customBackgroundPanY]);

  useEffect(() => {
    if (!customBackgroundSource) {
      setCustomBackgroundRenderPreview(customBackgroundSaved);
      return;
    }
    if (customBackgroundMediaKind === 'video') {
      setCustomBackgroundRenderPreview(customBackgroundSource);
      return;
    }
    let active = true;
    void renderCustomBackgroundImage(
      customBackgroundSource,
      customBackgroundTarget,
      customBackgroundZoom,
      customBackgroundPanX,
      customBackgroundPanY
    ).then((dataUrl) => {
      if (active) setCustomBackgroundRenderPreview(dataUrl);
    }).catch(() => {
      if (active) setCustomBackgroundRenderPreview(null);
    });
    return () => {
      active = false;
    };
  }, [customBackgroundMediaKind, customBackgroundSource, customBackgroundSaved, customBackgroundTarget, customBackgroundZoom, customBackgroundPanX, customBackgroundPanY]);

  const applyAccent = (next: AccentMode) => {
    setAccentMode(next);
    localStorage.setItem(ACCENT_STORAGE_KEY, next);
    window.dispatchEvent(new CustomEvent(ACCENT_CHANGE_EVENT, { detail: { accent: next } }));
  };

  const applyBackground = (next: BackgroundMode) => {
    setBackgroundMode(next);
    localStorage.setItem(BACKGROUND_STORAGE_KEY, next);
    window.dispatchEvent(new CustomEvent(BACKGROUND_CHANGE_EVENT, { detail: { background: next } }));
  };

  const applyBackgroundVisualOpacity = (next: number) => {
    const clamped = clampBackgroundOpacity(next);
    setBackgroundVisualOpacity(clamped);
    localStorage.setItem(BACKGROUND_VISUAL_OPACITY_KEY, String(clamped));
    window.dispatchEvent(new CustomEvent(BACKGROUND_VISUAL_OPACITY_CHANGE_EVENT, { detail: { value: clamped } }));
  };

  const applyTaskbarSurfaceOpacity = (next: number) => {
    const clamped = clampPercent(next);
    setTaskbarSurfaceOpacity(clamped);
    localStorage.setItem(TASKBAR_SURFACE_OPACITY_KEY, String(clamped));
    window.dispatchEvent(new CustomEvent(TASKBAR_SURFACE_OPACITY_CHANGE_EVENT, { detail: { value: clamped } }));
  };

  const applyDropdownOpacity = (next: number) => {
    const clamped = clampDropdownOpacity(next);
    setDropdownOpacity(clamped);
    localStorage.setItem(DROPDOWN_OPACITY_KEY, String(clamped));
    window.dispatchEvent(new CustomEvent(DROPDOWN_OPACITY_CHANGE_EVENT, { detail: { value: clamped } }));
  };

  const applyDensity = (next: DensityMode) => {
    setDensityMode(next);
    localStorage.setItem(DENSITY_STORAGE_KEY, next);
    window.dispatchEvent(new CustomEvent(DENSITY_CHANGE_EVENT, { detail: { density: next } }));
  };

  const applyFontPack = (next: FontPackMode) => {
    setFontPackMode(next);
    localStorage.setItem(FONT_STORAGE_KEY, next);
    window.dispatchEvent(new CustomEvent(FONT_CHANGE_EVENT, { detail: { font: next } }));
  };

  const applySidebar = (next: SidebarMode) => {
    setSidebarMode(next);
    localStorage.setItem(SIDEBAR_STORAGE_KEY, next);
    window.dispatchEvent(new CustomEvent(SIDEBAR_CHANGE_EVENT, { detail: { sidebar: next } }));
  };

  const applySidebarPosition = (next: SidebarPosition) => {
    setSidebarPosition(next);
    localStorage.setItem(SIDEBAR_POSITION_STORAGE_KEY, next);
    window.dispatchEvent(new CustomEvent(SIDEBAR_POSITION_CHANGE_EVENT, { detail: { position: next } }));
  };

  const applyCardStyle = (next: CardStyleMode) => {
    setCardStyleMode(next);
    localStorage.setItem(CARD_STYLE_STORAGE_KEY, next);
    window.dispatchEvent(new CustomEvent(CARD_STYLE_CHANGE_EVENT, { detail: { cardStyle: next } }));
  };

  const applyButtonTheme = (next: ButtonThemeMode) => {
    setButtonTheme(next);
    localStorage.setItem(BUTTON_THEME_STORAGE_KEY, next);
    window.dispatchEvent(new CustomEvent(BUTTON_THEME_CHANGE_EVENT, { detail: { buttonTheme: next } }));
  };

  const applyShopRarityPreset = (presetId: ShopRarityPresetId) => {
    const next = { ...shopRarityTheme, presetId };
    setShopRarityTheme(next);
    writeShopRarityThemeSettings(next);
  };

  const applyShopRarityCustomColor = (rarity: ShopRarityKey, field: keyof (typeof shopRarityTheme.custom)[ShopRarityKey], value: string) => {
    const next = {
      ...shopRarityTheme,
      presetId: 'custom' as const,
      custom: {
        ...shopRarityTheme.custom,
        [rarity]: {
          ...shopRarityTheme.custom[rarity],
          [field]: value
        }
      }
    };
    setShopRarityTheme(next);
    writeShopRarityThemeSettings(next);
  };

  const resetShopRarityCustomColors = () => {
    const next = {
      presetId: 'custom' as const,
      custom: getDefaultShopRarityCustomColors()
    };
    setShopRarityTheme(next);
    writeShopRarityThemeSettings(next);
  };

  const applyMotion = (next: MotionMode) => {
    setMotionMode(next);
    localStorage.setItem(MOTION_STORAGE_KEY, next);
    window.dispatchEvent(new CustomEvent(MOTION_CHANGE_EVENT, { detail: { motion: next } }));
  };

  const applyMotionFps = (next: number) => {
    const clamped = Math.max(14, Math.min(30, Math.round(next)));
    setMotionFps(clamped);
    localStorage.setItem(MOTION_FPS_STORAGE_KEY, String(clamped));
    window.dispatchEvent(new CustomEvent(MOTION_FPS_CHANGE_EVENT, { detail: { fps: clamped } }));
  };

  const applyMotionTuning = (partial: {
    animDurationMs?: number;
    fadeDurationMs?: number;
    staggerMs?: number;
    offsetX?: number;
    offsetY?: number;
    easingPreset?: MotionEasingPreset;
    easingX1?: number;
    easingY1?: number;
    easingX2?: number;
    easingY2?: number;
  }) => {
    const next = clampMotionTuning({
      animDurationMs: partial.animDurationMs ?? motionAnimDurationMs,
      fadeDurationMs: partial.fadeDurationMs ?? motionFadeDurationMs,
      staggerMs: partial.staggerMs ?? motionStaggerMs,
      offsetX: partial.offsetX ?? motionOffsetX,
      offsetY: partial.offsetY ?? motionOffsetY,
      easingPreset: partial.easingPreset ?? motionEasingPreset,
      easingX1: partial.easingX1 ?? motionEasingX1,
      easingY1: partial.easingY1 ?? motionEasingY1,
      easingX2: partial.easingX2 ?? motionEasingX2,
      easingY2: partial.easingY2 ?? motionEasingY2
    });
    setMotionAnimDurationMs(next.animDurationMs);
    setMotionFadeDurationMs(next.fadeDurationMs);
    setMotionStaggerMs(next.staggerMs);
    setMotionOffsetX(next.offsetX);
    setMotionOffsetY(next.offsetY);
    setMotionEasingPreset(next.easingPreset);
    setMotionEasingX1(next.easingX1);
    setMotionEasingY1(next.easingY1);
    setMotionEasingX2(next.easingX2);
    setMotionEasingY2(next.easingY2);
    localStorage.setItem(MOTION_ANIM_DURATION_KEY, String(next.animDurationMs));
    localStorage.setItem(MOTION_FADE_DURATION_KEY, String(next.fadeDurationMs));
    localStorage.setItem(MOTION_STAGGER_KEY, String(next.staggerMs));
    localStorage.setItem(MOTION_OFFSET_X_KEY, String(next.offsetX));
    localStorage.setItem(MOTION_OFFSET_Y_KEY, String(next.offsetY));
    localStorage.setItem(MOTION_EASING_PRESET_KEY, String(next.easingPreset));
    localStorage.setItem(MOTION_EASING_X1_KEY, String(next.easingX1));
    localStorage.setItem(MOTION_EASING_Y1_KEY, String(next.easingY1));
    localStorage.setItem(MOTION_EASING_X2_KEY, String(next.easingX2));
    localStorage.setItem(MOTION_EASING_Y2_KEY, String(next.easingY2));
    window.dispatchEvent(new CustomEvent(MOTION_TUNING_EVENT, { detail: next }));
  };

  const dispatchExtraChange = (partial: {
    showWidgetDocker?: boolean;
    hideEmptyWidgetSlots?: boolean;
    showGamesSection?: boolean;
    routeTabAnimationsEnabled?: boolean;
    sidebarDockHoverEnabled?: boolean;
    sidebarDockGrowSize?: number;
    sidebarDockGrowSpeed?: number;
    sidebarTabGap?: number;
    sidebarTabsVisibility?: SidebarTabsVisibility;
  }) => {
    window.dispatchEvent(
      new CustomEvent(EXTRA_CHANGE_EVENT, {
        detail: {
          showWidgetDocker: partial.showWidgetDocker ?? showWidgetDocker,
          hideEmptyWidgetSlots: partial.hideEmptyWidgetSlots ?? hideEmptyWidgetSlots,
          showGamesSection: partial.showGamesSection ?? showGamesSection,
          routeTabAnimationsEnabled: partial.routeTabAnimationsEnabled ?? routeTabAnimationsEnabled,
          sidebarDockHoverEnabled: partial.sidebarDockHoverEnabled ?? sidebarDockHoverEnabled,
          sidebarDockGrowSize: partial.sidebarDockGrowSize ?? sidebarDockGrowSize,
          sidebarDockGrowSpeed: partial.sidebarDockGrowSpeed ?? sidebarDockGrowSpeed,
          sidebarTabGap: partial.sidebarTabGap ?? sidebarTabGap,
          sidebarTabsVisibility: partial.sidebarTabsVisibility ?? sidebarTabsVisibility
        }
      })
    );
  };

  const applyShowWidgetDocker = (next: boolean) => {
    setShowWidgetDocker(next);
    localStorage.setItem(SHOW_WIDGET_DOCKER_KEY, next ? 'true' : 'false');
    dispatchExtraChange({ showWidgetDocker: next });
  };

  const applyHideEmptyWidgetSlots = (next: boolean) => {
    setHideEmptyWidgetSlots(next);
    localStorage.setItem(HIDE_EMPTY_WIDGET_SLOTS_KEY, next ? 'true' : 'false');
    dispatchExtraChange({ hideEmptyWidgetSlots: next });
  };

  const applyShowGamesSection = (next: boolean) => {
    setShowGamesSection(next);
    localStorage.setItem(SHOW_GAMES_SECTION_KEY, next ? 'true' : 'false');
    dispatchExtraChange({ showGamesSection: next });
  };

  const applyRouteTabAnimationsEnabled = (next: boolean) => {
    setRouteTabAnimationsEnabled(next);
    localStorage.setItem(ROUTE_TAB_ANIMATIONS_KEY, next ? 'true' : 'false');
    dispatchExtraChange({ routeTabAnimationsEnabled: next });
  };

  const applySidebarDockHoverEnabled = (next: boolean) => {
    setSidebarDockHoverEnabled(next);
    localStorage.setItem(SIDEBAR_DOCK_HOVER_ENABLED_KEY, next ? 'true' : 'false');
    dispatchExtraChange({ sidebarDockHoverEnabled: next });
  };

  const applySidebarDockGrowSize = (next: number) => {
    const clamped = clampSidebarDockGrowSize(next);
    setSidebarDockGrowSize(clamped);
    localStorage.setItem(SIDEBAR_DOCK_GROW_SIZE_KEY, String(clamped));
    dispatchExtraChange({ sidebarDockGrowSize: clamped });
  };

  const applySidebarDockGrowSpeed = (next: number) => {
    const clamped = clampSidebarDockGrowSpeed(next);
    setSidebarDockGrowSpeed(clamped);
    localStorage.setItem(SIDEBAR_DOCK_GROW_SPEED_KEY, String(clamped));
    dispatchExtraChange({ sidebarDockGrowSpeed: clamped });
  };

  const applySidebarTabGap = (next: number) => {
    const clamped = clampSidebarTabGap(next);
    setSidebarTabGap(clamped);
    localStorage.setItem(SIDEBAR_TAB_GAP_KEY, String(clamped));
    dispatchExtraChange({ sidebarTabGap: clamped });
  };

  const applySidebarTabVisibility = (tabId: SidebarTabId, visible: boolean) => {
    const next = { ...sidebarTabsVisibility, [tabId]: visible };
    setSidebarTabsVisibility(next);
    localStorage.setItem(SIDEBAR_TABS_VISIBILITY_KEY, JSON.stringify(next));
    dispatchExtraChange({ sidebarTabsVisibility: next });
  };

  const curvePath = `M 0 100 C ${motionEasingX1 * 100} ${100 - motionEasingY1 * 100}, ${motionEasingX2 * 100} ${100 - motionEasingY2 * 100}, 100 0`;
  const curveCss = `cubic-bezier(${motionEasingX1}, ${motionEasingY1}, ${motionEasingX2}, ${motionEasingY2})`;
  const activeAppearanceSection = APPEARANCE_SECTIONS.find((section) => section.id === appearanceSection) ?? APPEARANCE_SECTIONS[0];

  return (
    <div className="max-w-[1100px] mx-auto min-h-full space-y-4">
      <UniversalLoadingOverlay
        open={savingOverlayOpen}
        fixed
        eyebrow="Saving"
        title="Saving keybinds..."
        description="Bloom is applying your shortcut changes."
      />
      <section className="g-panel-strong p-6">
        <p className="text-[10px] uppercase tracking-[0.2em] font-extrabold g-accent-text">Settings</p>
        <h1 className="text-5xl font-extrabold text-white mt-1">Launcher Control</h1>
        <p className="text-sm g-muted mt-1">System, visuals, and runtime defaults.</p>
      </section>

      <section className="g-panel p-1 inline-flex">
        <button onClick={() => setTab('general')} className={clsx('px-4 py-2 rounded-lg text-xs font-extrabold uppercase tracking-[0.12em]', tab === 'general' ? 'bg-white/15 text-white' : 'text-white/55')}>General</button>
        <button onClick={() => setTab('appearance')} className={clsx('px-4 py-2 rounded-lg text-xs font-extrabold uppercase tracking-[0.12em]', tab === 'appearance' ? 'bg-white/15 text-white' : 'text-white/55')}>Appearance</button>
        <button onClick={() => setTab('keybinds')} className={clsx('px-4 py-2 rounded-lg text-xs font-extrabold uppercase tracking-[0.12em]', tab === 'keybinds' ? 'bg-white/15 text-white' : 'text-white/55')}>Keybinds</button>
        <button onClick={() => setTab('widgets')} className={clsx('px-4 py-2 rounded-lg text-xs font-extrabold uppercase tracking-[0.12em]', tab === 'widgets' ? 'bg-white/15 text-white' : 'text-white/55')}>Widgets</button>
        <button onClick={() => setTab('updates')} className={clsx('px-4 py-2 rounded-lg text-xs font-extrabold uppercase tracking-[0.12em]', tab === 'updates' ? 'bg-white/15 text-white' : 'text-white/55')}>Updates</button>
        <button onClick={() => setTab('extra')} className={clsx('px-4 py-2 rounded-lg text-xs font-extrabold uppercase tracking-[0.12em]', tab === 'extra' ? 'bg-white/15 text-white' : 'text-white/55')}>Extra</button>
      </section>

      {tab === 'general' ? (
        <section className="g-panel p-6 space-y-4">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-xs uppercase tracking-[0.14em] font-extrabold text-white/60">Memory</p>
            <input type="range" min={1024} max={16384} step={1024} defaultValue={4096} className="w-full mt-3 g-range" />
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-xs uppercase tracking-[0.14em] font-extrabold text-white/60">JVM Args</p>
            <input defaultValue="-XX:+UseG1GC" className="w-full mt-2 h-10 rounded-lg border border-white/10 bg-white/[0.03] px-3 text-sm font-semibold text-white outline-none" />
          </div>

        </section>
      ) : tab === 'appearance' ? (
        <section className="g-panel p-4 md:p-6">
          <div className="grid grid-cols-1 xl:grid-cols-[240px_1fr] gap-4">
            <aside className="rounded-xl border border-white/10 bg-white/[0.03] p-3 h-fit">
              <p className="px-2 text-[10px] uppercase tracking-[0.16em] font-extrabold text-white/55">Appearance Groups</p>
              <div className="mt-2 space-y-1">
                {APPEARANCE_SECTIONS.map((section) => (
                  <button
                    key={section.id}
                    onClick={() => setAppearanceSection(section.id)}
                    className={clsx(
                      'w-full rounded-lg border px-3 py-2.5 text-left transition',
                      appearanceSection === section.id
                        ? 'border-[var(--g-accent)] bg-white/[0.06] shadow-[0_0_0_1px_var(--g-accent-soft)]'
                        : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.04]'
                    )}
                  >
                    <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-white">{section.label}</p>
                  </button>
                ))}
              </div>
            </aside>
            <div className="space-y-4">
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-[10px] uppercase tracking-[0.16em] font-extrabold text-white/55">Active Group</p>
                <h2 className="mt-1 text-xl font-extrabold text-white">{activeAppearanceSection.label}</h2>
                <p className="mt-1 text-xs g-muted">{activeAppearanceSection.description}</p>
              </div>

              {appearanceSection === 'presets' && (
          <AppearanceDropdown title="Appearance Presets" description="Save, apply, export, and import full launcher look presets to share with others.">
            <input
              ref={appearanceImportRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(event) => { void onImportAppearancePresetFile(event); }}
            />

            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto_auto] gap-2">
              <input
                value={appearancePresetName}
                onChange={(event) => setAppearancePresetName(event.target.value)}
                placeholder="Preset name (optional)"
                className="g-input h-10 px-3 text-sm font-semibold outline-none"
              />
              <button onClick={saveAppearancePreset} className="g-btn h-10 px-4 text-xs font-extrabold uppercase tracking-[0.12em]">
                Save Current
              </button>
              <button onClick={() => { void exportCurrentAppearance(); }} className="g-btn h-10 px-4 text-xs font-extrabold uppercase tracking-[0.12em]">
                Export Current
              </button>
              <button onClick={() => appearanceImportRef.current?.click()} className="g-btn-accent h-10 px-4 text-xs font-extrabold uppercase tracking-[0.12em]">
                Import Preset
              </button>
            </div>

            {appearancePresetStatus && <p className="text-xs text-emerald-200">{appearancePresetStatus}</p>}
            {appearancePresetError && <p className="text-xs text-red-300">{appearancePresetError}</p>}

            <div className="space-y-2">
              {appearancePresets.length === 0 ? (
                <p className="text-xs g-muted">No saved presets yet.</p>
              ) : (
                appearancePresets.map((preset) => (
                  <div key={preset.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-extrabold text-white">{preset.name}</p>
                        <p className="text-[11px] g-muted mt-1">
                          {preset.payload.themeMode} / {preset.payload.accentMode} / {preset.payload.backgroundMode} • {new Date(preset.updatedAt).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => { void applyAppearancePresetPayload(preset.payload, preset.name); }}
                          className="g-btn-accent h-8 px-3 text-[10px] font-extrabold uppercase tracking-[0.12em]"
                        >
                          Apply
                        </button>
                        <button
                          onClick={() => { void exportAppearancePreset(preset); }}
                          className="g-btn h-8 px-3 text-[10px] font-extrabold uppercase tracking-[0.12em]"
                        >
                          Export
                        </button>
                        <button
                          onClick={() => deleteAppearancePreset(preset.id)}
                          className="g-btn h-8 px-3 text-[10px] font-extrabold uppercase tracking-[0.12em] text-red-200 border-red-300/40"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </AppearanceDropdown>
              )}

              {appearanceSection === 'style' && (
                <>
          <AppearanceDropdown title="Theme Mode" description="Pick the overall visual theme for the launcher.">
            <div className="flex justify-center">
              <button
                onClick={() => applyTheme('true-dark')}
                className={clsx(
                  'w-full max-w-md rounded-2xl border-2 p-4 text-left',
                  themeMode === 'true-dark' ? 'bg-white/[0.06] border-[var(--g-accent)] shadow-[0_0_0_1px_var(--g-accent-soft)]' : 'border-white/20 bg-white/[0.02] hover:bg-white/[0.05]'
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-base font-extrabold text-white">True Dark</p>
                  <span className="text-[10px] uppercase tracking-[0.12em] font-extrabold px-2 py-1 rounded-md border border-[var(--g-accent)] text-[var(--g-accent)]">Featured</span>
                </div>
                <p className="text-xs g-muted mt-1">OLED-friendly blackout with highest contrast.</p>
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              {THEMES.filter((theme) => theme.id !== 'true-dark').map((theme) => (
                <button key={theme.id} onClick={() => applyTheme(theme.id)} className={clsx('rounded-xl border p-4 text-left', themeMode === theme.id ? 'g-btn-accent' : 'border-white/10 bg-white/[0.03]')}>
                  <p className="text-base font-extrabold text-white">{theme.label}</p>
                  <p className="text-xs g-muted mt-1">{theme.description}</p>
                </button>
              ))}
            </div>
          </AppearanceDropdown>

          <AppearanceDropdown title="UI Pixel Level" description="0 is normal. Higher values add a more pixelated Minecraft-like look to UI assets.">
            <div className="mt-3 flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={5}
                step={1}
                value={uiAssetPixelLevel}
                onChange={(event) => applyUiAssetPixelLevel(Number(event.target.value))}
                className="w-full g-range"
              />
              <span className="w-12 text-right text-sm font-extrabold text-white">{uiAssetPixelLevel}</span>
            </div>
          </AppearanceDropdown>

          <AppearanceDropdown title="Icon Pack" description="Choose the icon drawing style across the launcher.">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              {ICON_PACKS.map((pack) => (
                <button key={pack.id} onClick={() => applyIconPack(pack.id)} className={clsx('rounded-xl border p-3 text-left', iconPackMode === pack.id ? 'g-btn-accent' : 'border-white/10 bg-white/[0.03]')}>
                  <p className="text-sm font-extrabold text-white">{pack.label}</p>
                  <p className="text-xs g-muted mt-1">{pack.description}</p>
                </button>
              ))}
            </div>
          </AppearanceDropdown>

          <AppearanceDropdown title="Taskbar Logo Background" description="Change the tile behind the Bloom logo in the sidebar dock.">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              {TASKBAR_LOGO_BACKGROUNDS.map((background) => (
                <button
                  key={background.id}
                  onClick={() => applyTaskbarLogoBackground(background.id)}
                  className={clsx('rounded-xl border p-3 text-left', taskbarLogoBackgroundMode === background.id ? 'g-btn-accent' : 'border-white/10 bg-white/[0.03]')}
                >
                  <div className="h-12 rounded-lg border border-white/10" style={{ background: background.preview }} />
                  <p className="mt-3 text-sm font-extrabold text-white">{background.label}</p>
                  <p className="text-xs g-muted mt-1">{background.description}</p>
                </button>
              ))}
            </div>
          </AppearanceDropdown>

          <AppearanceDropdown title="Button Theme" description="Switch button shape, stroke, and interaction style globally.">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {BUTTON_THEMES.map((theme) => (
                <button key={theme.id} onClick={() => applyButtonTheme(theme.id)} className={clsx('rounded-xl border p-3 text-left', buttonTheme === theme.id ? 'g-btn-accent' : 'border-white/10 bg-white/[0.03]')}>
                  <p className="text-sm font-extrabold text-white">{theme.label}</p>
                  <p className="text-xs g-muted mt-1">{theme.description}</p>
                </button>
              ))}
            </div>
          </AppearanceDropdown>

          <AppearanceDropdown title="Button Roundness" description="Separate corner control for buttons. Set it to 0 for rectangular buttons.">
            <div className="mt-3 flex items-center gap-3">
              <input type="range" min={0} max={100} step={1} value={buttonRoundnessLevel} onChange={(event) => applyButtonRoundness(Number(event.target.value))} className="w-full g-range" />
              <span className="w-12 text-right text-sm font-extrabold text-white">{buttonRoundnessLevel}</span>
            </div>
          </AppearanceDropdown>

          <AppearanceDropdown title="Roundedness" description="Sharp to pill shape across core UI panels and controls.">
            <div className="mt-3 flex items-center gap-3">
              <input type="range" min={0} max={100} step={1} value={roundnessLevel} onChange={(event) => applyRoundness(Number(event.target.value))} className="w-full g-range" />
              <span className="w-12 text-right text-sm font-extrabold text-white">{roundnessLevel}</span>
            </div>
          </AppearanceDropdown>

          <AppearanceDropdown title="Glass Amount" description="Controls panel transparency and blur intensity.">
            <div className="mt-3 flex items-center gap-3">
              <input type="range" min={0} max={100} step={1} value={glassAmount} onChange={(event) => applyGlassAmount(Number(event.target.value))} className="w-full g-range" />
              <span className="w-12 text-right text-sm font-extrabold text-white">{glassAmount}</span>
            </div>
          </AppearanceDropdown>

          <AppearanceDropdown title="Dropdown Menus Opacity" description="Applies to dropdown surfaces and context menus, including search, avatar menu, and top menu popovers.">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={35}
                  max={100}
                  step={1}
                  value={dropdownOpacity}
                  onChange={(event) => applyDropdownOpacity(Number(event.target.value))}
                  className="w-full g-range"
                />
                <span className="w-14 text-right text-sm font-extrabold text-white">{dropdownOpacity}%</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {[55, 70, 82, 92, 100].map((preset) => (
                  <button
                    key={preset}
                    onClick={() => applyDropdownOpacity(preset)}
                    className={clsx(
                      'g-btn h-8 px-3 text-[10px] font-extrabold uppercase tracking-[0.12em]',
                      dropdownOpacity === preset ? 'g-btn-accent' : ''
                    )}
                  >
                    {preset}%
                  </button>
                ))}
              </div>
            </div>
          </AppearanceDropdown>

          <AppearanceDropdown title="Accent Color" description="Global accent applied to controls and highlights.">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {ACCENTS.map((accent) => (
                <button
                  key={accent.id}
                  onClick={() => applyAccent(accent.id)}
                  className={clsx('rounded-xl border p-3 text-left', accentMode === accent.id ? 'g-btn-accent' : 'border-white/10 bg-white/[0.03]')}
                >
                  <div className="h-6 rounded-md border border-white/15" style={{ background: accent.swatch }} />
                  <p className="mt-2 text-sm font-extrabold text-white">{accent.label}</p>
                </button>
              ))}
            </div>
          </AppearanceDropdown>
                </>
              )}

              {appearanceSection === 'background' && (
          <AppearanceDropdown title="Background" description="Pick animated/background texture style.">
            <div className="grid grid-cols-2 md:grid-cols-7 gap-3">
              {([ 
                { id: 'none', label: 'None', preview: 'var(--g-bg)', size: 'auto' },
                { id: 'plus', label: 'Plus', preview: 'radial-gradient(circle at 1px 1px, color-mix(in srgb, var(--g-accent) 34%, transparent) 1px, transparent 0)', size: '18px 18px' },
                { id: 'particles', label: 'Particles', preview: 'radial-gradient(circle at 25% 35%, color-mix(in srgb, var(--g-accent) 60%, transparent), transparent 55%), radial-gradient(circle at 70% 60%, color-mix(in srgb, var(--g-accent) 42%, #ffffff 10%), transparent 58%)', size: 'auto' },
                { id: 'aurora', label: 'Aurora', preview: 'radial-gradient(120% 100% at 20% 20%, color-mix(in srgb, var(--g-accent) 40%, transparent), transparent 62%), radial-gradient(120% 100% at 80% 80%, color-mix(in srgb, var(--g-accent) 24%, #39d682 26%), transparent 65%)', size: 'auto' },
                { id: 'scanlines', label: 'Scanlines', preview: 'linear-gradient(to bottom, rgba(255,255,255,0.07) 1px, transparent 1px), linear-gradient(to right, color-mix(in srgb, var(--g-accent) 18%, transparent) 1px, transparent 1px)', size: '100% 4px, 18px 18px' },
                { id: 'nebula', label: 'Nebula', preview: 'radial-gradient(100% 100% at 20% 70%, color-mix(in srgb, var(--g-accent) 45%, transparent), transparent 70%), radial-gradient(80% 80% at 70% 30%, color-mix(in srgb, var(--g-accent) 35%, #ffffff 8%), transparent 72%)', size: 'auto' },
                { id: 'custom', label: 'Custom', preview: customBackgroundRenderPreview ? `url(${customBackgroundRenderPreview}) center/cover no-repeat` : 'linear-gradient(135deg, rgba(255,255,255,0.12), rgba(255,255,255,0.02))', size: 'cover' }
              ] as { id: BackgroundMode; label: string; preview: string; size: string }[]).map((bg) => (
                <button
                  key={bg.id}
                  onClick={() => applyBackground(bg.id)}
                  className={clsx('rounded-xl border p-3 text-left', backgroundMode === bg.id ? 'g-btn-accent' : 'border-white/10 bg-white/[0.03]')}
                >
                  <div className="h-10 rounded-md border border-white/15" style={{ background: bg.preview, backgroundSize: bg.size }} />
                  <p className="mt-2 text-sm font-extrabold text-white">{bg.label}</p>
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs uppercase tracking-[0.14em] font-extrabold text-white/60">Background Opacity</p>
                  <span className="text-sm font-extrabold text-white">{backgroundVisualOpacity}%</span>
                </div>
                <p className="text-xs g-muted mt-1">Lower values darken the launcher background more.</p>
                <input type="range" min={10} max={100} step={1} value={backgroundVisualOpacity} onChange={(event) => applyBackgroundVisualOpacity(Number(event.target.value))} className="mt-3 w-full g-range" />
              </div>

              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs uppercase tracking-[0.14em] font-extrabold text-white/60">Taskbar and Top Bar Opacity</p>
                  <span className="text-sm font-extrabold text-white">{taskbarSurfaceOpacity}%</span>
                </div>
                <p className="text-xs g-muted mt-1">Controls how solid the sidebar dock and top shell are over the background.</p>
                <input type="range" min={0} max={100} step={1} value={taskbarSurfaceOpacity} onChange={(event) => applyTaskbarSurfaceOpacity(Number(event.target.value))} className="mt-3 w-full g-range" />
              </div>

            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.14em] font-extrabold text-white/60">Custom Background Editor</p>
                    <p className="text-xs g-muted mt-1">Upload, drag, and scroll-zoom. Saves automatically to a 1920x1080 output.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <label className="g-btn h-10 px-4 text-xs font-extrabold uppercase tracking-[0.12em] inline-flex items-center justify-center cursor-pointer">
                      Upload Image / Video
                      <input type="file" accept="image/*,video/mp4,video/webm,video/ogg" onChange={(event) => { void onCustomBackgroundFile(event); }} className="hidden" />
                    </label>
                    <button
                      onClick={() => {
                        setCustomBackgroundPanX(0);
                      setCustomBackgroundPanY(0);
                      setCustomBackgroundZoom(1);
                    }}
                    disabled={!customBackgroundSource || customBackgroundMediaKind === 'video'}
                    className="g-btn h-10 px-4 text-xs font-extrabold uppercase tracking-[0.12em] disabled:opacity-50"
                  >
                    Reset View
                  </button>
                  <button
                    onClick={() => { void clearCustomBackground(); }}
                    disabled={!customBackgroundSaved && !customBackgroundSource}
                    className="g-btn h-10 px-4 text-xs font-extrabold uppercase tracking-[0.12em] disabled:opacity-50"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.12em] text-white/55">
                <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5">{customBackgroundMediaKind === 'video' ? 'Local Video' : `Output ${customBackgroundTarget.width}x${customBackgroundTarget.height}`}</span>
                <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5">{customBackgroundSaving ? 'Autosaving…' : customBackgroundSaved ? 'Saved' : 'Not Saved'}</span>
                <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5">{customBackgroundMediaKind === 'video' ? 'Loop Playback' : `Zoom ${customBackgroundZoom.toFixed(2)}x`}</span>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-[1.35fr_0.85fr] gap-4">
                <div className="space-y-3">
                  <div
                    onPointerDown={onCustomBackgroundPointerDown}
                    onPointerMove={onCustomBackgroundPointerMove}
                    onPointerUp={onCustomBackgroundPointerUp}
                    onPointerLeave={onCustomBackgroundPointerUp}
                    onWheel={onCustomBackgroundWheel}
                    className={clsx('relative aspect-video overflow-hidden rounded-2xl border border-white/10 bg-black/40', customBackgroundSource ? (customBackgroundMediaKind === 'image' ? (draggingCustomBackground ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-default') : 'cursor-default')}
                  >
                    {customBackgroundSource ? (
                      <>
                        {customBackgroundMediaKind === 'video' ? (
                          <video
                            src={customBackgroundSource}
                            className="absolute inset-0 h-full w-full object-cover select-none pointer-events-none"
                            autoPlay
                            loop
                            muted
                            playsInline
                          />
                        ) : (
                          <img
                            src={customBackgroundSource}
                            alt="Custom background editor"
                            className="absolute inset-0 h-full w-full object-cover select-none pointer-events-none"
                            style={{
                              transform: `translate(${customBackgroundPanX * 14}%, ${customBackgroundPanY * 14}%) scale(${customBackgroundZoom})`
                            }}
                          />
                        )}
                        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:10%_10%]" />
                        {customBackgroundMediaKind === 'image' && <div className="pointer-events-none absolute left-[7%] top-[7%] h-[86%] w-[86%] rounded-xl border border-white/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.36)]" />}
                        <div className="pointer-events-none absolute bottom-2 left-2 rounded-md border border-white/15 bg-black/45 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-white/80">
                          {customBackgroundMediaKind === 'video' ? 'Stored locally on this device' : 'Drag to Pan • Scroll to Zoom'}
                        </div>
                      </>
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-sm font-bold text-white/38">Upload an image to start editing</div>
                    )}
                  </div>

                </div>

                <div className="space-y-3">
                  <p className="text-[11px] uppercase tracking-[0.12em] font-extrabold text-white/55">Exact Output Preview</p>
                  <div className="rounded-2xl border border-white/10 bg-black/40 p-3">
                    <div className="aspect-video overflow-hidden rounded-xl border border-white/10 bg-black/50">
                      {customBackgroundRenderPreview ? (
                        customBackgroundMediaKind === 'video' ? (
                          <video src={customBackgroundRenderPreview} className="h-full w-full object-cover" autoPlay loop muted playsInline />
                        ) : (
                          <img src={customBackgroundRenderPreview} alt="Custom background output preview" className="h-full w-full object-cover" />
                        )
                      ) : (
                        <div className="flex h-full items-center justify-center text-sm font-bold text-white/38">Saved output preview appears here</div>
                      )}
                    </div>
                    <p className="mt-3 text-xs g-muted">{customBackgroundMediaKind === 'video' ? 'This video is stored locally in Bloom app data and plays directly from disk.' : 'This preview is rendered from the same output Bloom will save and use as your launcher background.'}</p>
                  </div>
                </div>
              </div>

              {customBackgroundError && <p className="text-sm text-red-300">{customBackgroundError}</p>}
            </div>
          </AppearanceDropdown>
              )}

              {appearanceSection === 'sidebar' && (
                <>
          <AppearanceDropdown title="Layout Density" description="Controls overall spacing and scale.">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {([
                { id: 'compact', label: 'Compact', desc: 'Tighter spacing' },
                { id: 'cozy', label: 'Cozy', desc: 'Balanced default' },
                { id: 'spacious', label: 'Spacious', desc: 'Larger spacing' }
              ] as { id: DensityMode; label: string; desc: string }[]).map((mode) => (
                <button key={mode.id} onClick={() => applyDensity(mode.id)} className={clsx('rounded-xl border p-3 text-left', densityMode === mode.id ? 'g-btn-accent' : 'border-white/10 bg-white/[0.03]')}>
                  <p className="text-sm font-extrabold text-white">{mode.label}</p>
                  <p className="text-xs g-muted mt-1">{mode.desc}</p>
                </button>
              ))}
            </div>
          </AppearanceDropdown>

          <AppearanceDropdown title="Typography Pack" description="Switch global UI typeface and feel.">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {([
                { id: 'manrope', label: 'Manrope', sample: 'Modern clean UI' },
                { id: 'space-grotesk', label: 'Space Grotesk', sample: 'Geometric tech' },
                { id: 'sora', label: 'Sora', sample: 'Sharp premium' }
              ] as { id: FontPackMode; label: string; sample: string }[]).map((font) => (
                <button key={font.id} onClick={() => applyFontPack(font.id)} className={clsx('rounded-xl border p-3 text-left', fontPackMode === font.id ? 'g-btn-accent' : 'border-white/10 bg-white/[0.03]')}>
                  <p className="text-sm font-extrabold text-white">{font.label}</p>
                  <p className="text-xs g-muted mt-1">{font.sample}</p>
                </button>
              ))}
            </div>
          </AppearanceDropdown>

          <AppearanceDropdown title="Sidebar Style" description="Choose the launcher dock density and labels.">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {([
                { id: 'rail', label: 'Rail', desc: 'Icons only' },
                { id: 'classic', label: 'Classic', desc: 'Current launcher bar' },
                { id: 'expanded', label: 'Expanded', desc: 'Wider with labels' }
              ] as { id: SidebarMode; label: string; desc: string }[]).map((mode) => (
                <button key={mode.id} onClick={() => applySidebar(mode.id)} className={clsx('rounded-xl border p-3 text-left', sidebarMode === mode.id ? 'g-btn-accent' : 'border-white/10 bg-white/[0.03]')}>
                  <p className="text-sm font-extrabold text-white">{mode.label}</p>
                  <p className="text-xs g-muted mt-1">{mode.desc}</p>
                </button>
              ))}
            </div>
          </AppearanceDropdown>

          <AppearanceDropdown title="Sidebar Position" description="Place navigation on left, right, top, or bottom.">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              {([
                { id: 'left', label: 'Left', desc: 'Default dock placement' },
                { id: 'right', label: 'Right', desc: 'Mirror the launcher dock' },
                { id: 'top', label: 'Top', desc: 'Horizontal top navigation bar' },
                { id: 'bottom', label: 'Bottom', desc: 'Horizontal bottom navigation bar' }
              ] as { id: SidebarPosition; label: string; desc: string }[]).map((pos) => (
                <button key={pos.id} onClick={() => applySidebarPosition(pos.id)} className={clsx('rounded-xl border p-3 text-left', sidebarPosition === pos.id ? 'g-btn-accent' : 'border-white/10 bg-white/[0.03]')}>
                  <p className="text-sm font-extrabold text-white">{pos.label}</p>
                  <p className="text-xs g-muted mt-1">{pos.desc}</p>
                </button>
              ))}
            </div>
          </AppearanceDropdown>

          <AppearanceDropdown title="Card Style" description="Glass, solid, or outline panel rendering.">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {([
                { id: 'glass', label: 'Glass', desc: 'Blur + glow' },
                { id: 'solid', label: 'Solid', desc: 'Denser panels' },
                { id: 'outline', label: 'Outline', desc: 'Minimal borders' }
              ] as { id: CardStyleMode; label: string; desc: string }[]).map((mode) => (
                <button key={mode.id} onClick={() => applyCardStyle(mode.id)} className={clsx('rounded-xl border p-3 text-left', cardStyleMode === mode.id ? 'g-btn-accent' : 'border-white/10 bg-white/[0.03]')}>
                  <p className="text-sm font-extrabold text-white">{mode.label}</p>
                  <p className="text-xs g-muted mt-1">{mode.desc}</p>
                </button>
              ))}
            </div>
          </AppearanceDropdown>

          <AppearanceDropdown title="Sidebar Tabs" description="Toggle which tabs appear in the sidebar navigation.">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {([
                { id: 'home', label: 'Home' },
                { id: 'instances', label: 'Instances' },
                { id: 'marketplace', label: 'Marketplace' },
                { id: 'importer', label: 'Importer' },
                { id: 'widgets', label: 'Widgets' },
                { id: 'cosmetics', label: 'Cosmetic Locker' },
                { id: 'custom-cape', label: 'Custom Cape' },
                { id: 'chat', label: 'Chat' },
                { id: 'script-studio', label: 'Script Studio (IDE)' },
                { id: 'host-server', label: 'Host Server' },
                { id: 'games', label: 'Games' },
                { id: 'help', label: 'Help' },
                { id: 'information', label: 'Information' }
              ] as { id: SidebarTabId; label: string }[]).map((tabOption) => (
                <div key={tabOption.id} className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2.5 flex items-center justify-between gap-3">
                  <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-white/78">{tabOption.label}</p>
                  <button
                    data-on={sidebarTabsVisibility[tabOption.id]}
                    onClick={() => applySidebarTabVisibility(tabOption.id, !sidebarTabsVisibility[tabOption.id])}
                    className="g-toggle"
                    aria-label={`Toggle ${tabOption.label} tab`}
                  />
                </div>
              ))}
            </div>
            <p className="text-[11px] g-muted">Default hidden tabs: Games, Script Studio, Chat, and Host Server.</p>
          </AppearanceDropdown>
                </>
              )}

              {appearanceSection === 'animation' && (
                <>
          <AppearanceDropdown title="Motion Profile" description="Controls animation amount and pacing.">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              {([
                { id: 'off', label: 'Off', desc: 'Almost static' },
                { id: 'subtle', label: 'Subtle', desc: 'Slow and quiet' },
                { id: 'standard', label: 'Standard', desc: 'Balanced default' },
                { id: 'cinematic', label: 'Cinematic', desc: 'More movement' }
              ] as { id: MotionMode; label: string; desc: string }[]).map((mode) => (
                <button key={mode.id} onClick={() => applyMotion(mode.id)} className={clsx('rounded-xl border p-3 text-left', motionMode === mode.id ? 'g-btn-accent' : 'border-white/10 bg-white/[0.03]')}>
                  <p className="text-sm font-extrabold text-white">{mode.label}</p>
                  <p className="text-xs g-muted mt-1">{mode.desc}</p>
                </button>
              ))}
            </div>
          </AppearanceDropdown>

          <AppearanceDropdown title="Universal Loading Screen" description="Pick the minimal loading screen Bloom uses for installs, saves, imports, and launch actions.">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
              {INSTANCE_INSTALL_LOADING_STYLES.map((style) => (
                <button
                  key={style.id}
                  onClick={() => applyInstanceInstallLoadingStyle(style.id)}
                  className={clsx(
                    'rounded-xl border p-3 text-left transition',
                    instanceInstallLoadingStyle === style.id ? 'g-btn-accent' : 'border-white/10 bg-white/[0.03]'
                  )}
                >
                  <div className="flex h-24 items-center justify-center rounded-xl border border-white/10 bg-black/30">
                    <LoadingScreenPreviewGlyph style={style.id} />
                  </div>
                  <p className="mt-3 text-sm font-extrabold text-white">{style.label}</p>
                  <p className="mt-1 text-[11px] g-muted">{style.description}</p>
                </button>
              ))}
            </div>
          </AppearanceDropdown>

          <AppearanceDropdown title="Animation FPS" description="Controls anime.js update rate for launcher motion.">
            <div className="mt-3 flex items-center gap-3">
              <input
                type="range"
                min={14}
                max={30}
                step={1}
                value={motionFps}
                onChange={(event) => applyMotionFps(Number(event.target.value))}
                className="w-full g-range"
              />
              <span className="w-14 text-right text-sm font-extrabold text-white">{motionFps} FPS</span>
            </div>
          </AppearanceDropdown>

          <AppearanceDropdown title="Animation Tuning" description="Advanced easing curve, timing, and offsets.">

            <div className="rounded-xl border border-white/10 bg-black/20 p-3 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-white/70">Easing Preset</p>
                  <p className="text-[11px] g-muted">Flow-style easing profile for motion.</p>
                </div>
                <select
                  value={motionEasingPreset}
                  onChange={(event) => applyMotionTuning({ easingPreset: event.target.value as MotionEasingPreset })}
                  className="h-9 rounded-md border border-white/15 bg-white/[0.04] px-2 text-[11px] font-bold text-white outline-none"
                >
                  {EASING_PRESETS.map((preset) => (
                    <option key={preset.id} value={preset.id} className="text-black">
                      {preset.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="rounded-lg border border-white/10 bg-black/30 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-white/55">Curve Preview</p>
                  <span className="text-[11px] font-bold text-white/65">{curveCss}</span>
                </div>
                <svg viewBox="0 0 100 100" className="w-full h-36 rounded-md border border-white/10 bg-[#0f131d]">
                  <path d="M 0 100 L 100 0" stroke="rgba(255,255,255,0.2)" strokeWidth="1" strokeDasharray="3 3" fill="none" />
                  <path d={curvePath} stroke="var(--g-accent)" strokeWidth="2.4" fill="none" />
                  <line x1="0" y1="100" x2={String(motionEasingX1 * 100)} y2={String(100 - motionEasingY1 * 100)} stroke="rgba(255,255,255,0.35)" strokeWidth="1" />
                  <line x1="100" y1="0" x2={String(motionEasingX2 * 100)} y2={String(100 - motionEasingY2 * 100)} stroke="rgba(255,255,255,0.35)" strokeWidth="1" />
                  <circle cx={String(motionEasingX1 * 100)} cy={String(100 - motionEasingY1 * 100)} r="2.3" fill="var(--g-accent)" />
                  <circle cx={String(motionEasingX2 * 100)} cy={String(100 - motionEasingY2 * 100)} r="2.3" fill="var(--g-accent)" />
                </svg>
              </div>

              {motionEasingPreset === 'custom' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <div className="flex items-center justify-between">
                      <p className="text-xs g-muted">Handle 1 X</p>
                      <span className="text-xs font-extrabold text-white">{motionEasingX1.toFixed(2)}</span>
                    </div>
                    <input type="range" min={0} max={1} step={0.01} value={motionEasingX1} onChange={(event) => applyMotionTuning({ easingX1: Number(event.target.value) })} className="w-full mt-1 g-range" />
                  </div>
                  <div>
                    <div className="flex items-center justify-between">
                      <p className="text-xs g-muted">Handle 1 Y</p>
                      <span className="text-xs font-extrabold text-white">{motionEasingY1.toFixed(2)}</span>
                    </div>
                    <input type="range" min={0} max={1} step={0.01} value={motionEasingY1} onChange={(event) => applyMotionTuning({ easingY1: Number(event.target.value) })} className="w-full mt-1 g-range" />
                  </div>
                  <div>
                    <div className="flex items-center justify-between">
                      <p className="text-xs g-muted">Handle 2 X</p>
                      <span className="text-xs font-extrabold text-white">{motionEasingX2.toFixed(2)}</span>
                    </div>
                    <input type="range" min={0} max={1} step={0.01} value={motionEasingX2} onChange={(event) => applyMotionTuning({ easingX2: Number(event.target.value) })} className="w-full mt-1 g-range" />
                  </div>
                  <div>
                    <div className="flex items-center justify-between">
                      <p className="text-xs g-muted">Handle 2 Y</p>
                      <span className="text-xs font-extrabold text-white">{motionEasingY2.toFixed(2)}</span>
                    </div>
                    <input type="range" min={0} max={1} step={0.01} value={motionEasingY2} onChange={(event) => applyMotionTuning({ easingY2: Number(event.target.value) })} className="w-full mt-1 g-range" />
                  </div>
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between">
                <p className="text-xs g-muted">Animation Length</p>
                <span className="text-xs font-extrabold text-white">{motionAnimDurationMs} ms</span>
              </div>
              <input type="range" min={120} max={1400} step={10} value={motionAnimDurationMs} onChange={(event) => applyMotionTuning({ animDurationMs: Number(event.target.value) })} className="w-full mt-1 g-range" />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <p className="text-xs g-muted">Fade Time</p>
                <span className="text-xs font-extrabold text-white">{motionFadeDurationMs} ms</span>
              </div>
              <input type="range" min={80} max={1400} step={10} value={motionFadeDurationMs} onChange={(event) => applyMotionTuning({ fadeDurationMs: Number(event.target.value) })} className="w-full mt-1 g-range" />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <p className="text-xs g-muted">Stagger Delay</p>
                <span className="text-xs font-extrabold text-white">{motionStaggerMs} ms</span>
              </div>
              <input type="range" min={0} max={220} step={1} value={motionStaggerMs} onChange={(event) => applyMotionTuning({ staggerMs: Number(event.target.value) })} className="w-full mt-1 g-range" />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <p className="text-xs g-muted">Left/Right Offset</p>
                <span className="text-xs font-extrabold text-white">{motionOffsetX}px</span>
              </div>
              <input type="range" min={-70} max={70} step={1} value={motionOffsetX} onChange={(event) => applyMotionTuning({ offsetX: Number(event.target.value) })} className="w-full mt-1 g-range" />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <p className="text-xs g-muted">Up/Down Offset</p>
                <span className="text-xs font-extrabold text-white">{motionOffsetY}px</span>
              </div>
              <input type="range" min={-70} max={70} step={1} value={motionOffsetY} onChange={(event) => applyMotionTuning({ offsetY: Number(event.target.value) })} className="w-full mt-1 g-range" />
            </div>
          </AppearanceDropdown>
                </>
              )}

              {appearanceSection === 'shop' && (
                <>
          <AppearanceDropdown title="Preset Palette" description="Choose a single rarity palette for the cosmetic shop. Default uses colors from the listing data.">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {SHOP_RARITY_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => applyShopRarityPreset(preset.id)}
                  className={clsx('rounded-xl border p-3 text-left', shopRarityTheme.presetId === preset.id ? 'g-btn-accent' : 'border-white/10 bg-white/[0.03]')}
                >
                  <p className="text-sm font-extrabold text-white">{preset.label}</p>
                  <p className="text-xs g-muted mt-1">{preset.description}</p>
                </button>
              ))}
            </div>
          </AppearanceDropdown>

          <AppearanceDropdown title="Custom Rarity Colors" description="Set each rarity to its own gradient and glow. Editing here automatically switches the shop theme to Custom.">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs g-muted">These colors apply to shop cards, badges, and rarity accents.</p>
              <button onClick={resetShopRarityCustomColors} className="g-btn h-9 px-3 text-[10px] font-extrabold uppercase tracking-[0.12em]">
                Reset Custom Colors
              </button>
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              {SHOP_RARITY_ORDER.map((rarity) => {
                const colors = shopRarityTheme.custom[rarity];
                return (
                  <div key={rarity} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                    <div
                      className="rounded-lg border border-white/10 p-3"
                      style={{
                        background: `linear-gradient(145deg, ${colors.start}, ${colors.end})`,
                        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.08), 0 0 22px ${colors.glow}`
                      }}
                    >
                      <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-white/80">{SHOP_RARITY_LABELS[rarity]}</p>
                      <p className="text-xs text-white/65 mt-1">{rarity}</p>
                    </div>
                    <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2">
                      <ShopColorField label="Start" value={colors.start} onChange={(next: string) => applyShopRarityCustomColor(rarity, 'start', next)} />
                      <ShopColorField label="End" value={colors.end} onChange={(next: string) => applyShopRarityCustomColor(rarity, 'end', next)} />
                      <ShopColorField label="Glow" value={colors.glow} onChange={(next: string) => applyShopRarityCustomColor(rarity, 'glow', next)} />
                    </div>
                  </div>
                );
              })}
            </div>
          </AppearanceDropdown>
                </>
              )}
            </div>
          </div>
        </section>
      ) : tab === 'keybinds' ? (
        <section className="g-panel p-6 space-y-4">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-xs uppercase tracking-[0.14em] font-extrabold text-white/60">Keybinds</p>
            <p className="text-xs g-muted mt-2">
              Bind launcher actions here. The global shortcuts are live now. The extra editor and page shortcuts are stored and ready for the next round of wiring.
            </p>
            <p className="text-[11px] text-white/40 mt-2">Press `Escape` while capturing to cancel. Use `Clear` to set a shortcut back to `Unbound`.</p>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
            <p className="text-xs uppercase tracking-[0.14em] font-extrabold text-white/60">Bloom Console</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <button onClick={() => applyConsoleSettings({ persistHistory: !consolePersistHistory })} className="g-btn h-10 w-full rounded-lg px-3 inline-flex items-center justify-between text-xs font-extrabold uppercase tracking-[0.12em]">
                Persist History <span>{consolePersistHistory ? 'On' : 'Off'}</span>
              </button>
              <button onClick={() => applyConsoleSettings({ showStartupTip: !consoleShowStartupTip })} className="g-btn h-10 w-full rounded-lg px-3 inline-flex items-center justify-between text-xs font-extrabold uppercase tracking-[0.12em]">
                Startup Tip <span>{consoleShowStartupTip ? 'On' : 'Off'}</span>
              </button>
              <button onClick={() => applyConsoleSettings({ showDevCommands: !consoleShowDevCommands })} className="g-btn h-10 w-full rounded-lg px-3 inline-flex items-center justify-between text-xs font-extrabold uppercase tracking-[0.12em]">
                Dev Help <span>{consoleShowDevCommands ? 'On' : 'Off'}</span>
              </button>
            </div>
            <p className="text-[11px] text-white/40">These settings affect the in-app Bloom Console overlay in real time.</p>
          </div>

          {KEYBIND_GROUPS.map((group) => (
            <div key={group.title} className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
              <div>
                <p className="text-xs uppercase tracking-[0.14em] font-extrabold text-white/60">{group.title}</p>
                <p className="text-[11px] g-muted mt-1">
                  {group.title === 'Global'
                    ? 'Primary launcher actions.'
                    : group.title === 'Instance Editor'
                      ? 'Shortcuts for moving around and acting inside instance editor pages.'
                      : 'Reserved slots for library, widgets, and quick page actions.'}
                </p>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                {group.bindings.map((binding) => {
                  const currentValue =
                    binding.id === 'search'
                      ? draftShortcutSearch
                      : binding.id === 'create'
                        ? draftShortcutCreateInstance
                        : binding.id === 'settings'
                          ? draftShortcutSettings
                          : binding.id === 'console'
                            ? draftShortcutConsole
                          : binding.id === 'replay-startup-scene'
                            ? draftShortcutReplayStartupScene
                            : draftExtraKeybinds[binding.id] ?? binding.defaultValue;
                  const displayValue = currentValue && currentValue.trim() ? currentValue : 'Unbound';
                  return (
                    <div key={binding.id} className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-extrabold text-white/78 uppercase tracking-[0.12em]">{binding.label}</p>
                          <p className="text-[11px] g-muted mt-1">{binding.description}</p>
                        </div>
                        <span className={clsx('rounded-full border px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em]', binding.wired ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200' : 'border-white/10 bg-white/[0.03] text-white/45')}>
                          {binding.wired ? 'Live' : 'Stored'}
                        </span>
                      </div>
                      <div className="mt-3 flex gap-2">
                        <button onClick={() => setCapturingShortcut(binding.id)} className="g-btn h-9 flex-1 text-xs font-extrabold">
                          {capturingShortcut === binding.id ? 'Press keys...' : displayValue}
                        </button>
                        <button onClick={() => clearShortcut(binding.id)} className="rounded-lg border border-white/10 bg-white/[0.04] px-3 text-[11px] font-extrabold uppercase tracking-[0.12em] text-white/70">
                          Clear
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {(keybindsDirty || keybindSaveState === 'saved') && (
            <div
              className="sticky bottom-4 rounded-2xl border p-4 flex flex-wrap items-center justify-between gap-3"
              style={{
                borderColor: keybindsDirty ? 'rgba(248, 113, 113, 0.35)' : 'rgba(74, 222, 128, 0.35)',
                background: keybindsDirty ? 'rgba(127, 29, 29, 0.22)' : 'rgba(20, 83, 45, 0.22)'
              }}
            >
              <div>
                <p className={clsx('text-xs font-extrabold uppercase tracking-[0.14em]', keybindsDirty ? 'text-red-200' : 'text-emerald-200')}>
                  {keybindsDirty ? 'Unsaved Keybind Changes' : 'Keybinds Saved'}
                </p>
                <p className="text-xs text-white/62 mt-1">
                  {keybindsDirty ? 'These bindings will not go live until you save them.' : 'Current non-unbound bindings are now live.'}
                </p>
              </div>
              <button
                onClick={saveKeybinds}
                disabled={!keybindsDirty}
                className={clsx(
                  'h-11 px-5 rounded-xl text-xs font-extrabold uppercase tracking-[0.14em] transition',
                  keybindsDirty ? 'bg-red-500 text-white hover:bg-red-400' : 'bg-emerald-500 text-white'
                )}
              >
                {keybindsDirty ? 'Save Keybinds' : 'Saved'}
              </button>
            </div>
          )}
        </section>
      ) : tab === 'widgets' ? (
        <section className="g-panel p-6 space-y-4">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.14em] font-extrabold text-white/60">Show Widget Docker</p>
                <p className="text-xs g-muted mt-1">Show the widget docking controls on pages that support widgets.</p>
              </div>
              <button
                data-on={showWidgetDocker}
                onClick={() => applyShowWidgetDocker(!showWidgetDocker)}
                className="g-toggle"
                aria-label="Toggle Widget Docker"
              />
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.14em] font-extrabold text-white/60">Hide Empty Slots</p>
                <p className="text-xs g-muted mt-1">Hide empty widget placeholders during normal use. Empty slots still appear while dragging widgets.</p>
              </div>
              <button
                data-on={hideEmptyWidgetSlots}
                onClick={() => applyHideEmptyWidgetSlots(!hideEmptyWidgetSlots)}
                className="g-toggle"
                aria-label="Toggle Empty Widget Slots"
              />
            </div>
          </div>
        </section>
      ) : tab === 'updates' ? (
        <section className="g-panel p-6 space-y-4">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.14em] font-extrabold text-white/60">Launcher Version</p>
                <p className="text-2xl font-extrabold text-white mt-1">{APP_VERSION}</p>
                <p className="text-xs g-muted mt-1">Bloom checks GitHub Releases for the newest Windows installer.</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 min-w-[220px]">
                <p className="text-[11px] uppercase tracking-[0.12em] font-extrabold text-white/55">Status</p>
                <p className="text-sm text-white mt-1">{updaterStatus}</p>
              </div>
            </div>

            {updaterProgress !== null && (
              <div className="rounded-lg border border-white/10 bg-white/[0.02] p-2">
                <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full bg-[var(--g-accent)] transition-[width] duration-150" style={{ width: `${Math.max(0, Math.min(100, updaterProgress))}%` }} />
                </div>
                <p className="text-[10px] text-white/60 mt-1 font-bold">{Math.max(0, Math.min(100, updaterProgress))}%</p>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <button
                onClick={() => { void runUpdateCheck(); }}
                disabled={checkingUpdate || installingUpdate}
                className="g-btn h-10 text-xs font-extrabold uppercase tracking-[0.12em] disabled:opacity-50"
              >
                {checkingUpdate ? 'Checking...' : 'Check For Updates'}
              </button>
              <button
                onClick={() => { void runUpdateInstall(); }}
                disabled={!availableUpdate || checkingUpdate || installingUpdate}
                className="g-btn-accent h-10 text-xs font-extrabold uppercase tracking-[0.12em] disabled:opacity-50"
              >
                {installingUpdate ? 'Installing...' : availableUpdate ? `Install v${availableUpdate.version}` : 'No Update'}
              </button>
            </div>
            <p className="text-[10px] g-muted">Release assets are pulled from the latest GitHub Release installer asset (`*-setup.exe` or `.msi`).</p>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.14em] font-extrabold text-white/60">Automatic Update Checks</p>
                <p className="text-xs g-muted mt-1">Check for a new launcher release each time Bloom opens.</p>
              </div>
              <button
                data-on={updateAutoCheckEnabled}
                onClick={() => applyUpdatePreferences({ autoCheck: !updateAutoCheckEnabled })}
                className="g-toggle"
                aria-label="Toggle automatic update checks"
              />
            </div>

            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.14em] font-extrabold text-white/60">Update Notifications</p>
                <p className="text-xs g-muted mt-1">Show an in-client notification card whenever a newer launcher version is found.</p>
              </div>
              <button
                data-on={updateNotificationsEnabled}
                onClick={() => applyUpdatePreferences({ notifications: !updateNotificationsEnabled })}
                className="g-toggle"
                aria-label="Toggle update notifications"
              />
            </div>
          </div>
        </section>
      ) : (
        <section className="g-panel p-6 space-y-4">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.14em] font-extrabold text-white/60">Startup Scene</p>
                <p className="text-xs g-muted mt-1">Animated launcher splash shown when the app opens.</p>
              </div>
              <button
                data-on={startupSceneEnabled}
                onClick={() => applyStartupScene({ enabled: !startupSceneEnabled })}
                className="g-toggle"
                aria-label="Toggle Startup Scene"
              />
            </div>

            <div className={clsx('space-y-3 transition-opacity', startupSceneEnabled ? 'opacity-100' : 'opacity-45')}>
              <div>
                <p className="text-[11px] uppercase tracking-[0.12em] font-extrabold text-white/55 mb-2">Scene Theme</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  {STARTUP_SCENE_THEMES.map((scene) => (
                    <button
                      key={scene.id}
                      onClick={() => applyStartupScene({ theme: scene.id })}
                      disabled={!startupSceneEnabled}
                      className={clsx('rounded-lg border p-2 text-left disabled:opacity-55 disabled:cursor-not-allowed', startupSceneTheme === scene.id ? 'g-btn-accent' : 'border-white/10 bg-white/[0.03]')}
                    >
                      <p className="text-xs font-extrabold text-white uppercase tracking-[0.12em]">{scene.label}</p>
                      <p className="text-[10px] g-muted mt-1">{scene.description}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-[11px] uppercase tracking-[0.12em] font-extrabold text-white/55 mb-2">Startup Sound Profile</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  {STARTUP_SCENE_SOUND_PROFILES.map((profile) => (
                    <button
                      key={profile.id}
                      onClick={() => applyStartupScene({ soundProfile: profile.id })}
                      disabled={!startupSceneEnabled}
                      className={clsx('rounded-lg border p-2 text-left disabled:opacity-55 disabled:cursor-not-allowed', startupSceneSoundProfile === profile.id ? 'g-btn-accent' : 'border-white/10 bg-white/[0.03]')}
                    >
                      <p className="text-xs font-extrabold text-white uppercase tracking-[0.12em]">{profile.label}</p>
                      <p className="text-[10px] g-muted mt-1">{profile.description}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.14em] font-extrabold text-white/60">Show Games Section</p>
                <p className="text-xs g-muted mt-1">Enable the Games tab (Bloom Clicker, Flappy Bird, and Whiteboard). Default is off.</p>
              </div>
              <button
                data-on={showGamesSection}
                onClick={() => applyShowGamesSection(!showGamesSection)}
                className="g-toggle"
                aria-label="Toggle Games Section"
              />
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.14em] font-extrabold text-white/60">Animate Tab Changes</p>
                <p className="text-xs g-muted mt-1">Replay sidebar and page entrance animations on every route change. Default is off for smoother navigation.</p>
              </div>
              <button
                data-on={routeTabAnimationsEnabled}
                onClick={() => applyRouteTabAnimationsEnabled(!routeTabAnimationsEnabled)}
                className="g-toggle"
                aria-label="Toggle Route Tab Animations"
              />
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.14em] font-extrabold text-white/60">Sidebar Dock Hover</p>
                <p className="text-xs g-muted mt-1">Vertical dock animation that scales tabs around your cursor.</p>
              </div>
              <button
                data-on={sidebarDockHoverEnabled}
                onClick={() => applySidebarDockHoverEnabled(!sidebarDockHoverEnabled)}
                className="g-toggle"
                aria-label="Toggle Sidebar Dock Hover"
              />
            </div>

            <div className="mt-4 space-y-4">
              <div>
                <div className="flex items-center justify-between">
                  <p className="text-xs g-muted">Sidebar Tab Gap</p>
                  <span className="text-xs font-extrabold text-white">{sidebarTabGap}px</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={30}
                  step={1}
                  value={sidebarTabGap}
                  onChange={(event) => applySidebarTabGap(Number(event.target.value))}
                  className="w-full mt-1 g-range"
                />
              </div>

              {sidebarDockHoverEnabled && (
                <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between">
                    <p className="text-xs g-muted">Grow Size</p>
                    <span className="text-xs font-extrabold text-white">{sidebarDockGrowSize}</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={140}
                    step={1}
                    value={sidebarDockGrowSize}
                    onChange={(event) => applySidebarDockGrowSize(Number(event.target.value))}
                    className="w-full mt-1 g-range"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <p className="text-xs g-muted">Grow Speed</p>
                    <span className="text-xs font-extrabold text-white">{sidebarDockGrowSpeed} ms</span>
                  </div>
                  <input
                    type="range"
                    min={60}
                    max={450}
                    step={5}
                    value={sidebarDockGrowSpeed}
                    onChange={(event) => applySidebarDockGrowSpeed(Number(event.target.value))}
                    className="w-full mt-1 g-range"
                  />
                </div>
                </div>
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
