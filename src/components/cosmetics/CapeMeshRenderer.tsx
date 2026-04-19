import { useEffect, useRef, useState } from 'react';
import { SkinViewer } from 'skinview3d';
import { BufferAttribute, Mesh } from 'three';
import { capeTextureLoader, type CapeTextureAsset } from '../../services/capeTextures';
import { buildMinecraftCapeUvData } from '../../services/minecraftCapeLayout';

type CapeMeshRendererProps = {
  slug: string;
  textureUrl: string;
  name: string;
  className?: string;
  glowColor?: string | null;
  sway?: boolean;
  pose?: {
    x?: number;
    y?: number;
    z?: number;
    rotX?: number;
    rotY?: number;
    rotZ?: number;
    depth?: number;
    brightness?: number;
  };
};

const snapshotCache = new Map<string, string>();
const SNAPSHOT_MAX_CONCURRENT = 2;
let snapshotActiveCount = 0;
const snapshotWaiters: Array<() => void> = [];

async function acquireSnapshotSlot() {
  if (snapshotActiveCount < SNAPSHOT_MAX_CONCURRENT) {
    snapshotActiveCount += 1;
    return;
  }
  await new Promise<void>((resolve) => {
    snapshotWaiters.push(resolve);
  });
  snapshotActiveCount += 1;
}

function releaseSnapshotSlot() {
  snapshotActiveCount = Math.max(0, snapshotActiveCount - 1);
  const next = snapshotWaiters.shift();
  if (next) next();
}

function finiteOr(value: number | undefined, fallback: number) {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function applyPose(viewer: SkinViewer, pose?: CapeMeshRendererProps['pose']) {
  const x = finiteOr(pose?.x, 0);
  const y = finiteOr(pose?.y, 0);
  const z = finiteOr(pose?.z, 0);
  const depth = finiteOr(pose?.depth, 0);
  const rotX = finiteOr(pose?.rotX, 0) * (Math.PI / 180);
  const rotY = finiteOr(pose?.rotY, -38) * (Math.PI / 180);
  const rotZ = finiteOr(pose?.rotZ, 0) * (Math.PI / 180);
  const brightness = clamp(finiteOr(pose?.brightness, 1), 0.1, 2.5);
  const baseY = -8.2;

  viewer.playerObject.rotation.set(0, 0, 0);
  viewer.playerObject.position.set(0, 0, 0);
  viewer.playerWrapper.rotation.set(rotX, rotY, rotZ);
  viewer.playerWrapper.position.set(x, baseY + y, z + depth);
  viewer.controls.target.set(0, 8, 0);
  viewer.camera.position.set(18, 10.5, 30);
  viewer.cameraLight.intensity = 1.6 * brightness;
  viewer.globalLight.intensity = 1.05 * brightness;
  viewer.renderer.toneMappingExposure = 1.55 * brightness;
  viewer.controls.update();
}

function applyMinecraftCapeUvs(viewer: SkinViewer, textureWidth = 64, textureHeight = 64) {
  const capeMesh = (viewer.playerObject as { cape?: { cape?: { geometry?: { attributes?: { uv?: BufferAttribute } } } } }).cape?.cape;
  const uv = capeMesh?.geometry?.attributes?.uv;
  if (uv) {
    uv.set(buildMinecraftCapeUvData(textureWidth, textureHeight));
    uv.needsUpdate = true;
  }
}

function poseCacheKey(pose?: CapeMeshRendererProps['pose']) {
  const x = finiteOr(pose?.x, 0).toFixed(2);
  const y = finiteOr(pose?.y, 0).toFixed(2);
  const z = finiteOr(pose?.z, 0).toFixed(2);
  const rotX = finiteOr(pose?.rotX, 0).toFixed(2);
  const rotY = finiteOr(pose?.rotY, -38).toFixed(2);
  const rotZ = finiteOr(pose?.rotZ, 0).toFixed(2);
  const depth = finiteOr(pose?.depth, 0).toFixed(2);
  const brightness = clamp(finiteOr(pose?.brightness, 1), 0.1, 2.5).toFixed(2);
  return `${x}|${y}|${z}|${rotX}|${rotY}|${rotZ}|${depth}|${brightness}`;
}

export function CapeMeshRenderer({ slug, textureUrl, name, className, glowColor, pose }: CapeMeshRendererProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [asset, setAsset] = useState<CapeTextureAsset | null>(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [activated, setActivated] = useState(false);
  const [snapshotSrc, setSnapshotSrc] = useState<string | null>(null);

  useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    if (activated) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        if (entry.isIntersecting || entry.intersectionRatio > 0) {
          setActivated(true);
          observer.disconnect();
        }
      },
      { root: null, rootMargin: '260px 0px 260px 0px', threshold: 0.01 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [activated]);

  useEffect(() => {
    if (!activated) return;
    let cancelled = false;
    setAsset(null);
    setFailed(false);
    setReady(false);
    setSnapshotSrc(null);
    void capeTextureLoader
      .loadFull(slug, textureUrl)
      .then((next) => {
        if (cancelled) return;
        setAsset(next);
      })
      .catch(() => {
        if (cancelled) return;
        setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [slug, textureUrl, activated]);

  useEffect(() => {
    if (!activated) return;
    if (!asset) return;
    const root = rootRef.current;
    if (!root) return;

    const width = Math.max(1, Math.floor(root.clientWidth || 180));
    const height = Math.max(1, Math.floor(root.clientHeight || 220));
    const cacheKey = `${slug}|${textureUrl}|${poseCacheKey(pose)}|${width}x${height}`;
    const cached = snapshotCache.get(cacheKey);
    if (cached) {
      setSnapshotSrc(cached);
      setReady(true);
      setFailed(false);
      return;
    }

    let cancelled = false;
    let viewer: SkinViewer | null = null;
    setRendering(true);
    setReady(false);
    setFailed(false);

    void (async () => {
      await acquireSnapshotSlot();
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      viewer = new SkinViewer({
        canvas,
        width,
        height,
        enableControls: false,
        renderPaused: true,
        pixelRatio: 1,
        preserveDrawingBuffer: true
      });

      viewer.background = null;
      viewer.fov = 34;
      viewer.zoom = 0.72;
      viewer.autoRotate = false;
      viewer.playerObject.backEquipment = 'cape';
      viewer.playerObject.skin.visible = false;
      viewer.playerObject.cape.visible = true;
      viewer.controls.enableZoom = false;
      viewer.controls.enablePan = false;
      viewer.controls.enableRotate = false;
      viewer.cameraLight.position.set(14, 22, 24);
      viewer.cameraLight.intensity = 1.6;
      viewer.globalLight.intensity = 1.05;
      viewer.renderer.shadowMap.enabled = false;

      viewer.playerObject.traverse((node) => {
        const mesh = node as Mesh;
        if (!mesh.isMesh) return;
        mesh.castShadow = false;
        mesh.receiveShadow = false;
      });

      applyMinecraftCapeUvs(viewer, asset.width, asset.height);
      await viewer.loadCape(asset.objectUrl, { backEquipment: 'cape' });
      viewer.playerObject.skin.visible = false;
      viewer.playerObject.cape.visible = true;
      applyPose(viewer, pose);
      viewer.render();

      const url = canvas.toDataURL('image/png');
      if (cancelled) return;
      snapshotCache.set(cacheKey, url);
      setSnapshotSrc(url);
      setReady(true);
      setFailed(false);
    })().catch(() => {
      if (cancelled) return;
      setFailed(true);
      setReady(false);
    }).finally(() => {
      releaseSnapshotSlot();
      if (viewer) viewer.dispose();
      if (!cancelled) setRendering(false);
    });

    return () => {
      cancelled = true;
      if (viewer) viewer.dispose();
    };
  }, [activated, asset, pose, slug, textureUrl, glowColor]);

  return (
    <div ref={rootRef} className={(className ?? 'h-full w-full') + ' relative'}>
      {snapshotSrc ? (
        <img
          src={snapshotSrc}
          className="h-full w-full object-cover [image-rendering:pixelated]"
          alt={`${name} cape mesh preview`}
          draggable={false}
        />
      ) : (
        <div className="h-full w-full bg-black/25" />
      )}
      {(rendering || (!ready && !failed)) && (
        <div className="absolute inset-0 bg-black/35 animate-pulse" />
      )}
      {failed && (
        <div className="absolute inset-0 bg-black/45 text-white/80 text-[10px] font-extrabold uppercase tracking-[0.12em] flex items-center justify-center">
          Cape unavailable
        </div>
      )}
    </div>
  );
}
