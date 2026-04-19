import { invoke } from '@tauri-apps/api/core';
import { supabase } from './supabase';

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

type SupabaseManifest = {
  version: string;
  installerUrl: string;
  assetName: string;
  fallbackInstallerUrls?: string[];
  windows: {
    installerUrl: string;
    assetName: string;
    nsisUrl: string;
    nsisAssetName: string;
    fallbackInstallerUrls?: string[];
  };
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

function normalizeVersion(input: string) {
  return input.trim().replace(/^v/i, '');
}

export async function publishSupabaseLauncherUpdate(versionInput: string, installerFile: File) {
  const version = normalizeVersion(versionInput);
  if (!version) {
    throw new Error('Version is required (example: 1.4.2).');
  }
  if (!installerFile.name.toLowerCase().endsWith('.exe')) {
    throw new Error('Installer must be a .exe file.');
  }

  const installerObjectPath = `Bloom Client_${version}_x64-setup.exe`;
  const latestAliasObjectPath = 'Bloom Client_latest_x64-setup.exe';
  const latestManifestPath = 'latest.json';

  const uploadVersionedInstaller = await supabase.storage
    .from('updates')
    .upload(installerObjectPath, installerFile, {
      upsert: true,
      contentType: 'application/vnd.microsoft.portable-executable',
      cacheControl: 'no-store'
    });

  if (uploadVersionedInstaller.error) {
    throw new Error(`Failed to upload versioned installer: ${uploadVersionedInstaller.error.message}`);
  }

  const uploadLatestAlias = await supabase.storage
    .from('updates')
    .upload(latestAliasObjectPath, installerFile, {
      upsert: true,
      contentType: 'application/vnd.microsoft.portable-executable',
      cacheControl: 'no-store'
    });

  if (uploadLatestAlias.error) {
    throw new Error(`Failed to upload latest installer alias: ${uploadLatestAlias.error.message}`);
  }

  const versionedInstallerUrl = supabase.storage.from('updates').getPublicUrl(installerObjectPath).data.publicUrl;
  const latestAliasInstallerUrl = supabase.storage.from('updates').getPublicUrl(latestAliasObjectPath).data.publicUrl;

  const manifest: SupabaseManifest = {
    version,
    installerUrl: versionedInstallerUrl,
    assetName: installerObjectPath,
    fallbackInstallerUrls: [latestAliasInstallerUrl],
    windows: {
      installerUrl: versionedInstallerUrl,
      assetName: installerObjectPath,
      nsisUrl: versionedInstallerUrl,
      nsisAssetName: installerObjectPath,
      fallbackInstallerUrls: [latestAliasInstallerUrl]
    }
  };

  const manifestBlob = new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' });
  const uploadManifest = await supabase.storage
    .from('updates')
    .upload(latestManifestPath, manifestBlob, {
      upsert: true,
      contentType: 'application/json',
      cacheControl: 'no-store'
    });

  if (uploadManifest.error) {
    throw new Error(`Failed to upload latest.json: ${uploadManifest.error.message}`);
  }

  return {
    version,
    installerObjectPath,
    latestAliasObjectPath,
    latestManifestPath,
    installerUrl: versionedInstallerUrl
  };
}
