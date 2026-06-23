import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/session";
import { admin } from "@/lib/supabase";

export const runtime = "nodejs";

// Whitelisted editable columns. Anything else in the body is ignored.
const EDITABLE = new Set([
  "txn_date", "vendor", "description", "category",
  "amount_cents", "payment_method", "roi_impacting", "excluded", "deductible", "notes",
]);

// Patch one expense. Accepts { id, ...fields } — used both by the ROI toggle
// ({ id, roi_impacting }) and inline row edits ({ id, vendor, amount_cents, … }).
export async function POST(req: Request) {
  if (!(await isAuthed())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = body.id;
  if (typeof id !== "string" || !id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (k === "id" || !EDITABLE.has(k)) continue;
    patch[k] = v;
  }

  if ("amount_cents" in patch) {
    const n = Number(patch.amount_cents);
    if (!Number.isFinite(n) || n <= 0) {
      return NextResponse.json({ error: "amount must be positive" }, { status: 400 });
    }
    patch.amount_cents = Math.round(n);
  }
  if ("vendor" in patch && !String(patch.vendor).trim()) {
    return NextResponse.json({ error: "vendor cannot be empty" }, { status: 400 });
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "no editable fields provided" }, { status: 400 });
  }

  const { error } = await admin().from("expenses").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
