import { supabase } from './supabase';

export type SpriteCapeProjectFrame = {
  index: number;
  storage_path: string;
  is_blank: boolean;
};

export type SpriteCapeProject = {
  id: string;
  user_id: string;
  name: string;
  frame_width: number;
  frame_height: number;
  fps: number;
  frame_count: number;
  status: string;
  updated_at: string;
};

export type SpriteCapeProjectPayload = {
  project: SpriteCapeProject;
  frames: SpriteCapeProjectFrame[];
};

export type SpriteCapePublishResult = {
  cape_id: string;
  revision_id: string;
  manifest_path: string;
  frame_count: number;
  fps: number;
  frame_width: number;
  frame_height: number;
  equip_warning?: string | null;
};

function resolveEdgeBase() {
  const raw = String(import.meta.env.VITE_SUPABASE_URL || 'https://sb.bloomclient.org').trim();
  try {
    return new URL(raw).origin.replace(/\/+$/, '');
  } catch {
    return raw.replace(/\/+$/, '');
  }
}

function extractEdgeError(payload: unknown, fallback = 'edge_request_failed') {
  if (!payload || typeof payload !== 'object') return fallback;
  const obj = payload as Record<string, unknown>;
  return (
    (typeof obj.message === 'string' && obj.message) ||
    (typeof obj.error === 'string' && obj.error) ||
    fallback
  );
}

async function edgeJson<T>(path: string, init?: RequestInit): Promise<T> {
  const session = await supabase.auth.getSession();
  const token = session.data.session?.access_token;
  if (!token) throw new Error('auth_session_missing');

  const base = resolveEdgeBase();
  const response = await fetch(`${base}/functions/v1/main${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {})
    }
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(extractEdgeError(payload, `edge_${response.status}`));
  return payload as T;
}

export async function createSpriteCapeProject(input: { name: string; frameWidth: number; frameHeight: number; fps: number }) {
  const payload = await edgeJson<{ ok: true; project: SpriteCapeProjectPayload }>('/gif-cape/projects', {
    method: 'POST',
    body: JSON.stringify({
      name: input.name,
      frame_width: input.frameWidth,
      frame_height: input.frameHeight,
      fps: input.fps
    })
  });
  return payload.project;
}

export async function addSpriteCapeBlankFrame(projectId: string) {
  const payload = await edgeJson<{ ok: true; project: SpriteCapeProjectPayload }>(`/gif-cape/projects/${projectId}/frames/blank`, {
    method: 'POST',
    body: JSON.stringify({})
  });
  return payload.project;
}

export async function uploadSpriteCapeFrame(projectId: string, frameIndex: number, dataUrl: string) {
  const payload = await edgeJson<{ ok: true; project: SpriteCapeProjectPayload }>(`/gif-cape/projects/${projectId}/frames/${frameIndex}`, {
    method: 'PUT',
    body: JSON.stringify({ data_url: dataUrl })
  });
  return payload.project;
}

export async function publishSpriteCapeProject(projectId: string, autoEquip = true) {
  const payload = await edgeJson<{ ok: true; result: SpriteCapePublishResult }>(`/gif-cape/projects/${projectId}/publish`, {
    method: 'POST',
    body: JSON.stringify({ auto_equip: autoEquip })
  });
  return payload.result;
}

