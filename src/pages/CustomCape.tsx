import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type PointerEvent } from 'react';
import { clsx } from 'clsx';
import { Coins, Download, ImagePlus, Move, RefreshCw, UploadCloud, ZoomIn } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { MinecraftPlayerPreview } from '../components/cosmetics/MinecraftPlayerPreview';
import {
  createOrUpdateCustomCapeDraft,
  createCapeListing,
  createPartnerGroup,
  ensureCommerceIdentity,
  finalizeCustomCapeExport,
  getSupabaseUserId,
  loadLatestCustomCapeDraft,
  loadPartnerGroups,
  loadPreviewAppearance,
  loadWallet,
  subscribePreviewAppearance,
  setCapePartnerGroup,
  subscribeOwnWallet,
  upsertPreviewAppearance,
  uploadCustomCapeFinalAtlas,
  uploadCustomCapeSourceImage,
  DEFAULT_PREVIEW_APPEARANCE,
  type CreateCapeListingInput,
  type CommerceProfile,
  type PartnerGroupRecord,
  type PreviewAppearanceRecord
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
type PreviewAppearanceKey =
  | 'exposure'
  | 'brightness'
  | 'contrast'
  | 'saturation'
  | 'turn_rate'
  | 'camera_light_intensity'
  | 'global_light_intensity';

const PREVIEW_APPEARANCE_SLIDERS: Array<{
  key: PreviewAppearanceKey;
  label: string;
  min: number;
  max: number;
  step: number;
}> = [
  { key: 'exposure', label: 'Exposure', min: 0.8, max: 3.1, step: 0.01 },
  { key: 'brightness', label: 'Brightness', min: 0.8, max: 2.2, step: 0.01 },
  { key: 'contrast', label: 'Contrast', min: 0.75, max: 1.5, step: 0.01 },
  { key: 'saturation', label: 'Saturation', min: 0.75, max: 1.65, step: 0.01 },
  { key: 'turn_rate', label: 'Turn Rate', min: 0, max: 1.8, step: 0.01 },
  { key: 'camera_light_intensity', label: 'Key Light', min: 0.5, max: 2.8, step: 0.01 },
  { key: 'global_light_intensity', label: 'Fill Light', min: 0.2, max: 2.1, step: 0.01 }
];

type OwnerPreviewContextMenuState = {
  x: number;
  y: number;
};

type OwnerPublishCapeDraft = {
  slug: string;
  name: string;
  description: string;
  price_bb: number;
  rarity: string;
  rarity_label: string;
  rarity_color_start: string;
  rarity_color_end: string;
  rarity_glow: string;
  sort_order: number;
  is_active: boolean;
  is_featured: boolean;
};

const DEFAULT_OWNER_PUBLISH_CAPE_DRAFT: OwnerPublishCapeDraft = {
  slug: '',
  name: '',
  description: '',
  price_bb: 1200,
  rarity: 'epic',
  rarity_label: 'Epic',
  rarity_color_start: '#a979ff',
  rarity_color_end: '#3a1f68',
  rarity_glow: 'rgba(169, 121, 255, 0.45)',
  sort_order: 0,
  is_active: true,
  is_featured: false
};

type RarityPreset = {
  id: string;
  rarity: string;
  rarity_label: string;
  rarity_color_start: string;
  rarity_color_end: string;
  rarity_glow: string;
};

const OWNER_RARITY_PRESETS: RarityPreset[] = [
  { id: 'common', rarity: 'common', rarity_label: 'Common', rarity_color_start: '#6b7280', rarity_color_end: '#374151', rarity_glow: 'rgba(107, 114, 128, 0.35)' },
  { id: 'uncommon', rarity: 'uncommon', rarity_label: 'Uncommon', rarity_color_start: '#22c55e', rarity_color_end: '#166534', rarity_glow: 'rgba(34, 197, 94, 0.35)' },
  { id: 'rare', rarity: 'rare', rarity_label: 'Rare', rarity_color_start: '#3b82f6', rarity_color_end: '#1d4ed8', rarity_glow: 'rgba(59, 130, 246, 0.35)' },
  { id: 'epic', rarity: 'epic', rarity_label: 'Epic', rarity_color_start: '#a855f7', rarity_color_end: '#6d28d9', rarity_glow: 'rgba(168, 85, 247, 0.4)' },
  { id: 'legendary', rarity: 'legendary', rarity_label: 'Legendary', rarity_color_start: '#f59e0b', rarity_color_end: '#b45309', rarity_glow: 'rgba(245, 158, 11, 0.38)' },
  { id: 'mythic', rarity: 'mythic', rarity_label: 'Mythic', rarity_color_start: '#ef4444', rarity_color_end: '#991b1b', rarity_glow: 'rgba(239, 68, 68, 0.4)' },
  { id: 'partner', rarity: 'partner', rarity_label: 'Partner', rarity_color_start: '#000000', rarity_color_end: '#000000', rarity_glow: 'rgba(0, 0, 0, 0.42)' },
  { id: 'custom', rarity: 'custom', rarity_label: 'Custom', rarity_color_start: '#06b6d4', rarity_color_end: '#155e75', rarity_glow: 'rgba(6, 182, 212, 0.4)' }
];

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalizePreviewAppearance(value: PreviewAppearanceRecord): PreviewAppearanceRecord {
  return {
    scope: 'global',
    exposure: clampNumber(Number(value.exposure) || DEFAULT_PREVIEW_APPEARANCE.exposure, 0.8, 3.1),
    brightness: clampNumber(Number(value.brightness) || DEFAULT_PREVIEW_APPEARANCE.brightness, 0.8, 2.2),
    contrast: clampNumber(Number(value.contrast) || DEFAULT_PREVIEW_APPEARANCE.contrast, 0.75, 1.5),
    saturation: clampNumber(Number(value.saturation) || DEFAULT_PREVIEW_APPEARANCE.saturation, 0.75, 1.65),
    turn_rate: clampNumber(Number(value.turn_rate) || DEFAULT_PREVIEW_APPEARANCE.turn_rate, 0, 1.8),
    camera_light_intensity: clampNumber(
      Number(value.camera_light_intensity) || DEFAULT_PREVIEW_APPEARANCE.camera_light_intensity,
      0.5,
      2.8
    ),
    global_light_intensity: clampNumber(
      Number(value.global_light_intensity) || DEFAULT_PREVIEW_APPEARANCE.global_light_intensity,
      0.2,
      2.1
    ),
    updated_by: value.updated_by ?? null,
    updated_at: value.updated_at ?? new Date().toISOString()
  };
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
  const { authState, startLogin } = useAuth();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ pointerId: number; start: Vec2; originPan: Vec2 } | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const previewAppearanceWriteTimerRef = useRef<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [walletBalance, setWalletBalance] = useState(0);
  const [supabaseUserId, setSupabaseUserId] = useState<string | null>(null);
  const [commerceProfile, setCommerceProfile] = useState<CommerceProfile | null>(null);
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
  const [ownerPreviewContextMenu, setOwnerPreviewContextMenu] = useState<OwnerPreviewContextMenuState | null>(null);
  const [ownerAppearancePanelOpen, setOwnerAppearancePanelOpen] = useState(false);
  const [previewAppearance, setPreviewAppearance] = useState<PreviewAppearanceRecord>(DEFAULT_PREVIEW_APPEARANCE);
  const [previewAppearanceSaving, setPreviewAppearanceSaving] = useState(false);
  const [ownerPublishModalOpen, setOwnerPublishModalOpen] = useState(false);
  const [ownerPublishing, setOwnerPublishing] = useState(false);
  const [ownerPublishDraft, setOwnerPublishDraft] = useState<OwnerPublishCapeDraft>(DEFAULT_OWNER_PUBLISH_CAPE_DRAFT);
  const [ownerRarityPreset, setOwnerRarityPreset] = useState<string>('epic');
  const [partnerGroups, setPartnerGroups] = useState<PartnerGroupRecord[]>([]);
  const [attachPartnerGroup, setAttachPartnerGroup] = useState(false);
  const [selectedPartnerGroup, setSelectedPartnerGroup] = useState('');
  const [newPartnerGroupName, setNewPartnerGroupName] = useState('');
  const [creatingPartnerGroup, setCreatingPartnerGroup] = useState(false);
  const isOwner = commerceProfile?.role === 'owner';

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
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

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
        const [profile, userId, wallet, draft, appearance] = await Promise.all([
          ensureCommerceIdentity(authState.profile.id, authState.profile.name, authState.profile.name),
          getSupabaseUserId(),
          loadWallet(),
          loadLatestCustomCapeDraft(),
          loadPreviewAppearance()
        ]);
        if (cancelled) return;
        setCommerceProfile(profile);
        setSupabaseUserId(userId);
        setWalletBalance(wallet?.balance_bb ?? 0);
        setPreviewAppearance(normalizePreviewAppearance(appearance));
        if (draft) {
          setDesignId(draft.id);
          setSourceImagePath(draft.source_image_path);
          setSourceImageUrl(draft.source_image_url);
          setPurchased(draft.purchased);
          setExportWidth(draft.export_width);
          setLoadedCrop({
            x: draft.crop_x,
            y: draft.crop_y,
            width: draft.crop_width,
            height: draft.crop_height
          });
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
    if (!isOwner) return;
    void loadPartnerGroups()
      .then((groups) => setPartnerGroups(groups))
      .catch(() => {
        // non-fatal
      });
  }, [isOwner]);

  useEffect(() => {
    const syncAppearance = () => {
      void loadPreviewAppearance()
        .then((data) => setPreviewAppearance(normalizePreviewAppearance(data)))
        .catch(() => {
          // ignore transient appearance sync failures
        });
    };
    syncAppearance();
    const unsubscribe = subscribePreviewAppearance(syncAppearance);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!ownerPreviewContextMenu) return;
    const close = () => setOwnerPreviewContextMenu(null);
    const onWindowBlur = () => close();
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('contextmenu', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('blur', onWindowBlur);
    window.addEventListener('keydown', onEscape);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('contextmenu', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('blur', onWindowBlur);
      window.removeEventListener('keydown', onEscape);
    };
  }, [ownerPreviewContextMenu]);

  useEffect(() => {
    return () => {
      if (previewAppearanceWriteTimerRef.current !== null) {
        window.clearTimeout(previewAppearanceWriteTimerRef.current);
        previewAppearanceWriteTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!sourceImageElement || !loadedCrop || !frameBox.width || !frameBox.height) return;
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
      setZoom(minZoom);
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
        setExportIdempotencyKey(crypto.randomUUID());
        setStatusMessage('Custom cape exported to Locker and purchased for 800 BB. Watermark removed.');
      } else {
        setStatusMessage('Custom cape exported to Locker.');
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setExporting(false);
    }
  };

  const updateOwnerPublishDraft = <K extends keyof OwnerPublishCapeDraft>(key: K, value: OwnerPublishCapeDraft[K]) => {
    setOwnerPublishDraft((current) => ({ ...current, [key]: value }));
  };

  const applyOwnerRarityPreset = (presetId: string) => {
    setOwnerRarityPreset(presetId);
    const preset = OWNER_RARITY_PRESETS.find((item) => item.id === presetId);
    if (!preset) return;
    setOwnerPublishDraft((current) => ({
      ...current,
      rarity: preset.rarity,
      rarity_label: preset.rarity_label,
      rarity_color_start: preset.rarity_color_start,
      rarity_color_end: preset.rarity_color_end,
      rarity_glow: preset.rarity_glow
    }));
  };

  const openOwnerPublishModal = () => {
    const fallbackName = sourceFileName?.replace(/\.[^/.]+$/, '') ?? '';
    const fallbackSlug = fallbackName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    setOwnerPublishDraft((current) => ({
      ...current,
      name: current.name || fallbackName || current.name,
      slug: current.slug || fallbackSlug || current.slug
    }));
    setOwnerRarityPreset('epic');
    setAttachPartnerGroup(false);
    setSelectedPartnerGroup('');
    setNewPartnerGroupName('');
    setOwnerPublishModalOpen(true);
  };

  const handleCreateOwnerPartnerGroup = async () => {
    const name = newPartnerGroupName.trim();
    if (!name || !isOwner) return;
    setCreatingPartnerGroup(true);
    try {
      const created = await createPartnerGroup(name);
      setPartnerGroups((current) => [...current, created].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedPartnerGroup(created.name);
      setNewPartnerGroupName('');
      setStatusMessage(`Partner group created: ${created.name}`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setCreatingPartnerGroup(false);
    }
  };

  const handleOwnerPublishToShop = async () => {
    if (!isOwner) return;
    if (!sourceImageElement || !supabaseUserId) {
      setErrorMessage('Upload an image first.');
      return;
    }
    const slug = ownerPublishDraft.slug.trim().toLowerCase();
    const name = ownerPublishDraft.name.trim();
    if (!slug || !name) {
      setErrorMessage('Slug and display name are required.');
      return;
    }

    setOwnerPublishing(true);
    setErrorMessage(null);
    try {
      const cleanAtlas = await generateCustomCapeAtlas({
        image: sourceImageElement,
        sourceWidth: sourceImageElement.naturalWidth,
        sourceHeight: sourceImageElement.naturalHeight,
        crop: currentCrop,
        exportWidth,
        watermarkText: null
      });
      const uploaded = await uploadCustomCapeFinalAtlas(supabaseUserId, `owner-shop-${crypto.randomUUID()}`, cleanAtlas.blob);
      const payload: CreateCapeListingInput = {
        slug,
        name,
        description: ownerPublishDraft.description.trim() || null,
        texture_url: uploaded.publicUrl,
        preview_url: null,
        price_bb: Math.max(0, Number(ownerPublishDraft.price_bb) || 0),
        rarity: ownerPublishDraft.rarity.trim().toLowerCase() || 'epic',
        rarity_label: ownerPublishDraft.rarity_label.trim() || null,
        rarity_color_start: ownerPublishDraft.rarity_color_start.trim() || null,
        rarity_color_end: ownerPublishDraft.rarity_color_end.trim() || null,
        rarity_glow: ownerPublishDraft.rarity_glow.trim() || null,
        sort_order: Number(ownerPublishDraft.sort_order) || 0,
        is_active: ownerPublishDraft.is_active,
        is_featured: ownerPublishDraft.is_featured
      };
      const created = await createCapeListing(payload);
      if (!created?.id) throw new Error('cape_create_failed');
      if (attachPartnerGroup && selectedPartnerGroup.trim()) {
        await setCapePartnerGroup(created.id, selectedPartnerGroup.trim());
      }
      setOwnerPublishModalOpen(false);
      setStatusMessage(`Published to Shop: ${name}`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setOwnerPublishing(false);
    }
  };

  const queuePreviewAppearanceSync = (next: PreviewAppearanceRecord) => {
    if (!isOwner) return;
    if (previewAppearanceWriteTimerRef.current !== null) {
      window.clearTimeout(previewAppearanceWriteTimerRef.current);
    }
    setPreviewAppearanceSaving(true);
    previewAppearanceWriteTimerRef.current = window.setTimeout(() => {
      void upsertPreviewAppearance({
        exposure: next.exposure,
        brightness: next.brightness,
        contrast: next.contrast,
        saturation: next.saturation,
        turn_rate: next.turn_rate,
        camera_light_intensity: next.camera_light_intensity,
        global_light_intensity: next.global_light_intensity
      })
        .then((saved) => {
          setPreviewAppearance(normalizePreviewAppearance(saved));
        })
        .catch((error) => {
          setErrorMessage(error instanceof Error ? error.message : String(error));
        })
        .finally(() => {
          setPreviewAppearanceSaving(false);
          previewAppearanceWriteTimerRef.current = null;
        });
    }, 180);
  };

  const updatePreviewAppearanceSetting = (key: PreviewAppearanceKey, raw: number) => {
    setPreviewAppearance((current) => {
      const slider = PREVIEW_APPEARANCE_SLIDERS.find((item) => item.key === key);
      if (!slider) return current;
      const next = normalizePreviewAppearance({
        ...current,
        [key]: clampNumber(raw, slider.min, slider.max)
      } as PreviewAppearanceRecord);
      queuePreviewAppearanceSync(next);
      return next;
    });
  };

  const handleResetPreviewAppearance = () => {
    const next = normalizePreviewAppearance(DEFAULT_PREVIEW_APPEARANCE);
    setPreviewAppearance(next);
    queuePreviewAppearanceSync(next);
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
          <p className="text-[10px] uppercase tracking-[0.16em] font-extrabold text-white/55">Bloom Cosmetics</p>
          <h1 className="text-2xl font-extrabold text-white mt-1">Custom Cape</h1>
        </div>
        <div className="flex items-center justify-center gap-2">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-[11px] font-extrabold uppercase tracking-[0.12em] text-white/80">
            Visible Face Ratio (H:W): 2:1
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

      <section className="grid grid-cols-1 xl:grid-cols-[320px_minmax(0,1fr)_340px] gap-4 min-h-0">
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

          {isOwner && (
            <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <p className="text-[10px] uppercase tracking-[0.12em] font-extrabold text-white/55">Owner</p>
              <p className="mt-1 text-sm font-bold text-white">Publish Cosmetic Cape</p>
              <p className="mt-1 text-xs text-white/55">Create a global shop cape from this current upload + crop.</p>
              <button
                onClick={openOwnerPublishModal}
                disabled={!sourceImageElement || ownerPublishing}
                className="g-btn-accent mt-3 h-10 w-full text-[11px] font-extrabold uppercase tracking-[0.12em] inline-flex items-center justify-center gap-2 disabled:opacity-45"
              >
                <UploadCloud size={14} />
                Publish To Shop
              </button>
            </div>
          )}

          <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-white/62 space-y-1">
            <p>1. Upload any image.</p>
            <p>2. Drag + zoom until the vertical 2:1 frame matches what you want visible on cape front.</p>
            <p>3. Pick export size.</p>
            <p>4. Export to pay once and remove watermark.</p>
          </div>
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
                    className="absolute border-2 border-[var(--g-accent)] shadow-[0_0_0_1px_var(--g-accent-soft),0_0_24px_color-mix(in_srgb,var(--g-accent)_30%,transparent)]"
                    style={{
                      left: frameBox.x,
                      top: frameBox.y,
                      width: frameBox.width,
                      height: frameBox.height
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
          <div
            className="relative mt-3 border border-white/10 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.1),transparent_60%),rgba(0,0,0,0.35)] p-3 select-none"
            onContextMenu={
              isOwner
                ? (event) => {
                    event.preventDefault();
                    setOwnerPreviewContextMenu({ x: event.clientX, y: event.clientY });
                  }
                : undefined
            }
          >
            <div className="h-[310px]">
              {sourceImageElement && previewTextureObjectUrl ? (
                <MinecraftPlayerPreview
                  playerUuid={authState.profile.id}
                  playerName={authState.profile.name}
                  playerSkinUrl={authState.profile.skinUrl ?? null}
                  capeSlug={`custom-preview-${designId ?? 'draft'}`}
                  capeTextureUrl={previewTextureObjectUrl}
                  capeTextureObjectUrl={previewTextureObjectUrl}
                  appearance={previewAppearance}
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

      {isOwner && ownerPreviewContextMenu && (
        <div
          className="fixed z-[550] min-w-[188px] rounded-xl border border-white/15 bg-[#120d19] p-2 shadow-[0_22px_40px_rgba(0,0,0,0.6)]"
          style={{ left: ownerPreviewContextMenu.x, top: ownerPreviewContextMenu.y }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <p className="px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white/55">Preview Menu</p>
          <button
            type="button"
            className="w-full rounded-lg px-2 py-2 text-left text-xs font-extrabold uppercase tracking-[0.12em] text-white/85 hover:bg-white/[0.08]"
            onClick={() => {
              setOwnerPreviewContextMenu(null);
              setOwnerAppearancePanelOpen(true);
            }}
          >
            Appearance
          </button>
        </div>
      )}

      {isOwner && ownerAppearancePanelOpen && (
        <div className="fixed inset-0 z-[570]">
          <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={() => setOwnerAppearancePanelOpen(false)} />
          <div className="absolute inset-x-0 top-[8vh] mx-auto w-full max-w-[660px] rounded-2xl border border-white/15 bg-[#120d19] p-4 shadow-[0_28px_70px_rgba(0,0,0,0.65)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.16em] font-extrabold text-white/55">Owner Preview Controls</p>
                <h3 className="text-xl font-extrabold text-white mt-1">Appearance</h3>
              </div>
              <button onClick={() => setOwnerAppearancePanelOpen(false)} className="g-btn h-8 px-3 text-[10px] uppercase tracking-[0.12em] font-extrabold">
                Close
              </button>
            </div>

            <div className="mt-4 rounded-xl border border-white/12 bg-white/[0.03] p-3">
              <p className="text-[10px] uppercase tracking-[0.14em] font-black text-white/55">Appearance</p>
              <div className="mt-3 space-y-3">
                {PREVIEW_APPEARANCE_SLIDERS.map((slider) => {
                  const value = Number(previewAppearance[slider.key]);
                  return (
                    <div key={slider.key}>
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-white/75">{slider.label}</p>
                        <span className="text-xs font-bold text-white/65">{value.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min={slider.min}
                        max={slider.max}
                        step={slider.step}
                        value={value}
                        onChange={(event) => updatePreviewAppearanceSetting(slider.key, Number(event.target.value))}
                        className="mt-2 w-full accent-[var(--g-accent)]"
                      />
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 flex items-center justify-between">
                <button onClick={handleResetPreviewAppearance} className="g-btn h-9 px-3 text-[10px] uppercase tracking-[0.12em] font-extrabold">
                  Reset
                </button>
                <p className="text-xs text-white/60">{previewAppearanceSaving ? 'Syncing...' : 'Synced live'}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {isOwner && ownerPublishModalOpen && (
        <div className="fixed inset-0 z-[590]">
          <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={() => setOwnerPublishModalOpen(false)} />
          <div className="absolute inset-x-0 top-[8vh] mx-auto w-full max-w-[760px] rounded-2xl border border-white/15 bg-[#120d19] p-4 shadow-[0_28px_70px_rgba(0,0,0,0.65)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.16em] font-extrabold text-white/55">Owner Publish</p>
                <h3 className="text-xl font-extrabold text-white mt-1">Upload Cape To Global Shop</h3>
              </div>
              <button onClick={() => setOwnerPublishModalOpen(false)} className="g-btn h-8 px-3 text-[10px] uppercase tracking-[0.12em] font-extrabold">
                Close
              </button>
            </div>
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2 rounded-lg border border-white/15 bg-white/[0.03] px-3 py-2">
                <p className="text-[10px] font-black uppercase tracking-[0.12em] text-white/55">Rarity Preset</p>
                <select
                  value={ownerRarityPreset}
                  onChange={(event) => applyOwnerRarityPreset(event.target.value)}
                  className="mt-1 h-9 w-full rounded-md border border-white/15 bg-black/35 px-2 text-xs font-bold text-white outline-none"
                >
                  {OWNER_RARITY_PRESETS.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.rarity_label}
                    </option>
                  ))}
                </select>
              </div>
              <input
                value={ownerPublishDraft.slug}
                onChange={(event) => updateOwnerPublishDraft('slug', event.target.value)}
                placeholder="slug (required)"
                className="h-10 rounded-lg border border-white/15 bg-black/35 px-3 text-sm text-white placeholder:text-white/35 outline-none"
              />
              <input
                value={ownerPublishDraft.name}
                onChange={(event) => updateOwnerPublishDraft('name', event.target.value)}
                placeholder="display name (required)"
                className="h-10 rounded-lg border border-white/15 bg-black/35 px-3 text-sm text-white placeholder:text-white/35 outline-none"
              />
              <input
                value={ownerPublishDraft.description}
                onChange={(event) => updateOwnerPublishDraft('description', event.target.value)}
                placeholder="description (optional)"
                className="md:col-span-2 h-10 rounded-lg border border-white/15 bg-black/35 px-3 text-sm text-white placeholder:text-white/35 outline-none"
              />
              <input
                type="number"
                min={0}
                value={ownerPublishDraft.price_bb}
                onChange={(event) => updateOwnerPublishDraft('price_bb', Math.max(0, Number(event.target.value) || 0))}
                placeholder="price_bb"
                className="h-10 rounded-lg border border-white/15 bg-black/35 px-3 text-sm text-white placeholder:text-white/35 outline-none"
              />
              <input
                type="number"
                value={ownerPublishDraft.sort_order}
                onChange={(event) => updateOwnerPublishDraft('sort_order', Number(event.target.value) || 0)}
                placeholder="sort_order"
                className="h-10 rounded-lg border border-white/15 bg-black/35 px-3 text-sm text-white placeholder:text-white/35 outline-none"
              />
              <input
                value={ownerPublishDraft.rarity}
                onChange={(event) => updateOwnerPublishDraft('rarity', event.target.value)}
                placeholder="rarity (e.g. partner/custom/epic)"
                className="h-10 rounded-lg border border-white/15 bg-black/35 px-3 text-sm text-white placeholder:text-white/35 outline-none"
              />
              <input
                value={ownerPublishDraft.rarity_label}
                onChange={(event) => updateOwnerPublishDraft('rarity_label', event.target.value)}
                placeholder="rarity label"
                className="h-10 rounded-lg border border-white/15 bg-black/35 px-3 text-sm text-white placeholder:text-white/35 outline-none"
              />
              <div className="rounded-lg border border-white/15 bg-white/[0.03] px-3 py-2">
                <p className="text-[10px] font-black uppercase tracking-[0.12em] text-white/55">rarity_color_start</p>
                <input
                  type="color"
                  value={ownerPublishDraft.rarity_color_start}
                  onChange={(event) => updateOwnerPublishDraft('rarity_color_start', event.target.value)}
                  className="mt-1 h-8 w-full rounded-md border border-white/15 bg-black/35"
                />
              </div>
              <div className="rounded-lg border border-white/15 bg-white/[0.03] px-3 py-2">
                <p className="text-[10px] font-black uppercase tracking-[0.12em] text-white/55">rarity_color_end</p>
                <input
                  type="color"
                  value={ownerPublishDraft.rarity_color_end}
                  onChange={(event) => updateOwnerPublishDraft('rarity_color_end', event.target.value)}
                  className="mt-1 h-8 w-full rounded-md border border-white/15 bg-black/35"
                />
              </div>
              <input
                value={ownerPublishDraft.rarity_glow}
                onChange={(event) => updateOwnerPublishDraft('rarity_glow', event.target.value)}
                placeholder="rarity_glow (rgba(...))"
                className="md:col-span-2 h-10 rounded-lg border border-white/15 bg-black/35 px-3 text-sm text-white placeholder:text-white/35 outline-none"
              />
              <label className="flex items-center gap-2 rounded-lg border border-white/15 bg-white/[0.03] px-3 py-2 text-xs font-bold text-white/80">
                <input
                  type="checkbox"
                  checked={ownerPublishDraft.is_active}
                  onChange={(event) => updateOwnerPublishDraft('is_active', event.target.checked)}
                />
                is_active
              </label>
              <label className="flex items-center gap-2 rounded-lg border border-white/15 bg-white/[0.03] px-3 py-2 text-xs font-bold text-white/80">
                <input
                  type="checkbox"
                  checked={ownerPublishDraft.is_featured}
                  onChange={(event) => updateOwnerPublishDraft('is_featured', event.target.checked)}
                />
                is_featured
              </label>

              <label className="md:col-span-2 flex items-center gap-2 rounded-lg border border-white/15 bg-white/[0.03] px-3 py-2 text-xs font-bold text-white/80">
                <input type="checkbox" checked={attachPartnerGroup} onChange={(event) => setAttachPartnerGroup(event.target.checked)} />
                Add to partner tab
              </label>

              {attachPartnerGroup && (
                <>
                  <div className="md:col-span-2 rounded-lg border border-white/15 bg-white/[0.03] px-3 py-2">
                    <p className="text-[10px] font-black uppercase tracking-[0.12em] text-white/55">Partner Tab</p>
                    <select
                      value={selectedPartnerGroup}
                      onChange={(event) => setSelectedPartnerGroup(event.target.value)}
                      className="mt-1 h-9 w-full rounded-md border border-white/15 bg-black/35 px-2 text-xs font-bold text-white outline-none"
                    >
                      <option value="">Select partner tab...</option>
                      {partnerGroups.map((group) => (
                        <option key={group.id} value={group.name}>
                          {group.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="md:col-span-2 grid grid-cols-[1fr_auto] gap-2">
                    <input
                      value={newPartnerGroupName}
                      onChange={(event) => setNewPartnerGroupName(event.target.value)}
                      placeholder="new partner tab name"
                      className="h-10 rounded-lg border border-white/15 bg-black/35 px-3 text-sm text-white placeholder:text-white/35 outline-none"
                    />
                    <button
                      onClick={() => {
                        void handleCreateOwnerPartnerGroup();
                      }}
                      disabled={creatingPartnerGroup || !newPartnerGroupName.trim()}
                      className="g-btn h-10 px-3 text-[10px] uppercase tracking-[0.12em] font-extrabold disabled:opacity-45"
                    >
                      {creatingPartnerGroup ? 'Adding...' : 'Add Partner Tab'}
                    </button>
                  </div>
                </>
              )}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setOwnerPublishModalOpen(false)} className="g-btn h-9 px-3 text-[10px] uppercase tracking-[0.12em] font-extrabold">
                Cancel
              </button>
              <button
                onClick={() => {
                  void handleOwnerPublishToShop();
                }}
                disabled={ownerPublishing || !ownerPublishDraft.slug.trim() || !ownerPublishDraft.name.trim()}
                className="g-btn-accent h-9 px-3 text-[10px] uppercase tracking-[0.12em] font-extrabold disabled:opacity-45"
              >
                {ownerPublishing ? 'Publishing...' : 'Publish'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
