import { check, type DownloadEvent, type Update } from '@tauri-apps/plugin-updater';

export type UpdaterProgress = {
  downloadedBytes: number;
  totalBytes?: number;
  percent?: number;
  stage: 'idle' | 'downloading' | 'installing' | 'finished';
};

function isTauriRuntime() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export async function checkForLauncherUpdate() {
  if (!isTauriRuntime()) {
    return { update: null as Update | null, error: 'Updater is available only in desktop app builds.' };
  }
  try {
    const update = await check();
    return { update, error: null as string | null };
  } catch (error) {
    return { update: null as Update | null, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function downloadAndInstallLauncherUpdate(
  update: Update,
  onProgress?: (progress: UpdaterProgress) => void
) {
  let downloadedBytes = 0;
  let totalBytes: number | undefined;
  onProgress?.({ stage: 'downloading', downloadedBytes, totalBytes });
  await update.download((event: DownloadEvent) => {
    if (event.event === 'Started') {
      totalBytes = event.data.contentLength;
      downloadedBytes = 0;
      onProgress?.({ stage: 'downloading', downloadedBytes, totalBytes });
      return;
    }
    if (event.event === 'Progress') {
      downloadedBytes += event.data.chunkLength;
      onProgress?.({
        stage: 'downloading',
        downloadedBytes,
        totalBytes,
        percent: totalBytes && totalBytes > 0 ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100)) : undefined
      });
      return;
    }
    onProgress?.({ stage: 'installing', downloadedBytes, totalBytes, percent: 100 });
  });
  await update.install();
  onProgress?.({ stage: 'finished', downloadedBytes, totalBytes, percent: 100 });
}
