import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

export interface FabricLoaderVersion {
    loader: {
        version: string;
        stable: boolean;
    };
}

export function useFabric(mcVersion: string, isFabric: boolean) {
    const [versions, setVersions] = useState<FabricLoaderVersion[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!isFabric || !mcVersion) return;

        const fetchVersions = async () => {
            setLoading(true);
            try {
                const data = await invoke<FabricLoaderVersion[]>('fabric_versions_list', { mcVersion });
                setVersions(data);
            } catch (e) {
                console.error("Failed to fetch Fabric versions:", e);
                setVersions([]);
            } finally {
                setLoading(false);
            }
        };

        fetchVersions();
    }, [mcVersion, isFabric]);

    const latestStable = versions.find(v => v.loader.stable)?.loader.version
        || versions[0]?.loader.version
        || "0.16.5"; // Fallback

    return { versions, loading, latestStable };
}
