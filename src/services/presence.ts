import { invoke } from '@tauri-apps/api/core';

function isTauriRuntime() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export async function setDiscordPresence(details: string, state?: string) {
  if (!isTauriRuntime()) return;
  try {
    await invoke('discord_presence_set', { payload: { details, state } });
  } catch (error) {
    // Keep presence best-effort so launcher UX never breaks.
    console.debug('Discord presence set failed:', error);
  }
}

export async function clearDiscordPresence() {
  if (!isTauriRuntime()) return;
  try {
    await invoke('discord_presence_clear');
  } catch (error) {
    console.debug('Discord presence clear failed:', error);
  }
}

