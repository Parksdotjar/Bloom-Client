import React, { createContext, useContext, useEffect, useState } from 'react';
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

type InstancesContextValue = {
    instances: Instance[];
    loading: boolean;
    error: string | null;
    loadInstances: () => Promise<void>;
    createInstance: (payload: Instance) => Promise<void>;
    updateInstance: (id: string, payload: Instance) => Promise<void>;
    deleteInstance: (id: string) => Promise<void>;
};

const InstancesContext = createContext<InstancesContextValue | null>(null);

function useInstancesController(): InstancesContextValue {
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
        void loadInstances();
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

export function InstancesProvider({ children }: { children: React.ReactNode }) {
    const value = useInstancesController();
    return React.createElement(InstancesContext.Provider, { value }, children);
}

export function useInstances() {
    const context = useContext(InstancesContext);
    if (!context) {
        throw new Error('useInstances must be used within InstancesProvider');
    }
    return context;
}
