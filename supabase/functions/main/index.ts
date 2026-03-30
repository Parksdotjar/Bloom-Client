import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type JsonObject = Record<string, unknown>;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const KOFI_VERIFICATION_TOKEN = Deno.env.get("KOFI_VERIFICATION_TOKEN") ?? "";

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
