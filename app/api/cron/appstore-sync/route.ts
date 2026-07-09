import { NextResponse } from "next/server";
import { syncAppstore } from "@/lib/appstoreSync";
import { getAppstoreFreshness } from "@/lib/data";
import { isAlertConfigured, sendAdminAlert } from "@/lib/alert";

export const runtime = "nodejs";
export const maxDuration = 60;

// Daily Vercel Cron hits this. Vercel sends `Authorization: Bearer $CRON_SECRET`
// when CRON_SECRET is set; we also allow a manual trigger with the same secret.
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

type FreshnessCheck = { latestDay: string | null; daysStale: number | null; stale: boolean; alerted: boolean; note?: string };

// Proactive alert: after every run, check how fresh the *stored* data actually
// is (independent of whether this run wrote anything). If Apple auth silently
// fails, the sync writes nothing and the data would rot unnoticed — this catches
// that and emails the admin. Never throws; the result is folded into the response.
async function checkFreshnessAndAlert(): Promise<FreshnessCheck> {
  try {
    const { latestDay, daysStale, hoursSinceRun, reason } = await getAppstoreFreshness();
    // Only email on a genuinely stalled cron (no successful write in >26h) —
    // that's the silent-failure case. Plain Apple lag while the cron keeps
    // running is surfaced in the UI only, not emailed (avoids weekend false alarms).
    if (reason !== "cron_stalled") return { latestDay, daysStale, stale: reason === "apple_lag", alerted: false };
    if (!isAlertConfigured()) {
      return { latestDay, daysStale, stale: true, alerted: false, note: "ADMIN_ALERT_EMAIL not configured" };
    }
    const res = await sendAdminAlert(
      `⚠️ WhichOutfit App Store sync has stalled`,
      `<p>The <code>appstore-sync</code> cron has not written data in <strong>${hoursSinceRun ?? "?"}h</strong> (it runs every 24h). Newest App Store day in Supabase is <strong>${latestDay ?? "—"}</strong> (${daysStale ?? "?"} days ago).</p>
<p>The sync is likely failing to authenticate with Apple. The App Store Connect API key or vendor number may have been invalidated (e.g. by an org/account change). Regenerate the key at App Store Connect → Users and Access → Integrations, confirm the vendor number, update the <code>APPLE_ASC_*</code> / <code>APPLE_VENDOR_NUMBER</code> env vars in Vercel, then re-run <code>/api/cron/appstore-sync</code>.</p>`,
    );
    return { latestDay, daysStale, stale: true, alerted: res.sent, note: res.reason };
  } catch (e) {
    return { latestDay: null, daysStale: null, stale: false, alerted: false, note: e instanceof Error ? e.message : "freshness check failed" };
  }
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let syncError: string | null = null;
  let payload: Record<string, unknown> = {};
  try {
    payload = { ok: true, ...(await syncAppstore()) };
  } catch (e) {
    syncError = e instanceof Error ? e.message : "sync failed";
    // Log to Vercel runtime logs so the real cause (e.g. "ASC 401 for 2026-07-05")
    // is readable from the scheduled run without needing the cron secret.
    console.error("[appstore-sync] sync failed:", syncError);
  }

  // Runs whether or not the sync above succeeded — a silently-failing sync is
  // exactly the case we most want to catch.
  const freshness = await checkFreshnessAndAlert();
  if (freshness.stale) {
    console.error(`[appstore-sync] data is ${freshness.daysStale} days stale (latest ${freshness.latestDay}); alerted=${freshness.alerted}${freshness.note ? ` note=${freshness.note}` : ""}`);
  }

  if (syncError) {
    return NextResponse.json({ ok: false, error: syncError, freshness }, { status: 500 });
  }
  return NextResponse.json({ ...payload, freshness });
}
