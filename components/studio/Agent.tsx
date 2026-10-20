"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { IdeaReview, type EditableIdea, type TemplateOption, type ClosetOption } from "./StudioClient";

// The Content Studio as an agent: you say what you want in plain words, it
// decides the format, closet and script, reports what it did, and asks only for
// the calls that are yours (approve, rewrite, reject). Every action goes
// through /api/social/ideas, gated by the admin session.

async function call(body: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  try {
    const res = await fetch("/api/social/ideas", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return { ok: res.ok, data: (await res.json().catch(() => ({}))) as Record<string, unknown> };
  } catch {
    return { ok: false, data: { error: "Network error." } };
  }
}

const SUGGESTIONS = [
  "A wedding-guest video on my closet",
  "Something seasonal for this month",
  "Re-tell our best performing clip with a new hook",
  "A trip packing video for a winter city",
];

function Sparkle({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12 2l1.8 5.6L19.5 9.5l-5.7 1.9L12 17l-1.8-5.6L4.5 9.5l5.7-1.9L12 2zm7 11l.9 2.6 2.6.9-2.6.9L19 20l-.9-2.6-2.6-.9 2.6-.9L19 13z" />
    </svg>
  );
}

export type AgentState = "working" | "needs-you" | "blocked" | "idle";

/** The top of the studio: what the agent is doing, in a sentence, and the box to ask it for something. */
export function AgentConsole({
  state, headline, detail, autopilot,
}: { state: AgentState; headline: string; detail: string; autopilot: boolean }) {
  const router = useRouter();
  const [brief, setBrief] = useState("");
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState<{ text: string; ok: boolean } | null>(null);
  const [auto, setAuto] = useState(autopilot);

  async function send(text: string) {
    if (!text.trim() || busy) return;
    setBusy(true);
    setReply(null);
    const r = await call({ action: "brief", brief: text });
    setBusy(false);
    if (!r.ok) return setReply({ text: String(r.data.error ?? "Something went wrong."), ok: false });
    setBrief("");
    setReply({ text: String(r.data.reply ?? "Done — it's waiting for you below."), ok: true });
    router.refresh();
  }

  async function toggle() {
    const next = !auto;
    setAuto(next);
    const r = await call({ action: "autopilot", on: next });
    if (!r.ok) setAuto(!next);
    router.refresh();
  }

  const dot =
    state === "working" ? "bg-[var(--wo-blue)] animate-pulse" :
    state === "needs-you" ? "bg-amber-500" :
    state === "blocked" ? "bg-[var(--wo-red,#e5484d)]" : "bg-[var(--wo-green)]";

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--wo-border)] bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4 p-5" style={{ background: "linear-gradient(120deg, rgba(46,107,255,0.08), rgba(15,163,163,0.06))" }}>
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white" style={{ background: "linear-gradient(135deg, var(--wo-blue), var(--wo-teal))" }}>
            <Sparkle className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-[var(--wo-muted)]">
              <span className={`inline-block h-2 w-2 rounded-full ${dot}`} /> Studio agent
            </div>
            <p className="mt-0.5 text-lg font-semibold leading-snug">{headline}</p>
            <p className="text-sm text-[var(--wo-muted)]">{detail}</p>
          </div>
        </div>
        <button onClick={toggle} className="flex items-center gap-3 rounded-xl border border-[var(--wo-border)] bg-white px-3 py-2 text-left" aria-pressed={auto}>
          <span className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${auto ? "bg-[var(--wo-blue)]" : "bg-[var(--wo-border)]"}`}>
            <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${auto ? "left-[18px]" : "left-0.5"}`} />
          </span>
          <span>
            <span className="block text-sm font-medium">Autopilot {auto ? "on" : "off"}</span>
            <span className="block text-xs text-[var(--wo-muted)]">{auto ? "Weekly ideas get made without asking" : "I ask before making anything"}</span>
          </span>
        </button>
      </div>

      <div className="space-y-3 border-t border-[var(--wo-border)] p-5">
        <form
          onSubmit={(e) => { e.preventDefault(); send(brief); }}
          className="flex items-center gap-2 rounded-xl border border-[var(--wo-border)] bg-white p-1.5 pl-4 focus-within:border-[var(--wo-blue)]"
        >
          <input
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            placeholder="What should we make? e.g. “a TikTok about packing for Denver on my closet”"
            className="min-w-0 flex-1 bg-transparent py-1.5 text-sm outline-none"
            disabled={busy}
          />
          <button type="submit" disabled={busy || !brief.trim()} className="shrink-0 rounded-lg bg-[var(--wo-blue)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {busy ? "Working on it…" : "Make it"}
          </button>
        </form>
        {busy ? (
          <p className="flex items-center gap-2 text-sm text-[var(--wo-muted)]">
            <Sparkle className="h-4 w-4 animate-pulse text-[var(--wo-blue)]" /> Picking the format and closet, then writing the story…
          </p>
        ) : reply ? (
          <p className={`flex items-start gap-2 text-sm ${reply.ok ? "" : "text-[var(--wo-red,#e5484d)]"}`}>
            <Sparkle className={`mt-0.5 h-4 w-4 shrink-0 ${reply.ok ? "text-[var(--wo-blue)]" : ""}`} /> {reply.text}
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button key={s} onClick={() => send(s)} className="rounded-full border border-[var(--wo-border)] px-3 py-1 text-xs text-[var(--wo-muted)] hover:border-[var(--wo-blue)] hover:text-[var(--wo-blue)]">
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const REWRITE_NOTES = ["Funnier", "Stronger hook", "More relatable", "Lead with the result", "Shorter and punchier"];

/** One idea waiting for the owner: storyboard, then approve / rewrite / edit / reject. */
export function IdeaCard({
  idea, template, closets, footageUrl, closetLabel, narrator, beats,
}: {
  idea: EditableIdea;
  template?: TemplateOption;
  closets: ClosetOption[];
  footageUrl: string | null;
  closetLabel: string;
  narrator: string;
  beats: { start: number; end: number }[];
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"view" | "rewrite" | "edit">("view");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const caption = idea.captions[idea.caption_pick] ?? idea.captions[0];

  async function act(action: "approve" | "reject" | "rewrite", extra: Record<string, unknown> = {}) {
    setBusy(action);
    setMsg(null);
    const r = await call({ action, id: idea.id, pick: idea.caption_pick, ...extra });
    setBusy(null);
    if (!r.ok) return setMsg(String(r.data.error ?? "Failed."));
    if (action === "rewrite") { setMode("view"); setNote(""); setMsg("Rewritten."); }
    router.refresh();
  }

  if (mode === "edit") {
    return (
      <div className="space-y-2">
        <IdeaReview idea={idea} template={template} closets={closets} />
        <button onClick={() => setMode("view")} className="text-xs text-[var(--wo-muted)] hover:text-[var(--wo-text)]">← Back to the storyboard</button>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--wo-border)] bg-white">
      <div className="flex flex-col sm:flex-row">
        {footageUrl ? (
          <video src={footageUrl} muted loop playsInline autoPlay preload="metadata" className="aspect-[9/16] w-full shrink-0 bg-black object-cover sm:w-36" aria-label="The footage this video uses" />
        ) : (
          <div className="flex aspect-[9/16] w-full shrink-0 items-center justify-center bg-[var(--wo-bg)] p-3 text-center text-xs text-[var(--wo-muted)] sm:w-36">
            New footage, filmed on the Mac
          </div>
        )}
        <div className="min-w-0 flex-1 space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{idea.title}</span>
            {idea.status === "failed" ? <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs text-[var(--wo-red,#e5484d)]">failed last time</span> : null}
          </div>
          <div className="flex flex-wrap gap-1.5 text-xs">
            <span className="rounded-full bg-[var(--wo-bg)] px-2 py-0.5">{template?.label ?? idea.template}</span>
            {Object.values(idea.inputs ?? {}).map((v) => <span key={v} className="rounded-full bg-[var(--wo-bg)] px-2 py-0.5">“{v}”</span>)}
            <span className="rounded-full bg-[var(--wo-bg)] px-2 py-0.5">{closetLabel}</span>
            <span className="rounded-full bg-[var(--wo-bg)] px-2 py-0.5">narrator {narrator}</span>
          </div>
          {idea.error ? <p className="text-xs text-[var(--wo-red,#e5484d)]">Why it failed: {idea.error}</p> : null}

          <ol className="space-y-1.5">
            {idea.voiceover.map((l, i) => (
              <li key={i} className="flex gap-3 text-sm">
                <span className="w-14 shrink-0 pt-0.5 text-right font-mono text-[11px] text-[var(--wo-muted)]">
                  {beats[i] ? `${Math.round(beats[i].start)}–${Math.round(beats[i].end)}s` : `#${i + 1}`}
                </span>
                <span>{l}</span>
              </li>
            ))}
          </ol>
          <p className="border-l-2 border-[var(--wo-border)] pl-3 text-xs text-[var(--wo-muted)]">Caption: {caption}</p>
          {idea.rationale ? <p className="text-xs text-[var(--wo-muted)]">Why: {idea.rationale}</p> : null}

          {mode === "rewrite" ? (
            <div className="space-y-2 rounded-lg bg-[var(--wo-bg)] p-3">
              <div className="flex gap-2">
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="How should I change it?"
                  className="min-w-0 flex-1 rounded-lg border border-[var(--wo-border)] bg-white px-3 py-1.5 text-sm outline-none focus:border-[var(--wo-blue)]"
                  onKeyDown={(e) => { if (e.key === "Enter") act("rewrite", { note }); }}
                  autoFocus
                />
                <button onClick={() => act("rewrite", { note })} disabled={!!busy} className="rounded-lg bg-[var(--wo-blue)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
                  {busy === "rewrite" ? "Rewriting…" : "Rewrite"}
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {REWRITE_NOTES.map((n) => (
                  <button key={n} onClick={() => act("rewrite", { note: n })} disabled={!!busy} className="rounded-full border border-[var(--wo-border)] bg-white px-2.5 py-0.5 text-xs hover:border-[var(--wo-blue)] disabled:opacity-50">
                    {n}
                  </button>
                ))}
                <button onClick={() => setMode("view")} className="px-2 text-xs text-[var(--wo-muted)]">Cancel</button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => act("approve")} disabled={!!busy} className="rounded-lg bg-[var(--wo-blue)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
                {busy === "approve" ? "Approving…" : idea.status === "failed" ? "Try again" : "Approve & make it"}
              </button>
              <button onClick={() => setMode("rewrite")} disabled={!!busy} className="rounded-lg border border-[var(--wo-border)] px-3 py-1.5 text-sm font-medium hover:bg-[var(--wo-bg)]">
                ✦ Rewrite
              </button>
              <button onClick={() => setMode("edit")} disabled={!!busy} className="rounded-lg border border-[var(--wo-border)] px-3 py-1.5 text-sm font-medium hover:bg-[var(--wo-bg)]">
                Edit
              </button>
              <button onClick={() => act("reject")} disabled={!!busy} className="px-2 py-1.5 text-sm text-[var(--wo-muted)] hover:text-[var(--wo-text)]">
                Reject
              </button>
              {msg ? <span className="text-xs text-[var(--wo-muted)]">{msg}</span> : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
