import { num, utcDay, type SocialMetricRow } from "./social";

// TikTok metrics via the TikTok Business API (organic) + Marketing API (ads).
//
// Auth model: env-var tokens (per the rollout plan — a long-lived / system-user
// token generated in the TikTok developer portal, no in-app OAuth). The whole
// thing is INERT until the env vars are set, so it can't fail an unconfigured
// deploy. App credentials (TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET) are only
// needed to mint/refresh the token out-of-band; the daily sync uses the token.
//
//   TIKTOK_ACCESS_TOKEN    – access token (sandbox token works against sandbox)
//   TIKTOK_BUSINESS_ID     – business account id for organic insights
//   TIKTOK_ADVERTISER_ID   – (optional) advertiser id for ads spend/ROAS
//
// ⚠️ VALIDATE field names against the FIRST real sandbox response before trusting
// the numbers — the exact metric keys depend on which scopes were approved. The
// shapes below follow the documented v1.3 endpoints; parsing is defensive.

const BASE = "https://business-api.tiktok.com/open_api/v1.3";

type Env = { token: string; businessId?: string; advertiserId?: string };

function env(): Env | null {
  const token = process.env.TIKTOK_ACCESS_TOKEN;
  if (!token) return null;
  return {
    token,
    businessId: process.env.TIKTOK_BUSINESS_ID,
    advertiserId: process.env.TIKTOK_ADVERTISER_ID,
  };
}

export function isTikTokConfigured(): boolean {
  const e = env();
  return !!e && !!e.businessId;
}

async function getJson(url: string, token: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(url, { headers: { "Access-Token": token }, cache: "no-store" });
  if (!res.ok) return null;
  const body = (await res.json()) as { code?: number; data?: unknown };
  // TikTok wraps payloads as { code: 0, message, data }. Non-zero code = error.
  if (body.code !== 0 || !body.data) return null;
  return body.data as Record<string, unknown>;
}

/**
 * Organic account insights for the last `days` days, one row per day.
 * Returns [] (never throws) when unconfigured or on any API error.
 */
export async function fetchTikTokDaily(days: number): Promise<SocialMetricRow[]> {
  const e = env();
  if (!e || !e.businessId) return [];
  try {
    const fields = ["followers_count", "profile_views", "video_views", "likes", "comments", "shares", "reach", "impressions"];
    const params = new URLSearchParams({
      business_id: e.businessId,
      start_date: utcDay(days),
      end_date: utcDay(1), // through yesterday (today is usually incomplete)
      fields: JSON.stringify(fields),
    });
    const data = await getJson(`${BASE}/business/get/?${params}`, e.token);
    if (!data) return [];

    // The endpoint returns daily entries under `metrics` (an array of day buckets)
    // OR a single aggregate; handle both. VALIDATE shape on first real response.
    const buckets = Array.isArray((data as { metrics?: unknown }).metrics)
      ? ((data as { metrics: Record<string, unknown>[] }).metrics)
      : [data];

    return buckets
      .map((m): SocialMetricRow | null => {
        const day = (m.date as string) ?? (m.stat_time_day as string) ?? utcDay(1);
        const likes = num(m.likes) ?? 0;
        const comments = num(m.comments) ?? 0;
        const shares = num(m.shares) ?? 0;
        const engagements = likes + comments + shares;
        return {
          day: String(day).slice(0, 10),
          platform: "tiktok",
          followers: num(m.followers_count),
          profile_views: num(m.profile_views),
          video_views: num(m.video_views),
          reach: num(m.reach),
          impressions: num(m.impressions),
          engagements: engagements || null,
        };
      })
      .filter((r): r is SocialMetricRow => r !== null);
  } catch {
    return [];
  }
}
