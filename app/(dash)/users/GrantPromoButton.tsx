"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Per-user "Give 2 weeks free" action on the Users tab. Grants 14 days Premium +
// 15 Photo Studio credits and queues the in-app celebratory popup. Confirms
// first (it hands out real Premium), then reflects the outcome inline.
export function GrantPromoButton({ userId, premium }: { userId: string; premium: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  async function grant() {
    if (busy) return;
    if (!window.confirm("Give this user 2 weeks of Premium + 15 credits free?")) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/users/grant-welcome", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Failed");
      setResult({ ok: j.ok !== false, text: j.message ?? "Done" });
      if (j.ok !== false) router.refresh();
    } catch (err) {
      setResult({ ok: false, text: err instanceof Error ? err.message : "Failed" });
    } finally {
      setBusy(false);
    }
  }

  if (result?.ok) {
    return (
      <span className="text-xs font-medium" style={{ color: "var(--wo-green)" }}>
        ✓ {result.text}
      </span>
    );
  }

  return (
    <div className="flex items-center justify-end gap-2">
      {result && !result.ok && <span className="text-xs text-[var(--wo-muted)]">{result.text}</span>}
      <button
        type="button"
        onClick={grant}
        disabled={busy}
        title={
          premium
            ? "Already Premium — this stacks another 14 days + 15 credits"
            : "Grant 14 days Premium + 15 Photo Studio credits and show them the 2-weeks-free popup"
        }
        className="whitespace-nowrap rounded-full border border-[var(--wo-border)] bg-white px-3 py-1 text-xs font-medium text-[var(--wo-text)] shadow-sm transition hover:border-[var(--wo-blue)] hover:text-[var(--wo-blue)] disabled:opacity-50"
      >
        {busy ? "Granting…" : "Give 2 weeks free"}
      </button>
    </div>
  );
}
