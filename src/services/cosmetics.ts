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
  if (!sessionRes.data.session) {
    const anonRes = await supabase.auth.signInAnonymously();
    if (anonRes.error) throw anonRes.error;
  }
}

export async function ensureCommerceIdentity(mcUuid: string, username: string, displayName?: string | null) {
  await ensureSession();
  const { data, error } = await supabase.rpc('commerce_sync_identity', {
    p_mc_uuid: mcUuid,
    p_username: username,
    p_display_name: displayName ?? username
  });
  if (error) throw error;
  return data as CommerceProfile | null;
}

export async function loadShopCapes(search: string, rarity: string | null) {
  let query = supabase
    .from('commerce_capes')
    .select(
      'id,slug,name,description,partner_group,texture_url,preview_url,price_bb,rarity,rarity_label,rarity_color_start,rarity_color_end,rarity_glow,sort_order,is_active,is_featured,created_at,updated_at'
    )
    .eq('is_active', true)
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
  const { data, error } = await supabase.rpc('commerce_list_owned_capes');
  if (error) throw error;
  return (data ?? []) as OwnedCapeRecord[];
}

export async function loadCurrentLoadout() {
  const { data, error } = await supabase
    .from('commerce_cape_loadout')
    .select('user_id,equipped_cape_id,updated_at')
    .maybeSingle();
  if (error) throw error;
  return data as { user_id: string; equipped_cape_id: string | null; updated_at: string } | null;
}

export async function loadWallet() {
  const { data, error } = await supabase
    .from('commerce_wallets')
    .select('user_id,balance_bb,updated_at')
    .maybeSingle();
  if (error) throw error;
  return data as WalletRecord | null;
}

export async function loadWalletLedger(limit = 20) {
  const { data, error } = await supabase.rpc('commerce_list_wallet_ledger', {
    p_limit: Math.max(1, Math.min(200, Math.round(limit)))
  });
  if (error) throw error;
  return (data ?? []) as WalletLedgerRecord[];
}

export async function loadCurrencyPacks() {
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
  const rows = (data ?? []) as LoadoutRecord[];
  return rows[0] ?? null;
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
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data.user?.id ?? null;
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
