import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type PointerEvent } from 'react';
import { clsx } from 'clsx';
import { Coins, Loader2, Pause, Play, RefreshCw, Trash2, UploadCloud } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { useAuth } from '../hooks/useAuth';
import {
  buildAnimatedCapeIdempotencyKey,
  cancelAnimatedCapeOrder,
  createAnimatedCapeOrder,
  createAnimatedCapeUploadTicket,
  getAllowedDurationsForFps,
  listAnimatedCapeOrders,
  registerAnimatedCapeUpload,
  resolveAnimatedCapePrice,
  subscribeAnimatedOrders,
  uploadAnimatedCapeSourceFile,
  type AnimatedCapeDuration,
  type AnimatedCapeFps,
  type AnimatedCapeOrderRow
} from '../services/animatedCapeStudio';
import { renderAnimatedCapeFrameToObjectUrl, AnimatedCapeRuntime } from '../services/animatedCapeRuntime';
import { loadWallet, ensureCommerceIdentity, setCapeLoadout, subscribeOwnWallet } from '../services/cosmetics';
import { AnimatedCapeCanvasPreview } from '../components/cosmetics/AnimatedCapeCanvasPreview';
import { MinecraftPlayerPreview } from '../components/cosmetics/MinecraftPlayerPreview';

const ALLOWED_MIME_TYPES = ['image/gif', 'video/mp4'];
const MAX_FILE_SIZE_BYTES = 120 * 1024 * 1024;
const FRAME_HEIGHT_TO_WIDTH = 2;

type Vec2 = { x: number; y: number };
type CropBox = { x: number; y: number; width: number; height: number };

type SourceMeta = {
  width: number;
  height: number;
  durationMs: number | null;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function formatBytes(bytes: number | null) {
  if (!bytes || bytes <= 0) return 'Unknown size';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let idx = 0;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx += 1;
  }
  return `${value.toFixed(value >= 10 || idx === 0 ? 0 : 1)} ${units[idx]}`;
}

function formatOrderStatus(status: AnimatedCapeOrderRow['status']) {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (token) => token.toUpperCase());
}

function formatElapsedSeconds(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  const remainder = safe % 60;
  if (minutes <= 0) return `${remainder}s`;
  return `${minutes}m ${String(remainder).padStart(2, '0')}s`;
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const maybe = error as { message?: unknown; error?: unknown };
    if (typeof maybe.message === 'string' && maybe.message.trim()) return maybe.message;
    if (typeof maybe.error === 'string' && maybe.error.trim()) return maybe.error;
  }
  return 'unexpected_error';
}

function isAuthMissingMessage(message: string | null) {
  if (!message) return false;
  return message.toLowerCase().includes('auth session missing');
}

async function extractPreviewFromFile(file: File): Promise<{ previewUrl: string; image: HTMLImageElement; meta: SourceMeta }> {
  if (file.type === 'video/mp4' || file.name.toLowerCase().endsWith('.mp4')) {
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.src = objectUrl;

    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('video_metadata_load_failed'));
    });

    await new Promise<void>((resolve) => {
      const seekTime = Math.min(0.1, Number.isFinite(video.duration) ? video.duration / 4 : 0.1);
      video.currentTime = seekTime;
      video.onseeked = () => resolve();
    });

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(video.videoWidth));
    canvas.height = Math.max(1, Math.floor(video.videoHeight));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('video_canvas_context_unavailable');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png', 1));
    if (!blob) throw new Error('video_preview_encode_failed');

    URL.revokeObjectURL(objectUrl);

    const previewUrl = URL.createObjectURL(blob);
    const image = new Image();
    image.decoding = 'async';
    image.src = previewUrl;
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('preview_image_load_failed'));
    });

    return {
      previewUrl,
      image,
      meta: {
        width: video.videoWidth,
        height: video.videoHeight,
        durationMs: Number.isFinite(video.duration) ? Math.round(video.duration * 1000) : null
      }
    };
  }

  const previewUrl = URL.createObjectURL(file);
  const image = new Image();
  image.decoding = 'async';
  image.src = previewUrl;
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('image_preview_load_failed'));
  });

  return {
    previewUrl,
    image,
    meta: {
      width: image.naturalWidth,
      height: image.naturalHeight,
      durationMs: null
    }
  };
}

function getOrderManifestPath(order: AnimatedCapeOrderRow | null): string | null {
  if (!order) return null;
  return order.asset_manifest_storage_path || order.manifest_storage_path || null;
}

export function AnimatedCapeStudio() {
  const navigate = useNavigate();
  const { authState, startLogin } = useAuth();

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ pointerId: number; start: Vec2; originPan: Vec2 } | null>(null);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [walletBalance, setWalletBalance] = useState(0);
  const [supabaseUserId, setSupabaseUserId] = useState<string | null>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedFilePreviewUrl, setSelectedFilePreviewUrl] = useState<string | null>(null);
  const [sourceImage, setSourceImage] = useState<HTMLImageElement | null>(null);
  const [sourceMeta, setSourceMeta] = useState<SourceMeta | null>(null);

  const [workspaceSize, setWorkspaceSize] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Vec2>({ x: 0, y: 0 });

  const [selectedFps, setSelectedFps] = useState<AnimatedCapeFps>(12);
  const [selectedDuration, setSelectedDuration] = useState<AnimatedCapeDuration>(3);
  const [orderIdempotencyKey, setOrderIdempotencyKey] = useState<string>(() => buildAnimatedCapeIdempotencyKey());

  const [orders, setOrders] = useState<AnimatedCapeOrderRow[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  const [runtime, setRuntime] = useState<AnimatedCapeRuntime | null>(null);
  const [runtimeLoading, setRuntimeLoading] = useState(false);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [previewPaused, setPreviewPaused] = useState(false);
  const [previewFrameObjectUrl, setPreviewFrameObjectUrl] = useState<string | null>(null);
  const [deletingOrderId, setDeletingOrderId] = useState<string | null>(null);

  const priceBb = useMemo(() => resolveAnimatedCapePrice(selectedFps, selectedDuration), [selectedDuration, selectedFps]);
  const allowedDurations = useMemo(() => getAllowedDurationsForFps(selectedFps), [selectedFps]);

  const selectedOrder = useMemo(
    () => orders.find((order) => order.id === selectedOrderId) ?? orders[0] ?? null,
    [orders, selectedOrderId]
  );
  const [timelineNowMs, setTimelineNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!selectedOrder) return;
    if (selectedOrder.status !== 'queued' && selectedOrder.status !== 'processing') return;
    const timer = window.setInterval(() => setTimelineNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [selectedOrder]);

  const processTiming = useMemo(() => {
    if (!selectedOrder) return null;
    const createdMs = Date.parse(selectedOrder.created_at);
    if (!Number.isFinite(createdMs)) return null;
    const completedMs = selectedOrder.completed_at ? Date.parse(selectedOrder.completed_at) : NaN;
    const refundedMs = selectedOrder.refunded_at ? Date.parse(selectedOrder.refunded_at) : NaN;
    const updatedMs = selectedOrder.updated_at ? Date.parse(selectedOrder.updated_at) : NaN;
    let endMs: number | null = null;

    if (Number.isFinite(completedMs)) {
      endMs = completedMs;
    } else if (Number.isFinite(refundedMs)) {
      endMs = refundedMs;
    } else if ((selectedOrder.status === 'failed' || selectedOrder.status === 'refunded') && Number.isFinite(updatedMs)) {
      endMs = updatedMs;
    } else if (selectedOrder.status === 'queued' || selectedOrder.status === 'processing') {
      endMs = timelineNowMs;
    }

    const elapsedMs = endMs !== null ? Math.max(0, endMs - createdMs) : 0;
    return {
      startedAtMs: createdMs,
      endAtMs: endMs,
      elapsedSeconds: Math.floor(elapsedMs / 1000),
      isFinished: selectedOrder.status === 'completed' || selectedOrder.status === 'failed' || selectedOrder.status === 'refunded'
    };
  }, [selectedOrder, timelineNowMs]);

  const processSteps = useMemo(() => {
    const status = selectedOrder?.status ?? 'upload_pending';
    const activeIndex = status === 'queued' ? 1 : status === 'processing' ? 2 : status === 'completed' ? 4 : status === 'failed' ? 3 : status === 'refunded' ? 4 : 0;
    return [
      { label: 'Order Accepted', done: status !== 'upload_pending', active: activeIndex === 0 },
      { label: 'Queued', done: status !== 'upload_pending' && status !== 'queued', active: activeIndex === 1 },
      { label: 'Processing Media', done: status === 'completed' || status === 'failed' || status === 'refunded', active: activeIndex === 2 },
      { label: status === 'failed' ? 'Failed' : status === 'refunded' ? 'Refunded' : 'Finalizing', done: status === 'completed' || status === 'failed' || status === 'refunded', active: activeIndex === 3 },
      { label: status === 'completed' ? 'Completed' : status === 'refunded' ? 'Refunded' : 'Done', done: status === 'completed' || status === 'refunded', active: activeIndex === 4 }
    ];
  }, [selectedOrder]);

  const frameBox = useMemo((): CropBox => {
    const width = workspaceSize.width;
    const height = workspaceSize.height;
    if (!width || !height) return { x: 0, y: 0, width: 0, height: 0 };
    const maxWidth = width * 0.84;
    const maxHeight = height * 0.82;
    let frameWidth = maxWidth;
    let frameHeight = frameWidth * FRAME_HEIGHT_TO_WIDTH;
    if (frameHeight > maxHeight) {
      frameHeight = maxHeight;
      frameWidth = frameHeight / FRAME_HEIGHT_TO_WIDTH;
    }
    return {
      x: Math.floor((width - frameWidth) / 2),
      y: Math.floor((height - frameHeight) / 2),
      width: Math.floor(frameWidth),
      height: Math.floor(frameHeight)
    };
  }, [workspaceSize.height, workspaceSize.width]);

  const baseScale = useMemo(() => {
    if (!sourceImage || !workspaceSize.width || !workspaceSize.height) return 1;
    return Math.min(workspaceSize.width / sourceImage.naturalWidth, workspaceSize.height / sourceImage.naturalHeight);
  }, [sourceImage, workspaceSize.height, workspaceSize.width]);

  const minZoom = useMemo(() => {
    if (!sourceImage) return 1;
    const scaledW = sourceImage.naturalWidth * baseScale;
    const scaledH = sourceImage.naturalHeight * baseScale;
    if (!scaledW || !scaledH) return 1;
    const requiredX = frameBox.width / scaledW;
    const requiredY = frameBox.height / scaledH;
    return Math.max(0.01, requiredX, requiredY);
  }, [baseScale, frameBox.height, frameBox.width, sourceImage]);

  const effectiveZoom = useMemo(() => clamp(zoom, minZoom, 8), [minZoom, zoom]);

  const imageRect = useMemo(() => {
    if (!sourceImage) return null;
    const width = sourceImage.naturalWidth * baseScale * effectiveZoom;
    const height = sourceImage.naturalHeight * baseScale * effectiveZoom;
    const left = (workspaceSize.width - width) / 2 + pan.x;
    const top = (workspaceSize.height - height) / 2 + pan.y;
    return { left, top, width, height };
  }, [baseScale, effectiveZoom, pan.x, pan.y, sourceImage, workspaceSize.height, workspaceSize.width]);

  const crop = useMemo(() => {
    if (!sourceImage || !imageRect) {
      return { x: 0, y: 0, w: 0.5, h: 1 };
    }
    const x = clamp((frameBox.x - imageRect.left) / imageRect.width, 0, 1);
    const y = clamp((frameBox.y - imageRect.top) / imageRect.height, 0, 1);
    const w = clamp(frameBox.width / imageRect.width, 0.01, 1);
    const h = clamp(frameBox.height / imageRect.height, 0.01, 1);
    return {
      x: clamp(x, 0, 1 - w),
      y: clamp(y, 0, 1 - h),
      w,
      h
    };
  }, [frameBox.height, frameBox.width, frameBox.x, frameBox.y, imageRect, sourceImage]);

  const cropPixels = useMemo(() => {
    if (!sourceImage) return null;
    return {
      width: Math.max(1, Math.round(crop.w * sourceImage.naturalWidth)),
      height: Math.max(1, Math.round(crop.h * sourceImage.naturalHeight))
    };
  }, [crop.h, crop.w, sourceImage]);

  const canCreateOrder = Boolean(selectedFile && sourceImage && priceBb && walletBalance >= priceBb && !busy);

  const clampPan = useCallback(
    (candidate: Vec2, nextZoom: number) => {
      if (!sourceImage) return { x: 0, y: 0 };
      const width = sourceImage.naturalWidth * baseScale * nextZoom;
      const height = sourceImage.naturalHeight * baseScale * nextZoom;
      const maxX = Math.max(0, (width - frameBox.width) / 2);
      const maxY = Math.max(0, (height - frameBox.height) / 2);
      return {
        x: clamp(candidate.x, -maxX, maxX),
        y: clamp(candidate.y, -maxY, maxY)
      };
    },
    [baseScale, frameBox.height, frameBox.width, sourceImage]
  );

  const refreshOrders = useCallback(async () => {
    const rows = await listAnimatedCapeOrders(60);
    const ownRows = supabaseUserId ? rows.filter((row) => row.user_id === supabaseUserId) : rows;
    setOrders(ownRows);
    setSelectedOrderId((current) => current ?? ownRows[0]?.id ?? null);
  }, [supabaseUserId]);

  useEffect(() => {
    const node = workspaceRef.current;
    if (!node) return;
    const update = () => {
      const rect = node.getBoundingClientRect();
      setWorkspaceSize({ width: rect.width, height: rect.height });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!sourceImage) return;
    setZoom((current) => clamp(current, minZoom, 8));
  }, [minZoom, sourceImage]);

  useEffect(() => {
    setPan((current) => clampPan(current, effectiveZoom));
  }, [clampPan, effectiveZoom, sourceImage, workspaceSize.height, workspaceSize.width]);

  useEffect(() => {
    if (!allowedDurations.includes(selectedDuration)) {
      setSelectedDuration(allowedDurations[0] ?? 3);
    }
  }, [allowedDurations, selectedDuration]);

  useEffect(() => {
    if (!authState) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setErrorMessage(null);

    void (async () => {
      try {
        await ensureCommerceIdentity(authState.profile.id, authState.profile.name, authState.profile.name).catch(() => null);
        const userRes = await supabase.auth.getUser();
        const activeUserId = userRes.data.user?.id ?? null;
        const [walletRes, ordersRes] = await Promise.allSettled([
          loadWallet(activeUserId),
          listAnimatedCapeOrders(60)
        ]);
        if (cancelled) return;
        const wallet = walletRes.status === 'fulfilled' ? walletRes.value : null;
        const ordersListRaw = ordersRes.status === 'fulfilled' ? ordersRes.value : [];
        const ordersList = activeUserId ? ordersListRaw.filter((row) => row.user_id === activeUserId) : ordersListRaw;

        setWalletBalance(wallet?.balance_bb ?? 0);
        setOrders(ordersList);
        setSelectedOrderId(ordersList[0]?.id ?? null);
        setSupabaseUserId(activeUserId);

        const initError =
          walletRes.status === 'rejected'
            ? toErrorMessage(walletRes.reason)
            : ordersRes.status === 'rejected'
              ? toErrorMessage(ordersRes.reason)
              : null;
        if (
          initError &&
          !initError.toLowerCase().includes('invalid authentication credentials') &&
          !initError.toLowerCase().includes('edge_405') &&
          !initError.toLowerCase().includes('method_not_allowed')
        ) {
          setErrorMessage(initError);
        } else {
          setErrorMessage(null);
        }
      } catch (error) {
        if (cancelled) return;
        setErrorMessage(toErrorMessage(error));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authState]);

  useEffect(() => {
    if (!supabaseUserId) return;
    const sync = () => {
      void refreshOrders();
      void loadWallet(supabaseUserId).then((wallet) => setWalletBalance(wallet?.balance_bb ?? 0)).catch(() => undefined);
    };
    const unsubscribeOrders = subscribeAnimatedOrders(supabaseUserId, sync);
    const unsubscribeWallet = subscribeOwnWallet(supabaseUserId, () => {
      void loadWallet(supabaseUserId).then((wallet) => setWalletBalance(wallet?.balance_bb ?? 0)).catch(() => undefined);
    });
    const poll = window.setInterval(sync, 7500);

    return () => {
      unsubscribeOrders();
      unsubscribeWallet();
      window.clearInterval(poll);
    };
  }, [refreshOrders, supabaseUserId]);

  useEffect(() => {
    const manifestPath = getOrderManifestPath(selectedOrder);
    if (!manifestPath || selectedOrder?.status !== 'completed') {
      setRuntime(null);
      setRuntimeError(null);
      return;
    }

    let cancelled = false;
    setRuntimeLoading(true);
    setRuntimeError(null);

    void AnimatedCapeRuntime.fromManifestStoragePath(manifestPath)
      .then((nextRuntime) => {
        if (cancelled) return;
        setRuntime(nextRuntime);
      })
      .catch((error) => {
        if (cancelled) return;
        setRuntimeError(error instanceof Error ? error.message : String(error));
        setRuntime(null);
      })
      .finally(() => {
        if (!cancelled) setRuntimeLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedOrder]);

  useEffect(() => {
    if (!runtime || previewPaused) return;

    let disposed = false;
    let currentObjectUrl: string | null = null;
    const start = performance.now();
    const intervalMs = Math.max(16, Math.round(1000 / Math.max(1, runtime.manifest.fps)));

    const tick = async () => {
      if (disposed) return;
      try {
        const nextUrl = await renderAnimatedCapeFrameToObjectUrl(
          runtime,
          performance.now() - start,
          runtime.manifest.frameWidth,
          runtime.manifest.frameHeight
        );
        if (disposed) {
          URL.revokeObjectURL(nextUrl);
          return;
        }
        setPreviewFrameObjectUrl((previous) => {
          if (previous) URL.revokeObjectURL(previous);
          return nextUrl;
        });
        if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
        currentObjectUrl = nextUrl;
      } catch {
        // ignore transient frame render failures
      }
    };

    void tick();
    const timer = window.setInterval(() => {
      void tick();
    }, intervalMs);

    return () => {
      disposed = true;
      window.clearInterval(timer);
      if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
    };
  }, [previewPaused, runtime]);

  useEffect(() => {
    return () => {
      if (selectedFilePreviewUrl) {
        URL.revokeObjectURL(selectedFilePreviewUrl);
      }
      setPreviewFrameObjectUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return null;
      });
    };
  }, [selectedFilePreviewUrl]);

  const openFilePicker = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] ?? null;
    if (!nextFile) return;

    if (!ALLOWED_MIME_TYPES.includes(nextFile.type) && !nextFile.name.toLowerCase().endsWith('.gif') && !nextFile.name.toLowerCase().endsWith('.mp4')) {
      setErrorMessage('Only GIF and MP4 files are supported.');
      return;
    }

    if (nextFile.size > MAX_FILE_SIZE_BYTES) {
      setErrorMessage('File too large. Max supported size is 120 MB.');
      return;
    }

    setBusy(true);
    setErrorMessage(null);
    setStatusMessage('Preparing media preview...');

    try {
      const { previewUrl, image, meta } = await extractPreviewFromFile(nextFile);
      if (selectedFilePreviewUrl) {
        URL.revokeObjectURL(selectedFilePreviewUrl);
      }
      setSelectedFile(nextFile);
      setSelectedFilePreviewUrl(previewUrl);
      setSourceImage(image);
      setSourceMeta(meta);
      setZoom(1);
      setPan({ x: 0, y: 0 });
      setStatusMessage('Media loaded. Frame it, pick tier, then create animated cape.');
      setOrderIdempotencyKey(buildAnimatedCapeIdempotencyKey());
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
      setStatusMessage(null);
    } finally {
      setBusy(false);
      event.target.value = '';
    }
  };

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (!sourceImage) return;
    event.preventDefault();
    const delta = event.deltaY > 0 ? -0.12 : 0.12;
    const nextZoom = clamp(effectiveZoom + delta, minZoom, 8);
    setZoom(nextZoom);
    setPan((current) => clampPan(current, nextZoom));
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!sourceImage || event.button !== 0) return;
    dragRef.current = {
      pointerId: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      originPan: pan
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.start.x;
    const deltaY = event.clientY - drag.start.y;
    setPan(clampPan({ x: drag.originPan.x + deltaX, y: drag.originPan.y + deltaY }, effectiveZoom));
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    dragRef.current = null;
  };

  const handleResetFraming = () => {
    setZoom(minZoom);
    setPan(clampPan({ x: 0, y: 0 }, minZoom));
  };

  const handleCreateAnimatedCape = async () => {
    if (!selectedFile || !sourceImage || !priceBb) return;
    setBusy(true);
    setErrorMessage(null);
    setStatusMessage('Uploading source and creating paid order...');
    let step: 'upload_url' | 'upload_source' | 'register_upload' | 'create_order' | 'refresh_after_order' = 'upload_url';

    try {
      const mediaType = selectedFile.name.toLowerCase().endsWith('.mp4') || selectedFile.type === 'video/mp4' ? 'mp4' : 'gif';
      step = 'upload_url';
      const ticket = await createAnimatedCapeUploadTicket(selectedFile);
      step = 'upload_source';
      await uploadAnimatedCapeSourceFile(ticket, selectedFile);

      step = 'register_upload';
      const upload = await registerAnimatedCapeUpload({
        mediaType,
        storagePath: ticket.storage_path,
        originalFileName: selectedFile.name,
        contentType: selectedFile.type || (mediaType === 'gif' ? 'image/gif' : 'video/mp4'),
        fileSizeBytes: selectedFile.size,
        sourceDurationMs: sourceMeta?.durationMs ?? null,
        sourceWidth: sourceMeta?.width ?? null,
        sourceHeight: sourceMeta?.height ?? null
      });

      step = 'create_order';
      const order = await createAnimatedCapeOrder({
        uploadMediaId: upload.id,
        fps: selectedFps,
        durationSeconds: selectedDuration,
        idempotencyKey: orderIdempotencyKey,
        crop
      });

      setOrderIdempotencyKey(buildAnimatedCapeIdempotencyKey());
      setStatusMessage(`Order queued. ${priceBb.toLocaleString()} BB charged. Processing started.`);
      setSelectedOrderId(order.order_id);
      step = 'refresh_after_order';
      await refreshOrders();
      const wallet = await loadWallet(supabaseUserId);
      setWalletBalance(wallet?.balance_bb ?? 0);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setErrorMessage(`[${step}] ${message}`);
      setStatusMessage(null);
    } finally {
      setBusy(false);
    }
  };

  const handleEquipSelected = async () => {
    if (!selectedOrder?.cosmetic_slug) return;
    setBusy(true);
    setErrorMessage(null);
    try {
      await setCapeLoadout(selectedOrder.cosmetic_slug);
      setStatusMessage(`Equipped ${selectedOrder.cosmetic_name ?? selectedOrder.cosmetic_slug}.`);
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteQueuedOrder = async (orderId: string) => {
    if (!orderId) return;
    setDeletingOrderId(orderId);
    setErrorMessage(null);
    setStatusMessage('Removing queued order...');
    try {
      await cancelAnimatedCapeOrder(orderId);
      let nextSelectedId: string | null = null;
      setOrders((current) => {
        const removedIndex = current.findIndex((candidate) => candidate.id === orderId);
        const remaining = current.filter((candidate) => candidate.id !== orderId);
        if (!remaining.length) {
          nextSelectedId = null;
          return remaining;
        }
        const previousIndex = removedIndex > 0 ? removedIndex - 1 : 0;
        nextSelectedId = remaining[Math.min(previousIndex, remaining.length - 1)]?.id ?? remaining[0].id;
        return remaining;
      });
      setSelectedOrderId((current) => {
        if (current && current !== orderId) return current;
        return nextSelectedId;
      });
      if (supabaseUserId) {
        const wallet = await loadWallet(supabaseUserId);
        setWalletBalance(wallet?.balance_bb ?? 0);
      }
      setStatusMessage('Queued order removed and refunded.');
    } catch (error) {
      const message = toErrorMessage(error);
      if (message.toLowerCase().includes('order_not_found')) {
        let nextSelectedId: string | null = null;
        setOrders((current) => {
          const removedIndex = current.findIndex((candidate) => candidate.id === orderId);
          const remaining = current.filter((candidate) => candidate.id !== orderId);
          if (!remaining.length) {
            nextSelectedId = null;
            return remaining;
          }
          const previousIndex = removedIndex > 0 ? removedIndex - 1 : 0;
          nextSelectedId = remaining[Math.min(previousIndex, remaining.length - 1)]?.id ?? remaining[0].id;
          return remaining;
        });
        setSelectedOrderId((current) => (current === orderId ? nextSelectedId : current));
        setStatusMessage('That queued order was stale and has been removed.');
        return;
      }
      setErrorMessage(message);
    } finally {
      setDeletingOrderId(null);
    }
  };

  if (!authState) {
    return (
      <div className="mx-auto max-w-[1360px] px-4 py-6">
        <div className="g-panel p-5 flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.14em] font-extrabold text-white/55">Animated Cape Studio</p>
            <h1 className="text-2xl font-extrabold text-white mt-1">Sign in required</h1>
            <p className="text-sm text-white/65 mt-2">Upload GIF/MP4, select tier, spend Bloom Bucks, and generate runtime-ready animated capes.</p>
          </div>
          <button onClick={() => void startLogin()} className="g-btn-accent h-10 px-4 text-[11px] uppercase tracking-[0.12em] font-extrabold">
            Sign In
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1460px] px-4 py-6 space-y-4 pb-8 overflow-hidden">
      <section className="g-panel p-4 md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.14em] font-extrabold text-white/55">Bloom Cosmetics</p>
            <h1 className="text-3xl font-extrabold text-white mt-1">Animated Cape Studio</h1>
            <p className="text-sm text-white/62 mt-2 max-w-3xl">
              Upload GIF or MP4, frame the visible cape face, choose FPS + duration tier, purchase with Bloom Bucks, then equip once processing completes.
            </p>
            <button
              type="button"
              onClick={() => navigate('/custom-cape')}
              className="g-btn mt-3 h-9 px-3 text-[10px] font-extrabold uppercase tracking-[0.12em]"
            >
              Open Static Custom Cape
            </button>
          </div>
          <div className="g-balance-chip">
            <Coins size={13} />
            <span className="text-[11px] uppercase tracking-[0.11em] font-black">Balance</span>
            <strong className="text-xl font-extrabold text-white">{walletBalance.toLocaleString()} BB</strong>
          </div>
        </div>
      </section>

      {(statusMessage || errorMessage) && (
        <section className={clsx('rounded-xl border px-3 py-2 text-sm font-semibold', errorMessage ? 'border-red-500/35 bg-red-500/10 text-red-100' : 'border-emerald-500/35 bg-emerald-500/10 text-emerald-100')}>
          <div className="flex items-center justify-between gap-3">
            <span>{errorMessage ?? statusMessage}</span>
            {isAuthMissingMessage(errorMessage) && (
              <button
                type="button"
                onClick={() => void startLogin()}
                className="g-btn h-8 px-3 text-[10px] font-extrabold uppercase tracking-[0.12em]"
              >
                Sign In Again
              </button>
            )}
          </div>
        </section>
      )}

      <section className="grid grid-cols-1 xl:grid-cols-[320px_minmax(0,1fr)_360px] gap-4 min-h-0">
        <aside className="g-panel p-4 space-y-4 h-full overflow-y-auto">
          <div>
            <p className="text-[10px] uppercase tracking-[0.14em] font-extrabold text-white/55">Upload</p>
            <button
              type="button"
              onClick={openFilePicker}
              disabled={busy}
              className="g-btn-accent mt-2 h-10 w-full text-[11px] uppercase tracking-[0.12em] font-extrabold inline-flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <UploadCloud size={14} />}
              {busy ? 'Working...' : 'Upload GIF / MP4'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".gif,.mp4,image/gif,video/mp4"
              className="hidden"
              onChange={handleFileChange}
            />
            <p className="mt-2 text-[11px] text-white/58">Accepted formats: GIF, MP4. Max file size: 120 MB.</p>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <p className="text-[10px] uppercase tracking-[0.12em] font-black text-white/55">Source</p>
            <p className="mt-1 text-sm font-bold text-white truncate">{selectedFile?.name ?? 'No file selected'}</p>
            <p className="text-xs text-white/58">{formatBytes(selectedFile?.size ?? null)}</p>
            {sourceMeta && (
              <p className="text-xs text-white/58 mt-1">
                {sourceMeta.width}x{sourceMeta.height}
                {sourceMeta.durationMs ? ' - ' + (sourceMeta.durationMs / 1000).toFixed(2) + 's' : ''}
              </p>
            )}
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-3">
            <p className="text-[10px] uppercase tracking-[0.12em] font-black text-white/55">Tier</p>
            <div>
              <p className="text-[11px] font-bold text-white/70 mb-1">FPS</p>
              <div className="grid grid-cols-3 gap-2">
                {[12, 15, 24].map((fps) => (
                  <button
                    key={fps}
                    onClick={() => setSelectedFps(fps as AnimatedCapeFps)}
                    className={clsx('h-9 rounded-lg border text-xs font-extrabold uppercase tracking-[0.1em] transition', selectedFps === fps ? 'g-btn-accent' : 'border-white/12 bg-white/[0.03] text-white/70 hover:bg-white/[0.06]')}
                  >
                    {fps} FPS
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[11px] font-bold text-white/70 mb-1">Duration</p>
              <div className="grid grid-cols-3 gap-2">
                {[3, 4, 5].map((duration) => {
                  const enabled = allowedDurations.includes(duration as AnimatedCapeDuration);
                  return (
                    <button
                      key={duration}
                      disabled={!enabled}
                      onClick={() => setSelectedDuration(duration as AnimatedCapeDuration)}
                      className={clsx('h-9 rounded-lg border text-xs font-extrabold uppercase tracking-[0.1em] transition disabled:opacity-40 disabled:cursor-not-allowed', selectedDuration === duration ? 'g-btn-accent' : 'border-white/12 bg-white/[0.03] text-white/70 hover:bg-white/[0.06]')}
                    >
                      {duration}s
                    </button>
                  );
                })}
              </div>
              <p className="mt-1 text-[11px] text-white/55">24 FPS is limited to 3 seconds.</p>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <p className="text-[10px] uppercase tracking-[0.12em] font-black text-white/55">Price</p>
            <p className="mt-1 text-2xl font-extrabold text-white">{priceBb ? `${priceBb.toLocaleString()} BB` : 'Invalid tier'}</p>
            <p className="text-xs text-white/58 mt-1">Charged atomically before processing starts. Failed jobs are refundable.</p>
            <button
              disabled={!canCreateOrder || loading}
              onClick={() => {
                void handleCreateAnimatedCape();
              }}
              className="g-btn-accent mt-3 h-10 w-full text-[11px] font-extrabold uppercase tracking-[0.12em] disabled:opacity-45"
            >
              {busy ? 'Processing...' : `Create Animated Cape (${priceBb?.toLocaleString() ?? 'N/A'} BB)`}
            </button>
            {priceBb !== null && walletBalance < priceBb && (
              <p className="mt-2 text-xs font-bold text-red-200">Not enough Bloom Bucks for this tier.</p>
            )}
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-white/62 leading-relaxed">
            <p className="font-bold text-white/72 mb-1">How it works</p>
            <ol className="list-decimal ml-4 space-y-1">
              <li>Upload GIF or MP4 source media.</li>
              <li>Frame the visible cape face using the locked 2:1 vertical crop.</li>
              <li>Select FPS + duration tier and purchase with Bloom Bucks.</li>
              <li>Worker converts to atlas pages + manifest and adds to your inventory.</li>
            </ol>
          </div>
        </aside>

        <div className="g-panel p-4 min-h-0 flex flex-col">
          <div className="flex items-center justify-between gap-3 mb-3">
            <p className="text-[10px] uppercase tracking-[0.14em] font-extrabold text-white/55">Visible Cape Frame</p>
            <div className="flex items-center gap-2">
              {cropPixels && <p className="text-xs text-white/62">Crop: {cropPixels.width}x{cropPixels.height}px</p>}
              <button onClick={handleResetFraming} className="g-btn h-8 px-3 text-[10px] font-extrabold uppercase tracking-[0.11em]">
                <RefreshCw size={11} className="mr-1" /> Reset
              </button>
            </div>
          </div>
          <div
            ref={workspaceRef}
            className="relative flex-1 min-h-[420px] border border-white/10 bg-[#05050a] overflow-hidden"
            onWheel={handleWheel}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            {sourceImage && selectedFilePreviewUrl && imageRect ? (
              <>
                <div
                  className="absolute"
                  style={{
                    left: imageRect.left,
                    top: imageRect.top,
                    width: imageRect.width,
                    height: imageRect.height
                  }}
                >
                  <img src={selectedFilePreviewUrl} alt="Source preview" className="h-full w-full object-fill select-none pointer-events-none [image-rendering:pixelated]" draggable={false} />
                </div>

                <div className="absolute inset-0 pointer-events-none">
                  <div className="absolute bg-black/45" style={{ left: 0, top: 0, width: '100%', height: frameBox.y }} />
                  <div className="absolute bg-black/45" style={{ left: 0, top: frameBox.y + frameBox.height, width: '100%', height: Math.max(0, workspaceSize.height - (frameBox.y + frameBox.height)) }} />
                  <div className="absolute bg-black/45" style={{ left: 0, top: frameBox.y, width: frameBox.x, height: frameBox.height }} />
                  <div className="absolute bg-black/45" style={{ left: frameBox.x + frameBox.width, top: frameBox.y, width: Math.max(0, workspaceSize.width - (frameBox.x + frameBox.width)), height: frameBox.height }} />

                  <div className="absolute border-2 border-[var(--g-accent)] shadow-[0_0_0_1px_var(--g-accent-soft),0_0_24px_color-mix(in_srgb,var(--g-accent)_28%,transparent)]" style={{ left: frameBox.x, top: frameBox.y, width: frameBox.width, height: frameBox.height }} />
                </div>
              </>
            ) : (
              <div className="absolute inset-0 grid place-items-center text-center px-6">
                <div>
                  <p className="text-sm font-extrabold text-white">Upload media to begin framing</p>
                  <p className="text-xs text-white/55 mt-1">Crop is locked to the true Minecraft cape visible-face ratio (2:1 vertical).</p>
                </div>
              </div>
            )}
          </div>
          <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 flex items-center justify-between text-xs text-white/63">
            <span>Drag to pan</span>
            <span>Scroll to zoom</span>
            <span>Zoom: {effectiveZoom.toFixed(2)}x</span>
          </div>
        </div>

        <aside className="g-panel p-4 min-h-0 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] uppercase tracking-[0.14em] font-extrabold text-white/55">Live Preview</p>
            <button
              type="button"
              className="g-btn h-8 px-2.5 text-[10px] font-extrabold uppercase tracking-[0.1em]"
              onClick={() => setPreviewPaused((current) => !current)}
            >
              {previewPaused ? <Play size={11} className="mr-1" /> : <Pause size={11} className="mr-1" />}
              {previewPaused ? 'Play' : 'Pause'}
            </button>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2">
            <div className="h-[160px] border border-white/12 bg-black/30">
              {runtime ? (
                <AnimatedCapeCanvasPreview runtime={runtime} paused={previewPaused} className="h-full w-full [image-rendering:pixelated]" fit="contain" />
              ) : (
                <div className="h-full w-full grid place-items-center text-[11px] text-white/55">
                  {runtimeLoading ? 'Loading runtime animation...' : 'No processed animation yet'}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2">
            <div className="h-[300px]">
              <MinecraftPlayerPreview
                playerUuid={authState.profile.id}
                playerName={authState.profile.name}
                playerSkinUrl={authState.profile.skinUrl ?? null}
                capeSlug={`animated-preview-${selectedOrder?.id ?? 'none'}`}
                capeTextureUrl={previewFrameObjectUrl || selectedOrder?.cosmetic_texture_url || selectedOrder?.cosmetic_preview_url || ''}
                capeTextureObjectUrl={previewFrameObjectUrl || selectedOrder?.cosmetic_texture_url || selectedOrder?.cosmetic_preview_url || undefined}
                className="h-full w-full"
              />
            </div>
            {runtimeError && <p className="mt-2 text-xs font-semibold text-red-200">{runtimeError}</p>}
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 min-h-[200px] overflow-hidden flex flex-col">
            <div className="rounded-xl border border-white/10 bg-black/25 p-2.5 mb-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] uppercase tracking-[0.12em] font-black text-white/55">Processing Timeline</p>
                <span className="text-xs font-bold text-white/75">
                  {selectedOrder && processTiming
                    ? processTiming.isFinished
                      ? `Total ${formatElapsedSeconds(processTiming.elapsedSeconds)}`
                      : `Elapsed ${formatElapsedSeconds(processTiming.elapsedSeconds)}`
                    : 'No order selected'}
                </span>
              </div>
              {selectedOrder ? (
                <div className="mt-2 space-y-1.5">
                  {processSteps.map((step, index) => (
                    <div key={`${step.label}-${index}`} className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={clsx(
                            'h-2 w-2 rounded-full',
                            step.done
                              ? 'bg-emerald-300'
                              : step.active
                                ? 'bg-[var(--g-accent)] shadow-[0_0_10px_color-mix(in_srgb,var(--g-accent)_55%,transparent)]'
                                : 'bg-white/25'
                          )}
                        />
                        <span className={clsx('text-xs truncate', step.active ? 'text-white font-semibold' : step.done ? 'text-white/85' : 'text-white/50')}>
                          {step.label}
                        </span>
                      </div>
                      {step.active && !processTiming?.isFinished && <span className="text-[10px] font-black uppercase tracking-[0.1em] text-[var(--g-accent)]">Live</span>}
                    </div>
                  ))}
                  {selectedOrder.processing_error_message && (
                    <p className="text-[11px] text-red-200 mt-1">{selectedOrder.processing_error_message}</p>
                  )}
                  {selectedOrder.status === 'queued' && (processTiming?.elapsedSeconds ?? 0) > 45 && (
                    <p className="text-[11px] text-amber-200 mt-1">
                      Queue appears stalled. Worker may be offline or unable to claim jobs.
                    </p>
                  )}
                </div>
              ) : (
                <p className="mt-2 text-xs text-white/50">Create an order to view live step timing.</p>
              )}
            </div>

            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] uppercase tracking-[0.12em] font-black text-white/55">Orders / Inventory</p>
              <button
                type="button"
                onClick={() => void refreshOrders()}
                className="g-btn h-7 px-2 text-[10px] font-extrabold uppercase tracking-[0.1em]"
              >
                Refresh
              </button>
            </div>

            <div className="mt-2 flex-1 overflow-y-auto space-y-2 pr-1">
              {orders.length === 0 && (
                <div className="rounded-lg border border-white/10 bg-black/25 p-2 text-xs text-white/55">No animated cape orders yet.</div>
              )}

              {orders.map((order) => (
                <div
                  key={order.id}
                  className={clsx(
                    'group relative w-full rounded-lg border px-2.5 py-2 text-left transition',
                    selectedOrder?.id === order.id
                      ? 'border-[var(--g-accent)] bg-[color-mix(in_srgb,var(--g-accent)_15%,transparent)]'
                      : 'border-white/10 bg-black/20 hover:bg-black/30'
                  )}
                >
                  {order.status === 'queued' && (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleDeleteQueuedOrder(order.id);
                      }}
                      disabled={deletingOrderId === order.id}
                      className={clsx(
                        'absolute right-2 top-2 z-10 inline-flex h-6 w-6 items-center justify-center rounded-md border border-white/15 bg-black/50 text-white/65 opacity-0 transition group-hover:opacity-100',
                        'hover:border-red-400/60 hover:bg-red-500/20 hover:text-red-200 disabled:opacity-100 disabled:cursor-wait'
                      )}
                      title="Delete queued order"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setSelectedOrderId(order.id)}
                    className="w-full text-left"
                  >
                    <div className="flex items-center justify-between gap-2 pr-8">
                      <p className="text-sm font-extrabold text-white truncate">{order.cosmetic_name ?? `Order ${order.id.slice(0, 8)}`}</p>
                      <span className="text-[10px] font-black uppercase tracking-[0.1em] text-white/60">{formatOrderStatus(order.status)}</span>
                    </div>
                    <p className="text-xs text-white/62 mt-1">
                      {order.selected_fps} FPS - {order.selected_duration_seconds}s - {order.cost_bloom_bucks.toLocaleString()} BB
                    </p>
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-2 space-y-2">
              {selectedOrder?.status === 'completed' ? (
                <button
                  onClick={() => {
                    void handleEquipSelected();
                  }}
                  disabled={busy || !selectedOrder?.cosmetic_slug}
                  className="g-btn-accent h-9 w-full text-[11px] font-extrabold uppercase tracking-[0.12em] disabled:opacity-45"
                >
                  Equip Selected
                </button>
              ) : (
                <p className="text-[11px] text-white/55">Complete processing to unlock equip.</p>
              )}
            </div>
          </div>
        </aside>
      </section>
    </div>
  );
}
