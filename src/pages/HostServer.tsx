import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import {
  Activity,
  Archive,
  Copy,
  Folder,
  FolderOpen,
  HardDrive,
  Play,
  RefreshCcw,
  Save,
  Search,
  Settings2,
  Square,
  Terminal,
  Trash2,
  Users
} from 'lucide-react';
import { useHostedServers } from '../hooks/useHostedServers';
import {
  HostedServerBackup,
  HostedServerFileEntry,
  HostedServerLogLine,
  HostedServerStatus,
  TauriApi
} from '../services/tauri';
import { UniversalLoadingOverlay } from '../components/UniversalLoadingOverlay';

type SectionId = 'overview' | 'files' | 'console' | 'players' | 'backups' | 'settings';

const SECTION_ITEMS: Array<{ id: SectionId; label: string; icon: any }> = [
  { id: 'overview', label: 'Overview', icon: Activity },
  { id: 'files', label: 'Files', icon: Folder },
  { id: 'console', label: 'Console', icon: Terminal },
  { id: 'players', label: 'Players', icon: Users },
  { id: 'backups', label: 'Backups', icon: Archive },
  { id: 'settings', label: 'Settings', icon: Settings2 }
];

function levelClass(level: string) {
  const lowered = level.toLowerCase();
  if (lowered.includes('error')) return 'text-rose-300';
  if (lowered.includes('warn')) return 'text-amber-300';
  if (lowered.includes('success')) return 'text-emerald-300';
  if (lowered.includes('command')) return 'g-accent-text';
  return 'text-white/80';
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatUptime(seconds?: number | null) {
  if (!seconds || seconds <= 0) return '0m';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h <= 0) return `${m}m`;
  return `${h}h ${m}m`;
}

export function HostServer() {
  const { servers, loading, error, loadServers, createServer, updateServer, deleteServer, startServer, stopServer, restartServer, getStatus } = useHostedServers();

  const [section, setSection] = useState<SectionId>('overview');
  const [selectedServerId, setSelectedServerId] = useState<string>('');
  const [status, setStatus] = useState<HostedServerStatus | null>(null);
  const [logs, setLogs] = useState<HostedServerLogLine[]>([]);
  const [logFilter, setLogFilter] = useState('');
  const [commandInput, setCommandInput] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [filePath, setFilePath] = useState('.');
  const [files, setFiles] = useState<HostedServerFileEntry[]>([]);
  const [selectedFilePath, setSelectedFilePath] = useState('');
  const [selectedFileText, setSelectedFileText] = useState('');
  const [backups, setBackups] = useState<HostedServerBackup[]>([]);
  const [tunnelSubdomain, setTunnelSubdomain] = useState('');
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<{
    open: boolean;
    eyebrow: string;
    title: string;
    description: string;
  }>({
    open: false,
    eyebrow: 'Working',
    title: 'Preparing...',
    description: 'Please wait.'
  });

  const [createName, setCreateName] = useState('My Bloom Server');
  const [createVersion, setCreateVersion] = useState('1.21.1');
  const [createLoader, setCreateLoader] = useState('vanilla');
  const [createMemory, setCreateMemory] = useState(4096);
  const [createPort, setCreatePort] = useState(25565);

  const [settingsDraft, setSettingsDraft] = useState({
    name: '',
    version: '',
    loader: 'vanilla',
    memoryMb: 4096,
    port: 25565,
    motd: '',
    maxPlayers: 20
  });

  const uploadRef = useRef<HTMLInputElement | null>(null);
  const consoleRef = useRef<HTMLDivElement | null>(null);
  const selectedServer = useMemo(() => servers.find((server) => server.id === selectedServerId) || null, [servers, selectedServerId]);
  const sleep = (ms: number) => new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });

  const runActionWithLoading = async <T,>(
    actionId: string,
    title: string,
    description: string,
    work: (setStage: (nextTitle: string, nextDescription: string) => void) => Promise<T>
  ): Promise<T | null> => {
    setBusyAction(actionId);
    setActionNotice(null);
    setActionLoading({
      open: true,
      eyebrow: 'Working',
      title,
      description
    });

    const setStage = (nextTitle: string, nextDescription: string) => {
      setActionLoading((current) => ({
        ...current,
        title: nextTitle,
        description: nextDescription
      }));
    };

    try {
      return await work(setStage);
    } catch (error: any) {
      setActionNotice(error?.message ? String(error.message) : String(error));
      return null;
    } finally {
      setBusyAction(null);
      setActionLoading((current) => ({ ...current, open: false }));
    }
  };

  const waitForServerStarted = async (
    serverId: string,
    setStage: (title: string, description: string) => void
  ) => {
    const startedAt = Date.now();
    let sawRunning = false;

    while (Date.now() - startedAt < 45000) {
      const [nextStatus, nextLogs] = await Promise.all([
        getStatus(serverId).catch(() => null),
        TauriApi.hostedServersLogs(serverId, 160).catch(() => [] as HostedServerLogLine[])
      ]);
      if (nextStatus) setStatus(nextStatus);
      if (nextStatus?.running) sawRunning = true;

      const ready = nextLogs.some((line) => /done \(/i.test(line.line));
      if (ready) {
        setStage('Server Online', 'Startup complete. Opening dashboard...');
        await sleep(260);
        return;
      }

      const elapsed = Math.max(1, Math.floor((Date.now() - startedAt) / 1000));
      if (!sawRunning) {
        setStage('Starting Server', `Launching local Java process... (${elapsed}s)`);
      } else {
        setStage('Starting Server', `Process running. Waiting for world startup... (${elapsed}s)`);
      }
      await sleep(900);
    }

    setStage('Starting Server', 'Process started. Additional startup logs may continue in the console.');
    await sleep(260);
  };

  const waitForServerStopped = async (
    serverId: string,
    setStage: (title: string, description: string) => void
  ) => {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 20000) {
      const nextStatus = await getStatus(serverId).catch(() => null);
      if (nextStatus) setStatus(nextStatus);
      if (!nextStatus?.running) return;
      const elapsed = Math.max(1, Math.floor((Date.now() - startedAt) / 1000));
      setStage('Stopping Server', `Waiting for process shutdown... (${elapsed}s)`);
      await sleep(700);
    }
  };

  useEffect(() => {
    if (!selectedServerId && servers.length > 0) {
      setSelectedServerId(servers[0].id);
    }
  }, [selectedServerId, servers]);

  useEffect(() => {
    if (!selectedServer) return;
    setSettingsDraft({
      name: selectedServer.name,
      version: selectedServer.version,
      loader: selectedServer.loader,
      memoryMb: selectedServer.memoryMb,
      port: selectedServer.port,
      motd: selectedServer.motd,
      maxPlayers: selectedServer.maxPlayers
    });
    setTunnelSubdomain(selectedServer.publicHost?.split('.playbloom.gg')[0] || '');
  }, [selectedServer?.id]);

  useEffect(() => {
    if (!selectedServerId) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const next = await getStatus(selectedServerId);
        if (!cancelled) setStatus(next);
      } catch {
        if (!cancelled) setStatus(null);
      }
    };
    void poll();
    const timer = window.setInterval(() => {
      void poll();
    }, 2500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [getStatus, selectedServerId]);

  useEffect(() => {
    if (!selectedServerId) return;
    let cancelled = false;
    const refreshLogs = async () => {
      try {
        const next = await TauriApi.hostedServersLogs(selectedServerId, 400);
        if (!cancelled) setLogs(next);
      } catch {
        if (!cancelled) setLogs([]);
      }
    };
    void refreshLogs();
    const timer = window.setInterval(() => {
      void refreshLogs();
    }, 1200);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [selectedServerId]);

  useEffect(() => {
    if (!selectedServerId || section !== 'files') return;
    void refreshFiles(filePath);
  }, [selectedServerId, section, filePath]);

  useEffect(() => {
    if (!selectedServerId || section !== 'backups') return;
    void refreshBackups();
  }, [selectedServerId, section]);

  useEffect(() => {
    if (!autoScroll) return;
    if (!consoleRef.current) return;
    consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
  }, [autoScroll, logs]);

  const refreshFiles = async (targetPath = filePath) => {
    if (!selectedServerId) return;
    const entries = await TauriApi.hostedServersFilesList(selectedServerId, targetPath);
    setFiles(entries);
  };

  const refreshBackups = async () => {
    if (!selectedServerId) return;
    const next = await TauriApi.hostedServersBackupsList(selectedServerId);
    setBackups(next);
  };

  const onCreateServer = async () => {
    const created = await runActionWithLoading('create', 'Creating Server', 'Preparing folders and metadata...', async (setStage) => {
      setStage('Creating Server', 'Writing config and downloading server runtime...');
      const next = await createServer({
        name: createName,
        version: createVersion,
        loader: createLoader,
        memoryMb: createMemory,
        port: createPort
      });
      setStage('Creating Server', 'Refreshing server list...');
      await loadServers();
      return next;
    });

    if (created) {
      setSelectedServerId(created.id);
      setSection('overview');
      const nextStatus = await getStatus(created.id).catch(() => null);
      if (nextStatus) setStatus(nextStatus);
    }
  };

  const onStart = async () => {
    if (!selectedServerId) return;
    await runActionWithLoading('start', 'Starting Server', 'Launching local host process...', async (setStage) => {
      const next = await startServer(selectedServerId);
      setStatus(next);
      await waitForServerStarted(selectedServerId, setStage);
    });
  };

  const onStop = async () => {
    if (!selectedServerId) return;
    await runActionWithLoading('stop', 'Stopping Server', 'Sending shutdown command...', async (setStage) => {
      const next = await stopServer(selectedServerId);
      setStatus(next);
      await waitForServerStopped(selectedServerId, setStage);
    });
  };

  const onRestart = async () => {
    if (!selectedServerId) return;
    await runActionWithLoading('restart', 'Restarting Server', 'Stopping and relaunching process...', async (setStage) => {
      const next = await restartServer(selectedServerId);
      setStatus(next);
      await waitForServerStarted(selectedServerId, setStage);
    });
  };

  const onSendCommand = async () => {
    if (!selectedServerId) return;
    const trimmed = commandInput.trim();
    if (!trimmed) return;
    await TauriApi.hostedServersSendCommand(selectedServerId, trimmed);
    setCommandInput('');
  };

  const onSaveSettings = async () => {
    if (!selectedServerId) return;
    await runActionWithLoading('save-settings', 'Saving Settings', 'Applying server configuration changes...', async () => {
      await updateServer(selectedServerId, settingsDraft);
      setStatus(await getStatus(selectedServerId));
    });
  };

  const filteredLogs = useMemo(() => {
    const q = logFilter.trim().toLowerCase();
    if (!q) return logs;
    return logs.filter((line) => `${line.line} ${line.level} ${line.source}`.toLowerCase().includes(q));
  }, [logFilter, logs]);

  const players = useMemo(() => {
    const online = new Set<string>();
    for (const line of logs) {
      const joined = line.line.match(/^(.+?) joined the game/i);
      if (joined?.[1]) online.add(joined[1]);
      const left = line.line.match(/^(.+?) left the game/i);
      if (left?.[1]) online.delete(left[1]);
    }
    return Array.from(online);
  }, [logs]);

  const openFile = async (entry: HostedServerFileEntry) => {
    if (!selectedServerId) return;
    if (entry.isDir) {
      setFilePath(entry.relativePath || '.');
      setSelectedFilePath('');
      setSelectedFileText('');
      return;
    }
    const result = await TauriApi.hostedServersFilesRead(selectedServerId, entry.relativePath);
    setSelectedFilePath(result.relativePath);
    setSelectedFileText(result.text);
  };

  const goUpFolder = () => {
    if (filePath === '.' || !filePath) return;
    const parts = filePath.split('/').filter(Boolean);
    parts.pop();
    setFilePath(parts.length > 0 ? parts.join('/') : '.');
  };

  const onUploadFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !selectedServerId) return;
    const text = await file.text();
    const target = filePath === '.' ? file.name : `${filePath}/${file.name}`;
    await TauriApi.hostedServersFilesWrite(selectedServerId, target, text);
    await refreshFiles();
    event.target.value = '';
  };

  const buildRelativePath = (base: string, name: string) => (base === '.' ? name : `${base}/${name}`);

  const onCreateFile = async (directory: boolean) => {
    if (!selectedServerId) return;
    const label = directory ? 'folder' : 'file';
    const name = window.prompt(`New ${label} name`);
    if (!name) return;
    const target = buildRelativePath(filePath, name.trim());
    await TauriApi.hostedServersFilesCreate(selectedServerId, target, directory);
    await refreshFiles();
  };

  const onRenameSelectedFile = async () => {
    if (!selectedServerId || !selectedFilePath) return;
    const parts = selectedFilePath.split('/').filter(Boolean);
    const currentName = parts[parts.length - 1] || selectedFilePath;
    const nextName = window.prompt('Rename file to', currentName);
    if (!nextName || nextName.trim() === currentName) return;
    const parent = parts.slice(0, -1).join('/');
    const target = parent ? `${parent}/${nextName.trim()}` : nextName.trim();
    await TauriApi.hostedServersFilesRename(selectedServerId, selectedFilePath, target);
    setSelectedFilePath(target);
    await refreshFiles();
  };

  const onDownloadSelectedFile = () => {
    if (!selectedFilePath) return;
    const blob = new Blob([selectedFileText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const name = selectedFilePath.split('/').filter(Boolean).pop() || 'server-file.txt';
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  const onCreateBackup = async () => {
    if (!selectedServerId) return;
    await runActionWithLoading('backup-create', 'Creating Backup', 'Copying world and config files...', async () => {
      await TauriApi.hostedServersBackupsCreate(selectedServerId);
      await refreshBackups();
    });
  };

  const onConnectTunnel = async () => {
    if (!selectedServerId) return;
    await runActionWithLoading('tunnel-open', 'Connecting Tunnel', 'Requesting Bloom relay session...', async () => {
      const session = await TauriApi.hostedServersTunnelOpen(selectedServerId, tunnelSubdomain || undefined);
      await loadServers();
      setStatus(await getStatus(selectedServerId));
      if (session.state !== 'connected') {
        setActionNotice(session.message || 'Tunnel is not connected yet.');
      } else {
        setActionNotice(`Tunnel connected: ${session.publicAddress}`);
      }
    });
  };

  const onDisconnectTunnel = async () => {
    if (!selectedServerId) return;
    await runActionWithLoading('tunnel-close', 'Disconnecting Tunnel', 'Closing active relay session...', async () => {
      await TauriApi.hostedServersTunnelClose(selectedServerId);
      await loadServers();
      setStatus(await getStatus(selectedServerId));
    });
  };

  const onRestoreBackup = async (backupId: string) => {
    if (!selectedServerId) return;
    await runActionWithLoading('backup-restore', 'Restoring Backup', `Restoring ${backupId}...`, async () => {
      await TauriApi.hostedServersBackupsRestore(selectedServerId, backupId);
      await refreshBackups();
      setStatus(await getStatus(selectedServerId));
    });
  };

  const onDeleteBackup = async (backupId: string) => {
    if (!selectedServerId) return;
    await runActionWithLoading('backup-delete', 'Deleting Backup', `Removing ${backupId}...`, async () => {
      await TauriApi.hostedServersBackupsDelete(selectedServerId, backupId);
      await refreshBackups();
    });
  };

  const onDeleteServer = async () => {
    if (!selectedServer) return;
    await runActionWithLoading('server-delete', 'Deleting Server', `Removing ${selectedServer.name}...`, async () => {
      await deleteServer(selectedServer.id);
      await loadServers();
      setSelectedServerId('');
      setStatus(null);
    });
  };

  return (
    <div className="mx-auto max-w-[1550px] min-h-full space-y-3">
      <section className="g-panel-strong px-3 py-3">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] g-accent-text">Host Server</p>
        <h1 className="text-2xl font-extrabold text-white">Bloom Host Control</h1>
        <p className="text-xs text-white/60">Local server process with Bloom-managed tunnel hostname and compact controls.</p>
      </section>

      <div className="grid grid-cols-[56px_280px_minmax(0,1fr)] gap-3">
        <aside className="g-panel p-1.5 h-fit sticky top-2">
          {SECTION_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => setSection(item.id)}
              className={`w-full h-10 rounded-lg border mb-1 inline-flex items-center justify-center transition ${section === item.id ? 'g-btn-accent' : 'border-transparent bg-white/[0.03] text-white/70 hover:border-white/12'}`}
              title={item.label}
            >
              <item.icon size={14} />
            </button>
          ))}
        </aside>

        <aside className="g-panel p-2.5 space-y-2">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5 space-y-2">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-white/55">Create Server</p>
            <input value={createName} onChange={(event) => setCreateName(event.target.value)} className="g-input h-8 w-full px-2 text-[11px]" placeholder="Server Name" />
            <div className="grid grid-cols-2 gap-2">
              <input value={createVersion} onChange={(event) => setCreateVersion(event.target.value)} className="g-input h-8 w-full px-2 text-[11px]" placeholder="Version" />
              <select value={createLoader} onChange={(event) => setCreateLoader(event.target.value)} className="g-select-trigger h-8 w-full px-2 text-[11px]">
                <option value="vanilla">vanilla</option>
                <option value="fabric">fabric</option>
                <option value="paper">paper</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input type="number" value={createMemory} onChange={(event) => setCreateMemory(Number(event.target.value || 4096))} className="g-input h-8 w-full px-2 text-[11px]" placeholder="Memory MB" />
              <input type="number" value={createPort} onChange={(event) => setCreatePort(Number(event.target.value || 25565))} className="g-input h-8 w-full px-2 text-[11px]" placeholder="Port" />
            </div>
            <button onClick={() => void onCreateServer()} disabled={busyAction === 'create'} className="g-btn-accent h-8 w-full text-[10px] font-extrabold uppercase tracking-[0.12em]">
              {busyAction === 'create' ? 'Creating...' : 'Create'}
            </button>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-2">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-white/55">Servers</p>
              <button onClick={() => void loadServers()} className="g-btn h-7 px-2 text-[10px] font-extrabold uppercase tracking-[0.12em]">Refresh</button>
            </div>
            <div className="max-h-[540px] overflow-y-auto space-y-1">
              {loading ? <p className="text-xs text-white/55">Loading...</p> : servers.map((server) => (
                <button
                  key={server.id}
                  onClick={() => setSelectedServerId(server.id)}
                  className={`w-full rounded-lg border px-2 py-2 text-left ${selectedServerId === server.id ? 'border-[var(--g-accent)]/45 bg-[var(--g-accent-soft)]' : 'border-white/10 bg-white/[0.02]'}`}
                >
                  <p className="text-xs font-black text-white truncate">{server.name}</p>
                  <p className="text-[10px] text-white/50">{server.loader} {server.version}</p>
                </button>
              ))}
            </div>
          </div>
        </aside>

        <section className="g-panel p-2.5 min-h-[760px]">
          {!selectedServer ? (
            <div className="h-full rounded-xl border border-dashed border-white/20 bg-white/[0.02] flex items-center justify-center text-sm font-extrabold text-white/45">Create or select a server to begin.</div>
          ) : (
            <>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 mb-2 flex flex-wrap items-center gap-2">
                <div className="min-w-0 mr-auto">
                  <p className="text-sm font-extrabold text-white truncate">{selectedServer.name}</p>
                  <p className="text-[10px] text-white/50">{selectedServer.loader} {selectedServer.version} - {status?.running ? 'running' : 'stopped'}</p>
                </div>
                <button onClick={() => void onStart()} disabled={busyAction === 'start' || status?.running} className="g-btn-accent h-8 px-3 text-[10px] font-extrabold uppercase tracking-[0.12em] inline-flex items-center gap-1"><Play size={12} /> Start</button>
                <button onClick={() => void onStop()} disabled={busyAction === 'stop' || !status?.running} className="g-btn h-8 px-3 text-[10px] font-extrabold uppercase tracking-[0.12em] inline-flex items-center gap-1"><Square size={12} /> Stop</button>
                <button onClick={() => void onRestart()} disabled={busyAction === 'restart'} className="g-btn h-8 px-3 text-[10px] font-extrabold uppercase tracking-[0.12em] inline-flex items-center gap-1"><RefreshCcw size={12} /> Restart</button>
                <button onClick={() => navigator.clipboard.writeText(status?.publicAddress || status?.localAddress || '')} className="g-btn h-8 px-3 text-[10px] font-extrabold uppercase tracking-[0.12em] inline-flex items-center gap-1"><Copy size={12} /> Copy Address</button>
                <button onClick={() => { void TauriApi.hostedServersOpenFolder(selectedServer.id); }} className="g-btn h-8 px-3 text-[10px] font-extrabold uppercase tracking-[0.12em] inline-flex items-center gap-1"><FolderOpen size={12} /> Open Folder</button>
              </div>

              {section === 'overview' && (
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-2.5">
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 xl:col-span-1">
                    <p className="text-[10px] uppercase tracking-[0.12em] font-extrabold text-white/55">Server Status</p>
                    <p className={`mt-1 text-xl font-extrabold ${status?.running ? 'text-emerald-300' : 'text-white'}`}>{status?.running ? 'Online' : 'Offline'}</p>
                    <p className="text-xs text-white/55 mt-1">Uptime: {formatUptime(status?.uptimeSeconds)}</p>
                    <p className="text-xs text-white/55">Local: {status?.localAddress || 'n/a'}</p>
                    <p className="text-xs text-white/55">Public: {status?.publicAddress || 'Connect tunnel to get shareable host'}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 xl:col-span-1">
                    <p className="text-[10px] uppercase tracking-[0.12em] font-extrabold text-white/55">Resource Usage</p>
                    <p className="text-sm text-white/75 mt-1 inline-flex items-center gap-1"><HardDrive size={13} /> JVM Memory Target: {selectedServer.memoryMb} MB</p>
                    <p className="text-xs text-white/55 mt-2">Process metrics can be extended via platform-specific collectors.</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 xl:col-span-1">
                    <p className="text-[10px] uppercase tracking-[0.12em] font-extrabold text-white/55">Recent Logs</p>
                    <div className="mt-2 max-h-[170px] overflow-y-auto space-y-1 pr-1 font-mono text-[11px]">
                      {logs.slice(-12).map((line) => (
                        <p key={line.id} className={levelClass(line.level)}>{line.line}</p>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {section === 'files' && (
                <div className="grid grid-cols-[320px_minmax(0,1fr)] gap-2.5">
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
                    <div className="flex items-center gap-1.5 mb-2">
                      <button onClick={goUpFolder} className="g-btn h-7 px-2 text-[10px] font-extrabold uppercase tracking-[0.12em]">Up</button>
                      <button onClick={() => void refreshFiles()} className="g-btn h-7 px-2 text-[10px] font-extrabold uppercase tracking-[0.12em]">Refresh</button>
                      <button onClick={() => uploadRef.current?.click()} className="g-btn h-7 px-2 text-[10px] font-extrabold uppercase tracking-[0.12em]">Upload</button>
                      <button onClick={() => void onCreateFile(false)} className="g-btn h-7 px-2 text-[10px] font-extrabold uppercase tracking-[0.12em]">New File</button>
                      <button onClick={() => void onCreateFile(true)} className="g-btn h-7 px-2 text-[10px] font-extrabold uppercase tracking-[0.12em]">New Folder</button>
                    </div>
                    <input value={filePath} onChange={(event) => setFilePath(event.target.value || '.')} className="g-input h-7 w-full px-2 text-[11px]" />
                    <input ref={uploadRef} type="file" className="hidden" onChange={onUploadFile} />
                    <div className="mt-2 max-h-[510px] overflow-y-auto space-y-1 pr-1">
                      {files.map((entry) => (
                        <button key={entry.relativePath} onClick={() => void openFile(entry)} className="w-full rounded-md border border-white/10 bg-black/20 px-2 py-1.5 text-left">
                          <p className="text-[11px] font-bold text-white truncate">{entry.isDir ? '[DIR] ' : ''}{entry.name}</p>
                          <p className="text-[10px] text-white/45">{entry.relativePath}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
                    <div className="flex items-center gap-2 mb-2">
                      <p className="text-[11px] text-white/70 truncate mr-auto">{selectedFilePath || 'Select a text file'}</p>
                      <button onClick={onDownloadSelectedFile} disabled={!selectedFilePath} className="g-btn h-7 px-2 text-[10px] font-extrabold uppercase tracking-[0.12em]">Download</button>
                      <button onClick={() => void onRenameSelectedFile()} disabled={!selectedFilePath} className="g-btn h-7 px-2 text-[10px] font-extrabold uppercase tracking-[0.12em]">Rename</button>
                      <button onClick={() => selectedServerId && selectedFilePath && void TauriApi.hostedServersFilesWrite(selectedServerId, selectedFilePath, selectedFileText)} disabled={!selectedFilePath} className="g-btn h-7 px-2 text-[10px] font-extrabold uppercase tracking-[0.12em] inline-flex items-center gap-1"><Save size={11} /> Save</button>
                      <button onClick={() => selectedServerId && selectedFilePath && void TauriApi.hostedServersFilesDelete(selectedServerId, selectedFilePath).then(() => { setSelectedFilePath(''); setSelectedFileText(''); return refreshFiles(); })} disabled={!selectedFilePath} className="g-btn h-7 px-2 text-[10px] font-extrabold uppercase tracking-[0.12em] inline-flex items-center gap-1"><Trash2 size={11} /> Delete</button>
                    </div>
                    <textarea
                      value={selectedFileText}
                      onChange={(event) => setSelectedFileText(event.target.value)}
                      className="g-input w-full h-[540px] p-2 font-mono text-[12px] leading-5 resize-none"
                      placeholder="File contents..."
                    />
                  </div>
                </div>
              )}

              {section === 'console' && (
                <div className="rounded-xl border border-white/10 bg-black/30 p-2.5">
                  <div className="flex items-center gap-1.5 mb-2">
                    <div className="relative w-full max-w-[280px]">
                      <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-white/40" />
                      <input value={logFilter} onChange={(event) => setLogFilter(event.target.value)} placeholder="Filter logs" className="g-input h-8 w-full pl-7 pr-2 text-[11px]" />
                    </div>
                    <button onClick={() => setAutoScroll((prev) => !prev)} className="g-btn h-8 px-2 text-[10px] font-extrabold uppercase tracking-[0.12em]">{autoScroll ? 'Autoscroll On' : 'Autoscroll Off'}</button>
                    <button onClick={() => selectedServer && void TauriApi.hostedServersLogsClear(selectedServer.id)} className="g-btn h-8 px-2 text-[10px] font-extrabold uppercase tracking-[0.12em]">Clear</button>
                  </div>
                  <div ref={consoleRef} className="h-[470px] overflow-y-auto rounded-xl border border-white/10 bg-black/45 px-3 py-2 font-mono text-[12px] leading-6">
                    {filteredLogs.map((line) => (
                      <p key={line.id} className={levelClass(line.level)}>[{new Date(line.ts * 1000).toLocaleTimeString()}] {line.line}</p>
                    ))}
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      value={commandInput}
                      onChange={(event) => setCommandInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          void onSendCommand();
                        }
                      }}
                      placeholder="say hello from bloom"
                      className="g-input h-8 w-full px-2 text-[12px] font-mono"
                    />
                    <button onClick={() => void onSendCommand()} className="g-btn-accent h-8 px-3 text-[10px] font-extrabold uppercase tracking-[0.12em]">Send</button>
                  </div>
                </div>
              )}

              {section === 'players' && (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-2.5">
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                    <p className="text-[10px] uppercase tracking-[0.12em] font-extrabold text-white/55">Current Players</p>
                    {players.length === 0 ? <p className="text-sm text-white/55 mt-2">No detected players online.</p> : (
                      <div className="mt-2 space-y-1">{players.map((player) => <p key={player} className="text-sm text-white">{player}</p>)}</div>
                    )}
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                    <p className="text-[10px] uppercase tracking-[0.12em] font-extrabold text-white/55">Join/Leave Feed</p>
                    <div className="mt-2 max-h-[260px] overflow-y-auto space-y-1">
                      {logs.filter((line) => /joined the game|left the game/i.test(line.line)).slice(-30).map((line) => (
                        <p key={line.id} className={`text-sm ${/joined/.test(line.line) ? 'text-emerald-300' : 'text-amber-300'}`}>{line.line}</p>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {section === 'backups' && (
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
                  <div className="flex items-center gap-2 mb-2">
                    <button onClick={() => void onCreateBackup()} className="g-btn-accent h-8 px-3 text-[10px] font-extrabold uppercase tracking-[0.12em]">Create Backup</button>
                    <button onClick={() => void refreshBackups()} className="g-btn h-8 px-3 text-[10px] font-extrabold uppercase tracking-[0.12em]">Refresh</button>
                  </div>
                  <div className="space-y-1.5 max-h-[560px] overflow-y-auto pr-1">
                    {backups.map((backup) => (
                      <div key={backup.id} className="rounded-lg border border-white/10 bg-black/20 px-2.5 py-2 flex items-center gap-2">
                        <div className="min-w-0 mr-auto">
                          <p className="text-xs font-extrabold text-white truncate">{backup.id}</p>
                          <p className="text-[10px] text-white/45">{new Date(backup.createdAt * 1000).toLocaleString()} - {formatBytes(backup.sizeBytes)}</p>
                        </div>
                        <button onClick={() => void onRestoreBackup(backup.id)} className="g-btn h-7 px-2 text-[10px] font-extrabold uppercase tracking-[0.12em]">Restore</button>
                        <button onClick={() => void onDeleteBackup(backup.id)} className="g-btn h-7 px-2 text-[10px] font-extrabold uppercase tracking-[0.12em]">Delete</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {section === 'settings' && (
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <input value={settingsDraft.name} onChange={(event) => setSettingsDraft((prev) => ({ ...prev, name: event.target.value }))} className="g-input h-8 px-2 text-[11px]" placeholder="Name" />
                    <input value={settingsDraft.version} onChange={(event) => setSettingsDraft((prev) => ({ ...prev, version: event.target.value }))} className="g-input h-8 px-2 text-[11px]" placeholder="Version" />
                    <select value={settingsDraft.loader} onChange={(event) => setSettingsDraft((prev) => ({ ...prev, loader: event.target.value }))} className="g-select-trigger h-8 px-2 text-[11px]">
                      <option value="vanilla">vanilla</option>
                      <option value="fabric">fabric</option>
                      <option value="paper">paper</option>
                    </select>
                    <input type="number" value={settingsDraft.memoryMb} onChange={(event) => setSettingsDraft((prev) => ({ ...prev, memoryMb: Number(event.target.value || 4096) }))} className="g-input h-8 px-2 text-[11px]" placeholder="Memory MB" />
                    <input type="number" value={settingsDraft.port} onChange={(event) => setSettingsDraft((prev) => ({ ...prev, port: Number(event.target.value || 25565) }))} className="g-input h-8 px-2 text-[11px]" placeholder="Port" />
                    <input type="number" value={settingsDraft.maxPlayers} onChange={(event) => setSettingsDraft((prev) => ({ ...prev, maxPlayers: Number(event.target.value || 20) }))} className="g-input h-8 px-2 text-[11px]" placeholder="Max Players" />
                  </div>
                  <input value={settingsDraft.motd} onChange={(event) => setSettingsDraft((prev) => ({ ...prev, motd: event.target.value }))} className="g-input h-8 w-full px-2 text-[11px]" placeholder="MOTD" />
                  <div className="flex items-center gap-2">
                    <button onClick={() => void onSaveSettings()} className="g-btn-accent h-8 px-3 text-[10px] font-extrabold uppercase tracking-[0.12em]">Save Settings</button>
                    <button onClick={() => void onDeleteServer()} className="g-btn h-8 px-3 text-[10px] font-extrabold uppercase tracking-[0.12em] inline-flex items-center gap-1 text-rose-200"><Trash2 size={11} /> Delete Server</button>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-black/20 p-2.5">
                    <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-white/55 mb-1.5">Tunnel & Address</p>
                    <div className="flex items-center gap-2">
                      <input value={tunnelSubdomain} onChange={(event) => setTunnelSubdomain(event.target.value)} className="g-input h-8 w-full px-2 text-[11px]" placeholder="my-server" />
                      <button onClick={() => void onConnectTunnel()} className="g-btn h-8 px-2 text-[10px] font-extrabold uppercase tracking-[0.12em]">Connect</button>
                      <button onClick={() => void onDisconnectTunnel()} className="g-btn h-8 px-2 text-[10px] font-extrabold uppercase tracking-[0.12em]">Disconnect</button>
                    </div>
                    <p className="mt-1 text-[11px] text-white/58">Shareable host: {status?.publicAddress || 'not connected'}</p>
                    {status?.lastError && <p className="mt-1 text-[11px] text-amber-200">Relay: {status.lastError}</p>}
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      </div>
      <UniversalLoadingOverlay
        open={actionLoading.open}
        fixed
        eyebrow={actionLoading.eyebrow}
        title={actionLoading.title}
        description={actionLoading.description}
      />
      {actionNotice && <p className="text-sm text-amber-200">{actionNotice}</p>}
      {error && <p className="text-sm text-rose-300">{error}</p>}
    </div>
  );
}
