import { admin } from "./supabase";
import { isRoiCost } from "./finance";

// Mercury banking API — read-only pull of bank transactions into the expense
// ledger. Docs: https://docs.mercury.com/reference . All secrets via env.
//   GET /accounts
//   GET /account/{id}/transactions?limit&offset&order&start&end
// amount is signed (debits negative); response is { total, transactions: [...] }.
// Token (MERCURY_API_TOKEN) is the value Mercury shows, incl. its "secret-token:"
// prefix — we pass it through verbatim as a Bearer token.

const BASE = "https://api.mercury.com/api/v1";

function token(): string {
  const t = process.env.MERCURY_API_TOKEN;
  if (!t) throw new Error("Missing MERCURY_API_TOKEN env var");
  return t.trim();
}

async function mercury<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token()}`, Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Mercury ${res.status} on ${path}: ${body.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

type MercuryAccount = { id: string; name?: string; nickname?: string };

type MercuryTxn = {
  id: string;
  amount: number;
  status: string;
  createdAt: string;
  postedAt: string | null;
  counterpartyName?: string | null;
  bankDescription?: string | null;
  externalMemo?: string | null;
  note?: string | null;
  kind?: string | null;
  mercuryCategory?: string | null;
};

export async function listAccounts(): Promise<MercuryAccount[]> {
  const data = await mercury<{ accounts?: MercuryAccount[] } | MercuryAccount[]>("/accounts");
  return Array.isArray(data) ? data : (data.accounts ?? []);
}

async function listTransactions(accountId: string, start: string): Promise<MercuryTxn[]> {
  const out: MercuryTxn[] = [];
  const limit = 500;
  let offset = 0;
  // Paginate by offset until we've pulled `total` (or a short page ends it).
  for (;;) {
    const data = await mercury<{ total: number; transactions: MercuryTxn[] }>(
      `/account/${accountId}/transactions?limit=${limit}&offset=${offset}&order=asc&start=${start}`,
    );
    const batch = data.transactions ?? [];
    out.push(...batch);
    offset += batch.length;
    if (batch.length === 0 || batch.length < limit || offset >= (data.total ?? out.length)) break;
  }
  return out;
}

const SKIP_STATUS = new Set(["failed", "cancelled", "reversed", "blocked"]);

export type MercurySyncResult = {
  accounts: number;
  scanned: number;
  inserted: number;
  skipped: number;
};

/**
 * Pull Mercury transactions and insert money-out (posted debit) rows into
 * public.expenses. Idempotent: each row is keyed by receipt_ref = "mercury:<id>",
 * so re-running only adds genuinely new transactions.
 */
export async function syncMercury(opts?: { start?: string }): Promise<MercurySyncResult> {
  const start = opts?.start ?? "2024-01-01"; // covers the whole life of the business
  const sb = admin();

  const { data: existing } = await sb.from("expenses").select("receipt_ref").eq("source", "mercury");
  const seen = new Set(((existing ?? []).map((e) => e.receipt_ref).filter(Boolean)) as string[]);

  const accounts = await listAccounts();
  let scanned = 0;
  const toInsert: Record<string, unknown>[] = [];

  for (const acct of accounts) {
    const txns = await listTransactions(acct.id, start);
    for (const t of txns) {
      scanned++;
      if (t.amount >= 0) continue;          // credits/deposits are not expenses
      if (!t.postedAt) continue;            // only settled transactions
      if (SKIP_STATUS.has(t.status)) continue;
      const ref = `mercury:${t.id}`;
      if (seen.has(ref)) continue;          // already imported
      seen.add(ref);
      const vendor = (t.counterpartyName || t.bankDescription || "Unknown").trim();
      const description = t.externalMemo || t.note || null;
      toInsert.push({
        txn_date: (t.postedAt || t.createdAt).slice(0, 10),
        vendor,
        description,
        category: t.mercuryCategory || "Uncategorized",
        amount_cents: Math.round(Math.abs(t.amount) * 100),
        payment_method: "Mercury",
        entry_type: "cash",
        roi_impacting: isRoiCost(vendor, t.mercuryCategory, description),
        receipt_ref: ref,
        deductible: true,
        source: "mercury",
        notes: t.kind ? `Mercury ${t.kind}` : null,
      });
    }
  }

  let inserted = 0;
  if (toInsert.length) {
    const { error } = await sb.from("expenses").insert(toInsert);
    if (error) throw error;
    inserted = toInsert.length;
  }

  return { accounts: accounts.length, scanned, inserted, skipped: scanned - inserted };
}
