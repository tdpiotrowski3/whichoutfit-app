import { NextResponse } from "next/server";
import { admin } from "@/lib/supabase";
import { approvedJobs } from "@/lib/contentEngine/planner";
import { engineAuthorized } from "@/lib/contentEngine/auth";
import { beat } from "@/lib/contentEngine/studio";

export const runtime = "nodejs";

// GET  — the approved ideas, each with its template (beats, flow, inputs), for
//        the Mac render command to work through.
// POST — {id, status: "rendering" | "failed" | "approved", error?} so the queue
//        shows what the Mac is doing, and a failure says why on the Social tab.
export async function GET(req: Request) {
  if (!engineAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const jobs = await approvedJobs();
  // Every poll is the worker's heartbeat: the Content Studio shows it online.
  await beat({ waiting: jobs.length });
  return NextResponse.json({ jobs });
}

const ALLOWED = new Set(["rendering", "failed", "approved"]);

export async function POST(req: Request) {
  if (!engineAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { id?: string; status?: string; error?: string };
  if (!body.id || !body.status || !ALLOWED.has(body.status)) {
    return NextResponse.json({ error: "Need id and a status of rendering, failed or approved." }, { status: 400 });
  }
  await beat({ working: body.status === "rendering" ? body.id : null });
  const { error } = await admin()
    .from("social_ideas")
    .update({ status: body.status, error: body.status === "failed" ? (body.error ?? "render failed").slice(0, 500) : null })
    .eq("id", body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
