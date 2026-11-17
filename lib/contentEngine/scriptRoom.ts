import { generateJson } from "./llm";
import { lineCeiling } from "./templates";
import { calibrationFor, goldFor } from "./goldScripts";
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
 * narration sound padded. Written for Gemini, which is what production runs:
 * it follows a numbered list of things TO do far better than a list of things
 * to avoid, and it imitates examples above all, so the rules are stated as
 * actions and the examples (goldScripts.ts) do most of the teaching.
 */
const SPOKEN_HOW = `HOW THIS IS MADE. The narrator records the whole script in ONE take, like a voice memo to a friend, and the video is then cut to fit the voice. You are never filling time. Short is right.

WRITE EVERY SCRIPT LIKE THIS:
1. One line per beat, in order: the line count equals the beat count. Line N begins the moment beat N's picture appears, so put what that picture shows in the first few words of its line.
2. Each line is one breath, usually three to nine words. "≤N syl" on a beat is the most the footage can stretch to; a good line uses about half of it.
3. Vary the lengths on purpose. Every script has at least one line of four words or fewer, and neighbouring lines are different sizes.
4. Talk. Contractions every time (it's, I've, that's, didn't). Fragments are welcome. Lines may start with So, And, But or Okay, as speech does.
5. Name things. Put a noun where an adjective wants to go: the number, the colour, the item, the city that the screen shows. Use at least one exact detail from "on screen".
6. Line 1 is the hook: one specific minute of one person's life (a time, a place, something in their hand), understood with the screen off.
7. Say what you did in the fewest words ("So I asked."). The screen already shows the taps.
8. The last line is the result on screen, said flat. A spoken end card follows it in the same take, so the script itself asks for nothing.
9. Punctuation is breath: a comma is a small one, a full stop a real one. Use only . , ? and '.
10. It is one person telling one small story: the moment, what they did, the turn, what they got.

DIRECTION: with each script, one sentence for the voice actor: who is talking, to whom, where, and the mood. Describe a person in a moment ("Packing the night before a trip, talking to whoever's sitting on the bed, dry, unbothered."), at an easy conversational pace.

LAST STEP, EVERY TIME: say each script out loud in your head. Any line that sounds like an advert, a manual or a list, say again the way you would text it to a friend, and keep that version.`;

/** The writer's craft block for a brand: how to write, then that brand's gold scripts and common fixes. */
export function spokenRules(brand: Brand): string {
  return `${SPOKEN_HOW}\n\n${goldFor(brand)}`;
}

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
          weakest: { type: "STRING" },
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
        required: ["id", "weakest", "pick", "final", "spoken", "hook", "sync", "specific", "payoff", "brand", "notes"],
      },
    },
  },
  required: ["reviews"],
};

const CRITIC_SYSTEM = `You are the script editor for short vertical videos (15–30s): one person's voice over screen footage of an app. You did not write these scripts, you are hard to please, and your name goes on whatever you pass. One question decides everything: would a real person say this out loud to a friend, and would a stranger keep watching?

For each CLIP you get what is on screen in each beat, the spoken end-card line that follows the script, and several CANDIDATE scripts (one line per beat).

Work in this order for every clip:
1. Read each candidate aloud in your head at talking speed.
2. "weakest": quote the single worst line among the candidates and say in a few words what is wrong with it. Do this before you score anything.
3. "pick": the index of the best candidate.
4. "final": the lines to record. Start from the picked candidate and make it better to SAY: cut every word that only fills time, swap an adjective for the thing itself, move what's on screen to the front of its line, make one line tiny if they are all the same size, sharpen line 1 into a specific moment. Edits only ever make it shorter or plainer. Keep exactly one line per beat, keep the facts on screen, keep it one person's story, and end on the result with no ask. If the candidate is already right, return it word for word.
5. Score "final", 1–5 each. Use the whole scale: 3 is "fine, forgettable" and is where most drafts land; 4 is good; 5 is "I'd believe someone said this unprompted".
   - spoken: sounds like speech. Contractions, lines of different lengths, nothing padded, no sentence that only exists in writing, no announcer or advert cadence ("Now you can…", stacked adjectives), not a list of features.
   - hook: line 1 is a specific lived moment that works with the screen off. A general statement ("Getting dressed is hard") or a question anyone could ask is a 2.
   - sync: line N is about what is on screen in beat N and names it early in the line. A line describing a different beat's picture is a 2 however good it sounds.
   - specific: at least one exact detail the footage really shows, and nothing claimed that the screen doesn't show.
   - payoff: the last line lands the result and asks for nothing.
   - brand: follows every BRAND RULE below. Any breach is a 1.
6. "notes": one sentence on what you changed or why the others lost.

A script you would not put your name to gets honest low scores. It is thrown away and rewritten, which is the right outcome; passing a weak script is the only real mistake you can make here.`;

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
  const r = await generateJson<{ reviews: (Omit<Review, "scores"> & Review["scores"] & { weakest?: string })[] }>(
    `${CRITIC_SYSTEM}\n\n${calibrationFor([...new Set(shown.map((x) => x.sc.brand))])}\n\nBRAND RULES:\n${brandRules}`,
    `Review ${shown.length} clip${shown.length === 1 ? "" : "s"}. Return one review per clip, with "id" set to the clip's id.\n\n${prompt}`,
    REVIEW_SCHEMA,
    { thinking: "high" }
  );
  for (const v of r.reviews ?? []) {
    const { id, pick, final, notes, weakest, ...scores } = v;
    out.set(String(id).trim(), { id: String(id).trim(), pick: Number(pick), final: final ?? [], notes: [notes, weakest && `Weakest line: ${weakest}`].filter(Boolean).join(" "), scores });
  }
  return out;
}

export type RoomResult = { chosen: Map<string, Chosen>; dropped: Map<string, string>; reviewed: boolean; reviews: Map<string, Review> };

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
  return { chosen, dropped, reviewed: reviews !== null, reviews: reviews ?? new Map() };
}

export type { Brand, ScriptCase, Chosen };
