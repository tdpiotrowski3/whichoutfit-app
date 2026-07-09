"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Admin "Sync App Store" button — re-runs /api/appstore/sync on demand so a
// missed or failed daily cron can be self-healed without the cron secret.
export function SyncAppstoreButton({ className }: { className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function run() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/appstore/sync", { method: "POST" });
      const j = await res.json();
      if (!res.ok || j.ok === false) throw new Error(j.error || "Sync failed");
      const extra = j.analytics?.days ? ` · ${j.analytics.days} analytics day${j.analytics.days === 1 ? "" : "s"}` : "";
      setMsg({ ok: true, text: `Synced ${j.sales_days} sales day${j.sales_days === 1 ? "" : "s"}${extra}.` });
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Sync failed" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        onClick={run}
        disabled={busy}
        className={className ?? "shrink-0 rounded-lg bg-[var(--wo-blue)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"}
      >
        {busy ? "Syncing…" : "Sync App Store"}
      </button>
      {msg ? <span className={`text-xs ${msg.ok ? "text-[var(--wo-green)]" : "text-red-500"}`}>{msg.text}</span> : null}
    </span>
  );
}
