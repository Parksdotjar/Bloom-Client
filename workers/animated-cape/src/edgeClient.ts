import { workerConfig } from './config.js';
import type { ClaimedJob, ProcessedOrderResult, WorkerError } from './types.js';

type EdgeResponse<T> = {
  ok: boolean;
  error?: string;
  message?: string;
} & T;

async function callEdge<T>(path: string, body: Record<string, unknown>): Promise<EdgeResponse<T>> {
  const response = await fetch(`${workerConfig.mainEdgeUrl}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-bloom-worker-secret': workerConfig.workerSecret
    },
    body: JSON.stringify(body)
  });
  const text = await response.text();
  const parsed = text ? (JSON.parse(text) as EdgeResponse<T>) : ({ ok: false } as EdgeResponse<T>);
  if (!response.ok) {
    throw new Error(parsed.message || parsed.error || `edge_http_${response.status}`);
  }
  return parsed;
}

export async function claimJob(): Promise<ClaimedJob | null> {
  const response = await callEdge<{ job: ClaimedJob | null }>('/animated-cape/worker/claim', {
    worker_id: workerConfig.workerId,
    lease_seconds: workerConfig.leaseSeconds
  });
  return response.job ?? null;
}

export async function completeJob(orderId: string, payload: ProcessedOrderResult) {
  return callEdge('/animated-cape/worker/complete', {
    order_id: orderId,
    worker_id: workerConfig.workerId,
    manifest_storage_path: payload.manifestStoragePath,
    thumbnail_storage_path: payload.thumbnailStoragePath,
    preview_storage_path: payload.previewStoragePath,
    manifest: payload.manifest,
    frame_width: payload.frameWidth,
    frame_height: payload.frameHeight,
    frame_count: payload.frameCount,
    atlas_page_count: payload.atlasPageCount,
    atlas_pages: payload.atlasPages,
    thumbnail_url: payload.thumbnailUrl,
    preview_url: payload.previewUrl
  });
}

function normalizeError(error: unknown): { code: string; message: string; retryable: boolean } {
  if (error && typeof error === 'object' && 'code' in error && 'retryable' in error) {
    const err = error as WorkerError;
    return {
      code: err.code || 'worker_error',
      message: err.message || 'worker_error',
      retryable: Boolean(err.retryable)
    };
  }
  if (error instanceof Error) {
    return {
      code: 'worker_error',
      message: error.message || 'worker_error',
      retryable: true
    };
  }
  return {
    code: 'worker_error',
    message: String(error),
    retryable: true
  };
}

export async function failJob(orderId: string, error: unknown) {
  const normalized = normalizeError(error);
  return callEdge('/animated-cape/worker/fail', {
    order_id: orderId,
    worker_id: workerConfig.workerId,
    error_code: normalized.code,
    error_message: normalized.message,
    retryable: normalized.retryable,
    refund: !normalized.retryable
  });
}
