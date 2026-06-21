import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/session";
import { runSocialSync } from "@/lib/socialSync";

export const runtime = "nodejs";
export const maxDuration = 60;

// Admin-triggered social sync (the "Sync now" button on the Social tab). Gated by
// the admin session cookie — NOT the CRON_SECRET, which the browser never holds.
export async function POST() {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { upserted, errors } = await runSocialSync(14);
  return NextResponse.json({ ok: errors.length === 0, upserted, errors });
}
