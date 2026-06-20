import zlib from "zlib";
import { makeJwt } from "./appstore";

// App Store Connect — Analytics Reports API (Tier 2: impressions, product page
// views, conversion). This API is ASYNC: you create an ONGOING report request
// once, Apple generates data ~1-2 days later, then it accrues daily.
//
// Schemas can't be introspected until the first report exists, so this parses
// DEFENSIVELY (matches columns by name) and reports what it discovered so the
// first real run can be validated. Conversion is computed downstream.

const BASE = "https://api.appstoreconnect.apple.com/v1";
const APP_ID = process.env.APPLE_APP_ID || "6778094125";

async function api(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${makeJwt()}`, "Content-Type": "application/json", ...(init?.headers || {}) },
  });
}

// Idempotent: reuse an active ONGOING request, else create one.
export async function ensureOngoingRequest(): Promise<string | null> {
  const r = await api(`/apps/${APP_ID}/analyticsReportRequests?filter[accessType]=ONGOING&limit=50`);
  if (r.ok) {
    const j = await r.json();
    const active = (j.data || []).find((d: { attributes?: { stoppedDueToInactivity?: boolean } }) => !d.attributes?.stoppedDueToInactivity);
    if (active) return active.id;
  }
  const c = await api(`/analyticsReportRequests`, {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "analyticsReportRequests",
        attributes: { accessType: "ONGOING" },
        relationships: { app: { data: { type: "apps", id: APP_ID } } },
      },
    }),
  });
  if (c.ok) return (await c.json()).data?.id ?? null;
  return null;
}

type Report = { id: string; name: string; category: string };

async function listReports(reqId: string): Promise<Report[]> {
  const out: Report[] = [];
  let url: string | null = `/analyticsReportRequests/${reqId}/reports?limit=200`;
  while (url) {
    const r = await api(url);
    if (!r.ok) break;
    const j = await r.json();
    for (const d of j.data || []) out.push({ id: d.id, name: d.attributes?.name ?? "", category: d.attributes?.category ?? "" });
    url = j.links?.next ? j.links.next.replace(BASE, "") : null;
  }
  return out;
}

async function latestDailyInstanceId(reportId: string): Promise<string | null> {
  const r = await api(`/analyticsReports/${reportId}/instances?filter[granularity]=DAILY&limit=30`);
  if (!r.ok) return null;
  const j = await r.json();
  const insts = (j.data || []).sort((a: { attributes?: { processingDate?: string } }, b: { attributes?: { processingDate?: string } }) =>
    (b.attributes?.processingDate || "").localeCompare(a.attributes?.processingDate || ""));
  return insts[0]?.id ?? null;
}

async function instanceCsvs(instanceId: string): Promise<string[]> {
  const r = await api(`/analyticsReportInstances/${instanceId}/segments?limit=100`);
  if (!r.ok) return [];
  const j = await r.json();
  const out: string[] = [];
  for (const seg of j.data || []) {
    const url = seg.attributes?.url;
    if (!url) continue;
    const f = await fetch(url); // presigned, no auth
    const buf = Buffer.from(await f.arrayBuffer());
    try { out.push(zlib.gunzipSync(buf).toString("utf8")); } catch { out.push(buf.toString("utf8")); }
  }
  return out;
}

export type AnalyticsDay = { day: string; impressions: number; product_page_views: number };

// Defensive parse: works whether metrics are columns OR event-type rows.
function parseEngagement(csv: string, acc: Map<string, AnalyticsDay>) {
  const lines = csv.trim().split("\n");
  if (lines.length < 2) return;
  const delim = lines[0].includes("\t") ? "\t" : ",";
  const hdr = lines[0].split(delim).map((h) => h.trim().toLowerCase());
  const iDate = hdr.findIndex((h) => h.includes("date"));
  if (iDate < 0) return;
  const iImpr = hdr.findIndex((h) => h.includes("impression"));
  const iViews = hdr.findIndex((h) => h.includes("page view"));
  const iEvent = hdr.findIndex((h) => h === "event" || h.endsWith(" event"));
  const iCount = hdr.findIndex((h) => h === "counts" || h === "count" || h.includes("unique") || h.includes("total"));

  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(delim);
    const day = (c[iDate] || "").trim().slice(0, 10);
    if (!day) continue;
    const row = acc.get(day) || { day, impressions: 0, product_page_views: 0 };
    if (iImpr >= 0) row.impressions += parseInt(c[iImpr] || "0", 10) || 0;
    if (iViews >= 0) row.product_page_views += parseInt(c[iViews] || "0", 10) || 0;
    if (iImpr < 0 && iViews < 0 && iEvent >= 0 && iCount >= 0) {
      const ev = (c[iEvent] || "").toLowerCase();
      const n = parseInt(c[iCount] || "0", 10) || 0;
      if (ev.includes("impression")) row.impressions += n;
      else if (ev.includes("page view")) row.product_page_views += n;
    }
    acc.set(day, row);
  }
}

export type AnalyticsResult = { days: AnalyticsDay[]; discovered: { name: string; category: string }[]; note: string };

export async function syncAnalytics(): Promise<AnalyticsResult> {
  const reqId = await ensureOngoingRequest();
  if (!reqId) return { days: [], discovered: [], note: "could not create/find ongoing request" };

  const reports = await listReports(reqId);
  if (reports.length === 0) {
    return { days: [], discovered: [], note: "request active; Apple has not generated reports yet (allow 1-2 days)" };
  }

  // Engagement / discovery reports carry impressions + page views.
  const engagement = reports.filter((r) =>
    /engagement|discovery/i.test(r.category) || /impression|page view|engagement|discovery/i.test(r.name));

  const acc = new Map<string, AnalyticsDay>();
  for (const rep of engagement) {
    const instId = await latestDailyInstanceId(rep.id);
    if (!instId) continue;
    for (const csv of await instanceCsvs(instId)) parseEngagement(csv, acc);
  }

  return {
    days: [...acc.values()],
    discovered: reports.map((r) => ({ name: r.name, category: r.category })),
    note: engagement.length ? "parsed engagement reports" : "no engagement report matched; see discovered[] to map columns",
  };
}
