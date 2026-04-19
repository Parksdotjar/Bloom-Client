import { useEffect, useState } from 'react';

export type UniversalLoadingStyle = 'orbit' | 'bars' | 'prism' | 'pulse';
export type UniversalLoadingMode = 'fullscreen' | 'compact';

export const UNIVERSAL_LOADING_STYLE_KEY = 'bloom_instance_install_loading_style';
export const UNIVERSAL_LOADING_MODE_KEY = 'bloom_instance_install_loading_mode';

export function readUniversalLoadingStyle(): UniversalLoadingStyle {
  const stored = localStorage.getItem(UNIVERSAL_LOADING_STYLE_KEY);
  return stored === 'orbit' || stored === 'bars' || stored === 'prism' || stored === 'pulse' ? stored : 'orbit';
}

export function readUniversalLoadingMode(): UniversalLoadingMode {
  const stored = localStorage.getItem(UNIVERSAL_LOADING_MODE_KEY);
  return stored === 'compact' || stored === 'fullscreen' ? stored : 'fullscreen';
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
  const normalizedProgress = progress === null ? null : normalizedProgressValue(progress);

  useEffect(() => {
    if (!open) return;
    setStyle(readUniversalLoadingStyle());
    setMode(readUniversalLoadingMode());
  }, [open]);

  if (!open) return null;

  if (mode === 'compact') {
    return (
      <div className={`${fixed ? 'fixed' : 'absolute'} inset-0 z-[140] pointer-events-none ${className}`}>
        <div className={`pointer-events-auto absolute ${fixed ? 'bottom-6 right-6' : 'bottom-4 right-4'} w-[min(460px,calc(100vw-2rem))] rounded-[20px] border border-white/12 bg-[linear-gradient(180deg,rgba(12,12,14,0.95),rgba(8,8,10,0.97))] p-4 shadow-[0_24px_60px_rgba(0,0,0,0.48)] backdrop-blur-xl`}>
          <div className="flex items-start gap-3">
            <div className="shrink-0 rounded-[14px] border border-white/12 bg-white/[0.03] p-2">
              <LoadingArt style={style} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/45">{eyebrow} · Bloom</p>
              <p className="mt-1 truncate text-[24px] leading-none font-black text-white">{title}</p>
              {description && <p className="mt-2 text-sm text-white/58">{description}</p>}
            </div>
            {onCancel && (
              <button
                onClick={onCancel}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/12 bg-white/[0.03] text-white/65 transition hover:bg-white/[0.08] hover:text-white"
                title={cancelLabel}
              >
                ×
              </button>
            )}
          </div>

          {normalizedProgress !== null && (
            <div className="mt-3">
              <div className="h-2 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-[var(--g-accent)] transition-[width] duration-150" style={{ width: `${normalizedProgress}%` }} />
              </div>
              <p className="mt-1 text-[11px] font-bold text-white/62">{normalizedProgress.toFixed(0)}%</p>
            </div>
          )}

          {onCancel && (
            <div className="mt-3 flex justify-end">
              <button
                onClick={onCancel}
                className="h-8 rounded-md border border-white/12 bg-white/[0.03] px-3 text-[11px] font-extrabold uppercase tracking-[0.12em] text-white/80 transition hover:bg-white/[0.08] hover:text-white"
              >
                {cancelLabel}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`${fixed ? 'fixed' : 'absolute'} inset-0 z-[140] flex items-center justify-center bg-black/72 backdrop-blur-xl ${className}`}>
      <div className="flex w-full max-w-[360px] flex-col items-center px-8 text-center">
        <LoadingArt style={style} />
        <p className="mt-7 text-[11px] font-black uppercase tracking-[0.24em] text-white/42">{eyebrow}</p>
        <p className="mt-3 text-2xl font-black text-white">{title}</p>
        {description && <p className="mt-2 text-sm text-white/55">{description}</p>}
        {normalizedProgress !== null && (
          <div className="mt-4 w-full">
            <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-white/85 transition-[width] duration-150" style={{ width: `${normalizedProgress}%` }} />
            </div>
            <p className="mt-1 text-[10px] font-bold text-white/60">{normalizedProgress.toFixed(0)}%</p>
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
