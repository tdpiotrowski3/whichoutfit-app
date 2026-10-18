import { NextResponse } from "next/server";
import { runSocialPublish } from "@/lib/socialPublish";

export const runtime = "nodejs";
export const maxDuration = 60;

// Frequent Vercel Cron — same bearer-secret scheme as the other cron routes.
// Runs often (every 15 min) rather than daily because publishing a Reel takes
// two passes: one to hand Instagram the video, one to publish it once Meta has
// finished transcoding. See lib/socialPublish.ts.
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await runSocialPublish();
  return NextResponse.json({ ok: result.errors.length === 0 && result.failed.length === 0, ...result });
}
