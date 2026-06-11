// Server-side Supabase client using the service role key.
// Lazy-initialized so build-time route inspection doesn't trip env var validation.

import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

export function supabaseServer(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY at request time.");
  }
  _client = createClient(url, serviceKey, { auth: { persistSession: false } });
  return _client;
}
