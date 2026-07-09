import { NextResponse } from "next/server";
import { syncGmail } from "@/lib/gmail";

export const runtime = "nodejs";
export const maxDuration = 300;

// Daily Vercel Cron hits this. Vercel sends `Authorization: Bearer $CRON_SECRET`
// when CRON_SECRET is set; the same secret allows a manual trigger.
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
    const r = await syncGmail();
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "sync failed" }, { status: 500 });
  }
}
