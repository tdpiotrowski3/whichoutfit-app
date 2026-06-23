import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/session";
import { syncMercury } from "@/lib/mercury";

export const runtime = "nodejs";
export const maxDuration = 60;

// Admin-triggered Mercury sync (the "Sync Mercury" button on the Finance tab).
// Gated by the admin session cookie — NOT CRON_SECRET, which the browser lacks.
export async function POST() {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const r = await syncMercury();
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "sync failed" }, { status: 500 });
  }
}
