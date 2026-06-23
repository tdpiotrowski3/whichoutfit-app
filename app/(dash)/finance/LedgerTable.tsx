"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ExpenseRow } from "@/lib/data";

const usd = (cents: number) =>
  `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function LedgerTable({ rows }: { rows: ExpenseRow[] }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);

  async function toggleRoi(r: ExpenseRow) {
    if (r.entry_type === "memo") return; // memos never count toward ROI
    setPending(r.id);
    try {
      const res = await fetch("/api/finance/update", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: r.id, roi_impacting: !r.roi_impacting }),
      });
      if (res.ok) router.refresh();
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--wo-border)] text-left text-[var(--wo-muted)]">
            <th className="py-2 pr-3 font-medium">Date</th>
            <th className="py-2 pr-3 font-medium">Vendor</th>
            <th className="py-2 pr-3 font-medium">Category</th>
            <th className="py-2 pr-3 text-right font-medium">Amount</th>
            <th className="py-2 pr-3 font-medium">Classification</th>
            <th className="py-2 pr-3 font-medium">Source</th>
            <th className="py-2 pr-3 font-medium">Receipt</th>
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
                <td className="whitespace-nowrap py-2 pr-3 text-right">{usd(r.amount_cents)}</td>
                <td className="py-2 pr-3">
                  {memo ? (
                    <span className="rounded-full bg-[var(--wo-border)]/50 px-2 py-0.5 text-xs">memo</span>
                  ) : (
                    <button
                      onClick={() => toggleRoi(r)}
                      disabled={pending === r.id}
                      title="Click to move between ROI and Overhead"
                      className={`rounded-full px-2 py-0.5 text-xs font-medium transition-colors disabled:opacity-50 ${
                        r.roi_impacting
                          ? "bg-[var(--wo-teal)]/15 text-[var(--wo-teal)] hover:bg-[var(--wo-teal)]/25"
                          : "bg-[var(--wo-border)]/50 text-[var(--wo-muted)] hover:bg-[var(--wo-border)]"
                      }`}
                    >
                      {pending === r.id ? "…" : r.roi_impacting ? "ROI" : "Overhead"}
                    </button>
                  )}
                </td>
                <td className="whitespace-nowrap py-2 pr-3">{r.source}</td>
                <td className="py-2 pr-3">
                  {r.receipt_path ? (
                    <a href={`/api/finance/receipt?id=${r.id}`} target="_blank" rel="noopener noreferrer" className="text-[var(--wo-blue)] hover:underline">
                      view
                    </a>
                  ) : (
                    <span className="text-[var(--wo-muted)]">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
