export type UiSoundPackMode = 'off' | 'creamy' | 'thocky' | 'osu';
export type UiSoundKind = 'click' | 'hover' | 'scroll' | 'notification';

export const UI_SOUND_CHANGE_EVENT = 'bloom-sound-change';

export const UI_SOUND_PACK_KEY = 'bloom_sound_pack';
export const UI_SOUND_CLICKS_ENABLED_KEY = 'bloom_sound_clicks_enabled';
export const UI_SOUND_HOVERS_ENABLED_KEY = 'bloom_sound_hovers_enabled';
export const UI_SOUND_SCROLL_ENABLED_KEY = 'bloom_sound_scroll_enabled';
export const UI_SOUND_NOTIFICATIONS_ENABLED_KEY = 'bloom_sound_notifications_enabled';
export const UI_SOUND_VOLUME_KEY = 'bloom_sound_volume';
export const UI_SOUND_PITCH_KEY = 'bloom_sound_pitch';
export const UI_SOUND_REVERB_KEY = 'bloom_sound_reverb';
export const UI_SOUND_TONE_KEY = 'bloom_sound_tone';
export const UI_SOUND_DECAY_KEY = 'bloom_sound_decay';

export function clampUiSoundPercent(value: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(100, Math.round(value)));
}

