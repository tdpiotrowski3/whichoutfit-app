import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/session";
import { admin } from "@/lib/supabase";
import { errorMessage } from "@/lib/contentEngine/auth";
import { draftIdeas } from "@/lib/contentEngine/planner";
import { editIdea, requestVideo, type IdeaEdit, type VideoRequest } from "@/lib/contentEngine/studio";

export const runtime = "nodejs";
export const maxDuration = 90;

// The Content Studio's idea controls, gated by the admin session cookie:
//   {action: "approve" | "reject", id, pick?}  — decide on an idea; `pick` chooses the caption
//   {action: "edit", id, edit}                 — change the script, captions, closet or input
//   {action: "request", request}               — draft one video for exactly what was asked
//   {action: "cancel", id}                     — take an approved idea back to review
//   {action: "draft"}                          — draft a fresh batch now
export async function POST(req: Request) {
  if (!(await isAuthed())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as {
    action?: string; id?: string; pick?: number; edit?: IdeaEdit; request?: VideoRequest;
  };

  try {
    if (body.action === "draft") return NextResponse.json(await draftIdeas());
    if (body.action === "request" && body.request) return NextResponse.json({ idea: await requestVideo(body.request) });
    if (body.action === "edit" && body.id && body.edit) return NextResponse.json({ idea: await editIdea(body.id, body.edit) });
  } catch (e) {
    return NextResponse.json({ error: errorMessage(e, "failed") }, { status: 400 });
  }

  if (body.action === "cancel" && body.id) {
    const { data, error } = await admin()
      .from("social_ideas")
      .update({ status: "proposed", error: null })
      .eq("id", body.id)
      .in("status", ["approved", "failed"])
      .select("id");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data?.length) return NextResponse.json({ error: "Already being made, so it can't be taken back." }, { status: 409 });
    return NextResponse.json({ ok: true });
  }

  if ((body.action === "approve" || body.action === "reject") && body.id) {
    const fields: Record<string, unknown> = { status: body.action === "approve" ? "approved" : "rejected", error: null };
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
