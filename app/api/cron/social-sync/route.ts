import { NextResponse } from "next/server";
import { runSocialSync } from "@/lib/socialSync";
import { sendTikTokReminder, type ReminderResult } from "@/lib/tiktokReminder";

export const runtime = "nodejs";
export const maxDuration = 120;

// Daily Vercel Cron. Same bearer-secret scheme as appstore-sync. The metrics
// sync lives in lib/socialSync (shared with the admin "Sync now" button); the
// TikTok reminder email only goes from here, so pressing the button never
// sends mail.
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { upserted, posts, errors } = await runSocialSync(14);

  let reminder: ReminderResult | null = null;
  try {
    reminder = await sendTikTokReminder();
  } catch (e) {
    errors.push(`tiktok reminder: ${(e as Error).message}`);
  }

  return NextResponse.json({ ok: errors.length === 0, upserted, posts, reminder, errors });
}
