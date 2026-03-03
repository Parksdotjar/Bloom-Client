import { useEffect, useMemo, useRef, useState, type ChangeEventHandler, type DragEventHandler } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, FolderOpen, RefreshCcw, Save, ShieldPlus, Trash2, UploadCloud } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { useInstances } from '../hooks/useInstances';
import { TauriApi, type InstanceModFile, type ModInstallResult } from '../services/tauri';

type EditorTab = 'content' | 'settings';

function humanSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type NativeFile = File & { path?: string };

export function InstanceEditor() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const instanceId = searchParams.get('id');
  const initialTab = searchParams.get('tab') === 'settings' ? 'settings' : 'content';

  const { instances, updateInstance, loading } = useInstances();

  const instance = useMemo(() => {
    if (!instanceId) return null;
    return instances.find((item) => item.id === instanceId) || null;
  }, [instances, instanceId]);

  const [activeTab, setActiveTab] = useState<EditorTab>(initialTab);
  const [name, setName] = useState('');
  const [memoryMb, setMemoryMb] = useState(4096);
  const [jvmArgs, setJvmArgs] = useState('');
  const [javaRuntime, setJavaRuntime] = useState<'system' | 'java17' | 'custom'>('system');
  const [javaPathOverride, setJavaPathOverride] = useState('');
  const [iconDataUrl, setIconDataUrl] = useState<string | undefined>(undefined);
  const [coverDataUrl, setCoverDataUrl] = useState<string | undefined>(undefined);
  const [colorTag, setColorTag] = useState('#9a65ff');
  const [iconFrame, setIconFrame] = useState<'square' | 'rounded' | 'diamond'>('rounded');
  const [saving, setSaving] = useState(false);

  const [mods, setMods] = useState<InstanceModFile[]>([]);
  const [modLoading, setModLoading] = useState(false);
  const [installingMods, setInstallingMods] = useState(false);
  const [installingFabricApi, setInstallingFabricApi] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [lastInstallResult, setLastInstallResult] = useState<ModInstallResult | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const iconInputRef = useRef<HTMLInputElement | null>(null);
  const coverInputRef = useRef<HTMLInputElement | null>(null);

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
      setIconDataUrl(instance.iconDataUrl);
      setCoverDataUrl(instance.coverDataUrl);
      setColorTag(instance.colorTag || '#9a65ff');
      setIconFrame(instance.iconFrame || 'rounded');
    }
  }, [instance]);

  const goBack = () => navigate('/instances');

  const reloadMods = async () => {
    if (!instance) return;
    setModLoading(true);
    try {
      const rows = await TauriApi.instanceListMods(instance.id);
      setMods(rows);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatusMessage(`Failed loading mods: ${message}`);
    } finally {
      setModLoading(false);
    }
  };

  useEffect(() => {
    void reloadMods();
  }, [instance?.id]);

  const saveSettings = async () => {
    if (!instance) return;
    setSaving(true);
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
    reader.onload = () => {
      const value = typeof reader.result === 'string' ? reader.result : undefined;
      setIconDataUrl(value);
    };
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
    reader.onload = () => {
      const value = typeof reader.result === 'string' ? reader.result : undefined;
      setCoverDataUrl(value);
    };
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
    setStatusMessage('Installing mods...');
    try {
      const pathBackedFiles = jars.filter((file) => Boolean((file as NativeFile).path));
      if (pathBackedFiles.length === jars.length && pathBackedFiles.length > 0) {
        const paths = pathBackedFiles
          .map((file) => (file as NativeFile).path as string)
          .filter((value) => value.length > 0);
        const result = await TauriApi.instanceInstallModPaths(instance.id, paths);
        setLastInstallResult(result);
        await reloadMods();
        if (result.skipped.length > 0) {
          setStatusMessage(`Installed ${result.installed.length} file(s), skipped ${result.skipped.length} invalid file(s).`);
        } else {
          setStatusMessage(`Installed ${result.installed.length} file(s).`);
        }
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
      if (result.skipped.length > 0) {
        setStatusMessage(`Installed ${result.installed.length} file(s), skipped ${result.skipped.length} invalid file(s).`);
      } else {
        setStatusMessage(`Installed ${result.installed.length} file(s).`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatusMessage(`Mod install failed: ${message}`);
    } finally {
      setInstallingMods(false);
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
      setStatusMessage('Installing mods...');
      const result = await TauriApi.instanceInstallModPaths(instance.id, paths);
      setLastInstallResult(result);
      await reloadMods();
      if (result.skipped.length > 0) {
        setStatusMessage(`Installed ${result.installed.length} file(s), skipped ${result.skipped.length} invalid file(s).`);
      } else {
        setStatusMessage(`Installed ${result.installed.length} file(s).`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatusMessage(`Mod install failed: ${message}`);
    } finally {
      setInstallingMods(false);
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

  const autoInstallFabricApi = async () => {
    if (!instance || instance.loader !== 'fabric') return;
    setInstallingFabricApi(true);
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
    }
  };

  if (loading) {
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
    <div className="min-h-full w-full max-w-6xl mx-auto p-4 md:p-6 space-y-4">
      <section className="g-panel-strong p-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-xl border border-slate-300 dark:border-white/15 bg-slate-200 dark:bg-white/10 overflow-hidden flex items-center justify-center">
              {iconDataUrl ? <img src={iconDataUrl} alt={`${instance.name} icon`} className="w-full h-full object-cover" /> : <span className="font-black text-slate-700 dark:text-white/80">{instance.name.slice(0, 1).toUpperCase()}</span>}
            </div>
            <div>
              <p className="text-[10px] font-black tracking-[0.22em] uppercase text-slate-500 dark:text-white/45">Instance Editor</p>
              <h1 className="text-4xl font-black mt-1 text-slate-900 dark:text-white">{instance.name}</h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={goBack} className="rounded-xl border border-slate-300 dark:border-white/15 bg-white dark:bg-white/5 px-4 py-2.5 text-xs font-black tracking-[0.14em] uppercase inline-flex items-center gap-2">
              <ArrowLeft size={14} /> Back
            </button>
            <button onClick={saveSettings} disabled={saving} className="rounded-xl border border-pink-500/55 bg-pink-500/15 px-5 py-3 text-xs font-black tracking-[0.14em] uppercase text-pink-700 dark:text-pink-200 hover:bg-pink-500/25 disabled:opacity-45 inline-flex items-center gap-2">
              <Save size={14} /> {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>

        <div className="mt-4 inline-flex rounded-xl border border-slate-300 dark:border-white/15 bg-white dark:bg-white/5 p-1">
          <button onClick={() => setActiveTab('content')} className={["px-3 py-1.5 rounded-lg text-xs font-black tracking-[0.14em] uppercase", activeTab === 'content' ? 'bg-emerald-500/20 border border-emerald-500/45 text-emerald-700 dark:text-emerald-300' : 'text-slate-600 dark:text-white/60'].join(' ')}>Content</button>
          <button onClick={() => setActiveTab('settings')} className={["px-3 py-1.5 rounded-lg text-xs font-black tracking-[0.14em] uppercase", activeTab === 'settings' ? 'bg-pink-500/20 border border-pink-500/45 text-pink-700 dark:text-pink-300' : 'text-slate-600 dark:text-white/60'].join(' ')}>Settings</button>
        </div>
      </section>

      {activeTab === 'settings' ? (
        <section className="g-panel p-6 space-y-4">
          <h2 className="text-lg font-black text-slate-900 dark:text-white">Instance Settings</h2>

          <div>
            <label className="block text-[10px] font-black tracking-[0.2em] uppercase text-slate-500 dark:text-white/45 mb-2">Profile Picture</label>
            <div className="flex items-center gap-3">
              <div className="w-16 h-16 rounded-xl border border-slate-300 dark:border-white/15 bg-slate-200 dark:bg-white/10 overflow-hidden flex items-center justify-center">
                {iconDataUrl ? <img src={iconDataUrl} alt="Instance icon" className="w-full h-full object-cover" /> : <span className="font-black text-slate-700 dark:text-white/80">{name.slice(0, 1).toUpperCase() || 'I'}</span>}
              </div>
              <div className="flex gap-2">
                <input ref={iconInputRef} type="file" accept="image/*" className="hidden" onChange={handleIconFile} />
                <button onClick={() => iconInputRef.current?.click()} className="rounded-xl border border-slate-300 dark:border-white/15 bg-white dark:bg-white/5 px-3 py-2 text-xs font-black tracking-[0.14em] uppercase">Upload</button>
                <button onClick={() => setIconDataUrl(undefined)} className="rounded-xl border border-slate-300 dark:border-white/15 bg-white dark:bg-white/5 px-3 py-2 text-xs font-black tracking-[0.14em] uppercase">Remove</button>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-black tracking-[0.2em] uppercase text-slate-500 dark:text-white/45 mb-2">Cover Image</label>
            <div className="rounded-xl border border-slate-300 dark:border-white/15 bg-slate-200 dark:bg-white/10 overflow-hidden h-32">
              {coverDataUrl ? <img src={coverDataUrl} alt="Instance cover" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-xs font-black text-slate-500 dark:text-white/50">No cover selected</div>}
            </div>
            <div className="flex gap-2 mt-2">
              <input ref={coverInputRef} type="file" accept="image/*" className="hidden" onChange={handleCoverFile} />
              <button onClick={() => coverInputRef.current?.click()} className="rounded-xl border border-slate-300 dark:border-white/15 bg-white dark:bg-white/5 px-3 py-2 text-xs font-black tracking-[0.14em] uppercase">Upload Cover</button>
              <button onClick={() => setCoverDataUrl(undefined)} className="rounded-xl border border-slate-300 dark:border-white/15 bg-white dark:bg-white/5 px-3 py-2 text-xs font-black tracking-[0.14em] uppercase">Remove</button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-black tracking-[0.2em] uppercase text-slate-500 dark:text-white/45 mb-2">Accent Tag</label>
              <div className="flex items-center gap-2">
                <input type="color" value={colorTag} onChange={(event) => setColorTag(event.target.value)} className="h-10 w-12 rounded-lg border border-slate-300 dark:border-white/15 bg-white dark:bg-black/20 p-1" />
                <input value={colorTag} onChange={(event) => setColorTag(event.target.value)} className="flex-1 rounded-xl border border-slate-300 dark:border-white/15 bg-white dark:bg-black/25 px-3 py-2 text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-pink-400/60" />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-black tracking-[0.2em] uppercase text-slate-500 dark:text-white/45 mb-2">Icon Frame</label>
              <div className="grid grid-cols-3 gap-2">
                {(['square', 'rounded', 'diamond'] as const).map((frame) => (
                  <button
                    key={frame}
                    onClick={() => setIconFrame(frame)}
                    className={[
                      'rounded-xl border px-3 py-2 text-xs font-black tracking-[0.14em] uppercase',
                      iconFrame === frame ? 'border-pink-500/55 bg-pink-500/15 text-pink-700 dark:text-pink-200' : 'border-slate-300 dark:border-white/15 bg-white dark:bg-white/5'
                    ].join(' ')}
                  >
                    {frame}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-black tracking-[0.2em] uppercase text-slate-500 dark:text-white/45 mb-2">Name</label>
            <input value={name} onChange={(event) => setName(event.target.value)} className="w-full rounded-xl border border-slate-300 dark:border-white/15 bg-white dark:bg-black/25 px-4 py-3 text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-pink-400/60" />
          </div>

          <div>
            <label className="block text-[10px] font-black tracking-[0.2em] uppercase text-slate-500 dark:text-white/45 mb-2">Memory (MB)</label>
            <input type="range" min={1024} max={16384} step={1024} value={memoryMb} onChange={(event) => setMemoryMb(Number(event.target.value))} className="w-full accent-pink-500" />
            <p className="text-xs font-semibold text-slate-600 dark:text-white/60 mt-1">{memoryMb} MB</p>
          </div>

          <div>
            <label className="block text-[10px] font-black tracking-[0.2em] uppercase text-slate-500 dark:text-white/45 mb-2">JVM Args</label>
            <input value={jvmArgs} onChange={(event) => setJvmArgs(event.target.value)} placeholder="-XX:+UseG1GC" className="w-full rounded-xl border border-slate-300 dark:border-white/15 bg-white dark:bg-black/25 px-4 py-3 text-sm font-semibold text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-white/35 focus:outline-none focus:border-pink-400/60" />
          </div>

          <div className="rounded-xl border border-slate-300/80 dark:border-white/12 p-3 bg-white/70 dark:bg-white/[0.02] space-y-3">
            <p className="text-[10px] font-black tracking-[0.2em] uppercase text-slate-500 dark:text-white/45">Java Runtime</p>
            {instance.mcVersion.startsWith('1.19') && (
              <div className="rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-xs font-semibold text-amber-800 dark:text-amber-200">
                Recommended: Java 17 for 1.19 packs.
                <button
                  onClick={() => {
                    setJavaRuntime('java17');
                    setJavaPathOverride('java17');
                  }}
                  className="ml-2 rounded-md border border-amber-500/50 px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em]"
                >
                  Use Java 17
                </button>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <button
                onClick={() => setJavaRuntime('system')}
                className={[
                  'rounded-xl border px-3 py-2 text-xs font-black tracking-[0.14em] uppercase',
                  javaRuntime === 'system' ? 'border-pink-500/55 bg-pink-500/15 text-pink-700 dark:text-pink-200' : 'border-slate-300 dark:border-white/15 bg-white dark:bg-white/5'
                ].join(' ')}
              >
                System Java
              </button>
              <button
                onClick={() => {
                  setJavaRuntime('java17');
                  setJavaPathOverride('java17');
                }}
                className={[
                  'rounded-xl border px-3 py-2 text-xs font-black tracking-[0.14em] uppercase',
                  javaRuntime === 'java17' ? 'border-pink-500/55 bg-pink-500/15 text-pink-700 dark:text-pink-200' : 'border-slate-300 dark:border-white/15 bg-white dark:bg-white/5'
                ].join(' ')}
              >
                Java 17 Preset
              </button>
              <button
                onClick={() => setJavaRuntime('custom')}
                className={[
                  'rounded-xl border px-3 py-2 text-xs font-black tracking-[0.14em] uppercase',
                  javaRuntime === 'custom' ? 'border-pink-500/55 bg-pink-500/15 text-pink-700 dark:text-pink-200' : 'border-slate-300 dark:border-white/15 bg-white dark:bg-white/5'
                ].join(' ')}
              >
                Custom Path
              </button>
            </div>
            <input
              value={javaPathOverride}
              onChange={(event) => setJavaPathOverride(event.target.value)}
              disabled={javaRuntime === 'system'}
              placeholder={javaRuntime === 'custom' ? 'C:\\Program Files\\Java\\jdk-17\\bin\\javaw.exe' : 'java'}
              className="w-full rounded-xl border border-slate-300 dark:border-white/15 bg-white dark:bg-black/25 px-4 py-3 text-sm font-semibold text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-white/35 focus:outline-none focus:border-pink-400/60 disabled:opacity-50"
            />
            <p className="text-xs font-semibold text-slate-500 dark:text-white/55">This is saved per instance and used by Launch.</p>
          </div>
        </section>
      ) : (
        <section className="g-panel p-6 space-y-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h2 className="text-lg font-black text-slate-900 dark:text-white">Mods</h2>
            <div className="flex items-center gap-2">
              <button onClick={() => void reloadMods()} className="rounded-xl border border-slate-300 dark:border-white/15 bg-white dark:bg-white/5 px-3 py-2 text-xs font-black tracking-[0.14em] uppercase inline-flex items-center gap-1.5"><RefreshCcw size={13} /> Refresh</button>
              <button onClick={autoInstallFabricApi} disabled={instance.loader !== 'fabric' || installingFabricApi} className="rounded-xl border border-emerald-500/50 bg-emerald-500/15 px-3 py-2 text-xs font-black tracking-[0.14em] uppercase text-emerald-700 dark:text-emerald-300 inline-flex items-center gap-1.5 disabled:opacity-45"><ShieldPlus size={13} /> {installingFabricApi ? 'Installing...' : 'Auto Fabric API'}</button>
            </div>
          </div>

          <div onDrop={handleDrop} onDragOver={handleDragOver} onDragLeave={handleDragLeave} className={['rounded-2xl border-2 border-dashed p-4 text-center transition-colors', isDragging ? 'border-pink-500/60 bg-pink-500/10' : 'border-slate-300/80 dark:border-white/20 bg-slate-100/40 dark:bg-white/[0.03]'].join(' ')}>
            <p className="text-sm font-black text-slate-700 dark:text-white/75 inline-flex items-center gap-2"><UploadCloud size={15} /> Drop .jar files here</p>
            <input ref={fileInputRef} type="file" multiple accept=".jar" className="hidden" onChange={handleFileInput} />
            <div className="mt-3 flex justify-center gap-2">
              <button onClick={() => { void pickAndInstallMods(); }} disabled={installingMods} className="rounded-xl border border-pink-500/50 bg-pink-500/15 px-3 py-2 text-xs font-black tracking-[0.14em] uppercase text-pink-700 dark:text-pink-200">{installingMods ? 'Installing...' : 'Choose Files'}</button>
              <button onClick={() => fileInputRef.current?.click()} disabled={installingMods} className="rounded-xl border border-slate-300 dark:border-white/15 bg-white dark:bg-white/5 px-3 py-2 text-xs font-black tracking-[0.14em] uppercase">{installingMods ? 'Installing...' : 'Browser Fallback'}</button>
              <button onClick={() => { void TauriApi.openModsFolder(instance.id); }} className="rounded-xl border border-slate-300 dark:border-white/15 bg-white dark:bg-white/5 px-3 py-2 text-xs font-black tracking-[0.14em] uppercase inline-flex items-center gap-1.5"><FolderOpen size={13} /> Folder</button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-300/80 dark:border-white/12 overflow-hidden">
            {modLoading ? (
              <div className="p-6 text-center text-xs font-black tracking-[0.16em] uppercase text-slate-500 dark:text-white/55">Loading mods...</div>
            ) : mods.length === 0 ? (
              <div className="p-6 text-center text-sm font-semibold text-slate-500 dark:text-white/55">No mods installed.</div>
            ) : (
              mods.map((mod) => (
                <div key={mod.fileName} className="px-3 py-2.5 border-b border-slate-200 dark:border-white/10 last:border-b-0 bg-white/80 dark:bg-white/[0.02] flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-black text-slate-900 dark:text-white truncate">{mod.displayName}</p>
                    <p className="text-xs font-semibold text-slate-500 dark:text-white/55">{humanSize(mod.sizeBytes)}</p>
                  </div>
                  <button onClick={() => void toggleMod(mod)} className={['h-7 w-12 rounded-full border relative', mod.enabled ? 'border-emerald-500/50 bg-emerald-500/25' : 'border-slate-300 dark:border-white/20 bg-slate-200 dark:bg-white/10'].join(' ')}>
                    <span className={['absolute top-0.5 h-5.5 w-5.5 rounded-full transition-all', mod.enabled ? 'left-6 bg-emerald-500' : 'left-0.5 bg-slate-400'].join(' ')} />
                  </button>
                  <button onClick={() => void removeMod(mod)} className="h-8 w-8 rounded-lg border border-red-300/70 dark:border-red-500/35 text-red-600 dark:text-red-300 inline-flex items-center justify-center"><Trash2 size={13} /></button>
                </div>
              ))
            )}
          </div>
        </section>
      )}

      {(statusMessage || lastInstallResult) && (
        <section className="g-panel p-3 text-sm font-semibold text-slate-700 dark:text-white/75">
          {statusMessage || 'Done'}
        </section>
      )}
    </div>
  );
}
