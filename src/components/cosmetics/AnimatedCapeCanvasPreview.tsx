import { useEffect, useRef } from 'react';
import { AnimatedCapeRuntime } from '../../services/animatedCapeRuntime';

type AnimatedCapeCanvasPreviewProps = {
  runtime: AnimatedCapeRuntime | null;
  className?: string;
  paused?: boolean;
  fit?: 'contain' | 'cover';
  showFrame?: boolean;
};

export function AnimatedCapeCanvasPreview({
  runtime,
  className,
  paused = false,
  fit = 'contain',
  showFrame = true
}: AnimatedCapeCanvasPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let raf = 0;
    const start = performance.now();

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      const ctx = canvas.getContext('2d', { alpha: true });
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
    };

    const draw = (now: number) => {
      const ctx = canvas.getContext('2d', { alpha: true });
      if (!ctx) return;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (!width || !height) {
        raf = window.requestAnimationFrame(draw);
        return;
      }

      ctx.clearRect(0, 0, width, height);

      if (runtime) {
        const sourceW = runtime.manifest.frameWidth;
        const sourceH = runtime.manifest.frameHeight;
        const sourceRatio = sourceW / sourceH;
        const targetRatio = width / height;

        let drawW = width;
        let drawH = height;
        if (fit === 'contain') {
          if (targetRatio > sourceRatio) {
            drawH = height;
            drawW = drawH * sourceRatio;
          } else {
            drawW = width;
            drawH = drawW / sourceRatio;
          }
        } else if (targetRatio > sourceRatio) {
          drawW = width;
          drawH = drawW / sourceRatio;
        } else {
          drawH = height;
          drawW = drawH * sourceRatio;
        }

        const dx = Math.floor((width - drawW) / 2);
        const dy = Math.floor((height - drawH) / 2);
        runtime.drawFrame2D(ctx, paused ? 0 : now - start, dx, dy, drawW, drawH);

        if (showFrame) {
          ctx.strokeStyle = 'rgba(255,255,255,0.2)';
          ctx.lineWidth = 1;
          ctx.strokeRect(dx + 0.5, dy + 0.5, Math.max(1, drawW - 1), Math.max(1, drawH - 1));
        }
      }

      if (!paused) {
        raf = window.requestAnimationFrame(draw);
      }
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    raf = window.requestAnimationFrame(draw);

    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(raf);
    };
  }, [runtime, paused, fit, showFrame]);

  return <canvas ref={canvasRef} className={className ?? 'h-full w-full [image-rendering:pixelated]'} />;
}
