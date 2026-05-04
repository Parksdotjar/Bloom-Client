import { createClient } from '@supabase/supabase-js';

function normalizeSupabaseUrl(raw: string) {
  const value = raw.trim();
  if (!value) return value;
  try {
    const parsed = new URL(value);
    // Self-hosted Studio links can include an internal project path.
    // The JS client needs the API origin (https://host), not the Studio path.
    if (parsed.pathname.startsWith('/project/')) {
      return parsed.origin;
    }
    return `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}`;
  } catch {
    return value;
  }
}

const supabaseUrl = normalizeSupabaseUrl(import.meta.env.VITE_SUPABASE_URL || '');
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false
  }
});
