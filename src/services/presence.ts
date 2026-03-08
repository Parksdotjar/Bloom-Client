import { invoke } from '@tauri-apps/api/core';

function isTauriRuntime() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

let pendingPresenceTimer: ReturnType<typeof setTimeout> | null = null;
let lastQueuedPresenceKey = '';

export async function setDiscordPresence(details: string, state?: string) {
  if (!isTauriRuntime()) return;
  const presenceKey = `${details}::${state ?? ''}`;
  if (presenceKey === lastQueuedPresenceKey) return;
  lastQueuedPresenceKey = presenceKey;

  if (pendingPresenceTimer) {
    clearTimeout(pendingPresenceTimer);
  }

  pendingPresenceTimer = setTimeout(() => {
    pendingPresenceTimer = null;
    void invoke('discord_presence_set', { payload: { details, state } }).catch((error) => {
      // Keep presence best-effort so launcher UX never breaks.
      console.debug('Discord presence set failed:', error);
    });
  }, 250);
}

export async function clearDiscordPresence() {
  if (!isTauriRuntime()) return;
  lastQueuedPresenceKey = '';
  if (pendingPresenceTimer) {
    clearTimeout(pendingPresenceTimer);
    pendingPresenceTimer = null;
  }
  try {
    await invoke('discord_presence_clear');
  } catch (error) {
    console.debug('Discord presence clear failed:', error);
  }
}
