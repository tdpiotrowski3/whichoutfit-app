import { num, type SocialMetricRow } from "./social";

// Instagram metrics via the Meta Graph API (IG Business/Creator account linked
// to a Facebook Page). Env-var token model, same as TikTok — inert until set.
//
//   META_ACCESS_TOKEN   – long-lived / system-user token
//   IG_USER_ID          – the IG Business account id (for organic insights)
//   META_AD_ACCOUNT_ID  – (optional) act_<id> for ads spend/ROAS
//
// ⚠️ IG insights metric availability shifts between Graph API versions (Meta has
// deprecated several over time). VALIDATE the metric set against a real call on
// the pinned version below before trusting the numbers.

const VERSION = "v21.0";
const BASE = `https://graph.facebook.com/${VERSION}`;

type Env = { token: string; igUserId?: string; adAccountId?: string };

function env(): Env | null {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) return null;
  return {
    token,
    igUserId: process.env.IG_USER_ID,
    adAccountId: process.env.META_AD_ACCOUNT_ID,
  };
}

export function isInstagramConfigured(): boolean {
  const e = env();
  return !!e && !!e.igUserId;
}

async function getJson(url: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return null;
  return (await res.json()) as Record<string, unknown>;
}

/**
 * Instagram daily organic insights (reach, profile views) plus the current
 * follower count, normalized to one row per day. Returns [] (never throws) when
 * unconfigured or on any API error.
 */
export async function fetchInstagramDaily(days: number): Promise<SocialMetricRow[]> {
  const e = env();
  if (!e || !e.igUserId) return [];
  try {
    const since = Math.floor(Date.now() / 1000 - days * 86400);
    const until = Math.floor(Date.now() / 1000);
    const params = new URLSearchParams({
      metric: "reach,profile_views",
      period: "day",
      since: String(since),
      until: String(until),
      access_token: e.token,
    });
    const insights = await getJson(`${BASE}/${e.igUserId}/insights?${params}`);

    // Day -> partial row, merged across the per-metric time series.
    const byDay = new Map<string, SocialMetricRow>();
    const series = (insights?.data as { name?: string; values?: { value?: unknown; end_time?: string }[] }[]) ?? [];
    for (const metric of series) {
      for (const point of metric.values ?? []) {
        const day = (point.end_time ?? "").slice(0, 10);
        if (!day) continue;
        const row = byDay.get(day) ?? { day, platform: "instagram" };
        if (metric.name === "reach") row.reach = num(point.value);
        if (metric.name === "profile_views") row.profile_views = num(point.value);
        byDay.set(day, row);
      }
    }

    // Follower count is a "now" value, not a time series — stamp it on the most
    // recent day we have.
    const acct = await getJson(`${BASE}/${e.igUserId}?fields=followers_count&access_token=${encodeURIComponent(e.token)}`);
    const followers = num(acct?.followers_count);
    if (followers !== null && byDay.size > 0) {
      const latest = [...byDay.keys()].sort().at(-1)!;
      byDay.get(latest)!.followers = followers;
    }

    return [...byDay.values()];
  } catch {
    return [];
  }
}
