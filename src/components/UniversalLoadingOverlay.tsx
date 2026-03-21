import { useEffect, useState } from 'react';

export type UniversalLoadingStyle = 'orbit' | 'bars' | 'prism' | 'pulse';

export const UNIVERSAL_LOADING_STYLE_KEY = 'bloom_instance_install_loading_style';

export function readUniversalLoadingStyle(): UniversalLoadingStyle {
  const stored = localStorage.getItem(UNIVERSAL_LOADING_STYLE_KEY);
  return stored === 'orbit' || stored === 'bars' || stored === 'prism' || stored === 'pulse' ? stored : 'orbit';
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
};

export function UniversalLoadingOverlay({ open, title, description, eyebrow = 'Working', fixed = false, className = '' }: Props) {
  const [style, setStyle] = useState<UniversalLoadingStyle>(() => readUniversalLoadingStyle());

  useEffect(() => {
    if (!open) return;
    setStyle(readUniversalLoadingStyle());
  }, [open]);

  if (!open) return null;

  return (
    <div className={`${fixed ? 'fixed' : 'absolute'} inset-0 z-[140] flex items-center justify-center bg-black/72 backdrop-blur-xl ${className}`}>
      <div className="flex w-full max-w-[360px] flex-col items-center px-8 text-center">
        <LoadingArt style={style} />
        <p className="mt-7 text-[11px] font-black uppercase tracking-[0.24em] text-white/42">{eyebrow}</p>
        <p className="mt-3 text-2xl font-black text-white">{title}</p>
        {description && <p className="mt-2 text-sm text-white/55">{description}</p>}
      </div>
    </div>
  );
}
