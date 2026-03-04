import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { BookImage, Compass, Gamepad2, LayoutDashboard, Layers3, LogIn, Package2, Plus, Settings, Shirt, User } from 'lucide-react';
import { animate, remove, set } from 'animejs';
import { clsx } from 'clsx';
import logo from '../assets/logo.png';
import { useAuth } from '../hooks/useAuth';
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

type LauncherTheme = 'light' | 'light-gray' | 'dark' | 'gray' | 'true-dark' | 'ocean' | 'forest' | 'sunset' | 'paper' | 'crt' | 'synthwave' | 'sandstone';
type SidebarMode = 'rail' | 'classic' | 'expanded';
type IconPackMode = 'default' | 'bold' | 'rounded' | 'pixel';

const EXTRA_CHANGE_EVENT = 'bloom-extra-change';
const SIDEBAR_DOCK_HOVER_ENABLED_KEY = 'bloom_sidebar_dock_hover_enabled';
const SIDEBAR_DOCK_GROW_SIZE_KEY = 'bloom_sidebar_dock_grow_size';
const SIDEBAR_DOCK_GROW_SPEED_KEY = 'bloom_sidebar_dock_grow_speed';
const SIDEBAR_TAB_GAP_KEY = 'bloom_sidebar_tab_gap';
const ICON_PACK_KEY = 'bloom_icon_pack';
const ICON_PACK_CHANGE_EVENT = 'bloom-icon-pack-change';

interface SidebarProps {
  className?: string;
  themeMode: LauncherTheme;
  sidebarMode: SidebarMode;
  toggleTheme: () => void;
  onQuickLaunch?: () => void;
  onOpenLogs?: () => void;
  onRefreshMods?: () => void;
}

export function SidebarRail(props: SidebarProps) {
  const { className, themeMode, sidebarMode, onQuickLaunch, onOpenLogs, onRefreshMods } = props;
  const navigate = useNavigate();
  const location = useLocation();
  const railRef = useRef<HTMLDivElement | null>(null);
  const tabRefs = useRef<(HTMLElement | null)[]>([]);
  const { authState, profileAvatarUrl, startLogin, loading } = useAuth();
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
  const [sidebarDockHoverEnabled, setSidebarDockHoverEnabled] = useState<boolean>(() => localStorage.getItem(SIDEBAR_DOCK_HOVER_ENABLED_KEY) === 'true');
  const [sidebarDockGrowSize, setSidebarDockGrowSize] = useState<number>(() => {
    const stored = Number(localStorage.getItem(SIDEBAR_DOCK_GROW_SIZE_KEY));
    if (Number.isFinite(stored)) return Math.max(0, Math.min(140, Math.round(stored)));
    return 60;
  });
  const [sidebarDockGrowSpeed, setSidebarDockGrowSpeed] = useState<number>(() => {
    const stored = Number(localStorage.getItem(SIDEBAR_DOCK_GROW_SPEED_KEY));
    if (Number.isFinite(stored)) return Math.max(60, Math.min(450, Math.round(stored)));
    return 180;
  });
  const [sidebarTabGap, setSidebarTabGap] = useState<number>(() => {
    const stored = Number(localStorage.getItem(SIDEBAR_TAB_GAP_KEY));
    if (Number.isFinite(stored)) return Math.max(0, Math.min(30, Math.round(stored)));
    return 8;
  });
  const [hoverY, setHoverY] = useState<number | null>(null);
  const [dockHoverReady, setDockHoverReady] = useState(false);
  const [sidebarContextMenu, setSidebarContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [iconPack, setIconPack] = useState<IconPackMode>(() => {
    const stored = localStorage.getItem(ICON_PACK_KEY);
    return stored === 'default' || stored === 'bold' || stored === 'rounded' || stored === 'pixel' ? stored : 'default';
  });
  const showLabels = sidebarMode !== 'rail';
  const sidebarWidth = sidebarMode === 'expanded' ? 126 : sidebarMode === 'rail' ? 76 : 92;
  const iconStrokeWidth = iconPack === 'bold' ? 2.6 : iconPack === 'pixel' ? 2.2 : iconPack === 'rounded' ? 1.9 : 2;

  const navItems = [
    { icon: User, path: '/', label: 'Account' },
    { icon: Gamepad2, path: '/instances', label: 'Play' },
    { icon: Layers3, path: '/mods', label: 'Mods' },
    { icon: Package2, path: '/modpacks', label: 'Packs' },
    { icon: BookImage, path: '/resourcepacks', label: 'R Packs' },
    { icon: Shirt, path: '/skins', label: 'Skins' },
    { icon: Compass, path: '/downloads', label: 'Library' },
    { icon: LayoutDashboard, path: '/widgets', label: 'Widgets' },
    { icon: Settings, path: '/settings', label: 'Settings' }
  ];

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
      setMotionTuning(clampMotionTuning(custom.detail || {}));
    };
    window.addEventListener(MOTION_TUNING_EVENT, onMotionTuningChange as EventListener);
    return () => window.removeEventListener(MOTION_TUNING_EVENT, onMotionTuningChange as EventListener);
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
    const onExtraChange = (event: Event) => {
      const custom = event as CustomEvent<{
        sidebarDockHoverEnabled?: boolean;
        sidebarDockGrowSize?: number;
        sidebarDockGrowSpeed?: number;
        sidebarTabGap?: number;
      }>;
      if (typeof custom.detail?.sidebarDockHoverEnabled === 'boolean') {
        setSidebarDockHoverEnabled(custom.detail.sidebarDockHoverEnabled);
      }
      if (Number.isFinite(custom.detail?.sidebarDockGrowSize)) {
        setSidebarDockGrowSize(Math.max(0, Math.min(140, Math.round(Number(custom.detail?.sidebarDockGrowSize)))));
      }
      if (Number.isFinite(custom.detail?.sidebarDockGrowSpeed)) {
        setSidebarDockGrowSpeed(Math.max(60, Math.min(450, Math.round(Number(custom.detail?.sidebarDockGrowSpeed)))));
      }
      if (Number.isFinite(custom.detail?.sidebarTabGap)) {
        setSidebarTabGap(Math.max(0, Math.min(30, Math.round(Number(custom.detail?.sidebarTabGap)))));
      }
    };
    window.addEventListener(EXTRA_CHANGE_EVENT, onExtraChange as EventListener);
    return () => window.removeEventListener(EXTRA_CHANGE_EVENT, onExtraChange as EventListener);
  }, []);

  useEffect(() => {
    if (!sidebarContextMenu) return;
    const close = () => setSidebarContextMenu(null);
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
  }, [sidebarContextMenu]);

  useEffect(() => {
    if (!railRef.current) return;

    const nodes = Array.from(railRef.current.querySelectorAll('.js-side-item'));
    if (nodes.length === 0) return;
    setDockHoverReady(false);
    setHoverY(null);
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
    const totalAnimationMs =
      Math.max(motionTuning.animDurationMs, motionTuning.fadeDurationMs) + (Math.max(0, nodes.length - 1) * motionTuning.staggerMs);
    const readyTimer = window.setTimeout(() => {
      setDockHoverReady(true);
    }, totalAnimationMs + 24);

    return () => {
      window.clearTimeout(readyTimer);
      moveAnimation.pause();
      fadeAnimation.pause();
    };
  }, [location.pathname, authState?.profile.id, motionTuning]);

  const getDockStyle = (index: number) => {
    const baseHalfGap = sidebarTabGap / 2;
    const transformTransition = `transform ${sidebarDockGrowSpeed}ms cubic-bezier(0.22, 1, 0.36, 1)`;
    const gapTransitionMs = Math.max(60, Math.round(sidebarDockGrowSpeed * 0.55));
    const gapTransition = `margin-top ${gapTransitionMs}ms cubic-bezier(0.22, 1, 0.36, 1), margin-bottom ${gapTransitionMs}ms cubic-bezier(0.22, 1, 0.36, 1)`;
    const isHoverTracking = sidebarDockHoverEnabled && dockHoverReady && hoverY !== null;
    const transition = isHoverTracking ? 'none' : `${transformTransition}, ${gapTransition}`;
    if (!sidebarDockHoverEnabled || !dockHoverReady || hoverY === null) {
      return {
        transition,
        willChange: 'transform, margin-top, margin-bottom',
        transform: 'scale(1)',
        marginTop: `${baseHalfGap}px`,
        marginBottom: `${baseHalfGap}px`
      };
    }

    const element = tabRefs.current[index];
    if (!element) {
      return {
        transition,
        willChange: 'transform, margin-top, margin-bottom',
        transform: 'scale(1)',
        marginTop: `${baseHalfGap}px`,
        marginBottom: `${baseHalfGap}px`
      };
    }

    const rect = element.getBoundingClientRect();
    const centerY = rect.top + rect.height / 2;
    const distance = Math.abs(hoverY - centerY);
    const radius = 230;
    const influence = Math.max(0, 1 - distance / radius);
    const maxScaleBoost = (sidebarDockGrowSize / 100) * 0.85;
    const scale = 1 + influence * maxScaleBoost;
    // Reserve the exact visual growth from center scaling so items never overlap.
    // A centered scale grows by extra/2 on top and extra/2 on bottom.
    const baseHeight = element.offsetHeight || rect.height;
    const extraHeight = (scale - 1) * baseHeight;
    const spread = extraHeight / 2;

    return {
      transition,
      willChange: 'transform, margin-top, margin-bottom',
      transform: `scale(${scale})`,
      marginTop: `${baseHalfGap + spread}px`,
      marginBottom: `${baseHalfGap + spread}px`,
      zIndex: Math.round(influence * 100) + 1
    } as const;
  };

  return (
    <aside
      ref={railRef}
      onContextMenu={(event) => {
        event.preventDefault();
        setSidebarContextMenu({ x: event.clientX, y: event.clientY });
      }}
      onMouseMove={(event) => {
        if (!sidebarDockHoverEnabled || !dockHoverReady) return;
        setHoverY(event.clientY);
      }}
      onMouseLeave={() => setHoverY(null)}
      className={clsx(
        'h-full flex flex-col items-center py-4 border-r backdrop-blur-xl transition-[width,padding,margin,border-radius] duration-200',
        sidebarMode === 'expanded' && 'px-1',
        sidebarMode === 'rail' && 'px-1',
        sidebarMode === 'classic' && 'px-0',
        sidebarMode === 'expanded' && 'rounded-r-2xl',
        className
      )}
      style={{
        width: `${sidebarWidth}px`,
        background: 'var(--g-sidebar)',
        borderColor: 'var(--g-sidebar-border)',
        boxShadow: themeMode === 'true-dark' ? 'inset -1px 0 0 rgba(66,66,66,0.5)' : undefined,
        margin: sidebarMode === 'expanded' ? '8px 0 8px 8px' : undefined
      }}
    >
      <div className="js-side-item w-14 h-14 rounded-2xl border border-white/15 bg-white/5 flex items-center justify-center overflow-hidden">
        <img src={logo} alt="Bloom" className="w-10 h-10 object-contain" style={{ transform: 'scale(2.4)' }} />
      </div>

      <div className="js-side-item mt-4 w-12 h-12 rounded-xl border border-white/15 bg-white/5 overflow-hidden flex items-center justify-center">
        {authState ? (
          <img
            src={profileAvatarUrl || authState.profile.skinUrl || `https://crafatar.com/avatars/${authState.profile.id}?size=64&default=MHF_Steve`}
            alt="Account"
            className="w-full h-full object-cover"
          />
        ) : (
          <button
            onClick={() => { void startLogin(); }}
            disabled={loading}
            className="w-full h-full inline-flex items-center justify-center text-white/75"
            title="Sign In"
          >
            {loading ? <span className="w-4 h-4 border-2 border-white/70 border-t-transparent rounded-full animate-spin" /> : <LogIn size={16} strokeWidth={iconStrokeWidth} />}
          </button>
        )}
      </div>

      <nav className="mt-4 w-full flex-1 px-2 flex flex-col">
        {navItems.map((item, index) => (
          <NavLink
            key={item.label}
            to={item.path}
            ref={(element) => {
              tabRefs.current[index] = element;
            }}
            style={getDockStyle(index)}
            className={({ isActive }) => clsx(
              'js-side-item js-side-tab rounded-xl border flex flex-col items-center justify-center text-[11px] font-bold tracking-wide transition-colors origin-center',
              showLabels ? 'h-14' : 'h-12',
              isActive
                ? 'g-btn-accent text-white'
                : 'border-white/10 bg-white/[0.03] text-white/45 hover:text-white/75 hover:bg-white/[0.08]'
            )}
          >
            <item.icon size={16} strokeWidth={iconStrokeWidth} />
            {showLabels && <span className="mt-1">{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      <NavLink
        to="/instances?action=create"
        ref={(element) => {
          tabRefs.current[navItems.length] = element;
        }}
        style={getDockStyle(navItems.length)}
        className="js-side-item w-12 h-12 rounded-xl border border-white/15 bg-white/5 text-white/75 hover:bg-white/10 inline-flex items-center justify-center"
        title="Create"
      >
        <Plus size={18} strokeWidth={iconStrokeWidth} />
      </NavLink>

      {sidebarContextMenu && (
        <div
          className="g-context-menu fixed z-[2147483000] min-w-[170px] rounded-xl p-1.5 shadow-2xl"
          style={{ left: `${sidebarContextMenu.x}px`, top: `${sidebarContextMenu.y}px` }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <button
            onClick={() => {
              navigate('/settings');
              setSidebarContextMenu(null);
            }}
            className="g-context-item w-full rounded-lg px-3 py-2 text-left text-xs font-extrabold uppercase tracking-[0.12em]"
          >
            Settings
          </button>
          <button
            onClick={() => {
              onQuickLaunch?.();
              setSidebarContextMenu(null);
            }}
            className="g-context-item w-full rounded-lg px-3 py-2 text-left text-xs font-extrabold uppercase tracking-[0.12em]"
          >
            Launch Last Instance
          </button>
          <button
            onClick={() => {
              onOpenLogs?.();
              setSidebarContextMenu(null);
            }}
            className="g-context-item w-full rounded-lg px-3 py-2 text-left text-xs font-extrabold uppercase tracking-[0.12em]"
          >
            Open Logs
          </button>
          <button
            onClick={() => {
              onRefreshMods?.();
              setSidebarContextMenu(null);
            }}
            className="g-context-item w-full rounded-lg px-3 py-2 text-left text-xs font-extrabold uppercase tracking-[0.12em]"
          >
            Refresh Mods
          </button>
          <button
            onClick={() => {
              navigate('/widgets');
              setSidebarContextMenu(null);
            }}
            className="g-context-item w-full rounded-lg px-3 py-2 text-left text-xs font-extrabold uppercase tracking-[0.12em]"
          >
            Widgets
          </button>
        </div>
      )}
    </aside>
  );
}
