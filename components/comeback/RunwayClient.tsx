"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { postText } from "@/lib/comeback/runway";
import type { PieceRow } from "@/lib/comeback/runwayStore";

// The runway's buttons. Each posts to /api/comeback/runway and refreshes the
// server-rendered page, so the timeline always shows what is in the database.

async function call(body: Record<string, unknown>): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  try {
    const res = await fetch("/api/comeback/runway", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return { ok: res.ok, data: (await res.json().catch(() => ({}))) as Record<string, unknown> };
  } catch {
    return { ok: false, data: { error: "Network error." } };
  }
}

const btn = "rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50";
const primary = `${btn} bg-[var(--wo-blue)] text-white hover:opacity-90`;
const quiet = `${btn} border border-[var(--wo-border)] bg-white text-[var(--wo-text)] hover:bg-[var(--wo-bg)]`;

export function DraftRunwayButton({ empty }: { empty: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  if (empty === 0) return <span className="text-sm text-[var(--wo-muted)]">Every slot is drafted</span>;
  return (
    <div className="flex items-center gap-3">
      {msg ? <span className="text-sm text-[var(--wo-muted)]">{msg}</span> : null}
      <button
        className={primary}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setMsg("Writing the runway, a phase at a time…");
          const r = await call({ action: "draft" });
          setBusy(false);
          const d = r.data as { error?: string; drafted?: number; dropped?: string[]; remaining?: number };
          if (!r.ok) setMsg(d.error || "Drafting failed.");
          else setMsg(`Drafted ${d.drafted}.${d.remaining ? ` ${d.remaining} didn't fit; draft again to retry them.` : ""}`);
          router.refresh();
        }}
      >
        {busy ? "Drafting…" : `Draft ${empty} empty slot${empty === 1 ? "" : "s"}`}
      </button>
    </div>
  );
}

export function LaunchDateForm({ launch, startsOn }: { launch: string | null; startsOn: string | null }) {
  const router = useRouter();
  const [date, setDate] = useState(launch ?? "");
  const [msg, setMsg] = useState("");
  const save = async (value: string | null) => {
    const r = await call({ action: "launch_date", date: value });
    setMsg(r.ok ? (value ? "Saved." : "Cleared; the plan is back to T-minus days.") : String(r.data.error ?? "Couldn't save."));
    router.refresh();
  };
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <label className="flex items-center gap-2">
        <span className="text-[var(--wo-muted)]">Launch day</span>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-lg border border-[var(--wo-border)] px-2 py-1.5" />
      </label>
      <button className={quiet} disabled={!date || date === launch} onClick={() => save(date)}>Set date</button>
      {launch ? <button className={quiet} onClick={() => { setDate(""); save(null); }}>Back to TBD</button> : null}
      <span className="text-[var(--wo-muted)]">
        {msg || (startsOn ? `The runway starts ${new Date(`${startsOn}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" })}.` : "No date yet; set one to see the calendar.")}
      </span>
    </div>
  );
}

export function PieceActions({ piece }: { piece: PieceRow }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [rewriting, setRewriting] = useState(false);
  const [pick, setPick] = useState(piece.caption_pick);
  const [msg, setMsg] = useState("");
  const editable = ["proposed", "approved", "failed"].includes(piece.status);

  const run = async (label: string, body: Record<string, unknown>) => {
    setBusy(label);
    setMsg("");
    const r = await call(body);
    setBusy(null);
    if (!r.ok) setMsg(String(r.data.error ?? "That didn't work."));
    else { setRewriting(false); setNote(""); }
    router.refresh();
  };

  return (
    <div className="space-y-2">
      {piece.captions.length > 1 && editable ? (
        <div className="flex flex-wrap gap-1.5">
          {piece.captions.map((c, i) => (
            <button
              key={i}
              title={c}
              onClick={() => setPick(i)}
              className={`max-w-full truncate rounded-full border px-2.5 py-1 text-left text-xs sm:max-w-[16rem] ${i === pick ? "border-[var(--wo-blue)] text-[var(--wo-blue)]" : "border-[var(--wo-border)] text-[var(--wo-muted)]"}`}
            >
              {["Hook", "Plain", "POV"][i] ?? `Option ${i + 1}`}: {c}
            </button>
          ))}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        {editable && piece.status !== "approved" ? (
          <button className={primary} disabled={!!busy} onClick={() => run("approve", { action: "approve", id: piece.id, pick })}>
            {busy === "approve" ? "Approving…" : "Approve"}
          </button>
        ) : null}
        {piece.status === "approved" ? (
          <button className={quiet} disabled={!!busy} onClick={() => run("reopen", { action: "reopen", id: piece.id })}>Back to review</button>
        ) : null}
        {editable ? <button className={quiet} disabled={!!busy} onClick={() => setRewriting((v) => !v)}>Rewrite</button> : null}
        {piece.captions.length ? (
          <button
            className={quiet}
            onClick={async () => {
              await navigator.clipboard.writeText(postText(piece.captions[pick] ?? piece.captions[0], piece.hashtags)).catch(() => undefined);
              setMsg("Caption copied.");
            }}
          >
            Copy caption
          </button>
        ) : null}
        {editable ? (
          <button className={`${btn} text-[var(--wo-muted)] hover:text-red-600`} disabled={!!busy} onClick={() => run("reject", { action: "reject", id: piece.id })}>
            Reject
          </button>
        ) : null}
        {msg ? <span className="text-sm text-[var(--wo-muted)]">{msg}</span> : null}
      </div>
      {rewriting ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={'What to change, e.g. "open on my own shoulder surgery"'}
            className="min-w-0 flex-1 rounded-lg border border-[var(--wo-border)] px-3 py-1.5 text-sm"
          />
          <button className={primary} disabled={!!busy} onClick={() => run("rewrite", { action: "rewrite", id: piece.id, note })}>
            {busy === "rewrite" ? "Rewriting…" : "Rewrite it"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
