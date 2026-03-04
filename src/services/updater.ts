import { invoke } from '@tauri-apps/api/core';

export type ExternalUpdate = {
  version: string;
  installerUrl: string;
  assetName: string;
};

function isTauriRuntime() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
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
