import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Bell, Maximize2, Minus, Move, Search, Send, User, X } from 'lucide-react';
import { animate, engine, remove, set } from 'animejs';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { SidebarRail } from './SidebarRail';
import { Particles } from './Particles';
import { useAuth } from '../hooks/useAuth';
import { useInstances } from '../hooks/useInstances';
import { useDownloader } from '../hooks/useDownloader';
import { APP_VERSION } from '../constants/version';
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

type LauncherTheme = 'light' | 'light-gray' | 'dark' | 'gray' | 'true-dark' | 'ocean' | 'forest' | 'sunset' | 'paper' | 'crt' | 'synthwave' | 'sandstone' | 'minecraft' | 'cartoon' | 'strength-smp' | 'blueprint' | 'holo-grid' | 'lavaforge' | 'candy-pop' | 'mono-ink';
type AccentMode = 'purple' | 'cyan' | 'emerald' | 'amber' | 'rose' | 'rainbow';
type BackgroundMode = 'plus' | 'particles' | 'aurora' | 'scanlines' | 'nebula';
type DensityMode = 'compact' | 'cozy' | 'spacious';
type FontPackMode = 'manrope' | 'space-grotesk' | 'sora';
type SidebarMode = 'rail' | 'classic' | 'expanded';
type CardStyleMode = 'glass' | 'solid' | 'outline';
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

type SkinPreset = {
  id: string;
  name: string;
  previewDataUrl: string;
  model: 'classic' | 'slim';
  createdAt: number;
};

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
const CARD_STYLE_STORAGE_KEY = 'bloom_card_style';
const CARD_STYLE_CHANGE_EVENT = 'bloom-card-style-change';
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
const GLASS_AMOUNT_KEY = 'bloom_glass_amount';
const GLASS_AMOUNT_CHANGE_EVENT = 'bloom-glass-amount-change';
const SHORTCUT_SEARCH_KEY = 'bloom_shortcut_search';
const SHORTCUT_CREATE_INSTANCE_KEY = 'bloom_shortcut_create_instance';
const SHORTCUT_SETTINGS_KEY = 'bloom_shortcut_settings';
const SHORTCUT_REPLAY_STARTUP_SCENE_KEY = 'bloom_shortcut_replay_startup_scene';
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

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  }) as Promise<T>;
}

function dataUrlToBytes(dataUrl: string): number[] {
  const parts = dataUrl.split(',');
  const base64 = parts.length > 1 ? parts[1] : '';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return Array.from(bytes);
}

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

function isTypingTarget(target: EventTarget | null): boolean {
  const node = target as HTMLElement | null;
  if (!node) return false;
  const tag = node.tagName?.toLowerCase();
  return tag === 'input' || tag === 'textarea' || node.isContentEditable;
}

export function Layout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();

  const [themeMode, setThemeMode] = useState<LauncherTheme>(() => {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
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
    return stored === 'plus' || stored === 'particles' || stored === 'aurora' || stored === 'scanlines' || stored === 'nebula'
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
  const [cardStyleMode, setCardStyleMode] = useState<CardStyleMode>(() => {
    const stored = localStorage.getItem(CARD_STYLE_STORAGE_KEY);
    return stored === 'glass' || stored === 'solid' || stored === 'outline' ? stored : 'glass';
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
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [avatarContextMenu, setAvatarContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [skinModel, setSkinModel] = useState<'classic' | 'slim'>('classic');
  const [skinPresets, setSkinPresets] = useState<SkinPreset[]>([]);
  const [skinStatus, setSkinStatus] = useState<string | null>(null);
  const [uploadingSkin, setUploadingSkin] = useState(false);
  const [quickLaunchInstanceId, setQuickLaunchInstanceId] = useState<string>(() => localStorage.getItem(ACCOUNT_LAUNCH_INSTANCE_KEY) || '');

  const searchRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const notifRef = useRef<HTMLDivElement | null>(null);
  const accountRef = useRef<HTMLDivElement | null>(null);
  const accountUploadRef = useRef<HTMLInputElement | null>(null);
  const profileUploadRef = useRef<HTMLInputElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const mainRef = useRef<HTMLElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const lastHoverSoundAtRef = useRef<number>(0);

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
    uploadSkin,
    setProfileAvatar,
    clearProfileAvatar
  } = useAuth();
  const { instances } = useInstances();
  const { startDownload } = useDownloader();

  const presetsKey = authState ? `bloom_skin_presets_${authState.profile.id}` : null;

  const entries: SearchEntry[] = useMemo(() => {
    const base: SearchEntry[] = [
      { id: 'home', label: 'Home', description: 'Launcher overview', route: '/' },
      { id: 'instances', label: 'Instances', description: 'Create and edit instances', route: '/instances' },
      { id: 'mods', label: 'Mods Market', description: 'Search and install mods', route: '/mods' },
      { id: 'modpacks', label: 'Modpacks', description: 'Install modpacks into new instances', route: '/modpacks' },
      { id: 'resourcepacks', label: 'Resource Packs', description: 'Search and install resource packs', route: '/resourcepacks' },
      { id: 'skins', label: 'Skin Studio', description: '3D skin preview and presets', route: '/skins' },
      { id: 'downloads', label: 'Downloads', description: 'Track install progress', route: '/downloads' },
      { id: 'widgets', label: 'Widgets', description: 'Manage per-page widgets and visibility', route: '/widgets' },
      { id: 'settings', label: 'Settings', description: 'Theme and launcher options', route: '/settings' }
    ];
    if (!authState) base.push({ id: 'signin', label: 'Sign In', description: 'Connect Microsoft account', action: 'signin' });
    return base;
  }, [authState]);

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
    const roundnessMult = 0.45 + (clamped / 100) * 1.55;
    document.documentElement.style.setProperty('--g-roundness-mult', String(roundnessMult));
    localStorage.setItem(ROUNDNESS_KEY, String(clamped));
  }, [roundnessLevel]);

  useEffect(() => {
    const clamped = Math.max(0, Math.min(100, Math.round(glassAmount)));
    const blurMult = 0.25 + (clamped / 100) * 1.35;
    const opacityMult = 0.2 + (clamped / 100) * 0.8;
    document.documentElement.style.setProperty('--g-glass-blur-mult', String(blurMult));
    document.documentElement.style.setProperty('--g-glass-opacity-mult', String(opacityMult));
    localStorage.setItem(GLASS_AMOUNT_KEY, String(clamped));
  }, [glassAmount]);

  useEffect(() => {
    const accent = ACCENT_MAP[accentMode] || ACCENT_MAP.purple;
    document.documentElement.style.setProperty('--g-accent', accent.accent);
    document.documentElement.style.setProperty('--g-accent-soft', accent.soft);
    document.documentElement.style.setProperty('--g-accent-gradient', accent.gradient);
    localStorage.setItem(ACCENT_STORAGE_KEY, accentMode);
  }, [accentMode]);

  useEffect(() => {
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
    document.documentElement.setAttribute('data-card-style', cardStyleMode);
    localStorage.setItem(CARD_STYLE_STORAGE_KEY, cardStyleMode);
  }, [cardStyleMode]);

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
      const custom = event as CustomEvent<{ background?: BackgroundMode }>;
      const requestedBackground = custom.detail?.background;
      if (requestedBackground === 'plus' || requestedBackground === 'particles' || requestedBackground === 'aurora' || requestedBackground === 'scanlines' || requestedBackground === 'nebula') {
        setBackgroundMode(requestedBackground);
      }
    };

    window.addEventListener(BACKGROUND_CHANGE_EVENT, onBackgroundChange as EventListener);
    return () => window.removeEventListener(BACKGROUND_CHANGE_EVENT, onBackgroundChange as EventListener);
  }, []);

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
    if (!presetsKey) {
      setSkinPresets([]);
      return;
    }
    try {
      const raw = localStorage.getItem(presetsKey);
      if (!raw) {
        setSkinPresets([]);
        return;
      }
      const parsed = JSON.parse(raw) as SkinPreset[];
      setSkinPresets(parsed);
    } catch {
      setSkinPresets([]);
    }
  }, [presetsKey]);

  useEffect(() => {
    if (!presetsKey) return;
    localStorage.setItem(presetsKey, JSON.stringify(skinPresets));
  }, [presetsKey, skinPresets]);

  useEffect(() => {
    const blockNativeContextMenu = (event: MouseEvent) => {
      event.preventDefault();
    };
    window.addEventListener('contextmenu', blockNativeContextMenu);
    return () => window.removeEventListener('contextmenu', blockNativeContextMenu);
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
      const searchShortcut = normalizeShortcut(localStorage.getItem(SHORTCUT_SEARCH_KEY) || 'Ctrl+K');
      const createShortcut = normalizeShortcut(localStorage.getItem(SHORTCUT_CREATE_INSTANCE_KEY) || 'Ctrl+N');
      const settingsShortcut = normalizeShortcut(localStorage.getItem(SHORTCUT_SETTINGS_KEY) || 'Ctrl+,');
      const replayStartupSceneShortcut = normalizeShortcut(localStorage.getItem(SHORTCUT_REPLAY_STARTUP_SCENE_KEY) || 'Ctrl+Shift+J');
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
      if (isTypingTarget(event.target)) return;

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
      if (event.key === 'Escape') {
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
  }, [navigate, startupSceneSoundProfile]);

  useEffect(() => {
    if (!mainRef.current) return;
    const nodes = Array.from(mainRef.current.querySelectorAll('.js-giga-reveal'));
    if (nodes.length === 0) return;
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
  }, [location.pathname, motionTuning]);

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

  const runEntry = (entry: SearchEntry) => {
    if (entry.route) navigate(entry.route);
    if (entry.action === 'signin') void startLogin();
    setSearchOpen(false);
    setSearchQuery('');
  };

  const storePreset = (name: string, previewDataUrl: string, model: 'classic' | 'slim') => {
    setSkinPresets((prev) => [{ id: crypto.randomUUID(), name, previewDataUrl, model, createdAt: Date.now() }, ...prev].slice(0, 24));
  };

  const handleUploadSkinFile = async (file: File) => {
    if (!authState) return;
    if (!file.type.startsWith('image/')) {
      setSkinStatus('Please upload a PNG skin file.');
      return;
    }

    setUploadingSkin(true);
    setSkinStatus('Uploading skin...');

    try {
      const buffer = await file.arrayBuffer();
      const bytes = Array.from(new Uint8Array(buffer));

      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('Failed reading skin file.'));
        reader.onload = () => resolve(String(reader.result));
        reader.readAsDataURL(file);
      });

      await withTimeout(uploadSkin(file.name, bytes, skinModel), 35000, 'Skin upload timed out.');
      storePreset(file.name, dataUrl, skinModel);
      setSkinStatus('Skin applied successfully.');
    } catch (err) {
      setSkinStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setUploadingSkin(false);
    }
  };

  const onSkinInputChange: React.ChangeEventHandler<HTMLInputElement> = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    void handleUploadSkinFile(file);
    event.target.value = '';
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

  const applyPreset = async (preset: SkinPreset) => {
    try {
      setUploadingSkin(true);
      setSkinStatus('Applying preset...');
      await uploadSkin(preset.name, dataUrlToBytes(preset.previewDataUrl), preset.model);
      setSkinStatus('Preset applied.');
    } catch (err) {
      setSkinStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setUploadingSkin(false);
    }
  };

  const removePreset = (id: string) => {
    setSkinPresets((prev) => prev.filter((preset) => preset.id !== id));
  };

  const runQuickLaunchLastInstance = () => {
    if (!quickLaunchInstance) return;
    void startDownload(quickLaunchInstance, authState);
  };

  const runOpenLogs = () => {
    navigate('/downloads');
  };

  const runRefreshMods = () => {
    window.dispatchEvent(new CustomEvent(MODS_REFRESH_EVENT, { detail: { source: 'quick-action', fallbackQuery: 'optimization' } }));
    navigate('/mods');
  };

  const openAvatarContextMenu = (event: React.MouseEvent) => {
    event.preventDefault();
    setAvatarContextMenu({ x: event.clientX, y: event.clientY });
  };
  const iconStrokeWidth = iconPack === 'bold' ? 2.6 : iconPack === 'pixel' ? 2.2 : iconPack === 'rounded' ? 1.9 : 2;
  const density = DENSITY_MAP[densityMode] || DENSITY_MAP.cozy;

  return (
    <div ref={rootRef} className="g-window-shell w-full h-full flex overflow-hidden text-[var(--g-text)]">
      {backgroundMode === 'particles' && <Particles />}
      {backgroundMode === 'plus' && <div className="pointer-events-none absolute inset-0 g-bg-plus" />}
      {backgroundMode === 'aurora' && <div className="pointer-events-none absolute inset-0 g-bg-aurora" />}
      {backgroundMode === 'scanlines' && <div className="pointer-events-none absolute inset-0 g-bg-scanlines" />}
      {backgroundMode === 'nebula' && <div className="pointer-events-none absolute inset-0 g-bg-nebula" />}

      <SidebarRail
        className="js-giga-reveal"
        themeMode={themeMode}
        sidebarMode={sidebarMode}
        toggleTheme={() => {}}
        onQuickLaunch={runQuickLaunchLastInstance}
        onOpenLogs={runOpenLogs}
        onRefreshMods={runRefreshMods}
      />

      <div className="flex-1 min-w-0 h-full flex flex-col relative">
        <header
          data-tauri-drag-region
          className="js-giga-reveal app-region-drag border-b backdrop-blur-xl px-5 flex items-center gap-3 relative z-[120] overflow-visible"
          style={{ background: 'var(--g-shell)', borderColor: 'var(--g-sidebar-border)', height: `${density.headerHeight}px` }}
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
              <div className="absolute top-[47px] left-0 right-0 z-[250] g-panel-strong p-2">
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
            <button onClick={() => setNotificationsOpen((v) => !v)} className="h-10 w-10 rounded-xl border border-white/12 bg-white/[0.04] text-white/75 inline-flex items-center justify-center">
              <Bell size={15} strokeWidth={iconStrokeWidth} />
            </button>

            <div ref={notifRef} className="relative">
              {notificationsOpen && (
                <div className="absolute right-0 top-[44px] z-[260] w-[320px] g-panel-strong p-3">
                  <p className="text-[10px] tracking-[0.16em] uppercase font-extrabold g-accent-text">Notifications</p>
                  <div className="mt-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                    <p className="text-xs font-extrabold text-white">Beta Test Enabled</p>
                    <p className="text-xs text-white/60 mt-1">You are receiving preview updates.</p>
                  </div>
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
                <div className="absolute right-0 top-[46px] z-[270] w-[420px] g-panel-strong p-4">
                  {!authState ? (
                    <div>
                      <p className="text-lg font-extrabold">Account</p>
                      <p className="text-sm g-muted mt-1">Sign in to manage skins and profile.</p>
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
                      </div>

                      <div className="mt-4 g-panel p-3">
                        <p className="text-[10px] uppercase tracking-[0.16em] font-extrabold g-accent-text">Skin Studio</p>
                        <div className="mt-2 flex items-center gap-2">
                          <select
                            value={skinModel}
                            onChange={(event) => setSkinModel(event.target.value as 'classic' | 'slim')}
                            className="h-9 rounded-lg border border-white/12 bg-white/[0.04] px-3 text-sm font-bold text-white outline-none"
                          >
                            <option value="classic" className="text-black">Classic</option>
                            <option value="slim" className="text-black">Slim</option>
                          </select>
                          <input ref={accountUploadRef} type="file" accept="image/png" className="hidden" onChange={onSkinInputChange} />
                          <button
                            onClick={() => accountUploadRef.current?.click()}
                            disabled={uploadingSkin}
                            className="g-btn-accent px-3 h-9 text-xs font-extrabold tracking-[0.12em] uppercase disabled:opacity-50"
                          >
                            {uploadingSkin ? 'Uploading...' : 'Upload Skin'}
                          </button>
                        </div>
                        {skinStatus && <p className="text-xs text-white/60 mt-2">{skinStatus}</p>}
                      </div>

                      <div className="mt-3">
                        <p className="text-[10px] uppercase tracking-[0.16em] font-extrabold text-white/50 mb-2">Saved Skins</p>
                        <div className="grid grid-cols-4 gap-2 max-h-[180px] overflow-y-auto pr-1">
                          {skinPresets.map((preset) => (
                            <div key={preset.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-1.5">
                              <button onClick={() => { void applyPreset(preset); }} className="w-full rounded-md overflow-hidden border border-white/10">
                                <img src={preset.previewDataUrl} alt={preset.name} className="w-full h-16 object-cover" />
                              </button>
                              <p className="mt-1 text-[10px] font-bold text-white/70 truncate">{preset.name}</p>
                              <button onClick={() => removePreset(preset.id)} className="text-[10px] font-extrabold uppercase tracking-wider text-red-300 mt-0.5">Remove</button>
                            </div>
                          ))}
                          {skinPresets.length === 0 && <p className="col-span-4 text-xs text-white/45">No saved skins yet.</p>}
                        </div>
                      </div>
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

        <main ref={mainRef} className="flex-1 min-h-0 overflow-y-auto app-region-no-drag" style={{ padding: density.mainPadding }}>
          <div className="min-h-full">{children}</div>
        </main>
      </div>

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

      {error && (
        <div className="absolute right-5 top-20 z-[300] max-w-md g-panel-strong p-3">
          <p className="text-xs font-extrabold text-red-300">Sign-in error: {error}</p>
          <button onClick={clearError} className="text-xs font-extrabold uppercase mt-2 text-white/75">Dismiss</button>
        </div>
      )}

      {authFlowActive && (
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
