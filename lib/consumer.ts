import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

// Consumer-side Supabase client for the webapp (app.whichoutfit.app). Uses the
// PUBLISHABLE/anon key in the browser and relies on RLS (each table is scoped to
// auth.uid() = user_id) — the opposite of the admin dashboard, which uses the
// service-role key server-side. Both keys here are safe to ship to the browser.

let cached: SupabaseClient | null = null;

export function isConsumerConfigured(): boolean {
  return !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}

/** Singleton browser client, or null if the public env vars aren't set. */
export function consumerClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  if (!cached) cached = createBrowserClient(url, key);
  return cached;
}
