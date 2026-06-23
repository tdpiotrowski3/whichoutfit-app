import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/session";
import { admin } from "@/lib/supabase";

export const runtime = "nodejs";

// Toggle a single expense's ROI classification (ROI cost <-> overhead).
export async function POST(req: Request) {
  if (!(await isAuthed())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { id?: string; roi_impacting?: boolean };
  if (!body.id || typeof body.roi_impacting !== "boolean") {
    return NextResponse.json({ error: "id and roi_impacting required" }, { status: 400 });
  }
  const { error } = await admin()
    .from("expenses")
    .update({ roi_impacting: body.roi_impacting })
    .eq("id", body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
