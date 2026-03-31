import { useEffect, useMemo, useRef, useState } from 'react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { clsx } from 'clsx';
import { AlertTriangle, Coins, Search, Trash2 } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { COSMETICS_MOD_MENU_EVENT, consumeCosmeticsModMenuRequest } from '../constants/cosmeticsModMenu';
import { CapeMeshRenderer } from '../components/cosmetics/CapeMeshRenderer';
import { MinecraftPlayerPreview } from '../components/cosmetics/MinecraftPlayerPreview';
import {
  createPartnerGroup,
  deleteOwnedCustomCape,
  createPendingCurrencyPurchase,
  ensureCommerceIdentity,
  getSupabaseUserId,
  loadCurrencyPacks,
  loadCurrentLoadout,
  loadOwnedCapes,
  loadPartnerGroups,
  loadRarityPresets,
  loadPreviewAppearance,
  loadShopCapes,
  loadWallet,
  loadWalletLedger,
  purchaseCape,
  setCapeLoadout,
  subscribePartnerGroups,
  subscribeRarityPresets,
  subscribePreviewAppearance,
  subscribeOwnLoadout,
  subscribeOwnWallet,
  upsertPreviewAppearance,
  upsertRarityPreset,
  updateCapeListing,
  DEFAULT_PREVIEW_APPEARANCE,
  type CapeRecord,
  type CommerceProfile,
  type CurrencyPackRecord,
  type OwnedCapeRecord,
  type PartnerGroupRecord,
  type RarityPresetRecord,
  type PreviewAppearanceRecord,
  type UpdateCapeInput,
  type WalletLedgerRecord
} from '../services/cosmetics';

type LockerTab = 'partners' | 'locker' | 'shop' | 'wallet';
type LockerCategory = 'capes';

type DisplayCape = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  partner_group: string | null;
  texture_url: string;
  preview_url: string | null;
  price_bb: number;
  rarity: string;
  rarity_label: string | null;
  rarity_color_start: string | null;
  rarity_color_end: string | null;
  rarity_glow: string | null;
  sort_order: number;
  is_active?: boolean;
  is_featured?: boolean;
  owned: boolean;
};

type PurchaseGuardState = {
  pack: CurrencyPackRecord;
  countdown: number;
  step: 'warning' | 'email';
  email: string;
  saving: boolean;
  error: string | null;
};

type OwnerCapeSqlDraft = {
  slug: string;
  name: string;
  description: string;
  texture_url: string;
  preview_url: string;
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

type OwnerCapeEditDraft = UpdateCapeInput & { id: string };

type OwnerContextMenuState = {
  x: number;
  y: number;
  capeId: string;
};

type TagPreset = {
  id: string;
  name: string;
  rarity: string;
  rarity_label: string;
  rarity_color_start: string;
  rarity_color_end: string;
  rarity_glow: string;
};

type OwnerPreviewContextMenuState = {
  x: number;
  y: number;
};

type DeleteCustomCapeState = {
  cape: DisplayCape;
  confirmText: string;
  busy: boolean;
};

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

const OWNER_MOD_MENU_PASSPHRASE = 'flowers cant bloom without a bee';
const TAG_PRESETS_STORAGE_KEY = 'bloom_cosmetic_tag_presets_v1';
const DEFAULT_OWNER_CAPE_SQL_DRAFT: OwnerCapeSqlDraft = {
  slug: '',
  name: '',
  description: '',
  texture_url: '',
  preview_url: '',
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

function toSqlLiteral(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}

function toSqlOptionalLiteral(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return 'null';
  return toSqlLiteral(trimmed);
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function hexToRgb(hex: string) {
  const clean = hex.replace('#', '').trim();
  if (!/^[0-9a-f]{6}$/i.test(clean)) return null;
  const num = Number.parseInt(clean, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b].map((channel) => Math.max(0, Math.min(255, channel)).toString(16).padStart(2, '0')).join('')}`;
}

function parseColorValue(value: string, withAlpha: boolean) {
  const raw = value.trim();
  const rgba = raw.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([0-9.]+))?\)$/i);
  if (rgba) {
    const r = Math.max(0, Math.min(255, Number(rgba[1]) || 0));
    const g = Math.max(0, Math.min(255, Number(rgba[2]) || 0));
    const b = Math.max(0, Math.min(255, Number(rgba[3]) || 0));
    const a = withAlpha ? clamp01(Number(rgba[4] ?? 1)) : 1;
    return { hex: rgbToHex(r, g, b), alpha: a };
  }
  const shortHex = raw.match(/^#([0-9a-f]{3})$/i);
  if (shortHex) {
    const expanded = `#${shortHex[1].split('').map((char) => `${char}${char}`).join('')}`;
    return { hex: expanded.toLowerCase(), alpha: 1 };
  }
  const longHex = raw.match(/^#([0-9a-f]{6})$/i);
  if (longHex) {
    return { hex: `#${longHex[1].toLowerCase()}`, alpha: 1 };
  }
  return { hex: '#a979ff', alpha: withAlpha ? 0.45 : 1 };
}

type BloomColorInputProps = {
  label: string;
  value: string;
  withAlpha?: boolean;
  onChange: (next: string) => void;
};

function BloomColorInput({ label, value, withAlpha = false, onChange }: BloomColorInputProps) {
  const [open, setOpen] = useState(false);
  const parsed = parseColorValue(value, withAlpha);

  const writeColor = (hex: string, alpha: number) => {
    if (!withAlpha) {
      onChange(hex.toLowerCase());
      return;
    }
    const rgb = hexToRgb(hex) ?? { r: 169, g: 121, b: 255 };
    onChange(`rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${clamp01(alpha).toFixed(2)})`);
  };

  return (
    <div className="relative rounded-lg border border-white/15 bg-white/[0.04] px-3 py-1.5">
      <p className="text-[10px] font-black uppercase tracking-[0.12em] text-white/55">{label}</p>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="mt-1 h-8 w-full rounded-md border border-white/15 bg-black/35 px-2 text-left text-xs text-white/85 inline-flex items-center gap-2"
      >
        <span
          className="h-4 w-4 rounded border border-white/30"
          style={{ background: withAlpha ? value : parsed.hex }}
        />
        <span className="truncate">{value || (withAlpha ? 'rgba(169, 121, 255, 0.45)' : '#a979ff')}</span>
      </button>
      {open && (
        <div className="absolute left-0 top-[calc(100%+6px)] z-[560] w-[260px] rounded-xl border border-white/15 bg-[#120d19] p-3 shadow-[0_22px_45px_rgba(0,0,0,0.55)]">
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-white/60">Color Picker</p>
          <input
            type="color"
            value={parsed.hex}
            onChange={(event) => writeColor(event.target.value, parsed.alpha)}
            className="mt-2 h-10 w-full rounded-lg border border-white/15 bg-white/[0.04]"
          />
          <input
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className="mt-2 h-8 w-full rounded-md border border-white/15 bg-black/35 px-2 text-xs text-white placeholder:text-white/35 outline-none"
            placeholder={withAlpha ? 'rgba(169, 121, 255, 0.45)' : '#a979ff'}
          />
          {withAlpha && (
            <div className="mt-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-[0.12em] text-white/55">Opacity</span>
                <span className="text-[10px] text-white/70">{Math.round(parsed.alpha * 100)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(parsed.alpha * 100)}
                onChange={(event) => writeColor(parsed.hex, Number(event.target.value) / 100)}
                className="mt-1 w-full"
              />
            </div>
          )}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="g-btn mt-2 h-8 w-full text-[10px] font-black uppercase tracking-[0.12em]"
          >
            Done
          </button>
        </div>
      )}
    </div>
  );
}

function pickRarityLabel(cape: DisplayCape) {
  const fallback = normalizeRarityDisplay(cape.rarity || 'Common');
  return (cape.rarity_label?.trim() || fallback).toUpperCase();
}

function pickRarityGradient(cape: DisplayCape, presetsMap: Map<string, RarityPresetRecord>) {
  const preset = presetsMap.get(normalizeRarityDisplay(cape.rarity || 'common'));
  const start = preset?.color_start || cape.rarity_color_start || 'rgba(138, 92, 255, 0.42)';
  const end = preset?.color_end || cape.rarity_color_end || 'rgba(37, 27, 63, 0.92)';
  const glow = preset?.glow || cape.rarity_glow || 'rgba(138, 92, 255, 0.34)';
  return { start, end, glow };
}

function getRaritySortRank(rarityRaw: string) {
  const rarity = normalizeRarityDisplay(rarityRaw);
  const order = ['partner', 'mythic', 'legendary', 'epic', 'rare', 'uncommon', 'common'];
  const idx = order.indexOf(rarity);
  return idx === -1 ? 999 : idx;
}

function toDisplayFromOwned(owned: OwnedCapeRecord): DisplayCape {
  return {
    id: owned.cape_id,
    slug: owned.slug,
    name: owned.name,
    description: owned.description,
    partner_group: owned.partner_group,
    texture_url: owned.texture_url,
    preview_url: owned.preview_url,
    price_bb: 0,
    rarity: owned.rarity,
    rarity_label: owned.rarity_label,
    rarity_color_start: owned.rarity_color_start,
    rarity_color_end: owned.rarity_color_end,
    rarity_glow: owned.rarity_glow,
    sort_order: owned.sort_order,
    is_active: owned.is_active,
    owned: true
  };
}

function normalizeRarityDisplay(value: string) {
  const raw = value.trim();
  if (!raw) return 'common';
  const lower = raw.toLowerCase();
  if (lower === 'parntner') return 'partner';
  return lower;
}

function toDisplayFromShop(shop: CapeRecord, ownedIds: Set<string>): DisplayCape {
  return {
    ...shop,
    owned: ownedIds.has(shop.id)
  };
}

function toOwnerCapeEditDraft(cape: DisplayCape): OwnerCapeEditDraft {
  return {
    id: cape.id,
    slug: cape.slug,
    name: cape.name,
    description: cape.description,
    partner_group: cape.partner_group,
    texture_url: cape.texture_url,
    preview_url: cape.preview_url,
    price_bb: cape.price_bb,
    rarity: cape.rarity,
    rarity_label: cape.rarity_label,
    rarity_color_start: cape.rarity_color_start,
    rarity_color_end: cape.rarity_color_end,
    rarity_glow: cape.rarity_glow,
    sort_order: cape.sort_order,
    is_active: cape.is_active ?? true,
    is_featured: Boolean(cape.is_featured)
  };
}

function formatEntryType(value: string) {
  return value
    .split('_')
    .filter(Boolean)
    .map((token) => token[0].toUpperCase() + token.slice(1))
    .join(' ');
}

function formatUiError(error: unknown) {
  if (error instanceof Error) return error.message || 'unknown_error';
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    const message =
      (typeof record.message === 'string' && record.message) ||
      (typeof record.error === 'string' && record.error) ||
      (typeof record.error_description === 'string' && record.error_description) ||
      null;
    const code = typeof record.code === 'string' ? record.code : null;
    const details = typeof record.details === 'string' ? record.details : null;
    const hint = typeof record.hint === 'string' ? record.hint : null;
    return [message, code, details, hint].filter(Boolean).join(' | ') || JSON.stringify(record);
  }
  return String(error);
}

function normalizePreviewAppearance(value: PreviewAppearanceRecord): PreviewAppearanceRecord {
  return {
    ...value,
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
    )
  };
}

export function CosmeticLocker() {
  const { authState, startLogin } = useAuth();
  const [activeTab, setActiveTab] = useState<LockerTab>('locker');
  const [activeCategory, setActiveCategory] = useState<LockerCategory>('capes');
  const [selectedPartnerGroup, setSelectedPartnerGroup] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [rarityFilter, setRarityFilter] = useState<string | null>(null);
  const [shopCapes, setShopCapes] = useState<CapeRecord[]>([]);
  const [partnerGroupRecords, setPartnerGroupRecords] = useState<PartnerGroupRecord[]>([]);
  const [ownedCapes, setOwnedCapes] = useState<OwnedCapeRecord[]>([]);
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [walletLedger, setWalletLedger] = useState<WalletLedgerRecord[]>([]);
  const [currencyPacks, setCurrencyPacks] = useState<CurrencyPackRecord[]>([]);
  const [equippedCapeId, setEquippedCapeId] = useState<string | null>(null);
  const [selectedCapeId, setSelectedCapeId] = useState<string | null>(null);
  const [approvedByPack, setApprovedByPack] = useState<Record<string, { email: string; expiresAt: string; pendingId: string }>>({});
  const [guardState, setGuardState] = useState<PurchaseGuardState | null>(null);
  const [loading, setLoading] = useState(true);
  const [shopLoading, setShopLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [supabaseUserId, setSupabaseUserId] = useState<string | null>(null);
  const [commerceProfile, setCommerceProfile] = useState<CommerceProfile | null>(null);
  const [ownerPassphraseInput, setOwnerPassphraseInput] = useState('');
  const [ownerUnlocked, setOwnerUnlocked] = useState(false);
  const [ownerUnlockError, setOwnerUnlockError] = useState<string | null>(null);
  const [modMenuOpen, setModMenuOpen] = useState(false);
  const [pendingModMenuRequest, setPendingModMenuRequest] = useState(false);
  const [activeModTool, setActiveModTool] = useState<'cape-sql' | 'rarity-presets'>('cape-sql');
  const [capeSqlDraft, setCapeSqlDraft] = useState<OwnerCapeSqlDraft>(DEFAULT_OWNER_CAPE_SQL_DRAFT);
  const [capeSqlCopied, setCapeSqlCopied] = useState(false);
  const [ownerContextMenu, setOwnerContextMenu] = useState<OwnerContextMenuState | null>(null);
  const [ownerPreviewContextMenu, setOwnerPreviewContextMenu] = useState<OwnerPreviewContextMenuState | null>(null);
  const [ownerAppearancePanelOpen, setOwnerAppearancePanelOpen] = useState(false);
  const [deleteCustomCapeState, setDeleteCustomCapeState] = useState<DeleteCustomCapeState | null>(null);
  const [ownerCapeEditor, setOwnerCapeEditor] = useState<OwnerCapeEditDraft | null>(null);
  const [ownerEditSaving, setOwnerEditSaving] = useState(false);
  const [tagPresets, setTagPresets] = useState<TagPreset[]>([]);
  const [tagPresetNameInput, setTagPresetNameInput] = useState('');
  const [newPartnerGroupInput, setNewPartnerGroupInput] = useState('');
  const [creatingPartnerGroup, setCreatingPartnerGroup] = useState(false);
  const [previewAppearance, setPreviewAppearance] = useState<PreviewAppearanceRecord>(DEFAULT_PREVIEW_APPEARANCE);
  const [previewAppearanceSaving, setPreviewAppearanceSaving] = useState(false);
  const [rarityPresets, setRarityPresets] = useState<RarityPresetRecord[]>([]);
  const [rarityPresetSaving, setRarityPresetSaving] = useState<string | null>(null);
  const previewAppearanceWriteTimerRef = useRef<number | null>(null);

  const ownedIds = useMemo(() => new Set(ownedCapes.map((cape) => cape.cape_id)), [ownedCapes]);
  const ownedDisplay = useMemo(() => ownedCapes.map((cape) => toDisplayFromOwned(cape)), [ownedCapes]);
  const shopDisplay = useMemo(() => shopCapes.map((cape) => toDisplayFromShop(cape, ownedIds)), [shopCapes, ownedIds]);
  const ownerEditableCapes = useMemo(() => {
    const map = new Map<string, DisplayCape>();
    for (const cape of shopDisplay) map.set(cape.id, cape);
    for (const cape of ownedDisplay) {
      if (!map.has(cape.id)) map.set(cape.id, cape);
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [ownedDisplay, shopDisplay]);

  const lockerList = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const base = ownedDisplay.filter((cape) => {
      if (rarityFilter && cape.rarity.toLowerCase() !== rarityFilter.toLowerCase()) return false;
      if (!q) return true;
      return `${cape.name} ${cape.slug}`.toLowerCase().includes(q);
    });
    if (rarityFilter !== null) return base;
    return [...base].sort((a, b) => {
      const rarityRank = getRaritySortRank(a.rarity) - getRaritySortRank(b.rarity);
      if (rarityRank !== 0) return rarityRank;
      const sortRank = (a.sort_order || 0) - (b.sort_order || 0);
      if (sortRank !== 0) return sortRank;
      return a.name.localeCompare(b.name);
    });
  }, [ownedDisplay, rarityFilter, searchQuery]);

  const shopList = useMemo(() => {
    const base = [...shopDisplay];
    if (rarityFilter !== null) return base;
    return base.sort((a, b) => {
      const rarityRank = getRaritySortRank(a.rarity) - getRaritySortRank(b.rarity);
      if (rarityRank !== 0) return rarityRank;
      const sortRank = (a.sort_order || 0) - (b.sort_order || 0);
      if (sortRank !== 0) return sortRank;
      return a.name.localeCompare(b.name);
    });
  }, [rarityFilter, shopDisplay]);

  const rarityPresetsMap = useMemo(
    () => new Map(rarityPresets.map((preset) => [normalizeRarityDisplay(preset.rarity), preset])),
    [rarityPresets]
  );

  const partnerGroups = useMemo(() => {
    const values = partnerGroupRecords.map((group) => group.name.trim()).filter(Boolean);
    values.sort((a, b) => a.localeCompare(b));
    return values;
  }, [partnerGroupRecords]);

  const partnersList = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return shopDisplay.filter((cape) => {
      const group = (cape.partner_group || '').trim();
      if (!group) return false;
      if (selectedPartnerGroup !== 'all' && group.toLowerCase() !== selectedPartnerGroup.toLowerCase()) {
        return false;
      }
      if (!q) return true;
      return `${cape.name} ${cape.slug}`.toLowerCase().includes(q);
    });
  }, [searchQuery, selectedPartnerGroup, shopDisplay]);

  useEffect(() => {
    if (selectedPartnerGroup === 'all') return;
    const exists = partnerGroups.some((group) => group.toLowerCase() === selectedPartnerGroup.toLowerCase());
    if (!exists) setSelectedPartnerGroup('all');
  }, [partnerGroups, selectedPartnerGroup]);

  const activeList = activeTab === 'locker' ? lockerList : activeTab === 'shop' ? shopList : activeTab === 'partners' ? partnersList : [];
  const selectedCape = useMemo(
    () => [...shopDisplay, ...ownedDisplay].find((cape) => cape.id === selectedCapeId) ?? null,
    [ownedDisplay, selectedCapeId, shopDisplay]
  );

  const rarityOptions = useMemo(() => {
    const base = activeTab === 'locker' ? lockerList : shopDisplay;
    const values = Array.from(new Set(base.map((cape) => cape.rarity.toLowerCase())));
    values.sort((a, b) => {
      const rarityRank = getRaritySortRank(a) - getRaritySortRank(b);
      if (rarityRank !== 0) return rarityRank;
      return a.localeCompare(b);
    });
    return values;
  }, [activeTab, lockerList, shopDisplay]);

  const rarityPresetEditorRows = useMemo(() => {
    const ordered = ['partner', 'mythic', 'legendary', 'epic', 'rare', 'uncommon', 'common'];
    const mapped = new Map(rarityPresets.map((preset) => [normalizeRarityDisplay(preset.rarity), preset]));
    const rows: RarityPresetRecord[] = ordered.map((rarity, index) => {
      const existing = mapped.get(rarity);
      if (existing) return existing;
      return {
        id: `draft-${rarity}`,
        rarity,
        rarity_label: rarity[0].toUpperCase() + rarity.slice(1),
        color_start: '#a979ff',
        color_end: '#3a1f68',
        glow: 'rgba(169, 121, 255, 0.45)',
        sort_order: index,
        is_active: true,
        updated_at: new Date(0).toISOString()
      };
    });
    for (const preset of rarityPresets) {
      const normalized = normalizeRarityDisplay(preset.rarity);
      if (ordered.includes(normalized)) continue;
      rows.push(preset);
    }
    return rows;
  }, [rarityPresets]);
  const isOwner = commerceProfile?.role === 'owner';
  const capeSqlReady =
    capeSqlDraft.slug.trim().length > 0 &&
    capeSqlDraft.name.trim().length > 0 &&
    capeSqlDraft.texture_url.trim().length > 0;
  const generatedCapeSql = useMemo(() => {
    const slug = capeSqlDraft.slug.trim().toLowerCase();
    const rarity = capeSqlDraft.rarity.trim().toLowerCase();
    const price = Number.isFinite(capeSqlDraft.price_bb) ? Math.max(0, Math.round(capeSqlDraft.price_bb)) : 0;
    const sortOrder = Number.isFinite(capeSqlDraft.sort_order) ? Math.round(capeSqlDraft.sort_order) : 0;
    return [
      'select public.create_cape_listing(',
      `  p_slug := ${toSqlLiteral(slug)},`,
      `  p_name := ${toSqlLiteral(capeSqlDraft.name.trim())},`,
      `  p_description := ${toSqlOptionalLiteral(capeSqlDraft.description)},`,
      `  p_texture_url := ${toSqlLiteral(capeSqlDraft.texture_url.trim())},`,
      `  p_preview_url := ${toSqlOptionalLiteral(capeSqlDraft.preview_url)},`,
      `  p_price_bb := ${price},`,
      `  p_rarity := ${toSqlLiteral(rarity || 'common')},`,
      `  p_rarity_label := ${toSqlOptionalLiteral(capeSqlDraft.rarity_label)},`,
      `  p_rarity_color_start := ${toSqlOptionalLiteral(capeSqlDraft.rarity_color_start)},`,
      `  p_rarity_color_end := ${toSqlOptionalLiteral(capeSqlDraft.rarity_color_end)},`,
      `  p_rarity_glow := ${toSqlOptionalLiteral(capeSqlDraft.rarity_glow)},`,
      `  p_sort_order := ${sortOrder},`,
      `  p_is_active := ${capeSqlDraft.is_active ? 'true' : 'false'},`,
      `  p_is_featured := ${capeSqlDraft.is_featured ? 'true' : 'false'}`,
      ');'
    ].join('\n');
  }, [capeSqlDraft]);

  useEffect(() => {
    if (isOwner) return;
    setOwnerUnlocked(false);
    setOwnerPassphraseInput('');
    setOwnerUnlockError(null);
    setModMenuOpen(false);
    setPendingModMenuRequest(false);
    setActiveModTool('cape-sql');
    setOwnerContextMenu(null);
    setOwnerPreviewContextMenu(null);
    setOwnerAppearancePanelOpen(false);
  }, [isOwner]);

  useEffect(() => {
    const onOpenRequest = () => {
      setPendingModMenuRequest(true);
    };

    window.addEventListener(COSMETICS_MOD_MENU_EVENT, onOpenRequest as EventListener);
    if (consumeCosmeticsModMenuRequest()) {
      setPendingModMenuRequest(true);
    }
    return () => {
      window.removeEventListener(COSMETICS_MOD_MENU_EVENT, onOpenRequest as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!pendingModMenuRequest) return;
    if (loading) return;
    if (!isOwner) {
      setErrorMessage('owner_role_required');
      setPendingModMenuRequest(false);
      return;
    }
    setOwnerUnlocked(false);
    setOwnerPassphraseInput('');
    setOwnerUnlockError(null);
    setActiveModTool('cape-sql');
    setModMenuOpen(true);
    setPendingModMenuRequest(false);
  }, [isOwner, loading, pendingModMenuRequest]);

  useEffect(() => {
    setCapeSqlCopied(false);
  }, [generatedCapeSql]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(TAG_PRESETS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as TagPreset[];
      if (!Array.isArray(parsed)) return;
      setTagPresets(
        parsed.filter(
          (preset) =>
            typeof preset?.id === 'string' &&
            typeof preset?.name === 'string' &&
            typeof preset?.rarity === 'string' &&
            typeof preset?.rarity_label === 'string' &&
            typeof preset?.rarity_color_start === 'string' &&
            typeof preset?.rarity_color_end === 'string' &&
            typeof preset?.rarity_glow === 'string'
        )
      );
    } catch {
      // ignore invalid local preset payload
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(TAG_PRESETS_STORAGE_KEY, JSON.stringify(tagPresets));
    } catch {
      // best effort local persistence
    }
  }, [tagPresets]);

  useEffect(() => {
    if (!ownerContextMenu) return;
    const close = () => setOwnerContextMenu(null);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [ownerContextMenu]);

  useEffect(() => {
    if (!ownerPreviewContextMenu) return;
    const close = () => setOwnerPreviewContextMenu(null);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [ownerPreviewContextMenu]);

  useEffect(() => {
    if (!selectedCapeId) {
      const preferred = equippedCapeId
        ? [...shopDisplay, ...ownedDisplay].find((cape) => cape.id === equippedCapeId)
        : null;
      const fallback = preferred ?? activeList[0] ?? shopDisplay[0] ?? ownedDisplay[0] ?? null;
      if (fallback) setSelectedCapeId(fallback.id);
      return;
    }
    const exists = [...shopDisplay, ...ownedDisplay].some((cape) => cape.id === selectedCapeId);
    if (!exists) {
      const fallback = activeList[0] ?? shopDisplay[0] ?? ownedDisplay[0] ?? null;
      setSelectedCapeId(fallback?.id ?? null);
    }
  }, [activeList, equippedCapeId, ownedDisplay, selectedCapeId, shopDisplay]);

  useEffect(() => {
    if (!guardState || guardState.step !== 'warning' || guardState.countdown <= 0) return;
    const timer = window.setInterval(() => {
      setGuardState((current) => {
        if (!current || current.step !== 'warning') return current;
        if (current.countdown <= 1) return { ...current, countdown: 0 };
        return { ...current, countdown: current.countdown - 1 };
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [guardState]);

  const bootstrap = async () => {
    if (!authState) return;
    setLoading(true);
    setErrorMessage(null);
    try {
      const profile = await ensureCommerceIdentity(authState.profile.id, authState.profile.name, authState.profile.name);
      const [shopData, ownedData, loadoutData, walletData, ledgerData, packsData, userId, appearance, groups, presetRows] = await Promise.all([
        loadShopCapes(searchQuery, rarityFilter),
        loadOwnedCapes(),
        loadCurrentLoadout(),
        loadWallet(),
        loadWalletLedger(25),
        loadCurrencyPacks(),
        getSupabaseUserId(),
        loadPreviewAppearance(),
        loadPartnerGroups(),
        loadRarityPresets()
      ]);

      setCommerceProfile(profile);
      setShopCapes(shopData);
      setOwnedCapes(ownedData);
      setEquippedCapeId(loadoutData?.equipped_cape_id ?? null);
      setWalletBalance(walletData?.balance_bb ?? 0);
      setWalletLedger(ledgerData);
      setCurrencyPacks(packsData);
      setSupabaseUserId(userId);
      setPreviewAppearance(normalizePreviewAppearance(appearance));
      setPartnerGroupRecords(groups);
      setRarityPresets(presetRows);
      setStatusMessage(null);
    } catch (error) {
      setCommerceProfile(null);
      setErrorMessage(formatUiError(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authState?.profile.id]);

  useEffect(() => {
    if (!authState || activeTab !== 'shop') return;
    let cancelled = false;
    setShopLoading(true);
    void loadShopCapes(searchQuery, rarityFilter)
      .then((data) => {
        if (!cancelled) setShopCapes(data);
      })
      .catch((error) => {
        if (!cancelled) setErrorMessage(formatUiError(error));
      })
      .finally(() => {
        if (!cancelled) setShopLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeTab, authState, rarityFilter, searchQuery]);

  useEffect(() => {
    if (!authState || activeTab !== 'partners') return;
    let cancelled = false;
    setShopLoading(true);
    void loadShopCapes('', null)
      .then((data) => {
        if (!cancelled) setShopCapes(data);
      })
      .catch((error) => {
        if (!cancelled) setErrorMessage(formatUiError(error));
      })
      .finally(() => {
        if (!cancelled) setShopLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeTab, authState]);

  useEffect(() => {
    if (!authState || activeTab !== 'wallet') return;
    let cancelled = false;
    void loadCurrencyPacks()
      .then((packs) => {
        if (!cancelled) setCurrencyPacks(packs);
      })
      .catch((error) => {
        if (!cancelled) setErrorMessage(formatUiError(error));
      });
    return () => {
      cancelled = true;
    };
  }, [activeTab, authState]);

  useEffect(() => {
    if (!authState) return;
    let cancelled = false;
    const syncGroups = () => {
      void loadPartnerGroups()
        .then((groups) => {
          if (cancelled) return;
          setPartnerGroupRecords(groups);
        })
        .catch((error) => {
          if (cancelled) return;
          setErrorMessage(formatUiError(error));
        });
    };
    syncGroups();
    const unsubscribe = subscribePartnerGroups(syncGroups);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [authState]);

  useEffect(() => {
    const syncPresets = () => {
      void loadRarityPresets()
        .then((rows) => setRarityPresets(rows))
        .catch(() => {});
    };
    syncPresets();
    const unsubscribe = subscribeRarityPresets(syncPresets);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!supabaseUserId) return;
    const unsubscribeLoadout = subscribeOwnLoadout(supabaseUserId, () => {
      void loadCurrentLoadout()
        .then((data) => setEquippedCapeId(data?.equipped_cape_id ?? null))
        .catch(() => {});
    });
    const unsubscribeWallet = subscribeOwnWallet(supabaseUserId, () => {
      void Promise.all([loadWallet(), loadWalletLedger(25)])
        .then(([wallet, ledger]) => {
          setWalletBalance(wallet?.balance_bb ?? 0);
          setWalletLedger(ledger);
          setStatusMessage('Wallet updated from live sync.');
        })
        .catch(() => {});
    });

    return () => {
      unsubscribeLoadout();
      unsubscribeWallet();
    };
  }, [supabaseUserId]);

  useEffect(() => {
    if (!authState) return;
    let cancelled = false;
    const syncAppearance = () => {
      void loadPreviewAppearance()
        .then((data) => {
          if (cancelled) return;
          setPreviewAppearance(normalizePreviewAppearance(data));
        })
        .catch((error) => {
          if (cancelled) return;
          setErrorMessage(formatUiError(error));
        });
    };
    syncAppearance();
    const unsubscribe = subscribePreviewAppearance(syncAppearance);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [authState]);

  useEffect(
    () => () => {
      if (previewAppearanceWriteTimerRef.current !== null) {
        window.clearTimeout(previewAppearanceWriteTimerRef.current);
        previewAppearanceWriteTimerRef.current = null;
      }
    },
    []
  );

  const handleBuy = async () => {
    if (!selectedCape || selectedCape.owned) return;
    setActionBusy(true);
    setErrorMessage(null);
    try {
      await purchaseCape(selectedCape.slug, false);
      const [ownedData, walletData, ledgerData, loadoutData] = await Promise.all([
        loadOwnedCapes(),
        loadWallet(),
        loadWalletLedger(25),
        loadCurrentLoadout()
      ]);
      setOwnedCapes(ownedData);
      setWalletBalance(walletData?.balance_bb ?? 0);
      setWalletLedger(ledgerData);
      setEquippedCapeId(loadoutData?.equipped_cape_id ?? null);
      setStatusMessage(`${selectedCape.name} purchased.`);
      if (activeTab !== 'locker') setActiveTab('locker');
    } catch (error) {
      setErrorMessage(formatUiError(error));
    } finally {
      setActionBusy(false);
    }
  };

  const handleBuyCape = async (cape: DisplayCape) => {
    if (cape.owned) return;
    setActionBusy(true);
    setErrorMessage(null);
    try {
      await purchaseCape(cape.slug, false);
      const [ownedData, walletData, ledgerData, loadoutData] = await Promise.all([
        loadOwnedCapes(),
        loadWallet(),
        loadWalletLedger(25),
        loadCurrentLoadout()
      ]);
      setOwnedCapes(ownedData);
      setWalletBalance(walletData?.balance_bb ?? 0);
      setWalletLedger(ledgerData);
      setEquippedCapeId(loadoutData?.equipped_cape_id ?? null);
      setSelectedCapeId(cape.id);
      setStatusMessage(`${cape.name} purchased.`);
      if (activeTab !== 'locker') setActiveTab('locker');
    } catch (error) {
      setErrorMessage(formatUiError(error));
    } finally {
      setActionBusy(false);
    }
  };

  const handleEquip = async () => {
    if (!selectedCape) return;
    if (!selectedCape.owned) return;
    setActionBusy(true);
    setErrorMessage(null);
    try {
      await setCapeLoadout(selectedCape.slug);
      const authoritative = await loadCurrentLoadout();
      const equippedId = authoritative?.equipped_cape_id ?? null;
      setEquippedCapeId(equippedId);
      if (equippedId !== selectedCape.id) {
        throw new Error('Equip did not persist on server. Check set_cape_loadout SQL function.');
      }
      setStatusMessage(`${selectedCape.name} equipped.`);
    } catch (error) {
      setErrorMessage(formatUiError(error));
    } finally {
      setActionBusy(false);
    }
  };

  const handleUnequip = async () => {
    setActionBusy(true);
    setErrorMessage(null);
    try {
      await setCapeLoadout(null);
      const authoritative = await loadCurrentLoadout();
      setEquippedCapeId(authoritative?.equipped_cape_id ?? null);
      setStatusMessage('Cape unequipped.');
    } catch (error) {
      setErrorMessage(formatUiError(error));
    } finally {
      setActionBusy(false);
    }
  };

  const handleDeleteCustomCape = async () => {
    if (!deleteCustomCapeState) return;
    setDeleteCustomCapeState((current) => (current ? { ...current, busy: true } : current));
    try {
      await deleteOwnedCustomCape(deleteCustomCapeState.cape.id);
      const [ownedData, loadoutData] = await Promise.all([loadOwnedCapes(), loadCurrentLoadout()]);
      setOwnedCapes(ownedData);
      setEquippedCapeId(loadoutData?.equipped_cape_id ?? null);
      const nextSelected =
        selectedCapeId === deleteCustomCapeState.cape.id
          ? (ownedData[0]?.cape_id ?? shopDisplay[0]?.id ?? null)
          : selectedCapeId;
      setSelectedCapeId(nextSelected);
      setDeleteCustomCapeState(null);
      setStatusMessage(`${deleteCustomCapeState.cape.name} deleted.`);
    } catch (error) {
      setDeleteCustomCapeState((current) => (current ? { ...current, busy: false } : current));
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const openGuardForPack = (pack: CurrencyPackRecord) => {
    setGuardState({
      pack,
      countdown: 10,
      step: 'warning',
      email: '',
      saving: false,
      error: null
    });
  };

  const closeGuard = () => {
    if (guardState?.step === 'warning' && guardState.countdown > 0) return;
    setGuardState(null);
  };

  const handleConfirmPending = async () => {
    if (!guardState) return;
    const email = guardState.email.trim().toLowerCase();
    if (!email) {
      setGuardState({ ...guardState, error: 'Enter the exact Ko-fi checkout email.' });
      return;
    }
    setGuardState({ ...guardState, saving: true, error: null });
    try {
      const pending = await createPendingCurrencyPurchase(email, guardState.pack.slug, 1800);
      if (!pending) throw new Error('Failed to create pending purchase.');
      setApprovedByPack((current) => ({
        ...current,
        [guardState.pack.slug]: {
          email,
          expiresAt: pending.expires_at,
          pendingId: pending.id
        }
      }));
      setStatusMessage(`Pending purchase saved for ${email}. Continue with Ko-fi checkout.`);
      setGuardState(null);
    } catch (error) {
      setGuardState((current) =>
        current
          ? { ...current, saving: false, error: formatUiError(error) }
          : current
      );
    }
  };

  const handleOpenKofi = async (pack: CurrencyPackRecord) => {
    const approved = approvedByPack[pack.slug];
    if (!approved) {
      openGuardForPack(pack);
      return;
    }
    try {
      await openUrl(pack.kofi_url);
    } catch {
      window.open(pack.kofi_url, '_blank', 'noopener,noreferrer');
    }
  };

  const handleCreateKofiAccount = async () => {
    try {
      await openUrl('https://ko-fi.com/');
    } catch {
      window.open('https://ko-fi.com/', '_blank', 'noopener,noreferrer');
    }
  };

  const updateCapeSqlDraft = <K extends keyof OwnerCapeSqlDraft>(key: K, value: OwnerCapeSqlDraft[K]) => {
    setCapeSqlDraft((current) => ({ ...current, [key]: value }));
  };

  const handleUnlockOwnerMenu = () => {
    if (!isOwner) return;
    if (ownerPassphraseInput.trim().toLowerCase() !== OWNER_MOD_MENU_PASSPHRASE) {
      setOwnerUnlockError('Incorrect owner passphrase.');
      return;
    }
    setOwnerUnlockError(null);
    setOwnerPassphraseInput('');
    setOwnerUnlocked(true);
    setStatusMessage('Owner Mod Menu unlocked for this session.');
  };

  const closeModMenu = () => {
    setModMenuOpen(false);
    setOwnerUnlocked(false);
    setOwnerPassphraseInput('');
    setOwnerUnlockError(null);
    setActiveModTool('cape-sql');
    setOwnerAppearancePanelOpen(false);
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
          setErrorMessage(formatUiError(error));
        })
        .finally(() => {
          setPreviewAppearanceSaving(false);
          previewAppearanceWriteTimerRef.current = null;
        });
    }, 140);
  };

  const updatePreviewAppearanceSetting = (key: PreviewAppearanceKey, raw: number) => {
    setPreviewAppearance((current) => {
      const slider = PREVIEW_APPEARANCE_SLIDERS.find((item) => item.key === key);
      if (!slider) return current;
      const next = normalizePreviewAppearance({
        ...current,
        [key]: clampNumber(raw, slider.min, slider.max)
      });
      queuePreviewAppearanceSync(next);
      return next;
    });
  };

  const handleResetPreviewAppearance = () => {
    const next = normalizePreviewAppearance(DEFAULT_PREVIEW_APPEARANCE);
    setPreviewAppearance(next);
    queuePreviewAppearanceSync(next);
  };

  const handleCopyCapeSql = async () => {
    if (!capeSqlReady) {
      setErrorMessage('Cape SQL requires slug, name, and texture URL.');
      return;
    }
    try {
      await navigator.clipboard.writeText(generatedCapeSql);
      setCapeSqlCopied(true);
      setStatusMessage('Cape SQL copied to clipboard.');
    } catch {
      setErrorMessage('Failed to copy SQL. Copy it manually from the text area.');
    }
  };

  const updateOwnerEditor = <K extends keyof OwnerCapeEditDraft>(key: K, value: OwnerCapeEditDraft[K]) => {
    setOwnerCapeEditor((current) => (current ? { ...current, [key]: value } : current));
  };

  const selectOwnerCapeEditorCape = (capeId: string) => {
    const target = shopDisplay.find((cape) => cape.id === capeId) ?? ownedDisplay.find((cape) => cape.id === capeId) ?? null;
    if (!target) return;
    setOwnerCapeEditor(toOwnerCapeEditDraft(target));
  };

  const openOwnerCapeEditor = (capeId: string) => {
    setOwnerContextMenu(null);
    selectOwnerCapeEditorCape(capeId);
  };

  const applyTagPreset = (preset: TagPreset) => {
    setOwnerCapeEditor((current) =>
      current
        ? {
            ...current,
            rarity: preset.rarity,
            rarity_label: preset.rarity_label,
            rarity_color_start: preset.rarity_color_start,
            rarity_color_end: preset.rarity_color_end,
            rarity_glow: preset.rarity_glow
          }
        : current
    );
  };

  const handleSaveTagPreset = () => {
    if (!ownerCapeEditor) return;
    const name = tagPresetNameInput.trim() || ownerCapeEditor.rarity_label?.trim() || ownerCapeEditor.rarity.trim() || 'Tag Preset';
    const preset: TagPreset = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      rarity: ownerCapeEditor.rarity.trim().toLowerCase() || 'common',
      rarity_label: ownerCapeEditor.rarity_label?.trim() || ownerCapeEditor.rarity.trim() || 'Common',
      rarity_color_start: ownerCapeEditor.rarity_color_start?.trim() || '#a979ff',
      rarity_color_end: ownerCapeEditor.rarity_color_end?.trim() || '#3a1f68',
      rarity_glow: ownerCapeEditor.rarity_glow?.trim() || 'rgba(169, 121, 255, 0.45)'
    };
    setTagPresets((current) => [preset, ...current.filter((entry) => entry.name.toLowerCase() !== preset.name.toLowerCase())]);
    setTagPresetNameInput('');
    setStatusMessage(`Tag preset saved: ${preset.name}`);
  };

  const handleDeleteTagPreset = (presetId: string) => {
    setTagPresets((current) => current.filter((preset) => preset.id !== presetId));
  };

  const handleCreatePartnerGroup = async () => {
    if (!isOwner) return;
    const name = newPartnerGroupInput.trim();
    if (!name) return;
    setCreatingPartnerGroup(true);
    setErrorMessage(null);
    try {
      const created = await createPartnerGroup(name);
      setStatusMessage(`Partner group created: ${created.name}`);
      setNewPartnerGroupInput('');
      setSelectedPartnerGroup(created.name);
    } catch (error) {
      setErrorMessage(formatUiError(error));
    } finally {
      setCreatingPartnerGroup(false);
    }
  };

  const handleSaveOwnerCapeEditor = async () => {
    if (!ownerCapeEditor) return;
    setOwnerEditSaving(true);
    setErrorMessage(null);
    try {
      const updatedCape = await updateCapeListing(ownerCapeEditor.id, {
        slug: ownerCapeEditor.slug.trim().toLowerCase(),
        name: ownerCapeEditor.name.trim(),
        description: ownerCapeEditor.description?.trim() || null,
        partner_group: ownerCapeEditor.partner_group?.trim() || null,
        texture_url: ownerCapeEditor.texture_url.trim(),
        preview_url: ownerCapeEditor.preview_url?.trim() || null,
        price_bb: Math.max(0, Number(ownerCapeEditor.price_bb) || 0),
        rarity: ownerCapeEditor.rarity.trim().toLowerCase(),
        rarity_label: ownerCapeEditor.rarity_label?.trim() || null,
        rarity_color_start: ownerCapeEditor.rarity_color_start?.trim() || null,
        rarity_color_end: ownerCapeEditor.rarity_color_end?.trim() || null,
        rarity_glow: ownerCapeEditor.rarity_glow?.trim() || null,
        sort_order: Number(ownerCapeEditor.sort_order) || 0,
        is_active: ownerCapeEditor.is_active,
        is_featured: ownerCapeEditor.is_featured
      });
      const refreshed = await loadShopCapes(searchQuery, rarityFilter);
      setShopCapes(refreshed);
      setStatusMessage(`Cape updated: ${ownerCapeEditor.name}`);
      setOwnerCapeEditor({
        id: updatedCape.id,
        slug: updatedCape.slug,
        name: updatedCape.name,
        description: updatedCape.description,
        partner_group: updatedCape.partner_group,
        texture_url: updatedCape.texture_url,
        preview_url: updatedCape.preview_url,
        price_bb: updatedCape.price_bb,
        rarity: updatedCape.rarity,
        rarity_label: updatedCape.rarity_label,
        rarity_color_start: updatedCape.rarity_color_start,
        rarity_color_end: updatedCape.rarity_color_end,
        rarity_glow: updatedCape.rarity_glow,
        sort_order: updatedCape.sort_order,
        is_active: updatedCape.is_active,
        is_featured: updatedCape.is_featured
      });
    } catch (error) {
      setErrorMessage(formatUiError(error));
    } finally {
      setOwnerEditSaving(false);
    }
  };

  const handleSaveRarityPreset = async (preset: RarityPresetRecord) => {
    setRarityPresetSaving(preset.rarity);
    setErrorMessage(null);
    try {
      await upsertRarityPreset({
        rarity: preset.rarity,
        rarity_label: preset.rarity_label,
        color_start: preset.color_start,
        color_end: preset.color_end,
        glow: preset.glow,
        sort_order: preset.sort_order,
        is_active: preset.is_active
      });
      const next = await loadRarityPresets();
      setRarityPresets(next);
      setStatusMessage(`Rarity preset synced: ${preset.rarity}`);
    } catch (error) {
      setErrorMessage(formatUiError(error));
    } finally {
      setRarityPresetSaving(null);
    }
  };

  if (!authState) {
    return (
      <div className="max-w-[1180px] mx-auto min-h-full py-6">
        <section className="g-panel p-6">
          <p className="text-[10px] uppercase tracking-[0.14em] font-extrabold text-white/55">Cosmetic Locker</p>
          <h1 className="mt-2 text-3xl font-extrabold text-white">Sign in to use Bloom Cosmetics</h1>
          <p className="mt-2 text-sm text-white/65">Connect your Microsoft account first so Bloom can sync your cosmetics inventory and wallet.</p>
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

  const selectedOwned = selectedCape ? ownedIds.has(selectedCape.id) : false;
  const selectedEquipped = selectedCape ? selectedCape.id === equippedCapeId : false;

  return (
    <div className="max-w-[1280px] mx-auto h-[calc(100vh-92px)] py-6 space-y-4 overflow-hidden flex flex-col">
      <section className="g-panel p-4 grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] items-center gap-3">
        <div className="lg:justify-self-start">
          <p className="text-[10px] uppercase tracking-[0.16em] font-extrabold text-white/55">Bloom Cosmetics</p>
          <h1 className="text-2xl font-extrabold text-white mt-1">Cosmetic Locker</h1>
        </div>
        <div className="flex items-center justify-start lg:justify-center gap-2">
          {(['partners', 'locker', 'shop', 'wallet'] as LockerTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={clsx(
                'h-10 rounded-xl border px-4 text-[11px] font-extrabold uppercase tracking-[0.12em] transition',
                activeTab === tab ? 'g-btn-accent' : 'border-white/10 bg-white/[0.03] text-white/75 hover:bg-white/[0.06]'
              )}
            >
              {tab}
            </button>
          ))}
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

      {activeTab === 'wallet' && selectedCape && (
        <div className="fixed left-[-9999px] top-[-9999px] h-px w-px overflow-hidden opacity-0 pointer-events-none" aria-hidden>
          <MinecraftPlayerPreview
            playerUuid={authState?.profile.id ?? null}
            playerName={authState?.profile.name ?? 'Player'}
            playerSkinUrl={authState?.profile.skinUrl ?? null}
            capeSlug={selectedCape.slug}
            capeTextureUrl={selectedCape.texture_url}
            appearance={previewAppearance}
            className="h-[320px] w-[240px]"
          />
        </div>
      )}

      {activeTab === 'wallet' ? (
        <section className="g-panel p-5 space-y-4 min-h-0 overflow-y-auto">
          <div className="rounded-2xl border border-white/10 bg-[linear-gradient(120deg,rgba(142,97,255,0.2),rgba(255,255,255,0.04))] p-5">
            <p className="text-[10px] uppercase tracking-[0.16em] font-extrabold text-white/55">Bloom Bucks Balance</p>
            <div className="mt-2 flex items-center gap-3">
              <div className="h-12 w-12 rounded-xl border border-white/15 bg-white/[0.04] flex items-center justify-center">
                <Coins size={22} className="text-white/85" />
              </div>
              <p className="text-4xl font-extrabold text-white">{walletBalance.toLocaleString()}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs uppercase tracking-[0.14em] font-extrabold text-white/65">Buy Bloom Bucks</p>
                <button
                  onClick={() => {
                    void handleCreateKofiAccount();
                  }}
                  className="g-btn h-9 px-3 text-[10px] font-extrabold uppercase tracking-[0.12em]"
                >
                  Create Ko-fi Account
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {currencyPacks.map((pack) => {
                  const approved = approvedByPack[pack.slug];
                  const ready = approved && new Date(approved.expiresAt).getTime() > Date.now();
                  return (
                    <div key={pack.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                      <p className="text-[11px] uppercase tracking-[0.13em] font-extrabold text-white/62">{pack.name}</p>
                      <p className="text-xl font-extrabold text-white mt-1">{pack.total_bb.toLocaleString()} BB</p>
                      <p className="text-xs text-white/55 mt-1">${Number(pack.price_usd).toFixed(2)} â€¢ base {pack.base_bb.toLocaleString()} + bonus {pack.bonus_bb.toLocaleString()}</p>
                      {ready ? (
                        <p className="mt-2 text-[11px] text-emerald-200 font-bold">Approved email: {approved.email}</p>
                      ) : (
                        <p className="mt-2 text-[11px] text-white/50">Requires warning + exact email confirmation.</p>
                      )}
                      <button
                        onClick={() => {
                          void handleOpenKofi(pack);
                        }}
                        className={clsx(
                          'mt-3 h-9 w-full rounded-lg border text-[11px] font-extrabold uppercase tracking-[0.12em]',
                          ready ? 'g-btn-accent' : 'g-btn'
                        )}
                      >
                        {ready ? 'Open Ko-fi Checkout' : 'Start Purchase Flow'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
              <p className="text-xs uppercase tracking-[0.14em] font-extrabold text-white/65">Recent Transactions</p>
              <div className="mt-3 space-y-2 max-h-[380px] overflow-y-auto pr-1">
                {walletLedger.length === 0 ? (
                  <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-xs text-white/55">No wallet ledger entries yet.</div>
                ) : (
                  walletLedger.map((entry) => (
                    <div key={entry.id} className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-white/76">{formatEntryType(entry.entry_type)}</p>
                        <p className="text-[10px] text-white/50 mt-0.5">{new Date(entry.created_at).toLocaleString()}</p>
                      </div>
                      <div className="text-right">
                        <p className={clsx('text-sm font-extrabold', entry.amount_bb >= 0 ? 'text-emerald-200' : 'text-red-200')}>
                          {entry.amount_bb >= 0 ? '+' : ''}
                          {entry.amount_bb.toLocaleString()} BB
                        </p>
                        <p className="text-[10px] text-white/50">Balance: {(entry.balance_after ?? walletBalance).toLocaleString()}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </section>
      ) : (
        <section className="grid grid-cols-1 xl:grid-cols-[220px_minmax(0,1fr)_340px] gap-4 min-h-0">
          <aside className="g-panel p-3 h-fit">
            <p className="text-[10px] uppercase tracking-[0.16em] font-extrabold text-white/55">
              {activeTab === 'partners' ? 'Partners' : 'Categories'}
            </p>
            <div className="mt-2 rounded-lg border border-white/10 bg-white/[0.02] px-2.5 py-2 flex items-center gap-2">
              <Search size={14} className="text-white/45" />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={activeTab === 'partners' ? 'Search partner cosmetics...' : 'Search capes...'}
                className="w-full bg-transparent text-sm text-white placeholder:text-white/35 outline-none"
              />
            </div>
            {activeTab === 'partners' ? (
              <div className="mt-3 space-y-1.5">
                <button
                  onClick={() => setSelectedPartnerGroup('all')}
                  className={clsx(
                    'w-full rounded-lg border px-2.5 py-2 text-left text-[11px] font-extrabold uppercase tracking-[0.12em]',
                    selectedPartnerGroup === 'all' ? 'g-btn-accent' : 'border-white/10 bg-white/[0.02] text-white/80 hover:bg-white/[0.06]'
                  )}
                >
                  All Partners
                </button>
                {partnerGroups.map((group) => (
                  <button
                    key={group}
                    onClick={() => setSelectedPartnerGroup(group)}
                    className={clsx(
                      'w-full rounded-lg border px-2.5 py-2 text-left text-[11px] font-extrabold uppercase tracking-[0.12em]',
                      selectedPartnerGroup.toLowerCase() === group.toLowerCase()
                        ? 'g-btn-accent'
                        : 'border-white/10 bg-white/[0.02] text-white/80 hover:bg-white/[0.06]'
                    )}
                  >
                    {group}
                  </button>
                ))}
                {isOwner && (
                  <div className="mt-3 rounded-lg border border-white/10 bg-white/[0.03] p-2">
                    <p className="text-[10px] uppercase tracking-[0.12em] font-extrabold text-white/55">Owner</p>
                    <input
                      value={newPartnerGroupInput}
                      onChange={(event) => setNewPartnerGroupInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          void handleCreatePartnerGroup();
                        }
                      }}
                      placeholder="New partner tab..."
                      className="mt-1 h-8 w-full rounded-md border border-white/15 bg-white/[0.04] px-2 text-xs text-white placeholder:text-white/35 outline-none"
                    />
                    <button
                      onClick={() => {
                        void handleCreatePartnerGroup();
                      }}
                      disabled={creatingPartnerGroup || newPartnerGroupInput.trim().length === 0}
                      className="g-btn-accent mt-2 h-8 w-full text-[10px] font-extrabold uppercase tracking-[0.12em] disabled:opacity-45"
                    >
                      {creatingPartnerGroup ? 'Adding...' : 'Add Partner Tab'}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="mt-3 space-y-2">
                  <button
                    onClick={() => setActiveCategory('capes')}
                    className={clsx(
                      'w-full rounded-xl border px-3 py-2 text-left',
                      activeCategory === 'capes'
                        ? 'border-[var(--g-accent)] bg-white/[0.06] shadow-[0_0_0_1px_var(--g-accent-soft)]'
                        : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.04]'
                    )}
                  >
                    <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-white/84">Capes</p>
                  </button>
                </div>
                <div className="mt-4">
                  <p className="text-[10px] uppercase tracking-[0.14em] font-extrabold text-white/45">Rarity Filter</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <button
                      onClick={() => setRarityFilter(null)}
                      className={clsx(
                        'rounded-md border px-2 py-1 text-[10px] font-extrabold uppercase tracking-[0.1em]',
                        rarityFilter === null ? 'g-btn-accent' : 'border-white/10 bg-white/[0.03] text-white/70'
                      )}
                    >
                      All
                    </button>
                    {rarityOptions.map((rarity) => (
                      <button
                        key={rarity}
                        onClick={() => setRarityFilter(rarity)}
                        className={clsx(
                          'rounded-md border px-2 py-1 text-[10px] font-extrabold uppercase tracking-[0.1em]',
                          rarityFilter === rarity ? 'g-btn-accent' : 'border-white/10 bg-white/[0.03] text-white/70'
                        )}
                      >
                        {normalizeRarityDisplay(rarity)}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </aside>

          <div className="g-panel p-4 min-h-0 flex flex-col">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[10px] uppercase tracking-[0.16em] font-extrabold text-white/55">
                {activeTab === 'locker' ? 'Owned Capes' : activeTab === 'partners' ? 'Partner Cosmetics' : 'Shop Catalog'}
              </p>
              {shopLoading && <p className="text-[11px] text-white/55">Refreshing catalog...</p>}
            </div>
            <div className="mt-3 flex-1 min-h-0 overflow-y-auto">
              {loading ? (
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/60">Loading cosmetics...</div>
              ) : activeList.length === 0 ? (
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/62">
                  {activeTab === 'locker'
                    ? 'No owned capes yet. Buy one in Shop and it will appear here immediately.'
                    : activeTab === 'partners'
                      ? 'No cosmetics found for this partner filter.'
                    : 'No capes match this filter.'}
                </div>
              ) : (
                <div className="pl-6 pr-2 pb-4 pt-6">
                  <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-3">
                    {activeList.map((cape) => {
                      const rarityVisual = pickRarityGradient(cape, rarityPresetsMap);
                      const isSelected = cape.id === selectedCapeId;
                      const isEquipped = cape.id === equippedCapeId;
                      return (
                        <button
                          key={cape.id}
                          onClick={() => setSelectedCapeId(cape.id)}
                          onContextMenu={(event) => {
                            if (!isOwner) return;
                            event.preventDefault();
                            setOwnerPreviewContextMenu(null);
                            setOwnerContextMenu({ x: event.clientX, y: event.clientY, capeId: cape.id });
                          }}
                          className={clsx(
                            'group relative overflow-hidden rounded-xl border text-left transition aspect-square min-w-0',
                            isSelected
                              ? 'border-[var(--g-accent)] shadow-[0_0_0_1px_var(--g-accent-soft),0_14px_30px_rgba(0,0,0,0.38)]'
                              : 'border-white/10 hover:border-white/25'
                          )}
                          style={{
                            background: `linear-gradient(160deg, ${rarityVisual.start}, ${rarityVisual.end})`,
                            boxShadow: isSelected ? `0 0 0 1px var(--g-accent-soft), 0 0 26px ${rarityVisual.glow}` : `0 0 20px ${rarityVisual.glow}`
                          }}
                        >
                          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.18),transparent_56%)]" />
                          <div className="absolute -top-[2px] left-0 z-[2]">
                            <span className="rounded-md border border-white/25 bg-black/35 px-2 py-1 text-[10px] font-black uppercase tracking-[0.1em] text-white/90 leading-none">
                              {pickRarityLabel(cape)}
                            </span>
                          </div>
                          {activeTab === 'locker' && cape.rarity.toLowerCase() === 'custom' && (
                            <div className="absolute top-1.5 right-1.5 z-[3]">
                              <div
                                role="button"
                                tabIndex={0}
                                title="Delete custom cape"
                                className="h-7 w-7 rounded-md border border-white/20 bg-black/45 text-white/75 grid place-items-center opacity-0 transition-all duration-200 group-hover:opacity-100 hover:text-red-200 hover:border-red-300/50 hover:bg-red-500/20"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setDeleteCustomCapeState({
                                    cape,
                                    confirmText: '',
                                    busy: false
                                  });
                                }}
                                onKeyDown={(event) => {
                                  if (event.key !== 'Enter' && event.key !== ' ') return;
                                  event.preventDefault();
                                  event.stopPropagation();
                                  setDeleteCustomCapeState({
                                    cape,
                                    confirmText: '',
                                    busy: false
                                  });
                                }}
                              >
                                <Trash2 size={14} />
                              </div>
                            </div>
                          )}
                          <div className="relative p-2 h-full flex flex-col">
                            <div className="flex-1 border border-white/15 bg-black/28 overflow-hidden">
                              <CapeMeshRenderer
                                slug={cape.slug}
                                textureUrl={cape.texture_url}
                                name={cape.name}
                                glowColor={rarityVisual.glow}
                                sway={false}
                                className="h-full w-full"
                              />
                            </div>
                            <div className="mt-1.5 rounded-lg border border-white/15 bg-black/35 px-2 py-1.5">
                              <div className="flex items-start justify-between gap-2">
                                <p className="text-[12px] font-extrabold text-white leading-tight truncate">{cape.name}</p>
                                {isEquipped ? (
                                  <span className="rounded-md border border-emerald-300/45 bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.1em] text-emerald-100">Equipped</span>
                                ) : cape.owned ? (
                                  <span className="rounded-md border border-emerald-300/45 bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.1em] text-emerald-100">Owned</span>
                                ) : isSelected ? (
                                  <button
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      void handleBuyCape(cape);
                                    }}
                                    disabled={actionBusy}
                                    className="g-btn-accent h-6 px-2 text-[9px] font-black uppercase tracking-[0.1em] disabled:opacity-55"
                                  >
                                    Buy
                                  </button>
                                ) : (
                                  <span className="rounded-md border border-white/20 bg-black/35 px-1.5 py-0.5 text-[9px] font-black text-white/70">
                                    {cape.price_bb.toLocaleString()} BB
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="h-1.5 w-full" style={{ background: `linear-gradient(90deg, ${rarityVisual.start}, ${rarityVisual.end})` }} />
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          <aside className="g-panel p-4">
            <p className="text-[10px] uppercase tracking-[0.16em] font-extrabold text-white/55">Live Preview</p>
            <div
              className="relative mt-3 border border-white/10 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.1),transparent_60%),rgba(0,0,0,0.35)] p-3 select-none"
              onContextMenu={(event) => {
                if (!isOwner) return;
                event.preventDefault();
                setOwnerContextMenu(null);
                setOwnerPreviewContextMenu({ x: event.clientX, y: event.clientY });
              }}
            >
              <div className="h-[310px]">
                {selectedCape ? (
                  <MinecraftPlayerPreview
                    playerUuid={authState?.profile.id ?? null}
                    playerName={authState?.profile.name ?? 'Player'}
                    playerSkinUrl={authState?.profile.skinUrl ?? null}
                    capeSlug={selectedCape.slug}
                    capeTextureUrl={selectedCape.texture_url}
                    appearance={previewAppearance}
                    className="h-full w-full"
                  />
                ) : (
                  <div className="h-full w-full border border-white/12 bg-black/25" />
                )}
              </div>
              <p className="mt-2 text-[11px] text-white/55">Click-drag to orbit. Release for inertial smoothing.</p>
            </div>

            <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
              {selectedCape ? (
                <>
                  <p className="text-sm font-extrabold text-white">{selectedCape.name}</p>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <p className="text-[11px] text-white/58">{pickRarityLabel(selectedCape)} • {selectedCape.slug}</p>
                    {!selectedOwned && (
                      <button
                        onClick={() => {
                          void handleBuy();
                        }}
                        disabled={actionBusy}
                        className="g-btn-accent h-8 px-2.5 text-[10px] font-extrabold uppercase tracking-[0.12em] disabled:opacity-55 shrink-0"
                      >
                        Buy • {selectedCape.price_bb.toLocaleString()} BB
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-white/65 mt-2">{selectedCape.description || 'No description.'}</p>
                  <div className="mt-3 flex gap-2">
                    {selectedOwned ? (
                      <>
                        <button
                          onClick={() => {
                            void handleEquip();
                          }}
                          disabled={actionBusy || selectedEquipped}
                          className="g-btn-accent h-10 flex-1 text-[11px] font-extrabold uppercase tracking-[0.12em] disabled:opacity-55"
                        >
                          {selectedEquipped ? 'Equipped' : 'Equip'}
                        </button>
                        <button
                          onClick={() => {
                            void handleUnequip();
                          }}
                          disabled={actionBusy || !selectedEquipped}
                          className="g-btn h-10 flex-1 text-[11px] font-extrabold uppercase tracking-[0.12em] disabled:opacity-55"
                        >
                          Unequip
                        </button>
                      </>
                     ) : null}
                  </div>
                </>
              ) : (
                <p className="text-xs text-white/58">Select a cape to preview and manage equip/purchase actions.</p>
              )}
            </div>
          </aside>
        </section>
      )}

      {isOwner && ownerContextMenu && (
        <div
          className="fixed z-[540] min-w-[220px] rounded-xl border border-white/15 bg-[#110d18] p-2 shadow-[0_20px_40px_rgba(0,0,0,0.55)]"
          style={{ left: ownerContextMenu.x, top: ownerContextMenu.y }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <p className="px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white/55">Owner Actions</p>
          <button
            onClick={() => openOwnerCapeEditor(ownerContextMenu.capeId)}
            className="w-full rounded-lg border border-transparent bg-white/[0.03] px-2.5 py-2 text-left text-[11px] font-extrabold uppercase tracking-[0.12em] text-white/85 hover:border-white/15 hover:bg-white/[0.08]"
          >
            Edit Cape
          </button>
        </div>
      )}

      {isOwner && ownerPreviewContextMenu && (
        <div
          className="fixed z-[540] min-w-[180px] rounded-xl border border-white/15 bg-[#110d18] p-2 shadow-[0_20px_40px_rgba(0,0,0,0.55)]"
          style={{ left: ownerPreviewContextMenu.x, top: ownerPreviewContextMenu.y }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <p className="px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white/55">Preview Menu</p>
          <button
            onClick={() => {
              setOwnerPreviewContextMenu(null);
              setOwnerAppearancePanelOpen(true);
            }}
            className="w-full rounded-lg border border-transparent bg-white/[0.03] px-2.5 py-2 text-left text-[11px] font-extrabold uppercase tracking-[0.12em] text-white/85 hover:border-white/15 hover:bg-white/[0.08]"
          >
            Appearance
          </button>
        </div>
      )}

      {isOwner && ownerAppearancePanelOpen && (
        <div className="fixed inset-0 z-[545] flex items-center justify-center p-4 app-region-no-drag">
          <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={() => setOwnerAppearancePanelOpen(false)} />
          <div className="relative w-full max-w-[820px] rounded-2xl border border-white/15 bg-[#0f0a12] p-4 shadow-[0_30px_70px_rgba(0,0,0,0.65)]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-[10px] uppercase tracking-[0.16em] font-extrabold text-white/55">Owner Preview Controls</p>
                <h3 className="text-xl font-extrabold text-white mt-1">Appearance</h3>
              </div>
              <button
                onClick={() => setOwnerAppearancePanelOpen(false)}
                className="g-btn h-9 px-3 text-[10px] font-extrabold uppercase tracking-[0.12em]"
              >
                Close
              </button>
            </div>

            <div className="mt-3 grid grid-cols-1 lg:grid-cols-[200px_minmax(0,1fr)] gap-3">
              <aside className="rounded-xl border border-white/10 bg-white/[0.03] p-3 h-fit">
                <p className="text-[10px] uppercase tracking-[0.14em] font-extrabold text-white/55">Panels</p>
                <button className="mt-2 w-full rounded-xl border g-btn-accent px-3 py-2 text-left text-[11px] font-extrabold uppercase tracking-[0.12em]">
                  Appearance
                </button>
                <p className="mt-3 text-[11px] text-white/55">Edits sync live through Supabase Realtime.</p>
              </aside>

              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-3 max-h-[72vh] overflow-y-auto">
                {PREVIEW_APPEARANCE_SLIDERS.map((slider) => {
                  const value = Number(previewAppearance[slider.key]);
                  return (
                    <div key={slider.key} className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-white/78">{slider.label}</p>
                        <span className="text-[11px] text-white/75">{value.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min={slider.min}
                        max={slider.max}
                        step={slider.step}
                        value={value}
                        onChange={(event) => updatePreviewAppearanceSetting(slider.key, Number(event.target.value))}
                        className="mt-2 w-full"
                      />
                    </div>
                  );
                })}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={handleResetPreviewAppearance}
                    className="g-btn h-10 px-4 text-[11px] font-extrabold uppercase tracking-[0.12em]"
                  >
                    Reset Defaults
                  </button>
                  <p className="text-xs text-white/60">{previewAppearanceSaving ? 'Syncing...' : 'Synced live'}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {isOwner && ownerCapeEditor && (
        <div className="fixed inset-0 z-[545] flex items-center justify-center p-4 app-region-no-drag">
          <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={() => setOwnerCapeEditor(null)} />
          <div className="relative w-full max-w-[1120px] rounded-2xl border border-white/15 bg-[#0f0a12] p-4 shadow-[0_30px_70px_rgba(0,0,0,0.65)]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-[10px] uppercase tracking-[0.16em] font-extrabold text-white/55">Owner Edit</p>
                <h3 className="text-xl font-extrabold text-white mt-1">{ownerCapeEditor.name || 'Edit Cape'}</h3>
              </div>
              <button
                onClick={() => setOwnerCapeEditor(null)}
                className="g-btn h-9 px-3 text-[10px] font-extrabold uppercase tracking-[0.12em]"
              >
                Close
              </button>
            </div>

            <div className="mt-3 grid grid-cols-1 lg:grid-cols-[230px_minmax(0,1fr)] gap-3">
              <aside className="rounded-xl border border-white/10 bg-white/[0.03] p-3 min-h-0 max-h-[72vh] overflow-y-auto">
                <p className="text-[10px] uppercase tracking-[0.14em] font-extrabold text-white/55">Capes</p>
                <div className="mt-2 space-y-1.5">
                  {ownerEditableCapes.map((cape) => (
                    <button
                      key={cape.id}
                      onClick={() => selectOwnerCapeEditorCape(cape.id)}
                      className={clsx(
                        'w-full rounded-lg border px-2.5 py-2 text-left text-[11px] font-extrabold tracking-[0.02em] transition',
                        ownerCapeEditor.id === cape.id
                          ? 'g-btn-accent'
                          : 'border-white/10 bg-white/[0.03] text-white/80 hover:bg-white/[0.06]'
                      )}
                    >
                      <span className="block truncate">{cape.name}</span>
                    </button>
                  ))}
                </div>
              </aside>

              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-3 max-h-[72vh] overflow-y-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <input
                    value={ownerCapeEditor.slug}
                    onChange={(event) => updateOwnerEditor('slug', event.target.value)}
                    placeholder="slug"
                    className="h-9 rounded-lg border border-white/15 bg-white/[0.04] px-3 text-sm text-white placeholder:text-white/35 outline-none"
                  />
                  <input
                    value={ownerCapeEditor.name}
                    onChange={(event) => updateOwnerEditor('name', event.target.value)}
                    placeholder="name"
                    className="h-9 rounded-lg border border-white/15 bg-white/[0.04] px-3 text-sm text-white placeholder:text-white/35 outline-none"
                  />
                  <input
                    value={ownerCapeEditor.texture_url}
                    onChange={(event) => updateOwnerEditor('texture_url', event.target.value)}
                    placeholder="texture_url"
                    className="h-9 rounded-lg border border-white/15 bg-white/[0.04] px-3 text-sm text-white placeholder:text-white/35 outline-none md:col-span-2"
                  />
                  <input
                    value={ownerCapeEditor.preview_url ?? ''}
                    onChange={(event) => updateOwnerEditor('preview_url', event.target.value)}
                    placeholder="preview_url"
                    className="h-9 rounded-lg border border-white/15 bg-white/[0.04] px-3 text-sm text-white placeholder:text-white/35 outline-none md:col-span-2"
                  />
                  <input
                    value={ownerCapeEditor.description ?? ''}
                    onChange={(event) => updateOwnerEditor('description', event.target.value)}
                    placeholder="description"
                    className="h-9 rounded-lg border border-white/15 bg-white/[0.04] px-3 text-sm text-white placeholder:text-white/35 outline-none md:col-span-2"
                  />
                  <input
                    value={ownerCapeEditor.partner_group ?? ''}
                    onChange={(event) => updateOwnerEditor('partner_group', event.target.value)}
                    placeholder="partner_group (leave blank for no partner)"
                    list="owner-partner-group-options"
                    className="h-9 rounded-lg border border-white/15 bg-white/[0.04] px-3 text-sm text-white placeholder:text-white/35 outline-none md:col-span-2"
                  />
                  <datalist id="owner-partner-group-options">
                    {partnerGroups.map((group) => (
                      <option key={group} value={group} />
                    ))}
                  </datalist>
                  <input
                    value={ownerCapeEditor.rarity}
                    onChange={(event) => updateOwnerEditor('rarity', event.target.value)}
                    placeholder="rarity"
                    className="h-9 rounded-lg border border-white/15 bg-white/[0.04] px-3 text-sm text-white placeholder:text-white/35 outline-none"
                  />
                  <input
                    value={ownerCapeEditor.rarity_label ?? ''}
                    onChange={(event) => updateOwnerEditor('rarity_label', event.target.value)}
                    placeholder="rarity_label"
                    className="h-9 rounded-lg border border-white/15 bg-white/[0.04] px-3 text-sm text-white placeholder:text-white/35 outline-none"
                  />
                  <BloomColorInput
                    label="rarity_color_start"
                    value={ownerCapeEditor.rarity_color_start ?? '#a979ff'}
                    onChange={(next) => updateOwnerEditor('rarity_color_start', next)}
                  />
                  <BloomColorInput
                    label="rarity_color_end"
                    value={ownerCapeEditor.rarity_color_end ?? '#3a1f68'}
                    onChange={(next) => updateOwnerEditor('rarity_color_end', next)}
                  />
                  <div className="md:col-span-2">
                    <BloomColorInput
                      label="rarity_glow"
                      value={ownerCapeEditor.rarity_glow ?? 'rgba(169, 121, 255, 0.45)'}
                      withAlpha
                      onChange={(next) => updateOwnerEditor('rarity_glow', next)}
                    />
                  </div>
                  <label className="rounded-lg border border-white/15 bg-white/[0.04] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.1em] text-white/65 flex flex-col">
                    <span>price_bb</span>
                    <input
                      type="number"
                      min={0}
                      value={ownerCapeEditor.price_bb}
                      onChange={(event) => updateOwnerEditor('price_bb', Math.max(0, Number(event.target.value) || 0))}
                      className="mt-1 bg-transparent text-sm text-white outline-none normal-case tracking-normal"
                    />
                  </label>
                  <label className="rounded-lg border border-white/15 bg-white/[0.04] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.1em] text-white/65 flex flex-col">
                    <span>sort_order</span>
                    <input
                      type="number"
                      value={ownerCapeEditor.sort_order}
                      onChange={(event) => updateOwnerEditor('sort_order', Number(event.target.value) || 0)}
                      className="mt-1 bg-transparent text-sm text-white outline-none normal-case tracking-normal"
                    />
                  </label>
                  <label className="h-9 rounded-lg border border-white/15 bg-white/[0.04] px-3 text-[11px] font-bold uppercase tracking-[0.1em] text-white/65 inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={ownerCapeEditor.is_active}
                      onChange={(event) => updateOwnerEditor('is_active', event.target.checked)}
                    />
                    is_active
                  </label>
                  <label className="h-9 rounded-lg border border-white/15 bg-white/[0.04] px-3 text-[11px] font-bold uppercase tracking-[0.1em] text-white/65 inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={ownerCapeEditor.is_featured}
                      onChange={(event) => updateOwnerEditor('is_featured', event.target.checked)}
                    />
                    is_featured
                  </label>
                </div>

                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                  <p className="text-[10px] uppercase tracking-[0.14em] font-extrabold text-white/55">Tag Presets</p>
                  <div className="mt-2 flex flex-col md:flex-row gap-2">
                    <input
                      value={tagPresetNameInput}
                      onChange={(event) => setTagPresetNameInput(event.target.value)}
                      placeholder="Preset name (example: Partner)"
                      className="h-9 flex-1 rounded-lg border border-white/15 bg-white/[0.04] px-3 text-sm text-white placeholder:text-white/35 outline-none"
                    />
                    <button
                      onClick={handleSaveTagPreset}
                      className="g-btn-accent h-9 px-3 text-[10px] font-extrabold uppercase tracking-[0.12em]"
                    >
                      Save Preset
                    </button>
                  </div>
                  <div className="mt-2 space-y-1.5 max-h-[170px] overflow-y-auto pr-1">
                    {tagPresets.length === 0 ? (
                      <p className="text-xs text-white/55">No tag presets yet.</p>
                    ) : (
                      tagPresets.map((preset) => (
                        <div
                          key={preset.id}
                          className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1.5 flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <p className="text-[11px] font-extrabold text-white truncate">{preset.name}</p>
                            <p className="text-[10px] text-white/55 uppercase tracking-[0.1em] truncate">{preset.rarity_label}</p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              onClick={() => applyTagPreset(preset)}
                              className="g-btn-accent h-7 px-2 text-[10px] font-extrabold uppercase tracking-[0.1em]"
                            >
                              Apply
                            </button>
                            <button
                              onClick={() => handleDeleteTagPreset(preset.id)}
                              className="g-btn h-7 px-2 text-[10px] font-extrabold uppercase tracking-[0.1em]"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => {
                      void handleSaveOwnerCapeEditor();
                    }}
                    disabled={ownerEditSaving}
                    className="g-btn-accent h-10 px-4 text-[11px] font-extrabold uppercase tracking-[0.12em] disabled:opacity-45"
                  >
                    {ownerEditSaving ? 'Saving...' : 'Save Cape'}
                  </button>
                  <button
                    onClick={() => setOwnerCapeEditor(null)}
                    disabled={ownerEditSaving}
                    className="g-btn h-10 px-4 text-[11px] font-extrabold uppercase tracking-[0.12em] disabled:opacity-45"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {deleteCustomCapeState && (
        <div className="fixed inset-0 z-[640]">
          <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={() => setDeleteCustomCapeState(null)} />
          <div className="absolute inset-x-0 top-[20vh] mx-auto w-full max-w-[520px] rounded-2xl border border-red-300/30 bg-[#190d12] p-4 shadow-[0_26px_60px_rgba(0,0,0,0.65)]">
            <p className="text-[10px] uppercase tracking-[0.16em] font-extrabold text-red-200/80">Delete Custom Cape</p>
            <h3 className="mt-1 text-xl font-extrabold text-white">{deleteCustomCapeState.cape.name}</h3>
            <p className="mt-3 text-sm text-red-100/90">Type "confirm" to delete forever.</p>
            <input
              value={deleteCustomCapeState.confirmText}
              onChange={(event) =>
                setDeleteCustomCapeState((current) => (current ? { ...current, confirmText: event.target.value } : current))
              }
              placeholder='type "confirm"'
              className="mt-2 h-10 w-full rounded-lg border border-white/15 bg-black/35 px-3 text-sm text-white placeholder:text-white/35 outline-none"
            />
            <div className="mt-4 flex items-center justify-end gap-2">
              <button onClick={() => setDeleteCustomCapeState(null)} className="g-btn h-9 px-3 text-[10px] uppercase tracking-[0.12em] font-extrabold">
                Cancel
              </button>
              <button
                onClick={() => {
                  void handleDeleteCustomCape();
                }}
                disabled={deleteCustomCapeState.busy || deleteCustomCapeState.confirmText.trim().toLowerCase() !== 'confirm'}
                className="h-9 rounded-lg border border-red-300/45 bg-red-500/20 px-3 text-[10px] font-extrabold uppercase tracking-[0.12em] text-red-100 disabled:opacity-45"
              >
                {deleteCustomCapeState.busy ? 'Deleting...' : 'Delete Forever'}
              </button>
            </div>
          </div>
        </div>
      )}

      {modMenuOpen && (
        <div className="fixed inset-0 z-[525] flex items-center justify-center p-4 app-region-no-drag">
          <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" />
          <div className="relative w-full max-w-[900px] rounded-2xl border border-white/15 bg-[#0f0a12] p-4 shadow-[0_30px_70px_rgba(0,0,0,0.65)]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-[10px] uppercase tracking-[0.16em] font-extrabold text-white/55">Owner Tools</p>
                <h3 className="text-xl font-extrabold text-white mt-1">Mod Menu</h3>
              </div>
              <button
                onClick={closeModMenu}
                className="g-btn h-9 px-3 text-[10px] font-extrabold uppercase tracking-[0.12em]"
              >
                Close
              </button>
            </div>

            {!ownerUnlocked ? (
              <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <p className="text-xs font-bold text-white/75">Type the owner phrase to unlock the mod tools.</p>
                <div className="mt-2 flex flex-col sm:flex-row gap-2">
                  <input
                    value={ownerPassphraseInput}
                    onChange={(event) => {
                      setOwnerPassphraseInput(event.target.value);
                      setOwnerUnlockError(null);
                    }}
                    type="password"
                    placeholder="Owner phrase"
                    className="h-10 flex-1 rounded-lg border border-white/15 bg-white/[0.04] px-3 text-sm text-white placeholder:text-white/35 outline-none"
                  />
                  <button
                    onClick={handleUnlockOwnerMenu}
                    className="g-btn-accent h-10 px-4 text-[11px] font-extrabold uppercase tracking-[0.12em]"
                  >
                    Unlock
                  </button>
                </div>
                {ownerUnlockError && <p className="mt-2 text-xs font-bold text-red-200">{ownerUnlockError}</p>}
              </div>
            ) : (
              <div className="mt-3 grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)] gap-3">
                <aside className="rounded-xl border border-white/10 bg-white/[0.03] p-3 h-fit">
                  <p className="text-[10px] uppercase tracking-[0.14em] font-extrabold text-white/55">Tools</p>
                  <div className="mt-2 space-y-2">
                    <button
                      onClick={() => setActiveModTool('cape-sql')}
                      className={clsx(
                        'w-full rounded-xl border px-3 py-2 text-left text-[11px] font-extrabold uppercase tracking-[0.12em] transition',
                        activeModTool === 'cape-sql'
                          ? 'g-btn-accent'
                          : 'border-white/10 bg-white/[0.03] text-white/75 hover:bg-white/[0.06]'
                      )}
                    >
                      Cape SQL Creator
                    </button>
                    <button
                      onClick={() => setActiveModTool('rarity-presets')}
                      className={clsx(
                        'w-full rounded-xl border px-3 py-2 text-left text-[11px] font-extrabold uppercase tracking-[0.12em] transition',
                        activeModTool === 'rarity-presets'
                          ? 'g-btn-accent'
                          : 'border-white/10 bg-white/[0.03] text-white/75 hover:bg-white/[0.06]'
                      )}
                    >
                      Rarity Presets
                    </button>
                  </div>
                </aside>

                {activeModTool === 'cape-sql' ? (
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-3">
                  <p className="text-[10px] uppercase tracking-[0.14em] font-extrabold text-white/55">Create Cape Listing SQL</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <input
                      value={capeSqlDraft.slug}
                      onChange={(event) => updateCapeSqlDraft('slug', event.target.value)}
                      placeholder="slug (required)"
                      className="h-9 rounded-lg border border-white/15 bg-white/[0.04] px-3 text-sm text-white placeholder:text-white/35 outline-none"
                    />
                    <input
                      value={capeSqlDraft.name}
                      onChange={(event) => updateCapeSqlDraft('name', event.target.value)}
                      placeholder="name (required)"
                      className="h-9 rounded-lg border border-white/15 bg-white/[0.04] px-3 text-sm text-white placeholder:text-white/35 outline-none"
                    />
                    <input
                      value={capeSqlDraft.texture_url}
                      onChange={(event) => updateCapeSqlDraft('texture_url', event.target.value)}
                      placeholder="texture_url (required)"
                      className="h-9 rounded-lg border border-white/15 bg-white/[0.04] px-3 text-sm text-white placeholder:text-white/35 outline-none md:col-span-2"
                    />
                    <input
                      value={capeSqlDraft.preview_url}
                      onChange={(event) => updateCapeSqlDraft('preview_url', event.target.value)}
                      placeholder="preview_url (optional)"
                      className="h-9 rounded-lg border border-white/15 bg-white/[0.04] px-3 text-sm text-white placeholder:text-white/35 outline-none md:col-span-2"
                    />
                    <input
                      value={capeSqlDraft.description}
                      onChange={(event) => updateCapeSqlDraft('description', event.target.value)}
                      placeholder="description (optional)"
                      className="h-9 rounded-lg border border-white/15 bg-white/[0.04] px-3 text-sm text-white placeholder:text-white/35 outline-none md:col-span-2"
                    />
                    <input
                      value={capeSqlDraft.rarity}
                      onChange={(event) => updateCapeSqlDraft('rarity', event.target.value)}
                      placeholder="rarity"
                      className="h-9 rounded-lg border border-white/15 bg-white/[0.04] px-3 text-sm text-white placeholder:text-white/35 outline-none"
                    />
                    <input
                      value={capeSqlDraft.rarity_label}
                      onChange={(event) => updateCapeSqlDraft('rarity_label', event.target.value)}
                      placeholder="rarity_label"
                      className="h-9 rounded-lg border border-white/15 bg-white/[0.04] px-3 text-sm text-white placeholder:text-white/35 outline-none"
                    />
                    <BloomColorInput
                      label="rarity_color_start"
                      value={capeSqlDraft.rarity_color_start}
                      onChange={(next) => updateCapeSqlDraft('rarity_color_start', next)}
                    />
                    <BloomColorInput
                      label="rarity_color_end"
                      value={capeSqlDraft.rarity_color_end}
                      onChange={(next) => updateCapeSqlDraft('rarity_color_end', next)}
                    />
                    <div className="md:col-span-2">
                      <BloomColorInput
                        label="rarity_glow"
                        value={capeSqlDraft.rarity_glow}
                        withAlpha
                        onChange={(next) => updateCapeSqlDraft('rarity_glow', next)}
                      />
                    </div>
                    <label className="rounded-lg border border-white/15 bg-white/[0.04] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.1em] text-white/65 flex flex-col">
                      <span>price_bb</span>
                      <input
                        type="number"
                        min={0}
                        value={capeSqlDraft.price_bb}
                        onChange={(event) => updateCapeSqlDraft('price_bb', Math.max(0, Number(event.target.value) || 0))}
                        className="mt-1 bg-transparent text-sm text-white outline-none normal-case tracking-normal"
                      />
                    </label>
                    <label className="rounded-lg border border-white/15 bg-white/[0.04] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.1em] text-white/65 flex flex-col">
                      <span>sort_order</span>
                      <input
                        type="number"
                        value={capeSqlDraft.sort_order}
                        onChange={(event) => updateCapeSqlDraft('sort_order', Number(event.target.value) || 0)}
                        className="mt-1 bg-transparent text-sm text-white outline-none normal-case tracking-normal"
                      />
                    </label>
                    <label className="h-9 rounded-lg border border-white/15 bg-white/[0.04] px-3 text-[11px] font-bold uppercase tracking-[0.1em] text-white/65 inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={capeSqlDraft.is_active}
                        onChange={(event) => updateCapeSqlDraft('is_active', event.target.checked)}
                      />
                      is_active
                    </label>
                    <label className="h-9 rounded-lg border border-white/15 bg-white/[0.04] px-3 text-[11px] font-bold uppercase tracking-[0.1em] text-white/65 inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={capeSqlDraft.is_featured}
                        onChange={(event) => updateCapeSqlDraft('is_featured', event.target.checked)}
                      />
                      is_featured
                    </label>
                  </div>

                  <textarea
                    value={generatedCapeSql}
                    readOnly
                    className="h-56 w-full rounded-lg border border-white/15 bg-[#09080d] px-3 py-2 font-mono text-xs text-white/90 outline-none"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => {
                        void handleCopyCapeSql();
                      }}
                      disabled={!capeSqlReady}
                      className="g-btn-accent h-10 px-4 text-[11px] font-extrabold uppercase tracking-[0.12em] disabled:opacity-45"
                    >
                      {capeSqlCopied ? 'Copied' : 'Copy SQL'}
                    </button>
                    <button
                      onClick={() => setCapeSqlDraft(DEFAULT_OWNER_CAPE_SQL_DRAFT)}
                      className="g-btn h-10 px-4 text-[11px] font-extrabold uppercase tracking-[0.12em]"
                    >
                      Reset Form
                    </button>
                  </div>
                </div>
                ) : (
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-3">
                    <p className="text-[10px] uppercase tracking-[0.14em] font-extrabold text-white/55">Rarity Presets</p>
                    <p className="text-xs text-white/60">Edits sync live to all cosmetics using that rarity, including future cape listings.</p>
                    <div className="space-y-2 max-h-[62vh] overflow-y-auto pr-1">
                      {rarityPresetEditorRows.map((preset, index) => {
                        const normalized = normalizeRarityDisplay(preset.rarity);
                        const upsertLocalPreset = (next: Partial<RarityPresetRecord>) =>
                          setRarityPresets((current) => {
                            const hasEntry = current.some((entry) => normalizeRarityDisplay(entry.rarity) === normalized);
                            if (!hasEntry) return [...current, { ...preset, ...next }];
                            return current.map((entry) =>
                              normalizeRarityDisplay(entry.rarity) === normalized ? { ...entry, ...next } : entry
                            );
                          });

                        return (
                          <div key={preset.rarity} className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-white/80">{preset.rarity}</p>
                              <button
                                onClick={() => {
                                  void handleSaveRarityPreset({
                                    ...preset,
                                    sort_order: Number.isFinite(Number(preset.sort_order)) ? Number(preset.sort_order) : index
                                  });
                                }}
                                disabled={rarityPresetSaving === preset.rarity}
                                className="g-btn-accent h-8 px-3 text-[10px] font-extrabold uppercase tracking-[0.12em] disabled:opacity-45"
                              >
                                {rarityPresetSaving === preset.rarity ? 'Saving...' : 'Save'}
                              </button>
                            </div>
                            <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                              <input
                                value={preset.rarity_label ?? ''}
                                onChange={(event) => upsertLocalPreset({ rarity_label: event.target.value })}
                                placeholder="rarity label"
                                className="h-9 rounded-lg border border-white/15 bg-white/[0.04] px-3 text-sm text-white placeholder:text-white/35 outline-none"
                              />
                              <label className="rounded-lg border border-white/15 bg-white/[0.04] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.1em] text-white/65 flex flex-col">
                                <span>sort_order</span>
                                <input
                                  type="number"
                                  value={preset.sort_order ?? index}
                                  onChange={(event) => upsertLocalPreset({ sort_order: Number(event.target.value) || 0 })}
                                  className="mt-1 bg-transparent text-sm text-white outline-none normal-case tracking-normal"
                                />
                              </label>
                              <BloomColorInput
                                label="color_start"
                                value={preset.color_start ?? '#a979ff'}
                                onChange={(next) => upsertLocalPreset({ color_start: next })}
                              />
                              <BloomColorInput
                                label="color_end"
                                value={preset.color_end ?? '#3a1f68'}
                                onChange={(next) => upsertLocalPreset({ color_end: next })}
                              />
                              <div className="md:col-span-2">
                                <BloomColorInput
                                  label="glow"
                                  value={preset.glow ?? 'rgba(169, 121, 255, 0.45)'}
                                  withAlpha
                                  onChange={(next) => upsertLocalPreset({ glow: next })}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {guardState && (
        <div className="fixed inset-0 z-[520] flex items-center justify-center p-4 app-region-no-drag">
          <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" />
          <div className="relative w-full max-w-[520px] rounded-2xl border border-red-400/35 bg-[#0f0a12] p-5 shadow-[0_30px_70px_rgba(0,0,0,0.65)]">
            {guardState.step === 'warning' ? (
              <>
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-lg border border-red-300/40 bg-red-500/15 flex items-center justify-center mt-0.5">
                    <AlertTriangle size={18} className="text-red-200" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] uppercase tracking-[0.14em] font-extrabold text-red-200">Required Warning</p>
                    <h3 className="text-xl font-extrabold text-white mt-1">Use the EXACT Ko-fi Email</h3>
                    <p className="mt-2 text-sm text-red-100/90">
                      You must use the exact same email in Ko-fi checkout. Any mismatch can delay or break automatic Bloom Bucks crediting.
                    </p>
                    <p className="mt-2 text-sm text-red-100/90 font-bold">
                      This warning cannot be dismissed for {guardState.countdown}s.
                    </p>
                  </div>
                </div>
                <div className="mt-5 grid grid-cols-2 gap-2">
                  <button
                    onClick={closeGuard}
                    disabled={guardState.countdown > 0}
                    className="g-btn h-10 text-[11px] font-extrabold uppercase tracking-[0.12em] disabled:opacity-35"
                  >
                    Close
                  </button>
                  <button
                    onClick={() => setGuardState({ ...guardState, step: 'email' })}
                    disabled={guardState.countdown > 0}
                    className="g-btn-accent h-10 text-[11px] font-extrabold uppercase tracking-[0.12em] disabled:opacity-35"
                  >
                    Continue
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-[11px] uppercase tracking-[0.14em] font-extrabold text-white/60">Confirm Pending Purchase</p>
                <h3 className="text-xl font-extrabold text-white mt-1">{guardState.pack.name}</h3>
                <p className="text-sm text-white/65 mt-2">Enter the exact email you will use on Ko-fi checkout.</p>
                <input
                  type="email"
                  value={guardState.email}
                  onChange={(event) => setGuardState({ ...guardState, email: event.target.value, error: null })}
                  placeholder="you@example.com"
                  className="mt-3 w-full rounded-lg border border-white/15 bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-white/35 outline-none"
                />
                {guardState.error && <p className="mt-2 text-xs text-red-200 font-bold">{guardState.error}</p>}
                <div className="mt-4 flex gap-2">
                  <button
                    onClick={closeGuard}
                    disabled={guardState.saving}
                    className="g-btn h-10 flex-1 text-[11px] font-extrabold uppercase tracking-[0.12em] disabled:opacity-45"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      void handleConfirmPending();
                    }}
                    disabled={guardState.saving}
                    className="g-btn-accent h-10 flex-1 text-[11px] font-extrabold uppercase tracking-[0.12em] disabled:opacity-45"
                  >
                    {guardState.saving ? 'Saving...' : 'Save & Continue'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}



