import { admin } from "@/lib/supabase";
import { WHICHOUTFIT } from "@/lib/brand";
import { getAttribution } from "@/lib/attribution";
import { featureOf, scoreClip } from "./rules";

// What has gone out and how it did, per brand. Split from planner.ts so the
// strategy layer (strategyStore.ts) and the weekly loop read the same numbers.
// Every query is pinned to one brand: a Comeback row never appears in a
// WhichOutfit read, and the reverse.

export type PostRow = {
  clip_id: string;
  platform: "instagram" | "tiktok";
  caption: string;
  hashtags: string | null;
  video_url: string | null;
  campaign: string | null;
  scheduled_for: string;
  status: string;
  posted_at: string | null;
  views: number | null;
  likes: number | null;
  saves: number | null;
  shares: number | null;
  error: string | null;
};

export type ClipScore = {
  clip_id: string;
  feature: string;
  posts: number;
  views: number;
  clicks: number;
  installs: number;
  score: number;
  lastOut: string | null;
};

export async function loadPosts(brand: string = WHICHOUTFIT): Promise<PostRow[]> {
  const { data, error } = await admin()
    .from("social_posts")
    .select("clip_id,platform,caption,hashtags,video_url,campaign,scheduled_for,status,posted_at,views,likes,saves,shares,error")
    .eq("brand", brand)
    .order("scheduled_for", { ascending: true });
  if (error) throw error;
  return (data ?? []) as PostRow[];
}

/** "06_resale_listing_r2" → "06_resale_listing": a re-post is the same clip. */
export function baseClip(clipId: string): string {
  return clipId.replace(/_r\d+$/, "");
}

/**
 * One row per clip (re-posts folded in), best score first. Link clicks and
 * installs come from WhichOutfit's attribution tables, so another brand's
 * clips are scored on views and engagement alone.
 */
export async function clipScores(posts?: PostRow[], brand: string = WHICHOUTFIT): Promise<ClipScore[]> {
  const rows = posts ?? (await loadPosts(brand));
  const attribution = brand === WHICHOUTFIT ? await getAttribution(120).catch(() => null) : null;
  const byCampaign = new Map(attribution?.rows.map((r) => [r.campaign, r]) ?? []);

  const by = new Map<string, ClipScore & { likes: number; saves: number; shares: number }>();
  for (const p of rows) {
    if (p.platform !== "instagram" || p.status !== "posted") continue;
    const base = baseClip(p.clip_id);
    let s = by.get(base);
    if (!s) {
      s = { clip_id: base, feature: featureOf(base), posts: 0, views: 0, clicks: 0, installs: 0, score: 0, lastOut: null, likes: 0, saves: 0, shares: 0 };
      by.set(base, s);
    }
    s.posts++;
    s.views += p.views ?? 0;
    s.likes += p.likes ?? 0;
    s.saves += p.saves ?? 0;
    s.shares += p.shares ?? 0;
    if (p.posted_at && (!s.lastOut || p.posted_at > s.lastOut)) s.lastOut = p.posted_at;
    // Clicks and installs are keyed by campaign; both platforms' links count.
    for (const c of [p.campaign, p.campaign?.replace(/^ig_/, "tt_")]) {
      const a = c ? byCampaign.get(c) : undefined;
      if (a) {
        s.clicks += a.clicks;
        s.installs += a.ios_est + a.android_installs;
        byCampaign.delete(c!); // count each campaign once even if two rows share it
      }
    }
  }
  return [...by.values()]
    .map(({ likes, saves, shares, ...s }) => ({ ...s, score: scoreClip({ ...s, likes, saves, shares }) }))
    .sort((a, b) => b.score - a.score);
}
