"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import type { ExpenseRow } from "@/lib/data";

export function FinanceActions({ rows }: { rows: ExpenseRow[] }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<null | "import" | "sync" | "gmail">(null);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  function exportCsv() {
    const header = [
      "Date", "Vendor", "Description", "Category", "Amount", "Payment Method",
      "Type", "Receipt Ref", "Deductible", "Source", "Notes",
    ];
    const esc = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [header.join(",")];
    for (const r of rows) {
      lines.push(
        [
          r.txn_date, r.vendor, r.description ?? "", r.category,
          (r.amount_cents / 100).toFixed(2), r.payment_method ?? "",
          r.entry_type, r.receipt_ref ?? "", r.deductible ? "Yes" : "No",
          r.source, r.notes ?? "",
        ].map(esc).join(","),
      );
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `whichoutfit-expenses-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function syncMercury() {
    setBusy("sync");
    setStatus(null);
    try {
      const res = await fetch("/api/mercury/sync", { method: "POST" });
      const j = await res.json();
      if (!res.ok || j.ok === false) throw new Error(j.error || "Sync failed");
      setStatus({ ok: true, text: `Synced ${j.inserted} new transaction${j.inserted === 1 ? "" : "s"} from Mercury (${j.accounts} account${j.accounts === 1 ? "" : "s"}).` });
      router.refresh();
    } catch (err) {
      setStatus({ ok: false, text: err instanceof Error ? err.message : "Sync failed" });
    } finally {
      setBusy(null);
    }
  }

  async function syncGmail() {
    setBusy("gmail");
    setStatus(null);
    try {
      const res = await fetch("/api/gmail/sync", { method: "POST" });
      const j = await res.json();
      if (!res.ok || j.ok === false) throw new Error(j.error || "Gmail sync failed");
      const more = j.remaining ? ` · ${j.remaining} more queued for the next run` : "";
      setStatus({ ok: true, text: `Imported ${j.inserted} receipt${j.inserted === 1 ? "" : "s"} from Gmail · skipped ${j.skipped} duplicate${j.skipped === 1 ? "" : "s"}${more}.` });
      router.refresh();
    } catch (err) {
      setStatus({ ok: false, text: err instanceof Error ? err.message : "Gmail sync failed" });
    } finally {
      setBusy(null);
    }
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy("import");
    setStatus(null);
    try {
      const text = await file.text();
      const res = await fetch("/api/finance/import", {
        method: "POST",
        headers: { "content-type": "text/csv" },
        body: text,
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Import failed");
      setStatus({ ok: true, text: `Imported ${j.inserted} new · skipped ${j.skipped} duplicate${j.skipped === 1 ? "" : "s"}.` });
      router.refresh();
    } catch (err) {
      setStatus({ ok: false, text: err instanceof Error ? err.message : "Import failed" });
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-2">
        <button
          onClick={syncMercury}
          disabled={busy !== null}
          className="rounded-lg bg-[var(--wo-green)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy === "sync" ? "Syncing…" : "Sync Mercury"}
        </button>
        <button
          onClick={syncGmail}
          disabled={busy !== null}
          className="rounded-lg bg-[var(--wo-blue)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy === "gmail" ? "Syncing…" : "Sync Gmail"}
        </button>
        <button
          onClick={exportCsv}
          className="rounded-lg border border-[var(--wo-border)] px-3 py-1.5 text-sm font-medium hover:bg-[var(--wo-bg)]"
        >
          Export CSV
        </button>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={busy !== null}
          className="rounded-lg border border-[var(--wo-border)] px-3 py-1.5 text-sm font-medium hover:bg-[var(--wo-bg)] disabled:opacity-50"
        >
          {busy === "import" ? "Importing…" : "Import CSV"}
        </button>
        <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} />
      </div>
      {status ? (
        <span className={`max-w-[320px] text-right text-xs ${status.ok ? "text-[var(--wo-green)]" : "text-red-500"}`}>{status.text}</span>
      ) : null}
    </div>
  );
}
