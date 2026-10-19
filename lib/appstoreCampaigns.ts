import { admin } from "./supabase";
import { ensureOngoingRequest, listReports, latestDailyInstanceId, instanceCsvs } from "./appstoreAnalytics";

// Apple App Analytics per campaign token (the ct= that /go puts on every App
// Store link). Comes from the DETAILED "App Downloads" report, the only one
// with a Campaign column (Apple added it 2024-11-19). Apple withholds small
// counts: a campaign appears only after 5+ first-time downloads, and tiny rows
// may be dropped, so a missing campaign means "below Apple's threshold".
//
// Parsed by column NAME, not position, because Apple's report schemas shift.

export type CampaignDay = { day: string; campaign: string; first_downloads: number; redownloads: number };

function parse(csv: string, acc: Map<string, CampaignDay>) {
  const lines = csv.trim().split("\n");
  if (lines.length < 2) return;
  const delim = lines[0].includes("\t") ? "\t" : ",";
  const hdr = lines[0].split(delim).map((h) => h.trim().toLowerCase());
  const col = (name: string) => hdr.indexOf(name);
  const iDate = col("date");
  const iCampaign = col("campaign");
  const iType = col("download type");
  const iCount = col("counts");
  if (iDate < 0 || iCampaign < 0 || iCount < 0) return;

  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(delim);
    const campaign = (c[iCampaign] || "").trim().toLowerCase();
    const day = (c[iDate] || "").trim().slice(0, 10);
    if (!campaign || !day) continue;
    const type = (iType >= 0 ? c[iType] || "" : "").toLowerCase();
    const n = parseInt(c[iCount] || "0", 10) || 0;
    const key = `${day}|${campaign}`;
    const row = acc.get(key) ?? { day, campaign, first_downloads: 0, redownloads: 0 };
    if (type.includes("first")) row.first_downloads += n;
    else if (type.includes("redownload")) row.redownloads += n;
    acc.set(key, row);
  }
}

export type CampaignSyncResult = { rows: number; note: string };

export async function syncCampaigns(): Promise<CampaignSyncResult> {
  const reqId = await ensureOngoingRequest();
  if (!reqId) return { rows: 0, note: "no analytics report request" };

  const reports = await listReports(reqId);
  const downloads = reports.filter((r) => /download/i.test(r.name) && /detail/i.test(r.name));
  if (downloads.length === 0) return { rows: 0, note: "detailed App Downloads report not generated yet" };

  const acc = new Map<string, CampaignDay>();
  for (const rep of downloads) {
    const instId = await latestDailyInstanceId(rep.id);
    if (!instId) continue;
    for (const csv of await instanceCsvs(instId)) parse(csv, acc);
  }

  const rows = [...acc.values()];
  if (rows.length) {
    const { error } = await admin()
      .from("appstore_campaign_metrics")
      .upsert(
        rows.map((r) => ({ ...r, updated_at: new Date().toISOString() })),
        { onConflict: "day,campaign" },
      );
    if (error) throw error;
  }
  return { rows: rows.length, note: rows.length ? "ok" : "no campaign rows yet (Apple shows a campaign after 5+ first downloads)" };
}
