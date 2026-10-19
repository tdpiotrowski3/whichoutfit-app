import { NextResponse } from "next/server";
import { runSocialPublish } from "@/lib/socialPublish";

export const runtime = "nodejs";
// The Hobby plan's ceiling. A run uploads, waits on Meta's transcode and
// publishes in one go, so it needs the room. See lib/socialPublish.ts.
export const maxDuration = 300;

/** Stop waiting on transcodes with this much of maxDuration left, so the run reports cleanly. */
const WAIT_BUDGET_MS = 240_000;

// Runs from the daily Vercel cron (vercel.json) and the GitHub Actions backup
// (.github/workflows/social-publish.yml). Same bearer-secret scheme as the
// other cron routes.
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await runSocialPublish(new Date(), { waitUntil: Date.now() + WAIT_BUDGET_MS });
  return NextResponse.json({ ok: result.errors.length === 0 && result.failed.length === 0, ...result });
}
