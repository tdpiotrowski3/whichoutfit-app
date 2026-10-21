// Shared shapes for the Ads page. Each platform (lib/metaAds.ts,
// lib/tiktokAds.ts) reads its own API and returns an AdsOverview, so the page
// can show them side by side or one at a time.

export type AdsPlatform = "meta" | "tiktok";

export type AdsMetrics = {
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  linkClicks: number;
  installs: number;
};

export type AdsDay = AdsMetrics & { day: string };

export type AdsRow = AdsMetrics & {
  id: string;
  name: string;
  status: string;
  detail: string;
  thumbnail?: string | null;
};

export type AdsAccountInfo = { id: string; name: string; currency: string; active: boolean; statusText?: string };

export type AdsOverview =
  | { state: "no_token" }
  | { state: "no_account"; error?: string }
  | {
      state: "ok";
      account: AdsAccountInfo;
      managerUrl: string;
      days: number;
      daily: AdsDay[];
      totals: AdsMetrics;
      prev: AdsMetrics;
      campaigns: AdsRow[];
      ads: AdsRow[];
      error?: string;
    };

export const ZERO_ADS: AdsMetrics = { spend: 0, impressions: 0, reach: 0, clicks: 0, linkClicks: 0, installs: 0 };

export function sumAds(rows: AdsMetrics[]): AdsMetrics {
  return rows.reduce((t, r) => ({
    spend: t.spend + r.spend,
    impressions: t.impressions + r.impressions,
    reach: t.reach + r.reach,
    clicks: t.clicks + r.clicks,
    linkClicks: t.linkClicks + r.linkClicks,
    installs: t.installs + r.installs,
  }), ZERO_ADS);
}

/** Consecutive "YYYY-MM-DD" days from `days` days ago through yesterday (UTC). */
export function adsWindow(days: number, now = new Date()) {
  const ymd = (d: Date) => d.toISOString().slice(0, 10);
  const until = new Date(now.getTime() - 86400_000);
  const since = new Date(until.getTime() - (days - 1) * 86400_000);
  const prevUntil = new Date(since.getTime() - 86400_000);
  const prevSince = new Date(prevUntil.getTime() - (days - 1) * 86400_000);
  const list: string[] = [];
  for (let t = since.getTime(); t <= until.getTime(); t += 86400_000) list.push(ymd(new Date(t)));
  return { since: ymd(since), until: ymd(until), prevSince: ymd(prevSince), prevUntil: ymd(prevUntil), list };
}
