import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/session";
import { inspectMercury } from "@/lib/mercury";

export const runtime = "nodejs";
export const maxDuration = 60;

// Read-only Mercury diagnostic. Writes nothing — it exists to answer "what IS
// this transaction?" for the opaque rows the sync produces, without anyone
// having to read the API token out of Vercel or click through the dashboard.
//
// Why it exists: the checking account settles the Mercury credit card as a
// debit named "Mercury Credit", which carries no merchant. The merchant lives
// on the CARD account. This endpoint shows both sides so an unattributed
// ledger row can be matched to the charge behind it.
//
//   GET /api/mercury/inspect                  → accounts + last 90d
//   GET /api/mercury/inspect?start=2026-07-01 → from a date
//   GET /api/mercury/inspect?amount=35.09     → only transactions for an amount
export async function GET(req: Request) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const start = url.searchParams.get("start") ?? undefined;
  const amountParam = url.searchParams.get("amount");
  const amount = amountParam ? Number(amountParam) : undefined;
  if (amountParam && !Number.isFinite(amount)) {
    return NextResponse.json({ error: "amount must be a number" }, { status: 400 });
  }
  try {
    return NextResponse.json({ ok: true, ...(await inspectMercury({ start, amount })) });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "inspect failed" },
      { status: 500 },
    );
  }
}
