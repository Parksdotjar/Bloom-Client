import { invoke } from '@tauri-apps/api/core';

export type ExternalUpdate = {
  version: string;
  installerUrl: string;
  assetName: string;
};

export const UPDATE_AUTO_CHECK_KEY = 'bloom_updates_auto_check_enabled';
export const UPDATE_NOTIFICATIONS_KEY = 'bloom_updates_notifications_enabled';
export const UPDATE_SETTINGS_CHANGE_EVENT = 'bloom-update-settings-change';

export type UpdatePreferences = {
  autoCheck: boolean;
  notifications: boolean;
};

function isTauriRuntime() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export function readUpdatePreferences(): UpdatePreferences {
  if (typeof window === 'undefined') {
    return { autoCheck: true, notifications: true };
  }
  return {
    autoCheck: localStorage.getItem(UPDATE_AUTO_CHECK_KEY) !== 'false',
    notifications: localStorage.getItem(UPDATE_NOTIFICATIONS_KEY) !== 'false'
  };
}

export function writeUpdatePreferences(partial: Partial<UpdatePreferences>) {
  if (typeof window === 'undefined') return;
  const next = {
    ...readUpdatePreferences(),
    ...partial
  };
  localStorage.setItem(UPDATE_AUTO_CHECK_KEY, next.autoCheck ? 'true' : 'false');
  localStorage.setItem(UPDATE_NOTIFICATIONS_KEY, next.notifications ? 'true' : 'false');
  window.dispatchEvent(new CustomEvent(UPDATE_SETTINGS_CHANGE_EVENT, { detail: next }));
}

export async function checkForLauncherUpdate() {
  if (!isTauriRuntime()) {
    return { update: null as ExternalUpdate | null, error: 'Updater is available only in desktop app builds.' };
  }
  try {
    const update = await invoke<ExternalUpdate | null>('external_update_check');
    return { update, error: null as string | null };
  } catch (error) {
    return { update: null as ExternalUpdate | null, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function downloadAndInstallLauncherUpdate(update: ExternalUpdate) {
  if (!isTauriRuntime()) {
    throw new Error('Updater is available only in desktop app builds.');
  }
  await invoke<void>('external_update_install', {
    installerUrl: update.installerUrl,
    version: update.version
  });
}
