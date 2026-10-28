import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/session";
import { errorMessage } from "@/lib/contentEngine/auth";
import { decidePiece, draftRunway, rewritePiece, setLaunchDate } from "@/lib/comeback/runwayStore";
import type { Phase } from "@/lib/comeback/runway";

export const runtime = "nodejs";
export const maxDuration = 300;

// The Comeback launch runway's controls, gated by the admin session cookie:
//   {action: "draft", phase?}                      — write every empty slot (or one phase's)
//   {action: "approve" | "reject" | "reopen", id, pick?}
//   {action: "rewrite", id, note}                  — redo one piece from a note
//   {action: "launch_date", date}                  — YYYY-MM-DD, or null for "to be decided"
export async function POST(req: Request) {
  if (!(await isAuthed())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { action?: string; id?: string; pick?: number; note?: string; date?: string | null; phase?: Phase };
  try {
    if (body.action === "draft") return NextResponse.json(await draftRunway(body.phase));
    if (body.action === "rewrite" && body.id) return NextResponse.json({ piece: await rewritePiece(body.id, body.note ?? "") });
    if ((body.action === "approve" || body.action === "reject" || body.action === "reopen") && body.id) {
      await decidePiece(body.id, body.action, body.pick);
      return NextResponse.json({ ok: true });
    }
    if (body.action === "launch_date") {
      await setLaunchDate(body.date || null);
      return NextResponse.json({ ok: true });
    }
  } catch (e) {
    return NextResponse.json({ error: errorMessage(e, "failed") }, { status: 400 });
  }
  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
