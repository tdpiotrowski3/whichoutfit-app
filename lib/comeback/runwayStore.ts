import { admin } from "@/lib/supabase";
import { META } from "@/lib/contentEngine/scriptRules";
import { settle, writePieces, openingsFor } from "./writer";
import { PLAYBOOKS, markDrafted, openSlots, slotBriefFor, type Plan } from "@/lib/contentEngine/strategy";
import { refreshPlan, savePlan } from "@/lib/contentEngine/strategyStore";
import {
  RUNWAY, PHASES,
  slotBrief, slotFromTemplate, templateKey, getSlot, seriesSlotKey,
  type Phase, type Slot,
} from "./runway";

// The I/O around runway.ts: Comeback's launch pieces live in social_ideas with
// brand = 'comeback' (FitCheck/supabase/social_brands.sql), and its launch
// date in studio_settings under 'comeback:launch_date'. Every query here is
// pinned to the brand; every WhichOutfit query is pinned the other way.

export const BRAND = "comeback";
const LAUNCH_KEY = "comeback:launch_date";

export type PieceRow = {
  id: string;
  created_at: string;
  updated_at?: string | null;
  status: "proposed" | "approved" | "rejected" | "rendering" | "rendered" | "failed";
  template: string;
  inputs: Record<string, string>;
  title: string;
  voiceover: string[];
  captions: string[];
  caption_pick: number;
  hashtags: string | null;
  rationale: string | null;
  source: string | null;
  clip_id: string | null;
  error: string | null;
};

/** Null when the brand column doesn't exist yet (social_brands.sql not applied). */
export async function getPieces(): Promise<PieceRow[] | null> {
  const { data, error } = await admin()
    .from("social_ideas")
    .select("id,created_at,updated_at,status,template,inputs,title,voiceover,captions,caption_pick,hashtags,rationale,source,clip_id,error")
    .eq("brand", BRAND)
    .neq("status", "rejected")
    .order("created_at", { ascending: false });
  if (error) return null;
  return (data ?? []) as PieceRow[];
}

/** YYYY-MM-DD, or null while the date is still to be decided. */
export async function getLaunchDate(): Promise<string | null> {
  const { data } = await admin().from("studio_settings").select("value").eq("key", LAUNCH_KEY).maybeSingle();
  const v = data?.value;
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

export async function setLaunchDate(date: string | null): Promise<void> {
  if (date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Pick a date.");
  const { error } = await admin().from("studio_settings").upsert({ key: LAUNCH_KEY, value: date, updated_at: new Date().toISOString() });
  if (error) throw error;
}

// --- drafting --------------------------------------------------------------

function phasePrompt(phase: Phase, slots: Slot[], written: PieceRow[]): string {
  const p = PHASES.find((x) => x.key === phase)!;
  const arc = PHASES.map((x) => `- ${x.label}: ${x.goal}`).join("\n");
  const done = written.length
    ? written.map((w) => `- ${slotFromTemplate(w.template)?.key ?? w.template}: "${w.title}" — ${w.voiceover[0] ?? ""}`).join("\n")
    : "- none yet";
  return `THE RUNWAY ARC:
${arc}

Now writing: ${p.label} (${p.goal})

ALREADY WRITTEN — build on these, don't repeat their angle or opening:
${done}

SLOTS TO WRITE:
${slots.map(slotBrief).join("\n\n")}`;
}

export type DraftResult = { drafted: number; dropped: string[]; remaining: number };

/**
 * Fill every runway slot that has no live piece yet, a phase at a time (one
 * writer call and one critic call each), retrying a phase's misses once with
 * the reasons. Slots already drafted, approved or made are left alone; a
 * rejected piece frees its slot to be drafted again.
 */
export async function draftRunway(only?: Phase): Promise<DraftResult> {
  const db = admin();
  const pieces = (await getPieces()) ?? [];
  const filled = new Set(pieces.map((p) => p.template));
  const dropped: string[] = [];
  let drafted = 0;

  for (const phase of PHASES.map((p) => p.key)) {
    if (only && phase !== only) continue;
    let todo = RUNWAY.filter((s) => s.phase === phase && !filled.has(templateKey(s)));
    let reasons = "";
    for (let attempt = 0; attempt < 2 && todo.length; attempt++) {
      const r = await writePieces(phasePrompt(phase, todo, pieces) + openingsFor(todo.map((x) => x.key)) + reasons);
      const { rows, misses } = await settle(r.pieces ?? [], (k) => todo.some((s) => s.key === k));
      if (rows.length) {
        const { data, error } = await db.from("social_ideas").insert(rows.map((v) => ({ ...v, brand: BRAND, status: "proposed", source: "planner" }))).select("*");
        if (error) throw error;
        for (const row of (data ?? []) as PieceRow[]) {
          pieces.push(row);
          filled.add(row.template);
        }
        drafted += rows.length;
      }
      todo = todo.filter((s) => !filled.has(templateKey(s)));
      if (attempt === 1) dropped.push(...misses);
      reasons = misses.length ? `\n\nYour last drafts were rejected: ${misses.join("; ")}. Fix those.` : "";
    }
  }
  const remaining = RUNWAY.filter((s) => !filled.has(templateKey(s))).length;
  return { drafted, dropped, remaining };
}

/**
 * The always-on series, after (or alongside) the launch runway: write this
 * week's slots from Comeback's rolling plan as reels, each tagged with the
 * pillar, series and hook it tests. Pieces land as "proposed" for the owner;
 * nothing here posts or renders. Run from /comeback/runway on request.
 */
export async function draftSeriesWeek(now = new Date()): Promise<DraftResult & { plan: Plan }> {
  const db = admin();
  let plan = await refreshPlan(BRAND, now);
  const b = PLAYBOOKS.comeback;
  const pieces = (await getPieces()) ?? [];
  const live = new Set(pieces.map((p) => p.template));
  const slots = openSlots(plan, b.slotsPerWeek).filter((s) => !live.has(`cb:${seriesSlotKey(s.series, s.episode)}`));
  if (!slots.length) return { drafted: 0, dropped: [], remaining: 0, plan };
  const keyOf = new Map(slots.map((s) => [seriesSlotKey(s.series, s.episode), s]));
  const prompt = `Now writing: this week's episodes of Comeback's always-on series. The launch runway is separate; these are the repeatable formats people follow week to week. Each SLOT says which series and episode it is, what it is for, and the opening each of its three scripts uses. Set "slot" to the key given.

ALREADY WRITTEN — don't repeat an opening:
${pieces.slice(0, 20).map((w) => `- "${w.title}" — ${w.voiceover[0] ?? ""}`).join("\n") || "- none yet"}

SLOTS TO WRITE:
${[...keyOf.entries()].map(([k, s]) => `${slotBrief(getSlot(k)!)}\n${slotBriefFor(b, s).split("\n").slice(1).join("\n")}`).join("\n\n")}`;
  const r = await writePieces(prompt);
  const { rows, misses } = await settle(r.pieces ?? [], (k) => keyOf.has(k));
  let drafted = 0;
  if (rows.length) {
    const tagged = rows.map((v) => {
      const s = keyOf.get(v.template.slice(3))!;
      return { ...v, inputs: { ...v.inputs, [META.pillar]: s.pillar, [META.series]: s.series, [META.episode]: s.episode, [META.slot]: s.id, [META.hook]: v.inputs[META.hook] ?? s.hook }, brand: BRAND, status: "proposed", source: "planner" };
    });
    const { data, error } = await db.from("social_ideas").insert(tagged).select("id,inputs");
    if (error) throw error;
    for (const row of (data ?? []) as { id: string; inputs: Record<string, string> }[]) plan = markDrafted(plan, row.inputs[META.slot], row.id);
    await savePlan(plan).catch(() => undefined);
    drafted = rows.length;
  }
  return { drafted, dropped: misses, remaining: slots.length - drafted, plan };
}

/** Redo one piece from a note ("open on the injury", "shorter"), same slot. */
export async function rewritePiece(id: string, note: string): Promise<PieceRow> {
  const db = admin();
  const { data, error } = await db.from("social_ideas").select("*").eq("id", id).eq("brand", BRAND).single();
  if (error) throw error;
  const piece = data as PieceRow;
  if (!["proposed", "approved", "failed"].includes(piece.status)) throw new Error("That piece is being made or is done; it can't be rewritten now.");
  const slot = slotFromTemplate(piece.template);
  if (!slot) throw new Error("Unknown runway slot.");
  const prompt = `Rewrite this runway piece. Same slot, new wording.
Owner's note: "${note.trim().slice(0, 400) || "make it better"}"
Current version:
${piece.voiceover.map((l, i) => `${i + 1}. ${l}`).join("\n")}

SLOT:
${slotBrief(slot)}`;
  let reason = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await writePieces(prompt + openingsFor([slot.key]) + (reason ? `\n\nYour last draft was rejected: ${reason}. Fix that.` : ""));
    const raw = r.pieces?.[0];
    if (!raw) { reason = "no piece returned"; continue; }
    raw.slot = slot.key;
    const { rows, misses } = await settle([raw], () => true);
    const v = rows[0];
    if (!v) { reason = misses[0] ?? "no piece passed"; continue; }
    const { data: saved, error: upErr } = await db
      .from("social_ideas")
      // The new script brings its own direction and hook; what the piece was testing stays.
      .update({ title: v.title, voiceover: v.voiceover, captions: v.captions, caption_pick: 0, hashtags: v.hashtags, inputs: { ...piece.inputs, ...v.inputs }, status: "proposed", error: null })
      .eq("id", id)
      .eq("brand", BRAND)
      .select("*")
      .single();
    if (upErr) throw upErr;
    return saved as PieceRow;
  }
  throw new Error(`The rewrite wasn't good enough to use (${reason}). Try a different note.`);
}

/** Approve (optionally choosing a caption), reject, or send back to review. */
export async function decidePiece(id: string, action: "approve" | "reject" | "reopen", pick?: number): Promise<void> {
  const fields: Record<string, unknown> =
    action === "approve" ? { status: "approved", error: null } : action === "reject" ? { status: "rejected" } : { status: "proposed" };
  if (action === "approve" && Number.isInteger(pick)) fields.caption_pick = Math.max(0, Math.min(2, pick!));
  const { data, error } = await admin()
    .from("social_ideas")
    .update(fields)
    .eq("id", id)
    .eq("brand", BRAND)
    .in("status", ["proposed", "approved", "failed"])
    .select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("That piece is already being made or is done.");
}
