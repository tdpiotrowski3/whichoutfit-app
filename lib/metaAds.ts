import { num } from "./social";

// Meta ads, read live from the Marketing API for the Ads page. The daily sync
// (lib/meta.ts) only keeps account totals per day; campaigns and ads come from
// here on each page load.
//
// The ad account is META_AD_ACCOUNT_ID when set, otherwise the first one the
// token can see (me/adaccounts) — assigning the ad account to the system user
// is enough, no env var needed.

const GRAPH = "https://graph.facebook.com/v21.0";

export type AdAccount = { id: string; name: string; currency: string; status: number; timezone: string };

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

export type AdsOverview =
  | { state: "no_token" }
  | { state: "no_account"; error?: string }
  | {
      state: "ok";
      account: AdAccount;
      days: number;
      daily: AdsDay[];
      totals: AdsMetrics;
      prev: AdsMetrics;
      campaigns: AdsRow[];
      ads: AdsRow[];
      error?: string;
    };

type Json = Record<string, unknown>;

async function graph(path: string, token: string, params: Record<string, string> = {}): Promise<{ ok: boolean; body: Json }> {
  const q = new URLSearchParams({ ...params, access_token: token });
  try {
    const res = await fetch(`${GRAPH}/${path}?${q}`, { cache: "no-store" });
    const body = (await res.json().catch(() => ({}))) as Json;
    return { ok: res.ok && !body.error, body };
  } catch (e) {
    return { ok: false, body: { error: { message: (e as Error).message } } };
  }
}

const errText = (b: Json) => (b.error as { message?: string } | undefined)?.message ?? "no data returned";

/** The ad account to report on, or null when the token can't see one. */
export async function resolveAdAccount(token: string): Promise<{ account: AdAccount | null; error?: string }> {
  const fields = "name,account_status,currency,timezone_name";
  const pick = (b: Json): AdAccount => ({
    id: String(b.id),
    name: String(b.name ?? b.id),
    currency: String(b.currency ?? "USD"),
    status: Number(b.account_status ?? 0),
    timezone: String(b.timezone_name ?? "UTC"),
  });
  const set = process.env.META_AD_ACCOUNT_ID;
  if (set) {
    const r = await graph(set.startsWith("act_") ? set : `act_${set}`, token, { fields });
    return r.ok ? { account: pick(r.body) } : { account: null, error: errText(r.body) };
  }
  const r = await graph("me/adaccounts", token, { fields, limit: "25" });
  if (!r.ok) return { account: null, error: errText(r.body) };
  const list = (r.body.data as Json[]) ?? [];
  // Prefer an active account (status 1) when the token sees several.
  const best = list.find((a) => Number(a.account_status) === 1) ?? list[0];
  return { account: best ? pick(best) : null };
}

type Insight = {
  date_start?: string;
  spend?: unknown;
  impressions?: unknown;
  reach?: unknown;
  clicks?: unknown;
  actions?: { action_type?: string; value?: unknown }[];
};

function metrics(i: Insight | undefined): AdsMetrics {
  const action = (t: string) => num(i?.actions?.find((a) => a.action_type === t)?.value) ?? 0;
  return {
    spend: num(i?.spend) ?? 0,
    impressions: num(i?.impressions) ?? 0,
    reach: num(i?.reach) ?? 0,
    clicks: num(i?.clicks) ?? 0,
    linkClicks: action("link_click"),
    // These overlap (omni counts app + web), so take the largest, never the sum.
    installs: Math.max(action("mobile_app_install"), action("app_install"), action("omni_app_install")),
  };
}

const ZERO: AdsMetrics = { spend: 0, impressions: 0, reach: 0, clicks: 0, linkClicks: 0, installs: 0 };

function sum(rows: AdsMetrics[]): AdsMetrics {
  return rows.reduce((t, r) => ({
    spend: t.spend + r.spend,
    impressions: t.impressions + r.impressions,
    reach: t.reach + r.reach,
    clicks: t.clicks + r.clicks,
    linkClicks: t.linkClicks + r.linkClicks,
    installs: t.installs + r.installs,
  }), ZERO);
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);

const STATUS: Record<string, string> = {
  ACTIVE: "Active",
  PAUSED: "Paused",
  CAMPAIGN_PAUSED: "Paused",
  ADSET_PAUSED: "Paused",
  ARCHIVED: "Archived",
  DELETED: "Deleted",
  IN_PROCESS: "Processing",
  WITH_ISSUES: "Has issues",
  PENDING_REVIEW: "In review",
  DISAPPROVED: "Rejected",
  PREAPPROVED: "Approved",
  PENDING_BILLING_INFO: "Needs billing",
};

const OBJECTIVE: Record<string, string> = {
  OUTCOME_APP_PROMOTION: "App installs",
  OUTCOME_AWARENESS: "Awareness",
  OUTCOME_ENGAGEMENT: "Engagement",
  OUTCOME_TRAFFIC: "Traffic",
  OUTCOME_LEADS: "Leads",
  OUTCOME_SALES: "Sales",
};

function money(minor: unknown): string | null {
  const n = num(minor);
  return n ? `$${(n / 100).toFixed(0)}` : null;
}

/** Everything the Ads page shows, for the last `days` days (ending yesterday). Never throws. */
export async function getAdsOverview(days: number, now = new Date()): Promise<AdsOverview> {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) return { state: "no_token" };
  const { account, error } = await resolveAdAccount(token);
  if (!account) return { state: "no_account", error };

  const until = new Date(now.getTime() - 86400_000);
  const since = new Date(until.getTime() - (days - 1) * 86400_000);
  const prevUntil = new Date(since.getTime() - 86400_000);
  const prevSince = new Date(prevUntil.getTime() - (days - 1) * 86400_000);
  const range = JSON.stringify({ since: ymd(since), until: ymd(until) });
  const ifields = "spend,impressions,reach,clicks,actions";
  const nested = `insights.time_range(${range}){${ifields}}`;

  const [daily, prev, camps, ads] = await Promise.all([
    graph(`${account.id}/insights`, token, { fields: ifields, time_increment: "1", time_range: range, limit: "100" }),
    graph(`${account.id}/insights`, token, { fields: ifields, time_range: JSON.stringify({ since: ymd(prevSince), until: ymd(prevUntil) }) }),
    graph(`${account.id}/campaigns`, token, { fields: `name,effective_status,objective,daily_budget,lifetime_budget,${nested}`, limit: "50" }),
    graph(`${account.id}/ads`, token, { fields: `name,effective_status,creative{thumbnail_url},campaign{name},${nested}`, limit: "50" }),
  ]);

  const byDay = new Map(((daily.body.data as Insight[]) ?? []).map((i) => [String(i.date_start).slice(0, 10), metrics(i)]));
  const series: AdsDay[] = [];
  for (let t = since.getTime(); t <= until.getTime(); t += 86400_000) {
    const day = ymd(new Date(t));
    series.push({ day, ...(byDay.get(day) ?? ZERO) });
  }

  const insightOf = (r: Json) => ((r.insights as { data?: Insight[] } | undefined)?.data ?? [])[0];
  const status = (r: Json) => STATUS[String(r.effective_status)] ?? String(r.effective_status ?? "").toLowerCase();
  const order = (a: AdsRow, b: AdsRow) => b.spend - a.spend || (a.status === "Active" ? -1 : 1);

  const campaigns: AdsRow[] = ((camps.body.data as Json[]) ?? []).map((c) => ({
    id: String(c.id),
    name: String(c.name ?? c.id),
    status: status(c),
    detail: [OBJECTIVE[String(c.objective)] ?? null, money(c.daily_budget) ? `${money(c.daily_budget)}/day` : money(c.lifetime_budget) ? `${money(c.lifetime_budget)} total` : null].filter(Boolean).join(" · "),
    ...metrics(insightOf(c)),
  })).filter((c) => c.status !== "Deleted").sort(order);

  const adRows: AdsRow[] = ((ads.body.data as Json[]) ?? []).map((a) => ({
    id: String(a.id),
    name: String(a.name ?? a.id),
    status: status(a),
    detail: String((a.campaign as Json | undefined)?.name ?? ""),
    thumbnail: ((a.creative as Json | undefined)?.thumbnail_url as string | undefined) ?? null,
    ...metrics(insightOf(a)),
  })).filter((a) => a.status !== "Deleted").sort(order);

  const failed = [daily, camps, ads].find((r) => !r.ok);
  return {
    state: "ok",
    account,
    days,
    daily: series,
    totals: sum(series),
    prev: metrics(((prev.body.data as Insight[]) ?? [])[0]),
    campaigns,
    ads: adRows,
    error: failed ? errText(failed.body) : undefined,
  };
}
