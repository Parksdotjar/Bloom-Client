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
    iconUrl?: string;
}

export interface InstanceContentFile {
    fileName: string;
    displayName: string;
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

export interface HostedServer {
    id: string;
    name: string;
    version: string;
    loader: string;
    memoryMb: number;
    port: number;
    motd: string;
    maxPlayers: number;
    createdAt: number;
    updatedAt: number;
    publicHost?: string | null;
    tunnelState?: string | null;
    tunnelSessionId?: string | null;
    tunnelExpiresAt?: number | null;
    tunnelLastError?: string | null;
}

export interface HostedServerCreateRequest {
    name: string;
    version: string;
    loader?: string;
    memoryMb?: number;
    port?: number;
}

export interface HostedServerUpdateRequest {
    name?: string;
    version?: string;
    loader?: string;
    memoryMb?: number;
    port?: number;
    motd?: string;
    maxPlayers?: number;
}

export interface HostedServerStatus {
    serverId: string;
    running: boolean;
    pid?: number | null;
    startedAt?: number | null;
    uptimeSeconds?: number | null;
    localAddress: string;
    publicAddress?: string | null;
    tunnelState?: string | null;
    tunnelExpiresAt?: number | null;
    lastError?: string | null;
}

export interface HostedServerLogLine {
    id: number;
    ts: number;
    level: string;
    source: string;
    line: string;
}

export interface HostedServerFileEntry {
    name: string;
    relativePath: string;
    isDir: boolean;
    sizeBytes: number;
    updatedAt: number;
}

export interface HostedServerFileReadResult {
    relativePath: string;
    text: string;
}

export interface HostedServerBackup {
    id: string;
    createdAt: number;
    sizeBytes: number;
}

export interface HostedServerTunnelSession {
    serverId: string;
    state: string;
    publicAddress: string;
    relayEndpoint?: string | null;
    sessionId?: string | null;
    expiresAt?: number | null;
    message: string;
}

export const TauriApi = {
    pathsGet: () => invoke<any>('paths_get'),

    instancesList: () => invoke<Instance[]>('instances_list'),
    instancesGet: (id: string) => invoke<Instance>('instances_get', { id }),

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
    instanceListResourcepacks: (instanceId: string) =>
        invoke<InstanceContentFile[]>('instance_list_resourcepacks', { instanceId }),
    instanceDeleteResourcepack: (instanceId: string, fileName: string) =>
        invoke<void>('instance_delete_resourcepack', { instanceId, fileName }),
    openResourcepacksFolder: (id: string) => invoke<void>('open_resourcepacks_folder', { id }),
    instanceListShaderpacks: (instanceId: string) =>
        invoke<InstanceContentFile[]>('instance_list_shaderpacks', { instanceId }),
    instanceDeleteShaderpack: (instanceId: string, fileName: string) =>
        invoke<void>('instance_delete_shaderpack', { instanceId, fileName }),
    instanceCopyGameOptions: (sourceInstanceId: string, targetInstanceId: string) =>
        invoke<string>('instance_copy_game_options', { sourceInstanceId, targetInstanceId }),
    openShaderpacksFolder: (id: string) => invoke<void>('open_shaderpacks_folder', { id }),
    marketplaceSearchMods: (query: string, source?: 'all' | 'modrinth' | 'curseforge', loader?: string, gameVersion?: string) =>
        invoke<MarketplaceMod[]>('marketplace_search_mods', { query, source, loader, gameVersion }),
    marketplaceInstallMod: (instanceId: string, source: 'modrinth' | 'curseforge', projectId: string) =>
        invoke<string>('marketplace_install_mod', { instanceId, source, projectId }),
    marketplaceSearchModpacks: (query: string, source?: 'all' | 'modrinth' | 'curseforge') =>
        invoke<MarketplacePack[]>('marketplace_search_modpacks', { query, source }),
    marketplaceInstallModpackInstance: (source: 'modrinth' | 'curseforge', projectId: string, gameVersion: string) =>
        invoke<Instance>('marketplace_install_modpack_instance', { source, projectId, gameVersion }),
    importLocalModpackInstance: (filePath: string, gameVersion: string, instanceName?: string) =>
        invoke<Instance>('import_local_modpack_instance', { filePath, gameVersion, instanceName }),
    marketplaceSearchResourcepacks: (query: string, source?: 'all' | 'modrinth' | 'curseforge', gameVersion?: string) =>
        invoke<MarketplacePack[]>('marketplace_search_resourcepacks', { query, source, gameVersion }),
    marketplaceInstallResourcepack: (instanceId: string, source: 'modrinth' | 'curseforge', projectId: string, gameVersion?: string) =>
        invoke<string>('marketplace_install_resourcepack', { instanceId, source, projectId, gameVersion }),
    marketplaceSearchShaders: (query: string, source?: 'all' | 'modrinth' | 'curseforge', gameVersion?: string) =>
        invoke<MarketplacePack[]>('marketplace_search_shaders', { query, source, gameVersion }),
    marketplaceInstallShaderpack: (instanceId: string, source: 'modrinth' | 'curseforge', projectId: string, gameVersion?: string) =>
        invoke<string>('marketplace_install_shaderpack', { instanceId, source, projectId, gameVersion }),
    hostedServersList: () =>
        invoke<HostedServer[]>('hosted_servers_list'),
    hostedServersGet: (serverId: string) =>
        invoke<HostedServer>('hosted_servers_get', { serverId }),
    hostedServersCreate: (payload: HostedServerCreateRequest) =>
        invoke<HostedServer>('hosted_servers_create', { payload }),
    hostedServersUpdate: (serverId: string, payload: HostedServerUpdateRequest) =>
        invoke<HostedServer>('hosted_servers_update', { serverId, payload }),
    hostedServersDelete: (serverId: string) =>
        invoke<void>('hosted_servers_delete', { serverId }),
    hostedServersStart: (serverId: string) =>
        invoke<HostedServerStatus>('hosted_servers_start', { serverId }),
    hostedServersStop: (serverId: string) =>
        invoke<HostedServerStatus>('hosted_servers_stop', { serverId }),
    hostedServersRestart: (serverId: string) =>
        invoke<HostedServerStatus>('hosted_servers_restart', { serverId }),
    hostedServersStatus: (serverId: string) =>
        invoke<HostedServerStatus>('hosted_servers_status', { serverId }),
    hostedServersSendCommand: (serverId: string, command: string) =>
        invoke<void>('hosted_servers_send_command', { serverId, command }),
    hostedServersLogs: (serverId: string, limit?: number) =>
        invoke<HostedServerLogLine[]>('hosted_servers_logs', { serverId, limit }),
    hostedServersLogsClear: (serverId: string) =>
        invoke<void>('hosted_servers_logs_clear', { serverId }),
    hostedServersOpenFolder: (serverId: string) =>
        invoke<void>('hosted_servers_open_folder', { serverId }),
    hostedServersFilesList: (serverId: string, relativePath?: string) =>
        invoke<HostedServerFileEntry[]>('hosted_servers_files_list', { serverId, relativePath }),
    hostedServersFilesRead: (serverId: string, relativePath: string) =>
        invoke<HostedServerFileReadResult>('hosted_servers_files_read', { serverId, relativePath }),
    hostedServersFilesWrite: (serverId: string, relativePath: string, text: string) =>
        invoke<void>('hosted_servers_files_write', { serverId, relativePath, text }),
    hostedServersFilesCreate: (serverId: string, relativePath: string, directory: boolean) =>
        invoke<void>('hosted_servers_files_create', { serverId, relativePath, directory }),
    hostedServersFilesRename: (serverId: string, fromRelativePath: string, toRelativePath: string) =>
        invoke<void>('hosted_servers_files_rename', { serverId, fromRelativePath, toRelativePath }),
    hostedServersFilesDelete: (serverId: string, relativePath: string) =>
        invoke<void>('hosted_servers_files_delete', { serverId, relativePath }),
    hostedServersBackupsList: (serverId: string) =>
        invoke<HostedServerBackup[]>('hosted_servers_backups_list', { serverId }),
    hostedServersBackupsCreate: (serverId: string) =>
        invoke<HostedServerBackup>('hosted_servers_backups_create', { serverId }),
    hostedServersBackupsDelete: (serverId: string, backupId: string) =>
        invoke<void>('hosted_servers_backups_delete', { serverId, backupId }),
    hostedServersBackupsRestore: (serverId: string, backupId: string) =>
        invoke<void>('hosted_servers_backups_restore', { serverId, backupId }),
    hostedServersTunnelOpen: (serverId: string, requestedSubdomain?: string) =>
        invoke<HostedServerTunnelSession>('hosted_servers_tunnel_open', { serverId, requestedSubdomain }),
    hostedServersTunnelClose: (serverId: string) =>
        invoke<HostedServerTunnelSession>('hosted_servers_tunnel_close', { serverId }),
    launcherBackgroundSave: (data: number[]) =>
        invoke<void>('launcher_background_save', { data }),
    launcherBackgroundLoad: () =>
        invoke<string | null>('launcher_background_load'),
    launcherBackgroundClear: () =>
        invoke<void>('launcher_background_clear')
};
