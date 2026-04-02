import { createClient } from '@supabase/supabase-js';
import { workerConfig } from './config.js';
import { WorkerError, type AnimatedCapeOrder } from './types.js';

const admin = createClient(workerConfig.supabaseUrl, workerConfig.supabaseServiceRoleKey, {
  auth: { persistSession: false }
});

export async function fetchAnimatedCapeOrder(orderId: string): Promise<AnimatedCapeOrder> {
  const { data, error } = await admin
    .from('commerce_animated_cape_orders')
    .select(
      'id,user_id,upload_media_id,source_type,source_storage_path,selected_fps,selected_duration_seconds,cost_bloom_bucks,status,crop_x,crop_y,crop_w,crop_h'
    )
    .eq('id', orderId)
    .single();

  if (error || !data) {
    throw new WorkerError('order_lookup_failed', error?.message ?? 'order_not_found', false);
  }

  return data as AnimatedCapeOrder;
}

export async function downloadSourceMedia(storagePath: string): Promise<Buffer> {
  const { data, error } = await admin.storage.from('animated-cape-uploads').download(storagePath);
  if (error || !data) {
    throw new WorkerError('source_download_failed', error?.message ?? 'source_not_found', true);
  }
  const bytes = Buffer.from(await data.arrayBuffer());
  if (!bytes.length) {
    throw new WorkerError('source_download_empty', 'Downloaded source media is empty.', true);
  }
  return bytes;
}

export async function uploadProcessedFile(storagePath: string, content: Buffer, contentType: string) {
  const { error } = await admin.storage.from('animated-cape-processed').upload(storagePath, content, {
    contentType,
    cacheControl: '31536000',
    upsert: true
  });
  if (error) {
    throw new WorkerError('processed_upload_failed', `${storagePath}: ${error.message}`, true);
  }
}

export function getProcessedPublicUrl(storagePath: string): string {
  const { data } = admin.storage.from('animated-cape-processed').getPublicUrl(storagePath);
  return data.publicUrl;
}
