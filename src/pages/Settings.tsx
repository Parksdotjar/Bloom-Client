import { useEffect, useState, type ReactNode } from 'react';
import { clsx } from 'clsx';
import { checkForLauncherUpdate, downloadAndInstallLauncherUpdate, type ExternalUpdate } from '../services/updater';

type LauncherTheme = 'light' | 'light-gray' | 'dark' | 'gray' | 'true-dark' | 'ocean' | 'forest' | 'sunset' | 'paper' | 'crt' | 'synthwave' | 'sandstone' | 'minecraft' | 'cartoon' | 'strength-smp' | 'blueprint' | 'holo-grid' | 'lavaforge' | 'candy-pop' | 'mono-ink';
type AccentMode = 'purple' | 'cyan' | 'emerald' | 'amber' | 'rose' | 'rainbow';
type BackgroundMode = 'none' | 'plus' | 'particles' | 'aurora' | 'scanlines' | 'nebula';
type DensityMode = 'compact' | 'cozy' | 'spacious';
type FontPackMode = 'manrope' | 'space-grotesk' | 'sora';
type SidebarMode = 'rail' | 'classic' | 'expanded';
type SidebarPosition = 'left' | 'right' | 'top' | 'bottom';
type CardStyleMode = 'glass' | 'solid' | 'outline';
type ButtonThemeMode = 'default' | 'simple' | 'cartoon' | 'glass' | 'neon' | 'pixel' | 'brutalist' | 'pill' | 'terminal' | 'arcade';
type MotionMode = 'off' | 'subtle' | 'standard' | 'cinematic';
type MotionEasingPreset = 'out-quad' | 'out-cubic' | 'in-out-cubic' | 'out-back' | 'out-elastic' | 'linear' | 'custom';
type IconPackMode = 'default' | 'bold' | 'rounded' | 'pixel';
type SoundPackMode = 'off' | 'soft' | 'arcade' | 'retro';
type StartupSceneTheme = 'nova' | 'horizon' | 'matrix';
type StartupSceneSoundProfile = 'off' | 'shimmer' | 'impact';

type SettingsTab = 'general' | 'appearance' | 'widgets' | 'extra';

const THEME_STORAGE_KEY = 'bloom_theme_mode';
const THEME_CHANGE_EVENT = 'bloom-theme-change';
const ACCENT_STORAGE_KEY = 'bloom_accent_mode';
const ACCENT_CHANGE_EVENT = 'bloom-accent-change';
const BACKGROUND_STORAGE_KEY = 'bloom_background_mode';
const BACKGROUND_CHANGE_EVENT = 'bloom-background-change';
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
const EXTRA_CHANGE_EVENT = 'bloom-extra-change';
const SIDEBAR_DOCK_HOVER_ENABLED_KEY = 'bloom_sidebar_dock_hover_enabled';
const SIDEBAR_DOCK_GROW_SIZE_KEY = 'bloom_sidebar_dock_grow_size';
const SIDEBAR_DOCK_GROW_SPEED_KEY = 'bloom_sidebar_dock_grow_speed';
const SIDEBAR_TAB_GAP_KEY = 'bloom_sidebar_tab_gap';
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
const SOUND_PACK_KEY = 'bloom_sound_pack';
const SOUND_CLICKS_KEY = 'bloom_sound_clicks_enabled';
const SOUND_HOVERS_KEY = 'bloom_sound_hovers_enabled';
const SOUND_NOTIFICATIONS_KEY = 'bloom_sound_notifications_enabled';
const SOUND_CHANGE_EVENT = 'bloom-sound-change';
const STARTUP_SCENE_ENABLED_KEY = 'bloom_startup_scene_enabled';
const STARTUP_SCENE_THEME_KEY = 'bloom_startup_scene_theme';
const STARTUP_SCENE_SOUND_PROFILE_KEY = 'bloom_startup_scene_sound_profile';
const STARTUP_SCENE_CHANGE_EVENT = 'bloom-startup-scene-change';
const ROUTE_TAB_ANIMATIONS_KEY = 'bloom_route_tab_animations_enabled';

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

const SOUND_PACKS: { id: SoundPackMode; label: string; description: string }[] = [
  { id: 'off', label: 'Off', description: 'Disable UI sounds.' },
  { id: 'soft', label: 'Soft', description: 'Subtle clean cues.' },
  { id: 'arcade', label: 'Arcade', description: 'Bright digital sounds.' },
  { id: 'retro', label: 'Retro', description: 'Crunchier 8-bit style.' }
];

const STARTUP_SCENE_THEMES: { id: StartupSceneTheme; label: string; description: string }[] = [
  { id: 'nova', label: 'Nova', description: 'Neon burst intro.' },
  { id: 'horizon', label: 'Horizon', description: 'Sunrise gradient flow.' },
  { id: 'matrix', label: 'Matrix', description: 'Grid pulse style.' }
];

const STARTUP_SCENE_SOUND_PROFILES: { id: StartupSceneSoundProfile; label: string; description: string }[] = [
  { id: 'off', label: 'Off', description: 'Silent startup.' },
  { id: 'shimmer', label: 'Shimmer', description: 'Light rising tone.' },
  { id: 'impact', label: 'Impact', description: 'Punchier digital hit.' }
];

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

function clampGlassAmount(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function AppearanceDropdown(props: { title: string; description: string; children: ReactNode }) {
  const { title, description, children } = props;
  return (
    <details className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
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

function eventToShortcut(event: KeyboardEvent): string {
  const parts: string[] = [];
  if (event.ctrlKey) parts.push('Ctrl');
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey) parts.push('Shift');
  if (event.metaKey) parts.push('Meta');
  const rawKey = event.key.length === 1 ? event.key.toUpperCase() : event.key;
  const key = rawKey === ' ' ? 'Space' : rawKey;
  if (!['Control', 'Alt', 'Shift', 'Meta'].includes(key)) parts.push(key);
  return parts.join('+');
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

export function Settings() {
  const [tab, setTab] = useState<SettingsTab>('general');
  const [showWidgetDocker, setShowWidgetDocker] = useState<boolean>(() => localStorage.getItem(SHOW_WIDGET_DOCKER_KEY) === 'true');
  const [hideEmptyWidgetSlots, setHideEmptyWidgetSlots] = useState<boolean>(() => localStorage.getItem(HIDE_EMPTY_WIDGET_SLOTS_KEY) === 'true');
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
  const [shortcutReplayStartupScene, setShortcutReplayStartupScene] = useState<string>(() => localStorage.getItem(SHORTCUT_REPLAY_STARTUP_SCENE_KEY) || 'Ctrl+Shift+J');
  const [capturingShortcut, setCapturingShortcut] = useState<'search' | 'create' | 'settings' | 'replay-startup-scene' | null>(null);
  const [soundPack, setSoundPack] = useState<SoundPackMode>(() => {
    const stored = localStorage.getItem(SOUND_PACK_KEY);
    return stored === 'off' || stored === 'soft' || stored === 'arcade' || stored === 'retro' ? stored : 'soft';
  });
  const [soundClicksEnabled, setSoundClicksEnabled] = useState<boolean>(() => localStorage.getItem(SOUND_CLICKS_KEY) !== 'false');
  const [soundHoversEnabled, setSoundHoversEnabled] = useState<boolean>(() => localStorage.getItem(SOUND_HOVERS_KEY) === 'true');
  const [soundNotificationsEnabled, setSoundNotificationsEnabled] = useState<boolean>(() => localStorage.getItem(SOUND_NOTIFICATIONS_KEY) !== 'false');
  const [startupSceneEnabled, setStartupSceneEnabled] = useState<boolean>(() => localStorage.getItem(STARTUP_SCENE_ENABLED_KEY) !== 'false');
  const [startupSceneTheme, setStartupSceneTheme] = useState<StartupSceneTheme>(() => {
    const stored = localStorage.getItem(STARTUP_SCENE_THEME_KEY);
    return stored === 'nova' || stored === 'horizon' || stored === 'matrix' ? stored : 'nova';
  });
  const [startupSceneSoundProfile, setStartupSceneSoundProfile] = useState<StartupSceneSoundProfile>(() => {
    const stored = localStorage.getItem(STARTUP_SCENE_SOUND_PROFILE_KEY);
    return stored === 'off' || stored === 'shimmer' || stored === 'impact' ? stored : 'shimmer';
  });
  const [availableUpdate, setAvailableUpdate] = useState<ExternalUpdate | null>(null);
  const [updaterStatus, setUpdaterStatus] = useState<string>('No update check run yet.');
  const [updaterProgress, setUpdaterProgress] = useState<number | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [installingUpdate, setInstallingUpdate] = useState(false);
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
    return stored === 'none' || stored === 'plus' || stored === 'particles' || stored === 'aurora' || stored === 'scanlines' || stored === 'nebula'
      ? stored
      : 'particles';
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
    return stored === 'rail' || stored === 'classic' || stored === 'expanded' ? stored : 'classic';
  });
  const [sidebarPosition, setSidebarPosition] = useState<SidebarPosition>(() => {
    const stored = localStorage.getItem(SIDEBAR_POSITION_STORAGE_KEY);
    return stored === 'left' || stored === 'right' || stored === 'top' || stored === 'bottom' ? stored : 'left';
  });
  const [cardStyleMode, setCardStyleMode] = useState<CardStyleMode>(() => {
    const stored = localStorage.getItem(CARD_STYLE_STORAGE_KEY);
    return stored === 'glass' || stored === 'solid' || stored === 'outline' ? stored : 'glass';
  });
  const [buttonTheme, setButtonTheme] = useState<ButtonThemeMode>(() => {
    const stored = localStorage.getItem(BUTTON_THEME_STORAGE_KEY);
    return stored === 'default' || stored === 'simple' || stored === 'cartoon' || stored === 'glass' || stored === 'neon' || stored === 'pixel' || stored === 'brutalist' || stored === 'pill' || stored === 'terminal' || stored === 'arcade'
      ? stored
      : 'default';
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

  const applyShortcuts = (partial: { search?: string; create?: string; settings?: string; replayStartupScene?: string }) => {
    const nextSearch = partial.search ?? shortcutSearch;
    const nextCreate = partial.create ?? shortcutCreateInstance;
    const nextSettings = partial.settings ?? shortcutSettings;
    const nextReplayStartupScene = partial.replayStartupScene ?? shortcutReplayStartupScene;
    setShortcutSearch(nextSearch);
    setShortcutCreateInstance(nextCreate);
    setShortcutSettings(nextSettings);
    setShortcutReplayStartupScene(nextReplayStartupScene);
    localStorage.setItem(SHORTCUT_SEARCH_KEY, nextSearch);
    localStorage.setItem(SHORTCUT_CREATE_INSTANCE_KEY, nextCreate);
    localStorage.setItem(SHORTCUT_SETTINGS_KEY, nextSettings);
    localStorage.setItem(SHORTCUT_REPLAY_STARTUP_SCENE_KEY, nextReplayStartupScene);
    window.dispatchEvent(new CustomEvent(SHORTCUTS_CHANGE_EVENT, { detail: { search: nextSearch, create: nextCreate, settings: nextSettings, replayStartupScene: nextReplayStartupScene } }));
  };

  const applySound = (partial: {
    pack?: SoundPackMode;
    clicks?: boolean;
    hovers?: boolean;
    notifications?: boolean;
  }) => {
    const nextPack = partial.pack ?? soundPack;
    const nextClicks = partial.clicks ?? soundClicksEnabled;
    const nextHovers = partial.hovers ?? soundHoversEnabled;
    const nextNotifications = partial.notifications ?? soundNotificationsEnabled;
    setSoundPack(nextPack);
    setSoundClicksEnabled(nextClicks);
    setSoundHoversEnabled(nextHovers);
    setSoundNotificationsEnabled(nextNotifications);
    localStorage.setItem(SOUND_PACK_KEY, nextPack);
    localStorage.setItem(SOUND_CLICKS_KEY, nextClicks ? 'true' : 'false');
    localStorage.setItem(SOUND_HOVERS_KEY, nextHovers ? 'true' : 'false');
    localStorage.setItem(SOUND_NOTIFICATIONS_KEY, nextNotifications ? 'true' : 'false');
    window.dispatchEvent(new CustomEvent(SOUND_CHANGE_EVENT, {
      detail: { pack: nextPack, clicks: nextClicks, hovers: nextHovers, notifications: nextNotifications }
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
      const shortcut = eventToShortcut(event);
      if (!shortcut) return;
      if (capturingShortcut === 'search') applyShortcuts({ search: shortcut });
      if (capturingShortcut === 'create') applyShortcuts({ create: shortcut });
      if (capturingShortcut === 'settings') applyShortcuts({ settings: shortcut });
      if (capturingShortcut === 'replay-startup-scene') applyShortcuts({ replayStartupScene: shortcut });
      setCapturingShortcut(null);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [capturingShortcut, shortcutSearch, shortcutCreateInstance, shortcutSettings, shortcutReplayStartupScene]);

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
    routeTabAnimationsEnabled?: boolean;
    sidebarDockHoverEnabled?: boolean;
    sidebarDockGrowSize?: number;
    sidebarDockGrowSpeed?: number;
    sidebarTabGap?: number;
  }) => {
    window.dispatchEvent(
      new CustomEvent(EXTRA_CHANGE_EVENT, {
        detail: {
          showWidgetDocker: partial.showWidgetDocker ?? showWidgetDocker,
          hideEmptyWidgetSlots: partial.hideEmptyWidgetSlots ?? hideEmptyWidgetSlots,
          routeTabAnimationsEnabled: partial.routeTabAnimationsEnabled ?? routeTabAnimationsEnabled,
          sidebarDockHoverEnabled: partial.sidebarDockHoverEnabled ?? sidebarDockHoverEnabled,
          sidebarDockGrowSize: partial.sidebarDockGrowSize ?? sidebarDockGrowSize,
          sidebarDockGrowSpeed: partial.sidebarDockGrowSpeed ?? sidebarDockGrowSpeed,
          sidebarTabGap: partial.sidebarTabGap ?? sidebarTabGap
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

  const curvePath = `M 0 100 C ${motionEasingX1 * 100} ${100 - motionEasingY1 * 100}, ${motionEasingX2 * 100} ${100 - motionEasingY2 * 100}, 100 0`;
  const curveCss = `cubic-bezier(${motionEasingX1}, ${motionEasingY1}, ${motionEasingX2}, ${motionEasingY2})`;

  return (
    <div className="max-w-[1100px] mx-auto min-h-full space-y-4">
      <section className="g-panel-strong p-6">
        <p className="text-[10px] uppercase tracking-[0.2em] font-extrabold g-accent-text">Settings</p>
        <h1 className="text-5xl font-extrabold text-white mt-1">Launcher Control</h1>
        <p className="text-sm g-muted mt-1">System, visuals, and runtime defaults.</p>
      </section>

      <section className="g-panel p-1 inline-flex">
        <button onClick={() => setTab('general')} className={clsx('px-4 py-2 rounded-lg text-xs font-extrabold uppercase tracking-[0.12em]', tab === 'general' ? 'bg-white/15 text-white' : 'text-white/55')}>General</button>
        <button onClick={() => setTab('appearance')} className={clsx('px-4 py-2 rounded-lg text-xs font-extrabold uppercase tracking-[0.12em]', tab === 'appearance' ? 'bg-white/15 text-white' : 'text-white/55')}>Appearance</button>
        <button onClick={() => setTab('widgets')} className={clsx('px-4 py-2 rounded-lg text-xs font-extrabold uppercase tracking-[0.12em]', tab === 'widgets' ? 'bg-white/15 text-white' : 'text-white/55')}>Widgets</button>
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

          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
            <p className="text-xs uppercase tracking-[0.14em] font-extrabold text-white/60">Keyboard Shortcuts</p>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                <p className="text-xs font-extrabold text-white/70 uppercase tracking-[0.12em]">Search</p>
                <p className="text-[11px] g-muted mt-1">Open launcher search</p>
                <button onClick={() => setCapturingShortcut('search')} className="mt-2 g-btn h-9 w-full text-xs font-extrabold">{capturingShortcut === 'search' ? 'Press keys...' : shortcutSearch}</button>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                <p className="text-xs font-extrabold text-white/70 uppercase tracking-[0.12em]">Create Instance</p>
                <p className="text-[11px] g-muted mt-1">Open create flow directly</p>
                <button onClick={() => setCapturingShortcut('create')} className="mt-2 g-btn h-9 w-full text-xs font-extrabold">{capturingShortcut === 'create' ? 'Press keys...' : shortcutCreateInstance}</button>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                <p className="text-xs font-extrabold text-white/70 uppercase tracking-[0.12em]">Settings</p>
                <p className="text-[11px] g-muted mt-1">Jump to settings page</p>
                <button onClick={() => setCapturingShortcut('settings')} className="mt-2 g-btn h-9 w-full text-xs font-extrabold">{capturingShortcut === 'settings' ? 'Press keys...' : shortcutSettings}</button>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                <p className="text-xs font-extrabold text-white/70 uppercase tracking-[0.12em]">Replay Startup Scene</p>
                <p className="text-[11px] g-muted mt-1">Play splash intro again</p>
                <button onClick={() => setCapturingShortcut('replay-startup-scene')} className="mt-2 g-btn h-9 w-full text-xs font-extrabold">{capturingShortcut === 'replay-startup-scene' ? 'Press keys...' : shortcutReplayStartupScene}</button>
              </div>
            </div>
          </div>
        </section>
      ) : tab === 'appearance' ? (
        <section className="g-panel p-6 space-y-6">
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

          <AppearanceDropdown title="Background" description="Pick animated/background texture style.">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {([
                { id: 'none', label: 'None', preview: 'var(--g-bg)', size: 'auto' },
                { id: 'plus', label: 'Plus', preview: 'radial-gradient(circle at 1px 1px, color-mix(in srgb, var(--g-accent) 34%, transparent) 1px, transparent 0)', size: '18px 18px' },
                { id: 'particles', label: 'Particles', preview: 'radial-gradient(circle at 25% 35%, color-mix(in srgb, var(--g-accent) 60%, transparent), transparent 55%), radial-gradient(circle at 70% 60%, color-mix(in srgb, var(--g-accent) 42%, #ffffff 10%), transparent 58%)', size: 'auto' },
                { id: 'aurora', label: 'Aurora', preview: 'radial-gradient(120% 100% at 20% 20%, color-mix(in srgb, var(--g-accent) 40%, transparent), transparent 62%), radial-gradient(120% 100% at 80% 80%, color-mix(in srgb, var(--g-accent) 24%, #39d682 26%), transparent 65%)', size: 'auto' },
                { id: 'scanlines', label: 'Scanlines', preview: 'linear-gradient(to bottom, rgba(255,255,255,0.07) 1px, transparent 1px), linear-gradient(to right, color-mix(in srgb, var(--g-accent) 18%, transparent) 1px, transparent 1px)', size: '100% 4px, 18px 18px' },
                { id: 'nebula', label: 'Nebula', preview: 'radial-gradient(100% 100% at 20% 70%, color-mix(in srgb, var(--g-accent) 45%, transparent), transparent 70%), radial-gradient(80% 80% at 70% 30%, color-mix(in srgb, var(--g-accent) 35%, #ffffff 8%), transparent 72%)', size: 'auto' }
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
          </AppearanceDropdown>

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
      ) : (
        <section className="g-panel p-6 space-y-4">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
            <p className="text-xs uppercase tracking-[0.14em] font-extrabold text-white/60">App Updates</p>
            <p className="text-xs g-muted">{updaterStatus}</p>
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
            <p className="text-[10px] g-muted">Publishes are pulled from the latest GitHub Release installer asset (`*-setup.exe` or `.msi`).</p>
          </div>

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

          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
            <p className="text-xs uppercase tracking-[0.14em] font-extrabold text-white/60">UI Sound Pack</p>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
              {SOUND_PACKS.map((pack) => (
                <button key={pack.id} onClick={() => applySound({ pack: pack.id })} className={clsx('rounded-lg border p-2 text-left', soundPack === pack.id ? 'g-btn-accent' : 'border-white/10 bg-white/[0.03]')}>
                  <p className="text-xs font-extrabold text-white uppercase tracking-[0.12em]">{pack.label}</p>
                  <p className="text-[10px] g-muted mt-1">{pack.description}</p>
                </button>
              ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <button onClick={() => applySound({ clicks: !soundClicksEnabled })} className="g-btn w-full h-10 rounded-lg px-3 inline-flex items-center justify-between text-xs font-extrabold uppercase tracking-[0.12em]">
                Clicks <span>{soundClicksEnabled ? 'On' : 'Off'}</span>
              </button>
              <button onClick={() => applySound({ hovers: !soundHoversEnabled })} className="g-btn w-full h-10 rounded-lg px-3 inline-flex items-center justify-between text-xs font-extrabold uppercase tracking-[0.12em]">
                Hovers <span>{soundHoversEnabled ? 'On' : 'Off'}</span>
              </button>
              <button onClick={() => applySound({ notifications: !soundNotificationsEnabled })} className="g-btn w-full h-10 rounded-lg px-3 inline-flex items-center justify-between text-xs font-extrabold uppercase tracking-[0.12em]">
                Notifications <span>{soundNotificationsEnabled ? 'On' : 'Off'}</span>
              </button>
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
