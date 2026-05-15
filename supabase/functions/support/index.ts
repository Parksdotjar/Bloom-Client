import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type JsonObject = Record<string, unknown>;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-mcsets-signature",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const MCSETS_ENTERPRISE_BASE_URL = Deno.env.get("MCSETS_ENTERPRISE_BASE_URL") ?? "https://mcsets.com/api/v1/enterprise";
const MCSETS_ENTERPRISE_LIVE_KEY = Deno.env.get("MCSETS_ENTERPRISE_LIVE_KEY") ?? "";
const MCSETS_ENTERPRISE_TEST_KEY = Deno.env.get("MCSETS_ENTERPRISE_TEST_KEY") ?? "";
const MCSETS_WEBHOOK_SECRET = Deno.env.get("MCSETS_WEBHOOK_SECRET") ?? "";
const MCSETS_SUPPORT_SUCCESS_URL = Deno.env.get("MCSETS_SUPPORT_SUCCESS_URL") ?? "";
const MCSETS_SUPPORT_CANCEL_URL = Deno.env.get("MCSETS_SUPPORT_CANCEL_URL") ?? "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const SUPPORT_OPTIONS = [
  { slug: "support-5", label: "$5", amountCents: 500 },
  { slug: "support-10", label: "$10", amountCents: 1000 },
  { slug: "support-25", label: "$25", amountCents: 2500 },
  { slug: "support-50", label: "$50", amountCents: 5000 },
  { slug: "support-100", label: "$100", amountCents: 10000 },
  { slug: "support-200", label: "$200", amountCents: 20000 },
];

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

function asInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function asObject(value: unknown): JsonObject | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as JsonObject;
}

function asUuid(value: unknown): string | null {
  const raw = asString(value);
  if (!raw) return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw) ? raw : null;
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

function getSupportOption(slug: unknown) {
  const normalized = asString(slug)?.toLowerCase();
  return SUPPORT_OPTIONS.find((option) => option.slug === normalized) ?? null;
}

function getCustomSupportOption(amountUsd: unknown) {
  const raw = asString(amountUsd);
  if (!raw || !/^\d+$/.test(raw)) return null;

  const dollars = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(dollars) || dollars < 1) return null;

  return {
    slug: `support-custom-${dollars}`,
    label: `$${dollars}`,
    amountCents: dollars * 100,
  };
}

function resolveMcsetsApiKey(mode: "test" | "live") {
  const requested = mode === "test" ? MCSETS_ENTERPRISE_TEST_KEY.trim() : MCSETS_ENTERPRISE_LIVE_KEY.trim();
  if (requested) return requested;
  const fallback = mode === "test" ? MCSETS_ENTERPRISE_LIVE_KEY.trim() : MCSETS_ENTERPRISE_TEST_KEY.trim();
  return fallback || null;
}

function createReturnUrls(payload: JsonObject) {
  const providedOrigin = asString(payload.return_origin);
  let origin = "https://bloomclient.org";
  if (providedOrigin) {
    try {
      const parsed = new URL(providedOrigin);
      if (parsed.protocol === "https:") {
        origin = parsed.origin;
      }
    } catch {
      // Keep the production default.
    }
  }

  return {
    successUrl: normalizeUrl(MCSETS_SUPPORT_SUCCESS_URL) ?? `${origin}/support?status=success`,
    cancelUrl: normalizeUrl(MCSETS_SUPPORT_CANCEL_URL) ?? `${origin}/support?status=cancel`,
  };
}

function readMcsetsCheckoutSession(payload: unknown) {
  const dataObj = asObject((payload as Record<string, unknown> | null)?.data) ?? {};
  return {
    sessionId: asString(dataObj.id) ?? asString(dataObj.session_id),
    checkoutUrl: asString(dataObj.url) ?? asString(dataObj.checkout_url),
    expiresAt: asString(dataObj.expires_at),
  };
}

function parseMcsetsSignatureHeader(value: string | null) {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  const parts = raw.split(",").map((part) => part.trim());
  let timestamp: string | null = null;
  let signature: string | null = null;
  for (const part of parts) {
    const [key, val] = part.split("=", 2).map((entry) => entry.trim());
    if (key === "t") timestamp = val;
    if (key === "v1") signature = val;
  }
  return timestamp && signature ? { timestamp, signature } : null;
}

function timingSafeEqualHex(a: string, b: string) {
  const left = a.trim().toLowerCase();
  const right = b.trim().toLowerCase();
  if (!left || !right || left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return result === 0;
}

async function hmacSha256Hex(secret: string, payload: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return [...new Uint8Array(signature)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function readPayload(request: Request): Promise<JsonObject> {
  const rawBody = await request.text();
  if (!rawBody.trim()) return {};
  const parsed = JSON.parse(rawBody);
  return asObject(parsed) ?? {};
}

async function handleOptions() {
  return jsonResponse(200, {
    ok: true,
    options: SUPPORT_OPTIONS.map((option) => ({
      slug: option.slug,
      label: option.label,
      amount_cents: option.amountCents,
      currency: "USD",
    })),
  });
}

async function handleCheckout(request: Request) {
  const payload = await readPayload(request);
  const option = getSupportOption(payload.option_slug) ?? getCustomSupportOption(payload.amount_usd);
  if (!option) return jsonResponse(400, { ok: false, error: "support_option_invalid" });

  const mode = asString(payload.mode)?.toLowerCase() === "test" ? "test" : "live";
  const mcsetsApiKey = resolveMcsetsApiKey(mode);
  if (!mcsetsApiKey) return jsonResponse(503, { ok: false, error: "mcsets_api_key_not_configured", mode });

  const { successUrl, cancelUrl } = createReturnUrls(payload);
  const supportPaymentId = crypto.randomUUID();
  const response = await fetch(`${MCSETS_ENTERPRISE_BASE_URL.replace(/\/+$/, "")}/checkout/sessions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${mcsetsApiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      amount: option.amountCents,
      currency: "USD",
      name: "Support Bloom",
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        source: "bloom_support",
        support_payment_id: supportPaymentId,
        support_option_slug: option.slug,
        mode,
      },
    }),
  });

  const mcsetsPayload = await response.json().catch(() => ({}));
  if (!response.ok || !(mcsetsPayload as { success?: boolean }).success) {
    const payloadObj = (mcsetsPayload ?? {}) as Record<string, unknown>;
    return jsonResponse(response.status >= 400 ? response.status : 500, {
      ok: false,
      error: "mcsets_support_checkout_create_failed",
      message: asString(payloadObj.message) ?? "mcsets_support_checkout_create_failed",
      mode,
    });
  }

  const { sessionId, checkoutUrl, expiresAt } = readMcsetsCheckoutSession(mcsetsPayload);
  if (!sessionId || !checkoutUrl) {
    return jsonResponse(502, { ok: false, error: "mcsets_checkout_response_invalid" });
  }

  const { error } = await admin.from("commerce_support_payments").insert({
    id: supportPaymentId,
    mcsets_session_id: sessionId,
    option_slug: option.slug,
    amount_cents: option.amountCents,
    currency: "USD",
    status: "pending",
    mode,
  });
  if (error) return jsonResponse(500, { ok: false, error: "support_payment_record_create_failed" });

  return jsonResponse(200, {
    ok: true,
    mode,
    option_slug: option.slug,
    session_id: sessionId,
    checkout_url: checkoutUrl,
    expires_at: expiresAt,
  });
}

async function handleWebhook(request: Request) {
  const rawBody = await request.text();
  let payload: JsonObject = {};
  try {
    payload = asObject(JSON.parse(rawBody || "{}")) ?? {};
  } catch {
    return jsonResponse(400, { ok: false, error: "invalid_json_payload" });
  }

  if (MCSETS_WEBHOOK_SECRET.trim()) {
    const parsed = parseMcsetsSignatureHeader(request.headers.get("X-MCsets-Signature"));
    if (!parsed) return jsonResponse(401, { ok: false, error: "mcsets_signature_invalid_format" });
    const ts = Number.parseInt(parsed.timestamp, 10);
    if (!Number.isFinite(ts) || Math.abs(Math.floor(Date.now() / 1000) - ts) > 300) {
      return jsonResponse(401, { ok: false, error: "mcsets_signature_timestamp_out_of_range" });
    }
    const expected = await hmacSha256Hex(MCSETS_WEBHOOK_SECRET.trim(), `${parsed.timestamp}.${rawBody}`);
    if (!timingSafeEqualHex(expected, parsed.signature)) {
      return jsonResponse(401, { ok: false, error: "mcsets_signature_invalid" });
    }
  }

  const eventId = asString(payload.id);
  const eventType = asString(payload.type) ?? "";
  if (!eventId) return jsonResponse(400, { ok: false, error: "mcsets_event_id_missing" });
  if (!["checkout.session.completed", "payment.completed", "checkout.completed"].includes(eventType)) {
    return jsonResponse(200, { ok: true, received: true, ignored: true, type: eventType || null });
  }

  const dataObj = asObject(payload.data) ?? {};
  const sessionObj = asObject(dataObj.object) ?? dataObj;
  const metadataObj = asObject(sessionObj.metadata) ?? {};
  if ((asString(metadataObj.source) ?? asString(sessionObj.source)) !== "bloom_support") {
    return jsonResponse(200, { ok: true, received: true, ignored: true, type: eventType });
  }

  const sessionId = asString(sessionObj.session_id) ?? asString(sessionObj.id);
  if (!sessionId) return jsonResponse(400, { ok: false, error: "mcsets_session_id_missing" });

  const amountCents = asInt(sessionObj.amount_total) ?? asInt(sessionObj.amount) ?? asInt(sessionObj.total) ?? 1;
  const supportPaymentId = asUuid(metadataObj.support_payment_id);
  const updatePayload = {
    mcsets_event_id: eventId,
    amount_cents: Math.max(1, amountCents),
    currency: (asString(sessionObj.currency) ?? "USD").toUpperCase(),
    customer_email: normalizeEmail(sessionObj.customer_email),
    status: "completed",
    raw_payload: payload,
    completed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const updateQuery = supportPaymentId
    ? admin.from("commerce_support_payments").update(updatePayload).eq("id", supportPaymentId)
    : admin.from("commerce_support_payments").update(updatePayload).eq("mcsets_session_id", sessionId);
  const { error } = await updateQuery;
  if (error && !String(error.message).includes("duplicate key")) {
    return jsonResponse(500, { ok: false, error: "support_payment_record_update_failed", message: error.message });
  }

  return jsonResponse(200, { ok: true, received: true, type: "bloom_support", event_id: eventId, session_id: sessionId });
}

Deno.serve(async (request) => {
  try {
    if (request.method === "OPTIONS") return new Response("ok", { status: 200, headers: CORS_HEADERS });
    let route = new URL(request.url).pathname.replace(/^.*\/functions\/v1\/support/, "") || "/";
    if (route === "/support") route = "/";
    if (route.startsWith("/support/")) route = route.slice("/support".length);

    if (request.method === "GET" && (route === "/" || route === "/options")) return handleOptions();
    if (request.method === "POST" && route === "/checkout") return await handleCheckout(request);
    if (request.method === "POST" && route === "/webhook") return await handleWebhook(request);

    return jsonResponse(404, { ok: false, error: "route_not_found" });
  } catch (error) {
    return jsonResponse(500, { ok: false, error: "edge_500", message: error instanceof Error ? error.message : String(error) });
  }
});
