import { getFinanceOverview, getSpendByCategory, getExpenses } from "@/lib/data";
import { Card, Stat, Bar } from "@/components/ui";
import { FinanceActions } from "./FinanceActions";
import { AddExpenseForm } from "./AddExpenseForm";
import { LedgerTable } from "./LedgerTable";

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
            Expense ledger, ROI &amp; runway · cash basis. ROI runs on marketing + Claude only; everything
            else is deductible <strong>overhead</strong> (excluded from ROI). Revenue pulls from App Store proceeds.
          </p>
        </div>
        <FinanceActions rows={rows} />
      </div>

      <AddExpenseForm />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Revenue · to date" value={usd(overview.revenue_usd)} accent="green" />
        <Stat label="ROI cost · mktg + Claude" value={usd(overview.roi_cost_usd)} accent="teal" />
        <Stat label="ROI" value={roiPct == null ? "—" : `${roiPct.toFixed(0)}%`} accent={roiPct != null && roiPct >= 0 ? "green" : "muted"} />
        <Stat label="Net · revenue − all spend" value={usd(overview.net_usd)} accent={overview.net_usd >= 0 ? "green" : "muted"} />
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Overhead · tax write-off" value={usd(overview.overhead_usd)} sub="excluded from ROI" accent="muted" />
        <Stat label="Total cash spend" value={usd(overview.cash_spend_usd)} accent="blue" />
        <Stat label="Marketing spend" value={usd(overview.marketing_spend_usd)} accent="teal" />
        <Stat label="Meta prepaid · memo" value={usd(overview.memo_spend_usd)} sub="non-cash" accent="muted" />
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
        <LedgerTable rows={rows} />
      </Card>

      <p className="text-xs text-[var(--wo-muted)]">
        <strong>ROI</strong> = (revenue − ROI cost) ÷ ROI cost, where ROI cost = marketing + Claude only.
        Click a row&apos;s <strong>classification</strong> chip to move it between ROI and Overhead.
        <strong> Overhead</strong> = deductible costs excluded from ROI (LLC fee, infra, furniture, …).
        <strong> Memo</strong> = Meta ad spend from already-funded prepaid balance ({memoRows.length}), excluded from cash totals.
        {" "}Cash transactions: {cashRows.length}.
      </p>
    </div>
  );
}
