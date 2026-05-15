import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type JsonObject = Record<string, unknown>;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const MCSETS_ENTERPRISE_BASE_URL = Deno.env.get("MCSETS_ENTERPRISE_BASE_URL") ?? "https://mcsets.com/api/v1/enterprise";
const MCSETS_ENTERPRISE_LIVE_KEY = Deno.env.get("MCSETS_ENTERPRISE_LIVE_KEY") ?? "";
const MCSETS_ENTERPRISE_TEST_KEY = Deno.env.get("MCSETS_ENTERPRISE_TEST_KEY") ?? "";
const MCSETS_SUCCESS_URL = Deno.env.get("MCSETS_SUCCESS_URL") ?? "";
const MCSETS_CANCEL_URL = Deno.env.get("MCSETS_CANCEL_URL") ?? "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
  throw new Error("Missing Supabase function environment.");
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function jsonResponse(status: number, body: JsonObject) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asObject(value: unknown): JsonObject | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as JsonObject;
}

function normalizeEmail(value: unknown): string | null {
  return asString(value)?.toLowerCase() ?? null;
}

function normalizeUrl(value: unknown): string | null {
  const raw = asString(value);
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    return `${parsed.origin}${parsed.pathname.replace(/\/+$/, "")}${parsed.search}`;
  } catch {
    return raw.replace(/\/+$/, "");
  }
}

function getBearerToken(request: Request): string | null {
  const raw = request.headers.get("authorization");
  const match = raw?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

async function requireAuth(request: Request) {
  const token = getBearerToken(request);
  if (!token) throw new Error("missing_authorization");
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await userClient.auth.getUser();
  if (error || !data.user?.id) throw new Error("invalid_authentication_credentials");
  return data.user.id;
}

async function readPayload(request: Request): Promise<JsonObject> {
  const text = await request.text();
  if (!text.trim()) return {};
  return asObject(JSON.parse(text)) ?? {};
}

function resolveMcsetsApiKey(mode: "test" | "live") {
  const requested = mode === "test" ? MCSETS_ENTERPRISE_TEST_KEY.trim() : MCSETS_ENTERPRISE_LIVE_KEY.trim();
  if (requested) return requested;
  const fallback = mode === "test" ? MCSETS_ENTERPRISE_LIVE_KEY.trim() : MCSETS_ENTERPRISE_TEST_KEY.trim();
  return fallback || null;
}

function readMcsetsCheckoutSession(payload: unknown) {
  const dataObj = asObject((payload as Record<string, unknown> | null)?.data) ?? {};
  return {
    sessionId: asString(dataObj.id) ?? asString(dataObj.session_id),
    checkoutUrl: asString(dataObj.url) ?? asString(dataObj.checkout_url),
    expiresAt: asString(dataObj.expires_at),
  };
}

async function handleCheckout(request: Request) {
  const userId = await requireAuth(request);
  const payload = await readPayload(request);
  const packageSlug = asString(payload.package_slug)?.toLowerCase();
  if (!packageSlug) return jsonResponse(400, { ok: false, error: "package_slug_required" });

  const mode = asString(payload.mode)?.toLowerCase() === "live" ? "live" : "test";
  const mcsetsApiKey = resolveMcsetsApiKey(mode);
  if (!mcsetsApiKey) return jsonResponse(503, { ok: false, error: "mcsets_api_key_not_configured", mode });

  const { data: pack, error: packError } = await admin
    .from("commerce_currency_packs")
    .select("slug,name,price_usd,is_active,mcsets_price_id")
    .eq("slug", packageSlug)
    .maybeSingle();
  if (packError) return jsonResponse(500, { ok: false, error: "pack_lookup_failed", message: packError.message });
  if (!pack || !(pack as { is_active?: boolean }).is_active) return jsonResponse(404, { ok: false, error: "package_not_found" });

  const priceUsd = Number((pack as { price_usd?: number | string | null }).price_usd ?? Number.NaN);
  if (!Number.isFinite(priceUsd) || priceUsd <= 0) return jsonResponse(400, { ok: false, error: "package_price_invalid" });

  const { data: userRes, error: userError } = await admin.auth.admin.getUserById(userId);
  if (userError) return jsonResponse(500, { ok: false, error: "user_lookup_failed", message: userError.message });
  const { data: profileRow } = await admin
    .from("commerce_profiles")
    .select("username,mc_uuid")
    .eq("user_id", userId)
    .maybeSingle();

  const profileObj = (profileRow ?? {}) as { username?: string | null; mc_uuid?: string | null };
  const mcsetsPriceId = asString((pack as { mcsets_price_id?: string | null }).mcsets_price_id ?? null);
  const requestBody: JsonObject = {
    amount: Math.max(100, Math.round(priceUsd * 100)),
    currency: "USD",
    name: String((pack as { name?: string | null }).name ?? packageSlug),
    success_url: normalizeUrl(MCSETS_SUCCESS_URL) ?? "https://bloomclient.org/checkout/success",
    cancel_url: normalizeUrl(MCSETS_CANCEL_URL) ?? "https://bloomclient.org/checkout/cancel",
    customer_email: normalizeEmail(userRes.user?.email ?? null) ?? undefined,
    metadata: {
      user_id: userId,
      package_slug: packageSlug,
      mc_username: asString(profileObj.username),
      mc_uuid: asString(profileObj.mc_uuid),
      mcsets_price_id: mcsetsPriceId ?? undefined,
      mode,
      source: "bloom_client",
    },
  };
  if (mcsetsPriceId && !mcsetsPriceId.startsWith("MCSETS_")) requestBody.price_id = mcsetsPriceId;

  const response = await fetch(`${MCSETS_ENTERPRISE_BASE_URL.replace(/\/+$/, "")}/checkout/sessions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${mcsetsApiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  const mcsetsPayload = await response.json().catch(() => ({}));
  if (!response.ok || !(mcsetsPayload as { success?: boolean }).success) {
    return jsonResponse(response.status >= 400 ? response.status : 500, {
      ok: false,
      error: "mcsets_checkout_create_failed",
      message: asString((mcsetsPayload as JsonObject).message) ?? "mcsets_checkout_create_failed",
      mode,
    });
  }

  const session = readMcsetsCheckoutSession(mcsetsPayload);
  if (!session.sessionId || !session.checkoutUrl) {
    return jsonResponse(502, { ok: false, error: "mcsets_checkout_response_invalid" });
  }

  return jsonResponse(200, {
    ok: true,
    mode,
    package_slug: packageSlug,
    session_id: session.sessionId,
    checkout_url: session.checkoutUrl,
    expires_at: session.expiresAt,
  });
}

Deno.serve(async (request) => {
  try {
    if (request.method === "OPTIONS") return new Response("ok", { status: 200, headers: CORS_HEADERS });
    if (request.method !== "POST") return jsonResponse(405, { ok: false, error: "method_not_allowed" });
    return await handleCheckout(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes("authorization") || message.includes("authentication") ? 401 : 500;
    return jsonResponse(status, { ok: false, error: `edge_${status}`, message });
  }
});
