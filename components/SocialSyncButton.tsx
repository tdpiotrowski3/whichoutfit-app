"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Admin "Sync now" for the Social tab — runs the same sync as the daily cron,
// so you can pull fresh sandbox/live numbers on demand while testing.
export function SocialSyncButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function sync() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/social/sync", { method: "POST" });
      const j = (await res.json().catch(() => ({}))) as { error?: string; upserted?: Record<string, number>; errors?: string[] };
      if (!res.ok) {
        setMsg(j.error || "Sync failed.");
      } else {
        const counts = Object.entries(j.upserted ?? {}).map(([k, v]) => `${k} ${v}`).join(", ");
        setMsg(j.errors?.length ? `Done, with issues: ${j.errors.join("; ")}` : `Synced ${counts || "0 rows"}.`);
        router.refresh();
      }
    } catch {
      setMsg("Sync failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      {msg ? <span className="max-w-[260px] text-right text-xs text-[var(--wo-muted)]">{msg}</span> : null}
      <button
        onClick={sync}
        disabled={busy}
        className="shrink-0 rounded-lg border border-[var(--wo-border)] px-3 py-1.5 text-sm font-medium hover:bg-[var(--wo-bg)] disabled:opacity-50"
      >
        {busy ? "Syncing…" : "Sync now"}
      </button>
    </div>
  );
}
