import { supabase, ACTIVE_SUPABASE_ANON_KEY, ACTIVE_SUPABASE_URL } from './supabase';
import type {
  AnimatedCapeManifest as RuntimeManifest
} from '../types/animatedCapeManifest';

export const ANIMATED_CAPE_ALLOWED_FPS = [12, 15, 24] as const;
export const ANIMATED_CAPE_ALLOWED_DURATIONS = [3, 4, 5] as const;

export type AnimatedCapeFps = (typeof ANIMATED_CAPE_ALLOWED_FPS)[number];
export type AnimatedCapeDuration = (typeof ANIMATED_CAPE_ALLOWED_DURATIONS)[number];

export type AnimatedCapeTier = {
  fps: AnimatedCapeFps;
  durationSeconds: AnimatedCapeDuration;
  costBb: number;
  enabled: boolean;
};

export const ANIMATED_CAPE_PRICING_TABLE: AnimatedCapeTier[] = [
  { fps: 12, durationSeconds: 3, costBb: 1500, enabled: true },
  { fps: 12, durationSeconds: 4, costBb: 1600, enabled: true },
  { fps: 12, durationSeconds: 5, costBb: 1800, enabled: true },
  { fps: 15, durationSeconds: 3, costBb: 2000, enabled: true },
  { fps: 15, durationSeconds: 4, costBb: 2100, enabled: true },
  { fps: 15, durationSeconds: 5, costBb: 2200, enabled: true },
  { fps: 24, durationSeconds: 3, costBb: 2800, enabled: true }
];

export type AnimatedCapeUploadTicket = {
  upload_id: string;
  media_type: 'gif' | 'mp4';
  storage_path: string;
  token: string | null;
  signed_url: string | null;
  path: string;
};

export type AnimatedCapeUploadRecord = {
  id: string;
  user_id: string;
  media_type: 'gif' | 'mp4';
  bucket_id: string;
  storage_path: string;
  original_file_name: string | null;
  content_type: string | null;
  file_size_bytes: number | null;
  source_duration_ms: number | null;
  source_width: number | null;
  source_height: number | null;
  created_at: string;
  updated_at: string;
};

export type AnimatedCapeOrderRow = {
  id: string;
  user_id: string;
  upload_media_id: string;
  source_type: 'gif' | 'mp4';
  source_storage_path: string;
  selected_fps: number;
  selected_duration_seconds: number;
  cost_bloom_bucks: number;
  status: 'upload_pending' | 'queued' | 'processing' | 'completed' | 'failed' | 'refunded';
  processing_error_code: string | null;
  processing_error_message: string | null;
  idempotency_key: string;
  crop_x: number | null;
  crop_y: number | null;
  crop_w: number | null;
  crop_h: number | null;
  manifest_storage_path: string | null;
  thumbnail_storage_path: string | null;
  preview_storage_path: string | null;
  created_cosmetic_id: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  refunded_at: string | null;
  cosmetic_slug: string | null;
  cosmetic_name: string | null;
  cosmetic_texture_url: string | null;
  cosmetic_preview_url: string | null;
  cosmetic_visibility: string | null;
  cosmetic_disabled: boolean | null;
  asset_fps: number | null;
  asset_duration_seconds: number | null;
  asset_frame_count: number | null;
  asset_frame_width: number | null;
  asset_frame_height: number | null;
  asset_atlas_page_count: number | null;
  asset_manifest_storage_path: string | null;
  asset_thumbnail_storage_path: string | null;
  asset_preview_storage_path: string | null;
  atlas_pages: Array<{
    page_index: number;
    storage_path: string;
    width: number;
    height: number;
  }> | null;
};

export type AnimatedCapeOrderResult = {
  order_id: string;
  status: AnimatedCapeOrderRow['status'];
  cost_bloom_bucks: number;
  balance_after: number;
};

export type AnimatedCapeCancelResult = {
  order_id: string;
  status: AnimatedCapeOrderRow['status'];
  refunded_amount: number;
  balance_after: number;
};

export type RuntimeAtlasPage = {
  page_index: number;
  storage_path: string;
  width: number;
  height: number;
};

export type AnimatedCapeCrop = {
  x: number;
  y: number;
  w: number;
  h: number;
};

function normalizeSupabaseUrl(raw: string) {
  const value = raw.trim();
  if (!value) return value;
  try {
    const parsed = new URL(value);
    if (parsed.pathname.startsWith('/project/')) {
      return parsed.origin;
    }
    return `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}`;
  } catch {
    return value;
  }
}

const SUPABASE_URL_RAW = String(ACTIVE_SUPABASE_URL || 'https://sb.bloomclient.org').trim().replace(/\/+$/, '');
const SUPABASE_URL = normalizeSupabaseUrl(SUPABASE_URL_RAW);
const SUPABASE_ANON_KEY = (ACTIVE_SUPABASE_ANON_KEY || '').trim();

function normalizeFileType(type: string) {
  const lower = type.toLowerCase();
  if (lower.includes('gif')) return 'gif' as const;
  if (lower.includes('mp4')) return 'mp4' as const;
  return null;
}

function isAllowedCombo(fps: number, duration: number) {
  return ANIMATED_CAPE_PRICING_TABLE.some((tier) => tier.enabled && tier.fps === fps && tier.durationSeconds === duration);
}

export function resolveAnimatedCapePrice(fps: number, durationSeconds: number) {
  const tier = ANIMATED_CAPE_PRICING_TABLE.find((candidate) => candidate.enabled && candidate.fps === fps && candidate.durationSeconds === durationSeconds);
  return tier?.costBb ?? null;
}

export function getAllowedDurationsForFps(fps: number) {
  return ANIMATED_CAPE_ALLOWED_DURATIONS.filter((duration) => isAllowedCombo(fps, duration));
}

async function ensureSession() {
  const missingMessage = 'Auth session missing! Please sign in again from Bloom Client.';

  const readSession = async () => {
    const res = await supabase.auth.getSession();
    if (res.error) throw res.error;
    return res.data.session;
  };

  let session = await readSession();
  if (!session) {
    const refreshed = await supabase.auth.refreshSession();
    if (refreshed.error) {
      throw new Error(missingMessage);
    }
    session = refreshed.data.session ?? (await readSession());
  }

  if (!session?.access_token) {
    throw new Error(missingMessage);
  }

  return session;
}

async function callMainEdge<T>(route: string, method: 'GET' | 'POST', body?: Record<string, unknown>): Promise<T> {
  const initialSession = await ensureSession();
  let session = initialSession;

  const makeHeaders = (token: string | null | undefined): Record<string, string> => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (SUPABASE_ANON_KEY) headers.apikey = SUPABASE_ANON_KEY;
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  };

  const primaryUrl = `${SUPABASE_URL}/functions/v1/main${route}`;
  const fallbackUrl = `${SUPABASE_URL_RAW}/functions/v1/main${route}`;
  const requestId = `animated-edge-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  // Debug tracing for edge_405 and route/method mismatches.
  console.info('[ANIMATED_CAPE][EDGE][REQUEST]', {
    requestId,
    method,
    url: primaryUrl,
    hasAuth: Boolean(session?.access_token),
    body
  });

  const doRequest = async (token: string | null | undefined) => {
    let url = primaryUrl;
    let response = await fetch(url, {
      method,
      headers: makeHeaders(token),
      body: body ? JSON.stringify(body) : undefined
    });

    let text = await response.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }

    if (!response.ok && (response.status === 401 || response.status === 404 || response.status === 405) && fallbackUrl !== primaryUrl) {
      url = fallbackUrl;
      response = await fetch(url, {
        method,
        headers: makeHeaders(token),
        body: body ? JSON.stringify(body) : undefined
      });
      text = await response.text();
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        parsed = text;
      }
    }

    return { url, response, parsed };
  };

  const currentToken = (await supabase.auth.getSession()).data.session?.access_token ?? session?.access_token;
  let { url, response, parsed } = await doRequest(currentToken);

  console.info('[ANIMATED_CAPE][EDGE][RESPONSE]', {
    requestId,
    method,
    url,
    status: response.status,
    ok: response.ok,
    body: parsed
  });

  if (!response.ok) {
    let payload = parsed as { error?: string; message?: string } | null;
    let message = payload?.message || payload?.error || `edge_${response.status}`;
    if (response.status === 401) {
      const refreshed = await supabase.auth.refreshSession();
      const retryToken = refreshed.data.session?.access_token ?? (await supabase.auth.getSession()).data.session?.access_token;
      if (retryToken) {
        const retry = await doRequest(retryToken);
        url = retry.url;
        response = retry.response;
        parsed = retry.parsed;
        payload = parsed as { error?: string; message?: string } | null;
        message = payload?.message || payload?.error || `edge_${response.status}`;
      }
      if (!response.ok && response.status === 401) {
        throw new Error(message);
      }
      if (response.ok) {
        return parsed as T;
      }
    }
    console.error('[ANIMATED_CAPE][EDGE][ERROR]', {
      requestId,
      method,
      url,
      status: response.status,
      payload
    });
    throw new Error(message);
  }

  return parsed as T;
}

export function buildAnimatedCapeIdempotencyKey() {
  return `animated-${crypto.randomUUID()}`;
}

export async function createAnimatedCapeUploadTicket(file: File) {
  const guessedType = normalizeFileType(file.type) || (file.name.toLowerCase().endsWith('.gif') ? 'gif' : file.name.toLowerCase().endsWith('.mp4') ? 'mp4' : null);
  if (!guessedType) {
    throw new Error('unsupported_media_type');
  }

  try {
    const payload = await callMainEdge<{ ok: boolean; upload: AnimatedCapeUploadTicket }>('/animated-cape/upload-url', 'POST', {
      file_name: file.name,
      content_type: file.type,
      media_type: guessedType
    });
    return payload.upload;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.toLowerCase().includes('edge_500')) {
      throw error;
    }

    // Edge upload-url fallback: create signed upload URL directly via Storage.
    const userRes = await supabase.auth.getUser();
    const userId = userRes.data.user?.id;
    if (!userId) {
      throw error;
    }

    const uploadId = crypto.randomUUID();
    const ext = guessedType === 'gif' ? 'gif' : 'mp4';
    const storagePath = `animated-capes/${userId}/${uploadId}/source.${ext}`;
    const signed = await supabase.storage
      .from('animated-cape-uploads')
      .createSignedUploadUrl(storagePath);

    if (signed.error || !signed.data) {
      throw new Error(signed.error?.message || message);
    }

    return {
      upload_id: uploadId,
      media_type: guessedType,
      storage_path: storagePath,
      token: signed.data.token ?? null,
      signed_url: (signed.data as { signedUrl?: string }).signedUrl ?? null,
      path: signed.data.path ?? storagePath
    };
  }
}

export async function uploadAnimatedCapeSourceFile(ticket: AnimatedCapeUploadTicket, file: File) {
  if (!ticket.token || !ticket.path) {
    throw new Error('invalid_upload_ticket');
  }

  const { error } = await supabase.storage.from('animated-cape-uploads').uploadToSignedUrl(ticket.path, ticket.token, file, {
    contentType: file.type || (ticket.media_type === 'gif' ? 'image/gif' : 'video/mp4'),
    upsert: false
  });

  if (error) throw error;
}

export async function registerAnimatedCapeUpload(input: {
  mediaType: 'gif' | 'mp4';
  storagePath: string;
  originalFileName: string;
  contentType: string;
  fileSizeBytes: number;
  sourceDurationMs?: number | null;
  sourceWidth?: number | null;
  sourceHeight?: number | null;
}) {
  try {
    const payload = await callMainEdge<{ ok: boolean; upload: AnimatedCapeUploadRecord }>('/animated-cape/register-upload', 'POST', {
      media_type: input.mediaType,
      storage_path: input.storagePath,
      original_file_name: input.originalFileName,
      content_type: input.contentType,
      file_size_bytes: input.fileSizeBytes,
      source_duration_ms: input.sourceDurationMs ?? null,
      source_width: input.sourceWidth ?? null,
      source_height: input.sourceHeight ?? null
    });
    return payload.upload;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.toLowerCase().includes('edge_500')) {
      throw error;
    }

    const rpc = await supabase.rpc('commerce_register_uploaded_media', {
      p_media_type: input.mediaType,
      p_storage_path: input.storagePath,
      p_original_file_name: input.originalFileName,
      p_content_type: input.contentType,
      p_file_size_bytes: Math.max(0, Math.round(input.fileSizeBytes)),
      p_source_duration_ms: input.sourceDurationMs ?? null,
      p_source_width: input.sourceWidth ?? null,
      p_source_height: input.sourceHeight ?? null
    });
    if (rpc.error) {
      throw new Error(rpc.error.message || message);
    }
    return rpc.data as AnimatedCapeUploadRecord;
  }
}

export async function createAnimatedCapeOrder(input: {
  uploadMediaId: string;
  fps: AnimatedCapeFps;
  durationSeconds: AnimatedCapeDuration;
  idempotencyKey: string;
  crop: AnimatedCapeCrop;
}) {
  const expectedPrice = resolveAnimatedCapePrice(input.fps, input.durationSeconds);
  if (!expectedPrice) {
    throw new Error('invalid_fps_duration_tier');
  }

  try {
    const payload = await callMainEdge<{ ok: boolean; order: AnimatedCapeOrderResult }>('/animated-cape/order', 'POST', {
      upload_media_id: input.uploadMediaId,
      selected_fps: input.fps,
      selected_duration_seconds: input.durationSeconds,
      idempotency_key: input.idempotencyKey,
      crop_x: input.crop.x,
      crop_y: input.crop.y,
      crop_w: input.crop.w,
      crop_h: input.crop.h
    });

    return payload.order;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.toLowerCase().includes('edge_500')) {
      throw error;
    }

    const rpc = await supabase.rpc('commerce_create_animated_cape_order', {
      p_upload_media_id: input.uploadMediaId,
      p_selected_fps: input.fps,
      p_selected_duration_seconds: input.durationSeconds,
      p_idempotency_key: input.idempotencyKey,
      p_crop_x: input.crop.x,
      p_crop_y: input.crop.y,
      p_crop_w: input.crop.w,
      p_crop_h: input.crop.h
    });

    if (rpc.error) {
      throw new Error(rpc.error.message || message);
    }

    const row = Array.isArray(rpc.data) ? rpc.data[0] : rpc.data;
    if (!row) {
      throw new Error('order_create_failed');
    }

    return {
      order_id: String((row as { order_id?: string }).order_id ?? ''),
      status: String((row as { status?: string }).status ?? 'queued') as AnimatedCapeOrderResult['status'],
      cost_bloom_bucks: Number((row as { cost_bloom_bucks?: number }).cost_bloom_bucks ?? 0),
      balance_after: Number((row as { balance_after?: number }).balance_after ?? 0)
    };
  }
}

export async function listAnimatedCapeOrders(limit = 20) {
  try {
    const payload = await callMainEdge<{ ok: boolean; orders: AnimatedCapeOrderRow[] }>(
      `/animated-cape/orders?limit=${Math.max(1, Math.min(100, Math.round(limit)))}`,
      'GET'
    );
    return payload.orders ?? [];
  } catch (error) {
    const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
    if (
      message.includes('edge_405') ||
      message.includes('method_not_allowed') ||
      message.includes('edge_500') ||
      message.includes('edge_404')
    ) {
      const db = await supabase
        .from('v_commerce_animated_cape_orders')
        .select(
          'id,user_id,upload_media_id,source_type,source_storage_path,selected_fps,selected_duration_seconds,cost_bloom_bucks,status,processing_error_code,processing_error_message,idempotency_key,crop_x,crop_y,crop_w,crop_h,manifest_storage_path,thumbnail_storage_path,preview_storage_path,created_cosmetic_id,created_at,updated_at,completed_at,refunded_at,cosmetic_slug,cosmetic_name,cosmetic_texture_url,cosmetic_preview_url,cosmetic_visibility,cosmetic_disabled,asset_fps,asset_duration_seconds,asset_frame_count,asset_frame_width,asset_frame_height,asset_atlas_page_count,asset_manifest_storage_path,asset_thumbnail_storage_path,asset_preview_storage_path,atlas_pages'
        )
        .order('created_at', { ascending: false })
        .limit(Math.max(1, Math.min(100, Math.round(limit))));
      if (db.error) {
        throw new Error(db.error.message || 'orders_fetch_failed');
      }
      return (db.data ?? []) as AnimatedCapeOrderRow[];
    }
    throw error;
  }
}

export async function getAnimatedCapeOrder(orderId: string) {
  try {
    const payload = await callMainEdge<{ ok: boolean; order: AnimatedCapeOrderRow }>(`/animated-cape/orders/${orderId}`, 'GET');
    return payload.order;
  } catch (error) {
    const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
    if (
      message.includes('edge_405') ||
      message.includes('method_not_allowed') ||
      message.includes('edge_500') ||
      message.includes('edge_404')
    ) {
      const db = await supabase
        .from('v_commerce_animated_cape_orders')
        .select(
          'id,user_id,upload_media_id,source_type,source_storage_path,selected_fps,selected_duration_seconds,cost_bloom_bucks,status,processing_error_code,processing_error_message,idempotency_key,crop_x,crop_y,crop_w,crop_h,manifest_storage_path,thumbnail_storage_path,preview_storage_path,created_cosmetic_id,created_at,updated_at,completed_at,refunded_at,cosmetic_slug,cosmetic_name,cosmetic_texture_url,cosmetic_preview_url,cosmetic_visibility,cosmetic_disabled,asset_fps,asset_duration_seconds,asset_frame_count,asset_frame_width,asset_frame_height,asset_atlas_page_count,asset_manifest_storage_path,asset_thumbnail_storage_path,asset_preview_storage_path,atlas_pages'
        )
        .eq('id', orderId)
        .maybeSingle();
      if (db.error) {
        throw new Error(db.error.message || 'order_fetch_failed');
      }
      if (!db.data) {
        throw new Error('order_not_found');
      }
      return db.data as AnimatedCapeOrderRow;
    }
    throw error;
  }
}

export async function cancelAnimatedCapeOrder(orderId: string) {
  if (!orderId) throw new Error('order_id_required');

  try {
    const payload = await callMainEdge<{ ok: boolean; result: AnimatedCapeCancelResult }>(
      `/animated-cape/orders/${orderId}/cancel`,
      'POST'
    );
    return payload.result;
  } catch (error) {
    const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
    if (message.includes('edge_404') || message.includes('edge_405') || message.includes('edge_500')) {
      const rpc = await supabase.rpc('commerce_cancel_animated_cape_order', { p_order_id: orderId });
      if (rpc.error) {
        throw new Error(rpc.error.message || 'cancel_order_failed');
      }
      const row = Array.isArray(rpc.data) ? rpc.data[0] : rpc.data;
      if (!row) throw new Error('cancel_order_failed');
      return {
        order_id: String((row as { order_id?: string }).order_id ?? orderId),
        status: String((row as { status?: string }).status ?? 'refunded') as AnimatedCapeOrderRow['status'],
        refunded_amount: Number((row as { refunded_amount?: number }).refunded_amount ?? 0),
        balance_after: Number((row as { balance_after?: number }).balance_after ?? 0),
      };
    }
    if (message.includes('edge_400') || message.includes('cancel_order_failed') || message.includes('function')) {
      const rpc = await supabase.rpc('commerce_cancel_animated_cape_order', { p_order_id: orderId });
      if (rpc.error) {
        throw new Error(rpc.error.message || 'cancel_order_failed');
      }
      const row = Array.isArray(rpc.data) ? rpc.data[0] : rpc.data;
      if (!row) throw new Error('cancel_order_failed');
      return {
        order_id: String((row as { order_id?: string }).order_id ?? orderId),
        status: String((row as { status?: string }).status ?? 'refunded') as AnimatedCapeOrderRow['status'],
        refunded_amount: Number((row as { refunded_amount?: number }).refunded_amount ?? 0),
        balance_after: Number((row as { balance_after?: number }).balance_after ?? 0),
      };
    }
    throw error;
  }
}

export function getProcessedCapePublicUrl(storagePath: string) {
  const { data } = supabase.storage.from('animated-cape-processed').getPublicUrl(storagePath);
  return data.publicUrl;
}

export async function loadAnimatedCapeManifestFromStoragePath(storagePath: string): Promise<RuntimeManifest> {
  const response = await fetch(getProcessedCapePublicUrl(storagePath), { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`manifest_fetch_failed:${response.status}`);
  }
  const json = (await response.json()) as RuntimeManifest;
  return json;
}

export function subscribeAnimatedOrders(userId: string, onChange: () => void) {
  const channel = supabase
    .channel(`animated-cape-orders-${userId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'commerce_animated_cape_orders', filter: `user_id=eq.${userId}` },
      () => onChange()
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

export function subscribeAnimatedAssets(onChange: () => void) {
  const channel = supabase
    .channel('animated-cape-assets')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'commerce_cape_animation_assets' }, () => onChange())
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}


