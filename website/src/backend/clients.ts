import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { backendConfig } from "./endpoints";

let browserClient: SupabaseClient | null | undefined;

export function createPublicSupabaseClient(): SupabaseClient | null {
  if (!backendConfig.supabaseUrl || !backendConfig.supabaseAnonKey) return null;
  return createClient(backendConfig.supabaseUrl, backendConfig.supabaseAnonKey, {
    auth: { persistSession: false }
  });
}

export function getBrowserSupabaseClient(): SupabaseClient | null {
  if (browserClient !== undefined) return browserClient;
  if (!backendConfig.supabaseUrl || !backendConfig.supabaseAnonKey) {
    browserClient = null;
    return browserClient;
  }

  browserClient = createClient(backendConfig.supabaseUrl, backendConfig.supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });
  return browserClient;
}
