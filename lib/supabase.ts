import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Service-role client. SERVER-ONLY — never import this into a client component.
// The service-role key bypasses RLS, so it must never reach the browser.
export function admin(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
