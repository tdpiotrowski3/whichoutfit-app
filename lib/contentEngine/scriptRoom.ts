import { generateJson } from "./llm";
import { lineCeiling } from "./templates";
import { candidateProblem, chooseScript, type BeatCue, type Brand, type Chosen, type Review, type ScriptCase } from "./scriptRules";

// The script room: every narration the engine writes goes through here before
// anyone sees it. The writer (planner.ts for WhichOutfit, comeback/runwayStore.ts
// for Comeback) offers several candidate scripts per clip; a SEPARATE critic
// call, with its own instructions and no stake in the drafts, reads them for
// the ear, checks each line against what is on screen in its beat, and either
// keeps the best, tightens it, or fails the lot. A script that fails never
// reaches the Studio. scriptRules.ts holds the pure half (lint, pass mark, pick).

/**
 * How to write for the ear, shared by both brands' writers. This replaces the
 * old "fill 80–100% of the syllable budget" rule, which is what made the
 * narration sound padded.
 */
export const SPOKEN_RULES = `HOW THE NARRATION WORKS NOW — read this before writing a word.
The narrator records the whole script as ONE take, like a voice memo, and the edit is cut to the voice: footage is held, trimmed or sped up to follow what is said. So you are not filling time. Nothing needs padding. A line can be three words.
- One line per beat, in order; the line count must equal the beat count. Line N starts as beat N's picture appears, so the thing on screen in that beat ("on screen:") belongs in the FIRST few words of its line, not the end.
- Say each thing the way a person says it out loud, as short as it naturally is. "≤N syl" on a beat is a ceiling the footage can't stretch past, never a target; most lines should come in around half of it.
- Write for the ear. Contractions always (it's, I've, didn't, that's). Fragments are fine. Let lines start with "So", "And", "But", "Okay" the way speech does. One thought per line. If you would not say a sentence to a friend across a table, it is wrong, however good it looks written down.
- No padding ("go ahead and", "simply", "absolutely", "literally", "every single", "the entire", "that is it"), no written-English joins (however, therefore, not only, as well as, allows you to), no list of features, no adjectives doing a noun's job.
- The first line is the hook and its first second and a half decide whether anyone stays: open inside a specific moment the viewer has lived (a time, a place, a thing in their hand), not a general truth. It plays before the picture means anything, so it can't depend on the screen.
- Use at least one exact detail the footage actually shows (the number, the colour, the city, the item). Specific beats clever.
- The last line lands the payoff that is on screen. Never end on an ask: a spoken end card follows in the same take.
- Punctuation is breath: a comma is a short one, a full stop a real one. No exclamation marks, semicolons, dashes, brackets or emojis.
- It is ONE person telling ONE small story: the moment, what they did, the turn, what they got. Each line leads to the next.

DIRECTION: with each script, one sentence telling a voice actor how to say it: who is talking, to whom, the mood, the pace. e.g. "Telling a friend over coffee about a trip she almost overpacked for, a little amused at herself, easy pace." Describe a person and a moment; never name words to stress, and never ask for slow, dramatic or excited.`;

export function cueBrief(beats: BeatCue[]): string {
  return beats.map((b, i) => `  beat ${i + 1} (${b.seconds.toFixed(1)}s on screen, ≤${lineCeiling(b.seconds)} syl) on screen: ${b.shows}`).join("\n");
}

const REVIEW_SCHEMA = {
  type: "OBJECT",
  properties: {
    reviews: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          id: { type: "STRING" },
          pick: { type: "INTEGER" },
          final: { type: "ARRAY", items: { type: "STRING" } },
          spoken: { type: "INTEGER" },
          hook: { type: "INTEGER" },
          sync: { type: "INTEGER" },
          specific: { type: "INTEGER" },
          payoff: { type: "INTEGER" },
          brand: { type: "INTEGER" },
          notes: { type: "STRING" },
        },
        required: ["id", "pick", "final", "spoken", "hook", "sync", "specific", "payoff", "brand", "notes"],
      },
    },
  },
  required: ["reviews"],
};

const CRITIC_SYSTEM = `You are the script editor for short vertical videos (15–30s) with a spoken voiceover over screen footage of an app. You did not write these scripts and you are hard to please. Your one question: would a real person say this, out loud, to a friend, and would a stranger keep watching?

For each CLIP you get what is on screen in each beat, the spoken end-card line that follows the script, and several CANDIDATE scripts (one line per beat). Read every candidate aloud in your head at talking speed.

Score the script you end up recommending, 1–5 each. Be honest; 3 means "fine, forgettable", 4 means "good", 5 means "I would believe someone said this unprompted". Most first drafts are a 3.
- spoken: sounds like speech. Contractions, natural rhythm, lines of different lengths, nothing padded to fill time, no sentence that only exists in writing, no announcer or advert cadence, not a list of features.
- hook: the first second and a half. A specific, lived moment that makes someone stay, and that works before the picture means anything. A general statement ("Getting dressed is hard") is a 2.
- sync: line N is about what is on screen in beat N, and names it early in the line, since each line starts as its picture appears. A line that describes a different beat's picture is a 2 however good it sounds.
- specific: at least one exact detail the footage really shows (a number, a colour, a place, an item), and nothing claimed that the screen doesn't show.
- payoff: the last line lands what the viewer was promised, and does not ask for anything (the end card does that).
- brand: follows every BRAND RULE below. Any breach is a 1.

Then choose:
- "pick": the index (0-based) of the best candidate.
- "final": the lines to record. Either the picked candidate word for word, or your edit of it when a cut or a swap makes it clearly better to say: cut padding, fix a line that doesn't match its beat, sharpen the hook. Edits only ever make it shorter or plainer. Keep exactly one line per beat, keep the facts, keep it one person's story, and never add an ask at the end.
- Scores are for "final". If even your edit is not something you'd put your name to, score it honestly low; a weak script is thrown away, and that is the right outcome.
- "notes": one sentence: what was wrong with the others or what you changed.`;

/**
 * One critic call for a batch of clips. Candidates that already break a hard
 * rule (shape, fit, lint) are not shown. Returns reviews by case id; throws
 * only if the model call itself fails.
 */
export async function critique(cases: ScriptCase[], brandRules: string): Promise<Map<string, Review>> {
  const shown = cases
    .map((sc) => ({ sc, cands: sc.candidates.map((c, i) => ({ c, i })).filter(({ c }) => !candidateProblem(c, sc)) }))
    .filter((x) => x.cands.length);
  const out = new Map<string, Review>();
  if (!shown.length) return out;
  const prompt = shown
    .map(
      ({ sc, cands }) =>
        `CLIP ${sc.id} — ${sc.about}\n${cueBrief(sc.beats)}\n  end card (spoken right after, same take): "${sc.cta}"\n` +
        cands.map(({ c, i }) => `CANDIDATE ${i}${c.hook ? ` [hook: ${c.hook}]` : ""}\n${c.voiceover.map((l, n) => `  ${n + 1}. ${l.trim()}`).join("\n")}`).join("\n")
    )
    .join("\n\n");
  const r = await generateJson<{ reviews: (Omit<Review, "scores"> & Review["scores"])[] }>(
    `${CRITIC_SYSTEM}\n\nBRAND RULES:\n${brandRules}`,
    `Review ${shown.length} clip${shown.length === 1 ? "" : "s"}. Return one review per clip, with "id" set to the clip's id.\n\n${prompt}`,
    REVIEW_SCHEMA
  );
  for (const v of r.reviews ?? []) {
    const { id, pick, final, notes, ...scores } = v;
    out.set(String(id).trim(), { id: String(id).trim(), pick: Number(pick), final: final ?? [], notes: notes ?? "", scores });
  }
  return out;
}

export type RoomResult = { chosen: Map<string, Chosen>; dropped: Map<string, string>; reviewed: boolean };

/**
 * Candidates in, the scripts that ship out. Never throws: if the critic can't
 * be reached, clean candidates go through marked as unreviewed (chooseScript).
 */
export async function runScriptRoom(cases: ScriptCase[], brandRules: string): Promise<RoomResult> {
  let reviews: Map<string, Review> | null = null;
  try {
    reviews = await critique(cases, brandRules);
  } catch (e) {
    console.warn(`content engine: critic unavailable — ${e instanceof Error ? e.message : String(e)}`);
  }
  const chosen = new Map<string, Chosen>();
  const dropped = new Map<string, string>();
  for (const sc of cases) {
    const review = reviews?.get(sc.id);
    // The critic answered but skipped this clip: treat as failed, not as unreviewed.
    if (reviews && !review && sc.candidates.some((c) => !candidateProblem(c, sc))) {
      dropped.set(sc.id, "critic returned no review");
      continue;
    }
    const c = chooseScript(sc, review);
    if (typeof c === "string") dropped.set(sc.id, c);
    else chosen.set(sc.id, c);
  }
  return { chosen, dropped, reviewed: reviews !== null };
}

export type { Brand, ScriptCase, Chosen };
