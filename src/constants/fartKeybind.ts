export const FART_KEYBIND_UNLOCK_KEY = 'bloom_fart_keybind_unlocked';
export const FART_KEYBIND_UNLOCK_EVENT = 'bloom-fart-keybind-unlock-change';

export function readFartKeybindUnlocked() {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(FART_KEYBIND_UNLOCK_KEY) === 'true';
}
