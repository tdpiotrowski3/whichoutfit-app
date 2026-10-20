// Is each social connection actually working? The syncs (lib/meta.ts,
// lib/tiktok.ts) swallow API errors so a bad token can never break a cron —
// which also means a broken connection looks exactly like "no data yet". This
// asks the APIs directly and keeps their error text, for the Social page's
// Connections card and the engine's /api/engine/health.

const GRAPH = "https://graph.facebook.com/v21.0";

export type Check = { name: string; ok: boolean; detail: string };
export type Connection = {
  key: "instagram" | "instagram_ads" | "tiktok";
  label: string;
  state: "ok" | "partial" | "failing" | "not_set";
  missing: string[];
  checks: Check[];
  account?: string;
};

async function graph(path: string, token: string, params: Record<string, string> = {}): Promise<{ ok: boolean; body: Record<string, unknown> }> {
  const q = new URLSearchParams({ ...params, access_token: token });
  try {
    const res = await fetch(`${GRAPH}/${path}?${q}`, { cache: "no-store" });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: res.ok && !body.error, body };
  } catch (e) {
    return { ok: false, body: { error: { message: (e as Error).message } } };
  }
}

const gerr = (b: Record<string, unknown>) => {
  const e = b.error as { message?: string; code?: number; error_subcode?: number } | undefined;
  return e ? `${e.message ?? "error"}${e.code ? ` (code ${e.code}${e.error_subcode ? `/${e.error_subcode}` : ""})` : ""}` : "no data returned";
};

function stateOf(checks: Check[]): Connection["state"] {
  if (checks.every((c) => c.ok)) return "ok";
  return checks.some((c) => c.ok) ? "partial" : "failing";
}

export async function instagramHealth(): Promise<Connection> {
  const token = process.env.META_ACCESS_TOKEN;
  const ig = process.env.IG_USER_ID;
  const missing = [!token && "META_ACCESS_TOKEN", !ig && "IG_USER_ID"].filter(Boolean) as string[];
  const base = { key: "instagram" as const, label: "Instagram" };
  if (missing.length) return { ...base, state: "not_set", missing, checks: [] };

  const checks: Check[] = [];
  const acct = await graph(ig!, token!, { fields: "username,followers_count,media_count" });
  checks.push({
    name: "Account",
    ok: acct.ok,
    detail: acct.ok ? `@${acct.body.username} · ${acct.body.followers_count} followers · ${acct.body.media_count} posts` : gerr(acct.body),
  });
  const perms = await graph("me/permissions", token!);
  if (perms.ok) {
    const granted = ((perms.body.data as { permission: string; status: string }[]) ?? []).filter((p) => p.status === "granted").map((p) => p.permission);
    const need = ["instagram_basic", "instagram_manage_insights", "instagram_content_publish", "pages_read_engagement"];
    const lacking = need.filter((p) => !granted.includes(p));
    checks.push({ name: "Permissions", ok: lacking.length === 0, detail: lacking.length ? `missing ${lacking.join(", ")}` : need.join(", ") });
  }
  const since = String(Math.floor(Date.now() / 1000) - 7 * 86400);
  const until = String(Math.floor(Date.now() / 1000));
  const reach = await graph(`${ig}/insights`, token!, { metric: "reach", period: "day", since, until });
  checks.push({ name: "Daily reach", ok: reach.ok, detail: reach.ok ? "readable" : gerr(reach.body) });
  const totals = await graph(`${ig}/insights`, token!, { metric: "profile_views,accounts_engaged,total_interactions,views", period: "day", metric_type: "total_value", since, until });
  checks.push({ name: "Profile views & engagement", ok: totals.ok, detail: totals.ok ? "readable" : gerr(totals.body) });
  return { ...base, state: stateOf(checks), missing: [], checks, account: acct.ok ? `@${acct.body.username}` : undefined };
}

export async function instagramAdsHealth(): Promise<Connection> {
  const token = process.env.META_ACCESS_TOKEN;
  const ad = process.env.META_AD_ACCOUNT_ID;
  const base = { key: "instagram_ads" as const, label: "Meta ads (optional)" };
  if (!token || !ad) return { ...base, state: "not_set", missing: [!token && "META_ACCESS_TOKEN", !ad && "META_AD_ACCOUNT_ID"].filter(Boolean) as string[], checks: [] };
  const acct = ad.startsWith("act_") ? ad : `act_${ad}`;
  const r = await graph(acct, token, { fields: "name,account_status,currency" });
  const checks = [{ name: "Ad account", ok: r.ok, detail: r.ok ? `${r.body.name} (${r.body.currency})` : gerr(r.body) }];
  return { ...base, state: stateOf(checks), missing: [], checks };
}

export async function tiktokHealth(): Promise<Connection> {
  const token = process.env.TIKTOK_ACCESS_TOKEN;
  const biz = process.env.TIKTOK_BUSINESS_ID;
  const missing = [!token && "TIKTOK_ACCESS_TOKEN", !biz && "TIKTOK_BUSINESS_ID"].filter(Boolean) as string[];
  const base = { key: "tiktok" as const, label: "TikTok" };
  if (missing.length) return { ...base, state: "not_set", missing, checks: [] };
  try {
    const q = new URLSearchParams({ business_id: biz!, fields: JSON.stringify(["username", "followers_count"]) });
    const res = await fetch(`https://business-api.tiktok.com/open_api/v1.3/business/get/?${q}`, { headers: { "Access-Token": token! }, cache: "no-store" });
    const body = (await res.json().catch(() => ({}))) as { code?: number; message?: string; data?: { username?: string; followers_count?: number } };
    const ok = body.code === 0;
    const checks = [{ name: "Account", ok, detail: ok ? `@${body.data?.username} · ${body.data?.followers_count} followers` : `${body.message ?? "error"} (code ${body.code})` }];
    return { ...base, state: stateOf(checks), missing: [], checks, account: ok ? `@${body.data?.username}` : undefined };
  } catch (e) {
    return { ...base, state: "failing", missing: [], checks: [{ name: "Account", ok: false, detail: (e as Error).message }] };
  }
}

export async function socialHealth(): Promise<Connection[]> {
  return Promise.all([instagramHealth(), tiktokHealth(), instagramAdsHealth()]);
}
