import { getFinanceOverview, getSpendByCategory, getExpenses } from "@/lib/data";
import { Card, Stat, Bar } from "@/components/ui";
import { FinanceActions } from "./FinanceActions";

export const dynamic = "force-dynamic";

const usd = (n: number) =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default async function FinancePage() {
  let overview, cats, rows;
  try {
    [overview, cats, rows] = await Promise.all([
      getFinanceOverview(),
      getSpendByCategory(),
      getExpenses(),
    ]);
  } catch {
    return (
      <Card title="Not configured">
        <p className="text-sm text-[var(--wo-muted)]">Set Supabase env vars to load finance data.</p>
      </Card>
    );
  }

  const maxCat = Math.max(1, ...cats.map((c) => c.cash_usd));
  const roiPct = overview.roi_ratio == null ? null : overview.roi_ratio * 100;
  const cashRows = rows.filter((r) => r.entry_type === "cash");
  const memoRows = rows.filter((r) => r.entry_type === "memo");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Finance</h1>
          <p className="text-sm text-[var(--wo-muted)]">
            Expense ledger, ROI &amp; runway · cash basis. Revenue pulls from App Store proceeds;
            append your Mercury export to keep one continuous ledger.
          </p>
        </div>
        <FinanceActions rows={rows} />
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Revenue · to date" value={usd(overview.revenue_usd)} accent="green" />
        <Stat label="Cash spend · to date" value={usd(overview.cash_spend_usd)} accent="blue" />
        <Stat label="Net" value={usd(overview.net_usd)} accent={overview.net_usd >= 0 ? "green" : "muted"} />
        <Stat label="ROI" value={roiPct == null ? "—" : `${roiPct.toFixed(0)}%`} accent={roiPct != null && roiPct >= 0 ? "green" : "muted"} />
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Marketing spend" value={usd(overview.marketing_spend_usd)} accent="teal" />
        <Stat label="Meta prepaid (memo)" value={usd(overview.memo_spend_usd)} sub="not counted as cash" accent="muted" />
        <Stat label="Cash transactions" value={cashRows.length} accent="muted" />
        <Stat label="Avg / transaction" value={cashRows.length ? usd(overview.cash_spend_usd / cashRows.length) : "—"} accent="muted" />
      </div>

      <Card title="Spend by category (cash)">
        {cats.length === 0 ? (
          <p className="text-sm text-[var(--wo-muted)]">No expenses yet.</p>
        ) : (
          <div className="space-y-3">
            {cats.map((c) => (
              <div key={c.category} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span>
                    {c.category} <span className="text-[var(--wo-muted)]">· {c.cash_count}</span>
                  </span>
                  <span className="font-medium">{usd(c.cash_usd)}</span>
                </div>
                <Bar value={c.cash_usd} max={maxCat} color="var(--wo-teal)" />
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title={`Ledger · ${rows.length} entries`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--wo-border)] text-left text-[var(--wo-muted)]">
                <th className="py-2 pr-3 font-medium">Date</th>
                <th className="py-2 pr-3 font-medium">Vendor</th>
                <th className="py-2 pr-3 font-medium">Category</th>
                <th className="py-2 pr-3 text-right font-medium">Amount</th>
                <th className="py-2 pr-3 font-medium">Type</th>
                <th className="py-2 pr-3 font-medium">Source</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const memo = r.entry_type === "memo";
                return (
                  <tr key={r.id} className={`border-b border-[var(--wo-border)]/50 ${memo ? "italic text-[var(--wo-muted)]" : ""}`}>
                    <td className="whitespace-nowrap py-2 pr-3">{r.txn_date}</td>
                    <td className="py-2 pr-3">
                      {r.vendor}
                      {r.description ? <div className="text-xs text-[var(--wo-muted)]">{r.description}</div> : null}
                    </td>
                    <td className="py-2 pr-3">{r.category}</td>
                    <td className="whitespace-nowrap py-2 pr-3 text-right">{usd(r.amount_cents / 100)}</td>
                    <td className="py-2 pr-3">{memo ? "memo" : "cash"}</td>
                    <td className="whitespace-nowrap py-2 pr-3">{r.source}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="text-xs text-[var(--wo-muted)]">
        Cash = real charges ({cashRows.length}). Memo = Meta ad spend drawn from an already-funded
        prepaid balance ({memoRows.length}); shown for completeness but excluded from cash totals to
        avoid double-counting. ROI = (revenue − cash spend) ÷ cash spend.
      </p>
    </div>
  );
}
