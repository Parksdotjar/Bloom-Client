import { useState, useEffect } from 'react';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { TauriApi, type Instance } from '../services/tauri';

export interface DownloadProgressEvent {
    id: string;
    status: string;
    progress: number;
    speed: string;
    remediation?: 'disable_essential_conflict';
}

export function useDownloader() {
    const [activeDownloads, setActiveDownloads] = useState<Record<string, DownloadProgressEvent>>({});

    useEffect(() => {
        let unlisten: UnlistenFn | null = null;

        const setupListener = async () => {
            unlisten = await listen<DownloadProgressEvent>('download_progress', (event) => {
                const payload = event.payload;
                setActiveDownloads(prev => ({
                    ...prev,
                    [payload.id]: payload
                }));
            });
        };

        setupListener();

        return () => {
            if (unlisten) {
                unlisten();
            }
        };
    }, []);

    const startDownload = async (instance: Instance, authState?: any) => {
        const instanceId = instance.id;
        try {
            // Seed initial state so UI knows it started
            setActiveDownloads(prev => ({
                ...prev,
                [instanceId]: {
                    id: instanceId,
                    status: 'Initializing download...',
                    progress: 0,
                    speed: '0 B/s'
                }
            }));

            await invoke('instance_install', { instanceId });

            setActiveDownloads(prev => ({
                ...prev,
                [instanceId]: {
                    id: instanceId,
                    status: 'Launching game...',
                    progress: 100,
                    speed: ''
                }
            }));

            await invoke('instance_launch', {
                config: {
                    instance_id: instanceId,
                    java_path: instance.java?.pathOverride?.trim() || (instance.java?.runtime === 'java17' ? 'java17' : 'java'),
                    max_memory_mb: instance.memoryMb || 4096,
                    username: authState?.profile?.name || 'Player',
                    uuid: authState?.profile?.id || '00000000-0000-0000-0000-000000000000',
                    access_token: authState?.mc_access_token || 'dummy_token_for_now'
                }
            });

            // Clear active download state to reset the button
            setTimeout(() => {
                setActiveDownloads(prev => {
                    const newD = { ...prev };
                    delete newD[instanceId];
                    return newD;
                });
            }, 3000);
        } catch (e: any) {
            console.error("Downloader error:", e);
            const message = e?.toString?.() ?? String(e);
            const needsEssentialFix = message.toLowerCase().includes('compatibility check failed')
                && message.toLowerCase().includes('essential');
            // Update state to show error
            setActiveDownloads(prev => ({
                ...prev,
                [instanceId]: {
                    id: instanceId,
                    status: `Error: ${message}`,
                    progress: 0,
                    speed: '',
                    remediation: needsEssentialFix ? 'disable_essential_conflict' : undefined
                }
            }));
        }
    };

    const disableIncompatibleMods = async (instanceId: string) => {
        const disabled = await TauriApi.instanceDisableIncompatibleMods(instanceId);
        const detail = disabled.length > 0
            ? `Disabled: ${disabled.join(', ')}. Click Launch again.`
            : 'No incompatible mod jars were found in this instance mods folder.';

        setActiveDownloads(prev => ({
            ...prev,
            [instanceId]: {
                id: instanceId,
                status: detail,
                progress: 0,
                speed: '',
            }
        }));

        return disabled;
    };

    return { activeDownloads, startDownload, disableIncompatibleMods };
}
