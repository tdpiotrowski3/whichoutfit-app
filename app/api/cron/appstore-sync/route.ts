import { NextResponse } from "next/server";
import { admin } from "@/lib/supabase";
import { fetchSalesRange } from "@/lib/appstore";

export const runtime = "nodejs";
export const maxDuration = 60;

// Daily Vercel Cron hits this. Vercel sends `Authorization: Bearer $CRON_SECRET`
// when CRON_SECRET is set; we also allow a manual trigger with the same secret.
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const rows = await fetchSalesRange(14);
    if (rows.length) {
      const { error } = await admin()
        .from("appstore_metrics")
        .upsert(
          rows.map((r) => ({ ...r, updated_at: new Date().toISOString() })),
          { onConflict: "day" },
        );
      if (error) throw error;
    }
    const totals = rows.reduce(
      (a, r) => ({ downloads: a.downloads + r.downloads, redownloads: a.redownloads + r.redownloads }),
      { downloads: 0, redownloads: 0 },
    );
    return NextResponse.json({ ok: true, days_synced: rows.length, ...totals });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "sync failed" }, { status: 500 });
  }
}
