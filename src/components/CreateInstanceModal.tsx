import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { animate, remove, set } from 'animejs';
import { Instance } from '../services/tauri';
import { useMojang } from '../hooks/useMojang';
import { useFabric } from '../hooks/useFabric';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (data: Instance) => Promise<void>;
}

export function CreateInstanceModal({ isOpen, onClose, onSubmit }: Props) {
    const [name, setName] = useState('');
    const [mcVersion, setMcVersion] = useState('1.21.1');
    const [loader, setLoader] = useState<'vanilla' | 'fabric'>('vanilla');
    const [loading, setLoading] = useState(false);
    const [showSnapshots, setShowSnapshots] = useState(false);
    const [fabricVersion, setFabricVersion] = useState<string>('');

    const shellRef = useRef<HTMLDivElement | null>(null);

    const { releases, snapshots, loading: versionsLoading } = useMojang();
    const { versions: fabricVersions, loading: fabricLoading, latestStable } = useFabric(mcVersion, loader === 'fabric');

    useEffect(() => {
        if (latestStable && !fabricVersion) {
            setFabricVersion(latestStable);
        }
    }, [latestStable, fabricVersion]);

    useEffect(() => {
        if (!isOpen || !shellRef.current) return;

        const node = shellRef.current;
        remove(node);
        set(node, { opacity: 0, scale: 0.96, translateY: 14 });

        const animation = animate(node, {
            opacity: [0, 1],
            scale: [0.96, 1],
            translateY: [14, 0],
            duration: 280,
            ease: 'outQuad',
            frameRate: 14
        });

        return () => {
            animation.pause();
        };
    }, [isOpen]);

    if (!isOpen) return null;

    const closeModal = () => {
        onClose();
    };

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!name.trim()) return;

        setLoading(true);
        try {
            const newInstance: Instance = {
                id: crypto.randomUUID(),
                name,
                mcVersion,
                loader,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                coverDataUrl: undefined,
                colorTag: '#9a65ff',
                iconFrame: 'rounded',
                java: {},
                memoryMb: 4096,
                jvmArgs: [],
                fabricLoaderVersion: loader === 'fabric' ? fabricVersion : undefined,
                resolution: { width: 854, height: 480, fullscreen: false }
            };

            await onSubmit(newInstance);
            setName('');
            setMcVersion('1.21.1');
            setLoader('vanilla');
            setFabricVersion('');
            closeModal();
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[120] app-region-no-drag bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div
                ref={shellRef}
                className="w-full max-w-xl rounded-3xl border border-slate-300 dark:border-white/12 bg-white/95 dark:bg-[#111923]/95 p-6 md:p-7 shadow-2xl"
            >
                <div className="flex items-center justify-between mb-5">
                    <div>
                        <p className="text-[10px] font-black tracking-[0.2em] uppercase text-slate-500 dark:text-white/45">Create</p>
                        <h2 className="text-2xl font-black text-slate-900 dark:text-white">New Instance</h2>
                    </div>
                    <button
                        onClick={closeModal}
                        className="h-9 w-9 rounded-lg border border-slate-300 dark:border-white/12 inline-flex items-center justify-center text-slate-600 dark:text-white/70 hover:bg-slate-100 dark:hover:bg-white/10"
                        title="Close"
                    >
                        <X size={15} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-[10px] font-black tracking-[0.18em] uppercase text-slate-500 dark:text-white/45 mb-2">Instance Name</label>
                        <input
                            type="text"
                            required
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            placeholder="My Survival World"
                            className="w-full rounded-xl border border-slate-300 dark:border-white/12 bg-white dark:bg-black/30 px-4 py-3 text-sm font-semibold text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-white/35 focus:outline-none focus:border-pink-400/60"
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <label className="text-[10px] font-black tracking-[0.18em] uppercase text-slate-500 dark:text-white/45">Minecraft Version</label>
                                <label className="inline-flex items-center gap-1.5 text-[10px] font-black tracking-widest uppercase text-slate-500 dark:text-white/45">
                                    <input
                                        type="checkbox"
                                        checked={showSnapshots}
                                        onChange={(event) => setShowSnapshots(event.target.checked)}
                                        className="accent-pink-500"
                                    />
                                    Snapshots
                                </label>
                            </div>
                            <select
                                value={mcVersion}
                                onChange={(event) => setMcVersion(event.target.value)}
                                disabled={versionsLoading}
                                className="w-full rounded-xl border border-slate-300 dark:border-white/12 bg-white dark:bg-black/30 px-4 py-3 text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-pink-400/60"
                            >
                                {versionsLoading && <option>Loading versions...</option>}

                                {!versionsLoading && releases.length > 0 && (
                                    <optgroup label="Releases">
                                        {releases.slice(0, 50).map((version) => (
                                            <option key={version.id} value={version.id}>{version.id}</option>
                                        ))}
                                    </optgroup>
                                )}

                                {!versionsLoading && showSnapshots && snapshots.length > 0 && (
                                    <optgroup label="Snapshots">
                                        {snapshots.slice(0, 30).map((version) => (
                                            <option key={version.id} value={version.id}>{version.id}</option>
                                        ))}
                                    </optgroup>
                                )}

                                {!versionsLoading && releases.length === 0 && (
                                    <>
                                        <option value="1.21.1">1.21.1</option>
                                        <option value="1.20.4">1.20.4</option>
                                        <option value="1.19.4">1.19.4</option>
                                    </>
                                )}
                            </select>
                        </div>

                        <div>
                            <label className="block text-[10px] font-black tracking-[0.18em] uppercase text-slate-500 dark:text-white/45 mb-2">Loader</label>
                            <select
                                value={loader}
                                onChange={(event) => setLoader(event.target.value as 'vanilla' | 'fabric')}
                                className="w-full rounded-xl border border-slate-300 dark:border-white/12 bg-white dark:bg-black/30 px-4 py-3 text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-pink-400/60"
                            >
                                <option value="vanilla">Vanilla</option>
                                <option value="fabric">Fabric</option>
                            </select>
                        </div>
                    </div>

                    {loader === 'fabric' && (
                        <div>
                            <label className="block text-[10px] font-black tracking-[0.18em] uppercase text-slate-500 dark:text-white/45 mb-2">Fabric Loader Version</label>
                            <select
                                value={fabricVersion}
                                onChange={(event) => setFabricVersion(event.target.value)}
                                disabled={fabricLoading}
                                className="w-full rounded-xl border border-slate-300 dark:border-white/12 bg-white dark:bg-black/30 px-4 py-3 text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-pink-400/60"
                            >
                                {fabricLoading && <option>Loading loaders...</option>}

                                {!fabricLoading && fabricVersions.map((version) => (
                                    <option key={version.loader.version} value={version.loader.version}>
                                        {version.loader.version} {version.loader.stable ? '(Stable)' : ''}
                                    </option>
                                ))}

                                {!fabricLoading && fabricVersions.length === 0 && (
                                    <option value="0.16.5">0.16.5</option>
                                )}
                            </select>
                        </div>
                    )}

                    <div className="pt-2 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <button
                            type="button"
                            onClick={closeModal}
                            className="rounded-xl border border-slate-300 dark:border-white/12 bg-white dark:bg-white/5 px-4 py-3 text-xs font-black tracking-[0.14em] uppercase text-slate-700 dark:text-white/80 hover:bg-slate-100 dark:hover:bg-white/10"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="rounded-xl border border-pink-500/55 bg-pink-500/15 px-4 py-3 text-xs font-black tracking-[0.14em] uppercase text-pink-700 dark:text-pink-200 hover:bg-pink-500/25 disabled:opacity-50"
                        >
                            {loading ? 'Creating...' : 'Create Instance'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
