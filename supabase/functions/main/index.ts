import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type JsonObject = Record<string, unknown>;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const KOFI_VERIFICATION_TOKEN = Deno.env.get("KOFI_VERIFICATION_TOKEN") ?? "";
const ANIMATED_CAPE_WORKER_SECRET = Deno.env.get("ANIMATED_CAPE_WORKER_SECRET") ?? "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function jsonResponse(status: number, body: JsonObject) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json",
    },
  });
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeEmail(value: unknown): string | null {
  const raw = asString(value);
  if (!raw) return null;
  return raw.toLowerCase();
}

function normalizeUrl(value: unknown): string | null {
  const raw = asString(value);
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    const pathname = parsed.pathname.replace(/\/+$/, "");
    return `${parsed.origin}${pathname}`;
  } catch {
    return raw.replace(/\/+$/, "");
  }
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}

async function sha256(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex;
}

function asInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseInt(value.trim(), 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseFloat(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function inferMediaType(fileName: string | null, contentType: string | null): "gif" | "mp4" | null {
  const lowerName = fileName?.toLowerCase() ?? "";
  const lowerType = contentType?.toLowerCase() ?? "";
  if (lowerType.includes("gif") || lowerName.endsWith(".gif")) return "gif";
  if (lowerType.includes("mp4") || lowerName.endsWith(".mp4")) return "mp4";
  return null;
}

function resolveUploadExtension(mediaType: "gif" | "mp4"): string {
  return mediaType === "gif" ? "gif" : "mp4";
}

function buildAnimatedCapeUploadPath(userId: string, uploadId: string, extension: string): string {
  return `animated-capes/${userId}/${uploadId}/source.${extension}`;
}

function buildWorkerId(raw: string | null): string {
  const clean = raw?.trim();
  if (clean) return clean.slice(0, 128);
  return `worker-${crypto.randomUUID().slice(0, 12)}`;
}

async function readPayload(request: Request): Promise<JsonObject> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  const rawBody = await request.text();
  if (!rawBody.trim()) return {};

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const params = new URLSearchParams(rawBody);
    const nestedData = params.get("data");
    if (nestedData) {
      return JSON.parse(nestedData) as JsonObject;
    }
    return Object.fromEntries(params.entries());
  }

  if (contentType.includes("application/json")) {
    const parsed = JSON.parse(rawBody);
    if (parsed && typeof parsed === "object" && typeof (parsed as JsonObject).data === "string") {
      return JSON.parse((parsed as JsonObject).data as string) as JsonObject;
    }
    return parsed as JsonObject;
  }

  try {
    const parsed = JSON.parse(rawBody);
    if (parsed && typeof parsed === "object") return parsed as JsonObject;
  } catch {
    // noop
  }

  const params = new URLSearchParams(rawBody);
  const nestedData = params.get("data");
  if (nestedData) return JSON.parse(nestedData) as JsonObject;
  return Object.fromEntries(params.entries());
}

function getBearerToken(request: Request): string | null {
  const raw = request.headers.get("authorization");
  if (!raw) return null;
  const match = raw.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function createUserScopedClient(token: string, anonKeyOverride?: string | null) {
  const anonKey = anonKeyOverride?.trim() || SUPABASE_ANON_KEY;
  if (!anonKey) {
    throw new Error("SUPABASE_ANON_KEY_missing");
  }
  return createClient(SUPABASE_URL, anonKey, {
    auth: { persistSession: false },
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });
}

async function resolveAuthorizedUser(request: Request): Promise<{
  user: { id: string };
  token: string;
  userClient: ReturnType<typeof createUserScopedClient>;
} | { error: Response }> {
  const token = getBearerToken(request);
  if (!token) {
    return { error: jsonResponse(401, { ok: false, error: "missing_authorization" }) };
  }

  let userClient;
  try {
    const requestApiKey = request.headers.get("apikey");
    userClient = createUserScopedClient(token, requestApiKey);
  } catch (createError) {
    return {
      error: jsonResponse(503, {
        ok: false,
        error: "server_misconfigured",
        message: createError instanceof Error ? createError.message : String(createError),
      }),
    };
  }

  // Primary: verify token through service-role auth helper.
  const primary = await admin.auth.getUser(token);
  if (!primary.error && primary.data.user?.id) {
    return { user: { id: primary.data.user.id }, token, userClient };
  }

  // Fallback: verify token through anon-scoped client. This protects against
  // edge env drift where service-role verification is temporarily mismatched.
  const fallback = await userClient.auth.getUser();
  if (!fallback.error && fallback.data.user?.id) {
    return { user: { id: fallback.data.user.id }, token, userClient };
  }

  return {
    error: jsonResponse(401, {
      ok: false,
      error: "invalid_auth_session",
      message: primary.error?.message ?? fallback.error?.message ?? "user_not_found",
    }),
  };
}

function requireWorkerSecret(request: Request): Response | null {
  if (!ANIMATED_CAPE_WORKER_SECRET) {
    return jsonResponse(503, { ok: false, error: "worker_secret_not_configured" });
  }
  const incoming = request.headers.get("x-bloom-worker-secret")?.trim() ?? "";
  if (!incoming || incoming !== ANIMATED_CAPE_WORKER_SECRET) {
    return jsonResponse(401, { ok: false, error: "invalid_worker_secret" });
  }
  return null;
}

async function handleCustomCapeDraft(request: Request) {
  const token = getBearerToken(request);
  if (!token) {
    return jsonResponse(401, { ok: false, error: "missing_authorization" });
  }

  let payload: JsonObject;
  try {
    payload = await readPayload(request);
  } catch (error) {
    return jsonResponse(400, {
      ok: false,
      error: "invalid_payload",
      message: error instanceof Error ? error.message : String(error),
    });
  }

  let userClient;
  try {
    userClient = createUserScopedClient(token);
  } catch (error) {
    return jsonResponse(503, {
      ok: false,
      error: "server_misconfigured",
      message: error instanceof Error ? error.message : String(error),
    });
  }

  const { data, error } = await userClient.rpc("commerce_create_or_update_custom_cape_draft", {
    p_design_id: asString(payload.design_id),
    p_source_image_path: asString(payload.source_image_path),
    p_source_image_url: asString(payload.source_image_url),
    p_crop_x: typeof payload.crop_x === "number" ? payload.crop_x : null,
    p_crop_y: typeof payload.crop_y === "number" ? payload.crop_y : null,
    p_crop_width: typeof payload.crop_width === "number" ? payload.crop_width : null,
    p_crop_height: typeof payload.crop_height === "number" ? payload.crop_height : null,
    p_export_width: typeof payload.export_width === "number" ? Math.round(payload.export_width) : 2048,
  });

  if (error) {
    return jsonResponse(400, {
      ok: false,
      error: "draft_rpc_failed",
      message: error.message,
    });
  }

  return jsonResponse(200, { ok: true, draft: data as JsonObject | null });
}

async function handleCustomCapeDraftLatest(request: Request) {
  const token = getBearerToken(request);
  if (!token) {
    return jsonResponse(401, { ok: false, error: "missing_authorization" });
  }

  let userClient;
  try {
    userClient = createUserScopedClient(token);
  } catch (error) {
    return jsonResponse(503, {
      ok: false,
      error: "server_misconfigured",
      message: error instanceof Error ? error.message : String(error),
    });
  }

  const { data, error } = await userClient.rpc("commerce_get_latest_custom_cape_design");
  if (error) {
    return jsonResponse(400, {
      ok: false,
      error: "draft_latest_rpc_failed",
      message: error.message,
    });
  }
  return jsonResponse(200, { ok: true, draft: data as JsonObject | null });
}

async function handleCustomCapeFinalize(request: Request) {
  const token = getBearerToken(request);
  if (!token) {
    return jsonResponse(401, { ok: false, error: "missing_authorization" });
  }

  let payload: JsonObject;
  try {
    payload = await readPayload(request);
  } catch (error) {
    return jsonResponse(400, {
      ok: false,
      error: "invalid_payload",
      message: error instanceof Error ? error.message : String(error),
    });
  }

  let userClient;
  try {
    userClient = createUserScopedClient(token);
  } catch (error) {
    return jsonResponse(503, {
      ok: false,
      error: "server_misconfigured",
      message: error instanceof Error ? error.message : String(error),
    });
  }

  const designId = asString(payload.design_id);
  const finalAssetPath = asString(payload.final_asset_path);
  const finalAssetUrl = asString(payload.final_asset_url);
  const idempotencyKey = asString(payload.idempotency_key);

  if (!designId || !finalAssetPath || !finalAssetUrl || !idempotencyKey) {
    return jsonResponse(400, {
      ok: false,
      error: "missing_required_fields",
    });
  }

  const { data, error } = await userClient.rpc("commerce_finalize_custom_cape_export", {
    p_design_id: designId,
    p_final_asset_path: finalAssetPath,
    p_final_asset_url: finalAssetUrl,
    p_idempotency_key: idempotencyKey,
  });

  if (error) {
    return jsonResponse(400, {
      ok: false,
      error: "finalize_rpc_failed",
      message: error.message,
    });
  }

  const rows = Array.isArray(data) ? data : [];
  return jsonResponse(200, {
    ok: true,
    result: rows[0] ?? null,
  });
}

async function handleAnimatedCapeUploadUrl(request: Request) {
  const auth = await resolveAuthorizedUser(request);
  if ("error" in auth) return auth.error;

  let payload: JsonObject;
  try {
    payload = await readPayload(request);
  } catch (error) {
    return jsonResponse(400, {
      ok: false,
      error: "invalid_payload",
      message: error instanceof Error ? error.message : String(error),
    });
  }

  const fileName = asString(payload.file_name ?? payload.fileName);
  const contentType = asString(payload.content_type ?? payload.contentType);
  const requestedMediaType = asString(payload.media_type ?? payload.mediaType)?.toLowerCase() ?? null;
  const inferredType = inferMediaType(fileName, contentType);
  const mediaType = (requestedMediaType === "gif" || requestedMediaType === "mp4")
    ? requestedMediaType
    : inferredType;

  if (!mediaType) {
    return jsonResponse(400, { ok: false, error: "unsupported_media_type" });
  }

  const uploadId = crypto.randomUUID();
  const extension = resolveUploadExtension(mediaType);
  const storagePath = buildAnimatedCapeUploadPath(auth.user.id, uploadId, extension);

  const { data, error } = await admin.storage
    .from("animated-cape-uploads")
    .createSignedUploadUrl(storagePath);

  if (error || !data) {
    return jsonResponse(500, {
      ok: false,
      error: "signed_upload_url_failed",
      message: error?.message ?? "unknown_storage_error",
    });
  }

  return jsonResponse(200, {
    ok: true,
    upload: {
      upload_id: uploadId,
      media_type: mediaType,
      storage_path: storagePath,
      token: (data as Record<string, unknown>).token ?? null,
      signed_url: (data as Record<string, unknown>).signedUrl ?? null,
      path: (data as Record<string, unknown>).path ?? storagePath,
    },
  });
}

async function handleAnimatedCapeRegisterUpload(request: Request) {
  const auth = await resolveAuthorizedUser(request);
  if ("error" in auth) return auth.error;

  let payload: JsonObject;
  try {
    payload = await readPayload(request);
  } catch (error) {
    return jsonResponse(400, {
      ok: false,
      error: "invalid_payload",
      message: error instanceof Error ? error.message : String(error),
    });
  }

  const mediaType = asString(payload.media_type ?? payload.mediaType);
  const storagePath = asString(payload.storage_path ?? payload.storagePath);
  if (!mediaType || !storagePath) {
    return jsonResponse(400, { ok: false, error: "missing_required_fields" });
  }

  const { data, error } = await auth.userClient.rpc("commerce_register_uploaded_media", {
    p_media_type: mediaType,
    p_storage_path: storagePath,
    p_original_file_name: asString(payload.original_file_name ?? payload.originalFileName),
    p_content_type: asString(payload.content_type ?? payload.contentType),
    p_file_size_bytes: asInteger(payload.file_size_bytes ?? payload.fileSizeBytes),
    p_source_duration_ms: asInteger(payload.source_duration_ms ?? payload.sourceDurationMs),
    p_source_width: asInteger(payload.source_width ?? payload.sourceWidth),
    p_source_height: asInteger(payload.source_height ?? payload.sourceHeight),
  });

  if (error) {
    return jsonResponse(400, {
      ok: false,
      error: "register_upload_failed",
      message: error.message,
    });
  }

  return jsonResponse(200, { ok: true, upload: data });
}

async function handleAnimatedCapeCreateOrder(request: Request) {
  const auth = await resolveAuthorizedUser(request);
  if ("error" in auth) return auth.error;

  let payload: JsonObject;
  try {
    payload = await readPayload(request);
  } catch (error) {
    return jsonResponse(400, {
      ok: false,
      error: "invalid_payload",
      message: error instanceof Error ? error.message : String(error),
    });
  }

  const uploadMediaId = asString(payload.upload_media_id ?? payload.uploadMediaId);
  const selectedFps = asInteger(payload.selected_fps ?? payload.selectedFps);
  const selectedDuration = asInteger(payload.selected_duration_seconds ?? payload.selectedDurationSeconds);
  const idempotencyKey = asString(payload.idempotency_key ?? payload.idempotencyKey);

  if (!uploadMediaId || !selectedFps || !selectedDuration || !idempotencyKey) {
    return jsonResponse(400, { ok: false, error: "missing_required_fields" });
  }

  const { data, error } = await auth.userClient.rpc("commerce_create_animated_cape_order", {
    p_upload_media_id: uploadMediaId,
    p_selected_fps: selectedFps,
    p_selected_duration_seconds: selectedDuration,
    p_idempotency_key: idempotencyKey,
    p_crop_x: asNumber(payload.crop_x ?? payload.cropX),
    p_crop_y: asNumber(payload.crop_y ?? payload.cropY),
    p_crop_w: asNumber(payload.crop_w ?? payload.cropW),
    p_crop_h: asNumber(payload.crop_h ?? payload.cropH),
  });

  if (error) {
    return jsonResponse(400, {
      ok: false,
      error: "create_order_failed",
      message: error.message,
    });
  }

  const row = Array.isArray(data) ? data[0] ?? null : data;
  return jsonResponse(200, { ok: true, order: row });
}

async function handleAnimatedCapeListOrders(request: Request) {
  const auth = await resolveAuthorizedUser(request);
  if ("error" in auth) return auth.error;

  const limit = Math.max(1, Math.min(100, asInteger(new URL(request.url).searchParams.get("limit")) ?? 20));
  const { data, error } = await auth.userClient
    .from("v_commerce_animated_cape_orders")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return jsonResponse(400, { ok: false, error: "list_orders_failed", message: error.message });
  }
  return jsonResponse(200, { ok: true, orders: data ?? [] });
}

async function handleAnimatedCapeGetOrder(request: Request, orderId: string) {
  const auth = await resolveAuthorizedUser(request);
  if ("error" in auth) return auth.error;
  if (!orderId) return jsonResponse(400, { ok: false, error: "order_id_required" });

  const { data, error } = await auth.userClient
    .from("v_commerce_animated_cape_orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle();

  if (error) {
    return jsonResponse(400, { ok: false, error: "get_order_failed", message: error.message });
  }
  if (!data) {
    return jsonResponse(404, { ok: false, error: "order_not_found" });
  }
  return jsonResponse(200, { ok: true, order: data });
}

async function handleAnimatedCapeCancelOrder(request: Request, orderId: string) {
  const auth = await resolveAuthorizedUser(request);
  if ("error" in auth) return auth.error;
  if (!orderId) return jsonResponse(400, { ok: false, error: "order_id_required" });

  const { data, error } = await auth.userClient.rpc("commerce_cancel_animated_cape_order", {
    p_order_id: orderId,
  });

  if (error) {
    return jsonResponse(400, { ok: false, error: "cancel_order_failed", message: error.message });
  }

  const row = Array.isArray(data) ? data[0] ?? null : data;
  return jsonResponse(200, { ok: true, result: row });
}

async function handleAnimatedCapeWorkerClaim(request: Request) {
  const secretError = requireWorkerSecret(request);
  if (secretError) return secretError;

  let payload: JsonObject;
  try {
    payload = await readPayload(request);
  } catch {
    payload = {};
  }

  const workerId = buildWorkerId(asString(payload.worker_id ?? payload.workerId));
  const leaseSeconds = Math.max(30, Math.min(3600, asInteger(payload.lease_seconds ?? payload.leaseSeconds) ?? 300));

  const { data, error } = await admin.rpc("commerce_claim_media_job", {
    p_worker_id: workerId,
    p_lease_seconds: leaseSeconds,
  });

  if (error) {
    return jsonResponse(500, { ok: false, error: "claim_job_failed", message: error.message });
  }

  const row = Array.isArray(data) ? data[0] ?? null : data;
  return jsonResponse(200, { ok: true, job: row });
}

async function handleAnimatedCapeWorkerComplete(request: Request) {
  const secretError = requireWorkerSecret(request);
  if (secretError) return secretError;

  let payload: JsonObject;
  try {
    payload = await readPayload(request);
  } catch (error) {
    return jsonResponse(400, {
      ok: false,
      error: "invalid_payload",
      message: error instanceof Error ? error.message : String(error),
    });
  }

  const orderId = asString(payload.order_id ?? payload.orderId);
  if (!orderId) return jsonResponse(400, { ok: false, error: "order_id_required" });

  const { data, error } = await admin.rpc("commerce_complete_animated_cape_order", {
    p_order_id: orderId,
    p_worker_id: asString(payload.worker_id ?? payload.workerId),
    p_manifest_storage_path: asString(payload.manifest_storage_path ?? payload.manifestStoragePath),
    p_thumbnail_storage_path: asString(payload.thumbnail_storage_path ?? payload.thumbnailStoragePath),
    p_preview_storage_path: asString(payload.preview_storage_path ?? payload.previewStoragePath),
    p_manifest: payload.manifest ?? {},
    p_frame_width: asInteger(payload.frame_width ?? payload.frameWidth),
    p_frame_height: asInteger(payload.frame_height ?? payload.frameHeight),
    p_frame_count: asInteger(payload.frame_count ?? payload.frameCount),
    p_atlas_page_count: asInteger(payload.atlas_page_count ?? payload.atlasPageCount),
    p_atlas_pages: payload.atlas_pages ?? payload.atlasPages ?? [],
    p_thumbnail_url: asString(payload.thumbnail_url ?? payload.thumbnailUrl),
    p_preview_url: asString(payload.preview_url ?? payload.previewUrl),
    p_slug: asString(payload.slug),
    p_name: asString(payload.name),
  });

  if (error) {
    return jsonResponse(500, { ok: false, error: "complete_order_failed", message: error.message });
  }

  const row = Array.isArray(data) ? data[0] ?? null : data;
  return jsonResponse(200, { ok: true, result: row });
}

async function handleAnimatedCapeWorkerFail(request: Request) {
  const secretError = requireWorkerSecret(request);
  if (secretError) return secretError;

  let payload: JsonObject;
  try {
    payload = await readPayload(request);
  } catch (error) {
    return jsonResponse(400, {
      ok: false,
      error: "invalid_payload",
      message: error instanceof Error ? error.message : String(error),
    });
  }

  const orderId = asString(payload.order_id ?? payload.orderId);
  if (!orderId) return jsonResponse(400, { ok: false, error: "order_id_required" });

  const retryable = Boolean(payload.retryable ?? false);
  const { data, error } = await admin.rpc("commerce_mark_animated_order_failed", {
    p_order_id: orderId,
    p_error_code: asString(payload.error_code ?? payload.errorCode),
    p_error_message: asString(payload.error_message ?? payload.errorMessage),
    p_retryable: retryable,
  });

  if (error) {
    return jsonResponse(500, { ok: false, error: "mark_failed_failed", message: error.message });
  }

  const row = Array.isArray(data) ? data[0] ?? null : data;
  const shouldRefund = !retryable && Boolean(payload.refund ?? true);
  if (!shouldRefund) {
    return jsonResponse(200, { ok: true, result: row });
  }

  const { data: refundData, error: refundError } = await admin.rpc("commerce_refund_animated_cape_order", {
    p_order_id: orderId,
    p_reason: asString(payload.refund_reason ?? payload.refundReason ?? payload.error_message),
    p_idempotency_key: asString(payload.refund_idempotency_key ?? payload.refundIdempotencyKey),
  });

  if (refundError) {
    return jsonResponse(500, {
      ok: false,
      error: "refund_failed",
      message: refundError.message,
      failure_result: row,
    });
  }

  const refundRow = Array.isArray(refundData) ? refundData[0] ?? null : refundData;
  return jsonResponse(200, { ok: true, result: row, refund: refundRow });
}

async function resolvePackageSlug(payload: JsonObject): Promise<{ slug: string | null; reason?: string }> {
  const explicitSlug = asString(payload.package_slug);
  if (explicitSlug) return { slug: explicitSlug.toLowerCase() };

  const payloadUrl = normalizeUrl(payload.url ?? payload.kofi_url);
  const amountRaw = asString(payload.amount ?? payload.total_amount ?? payload.price);
  const amount = amountRaw ? Number.parseFloat(amountRaw) : Number.NaN;

  const { data, error } = await admin
    .from("commerce_currency_packs")
    .select("slug,kofi_url,price_usd,is_active")
    .eq("is_active", true);

  if (error) return { slug: null, reason: `pack_query_failed:${error.message}` };
  const packs = data ?? [];

  if (payloadUrl) {
    const matches = packs.filter((pack) => normalizeUrl(pack.kofi_url) === payloadUrl);
    if (matches.length === 1) return { slug: matches[0].slug };
    if (matches.length > 1) return { slug: null, reason: "ambiguous_kofi_url_match" };
  }

  if (Number.isFinite(amount)) {
    const matches = packs.filter((pack) => Number(pack.price_usd) === amount);
    if (matches.length === 1) return { slug: matches[0].slug };
    if (matches.length > 1) return { slug: null, reason: "ambiguous_amount_match" };
  }

  return { slug: null, reason: "no_package_match" };
}

function resolveRawEventId(payload: JsonObject): Promise<string> {
  const direct =
    asString(payload.kofi_transaction_id) ??
    asString(payload.transaction_id) ??
    asString(payload.id) ??
    asString(payload.message_id);

  if (direct) return Promise.resolve(direct);
  return sha256(stableStringify(payload)).then((hash) => `hash_${hash}`);
}

async function handleKofiWebhook(request: Request) {
  if (!KOFI_VERIFICATION_TOKEN) {
    return jsonResponse(503, {
      ok: false,
      error: "kofi_token_not_configured",
      message: "Set KOFI_VERIFICATION_TOKEN before enabling webhook processing.",
    });
  }

  let payload: JsonObject;
  try {
    payload = await readPayload(request);
  } catch (error) {
    return jsonResponse(400, {
      ok: false,
      error: "invalid_payload",
      message: error instanceof Error ? error.message : String(error),
    });
  }

  const incomingToken = asString(payload.verification_token);
  if (!incomingToken || incomingToken !== KOFI_VERIFICATION_TOKEN) {
    return jsonResponse(401, {
      ok: false,
      error: "invalid_verification_token",
    });
  }

  const rawEventId = await resolveRawEventId(payload);
  const email = normalizeEmail(payload.email);
  const packageResolution = await resolvePackageSlug(payload);
  const packageSlug = packageResolution.slug ?? "";

  const payloadWithMeta = {
    ...payload,
    _resolved_package_slug: packageSlug || null,
    _resolve_reason: packageResolution.reason ?? null,
  };

  const { data, error } = await admin.rpc("commerce_process_kofi_event", {
    p_raw_event_id: rawEventId,
    p_email: email,
    p_package_slug: packageSlug,
    p_payload: payloadWithMeta,
  });

  if (error) {
    return jsonResponse(500, {
      ok: false,
      error: "kofi_rpc_failed",
      message: error.message,
      raw_event_id: rawEventId,
    });
  }

  const result = Array.isArray(data) && data.length > 0 ? data[0] : null;
  return jsonResponse(200, {
    ok: true,
    raw_event_id: rawEventId,
    result,
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: CORS_HEADERS });
  }

  const url = new URL(request.url);
  const route = url.pathname.replace(/^.*\/functions\/v1\/main/, "") || "/";

  if (request.method === "POST" && route === "/animated-cape/upload-url") {
    return handleAnimatedCapeUploadUrl(request);
  }

  if (request.method === "POST" && route === "/animated-cape/register-upload") {
    return handleAnimatedCapeRegisterUpload(request);
  }

  if (request.method === "POST" && route === "/animated-cape/order") {
    return handleAnimatedCapeCreateOrder(request);
  }

  if (request.method === "GET" && route === "/animated-cape/orders") {
    return handleAnimatedCapeListOrders(request);
  }

  const orderMatch = route.match(/^\/animated-cape\/orders\/([0-9a-fA-F-]+)$/);
  if (request.method === "GET" && orderMatch) {
    return handleAnimatedCapeGetOrder(request, orderMatch[1]);
  }
  if (request.method === "POST" && orderMatch && route.endsWith("/cancel") === false) {
    return jsonResponse(405, { ok: false, error: "method_not_allowed" });
  }
  const cancelMatch = route.match(/^\/animated-cape\/orders\/([0-9a-fA-F-]+)\/cancel$/);
  if (request.method === "POST" && cancelMatch) {
    return handleAnimatedCapeCancelOrder(request, cancelMatch[1]);
  }

  if (request.method === "POST" && route === "/animated-cape/worker/claim") {
    return handleAnimatedCapeWorkerClaim(request);
  }

  if (request.method === "POST" && route === "/animated-cape/worker/complete") {
    return handleAnimatedCapeWorkerComplete(request);
  }

  if (request.method === "POST" && route === "/animated-cape/worker/fail") {
    return handleAnimatedCapeWorkerFail(request);
  }

  if (request.method === "GET" && route === "/custom-cape/draft/latest") {
    return handleCustomCapeDraftLatest(request);
  }

  if (request.method === "POST" && route === "/custom-cape/draft") {
    return handleCustomCapeDraft(request);
  }

  if (request.method === "POST" && route === "/custom-cape/finalize") {
    return handleCustomCapeFinalize(request);
  }

  if (request.method === "GET") {
    return jsonResponse(200, {
      ok: true,
      service: "bloom-main",
      route: url.pathname,
      timestamp: new Date().toISOString(),
    });
  }

  if (request.method !== "POST") {
    return jsonResponse(405, { ok: false, error: "method_not_allowed" });
  }

  return handleKofiWebhook(request);
});
