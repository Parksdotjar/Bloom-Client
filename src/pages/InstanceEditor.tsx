import { useEffect, useMemo, useRef, useState, type ChangeEventHandler, type DragEventHandler, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ChevronDown, Copy, Download, FolderOpen, ImageIcon, MoreHorizontal, Package2, Play, RefreshCcw, Save, Search, ShieldPlus, Sparkles, Trash2, UploadCloud, X } from 'lucide-react';
import { open, save } from '@tauri-apps/plugin-dialog';
import { useInstances } from '../hooks/useInstances';
import { useAuth } from '../hooks/useAuth';
import { useDownloader } from '../hooks/useDownloader';
import { TauriApi, type BloomExportOptions, type InstanceContentFile, type InstanceModFile, type InstanceTransferOptions, type MarketplaceMod, type MarketplacePack, type ModInstallResult } from '../services/tauri';
import { UniversalLoadingOverlay } from '../components/UniversalLoadingOverlay';

type EditorTab = 'mods' | 'resourcepacks' | 'shaders' | 'settings';
type SettingsSubTab = 'profile' | 'launch';
type SourceFilter = 'all' | 'modrinth' | 'curseforge';
type LibraryView = 'installed' | 'install';
type NativeFile = File & { path?: string };

const KEYBIND_ACTION_EVENT = 'bloom-keybind-action';
const DEFAULT_BLOOM_EXPORT_OPTIONS: BloomExportOptions = {
  includeMods: true,
  includeResourcepacks: true,
  includeShaderpacks: true,
  includeConfig: true,
  includeOptions: true,
  includeServerData: false,
  includeSaves: false,
  includeScreenshots: false,
  includeLogs: false,
  includeAllFiles: false
};
const DEFAULT_INSTANCE_TRANSFER_OPTIONS: InstanceTransferOptions = {
  includeOptions: true,
  includeServerData: true,
  includeConfig: true,
  includeResourcepacks: false,
  includeShaderpacks: false
};

function humanSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function cleanFileLabel(fileName: string) {
  return fileName
    .replace(/\.(jar|zip)$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildInstalledDescription(title: string, row: InstanceContentFile | InstanceModFile) {
  const size = humanSize(row.sizeBytes);
  if ('enabled' in row) {
    return `${row.enabled ? 'Enabled' : 'Disabled'} mod file · ${size}`;
  }
  const kind = title === 'Shaders' ? 'Shader pack' : 'Resource pack';
  return `${kind} file · ${size}`;
}

function getInstalledIcon(title: string, row: InstanceContentFile | InstanceModFile) {
  if ('enabled' in row) return Sparkles;
  return title === 'Shaders' ? Sparkles : title === 'Resource Packs' ? ImageIcon : Package2;
}

function EmptyState({ message }: { message: string }) {
  return <div className="p-6 text-center text-sm font-semibold text-slate-500 dark:text-white/55">{message}</div>;
}

export function InstanceEditor() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const instanceId = searchParams.get('id');
  const initialTab: EditorTab = searchParams.get('tab') === 'settings'
    ? 'settings'
    : searchParams.get('tab') === 'resourcepacks'
      ? 'resourcepacks'
      : searchParams.get('tab') === 'shaders'
        ? 'shaders'
        : 'mods';

  const { instances, updateInstance, loading, loadInstances, getInstance } = useInstances();
  const { authState } = useAuth();
  const { startDownload, activeDownloads } = useDownloader();

  const instance = useMemo(() => {
    if (!instanceId) return null;
    return instances.find((item) => item.id === instanceId) || null;
  }, [instances, instanceId]);

  const transferableInstances = useMemo(
    () => instances.filter((item) => item.id !== instanceId),
    [instances, instanceId]
  );

  const [activeTab, setActiveTab] = useState<EditorTab>(initialTab);
  const [modsView, setModsView] = useState<LibraryView>('installed');
  const [resourcepacksView, setResourcepacksView] = useState<LibraryView>('installed');
  const [shadersView, setShadersView] = useState<LibraryView>('installed');
  const [settingsSubTab, setSettingsSubTab] = useState<SettingsSubTab>('profile');
  const [name, setName] = useState('');
  const [memoryMb, setMemoryMb] = useState(4096);
  const [jvmArgs, setJvmArgs] = useState('');
  const [javaRuntime, setJavaRuntime] = useState<'system' | 'java17' | 'custom'>('system');
  const [javaPathOverride, setJavaPathOverride] = useState('');
  const [iconDataUrl, setIconDataUrl] = useState<string | undefined>(undefined);
  const [coverDataUrl, setCoverDataUrl] = useState<string | undefined>(undefined);
  const [instanceMediaLoaded, setInstanceMediaLoaded] = useState(false);
  const [colorTag, setColorTag] = useState('#9a65ff');
  const [iconFrame, setIconFrame] = useState<'square' | 'rounded' | 'diamond'>('rounded');
  const [saving, setSaving] = useState(false);
  const [blockingTitle, setBlockingTitle] = useState<string | null>(null);

  const [mods, setMods] = useState<InstanceModFile[]>([]);
  const [resourcepacks, setResourcepacks] = useState<InstanceContentFile[]>([]);
  const [shaderpacks, setShaderpacks] = useState<InstanceContentFile[]>([]);
  const [modLoading, setModLoading] = useState(false);
  const [resourcepacksLoading, setResourcepacksLoading] = useState(false);
  const [shaderpacksLoading, setShaderpacksLoading] = useState(false);
  const [installingMods, setInstallingMods] = useState(false);
  const [installingFabricApi, setInstallingFabricApi] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [lastInstallResult, setLastInstallResult] = useState<ModInstallResult | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [launchingInstanceId, setLaunchingInstanceId] = useState<string | null>(null);
  const [modsQuery, setModsQuery] = useState('');
  const [modsSource, setModsSource] = useState<SourceFilter>('all');
  const [modsSearching, setModsSearching] = useState(false);
  const [modsResults, setModsResults] = useState<MarketplaceMod[]>([]);
  const [modsInstallingId, setModsInstallingId] = useState<string | null>(null);
  const [resourcepacksQuery, setResourcepacksQuery] = useState('');
  const [resourcepacksSource, setResourcepacksSource] = useState<SourceFilter>('all');
  const [resourcepacksSearching, setResourcepacksSearching] = useState(false);
  const [resourcepacksResults, setResourcepacksResults] = useState<MarketplacePack[]>([]);
  const [resourcepacksInstallingId, setResourcepacksInstallingId] = useState<string | null>(null);
  const [shadersQuery, setShadersQuery] = useState('');
  const [shadersSource, setShadersSource] = useState<SourceFilter>('all');
  const [shadersSearching, setShadersSearching] = useState(false);
  const [shadersResults, setShadersResults] = useState<MarketplacePack[]>([]);
  const [shadersInstallingId, setShadersInstallingId] = useState<string | null>(null);
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const [exportPanelOpen, setExportPanelOpen] = useState(false);
  const [exportOptions, setExportOptions] = useState<BloomExportOptions>(DEFAULT_BLOOM_EXPORT_OPTIONS);
  const [transferPanelOpen, setTransferPanelOpen] = useState(false);
  const [transferSourceInstanceId, setTransferSourceInstanceId] = useState('');
  const [transferOptions, setTransferOptions] = useState<InstanceTransferOptions>(DEFAULT_INSTANCE_TRANSFER_OPTIONS);
  const [transferSourceMenuOpen, setTransferSourceMenuOpen] = useState(false);

  const selectedTransferSource = useMemo(
    () => transferableInstances.find((item) => item.id === transferSourceInstanceId) || null,
    [transferSourceInstanceId, transferableInstances]
  );

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const iconInputRef = useRef<HTMLInputElement | null>(null);
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const actionsMenuRef = useRef<HTMLDivElement | null>(null);
  const transferSourceMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (instance) {
      setName(instance.name);
      setMemoryMb(instance.memoryMb);
      setJvmArgs(instance.jvmArgs.join(' '));
      const savedRuntime = (instance.java?.runtime || '').toLowerCase();
      if (savedRuntime === 'java17') setJavaRuntime('java17');
      else if (instance.java?.pathOverride) setJavaRuntime('custom');
      else setJavaRuntime('system');
      setJavaPathOverride(instance.java?.pathOverride || '');
      setColorTag(instance.colorTag || '#9a65ff');
      setIconFrame(instance.iconFrame || 'rounded');
      setModsView('installed');
      setResourcepacksView('installed');
      setShadersView('installed');
      setInstanceMediaLoaded(false);
    }
  }, [instance]);

  useEffect(() => {
    let active = true;
    if (!instanceId || !instance) return () => {
      active = false;
    };

    void getInstance(instanceId)
      .then((fullInstance) => {
        if (!active) return;
        setIconDataUrl(fullInstance.iconDataUrl);
        setCoverDataUrl(fullInstance.coverDataUrl);
        setInstanceMediaLoaded(true);
      })
      .catch(() => {
        if (!active) return;
        setIconDataUrl(undefined);
        setCoverDataUrl(undefined);
        setInstanceMediaLoaded(true);
      });

    return () => {
      active = false;
    };
  }, [getInstance, instance, instanceId]);

  useEffect(() => {
    if (!instanceId || instance || loading) return;
    void loadInstances();
  }, [instanceId, instance, loading, loadInstances]);

  useEffect(() => {
    if (!transferableInstances.length) {
      setTransferSourceInstanceId('');
      return;
    }
    if (!transferableInstances.some((item) => item.id === transferSourceInstanceId)) {
      setTransferSourceInstanceId(transferableInstances[0].id);
    }
  }, [transferSourceInstanceId, transferableInstances]);

  useEffect(() => {
    if (!transferSourceMenuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (transferSourceMenuRef.current && event.target instanceof Node && !transferSourceMenuRef.current.contains(event.target)) {
        setTransferSourceMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', onPointerDown);
    return () => window.removeEventListener('mousedown', onPointerDown);
  }, [transferSourceMenuOpen]);

  const goBack = () => navigate('/instances');

  const reloadMods = async () => {
    if (!instance) return;
    setModLoading(true);
    try {
      setMods(await TauriApi.instanceListMods(instance.id));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatusMessage(`Failed loading mods: ${message}`);
    } finally {
      setModLoading(false);
    }
  };

  const reloadResourcepacks = async () => {
    if (!instance) return;
    setResourcepacksLoading(true);
    try {
      setResourcepacks(await TauriApi.instanceListResourcepacks(instance.id));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatusMessage(`Failed loading resource packs: ${message}`);
    } finally {
      setResourcepacksLoading(false);
    }
  };

  const reloadShaderpacks = async () => {
    if (!instance) return;
    setShaderpacksLoading(true);
    try {
      setShaderpacks(await TauriApi.instanceListShaderpacks(instance.id));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatusMessage(`Failed loading shader packs: ${message}`);
    } finally {
      setShaderpacksLoading(false);
    }
  };

  useEffect(() => {
    void reloadMods();
    void reloadResourcepacks();
    void reloadShaderpacks();
  }, [instance?.id]);

  useEffect(() => {
    if (!launchingInstanceId) return;
    const current = activeDownloads[launchingInstanceId];
    if (!current) {
      setLaunchingInstanceId(null);
      return;
    }
    if (current.status.toLowerCase().startsWith('error:')) {
      const timer = window.setTimeout(() => setLaunchingInstanceId(null), 1200);
      return () => window.clearTimeout(timer);
    }
  }, [activeDownloads, launchingInstanceId]);

  const saveSettings = async () => {
    if (!instance) return;
    setSaving(true);
    setBlockingTitle('Saving instance settings...');
    try {
      await updateInstance(instance.id, {
        ...instance,
        name: name.trim() || instance.name,
        memoryMb,
        jvmArgs: jvmArgs.trim() ? jvmArgs.trim().split(/\s+/) : [],
        java: {
          pathOverride: javaRuntime === 'custom' ? (javaPathOverride.trim() || undefined) : (javaRuntime === 'java17' ? 'java17' : undefined),
          runtime: javaRuntime === 'system' ? undefined : javaRuntime
        },
        iconDataUrl,
        coverDataUrl,
        colorTag,
        iconFrame,
        updatedAt: Date.now()
      });
      setStatusMessage('Instance settings saved.');
    } finally {
      setSaving(false);
      setBlockingTitle(null);
    }
  };

  const handleTransferFiles = async () => {
    if (!instance || !transferSourceInstanceId) return;
    setActionsMenuOpen(false);
    setTransferPanelOpen(false);
    setTransferSourceMenuOpen(false);
    setBlockingTitle('Importing instance files...');
    setStatusMessage(`Importing selected files into ${instance.name}...`);
    try {
      const result = await TauriApi.instanceTransferFiles(transferSourceInstanceId, instance.id, transferOptions);
      const sourceName = transferableInstances.find((item) => item.id === transferSourceInstanceId)?.name || 'source instance';
      setStatusMessage(`${result} Imported from ${sourceName} into ${instance.name}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatusMessage(`Instance file import failed: ${message}`);
    } finally {
      setBlockingTitle(null);
    }
  };

  useEffect(() => {
    if (!instance) return;
    const onKeybindAction = (event: Event) => {
      const custom = event as CustomEvent<{ action?: string }>;
      const action = custom.detail?.action;
      if (!action) return;

      if (action === 'save-instance-settings') {
        void saveSettings();
        return;
      }
      if (action === 'next-instance-tab') {
        const tabs: EditorTab[] = ['mods', 'resourcepacks', 'shaders', 'settings'];
        const currentIndex = tabs.indexOf(activeTab);
        setActiveTab(tabs[(currentIndex + 1) % tabs.length]);
        return;
      }
      if (action === 'previous-instance-tab') {
        const tabs: EditorTab[] = ['mods', 'resourcepacks', 'shaders', 'settings'];
        const currentIndex = tabs.indexOf(activeTab);
        setActiveTab(tabs[(currentIndex - 1 + tabs.length) % tabs.length]);
        return;
      }
      if (action === 'switch-installed-view' && activeTab !== 'settings') {
        if (activeTab === 'mods') setModsView('installed');
        if (activeTab === 'resourcepacks') setResourcepacksView('installed');
        if (activeTab === 'shaders') setShadersView('installed');
        return;
      }
      if (action === 'switch-install-view' && activeTab !== 'settings') {
        if (activeTab === 'mods') setModsView('install');
        if (activeTab === 'resourcepacks') setResourcepacksView('install');
        if (activeTab === 'shaders') setShadersView('install');
        return;
      }
      if (action === 'refresh-active-page') {
        void reloadMods();
        void reloadResourcepacks();
        void reloadShaderpacks();
        return;
      }
      if (action === 'open-active-folder') {
        if (activeTab === 'mods') {
          void TauriApi.openModsFolder(instance.id);
          return;
        }
        if (activeTab === 'resourcepacks') {
          void TauriApi.openResourcepacksFolder(instance.id);
          return;
        }
        if (activeTab === 'shaders') {
          void TauriApi.openShaderpacksFolder(instance.id);
        }
      }
    };
    window.addEventListener(KEYBIND_ACTION_EVENT, onKeybindAction as EventListener);
    return () => window.removeEventListener(KEYBIND_ACTION_EVENT, onKeybindAction as EventListener);
  }, [instance, activeTab, saveSettings]);

  const launchStatus = launchingInstanceId ? activeDownloads[launchingInstanceId]?.status || 'Preparing launch...' : null;

  const handleLaunch = async () => {
    if (!instance) return;
    if (activeDownloads[instance.id] && activeDownloads[instance.id].status !== 'Complete') return;
    setLaunchingInstanceId(instance.id);
    await startDownload(instance, authState);
  };

  useEffect(() => {
    if (!actionsMenuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (actionsMenuRef.current && event.target instanceof Node && !actionsMenuRef.current.contains(event.target)) {
        setActionsMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', onPointerDown);
    return () => window.removeEventListener('mousedown', onPointerDown);
  }, [actionsMenuOpen]);

  const updateExportOption = (key: keyof BloomExportOptions, value: boolean) => {
    setExportOptions((current) => {
      if (key === 'includeAllFiles') {
        return { ...current, includeAllFiles: value };
      }
      return { ...current, [key]: value, includeAllFiles: false };
    });
  };

  const updateTransferOption = (key: keyof InstanceTransferOptions, value: boolean) => {
    setTransferOptions((current) => ({ ...current, [key]: value }));
  };

  const handleExportBloom = async () => {
    if (!instance) return;
    setActionsMenuOpen(false);
    const selectedPath = await save({
      title: 'Export Bloom Modpack',
      defaultPath: `${instance.name.replace(/[<>:"/\\\\|?*]+/g, '').trim() || 'instance'}.bloom`,
      filters: [{ name: 'Bloom Modpack', extensions: ['bloom'] }]
    });
    if (!selectedPath) return;

    setExportPanelOpen(false);
    setBlockingTitle('Exporting Bloom pack...');
    setStatusMessage(`Exporting ${instance.name}...`);
    try {
      const outputPath = selectedPath.toLowerCase().endsWith('.bloom') ? selectedPath : `${selectedPath}.bloom`;
      const savedPath = await TauriApi.instanceExportBloom(instance.id, outputPath, exportOptions);
      setStatusMessage(`Exported Bloom pack to ${savedPath}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatusMessage(`Bloom export failed: ${message}`);
    } finally {
      setBlockingTitle(null);
    }
  };

  const handleIconFile: ChangeEventHandler<HTMLInputElement> = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setStatusMessage('Please choose an image file.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setIconDataUrl(typeof reader.result === 'string' ? reader.result : undefined);
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const handleCoverFile: ChangeEventHandler<HTMLInputElement> = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setStatusMessage('Please choose an image file.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setCoverDataUrl(typeof reader.result === 'string' ? reader.result : undefined);
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const installFiles = async (files: FileList | File[]) => {
    if (!instance || files.length === 0) return;
    const jars = Array.from(files).filter((file) => file.name.toLowerCase().endsWith('.jar'));
    if (jars.length === 0) {
      setStatusMessage('Only .jar mod files are supported.');
      return;
    }

    setInstallingMods(true);
    setBlockingTitle('Installing mods...');
    setStatusMessage('Installing mods...');
    try {
      const pathBackedFiles = jars.filter((file) => Boolean((file as NativeFile).path));
      if (pathBackedFiles.length === jars.length && pathBackedFiles.length > 0) {
        const paths = pathBackedFiles.map((file) => (file as NativeFile).path as string).filter(Boolean);
        const result = await TauriApi.instanceInstallModPaths(instance.id, paths);
        setLastInstallResult(result);
        await reloadMods();
        setStatusMessage(result.skipped.length > 0 ? `Installed ${result.installed.length} file(s), skipped ${result.skipped.length} invalid file(s).` : `Installed ${result.installed.length} file(s).`);
        return;
      }

      const oversized = jars.find((file) => file.size > 8 * 1024 * 1024);
      if (oversized) {
        setStatusMessage('Large mod detected. Use "Choose Files" so install runs natively without crashing.');
        return;
      }

      const payload = await Promise.all(jars.map(async (file) => ({
        name: file.name,
        data: Array.from(new Uint8Array(await file.arrayBuffer()))
      })));

      const result = await TauriApi.instanceInstallModFiles(instance.id, payload);
      setLastInstallResult(result);
      await reloadMods();
      setStatusMessage(result.skipped.length > 0 ? `Installed ${result.installed.length} file(s), skipped ${result.skipped.length} invalid file(s).` : `Installed ${result.installed.length} file(s).`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatusMessage(`Mod install failed: ${message}`);
    } finally {
      setInstallingMods(false);
      setBlockingTitle(null);
    }
  };

  const pickAndInstallMods = async () => {
    if (!instance) return;
    try {
      const selected = await open({
        title: 'Select mod files',
        multiple: true,
        filters: [{ name: 'Java Mods', extensions: ['jar'] }]
      });
      if (!selected) return;
      const paths = Array.isArray(selected) ? selected : [selected];
      if (paths.length === 0) return;
      setInstallingMods(true);
      setBlockingTitle('Installing mods...');
      setStatusMessage('Installing mods...');
      const result = await TauriApi.instanceInstallModPaths(instance.id, paths);
      setLastInstallResult(result);
      await reloadMods();
      setStatusMessage(result.skipped.length > 0 ? `Installed ${result.installed.length} file(s), skipped ${result.skipped.length} invalid file(s).` : `Installed ${result.installed.length} file(s).`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatusMessage(`Mod install failed: ${message}`);
    } finally {
      setInstallingMods(false);
      setBlockingTitle(null);
    }
  };

  const handleDrop: DragEventHandler<HTMLDivElement> = (event) => {
    event.preventDefault();
    setIsDragging(false);
    void installFiles(event.dataTransfer.files);
  };

  const handleDragOver: DragEventHandler<HTMLDivElement> = (event) => {
    event.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave: DragEventHandler<HTMLDivElement> = (event) => {
    event.preventDefault();
    setIsDragging(false);
  };

  const handleFileInput: ChangeEventHandler<HTMLInputElement> = (event) => {
    if (!event.target.files) return;
    void installFiles(event.target.files);
    event.target.value = '';
  };

  const toggleMod = async (mod: InstanceModFile) => {
    if (!instance) return;
    try {
      await TauriApi.instanceToggleMod(instance.id, mod.fileName, !mod.enabled);
      await reloadMods();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatusMessage(`Toggle failed: ${message}`);
    }
  };

  const removeMod = async (mod: InstanceModFile) => {
    if (!instance) return;
    try {
      await TauriApi.instanceDeleteMod(instance.id, mod.fileName);
      await reloadMods();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatusMessage(`Delete failed: ${message}`);
    }
  };

  const removeResourcepack = async (pack: InstanceContentFile) => {
    if (!instance) return;
    try {
      await TauriApi.instanceDeleteResourcepack(instance.id, pack.fileName);
      await reloadResourcepacks();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatusMessage(`Delete failed: ${message}`);
    }
  };

  const removeShaderpack = async (pack: InstanceContentFile) => {
    if (!instance) return;
    try {
      await TauriApi.instanceDeleteShaderpack(instance.id, pack.fileName);
      await reloadShaderpacks();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatusMessage(`Delete failed: ${message}`);
    }
  };

  const autoInstallFabricApi = async () => {
    if (!instance || instance.loader !== 'fabric') return;
    setInstallingFabricApi(true);
    setBlockingTitle('Installing Fabric API...');
    setStatusMessage('Installing Fabric API...');
    try {
      const fileName = await TauriApi.instanceInstallFabricApi(instance.id);
      await reloadMods();
      setStatusMessage(`Fabric API installed: ${fileName}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatusMessage(`Fabric API install failed: ${message}`);
    } finally {
      setInstallingFabricApi(false);
      setBlockingTitle(null);
    }
  };

  const searchModsMarket = async () => {
    if (!instance || !modsQuery.trim()) return;
    setModsSearching(true);
    try {
      const rows = await TauriApi.marketplaceSearchMods(modsQuery.trim(), modsSource, instance.loader, instance.mcVersion);
      setModsResults(rows);
      if (rows.length === 0) setStatusMessage('No mods matched this search.');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatusMessage(`Mods search failed: ${message}`);
    } finally {
      setModsSearching(false);
    }
  };

  const searchResourcePacksMarket = async () => {
    if (!instance || !resourcepacksQuery.trim()) return;
    setResourcepacksSearching(true);
    try {
      const rows = await TauriApi.marketplaceSearchResourcepacks(resourcepacksQuery.trim(), resourcepacksSource, instance.mcVersion);
      setResourcepacksResults(rows);
      if (rows.length === 0) setStatusMessage('No resource packs matched this search.');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatusMessage(`Resource pack search failed: ${message}`);
    } finally {
      setResourcepacksSearching(false);
    }
  };

  const searchShadersMarket = async () => {
    if (!instance || !shadersQuery.trim()) return;
    setShadersSearching(true);
    try {
      const rows = await TauriApi.marketplaceSearchShaders(shadersQuery.trim(), shadersSource, instance.mcVersion);
      setShadersResults(rows);
      if (rows.length === 0) setStatusMessage('No shader packs matched this search.');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatusMessage(`Shader pack search failed: ${message}`);
    } finally {
      setShadersSearching(false);
    }
  };

  const installMarketplaceMod = async (mod: MarketplaceMod) => {
    if (!instance) return;
    const rowId = `${mod.source}:${mod.id}`;
    setModsInstallingId(rowId);
    setBlockingTitle('Installing mod...');
    setStatusMessage(`Installing ${mod.title}...`);
    try {
      const file = await TauriApi.marketplaceInstallMod(instance.id, mod.source, mod.id);
      await reloadMods();
      setStatusMessage(`Installed ${file} into ${instance.name}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatusMessage(`Install failed: ${message}`);
    } finally {
      setModsInstallingId(null);
      setBlockingTitle(null);
    }
  };

  const installMarketplaceResourcePack = async (pack: MarketplacePack) => {
    if (!instance) return;
    const rowId = `${pack.source}:${pack.id}`;
    setResourcepacksInstallingId(rowId);
    setBlockingTitle('Installing resource pack...');
    setStatusMessage(`Installing ${pack.title}...`);
    try {
      const file = await TauriApi.marketplaceInstallResourcepack(instance.id, pack.source, pack.id, instance.mcVersion);
      await reloadResourcepacks();
      setStatusMessage(`Installed ${file} into ${instance.name}/resourcepacks.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatusMessage(`Install failed: ${message}`);
    } finally {
      setResourcepacksInstallingId(null);
      setBlockingTitle(null);
    }
  };

  const installMarketplaceShader = async (pack: MarketplacePack) => {
    if (!instance) return;
    const rowId = `${pack.source}:${pack.id}`;
    setShadersInstallingId(rowId);
    setBlockingTitle('Installing shader pack...');
    setStatusMessage(`Installing ${pack.title}...`);
    try {
      const file = await TauriApi.marketplaceInstallShaderpack(instance.id, pack.source, pack.id, instance.mcVersion);
      await reloadShaderpacks();
      setStatusMessage(`Installed ${file} into ${instance.name}/shaderpacks.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatusMessage(`Install failed: ${message}`);
    } finally {
      setShadersInstallingId(null);
      setBlockingTitle(null);
    }
  };

  const renderInstalledLibrary = (
    title: string,
    loadingState: boolean,
    rows: InstanceContentFile[] | InstanceModFile[],
    onRefresh: () => void,
    onFolderOpen: () => void,
    onSwitch: () => void,
    onDelete: (row: InstanceContentFile | InstanceModFile) => void,
    onToggle?: (row: InstanceModFile) => void,
    extraAction?: ReactNode
  ) => (
    <section className="g-panel p-6 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-lg font-black text-slate-900 dark:text-white">{title}</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={onRefresh} className="g-btn h-10 px-3 text-xs font-black tracking-[0.14em] uppercase inline-flex items-center gap-1.5"><RefreshCcw size={13} /> Refresh</button>
          {extraAction}
          <button onClick={onFolderOpen} className="g-btn h-10 px-3 text-xs font-black tracking-[0.14em] uppercase inline-flex items-center gap-1.5"><FolderOpen size={13} /> Folder</button>
          <button onClick={onSwitch} className="g-btn-accent h-10 px-3 text-xs font-black tracking-[0.14em] uppercase">Open Install View</button>
        </div>
      </div>

      <div className="space-y-3">
        {loadingState ? (
          <div className="rounded-2xl border border-slate-300/80 dark:border-white/12 p-6 text-center text-xs font-black tracking-[0.16em] uppercase text-slate-500 dark:text-white/55">Loading...</div>
        ) : rows.length === 0 ? (
          <EmptyState message={`No ${title.toLowerCase()} installed.`} />
        ) : (
          rows.map((row) => {
            const modRow = 'enabled' in row ? row : null;
            const CardIcon = getInstalledIcon(title, row);
            const displayTitle = row.displayName?.trim() ? row.displayName : cleanFileLabel(row.fileName);
            const description = buildInstalledDescription(title, row);
            return (
              <article
                key={row.fileName}
                className="grid grid-cols-[64px_1fr_auto] items-center gap-4 border px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                style={{
                  borderRadius: 'calc(22px * var(--g-roundness-mult))',
                  borderColor: 'color-mix(in srgb, var(--g-border) 82%, transparent)',
                  background: 'linear-gradient(180deg, color-mix(in srgb, var(--g-surface-strong) 82%, transparent), color-mix(in srgb, var(--g-shell-strong) 88%, #000 12%))'
                }}
              >
                <div
                  className="flex h-14 w-14 items-center justify-center overflow-hidden border"
                  style={{
                    borderRadius: 'calc(16px * var(--g-roundness-mult))',
                    borderColor: 'var(--g-border)',
                    background: 'color-mix(in srgb, var(--g-soft) 82%, #000 18%)'
                  }}
                >
                  {'iconUrl' in row && row.iconUrl ? <img src={row.iconUrl} alt={displayTitle} className="h-full w-full object-cover" /> : <CardIcon size={18} className="text-white/70" />}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-lg font-black text-slate-900 dark:text-white">{displayTitle}</h3>
                    {'enabled' in row ? (
                      <span className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-slate-600 dark:text-white/72">
                        {row.enabled ? 'Enabled' : 'Disabled'}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-slate-600 dark:text-white/62">{description}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-slate-600 dark:text-white/72">
                      {row.fileName}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {modRow && onToggle ? (
                    <button
                      onClick={() => onToggle(modRow)}
                      data-on={modRow.enabled}
                      className="g-switch"
                      aria-label={`Toggle ${displayTitle}`}
                      aria-pressed={modRow.enabled}
                    />
                  ) : null}
                  <button
                    onClick={() => onDelete(row)}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-xl border"
                    style={{
                      borderColor: 'color-mix(in srgb, var(--g-danger) 40%, transparent)',
                      background: 'color-mix(in srgb, var(--g-danger) 14%, transparent)',
                      color: 'color-mix(in srgb, var(--g-danger) 68%, #ffffff 32%)'
                    }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </article>
            );
          })
        )}
      </div>
    </section>
  );

  const renderMarketplaceList = (
    title: string,
    query: string,
    setQuery: (value: string) => void,
    source: SourceFilter,
    setSource: (value: SourceFilter) => void,
    searchingState: boolean,
    onSearch: () => void,
    rows: MarketplacePack[] | MarketplaceMod[],
    installingId: string | null,
    onInstall: (row: MarketplacePack | MarketplaceMod) => void,
    placeholder: string,
    emptyMessage: string,
    accentClasses: string,
    icon: 'mod' | 'pack' | 'shader'
  ) => (
    <section className="g-panel p-6 space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="text-lg font-black text-slate-900 dark:text-white">{title}</h2>
          <button onClick={() => {
          if (title === 'Mods Marketplace') setModsView('installed');
          if (title === 'Resource Packs Marketplace') setResourcepacksView('installed');
          if (title === 'Shaders Marketplace') setShadersView('installed');
        }} className="g-btn h-10 px-3 text-xs font-black tracking-[0.14em] uppercase">Back To Installed</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_180px_120px] gap-2">
        <div className="g-select-trigger h-11 px-3 flex items-center gap-2">
          <Search size={14} className="text-slate-500 dark:text-white/60" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') onSearch();
            }}
            placeholder={placeholder}
            className="w-full bg-transparent text-sm font-semibold outline-none text-slate-900 dark:text-white"
          />
        </div>
        <select value={source} onChange={(event) => setSource(event.target.value as SourceFilter)} className="g-select-trigger h-11 px-3 text-sm font-bold text-slate-900 dark:text-white">
          <option value="all">All Sources</option>
          <option value="modrinth">Modrinth</option>
          <option value="curseforge">CurseForge</option>
        </select>
        <button onClick={onSearch} disabled={searchingState} className={`rounded-xl border h-11 text-xs font-black tracking-[0.14em] uppercase disabled:opacity-45 ${accentClasses}`} style={{ background: 'var(--g-accent-gradient)' }}>
          {searchingState ? 'Searching...' : 'Search'}
        </button>
      </div>

      <div className="space-y-3">
        {rows.length === 0 ? (
          <EmptyState message={emptyMessage} />
        ) : (
          rows.map((row) => {
            const rowId = `${row.source}:${row.id}`;
            return (
              <article
                key={rowId}
                className="grid grid-cols-[64px_1fr_auto] items-center gap-4 border px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                style={{
                  borderRadius: 'calc(22px * var(--g-roundness-mult))',
                  borderColor: 'color-mix(in srgb, var(--g-border) 82%, transparent)',
                  background: 'linear-gradient(180deg, color-mix(in srgb, var(--g-surface-strong) 82%, transparent), color-mix(in srgb, var(--g-shell-strong) 88%, #000 12%))'
                }}
              >
                <div className="w-14 h-14 rounded-xl border border-slate-300 dark:border-white/15 bg-slate-200 dark:bg-white/10 overflow-hidden flex items-center justify-center">
                  {row.iconUrl ? <img src={row.iconUrl} alt={row.title} className="w-full h-full object-cover" /> : icon === 'mod' || icon === 'shader' ? <Sparkles size={14} className="text-slate-500 dark:text-white/55" /> : <ImageIcon size={14} className="text-slate-500 dark:text-white/55" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-lg font-black text-slate-900 dark:text-white truncate">{row.title}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-500 dark:text-white/55 truncate">{row.description}</p>
                </div>
                <button onClick={() => onInstall(row)} disabled={installingId === rowId} className={`rounded-xl border px-3 py-2 text-xs font-black tracking-[0.14em] uppercase inline-flex items-center gap-1.5 disabled:opacity-45 ${accentClasses}`}>
                  <Download size={12} /> {installingId === rowId ? 'Installing...' : 'Install'}
                </button>
              </article>
            );
          })
        )}
      </div>
    </section>
  );

  if (loading || (instance && !instanceMediaLoaded)) {
    return <div className="min-h-full p-8 flex items-center justify-center"><p className="text-sm font-black tracking-[0.16em] uppercase text-slate-500 dark:text-white/55">Loading instance...</p></div>;
  }

  if (!instance) {
    return (
      <div className="min-h-full p-8 flex flex-col items-center justify-center gap-4 text-center">
        <p className="text-2xl font-black text-slate-900 dark:text-white">Instance not found</p>
        <button onClick={goBack} className="px-4 py-2 rounded-xl border border-slate-300 dark:border-white/15 text-sm font-black tracking-[0.14em] uppercase">Back</button>
      </div>
    );
  }

  return (
    <div className="min-h-full w-full max-w-[1360px] mx-auto p-4 md:p-6 space-y-4">
      <UniversalLoadingOverlay
        open={!!blockingTitle || !!launchStatus}
        fixed
        eyebrow={launchStatus ? 'Launching' : blockingTitle?.toLowerCase().includes('export') ? 'Exporting' : blockingTitle?.toLowerCase().includes('import') ? 'Importing' : 'Working'}
        title={blockingTitle || launchStatus || 'Working...'}
        description={launchStatus ? 'Bloom is installing files and starting Minecraft.' : blockingTitle?.toLowerCase().includes('export') ? 'Bloom is building your portable .bloom archive.' : blockingTitle?.toLowerCase().includes('import') ? 'Bloom is copying the selected instance files into this profile.' : 'Bloom is applying changes to this instance.'}
      />
      {transferPanelOpen && (
        <div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/65 px-4">
          <div className="w-full max-w-2xl rounded-[28px] border border-white/10 bg-black p-6 shadow-[0_28px_90px_rgba(0,0,0,0.45)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] g-accent-text">Transfer</p>
                <h2 className="mt-2 text-3xl font-black text-white">Import Instance Files</h2>
                <p className="mt-2 text-sm text-white/60">Copy selected files from another instance into <span className="font-bold text-white">{instance?.name}</span>. This is useful for moving options profiles and multiplayer server lists without reinstalling everything else.</p>
              </div>
              <button onClick={() => setTransferPanelOpen(false)} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-black text-white/75 transition hover:bg-white/[0.04] hover:text-white">
                <X size={15} />
              </button>
            </div>

            <div className="mt-6 space-y-4">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-[0.18em] text-white/50">Source Instance</label>
                <div className="relative mt-2" ref={transferSourceMenuRef}>
                  <button
                    type="button"
                    onClick={() => transferableInstances.length > 0 && setTransferSourceMenuOpen((current) => !current)}
                    className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-black px-4 py-3 text-left text-sm font-semibold text-white transition hover:bg-white/[0.04]"
                  >
                    <span className="truncate">
                      {selectedTransferSource ? `${selectedTransferSource.name} · ${selectedTransferSource.loader.toUpperCase()} ${selectedTransferSource.mcVersion}` : 'No other instances available'}
                    </span>
                    <ChevronDown size={16} className={`shrink-0 text-white/60 transition ${transferSourceMenuOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {transferSourceMenuOpen && transferableInstances.length > 0 && (
                    <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-20 overflow-hidden rounded-2xl border border-white/10 bg-black shadow-[0_18px_50px_rgba(0,0,0,0.45)]">
                      {transferableInstances.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            setTransferSourceInstanceId(item.id);
                            setTransferSourceMenuOpen(false);
                          }}
                          className={`flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold transition ${item.id === transferSourceInstanceId ? 'bg-white/[0.08] text-white' : 'text-white/75 hover:bg-white/[0.04] hover:text-white'}`}
                        >
                          <span className="truncate">{item.name}</span>
                          <span className="ml-3 shrink-0 text-[10px] font-black uppercase tracking-[0.14em] text-white/38">{item.loader} {item.mcVersion}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {([
                  ['includeOptions', 'Options Files', 'options.txt, OptiFine settings, shader options, keybind support files.'],
                  ['includeServerData', 'Server Data', 'servers.dat and the local servers folder for multiplayer addresses and icons.'],
                  ['includeConfig', 'Config Folder', 'Everything under config/ for mod configs, UI layouts, and client tweaks.'],
                  ['includeResourcepacks', 'Resource Packs', 'Installed local resource packs for this profile.'],
                  ['includeShaderpacks', 'Shaderpacks', 'Installed local shader packs for this profile.']
                ] as const).map(([key, label, description]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => updateTransferOption(key, !transferOptions[key])}
                    className={[
                      'rounded-2xl border p-4 text-left transition',
                      transferOptions[key]
                        ? 'border-white/10 bg-[color:color-mix(in_srgb,var(--g-accent)_18%,black)] hover:bg-[color:color-mix(in_srgb,var(--g-accent)_22%,black)]'
                        : 'border-white/10 bg-black hover:bg-white/[0.04]'
                    ].join(' ')}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-black text-white">{label}</p>
                      <span className="text-[10px] font-black uppercase tracking-[0.14em] text-white/70">{transferOptions[key] ? 'On' : 'Off'}</span>
                    </div>
                    <p className="mt-2 text-xs text-white/58">{description}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between gap-3 border-t border-white/10 pt-5">
              <button onClick={() => setTransferOptions(DEFAULT_INSTANCE_TRANSFER_OPTIONS)} className="inline-flex h-10 items-center rounded-xl border border-white/10 bg-black px-4 text-[10px] font-black uppercase tracking-[0.12em] text-white/78 transition hover:bg-white/[0.04] hover:text-white">
                Reset Defaults
              </button>
              <div className="flex items-center gap-2">
                <button onClick={() => setTransferPanelOpen(false)} className="inline-flex h-10 items-center rounded-xl border border-white/10 bg-black px-4 text-[10px] font-black uppercase tracking-[0.12em] text-white/78 transition hover:bg-white/[0.04] hover:text-white">
                  Cancel
                </button>
                <button
                  onClick={() => { void handleTransferFiles(); }}
                  disabled={!transferSourceInstanceId || (!transferOptions.includeOptions && !transferOptions.includeServerData && !transferOptions.includeConfig && !transferOptions.includeResourcepacks && !transferOptions.includeShaderpacks)}
                  className="g-btn-accent h-10 px-5 text-[10px] font-black uppercase tracking-[0.12em] inline-flex items-center gap-2 disabled:opacity-45"
                >
                  <Copy size={13} /> Import Here
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {exportPanelOpen && (
        <div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/65 px-4">
          <div className="w-full max-w-3xl rounded-[28px] border border-white/12 bg-[#0f0d12] p-6 shadow-[0_28px_90px_rgba(0,0,0,0.45)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] g-accent-text">Export</p>
                <h2 className="mt-2 text-3xl font-black text-white">Export as `.bloom`</h2>
                <p className="mt-2 text-sm text-white/60">Choose what this pack should include. The defaults cover the usual client-side pieces needed to share a Bloom modpack cleanly.</p>
              </div>
              <button onClick={() => setExportPanelOpen(false)} className="g-btn h-10 w-10 inline-flex items-center justify-center">
                <X size={15} />
              </button>
            </div>

            <div className="mt-6 grid gap-3 md:grid-cols-2">
              {([
                ['includeMods', 'Mods', 'Installed mods folder.'],
                ['includeResourcepacks', 'Resource Packs', 'Local resource packs folder.'],
                ['includeShaderpacks', 'Shaderpacks', 'Local shader packs folder.'],
                ['includeConfig', 'Config', 'Config and mod settings folders.'],
                ['includeOptions', 'Options Files', 'options.txt and related client option files.'],
                ['includeServerData', 'Server Data', 'servers.dat and local multiplayer server data.'],
                ['includeSaves', 'World Saves', 'Singleplayer worlds in this instance.'],
                ['includeScreenshots', 'Screenshots', 'The screenshots folder for this instance.'],
                ['includeLogs', 'Logs', 'latest.log and the logs folder.'],
                ['includeAllFiles', 'All Files', 'Export the full instance folder instead of a curated pack.']
              ] as const).map(([key, label, description]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => updateExportOption(key, !exportOptions[key])}
                  className={[
                    'rounded-2xl border p-4 text-left transition',
                    exportOptions[key] ? 'g-btn-accent' : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.05]'
                  ].join(' ')}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-black text-white">{label}</p>
                    <span className="text-[10px] font-black uppercase tracking-[0.14em] text-white/70">{exportOptions[key] ? 'On' : 'Off'}</span>
                  </div>
                  <p className="mt-2 text-xs text-white/58">{description}</p>
                </button>
              ))}
            </div>

            <div className="mt-6 flex items-center justify-between gap-3 border-t border-white/10 pt-5">
              <button onClick={() => setExportOptions(DEFAULT_BLOOM_EXPORT_OPTIONS)} className="g-btn h-10 px-4 text-[10px] font-black uppercase tracking-[0.12em]">
                Reset Defaults
              </button>
              <div className="flex items-center gap-2">
                <button onClick={() => setExportPanelOpen(false)} className="g-btn h-10 px-4 text-[10px] font-black uppercase tracking-[0.12em]">
                  Cancel
                </button>
                <button onClick={() => { void handleExportBloom(); }} className="g-btn-accent h-10 px-5 text-[10px] font-black uppercase tracking-[0.12em] inline-flex items-center gap-2">
                  <Download size={13} /> Export
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <section className="g-panel-strong overflow-visible p-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div
              className="w-14 h-14 overflow-hidden flex items-center justify-center"
              style={{
                borderRadius: 'calc(16px * var(--g-roundness-mult))',
                border: '1px solid var(--g-border)',
                background: 'color-mix(in srgb, var(--g-soft) 80%, transparent)'
              }}
            >
              {iconDataUrl ? <img src={iconDataUrl} alt={`${instance.name} icon`} className="w-full h-full object-cover" /> : <span className="font-black text-slate-700 dark:text-white/80">{instance.name.slice(0, 1).toUpperCase()}</span>}
            </div>
            <div>
              <p className="text-[10px] font-black tracking-[0.22em] uppercase g-accent-text">Instance Editor</p>
              <h1 className="text-4xl font-black mt-1 text-slate-900 dark:text-white">{instance.name}</h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative z-[80]" ref={actionsMenuRef}>
              <button onClick={() => setActionsMenuOpen((current) => !current)} className="g-btn h-11 w-11 inline-flex items-center justify-center">
                <MoreHorizontal size={16} />
              </button>
              {actionsMenuOpen && (
                <div className="absolute right-0 top-[calc(100%+8px)] z-[140] min-w-[220px] overflow-hidden rounded-2xl border border-white/10 bg-black shadow-[0_18px_50px_rgba(0,0,0,0.45)]">
                  <div className="border-b border-white/8 px-3 py-2">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/38">Instance Actions</p>
                  </div>
                  <div className="p-2">
                  <button
                    onClick={() => {
                      setActionsMenuOpen(false);
                      setTransferPanelOpen(true);
                    }}
                    className="flex h-11 w-full items-center gap-2 rounded-xl px-3 text-left text-xs font-black uppercase tracking-[0.12em] text-white/85 transition hover:bg-white/[0.06]"
                  >
                    <Copy size={13} /> Transfer Files
                  </button>
                  <button
                    onClick={() => {
                      setActionsMenuOpen(false);
                      setExportPanelOpen(true);
                    }}
                    className="mt-1 flex h-11 w-full items-center gap-2 rounded-xl px-3 text-left text-xs font-black uppercase tracking-[0.12em] text-white/85 transition hover:bg-white/[0.06]"
                  >
                    <Download size={13} /> Export
                  </button>
                  </div>
                </div>
              )}
            </div>
            <button onClick={goBack} className="g-btn h-11 px-4 text-xs font-black tracking-[0.14em] uppercase inline-flex items-center gap-2">
              <ArrowLeft size={14} /> Back
            </button>
            <button onClick={() => void handleLaunch()} disabled={!!activeDownloads[instance.id] && activeDownloads[instance.id].status !== 'Complete'} className="g-btn h-11 px-4 text-xs font-black tracking-[0.14em] uppercase inline-flex items-center gap-2 disabled:opacity-45">
              <Play size={14} /> Launch
            </button>
            <button onClick={saveSettings} disabled={saving} className="g-btn-accent h-11 px-5 text-xs font-black tracking-[0.14em] uppercase disabled:opacity-45 inline-flex items-center gap-2">
              <Save size={14} /> {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>

        <div
          className="mt-4 inline-grid grid-cols-2 md:grid-cols-4 gap-2 border p-2"
          style={{
            borderRadius: 'calc(22px * var(--g-roundness-mult))',
            borderColor: 'var(--g-border)',
            background: 'color-mix(in srgb, var(--g-surface) 84%, transparent)'
          }}
        >
          {([
            ['mods', 'Mods'],
            ['resourcepacks', 'Resource Packs'],
            ['shaders', 'Shaders'],
            ['settings', 'Settings']
          ] as const).map(([tab, label]) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="px-4 py-3 text-xs font-black tracking-[0.18em] uppercase transition"
              style={{
                borderRadius: 'calc(14px * var(--g-roundness-mult))',
                background: activeTab === tab ? 'var(--g-accent-gradient)' : 'transparent',
                color: activeTab === tab ? 'white' : 'color-mix(in srgb, var(--g-text) 54%, transparent)',
                boxShadow: activeTab === tab ? '0 10px 24px color-mix(in srgb, var(--g-accent) 24%, transparent)' : 'none'
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {activeTab !== 'settings' && (
          <div
            className="mt-4 inline-grid grid-cols-2 gap-2 border p-2"
            style={{
              borderRadius: 'calc(18px * var(--g-roundness-mult))',
              borderColor: 'var(--g-border)',
              background: 'color-mix(in srgb, var(--g-soft) 72%, transparent)'
            }}
          >
            <button
              onClick={() => {
                if (activeTab === 'mods') setModsView('installed');
                if (activeTab === 'resourcepacks') setResourcepacksView('installed');
                if (activeTab === 'shaders') setShadersView('installed');
              }}
              className="px-4 py-2 text-xs font-black tracking-[0.16em] uppercase"
              style={{
                borderRadius: 'calc(12px * var(--g-roundness-mult))',
                background: (activeTab === 'mods' ? modsView : activeTab === 'resourcepacks' ? resourcepacksView : shadersView) === 'installed' ? 'var(--g-accent-gradient)' : 'transparent',
                color: (activeTab === 'mods' ? modsView : activeTab === 'resourcepacks' ? resourcepacksView : shadersView) === 'installed' ? 'white' : 'color-mix(in srgb, var(--g-text) 54%, transparent)'
              }}
            >
              Installed
            </button>
            <button
              onClick={() => {
                if (activeTab === 'mods') setModsView('install');
                if (activeTab === 'resourcepacks') setResourcepacksView('install');
                if (activeTab === 'shaders') setShadersView('install');
              }}
              className="px-4 py-2 text-xs font-black tracking-[0.16em] uppercase"
              style={{
                borderRadius: 'calc(12px * var(--g-roundness-mult))',
                background: (activeTab === 'mods' ? modsView : activeTab === 'resourcepacks' ? resourcepacksView : shadersView) === 'install' ? 'var(--g-accent-gradient)' : 'transparent',
                color: (activeTab === 'mods' ? modsView : activeTab === 'resourcepacks' ? resourcepacksView : shadersView) === 'install' ? 'white' : 'color-mix(in srgb, var(--g-text) 54%, transparent)'
              }}
            >
              Install
            </button>
          </div>
        )}
      </section>
      {activeTab === 'settings' ? (
        <section className="g-panel overflow-hidden">
          <div className="grid xl:grid-cols-[260px_minmax(0,1fr)]">
            <aside className="border-b xl:border-b-0 xl:border-r border-slate-300/80 dark:border-white/10 bg-slate-100/60 dark:bg-black/20 p-5 space-y-4">
              <div className="rounded-3xl border border-slate-300/80 dark:border-white/12 bg-white/80 dark:bg-white/[0.03] p-4">
                <div className="mx-auto w-24 h-24 rounded-3xl overflow-hidden border border-slate-300 dark:border-white/15 bg-slate-200 dark:bg-white/10 flex items-center justify-center">
                  {iconDataUrl ? <img src={iconDataUrl} alt="Instance icon" className="w-full h-full object-cover" /> : <span className="text-3xl font-black text-slate-700 dark:text-white/80">{name.slice(0, 1).toUpperCase() || 'I'}</span>}
                </div>
                <div className="mt-4 text-center">
                  <p className="text-lg font-black text-slate-900 dark:text-white">{name.trim() || instance.name}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-white/50">{instance.loader.toUpperCase()} • {instance.mcVersion}</p>
                </div>
                <div className="mt-4 rounded-2xl overflow-hidden border border-slate-300/80 dark:border-white/10 h-24 bg-slate-200 dark:bg-white/[0.04]">
                  {coverDataUrl ? <img src={coverDataUrl} alt="Instance cover" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-[11px] font-black tracking-[0.16em] uppercase text-slate-500 dark:text-white/38">Banner Preview</div>}
                </div>
                <div className="mt-4 space-y-2">
                  <button
                    onClick={() => setSettingsSubTab('profile')}
                    className="w-full px-3 py-2 text-xs font-black tracking-[0.16em] uppercase transition"
                    style={{
                      borderRadius: 'calc(14px * var(--g-roundness-mult))',
                      background: settingsSubTab === 'profile' ? 'var(--g-accent-gradient)' : 'transparent',
                      color: settingsSubTab === 'profile' ? 'white' : 'color-mix(in srgb, var(--g-text) 58%, transparent)'
                    }}
                  >
                    Profile
                  </button>
                  <button
                    onClick={() => setSettingsSubTab('launch')}
                    className="w-full px-3 py-2 text-xs font-black tracking-[0.16em] uppercase transition"
                    style={{
                      borderRadius: 'calc(14px * var(--g-roundness-mult))',
                      background: settingsSubTab === 'launch' ? 'var(--g-accent-gradient)' : 'transparent',
                      color: settingsSubTab === 'launch' ? 'white' : 'color-mix(in srgb, var(--g-text) 58%, transparent)'
                    }}
                  >
                    Launch
                  </button>
                </div>
              </div>
            </aside>

            <div className="p-6 md:p-7 space-y-6">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-300/80 dark:border-white/10 pb-5">
                <div>
                  <p className="text-[10px] font-black tracking-[0.22em] uppercase g-accent-text">Instance Customization</p>
                  <h2 className="mt-2 text-3xl font-black text-slate-900 dark:text-white">Instance settings</h2>
                </div>
                <div className="inline-grid grid-cols-2 gap-2 rounded-2xl border border-slate-300/80 dark:border-white/12 bg-white/70 dark:bg-white/[0.03] p-2">
                  {([
                    ['profile', 'Profile'],
                    ['launch', 'Launch']
                  ] as const).map(([tab, label]) => (
                    <button
                      key={tab}
                      onClick={() => setSettingsSubTab(tab)}
                      className="px-4 py-2 text-xs font-black tracking-[0.16em] uppercase transition"
                      style={{
                        borderRadius: 'calc(12px * var(--g-roundness-mult))',
                        background: settingsSubTab === tab ? 'var(--g-accent-gradient)' : 'transparent',
                        color: settingsSubTab === tab ? 'white' : 'color-mix(in srgb, var(--g-text) 58%, transparent)'
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {settingsSubTab === 'profile' ? (
                <div className="space-y-6">
                  <section className="space-y-4">
                    <div>
                      <p className="text-sm font-black text-slate-900 dark:text-white">Banner image</p>
                      <p className="mt-1 text-sm text-slate-500 dark:text-white/52">This image appears across the top of the instance card and preview areas.</p>
                    </div>
                    <div className="grid gap-4 lg:grid-cols-[290px_minmax(0,1fr)]">
                      <div className="rounded-2xl border border-slate-300 dark:border-white/12 bg-slate-200 dark:bg-white/[0.04] overflow-hidden h-40">
                        {coverDataUrl ? <img src={coverDataUrl} alt="Instance cover" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-xs font-black tracking-[0.16em] uppercase text-slate-500 dark:text-white/40">No banner selected</div>}
                      </div>
                      <div className="flex flex-col justify-center gap-3">
                        <p className="text-sm text-slate-600 dark:text-white/60">Wide images work best here so the instance has a strong identity in your library and editor.</p>
                        <div className="flex gap-2 flex-wrap">
                          <input ref={coverInputRef} type="file" accept="image/*" className="hidden" onChange={handleCoverFile} />
                          <button onClick={() => coverInputRef.current?.click()} className="rounded-xl border border-slate-300 dark:border-white/15 bg-white dark:bg-white/5 px-4 py-2 text-xs font-black tracking-[0.14em] uppercase">Change Banner</button>
                          <button onClick={() => setCoverDataUrl(undefined)} className="rounded-xl border border-slate-300 dark:border-white/15 bg-white dark:bg-white/5 px-4 py-2 text-xs font-black tracking-[0.14em] uppercase">Remove</button>
                        </div>
                      </div>
                    </div>
                  </section>

                  <section className="space-y-4 border-t border-slate-300/80 dark:border-white/10 pt-6">
                    <div>
                      <p className="text-sm font-black text-slate-900 dark:text-white">Picture</p>
                      <p className="mt-1 text-sm text-slate-500 dark:text-white/52">This icon shows in the instance list and editor header.</p>
                    </div>
                    <div className="grid gap-4 lg:grid-cols-[290px_minmax(0,1fr)]">
                      <div className="rounded-2xl border border-slate-300 dark:border-white/12 bg-slate-100 dark:bg-white/[0.03] p-6 flex items-center justify-center">
                        <div className="w-32 h-32 rounded-3xl overflow-hidden border border-slate-300 dark:border-white/15 bg-slate-200 dark:bg-white/10 flex items-center justify-center">
                          {iconDataUrl ? <img src={iconDataUrl} alt="Instance icon" className="w-full h-full object-cover" /> : <span className="text-4xl font-black text-slate-700 dark:text-white/80">{name.slice(0, 1).toUpperCase() || 'I'}</span>}
                        </div>
                      </div>
                      <div className="space-y-4">
                        <div className="flex gap-2 flex-wrap">
                          <input ref={iconInputRef} type="file" accept="image/*" className="hidden" onChange={handleIconFile} />
                          <button onClick={() => iconInputRef.current?.click()} className="rounded-xl border border-slate-300 dark:border-white/15 bg-white dark:bg-white/5 px-4 py-2 text-xs font-black tracking-[0.14em] uppercase">Change Picture</button>
                          <button onClick={() => setIconDataUrl(undefined)} className="rounded-xl border border-slate-300 dark:border-white/15 bg-white dark:bg-white/5 px-4 py-2 text-xs font-black tracking-[0.14em] uppercase">Remove</button>
                        </div>

                        <div>
                          <label className="block text-[10px] font-black tracking-[0.2em] uppercase text-slate-500 dark:text-white/45 mb-2">Name</label>
                          <input value={name} onChange={(event) => setName(event.target.value)} className="w-full rounded-xl border border-slate-300 dark:border-white/15 bg-white dark:bg-black/25 px-4 py-3 text-sm font-semibold text-slate-900 dark:text-white focus:outline-none" />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[10px] font-black tracking-[0.2em] uppercase text-slate-500 dark:text-white/45 mb-2">Accent Tag</label>
                            <div className="flex items-center gap-2">
                              <input type="color" value={colorTag} onChange={(event) => setColorTag(event.target.value)} className="h-10 w-12 rounded-lg border border-slate-300 dark:border-white/15 bg-white dark:bg-black/20 p-1" />
                              <input value={colorTag} onChange={(event) => setColorTag(event.target.value)} className="flex-1 rounded-xl border border-slate-300 dark:border-white/15 bg-white dark:bg-black/25 px-3 py-2 text-sm font-semibold text-slate-900 dark:text-white focus:outline-none" />
                            </div>
                          </div>

                          <div>
                            <label className="block text-[10px] font-black tracking-[0.2em] uppercase text-slate-500 dark:text-white/45 mb-2">Icon Frame</label>
                            <div className="grid grid-cols-3 gap-2">
                              {(['square', 'rounded', 'diamond'] as const).map((frame) => (
                                <button key={frame} onClick={() => setIconFrame(frame)} className={['rounded-xl border px-3 py-2 text-xs font-black tracking-[0.14em] uppercase', iconFrame === frame ? 'g-btn-accent' : 'border-slate-300 dark:border-white/15 bg-white dark:bg-white/5'].join(' ')}>
                                  {frame}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </section>
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="rounded-xl border border-slate-300/80 dark:border-white/12 p-4 bg-white/70 dark:bg-white/[0.02]">
                      <label className="block text-[10px] font-black tracking-[0.2em] uppercase text-slate-500 dark:text-white/45 mb-2">Memory (MB)</label>
                      <input type="range" min={1024} max={16384} step={1024} value={memoryMb} onChange={(event) => setMemoryMb(Number(event.target.value))} className="w-full g-range" />
                      <p className="mt-2 text-sm font-bold text-slate-800 dark:text-white">{memoryMb} MB</p>
                    </div>

                    <div className="rounded-xl border border-slate-300/80 dark:border-white/12 p-4 bg-white/70 dark:bg-white/[0.02]">
                      <label className="block text-[10px] font-black tracking-[0.2em] uppercase text-slate-500 dark:text-white/45 mb-2">JVM Args</label>
                      <input value={jvmArgs} onChange={(event) => setJvmArgs(event.target.value)} placeholder="-XX:+UseG1GC" className="w-full rounded-xl border border-slate-300 dark:border-white/15 bg-white dark:bg-black/25 px-4 py-3 text-sm font-semibold text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-white/35 focus:outline-none" />
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-300/80 dark:border-white/12 p-4 bg-white/70 dark:bg-white/[0.02] space-y-3">
                    <div>
                      <p className="text-sm font-black text-slate-900 dark:text-white">Java Runtime</p>
                      <p className="mt-1 text-sm text-slate-500 dark:text-white/52">This runtime is saved per instance and used when you launch from Bloom.</p>
                    </div>
                    {instance.mcVersion.startsWith('1.19') && (
                      <div className="rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-xs font-semibold text-amber-800 dark:text-amber-200">
                        Recommended: Java 17 for 1.19 packs.
                        <button onClick={() => { setJavaRuntime('java17'); setJavaPathOverride('java17'); }} className="ml-2 rounded-md border border-amber-500/50 px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em]">
                          Use Java 17
                        </button>
                      </div>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                      <button onClick={() => setJavaRuntime('system')} className={['rounded-xl border px-3 py-2 text-xs font-black tracking-[0.14em] uppercase', javaRuntime === 'system' ? 'g-btn-accent' : 'border-slate-300 dark:border-white/15 bg-white dark:bg-white/5'].join(' ')}>System Java</button>
                      <button onClick={() => { setJavaRuntime('java17'); setJavaPathOverride('java17'); }} className={['rounded-xl border px-3 py-2 text-xs font-black tracking-[0.14em] uppercase', javaRuntime === 'java17' ? 'g-btn-accent' : 'border-slate-300 dark:border-white/15 bg-white dark:bg-white/5'].join(' ')}>Java 17 Preset</button>
                      <button onClick={() => setJavaRuntime('custom')} className={['rounded-xl border px-3 py-2 text-xs font-black tracking-[0.14em] uppercase', javaRuntime === 'custom' ? 'g-btn-accent' : 'border-slate-300 dark:border-white/15 bg-white dark:bg-white/5'].join(' ')}>Custom Path</button>
                    </div>
                    <input value={javaPathOverride} onChange={(event) => setJavaPathOverride(event.target.value)} disabled={javaRuntime === 'system'} placeholder={javaRuntime === 'custom' ? 'C:\\Program Files\\Java\\jdk-17\\bin\\javaw.exe' : 'java'} className="w-full rounded-xl border border-slate-300 dark:border-white/15 bg-white dark:bg-black/25 px-4 py-3 text-sm font-semibold text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-white/35 focus:outline-none disabled:opacity-50" />
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      ) : activeTab === 'mods' ? (
        modsView === 'installed' ? renderInstalledLibrary(
          'Mods',
          modLoading,
          mods,
          () => { void reloadMods(); },
          () => { void TauriApi.openModsFolder(instance.id); },
          () => setModsView('install'),
          (row) => { void removeMod(row as InstanceModFile); },
          (row) => { void toggleMod(row); },
          <button onClick={autoInstallFabricApi} disabled={instance.loader !== 'fabric' || installingFabricApi} className="rounded-xl border border-emerald-500/50 bg-emerald-500/15 px-3 py-2 text-xs font-black tracking-[0.14em] uppercase text-emerald-700 dark:text-emerald-300 inline-flex items-center gap-1.5 disabled:opacity-45"><ShieldPlus size={13} /> {installingFabricApi ? 'Installing...' : 'Auto Fabric API'}</button>
        ) : (
          <div className="space-y-4">
            {renderMarketplaceList('Mods Marketplace', modsQuery, setModsQuery, modsSource, setModsSource, modsSearching, () => { void searchModsMarket(); }, modsResults, modsInstallingId, (row) => { void installMarketplaceMod(row as MarketplaceMod); }, 'Search marketplace mods...', 'Search to load marketplace mods for this instance.', 'border-emerald-500/50 bg-emerald-500/15 text-emerald-700 dark:text-emerald-200', 'mod')}
            <section className="g-panel p-6">
              <div onDrop={handleDrop} onDragOver={handleDragOver} onDragLeave={handleDragLeave} className={['rounded-2xl border-2 border-dashed p-4 text-center transition-colors', isDragging ? 'border-[var(--g-accent)] bg-[var(--g-accent-soft)]' : 'border-slate-300/80 dark:border-white/20 bg-slate-100/40 dark:bg-white/[0.03]'].join(' ')}>
                <p className="text-sm font-black text-slate-700 dark:text-white/75 inline-flex items-center gap-2"><UploadCloud size={15} /> Drop .jar files here</p>
                <input ref={fileInputRef} type="file" multiple accept=".jar" className="hidden" onChange={handleFileInput} />
                <div className="mt-3 flex justify-center gap-2 flex-wrap">
                  <button onClick={() => { void pickAndInstallMods(); }} disabled={installingMods} className="g-btn-accent px-3 py-2 text-xs font-black tracking-[0.14em] uppercase">{installingMods ? 'Installing...' : 'Choose Files'}</button>
                  <button onClick={() => fileInputRef.current?.click()} disabled={installingMods} className="rounded-xl border border-slate-300 dark:border-white/15 bg-white dark:bg-white/5 px-3 py-2 text-xs font-black tracking-[0.14em] uppercase">{installingMods ? 'Installing...' : 'Browser Fallback'}</button>
                  <button onClick={() => { void TauriApi.openModsFolder(instance.id); }} className="rounded-xl border border-slate-300 dark:border-white/15 bg-white dark:bg-white/5 px-3 py-2 text-xs font-black tracking-[0.14em] uppercase inline-flex items-center gap-1.5"><FolderOpen size={13} /> Folder</button>
                </div>
              </div>
            </section>
          </div>
        )
      ) : activeTab === 'resourcepacks' ? (
        resourcepacksView === 'installed'
          ? renderInstalledLibrary(
            'Resource Packs',
            resourcepacksLoading,
            resourcepacks,
            () => { void reloadResourcepacks(); },
            () => { void TauriApi.openResourcepacksFolder(instance.id); },
            () => setResourcepacksView('install'),
            (row) => { void removeResourcepack(row as InstanceContentFile); }
          )
          : renderMarketplaceList('Resource Packs Marketplace', resourcepacksQuery, setResourcepacksQuery, resourcepacksSource, setResourcepacksSource, resourcepacksSearching, () => { void searchResourcePacksMarket(); }, resourcepacksResults, resourcepacksInstallingId, (row) => { void installMarketplaceResourcePack(row as MarketplacePack); }, 'Search resource packs...', 'Search to load resource packs.', 'border-cyan-500/50 bg-cyan-500/15 text-cyan-700 dark:text-cyan-200', 'pack')
      ) : (
        shadersView === 'installed'
          ? renderInstalledLibrary(
            'Shaders',
            shaderpacksLoading,
            shaderpacks,
            () => { void reloadShaderpacks(); },
            () => { void TauriApi.openShaderpacksFolder(instance.id); },
            () => setShadersView('install'),
            (row) => { void removeShaderpack(row as InstanceContentFile); }
          )
          : renderMarketplaceList('Shaders Marketplace', shadersQuery, setShadersQuery, shadersSource, setShadersSource, shadersSearching, () => { void searchShadersMarket(); }, shadersResults, shadersInstallingId, (row) => { void installMarketplaceShader(row as MarketplacePack); }, 'Search shaders...', 'Search to load shader packs.', 'border-fuchsia-500/50 bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-200', 'shader')
      )}

      {(statusMessage || lastInstallResult) && (
        <section className="g-panel p-3 text-sm font-semibold text-slate-700 dark:text-white/75">
          {statusMessage || 'Done'}
        </section>
      )}
    </div>
  );
}
