export const MOTION_TUNING_EVENT = 'bloom-motion-tuning-change';

export const MOTION_ANIM_DURATION_KEY = 'bloom_motion_anim_duration';
export const MOTION_FADE_DURATION_KEY = 'bloom_motion_fade_duration';
export const MOTION_STAGGER_KEY = 'bloom_motion_stagger';
export const MOTION_OFFSET_X_KEY = 'bloom_motion_offset_x';
export const MOTION_OFFSET_Y_KEY = 'bloom_motion_offset_y';
export const MOTION_EASING_PRESET_KEY = 'bloom_motion_easing_preset';
export const MOTION_EASING_X1_KEY = 'bloom_motion_easing_x1';
export const MOTION_EASING_Y1_KEY = 'bloom_motion_easing_y1';
export const MOTION_EASING_X2_KEY = 'bloom_motion_easing_x2';
export const MOTION_EASING_Y2_KEY = 'bloom_motion_easing_y2';

export type MotionEasingPreset = 'out-quad' | 'out-cubic' | 'in-out-cubic' | 'out-back' | 'out-elastic' | 'linear' | 'custom';

export type MotionTuning = {
  animDurationMs: number;
  fadeDurationMs: number;
  staggerMs: number;
  offsetX: number;
  offsetY: number;
  easingPreset: MotionEasingPreset;
  easingX1: number;
  easingY1: number;
  easingX2: number;
  easingY2: number;
};

export const MOTION_TUNING_DEFAULTS: MotionTuning = {
  animDurationMs: 420,
  fadeDurationMs: 300,
  staggerMs: 45,
  offsetX: 0,
  offsetY: 10,
  easingPreset: 'out-quad',
  easingX1: 0.25,
  easingY1: 0.1,
  easingX2: 0.25,
  easingY2: 1
};

export function clampMotionTuning(input: Partial<MotionTuning>): MotionTuning {
  const d = MOTION_TUNING_DEFAULTS;
  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, Math.round(value)));
  const clampFloat = (value: number, min: number, max: number) => Math.max(min, Math.min(max, Number(value.toFixed(2))));
  const easingPreset = input.easingPreset;
  const nextPreset: MotionEasingPreset = easingPreset === 'out-quad' || easingPreset === 'out-cubic' || easingPreset === 'in-out-cubic' || easingPreset === 'out-back' || easingPreset === 'out-elastic' || easingPreset === 'linear' || easingPreset === 'custom'
    ? easingPreset
    : d.easingPreset;
  return {
    animDurationMs: clamp(input.animDurationMs ?? d.animDurationMs, 120, 1400),
    fadeDurationMs: clamp(input.fadeDurationMs ?? d.fadeDurationMs, 80, 1400),
    staggerMs: clamp(input.staggerMs ?? d.staggerMs, 0, 220),
    offsetX: clamp(input.offsetX ?? d.offsetX, -70, 70),
    offsetY: clamp(input.offsetY ?? d.offsetY, -70, 70),
    easingPreset: nextPreset,
    easingX1: clampFloat(input.easingX1 ?? d.easingX1, 0, 1),
    easingY1: clampFloat(input.easingY1 ?? d.easingY1, 0, 1),
    easingX2: clampFloat(input.easingX2 ?? d.easingX2, 0, 1),
    easingY2: clampFloat(input.easingY2 ?? d.easingY2, 0, 1)
  };
}

export function resolveMotionEase(tuning: MotionTuning): string {
  switch (tuning.easingPreset) {
    case 'out-cubic':
      return 'outCubic';
    case 'in-out-cubic':
      return 'inOutCubic';
    case 'out-back':
      return 'outBack';
    case 'out-elastic':
      return 'outElastic';
    case 'linear':
      return 'linear';
    case 'custom':
      return `cubicBezier(${tuning.easingX1}, ${tuning.easingY1}, ${tuning.easingX2}, ${tuning.easingY2})`;
    case 'out-quad':
    default:
      return 'outQuad';
  }
}
