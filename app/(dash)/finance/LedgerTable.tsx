"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ExpenseRow } from "@/lib/data";

const usd = (cents: number) =>
  `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const inp = "w-full rounded border border-[var(--wo-border)] bg-white px-2 py-1 text-sm";

type Draft = { txn_date: string; vendor: string; category: string; amount: string };

export function LedgerTable({ rows }: { rows: ExpenseRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);

  async function post(url: string, body: unknown) {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error || "Request failed");
    }
  }

  async function toggleRoi(r: ExpenseRow) {
    if (r.entry_type === "memo") return;
    setBusy(r.id);
    try {
      await post("/api/finance/update", { id: r.id, roi_impacting: !r.roi_impacting });
      router.refresh();
    } catch {
      /* no-op */
    } finally {
      setBusy(null);
    }
  }

  function startEdit(r: ExpenseRow) {
    setEditId(r.id);
    setDraft({ txn_date: r.txn_date, vendor: r.vendor, category: r.category, amount: (r.amount_cents / 100).toFixed(2) });
  }

  async function save(id: string) {
    if (!draft) return;
    const amount = parseFloat(draft.amount.replace(/[$,]/g, ""));
    if (!draft.vendor.trim() || !isFinite(amount) || amount <= 0) return;
    setBusy(id);
    try {
      await post("/api/finance/update", {
        id,
        txn_date: draft.txn_date,
        vendor: draft.vendor.trim(),
        category: draft.category.trim() || "Uncategorized",
        amount_cents: Math.round(amount * 100),
      });
      setEditId(null);
      setDraft(null);
      router.refresh();
    } catch {
      /* keep editing on failure */
    } finally {
      setBusy(null);
    }
  }

  async function remove(r: ExpenseRow) {
    if (!confirm(`Delete "${r.vendor} · ${usd(r.amount_cents)}"? This can't be undone.`)) return;
    setBusy(r.id);
    try {
      await post("/api/finance/delete", { id: r.id });
      router.refresh();
    } catch {
      /* no-op */
    } finally {
      setBusy(null);
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
            <th className="py-2 pr-3 text-right font-medium">Edit</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const memo = r.entry_type === "memo";
            const editing = editId === r.id;
            const rowBusy = busy === r.id;
            return (
              <tr key={r.id} className={`border-b border-[var(--wo-border)]/50 ${memo && !editing ? "italic text-[var(--wo-muted)]" : ""}`}>
                {editing && draft ? (
                  <>
                    <td className="py-2 pr-3"><input className={inp} type="date" value={draft.txn_date} onChange={(e) => setDraft({ ...draft, txn_date: e.target.value })} /></td>
                    <td className="py-2 pr-3"><input className={inp} value={draft.vendor} onChange={(e) => setDraft({ ...draft, vendor: e.target.value })} /></td>
                    <td className="py-2 pr-3"><input className={inp} value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} /></td>
                    <td className="py-2 pr-3"><input className={`${inp} text-right`} inputMode="decimal" value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} /></td>
                  </>
                ) : (
                  <>
                    <td className="whitespace-nowrap py-2 pr-3">{r.txn_date}</td>
                    <td className="py-2 pr-3">
                      {r.vendor}
                      {r.description ? <div className="text-xs text-[var(--wo-muted)]">{r.description}</div> : null}
                    </td>
                    <td className="py-2 pr-3">{r.category}</td>
                    <td className="whitespace-nowrap py-2 pr-3 text-right">{usd(r.amount_cents)}</td>
                  </>
                )}

                <td className="py-2 pr-3">
                  {memo ? (
                    <span className="rounded-full bg-[var(--wo-border)]/50 px-2 py-0.5 text-xs">memo</span>
                  ) : (
                    <button
                      onClick={() => toggleRoi(r)}
                      disabled={rowBusy || editing}
                      title="Click to move between ROI and Overhead"
                      className={`rounded-full px-2 py-0.5 text-xs font-medium transition-colors disabled:opacity-50 ${
                        r.roi_impacting
                          ? "bg-[var(--wo-teal)]/15 text-[var(--wo-teal)] hover:bg-[var(--wo-teal)]/25"
                          : "bg-[var(--wo-border)]/50 text-[var(--wo-muted)] hover:bg-[var(--wo-border)]"
                      }`}
                    >
                      {r.roi_impacting ? "ROI" : "Overhead"}
                    </button>
                  )}
                </td>
                <td className="whitespace-nowrap py-2 pr-3">{r.source}</td>
                <td className="py-2 pr-3">
                  {r.receipt_path ? (
                    <a href={`/api/finance/receipt?id=${r.id}`} target="_blank" rel="noopener noreferrer" className="text-[var(--wo-blue)] hover:underline">view</a>
                  ) : (
                    <span className="text-[var(--wo-muted)]">—</span>
                  )}
                </td>
                <td className="whitespace-nowrap py-2 pr-3 text-right">
                  {editing ? (
                    <span className="inline-flex gap-2">
                      <button onClick={() => save(r.id)} disabled={rowBusy} className="font-medium text-[var(--wo-green)] hover:underline disabled:opacity-50">{rowBusy ? "…" : "Save"}</button>
                      <button onClick={() => { setEditId(null); setDraft(null); }} disabled={rowBusy} className="text-[var(--wo-muted)] hover:underline">Cancel</button>
                      <button onClick={() => remove(r)} disabled={rowBusy} className="text-red-500 hover:underline disabled:opacity-50">Delete</button>
                    </span>
                  ) : (
                    <button onClick={() => startEdit(r)} disabled={busy !== null} className="text-[var(--wo-blue)] hover:underline disabled:opacity-50">Edit</button>
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
