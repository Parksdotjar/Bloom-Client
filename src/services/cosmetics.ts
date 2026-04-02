import { supabase } from './supabase';

export type CommerceProfile = {
  user_id: string;
  username: string | null;
  display_name: string | null;
  mc_uuid: string | null;
  role: 'user' | 'owner';
  created_at: string;
  updated_at: string;
};

export type CapeRecord = {
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
  is_active: boolean;
  is_featured: boolean;
  created_at: string;
  updated_at: string;
};

export type OwnedCapeRecord = {
  entitlement_id: string;
  acquired_at: string;
  source: string;
  cape_id: string;
  slug: string;
  name: string;
  description: string | null;
  partner_group: string | null;
  texture_url: string;
  preview_url: string | null;
  rarity: string;
  rarity_label: string | null;
  rarity_color_start: string | null;
  rarity_color_end: string | null;
  rarity_glow: string | null;
  sort_order: number;
  is_active: boolean;
};

export type LoadoutRecord = {
  user_id: string;
  equipped_cape_id: string | null;
  equipped_cape_slug: string | null;
  updated_at: string;
};

export type WalletRecord = {
  user_id: string;
  balance_bb: number;
  updated_at: string;
};

export type OwnerSetWalletBalanceResult = {
  user_id: string;
  balance_bb: number;
  updated_at: string;
};

export type WalletLedgerRecord = {
  id: string;
  user_id: string;
  entry_type: string;
  amount_bb: number;
  balance_after: number | null;
  reference_type: string | null;
  reference_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type CurrencyPackRecord = {
  id: string;
  slug: string;
  name: string;
  price_usd: number;
  base_bb: number;
  bonus_bb: number;
  total_bb: number;
  kofi_url: string;
  is_active: boolean;
  sort_order: number;
};

export type PartnerGroupRecord = {
  id: string;
  slug: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type RarityPresetRecord = {
  id: string;
  rarity: string;
  rarity_label: string | null;
  color_start: string | null;
  color_end: string | null;
  glow: string | null;
  sort_order: number;
  is_active: boolean;
  updated_at: string;
};

export type PendingCurrencyPurchaseRecord = {
  id: string;
  user_id: string;
  email: string;
  package_slug: string;
  status: string;
  created_at: string;
  updated_at: string;
  expires_at: string;
  matched_kofi_event_id: string | null;
};

export type PurchaseCapeResult = {
  cape_id: string;
  cape_slug: string;
  new_balance_bb: number;
  equipped_cape_id: string | null;
  already_owned: boolean;
};

export type UpdateCapeInput = {
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
  is_active: boolean;
  is_featured: boolean;
};

export type CreateCapeListingInput = {
  slug: string;
  name: string;
  description: string | null;
  texture_url: string;
  preview_url: string | null;
  price_bb: number;
  rarity: string;
  rarity_label: string | null;
  rarity_color_start: string | null;
  rarity_color_end: string | null;
  rarity_glow: string | null;
  sort_order: number;
  is_active: boolean;
  is_featured: boolean;
};

export type PreviewAppearanceRecord = {
  scope: string;
  exposure: number;
  brightness: number;
  contrast: number;
  saturation: number;
  turn_rate: number;
  camera_light_intensity: number;
  global_light_intensity: number;
  updated_by: string | null;
  updated_at: string;
};

export type CustomCapeDesignRecord = {
  id: string;
  user_id: string;
  source_image_path: string | null;
  source_image_url: string | null;
  crop_x: number;
  crop_y: number;
  crop_width: number;
  crop_height: number;
  export_width: number;
  export_height: number;
  preview_watermarked: boolean;
  purchased: boolean;
  final_asset_path: string | null;
  final_asset_url: string | null;
  generated_cape_id: string | null;
  created_at: string;
  updated_at: string;
};

export type CreateOrUpdateCustomCapeDraftInput = {
  design_id?: string | null;
  source_image_path?: string | null;
  source_image_url?: string | null;
  crop_x?: number;
  crop_y?: number;
  crop_width?: number;
  crop_height?: number;
  export_width?: number;
};

export type FinalizeCustomCapeExportResult = {
  design_id: string;
  charged_bb: number;
  new_balance_bb: number;
  final_asset_url: string;
  generated_cape_id: string | null;
  exported_at: string;
  transaction_status: string;
};

export const DEFAULT_PREVIEW_APPEARANCE: PreviewAppearanceRecord = {
  scope: 'global',
  exposure: 1.9,
  brightness: 1.42,
  contrast: 1.1,
  saturation: 1.06,
  turn_rate: 0.45,
  camera_light_intensity: 1.72,
  global_light_intensity: 1.22,
  updated_by: null,
  updated_at: new Date(0).toISOString()
};

async function ensureSession() {
  const sessionRes = await supabase.auth.getSession();
  if (sessionRes.error) throw sessionRes.error;

  let session = sessionRes.data.session;

  if (!session) {
    const refreshRes = await supabase.auth.refreshSession();
    if (refreshRes.error || !refreshRes.data.session) {
      throw new Error('Auth session missing! Please sign in again from Bloom Client.');
    }
    session = refreshRes.data.session;
  }

  const refreshRes = await supabase.auth.refreshSession({ refresh_token: session.refresh_token });
  if (!refreshRes.error && refreshRes.data.session) {
    session = refreshRes.data.session;
  }

  const userRes = await supabase.auth.getUser();
  if (!userRes.error && userRes.data.user) {
    return;
  }

  const userMessage = String((userRes.error as { message?: string } | null)?.message ?? '');
  const lower = userMessage.toLowerCase();
  if (
    lower.includes('invalid authentication credentials') ||
    lower.includes('invalid auth session') ||
    lower.includes('jwt')
  ) {
    const retryRefresh = await supabase.auth.refreshSession({ refresh_token: session.refresh_token });
    if (retryRefresh.error || !retryRefresh.data.session) {
      throw new Error('Auth session missing! Please sign in again from Bloom Client.');
    }
    return;
  }

  if (userRes.error) throw userRes.error;
}

export async function ensureCommerceIdentity(mcUuid: string, username: string, displayName?: string | null) {
  await ensureSession();

  const userRes = await supabase.auth.getUser();
  const authUserId = userRes.data.user?.id ?? null;

  let { data, error } = await supabase.rpc('commerce_sync_identity', {
    p_mc_uuid: mcUuid,
    p_username: username,
    p_display_name: displayName ?? username
  });

  const authMessage = String((error as { message?: string } | null)?.message ?? '').toLowerCase();
  if (
    error &&
    (authMessage.includes('invalid authentication credentials') ||
      authMessage.includes('invalid auth session') ||
      authMessage.includes('jwt'))
  ) {
    await ensureSession();
    const retry = await supabase.rpc('commerce_sync_identity', {
      p_mc_uuid: mcUuid,
      p_username: username,
      p_display_name: displayName ?? username
    });
    data = retry.data;
    error = retry.error;
  }

  if (error) {
    const message = String((error as { message?: string }).message ?? '');
    if (message.includes('commerce_profiles_mc_uuid_key')) {
      const userId = authUserId;
      if (userId) {
        const fallback = await supabase
          .from('commerce_profiles')
          .select('id,user_id,username,display_name,mc_uuid,role,created_at,updated_at')
          .eq('user_id', userId)
          .maybeSingle();
        if (!fallback.error && fallback.data) {
          return fallback.data as CommerceProfile;
        }
      }
    }
    const lower = message.toLowerCase();
    if (
      lower.includes('invalid authentication credentials') ||
      lower.includes('invalid auth session') ||
      lower.includes('jwt')
    ) {
      throw error;
    }
  }

  if (data) {
    return data as CommerceProfile | null;
  }

  // Hard fallback for self-hosted drift: ensure one row exists by user_id.
  if (!authUserId) {
    throw new Error('Auth session missing! Please sign in again from Bloom Client.');
  }

  const normalizedMcUuid = String(mcUuid || '').trim();
  if (!normalizedMcUuid) {
    throw new Error('mc_uuid_required');
  }

  const normalizedUsername = String(username || '').trim() || null;
  const normalizedDisplay = String(displayName ?? username ?? '').trim() || normalizedUsername;

  const profileUpsert = await supabase.from('commerce_profiles').upsert(
    {
      user_id: authUserId,
      username: normalizedUsername,
      display_name: normalizedDisplay,
      mc_uuid: normalizedMcUuid
    },
    { onConflict: 'user_id' }
  );
  if (profileUpsert.error) throw profileUpsert.error;

  // Wallet writes are intentionally restricted by RLS. Wallet bootstrap is handled by
  // security-definer SQL paths; do not hard-fail identity sync on wallet insert policy.
  const walletUpsert = await supabase.from('commerce_wallets').upsert(
    {
      user_id: authUserId,
      balance_bb: 0
    },
    { onConflict: 'user_id' }
  );
  if (walletUpsert.error) {
    const msg = String((walletUpsert.error as { message?: string } | null)?.message ?? '').toLowerCase();
    const code = String((walletUpsert.error as { code?: string } | null)?.code ?? '');
    const isWalletRls =
      code === '42501' ||
      msg.includes('row-level security') ||
      msg.includes('violates row-level security policy');
    if (!isWalletRls) throw walletUpsert.error;
  }

  const loadoutUpsert = await supabase.from('commerce_cape_loadout').upsert(
    {
      user_id: authUserId,
      equipped_cape_id: null
    },
    { onConflict: 'user_id' }
  );
  if (loadoutUpsert.error) throw loadoutUpsert.error;

  const profileSelect = await supabase
    .from('commerce_profiles')
    .select('user_id,username,display_name,mc_uuid,role,created_at,updated_at')
    .eq('user_id', authUserId)
    .maybeSingle();
  if (profileSelect.error) throw profileSelect.error;
  return (profileSelect.data as CommerceProfile | null) ?? null;
}

export async function loadShopCapes(search: string, rarity: string | null) {
  await ensureSession();
  let query = supabase
    .from('v_commerce_shop_capes_ordered')
    .select(
      'id,slug,name,description,partner_group,texture_url,preview_url,price_bb,rarity,rarity_label,rarity_color_start,rarity_color_end,rarity_glow,sort_order,is_active,is_featured,created_at,updated_at'
    )
    .eq('is_active', true)
    .order('rarity_rank', { ascending: true })
    .order('is_featured', { ascending: false })
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });

  const q = search.trim();
  if (q) {
    query = query.or(`name.ilike.%${q}%,slug.ilike.%${q}%`);
  }
  if (rarity) {
    query = query.eq('rarity', rarity.toLowerCase());
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as CapeRecord[];
}

export async function loadOwnedCapes() {
  await ensureSession();
  const { data, error } = await supabase.rpc('commerce_list_owned_capes');
  if (error) throw error;
  return (data ?? []) as OwnedCapeRecord[];
}

export async function loadCurrentLoadout() {
  await ensureSession();
  const { data, error } = await supabase
    .from('commerce_cape_loadout')
    .select('user_id,equipped_cape_id,updated_at')
    .maybeSingle();
  if (error) throw error;
  return data as { user_id: string; equipped_cape_id: string | null; updated_at: string } | null;
}

export async function loadWallet(targetUserId?: string | null) {
  await ensureSession();
  let query = supabase
    .from('commerce_wallets')
    .select('user_id,balance_bb,updated_at');
  if (targetUserId) {
    query = query.eq('user_id', targetUserId);
  }
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data as WalletRecord | null;
}

export async function ownerSetWalletBalance(amount: number, mcUuid?: string | null) {
  await ensureSession();
  const normalized = Math.max(0, Math.floor(Number(amount)));
  if (!Number.isFinite(normalized)) {
    throw new Error('Invalid balance amount.');
  }
  const { data, error } = await supabase.rpc('commerce_owner_set_wallet_balance', {
    p_balance_bb: normalized,
    p_mc_uuid: mcUuid ?? null
  });
  if (error) throw error;
  if (Array.isArray(data)) {
    return (data[0] ?? null) as OwnerSetWalletBalanceResult | null;
  }
  return (data as OwnerSetWalletBalanceResult | null) ?? null;
}

export async function secretSetOwnWalletBalance(amount: number) {
  await ensureSession();
  const normalized = Math.max(0, Math.floor(Number(amount)));
  if (!Number.isFinite(normalized)) {
    throw new Error('Invalid balance amount.');
  }
  const { data, error } = await supabase.rpc('commerce_secret_custom_bal_set_to', {
    p_balance_bb: normalized
  });
  if (error) throw error;
  if (Array.isArray(data)) {
    return (data[0] ?? null) as OwnerSetWalletBalanceResult | null;
  }
  return (data as OwnerSetWalletBalanceResult | null) ?? null;
}

export async function loadWalletLedger(limit = 20) {
  await ensureSession();
  const { data, error } = await supabase.rpc('commerce_list_wallet_ledger', {
    p_limit: Math.max(1, Math.min(200, Math.round(limit)))
  });
  if (error) throw error;
  return (data ?? []) as WalletLedgerRecord[];
}

export async function loadCurrencyPacks() {
  await ensureSession();
  const { data, error } = await supabase
    .from('commerce_currency_packs')
    .select('id,slug,name,price_usd,base_bb,bonus_bb,total_bb,kofi_url,is_active,sort_order')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data ?? []) as CurrencyPackRecord[];
}

export async function purchaseCape(slug: string, autoEquip = false) {
  const { data, error } = await supabase.rpc('purchase_cape', {
    p_cape_slug: slug,
    p_auto_equip: autoEquip
  });
  if (error) throw error;
  const rows = (data ?? []) as PurchaseCapeResult[];
  return rows[0] ?? null;
}

export async function setCapeLoadout(slug: string | null) {
  const { data, error } = await supabase.rpc('set_cape_loadout', {
    p_cape_slug: slug
  });
  if (error) throw error;
  if (Array.isArray(data)) {
    const rows = data as LoadoutRecord[];
    return rows[0] ?? null;
  }
  return (data as LoadoutRecord | null) ?? null;
}

export async function createPendingCurrencyPurchase(email: string, packageSlug: string, ttlSeconds = 1800) {
  const { data, error } = await supabase.rpc('commerce_create_pending_currency_purchase', {
    p_email: email,
    p_package_slug: packageSlug,
    p_ttl_seconds: ttlSeconds
  });
  if (error) throw error;
  return data as PendingCurrencyPurchaseRecord | null;
}

export async function updateCapeListing(capeId: string, patch: UpdateCapeInput) {
  const { data, error } = await supabase
    .from('commerce_capes')
    .update({
      slug: patch.slug,
      name: patch.name,
      description: patch.description,
      partner_group: patch.partner_group,
      texture_url: patch.texture_url,
      preview_url: patch.preview_url,
      price_bb: patch.price_bb,
      rarity: patch.rarity,
      rarity_label: patch.rarity_label,
      rarity_color_start: patch.rarity_color_start,
      rarity_color_end: patch.rarity_color_end,
      rarity_glow: patch.rarity_glow,
      sort_order: patch.sort_order,
      is_active: patch.is_active,
      is_featured: patch.is_featured
    })
    .eq('id', capeId)
    .select(
      'id,slug,name,description,partner_group,texture_url,preview_url,price_bb,rarity,rarity_label,rarity_color_start,rarity_color_end,rarity_glow,sort_order,is_active,is_featured,created_at,updated_at'
    )
    .single();
  if (error) throw error;
  return data as CapeRecord;
}

export async function createCapeListing(input: CreateCapeListingInput) {
  const { data, error } = await supabase.rpc('create_cape_listing', {
    p_slug: input.slug,
    p_name: input.name,
    p_description: input.description,
    p_texture_url: input.texture_url,
    p_preview_url: input.preview_url,
    p_price_bb: input.price_bb,
    p_rarity: input.rarity,
    p_rarity_label: input.rarity_label,
    p_rarity_color_start: input.rarity_color_start,
    p_rarity_color_end: input.rarity_color_end,
    p_rarity_glow: input.rarity_glow,
    p_sort_order: input.sort_order,
    p_is_active: input.is_active,
    p_is_featured: input.is_featured
  });
  if (error) throw error;
  if (Array.isArray(data)) {
    return (data[0] ?? null) as CapeRecord | null;
  }
  return (data as CapeRecord | null) ?? null;
}

export async function setCapePartnerGroup(capeId: string, partnerGroup: string | null) {
  const { data, error } = await supabase
    .from('commerce_capes')
    .update({ partner_group: partnerGroup })
    .eq('id', capeId)
    .select(
      'id,slug,name,description,partner_group,texture_url,preview_url,price_bb,rarity,rarity_label,rarity_color_start,rarity_color_end,rarity_glow,sort_order,is_active,is_featured,created_at,updated_at'
    )
    .single();
  if (error) throw error;
  return data as CapeRecord;
}

export async function loadPartnerGroups() {
  const { data, error } = await supabase
    .from('commerce_partner_groups')
    .select('id,slug,name,sort_order,is_active,created_at,updated_at')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });
  if (error) throw error;
  return (data ?? []) as PartnerGroupRecord[];
}

export async function loadRarityPresets() {
  const { data, error } = await supabase
    .from('commerce_rarity_presets')
    .select('id,rarity,rarity_label,color_start,color_end,glow,sort_order,is_active,updated_at')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('rarity', { ascending: true });
  if (error) {
    const code = (error as { code?: string }).code;
    if (code === '42P01') return [];
    throw error;
  }
  return (data ?? []) as RarityPresetRecord[];
}

export async function upsertRarityPreset(input: {
  rarity: string;
  rarity_label: string | null;
  color_start: string | null;
  color_end: string | null;
  glow: string | null;
  sort_order: number;
  is_active?: boolean;
}) {
  const { data, error } = await supabase
    .from('commerce_rarity_presets')
    .upsert(
      {
        rarity: input.rarity.trim().toLowerCase(),
        rarity_label: input.rarity_label,
        color_start: input.color_start,
        color_end: input.color_end,
        glow: input.glow,
        sort_order: input.sort_order,
        is_active: input.is_active ?? true
      },
      { onConflict: 'rarity' }
    )
    .select('id,rarity,rarity_label,color_start,color_end,glow,sort_order,is_active,updated_at')
    .single();
  if (error) throw error;
  return data as RarityPresetRecord;
}

export async function createPartnerGroup(name: string) {
  const cleanName = name.trim();
  const slug = cleanName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const { data, error } = await supabase
    .from('commerce_partner_groups')
    .insert({
      name: cleanName,
      slug: slug || `partner-${Date.now()}`
    })
    .select('id,slug,name,sort_order,is_active,created_at,updated_at')
    .single();
  if (error) throw error;
  return data as PartnerGroupRecord;
}

export async function loadPreviewAppearance() {
  const { data, error } = await supabase
    .from('commerce_preview_settings')
    .select('scope,exposure,brightness,contrast,saturation,turn_rate,camera_light_intensity,global_light_intensity,updated_by,updated_at')
    .eq('scope', 'global')
    .maybeSingle();
  if (error) throw error;
  if (!data) return DEFAULT_PREVIEW_APPEARANCE;
  return data as PreviewAppearanceRecord;
}

export async function upsertPreviewAppearance(
  patch: Partial<
    Pick<
      PreviewAppearanceRecord,
      'exposure' | 'brightness' | 'contrast' | 'saturation' | 'turn_rate' | 'camera_light_intensity' | 'global_light_intensity'
    >
  >
) {
  const payload = {
    scope: 'global',
    ...patch
  };
  const { data, error } = await supabase
    .from('commerce_preview_settings')
    .upsert(payload, { onConflict: 'scope' })
    .select('scope,exposure,brightness,contrast,saturation,turn_rate,camera_light_intensity,global_light_intensity,updated_by,updated_at')
    .single();
  if (error) throw error;
  return data as PreviewAppearanceRecord;
}

export async function getSupabaseUserId() {
  await ensureSession();
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    const message = String((error as { message?: string }).message ?? '').toLowerCase();
    if (
      message.includes('auth session missing') ||
      message.includes('invalid authentication credentials') ||
      message.includes('invalid auth session') ||
      message.includes('jwt')
    ) {
      return null;
    }
    throw error;
  }
  return data.user?.id ?? null;
}

export async function loadLatestCustomCapeDraft() {
  const { data, error } = await supabase.rpc('commerce_get_latest_custom_cape_design');
  if (error) throw error;
  return (data as CustomCapeDesignRecord | null) ?? null;
}

export async function createOrUpdateCustomCapeDraft(input: CreateOrUpdateCustomCapeDraftInput) {
  const { data, error } = await supabase.rpc('commerce_create_or_update_custom_cape_draft', {
    p_design_id: input.design_id ?? null,
    p_source_image_path: input.source_image_path ?? null,
    p_source_image_url: input.source_image_url ?? null,
    p_crop_x: input.crop_x ?? null,
    p_crop_y: input.crop_y ?? null,
    p_crop_width: input.crop_width ?? null,
    p_crop_height: input.crop_height ?? null,
    p_export_width: input.export_width ?? 2048
  });
  if (error) throw error;
  return data as CustomCapeDesignRecord | null;
}

export async function uploadCustomCapeSourceImage(userId: string, file: File) {
  const extension = file.name.includes('.') ? file.name.split('.').pop()?.toLowerCase() ?? 'png' : 'png';
  const objectPath = `${userId}/source/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from('custom-capes').upload(objectPath, file, {
    contentType: file.type || 'application/octet-stream',
    cacheControl: '3600',
    upsert: false
  });
  if (error) throw error;
  const { data } = supabase.storage.from('custom-capes').getPublicUrl(objectPath);
  return {
    path: objectPath,
    publicUrl: data.publicUrl
  };
}

export async function uploadCustomCapeFinalAtlas(userId: string, designId: string, blob: Blob) {
  const objectPath = `${userId}/final/${designId}-${Date.now()}.png`;
  const { error } = await supabase.storage.from('custom-capes').upload(objectPath, blob, {
    contentType: 'image/png',
    cacheControl: '31536000',
    upsert: false
  });
  if (error) throw error;
  const { data } = supabase.storage.from('custom-capes').getPublicUrl(objectPath);
  return {
    path: objectPath,
    publicUrl: data.publicUrl
  };
}

export async function finalizeCustomCapeExport(designId: string, finalAssetPath: string, finalAssetUrl: string, idempotencyKey: string) {
  const { data, error } = await supabase.rpc('commerce_finalize_custom_cape_export', {
    p_design_id: designId,
    p_final_asset_path: finalAssetPath,
    p_final_asset_url: finalAssetUrl,
    p_idempotency_key: idempotencyKey
  });
  if (error) throw error;
  const rows = (data ?? []) as FinalizeCustomCapeExportResult[];
  return rows[0] ?? null;
}

export async function deleteOwnedCustomCape(capeId: string) {
  const userId = await getSupabaseUserId();
  if (!userId) throw new Error('missing_user_session');

  const { data: entitlement, error: entitlementError } = await supabase
    .from('commerce_cape_entitlements')
    .select('id,source')
    .eq('user_id', userId)
    .eq('cape_id', capeId)
    .maybeSingle();
  if (entitlementError) throw entitlementError;
  if (!entitlement) throw new Error('custom_cape_not_owned');
  if (!String(entitlement.source ?? '').toLowerCase().includes('custom')) {
    throw new Error('only_custom_capes_can_be_deleted');
  }

  const { data: loadout, error: loadoutError } = await supabase
    .from('commerce_cape_loadout')
    .select('equipped_cape_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (loadoutError) throw loadoutError;
  if (loadout?.equipped_cape_id === capeId) {
    await setCapeLoadout(null);
  }

  const { error: entitlementDeleteError } = await supabase
    .from('commerce_cape_entitlements')
    .delete()
    .eq('user_id', userId)
    .eq('cape_id', capeId);
  if (entitlementDeleteError) throw entitlementDeleteError;

  const { error: draftUpdateError } = await supabase
    .from('commerce_custom_cape_designs')
    .update({
      purchased: false,
      generated_cape_id: null,
      final_asset_path: null,
      final_asset_url: null,
      updated_at: new Date().toISOString()
    })
    .eq('user_id', userId)
    .eq('generated_cape_id', capeId);
  if (draftUpdateError) throw draftUpdateError;

  const { error: capeDeleteError } = await supabase
    .from('commerce_capes')
    .delete()
    .eq('id', capeId)
    .eq('created_by', userId);
  if (capeDeleteError) throw capeDeleteError;

  return true;
}

export function getCustomCapePublicUrl(path: string) {
  const { data } = supabase.storage.from('custom-capes').getPublicUrl(path);
  return data.publicUrl;
}

export function subscribeOwnCustomCapeDrafts(userId: string, onChange: () => void) {
  const channel = supabase
    .channel(`commerce-custom-cape-designs-${userId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'commerce_custom_cape_designs', filter: `user_id=eq.${userId}` },
      () => onChange()
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

export function subscribeOwnLoadout(userId: string, onChange: () => void) {
  const channel = supabase
    .channel(`commerce-loadout-${userId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'commerce_cape_loadout', filter: `user_id=eq.${userId}` },
      () => onChange()
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

export function subscribeOwnWallet(userId: string, onChange: () => void) {
  const channel = supabase
    .channel(`commerce-wallet-${userId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'commerce_wallets', filter: `user_id=eq.${userId}` },
      () => onChange()
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

export function subscribePreviewAppearance(onChange: () => void) {
  const channel = supabase
    .channel('commerce-preview-appearance-global')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'commerce_preview_settings', filter: 'scope=eq.global' },
      () => onChange()
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

export function subscribePartnerGroups(onChange: () => void) {
  const channel = supabase
    .channel('commerce-partner-groups')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'commerce_partner_groups' }, () => onChange())
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

export function subscribeRarityPresets(onChange: () => void) {
  const channel = supabase
    .channel('commerce-rarity-presets')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'commerce_rarity_presets' }, () => onChange())
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
