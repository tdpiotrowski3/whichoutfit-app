import { admin } from "@/lib/supabase";
import { fetchTikTokDaily } from "@/lib/tiktok";
import { fetchInstagramDaily } from "@/lib/meta";
import { syncPostStats } from "@/lib/socialPostStats";
import type { SocialMetricRow } from "@/lib/social";

// Shared social-metrics sync, used by BOTH the daily Vercel cron and the admin
// "Sync now" button. Lives in its own module (not lib/social.ts) to avoid an
// import cycle: lib/tiktok.ts already imports lib/social.ts.
const PLATFORMS: { name: string; fetch: (days: number) => Promise<SocialMetricRow[]> }[] = [
  { name: "tiktok", fetch: fetchTikTokDaily },
  { name: "instagram", fetch: fetchInstagramDaily },
];

export type SocialSyncResult = { upserted: Record<string, number>; posts: number; errors: string[] };

/** Best-effort: a failed or unconfigured platform never blocks the other. */
export async function runSocialSync(days = 14): Promise<SocialSyncResult> {
  const upserted: Record<string, number> = {};
  const errors: string[] = [];

  for (const platform of PLATFORMS) {
    try {
      const rows = await platform.fetch(days);
      if (rows.length) {
        const { error } = await admin()
          .from("social_metrics")
          .upsert(
            rows.map((r) => ({ ...r, updated_at: new Date().toISOString() })),
            { onConflict: "day,platform" }
          );
        if (error) throw error;
      }
      upserted[platform.name] = rows.length;
    } catch (e) {
      errors.push(`${platform.name}: ${(e as Error).message}`);
    }
  }

  // Per-Reel results for the posts we published.
  let posts = 0;
  try {
    const r = await syncPostStats();
    posts = r.updated;
    errors.push(...r.errors.map((m) => `post stats: ${m}`));
  } catch (e) {
    errors.push(`post stats: ${(e as Error).message}`);
  }

  return { upserted, posts, errors };
}
