import { NextResponse } from "next/server";
import { admin } from "@/lib/supabase";
import { fetchTikTokDaily } from "@/lib/tiktok";
import { fetchInstagramDaily } from "@/lib/meta";
import type { SocialMetricRow } from "@/lib/social";

export const runtime = "nodejs";
export const maxDuration = 60;

// Daily Vercel Cron. Same bearer-secret scheme as appstore-sync. Each platform
// is best-effort: a failure or an unconfigured platform never blocks the other.
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

const PLATFORMS: { name: string; fetch: (days: number) => Promise<SocialMetricRow[]> }[] = [
  { name: "tiktok", fetch: fetchTikTokDaily },
  { name: "instagram", fetch: fetchInstagramDaily },
];

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const upserted: Record<string, number> = {};
  const errors: string[] = [];

  for (const platform of PLATFORMS) {
    try {
      const rows = await platform.fetch(14);
      if (rows.length) {
        const { error } = await admin()
          .from("social_metrics")
          .upsert(
            rows.map((r) => ({ ...r, updated_at: new Date().toISOString() })),
            { onConflict: "day,platform" },
          );
        if (error) throw error;
      }
      upserted[platform.name] = rows.length;
    } catch (e) {
      errors.push(`${platform.name}: ${(e as Error).message}`);
    }
  }

  return NextResponse.json({ ok: errors.length === 0, upserted, errors });
}
