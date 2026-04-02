export type OrderStatus =
  | 'upload_pending'
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'refunded';

export type AnimatedMediaType = 'gif' | 'mp4';

export type ClaimedJob = {
  job_id: string;
  order_id: string;
  attempts: number;
  max_attempts: number;
  payload: Record<string, unknown>;
};

export type AnimatedCapeOrder = {
  id: string;
  user_id: string;
  upload_media_id: string;
  source_type: AnimatedMediaType;
  source_storage_path: string;
  selected_fps: number;
  selected_duration_seconds: number;
  cost_bloom_bucks: number;
  status: OrderStatus;
  crop_x: number | null;
  crop_y: number | null;
  crop_w: number | null;
  crop_h: number | null;
};

export type ProbeMetadata = {
  width: number;
  height: number;
  durationSeconds: number;
  codecName: string | null;
  pixFmt: string | null;
};

export type CropRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type FramePlacement = {
  index: number;
  framePath: string;
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  durationMs: number;
};

export type AtlasPageDescriptor = {
  page_index: number;
  storage_path: string;
  width: number;
  height: number;
};

export type AnimatedCapeManifestFrame = {
  index: number;
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  durationMs: number;
};

export type AnimatedCapeManifest = {
  version: 1;
  cosmeticType: 'cape';
  atlasPages: Array<{ path: string; width: number; height: number }>;
  frameWidth: number;
  frameHeight: number;
  fps: number;
  durationSeconds: number;
  frameCount: number;
  loopMode: 'repeat';
  frames: AnimatedCapeManifestFrame[];
};

export type ProcessedOrderResult = {
  manifestStoragePath: string;
  thumbnailStoragePath: string;
  previewStoragePath: string | null;
  frameWidth: number;
  frameHeight: number;
  frameCount: number;
  atlasPageCount: number;
  atlasPages: AtlasPageDescriptor[];
  manifest: AnimatedCapeManifest;
  thumbnailUrl: string | null;
  previewUrl: string | null;
};

export class WorkerError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(code: string, message: string, retryable: boolean) {
    super(message);
    this.code = code;
    this.retryable = retryable;
  }
}
