import { supabase } from './supabase';

export type CommerceRole = 'user' | 'partner' | 'owner';

export type CommerceProfile = {
  user_id: string;
  username: string | null;
  display_name: string | null;
  mc_uuid: string | null;
  role: CommerceRole;
  created_at: string;
  updated_at: string;
};

export type CapeRecord = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  partner_group: string | null;
  partner_for_profits: boolean;
  texture_url: string;
  preview_url: string | null;
  price_bb: number;
  rarity: string;
  rarity_label: string | null;
  rarity_color_start: string | null;
  rarity_color_end: string | null;
  rarity_glow: string | null;
  render_pos_x: number | null;
  render_pos_y: number | null;
  render_pos_z: number | null;
  render_rot_x: number | null;
  render_rot_y: number | null;
  render_rot_z: number | null;
  render_depth_z: number | null;
  render_brightness: number | null;
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
  partner_for_profits?: boolean;
  texture_url: string;
  preview_url: string | null;
  rarity: string;
  rarity_label: string | null;
  rarity_color_start: string | null;
  rarity_color_end: string | null;
  rarity_glow: string | null;
  render_pos_x: number | null;
  render_pos_y: number | null;
  render_pos_z: number | null;
  render_rot_x: number | null;
  render_rot_y: number | null;
  render_rot_z: number | null;
  render_depth_z: number | null;
  render_brightness: number | null;
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

export type OwnerMemberRecord = {
  user_id: string;
  username: string | null;
  display_name: string | null;
  mc_uuid: string | null;
  role: CommerceRole;
  balance_bb: number;
  profile_updated_at: string;
  wallet_updated_at: string | null;
};

export type OwnerGrantCapeResult = {
  user_id: string;
  cape_id: string;
  cape_slug: string;
  already_owned: boolean;
  granted_at: string;
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
  tebex_package_id: string | null;
  is_active: boolean;
  sort_order: number;
};

export type OwnerCapeLiteRecord = {
  id: string;
  slug: string;
  name: string;
  rarity: string;
  partner_group: string | null;
  partner_for_profits: boolean;
  is_active: boolean;
};

export type OwnerPartnerCapeMappingRecord = {
  cape_id: string;
  cape_slug: string;
  cape_name: string;
  partner_group: string | null;
  partner_user_id: string | null;
  partner_username: string | null;
  partner_display_name: string | null;
  is_active: boolean;
  updated_at: string | null;
};

export type PartnerWalletRecord = {
  user_id: string;
  balance_bb: number;
  updated_at: string;
};

export type PartnerWalletLedgerRecord = {
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

export type PartnerCashoutRequestRecord = {
  id: string;
  user_id: string;
  username: string | null;
  display_name: string | null;
  requested_bb: number;
  status: 'pending' | 'approved' | 'paid' | 'rejected' | 'cancelled';
  note: string | null;
  requested_at: string;
  processed_at: string | null;
  processed_by: string | null;
  processed_note: string | null;
};

export type PartnerGiftResult = {
  gifted_to_user_id: string;
  gifted_to_username: string | null;
  cape_id: string;
  cape_slug: string;
  partner_wallet_balance_bb: number;
};

export type PartnerWalletPurchaseResult = {
  cape_id: string;
  cape_slug: string;
  partner_wallet_balance_bb: number;
  equipped_cape_id: string | null;
  already_owned: boolean;
};

export type PromoCodeRecord = {
  id: string;
  code: string;
  description: string | null;
  is_active: boolean;
  hidden_in_shop: boolean;
  max_redemptions: number | null;
  per_user_limit: number;
  expires_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type PromoCodeCapeLinkRecord = {
  promo_code_id: string;
  cape_id: string;
};

export type PromoRedeemResult = {
  code: string;
  granted_cape_slugs: string[];
  already_owned_cape_slugs: string[];
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
  partner_for_profits: boolean;
  texture_url: string;
  preview_url: string | null;
  price_bb: number;
  rarity: string;
  rarity_label: string | null;
  rarity_color_start: string | null;
  rarity_color_end: string | null;
  rarity_glow: string | null;
  render_pos_x: number | null;
  render_pos_y: number | null;
  render_pos_z: number | null;
  render_rot_x: number | null;
  render_rot_y: number | null;
  render_rot_z: number | null;
  render_depth_z: number | null;
  render_brightness: number | null;
  sort_order: number;
  is_active: boolean;
  is_featured: boolean;
};

export type CreateCapeListingInput = {
  slug: string;
  name: string;
  description?: string | null;
  texture_url: string;
  preview_url?: string | null;
  price_bb: number;
  rarity?: string;
  rarity_label?: string | null;
  rarity_color_start?: string | null;
  rarity_color_end?: string | null;
  rarity_glow?: string | null;
  sort_order?: number;
  is_active?: boolean;
  is_featured?: boolean;
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

type TebexCheckoutCreateResponse = {
  ok: boolean;
  ident?: string | null;
  checkout_url?: string | null;
  error?: string;
  message?: string;
};

function resolveEdgeBase() {
  const raw = String(import.meta.env.VITE_SUPABASE_URL || 'https://sb.bloomclient.org').trim();
  try {
    return new URL(raw).origin.replace(/\/+$/, '');
  } catch {
    return raw.replace(/\/+$/, '');
  }
}

function extractEdgeError(payload: unknown, fallback = 'edge_request_failed') {
  if (!payload || typeof payload !== 'object') return fallback;
  const obj = payload as Record<string, unknown>;
  return (
    (typeof obj.message === 'string' && obj.message) ||
    (typeof obj.error === 'string' && obj.error) ||
    fallback
  );
}

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
      'id,slug,name,description,partner_group,partner_for_profits,texture_url,preview_url,price_bb,rarity,rarity_label,rarity_color_start,rarity_color_end,rarity_glow,render_pos_x,render_pos_y,render_pos_z,render_rot_x,render_rot_y,render_rot_z,render_depth_z,render_brightness,sort_order,is_active,is_featured,created_at,updated_at'
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

export async function setOwnWalletBalance(balanceBb: number) {
  const value = Math.max(0, Math.floor(balanceBb));
  const { data, error } = await supabase.rpc('commerce_set_own_wallet_balance', {
    p_balance_bb: value
  });
  if (error) throw error;
  const row = Array.isArray(data) ? ((data as WalletRecord[])[0] ?? null) : ((data as WalletRecord | null) ?? null);
  if (!row) {
    throw new Error('wallet_update_failed');
  }
  return row;
}

export async function setUserWalletBalance(username: string, balanceBb: number) {
  const value = Math.max(0, Math.floor(balanceBb));
  const cleanUsername = username.trim();
  const { data, error } = await supabase.rpc('commerce_set_user_wallet_balance', {
    p_username: cleanUsername,
    p_balance_bb: value
  });
  if (error) throw error;
  const row = Array.isArray(data) ? ((data as WalletRecord[])[0] ?? null) : ((data as WalletRecord | null) ?? null);
  if (!row) {
    throw new Error('profile_not_found_or_wallet_update_failed');
  }
  return row;
}

export async function setUserWalletBalanceById(userId: string, balanceBb: number) {
  const value = Math.max(0, Math.floor(balanceBb));
  const cleanUserId = userId.trim();
  const { data, error } = await supabase.rpc('commerce_set_user_wallet_balance_by_id', {
    p_user_id: cleanUserId,
    p_balance_bb: value
  });
  if (error) throw error;
  const row = Array.isArray(data) ? ((data as WalletRecord[])[0] ?? null) : ((data as WalletRecord | null) ?? null);
  if (!row) {
    throw new Error('profile_not_found_or_wallet_update_failed');
  }
  return row;
}

export async function setUserRole(username: string, role: CommerceRole) {
  const cleanUsername = username.trim();
  const cleanRole: CommerceRole = role === 'owner' ? 'owner' : role === 'partner' ? 'partner' : 'user';
  const { data, error } = await supabase.rpc('commerce_set_user_role', {
    p_username: cleanUsername,
    p_role: cleanRole
  });
  if (error) throw error;
  const row = Array.isArray(data) ? ((data as CommerceProfile[])[0] ?? null) : ((data as CommerceProfile | null) ?? null);
  if (!row) {
    throw new Error('profile_not_found_or_role_update_failed');
  }
  return row;
}

export async function setUserRoleById(userId: string, role: CommerceRole) {
  const cleanUserId = userId.trim();
  const cleanRole: CommerceRole = role === 'owner' ? 'owner' : role === 'partner' ? 'partner' : 'user';
  const { data, error } = await supabase.rpc('commerce_set_user_role_by_id', {
    p_user_id: cleanUserId,
    p_role: cleanRole
  });
  if (error) throw error;
  const row = Array.isArray(data) ? ((data as CommerceProfile[])[0] ?? null) : ((data as CommerceProfile | null) ?? null);
  if (!row) {
    throw new Error('profile_not_found_or_role_update_failed');
  }
  return row;
}

export async function loadOwnerMembers() {
  const { data, error } = await supabase.rpc('commerce_owner_list_members');
  if (error) throw error;
  return (data ?? []) as OwnerMemberRecord[];
}

export async function ownerGrantCapeToUser(userId: string, capeNameOrSlug: string) {
  const targetUserId = userId.trim();
  const targetCape = capeNameOrSlug.trim();
  const { data, error } = await supabase.rpc('commerce_owner_grant_cape_to_user', {
    p_user_id: targetUserId,
    p_cape_name_or_slug: targetCape
  });
  if (error) throw error;
  const row = Array.isArray(data) ? ((data as OwnerGrantCapeResult[])[0] ?? null) : ((data as OwnerGrantCapeResult | null) ?? null);
  if (!row) {
    throw new Error('grant_failed');
  }
  return row;
}

export async function loadOwnerCapesLite() {
  const { data, error } = await supabase
    .from('commerce_capes')
    .select('id,slug,name,rarity,partner_group,partner_for_profits,is_active')
    .order('name', { ascending: true });
  if (error) throw error;
  return (data ?? []) as OwnerCapeLiteRecord[];
}

export async function loadOwnerPartnerCapeMappings() {
  const { data, error } = await supabase.rpc('commerce_owner_list_partner_cape_mappings');
  if (error) throw error;
  return (data ?? []) as OwnerPartnerCapeMappingRecord[];
}

export async function setOwnerPartnerCapeMapping(capeId: string, partnerUserId: string, isActive = true) {
  const { data, error } = await supabase.rpc('commerce_owner_set_partner_cape_mapping', {
    p_cape_id: capeId.trim(),
    p_partner_user_id: partnerUserId.trim(),
    p_is_active: isActive
  });
  if (error) throw error;
  return Array.isArray(data) ? data[0] ?? null : data ?? null;
}

export async function clearOwnerPartnerCapeMapping(capeId: string) {
  const { data, error } = await supabase.rpc('commerce_owner_clear_partner_cape_mapping', {
    p_cape_id: capeId.trim()
  });
  if (error) throw error;
  return Boolean(data);
}

export async function loadOwnerPartnerWallets() {
  const { data, error } = await supabase
    .from('commerce_partner_wallets')
    .select('user_id,balance_bb,updated_at')
    .order('balance_bb', { ascending: false });
  if (error) throw error;
  return (data ?? []) as PartnerWalletRecord[];
}

export async function loadOwnerPartnerWalletLedger(limit = 100) {
  const safeLimit = Math.max(1, Math.min(500, Math.floor(limit)));
  const { data, error } = await supabase
    .from('commerce_partner_wallet_ledger')
    .select('id,user_id,entry_type,amount_bb,balance_after,reference_type,reference_id,metadata,created_at')
    .order('created_at', { ascending: false })
    .limit(safeLimit);
  if (error) throw error;
  return (data ?? []) as PartnerWalletLedgerRecord[];
}

export async function loadOwnPartnerWallet() {
  const { data, error } = await supabase
    .from('commerce_partner_wallets')
    .select('user_id,balance_bb,updated_at')
    .maybeSingle();
  if (error) throw error;
  return data as PartnerWalletRecord | null;
}

export async function loadOwnPartnerWalletLedger(limit = 25) {
  const safeLimit = Math.max(1, Math.min(200, Math.floor(limit)));
  const { data, error } = await supabase.rpc('commerce_list_own_partner_wallet_ledger', {
    p_limit: safeLimit
  });
  if (error) throw error;
  return (data ?? []) as PartnerWalletLedgerRecord[];
}

export async function purchaseCapeWithPartnerWallet(slug: string, autoEquip = false) {
  const { data, error } = await supabase.rpc('commerce_purchase_cape_with_partner_wallet', {
    p_cape_slug: slug,
    p_auto_equip: autoEquip
  });
  if (error) throw error;
  const rows = (data ?? []) as PartnerWalletPurchaseResult[];
  return rows[0] ?? null;
}

export async function giftCapeWithPartnerWallet(slug: string, targetIdentifier: string, note?: string | null) {
  const { data, error } = await supabase.rpc('commerce_partner_gift_cape_from_wallet', {
    p_cape_slug: slug,
    p_target_identifier: targetIdentifier.trim(),
    p_note: note?.trim() || null
  });
  if (error) throw error;
  const rows = (data ?? []) as PartnerGiftResult[];
  return rows[0] ?? null;
}

export async function requestPartnerCashout(amountBb: number, note?: string | null) {
  const { data, error } = await supabase.rpc('commerce_partner_request_cashout', {
    p_amount_bb: Math.max(0, Math.floor(amountBb)),
    p_note: note?.trim() || null
  });
  if (error) throw error;
  return (data as PartnerCashoutRequestRecord | null) ?? null;
}

export async function loadOwnerPartnerCashoutRequests() {
  const { data, error } = await supabase.rpc('commerce_owner_list_partner_cashout_requests');
  if (error) throw error;
  return (data ?? []) as PartnerCashoutRequestRecord[];
}

export async function processOwnerPartnerCashout(
  requestId: string,
  action: 'approve' | 'paid' | 'reject',
  note?: string | null
) {
  const { data, error } = await supabase.rpc('commerce_owner_process_partner_cashout', {
    p_request_id: requestId.trim(),
    p_action: action,
    p_note: note?.trim() || null
  });
  if (error) throw error;
  return (data as PartnerCashoutRequestRecord | null) ?? null;
}

export async function loadOwnerPromoCodes() {
  const { data, error } = await supabase
    .from('commerce_promo_codes')
    .select('id,code,description,is_active,hidden_in_shop,max_redemptions,per_user_limit,expires_at,created_by,created_at,updated_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as PromoCodeRecord[];
}

export async function createOwnerPromoCode(input: {
  code: string;
  description?: string | null;
  is_active?: boolean;
  hidden_in_shop?: boolean;
  max_redemptions?: number | null;
  per_user_limit?: number;
  expires_at?: string | null;
}) {
  const cleanCode = input.code.trim().toLowerCase();
  const { data, error } = await supabase
    .from('commerce_promo_codes')
    .insert({
      code: cleanCode,
      description: input.description?.trim() || null,
      is_active: input.is_active ?? true,
      hidden_in_shop: input.hidden_in_shop ?? true,
      max_redemptions: input.max_redemptions ?? null,
      per_user_limit: Math.max(1, Math.floor(input.per_user_limit ?? 1)),
      expires_at: input.expires_at ?? null
    })
    .select('id,code,description,is_active,hidden_in_shop,max_redemptions,per_user_limit,expires_at,created_by,created_at,updated_at')
    .single();
  if (error) throw error;
  return data as PromoCodeRecord;
}

export async function updateOwnerPromoCode(
  promoCodeId: string,
  patch: Partial<{
    code: string;
    description: string | null;
    is_active: boolean;
    hidden_in_shop: boolean;
    max_redemptions: number | null;
    per_user_limit: number;
    expires_at: string | null;
  }>
) {
  const payload: Record<string, unknown> = {};
  if (typeof patch.code === 'string') payload.code = patch.code.trim().toLowerCase();
  if (patch.description !== undefined) payload.description = patch.description?.trim() || null;
  if (typeof patch.is_active === 'boolean') payload.is_active = patch.is_active;
  if (typeof patch.hidden_in_shop === 'boolean') payload.hidden_in_shop = patch.hidden_in_shop;
  if (patch.max_redemptions !== undefined) payload.max_redemptions = patch.max_redemptions;
  if (patch.per_user_limit !== undefined) payload.per_user_limit = Math.max(1, Math.floor(patch.per_user_limit));
  if (patch.expires_at !== undefined) payload.expires_at = patch.expires_at;
  const { data, error } = await supabase
    .from('commerce_promo_codes')
    .update(payload)
    .eq('id', promoCodeId)
    .select('id,code,description,is_active,hidden_in_shop,max_redemptions,per_user_limit,expires_at,created_by,created_at,updated_at')
    .single();
  if (error) throw error;
  return data as PromoCodeRecord;
}

export async function deleteOwnerPromoCode(promoCodeId: string) {
  const { error } = await supabase.from('commerce_promo_codes').delete().eq('id', promoCodeId);
  if (error) throw error;
}

export async function loadOwnerPromoCodeCapeLinks() {
  const { data, error } = await supabase
    .from('commerce_promo_code_capes')
    .select('promo_code_id,cape_id');
  if (error) throw error;
  return (data ?? []) as PromoCodeCapeLinkRecord[];
}

export async function setOwnerPromoCodeCapeLinks(promoCodeId: string, capeIds: string[]) {
  const uniqueCapeIds = Array.from(new Set(capeIds.map((id) => id.trim()).filter(Boolean)));
  const { error: deleteError } = await supabase
    .from('commerce_promo_code_capes')
    .delete()
    .eq('promo_code_id', promoCodeId);
  if (deleteError) throw deleteError;
  if (uniqueCapeIds.length === 0) return;
  const { error: insertError } = await supabase.from('commerce_promo_code_capes').insert(
    uniqueCapeIds.map((capeId) => ({
      promo_code_id: promoCodeId,
      cape_id: capeId
    }))
  );
  if (insertError) throw insertError;
}

export async function redeemPromoCode(code: string) {
  const { data, error } = await supabase.rpc('commerce_redeem_promo_code', {
    p_code: code.trim()
  });
  if (error) throw error;
  const row = Array.isArray(data) ? ((data as PromoRedeemResult[])[0] ?? null) : ((data as PromoRedeemResult | null) ?? null);
  if (!row) throw new Error('promo_redeem_failed');
  return row;
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
    .select('id,slug,name,price_usd,base_bb,bonus_bb,total_bb,tebex_package_id,is_active,sort_order')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data ?? []) as CurrencyPackRecord[];
}

export async function createTebexCheckoutSession(packageSlug: string) {
  const session = await supabase.auth.getSession();
  const token = session.data.session?.access_token;
  if (!token) throw new Error('auth_session_missing');

  const response = await fetch(`${resolveEdgeBase()}/functions/v1/main/tebex/create-checkout`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ package_slug: packageSlug })
  });

  const payload = (await response.json().catch(() => ({}))) as TebexCheckoutCreateResponse;
  if (!response.ok || !payload.ok) {
    throw new Error(extractEdgeError(payload, `tebex_checkout_${response.status}`));
  }

  return {
    ident: (payload.ident ?? '').trim() || null,
    checkoutUrl: (payload.checkout_url ?? '').trim() || null
  };
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

export async function updateCapeListing(capeId: string, patch: UpdateCapeInput) {
  const { data, error } = await supabase
    .from('commerce_capes')
    .update({
      slug: patch.slug,
      name: patch.name,
      description: patch.description,
      partner_group: patch.partner_group,
      partner_for_profits: patch.partner_for_profits,
      texture_url: patch.texture_url,
      preview_url: patch.preview_url,
      price_bb: patch.price_bb,
      rarity: patch.rarity,
      rarity_label: patch.rarity_label,
      rarity_color_start: patch.rarity_color_start,
      rarity_color_end: patch.rarity_color_end,
      rarity_glow: patch.rarity_glow,
      render_pos_x: patch.render_pos_x,
      render_pos_y: patch.render_pos_y,
      render_pos_z: patch.render_pos_z,
      render_rot_x: patch.render_rot_x,
      render_rot_y: patch.render_rot_y,
      render_rot_z: patch.render_rot_z,
      render_depth_z: patch.render_depth_z,
      render_brightness: patch.render_brightness,
      sort_order: patch.sort_order,
      is_active: patch.is_active,
      is_featured: patch.is_featured
    })
    .eq('id', capeId)
    .select(
      'id,slug,name,description,partner_group,partner_for_profits,texture_url,preview_url,price_bb,rarity,rarity_label,rarity_color_start,rarity_color_end,rarity_glow,render_pos_x,render_pos_y,render_pos_z,render_rot_x,render_rot_y,render_rot_z,render_depth_z,render_brightness,sort_order,is_active,is_featured,created_at,updated_at'
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

export async function loadAllCapeIdsForOwner() {
  const { data, error } = await supabase.from('commerce_capes').select('id');
  if (error) throw error;
  return ((data ?? []) as Array<{ id: string }>).map((row) => row.id);
}

export async function updateCapeRenderPose(
  capeId: string,
  pose: {
    render_pos_x: number;
    render_pos_y: number;
    render_pos_z: number;
    render_rot_x: number;
    render_rot_y: number;
    render_rot_z: number;
    render_depth_z: number;
    render_brightness: number;
  }
) {
  const { error } = await supabase
    .from('commerce_capes')
    .update({
      render_pos_x: pose.render_pos_x,
      render_pos_y: pose.render_pos_y,
      render_pos_z: pose.render_pos_z,
      render_rot_x: pose.render_rot_x,
      render_rot_y: pose.render_rot_y,
      render_rot_z: pose.render_rot_z,
      render_depth_z: pose.render_depth_z,
      render_brightness: pose.render_brightness
    })
    .eq('id', capeId);
  if (error) throw error;
}

export async function deactivateCapeListing(capeId: string) {
  const { data, error } = await supabase
    .from('commerce_capes')
    .update({
      is_active: false,
      updated_at: new Date().toISOString()
    })
    .eq('id', capeId)
    .select('id')
    .single();
  if (error) throw error;
  return data as { id: string };
}

export async function deleteOwnCustomCape(capeId: string) {
  const { data, error } = await supabase.rpc('commerce_delete_own_custom_cape', {
    p_cape_id: capeId
  });
  if (error) throw error;
  return (data as { deleted_cape_id: string; removed_entitlement: boolean } | null) ?? null;
}

export async function createCapeListing(input: CreateCapeListingInput) {
  const { data, error } = await supabase.rpc('create_cape_listing', {
    p_slug: input.slug.trim().toLowerCase(),
    p_name: input.name.trim(),
    p_description: input.description?.trim() || null,
    p_texture_url: input.texture_url.trim(),
    p_preview_url: input.preview_url?.trim() || null,
    p_price_bb: Math.max(0, Math.round(input.price_bb)),
    p_rarity: (input.rarity?.trim().toLowerCase() || 'custom'),
    p_rarity_label: input.rarity_label?.trim() || 'CUSTOM',
    p_rarity_color_start: input.rarity_color_start?.trim() || '#f472b6',
    p_rarity_color_end: input.rarity_color_end?.trim() || '#a855f7',
    p_rarity_glow: input.rarity_glow?.trim() || 'rgba(244,114,182,0.55)',
    p_sort_order: Number.isFinite(input.sort_order) ? Math.round(input.sort_order as number) : 9999,
    p_is_active: input.is_active ?? true,
    p_is_featured: input.is_featured ?? false
  });
  if (error) throw error;
  const row = Array.isArray(data) ? ((data as CapeRecord[])[0] ?? null) : ((data as CapeRecord | null) ?? null);
  if (!row) throw new Error('create_cape_listing_failed');
  return row;
}

export async function isCurrentUserOwner() {
  const userId = await getSupabaseUserId();
  if (!userId) return false;
  const { data, error } = await supabase
    .from('commerce_profiles')
    .select('role')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return (data?.role ?? 'user') === 'owner';
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

export function subscribeCapes(onChange: () => void) {
  const channel = supabase
    .channel('commerce-capes-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'commerce_capes' }, () => onChange())
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
