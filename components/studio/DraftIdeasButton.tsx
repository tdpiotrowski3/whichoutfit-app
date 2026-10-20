"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// "Draft ideas now" — the same drafting the weekly cron does, on demand.
export function DraftIdeasButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function draft() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/social/ideas", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "draft" }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; drafted?: number; skipped?: string; dropped?: string[] };
      if (!res.ok) setMsg(j.error || "Drafting failed.");
      else {
        setMsg(j.skipped ?? `${j.drafted ?? 0} drafted${j.dropped?.length ? `, ${j.dropped.length} dropped (didn't fit their beats)` : ""}`);
        router.refresh();
      }
    } catch {
      setMsg("Drafting failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      {msg ? <span className="max-w-[260px] text-right text-xs text-[var(--wo-muted)]">{msg}</span> : null}
      <button
        onClick={draft}
        disabled={busy}
        className="shrink-0 rounded-lg border border-[var(--wo-border)] px-3 py-1.5 text-sm font-medium hover:bg-[var(--wo-bg)] disabled:opacity-50"
      >
        {busy ? "Drafting…" : "Draft ideas now"}
      </button>
    </div>
  );
}
