import { NextResponse } from "next/server";
import { admin } from "@/lib/supabase";
import { approvedJobs } from "@/lib/contentEngine/planner";
import { engineAuthorized } from "@/lib/contentEngine/auth";

export const runtime = "nodejs";

// GET  — the approved ideas, each with its template (beats, flow, inputs), for
//        the Mac render command to work through.
// POST — {id, status: "rendering" | "failed" | "approved", error?} so the queue
//        shows what the Mac is doing, and a failure says why on the Social tab.
export async function GET(req: Request) {
  if (!engineAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ jobs: await approvedJobs() });
}

const ALLOWED = new Set(["rendering", "failed", "approved"]);

export async function POST(req: Request) {
  if (!engineAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { id?: string; status?: string; error?: string };
  if (!body.id || !body.status || !ALLOWED.has(body.status)) {
    return NextResponse.json({ error: "Need id and a status of rendering, failed or approved." }, { status: 400 });
  }
  const { error } = await admin()
    .from("social_ideas")
    .update({ status: body.status, error: body.status === "failed" ? (body.error ?? "render failed").slice(0, 500) : null })
    .eq("id", body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
