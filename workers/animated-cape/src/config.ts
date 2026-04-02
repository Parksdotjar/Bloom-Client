import path from 'node:path';

function asPositiveInt(raw: string | undefined, fallback: number, min: number, max: number) {
  if (!raw) return fallback;
  const value = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`missing_env:${name}`);
  return value;
}

function resolveMainEdgeUrl() {
  const explicit = process.env.BLOOM_MAIN_EDGE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, '');
  const supabase = required('SUPABASE_URL').replace(/\/+$/, '');
  return `${supabase}/functions/v1/main`;
}

export const workerConfig = {
  supabaseUrl: required('SUPABASE_URL'),
  supabaseServiceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
  mainEdgeUrl: resolveMainEdgeUrl(),
  workerSecret: required('BLOOM_ANIMATED_CAPE_WORKER_SECRET'),
  workerId: process.env.WORKER_ID?.trim() || `animated-cape-worker-${process.pid}`,
  pollIntervalMs: asPositiveInt(process.env.WORKER_POLL_INTERVAL_MS, 2500, 250, 60_000),
  idleIntervalMs: asPositiveInt(process.env.WORKER_IDLE_INTERVAL_MS, 4000, 500, 120_000),
  leaseSeconds: asPositiveInt(process.env.WORKER_LEASE_SECONDS, 420, 30, 3600),
  maxConcurrency: asPositiveInt(process.env.WORKER_MAX_CONCURRENCY, 1, 1, 4),
  ffmpegBin: process.env.FFMPEG_BIN?.trim() || 'ffmpeg',
  ffprobeBin: process.env.FFPROBE_BIN?.trim() || 'ffprobe',
  tmpRoot: path.resolve(process.env.WORKER_TMP_ROOT?.trim() || './.tmp')
};
