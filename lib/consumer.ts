import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Consumer-side Supabase client for the webapp (app.whichoutfit.app). Uses the
// PUBLISHABLE/anon key in the browser and relies on RLS (each table is scoped to
// auth.uid() = user_id) — the opposite of the admin dashboard, which uses the
// service-role key server-side. Both keys here are safe to ship to the browser.
//
// This is a fully client-rendered SPA, so we use the standard supabase-js client
// with localStorage (PKCE verifier lives there). The @supabase/ssr cookie client
// is for apps that also read the session server-side — using it here meant the
// client-side code exchange couldn't find the PKCE verifier ("verifier not found
// in storage"). localStorage keeps the verifier on the same browser across the
// OAuth / magic-link redirect.

let cached: SupabaseClient | null = null;

export function isConsumerConfigured(): boolean {
  return !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}

/** Singleton browser client, or null if the public env vars aren't set. */
export function consumerClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  if (!cached) {
    cached = createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false, // we exchange the code explicitly in /auth/callback
        flowType: "pkce",
        storageKey: "wo-consumer-auth",
      },
    });
  }
  return cached;
}
