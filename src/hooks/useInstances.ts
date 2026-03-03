import { useState, useEffect } from 'react';
import { TauriApi, Instance } from '../services/tauri';

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const timeoutPromise = new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
    });

    return Promise.race([promise, timeoutPromise]).finally(() => {
        if (timeoutId) clearTimeout(timeoutId);
    }) as Promise<T>;
}

export function useInstances() {
    const [instances, setInstances] = useState<Instance[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const loadInstances = async () => {
        try {
            setLoading(true);
            const data = await withTimeout(
                TauriApi.instancesList(),
                10000,
                'Timed out while loading instances. Restart the launcher and try again.'
            );
            setInstances(data);
            setError(null);
        } catch (err: any) {
            setError(err.toString());
        } finally {
            setLoading(false);
        }
    };

    const createInstance = async (payload: Instance) => {
        try {
            await TauriApi.instancesCreate(payload);
            await loadInstances();
        } catch (err: any) {
            setError(err.toString());
            throw err;
        }
    };

    const deleteInstance = async (id: string) => {
        try {
            await TauriApi.instancesDelete(id);
            await loadInstances();
        } catch (err: any) {
            setError(err.toString());
            throw err;
        }
    };

    const updateInstance = async (id: string, payload: Instance) => {
        try {
            await TauriApi.instancesUpdate(id, payload);
            await loadInstances();
        } catch (err: any) {
            setError(err.toString());
            throw err;
        }
    };

    useEffect(() => {
        loadInstances();
    }, []);

    return {
        instances,
        loading,
        error,
        loadInstances,
        createInstance,
        updateInstance,
        deleteInstance
    };
}
