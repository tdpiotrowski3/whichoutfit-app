import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/session";
import { admin } from "@/lib/supabase";

export const runtime = "nodejs";

// Delete one expense (and its uploaded receipt file, if any).
export async function POST(req: Request) {
  if (!(await isAuthed())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { id?: string };
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const sb = admin();
  const { data: row } = await sb.from("expenses").select("receipt_path").eq("id", body.id).single();
  if (row?.receipt_path) {
    await sb.storage.from("receipts").remove([row.receipt_path]); // best-effort
  }

  const { error } = await sb.from("expenses").delete().eq("id", body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
