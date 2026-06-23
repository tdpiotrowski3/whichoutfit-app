import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/session";
import { admin } from "@/lib/supabase";
import { isRoiCost } from "@/lib/finance";

export const runtime = "nodejs";

// Tolerant CSV parser (handles quoted fields, escaped quotes, CRLF).
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false;
      } else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const norm = (s: string) => s.trim().toLowerCase();

// Maps a Mercury CSV export into expense rows. Only money-out (negative amount)
// transactions become expenses; deposits/transfers-in are skipped. Dedupes
// against already-imported Mercury rows by (date, amount, vendor).
export async function POST(req: Request) {
  if (!(await isAuthed())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const text = await req.text();
  const rows = parseCsv(text).filter((r) => r.some((c) => c.trim() !== ""));
  if (rows.length < 2) return NextResponse.json({ error: "Empty or unreadable CSV" }, { status: 400 });

  const header = rows[0].map(norm);
  const findCol = (names: string[]) => header.findIndex((h) => names.some((n) => h.includes(n)));
  const di = findCol(["date"]);
  const desc = findCol(["description", "merchant", "counterparty", "name"]);
  const ai = findCol(["amount"]);
  const ci = findCol(["category"]);
  if (di < 0 || ai < 0) {
    return NextResponse.json({ error: "Couldn't find Date/Amount columns — is this a Mercury CSV?" }, { status: 400 });
  }

  const sb = admin();
  const { data: existing } = await sb.from("expenses").select("txn_date,amount_cents,vendor").eq("source", "mercury");
  const seen = new Set((existing ?? []).map((e) => `${e.txn_date}|${e.amount_cents}|${e.vendor}`));

  const toInsert: Record<string, unknown>[] = [];
  let skipped = 0;

  for (const r of rows.slice(1)) {
    const rawAmt = parseFloat((r[ai] ?? "").replace(/[$,]/g, ""));
    if (!isFinite(rawAmt) || rawAmt >= 0) continue; // expenses are debits (negative)
    const d = new Date((r[di] ?? "").trim());
    if (isNaN(d.getTime())) continue;
    const txn_date = d.toISOString().slice(0, 10);
    const vendor = (desc >= 0 ? r[desc] : "")?.trim() || "Unknown";
    const amount_cents = Math.round(Math.abs(rawAmt) * 100);
    const key = `${txn_date}|${amount_cents}|${vendor}`;
    if (seen.has(key)) { skipped++; continue; }
    seen.add(key);
    const category = (ci >= 0 ? r[ci]?.trim() : "") || "Uncategorized";
    toInsert.push({
      txn_date,
      vendor,
      description: vendor,
      category,
      amount_cents,
      payment_method: "Mercury",
      entry_type: "cash",
      roi_impacting: isRoiCost(vendor, category),
      source: "mercury",
      deductible: true,
    });
  }

  if (toInsert.length) {
    const { error } = await sb.from("expenses").insert(toInsert);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ inserted: toInsert.length, skipped });
}
