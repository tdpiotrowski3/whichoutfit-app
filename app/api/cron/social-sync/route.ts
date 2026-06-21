import { NextResponse } from "next/server";
import { runSocialSync } from "@/lib/socialSync";

export const runtime = "nodejs";
export const maxDuration = 60;

// Daily Vercel Cron. Same bearer-secret scheme as appstore-sync. The actual sync
// lives in lib/socialSync (shared with the admin "Sync now" button).
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { upserted, errors } = await runSocialSync(14);
  return NextResponse.json({ ok: errors.length === 0, upserted, errors });
}
