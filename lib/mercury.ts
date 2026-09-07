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

type MercuryAccount = {
  id: string;
  name?: string;
  nickname?: string;
  type?: string | null;
  kind?: string | null;
};

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
  dashboardLink?: string | null;
  details?: Record<string, unknown> | null;
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

// ---------------------------------------------------------------------------
// Credit-card settlement
//
// Mercury's checking account settles the Mercury credit card as its own debit,
// with counterpartyName "Mercury Credit" and no merchant. It is a TRANSFER
// between two accounts we own, not a purchase — the purchase is the charge on
// the CARD account, which we also ingest. Posting both is a double count.
//
// Verified against the ledger: checking's "Mercury Credit" $4.00 on 2026-09-01
// is the GitHub Pro $4.00 charged to MasterCard ••7039 on 2026-08-30, and the
// $25.00 on 2026-07-04 is the Google Play Console registration on the same card
// (that pair was already sitting in the ledger twice).
//
// These rows are kept, not dropped: seeing the money leave checking is real,
// and a silently missing row is harder to trust than a visibly ignored one.
// They land `excluded` so every total skips them.
// ---------------------------------------------------------------------------
const TRANSFER_KINDS = new Set([
  "internalTransfer",
  "creditCardCredit",
  "creditCardPayment",
  "treasuryTransfer",
]);

/** True when a debit is us paying ourselves (card settlement / account transfer). */
export function isInternalSettlement(t: {
  kind?: string | null;
  counterpartyName?: string | null;
  bankDescription?: string | null;
}): boolean {
  if (t.kind && TRANSFER_KINDS.has(t.kind)) return true;
  // Mercury names itself as the counterparty on card settlements; `kind` is
  // "other" for these, so the name is the only reliable signal.
  const name = `${t.counterpartyName ?? ""} ${t.bankDescription ?? ""}`.trim();
  return /^mercury\s+(credit|card)\b/i.test(name) || /\bmercury credit\b/i.test(name);
}

export type MercurySyncResult = {
  accounts: number;
  scanned: number;
  inserted: number;
  settlements: number;
  skipped: number;
};

/**
 * Pull Mercury transactions and insert money-out (posted debit) rows into
 * public.expenses. Idempotent: each row is keyed by receipt_ref = "mercury:<id>",
 * so re-running only adds genuinely new transactions.
 *
 * Card settlements are inserted `excluded` (see isInternalSettlement) so the
 * merchant charge on the card account is the only row that counts.
 */
export async function syncMercury(opts?: { start?: string }): Promise<MercurySyncResult> {
  const start = opts?.start ?? "2024-01-01"; // covers the whole life of the business
  const sb = admin();

  const { data: existing } = await sb.from("expenses").select("receipt_ref").eq("source", "mercury");
  const seen = new Set(((existing ?? []).map((e) => e.receipt_ref).filter(Boolean)) as string[]);

  const accounts = await listAccounts();
  let scanned = 0;
  let settlements = 0;
  const toInsert: Record<string, unknown>[] = [];

  for (const acct of accounts) {
    const acctLabel = acct.nickname || acct.name || "Mercury";
    const txns = await listTransactions(acct.id, start);
    for (const t of txns) {
      scanned++;
      if (t.amount >= 0) continue;          // credits/deposits are not expenses
      if (!t.postedAt) continue;            // only settled transactions
      if (SKIP_STATUS.has(t.status)) continue;
      const ref = `mercury:${t.id}`;
      if (seen.has(ref)) continue;          // already imported
      seen.add(ref);

      const settlement = isInternalSettlement(t);
      if (settlement) settlements++;

      const merchant = (t.counterpartyName || t.bankDescription || "Unknown").trim();
      const vendor = settlement ? `${merchant} (card settlement)` : merchant;
      const description = t.externalMemo || t.note || null;
      const notes = [
        t.kind ? `Mercury ${t.kind}` : null,
        `account: ${acctLabel}`,
        settlement
          ? "Transfer to the Mercury card, not a purchase — the merchant charge on the card account is the counted row. Excluded from all totals."
          : null,
        t.dashboardLink ?? null,
      ]
        .filter(Boolean)
        .join(" · ");

      toInsert.push({
        txn_date: (t.postedAt || t.createdAt).slice(0, 10),
        vendor,
        description,
        category: t.mercuryCategory || "Uncategorized",
        amount_cents: Math.round(Math.abs(t.amount) * 100),
        payment_method: acctLabel,
        entry_type: "cash",
        // A settlement is never an ROI cost — the charge it pays for is.
        roi_impacting: settlement ? false : isRoiCost(vendor, t.mercuryCategory, description),
        excluded: settlement,
        receipt_ref: ref,
        deductible: !settlement,
        source: "mercury",
        notes,
      });
    }
  }

  let inserted = 0;
  if (toInsert.length) {
    const { error } = await sb.from("expenses").insert(toInsert);
    if (error) throw error;
    inserted = toInsert.length;
  }

  return { accounts: accounts.length, scanned, inserted, settlements, skipped: scanned - inserted };
}

// ---------------------------------------------------------------------------
// Diagnostics (read-only) — powers GET /api/mercury/inspect.
// ---------------------------------------------------------------------------

/** Account/routing numbers are never useful here and must not leave the API. */
function safeAccount(a: MercuryAccount): Record<string, unknown> {
  const { accountNumber, routingNumber, ...rest } = a as Record<string, unknown>;
  void accountNumber;
  void routingNumber;
  return rest;
}

export async function inspectMercury(opts?: { start?: string; amount?: number }) {
  const start =
    opts?.start ?? new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
  const accounts = await listAccounts();

  const out = [];
  for (const acct of accounts) {
    const txns = await listTransactions(acct.id, start);
    const rows = txns
      .filter((t) =>
        opts?.amount == null ? true : Math.abs(Math.abs(t.amount) - opts.amount) < 0.005,
      )
      .map((t) => ({
        id: t.id,
        ref: `mercury:${t.id}`,
        date: (t.postedAt || t.createdAt).slice(0, 10),
        amount: t.amount,
        status: t.status,
        kind: t.kind ?? null,
        counterpartyName: t.counterpartyName ?? null,
        bankDescription: t.bankDescription ?? null,
        mercuryCategory: t.mercuryCategory ?? null,
        memo: t.externalMemo || t.note || null,
        settlement: isInternalSettlement(t),
        dashboardLink: t.dashboardLink ?? null,
      }));
    out.push({ account: safeAccount(acct), transactionCount: txns.length, transactions: rows });
  }
  return { start, accounts: out };
}
