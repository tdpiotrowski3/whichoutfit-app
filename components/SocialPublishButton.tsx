"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Admin "Publish due now" for the Social tab — runs the same drain as the
// */15 cron, so you can push a slot out immediately instead of waiting for the
// next tick. Mirrors SocialSyncButton.
export function SocialPublishButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function publish() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/social/publish", { method: "POST" });
      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
        posted?: string[];
        pending?: string[];
        failed?: { clip: string; error: string }[];
        errors?: string[];
      };
      if (!res.ok) {
        setMsg(j.error || "Publish failed.");
      } else {
        const parts: string[] = [];
        if (j.posted?.length) parts.push(`posted ${j.posted.join(", ")}`);
        // "Pending" is the normal result, not a problem: a Reel needs a second
        // pass once Meta has transcoded it.
        if (j.pending?.length) parts.push(`${j.pending.length} transcoding`);
        if (j.failed?.length) parts.push(`failed ${j.failed.map((f) => f.clip).join(", ")}`);
        if (j.errors?.length) parts.push(j.errors.join("; "));
        setMsg(parts.length ? parts.join(" · ") : "Nothing due.");
        router.refresh();
      }
    } catch {
      setMsg("Publish failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      {msg ? <span className="max-w-[260px] text-right text-xs text-[var(--wo-muted)]">{msg}</span> : null}
      <button
        onClick={publish}
        disabled={busy}
        className="shrink-0 rounded-lg border border-[var(--wo-border)] px-3 py-1.5 text-sm font-medium hover:bg-[var(--wo-bg)] disabled:opacity-50"
      >
        {busy ? "Publishing…" : "Publish due now"}
      </button>
    </div>
  );
}
