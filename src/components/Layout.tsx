import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Bell, Camera, Gift, Layers, Maximize2, Minus, Move, Palette, Search, Send, Sparkles, User, Waves, X } from 'lucide-react';
import { clsx } from 'clsx';
import { animate, engine, remove, set } from 'animejs';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { SidebarRail } from './SidebarRail';
import { BloomConsole } from './BloomConsole';
import { useAuth } from '../hooks/useAuth';
import { useInstances } from '../hooks/useInstances';
import { useDownloader } from '../hooks/useDownloader';
import { APP_VERSION } from '../constants/version';
import { setDiscordPresence } from '../services/presence';
import { TauriApi, type Instance } from '../services/tauri';
import {
  checkForLauncherUpdate,
  downloadAndInstallLauncherUpdate,
  readUpdatePreferences,
  UPDATE_SETTINGS_CHANGE_EVENT,
  type ExternalUpdate,
  type UpdatePreferences
} from '../services/updater';
import splashGif from '../assets/splash.gif';
import {
  MOTION_ANIM_DURATION_KEY,
  MOTION_EASING_PRESET_KEY,
  MOTION_EASING_X1_KEY,
  MOTION_EASING_X2_KEY,
  MOTION_EASING_Y1_KEY,
  MOTION_EASING_Y2_KEY,
  MOTION_FADE_DURATION_KEY,
  MOTION_OFFSET_X_KEY,
  MOTION_OFFSET_Y_KEY,
  MOTION_STAGGER_KEY,
  MOTION_TUNING_DEFAULTS,
  MOTION_TUNING_EVENT,
  clampMotionTuning,
  resolveMotionEase
} from '../constants/motion';
import {
  CONSOLE_HOTKEY_DEFAULT,
  CONSOLE_LOG_LEVEL_KEY,
  CONSOLE_SETTINGS_CHANGE_EVENT,
  CONSOLE_SHOW_DEV_COMMANDS_KEY,
  SHORTCUT_CONSOLE_KEY,
  type ConsoleLogLevel
} from '../constants/console';
import { CONSOLE_MODULES, CONSOLE_THEMES, createConsoleRegistry } from '../console/registry';
import {
  HOST_SERVERS_UNLOCK_EVENT,
  HOST_SERVERS_UNLOCK_KEY,
  readHostServersUnlocked,
  setHostServersUnlocked as writeHostServersUnlocked
} from '../constants/hostServerAccess';

const Particles = lazy(() => import('./Particles').then((module) => ({ default: module.Particles })));

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
type IconPackMode = 'default' | 'bold' | 'rounded' | 'pixel';
type SoundPackMode = 'off' | 'soft' | 'arcade' | 'retro';
type StartupSceneTheme = 'nova' | 'horizon' | 'matrix';
type StartupSceneSoundProfile = 'off' | 'shimmer' | 'impact';

type SearchEntry = {
  id: string;
  label: string;
  description: string;
  route?: string;
  action?: 'signin';
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
const ACCOUNT_LAUNCH_INSTANCE_KEY = 'bloom_account_quick_launch_instance';
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
const EXTRA_KEYBINDS_STORAGE_KEY = 'bloom_extra_keybinds';
const KEYBIND_ACTION_EVENT = 'bloom-keybind-action';
const SHOW_WIDGET_DOCKER_KEY = 'bloom_show_widget_docker';
const HIDE_EMPTY_WIDGET_SLOTS_KEY = 'bloom_hide_empty_widget_slots';
const SHOW_GAMES_SECTION_KEY = 'bloom_show_games_section';
const SOUND_PACK_KEY = 'bloom_sound_pack';
const SOUND_CLICKS_KEY = 'bloom_sound_clicks_enabled';
const SOUND_HOVERS_KEY = 'bloom_sound_hovers_enabled';
const SOUND_NOTIFICATIONS_KEY = 'bloom_sound_notifications_enabled';
const SOUND_CHANGE_EVENT = 'bloom-sound-change';
const STARTUP_SCENE_ENABLED_KEY = 'bloom_startup_scene_enabled';
const STARTUP_SCENE_THEME_KEY = 'bloom_startup_scene_theme';
const STARTUP_SCENE_SOUND_PROFILE_KEY = 'bloom_startup_scene_sound_profile';
const STARTUP_SCENE_CHANGE_EVENT = 'bloom-startup-scene-change';
const STARTUP_SCENE_AUTOPLAY_SESSION_KEY = 'bloom_startup_scene_autoplay_done';
const MODS_REFRESH_EVENT = 'bloom-refresh-mods';
const ONBOARDING_DONE_PREFIX = 'bloom_onboarding_done_';
const ROUTE_TAB_ANIMATIONS_KEY = 'bloom_route_tab_animations_enabled';

const ACCENT_MAP: Record<AccentMode, { accent: string; soft: string; gradient: string }> = {
  purple: { accent: '#9a65ff', soft: 'rgba(154, 101, 255, 0.26)', gradient: 'linear-gradient(90deg, #8f58ff 0%, #ba96ff 100%)' },
  cyan: { accent: '#55d6ff', soft: 'rgba(85, 214, 255, 0.24)', gradient: 'linear-gradient(90deg, #3bc8ff 0%, #90e9ff 100%)' },
  emerald: { accent: '#3adf8f', soft: 'rgba(58, 223, 143, 0.24)', gradient: 'linear-gradient(90deg, #28cf7d 0%, #89f4bd 100%)' },
  amber: { accent: '#ffbe4a', soft: 'rgba(255, 190, 74, 0.25)', gradient: 'linear-gradient(90deg, #ffad2f 0%, #ffd57f 100%)' },
  rose: { accent: '#ff6e9a', soft: 'rgba(255, 110, 154, 0.24)', gradient: 'linear-gradient(90deg, #ff5c89 0%, #ff9cb7 100%)' },
  rainbow: { accent: '#ff76d7', soft: 'rgba(255, 118, 215, 0.24)', gradient: 'linear-gradient(90deg, #ff5f6d 0%, #ffc371 24%, #47e0ff 50%, #60ff9f 74%, #b57bff 100%)' }
};

const DENSITY_MAP: Record<DensityMode, { fontScale: string; headerHeight: number; mainPadding: string }> = {
  compact: { fontScale: '0.93', headerHeight: 62, mainPadding: '12px' },
  cozy: { fontScale: '1', headerHeight: 70, mainPadding: '20px' },
  spacious: { fontScale: '1.08', headerHeight: 78, mainPadding: '28px' }
};

const FONT_MAP: Record<FontPackMode, { family: string; headingWeight: string }> = {
  manrope: { family: "'Manrope', sans-serif", headingWeight: '800' },
  'space-grotesk': { family: "'Space Grotesk', sans-serif", headingWeight: '700' },
  sora: { family: "'Sora', sans-serif", headingWeight: '800' }
};

const MOTION_MAP: Record<MotionMode, { fps: number; durationScale: string }> = {
  off: { fps: 1, durationScale: '0' },
  subtle: { fps: 10, durationScale: '0.7' },
  standard: { fps: 14, durationScale: '1' },
  cinematic: { fps: 18, durationScale: '1.25' }
};

const ONBOARDING_THEME_OPTIONS: { id: LauncherTheme; label: string; hint: string }[] = [
  { id: 'gray', label: 'Gray', hint: 'Desaturated graphite palette' },
  { id: 'true-dark', label: 'True Dark', hint: 'OLED-friendly blackout' },
  { id: 'ocean', label: 'Ocean', hint: 'Blue-cyan neon vibe' }
];

const ONBOARDING_ACCENT_OPTIONS: { id: AccentMode; label: string; swatch: string }[] = [
  { id: 'purple', label: 'Purple', swatch: 'linear-gradient(90deg,#8f58ff,#ba96ff)' },
  { id: 'cyan', label: 'Cyan', swatch: 'linear-gradient(90deg,#3bc8ff,#90e9ff)' },
  { id: 'emerald', label: 'Emerald', swatch: 'linear-gradient(90deg,#28cf7d,#89f4bd)' },
  { id: 'amber', label: 'Amber', swatch: 'linear-gradient(90deg,#ffad2f,#ffd57f)' },
  { id: 'rose', label: 'Rose', swatch: 'linear-gradient(90deg,#ff5c89,#ff9cb7)' },
  { id: 'rainbow', label: 'Rainbow', swatch: 'linear-gradient(90deg,#ff5f6d,#ffc371,#47e0ff,#60ff9f,#b57bff)' }
];

function normalizeShortcut(text: string): string {
  return text
    .split('+')
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
    .join('+');
}

function eventToShortcut(event: KeyboardEvent): string {
  const parts: string[] = [];
  if (event.ctrlKey) parts.push('ctrl');
  if (event.altKey) parts.push('alt');
  if (event.shiftKey) parts.push('shift');
  if (event.metaKey) parts.push('meta');
  let key = event.key.length === 1 ? event.key.toLowerCase() : event.key.toLowerCase();
  if (key === ' ') key = 'space';
  if (!['control', 'alt', 'shift', 'meta'].includes(key)) parts.push(key);
  return parts.join('+');
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function isTypingTarget(target: EventTarget | null): boolean {
  const node = target as HTMLElement | null;
  if (!node) return false;
  const tag = node.tagName?.toLowerCase();
  return tag === 'input' || tag === 'textarea' || node.isContentEditable;
}

function readConsoleBool(key: string, fallback: boolean) {
  const raw = localStorage.getItem(key);
  if (raw === null) return fallback;
  return raw !== 'false';
}

export function Layout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();

  const [themeMode, setThemeMode] = useState<LauncherTheme>(() => {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'light' || stored === 'light-gray') return 'true-dark';
    return stored === 'light' || stored === 'light-gray' || stored === 'dark' || stored === 'gray' || stored === 'true-dark' || stored === 'ocean' || stored === 'forest' || stored === 'sunset' || stored === 'paper' || stored === 'crt' || stored === 'synthwave' || stored === 'sandstone' || stored === 'minecraft' || stored === 'cartoon' || stored === 'strength-smp' || stored === 'blueprint' || stored === 'holo-grid' || stored === 'lavaforge' || stored === 'candy-pop' || stored === 'mono-ink'
      ? stored
      : 'dark';
  });
  const [uiAssetPixelLevel, setUiAssetPixelLevel] = useState<number>(() => {
    const stored = Number(localStorage.getItem(UI_ASSET_PIXEL_LEVEL_KEY));
    if (Number.isFinite(stored)) return Math.max(0, Math.min(5, Math.round(stored)));
    return 0;
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
  const [customBackgroundDataUrl, setCustomBackgroundDataUrl] = useState<string | null>(null);
  const [backgroundVisualOpacity, setBackgroundVisualOpacity] = useState<number>(() => {
    const stored = Number(localStorage.getItem(BACKGROUND_VISUAL_OPACITY_KEY));
    if (Number.isFinite(stored)) return clampPercent(stored);
    return 100;
  });
  const [taskbarSurfaceOpacity, setTaskbarSurfaceOpacity] = useState<number>(() => {
    const stored = Number(localStorage.getItem(TASKBAR_SURFACE_OPACITY_KEY));
    if (Number.isFinite(stored)) return clampPercent(stored);
    return 92;
  });
  const [dropdownOpacity, setDropdownOpacity] = useState<number>(() => {
    const stored = Number(localStorage.getItem(DROPDOWN_OPACITY_KEY));
    if (Number.isFinite(stored)) return clampPercent(stored);
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
  const [taskbarLogoBackgroundMode, setTaskbarLogoBackgroundMode] = useState<TaskbarLogoBackgroundMode>(() => {
    const stored = localStorage.getItem(TASKBAR_LOGO_BACKGROUND_KEY);
    return stored === 'default' || stored === 'discord' || stored === 'accent' || stored === 'glass' || stored === 'none' ? stored : 'default';
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
  const [motionTuning, setMotionTuning] = useState(() =>
    clampMotionTuning({
      animDurationMs: Number(localStorage.getItem(MOTION_ANIM_DURATION_KEY) ?? MOTION_TUNING_DEFAULTS.animDurationMs),
      fadeDurationMs: Number(localStorage.getItem(MOTION_FADE_DURATION_KEY) ?? MOTION_TUNING_DEFAULTS.fadeDurationMs),
      staggerMs: Number(localStorage.getItem(MOTION_STAGGER_KEY) ?? MOTION_TUNING_DEFAULTS.staggerMs),
      offsetX: Number(localStorage.getItem(MOTION_OFFSET_X_KEY) ?? MOTION_TUNING_DEFAULTS.offsetX),
      offsetY: Number(localStorage.getItem(MOTION_OFFSET_Y_KEY) ?? MOTION_TUNING_DEFAULTS.offsetY),
      easingPreset: (localStorage.getItem(MOTION_EASING_PRESET_KEY) as typeof MOTION_TUNING_DEFAULTS.easingPreset) ?? MOTION_TUNING_DEFAULTS.easingPreset,
      easingX1: Number(localStorage.getItem(MOTION_EASING_X1_KEY) ?? MOTION_TUNING_DEFAULTS.easingX1),
      easingY1: Number(localStorage.getItem(MOTION_EASING_Y1_KEY) ?? MOTION_TUNING_DEFAULTS.easingY1),
      easingX2: Number(localStorage.getItem(MOTION_EASING_X2_KEY) ?? MOTION_TUNING_DEFAULTS.easingX2),
      easingY2: Number(localStorage.getItem(MOTION_EASING_Y2_KEY) ?? MOTION_TUNING_DEFAULTS.easingY2)
    })
  );
  const [routeTabAnimationsEnabled, setRouteTabAnimationsEnabled] = useState<boolean>(() => localStorage.getItem(ROUTE_TAB_ANIMATIONS_KEY) === 'true');
  const [showGamesSection, setShowGamesSection] = useState<boolean>(() => localStorage.getItem(SHOW_GAMES_SECTION_KEY) === 'true');
  const [isMaximized, setIsMaximized] = useState(false);
  const [iconPack, setIconPack] = useState<IconPackMode>(() => {
    const stored = localStorage.getItem(ICON_PACK_KEY);
    return stored === 'default' || stored === 'bold' || stored === 'rounded' || stored === 'pixel' ? stored : 'default';
  });
  const [roundnessLevel, setRoundnessLevel] = useState<number>(() => {
    const stored = Number(localStorage.getItem(ROUNDNESS_KEY));
    if (Number.isFinite(stored)) return Math.max(0, Math.min(100, Math.round(stored)));
    return 50;
  });
  const [buttonRoundnessLevel, setButtonRoundnessLevel] = useState<number>(() => {
    const stored = Number(localStorage.getItem(BUTTON_ROUNDNESS_KEY));
    if (Number.isFinite(stored)) return Math.max(0, Math.min(100, Math.round(stored)));
    return 100;
  });
  const [glassAmount, setGlassAmount] = useState<number>(() => {
    const stored = Number(localStorage.getItem(GLASS_AMOUNT_KEY));
    if (Number.isFinite(stored)) return Math.max(0, Math.min(100, Math.round(stored)));
    return 70;
  });
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
  const [startupBlackHoldVisible, setStartupBlackHoldVisible] = useState(false);
  const [startupSceneVisible, setStartupSceneVisible] = useState(false);
  const [startupSceneFadingOut, setStartupSceneFadingOut] = useState(false);
  const [startupSceneRunId, setStartupSceneRunId] = useState(0);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [showInternalConsoleCommands, setShowInternalConsoleCommands] = useState<boolean>(() => readConsoleBool(CONSOLE_SHOW_DEV_COMMANDS_KEY, false));
  const [hostServersUnlocked, setHostServersUnlocked] = useState<boolean>(() => readHostServersUnlocked());
  const [consoleLogLevel, setConsoleLogLevel] = useState<ConsoleLogLevel>(() => {
    const stored = localStorage.getItem(CONSOLE_LOG_LEVEL_KEY);
    return stored === 'error' || stored === 'warn' || stored === 'info' || stored === 'debug' ? stored : 'info';
  });
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [updatePreferences, setUpdatePreferences] = useState<UpdatePreferences>(() => readUpdatePreferences());
  const [availableLauncherUpdate, setAvailableLauncherUpdate] = useState<ExternalUpdate | null>(null);
  const [updateNoticeVisible, setUpdateNoticeVisible] = useState(false);
  const [updateStatusMessage, setUpdateStatusMessage] = useState<string | null>(null);
  const [checkingLauncherUpdate, setCheckingLauncherUpdate] = useState(false);
  const [installingLauncherUpdate, setInstallingLauncherUpdate] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [avatarContextMenu, setAvatarContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [skinStatus, setSkinStatus] = useState<string | null>(null);
  const [quickLaunchInstanceId, setQuickLaunchInstanceId] = useState<string>(() => localStorage.getItem(ACCOUNT_LAUNCH_INSTANCE_KEY) || '');
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState<0 | 1 | 2 | 3 | 4>(0);
  const [onboardingCompleted, setOnboardingCompleted] = useState(false);
  const [onboardingExitActive, setOnboardingExitActive] = useState(false);
  const [appBlackoutPhase, setAppBlackoutPhase] = useState<'idle' | 'fade-in' | 'hold' | 'fade-out'>('idle');
  const [appRevealActive, setAppRevealActive] = useState(false);

  const searchRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const notifRef = useRef<HTMLDivElement | null>(null);
  const accountRef = useRef<HTMLDivElement | null>(null);
  const profileUploadRef = useRef<HTMLInputElement | null>(null);
  const onboardingProfileUploadRef = useRef<HTMLInputElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const mainRef = useRef<HTMLElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const lastHoverSoundAtRef = useRef<number>(0);
  const appRevealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const appBlackoutTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const {
    authState,
    profileAvatarUrl,
    deviceCode,
    loading,
    error,
    authDebug,
    startLogin,
    openLoginInBrowser,
    cancelLogin,
    dismissAuthOverlay,
    clearError,
    logout,
    setProfileAvatar,
    clearProfileAvatar
  } = useAuth();
  const { instances, loadInstances, createInstance, updateInstance, deleteInstance } = useInstances();
  const { startDownload } = useDownloader();

  const entries: SearchEntry[] = useMemo(() => {
    const base: SearchEntry[] = [
      { id: 'home', label: 'Home', description: 'Launcher overview', route: '/' },
      { id: 'instances', label: 'Instances', description: 'Create and edit instances', route: '/instances' },
      { id: 'marketplace', label: 'Marketplace', description: 'Install modpacks, mods, and resource packs', route: '/marketplace' },
      { id: 'importer', label: 'Importer', description: 'Create instances from Modrinth packs or local archives', route: '/importer' },
      { id: 'widgets', label: 'Widgets', description: 'Manage per-page widgets and visibility', route: '/widgets' },
      { id: 'script-studio', label: 'Script Studio', description: 'IDE-style BloomScript editor and runtime', route: '/script-studio' },
      { id: 'settings', label: 'Settings', description: 'Theme and launcher options', route: '/settings' }
    ];
    if (hostServersUnlocked) {
      base.splice(6, 0, { id: 'host-server', label: 'Host Server', description: 'Run and manage local multiplayer servers', route: '/host-server' });
    }
    if (showGamesSection) {
      base.splice(5, 0, { id: 'games', label: 'Games', description: 'Play Bloom Clicker, Flappy Bird, and Whiteboard', route: '/games' });
    }
    if (!authState) base.push({ id: 'signin', label: 'Sign In', description: 'Connect Microsoft account', action: 'signin' });
    return base;
  }, [authState, hostServersUnlocked, showGamesSection]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((entry) => `${entry.label} ${entry.description}`.toLowerCase().includes(q));
  }, [searchQuery, entries]);

  const authCode = deviceCode?.userCode || authDebug.activeUserCode;
  const authLink = deviceCode?.verificationUriComplete || deviceCode?.verificationUri || 'https://www.microsoft.com/link';
  const authFlowActive = loading || authDebug.phase === 'requesting_code' || authDebug.phase === 'awaiting_approval' || authDebug.phase === 'polling' || !!authCode;
  const displayAvatar = authState
    ? profileAvatarUrl || authState.profile.skinUrl || `https://crafatar.com/avatars/${authState.profile.id}?size=72&default=MHF_Steve`
    : null;
  const quickLaunchInstance = instances.find((inst) => inst.id === quickLaunchInstanceId) || instances[0] || null;
  const onboardingDoneKey = authState ? `${ONBOARDING_DONE_PREFIX}${authState.profile.id}` : null;

  useEffect(() => {
    if (instances.length === 0) {
      setQuickLaunchInstanceId('');
      localStorage.removeItem(ACCOUNT_LAUNCH_INSTANCE_KEY);
      return;
    }

    const stillExists = instances.some((inst) => inst.id === quickLaunchInstanceId);
    if (!stillExists) {
      const next = instances[0].id;
      setQuickLaunchInstanceId(next);
      localStorage.setItem(ACCOUNT_LAUNCH_INSTANCE_KEY, next);
      return;
    }

    localStorage.setItem(ACCOUNT_LAUNCH_INSTANCE_KEY, quickLaunchInstanceId);
  }, [instances, quickLaunchInstanceId]);

  useEffect(() => {
    if (!authState) {
      setOnboardingCompleted(false);
      setOnboardingOpen(true);
      setOnboardingExitActive(false);
      setAppBlackoutPhase('idle');
      setAppRevealActive(false);
      setOnboardingStep(0);
      return;
    }

    if (!onboardingDoneKey) {
      setOnboardingCompleted(false);
      setOnboardingOpen(true);
      setOnboardingStep(1);
      return;
    }

    const completed = localStorage.getItem(onboardingDoneKey) === 'true';
    setOnboardingCompleted(completed);

    if (!completed) {
      setOnboardingOpen(true);
      setOnboardingExitActive(false);
      setAppBlackoutPhase('idle');
      setAppRevealActive(false);
      setOnboardingStep(1);
      return;
    }

    setOnboardingOpen(false);
    setOnboardingStep(1);
    setOnboardingExitActive(false);
    setAppBlackoutPhase('idle');
  }, [authState?.profile.id, onboardingDoneKey]);

  useEffect(() => {
    if (authState && onboardingOpen && onboardingStep === 0) {
      setOnboardingStep(1);
    }
  }, [authState, onboardingOpen, onboardingStep]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', themeMode);
    if (themeMode === 'light' || themeMode === 'light-gray' || themeMode === 'paper' || themeMode === 'sandstone' || themeMode === 'cartoon' || themeMode === 'candy-pop' || themeMode === 'mono-ink') document.documentElement.classList.remove('dark');
    else document.documentElement.classList.add('dark');
    localStorage.setItem(THEME_STORAGE_KEY, themeMode);
  }, [themeMode]);

  useEffect(() => {
    const clamped = Math.max(0, Math.min(5, Math.round(uiAssetPixelLevel)));
    document.documentElement.style.setProperty('--g-ui-pixel-level', String(clamped));
    document.documentElement.setAttribute('data-ui-pixel', String(clamped));
    localStorage.setItem(UI_ASSET_PIXEL_LEVEL_KEY, String(clamped));
  }, [uiAssetPixelLevel]);

  useEffect(() => {
    document.documentElement.setAttribute('data-icon-pack', iconPack);
    localStorage.setItem(ICON_PACK_KEY, iconPack);
  }, [iconPack]);

  useEffect(() => {
    const clamped = Math.max(0, Math.min(100, Math.round(roundnessLevel)));
    const roundnessMult = clamped / 100;
    document.documentElement.style.setProperty('--g-roundness-mult', String(roundnessMult));
    localStorage.setItem(ROUNDNESS_KEY, String(clamped));
  }, [roundnessLevel]);

  useEffect(() => {
    const clamped = Math.max(0, Math.min(100, Math.round(buttonRoundnessLevel)));
    document.documentElement.style.setProperty('--g-btn-roundness-mult', String(clamped / 100));
    localStorage.setItem(BUTTON_ROUNDNESS_KEY, String(clamped));
  }, [buttonRoundnessLevel]);

  useEffect(() => {
    const clamped = Math.max(0, Math.min(100, Math.round(glassAmount)));
    const blurMult = 0.25 + (clamped / 100) * 1.35;
    const opacityMult = 0.2 + (clamped / 100) * 0.8;
    document.documentElement.style.setProperty('--g-glass-blur-mult', String(blurMult));
    document.documentElement.style.setProperty('--g-glass-opacity-mult', String(opacityMult));
    localStorage.setItem(GLASS_AMOUNT_KEY, String(clamped));
  }, [glassAmount]);

  useEffect(() => {
    const clamped = Math.max(0, Math.min(100, Math.round(dropdownOpacity)));
    document.documentElement.style.setProperty('--g-dropdown-opacity', `${clamped}%`);
    document.documentElement.setAttribute('data-dropdown-opacity', String(clamped));
    localStorage.setItem(DROPDOWN_OPACITY_KEY, String(clamped));
  }, [dropdownOpacity]);

  useEffect(() => {
    const accent = ACCENT_MAP[accentMode] || ACCENT_MAP.purple;
    document.documentElement.style.setProperty('--g-accent', accent.accent);
    document.documentElement.style.setProperty('--g-accent-soft', accent.soft);
    document.documentElement.style.setProperty('--g-accent-gradient', accent.gradient);
    localStorage.setItem(ACCENT_STORAGE_KEY, accentMode);
  }, [accentMode]);

  useEffect(() => {
    document.documentElement.setAttribute('data-background', backgroundMode);
    localStorage.setItem(BACKGROUND_STORAGE_KEY, backgroundMode);
  }, [backgroundMode]);

  useEffect(() => {
    const density = DENSITY_MAP[densityMode] || DENSITY_MAP.cozy;
    document.documentElement.style.setProperty('--g-font-scale', density.fontScale);
    localStorage.setItem(DENSITY_STORAGE_KEY, densityMode);
  }, [densityMode]);

  useEffect(() => {
    const font = FONT_MAP[fontPackMode] || FONT_MAP.manrope;
    document.documentElement.style.setProperty('--g-font-family', font.family);
    document.documentElement.style.setProperty('--g-heading-weight', font.headingWeight);
    localStorage.setItem(FONT_STORAGE_KEY, fontPackMode);
  }, [fontPackMode]);

  useEffect(() => {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, sidebarMode);
  }, [sidebarMode]);

  useEffect(() => {
    localStorage.setItem(SIDEBAR_POSITION_STORAGE_KEY, sidebarPosition);
  }, [sidebarPosition]);

  useEffect(() => {
    document.documentElement.setAttribute('data-card-style', cardStyleMode);
    localStorage.setItem(CARD_STYLE_STORAGE_KEY, cardStyleMode);
  }, [cardStyleMode]);

  useEffect(() => {
    const root = document.documentElement;
    const styles =
      taskbarLogoBackgroundMode === 'discord'
        ? {
            background: 'linear-gradient(180deg, rgba(47,49,54,0.98), rgba(32,34,37,0.98))',
            border: 'rgba(255,255,255,0.06)',
            shadow: '0 10px 26px rgba(0,0,0,0.35)'
          }
        : taskbarLogoBackgroundMode === 'accent'
          ? {
              background: 'var(--g-accent-gradient)',
              border: 'color-mix(in srgb, var(--g-accent) 62%, white 18%)',
              shadow: '0 10px 24px color-mix(in srgb, var(--g-accent) 28%, transparent)'
            }
          : taskbarLogoBackgroundMode === 'glass'
            ? {
                background: 'linear-gradient(180deg, rgba(255,255,255,0.16), rgba(255,255,255,0.05))',
                border: 'rgba(255,255,255,0.18)',
                shadow: '0 8px 22px rgba(0,0,0,0.22)'
              }
            : taskbarLogoBackgroundMode === 'none'
              ? {
                  background: 'transparent',
                  border: 'transparent',
                  shadow: 'none'
                }
              : {
                  background: 'color-mix(in srgb, white 5%, transparent)',
                  border: 'rgba(255,255,255,0.15)',
                  shadow: 'none'
                };
    root.style.setProperty('--g-taskbar-logo-bg', styles.background);
    root.style.setProperty('--g-taskbar-logo-border', styles.border);
    root.style.setProperty('--g-taskbar-logo-shadow', styles.shadow);
    localStorage.setItem(TASKBAR_LOGO_BACKGROUND_KEY, taskbarLogoBackgroundMode);
  }, [taskbarLogoBackgroundMode]);

  useEffect(() => {
    document.documentElement.setAttribute('data-button-theme', buttonTheme);
    localStorage.setItem(BUTTON_THEME_STORAGE_KEY, buttonTheme);
  }, [buttonTheme]);

  useEffect(() => {
    engine.defaults.frameRate = motionFps;
    localStorage.setItem(MOTION_FPS_STORAGE_KEY, String(motionFps));
  }, [motionFps]);

  useEffect(() => {
    const motion = MOTION_MAP[motionMode] || MOTION_MAP.standard;
    document.documentElement.style.setProperty('--g-motion-scale', motion.durationScale);
    localStorage.setItem(MOTION_STORAGE_KEY, motionMode);
  }, [motionMode]);

  useEffect(() => {
    const onThemeChange = (event: Event) => {
      const custom = event as CustomEvent<{ theme?: LauncherTheme }>;
      const requestedTheme = custom.detail?.theme;
      if (requestedTheme === 'light' || requestedTheme === 'light-gray' || requestedTheme === 'dark' || requestedTheme === 'gray' || requestedTheme === 'true-dark' || requestedTheme === 'ocean' || requestedTheme === 'forest' || requestedTheme === 'sunset' || requestedTheme === 'paper' || requestedTheme === 'crt' || requestedTheme === 'synthwave' || requestedTheme === 'sandstone' || requestedTheme === 'minecraft' || requestedTheme === 'cartoon' || requestedTheme === 'strength-smp' || requestedTheme === 'blueprint' || requestedTheme === 'holo-grid' || requestedTheme === 'lavaforge' || requestedTheme === 'candy-pop' || requestedTheme === 'mono-ink') {
        setThemeMode(requestedTheme);
      }
    };

    window.addEventListener(THEME_CHANGE_EVENT, onThemeChange as EventListener);
    return () => window.removeEventListener(THEME_CHANGE_EVENT, onThemeChange as EventListener);
  }, []);

  useEffect(() => {
    const onUiAssetPixelLevelChange = (event: Event) => {
      const custom = event as CustomEvent<{ level?: number }>;
      const requested = Number(custom.detail?.level);
      if (Number.isFinite(requested)) {
        setUiAssetPixelLevel(Math.max(0, Math.min(5, Math.round(requested))));
      }
    };
    window.addEventListener(UI_ASSET_PIXEL_LEVEL_CHANGE_EVENT, onUiAssetPixelLevelChange as EventListener);
    return () => window.removeEventListener(UI_ASSET_PIXEL_LEVEL_CHANGE_EVENT, onUiAssetPixelLevelChange as EventListener);
  }, []);

  useEffect(() => {
    const onIconPackChange = (event: Event) => {
      const custom = event as CustomEvent<{ iconPack?: IconPackMode }>;
      const next = custom.detail?.iconPack;
      if (next === 'default' || next === 'bold' || next === 'rounded' || next === 'pixel') {
        setIconPack(next);
      }
    };
    window.addEventListener(ICON_PACK_CHANGE_EVENT, onIconPackChange as EventListener);
    return () => window.removeEventListener(ICON_PACK_CHANGE_EVENT, onIconPackChange as EventListener);
  }, []);

  useEffect(() => {
    const onRoundnessChange = (event: Event) => {
      const custom = event as CustomEvent<{ roundness?: number }>;
      const next = Number(custom.detail?.roundness);
      if (Number.isFinite(next)) setRoundnessLevel(Math.max(0, Math.min(100, Math.round(next))));
    };
    window.addEventListener(ROUNDNESS_CHANGE_EVENT, onRoundnessChange as EventListener);
    return () => window.removeEventListener(ROUNDNESS_CHANGE_EVENT, onRoundnessChange as EventListener);
  }, []);

  useEffect(() => {
    const onButtonRoundnessChange = (event: Event) => {
      const custom = event as CustomEvent<{ roundness?: number }>;
      const next = Number(custom.detail?.roundness);
      if (Number.isFinite(next)) setButtonRoundnessLevel(Math.max(0, Math.min(100, Math.round(next))));
    };
    window.addEventListener(BUTTON_ROUNDNESS_CHANGE_EVENT, onButtonRoundnessChange as EventListener);
    return () => window.removeEventListener(BUTTON_ROUNDNESS_CHANGE_EVENT, onButtonRoundnessChange as EventListener);
  }, []);

  useEffect(() => {
    const onGlassAmountChange = (event: Event) => {
      const custom = event as CustomEvent<{ amount?: number }>;
      const next = Number(custom.detail?.amount);
      if (Number.isFinite(next)) setGlassAmount(Math.max(0, Math.min(100, Math.round(next))));
    };
    window.addEventListener(GLASS_AMOUNT_CHANGE_EVENT, onGlassAmountChange as EventListener);
    return () => window.removeEventListener(GLASS_AMOUNT_CHANGE_EVENT, onGlassAmountChange as EventListener);
  }, []);

  useEffect(() => {
    const onSoundChange = (event: Event) => {
      const custom = event as CustomEvent<{ pack?: SoundPackMode; clicks?: boolean; hovers?: boolean; notifications?: boolean }>;
      const nextPack = custom.detail?.pack;
      if (nextPack === 'off' || nextPack === 'soft' || nextPack === 'arcade' || nextPack === 'retro') {
        setSoundPack(nextPack);
      }
      if (typeof custom.detail?.clicks === 'boolean') setSoundClicksEnabled(custom.detail.clicks);
      if (typeof custom.detail?.hovers === 'boolean') setSoundHoversEnabled(custom.detail.hovers);
      if (typeof custom.detail?.notifications === 'boolean') setSoundNotificationsEnabled(custom.detail.notifications);
    };
    window.addEventListener(SOUND_CHANGE_EVENT, onSoundChange as EventListener);
    return () => window.removeEventListener(SOUND_CHANGE_EVENT, onSoundChange as EventListener);
  }, []);

  useEffect(() => {
    localStorage.setItem(STARTUP_SCENE_ENABLED_KEY, startupSceneEnabled ? 'true' : 'false');
    if (!startupSceneEnabled) setStartupSceneVisible(false);
  }, [startupSceneEnabled]);

  useEffect(() => {
    localStorage.setItem(STARTUP_SCENE_THEME_KEY, startupSceneTheme);
  }, [startupSceneTheme]);

  useEffect(() => {
    localStorage.setItem(STARTUP_SCENE_SOUND_PROFILE_KEY, startupSceneSoundProfile);
  }, [startupSceneSoundProfile]);

  useEffect(() => {
    const onStartupSceneChange = (event: Event) => {
      const custom = event as CustomEvent<{ enabled?: boolean; theme?: StartupSceneTheme; soundProfile?: StartupSceneSoundProfile }>;
      if (typeof custom.detail?.enabled === 'boolean') setStartupSceneEnabled(custom.detail.enabled);
      if (custom.detail?.theme === 'nova' || custom.detail?.theme === 'horizon' || custom.detail?.theme === 'matrix') {
        setStartupSceneTheme(custom.detail.theme);
      }
      if (custom.detail?.soundProfile === 'off' || custom.detail?.soundProfile === 'shimmer' || custom.detail?.soundProfile === 'impact') {
        setStartupSceneSoundProfile(custom.detail.soundProfile);
      }
    };
    window.addEventListener(STARTUP_SCENE_CHANGE_EVENT, onStartupSceneChange as EventListener);
    return () => window.removeEventListener(STARTUP_SCENE_CHANGE_EVENT, onStartupSceneChange as EventListener);
  }, []);

  useEffect(() => {
    const onAccentChange = (event: Event) => {
      const custom = event as CustomEvent<{ accent?: AccentMode }>;
      const requestedAccent = custom.detail?.accent;
      if (requestedAccent === 'purple' || requestedAccent === 'cyan' || requestedAccent === 'emerald' || requestedAccent === 'amber' || requestedAccent === 'rose' || requestedAccent === 'rainbow') {
        setAccentMode(requestedAccent);
      }
    };

    window.addEventListener(ACCENT_CHANGE_EVENT, onAccentChange as EventListener);
    return () => window.removeEventListener(ACCENT_CHANGE_EVENT, onAccentChange as EventListener);
  }, []);

  useEffect(() => {
    const onBackgroundChange = (event: Event) => {
      const custom = event as CustomEvent<{ background?: BackgroundMode; previewDataUrl?: string | null }>;
      const requestedBackground = custom.detail?.background;
      if (requestedBackground === 'none' || requestedBackground === 'plus' || requestedBackground === 'particles' || requestedBackground === 'aurora' || requestedBackground === 'scanlines' || requestedBackground === 'nebula' || requestedBackground === 'custom') {
        setBackgroundMode(requestedBackground);
      }
      if (typeof custom.detail?.previewDataUrl !== 'undefined') {
        setCustomBackgroundDataUrl(custom.detail.previewDataUrl ?? null);
      }
    };

    window.addEventListener(BACKGROUND_CHANGE_EVENT, onBackgroundChange as EventListener);
    return () => window.removeEventListener(BACKGROUND_CHANGE_EVENT, onBackgroundChange as EventListener);
  }, []);

  useEffect(() => {
    const onBackgroundOpacityChange = (event: Event) => {
      const custom = event as CustomEvent<{ value?: number }>;
      if (Number.isFinite(custom.detail?.value)) {
        setBackgroundVisualOpacity(clampPercent(Number(custom.detail?.value)));
      }
    };
    window.addEventListener(BACKGROUND_VISUAL_OPACITY_CHANGE_EVENT, onBackgroundOpacityChange as EventListener);
    return () => window.removeEventListener(BACKGROUND_VISUAL_OPACITY_CHANGE_EVENT, onBackgroundOpacityChange as EventListener);
  }, []);

  useEffect(() => {
    const onTaskbarSurfaceOpacityChange = (event: Event) => {
      const custom = event as CustomEvent<{ value?: number }>;
      if (Number.isFinite(custom.detail?.value)) {
        setTaskbarSurfaceOpacity(clampPercent(Number(custom.detail?.value)));
      }
    };
    window.addEventListener(TASKBAR_SURFACE_OPACITY_CHANGE_EVENT, onTaskbarSurfaceOpacityChange as EventListener);
    return () => window.removeEventListener(TASKBAR_SURFACE_OPACITY_CHANGE_EVENT, onTaskbarSurfaceOpacityChange as EventListener);
  }, []);

  useEffect(() => {
    const onDropdownOpacityChange = (event: Event) => {
      const custom = event as CustomEvent<{ value?: number }>;
      if (Number.isFinite(custom.detail?.value)) {
        setDropdownOpacity(clampPercent(Number(custom.detail?.value)));
      }
    };
    window.addEventListener(DROPDOWN_OPACITY_CHANGE_EVENT, onDropdownOpacityChange as EventListener);
    return () => window.removeEventListener(DROPDOWN_OPACITY_CHANGE_EVENT, onDropdownOpacityChange as EventListener);
  }, []);

  useEffect(() => {
    if (backgroundMode !== 'custom') return;
    let active = true;
    void TauriApi.launcherBackgroundLoad()
      .then((dataUrl) => {
        if (active) setCustomBackgroundDataUrl(dataUrl);
      })
      .catch(() => {
        if (active) setCustomBackgroundDataUrl(null);
      });
    return () => {
      active = false;
    };
  }, [backgroundMode]);

  useEffect(() => {
    const onDensityChange = (event: Event) => {
      const custom = event as CustomEvent<{ density?: DensityMode }>;
      const requestedDensity = custom.detail?.density;
      if (requestedDensity === 'compact' || requestedDensity === 'cozy' || requestedDensity === 'spacious') {
        setDensityMode(requestedDensity);
      }
    };
    window.addEventListener(DENSITY_CHANGE_EVENT, onDensityChange as EventListener);
    return () => window.removeEventListener(DENSITY_CHANGE_EVENT, onDensityChange as EventListener);
  }, []);

  useEffect(() => {
    const onFontChange = (event: Event) => {
      const custom = event as CustomEvent<{ font?: FontPackMode }>;
      const requestedFont = custom.detail?.font;
      if (requestedFont === 'manrope' || requestedFont === 'space-grotesk' || requestedFont === 'sora') {
        setFontPackMode(requestedFont);
      }
    };
    window.addEventListener(FONT_CHANGE_EVENT, onFontChange as EventListener);
    return () => window.removeEventListener(FONT_CHANGE_EVENT, onFontChange as EventListener);
  }, []);

  useEffect(() => {
    const onSidebarChange = (event: Event) => {
      const custom = event as CustomEvent<{ sidebar?: SidebarMode }>;
      const requestedSidebar = custom.detail?.sidebar;
      if (requestedSidebar === 'rail' || requestedSidebar === 'classic' || requestedSidebar === 'expanded') {
        setSidebarMode(requestedSidebar);
      }
    };
    window.addEventListener(SIDEBAR_CHANGE_EVENT, onSidebarChange as EventListener);
    return () => window.removeEventListener(SIDEBAR_CHANGE_EVENT, onSidebarChange as EventListener);
  }, []);

  useEffect(() => {
    const onButtonThemeChange = (event: Event) => {
      const custom = event as CustomEvent<{ buttonTheme?: ButtonThemeMode }>;
      const requested = custom.detail?.buttonTheme;
      if (requested === 'default' || requested === 'simple' || requested === 'cartoon' || requested === 'glass' || requested === 'neon' || requested === 'pixel' || requested === 'brutalist' || requested === 'pill' || requested === 'terminal' || requested === 'arcade') {
        setButtonTheme(requested);
      }
    };
    window.addEventListener(BUTTON_THEME_CHANGE_EVENT, onButtonThemeChange as EventListener);
    return () => window.removeEventListener(BUTTON_THEME_CHANGE_EVENT, onButtonThemeChange as EventListener);
  }, []);

  useEffect(() => {
    const onSidebarPositionChange = (event: Event) => {
      const custom = event as CustomEvent<{ position?: SidebarPosition }>;
      const requestedPosition = custom.detail?.position;
      if (requestedPosition === 'left' || requestedPosition === 'right' || requestedPosition === 'top' || requestedPosition === 'bottom') {
        setSidebarPosition(requestedPosition);
      }
    };
    window.addEventListener(SIDEBAR_POSITION_CHANGE_EVENT, onSidebarPositionChange as EventListener);
    return () => window.removeEventListener(SIDEBAR_POSITION_CHANGE_EVENT, onSidebarPositionChange as EventListener);
  }, []);

  useEffect(() => {
    const onCardStyleChange = (event: Event) => {
      const custom = event as CustomEvent<{ cardStyle?: CardStyleMode }>;
      const requestedCardStyle = custom.detail?.cardStyle;
      if (requestedCardStyle === 'glass' || requestedCardStyle === 'solid' || requestedCardStyle === 'outline') {
        setCardStyleMode(requestedCardStyle);
      }
    };
    window.addEventListener(CARD_STYLE_CHANGE_EVENT, onCardStyleChange as EventListener);
    return () => window.removeEventListener(CARD_STYLE_CHANGE_EVENT, onCardStyleChange as EventListener);
  }, []);

  useEffect(() => {
    const onTaskbarLogoBackgroundChange = (event: Event) => {
      const custom = event as CustomEvent<{ background?: TaskbarLogoBackgroundMode }>;
      const requestedBackground = custom.detail?.background;
      if (requestedBackground === 'default' || requestedBackground === 'discord' || requestedBackground === 'accent' || requestedBackground === 'glass' || requestedBackground === 'none') {
        setTaskbarLogoBackgroundMode(requestedBackground);
      }
    };
    window.addEventListener(TASKBAR_LOGO_BACKGROUND_CHANGE_EVENT, onTaskbarLogoBackgroundChange as EventListener);
    return () => window.removeEventListener(TASKBAR_LOGO_BACKGROUND_CHANGE_EVENT, onTaskbarLogoBackgroundChange as EventListener);
  }, []);

  useEffect(() => {
    const onMotionChange = (event: Event) => {
      const custom = event as CustomEvent<{ motion?: MotionMode }>;
      const requestedMotion = custom.detail?.motion;
      if (requestedMotion === 'off' || requestedMotion === 'subtle' || requestedMotion === 'standard' || requestedMotion === 'cinematic') {
        setMotionMode(requestedMotion);
      }
    };
    window.addEventListener(MOTION_CHANGE_EVENT, onMotionChange as EventListener);
    return () => window.removeEventListener(MOTION_CHANGE_EVENT, onMotionChange as EventListener);
  }, []);

  useEffect(() => {
    const onMotionFpsChange = (event: Event) => {
      const custom = event as CustomEvent<{ fps?: number }>;
      const requestedFps = Number(custom.detail?.fps);
      if (Number.isFinite(requestedFps)) {
        setMotionFps(Math.max(14, Math.min(30, Math.round(requestedFps))));
      }
    };
    window.addEventListener(MOTION_FPS_CHANGE_EVENT, onMotionFpsChange as EventListener);
    return () => window.removeEventListener(MOTION_FPS_CHANGE_EVENT, onMotionFpsChange as EventListener);
  }, []);

  useEffect(() => {
    const onMotionTuningChange = (event: Event) => {
      const custom = event as CustomEvent<{
        animDurationMs?: number;
        fadeDurationMs?: number;
        staggerMs?: number;
        offsetX?: number;
        offsetY?: number;
        easingPreset?: typeof MOTION_TUNING_DEFAULTS.easingPreset;
        easingX1?: number;
        easingY1?: number;
        easingX2?: number;
        easingY2?: number;
      }>;
      const next = clampMotionTuning({
        animDurationMs: custom.detail?.animDurationMs,
        fadeDurationMs: custom.detail?.fadeDurationMs,
        staggerMs: custom.detail?.staggerMs,
        offsetX: custom.detail?.offsetX,
        offsetY: custom.detail?.offsetY,
        easingPreset: custom.detail?.easingPreset,
        easingX1: custom.detail?.easingX1,
        easingY1: custom.detail?.easingY1,
        easingX2: custom.detail?.easingX2,
        easingY2: custom.detail?.easingY2
      });
      setMotionTuning(next);
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
    };
    window.addEventListener(MOTION_TUNING_EVENT, onMotionTuningChange as EventListener);
    return () => window.removeEventListener(MOTION_TUNING_EVENT, onMotionTuningChange as EventListener);
  }, []);

  useEffect(() => {
    const checkMax = async () => {
      const windowRef = getCurrentWindow();
      const max = await windowRef.isMaximized();
      setIsMaximized(max);
    };
    void checkMax();
  }, []);

  useEffect(() => {
    const pageName =
      location.pathname === '/' ? 'Home' :
      location.pathname === '/instances' ? 'Instances' :
      location.pathname === '/marketplace' ? 'Marketplace' :
      location.pathname === '/importer' || location.pathname === '/downloads' ? 'Modpack Importer' :
      location.pathname === '/script-studio' ? 'Script Studio' :
      location.pathname === '/host-server' ? 'Host Server' :
      location.pathname === '/settings' ? 'Settings' :
      'Launcher';
    void setDiscordPresence(`Browsing ${pageName}`, `Bloom Client ${APP_VERSION}`);
  }, [location.pathname]);

  useEffect(() => {
    const blockNativeContextMenu = (event: MouseEvent) => {
      event.preventDefault();
    };
    window.addEventListener('contextmenu', blockNativeContextMenu);
    return () => window.removeEventListener('contextmenu', blockNativeContextMenu);
  }, []);

  useEffect(() => {
    return () => {
      if (appRevealTimerRef.current) {
        clearTimeout(appRevealTimerRef.current);
        appRevealTimerRef.current = null;
      }
      appBlackoutTimersRef.current.forEach((timer) => clearTimeout(timer));
      appBlackoutTimersRef.current = [];
    };
  }, []);

  useEffect(() => {
    if (!avatarContextMenu) return;
    const close = () => setAvatarContextMenu(null);
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
  }, [avatarContextMenu]);

  useEffect(() => {
    const onMouseDown = (event: MouseEvent) => {
      const node = event.target as Node;
      if (searchRef.current && !searchRef.current.contains(node)) setSearchOpen(false);
      if (notifRef.current && !notifRef.current.contains(node)) setNotificationsOpen(false);
      if (accountRef.current && !accountRef.current.contains(node)) setAccountOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const activeShortcut = normalizeShortcut(eventToShortcut(event));
      const isOnboardingToggleCombo = Boolean(
        event.ctrlKey
        && event.shiftKey
        && !event.altKey
        && !event.metaKey
        && event.code === 'Digit1'
      );
      const searchShortcut = normalizeShortcut(localStorage.getItem(SHORTCUT_SEARCH_KEY) || 'Ctrl+K');
      const createShortcut = normalizeShortcut(localStorage.getItem(SHORTCUT_CREATE_INSTANCE_KEY) || 'Ctrl+N');
      const settingsShortcut = normalizeShortcut(localStorage.getItem(SHORTCUT_SETTINGS_KEY) || 'Ctrl+,');
      const consoleShortcut = normalizeShortcut(localStorage.getItem(SHORTCUT_CONSOLE_KEY) || CONSOLE_HOTKEY_DEFAULT);
      const replayStartupSceneShortcut = normalizeShortcut(localStorage.getItem(SHORTCUT_REPLAY_STARTUP_SCENE_KEY) || 'Ctrl+Shift+J');
      const extraBindings = (() => {
        try {
          const raw = localStorage.getItem(EXTRA_KEYBINDS_STORAGE_KEY);
          const parsed = raw ? JSON.parse(raw) as Record<string, string> : {};
          return typeof parsed === 'object' && parsed ? parsed : {};
        } catch {
          return {} as Record<string, string>;
        }
      })();
      const matchesExtra = (id: string) => {
        const shortcut = normalizeShortcut(extraBindings[id] || '');
        return Boolean(activeShortcut && shortcut && activeShortcut === shortcut);
      };
      const blockedBrowserShortcuts = new Set([
        'ctrl+j',
        'ctrl+h',
        'ctrl+l',
        'ctrl+r',
        'ctrl+u',
        'ctrl+s',
        'ctrl+o',
        'ctrl+p',
        'ctrl+=',
        'ctrl+-',
        'ctrl+0',
        'ctrl+shift+i',
        'ctrl+shift+c',
        'ctrl+shift+k',
        'f5',
        'f12',
        'alt+arrowleft',
        'alt+arrowright'
      ]);

      if (activeShortcut && blockedBrowserShortcuts.has(activeShortcut)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      if (isOnboardingToggleCombo) {
        event.preventDefault();
        toggleOnboardingPreview();
        return;
      }

      if (activeShortcut && activeShortcut === consoleShortcut) {
        event.preventDefault();
        if (!authState || !onboardingCompleted) return;
        setConsoleOpen((current) => !current);
        return;
      }

      if (consoleOpen && event.key === 'Escape') {
        event.preventDefault();
        setConsoleOpen(false);
        return;
      }

      if (isTypingTarget(event.target)) return;

      if (consoleOpen) return;

      if (activeShortcut && activeShortcut === searchShortcut) {
        event.preventDefault();
        setSearchOpen(true);
        searchInputRef.current?.focus();
        return;
      }
      if (activeShortcut && activeShortcut === createShortcut) {
        event.preventDefault();
        navigate('/instances?action=create');
        return;
      }
      if (activeShortcut && activeShortcut === settingsShortcut) {
        event.preventDefault();
        navigate('/settings');
        return;
      }
      if (activeShortcut && activeShortcut === replayStartupSceneShortcut) {
        event.preventDefault();
        triggerStartupScene();
        return;
      }
      if (matchesExtra('open-help')) {
        event.preventDefault();
        navigate('/help');
        return;
      }
      if (matchesExtra('open-marketplace')) {
        event.preventDefault();
        navigate('/marketplace');
        return;
      }
      if (matchesExtra('open-downloads')) {
        event.preventDefault();
        navigate('/importer');
        return;
      }
      if (matchesExtra('toggle-widget-docker')) {
        event.preventDefault();
        const next = localStorage.getItem(SHOW_WIDGET_DOCKER_KEY) !== 'true';
        localStorage.setItem(SHOW_WIDGET_DOCKER_KEY, next ? 'true' : 'false');
        window.dispatchEvent(new CustomEvent('bloom-extra-change', { detail: { showWidgetDocker: next } }));
        return;
      }
      const pageActions = [
        'save-instance-settings',
        'next-instance-tab',
        'previous-instance-tab',
        'switch-installed-view',
        'switch-install-view',
        'copy-instance-options',
        'paste-instance-options',
        'refresh-active-page',
        'open-active-folder',
        'focus-page-search',
        'quick-launch-selected'
      ];
      for (const action of pageActions) {
        if (matchesExtra(action)) {
          event.preventDefault();
          window.dispatchEvent(new CustomEvent(KEYBIND_ACTION_EVENT, { detail: { action } }));
          return;
        }
      }
      if (event.key === 'Escape') {
        setConsoleOpen(false);
        setSearchOpen(false);
        setNotificationsOpen(false);
        setAccountOpen(false);
      }
    };

    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [navigate, startupSceneSoundProfile, authState, onboardingOpen, onboardingCompleted, consoleOpen]);

  useEffect(() => {
    const onExtraChange = (event: Event) => {
      const custom = event as CustomEvent<{ routeTabAnimationsEnabled?: boolean; showGamesSection?: boolean }>;
      if (typeof custom.detail?.routeTabAnimationsEnabled === 'boolean') {
        setRouteTabAnimationsEnabled(custom.detail.routeTabAnimationsEnabled);
      }
      if (typeof custom.detail?.showGamesSection === 'boolean') {
        setShowGamesSection(custom.detail.showGamesSection);
      }
    };
    window.addEventListener('bloom-extra-change', onExtraChange as EventListener);
    return () => window.removeEventListener('bloom-extra-change', onExtraChange as EventListener);
  }, []);

  useEffect(() => {
    const syncConsoleSettings = () => {
      setShowInternalConsoleCommands(readConsoleBool(CONSOLE_SHOW_DEV_COMMANDS_KEY, false));
      const rawLevel = localStorage.getItem(CONSOLE_LOG_LEVEL_KEY);
      const level: ConsoleLogLevel =
        rawLevel === 'error' || rawLevel === 'warn' || rawLevel === 'info' || rawLevel === 'debug'
          ? rawLevel
          : 'info';
      setConsoleLogLevel(level);
    };
    window.addEventListener(CONSOLE_SETTINGS_CHANGE_EVENT, syncConsoleSettings as EventListener);
    return () => window.removeEventListener(CONSOLE_SETTINGS_CHANGE_EVENT, syncConsoleSettings as EventListener);
  }, []);

  useEffect(() => {
    const syncHostServersUnlocked = () => {
      setHostServersUnlocked(readHostServersUnlocked());
    };
    const onHostUnlockChange = (event: Event) => {
      const custom = event as CustomEvent<{ unlocked?: boolean }>;
      if (typeof custom.detail?.unlocked === 'boolean') {
        setHostServersUnlocked(custom.detail.unlocked);
        return;
      }
      syncHostServersUnlocked();
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === HOST_SERVERS_UNLOCK_KEY) {
        syncHostServersUnlocked();
      }
    };
    window.addEventListener(HOST_SERVERS_UNLOCK_EVENT, onHostUnlockChange as EventListener);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(HOST_SERVERS_UNLOCK_EVENT, onHostUnlockChange as EventListener);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  useEffect(() => {
    if (!showGamesSection && location.pathname === '/games') {
      navigate('/settings', { replace: true });
    }
  }, [showGamesSection, location.pathname, navigate]);

  useEffect(() => {
    if (!authState || !onboardingCompleted) {
      setConsoleOpen(false);
    }
  }, [authState, onboardingCompleted]);

  useEffect(() => {
    if (!consoleOpen) return;
    setSearchOpen(false);
    setNotificationsOpen(false);
    setAccountOpen(false);
  }, [consoleOpen]);

  useEffect(() => {
    if (!mainRef.current) return;
    const nodes = Array.from(mainRef.current.querySelectorAll('.js-giga-reveal'));
    if (nodes.length === 0) return;
    if (!routeTabAnimationsEnabled) {
      remove(nodes);
      set(nodes, { opacity: 1, translateX: 0, translateY: 0 });
      return;
    }
    remove(nodes);
    set(nodes, { opacity: 0, translateX: motionTuning.offsetX, translateY: motionTuning.offsetY });

    const moveAnimation = animate(nodes, {
      translateX: [motionTuning.offsetX, 0],
      translateY: [motionTuning.offsetY, 0],
      delay: (_, index) => index * motionTuning.staggerMs,
      duration: motionTuning.animDurationMs,
      ease: resolveMotionEase(motionTuning)
    });
    const fadeAnimation = animate(nodes, {
      opacity: [0, 1],
      delay: (_, index) => index * motionTuning.staggerMs,
      duration: motionTuning.fadeDurationMs,
      ease: resolveMotionEase(motionTuning)
    });

    return () => {
      moveAnimation.pause();
      fadeAnimation.pause();
    };
  }, [location.pathname, motionTuning, routeTabAnimationsEnabled]);

  useEffect(() => {
    if (authDebug.phase !== 'authenticated') return;
    const closeTimer = setTimeout(() => dismissAuthOverlay(), 900);
    return () => clearTimeout(closeTimer);
  }, [authDebug.phase, dismissAuthOverlay]);

  const playUiSound = (kind: 'click' | 'hover' | 'notification') => {
    if (soundPack === 'off') return;
    const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    if (!audioContextRef.current) audioContextRef.current = new AudioCtx();
    const ctx = audioContextRef.current;
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    const now = ctx.currentTime;
    const base = soundPack === 'arcade' ? 520 : soundPack === 'retro' ? 410 : 470;
    const freq = kind === 'click' ? base : kind === 'hover' ? base + 140 : base - 90;
    const duration = kind === 'notification' ? 0.12 : 0.05;
    oscillator.type = soundPack === 'retro' ? 'square' : soundPack === 'arcade' ? 'triangle' : 'sine';
    oscillator.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(kind === 'notification' ? 0.028 : 0.018, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.start(now);
    oscillator.stop(now + duration);
  };

  const playStartupSceneSound = (profile: StartupSceneSoundProfile) => {
    if (profile === 'off') return;
    const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    if (!audioContextRef.current) audioContextRef.current = new AudioCtx();
    const ctx = audioContextRef.current;
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }
    const now = ctx.currentTime;
    const playTone = (frequency: number, startOffset: number, duration: number, gainAmount: number, type: OscillatorType) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      const start = now + startOffset;
      osc.type = type;
      osc.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(gainAmount, start);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      osc.start(start);
      osc.stop(start + duration);
    };
    if (profile === 'shimmer') {
      playTone(330, 0.02, 0.26, 0.02, 'triangle');
      playTone(520, 0.14, 0.24, 0.017, 'triangle');
      playTone(760, 0.28, 0.22, 0.014, 'sine');
      return;
    }
    playTone(180, 0.01, 0.2, 0.024, 'square');
    playTone(260, 0.11, 0.16, 0.02, 'square');
    playTone(460, 0.2, 0.18, 0.016, 'triangle');
  };

  const triggerStartupScene = () => {
    setStartupSceneRunId((value) => value + 1);
    setStartupSceneFadingOut(false);
    setStartupSceneVisible(true);
    playStartupSceneSound(startupSceneSoundProfile);
  };

  useEffect(() => {
    if (!startupSceneEnabled) return;
    if (sessionStorage.getItem(STARTUP_SCENE_AUTOPLAY_SESSION_KEY) === 'true') return;
    sessionStorage.setItem(STARTUP_SCENE_AUTOPLAY_SESSION_KEY, 'true');
    setStartupBlackHoldVisible(true);
    const timer = setTimeout(() => {
      setStartupBlackHoldVisible(false);
      triggerStartupScene();
    }, 3000);
    return () => {
      clearTimeout(timer);
      setStartupBlackHoldVisible(false);
    };
  }, []);

  useEffect(() => {
    if (!startupSceneVisible) return;
    const totalMs = 2000;
    const fadeMs = 260;
    const fadeTimer = setTimeout(() => {
      setStartupSceneFadingOut(true);
    }, totalMs - fadeMs);
    const timer = setTimeout(() => {
      setStartupSceneVisible(false);
      setStartupSceneFadingOut(false);
    }, totalMs);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(timer);
    };
  }, [startupSceneVisible, startupSceneRunId]);

  useEffect(() => {
    if (soundPack === 'off') return;
    const onMouseDown = (event: MouseEvent) => {
      if (!soundClicksEnabled) return;
      if (event.button !== 0) return;
      const el = event.target as HTMLElement | null;
      if (!el) return;
      if (!el.closest('button, a, [role=\"button\"], summary')) return;
      playUiSound('click');
    };
    const onMouseOver = (event: MouseEvent) => {
      if (!soundHoversEnabled) return;
      const now = Date.now();
      if (now - lastHoverSoundAtRef.current < 90) return;
      const el = event.target as HTMLElement | null;
      if (!el) return;
      if (!el.closest('button, a, [role=\"button\"], summary')) return;
      lastHoverSoundAtRef.current = now;
      playUiSound('hover');
    };
    window.addEventListener('mousedown', onMouseDown, true);
    window.addEventListener('mouseover', onMouseOver, true);
    return () => {
      window.removeEventListener('mousedown', onMouseDown, true);
      window.removeEventListener('mouseover', onMouseOver, true);
    };
  }, [soundPack, soundClicksEnabled, soundHoversEnabled]);

  useEffect(() => {
    if (!notificationsOpen) return;
    if (!soundNotificationsEnabled) return;
    playUiSound('notification');
  }, [notificationsOpen, soundNotificationsEnabled, soundPack]);

  useEffect(() => {
    const syncUpdatePreferences = (event: Event) => {
      const detail = (event as CustomEvent<UpdatePreferences>).detail;
      if (detail) setUpdatePreferences(detail);
      else setUpdatePreferences(readUpdatePreferences());
    };
    window.addEventListener(UPDATE_SETTINGS_CHANGE_EVENT, syncUpdatePreferences as EventListener);
    return () => window.removeEventListener(UPDATE_SETTINGS_CHANGE_EVENT, syncUpdatePreferences as EventListener);
  }, []);

  useEffect(() => {
    if (!authState || !onboardingCompleted) return;
    if (!updatePreferences.autoCheck) return;
    void runLauncherUpdateCheck('auto');
  }, [authState?.profile.id, onboardingCompleted, updatePreferences.autoCheck]);

  const runEntry = (entry: SearchEntry) => {
    if (entry.route) navigate(entry.route);
    if (entry.action === 'signin') void startLogin();
    setSearchOpen(false);
    setSearchQuery('');
  };

  const onProfileInputChange: React.ChangeEventHandler<HTMLInputElement> = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setSkinStatus('Please choose an image file for profile picture.');
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => setSkinStatus('Failed reading profile picture.');
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!dataUrl) return;
      setProfileAvatar(dataUrl);
      setSkinStatus('Profile picture updated.');
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const runQuickLaunchLastInstance = () => {
    if (!quickLaunchInstance) return;
    void startDownload(quickLaunchInstance, authState);
  };

  const runOpenLogs = () => {
    navigate('/importer');
  };

  const runRefreshMods = () => {
    window.dispatchEvent(new CustomEvent(MODS_REFRESH_EVENT, { detail: { source: 'quick-action', fallbackQuery: 'optimization' } }));
    navigate('/mods');
  };

  const runSignOut = () => {
    if (authState?.profile.id) {
      localStorage.removeItem(`${ONBOARDING_DONE_PREFIX}${authState.profile.id}`);
    }
    setAccountOpen(false);
    setAvatarContextMenu(null);
    logout();
  };

  const setThemeFromConsole = useCallback((themeId: string) => {
    const normalized = themeId as LauncherTheme;
    setThemeMode(normalized);
  }, []);

  const setUiScaleFromConsole = useCallback((value: number) => {
    const clamped = Math.max(0.8, Math.min(1.2, Number(value.toFixed(2))));
    const mappedDensity: DensityMode = clamped < 0.95 ? 'compact' : clamped > 1.05 ? 'spacious' : 'cozy';
    setDensityMode(mappedDensity);
    return { mappedDensity };
  }, []);

  const setReducedMotionFromConsole = useCallback((enabled: boolean) => {
    setMotionMode(enabled ? 'off' : 'standard');
  }, []);

  const setShowInternalCommandsFromConsole = useCallback((next: boolean) => {
    setShowInternalConsoleCommands(next);
    localStorage.setItem(CONSOLE_SHOW_DEV_COMMANDS_KEY, next ? 'true' : 'false');
    window.dispatchEvent(new CustomEvent(CONSOLE_SETTINGS_CHANGE_EVENT));
  }, []);

  const setConsoleLogLevelFromConsole = useCallback((next: ConsoleLogLevel) => {
    setConsoleLogLevel(next);
    localStorage.setItem(CONSOLE_LOG_LEVEL_KEY, next);
    window.dispatchEvent(new CustomEvent(CONSOLE_SETTINGS_CHANGE_EVENT));
  }, []);

  const setHostServersUnlockedFromConsole = useCallback((next: boolean) => {
    setHostServersUnlocked(next);
    writeHostServersUnlocked(next);
  }, []);

  const moduleConfig = useMemo(() => ({
    'widget-docker': {
      get: () => localStorage.getItem(SHOW_WIDGET_DOCKER_KEY) === 'true',
      set: (enabled: boolean) => {
        localStorage.setItem(SHOW_WIDGET_DOCKER_KEY, enabled ? 'true' : 'false');
        window.dispatchEvent(new CustomEvent('bloom-extra-change', { detail: { showWidgetDocker: enabled } }));
      }
    },
    'games-section': {
      get: () => showGamesSection,
      set: (enabled: boolean) => {
        setShowGamesSection(enabled);
        localStorage.setItem(SHOW_GAMES_SECTION_KEY, enabled ? 'true' : 'false');
        window.dispatchEvent(new CustomEvent('bloom-extra-change', { detail: { showGamesSection: enabled } }));
      }
    },
    'route-animations': {
      get: () => routeTabAnimationsEnabled,
      set: (enabled: boolean) => {
        setRouteTabAnimationsEnabled(enabled);
        localStorage.setItem(ROUTE_TAB_ANIMATIONS_KEY, enabled ? 'true' : 'false');
        window.dispatchEvent(new CustomEvent('bloom-extra-change', { detail: { routeTabAnimationsEnabled: enabled } }));
      }
    },
    'startup-scene': {
      get: () => startupSceneEnabled,
      set: (enabled: boolean) => {
        setStartupSceneEnabled(enabled);
        localStorage.setItem(STARTUP_SCENE_ENABLED_KEY, enabled ? 'true' : 'false');
        window.dispatchEvent(new CustomEvent(STARTUP_SCENE_CHANGE_EVENT, {
          detail: { enabled, theme: startupSceneTheme, soundProfile: startupSceneSoundProfile }
        }));
      }
    }
  }), [routeTabAnimationsEnabled, showGamesSection, startupSceneEnabled, startupSceneSoundProfile, startupSceneTheme]);

  const createConsoleInstance = useCallback(async (name: string): Promise<Instance> => {
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

  const removeConsoleInstance = useCallback(async (instanceId: string) => {
    await deleteInstance(instanceId);
  }, [deleteInstance]);

  const renameConsoleInstance = useCallback(async (instanceId: string, nextName: string): Promise<Instance> => {
    const current = await TauriApi.instancesGet(instanceId);
    const trimmed = nextName.trim();
    if (!trimmed) throw new Error('Instance name cannot be empty.');
    const duplicate = instances.some((instance) => instance.id !== instanceId && instance.name.trim().toLowerCase() === trimmed.toLowerCase());
    if (duplicate) throw new Error(`Instance "${trimmed}" already exists.`);
    const updated: Instance = { ...current, name: trimmed, updatedAt: Date.now() };
    await updateInstance(instanceId, updated);
    return updated;
  }, [instances, updateInstance]);

  const launchConsoleInstance = useCallback(async (instanceId: string) => {
    const target = instances.find((instance) => instance.id === instanceId);
    if (!target) throw new Error('Instance not found.');
    await startDownload(target, authState);
  }, [authState, instances, startDownload]);

  const cloneConsoleInstance = useCallback(async (sourceId: string, targetName: string): Promise<Instance> => {
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

  const updateConsoleInstanceVersion = useCallback(async (instanceId: string, version: string): Promise<Instance> => {
    const current = await TauriApi.instancesGet(instanceId);
    const nextVersion = version.trim();
    if (!nextVersion) throw new Error('Version cannot be empty.');
    const updated: Instance = { ...current, mcVersion: nextVersion, updatedAt: Date.now() };
    await updateInstance(instanceId, updated);
    return updated;
  }, [updateInstance]);

  const updateConsoleInstanceLoader = useCallback(async (instanceId: string, loader: 'vanilla' | 'fabric'): Promise<Instance> => {
    const current = await TauriApi.instancesGet(instanceId);
    const updated: Instance = {
      ...current,
      loader,
      fabricLoaderVersion: loader === 'fabric' ? (current.fabricLoaderVersion || 'latest') : undefined,
      updatedAt: Date.now()
    };
    await updateInstance(instanceId, updated);
    return updated;
  }, [updateInstance]);

  const getConsoleInstancePath = useCallback(async (instanceId: string) => {
    const paths = await TauriApi.pathsGet() as { instances?: string };
    const root = String(paths.instances || '');
    if (!root) return instanceId;
    const joiner = root.endsWith('\\') || root.endsWith('/') ? '' : '\\';
    return `${root}${joiner}${instanceId}`;
  }, []);

  const resetConsoleLayout = useCallback(() => {
    const keysToRemove: string[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key) continue;
      if (key.startsWith('bloom_widget_layout_') || key.startsWith('bloom_widget_visible_')) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.push('bloom_home_widgets', 'bloom_home_widget_layout');
    for (const key of keysToRemove) {
      localStorage.removeItem(key);
    }
    localStorage.setItem(SHOW_WIDGET_DOCKER_KEY, 'false');
    localStorage.setItem(HIDE_EMPTY_WIDGET_SLOTS_KEY, 'false');
    window.dispatchEvent(new CustomEvent('bloom-extra-change', {
      detail: { showWidgetDocker: false, hideEmptyWidgetSlots: false }
    }));
  }, []);

  const dumpConsoleConfig = useCallback(() => {
    const out: Record<string, string> = {};
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key || !key.startsWith('bloom_')) continue;
      out[key] = localStorage.getItem(key) ?? '';
    }
    return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
  }, []);

  const inspectConsoleTheme = useCallback(() => {
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

  const consoleCommands = useMemo(() => createConsoleRegistry(), []);
  const consoleContext = useMemo(() => ({
    appVersion: APP_VERSION,
    routePath: location.pathname,
    reducedMotionActive: motionMode === 'off',
    authName: authState?.profile.name ?? null,
    authUuid: authState?.profile.id ?? null,
    instances,
    themes: CONSOLE_THEMES.map((theme) => ({ id: theme.id, label: theme.label })),
    modules: CONSOLE_MODULES.map((module) => ({ id: module.id, description: module.description })),
    showInternalCommands: showInternalConsoleCommands,
    setShowInternalCommands: setShowInternalCommandsFromConsole,
    hostServersUnlocked,
    setHostServersUnlocked: setHostServersUnlockedFromConsole,
    logLevel: consoleLogLevel,
    setLogLevel: setConsoleLogLevelFromConsole,
    setTheme: setThemeFromConsole,
    getAppearanceSnapshot: () => ({
      theme: themeMode,
      accent: accentMode,
      background: backgroundMode,
      density: densityMode,
      font: fontPackMode,
      sidebar: sidebarMode,
      sidebarPosition,
      cardStyle: cardStyleMode,
      buttonTheme,
      motion: motionMode,
      iconPack,
      roundness: String(roundnessLevel),
      glassAmount: String(glassAmount),
      dropdownOpacity: String(dropdownOpacity)
    }),
    setUiScale: setUiScaleFromConsole,
    setReducedMotion: setReducedMotionFromConsole,
    listInstances: async () => {
      await loadInstances();
      return TauriApi.instancesList();
    },
    createInstance: createConsoleInstance,
    removeInstance: removeConsoleInstance,
    renameInstance: renameConsoleInstance,
    launchInstance: launchConsoleInstance,
    openInstance: (instanceId: string) => navigate(`/instance-editor?id=${encodeURIComponent(instanceId)}`),
    cloneInstance: cloneConsoleInstance,
    updateInstanceVersion: updateConsoleInstanceVersion,
    updateInstanceLoader: updateConsoleInstanceLoader,
    openInstanceConfig: (instanceId: string) => navigate(`/instance-editor?id=${encodeURIComponent(instanceId)}&tab=settings`),
    getInstancePath: getConsoleInstancePath,
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
    dumpConfig: dumpConsoleConfig,
    resetLayout: resetConsoleLayout,
    mockNotification: () => {
      setUpdateStatusMessage('Console notification test ping.');
      setNotificationsOpen(true);
    },
    inspectTheme: inspectConsoleTheme
  }), [
    location.pathname,
    motionMode,
    authState?.profile.id,
    authState?.profile.name,
    instances,
    showInternalConsoleCommands,
    setShowInternalCommandsFromConsole,
    hostServersUnlocked,
    setHostServersUnlockedFromConsole,
    consoleLogLevel,
    setConsoleLogLevelFromConsole,
    setThemeFromConsole,
    themeMode,
    accentMode,
    backgroundMode,
    densityMode,
    fontPackMode,
    sidebarMode,
    sidebarPosition,
    cardStyleMode,
    buttonTheme,
    iconPack,
    roundnessLevel,
    glassAmount,
    dropdownOpacity,
    setUiScaleFromConsole,
    setReducedMotionFromConsole,
    loadInstances,
    createConsoleInstance,
    removeConsoleInstance,
    renameConsoleInstance,
    launchConsoleInstance,
    navigate,
    cloneConsoleInstance,
    updateConsoleInstanceVersion,
    updateConsoleInstanceLoader,
    getConsoleInstancePath,
    moduleConfig,
    dumpConsoleConfig,
    resetConsoleLayout,
    inspectConsoleTheme
  ]);

  const consoleHotkeyLabel = normalizeShortcut(localStorage.getItem(SHORTCUT_CONSOLE_KEY) || CONSOLE_HOTKEY_DEFAULT).toUpperCase();

  const openOnboarding = (step?: 0 | 1 | 2 | 3 | 4) => {
    setOnboardingOpen(true);
    setOnboardingExitActive(false);
    setAppBlackoutPhase('idle');
    setAppRevealActive(false);
    setOnboardingStep(step ?? (authState ? 1 : 0));
  };

  const toggleOnboardingPreview = () => {
    if (onboardingOpen && authState && onboardingCompleted) {
      setOnboardingOpen(false);
      setOnboardingExitActive(false);
      setAppBlackoutPhase('idle');
      return;
    }
    openOnboarding(authState ? 1 : 0);
  };

  const completeOnboarding = () => {
    if (onboardingDoneKey) {
      localStorage.setItem(onboardingDoneKey, 'true');
    }
    setOnboardingCompleted(true);
    appBlackoutTimersRef.current.forEach((timer) => clearTimeout(timer));
    appBlackoutTimersRef.current = [];
    setOnboardingExitActive(true);
    setAppBlackoutPhase('fade-in');

    const fadeToBlackDone = setTimeout(() => {
      setOnboardingOpen(false);
      setOnboardingExitActive(false);
      setAppBlackoutPhase('hold');
    }, 900);

    const startReveal = setTimeout(() => {
      setAppBlackoutPhase('fade-out');
      setAppRevealActive(true);
    }, 2900);

    const finishReveal = setTimeout(() => {
      setAppBlackoutPhase('idle');
      if (appRevealTimerRef.current) clearTimeout(appRevealTimerRef.current);
      appRevealTimerRef.current = setTimeout(() => {
        setAppRevealActive(false);
        appRevealTimerRef.current = null;
      }, 40);
    }, 6400);

    appBlackoutTimersRef.current = [fadeToBlackDone, startReveal, finishReveal];
  };

  const runLauncherUpdateCheck = async (source: 'auto' | 'manual' = 'auto') => {
    setCheckingLauncherUpdate(true);
    if (source === 'manual') {
      setUpdateStatusMessage('Checking for launcher updates...');
    }
    try {
      const { update, error } = await checkForLauncherUpdate();
      if (error) {
        setUpdateStatusMessage(`Update check failed: ${error}`);
        if (source === 'manual') setNotificationsOpen(true);
        return;
      }
      setAvailableLauncherUpdate(update);
      if (!update) {
        setUpdateNoticeVisible(false);
        setUpdateStatusMessage(source === 'manual' ? 'You are up to date.' : null);
        if (source === 'manual') setNotificationsOpen(true);
        return;
      }
      setUpdateStatusMessage(`Update available: v${update.version}`);
      if (updatePreferences.notifications || source === 'manual') {
        setUpdateNoticeVisible(true);
        setNotificationsOpen(true);
      }
    } finally {
      setCheckingLauncherUpdate(false);
    }
  };

  const runLauncherUpdateInstall = async () => {
    if (!availableLauncherUpdate) return;
    setInstallingLauncherUpdate(true);
    setUpdateStatusMessage(`Downloading v${availableLauncherUpdate.version} installer...`);
    try {
      await downloadAndInstallLauncherUpdate(availableLauncherUpdate);
      setUpdateStatusMessage('Installer launched. Bloom will close to finish the update.');
    } catch (error) {
      setUpdateStatusMessage(`Update install failed: ${error instanceof Error ? error.message : String(error)}`);
      setNotificationsOpen(true);
    } finally {
      setInstallingLauncherUpdate(false);
    }
  };

  const openUpdatesSettings = () => {
    navigate('/settings');
    setNotificationsOpen(false);
    setUpdateNoticeVisible(false);
    window.dispatchEvent(new CustomEvent('bloom-settings-open-tab', { detail: { tab: 'updates' } }));
  };

  const openAvatarContextMenu = (event: React.MouseEvent) => {
    event.preventDefault();
    setAvatarContextMenu({ x: event.clientX, y: event.clientY });
  };
  const iconStrokeWidth = iconPack === 'bold' ? 2.6 : iconPack === 'pixel' ? 2.2 : iconPack === 'rounded' ? 1.9 : 2;
  const density = DENSITY_MAP[densityMode] || DENSITY_MAP.cozy;
  const isHorizontalSidebar = sidebarPosition === 'top' || sidebarPosition === 'bottom';
  const isRightSidebar = sidebarPosition === 'right';
  const showClientShell = Boolean(authState && onboardingCompleted);
  const showOnboardingGate = onboardingOpen || !showClientShell;
  const onboardingStepTitle =
    onboardingStep === 0 ? 'Sign in with Microsoft'
      : onboardingStep === 1 ? `Hi, ${authState?.profile.name ?? 'there'}`
      : onboardingStep === 2 ? 'Choose profile picture'
      : onboardingStep === 3 ? 'Choose launcher theme'
      : 'Choose accent color';
  const onboardingStepBody =
    onboardingStep === 0 ? 'Bloom stays hidden until your account is connected and first-run setup is finished.'
      : onboardingStep === 1 ? 'You are connected. Continue into your launcher setup.'
      : onboardingStep === 2 ? 'Upload a custom avatar or keep the current Minecraft one.'
      : onboardingStep === 3 ? 'Pick the overall launcher mood before you enter the app.'
      : 'Choose the accent color that will drive Bloom highlights and focus states.';
  const onboardingStepIcon =
    onboardingStep === 0 ? <Send size={28} className="text-[#c7ccd4]" />
      : onboardingStep === 1 ? <Sparkles size={28} className="text-[#c7ccd4]" />
      : onboardingStep === 2 ? <Camera size={28} className="text-[#c7ccd4]" />
      : onboardingStep === 3 ? <Layers size={28} className="text-[#c7ccd4]" />
      : <Palette size={28} className="text-[#c7ccd4]" />;
  const sidebarRail = (
    <SidebarRail
      className="js-giga-reveal shrink-0"
      themeMode={themeMode}
      sidebarMode={sidebarMode}
      sidebarPosition={sidebarPosition}
      surfaceOpacity={taskbarSurfaceOpacity}
      showHostServer={hostServersUnlocked}
      toggleTheme={() => {}}
      onQuickLaunch={runQuickLaunchLastInstance}
      onOpenLogs={runOpenLogs}
      onRefreshMods={runRefreshMods}
    />
  );

  return (
    <div ref={rootRef} className={clsx('g-window-shell w-full h-full overflow-hidden text-[var(--g-text)]', isHorizontalSidebar ? 'flex flex-col' : 'flex', appRevealActive && 'app-reveal-active')}>
      {appBlackoutPhase !== 'idle' && (
        <div
          className={clsx(
            'absolute inset-0 z-[338] pointer-events-none onboarding-blackout-transition',
            appBlackoutPhase === 'fade-in' && 'is-fade-in',
            appBlackoutPhase === 'hold' && 'is-hold',
            appBlackoutPhase === 'fade-out' && 'is-fade-out'
          )}
        />
      )}
      <div className="pointer-events-none absolute inset-0" style={{ opacity: backgroundVisualOpacity / 100 }}>
        {backgroundMode === 'custom' && customBackgroundDataUrl && (
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `url(${customBackgroundDataUrl})`,
              backgroundPosition: 'center',
              backgroundSize: 'cover',
              backgroundRepeat: 'no-repeat'
            }}
          />
        )}
        {backgroundMode === 'particles' && (
          <Suspense fallback={null}>
            <Particles animated={motionMode !== 'off'} />
          </Suspense>
        )}
        {backgroundMode === 'plus' && <div className="absolute inset-0 g-bg-plus" />}
        {backgroundMode === 'aurora' && <div className="absolute inset-0 g-bg-aurora" />}
        {backgroundMode === 'scanlines' && <div className="absolute inset-0 g-bg-scanlines" />}
        {backgroundMode === 'nebula' && <div className="absolute inset-0 g-bg-nebula" />}
      </div>

      {showClientShell && sidebarPosition === 'left' && sidebarRail}
      {showClientShell && sidebarPosition === 'top' && sidebarRail}

      {showClientShell && (
      <div className={clsx('flex-1 min-w-0 flex flex-col relative', isHorizontalSidebar ? 'min-h-0' : 'h-full')}>
        <header
          data-tauri-drag-region
          className="js-giga-reveal app-region-drag border-b backdrop-blur-xl px-5 flex items-center gap-3 relative z-[120] overflow-visible"
          style={{ background: `color-mix(in srgb, var(--g-shell) ${taskbarSurfaceOpacity}%, transparent)`, borderColor: 'var(--g-sidebar-border)', height: `${density.headerHeight}px` }}
        >
          <div ref={searchRef} className="app-region-no-drag relative flex-1">
            <div className="relative">
              <Search size={15} strokeWidth={iconStrokeWidth} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/60" />
              <input
                ref={searchInputRef}
                value={searchQuery}
                onFocus={() => setSearchOpen(true)}
                onChange={(event) => {
                  setSearchQuery(event.target.value);
                  setSearchOpen(true);
                }}
                placeholder="Search pages, actions, settings..."
                className="w-full h-11 rounded-xl border border-white/12 bg-white/[0.04] pl-9 pr-20 text-sm font-semibold text-white placeholder:text-white/45 outline-none"
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-extrabold tracking-widest border border-white/15 rounded-md px-2 py-1 text-white/60">CTRL K</span>
            </div>

            {searchOpen && (
              <div className="absolute top-[47px] left-0 right-0 z-[250] g-dropdown-surface p-2">
                <div className="space-y-1 max-h-[260px] overflow-y-auto">
                  {filtered.map((entry) => (
                    <button key={entry.id} onClick={() => runEntry(entry)} className="w-full text-left rounded-lg border border-transparent hover:border-white/15 hover:bg-white/[0.05] px-3 py-2">
                      <p className="text-sm font-extrabold text-white">{entry.label}</p>
                      <p className="text-xs text-white/55">{entry.description}</p>
                    </button>
                  ))}
                  {filtered.length === 0 && (
                    <p className="px-3 py-2 text-xs font-semibold text-white/55">No results</p>
                  )}
                </div>
              </div>
            )}
          </div>

          <div data-tauri-drag-region className="app-region-drag flex-1 h-full min-w-[40px]" />

          <div className="app-region-no-drag flex items-center gap-2 shrink-0">
            <button onClick={() => setNotificationsOpen((v) => !v)} className="relative h-10 w-10 rounded-xl border border-white/12 bg-white/[0.04] text-white/75 inline-flex items-center justify-center">
              <Bell size={15} strokeWidth={iconStrokeWidth} />
              {availableLauncherUpdate && (
                <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-[var(--g-accent)] shadow-[0_0_10px_var(--g-accent)]" />
              )}
            </button>

            <div ref={notifRef} className="relative">
              {notificationsOpen && (
                <div className="absolute right-0 top-[44px] z-[260] w-[320px] g-dropdown-surface p-3">
                  <p className="text-[10px] tracking-[0.16em] uppercase font-extrabold g-accent-text">Notifications</p>
                  {availableLauncherUpdate ? (
                    <div className="mt-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-extrabold text-white">Launcher update available</p>
                          <p className="text-xs text-white/60 mt-1">Bloom v{availableLauncherUpdate.version} is ready to install.</p>
                          <p className="text-[10px] text-white/40 mt-2">{availableLauncherUpdate.assetName}</p>
                        </div>
                        <span className="rounded-full border border-[var(--g-accent)]/30 bg-[var(--g-accent-soft)] px-2 py-1 text-[10px] font-extrabold uppercase tracking-[0.12em] text-white">
                          New
                        </span>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <button onClick={openUpdatesSettings} className="g-btn h-9 text-[10px] font-extrabold uppercase tracking-[0.12em]">
                          Open Updates
                        </button>
                        <button onClick={() => { void runLauncherUpdateInstall(); }} disabled={installingLauncherUpdate} className="g-btn-accent h-9 text-[10px] font-extrabold uppercase tracking-[0.12em] disabled:opacity-50">
                          {installingLauncherUpdate ? 'Installing...' : 'Install'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                      <p className="text-xs font-extrabold text-white">No new notifications</p>
                      <p className="text-xs text-white/60 mt-1">{updateStatusMessage || 'Bloom will alert you here when a launcher update is found.'}</p>
                      <button onClick={() => { void runLauncherUpdateCheck('manual'); }} className="mt-3 g-btn h-9 w-full text-[10px] font-extrabold uppercase tracking-[0.12em]">
                        {checkingLauncherUpdate ? 'Checking...' : 'Check Now'}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            <span className="text-[10px] font-extrabold tracking-[0.14em] uppercase rounded-lg border border-white/12 px-2 py-1 text-white/55">{APP_VERSION}</span>

            <div ref={accountRef} className="relative">
              <button
                onClick={() => setAccountOpen((v) => !v)}
                onContextMenu={openAvatarContextMenu}
                className="h-12 min-w-[190px] rounded-xl border border-white/12 bg-white/[0.04] px-2.5 pr-3.5 inline-flex items-center gap-2.5"
              >
                {authState ? (
                  <>
                    <img src={displayAvatar || ''} className="w-10 h-10 rounded-full border border-white/20" />
                    <span className="text-sm font-extrabold text-white truncate max-w-[120px]">{authState.profile.name}</span>
                  </>
                ) : (
                  <>
                    <User size={14} strokeWidth={iconStrokeWidth} className="text-white/70" />
                    <span className="text-sm font-extrabold text-white/75">Not signed in</span>
                  </>
                )}
              </button>

              {accountOpen && (
                <div className="absolute right-0 top-[46px] z-[270] w-[420px] g-dropdown-surface p-4">
                  {!authState ? (
                    <div>
                      <p className="text-lg font-extrabold">Account</p>
                      <p className="text-sm g-muted mt-1">Sign in to manage your profile and quick launch.</p>
                      <button onClick={() => { void startLogin(); }} className="mt-3 g-btn-accent px-4 py-2 text-sm font-extrabold">
                        Sign In
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-3">
                        <img src={displayAvatar || ''} className="w-14 h-14 rounded-xl border border-white/15" />
                        <div>
                          <p className="text-lg font-extrabold text-white">{authState.profile.name}</p>
                          <p className="text-xs text-white/55">UUID: {authState.profile.id}</p>
                        </div>
                      </div>

                      <div className="mt-3 g-panel p-3">
                        <p className="text-[10px] uppercase tracking-[0.16em] font-extrabold g-accent-text">Launch</p>
                        <div className="mt-2 flex items-center gap-2">
                          <select
                            value={quickLaunchInstanceId}
                            onChange={(event) => setQuickLaunchInstanceId(event.target.value)}
                            className="h-9 flex-1 rounded-lg border border-white/12 bg-white/[0.04] px-3 text-sm font-bold text-white outline-none"
                          >
                            {instances.map((instance) => (
                              <option key={instance.id} value={instance.id} className="text-black">
                                {instance.name} - {instance.loader.toUpperCase()} {instance.mcVersion}
                              </option>
                            ))}
                          </select>
                          <button
                            disabled={!quickLaunchInstance}
                            onClick={() => quickLaunchInstance && startDownload(quickLaunchInstance, authState)}
                            className="g-btn-accent h-9 px-3 text-xs font-extrabold tracking-[0.12em] uppercase disabled:opacity-50"
                          >
                            Launch
                          </button>
                        </div>
                      </div>

                      <div className="mt-3 g-panel p-3">
                        <p className="text-[10px] uppercase tracking-[0.16em] font-extrabold g-accent-text">Profile Picture</p>
                        <div className="mt-2 flex items-center gap-2">
                          <input ref={profileUploadRef} type="file" accept="image/*" className="hidden" onChange={onProfileInputChange} />
                          <button onClick={() => profileUploadRef.current?.click()} className="g-btn h-9 px-3 text-xs font-extrabold tracking-[0.12em] uppercase">
                            Upload PFP
                          </button>
                          <button onClick={clearProfileAvatar} className="g-btn h-9 px-3 text-xs font-extrabold tracking-[0.12em] uppercase">
                            Reset
                          </button>
                        </div>
                        {skinStatus && <p className="text-xs text-white/60 mt-2">{skinStatus}</p>}
                      </div>

                      <button
                        onClick={runSignOut}
                        className="mt-3 w-full h-10 g-btn text-xs font-extrabold tracking-[0.12em] uppercase text-red-200 border-red-300/35"
                      >
                        Sign Out
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            <button onClick={() => { void getCurrentWindow().minimize(); }} className="g-window-btn" title="Minimize">
              <Minus size={14} strokeWidth={iconStrokeWidth} />
            </button>
            <button
              title="Move Window"
              onMouseDown={() => { void getCurrentWindow().startDragging(); }}
              className="g-window-btn"
            >
              <Move size={13} strokeWidth={iconStrokeWidth} />
            </button>
            <button
              onClick={async () => {
                const windowRef = getCurrentWindow();
                await windowRef.toggleMaximize();
                const max = await windowRef.isMaximized();
                setIsMaximized(max);
              }}
              className="g-window-btn"
              title={isMaximized ? 'Restore' : 'Maximize'}
            >
              <Maximize2 size={13} strokeWidth={iconStrokeWidth} className={isMaximized ? 'opacity-60' : ''} />
            </button>
            <button onClick={() => { void getCurrentWindow().close(); }} className="g-window-btn g-window-btn-danger" title="Close">
              <X size={14} strokeWidth={iconStrokeWidth} />
            </button>
          </div>
        </header>

        {availableLauncherUpdate && updateNoticeVisible && (
          <div className="absolute right-5 z-[210] w-[360px] app-region-no-drag" style={{ top: `${density.headerHeight + 14}px` }}>
            <div className="rounded-2xl border border-white/12 bg-[var(--g-panel)]/95 p-4 shadow-[0_24px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] g-accent-text">Update Available</p>
                  <h3 className="mt-1 text-lg font-extrabold text-white">Bloom v{availableLauncherUpdate.version}</h3>
                  <p className="mt-1 text-sm text-white/62">A newer launcher build is available. Install it from inside Bloom.</p>
                </div>
                <button onClick={() => setUpdateNoticeVisible(false)} className="h-8 w-8 rounded-lg border border-white/10 bg-white/[0.03] text-white/60 inline-flex items-center justify-center">
                  <X size={14} strokeWidth={iconStrokeWidth} />
                </button>
              </div>
              <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-white/55">Installer Asset</p>
                <p className="mt-1 text-xs text-white/68">{availableLauncherUpdate.assetName}</p>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button onClick={openUpdatesSettings} className="g-btn h-10 text-xs font-extrabold uppercase tracking-[0.12em]">
                  Open Updates
                </button>
                <button onClick={() => { void runLauncherUpdateInstall(); }} disabled={installingLauncherUpdate} className="g-btn-accent h-10 text-xs font-extrabold uppercase tracking-[0.12em] disabled:opacity-50">
                  {installingLauncherUpdate ? 'Installing...' : 'Install Update'}
                </button>
              </div>
              {updateStatusMessage && <p className="mt-2 text-[11px] text-white/50">{updateStatusMessage}</p>}
            </div>
          </div>
        )}

        <main ref={mainRef} className="flex-1 min-h-0 overflow-y-auto app-region-no-drag" style={{ padding: density.mainPadding }}>
          <div className="min-h-full">{children}</div>
        </main>

        <BloomConsole
          open={consoleOpen}
          hotkeyLabel={consoleHotkeyLabel}
          commands={consoleCommands}
          context={consoleContext}
          onClose={() => setConsoleOpen(false)}
        />
      </div>
      )}

      {showClientShell && isRightSidebar && sidebarRail}
      {showClientShell && sidebarPosition === 'bottom' && sidebarRail}

      {startupSceneVisible && (
        <div
          key={startupSceneRunId}
          className={`startup-scene-overlay startup-scene-${startupSceneTheme} ${startupSceneFadingOut ? 'is-fading-out' : ''} app-region-no-drag`}
        >
          <img src={splashGif} alt="Startup scene" className="startup-scene-media" />
        </div>
      )}

      {startupBlackHoldVisible && (
        <div className="startup-black-hold app-region-no-drag" />
      )}

      {showOnboardingGate && (
        <div className={clsx('fixed inset-0 z-[340] flex items-center justify-center overflow-hidden p-4 app-region-no-drag', onboardingExitActive && 'onboarding-exit-active')}>
          <div className="pointer-events-none absolute inset-0 bg-[#020202]" />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.32),transparent_18%),radial-gradient(circle_at_28%_58%,rgba(201,206,214,0.08),transparent_32%),linear-gradient(180deg,rgba(255,255,255,0.04),transparent_24%)]" />
          <div className="pointer-events-none absolute left-[-12%] top-[-20%] h-[52rem] w-[32rem] rotate-[28deg] bg-[linear-gradient(180deg,rgba(255,255,255,0.34),rgba(255,255,255,0.04),transparent)] blur-[26px] opacity-75" />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_22%,rgba(255,255,255,0.04),transparent_24%)]" />

          <div className={clsx('relative w-full', onboardingStep === 4 ? 'max-w-[860px]' : 'max-w-[640px]')}>
            <div className="rounded-[40px] border border-white/10 bg-[rgba(10,10,10,0.9)] px-5 py-5 shadow-[0_40px_120px_rgba(0,0,0,0.65)] md:px-8 md:py-7">
              <div className="absolute inset-0 rounded-[40px] bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.05),transparent_38%),radial-gradient(circle_at_18%_56%,rgba(201,206,214,0.1),transparent_30%),radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:auto,auto,14px_14px] opacity-80" />
              <div className="relative">
                <div className="mb-7 flex items-center justify-center gap-2.5">
                  {[0, 1, 2, 3, 4].map((step) => (
                    <button
                      key={step}
                      onClick={() => {
                        if (step > 0 && !authState) return;
                        setOnboardingStep(step as 0 | 1 | 2 | 3 | 4);
                      }}
                      className={clsx(
                        'h-1.5 rounded-full transition-all duration-300',
                        onboardingStep === step ? 'w-9 bg-[#c7ccd4] shadow-[0_0_18px_rgba(199,204,212,0.4)]' : 'w-7 bg-white/30 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)] hover:bg-white/38',
                        step > 0 && !authState && 'opacity-35'
                      )}
                      aria-label={`Go to step ${step + 1}`}
                    />
                  ))}
                </div>

                <div className={clsx('mx-auto flex flex-col items-center text-center', onboardingStep === 4 ? 'max-w-[560px]' : 'max-w-[420px]')}>
                  <div className={clsx('mb-6 flex items-center justify-center rounded-[30px] border border-white/12 bg-[linear-gradient(180deg,rgba(255,255,255,0.15),rgba(255,255,255,0.02))] shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_18px_50px_rgba(0,0,0,0.36)]', onboardingStep === 4 ? 'h-24 w-24' : 'h-28 w-28')}>
                    <div className={clsx('flex items-center justify-center rounded-[24px] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.22),rgba(255,255,255,0.04)_45%,rgba(0,0,0,0.55)_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]', onboardingStep === 4 ? 'h-16 w-16' : 'h-20 w-20')}>
                      {onboardingStepIcon}
                    </div>
                  </div>
                  <h2 className={clsx('font-extrabold text-white', onboardingStep === 4 ? 'text-3xl md:text-4xl' : 'text-4xl md:text-5xl')}>{onboardingStepTitle}</h2>
                  <p className={clsx('mt-3 text-white/55', onboardingStep === 4 ? 'text-sm leading-6' : 'text-base leading-7')}>{onboardingStepBody}</p>
                </div>

                <div className={clsx('mx-auto mt-8', onboardingStep === 4 ? 'max-w-[760px]' : 'max-w-[520px]')}>
                  {onboardingStep === 0 && (
                    <div className="space-y-4">
                      {!authFlowActive ? (
                        <button
                          onClick={() => { void startLogin(); }}
                          className="group flex w-full items-center gap-4 rounded-[24px] border border-white/10 bg-white/[0.03] px-5 py-5 text-left transition hover:bg-white/[0.06]"
                        >
                          <div className="flex h-14 w-14 items-center justify-center rounded-[18px] border border-white/12 bg-[rgba(201,206,214,0.12)]">
                            <Send size={18} className="text-[#c7ccd4]" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xl font-extrabold text-white">Continue with Microsoft</p>
                            <p className="mt-1 text-sm text-white/54">Secure device-code login using your Microsoft and Minecraft account.</p>
                          </div>
                          <div className="flex h-12 w-12 items-center justify-center rounded-[16px] border border-white/10 bg-white/[0.03] text-white/72 transition group-hover:translate-x-0.5">
                            <span className="text-xl">→</span>
                          </div>
                        </button>
                      ) : (
                        <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
                          <p className="text-[10px] uppercase tracking-[0.18em] font-extrabold text-white/42">Your login code</p>
                          <p className="mt-3 text-4xl font-extrabold tracking-[0.22em] text-[#c7ccd4]">{authCode || '--------'}</p>
                          <p className="mt-2 break-all text-xs text-white/50">{authLink}</p>
                          <div className="mt-4 grid grid-cols-3 gap-2">
                            <button onClick={() => { void openLoginInBrowser(); }} className="rounded-[16px] border border-[#c7ccd4]/30 bg-[rgba(201,206,214,0.14)] px-3 py-3 text-xs font-extrabold uppercase tracking-[0.12em] text-white">Open</button>
                            <button onClick={() => navigator.clipboard.writeText(authCode || '')} className="rounded-[16px] border border-white/10 bg-white/[0.03] px-3 py-3 text-xs font-extrabold uppercase tracking-[0.12em] text-white/85">Copy</button>
                            <button onClick={() => { cancelLogin(); dismissAuthOverlay(); }} className="rounded-[16px] border border-white/10 bg-white/[0.03] px-3 py-3 text-xs font-extrabold uppercase tracking-[0.12em] text-white/85">Cancel</button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {onboardingStep === 1 && authState && (
                    <div className="space-y-4">
                      <button
                        onClick={() => setOnboardingStep(2)}
                        className="group flex w-full items-center gap-4 rounded-[24px] border border-white/10 bg-white/[0.03] px-5 py-5 text-left transition hover:bg-white/[0.06]"
                      >
                        <div className="flex h-14 w-14 items-center justify-center rounded-[18px] border border-white/12 bg-[rgba(201,206,214,0.12)]">
                          <User size={18} className="text-[#c7ccd4]" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xl font-extrabold text-white">Use {authState.profile.name}</p>
                          <p className="mt-1 text-sm text-white/54">Move into profile setup and finish your first-run launcher style.</p>
                        </div>
                        <div className="flex h-12 w-12 items-center justify-center rounded-[16px] border border-white/10 bg-white/[0.03] text-white/72 transition group-hover:translate-x-0.5">
                          <span className="text-xl">→</span>
                        </div>
                      </button>
                    </div>
                  )}

                  {onboardingStep === 2 && authState && (
                    <>
                      <input ref={onboardingProfileUploadRef} type="file" accept="image/*" className="hidden" onChange={onProfileInputChange} />
                      <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
                        <div className="flex flex-col items-center gap-5 text-center">
                          <div className="h-32 w-32 overflow-hidden rounded-full border border-white/15 bg-black/30">
                            <img
                              src={displayAvatar || `https://crafatar.com/avatars/${authState.profile.id}?size=112&default=MHF_Steve`}
                              alt="Profile preview"
                              className="h-full w-full object-cover"
                            />
                          </div>
                          <div className="flex w-full flex-col gap-3 sm:flex-row">
                            <button onClick={() => onboardingProfileUploadRef.current?.click()} className="flex-1 rounded-[18px] border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-bold text-white transition hover:bg-white/[0.06]">
                              Upload picture
                            </button>
                            <button onClick={() => setOnboardingStep(3)} className="flex-1 rounded-[18px] border border-[#c7ccd4]/30 bg-[rgba(201,206,214,0.14)] px-4 py-3 text-sm font-extrabold text-white transition hover:bg-[rgba(201,206,214,0.2)]">
                              Continue
                            </button>
                          </div>
                          <button onClick={clearProfileAvatar} className="text-xs font-extrabold uppercase tracking-[0.16em] text-white/52 transition hover:text-white/78">
                            Reset picture
                          </button>
                        </div>
                      </div>
                    </>
                  )}

                  {onboardingStep === 3 && (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {ONBOARDING_THEME_OPTIONS.map((theme) => (
                        <button
                          key={theme.id}
                          onClick={() => {
                            setThemeMode(theme.id);
                            setOnboardingStep(4);
                          }}
                          className={clsx(
                            'group flex w-full items-center gap-3 rounded-[22px] border px-4 py-4 text-left transition',
                            themeMode === theme.id
                              ? 'border-[#c7ccd4]/30 bg-[rgba(201,206,214,0.12)]'
                              : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'
                          )}
                        >
                          <div className="flex h-14 w-14 items-center justify-center rounded-[18px] border border-white/12 bg-[rgba(201,206,214,0.12)]">
                            {theme.id === 'gray' ? <Layers size={18} className="text-[#c7ccd4]" /> : theme.id === 'ocean' ? <Waves size={18} className="text-[#c7ccd4]" /> : <Gift size={18} className="text-[#c7ccd4]" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xl font-extrabold text-white">{theme.label}</p>
                            <p className="mt-1 text-sm text-white/54">{theme.hint}</p>
                          </div>
                          <div className="flex h-12 w-12 items-center justify-center rounded-[16px] border border-white/10 bg-white/[0.03] text-white/72 transition group-hover:translate-x-0.5">
                            <span className="text-xl">→</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  {onboardingStep === 4 && (
                    <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
                      {ONBOARDING_ACCENT_OPTIONS.map((accent) => (
                        <button
                          key={accent.id}
                          onClick={() => {
                            setAccentMode(accent.id);
                            completeOnboarding();
                          }}
                          className={clsx(
                            'group flex w-full items-center gap-4 rounded-[24px] border px-5 py-5 text-left transition',
                            accentMode === accent.id
                              ? 'border-[#c7ccd4]/30 bg-[rgba(201,206,214,0.12)]'
                              : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'
                          )}
                        >
                          <div className="flex h-12 w-12 items-center justify-center rounded-[16px] border border-white/12 bg-[rgba(201,206,214,0.12)]">
                            <Palette size={16} className="text-[#c7ccd4]" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-base font-extrabold text-white">{accent.label}</p>
                            <div className="mt-2 h-4 w-24 rounded-md border border-white/12" style={{ background: accent.swatch }} />
                          </div>
                          <div className="flex h-10 w-10 items-center justify-center rounded-[14px] border border-white/10 bg-white/[0.03] text-white/72 transition group-hover:translate-x-0.5">
                            <span className="text-xl">→</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mx-auto mt-8 flex max-w-[520px] items-center justify-between gap-3">
                  <button
                    onClick={() => setOnboardingStep(onboardingStep === 0 ? 0 : onboardingStep === 1 ? 0 : onboardingStep === 2 ? 1 : onboardingStep === 3 ? 2 : 3)}
                    disabled={onboardingStep === 0}
                    className="rounded-[18px] border border-white/10 bg-white/[0.03] px-5 py-3 text-sm font-semibold text-white/74 transition hover:bg-white/[0.06] disabled:opacity-40"
                  >
                    Back
                  </button>
                  {onboardingStep > 0 && onboardingStep < 4 && (
                    <button
                      onClick={() => setOnboardingStep(onboardingStep === 0 ? 1 : onboardingStep === 1 ? 2 : onboardingStep === 2 ? 3 : 4)}
                      className="rounded-[18px] border border-white/10 bg-white/[0.03] px-5 py-3 text-sm font-semibold text-white/74 transition hover:bg-white/[0.06]"
                    >
                      Skip
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="absolute right-5 top-20 z-[300] max-w-md g-panel-strong p-3">
          <p className="text-xs font-extrabold text-red-300">Sign-in error: {error}</p>
          <button onClick={clearError} className="text-xs font-extrabold uppercase mt-2 text-white/75">Dismiss</button>
        </div>
      )}

      {authFlowActive && showClientShell && (
        <div className="absolute inset-0 z-[301] bg-black/65 backdrop-blur-sm flex items-center justify-center p-4 app-region-no-drag">
          <div className="w-full max-w-xl g-panel-strong p-6 border-white/15">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] g-accent-text">Microsoft Login</p>
            <h3 className="text-3xl font-extrabold mt-1 text-white">Authorize your account</h3>
            <p className="text-sm text-white/65 mt-1">Open the link, enter your code, then wait for automatic confirmation.</p>

            <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-[10px] uppercase tracking-[0.14em] font-extrabold text-white/45">Code</p>
              <p className="text-4xl font-extrabold tracking-[0.22em] g-accent-text mt-1">{authCode || '--------'}</p>
              <p className="text-xs text-white/55 mt-1">{authLink}</p>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2">
              <button onClick={() => { void openLoginInBrowser(); }} className="g-btn-accent h-11 text-xs font-extrabold uppercase tracking-[0.12em] inline-flex items-center justify-center gap-1"><Send size={12} /> Open</button>
              <button onClick={() => navigator.clipboard.writeText(authCode || '')} className="g-btn h-11 text-xs font-extrabold uppercase tracking-[0.12em]">Copy</button>
              <button onClick={() => { cancelLogin(); dismissAuthOverlay(); }} className="g-btn h-11 text-xs font-extrabold uppercase tracking-[0.12em]">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {avatarContextMenu && (
        <div
          className="g-context-menu fixed z-[2147483000] min-w-[190px] rounded-xl p-1.5 shadow-2xl"
          style={{ left: `${avatarContextMenu.x}px`, top: `${avatarContextMenu.y}px` }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <button
            onClick={() => {
              setAccountOpen(true);
              setAvatarContextMenu(null);
            }}
            className="g-context-item w-full rounded-lg px-3 py-2 text-left text-xs font-extrabold uppercase tracking-[0.12em]"
          >
            Account Dropdown
          </button>
          <button
            onClick={() => {
              navigate('/settings');
              setAvatarContextMenu(null);
            }}
            className="g-context-item w-full rounded-lg px-3 py-2 text-left text-xs font-extrabold uppercase tracking-[0.12em]"
          >
            Account Settings
          </button>
          <button
            onClick={() => {
              runQuickLaunchLastInstance();
              setAvatarContextMenu(null);
            }}
            className="g-context-item w-full rounded-lg px-3 py-2 text-left text-xs font-extrabold uppercase tracking-[0.12em]"
          >
            Launch Last Instance
          </button>
          <button
            onClick={() => {
              runOpenLogs();
              setAvatarContextMenu(null);
            }}
            className="g-context-item w-full rounded-lg px-3 py-2 text-left text-xs font-extrabold uppercase tracking-[0.12em]"
          >
            Open Logs
          </button>
          <button
            onClick={() => {
              runRefreshMods();
              setAvatarContextMenu(null);
            }}
            className="g-context-item w-full rounded-lg px-3 py-2 text-left text-xs font-extrabold uppercase tracking-[0.12em]"
          >
            Refresh Mods
          </button>
        </div>
      )}
    </div>
  );
}

