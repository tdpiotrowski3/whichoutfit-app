import { admin } from "@/lib/supabase";
import { WHICHOUTFIT } from "@/lib/brand";
import { fetchReelStats, isInstagramPublishConfigured } from "@/lib/instagram";

// Per-Reel results for the posts this app published, written back onto their
// social_posts rows so the Social tab can show how each clip did. Runs inside
// the daily social sync (and the "Sync now" button).

/** Reels keep collecting views for weeks; stop refreshing them after this. */
const REFRESH_DAYS = 60;

export type PostStatsResult = { updated: number; errors: string[] };

export async function syncPostStats(): Promise<PostStatsResult> {
  const out: PostStatsResult = { updated: 0, errors: [] };
  if (!isInstagramPublishConfigured()) return out;

  const since = new Date(Date.now() - REFRESH_DAYS * 86_400_000).toISOString();
  const { data, error } = await admin()
    .from("social_posts")
    .select("id,clip_id,platform_post_id")
    .eq("brand", WHICHOUTFIT)
    .eq("platform", "instagram")
    .eq("status", "posted")
    .not("platform_post_id", "is", null)
    .gte("posted_at", since);
  if (error) throw error;

  for (const row of (data ?? []) as { id: string; clip_id: string; platform_post_id: string }[]) {
    try {
      const s = await fetchReelStats(row.platform_post_id);
      const { error: upErr } = await admin()
        .from("social_posts")
        .update({ ...s, stats_updated_at: new Date().toISOString() })
        .eq("id", row.id);
      if (upErr) throw upErr;
      out.updated++;
    } catch (e) {
      out.errors.push(`${row.clip_id}: ${(e as Error).message}`);
    }
  }
  return out;
}
