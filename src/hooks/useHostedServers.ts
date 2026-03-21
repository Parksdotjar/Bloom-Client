import React, { createContext, useContext, useEffect, useState } from 'react';
import {
    HostedServer,
    HostedServerCreateRequest,
    HostedServerUpdateRequest,
    HostedServerStatus,
    TauriApi
} from '../services/tauri';

type HostedServersContextValue = {
    servers: HostedServer[];
    loading: boolean;
    error: string | null;
    loadServers: () => Promise<void>;
    getServer: (serverId: string) => Promise<HostedServer>;
    createServer: (payload: HostedServerCreateRequest) => Promise<HostedServer>;
    updateServer: (serverId: string, payload: HostedServerUpdateRequest) => Promise<HostedServer>;
    deleteServer: (serverId: string) => Promise<void>;
    startServer: (serverId: string) => Promise<HostedServerStatus>;
    stopServer: (serverId: string) => Promise<HostedServerStatus>;
    restartServer: (serverId: string) => Promise<HostedServerStatus>;
    getStatus: (serverId: string) => Promise<HostedServerStatus>;
};

const HostedServersContext = createContext<HostedServersContextValue | null>(null);

function useHostedServersController(): HostedServersContextValue {
    const [servers, setServers] = useState<HostedServer[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const loadServers = async () => {
        try {
            setLoading(true);
            const data = await TauriApi.hostedServersList();
            setServers(data);
            setError(null);
        } catch (err: any) {
            setError(String(err));
        } finally {
            setLoading(false);
        }
    };

    const getServer = async (serverId: string) => TauriApi.hostedServersGet(serverId);

    const createServer = async (payload: HostedServerCreateRequest) => {
        try {
            const created = await TauriApi.hostedServersCreate(payload);
            await loadServers();
            return created;
        } catch (err: any) {
            setError(String(err));
            throw err;
        }
    };

    const updateServer = async (serverId: string, payload: HostedServerUpdateRequest) => {
        try {
            const updated = await TauriApi.hostedServersUpdate(serverId, payload);
            await loadServers();
            return updated;
        } catch (err: any) {
            setError(String(err));
            throw err;
        }
    };

    const deleteServer = async (serverId: string) => {
        try {
            await TauriApi.hostedServersDelete(serverId);
            await loadServers();
        } catch (err: any) {
            setError(String(err));
            throw err;
        }
    };

    const startServer = async (serverId: string) => {
        const status = await TauriApi.hostedServersStart(serverId);
        await loadServers();
        return status;
    };

    const stopServer = async (serverId: string) => {
        const status = await TauriApi.hostedServersStop(serverId);
        await loadServers();
        return status;
    };

    const restartServer = async (serverId: string) => {
        const status = await TauriApi.hostedServersRestart(serverId);
        await loadServers();
        return status;
    };

    const getStatus = async (serverId: string) => TauriApi.hostedServersStatus(serverId);

    useEffect(() => {
        void loadServers();
    }, []);

    return {
        servers,
        loading,
        error,
        loadServers,
        getServer,
        createServer,
        updateServer,
        deleteServer,
        startServer,
        stopServer,
        restartServer,
        getStatus
    };
}

export function HostedServersProvider({ children }: { children: React.ReactNode }) {
    const value = useHostedServersController();
    return React.createElement(HostedServersContext.Provider, { value }, children);
}

export function useHostedServers() {
    const context = useContext(HostedServersContext);
    if (!context) {
        throw new Error('useHostedServers must be used within HostedServersProvider');
    }
    return context;
}
