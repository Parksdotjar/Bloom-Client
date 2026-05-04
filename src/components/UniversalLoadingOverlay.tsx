import { useEffect, useMemo, useState } from 'react';

export type UniversalLoadingStyle = 'orbit' | 'bars' | 'prism' | 'pulse';
export type UniversalLoadingMode = 'notification' | 'fullscreen';

export const UNIVERSAL_LOADING_STYLE_KEY = 'bloom_instance_install_loading_style';
export const UNIVERSAL_LOADING_MODE_KEY = 'bloom_instance_install_loading_mode';
export const UNIVERSAL_LOADING_COMPLETE_EVENT = 'bloom-universal-loading-complete';

export function readUniversalLoadingStyle(): UniversalLoadingStyle {
  const stored = localStorage.getItem(UNIVERSAL_LOADING_STYLE_KEY);
  return stored === 'orbit' || stored === 'bars' || stored === 'prism' || stored === 'pulse' ? stored : 'orbit';
}

export function readUniversalLoadingMode(): UniversalLoadingMode {
  const stored = localStorage.getItem(UNIVERSAL_LOADING_MODE_KEY);
  return stored === 'fullscreen' || stored === 'notification' ? stored : 'notification';
}

function normalizedProgressValue(progress: number): number {
  return Math.max(0, Math.min(100, progress));
}

function LoadingArt({ style }: { style: UniversalLoadingStyle }) {
  if (style === 'bars') {
    return (
      <div className="flex h-20 min-w-[96px] items-end justify-center gap-2 rounded-[22px] border border-white/10 bg-white/[0.03] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
        {[0, 1, 2, 3].map((index) => (
          <span
            key={index}
            className="block w-2.5 shrink-0 rounded-full bg-white/92 animate-pulse shadow-[0_0_12px_rgba(255,255,255,0.18)]"
            style={{ height: `${22 + index * 8}px`, animationDelay: `${index * 120}ms`, animationDuration: '1100ms' }}
          />
        ))}
      </div>
    );
  }

  if (style === 'prism') {
    return (
      <div className="relative h-20 w-20">
        <div className="absolute inset-0 rounded-[24px] border border-white/18 bg-white/[0.02]" />
        <div className="absolute inset-3 animate-spin rounded-[16px] border border-white/65" style={{ animationDuration: '1800ms' }} />
        <div className="absolute inset-[26px] rotate-45 rounded-[8px] bg-white/92 shadow-[0_0_18px_rgba(255,255,255,0.26)]" />
      </div>
    );
  }

  if (style === 'pulse') {
    return (
      <div className="relative h-20 w-20">
        <span className="absolute inset-2 rounded-full border border-white/25 animate-ping" style={{ animationDuration: '1400ms' }} />
        <span className="absolute inset-4 rounded-full border border-white/45 animate-ping" style={{ animationDuration: '1400ms', animationDelay: '200ms' }} />
        <span className="absolute inset-[30px] rounded-full bg-white/92 shadow-[0_0_14px_rgba(255,255,255,0.3)]" />
      </div>
    );
  }

  return (
    <div className="relative h-20 w-20">
      <span className="absolute inset-2 rounded-full border border-white/18" />
      <span className="absolute inset-4 rounded-full border border-white/55 animate-spin" style={{ animationDuration: '1600ms' }} />
      <span className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/92 shadow-[0_0_14px_rgba(255,255,255,0.28)]" />
      <span className="absolute left-1/2 top-2 h-3 w-3 -translate-x-1/2 rounded-full bg-white/78 animate-spin" style={{ transformOrigin: '50% 32px', animationDuration: '1600ms' }} />
    </div>
  );
}

type Props = {
  open: boolean;
  title: string;
  description?: string;
  eyebrow?: string;
  fixed?: boolean;
  className?: string;
  progress?: number | null;
  onCancel?: () => void;
  cancelLabel?: string;
};

export function UniversalLoadingOverlay({
  open,
  title,
  description,
  eyebrow = 'Working',
  fixed = false,
  className = '',
  progress = null,
  onCancel,
  cancelLabel = 'Cancel'
}: Props) {
  const [style, setStyle] = useState<UniversalLoadingStyle>(() => readUniversalLoadingStyle());
  const [mode, setMode] = useState<UniversalLoadingMode>(() => readUniversalLoadingMode());
  const [visible, setVisible] = useState(open);
  const [complete, setComplete] = useState(false);
  const normalizedProgress = progress === null ? null : normalizedProgressValue(progress);
  const displayProgress = complete ? 100 : normalizedProgress;
  const overlayClassName = useMemo(() => `${fixed ? 'fixed' : 'absolute'} inset-0 z-[140] ${className}`, [className, fixed]);

  useEffect(() => {
    if (open) {
      setVisible(true);
      setComplete(false);
      setStyle(readUniversalLoadingStyle());
      setMode(readUniversalLoadingMode());
      return;
    }

    if (!visible) return;
    setComplete(true);
    window.dispatchEvent(new CustomEvent(UNIVERSAL_LOADING_COMPLETE_EVENT));
    const timer = window.setTimeout(() => {
      setVisible(false);
      setComplete(false);
    }, 640);
    return () => window.clearTimeout(timer);
  }, [open, visible]);

  useEffect(() => {
    if (!visible) return;
    setStyle(readUniversalLoadingStyle());
    setMode(readUniversalLoadingMode());
  }, [visible]);

  if (!visible) return null;

  if (mode === 'notification') {
    return (
      <div className={`fixed inset-0 z-[140] pointer-events-none ${className}`}>
        <style>{`
          @keyframes notification-loader-in { from { transform: translateY(-10px) scale(0.98); opacity: 0; } to { transform: translateY(0) scale(1); opacity: 1; } }
          @keyframes notification-loader-out { to { transform: translateY(-8px) scale(0.98); opacity: 0; } }
          @keyframes notification-loader-bar { to { background-position: 34px 0; } }
        `}</style>
        <div
          className={[
            'pointer-events-auto absolute right-4 top-[58px] w-[min(360px,calc(100vw-2rem))] rounded-xl border border-[#343941]/70 bg-[linear-gradient(180deg,#111111,#0b0b0b)] p-3 shadow-[0_18px_44px_rgba(0,0,0,0.38)]',
            complete ? 'animate-[notification-loader-out_260ms_360ms_ease-in_forwards]' : 'animate-[notification-loader-in_220ms_ease-out_both]'
          ].join(' ')}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/42">{eyebrow}</p>
              <p className="mt-0.5 truncate text-sm font-black text-white">{title}</p>
            </div>
            {onCancel && (
              <button
                onClick={onCancel}
                className="h-7 rounded-md border border-[#343941]/70 bg-white/[0.03] px-2 text-[10px] font-extrabold uppercase tracking-[0.1em] text-white/72 transition hover:border-[#4b535d] hover:bg-white/[0.08] hover:text-white"
              >
                {cancelLabel}
              </button>
            )}
          </div>
          {description && <p className="mt-1 truncate text-xs text-white/52">{complete ? 'Complete' : description}</p>}
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,color-mix(in_srgb,var(--g-accent)_62%,black),var(--g-accent),color-mix(in_srgb,var(--g-accent)_74%,white))] transition-[width] duration-150 ease-out"
              style={{
                width: displayProgress === null ? '58%' : `${displayProgress}%`,
                animation: undefined
              }}
            />
          </div>
          {displayProgress !== null && <p className="mt-1 text-right text-[10px] font-black text-white/58">{displayProgress.toFixed(0)}%</p>}
        </div>
      </div>
    );
  }

  return (
    <div className={`${overlayClassName} flex items-center justify-center bg-black/72 backdrop-blur-xl`}>
      <div className="flex w-full max-w-[360px] flex-col items-center px-8 text-center">
        <LoadingArt style={style} />
        <p className="mt-7 text-[11px] font-black uppercase tracking-[0.24em] text-white/42">{eyebrow}</p>
        <p className="mt-3 text-2xl font-black text-white">{title}</p>
        {description && <p className="mt-2 text-sm text-white/55">{description}</p>}
        {normalizedProgress !== null && (
          <div className="mt-4 w-full">
            <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-white/85 transition-[width] duration-150" style={{ width: `${displayProgress ?? 0}%` }} />
            </div>
            <p className="mt-1 text-[10px] font-bold text-white/60">{(displayProgress ?? 0).toFixed(0)}%</p>
          </div>
        )}
        {onCancel && (
          <button
            onClick={onCancel}
            className="mt-5 h-9 rounded-md border border-white/12 bg-white/[0.03] px-4 text-[11px] font-extrabold uppercase tracking-[0.12em] text-white/80 transition hover:bg-white/[0.08] hover:text-white"
          >
            {cancelLabel}
          </button>
        )}
      </div>
    </div>
  );
}
