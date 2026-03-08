import React, { createContext, useContext, useEffect, useState } from 'react';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { TauriApi, type Instance } from '../services/tauri';
import { setDiscordPresence } from '../services/presence';

export interface DownloadProgressEvent {
    id: string;
    status: string;
    progress: number;
    speed: string;
    remediation?: 'disable_essential_conflict';
}

type DownloaderContextValue = {
    activeDownloads: Record<string, DownloadProgressEvent>;
    startDownload: (instance: Instance, authState?: any) => Promise<void>;
    disableIncompatibleMods: (instanceId: string) => Promise<string[]>;
};

const DownloaderContext = createContext<DownloaderContextValue | null>(null);

function useDownloaderController(): DownloaderContextValue {
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
            void setDiscordPresence('Installing instance', instance.name);

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
            void setDiscordPresence('Launching Minecraft', `${instance.name} (${instance.loader.toUpperCase()} ${instance.mcVersion})`);

            let authForLaunch = authState;
            const refreshToken = authState?.msRefreshToken || authState?.ms_refresh_token;
            if (refreshToken) {
                try {
                    const refreshed = await invoke<any>('auth_refresh_session', { refreshToken });
                    authForLaunch = refreshed;
                    localStorage.setItem('bloom_auth_state', JSON.stringify(refreshed));
                } catch (refreshErr) {
                    console.warn('Auth refresh failed, using existing token for launch:', refreshErr);
                }
            }

            const mcToken =
                authForLaunch?.mcAccessToken ||
                authForLaunch?.mc_access_token ||
                authState?.mcAccessToken ||
                authState?.mc_access_token ||
                'dummy_token_for_now';

            await invoke('instance_launch', {
                config: {
                    instance_id: instanceId,
                    java_path: instance.java?.pathOverride?.trim() || (instance.java?.runtime === 'java17' ? 'java17' : 'java'),
                    max_memory_mb: instance.memoryMb || 4096,
                    username: authForLaunch?.profile?.name || authState?.profile?.name || 'Player',
                    uuid: authForLaunch?.profile?.id || authState?.profile?.id || '00000000-0000-0000-0000-000000000000',
                    access_token: mcToken
                }
            });

            setActiveDownloads(prev => ({
                ...prev,
                [instanceId]: {
                    id: instanceId,
                    status: 'Game launch started',
                    progress: 100,
                    speed: ''
                }
            }));
            void setDiscordPresence('Playing Minecraft', `${instance.name} (${instance.mcVersion})`);

            // Keep status visible longer so it does not look like it instantly disappeared.
            setTimeout(() => {
                setActiveDownloads(prev => {
                    const newD = { ...prev };
                    delete newD[instanceId];
                    return newD;
                });
            }, 15000);
        } catch (e: any) {
            console.error("Downloader error:", e);
            const message = e?.message ?? e?.toString?.() ?? String(e);
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

export function DownloaderProvider({ children }: { children: React.ReactNode }) {
    const value = useDownloaderController();
    return React.createElement(DownloaderContext.Provider, { value }, children);
}

export function useDownloader() {
    const context = useContext(DownloaderContext);
    if (!context) {
        throw new Error('useDownloader must be used within DownloaderProvider');
    }
    return context;
}
