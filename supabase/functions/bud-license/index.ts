import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type JsonObject = Record<string, unknown>;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-mcsets-signature",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const MCSETS_ENTERPRISE_BASE_URL = Deno.env.get("MCSETS_ENTERPRISE_BASE_URL") ?? "https://mcsets.com/api/v1/enterprise";
const MCSETS_ENTERPRISE_LIVE_KEY = Deno.env.get("MCSETS_ENTERPRISE_LIVE_KEY") ?? "";
const MCSETS_ENTERPRISE_TEST_KEY = Deno.env.get("MCSETS_ENTERPRISE_TEST_KEY") ?? "";
const MCSETS_WEBHOOK_SECRET = Deno.env.get("MCSETS_WEBHOOK_SECRET") ?? "";
const MCSETS_BUD_MONTHLY_PRICE_ID = Deno.env.get("MCSETS_BUD_MONTHLY_PRICE_ID") ?? "";
const MCSETS_BUD_SUCCESS_URL = Deno.env.get("MCSETS_BUD_SUCCESS_URL") ?? "";
const MCSETS_BUD_CANCEL_URL = Deno.env.get("MCSETS_BUD_CANCEL_URL") ?? "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
  throw new Error("Missing Supabase Edge Function secrets.");
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const OWNER_USER_IDS = new Set([
  "951a26df-2baa-445e-8dd6-30d4878eade2",
  "edfee06f-d5af-457c-b0f7-36cb0f621fc6",
]);

function jsonResponse(status: number, body: JsonObject) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function asObject(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;
}

async function readPayload(request: Request): Promise<JsonObject> {
  const raw = await request.text();
  if (!raw.trim()) return {};
  return asObject(JSON.parse(raw)) ?? {};
}

function normalizeUsername(value: unknown) {
  return asString(value)?.toLowerCase() ?? null;
}

function normalizeUrl(value: unknown): string | null {
  const raw = asString(value);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return `${url.origin}${url.pathname.replace(/\/+$/, "")}${url.search}`;
  } catch {
    return raw.replace(/\/+$/, "");
  }
}

function createReturnUrls(payload: JsonObject) {
  const providedOrigin = asString(payload.return_origin);
  let origin = "https://bloomclient.org";
  if (providedOrigin) {
    try {
      const parsed = new URL(providedOrigin);
      if (parsed.protocol === "https:") origin = parsed.origin;
    } catch {
      // Keep production default.
    }
  }

  return {
    successUrl: normalizeUrl(MCSETS_BUD_SUCCESS_URL) ?? `${origin}/dashboard?tab=bud&status=success`,
    cancelUrl: normalizeUrl(MCSETS_BUD_CANCEL_URL) ?? `${origin}/dashboard?tab=bud&status=cancel`,
  };
}

function resolveMcsetsApiKey(mode: "test" | "live") {
  const requested = mode === "test" ? MCSETS_ENTERPRISE_TEST_KEY.trim() : MCSETS_ENTERPRISE_LIVE_KEY.trim();
  if (requested) return requested;
  const fallback = mode === "test" ? MCSETS_ENTERPRISE_LIVE_KEY.trim() : MCSETS_ENTERPRISE_TEST_KEY.trim();
  return fallback || null;
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqualHex(a: string, b: string) {
  const left = a.trim().toLowerCase();
  const right = b.trim().toLowerCase();
  if (!left || !right || left.length !== right.length) return false;
  let result = 0;
  for (let i = 0; i < left.length; i += 1) result |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return result === 0;
}

async function hmacSha256Hex(secret: string, payload: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return [...new Uint8Array(sig)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function parseMcsetsSignatureHeader(value: string | null) {
  const parts = (value ?? "").split(",").map((part) => part.trim());
  let timestamp: string | null = null;
  let signature: string | null = null;
  for (const part of parts) {
    const [key, val] = part.split("=", 2).map((entry) => entry.trim());
    if (key === "t") timestamp = val;
    if (key === "v1") signature = val;
  }
  return timestamp && signature ? { timestamp, signature } : null;
}

async function authUser(request: Request) {
  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}

async function ensureProfile(user: { id: string; email?: string | null; user_metadata?: Record<string, unknown> }) {
  const username =
    normalizeUsername(user.user_metadata?.username) ??
    normalizeUsername(user.email?.split("@")[0]) ??
    `user-${user.id.slice(0, 8)}`;
  const { data } = await admin
    .from("commerce_profiles")
    .upsert({ user_id: user.id, username, display_name: username, email: user.email ?? null }, { onConflict: "user_id" })
    .select("*")
    .single();
  return data as JsonObject;
}

async function requireOwner(request: Request) {
  const user = await authUser(request);
  if (!user) return { response: jsonResponse(401, { ok: false, error: "not_authenticated" }) };
  const profile = await ensureProfile(user);
  const isParksEmail = (user.email ?? "").toLowerCase() === "urlocalparks@gmail.com";
  const isParksProfile = asString(profile.username)?.toLowerCase() === "parks" && asString(profile.email)?.toLowerCase() === "urlocalparks@gmail.com";
  const isAllowedOwner = (isParksEmail && isParksProfile) || OWNER_USER_IDS.has(user.id);
  if (profile.role !== "owner" || !isAllowedOwner) {
    return { response: jsonResponse(403, { ok: false, error: "owner_required" }) };
  }
  return { user, profile };
}

async function handleSummary(request: Request) {
  const user = await authUser(request);
  if (!user) return jsonResponse(401, { ok: false, error: "not_authenticated" });
  const profile = await ensureProfile(user);
  const { data: purchases } = await admin.from("bud_purchases").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(10);
  const { data: licenses } = await admin.from("bud_license_keys").select("id,product,plan,activated,activated_at,expires_at,revoked,created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(10);
  return jsonResponse(200, { ok: true, profile, purchases: purchases ?? [], licenses: licenses ?? [], monthly_available: Boolean(MCSETS_BUD_MONTHLY_PRICE_ID.trim()) });
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
  const user = await authUser(request);
  if (!user) return jsonResponse(401, { ok: false, error: "not_authenticated" });
  const payload = await readPayload(request);
  const plan = asString(payload.plan)?.toLowerCase() === "monthly" ? "monthly" : "lifetime";
  if (plan === "monthly" && !MCSETS_BUD_MONTHLY_PRICE_ID.trim()) {
    return jsonResponse(503, { ok: false, error: "monthly_subscription_not_configured", message: "Monthly BUD subscriptions need MCSETS_BUD_MONTHLY_PRICE_ID." });
  }
  const mode = asString(payload.mode)?.toLowerCase() === "test" ? "test" : "live";
  const mcsetsApiKey = resolveMcsetsApiKey(mode);
  if (!mcsetsApiKey) return jsonResponse(503, { ok: false, error: "mcsets_api_key_not_configured" });

  const profile = await ensureProfile(user);
  const username = asString(profile.username) ?? `user-${user.id.slice(0, 8)}`;
  const { successUrl, cancelUrl } = createReturnUrls(payload);
  const purchaseId = crypto.randomUUID();
  const body: JsonObject =
    plan === "monthly"
      ? {
          currency: "usd",
          items: [
            {
              name: "BUD License Monthly",
              amount: 1000,
              quantity: 1,
              price_id: MCSETS_BUD_MONTHLY_PRICE_ID.trim(),
            },
          ],
          success_url: successUrl,
          cancel_url: cancelUrl,
          customer_email: user.email ?? undefined,
        }
      : {
          currency: "USD",
          name: "BUD License Lifetime",
          amount: 5000,
          success_url: successUrl,
          cancel_url: cancelUrl,
          metadata: { source: "bud_license", purchase_id: purchaseId, user_id: user.id, username, plan, mode },
        };

  const response = await fetch(`${MCSETS_ENTERPRISE_BASE_URL.replace(/\/+$/, "")}/checkout/sessions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${mcsetsApiKey}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  const mcsetsPayload = await response.json().catch(() => ({}));
  if (!response.ok || !(mcsetsPayload as { success?: boolean }).success) {
    const errorPayload = asObject(mcsetsPayload);
    const detailMessage = Array.isArray(errorPayload?.errors)
      ? (errorPayload?.errors as unknown[])
          .map((entry) => {
            const item = asObject(entry);
            return asString(item?.message) ?? asString(item?.error) ?? asString(item?.field) ?? null;
          })
          .filter(Boolean)
          .join(" | ")
      : null;
    return jsonResponse(response.status >= 400 ? response.status : 500, {
      ok: false,
      error: "mcsets_checkout_create_failed",
      message: detailMessage || asString(errorPayload?.message) || "Checkout failed.",
    });
  }
  const { sessionId, checkoutUrl } = readMcsetsCheckoutSession(mcsetsPayload);
  if (!sessionId || !checkoutUrl) return jsonResponse(502, { ok: false, error: "mcsets_checkout_response_invalid" });

  await admin.from("bud_purchases").insert({
    id: purchaseId,
    user_id: user.id,
    username,
    plan,
    amount_cents: plan === "monthly" ? 1000 : 5000,
    mcsets_session_id: sessionId,
    mode,
  });
  await admin.from("commerce_profiles").update({ bud_license_status: "pending", bud_plan: plan }).eq("user_id", user.id);
  return jsonResponse(200, { ok: true, checkout_url: checkoutUrl, session_id: sessionId, plan });
}

async function handleClaimKey(request: Request) {
  const user = await authUser(request);
  if (!user) return jsonResponse(401, { ok: false, error: "not_authenticated" });
  const profile = await ensureProfile(user);
  const { data: purchase } = await admin
    .from("bud_purchases")
    .select("*")
    .eq("user_id", user.id)
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const isFreePlan = !purchase && profile.bud_license_status === "active" && profile.bud_plan === "free";
  if (!purchase && !isFreePlan) return jsonResponse(402, { ok: false, error: "no_completed_purchase", message: "Complete a BUD license purchase first." });
  const existingQuery = admin.from("bud_license_keys").select("id");
  const { data: existing } = purchase
    ? await existingQuery.eq("purchase_id", purchase.id).maybeSingle()
    : await existingQuery.eq("user_id", user.id).eq("product", "bud").eq("plan", "free").maybeSingle();
  if (existing) return jsonResponse(409, { ok: false, error: "license_key_already_claimed", message: "This license already has a key. Keys are shown once." });
  const rawKey = `BUD-${crypto.randomUUID()}-${crypto.randomUUID().slice(0, 8)}`.toUpperCase();
  const hash = await sha256Hex(rawKey);
  const plan = isFreePlan ? "free" : asString(purchase.plan) ?? "lifetime";
  const expiresAt = plan === "monthly" ? new Date(Date.now() + 31 * 24 * 60 * 60 * 1000).toISOString() : null;
  await admin.from("bud_license_keys").insert({
    user_id: user.id,
    username: asString(purchase?.username) ?? asString(profile.username) ?? `user-${user.id.slice(0, 8)}`,
    purchase_id: purchase?.id ?? null,
    license_key_hash: hash,
    plan,
    expires_at: expiresAt,
  });
  return jsonResponse(200, { ok: true, license_key: rawKey, plan, expires_at: expiresAt, message: "Save this key. You will use it inside SkStudio to activate BUD." });
}

async function handleOwnerUsers(request: Request) {
  const owner = await requireOwner(request);
  if ("response" in owner) return owner.response;
  const { data, error } = await admin
    .from("commerce_profiles")
    .select("user_id,username,display_name,email,bud_license_status,bud_plan,role,created_at")
    .order("created_at", { ascending: false })
    .limit(250);
  if (error) return jsonResponse(500, { ok: false, error: "owner_users_failed", message: error.message });
  return jsonResponse(200, { ok: true, users: data ?? [] });
}

async function handleOwnerFreeLicense(request: Request) {
  const owner = await requireOwner(request);
  if ("response" in owner) return owner.response;
  const payload = await readPayload(request);
  const userId = asString(payload.user_id);
  if (!userId) return jsonResponse(400, { ok: false, error: "user_id_required" });
  const { data, error } = await admin
    .from("commerce_profiles")
    .update({ bud_license_status: "active", bud_plan: "free", updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .select("user_id,username,display_name,email,bud_license_status,bud_plan,role")
    .single();
  if (error) return jsonResponse(500, { ok: false, error: "free_license_failed", message: error.message });
  return jsonResponse(200, { ok: true, user: data });
}

async function recordAttempt(username: string | null, hash: string | null, ip: string | null, deviceHint: string | null, success: boolean, failureReason?: string) {
  await admin.from("bud_activation_attempts").insert({
    username,
    license_key_hash: hash,
    ip_address: ip,
    device_hint: deviceHint,
    success,
    failure_reason: failureReason ?? null,
  });
}

async function handleActivate(request: Request) {
  const payload = await readPayload(request);
  const username = normalizeUsername(payload.username);
  const licenseKey = asString(payload.license_key);
  const deviceHint = asString(payload.device_hint);
  const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const hash = licenseKey ? await sha256Hex(licenseKey) : null;
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  if (!username || !licenseKey || !hash) {
    await recordAttempt(username, hash, ip, deviceHint, false, "missing_credentials");
    return jsonResponse(400, { active: false, message: "Username and license key are required." });
  }

  const failurePredicates = [`username.eq.${username}`, `license_key_hash.eq.${hash}`];
  if (ip) failurePredicates.push(`ip_address.eq.${ip}`);
  const failureQuery = admin
    .from("bud_activation_attempts")
    .select("id", { count: "exact", head: true })
    .eq("success", false)
    .gte("created_at", oneHourAgo)
    .or(failurePredicates.join(","));
  const { count } = await failureQuery;
  if ((count ?? 0) >= 5) {
    return jsonResponse(429, { active: false, message: "Too many failed attempts. Try again in 1 hour." });
  }

  const { data: profile } = await admin.from("commerce_profiles").select("user_id,username").eq("username", username).maybeSingle();
  const { data: license } = await admin.from("bud_license_keys").select("*").eq("license_key_hash", hash).maybeSingle();
  const now = new Date();
  let reason = "";
  if (!profile) reason = "username_not_found";
  else if (!license || license.user_id !== profile.user_id) reason = "license_not_found";
  else if (license.revoked) reason = "license_revoked";
  else if (license.activated) reason = "license_already_activated";
  else if (license.expires_at && new Date(license.expires_at) <= now) reason = "license_expired";

  if (reason) {
    await recordAttempt(username, hash, ip, deviceHint, false, reason);
    return jsonResponse(403, { active: false, message: "License activation failed." });
  }

  await admin.from("bud_license_keys").update({ activated: true, activated_at: now.toISOString(), device_hint: deviceHint, updated_at: now.toISOString() }).eq("id", license.id);
  await recordAttempt(username, hash, ip, deviceHint, true);
  return jsonResponse(200, { active: true, plan: license.plan, expires_at: license.expires_at, message: "BUD license activated." });
}

async function handleWebhook(request: Request) {
  const rawBody = await request.text();
  const payload = asObject(JSON.parse(rawBody || "{}")) ?? {};
  if (MCSETS_WEBHOOK_SECRET.trim()) {
    const parsed = parseMcsetsSignatureHeader(request.headers.get("X-MCsets-Signature"));
    if (!parsed) return jsonResponse(401, { ok: false, error: "mcsets_signature_invalid_format" });
    const ts = Number.parseInt(parsed.timestamp, 10);
    if (!Number.isFinite(ts) || Math.abs(Math.floor(Date.now() / 1000) - ts) > 300) return jsonResponse(401, { ok: false, error: "mcsets_signature_timestamp_out_of_range" });
    const expected = await hmacSha256Hex(MCSETS_WEBHOOK_SECRET.trim(), `${parsed.timestamp}.${rawBody}`);
    if (!timingSafeEqualHex(expected, parsed.signature)) return jsonResponse(401, { ok: false, error: "mcsets_signature_invalid" });
  }

  const eventId = asString(payload.id);
  const eventType = asString(payload.type) ?? "";
  const dataObj = asObject(payload.data) ?? {};
  const sessionObj = asObject(dataObj.object) ?? dataObj;
  const metadata = asObject(sessionObj.metadata) ?? {};
  if ((asString(metadata.source) ?? asString(sessionObj.source)) !== "bud_license") return jsonResponse(200, { ok: true, ignored: true });
  const purchaseId = asString(metadata.purchase_id);
  const userId = asString(metadata.user_id);
  const plan = asString(metadata.plan) === "monthly" ? "monthly" : "lifetime";
  if (!purchaseId) return jsonResponse(400, { ok: false, error: "purchase_id_missing" });
  const completed = ["checkout.session.completed", "payment.completed", "checkout.completed", "subscription.active", "subscription.created"].includes(eventType);
  await admin.from("bud_purchases").update({
    mcsets_event_id: eventId,
    mcsets_subscription_id: asString(sessionObj.subscription_id) ?? asString(sessionObj.subscription),
    status: completed ? "completed" : "pending",
    raw_payload: payload,
    completed_at: completed ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }).eq("id", purchaseId);
  if (completed && userId) await admin.from("commerce_profiles").update({ bud_license_status: "active", bud_plan: plan }).eq("user_id", userId);
  return jsonResponse(200, { ok: true, received: true });
}

Deno.serve(async (request) => {
  try {
    if (request.method === "OPTIONS") return new Response("ok", { status: 200, headers: CORS_HEADERS });
    let route = new URL(request.url).pathname.replace(/^.*\/functions\/v1\/bud-license/, "").replace(/^\/bud-license/, "") || "/";
    if (request.method === "GET" && (route === "/" || route === "/summary")) return await handleSummary(request);
    if (request.method === "POST" && route === "/checkout") return await handleCheckout(request);
    if (request.method === "POST" && route === "/claim-key") return await handleClaimKey(request);
    if (request.method === "GET" && route === "/owner/users") return await handleOwnerUsers(request);
    if (request.method === "POST" && route === "/owner/free-license") return await handleOwnerFreeLicense(request);
    if (request.method === "POST" && route === "/activate") return await handleActivate(request);
    if (request.method === "POST" && route === "/webhook") return await handleWebhook(request);
    return jsonResponse(404, { ok: false, error: "route_not_found" });
  } catch (error) {
    return jsonResponse(500, { ok: false, error: "edge_500", message: error instanceof Error ? error.message : String(error) });
  }
});
