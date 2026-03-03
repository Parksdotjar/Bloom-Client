import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

export interface VersionEntry {
    id: string;
    type: string; // "release", "snapshot", "old_beta", "old_alpha"
    url: string;
    time: string;
    releaseTime: string;
}

export interface VersionManifest {
    latest: {
        release: string;
        snapshot: string;
    };
    versions: VersionEntry[];
}

export function useMojang() {
    const [manifest, setManifest] = useState<VersionManifest | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchManifest = async () => {
            setLoading(true);
            try {
                const data = await invoke<VersionManifest>('mc_versions_list');
                setManifest(data);
            } catch (e: any) {
                console.error("Failed to fetch mojang manifest:", e);
                setError(e.toString());
            } finally {
                setLoading(false);
            }
        };

        fetchManifest();
    }, []);

    const releases = manifest?.versions.filter(v => v.type === 'release') || [];
    const snapshots = manifest?.versions.filter(v => v.type === 'snapshot') || [];

    return { manifest, releases, snapshots, loading, error };
}
