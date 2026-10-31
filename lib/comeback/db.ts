import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Service-role client for Comeback Health's own Supabase project (not WhichOutfit's). SERVER-ONLY: the key
// bypasses RLS, so never import this into a client component. Set both env vars in Vercel and .env.local.
export function comebackDb(): SupabaseClient {
  const url = process.env.COMEBACK_SUPABASE_URL;
  const key = process.env.COMEBACK_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing COMEBACK_SUPABASE_URL or COMEBACK_SUPABASE_SERVICE_ROLE_KEY env vars");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Read every row of a query, 1,000 at a time (PostgREST's page cap). */
export async function allRows<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await page(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}
