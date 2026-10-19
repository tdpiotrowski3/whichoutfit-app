import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/session";
import { runSocialPublish } from "@/lib/socialPublish";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Long enough for a typical Reel transcode, short enough to keep the button responsive. */
const WAIT_BUDGET_MS = 90_000;

// Admin-triggered drain of the publish queue (the "Publish due now" button on
// the Social tab). Gated by the admin session cookie — NOT the CRON_SECRET,
// which the browser never holds. Mirrors /api/social/sync.
export async function POST() {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await runSocialPublish(new Date(), { waitUntil: Date.now() + WAIT_BUDGET_MS });
  return NextResponse.json({ ok: result.errors.length === 0 && result.failed.length === 0, ...result });
}
