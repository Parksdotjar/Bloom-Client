import { invoke } from '@tauri-apps/api/core';

export interface Instance {
    id: string;
    name: string;
    mcVersion: string;
    loader: 'vanilla' | 'fabric';
    fabricLoaderVersion?: string;
    iconDataUrl?: string;
    coverDataUrl?: string;
    colorTag?: string;
    iconFrame?: 'square' | 'rounded' | 'diamond';
    createdAt: number;
    updatedAt: number;
    java: { pathOverride?: string; runtime?: string };
    memoryMb: number;
    jvmArgs: string[];
    resolution: { width: number; height: number; fullscreen: boolean };
}

export interface ModUploadPayload {
    name: string;
    data: number[];
}

export interface ModInstallResult {
    installed: string[];
    skipped: string[];
}

export interface InstanceModFile {
    fileName: string;
    displayName: string;
    enabled: boolean;
    sizeBytes: number;
    updatedAt: number;
}

export interface MarketplaceMod {
    id: string;
    source: 'modrinth' | 'curseforge';
    title: string;
    description: string;
    iconUrl?: string;
    author?: string;
    downloads: number;
}

export interface MarketplacePack {
    id: string;
    source: 'modrinth' | 'curseforge';
    title: string;
    description: string;
    iconUrl?: string;
    author?: string;
    downloads: number;
    availableVersions: string[];
    supportedLoaders: string[];
}

export const TauriApi = {
    pathsGet: () => invoke<any>('paths_get'),

    instancesList: () => invoke<Instance[]>('instances_list'),

    instancesCreate: (payload: Instance) => invoke<Instance>('instances_create', { payload }),

    instancesUpdate: (id: string, payload: Instance) => invoke<Instance>('instances_update', { id, payload }),
    instancesDelete: (id: string) => invoke<void>('instances_delete', { id }),
    instanceInstallModFiles: (instanceId: string, files: ModUploadPayload[]) =>
        invoke<ModInstallResult>('instance_install_mod_files', { instanceId, files }),
    instanceInstallModPaths: (instanceId: string, paths: string[]) =>
        invoke<ModInstallResult>('instance_install_mod_paths', { instanceId, paths }),
    instanceInstallFabricApi: (instanceId: string) =>
        invoke<string>('instance_install_fabric_api', { instanceId }),
    instanceListMods: (instanceId: string) =>
        invoke<InstanceModFile[]>('instance_list_mods', { instanceId }),
    instanceToggleMod: (instanceId: string, fileName: string, enabled: boolean) =>
        invoke<string>('instance_toggle_mod', { instanceId, fileName, enabled }),
    instanceDisableIncompatibleMods: (instanceId: string) =>
        invoke<string[]>('instance_disable_incompatible_mods', { instanceId }),
    instanceDeleteMod: (instanceId: string, fileName: string) =>
        invoke<void>('instance_delete_mod', { instanceId, fileName }),
    openModsFolder: (id: string) => invoke<void>('open_mods_folder', { id }),
    marketplaceSearchMods: (query: string, source?: 'all' | 'modrinth' | 'curseforge', loader?: string, gameVersion?: string) =>
        invoke<MarketplaceMod[]>('marketplace_search_mods', { query, source, loader, gameVersion }),
    marketplaceInstallMod: (instanceId: string, source: 'modrinth' | 'curseforge', projectId: string) =>
        invoke<string>('marketplace_install_mod', { instanceId, source, projectId }),
    marketplaceSearchModpacks: (query: string, source?: 'all' | 'modrinth' | 'curseforge') =>
        invoke<MarketplacePack[]>('marketplace_search_modpacks', { query, source }),
    marketplaceInstallModpackInstance: (source: 'modrinth' | 'curseforge', projectId: string, gameVersion: string) =>
        invoke<Instance>('marketplace_install_modpack_instance', { source, projectId, gameVersion }),
    marketplaceSearchResourcepacks: (query: string, source?: 'all' | 'modrinth' | 'curseforge', gameVersion?: string) =>
        invoke<MarketplacePack[]>('marketplace_search_resourcepacks', { query, source, gameVersion }),
    marketplaceInstallResourcepack: (instanceId: string, source: 'modrinth' | 'curseforge', projectId: string, gameVersion?: string) =>
        invoke<string>('marketplace_install_resourcepack', { instanceId, source, projectId, gameVersion })
};
