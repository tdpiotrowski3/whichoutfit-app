"use client";

import { useState, type FormEvent, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";

const field = "rounded-lg border border-[var(--wo-border)] px-3 py-1.5 text-sm bg-white";
const label = "text-xs font-medium text-[var(--wo-muted)]";

type Fields = {
  txn_date: string;
  vendor: string;
  amount: string;
  category: string;
  payment_method: string;
  description: string;
  notes: string;
  receipt_ref: string;
  entry_type: "cash" | "memo";
  roi_impacting: boolean;
  deductible: boolean;
};

const EMPTY: Fields = {
  txn_date: "", vendor: "", amount: "", category: "", payment_method: "",
  description: "", notes: "", receipt_ref: "", entry_type: "cash",
  roi_impacting: false, deductible: true,
};

export function AddExpenseForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [f, setF] = useState<Fields>(EMPTY);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  const set = <K extends keyof Fields>(k: K, v: Fields[K]) => setF((prev) => ({ ...prev, [k]: v }));

  function reset() {
    setF(EMPTY);
    setFile(null);
    setStatus(null);
  }

  // Drop a receipt → Gemini extracts the fields → prefill the form for review.
  async function onReceipt(e: ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0] ?? null;
    setFile(picked);
    if (!picked) return;
    setParsing(true);
    setStatus(null);
    try {
      const fd = new FormData();
      fd.append("receipt", picked);
      const res = await fetch("/api/finance/parse-receipt", { method: "POST", body: fd });
      const j = await res.json();
      if (!res.ok || j.ok === false) throw new Error(j.error || "Could not read receipt");
      const x = j.extracted;
      setF({
        txn_date: x.txn_date || "",
        vendor: x.vendor || "",
        amount: x.amount ? String(x.amount) : "",
        category: x.category || "",
        payment_method: x.payment_method || "",
        description: x.description || "",
        notes: x.notes || "",
        receipt_ref: x.receipt_ref || "",
        entry_type: x.entry_type === "memo" ? "memo" : "cash",
        roi_impacting: !!x.roi_impacting,
        deductible: true,
      });
      const pct = Math.round((x.confidence ?? 0) * 100);
      setStatus({ ok: true, text: `Autofilled from receipt (${pct}% confidence). Review, then save.` });
    } catch (err) {
      setStatus({ ok: false, text: err instanceof Error ? err.message : "Could not read receipt" });
    } finally {
      setParsing(false);
    }
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      const fd = new FormData();
      fd.append("txn_date", f.txn_date);
      fd.append("vendor", f.vendor);
      fd.append("amount", f.amount);
      fd.append("category", f.category);
      fd.append("payment_method", f.payment_method);
      fd.append("description", f.description);
      fd.append("notes", f.notes);
      fd.append("receipt_ref", f.receipt_ref);
      fd.append("entry_type", f.entry_type);
      fd.append("roi_impacting", f.roi_impacting ? "true" : "false");
      fd.append("deductible", f.deductible ? "true" : "false");
      if (file) fd.append("receipt", file);

      const res = await fetch("/api/finance/add", { method: "POST", body: fd });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Failed to add");
      setStatus({ ok: true, text: "Expense added." });
      reset();
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
        <button type="button" onClick={() => { setOpen(false); reset(); }} className="text-xs text-[var(--wo-muted)] hover:text-[var(--wo-text)]">
          Cancel
        </button>
      </div>

      {/* Drop a receipt → autofill */}
      <label className="mb-3 flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-[var(--wo-border)] bg-[var(--wo-bg)] px-3 py-4 text-center hover:border-[var(--wo-blue)]">
        <span className="text-sm font-medium">{parsing ? "Reading receipt…" : "Drop a receipt to autofill"}</span>
        <span className="text-xs text-[var(--wo-muted)]">
          {file ? file.name : "PDF or image — Gemini extracts vendor, date, amount & category"}
        </span>
        <input type="file" accept="image/*,application/pdf" className="hidden" onChange={onReceipt} disabled={parsing} />
      </label>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <div className="flex flex-col gap-1">
          <span className={label}>Date</span>
          <input className={field} type="date" value={f.txn_date} onChange={(e) => set("txn_date", e.target.value)} required />
        </div>
        <div className="flex flex-col gap-1">
          <span className={label}>Vendor</span>
          <input className={field} value={f.vendor} onChange={(e) => set("vendor", e.target.value)} placeholder="e.g. IKEA" required />
        </div>
        <div className="flex flex-col gap-1">
          <span className={label}>Amount (USD)</span>
          <input className={field} inputMode="decimal" value={f.amount} onChange={(e) => set("amount", e.target.value)} placeholder="129.99" required />
        </div>
        <div className="flex flex-col gap-1">
          <span className={label}>Category</span>
          <input className={field} value={f.category} onChange={(e) => set("category", e.target.value)} placeholder="e.g. Office furniture" />
        </div>
        <div className="flex flex-col gap-1">
          <span className={label}>Payment method</span>
          <input className={field} value={f.payment_method} onChange={(e) => set("payment_method", e.target.value)} placeholder="Amex / Cash / …" />
        </div>
        <div className="flex flex-col gap-1">
          <span className={label}>Receipt ref</span>
          <input className={field} value={f.receipt_ref} onChange={(e) => set("receipt_ref", e.target.value)} placeholder="invoice / order #" />
        </div>
        <div className="flex flex-col gap-1">
          <span className={label}>Description</span>
          <input className={field} value={f.description} onChange={(e) => set("description", e.target.value)} placeholder="optional" />
        </div>
        <div className="flex flex-col gap-1 md:col-span-2">
          <span className={label}>Notes</span>
          <input className={field} value={f.notes} onChange={(e) => set("notes", e.target.value)} placeholder="optional" />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.roi_impacting} onChange={(e) => set("roi_impacting", e.target.checked)} />
          Counts toward ROI <span className="text-xs text-[var(--wo-muted)]">(marketing / Claude only)</span>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.deductible} onChange={(e) => set("deductible", e.target.checked)} />
          Tax-deductible
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.entry_type === "memo"} onChange={(e) => set("entry_type", e.target.checked ? "memo" : "cash")} />
          Memo <span className="text-xs text-[var(--wo-muted)]">(non-cash / prepaid draw)</span>
        </label>
        <div className="ml-auto flex items-center gap-3">
          {status ? <span className={`text-xs ${status.ok ? "text-[var(--wo-green)]" : "text-red-500"}`}>{status.text}</span> : null}
          <button type="submit" disabled={busy || parsing} className="rounded-lg bg-[var(--wo-blue)] px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50">
            {busy ? "Saving…" : "Save expense"}
          </button>
        </div>
      </div>
    </form>
  );
}
