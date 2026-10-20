"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { countSyllables } from "@/lib/contentEngine/templates";

// The Content Studio's interactive pieces (app/(dash)/content). Every action
// goes through /api/social/ideas or /api/social/closets, gated by the admin
// session; the server re-validates everything typed here.

export type TemplateOption = {
  key: string;
  label: string;
  kind: "flow" | "recut";
  inputs: { name: string; describe: string }[];
  budgets: number[];
  was: string[];
};

export type ClosetOption = { key: string; label: string; available: boolean };

export type EditableIdea = {
  id: string;
  status: string;
  template: string;
  inputs: Record<string, string>;
  closet: string;
  title: string;
  voiceover: string[];
  captions: string[];
  caption_pick: number;
  rationale: string | null;
  error: string | null;
};

async function call(path: string, body: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  try {
    const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: res.ok, data };
  } catch {
    return { ok: false, data: { error: "Network error." } };
  }
}

const btn = "rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50";
const primary = `${btn} bg-[var(--wo-blue)] text-white`;
const secondary = `${btn} border border-[var(--wo-border)] hover:bg-[var(--wo-bg)]`;
const field = "w-full rounded-lg border border-[var(--wo-border)] bg-white px-3 py-2 text-sm focus:border-[var(--wo-blue)] focus:outline-none";

function LineMeter({ text, budget }: { text: string; budget: number }) {
  const n = countSyllables(text);
  // Same tolerance as the server (rules.ts validateIdea): two over is allowed.
  const over = n > budget + 2;
  const short = n < budget * 0.6;
  const tone = over ? "text-[var(--wo-red,#e5484d)]" : short ? "text-[var(--wo-muted)]" : "text-[var(--wo-green)]";
  const note = over ? "too long" : short ? "short — leaves a pause" : "fits";
  return (
    <span className={`whitespace-nowrap text-xs ${tone}`}>
      {n}/{budget} · {note}
    </span>
  );
}

/** One idea waiting for a decision: every field editable, then approve or reject. */
export function IdeaReview({ idea, template, closets }: { idea: EditableIdea; template?: TemplateOption; closets: ClosetOption[] }) {
  const router = useRouter();
  const [title, setTitle] = useState(idea.title);
  const [lines, setLines] = useState(idea.voiceover);
  const [captions, setCaptions] = useState(idea.captions);
  const [pick, setPick] = useState(idea.caption_pick);
  const [closet, setCloset] = useState(idea.closet);
  const [inputs, setInputs] = useState(idea.inputs);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const dirty =
    title !== idea.title ||
    closet !== idea.closet ||
    JSON.stringify(lines) !== JSON.stringify(idea.voiceover) ||
    JSON.stringify(captions) !== JSON.stringify(idea.captions) ||
    JSON.stringify(inputs) !== JSON.stringify(idea.inputs);
  const anyOver = template ? lines.some((l, i) => countSyllables(l) > (template.budgets[i] ?? 99) + 2) : false;

  async function save(): Promise<boolean> {
    if (!dirty) return true;
    const r = await call("/api/social/ideas", {
      action: "edit",
      id: idea.id,
      edit: { title, voiceover: lines, captions, caption_pick: pick, closet, inputs },
    });
    if (!r.ok) setMsg(String(r.data.error ?? "Couldn't save."));
    return r.ok;
  }

  async function act(kind: "save" | "approve" | "reject") {
    setBusy(kind);
    setMsg(null);
    if (kind !== "reject" && !(await save())) return setBusy(null);
    if (kind !== "save") {
      const r = await call("/api/social/ideas", { action: kind, id: idea.id, pick });
      if (!r.ok) {
        setMsg(String(r.data.error ?? "Failed."));
        return setBusy(null);
      }
    } else {
      setMsg("Saved.");
    }
    setBusy(null);
    router.refresh();
  }

  return (
    <div className="space-y-4 rounded-xl border border-[var(--wo-border)] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <input value={title} onChange={(e) => setTitle(e.target.value)} className={`${field} max-w-md font-medium`} aria-label="Title" />
        <span className="rounded-full bg-[var(--wo-bg)] px-2 py-0.5 text-xs text-[var(--wo-muted)]">{template?.label ?? idea.template}</span>
        {idea.status === "failed" ? (
          <span className="rounded-full bg-[var(--wo-bg)] px-2 py-0.5 text-xs text-[var(--wo-red,#e5484d)]">failed last time</span>
        ) : null}
      </div>
      {idea.error ? <p className="text-xs text-[var(--wo-red,#e5484d)]">Why it failed: {idea.error}</p> : null}
      {idea.rationale ? <p className="text-xs text-[var(--wo-muted)]">{idea.rationale}</p> : null}

      {template && (template.inputs.length > 0 || template.kind === "flow") ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {template.inputs.map((inp) => (
            <label key={inp.name} className="space-y-1 text-xs font-medium text-[var(--wo-muted)]">
              <span className="capitalize">{inp.name} typed into the app</span>
              <input
                value={inputs[inp.name] ?? ""}
                onChange={(e) => setInputs({ ...inputs, [inp.name]: e.target.value })}
                className={field}
              />
            </label>
          ))}
          {template.kind === "flow" ? (
            <label className="space-y-1 text-xs font-medium text-[var(--wo-muted)]">
              <span>Closet</span>
              <select value={closet} onChange={(e) => setCloset(e.target.value)} className={field}>
                {closets.map((c) => (
                  <option key={c.key} value={c.key} disabled={!c.available}>
                    {c.label}{c.available ? "" : " (not stocked)"}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-2">
        <div className="text-xs font-medium uppercase tracking-wide text-[var(--wo-muted)]">Narration, line by line</div>
        {lines.map((l, i) => (
          <div key={i} className="space-y-1">
            <div className="flex items-center justify-between gap-2 text-xs text-[var(--wo-muted)]">
              <span>Line {i + 1}{template?.was[i] ? ` · on screen: ${template.was[i]}` : ""}</span>
              {template ? <LineMeter text={l} budget={template.budgets[i] ?? 20} /> : null}
            </div>
            <textarea
              value={l}
              rows={2}
              onChange={(e) => setLines(lines.map((x, j) => (j === i ? e.target.value : x)))}
              className={field}
            />
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <div className="text-xs font-medium uppercase tracking-wide text-[var(--wo-muted)]">Caption (the selected one posts)</div>
        {captions.map((c, i) => (
          <label key={i} className="flex items-start gap-2">
            <input type="radio" name={`cap-${idea.id}`} checked={pick === i} onChange={() => setPick(i)} className="mt-3" />
            <textarea value={c} rows={2} onChange={(e) => setCaptions(captions.map((x, j) => (j === i ? e.target.value : x)))} className={field} />
          </label>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => act("approve")} disabled={!!busy || anyOver} className={primary}>
          {busy === "approve" ? "Approving…" : idea.status === "failed" ? "Try again" : "Approve & make it"}
        </button>
        {dirty ? (
          <button onClick={() => act("save")} disabled={!!busy || anyOver} className={secondary}>
            {busy === "save" ? "Saving…" : "Save edits"}
          </button>
        ) : null}
        <button onClick={() => act("reject")} disabled={!!busy} className={secondary}>
          Reject
        </button>
        {anyOver ? <span className="text-xs text-[var(--wo-red,#e5484d)]">Shorten the red lines first.</span> : null}
        {msg ? <span className="text-xs text-[var(--wo-muted)]">{msg}</span> : null}
      </div>
    </div>
  );
}

/** Ask for a specific video: type, input, closet, an optional angle. The AI writes the script. */
export function NewVideo({ templates, closets }: { templates: TemplateOption[]; closets: ClosetOption[] }) {
  const router = useRouter();
  const [key, setKey] = useState(templates.find((t) => t.kind === "flow")?.key ?? templates[0]?.key ?? "");
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [closet, setCloset] = useState("original");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const t = templates.find((x) => x.key === key);

  async function submit() {
    setBusy(true);
    setMsg(null);
    const r = await call("/api/social/ideas", { action: "request", request: { template: key, inputs, closet, note } });
    setBusy(false);
    if (!r.ok) return setMsg(String(r.data.error ?? "Couldn't write it."));
    setInputs({});
    setNote("");
    setMsg("Written — it's in Review below.");
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="space-y-1 text-xs font-medium text-[var(--wo-muted)]">
          <span>Video</span>
          <select value={key} onChange={(e) => { setKey(e.target.value); setInputs({}); }} className={field}>
            <optgroup label="New footage (filmed on the Mac)">
              {templates.filter((x) => x.kind === "flow").map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
            </optgroup>
            <optgroup label="New story over existing footage (fast)">
              {templates.filter((x) => x.kind === "recut").map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
            </optgroup>
          </select>
        </label>
        {t?.inputs.map((inp) => (
          <label key={inp.name} className="space-y-1 text-xs font-medium text-[var(--wo-muted)]">
            <span className="capitalize">{inp.name}</span>
            <input
              value={inputs[inp.name] ?? ""}
              placeholder={inp.name === "occasion" ? "e.g. rooftop birthday dinner" : inp.name === "city" ? "e.g. Denver, CO" : ""}
              onChange={(e) => setInputs({ ...inputs, [inp.name]: e.target.value })}
              className={field}
            />
          </label>
        ))}
        {t?.kind === "flow" ? (
          <label className="space-y-1 text-xs font-medium text-[var(--wo-muted)]">
            <span>Closet</span>
            <select value={closet} onChange={(e) => setCloset(e.target.value)} className={field}>
              {closets.map((c) => (
                <option key={c.key} value={c.key} disabled={!c.available}>
                  {c.label}{c.available ? "" : " (not stocked)"}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
      <label className="block space-y-1 text-xs font-medium text-[var(--wo-muted)]">
        <span>Angle (optional)</span>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. last-minute panic, funny" className={field} />
      </label>
      <div className="flex items-center gap-3">
        <button onClick={submit} disabled={busy || !key} className={primary}>
          {busy ? "Writing the script…" : "Write the script"}
        </button>
        {msg ? <span className="text-xs text-[var(--wo-muted)]">{msg}</span> : null}
      </div>
    </div>
  );
}

/** Take an approved idea back to review before the Mac picks it up. */
export function CancelButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <button
        onClick={async () => {
          setBusy(true);
          const r = await call("/api/social/ideas", { action: "cancel", id });
          setBusy(false);
          if (!r.ok) setMsg(String(r.data.error ?? "Failed."));
          else router.refresh();
        }}
        disabled={busy}
        className="text-xs text-[var(--wo-blue)] hover:underline disabled:opacity-50"
      >
        Back to review
      </button>
      {msg ? <span className="text-xs text-[var(--wo-muted)]">{msg}</span> : null}
    </span>
  );
}

/** Refresh the copy of the owner's closet, batch by batch, with progress. */
export function ClosetRefresh({ persona }: { persona: string }) {
  const router = useRouter();
  const [progress, setProgress] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    let offset: number | null = 0;
    let copied = 0;
    while (offset !== null) {
      const r = await call("/api/social/closets", { persona, offset });
      if (!r.ok) {
        setProgress(String(r.data.error ?? "Failed."));
        setBusy(false);
        return;
      }
      copied += Number(r.data.copied ?? 0);
      setProgress(`${Math.min(copied, Number(r.data.total ?? copied))}/${r.data.total} copied`);
      offset = (r.data.next as number | null) ?? null;
    }
    setProgress(`Up to date — ${copied} items`);
    setBusy(false);
    router.refresh();
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button onClick={run} disabled={busy} className={secondary}>
        {busy ? "Refreshing…" : "Refresh copy"}
      </button>
      {progress ? <span className="text-xs text-[var(--wo-muted)]">{progress}</span> : null}
    </span>
  );
}
