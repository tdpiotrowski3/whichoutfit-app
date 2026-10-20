import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/session";
import { admin } from "@/lib/supabase";
import { errorMessage } from "@/lib/contentEngine/auth";
import { draftIdeas } from "@/lib/contentEngine/planner";

export const runtime = "nodejs";
export const maxDuration = 90;

// The Social tab's idea controls, gated by the admin session cookie:
//   {action: "approve" | "reject", id, pick?}  — decide on a proposed idea;
//                                               `pick` chooses which caption posts
//   {action: "draft"}                          — draft a fresh batch now
export async function POST(req: Request) {
  if (!(await isAuthed())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { action?: string; id?: string; pick?: number };

  if (body.action === "draft") {
    try {
      return NextResponse.json(await draftIdeas());
    } catch (e) {
      return NextResponse.json({ error: errorMessage(e, "drafting failed") }, { status: 500 });
    }
  }

  if ((body.action === "approve" || body.action === "reject") && body.id) {
    const fields: Record<string, unknown> = { status: body.action === "approve" ? "approved" : "rejected" };
    if (body.action === "approve" && Number.isInteger(body.pick)) fields.caption_pick = Math.max(0, Math.min(2, body.pick!));
    // Only an undecided (or failed, for a retry) idea can be decided again.
    const { data, error } = await admin()
      .from("social_ideas")
      .update(fields)
      .eq("id", body.id)
      .in("status", ["proposed", "failed", "approved"])
      .select("id");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data?.length) return NextResponse.json({ error: "That idea is already being rendered or done." }, { status: 409 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
