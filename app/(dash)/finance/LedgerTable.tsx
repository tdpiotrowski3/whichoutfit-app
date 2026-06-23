"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ExpenseRow } from "@/lib/data";

const usd = (cents: number) =>
  `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const inp = "w-full rounded border border-[var(--wo-border)] bg-white px-2 py-1 text-sm";

type Draft = { txn_date: string; vendor: string; category: string; amount: string };
type Klass = "roi" | "overhead" | "ignore";

function classOf(r: ExpenseRow): Klass {
  if (r.excluded) return "ignore";
  return r.roi_impacting ? "roi" : "overhead";
}

export function LedgerTable({ rows }: { rows: ExpenseRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [showIgnored, setShowIgnored] = useState(true);

  const ignoredCount = rows.filter((r) => r.excluded).length;
  const visible = showIgnored ? rows : rows.filter((r) => !r.excluded);

  async function post(url: string, body: unknown) {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Request failed");
  }

  async function setClass(r: ExpenseRow, k: Klass) {
    if (classOf(r) === k) return;
    const patch =
      k === "ignore" ? { excluded: true }
      : k === "roi" ? { excluded: false, roi_impacting: true }
      : { excluded: false, roi_impacting: false };
    setBusy(r.id);
    try {
      await post("/api/finance/update", { id: r.id, ...patch });
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
    <div>
      {ignoredCount > 0 && (
        <label className="mb-3 flex items-center justify-end gap-2 text-xs text-[var(--wo-muted)]">
          <input type="checkbox" checked={showIgnored} onChange={(e) => setShowIgnored(e.target.checked)} />
          Show ignored ({ignoredCount})
        </label>
      )}
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
            {visible.map((r) => {
              const editing = editId === r.id;
              const rowBusy = busy === r.id;
              return (
                <tr key={r.id} className={`border-b border-[var(--wo-border)]/50 ${r.excluded && !editing ? "text-[var(--wo-muted)] line-through" : ""}`}>
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
                        {r.description ? <div className="text-xs text-[var(--wo-muted)] no-underline">{r.description}</div> : null}
                      </td>
                      <td className="py-2 pr-3">{r.category}</td>
                      <td className="whitespace-nowrap py-2 pr-3 text-right">{usd(r.amount_cents)}</td>
                    </>
                  )}

                  <td className="py-2 pr-3">
                    <select
                      value={classOf(r)}
                      onChange={(e) => setClass(r, e.target.value as Klass)}
                      disabled={rowBusy || editing}
                      className="rounded-md border border-[var(--wo-border)] bg-white px-2 py-1 text-xs font-medium disabled:opacity-50"
                    >
                      <option value="roi">ROI</option>
                      <option value="overhead">Overhead</option>
                      <option value="ignore">Ignore</option>
                    </select>
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
    </div>
  );
}
