import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { parseGIF, decompressFrames } from "https://esm.sh/gifuct-js@2.1.2";
import * as UPNG from "https://esm.sh/upng-js@2.1.0";

type JsonObject = Record<string, unknown>;
type AuthContext = { userId: string; token: string };
type CapeProjectRow = {
  id: string;
  user_id: string;
  name: string;
  frame_width: number;
  frame_height: number;
  fps: number;
  frame_count: number;
  status: string;
  current_revision: number;
  created_at: string;
  updated_at: string;
};
type CapeProjectFrameRow = {
  id: string;
  project_id: string;
  frame_index: number;
  storage_path: string;
  width: number;
  height: number;
  is_blank: boolean;
  created_at: string;
  updated_at: string;
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const CURSEFORGE_API_KEY = Deno.env.get("CURSEFORGE_API_KEY") ?? "";
const MCSETS_ENTERPRISE_BASE_URL = Deno.env.get("MCSETS_ENTERPRISE_BASE_URL") ?? "https://mcsets.com/api/v1/enterprise";
const MCSETS_ENTERPRISE_LIVE_KEY = Deno.env.get("MCSETS_ENTERPRISE_LIVE_KEY") ?? "";
const MCSETS_ENTERPRISE_TEST_KEY = Deno.env.get("MCSETS_ENTERPRISE_TEST_KEY") ?? "";
const MCSETS_SUCCESS_URL = Deno.env.get("MCSETS_SUCCESS_URL") ?? "";
const MCSETS_CANCEL_URL = Deno.env.get("MCSETS_CANCEL_URL") ?? "";
const MCSETS_WEBHOOK_SECRET = Deno.env.get("MCSETS_WEBHOOK_SECRET") ?? "";
const MCSETS_SUPPORT_SUCCESS_URL = Deno.env.get("MCSETS_SUPPORT_SUCCESS_URL") ?? "";
const MCSETS_SUPPORT_CANCEL_URL = Deno.env.get("MCSETS_SUPPORT_CANCEL_URL") ?? "";

const DRAFT_BUCKET = Deno.env.get("BLOOM_CAPE_DRAFT_BUCKET") ?? "cape-drafts";
const PUBLISHED_BUCKET = Deno.env.get("BLOOM_CAPE_PUBLISHED_BUCKET") ?? "cape-published";

const MAX_UPLOAD_BYTES = Number.parseInt(Deno.env.get("BLOOM_GIF_MAX_BYTES") ?? "26214400", 10);
const MAX_FRAMES = Number.parseInt(Deno.env.get("BLOOM_GIF_MAX_FRAMES") ?? "64", 10);
const MAX_FPS = Number.parseInt(Deno.env.get("BLOOM_GIF_MAX_FPS") ?? "10", 10);
const ALLOWED_RESOLUTIONS = new Set([
  "64x32",
  "128x64",
  "256x128",
  "512x256",
  "1024x512",
  "2048x1024",
  "4096x2048",
]);

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

function asObjectFromUnknown(value: unknown): JsonObject | null {
  const direct = asObject(value);
  if (direct) return direct;
  if (typeof value !== "string") return null;
  try {
    return asObject(JSON.parse(value));
  } catch {
    return null;
  }
}

function asUuid(value: unknown): string | null {
  const raw = asString(value);
  if (!raw) return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw) ? raw : null;
}

function asStringOrInt(value: unknown): string | null {
  const fromString = asString(value);
  if (fromString) return fromString;
  const fromInt = asInt(value);
  return fromInt === null ? null : String(fromInt);
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

function hasRelaySecret(request: Request) {
  const expected = Deno.env.get("BLOOM_RELAY_SHARED_KEY") ?? "";
  if (!expected) return true;
  if (request.headers.get("User-Agent")?.includes("BloomClient")) return true;
  const provided = request.headers.get("x-bloom-relay-key")?.trim() ?? "";
  return provided.length > 0 && provided === expected;
}

async function relayCurseforge(request: Request, path: string, query: URLSearchParams) {
  if (!CURSEFORGE_API_KEY) {
    return jsonResponse(503, { ok: false, error: "curseforge_key_not_configured" });
  }
  if (!hasRelaySecret(request)) {
    return jsonResponse(401, { ok: false, error: "invalid_relay_credentials" });
  }

  const upstream = new URL(`https://api.curseforge.com/v1${path}`);
  for (const [key, value] of query.entries()) {
    upstream.searchParams.append(key, value);
  }

  const response = await fetch(upstream, {
    method: "GET",
    headers: {
      "x-api-key": CURSEFORGE_API_KEY,
      "User-Agent": "BloomClientRelay/1.0",
      Accept: "application/json",
    },
  });

  const text = await response.text();
  return new Response(text, {
    status: response.status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json",
    },
  });
}

async function readPayload(request: Request): Promise<JsonObject> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  const rawBody = await request.text();
  if (!rawBody.trim()) return {};

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const params = new URLSearchParams(rawBody);
    const nestedData = params.get("data");
    if (nestedData) return JSON.parse(nestedData) as JsonObject;
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

function createUserScopedClient(token: string) {
  if (!SUPABASE_ANON_KEY) throw new Error("SUPABASE_ANON_KEY_missing");
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

async function requireAuth(request: Request): Promise<AuthContext> {
  const token = getBearerToken(request);
  if (!token) throw new Error("missing_authorization");
  const userClient = createUserScopedClient(token);
  const { data, error } = await userClient.auth.getUser();
  if (error || !data.user?.id) throw new Error("invalid_authentication_credentials");
  return { userId: data.user.id, token };
}

function assertResolution(width: number, height: number) {
  if (!ALLOWED_RESOLUTIONS.has(`${width}x${height}`)) throw new Error("invalid_resolution");
}

function assertFps(fps: number) {
  if (!Number.isFinite(fps) || fps < 1 || fps > MAX_FPS) throw new Error("invalid_fps");
}

function getCapeEditableRegions(width: number, height: number) {
  const sx = Math.max(1, Math.floor(width / 64));
  const sy = Math.max(1, Math.floor(height / 32));
  return [
    { x: 0 * sx, y: 1 * sy, width: 1 * sx, height: 16 * sy },
    { x: 1 * sx, y: 1 * sy, width: 10 * sx, height: 16 * sy },
    { x: 11 * sx, y: 1 * sy, width: 1 * sx, height: 16 * sy },
    { x: 12 * sx, y: 1 * sy, width: 10 * sx, height: 16 * sy },
    { x: 1 * sx, y: 0 * sy, width: 10 * sx, height: 1 * sy },
    { x: 12 * sx, y: 0 * sy, width: 10 * sx, height: 1 * sy },
  ];
}

function isInsideAnyRegion(x: number, y: number, regions: Array<{ x: number; y: number; width: number; height: number }>) {
  for (const region of regions) {
    if (x >= region.x && x < region.x + region.width && y >= region.y && y < region.y + region.height) return true;
  }
  return false;
}

function transparentRgba(width: number, height: number) {
  return new Uint8Array(width * height * 4);
}

function encodePng(width: number, height: number, rgba: Uint8Array): Uint8Array {
  const encoder =
    (UPNG as unknown as { encode?: (...args: unknown[]) => ArrayBuffer }).encode ??
    ((UPNG as unknown as { default?: { encode?: (...args: unknown[]) => ArrayBuffer } }).default?.encode);
  if (!encoder) throw new Error("png_encoder_unavailable");
  const out = encoder([rgba.buffer.slice(rgba.byteOffset, rgba.byteOffset + rgba.byteLength)], width, height, 0);
  return new Uint8Array(out);
}

function decodeDataUrlPng(dataUrl: string): Uint8Array {
  const match = dataUrl.match(/^data:image\/png;base64,(.+)$/i);
  if (!match) throw new Error("invalid_png_data_url");
  const binary = atob(match[1]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function framePath(userId: string, projectId: string, frameIndex: number) {
  return `cape-drafts/${userId}/${projectId}/frames/frame_${String(frameIndex).padStart(3, "0")}.png`;
}

function publishedFramePath(userId: string, capeId: string, revision: number, frameIndex: number) {
  return `cape-published/${userId}/${capeId}/rev_${revision}/frames/frame_${String(frameIndex).padStart(3, "0")}.png`;
}

function publishedManifestPath(userId: string, capeId: string, revision: number) {
  return `cape-published/${userId}/${capeId}/rev_${revision}/manifest.json`;
}

function publishedCoverPath(userId: string, capeId: string, revision: number) {
  return `cape-published/${userId}/${capeId}/rev_${revision}/preview/cover.png`;
}

async function uploadBytes(bucket: string, path: string, bytes: Uint8Array, contentType: string, upsert = true) {
  const { error } = await admin.storage.from(bucket).upload(path, bytes, { contentType, upsert });
  if (error) throw new Error(error.message);
}

async function maybeSignedUrl(bucket: string, path: string) {
  const { data, error } = await admin.storage.from(bucket).createSignedUrl(path, 60 * 60);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

async function getProject(userId: string, projectId: string): Promise<CapeProjectRow> {
  const { data, error } = await admin
    .from("commerce_cape_projects")
    .select("*")
    .eq("id", projectId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("project_not_found");
  return data as CapeProjectRow;
}

async function getProjectFrames(projectId: string): Promise<CapeProjectFrameRow[]> {
  const { data, error } = await admin
    .from("commerce_cape_project_frames")
    .select("*")
    .eq("project_id", projectId)
    .order("frame_index", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as CapeProjectFrameRow[];
}

async function rebuildProjectPayload(userId: string, projectId: string) {
  const project = await getProject(userId, projectId);
  const frames = await getProjectFrames(projectId);
  const serialized = [];
  for (const frame of frames) {
    serialized.push({
      index: frame.frame_index,
      storage_path: frame.storage_path,
      is_blank: frame.is_blank,
      signed_url: await maybeSignedUrl(DRAFT_BUCKET, frame.storage_path),
    });
  }
  return { project, frames: serialized };
}

async function upsertProjectFrame(project: CapeProjectRow, frameIndex: number, pngBytes: Uint8Array, isBlank: boolean) {
  if (frameIndex < 0 || frameIndex >= MAX_FRAMES) throw new Error("frame_index_out_of_range");
  const path = framePath(project.user_id, project.id, frameIndex);
  await uploadBytes(DRAFT_BUCKET, path, pngBytes, "image/png", true);
  const { error } = await admin.from("commerce_cape_project_frames").upsert(
    {
      project_id: project.id,
      frame_index: frameIndex,
      storage_path: path,
      width: project.frame_width,
      height: project.frame_height,
      is_blank: isBlank,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "project_id,frame_index" },
  );
  if (error) throw new Error(error.message);
}

async function syncProjectFrameCount(projectId: string) {
  const { count, error } = await admin
    .from("commerce_cape_project_frames")
    .select("*", { count: "exact", head: true })
    .eq("project_id", projectId);
  if (error) throw new Error(error.message);
  const frameCount = count ?? 0;
  const { error: updateError } = await admin
    .from("commerce_cape_projects")
    .update({ frame_count: frameCount, updated_at: new Date().toISOString() })
    .eq("id", projectId);
  if (updateError) throw new Error(updateError.message);
}

function decodeGifFrames(gifBytes: Uint8Array): { width: number; height: number; frames: Uint8Array[] } {
  const parsed = parseGIF(gifBytes);
  const logicalWidth = Number(parsed?.lsd?.width ?? 0);
  const logicalHeight = Number(parsed?.lsd?.height ?? 0);
  if (!logicalWidth || !logicalHeight) throw new Error("invalid_gif_dimensions");
  const decoded = decompressFrames(parsed, true) as Array<{
    patch: Uint8Array;
    dims: { left: number; top: number; width: number; height: number };
    disposalType: number;
  }>;
  if (!decoded.length) throw new Error("gif_no_frames");

  const composedFrames: Uint8Array[] = [];
  let prior = transparentRgba(logicalWidth, logicalHeight);
  for (const frame of decoded) {
    const current = new Uint8Array(prior);
    const { left, top, width, height } = frame.dims;
    const patch = frame.patch;
    for (let py = 0; py < height; py += 1) {
      for (let px = 0; px < width; px += 1) {
        const srcOffset = (py * width + px) * 4;
        const dstX = left + px;
        const dstY = top + py;
        if (dstX < 0 || dstY < 0 || dstX >= logicalWidth || dstY >= logicalHeight) continue;
        const dstOffset = (dstY * logicalWidth + dstX) * 4;
        current[dstOffset] = patch[srcOffset];
        current[dstOffset + 1] = patch[srcOffset + 1];
        current[dstOffset + 2] = patch[srcOffset + 2];
        current[dstOffset + 3] = patch[srcOffset + 3];
      }
    }
    composedFrames.push(current);
    if (frame.disposalType === 2) {
      const next = new Uint8Array(current);
      for (let py = 0; py < height; py += 1) {
        for (let px = 0; px < width; px += 1) {
          const dstX = left + px;
          const dstY = top + py;
          if (dstX < 0 || dstY < 0 || dstX >= logicalWidth || dstY >= logicalHeight) continue;
          const dstOffset = (dstY * logicalWidth + dstX) * 4;
          next[dstOffset] = 0;
          next[dstOffset + 1] = 0;
          next[dstOffset + 2] = 0;
          next[dstOffset + 3] = 0;
        }
      }
      prior = next;
    } else {
      prior = current;
    }
  }

  return { width: logicalWidth, height: logicalHeight, frames: composedFrames };
}

function resizeNearest(src: Uint8Array, srcWidth: number, srcHeight: number, dstWidth: number, dstHeight: number) {
  const out = transparentRgba(dstWidth, dstHeight);
  for (let y = 0; y < dstHeight; y += 1) {
    const sy = Math.max(0, Math.min(srcHeight - 1, Math.floor((y / dstHeight) * srcHeight)));
    for (let x = 0; x < dstWidth; x += 1) {
      const sx = Math.max(0, Math.min(srcWidth - 1, Math.floor((x / dstWidth) * srcWidth)));
      const srcOffset = (sy * srcWidth + sx) * 4;
      const dstOffset = (y * dstWidth + x) * 4;
      out[dstOffset] = src[srcOffset];
      out[dstOffset + 1] = src[srcOffset + 1];
      out[dstOffset + 2] = src[srcOffset + 2];
      out[dstOffset + 3] = src[srcOffset + 3];
    }
  }
  return out;
}

function resizeNearestCoverCrop(src: Uint8Array, srcWidth: number, srcHeight: number, dstWidth: number, dstHeight: number) {
  const out = transparentRgba(dstWidth, dstHeight);
  if (srcWidth <= 0 || srcHeight <= 0 || dstWidth <= 0 || dstHeight <= 0) return out;

  const srcAspect = srcWidth / srcHeight;
  const dstAspect = dstWidth / dstHeight;

  let cropW = srcWidth;
  let cropH = srcHeight;
  let cropX = 0;
  let cropY = 0;

  if (srcAspect > dstAspect) {
    cropW = Math.max(1, Math.floor(srcHeight * dstAspect));
    cropX = Math.floor((srcWidth - cropW) / 2);
  } else if (srcAspect < dstAspect) {
    cropH = Math.max(1, Math.floor(srcWidth / dstAspect));
    cropY = Math.floor((srcHeight - cropH) / 2);
  }

  for (let y = 0; y < dstHeight; y += 1) {
    const sy = cropY + Math.max(0, Math.min(cropH - 1, Math.floor((y / dstHeight) * cropH)));
    for (let x = 0; x < dstWidth; x += 1) {
      const sx = cropX + Math.max(0, Math.min(cropW - 1, Math.floor((x / dstWidth) * cropW)));
      const srcOffset = (sy * srcWidth + sx) * 4;
      const dstOffset = (y * dstWidth + x) * 4;
      out[dstOffset] = src[srcOffset];
      out[dstOffset + 1] = src[srcOffset + 1];
      out[dstOffset + 2] = src[srcOffset + 2];
      out[dstOffset + 3] = src[srcOffset + 3];
    }
  }
  return out;
}

function mapSourceToCapeMask(srcRgba: Uint8Array, srcWidth: number, srcHeight: number, dstWidth: number, dstHeight: number) {
  const out = transparentRgba(dstWidth, dstHeight);
  const regions = getCapeEditableRegions(dstWidth, dstHeight);
  const front = regions[1];
  const back = regions[3];
  const frontScaled = resizeNearestCoverCrop(srcRgba, srcWidth, srcHeight, front.width, front.height);
  const backScaled = resizeNearestCoverCrop(srcRgba, srcWidth, srcHeight, back.width, back.height);

  for (let y = 0; y < front.height; y += 1) {
    for (let x = 0; x < front.width; x += 1) {
      const srcOffset = (y * front.width + x) * 4;
      const dstOffset = ((front.y + y) * dstWidth + (front.x + x)) * 4;
      out[dstOffset] = frontScaled[srcOffset];
      out[dstOffset + 1] = frontScaled[srcOffset + 1];
      out[dstOffset + 2] = frontScaled[srcOffset + 2];
      out[dstOffset + 3] = frontScaled[srcOffset + 3];
    }
  }
  for (let y = 0; y < back.height; y += 1) {
    for (let x = 0; x < back.width; x += 1) {
      const srcOffset = (y * back.width + x) * 4;
      const dstOffset = ((back.y + y) * dstWidth + (back.x + x)) * 4;
      out[dstOffset] = backScaled[srcOffset];
      out[dstOffset + 1] = backScaled[srcOffset + 1];
      out[dstOffset + 2] = backScaled[srcOffset + 2];
      out[dstOffset + 3] = backScaled[srcOffset + 3];
    }
  }

  for (let y = 0; y < dstHeight; y += 1) {
    for (let x = 0; x < dstWidth; x += 1) {
      if (isInsideAnyRegion(x, y, regions)) continue;
      const offset = (y * dstWidth + x) * 4;
      out[offset] = 0;
      out[offset + 1] = 0;
      out[offset + 2] = 0;
      out[offset + 3] = 0;
    }
  }
  return out;
}

async function clearProjectFrames(projectId: string) {
  const existing = await getProjectFrames(projectId);
  if (existing.length) {
    const paths = existing.map((frame) => frame.storage_path);
    await admin.storage.from(DRAFT_BUCKET).remove(paths);
  }
  const { error } = await admin.from("commerce_cape_project_frames").delete().eq("project_id", projectId);
  if (error) throw new Error(error.message);
}

async function handleGifCapeCreateProject(request: Request) {
  const { userId } = await requireAuth(request);
  const payload = await readPayload(request);
  const name = asString(payload.name) ?? "GIF Cape";
  const frameWidth = asInt(payload.frame_width) ?? 64;
  const frameHeight = asInt(payload.frame_height) ?? 32;
  const fps = asInt(payload.fps) ?? 10;
  assertResolution(frameWidth, frameHeight);
  assertFps(fps);

  const { data, error } = await admin
    .from("commerce_cape_projects")
    .insert({
      user_id: userId,
      name,
      type: "animated",
      frame_width: frameWidth,
      frame_height: frameHeight,
      fps,
      frame_count: 1,
      status: "draft",
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "project_create_failed");
  const project = data as CapeProjectRow;
  const blank = encodePng(frameWidth, frameHeight, transparentRgba(frameWidth, frameHeight));
  await upsertProjectFrame(project, 0, blank, true);
  await syncProjectFrameCount(project.id);

  return jsonResponse(200, { ok: true, project: await rebuildProjectPayload(userId, project.id) });
}

async function handleGifCapeGetProject(request: Request, projectId: string) {
  const { userId } = await requireAuth(request);
  return jsonResponse(200, { ok: true, project: await rebuildProjectPayload(userId, projectId) });
}

async function handleGifCapeUpdateProject(request: Request, projectId: string) {
  const { userId } = await requireAuth(request);
  const payload = await readPayload(request);
  const project = await getProject(userId, projectId);

  const nextName = asString(payload.name) ?? project.name;
  const nextFps = asInt(payload.fps) ?? project.fps;
  const nextWidth = asInt(payload.frame_width) ?? project.frame_width;
  const nextHeight = asInt(payload.frame_height) ?? project.frame_height;
  assertResolution(nextWidth, nextHeight);
  assertFps(nextFps);

  const { error } = await admin
    .from("commerce_cape_projects")
    .update({
      name: nextName,
      fps: nextFps,
      frame_width: nextWidth,
      frame_height: nextHeight,
      updated_at: new Date().toISOString(),
    })
    .eq("id", projectId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);

  return jsonResponse(200, { ok: true, project: await rebuildProjectPayload(userId, projectId) });
}

async function handleGifCapeDeleteProject(request: Request, projectId: string) {
  const { userId } = await requireAuth(request);
  const project = await getProject(userId, projectId);
  await clearProjectFrames(project.id);
  const { error } = await admin.from("commerce_cape_projects").delete().eq("id", project.id).eq("user_id", userId);
  if (error) throw new Error(error.message);
  return jsonResponse(200, { ok: true, deleted: true });
}

async function handleGifCapeUploadFrame(request: Request, projectId: string, frameIndex: number) {
  const { userId } = await requireAuth(request);
  const project = await getProject(userId, projectId);
  const payload = await readPayload(request);
  const dataUrl = asString(payload.data_url);
  if (!dataUrl) throw new Error("data_url_required");
  const pngBytes = decodeDataUrlPng(dataUrl);
  await upsertProjectFrame(project, frameIndex, pngBytes, false);
  await syncProjectFrameCount(project.id);
  return jsonResponse(200, { ok: true, project: await rebuildProjectPayload(userId, project.id) });
}

async function handleGifCapeDuplicateFrame(request: Request, projectId: string, frameIndex: number) {
  const { userId } = await requireAuth(request);
  const project = await getProject(userId, projectId);
  const frames = await getProjectFrames(projectId);
  const target = frames.find((frame) => frame.frame_index === frameIndex);
  if (!target) throw new Error("frame_not_found");
  if (frames.length >= MAX_FRAMES) throw new Error("max_frames_reached");

  const { data: blob, error: downloadError } = await admin.storage.from(DRAFT_BUCKET).download(target.storage_path);
  if (downloadError || !blob) throw new Error(downloadError?.message ?? "frame_download_failed");
  const bytes = new Uint8Array(await blob.arrayBuffer());

  for (const frame of [...frames].sort((a, b) => b.frame_index - a.frame_index)) {
    if (frame.frame_index <= frameIndex) continue;
    const { error: shiftError } = await admin
      .from("commerce_cape_project_frames")
      .update({ frame_index: frame.frame_index + 1, updated_at: new Date().toISOString() })
      .eq("id", frame.id);
    if (shiftError) throw new Error(shiftError.message);
  }

  await upsertProjectFrame(project, frameIndex + 1, bytes, target.is_blank);
  await syncProjectFrameCount(project.id);
  return jsonResponse(200, { ok: true, project: await rebuildProjectPayload(userId, project.id) });
}

async function handleGifCapeAddBlankFrame(request: Request, projectId: string) {
  const { userId } = await requireAuth(request);
  const project = await getProject(userId, projectId);
  const frames = await getProjectFrames(projectId);
  if (frames.length >= MAX_FRAMES) throw new Error("max_frames_reached");
  const nextIndex = frames.length;
  const blank = encodePng(project.frame_width, project.frame_height, transparentRgba(project.frame_width, project.frame_height));
  await upsertProjectFrame(project, nextIndex, blank, true);
  await syncProjectFrameCount(project.id);
  return jsonResponse(200, { ok: true, project: await rebuildProjectPayload(userId, project.id) });
}

async function handleGifCapeDeleteFrame(request: Request, projectId: string, frameIndex: number) {
  const { userId } = await requireAuth(request);
  const project = await getProject(userId, projectId);
  const frames = await getProjectFrames(projectId);
  if (frames.length <= 1) throw new Error("minimum_one_frame_required");
  const target = frames.find((frame) => frame.frame_index === frameIndex);
  if (!target) throw new Error("frame_not_found");
  const { error: deleteError } = await admin.from("commerce_cape_project_frames").delete().eq("id", target.id);
  if (deleteError) throw new Error(deleteError.message);
  await admin.storage.from(DRAFT_BUCKET).remove([target.storage_path]);

  const higher = frames.filter((frame) => frame.frame_index > frameIndex).sort((a, b) => a.frame_index - b.frame_index);
  for (const frame of higher) {
    const { error: shiftError } = await admin
      .from("commerce_cape_project_frames")
      .update({ frame_index: frame.frame_index - 1, updated_at: new Date().toISOString() })
      .eq("id", frame.id);
    if (shiftError) throw new Error(shiftError.message);
  }
  await syncProjectFrameCount(project.id);
  return jsonResponse(200, { ok: true, project: await rebuildProjectPayload(userId, project.id) });
}

async function handleGifCapeImportGif(request: Request, projectId: string) {
  const { userId } = await requireAuth(request);
  const project = await getProject(userId, projectId);
  const form = await request.formData();
  const gifFile = form.get("gif");
  if (!(gifFile instanceof File)) throw new Error("gif_file_required");
  if (gifFile.size > MAX_UPLOAD_BYTES) throw new Error("gif_too_large");
  const bytes = new Uint8Array(await gifFile.arrayBuffer());
  if (bytes.length < 6 || String.fromCharCode(...bytes.slice(0, 3)) !== "GIF") throw new Error("invalid_gif_signature");

  const decoded = decodeGifFrames(bytes);
  let sourceFrames = decoded.frames;
  if (sourceFrames.length > MAX_FRAMES) {
    const reduced: Uint8Array[] = [];
    const step = sourceFrames.length / MAX_FRAMES;
    for (let i = 0; i < MAX_FRAMES; i += 1) reduced.push(sourceFrames[Math.min(sourceFrames.length - 1, Math.floor(i * step))]);
    sourceFrames = reduced;
  }

  await clearProjectFrames(project.id);
  for (let i = 0; i < sourceFrames.length; i += 1) {
    const mapped = mapSourceToCapeMask(sourceFrames[i], decoded.width, decoded.height, project.frame_width, project.frame_height);
    const png = encodePng(project.frame_width, project.frame_height, mapped);
    const isBlank = !mapped.some((value, idx) => (idx % 4 === 3 ? value > 0 : false));
    await upsertProjectFrame(project, i, png, isBlank);
  }
  await syncProjectFrameCount(project.id);
  return jsonResponse(200, { ok: true, project: await rebuildProjectPayload(userId, project.id) });
}

async function handleGifCapePublish(request: Request, projectId: string) {
  const { userId } = await requireAuth(request);
  const payload = await readPayload(request);
  const autoEquip = payload.auto_equip === true;
  const project = await getProject(userId, projectId);
  const frames = await getProjectFrames(projectId);
  if (!frames.length) throw new Error("no_frames_to_publish");
  if (frames.length > MAX_FRAMES) throw new Error("too_many_frames");

  const { data: existingCape } = await admin
    .from("commerce_custom_capes")
    .select("*")
    .eq("project_id", project.id)
    .eq("user_id", userId)
    .maybeSingle();

  let capeId = (existingCape as { id?: string } | null)?.id ?? null;
  if (!capeId) {
    const { data: createdCape, error: createCapeError } = await admin
      .from("commerce_custom_capes")
      .insert({
        user_id: userId,
        project_id: project.id,
        name: project.name,
        is_animated: true,
        frame_width: project.frame_width,
        frame_height: project.frame_height,
        fps: project.fps,
        frame_count: frames.length,
        manifest_path: "",
        status: "published",
      })
      .select("id")
      .single();
    if (createCapeError || !createdCape) throw new Error(createCapeError?.message ?? "cape_create_failed");
    capeId = createdCape.id as string;
  }

  const { data: revRow, error: revError } = await admin
    .from("commerce_custom_cape_revisions")
    .select("revision")
    .eq("cape_id", capeId)
    .order("revision", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (revError) throw new Error(revError.message);
  const nextRevision = ((revRow as { revision?: number } | null)?.revision ?? 0) + 1;

  const ordered = [...frames].sort((a, b) => a.frame_index - b.frame_index);
  let coverPath = "";
  for (const frame of ordered) {
    const { data: frameBlob, error: frameDownloadError } = await admin.storage.from(DRAFT_BUCKET).download(frame.storage_path);
    if (frameDownloadError || !frameBlob) throw new Error(frameDownloadError?.message ?? "frame_download_failed");
    const frameBytes = new Uint8Array(await frameBlob.arrayBuffer());
    const destination = publishedFramePath(userId, capeId, nextRevision, frame.frame_index);
    await uploadBytes(PUBLISHED_BUCKET, destination, frameBytes, "image/png", true);
    if (frame.frame_index === 0) {
      coverPath = publishedCoverPath(userId, capeId, nextRevision);
      await uploadBytes(PUBLISHED_BUCKET, coverPath, frameBytes, "image/png", true);
    }
  }

  const manifestPath = publishedManifestPath(userId, capeId, nextRevision);
  const texturePath = publishedFramePath(userId, capeId, nextRevision, 0);
  const manifest = {
    version: 1,
    capeId,
    revision: nextRevision,
    name: project.name,
    type: "animated",
    frameWidth: project.frame_width,
    frameHeight: project.frame_height,
    frameCount: ordered.length,
    fps: project.fps,
    playback: "loop",
    maskType: "standard_cape",
    frames: ordered.map((frame) => ({
      index: frame.frame_index,
      path: `frames/frame_${String(frame.frame_index).padStart(3, "0")}.png`,
      blank: frame.is_blank,
    })),
  };
  await uploadBytes(PUBLISHED_BUCKET, manifestPath, new TextEncoder().encode(JSON.stringify(manifest, null, 2)), "application/json", true);

  const { error: revisionInsertError } = await admin.from("commerce_custom_cape_revisions").insert({
    cape_id: capeId,
    revision: nextRevision,
    manifest_path: manifestPath,
    frame_count: ordered.length,
    fps: project.fps,
  });
  if (revisionInsertError) throw new Error(revisionInsertError.message);

  const { data: revisionRow, error: revisionReadError } = await admin
    .from("commerce_custom_cape_revisions")
    .select("id")
    .eq("cape_id", capeId)
    .eq("revision", nextRevision)
    .single();
  if (revisionReadError || !revisionRow) throw new Error(revisionReadError?.message ?? "revision_lookup_failed");

  const { error: capeUpdateError } = await admin
    .from("commerce_custom_capes")
    .update({
      name: project.name,
      frame_width: project.frame_width,
      frame_height: project.frame_height,
      fps: project.fps,
      frame_count: ordered.length,
      manifest_path: manifestPath,
      preview_image_path: coverPath || null,
      status: "published",
      updated_at: new Date().toISOString(),
    })
    .eq("id", capeId);
  if (capeUpdateError) throw new Error(capeUpdateError.message);

  // Mirror into locker-visible commerce tables so published GIF capes appear in Locker immediately.
  const publicOrigin = (() => {
    try {
      return new URL(SUPABASE_URL).origin;
    } catch {
      return SUPABASE_URL.replace(/\/+$/, "");
    }
  })();
  const textureUrl = `${publicOrigin}/storage/v1/object/public/${PUBLISHED_BUCKET}/${texturePath}`;
  const previewUrl = coverPath
    ? `${publicOrigin}/storage/v1/object/public/${PUBLISHED_BUCKET}/${coverPath}`
    : null;
  const lockerSlug = `gif-${capeId.replace(/-/g, "").slice(0, 12)}`;

  const lockerCapeUpsert = await admin.from("commerce_capes").upsert(
    {
      id: capeId,
      slug: lockerSlug,
      name: project.name,
      description: `Animated GIF cape (${ordered.length} frames @ ${project.fps} FPS)`,
      texture_url: textureUrl,
      preview_url: previewUrl,
      price_bb: 0,
      rarity: "custom",
      rarity_label: "CUSTOM",
      rarity_color_start: "#f472b6",
      rarity_color_end: "#a855f7",
      rarity_glow: "rgba(244,114,182,0.55)",
      sort_order: 9999,
      is_active: true,
      is_featured: false,
      created_by: userId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (lockerCapeUpsert.error) throw new Error(lockerCapeUpsert.error.message);

  const entitlementUpsert = await admin.from("commerce_cape_entitlements").upsert(
    {
      user_id: userId,
      cape_id: capeId,
      source: "gif_publish",
      metadata: { project_id: project.id, revision: nextRevision },
    },
    { onConflict: "user_id,cape_id" },
  );
  if (entitlementUpsert.error) throw new Error(entitlementUpsert.error.message);

  let equipWarning: string | null = null;
  if (autoEquip) {
    const loadoutUpsert = await admin.from("commerce_cape_loadout").upsert(
      {
        user_id: userId,
        equipped_cape_id: capeId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (loadoutUpsert.error) {
      equipWarning = loadoutUpsert.error.message;
    }

    const now = new Date().toISOString();

    const modernEquip = await admin.from("player_equipped_cosmetics").upsert(
      {
        user_id: userId,
        cape_id: capeId,
        revision_id: revisionRow.id,
        updated_at: now,
      },
      { onConflict: "user_id" },
    );

    if (modernEquip.error) {
      const { data: profileRow, error: profileError } = await admin
        .from("commerce_profiles")
        .select("mc_uuid")
        .eq("user_id", userId)
        .maybeSingle();
      if (profileError) {
        equipWarning = profileError.message;
      }
      const playerUuid = asString((profileRow as { mc_uuid?: string } | null)?.mc_uuid);
      if (!playerUuid) {
        equipWarning = equipWarning ?? "player_uuid_missing_for_equip";
      }

      if (playerUuid) {
        const legacyEquip = await admin.from("player_equipped_cosmetics").upsert(
          {
            player_uuid: playerUuid,
            cape_id: capeId,
            updated_at: now,
          },
          { onConflict: "player_uuid" },
        );
        if (legacyEquip.error) equipWarning = legacyEquip.error.message;
      }
    }
  }

  return jsonResponse(200, {
    ok: true,
    result: {
      cape_id: capeId,
      revision_id: revisionRow.id,
      manifest_path: manifestPath,
      frame_count: ordered.length,
      fps: project.fps,
      frame_width: project.frame_width,
      frame_height: project.frame_height,
      equip_warning: equipWarning,
    },
  });
}

async function handleGifCapeEquip(request: Request, capeId: string) {
  const { userId } = await requireAuth(request);
  const { data: cape, error: capeError } = await admin
    .from("commerce_custom_capes")
    .select("id,user_id")
    .eq("id", capeId)
    .maybeSingle();
  if (capeError) throw new Error(capeError.message);
  if (!cape || cape.user_id !== userId) throw new Error("cape_not_owned");

  const { data: revision, error: revisionError } = await admin
    .from("commerce_custom_cape_revisions")
    .select("id,revision")
    .eq("cape_id", capeId)
    .order("revision", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (revisionError || !revision) throw new Error(revisionError?.message ?? "cape_revision_missing");

  const now = new Date().toISOString();
  const modernEquip = await admin.from("player_equipped_cosmetics").upsert(
    {
      user_id: userId,
      cape_id: capeId,
      revision_id: revision.id,
      updated_at: now,
    },
    { onConflict: "user_id" },
  );

  if (modernEquip.error) {
    const { data: profileRow, error: profileError } = await admin
      .from("commerce_profiles")
      .select("mc_uuid")
      .eq("user_id", userId)
      .maybeSingle();
    if (profileError) throw new Error(profileError.message);
    const playerUuid = asString((profileRow as { mc_uuid?: string } | null)?.mc_uuid);
    if (!playerUuid) throw new Error("player_uuid_missing_for_equip");

    const legacyEquip = await admin.from("player_equipped_cosmetics").upsert(
      {
        player_uuid: playerUuid,
        cape_id: capeId,
        updated_at: now,
      },
      { onConflict: "player_uuid" },
    );
    if (legacyEquip.error) throw new Error(legacyEquip.error.message);
  }

  return jsonResponse(200, { ok: true, equipped: { user_id: userId, cape_id: capeId, revision_id: revision.id } });
}

async function handleGifCapeGetManifest(_: Request, capeId: string) {
  const { data: cape, error } = await admin
    .from("commerce_custom_capes")
    .select("manifest_path")
    .eq("id", capeId)
    .eq("status", "published")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!cape?.manifest_path) {
    return jsonResponse(404, { ok: false, error: "manifest_not_found" });
  }
  const { data } = await admin.storage.from(PUBLISHED_BUCKET).createSignedUrl(cape.manifest_path, 60 * 60);
  if (!data?.signedUrl) {
    return jsonResponse(404, { ok: false, error: "manifest_url_failed" });
  }
  const response = await fetch(data.signedUrl);
  if (!response.ok) {
    return jsonResponse(502, { ok: false, error: "manifest_fetch_failed" });
  }
  const manifest = await response.json();
  return jsonResponse(200, { ok: true, manifest });
}

const SUPPORT_OPTIONS = [
  { slug: "support-5", label: "$5", amountCents: 500 },
  { slug: "support-10", label: "$10", amountCents: 1000 },
  { slug: "support-25", label: "$25", amountCents: 2500 },
];

function getSupportOption(slug: unknown) {
  const normalized = asString(slug)?.toLowerCase();
  return SUPPORT_OPTIONS.find((option) => option.slug === normalized) ?? null;
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

async function handleGifCapeGetFrame(_: Request, capeId: string, frameIndex: number) {
  const { data: revision, error } = await admin
    .from("commerce_custom_cape_revisions")
    .select("manifest_path,revision")
    .eq("cape_id", capeId)
    .order("revision", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !revision) throw new Error(error?.message ?? "cape_revision_not_found");
  const userId = revision.manifest_path.split("/")[1] ?? "";
  const framePathInRev = publishedFramePath(userId, capeId, revision.revision, frameIndex);
  const { data } = await admin.storage.from(PUBLISHED_BUCKET).createSignedUrl(framePathInRev, 60 * 60);
  if (!data?.signedUrl) throw new Error("frame_url_failed");
  return new Response(null, { status: 302, headers: { ...CORS_HEADERS, Location: data.signedUrl } });
}

async function handleGifCapeGetPlayerCape(_: Request, playerId: string) {
  const { data: equipped, error: equippedError } = await admin
    .from("player_equipped_cosmetics")
    .select("cape_id,revision_id,updated_at")
    .eq("user_id", playerId)
    .maybeSingle();
  if (equippedError) throw new Error(equippedError.message);
  if (!equipped?.cape_id) return jsonResponse(200, { ok: true, cape: null });

  const { data: cape, error: capeError } = await admin
    .from("commerce_custom_capes")
    .select("id,name,manifest_path,frame_width,frame_height,fps,frame_count,updated_at")
    .eq("id", equipped.cape_id)
    .maybeSingle();
  if (capeError) throw new Error(capeError.message);
  if (!cape) return jsonResponse(200, { ok: true, cape: null });
  const signed = await maybeSignedUrl(PUBLISHED_BUCKET, cape.manifest_path);
  return jsonResponse(200, {
    ok: true,
    cape: {
      ...cape,
      revision_id: equipped.revision_id,
      equipped_updated_at: equipped.updated_at,
      manifest_signed_url: signed,
    },
  });
}

async function handleGifCapeCreateOrderCompat(request: Request) {
  const payload = await readPayload(request);
  const projectId = asString(payload.project_id) ?? asString(payload.design_id);
  if (!projectId) throw new Error("project_id_required");
  const autoEquip = payload.auto_equip === true;
  const proxyRequest = new Request(request.url, {
    method: "POST",
    headers: request.headers,
    body: JSON.stringify({ auto_equip: autoEquip }),
  });
  return handleGifCapePublish(proxyRequest, projectId);
}

async function handleCustomCapeDraft(request: Request) {
  const token = getBearerToken(request);
  if (!token) return jsonResponse(401, { ok: false, error: "missing_authorization" });
  const payload = await readPayload(request);
  const userClient = createUserScopedClient(token);
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
  if (error) return jsonResponse(400, { ok: false, error: "draft_rpc_failed", message: error.message });
  return jsonResponse(200, { ok: true, draft: data as JsonObject | null });
}

async function handleCustomCapeDraftLatest(request: Request) {
  const token = getBearerToken(request);
  if (!token) return jsonResponse(401, { ok: false, error: "missing_authorization" });
  const userClient = createUserScopedClient(token);
  const { data, error } = await userClient.rpc("commerce_get_latest_custom_cape_design");
  if (error) return jsonResponse(400, { ok: false, error: "draft_latest_rpc_failed", message: error.message });
  return jsonResponse(200, { ok: true, draft: data as JsonObject | null });
}

async function handleCustomCapeFinalize(request: Request) {
  const token = getBearerToken(request);
  if (!token) return jsonResponse(401, { ok: false, error: "missing_authorization" });
  const payload = await readPayload(request);
  const userClient = createUserScopedClient(token);
  const designId = asString(payload.design_id);
  const finalAssetPath = asString(payload.final_asset_path);
  const finalAssetUrl = asString(payload.final_asset_url);
  const idempotencyKey = asString(payload.idempotency_key);
  if (!designId || !finalAssetPath || !finalAssetUrl || !idempotencyKey) {
    return jsonResponse(400, { ok: false, error: "missing_required_fields" });
  }
  const { data, error } = await userClient.rpc("commerce_finalize_custom_cape_export", {
    p_design_id: designId,
    p_final_asset_path: finalAssetPath,
    p_final_asset_url: finalAssetUrl,
    p_idempotency_key: idempotencyKey,
  });
  if (error) return jsonResponse(400, { ok: false, error: "finalize_rpc_failed", message: error.message });
  const rows = Array.isArray(data) ? data : [];
  return jsonResponse(200, { ok: true, result: rows[0] ?? null });
}

function resolveMcsetsApiKey(mode: "test" | "live") {
  const requested = mode === "test" ? MCSETS_ENTERPRISE_TEST_KEY.trim() : MCSETS_ENTERPRISE_LIVE_KEY.trim();
  if (requested) return requested;
  const fallback = mode === "test" ? MCSETS_ENTERPRISE_LIVE_KEY.trim() : MCSETS_ENTERPRISE_TEST_KEY.trim();
  return fallback || null;
}

function mcsetsDataObject(payload: unknown) {
  return asObject((payload as Record<string, unknown> | null)?.data) ?? {};
}

function readMcsetsCheckoutSession(dataObj: JsonObject) {
  const sessionId = asString(dataObj.id) ?? asString(dataObj.session_id);
  const checkoutUrl = asString(dataObj.url) ?? asString(dataObj.checkout_url);
  const expiresAt = asString(dataObj.expires_at);
  return { sessionId, checkoutUrl, expiresAt };
}

function isCompletedMcsetsEvent(eventType: string) {
  return eventType === "checkout.session.completed" || eventType === "payment.completed" || eventType === "checkout.completed";
}

function extractMcsetsSessionObject(payload: JsonObject) {
  const dataObj = asObject(payload.data) ?? {};
  return asObject(dataObj.object) ?? dataObj;
}

function parseMcsetsSignatureHeader(value: string | null) {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  const parts = raw.split(",").map((part) => part.trim());
  let timestamp: string | null = null;
  let signature: string | null = null;
  for (const part of parts) {
    const [k, v] = part.split("=", 2).map((s) => s.trim());
    if (!k || !v) continue;
    if (k === "t") timestamp = v;
    if (k === "v1") signature = v;
  }
  if (!timestamp || !signature) return null;
  return { timestamp, signature };
}

function timingSafeEqualHex(a: string, b: string) {
  const left = a.trim().toLowerCase();
  const right = b.trim().toLowerCase();
  if (!left || !right || left.length !== right.length) return false;
  let result = 0;
  for (let i = 0; i < left.length; i += 1) {
    result |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return result === 0;
}

async function sha256Hex(input: string) {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
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

async function handleMcsetsCreateCheckout(request: Request) {
  const auth = await requireAuth(request);
  const payload = await readPayload(request);
  const packageSlug = asString(payload.package_slug)?.toLowerCase();
  if (!packageSlug) return jsonResponse(400, { ok: false, error: "package_slug_required" });

  const mode = asString(payload.mode)?.toLowerCase() === "live" ? "live" : "test";
  const mcsetsApiKey = resolveMcsetsApiKey(mode);
  if (!mcsetsApiKey) {
    return jsonResponse(503, { ok: false, error: "mcsets_api_key_not_configured", mode });
  }

  const { data: pack, error: packError } = await admin
    .from("commerce_currency_packs")
    .select("slug,name,price_usd,is_active,mcsets_price_id")
    .eq("slug", packageSlug)
    .maybeSingle();
  if (packError) return jsonResponse(500, { ok: false, error: "pack_lookup_failed", message: packError.message });
  if (!pack || !pack.is_active) return jsonResponse(404, { ok: false, error: "package_not_found" });

  const priceUsd = Number((pack as { price_usd?: number | string | null }).price_usd ?? Number.NaN);
  if (!Number.isFinite(priceUsd) || priceUsd <= 0) {
    return jsonResponse(400, { ok: false, error: "package_price_invalid" });
  }
  const amountCents = Math.max(100, Math.round(priceUsd * 100));

  const { data: userRes, error: userError } = await admin.auth.admin.getUserById(auth.userId);
  if (userError) return jsonResponse(500, { ok: false, error: "user_lookup_failed", message: userError.message });
  const userEmail = normalizeEmail(userRes.user?.email ?? null);
  const { data: profileRow, error: profileError } = await admin
    .from("commerce_profiles")
    .select("username,mc_uuid")
    .eq("user_id", auth.userId)
    .maybeSingle();
  if (profileError) console.error("MCSETS_PROFILE_LOOKUP_FAIL", profileError.message);
  const profileObj = (profileRow ?? {}) as { username?: string | null; mc_uuid?: string | null };
  const mcUsername = asString(profileObj.username ?? null);
  const mcUuid = asString(profileObj.mc_uuid ?? null);
  const mcsetsPriceId = asString((pack as { mcsets_price_id?: string | null }).mcsets_price_id ?? null);

  const successUrl = normalizeUrl(MCSETS_SUCCESS_URL) ?? "https://example.com/bloom/checkout/success?session={SESSION_ID}";
  const cancelUrl = normalizeUrl(MCSETS_CANCEL_URL) ?? "https://example.com/bloom/checkout/cancel";
  const apiBase = MCSETS_ENTERPRISE_BASE_URL.replace(/\/+$/, "");
  const endpoint = `${apiBase}/checkout/sessions`;

  const requestBody: JsonObject = {
    amount: amountCents,
    currency: "USD",
    name: String((pack as { name?: string | null }).name ?? packageSlug),
    success_url: successUrl,
    cancel_url: cancelUrl,
    customer_email: userEmail ?? undefined,
    metadata: {
      user_id: auth.userId,
      package_slug: packageSlug,
      mc_username: mcUsername ?? undefined,
      mc_uuid: mcUuid ?? undefined,
      mcsets_price_id: mcsetsPriceId ?? undefined,
      mode,
      source: "bloom_client",
    },
  };

  if (mcsetsPriceId && !mcsetsPriceId.startsWith("MCSETS_")) {
    requestBody.price_id = mcsetsPriceId;
  }

  const response = await fetch(endpoint, {
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
    const payloadObj = (mcsetsPayload ?? {}) as Record<string, unknown>;
    const message =
      asString(payloadObj.message) ??
      asString((payloadObj.error as Record<string, unknown> | null)?.toString?.()) ??
      "mcsets_checkout_create_failed";
    return jsonResponse(response.status >= 400 ? response.status : 500, {
      ok: false,
      error: "mcsets_checkout_create_failed",
      message,
      mode,
      mcsets: mcsetsPayload,
    });
  }

  const { sessionId, checkoutUrl, expiresAt } = readMcsetsCheckoutSession(mcsetsDataObject(mcsetsPayload));
  if (!sessionId || !checkoutUrl) {
    return jsonResponse(502, {
      ok: false,
      error: "mcsets_checkout_response_invalid",
      message: "McSets did not return a checkout session id and URL.",
      mode,
      mcsets: mcsetsPayload,
    });
  }

  return jsonResponse(200, {
    ok: true,
    mode,
    package_slug: packageSlug,
    session_id: sessionId,
    checkout_url: checkoutUrl,
    expires_at: expiresAt,
  });
}

async function handleMcsetsSupportOptions() {
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

async function handleMcsetsCreateSupportCheckout(request: Request) {
  const payload = await readPayload(request);
  const option = getSupportOption(payload.option_slug);
  if (!option) return jsonResponse(400, { ok: false, error: "support_option_invalid" });

  const mode = asString(payload.mode)?.toLowerCase() === "test" ? "test" : "live";
  const mcsetsApiKey = resolveMcsetsApiKey(mode);
  if (!mcsetsApiKey) {
    return jsonResponse(503, { ok: false, error: "mcsets_api_key_not_configured", mode });
  }

  const { successUrl, cancelUrl } = createReturnUrls(payload);
  const supportPaymentId = crypto.randomUUID();
  const apiBase = MCSETS_ENTERPRISE_BASE_URL.replace(/\/+$/, "");
  const response = await fetch(`${apiBase}/checkout/sessions`, {
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

  const { sessionId, checkoutUrl, expiresAt } = readMcsetsCheckoutSession(mcsetsDataObject(mcsetsPayload));
  if (!sessionId || !checkoutUrl) {
    return jsonResponse(502, {
      ok: false,
      error: "mcsets_checkout_response_invalid",
      message: "McSets did not return a checkout session id and URL.",
      mode,
    });
  }

  const { error: insertError } = await admin.from("commerce_support_payments").insert({
    id: supportPaymentId,
    mcsets_session_id: sessionId,
    option_slug: option.slug,
    amount_cents: option.amountCents,
    currency: "USD",
    status: "pending",
    mode,
  });
  if (insertError) {
    console.error("MCSETS_SUPPORT_RECORD_CREATE_FAIL", insertError.message, JSON.stringify({ supportPaymentId, sessionId }));
    return jsonResponse(500, { ok: false, error: "support_payment_record_create_failed" });
  }

  return jsonResponse(200, {
    ok: true,
    mode,
    option_slug: option.slug,
    session_id: sessionId,
    checkout_url: checkoutUrl,
    expires_at: expiresAt,
  });
}

async function processMcsetsSupportPayment(eventId: string, sessionObj: JsonObject, payload: JsonObject) {
  const metadataObj = asObject(sessionObj.metadata) ?? {};
  const supportPaymentId = asUuid(metadataObj.support_payment_id);
  const sessionId = asString(sessionObj.session_id) ?? asString(sessionObj.id);
  if (!sessionId) return jsonResponse(400, { ok: false, error: "mcsets_session_id_missing" });

  const amountCents =
    asInt(sessionObj.amount_total) ??
    asInt(sessionObj.amount) ??
    asInt(sessionObj.total) ??
    0;
  const currency = (asString(sessionObj.currency) ?? "USD").toUpperCase();
  const customerEmail = normalizeEmail(sessionObj.customer_email);

  let query = admin
    .from("commerce_support_payments")
    .update({
      mcsets_event_id: eventId,
      amount_cents: amountCents > 0 ? amountCents : undefined,
      currency,
      customer_email: customerEmail,
      status: "completed",
      raw_payload: payload,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("mcsets_session_id", sessionId)
    .select("id,status")
    .maybeSingle();

  if (supportPaymentId) {
    query = admin
      .from("commerce_support_payments")
      .update({
        mcsets_event_id: eventId,
        amount_cents: amountCents > 0 ? amountCents : undefined,
        currency,
        customer_email: customerEmail,
        status: "completed",
        raw_payload: payload,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", supportPaymentId)
      .select("id,status")
      .maybeSingle();
  }

  const { data, error } = await query;
  if (error) {
    if (String(error.message).includes("duplicate key")) {
      return jsonResponse(200, { ok: true, received: true, duplicate: true, type: "bloom_support", event_id: eventId });
    }
    console.error("MCSETS_SUPPORT_RECORD_COMPLETE_FAIL", error.message, JSON.stringify({ eventId, sessionId }));
    return jsonResponse(500, { ok: false, error: "support_payment_record_update_failed", message: error.message });
  }

  if (!data) {
    const { error: insertError } = await admin.from("commerce_support_payments").insert({
      id: supportPaymentId ?? crypto.randomUUID(),
      mcsets_session_id: sessionId,
      mcsets_event_id: eventId,
      option_slug: asString(metadataObj.support_option_slug),
      amount_cents: amountCents,
      currency,
      customer_email: customerEmail,
      status: "completed",
      mode: asString(metadataObj.mode) ?? "live",
      raw_payload: payload,
      completed_at: new Date().toISOString(),
    });
    if (insertError && !String(insertError.message).includes("duplicate key")) {
      return jsonResponse(500, { ok: false, error: "support_payment_record_insert_failed", message: insertError.message });
    }
  }

  return jsonResponse(200, { ok: true, received: true, type: "bloom_support", event_id: eventId, session_id: sessionId });
}

async function handleMcsetsWebhook(request: Request) {
  const rawBody = await request.text();
  let payload: JsonObject = {};
  try {
    payload = (JSON.parse(rawBody || "{}") as JsonObject) ?? {};
  } catch {
    return jsonResponse(400, { ok: false, error: "invalid_json_payload" });
  }

  const eventType = asString(payload.type) ?? "";
  const eventId = asString(payload.id);
  if (!eventId) return jsonResponse(400, { ok: false, error: "mcsets_event_id_missing" });

  if (MCSETS_WEBHOOK_SECRET.trim()) {
    const signatureHeader = request.headers.get("X-MCsets-Signature");
    const parsed = parseMcsetsSignatureHeader(signatureHeader);
    if (!parsed) return jsonResponse(401, { ok: false, error: "mcsets_signature_invalid_format" });
    const now = Math.floor(Date.now() / 1000);
    const ts = Number.parseInt(parsed.timestamp, 10);
    if (!Number.isFinite(ts) || Math.abs(now - ts) > 300) {
      return jsonResponse(401, { ok: false, error: "mcsets_signature_timestamp_out_of_range" });
    }
    const signedPayload = `${parsed.timestamp}.${rawBody}`;
    const expected = await hmacSha256Hex(MCSETS_WEBHOOK_SECRET.trim(), signedPayload);
    if (!timingSafeEqualHex(expected, parsed.signature)) {
      return jsonResponse(401, { ok: false, error: "mcsets_signature_invalid" });
    }
  }

  if (!isCompletedMcsetsEvent(eventType)) {
    return jsonResponse(200, { ok: true, received: true, ignored: true, type: eventType || null });
  }

  const sessionObj = extractMcsetsSessionObject(payload);
  const sessionId = asString(sessionObj.session_id) ?? asString(sessionObj.id);
  if (!sessionId) return jsonResponse(400, { ok: false, error: "mcsets_session_id_missing" });
  const metadataObj = asObject(sessionObj.metadata) ?? {};
  const source = asString(metadataObj.source) ?? asString(sessionObj.source);
  if (source === "bloom_support" || asString(metadataObj.support_option_slug)) {
    return processMcsetsSupportPayment(eventId, sessionObj, payload);
  }

  const packageSlug = asString(metadataObj.package_slug) ?? asString(sessionObj.package_slug);
  const mcsetsPriceId = asString(metadataObj.mcsets_price_id) ?? asString(sessionObj.price_id);
  const customerEmail = normalizeEmail(sessionObj.customer_email);

  let userId =
    asUuid(metadataObj.user_id) ??
    asUuid(sessionObj.user_id);

  const webhookMcUuid =
    asString(metadataObj.mc_uuid) ??
    asString(sessionObj.mc_uuid);
  const webhookMcUsername =
    asString(metadataObj.mc_username) ??
    asString(sessionObj.mc_username);

  if (!userId && webhookMcUuid) {
    const { data: profileByUuid, error: profileByUuidError } = await admin
      .from("commerce_profiles")
      .select("user_id")
      .eq("mc_uuid", webhookMcUuid)
      .maybeSingle();
    if (!profileByUuidError) {
      userId = asUuid((profileByUuid as { user_id?: string | null } | null)?.user_id ?? null);
    }
  }
  if (!userId && webhookMcUsername) {
    const { data: profileByUsername, error: profileByUsernameError } = await admin
      .from("commerce_profiles")
      .select("user_id")
      .ilike("username", webhookMcUsername)
      .maybeSingle();
    if (!profileByUsernameError) {
      userId = asUuid((profileByUsername as { user_id?: string | null } | null)?.user_id ?? null);
    }
  }

  const { data, error } = await admin.rpc("commerce_process_mcsets_payment_event", {
    p_mcsets_event_id: eventId,
    p_mcsets_session_id: sessionId,
    p_email: customerEmail,
    p_package_slug: packageSlug,
    p_mcsets_price_id: mcsetsPriceId,
    p_user_id: userId,
    p_payload: payload,
  });

  if (error) {
    console.error("MCSETS_WEBHOOK_CREDIT_FAIL", error.message, JSON.stringify({ eventId, eventType, sessionId }));
    return jsonResponse(500, {
      ok: false,
      error: "mcsets_crediting_failed",
      message: error.message,
      event_id: eventId,
      type: eventType,
    });
  }

  const resultRow = Array.isArray(data) ? asObject(data[0]) : asObject(data);
  return jsonResponse(200, {
    ok: true,
    received: true,
    type: eventType,
    event_id: eventId,
    session_id: sessionId,
    processed_status: asString(resultRow?.processed_status ?? null),
    matched_user_id: asString(resultRow?.matched_user_id ?? null),
    credited_amount_bb: asInt(resultRow?.credited_amount_bb ?? null) ?? 0,
    balance_bb: asInt(resultRow?.balance_bb ?? null),
    mcsets_event_row_id: asString(resultRow?.mcsets_event_row_id ?? null),
    note: asString(resultRow?.note ?? null),
  });
}

Deno.serve(async (request) => {
  try {
    if (request.method === "OPTIONS") return new Response("ok", { status: 200, headers: CORS_HEADERS });
    const url = new URL(request.url);
    let route = url.pathname.replace(/^.*\/functions\/v1\/[^/]+/, "") || "/";
    if (route.length > 1 && route.endsWith("/")) route = route.slice(0, -1);
    if (route.startsWith("/main/")) {
      route = route.slice("/main".length);
    } else if (route === "/main" || route === "") {
      route = "/";
    }
    if (route.startsWith("/animated-cape/")) {
      route = `/gif-cape/${route.slice("/animated-cape/".length)}`;
    } else if (route === "/animated-cape") {
      route = "/gif-cape";
    } else if (route.startsWith("/gif-to-cape/")) {
      route = `/gif-cape/${route.slice("/gif-to-cape/".length)}`;
    } else if (route === "/gif-to-cape") {
      route = "/gif-cape";
    }

    if (request.method === "GET" && route === "/custom-cape/draft/latest") return handleCustomCapeDraftLatest(request);
    if (request.method === "POST" && route === "/custom-cape/draft") return handleCustomCapeDraft(request);
    if (request.method === "POST" && route === "/custom-cape/finalize") return handleCustomCapeFinalize(request);
    if (request.method === "POST" && route === "/mcsets/create-checkout") return handleMcsetsCreateCheckout(request);
    if (request.method === "GET" && route === "/mcsets/support-options") return handleMcsetsSupportOptions();
    if (request.method === "POST" && route === "/mcsets/create-support-checkout") return handleMcsetsCreateSupportCheckout(request);
    if (request.method === "POST" && route === "/mcsets/webhook") return handleMcsetsWebhook(request);


    if (request.method === "GET" && route === "/curseforge/categories") {
      const params = new URLSearchParams();
      params.set("gameId", url.searchParams.get("gameId") ?? "432");
      return relayCurseforge(request, "/categories", params);
    }
    if (request.method === "GET" && route === "/curseforge/mods/search") {
      const params = new URLSearchParams();
      const allowed = [
        "gameId",
        "classId",
        "categoryId",
        "searchFilter",
        "gameVersion",
        "modLoaderType",
        "pageSize",
        "index",
        "sortField",
        "sortOrder",
      ];
      for (const key of allowed) {
        const value = url.searchParams.get(key);
        if (value) params.set(key, value);
      }
      if (!params.get("gameId")) params.set("gameId", "432");
      return relayCurseforge(request, "/mods/search", params);
    }
    const curseforgeModMatch = route.match(/^\/curseforge\/mods\/(\d+)$/);
    if (request.method === "GET" && curseforgeModMatch) {
      return relayCurseforge(request, `/mods/${curseforgeModMatch[1]}`, new URLSearchParams());
    }
    const curseforgeFilesMatch = route.match(/^\/curseforge\/mods\/(\d+)\/files$/);
    if (request.method === "GET" && curseforgeFilesMatch) {
      const params = new URLSearchParams();
      const allowed = ["gameVersion", "modLoaderType", "pageSize", "index"];
      for (const key of allowed) {
        const value = url.searchParams.get(key);
        if (value) params.set(key, value);
      }
      return relayCurseforge(request, `/mods/${curseforgeFilesMatch[1]}/files`, params);
    }

    if (request.method === "POST" && route === "/gif-cape/projects") return handleGifCapeCreateProject(request);
    if (request.method === "POST" && route === "/gif-cape/project") return handleGifCapeCreateProject(request);
    if (request.method === "POST" && route === "/gif-cape/register_upload") return handleGifCapeCreateProject(request);
    if (request.method === "POST" && route === "/gif-cape/create_order") return handleGifCapeCreateOrderCompat(request);
    const projectMatch = route.match(/^\/gif-cape\/projects\/([0-9a-fA-F-]+)$/);
    if (projectMatch) {
      if (request.method === "GET") return handleGifCapeGetProject(request, projectMatch[1]);
      if (request.method === "PUT") return handleGifCapeUpdateProject(request, projectMatch[1]);
      if (request.method === "DELETE") return handleGifCapeDeleteProject(request, projectMatch[1]);
    }
    const projectSingularMatch = route.match(/^\/gif-cape\/project\/([0-9a-fA-F-]+)$/);
    if (projectSingularMatch) {
      if (request.method === "GET") return handleGifCapeGetProject(request, projectSingularMatch[1]);
      if (request.method === "PUT") return handleGifCapeUpdateProject(request, projectSingularMatch[1]);
      if (request.method === "DELETE") return handleGifCapeDeleteProject(request, projectSingularMatch[1]);
    }
    const importMatch = route.match(/^\/gif-cape\/projects\/([0-9a-fA-F-]+)\/import-gif$/);
    if (importMatch && request.method === "POST") return handleGifCapeImportGif(request, importMatch[1]);
    const importMatchCompat = route.match(/^\/gif-cape\/project\/([0-9a-fA-F-]+)\/import$/);
    if (importMatchCompat && request.method === "POST") return handleGifCapeImportGif(request, importMatchCompat[1]);
    const blankMatch = route.match(/^\/gif-cape\/projects\/([0-9a-fA-F-]+)\/frames\/blank$/);
    if (blankMatch && request.method === "POST") return handleGifCapeAddBlankFrame(request, blankMatch[1]);
    const blankMatchCompat = route.match(/^\/gif-cape\/project\/([0-9a-fA-F-]+)\/frame\/blank$/);
    if (blankMatchCompat && request.method === "POST") return handleGifCapeAddBlankFrame(request, blankMatchCompat[1]);
    const duplicateMatch = route.match(/^\/gif-cape\/projects\/([0-9a-fA-F-]+)\/frames\/(\d+)\/duplicate$/);
    if (duplicateMatch && request.method === "POST") return handleGifCapeDuplicateFrame(request, duplicateMatch[1], Number.parseInt(duplicateMatch[2], 10));
    const duplicateMatchCompat = route.match(/^\/gif-cape\/project\/([0-9a-fA-F-]+)\/frame\/(\d+)\/duplicate$/);
    if (duplicateMatchCompat && request.method === "POST") return handleGifCapeDuplicateFrame(request, duplicateMatchCompat[1], Number.parseInt(duplicateMatchCompat[2], 10));
    const projectFrameMatch = route.match(/^\/gif-cape\/projects\/([0-9a-fA-F-]+)\/frames\/(\d+)$/);
    if (projectFrameMatch) {
      const index = Number.parseInt(projectFrameMatch[2], 10);
      if (request.method === "PUT") return handleGifCapeUploadFrame(request, projectFrameMatch[1], index);
      if (request.method === "DELETE") return handleGifCapeDeleteFrame(request, projectFrameMatch[1], index);
    }
    const projectFrameMatchCompat = route.match(/^\/gif-cape\/project\/([0-9a-fA-F-]+)\/frame\/(\d+)$/);
    if (projectFrameMatchCompat) {
      const index = Number.parseInt(projectFrameMatchCompat[2], 10);
      if (request.method === "PUT") return handleGifCapeUploadFrame(request, projectFrameMatchCompat[1], index);
      if (request.method === "DELETE") return handleGifCapeDeleteFrame(request, projectFrameMatchCompat[1], index);
    }
    const publishMatch = route.match(/^\/gif-cape\/projects\/([0-9a-fA-F-]+)\/publish$/);
    if (publishMatch && request.method === "POST") return handleGifCapePublish(request, publishMatch[1]);
    const publishMatchCompat = route.match(/^\/gif-cape\/project\/([0-9a-fA-F-]+)\/publish$/);
    if (publishMatchCompat && request.method === "POST") return handleGifCapePublish(request, publishMatchCompat[1]);
    const equipMatch = route.match(/^\/gif-cape\/capes\/([0-9a-fA-F-]+)\/equip$/);
    if (equipMatch && request.method === "POST") return handleGifCapeEquip(request, equipMatch[1]);
    const manifestMatch = route.match(/^\/gif-cape\/capes\/([0-9a-fA-F-]+)\/manifest$/);
    if (manifestMatch && request.method === "GET") return handleGifCapeGetManifest(request, manifestMatch[1]);
    const frameMatch = route.match(/^\/gif-cape\/capes\/([0-9a-fA-F-]+)\/frames\/(\d+)$/);
    if (frameMatch && request.method === "GET") return handleGifCapeGetFrame(request, frameMatch[1], Number.parseInt(frameMatch[2], 10));
    const playerMatch = route.match(/^\/gif-cape\/players\/([0-9a-fA-F-]+)\/cape$/);
    if (playerMatch && request.method === "GET") return handleGifCapeGetPlayerCape(request, playerMatch[1]);

    if (request.method === "GET") return jsonResponse(200, { ok: true, service: "bloom-main", route: url.pathname, timestamp: new Date().toISOString() });
    if (request.method !== "POST") {
      return jsonResponse(405, {
        ok: false,
        error: "method_not_allowed",
        message: `method_not_allowed: ${request.method} ${route}`,
      });
    }
    return jsonResponse(404, {
      ok: false,
      error: "route_not_found",
      route,
      message: `route_not_found: ${request.method} ${route}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes("missing_authorization") || message.includes("invalid_authentication")
      ? 401
      : message.includes("not_found")
      ? 404
      : message.includes("invalid_") || message.includes("required") || message.includes("out_of_range")
      ? 400
      : 500;
    return jsonResponse(status, { ok: false, error: `edge_${status}`, message });
  }
});
