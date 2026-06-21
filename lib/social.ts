// Shared shapes for the social/ads integration. Provider clients (lib/tiktok.ts,
// lib/meta.ts) normalize their API responses into SocialMetricRow[]; the cron
// upserts those into public.social_metrics keyed by (day, platform).

export type SocialPlatform = "tiktok" | "instagram";

/** One day of metrics for one platform. Organic + ads fields; unknown → null. */
export type SocialMetricRow = {
  day: string; // YYYY-MM-DD (UTC)
  platform: SocialPlatform;
  followers?: number | null;
  impressions?: number | null;
  reach?: number | null;
  profile_views?: number | null;
  video_views?: number | null;
  engagements?: number | null; // likes + comments + shares (organic)
  spend?: number | null; // ads
  ad_impressions?: number | null; // ads
  clicks?: number | null; // ads
  conversions?: number | null; // ads
};

/** UTC YYYY-MM-DD for `daysAgo` days back (0 = today). */
export function utcDay(daysAgo: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

/** Coerce an unknown API value to a finite number or null (never NaN). */
export function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "string" ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : null;
}
