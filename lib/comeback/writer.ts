import { generateJson } from "../contentEngine/llm";
import { spokenRules, runScriptRoom, type RoomResult } from "../contentEngine/scriptRoom";
import { META, meanScore, type Candidate, type ScriptCase } from "../contentEngine/scriptRules";
import { PLAYBOOKS, draftHooks, hooksLine } from "../contentEngine/strategy";
import {
  VOICE_RULES, CAPTION_RULES, HASHTAG_RULES, validatePiece, getSlot, ctaFor,
  type PieceFields, type RawPiece,
} from "./runway";

// Comeback's writer: the prompt, and the pipeline from a brief to pieces that
// passed the script room and the claims guard. No database and no "@/"
// imports, so the runway store (runwayStore.ts) and the offline eval
// (scripts/script-eval.ts) share it.

export const PIECE_SCHEMA = {
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
          scripts: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: { hook: { type: "STRING" }, direction: { type: "STRING" }, voiceover: { type: "ARRAY", items: { type: "STRING" } } },
              required: ["hook", "direction", "voiceover"],
            },
          },
          captions: { type: "ARRAY", items: { type: "STRING" } },
          hashtags: { type: "STRING" },
          rationale: { type: "STRING" },
        },
        required: ["slot", "title", "content", "scripts", "captions", "hashtags", "rationale"],
      },
    },
  },
  required: ["pieces"],
};

export const SYSTEM = `${VOICE_RULES}

You write Comeback Health's launch runway: a planned sequence of reels, carousels, story sets and waitlist emails, counted in days from launch (T-0). Each SLOT says what its piece must do and its exact shape. Write one piece per slot you are given, with "slot" set to its key.

Reels — a voice over footage (the app's screens, or Tyler to camera).
${spokenRules("comeback")}
For every reel, leave "content" empty and write 3 complete scripts in "scripts". They are three different scripts, each opening with the archetype it is assigned under OPENINGS (or in its SLOT), each with its own way into the story; an editor reads them aloud and keeps one. "hook" is the archetype key, "direction" is the note for the voice, "voiceover" the lines, one per beat. Pieces Tyler films himself are what he says to camera, in his own first person, using only what the slot's job says about him.
Everything that is not a reel gets an empty "scripts" list and its text in "content".

Carousels and story sets: concrete, skimmable, one idea per slide or frame. Emails: plain, warm, short paragraphs, signed "Tyler, Comeback Health". The runway should read as one arc: each phase builds on the one before it, and no two pieces open the same way.

Captions (not for emails, which get an empty list): exactly three options — [0] hook/curiosity, [1] plain and useful, [2] personal or POV.
${CAPTION_RULES}
${HASHTAG_RULES}
Emails get an empty hashtags string.
Title: a short internal name, 3–6 words.
Rationale: one sentence on what this piece does in the runway.`;

export type WriterPiece = RawPiece & { scripts?: Candidate[] };

/**
 * From what the writer returned to rows that can be stored. Reels go through
 * the script room first (contentEngine/scriptRoom.ts): the critic reads the
 * candidates against each beat's screen and keeps, tightens or fails them.
 * Then every piece is held to its slot's shape and the claims guard.
 */
export async function settle(raws: WriterPiece[], wanted: (slot: string) => boolean): Promise<{ rows: PieceFields[]; misses: string[]; cases: ScriptCase[]; room: RoomResult | null }> {
  const rows: PieceFields[] = [];
  const misses: string[] = [];
  const pieces = raws.filter((r) => wanted(r.slot));
  const cases: ScriptCase[] = [];
  for (const raw of pieces) {
    const slot = getSlot(raw.slot);
    if (slot?.format !== "reel") continue;
    const candidates = (raw.scripts?.length ? raw.scripts : raw.content?.length ? [{ voiceover: raw.content }] : []).filter((c) => Array.isArray(c.voiceover));
    cases.push({
      id: raw.slot, brand: "comeback", about: slot.brief,
      beats: (slot.beats ?? []).map((seconds, i) => ({ seconds, shows: slot.screens?.[i] ?? "Tyler talking to camera" })),
      cta: ctaFor(slot.phase), candidates,
    });
  }
  const room = cases.length ? await runScriptRoom(cases, VOICE_RULES) : null;
  for (const raw of pieces) {
    const slot = getSlot(raw.slot);
    let piece: RawPiece = raw;
    let extra: Record<string, string> = {};
    if (slot?.format === "reel") {
      const pick = room?.chosen.get(raw.slot);
      if (!pick) { misses.push(`${raw.slot}: ${room?.dropped.get(raw.slot) ?? "no script passed"}`); continue; }
      piece = { ...raw, content: pick.voiceover, direction: pick.direction };
      if (pick.hook) extra[META.hook] = pick.hook.split(/[\s(]/)[0];
      if (pick.scores) extra[META.score] = meanScore(pick.scores).toFixed(1);
      if (!room?.reviewed) piece.rationale = `${raw.rationale ?? ""} (Not checked by the script editor: it was unavailable.)`;
    }
    const v = validatePiece(piece);
    if (typeof v === "string") misses.push(`${raw.slot}: ${v}`);
    else rows.push({ ...v, inputs: { ...v.inputs, ...extra } });
    extra = {};
  }
  return { rows, misses, cases, room };
}


/** The three openings each reel slot's drafts must use (runway slots carry none of their own). */
export function openingsFor(slotKeys: string[]): string {
  const reels = slotKeys.filter((k) => getSlot(k)?.format === "reel");
  if (!reels.length) return "";
  return `\n\nOPENINGS (reels):\n${reels.map((k) => `- ${k}: ${hooksLine(draftHooks(PLAYBOOKS.comeback, k))}`).join("\n")}`;
}

/** One writer call for Comeback, thinking hard: scripts are the product. */
export function writePieces(prompt: string): Promise<{ pieces: WriterPiece[] }> {
  return generateJson<{ pieces: WriterPiece[] }>(SYSTEM, prompt, PIECE_SCHEMA, { thinking: "high" });
}
