import { createClient } from '@supabase/supabase-js';

const DEFAULT_SUPABASE_URL = 'https://sb.bloomclient.org/project/default';
const DEFAULT_SUPABASE_ANON_KEY =
  'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc3NDE5NTMyMCwiZXhwIjo0OTI5ODY4OTIwLCJyb2xlIjoiYW5vbiJ9.snzMxBtGE48BsfFG2uhh6-Ms_fqQTbmasL-TkIco4K8';

function normalizeSupabaseUrl(raw: string) {
  const value = raw.trim();
  if (!value) return value;
  try {
    const parsed = new URL(value);
    // Coolify/Supabase Studio links often look like https://host/project/default.
    // The JS client needs the API origin (https://host), not the Studio path.
    if (parsed.pathname.startsWith('/project/')) {
      return parsed.origin;
    }
    return `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}`;
  } catch {
    return value;
  }
}

export const ACTIVE_SUPABASE_URL = normalizeSupabaseUrl(import.meta.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL);
export const ACTIVE_SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY).trim();

if (!ACTIVE_SUPABASE_URL || !ACTIVE_SUPABASE_ANON_KEY) {
  throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
}

export const supabase = createClient(ACTIVE_SUPABASE_URL, ACTIVE_SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false
  }
});
