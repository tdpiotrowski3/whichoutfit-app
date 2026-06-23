"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

const field = "rounded-lg border border-[var(--wo-border)] px-3 py-1.5 text-sm bg-white";
const label = "text-xs font-medium text-[var(--wo-muted)]";

export function AddExpenseForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/finance/add", { method: "POST", body: new FormData(form) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Failed to add");
      setStatus({ ok: true, text: "Expense added." });
      form.reset();
      router.refresh();
    } catch (err) {
      setStatus({ ok: false, text: err instanceof Error ? err.message : "Failed to add" });
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg bg-[var(--wo-blue)] px-3 py-1.5 text-sm font-medium text-white"
      >
        + Add expense
      </button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="w-full rounded-2xl border border-[var(--wo-border)] bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Add expense</h3>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-[var(--wo-muted)] hover:text-[var(--wo-text)]">
          Cancel
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <div className="flex flex-col gap-1">
          <span className={label}>Date</span>
          <input className={field} type="date" name="txn_date" required />
        </div>
        <div className="flex flex-col gap-1">
          <span className={label}>Vendor</span>
          <input className={field} name="vendor" placeholder="e.g. IKEA" required />
        </div>
        <div className="flex flex-col gap-1">
          <span className={label}>Amount (USD)</span>
          <input className={field} name="amount" inputMode="decimal" placeholder="129.99" required />
        </div>
        <div className="flex flex-col gap-1">
          <span className={label}>Category</span>
          <input className={field} name="category" placeholder="e.g. Office furniture" />
        </div>
        <div className="flex flex-col gap-1">
          <span className={label}>Payment method</span>
          <input className={field} name="payment_method" placeholder="Amex / Cash / …" />
        </div>
        <div className="flex flex-col gap-1">
          <span className={label}>Description</span>
          <input className={field} name="description" placeholder="optional" />
        </div>
        <div className="flex flex-col gap-1 md:col-span-2">
          <span className={label}>Notes</span>
          <input className={field} name="notes" placeholder="optional" />
        </div>
        <div className="flex flex-col gap-1">
          <span className={label}>Receipt file</span>
          <input className="text-xs" type="file" name="receipt" accept="image/*,application/pdf" />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="roi_impacting" value="true" />
          Counts toward ROI <span className="text-xs text-[var(--wo-muted)]">(marketing / Claude only)</span>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="deductible" value="true" defaultChecked />
          Tax-deductible
        </label>
        <input type="hidden" name="deductible" value="false" />
        <div className="ml-auto flex items-center gap-3">
          {status ? <span className={`text-xs ${status.ok ? "text-[var(--wo-green)]" : "text-red-500"}`}>{status.text}</span> : null}
          <button type="submit" disabled={busy} className="rounded-lg bg-[var(--wo-blue)] px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50">
            {busy ? "Saving…" : "Save expense"}
          </button>
        </div>
      </div>
    </form>
  );
}
