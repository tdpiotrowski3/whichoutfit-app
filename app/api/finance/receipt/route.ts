import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/session";
import { admin } from "@/lib/supabase";

export const runtime = "nodejs";

// Serve a private receipt file via a short-lived signed URL (admin-only).
export async function GET(req: Request) {
  if (!(await isAuthed())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const sb = admin();
  const { data: row } = await sb.from("expenses").select("receipt_path").eq("id", id).single();
  const path = row?.receipt_path;
  if (!path) return NextResponse.json({ error: "No receipt on file" }, { status: 404 });

  const { data, error } = await sb.storage.from("receipts").createSignedUrl(path, 120);
  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: error?.message || "Could not sign URL" }, { status: 500 });
  }
  return NextResponse.redirect(data.signedUrl);
}
