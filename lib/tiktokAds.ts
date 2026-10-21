import { num } from "./social";
import { adsWindow, sumAds, ZERO_ADS, type AdsMetrics, type AdsOverview, type AdsRow } from "./ads";

// TikTok ads, read live from the TikTok Marketing API (v1.3) for the Ads page.
//
//   TIKTOK_ADVERTISER_ID     – the ad account (advertiser) id from TikTok Ads Manager
//   TIKTOK_ADS_ACCESS_TOKEN  – advertiser-authorized token from the API for Business
//                              app; falls back to TIKTOK_ACCESS_TOKEN when one token
//                              carries both the account and ads scopes
//
// Reports with a day dimension cover at most 30 days per request, so longer
// ranges are fetched in 30-day chunks.

const BASE = "https://business-api.tiktok.com/open_api/v1.3";
const CHUNK_DAYS = 30;

type Json = Record<string, unknown>;
type Resp = { ok: boolean; data: Json; message: string };

async function get(path: string, token: string, params: Record<string, unknown>): Promise<Resp> {
  const q = new URLSearchParams(
    Object.entries(params).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)]),
  );
  try {
    const res = await fetch(`${BASE}/${path}/?${q}`, { headers: { "Access-Token": token }, cache: "no-store" });
    const body = (await res.json().catch(() => ({}))) as { code?: number; message?: string; data?: Json };
    return { ok: body.code === 0, data: body.data ?? {}, message: `${body.message ?? `HTTP ${res.status}`}${body.code ? ` (code ${body.code})` : ""}` };
  } catch (e) {
    return { ok: false, data: {}, message: (e as Error).message };
  }
}

const BASE_METRICS = ["spend", "impressions", "reach", "clicks"];

function metrics(m: Json | undefined): AdsMetrics {
  return {
    spend: num(m?.spend) ?? 0,
    impressions: num(m?.impressions) ?? 0,
    reach: num(m?.reach) ?? 0,
    clicks: num(m?.clicks) ?? 0,
    // TikTok's "clicks" are clicks to the destination (store page / site).
    linkClicks: num(m?.clicks) ?? 0,
    installs: num(m?.app_install) ?? 0,
  };
}

type ReportRow = { dimensions?: Json; metrics?: Json };

/**
 * One integrated report, paged. Tries with app_install first and drops it if
 * the account's objectives don't expose it (the API rejects unknown metrics).
 */
async function report(token: string, advertiserId: string, level: string, dimensions: string[], extra: string[], since: string, until: string): Promise<{ rows: ReportRow[]; error?: string }> {
  for (const withInstalls of [true, false]) {
    const rows: ReportRow[] = [];
    let page = 1;
    let failed: string | undefined;
    for (;;) {
      const r = await get("report/integrated/get", token, {
        advertiser_id: advertiserId,
        report_type: "BASIC",
        data_level: level,
        dimensions,
        metrics: [...BASE_METRICS, ...(withInstalls ? ["app_install"] : []), ...extra],
        start_date: since,
        end_date: until,
        page,
        page_size: 1000,
      });
      if (!r.ok) { failed = r.message; break; }
      rows.push(...((r.data.list as ReportRow[]) ?? []));
      const info = r.data.page_info as { total_page?: number } | undefined;
      if (!info?.total_page || page >= info.total_page) break;
      page++;
    }
    if (!failed) return { rows };
    if (!withInstalls) return { rows: [], error: failed };
  }
  return { rows: [] };
}

const addDays = (ymd: string, n: number) => new Date(Date.parse(ymd + "T00:00:00Z") + n * 86400_000).toISOString().slice(0, 10);

const STATUS: Record<string, string> = {
  ENABLE: "Active",
  DISABLE: "Paused",
  DELETE: "Deleted",
};

const OBJECTIVE: Record<string, string> = {
  APP_PROMOTION: "App installs",
  APP_INSTALL: "App installs",
  TRAFFIC: "Traffic",
  REACH: "Reach",
  VIDEO_VIEWS: "Video views",
  ENGAGEMENT: "Engagement",
  CONVERSIONS: "Conversions",
  WEB_CONVERSIONS: "Website conversions",
  LEAD_GENERATION: "Leads",
};

export function isTikTokAdsConfigured(): boolean {
  return !!process.env.TIKTOK_ADVERTISER_ID && !!(process.env.TIKTOK_ADS_ACCESS_TOKEN ?? process.env.TIKTOK_ACCESS_TOKEN);
}

/** Everything the Ads page shows for TikTok, for the last `days` days (ending yesterday). Never throws. */
export async function getTikTokAds(days: number, now = new Date()): Promise<AdsOverview> {
  const token = process.env.TIKTOK_ADS_ACCESS_TOKEN ?? process.env.TIKTOK_ACCESS_TOKEN;
  const advertiserId = process.env.TIKTOK_ADVERTISER_ID;
  if (!token) return { state: "no_token" };
  if (!advertiserId) return { state: "no_account" };

  const info = await get("advertiser/info", token, { advertiser_ids: [advertiserId], fields: ["name", "currency", "status"] });
  const adv = ((info.data.list as Json[]) ?? [])[0];
  if (!info.ok || !adv) return { state: "no_account", error: info.ok ? "advertiser not found for this token" : info.message };

  const w = adsWindow(days, now);
  const chunks: [string, string][] = [];
  for (let s = w.since; s <= w.until; s = addDays(s, CHUNK_DAYS)) {
    const e = addDays(s, CHUNK_DAYS - 1);
    chunks.push([s, e < w.until ? e : w.until]);
  }

  const [dailyParts, prev, camps, campInfo, ads, adInfo] = await Promise.all([
    Promise.all(chunks.map(([s, e]) => report(token, advertiserId, "AUCTION_ADVERTISER", ["stat_time_day"], [], s, e))),
    report(token, advertiserId, "AUCTION_ADVERTISER", ["advertiser_id"], [], w.prevSince, w.prevUntil),
    report(token, advertiserId, "AUCTION_CAMPAIGN", ["campaign_id"], ["campaign_name"], w.since, w.until),
    get("campaign/get", token, { advertiser_id: advertiserId, page_size: 100, fields: ["campaign_id", "campaign_name", "operation_status", "objective_type", "budget", "budget_mode"] }),
    report(token, advertiserId, "AUCTION_AD", ["ad_id"], ["ad_name", "campaign_name"], w.since, w.until),
    get("ad/get", token, { advertiser_id: advertiserId, page_size: 100, fields: ["ad_id", "ad_name", "operation_status", "campaign_name"] }),
  ]);

  const byDay = new Map<string, AdsMetrics>();
  for (const part of dailyParts) {
    for (const r of part.rows) byDay.set(String(r.dimensions?.stat_time_day ?? "").slice(0, 10), metrics(r.metrics));
  }
  const daily = w.list.map((day) => ({ day, ...(byDay.get(day) ?? ZERO_ADS) }));

  const currency = String(adv.currency ?? "USD");
  const money = (n: unknown) => {
    const v = num(n);
    return v ? `${v.toLocaleString("en-US", { style: "currency", currency, maximumFractionDigits: 0 })}` : null;
  };
  const order = (a: AdsRow, b: AdsRow) => b.spend - a.spend || (a.status === "Active" ? -1 : 1);

  // Campaigns: every campaign from campaign/get, with this period's numbers when it spent.
  const campStats = new Map(camps.rows.map((r) => [String(r.dimensions?.campaign_id), r.metrics]));
  const campaigns: AdsRow[] = ((campInfo.data.list as Json[]) ?? []).map((c) => ({
    id: String(c.campaign_id),
    name: String(c.campaign_name ?? c.campaign_id),
    status: STATUS[String(c.operation_status)] ?? String(c.operation_status ?? "").toLowerCase(),
    detail: [
      OBJECTIVE[String(c.objective_type)] ?? null,
      money(c.budget) ? `${money(c.budget)}${String(c.budget_mode).includes("DAY") ? "/day" : String(c.budget_mode).includes("TOTAL") ? " total" : ""}` : null,
    ].filter(Boolean).join(" · "),
    ...metrics(campStats.get(String(c.campaign_id))),
  })).filter((c) => c.status !== "Deleted").sort(order);

  const adStatus = new Map(((adInfo.data.list as Json[]) ?? []).map((a) => [String(a.ad_id), STATUS[String(a.operation_status)] ?? "—"]));
  const adRows: AdsRow[] = ads.rows.map((r) => ({
    id: String(r.dimensions?.ad_id),
    name: String(r.metrics?.ad_name ?? r.dimensions?.ad_id),
    status: adStatus.get(String(r.dimensions?.ad_id)) ?? "—",
    detail: String(r.metrics?.campaign_name ?? ""),
    thumbnail: null,
    ...metrics(r.metrics),
  })).filter((a) => a.status !== "Deleted").sort(order);

  const status = String(adv.status ?? "");
  const error = [...dailyParts.map((p) => p.error), camps.error, ads.error, campInfo.ok ? undefined : campInfo.message].find(Boolean);
  return {
    state: "ok",
    account: { id: advertiserId, name: String(adv.name ?? advertiserId), currency, active: status === "STATUS_ENABLE", statusText: status === "STATUS_ENABLE" ? undefined : status.replace(/^STATUS_/, "").toLowerCase().replace(/_/g, " ") },
    managerUrl: `https://ads.tiktok.com/i18n/dashboard?aadvid=${advertiserId}`,
    days,
    daily,
    totals: sumAds(daily),
    prev: prev.rows[0] ? metrics(prev.rows[0].metrics) : ZERO_ADS,
    campaigns,
    ads: adRows,
    error,
  };
}
