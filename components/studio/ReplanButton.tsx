"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Rebuild a brand's six-week plan from its latest results, or run another
// plan action on the same endpoint (Comeback's "draft this week").
export function ReplanButton({ endpoint, label, action = "replan", busyLabel = "Planning…" }: { endpoint: string; label: string; action?: string; busyLabel?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) });
      const j = (await res.json().catch(() => ({}))) as { error?: string; drafted?: number; dropped?: string[] };
      if (!res.ok) setMsg(j.error || "That didn't work.");
      else {
        if (typeof j.drafted === "number") setMsg(`${j.drafted} written${j.dropped?.length ? `, ${j.dropped.length} thrown out by the editor` : ""}`);
        router.refresh();
      }
    } catch {
      setMsg("That didn't work.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="flex items-center gap-2">
      {msg ? <span className="max-w-[220px] text-right text-xs text-[var(--wo-muted)]">{msg}</span> : null}
      <button onClick={run} disabled={busy} className="shrink-0 rounded-lg border border-[var(--wo-border)] px-3 py-1.5 text-sm font-medium hover:bg-[var(--wo-bg)] disabled:opacity-50">
        {busy ? busyLabel : label}
      </button>
    </span>
  );
}
