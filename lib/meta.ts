import { mergeByDay, num, utcDay, type SocialMetricRow } from "./social";
import { resolveAdAccount } from "./metaAds";

// Instagram metrics via the Meta Graph API (IG Business/Creator account linked
// to a Facebook Page). Env-var token model, same as TikTok — inert until set.
//
//   META_ACCESS_TOKEN   – long-lived / system-user token
//   IG_USER_ID          – the IG Business account id (for organic insights)
//   META_AD_ACCOUNT_ID  – (optional) act_<id> for ads spend; without it, the
//                         first ad account the token can see
//
// ⚠️ IG insights metric availability shifts between Graph API versions (Meta has
// deprecated several over time). VALIDATE the metric set against a real call on
// the pinned version below before trusting the numbers.

const VERSION = "v21.0";
const BASE = `https://graph.facebook.com/${VERSION}`;

type Env = { token: string; igUserId?: string };

function env(): Env | null {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) return null;
  return {
    token,
    igUserId: process.env.IG_USER_ID,
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
 * Instagram daily organic insights, one row per day: reach (a daily series),
 * plus profile views, interactions and views, which Meta now only returns as a
 * total over a window (metric_type=total_value) — so those are asked for one
 * day at a time. The follower count is a "now" value, stamped on today.
 * Returns [] (never throws) when unconfigured or on any API error.
 */
async function fetchOrganic(days: number): Promise<SocialMetricRow[]> {
  const e = env();
  if (!e || !e.igUserId) return [];
  try {
    const now = Math.floor(Date.now() / 1000);
    const q = (p: Record<string, string>) => new URLSearchParams({ ...p, access_token: e.token });
    const byDay = new Map<string, SocialMetricRow>();
    const row = (day: string) => {
      const r = byDay.get(day) ?? { day, platform: "instagram" as const };
      byDay.set(day, r);
      return r;
    };

    const reach = await getJson(`${BASE}/${e.igUserId}/insights?${q({ metric: "reach", period: "day", since: String(now - days * 86400), until: String(now) })}`);
    for (const metric of (reach?.data as { values?: { value?: unknown; end_time?: string }[] }[]) ?? []) {
      for (const point of metric.values ?? []) {
        // end_time is the END of the day being reported, so step back one day.
        const end = Date.parse(point.end_time ?? "");
        if (Number.isFinite(end)) row(new Date(end - 86400_000).toISOString().slice(0, 10)).reach = num(point.value);
      }
    }

    const midnight = Math.floor(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()) / 1000);
    await Promise.all(Array.from({ length: days }, async (_, i) => {
      const since = midnight - (i + 1) * 86400;
      const totals = await getJson(`${BASE}/${e.igUserId}/insights?${q({
        metric: "profile_views,total_interactions,views",
        period: "day",
        metric_type: "total_value",
        since: String(since),
        until: String(since + 86400),
      })}`);
      const r = row(new Date(since * 1000).toISOString().slice(0, 10));
      for (const m of (totals?.data as { name?: string; total_value?: { value?: unknown } }[]) ?? []) {
        const v = num(m.total_value?.value);
        if (m.name === "profile_views") r.profile_views = v;
        if (m.name === "total_interactions") r.engagements = v;
        if (m.name === "views") r.video_views = v;
      }
    }));

    const acct = await getJson(`${BASE}/${e.igUserId}?${q({ fields: "followers_count" })}`);
    const followers = num(acct?.followers_count);
    if (followers !== null) row(utcDay(0)).followers = followers;

    // Drop days Meta returned nothing for.
    return [...byDay.values()].filter((r) => Object.keys(r).length > 2);
  } catch {
    return [];
  }
}

/**
 * Meta Ads daily performance (spend / impressions / clicks / conversions) via
 * the ad account's insights edge (see resolveAdAccount). Returns [] when there
 * is no token or visible ad account, or on any error.
 */
async function fetchAds(days: number): Promise<SocialMetricRow[]> {
  const e = env();
  if (!e) return [];
  try {
    const { account } = await resolveAdAccount(e.token);
    if (!account) return [];
    const acct = account.id;
    const params = new URLSearchParams({
      fields: "spend,impressions,clicks,actions",
      time_increment: "1",
      time_range: JSON.stringify({ since: utcDay(days), until: utcDay(1) }),
      access_token: e.token,
    });
    const data = await getJson(`${BASE}/${acct}/insights?${params}`);
    const series = (data?.data as {
      date_start?: string;
      spend?: unknown;
      impressions?: unknown;
      clicks?: unknown;
      actions?: { action_type?: string; value?: unknown }[];
    }[]) ?? [];
    return series
      .map((d): SocialMetricRow | null => {
        const day = (d.date_start ?? "").slice(0, 10);
        if (!day) return null;
        // Conversions = sum of purchase-type actions, when present.
        const conversions = (d.actions ?? [])
          .filter((a) => (a.action_type ?? "").includes("purchase"))
          .reduce((sum, a) => sum + (num(a.value) ?? 0), 0);
        return {
          day,
          platform: "instagram",
          spend: num(d.spend),
          ad_impressions: num(d.impressions),
          clicks: num(d.clicks),
          conversions: conversions || null,
        };
      })
      .filter((r): r is SocialMetricRow => r !== null);
  } catch {
    return [];
  }
}

/** Organic + ads merged into one row per day. Never throws. */
export async function fetchInstagramDaily(days: number): Promise<SocialMetricRow[]> {
  const [organic, ads] = await Promise.all([fetchOrganic(days), fetchAds(days)]);
  return mergeByDay([...organic, ...ads]);
}
