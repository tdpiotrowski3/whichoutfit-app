import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/session";
import { admin } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 30;

// Manually add one expense (any card / cash / source), with an optional receipt
// file uploaded to the private `receipts` storage bucket.
export async function POST(req: Request) {
  if (!(await isAuthed())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData();
  const str = (k: string) => (form.get(k) ?? "").toString().trim();

  const txn_date = str("txn_date");
  const vendor = str("vendor");
  const amountRaw = parseFloat(str("amount").replace(/[$,]/g, ""));
  if (!txn_date || !vendor || !isFinite(amountRaw) || amountRaw <= 0) {
    return NextResponse.json({ error: "Date, vendor, and a positive amount are required." }, { status: 400 });
  }

  const sb = admin();

  // Optional receipt file → private bucket.
  let receipt_path: string | null = null;
  const file = form.get("receipt");
  if (file && file instanceof File && file.size > 0) {
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "Receipt file must be under 10 MB." }, { status: 400 });
    }
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `manual/${Date.now()}-${safe}`;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { error: upErr } = await sb.storage
      .from("receipts")
      .upload(path, bytes, { contentType: file.type || "application/octet-stream", upsert: false });
    if (upErr) return NextResponse.json({ error: `Upload failed: ${upErr.message}` }, { status: 500 });
    receipt_path = path;
  }

  const { error } = await sb.from("expenses").insert({
    txn_date,
    vendor,
    description: str("description") || null,
    category: str("category") || "Uncategorized",
    amount_cents: Math.round(amountRaw * 100),
    payment_method: str("payment_method") || null,
    entry_type: "cash",
    roi_impacting: str("roi_impacting") === "true",
    deductible: str("deductible") !== "false",
    receipt_path,
    source: "manual",
    notes: str("notes") || null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
