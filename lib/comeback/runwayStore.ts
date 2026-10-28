import { admin } from "@/lib/supabase";
import { generateJson } from "@/lib/contentEngine/gemini";
import {
  RUNWAY, PHASES, VOICE_RULES, CAPTION_RULES, HASHTAG_RULES,
  slotBrief, slotFromTemplate, validatePiece, templateKey,
  type Phase, type RawPiece, type Slot,
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

const PIECE_SCHEMA = {
  type: "OBJECT",
  properties: {
    pieces: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          slot: { type: "STRING" },
          title: { type: "STRING" },
          content: { type: "ARRAY", items: { type: "STRING" } },
          captions: { type: "ARRAY", items: { type: "STRING" } },
          hashtags: { type: "STRING" },
          rationale: { type: "STRING" },
        },
        required: ["slot", "title", "content", "captions", "hashtags", "rationale"],
      },
    },
  },
  required: ["pieces"],
};

const SYSTEM = `${VOICE_RULES}

You write Comeback Health's launch runway: a planned sequence of reels, carousels, story sets and waitlist emails, counted in days from launch (T-0). Each SLOT says what its piece must do and its exact shape. Write one piece per slot you are given, with "slot" set to its key.

Reels — the narration is synthesized and laid onto fixed beats, so these are hard limits:
- Exactly one line per beat, in order, each within its beat's syllable budget ("≤N syl") and using most of it (80–100%).
- One person telling one short story, first person: the problem (beat 1), what happened, the turn, the payoff. Each line leads into the next; never a list of features. Beat 1 is the hook and must work without the picture.
- "on screen" says what the footage shows during that beat; the line must fit it. Pieces Tyler films himself have no screens; write what he says to camera.
- Don't end on a call to action; the end card has its own spoken line.
- Prefer commas to full stops inside a line.

Carousels and story sets: concrete, skimmable, one idea per slide or frame. Emails: plain, warm, short paragraphs, signed "Tyler, Comeback Health". The runway should read as one arc: each phase builds on the one before it, and no two pieces open the same way.

Captions (not for emails, which get an empty list): exactly three options — [0] hook/curiosity, [1] plain and useful, [2] personal or POV.
${CAPTION_RULES}
${HASHTAG_RULES}
Emails get an empty hashtags string.
Title: a short internal name, 3–6 words.
Rationale: one sentence on what this piece does in the runway.`;

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
 * model call each), retrying a phase's misses once with the reasons. Slots
 * already drafted, approved or made are left alone; a rejected piece frees its
 * slot to be drafted again.
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
      const r = await generateJson<{ pieces: RawPiece[] }>(SYSTEM, phasePrompt(phase, todo, pieces) + reasons, PIECE_SCHEMA);
      const rows: Record<string, unknown>[] = [];
      const misses: string[] = [];
      for (const raw of r.pieces ?? []) {
        if (!todo.some((s) => s.key === raw.slot)) continue;
        const v = validatePiece(raw);
        if (typeof v === "string") misses.push(`${raw.slot}: ${v}`);
        else rows.push({ ...v, brand: BRAND, status: "proposed", source: "planner" });
      }
      if (rows.length) {
        const { data, error } = await db.from("social_ideas").insert(rows).select("*");
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
    const r = await generateJson<{ pieces: RawPiece[] }>(SYSTEM, prompt + (reason ? `\n\nYour last draft was rejected: ${reason}. Fix that.` : ""), PIECE_SCHEMA);
    const raw = r.pieces?.[0];
    if (!raw) { reason = "no piece returned"; continue; }
    raw.slot = slot.key;
    const v = validatePiece(raw);
    if (typeof v === "string") { reason = v; continue; }
    const { data: saved, error: upErr } = await db
      .from("social_ideas")
      .update({ title: v.title, voiceover: v.voiceover, captions: v.captions, caption_pick: 0, hashtags: v.hashtags, status: "proposed", error: null })
      .eq("id", id)
      .eq("brand", BRAND)
      .select("*")
      .single();
    if (upErr) throw upErr;
    return saved as PieceRow;
  }
  throw new Error(`The rewrite didn't fit the slot (${reason}). Try a different note.`);
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
