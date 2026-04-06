import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type PointerEvent } from 'react';
import { clsx } from 'clsx';
import { Coins, Download, ImagePlus, Move, RefreshCw, ZoomIn } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { MinecraftPlayerPreview } from '../components/cosmetics/MinecraftPlayerPreview';
import { AnimatedSpriteSheetStudio } from '../components/cosmetics/AnimatedSpriteSheetStudio';
import {
  createCapeListing,
  createOrUpdateCustomCapeDraft,
  ensureCommerceIdentity,
  finalizeCustomCapeExport,
  getSupabaseUserId,
  loadLatestCustomCapeDraft,
  loadWallet,
  subscribeOwnWallet,
  uploadCustomCapeFinalAtlas,
  uploadCustomCapeSourceImage
} from '../services/cosmetics';
import { CUSTOM_CAPE_EXPORT_PRESETS, generateCustomCapeAtlas, loadImageElementFromUrl } from '../services/customCapeAtlas';
import { TauriApi } from '../services/tauri';

type Vec2 = {
  x: number;
  y: number;
};

type CropBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const EXPORT_PRICE_BB = 800;
const WATERMARK_TEXT = 'Preview Only';
const ACCEPTED_FILE_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
const VISIBLE_FACE_HEIGHT_TO_WIDTH_RATIO = 2;
const MIN_VALID_CROP_FRACTION = 0.02;

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

function sanitizeFileName(name: string) {
  return name.replace(/[^\w.-]+/g, '_');
}

function getCapeAtlasResolutionLabel(exportWidth: number) {
  return `${exportWidth}x${Math.floor(exportWidth / 2)}`;
}

function isReasonableCrop(crop: { x: number; y: number; width: number; height: number } | null | undefined) {
  if (!crop) return false;
  if (!Number.isFinite(crop.x) || !Number.isFinite(crop.y) || !Number.isFinite(crop.width) || !Number.isFinite(crop.height)) {
    return false;
  }
  if (crop.width < MIN_VALID_CROP_FRACTION || crop.height < MIN_VALID_CROP_FRACTION) return false;
  if (crop.width > 1 || crop.height > 1) return false;
  if (crop.x < 0 || crop.y < 0) return false;
  if (crop.x + crop.width > 1.001 || crop.y + crop.height > 1.001) return false;
  return true;
}

async function blobToBytes(blob: Blob) {
  return Array.from(new Uint8Array(await blob.arrayBuffer()));
}

async function saveCustomCapeDebugArtifacts(
  designKey: string,
  sourceImageUrl: string,
  sourceFileName: string | null,
  visibleFaceBlob: Blob,
  atlasBlob: Blob
) {
  const paths = await TauriApi.pathsGet();
  const root = `${String(paths.logs).replace(/[\\\/]logs$/i, '')}\\custom-cape-debug\\${designKey}`;
  const sourceResponse = await fetch(sourceImageUrl);
  const sourceBlob = await sourceResponse.blob();

  await Promise.all([
    TauriApi.saveBinaryFile(`${root}\\01-source-${sanitizeFileName(sourceFileName ?? 'source.png')}`, await blobToBytes(sourceBlob)),
    TauriApi.saveBinaryFile(`${root}\\02-visible-face.png`, await blobToBytes(visibleFaceBlob)),
    TauriApi.saveBinaryFile(`${root}\\03-generated-atlas.png`, await blobToBytes(atlasBlob)),
    TauriApi.saveBinaryFile(`${root}\\04-final-uploaded-atlas.png`, await blobToBytes(atlasBlob))
  ]);
}

export function CustomCape() {
  const navigate = useNavigate();
  const [studioTab, setStudioTab] = useState<'static' | 'animated'>('static');
  const { authState, startLogin } = useAuth();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ pointerId: number; start: Vec2; originPan: Vec2 } | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [walletBalance, setWalletBalance] = useState(0);
  const [supabaseUserId, setSupabaseUserId] = useState<string | null>(null);
  const [commerceRole, setCommerceRole] = useState<'user' | 'owner'>('user');
  const [designId, setDesignId] = useState<string | null>(null);
  const [purchased, setPurchased] = useState(false);
  const [sourceImagePath, setSourceImagePath] = useState<string | null>(null);
  const [sourceImageUrl, setSourceImageUrl] = useState<string | null>(null);
  const [sourceImageElement, setSourceImageElement] = useState<HTMLImageElement | null>(null);
  const [loadedCrop, setLoadedCrop] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [sourceFileName, setSourceFileName] = useState<string | null>(null);
  const [sourceFileSize, setSourceFileSize] = useState<number | null>(null);
  const [workspaceSize, setWorkspaceSize] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Vec2>({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [exportWidth, setExportWidth] = useState<number>(2048);
  const [previewTextureObjectUrl, setPreviewTextureObjectUrl] = useState<string | null>(null);
  const [exportIdempotencyKey, setExportIdempotencyKey] = useState<string>(() => crypto.randomUUID());
  const [lastExportTextureUrl, setLastExportTextureUrl] = useState<string>('');
  const [ownerListingSlug, setOwnerListingSlug] = useState('');
  const [ownerListingName, setOwnerListingName] = useState('');
  const [ownerListingPrice, setOwnerListingPrice] = useState<number>(1200);
  const [ownerListingDescription, setOwnerListingDescription] = useState('');
  const [publishingToShop, setPublishingToShop] = useState(false);
  const [staticStudioEpoch, setStaticStudioEpoch] = useState(0);

  useEffect(() => {
    if (studioTab === 'static') {
      setStaticStudioEpoch((current) => current + 1);
    }
  }, [studioTab]);

  const fileInfo = useMemo(
    () => ({
      name: sourceFileName ?? 'No image uploaded',
      size: formatBytes(sourceFileSize)
    }),
    [sourceFileName, sourceFileSize]
  );

  const frameBox = useMemo((): CropBox => {
    const width = workspaceSize.width;
    const height = workspaceSize.height;
    if (!width || !height) return { x: 0, y: 0, width: 0, height: 0 };
    const maxWidth = width * 0.86;
    const maxHeight = height * 0.8;
    let frameWidth = maxWidth;
    let frameHeight = frameWidth * VISIBLE_FACE_HEIGHT_TO_WIDTH_RATIO;
    if (frameHeight > maxHeight) {
      frameHeight = maxHeight;
      frameWidth = frameHeight / VISIBLE_FACE_HEIGHT_TO_WIDTH_RATIO;
    }
    return {
      x: (width - frameWidth) / 2,
      y: (height - frameHeight) / 2,
      width: frameWidth,
      height: frameHeight
    };
  }, [workspaceSize.height, workspaceSize.width]);

  const baseScale = useMemo(() => {
    if (!sourceImageElement || !workspaceSize.width || !workspaceSize.height) return 1;
    return Math.min(workspaceSize.width / sourceImageElement.naturalWidth, workspaceSize.height / sourceImageElement.naturalHeight);
  }, [sourceImageElement, workspaceSize.height, workspaceSize.width]);

  const minZoom = useMemo(() => {
    if (!sourceImageElement) return 1;
    const scaledW = sourceImageElement.naturalWidth * baseScale;
    const scaledH = sourceImageElement.naturalHeight * baseScale;
    if (!scaledW || !scaledH) return 1;
    const requiredX = frameBox.width / scaledW;
    const requiredY = frameBox.height / scaledH;
    return Math.max(0.01, requiredX, requiredY);
  }, [baseScale, frameBox.height, frameBox.width, sourceImageElement]);

  const effectiveZoom = useMemo(() => clamp(zoom, minZoom, 8), [minZoom, zoom]);

  const imageRect = useMemo(() => {
    if (!sourceImageElement) return null;
    const width = sourceImageElement.naturalWidth * baseScale * effectiveZoom;
    const height = sourceImageElement.naturalHeight * baseScale * effectiveZoom;
    const left = (workspaceSize.width - width) / 2 + pan.x;
    const top = (workspaceSize.height - height) / 2 + pan.y;
    return { left, top, width, height };
  }, [baseScale, effectiveZoom, pan.x, pan.y, sourceImageElement, workspaceSize.height, workspaceSize.width]);

  const clampPan = useCallback(
    (candidate: Vec2, nextZoom: number) => {
      if (!sourceImageElement) return { x: 0, y: 0 };
      const width = sourceImageElement.naturalWidth * baseScale * nextZoom;
      const height = sourceImageElement.naturalHeight * baseScale * nextZoom;
      const maxX = Math.max(0, (width - frameBox.width) / 2);
      const maxY = Math.max(0, (height - frameBox.height) / 2);
      return {
        x: clamp(candidate.x, -maxX, maxX),
        y: clamp(candidate.y, -maxY, maxY)
      };
    },
    [baseScale, frameBox.height, frameBox.width, sourceImageElement]
  );

  const currentCrop = useMemo(() => {
    if (!sourceImageElement || !imageRect) {
      return { x: 0, y: 0, width: 0.5, height: 1 };
    }
    const cropX = clamp((frameBox.x - imageRect.left) / imageRect.width, 0, 1);
    const cropY = clamp((frameBox.y - imageRect.top) / imageRect.height, 0, 1);
    const cropW = clamp(frameBox.width / imageRect.width, 0.01, 1);
    const cropH = clamp(frameBox.height / imageRect.height, 0.01, 1);
    return {
      x: clamp(cropX, 0, 1 - cropW),
      y: clamp(cropY, 0, 1 - cropH),
      width: cropW,
      height: cropH
    };
  }, [frameBox.height, frameBox.width, frameBox.x, frameBox.y, imageRect, sourceImageElement]);

  const cropPixelStats = useMemo(() => {
    if (!sourceImageElement) return null;
    return {
      width: Math.max(1, Math.round(currentCrop.width * sourceImageElement.naturalWidth)),
      height: Math.max(1, Math.round(currentCrop.height * sourceImageElement.naturalHeight))
    };
  }, [currentCrop.height, currentCrop.width, sourceImageElement]);

  const resetFraming = useCallback(() => {
    const nextZoom = minZoom;
    setZoom(nextZoom);
    setPan(clampPan({ x: 0, y: 0 }, nextZoom));
    setLoadedCrop(null);
  }, [clampPan, minZoom]);

  const saveDraft = useCallback(
    async (sourcePath: string, sourceUrl: string) => {
      const row = await createOrUpdateCustomCapeDraft({
        design_id: designId,
        source_image_path: sourcePath,
        source_image_url: sourceUrl,
        crop_x: currentCrop.x,
        crop_y: currentCrop.y,
        crop_width: currentCrop.width,
        crop_height: currentCrop.height,
        export_width: exportWidth
      });
      if (row?.id) setDesignId(row.id);
      if (row) {
        setPurchased(row.purchased);
      }
      return row;
    },
    [currentCrop.height, currentCrop.width, currentCrop.x, currentCrop.y, designId, exportWidth]
  );

  useEffect(() => {
    if (studioTab !== 'static') return;
    const node = workspaceRef.current;
    if (!node) return;
    const update = () => {
      const rect = node.getBoundingClientRect();
      setWorkspaceSize({
        width: rect.width,
        height: rect.height
      });
    };
    update();
    const frameA = window.requestAnimationFrame(update);
    const frameB = window.requestAnimationFrame(update);
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => {
      window.cancelAnimationFrame(frameA);
      window.cancelAnimationFrame(frameB);
      observer.disconnect();
    };
  }, [studioTab, staticStudioEpoch]);

  useEffect(() => {
    if (!sourceImageElement) return;
    setZoom((current) => {
      const next = clamp(current, minZoom, 8);
      return Number.isFinite(next) ? next : minZoom;
    });
  }, [minZoom, sourceImageElement]);

  useEffect(() => {
    setPan((current) => clampPan(current, effectiveZoom));
  }, [clampPan, effectiveZoom, sourceImageElement, workspaceSize.height, workspaceSize.width]);

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
        const profile = await ensureCommerceIdentity(authState.profile.id, authState.profile.name, authState.profile.name);
        const [userId, wallet, draft] = await Promise.all([getSupabaseUserId(), loadWallet(), loadLatestCustomCapeDraft()]);
        if (cancelled) return;
        setCommerceRole((profile?.role ?? 'user') === 'owner' ? 'owner' : 'user');
        setSupabaseUserId(userId);
        setWalletBalance(wallet?.balance_bb ?? 0);
        if (draft) {
          setDesignId(draft.id);
          setSourceImagePath(draft.source_image_path);
          setSourceImageUrl(draft.source_image_url);
          setPurchased(draft.purchased);
          setExportWidth(draft.export_width);
          const draftCrop = {
            x: draft.crop_x,
            y: draft.crop_y,
            width: draft.crop_width,
            height: draft.crop_height
          };
          setLoadedCrop(isReasonableCrop(draftCrop) ? draftCrop : null);
          setExportIdempotencyKey(crypto.randomUUID());
          setZoom(1);
          setPan({ x: 0, y: 0 });
          if (draft.source_image_url) {
            const image = await loadImageElementFromUrl(draft.source_image_url);
            if (cancelled) return;
            setSourceImageElement(image);
            const nameGuess = draft.source_image_path ? draft.source_image_path.split('/').pop() : 'draft-image.png';
            setSourceFileName(nameGuess ?? 'draft-image.png');
            setSourceFileSize(null);
          }
          if (draft.final_asset_url) {
            setLastExportTextureUrl(draft.final_asset_url);
          }
        }
      } catch (error) {
        if (cancelled) return;
        setErrorMessage(error instanceof Error ? error.message : String(error));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authState]);

  useEffect(() => {
    if (!sourceImageElement || !loadedCrop || !frameBox.width || !frameBox.height) return;
    if (!isReasonableCrop(loadedCrop)) {
      setZoom(minZoom);
      setPan(clampPan({ x: 0, y: 0 }, minZoom));
      setLoadedCrop(null);
      return;
    }
    const cropWidth = clamp(loadedCrop.width, 0.01, 1);
    const cropHeight = clamp(loadedCrop.height, 0.01, 1);
    const zoomX = frameBox.width / (sourceImageElement.naturalWidth * baseScale * cropWidth);
    const zoomY = frameBox.height / (sourceImageElement.naturalHeight * baseScale * cropHeight);
    const targetZoom = clamp(Math.max(zoomX, zoomY), minZoom, 8);
    const drawWidth = sourceImageElement.naturalWidth * baseScale * targetZoom;
    const drawHeight = sourceImageElement.naturalHeight * baseScale * targetZoom;
    const imageLeft = frameBox.x - clamp(loadedCrop.x, 0, 1 - cropWidth) * drawWidth;
    const imageTop = frameBox.y - clamp(loadedCrop.y, 0, 1 - cropHeight) * drawHeight;
    const targetPan = {
      x: imageLeft - (workspaceSize.width - drawWidth) / 2,
      y: imageTop - (workspaceSize.height - drawHeight) / 2
    };
    setZoom(targetZoom);
    setPan(clampPan(targetPan, targetZoom));
    setLoadedCrop(null);
  }, [baseScale, clampPan, frameBox.height, frameBox.width, frameBox.x, frameBox.y, loadedCrop, minZoom, sourceImageElement, workspaceSize.height, workspaceSize.width]);

  useEffect(() => {
    if (!supabaseUserId) return;
    const unsubscribe = subscribeOwnWallet(supabaseUserId, () => {
      void loadWallet()
        .then((wallet) => setWalletBalance(wallet?.balance_bb ?? 0))
        .catch(() => {
          // ignore silent refresh failures
        });
    });
    return () => unsubscribe();
  }, [supabaseUserId]);

  useEffect(() => {
    if (!sourceImageElement || !sourceImagePath || !sourceImageUrl) return;
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      setSavingDraft(true);
      void saveDraft(sourceImagePath, sourceImageUrl)
        .catch((error) => {
          setErrorMessage(error instanceof Error ? error.message : String(error));
        })
        .finally(() => {
          setSavingDraft(false);
        });
    }, 650);
    return () => {
      if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    };
  }, [currentCrop.height, currentCrop.width, currentCrop.x, currentCrop.y, exportWidth, saveDraft, sourceImageElement, sourceImagePath, sourceImageUrl]);

  useEffect(() => {
    let cancelled = false;
    if (!sourceImageElement) {
      setPreviewTextureObjectUrl(null);
      return;
    }
    const delay = dragging ? 70 : 180;
    const timer = window.setTimeout(() => {
      setPreviewBusy(true);
      void generateCustomCapeAtlas({
        image: sourceImageElement,
        sourceWidth: sourceImageElement.naturalWidth,
        sourceHeight: sourceImageElement.naturalHeight,
        crop: currentCrop,
        exportWidth: Math.min(exportWidth, dragging ? 512 : 1024),
        watermarkText: purchased ? null : WATERMARK_TEXT
      })
        .then(({ blob }) => {
          if (cancelled) return;
          const nextUrl = URL.createObjectURL(blob);
          if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
          previewUrlRef.current = nextUrl;
          setPreviewTextureObjectUrl(nextUrl);
        })
        .catch((error) => {
          if (cancelled) return;
          setErrorMessage(error instanceof Error ? error.message : String(error));
        })
        .finally(() => {
          if (!cancelled) setPreviewBusy(false);
        });
    }, delay);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [currentCrop, dragging, exportWidth, purchased, sourceImageElement]);

  useEffect(
    () => () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    },
    []
  );

  const handleWorkspacePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!sourceImageElement) return;
    dragRef.current = {
      pointerId: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      originPan: pan
    };
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleWorkspacePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - dragRef.current.start.x;
    const deltaY = event.clientY - dragRef.current.start.y;
    setPan(clampPan({ x: dragRef.current.originPan.x + deltaX, y: dragRef.current.originPan.y + deltaY }, effectiveZoom));
  };

  const handleWorkspacePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const handleWorkspaceWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (!sourceImageElement) return;
    event.preventDefault();
    const factor = event.deltaY < 0 ? 1.09 : 0.92;
    const nextZoom = clamp(effectiveZoom * factor, minZoom, 8);
    setZoom(nextZoom);
    setPan((current) => clampPan(current, nextZoom));
  };

  const handleUploadFile = async (file: File) => {
    if (!supabaseUserId) {
      setErrorMessage('missing_user_session');
      return;
    }
    if (!ACCEPTED_FILE_TYPES.includes(file.type)) {
      setErrorMessage('Unsupported file type. Use PNG, JPG, JPEG, or WEBP.');
      return;
    }
    if (file.size > 30 * 1024 * 1024) {
      setErrorMessage('File is too large. Max size is 30 MB.');
      return;
    }
    setErrorMessage(null);
    setStatusMessage(null);
    setUploading(true);
    try {
      const upload = await uploadCustomCapeSourceImage(supabaseUserId, file);
      const image = await loadImageElementFromUrl(upload.publicUrl);
      setSourceImagePath(upload.path);
      setSourceImageUrl(upload.publicUrl);
      setSourceImageElement(image);
      setSourceFileName(sanitizeFileName(file.name));
      setSourceFileSize(file.size);
      setPurchased(false);
      setDesignId(null);
      setLoadedCrop(null);
      setExportIdempotencyKey(crypto.randomUUID());
      setPan({ x: 0, y: 0 });
      setZoom(1);
      const draft = await createOrUpdateCustomCapeDraft({
        design_id: null,
        source_image_path: upload.path,
        source_image_url: upload.publicUrl,
        crop_x: 0,
        crop_y: 0,
        crop_width: 0.5,
        crop_height: 1,
        export_width: exportWidth
      });
      if (draft?.id) setDesignId(draft.id);
      setStatusMessage('Image uploaded. Move and zoom to frame the visible cape face.');
      const safeBaseName = (sanitizeFileName(file.name).replace(/\.[^.]+$/, '') || 'custom-cape').toLowerCase();
      setOwnerListingSlug((current) => current || `custom-${safeBaseName}-${Date.now().toString().slice(-5)}`);
      setOwnerListingName((current) => current || `${safeBaseName} cape`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    void handleUploadFile(file);
    event.target.value = '';
  };

  const handleExport = async () => {
    if (!sourceImageElement || !sourceImagePath || !sourceImageUrl || !supabaseUserId) {
      setErrorMessage('Upload an image first.');
      return;
    }
    setErrorMessage(null);
    setStatusMessage(null);
    setExporting(true);
    try {
      const cleanAtlas = await generateCustomCapeAtlas({
        image: sourceImageElement,
        sourceWidth: sourceImageElement.naturalWidth,
        sourceHeight: sourceImageElement.naturalHeight,
        crop: currentCrop,
        exportWidth,
        watermarkText: null
      });

      let activeDesignId = designId;
      if (!activeDesignId) {
        const draft = await saveDraft(sourceImagePath, sourceImageUrl);
        activeDesignId = draft?.id ?? null;
      }
      if (!activeDesignId) throw new Error('design_not_ready');

      await saveCustomCapeDebugArtifacts(
        activeDesignId,
        sourceImageUrl,
        sourceFileName,
        cleanAtlas.visibleFaceBlob,
        cleanAtlas.blob
      );

      if (!purchased) {
        if (walletBalance < EXPORT_PRICE_BB) {
          throw new Error('insufficient_balance');
        }
        const uploaded = await uploadCustomCapeFinalAtlas(supabaseUserId, activeDesignId, cleanAtlas.blob);
        const finalizeResult = await finalizeCustomCapeExport(
          activeDesignId,
          uploaded.path,
          uploaded.publicUrl,
          exportIdempotencyKey
        );
        if (!finalizeResult) throw new Error('finalize_failed');
        setWalletBalance(finalizeResult.new_balance_bb);
        setPurchased(true);
        setLastExportTextureUrl(finalizeResult.final_asset_url || uploaded.publicUrl);
        setExportIdempotencyKey(crypto.randomUUID());
        setStatusMessage('Custom cape exported to Locker and purchased for 800 BB. Watermark removed.');
      } else {
        const uploaded = await uploadCustomCapeFinalAtlas(supabaseUserId, activeDesignId, cleanAtlas.blob);
        setLastExportTextureUrl(uploaded.publicUrl);
        setStatusMessage('Custom cape exported to Locker.');
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setExporting(false);
    }
  };

  const handleOwnerPublishToShop = async () => {
    if (commerceRole !== 'owner') {
      setErrorMessage('owner_role_required');
      return;
    }
    const slug = ownerListingSlug.trim().toLowerCase();
    const name = ownerListingName.trim();
    const textureUrl = lastExportTextureUrl.trim();
    if (!slug || !name || !textureUrl) {
      setErrorMessage('Owner listing requires slug, name, and an exported cape texture URL.');
      return;
    }
    setErrorMessage(null);
    setPublishingToShop(true);
    try {
      const created = await createCapeListing({
        slug,
        name,
        description: ownerListingDescription.trim() || null,
        texture_url: textureUrl,
        preview_url: textureUrl,
        price_bb: ownerListingPrice,
        rarity: 'custom',
        rarity_label: 'CUSTOM',
        sort_order: 9999,
        is_active: true,
        is_featured: false
      });
      setStatusMessage(`Uploaded to shop: ${created.name} (${created.slug})`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setPublishingToShop(false);
    }
  };

  if (!authState) {
    return (
      <div className="max-w-[1180px] mx-auto min-h-full py-6">
        <section className="g-panel p-6">
          <p className="text-[10px] uppercase tracking-[0.14em] font-extrabold text-white/55">Custom Cape</p>
          <h1 className="mt-2 text-3xl font-extrabold text-white">Sign in to create a custom cape</h1>
          <p className="mt-2 text-sm text-white/65">Bloom uses your authenticated profile to store drafts, charge Bloom Bucks, and sync exports.</p>
          <button
            onClick={() => {
              void startLogin();
            }}
            className="g-btn-accent mt-5 h-11 px-5 text-xs font-extrabold uppercase tracking-[0.12em]"
          >
            Sign In
          </button>
        </section>
      </div>
    );
  }

  return (
    <div className="max-w-[1280px] mx-auto h-[calc(100vh-92px)] py-6 space-y-4 overflow-hidden flex flex-col">
      <section className="g-panel p-4 grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] items-center gap-3">
        <div className="lg:justify-self-start">
          <button
            type="button"
            onClick={() => navigate('/cosmetics')}
            className="mb-3 inline-flex h-8 items-center rounded-lg border border-white/12 bg-white/[0.03] px-3 text-[10px] font-extrabold uppercase tracking-[0.12em] text-white/78 transition hover:bg-white/[0.07]"
          >
            Back To Locker
          </button>
          <p className="text-[10px] uppercase tracking-[0.16em] font-extrabold text-white/55">Bloom Cosmetics</p>
          <h1 className="text-2xl font-extrabold text-white mt-1">Cape Studio</h1>
        </div>
        <div className="flex items-center justify-center gap-2">
          <div className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-2 py-1">
            <button
              type="button"
              onClick={() => setStudioTab('static')}
              className={clsx(
                'h-8 rounded-lg px-3 text-[10px] font-extrabold uppercase tracking-[0.12em] border',
                studioTab === 'static'
                  ? 'border-[var(--g-accent)] bg-white/[0.09] text-white'
                  : 'border-white/15 bg-white/[0.03] text-white/75 hover:bg-white/[0.07]'
              )}
            >
              Static
            </button>
            <button
              type="button"
              onClick={() => setStudioTab('animated')}
              className={clsx(
                'h-8 rounded-lg px-3 text-[10px] font-extrabold uppercase tracking-[0.12em] border',
                studioTab === 'animated'
                  ? 'border-[var(--g-accent)] bg-white/[0.09] text-white'
                  : 'border-white/15 bg-white/[0.03] text-white/75 hover:bg-white/[0.07]'
              )}
            >
              Animated
            </button>
          </div>
        </div>
        <div className="lg:justify-self-end">
          <div className="inline-flex items-center gap-2 rounded-xl border border-white/12 bg-white/[0.03] px-3 py-2 shadow-[0_8px_20px_rgba(0,0,0,0.25)]">
            <div className="h-7 w-7 rounded-lg border border-white/15 bg-white/[0.05] flex items-center justify-center">
              <Coins size={14} className="text-white/80" />
            </div>
            <div className="leading-tight">
              <p className="text-[10px] uppercase tracking-[0.12em] font-extrabold text-white/52">Balance</p>
              <p className="text-sm font-extrabold text-white">{walletBalance.toLocaleString()} BB</p>
            </div>
          </div>
        </div>
      </section>

      {statusMessage && (
        <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-xs font-bold text-emerald-200">
          {statusMessage}
        </div>
      )}
      {errorMessage && (
        <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-2 text-xs font-bold text-red-200">
          {errorMessage}
        </div>
      )}

      {studioTab === 'static' ? (
      <section key={`static-studio-${staticStudioEpoch}`} className="grid grid-cols-1 xl:grid-cols-[320px_minmax(0,1fr)_340px] gap-4 min-h-0">
        <aside className="g-panel p-4 min-h-0 overflow-y-auto">
          <p className="text-[10px] uppercase tracking-[0.16em] font-extrabold text-white/55">Setup</p>
          <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/jpg,image/webp" className="hidden" onChange={handleFileChange} />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="g-btn-accent mt-3 h-10 w-full text-[11px] font-extrabold uppercase tracking-[0.12em] inline-flex items-center justify-center gap-2 disabled:opacity-55"
          >
            <ImagePlus size={14} />
            {uploading ? 'Uploading...' : 'Upload Image'}
          </button>

          <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <p className="text-[10px] uppercase tracking-[0.12em] font-extrabold text-white/55">Selected File</p>
            <p className="mt-1 text-sm font-bold text-white truncate">{fileInfo.name}</p>
            <p className="text-xs text-white/55">{fileInfo.size}</p>
          </div>

          <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[10px] uppercase tracking-[0.12em] font-extrabold text-white/55">Export Resolution</p>
              <span className="text-xs font-extrabold text-white">{getCapeAtlasResolutionLabel(exportWidth)}</span>
            </div>
            <input
              type="range"
              min={0}
              max={CUSTOM_CAPE_EXPORT_PRESETS.length - 1}
              value={Math.max(0, CUSTOM_CAPE_EXPORT_PRESETS.indexOf(exportWidth as (typeof CUSTOM_CAPE_EXPORT_PRESETS)[number]))}
              onChange={(event) => {
                const index = clamp(Number(event.target.value) || 0, 0, CUSTOM_CAPE_EXPORT_PRESETS.length - 1);
                setExportWidth(CUSTOM_CAPE_EXPORT_PRESETS[index]);
              }}
              className="mt-2 w-full accent-[var(--g-accent)]"
            />
            <div className="mt-2 grid grid-cols-3 gap-1">
              {CUSTOM_CAPE_EXPORT_PRESETS.map((preset) => (
                <button
                  key={preset}
                  onClick={() => setExportWidth(preset)}
                  className={clsx(
                    'h-7 rounded-md border text-[10px] font-extrabold uppercase tracking-[0.1em]',
                    exportWidth === preset ? 'g-btn-accent' : 'border-white/10 bg-white/[0.03] text-white/72'
                  )}
                >
                  {getCapeAtlasResolutionLabel(preset)}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <p className="text-[10px] uppercase tracking-[0.12em] font-extrabold text-white/55">Export Cost</p>
            <p className="mt-1 text-lg font-extrabold text-white">Export to Locker - {EXPORT_PRICE_BB} BB</p>
            <p className="text-xs text-white/55 mt-1">
              Upload and preview are free. Exporting to Locker charges once and removes watermark from live preview.
            </p>
            <button
              onClick={() => {
                void handleExport();
              }}
              disabled={!sourceImageElement || loading || exporting || savingDraft}
              className="g-btn-accent mt-3 h-10 w-full text-[11px] font-extrabold uppercase tracking-[0.12em] inline-flex items-center justify-center gap-2 disabled:opacity-45"
            >
              <Download size={14} />
              {exporting
                ? 'Processing...'
                : purchased
                  ? 'Export to Locker'
                  : `Purchase (${EXPORT_PRICE_BB} BB)`}
            </button>
          </div>

          <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-white/62 space-y-1">
            <p>1. Upload any image.</p>
            <p>2. Drag + zoom until the vertical 2:1 frame matches what you want visible on cape front.</p>
            <p>3. Pick export size.</p>
            <p>4. Export to pay once and remove watermark.</p>
          </div>

          {commerceRole === 'owner' && (
            <div className="mt-3 rounded-xl border border-white/15 bg-black/35 p-3">
              <div className="inline-flex items-center rounded-xl border border-white/15 bg-white/[0.03] p-1 mb-2">
                <button
                  type="button"
                  className="h-8 rounded-lg px-3 text-[10px] font-extrabold uppercase tracking-[0.12em] border border-white/25 bg-white/[0.12] text-white"
                >
                  Listing
                </button>
              </div>
              <p className="text-[10px] uppercase tracking-[0.12em] font-black text-white/50">Owner Upload To Shop</p>
              <div className="mt-2 space-y-2">
                <input
                  value={ownerListingSlug}
                  onChange={(event) => setOwnerListingSlug(event.target.value)}
                  placeholder="slug"
                  className="w-full rounded-lg border border-white/20 bg-black/40 px-3 py-2 text-xs font-bold text-white"
                />
                <input
                  value={ownerListingName}
                  onChange={(event) => setOwnerListingName(event.target.value)}
                  placeholder="name"
                  className="w-full rounded-lg border border-white/20 bg-black/40 px-3 py-2 text-xs font-bold text-white"
                />
                <input
                  type="number"
                  min={0}
                  value={ownerListingPrice}
                  onChange={(event) => setOwnerListingPrice(Math.max(0, Number(event.target.value) || 0))}
                  placeholder="price_bb"
                  className="w-full rounded-lg border border-white/20 bg-black/40 px-3 py-2 text-xs font-bold text-white"
                />
                <textarea
                  value={ownerListingDescription}
                  onChange={(event) => setOwnerListingDescription(event.target.value)}
                  placeholder="description (optional)"
                  rows={2}
                  className="w-full rounded-lg border border-white/20 bg-black/40 px-3 py-2 text-xs font-bold text-white resize-y"
                />
                <input
                  value={lastExportTextureUrl}
                  onChange={(event) => setLastExportTextureUrl(event.target.value)}
                  placeholder="texture_url (auto from latest export)"
                  className="w-full rounded-lg border border-white/20 bg-black/40 px-3 py-2 text-[11px] text-white/90"
                />
                <button
                  onClick={() => {
                    void handleOwnerPublishToShop();
                  }}
                  disabled={publishingToShop}
                  className="h-9 w-full rounded-lg border border-white/25 bg-white/[0.12] text-[11px] font-extrabold uppercase tracking-[0.12em] text-white hover:bg-white/[0.18] disabled:opacity-50"
                >
                  {publishingToShop ? 'Uploading...' : 'Upload To Shop'}
                </button>
              </div>
            </div>
          )}
        </aside>

        <div className="g-panel p-4 min-h-0 flex flex-col">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] uppercase tracking-[0.16em] font-extrabold text-white/55">Visible Cape Face</p>
            <div className="flex items-center gap-2">
              {cropPixelStats && (
                <span className="text-[11px] text-white/58">
                  Crop (W x H): {cropPixelStats.width}x{cropPixelStats.height}px | Locked Ratio (H:W): 2:1
                </span>
              )}
              <button
                onClick={resetFraming}
                disabled={!sourceImageElement}
                className="g-btn h-8 px-2.5 text-[10px] font-extrabold uppercase tracking-[0.12em] inline-flex items-center gap-1 disabled:opacity-50"
              >
                <RefreshCw size={12} />
                Reset Framing
              </button>
            </div>
          </div>

          <div
            ref={workspaceRef}
            className="relative mt-3 flex-1 min-h-[420px] overflow-hidden border border-white/12 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_60%),rgba(0,0,0,0.35)]"
            onPointerDown={handleWorkspacePointerDown}
            onPointerMove={handleWorkspacePointerMove}
            onPointerUp={handleWorkspacePointerUp}
            onPointerCancel={handleWorkspacePointerUp}
            onWheel={handleWorkspaceWheel}
          >
            {sourceImageElement && sourceImageUrl && imageRect ? (
              <>
                <div
                  className="absolute pointer-events-none"
                  style={{
                    left: imageRect.left,
                    top: imageRect.top,
                    width: imageRect.width,
                    height: imageRect.height
                  }}
                >
                  <img
                    src={sourceImageUrl}
                    alt="Custom cape source"
                    className="h-full w-full object-fill select-none pointer-events-none [image-rendering:pixelated]"
                    draggable={false}
                  />
                </div>
                <div className="absolute inset-0 pointer-events-none">
                  <div
                    className="absolute bg-black/45"
                    style={{
                      left: 0,
                      top: 0,
                      width: '100%',
                      height: frameBox.y
                    }}
                  />
                  <div
                    className="absolute bg-black/45"
                    style={{
                      left: 0,
                      top: frameBox.y + frameBox.height,
                      width: '100%',
                      height: Math.max(0, workspaceSize.height - (frameBox.y + frameBox.height))
                    }}
                  />
                  <div
                    className="absolute bg-black/45"
                    style={{
                      left: 0,
                      top: frameBox.y,
                      width: frameBox.x,
                      height: frameBox.height
                    }}
                  />
                  <div
                    className="absolute bg-black/45"
                    style={{
                      left: frameBox.x + frameBox.width,
                      top: frameBox.y,
                      width: Math.max(0, workspaceSize.width - (frameBox.x + frameBox.width)),
                      height: frameBox.height
                    }}
                  />
                  <div
                    className="absolute border-2 border-white/95 shadow-[0_0_0_1px_rgba(255,255,255,0.35),0_0_28px_rgba(255,255,255,0.14)]"
                    style={{
                      left: frameBox.x,
                      top: frameBox.y,
                      width: frameBox.width,
                      height: frameBox.height
                    }}
                  />
                  <div
                    className="absolute border border-[var(--g-accent)]/90 pointer-events-none"
                    style={{
                      left: frameBox.x + 4,
                      top: frameBox.y + 4,
                      width: Math.max(0, frameBox.width - 8),
                      height: Math.max(0, frameBox.height - 8)
                    }}
                  />
                </div>
              </>
            ) : (
              <div className="absolute inset-0 grid place-items-center text-center px-6">
                <div>
                  <p className="text-sm font-extrabold text-white">Upload an image to start</p>
                  <p className="text-xs text-white/55 mt-1">The frame is locked to the true vertical 2:1 cape visible-face ratio.</p>
                </div>
              </div>
            )}
          </div>

          <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-white/65">
              <Move size={13} />
              Drag to pan
            </div>
            <div className="flex items-center gap-2 text-xs text-white/65">
              <ZoomIn size={13} />
              Scroll to zoom
            </div>
            <div className="text-xs text-white/65">
              Zoom: {effectiveZoom.toFixed(2)}x
            </div>
          </div>
        </div>

        <aside className="g-panel p-4 min-h-0 flex flex-col">
          <p className="text-[10px] uppercase tracking-[0.16em] font-extrabold text-white/55">Live Preview</p>
          <div className="relative mt-3 border border-white/10 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.1),transparent_60%),rgba(0,0,0,0.35)] p-3 select-none">
            <div className="h-[310px]">
              {sourceImageElement && previewTextureObjectUrl ? (
                <MinecraftPlayerPreview
                  key={`static-preview-${staticStudioEpoch}-${previewTextureObjectUrl ?? 'none'}`}
                  playerUuid={authState.profile.id}
                  playerName={authState.profile.name}
                  playerSkinUrl={authState.profile.skinUrl ?? null}
                  capeSlug={`custom-preview-${designId ?? 'draft'}`}
                  capeTextureUrl={previewTextureObjectUrl}
                  capeTextureObjectUrl={previewTextureObjectUrl}
                  className="h-full w-full"
                />
              ) : (
                <div className="h-full w-full border border-white/12 bg-black/25" />
              )}
            </div>
            <p className="mt-2 text-[11px] text-white/55">
              {previewBusy ? 'Updating preview...' : purchased ? 'Clean preview active.' : 'Preview watermark stays until export purchase.'}
            </p>
          </div>

          <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <p className="text-sm font-extrabold text-white">Custom Cape Status</p>
            <p className="text-[11px] text-white/58 mt-1">Draft ID: {designId ?? 'Not created yet'}</p>
            <p className="text-xs text-white/65 mt-2">
              {purchased
                ? 'This design is purchased. Exports are clean and watermark-free.'
                : 'This design is in preview mode. Export purchase required for clean final atlas.'}
            </p>
            <div className="mt-3 rounded-lg border border-white/10 bg-black/20 px-2.5 py-2 text-[11px] text-white/60">
              {savingDraft ? 'Saving draft...' : loading ? 'Loading...' : 'Draft autosave active.'}
            </div>
          </div>
        </aside>
      </section>
      ) : (
        <AnimatedSpriteSheetStudio
          playerUuid={authState.profile.id}
          playerName={authState.profile.name}
          playerSkinUrl={authState.profile.skinUrl ?? null}
        />
      )}
    </div>
  );
}
