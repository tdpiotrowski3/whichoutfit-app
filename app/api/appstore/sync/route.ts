import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/session";
import { syncAppstore } from "@/lib/appstoreSync";

export const runtime = "nodejs";
export const maxDuration = 60;

// Admin-triggered App Store sync (the "Sync App Store" button). Gated by the
// admin session cookie — NOT CRON_SECRET, which the browser lacks. Lets Tyler
// self-heal a missed/failed daily cron run without the cron secret.
export async function POST() {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const r = await syncAppstore();
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "sync failed" }, { status: 500 });
  }
}
