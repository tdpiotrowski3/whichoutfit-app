"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Approve / reject one content-engine idea on the Social tab. Approving takes
// the chosen caption with it; the Mac render command picks approved ideas up.
export function SocialIdeaActions({ id, captions, pick }: { id: string; captions: string[]; pick: number }) {
  const router = useRouter();
  const [choice, setChoice] = useState(pick);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function decide(action: "approve" | "reject") {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/social/ideas", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, id, pick: choice }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) setMsg(j.error || "Failed.");
      else router.refresh();
    } catch {
      setMsg("Failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <fieldset className="space-y-1">
        {captions.map((c, i) => (
          <label key={i} className="flex cursor-pointer items-start gap-2 text-sm">
            <input type="radio" name={`cap-${id}`} checked={choice === i} onChange={() => setChoice(i)} className="mt-1" />
            <span>{c}</span>
          </label>
        ))}
      </fieldset>
      <div className="flex items-center gap-2">
        <button
          onClick={() => decide("approve")}
          disabled={busy}
          className="rounded-lg bg-[var(--wo-blue)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          Approve
        </button>
        <button
          onClick={() => decide("reject")}
          disabled={busy}
          className="rounded-lg border border-[var(--wo-border)] px-3 py-1.5 text-sm font-medium hover:bg-[var(--wo-bg)] disabled:opacity-50"
        >
          Reject
        </button>
        {msg ? <span className="text-xs text-[var(--wo-muted)]">{msg}</span> : null}
      </div>
    </div>
  );
}

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
