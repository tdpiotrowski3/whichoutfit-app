import { scriptFit } from "./templates";

// The pure half of the script room (scriptRoom.ts does the model calls): the
// "does this sound like a person" lint, the critic's pass mark, and the pick.
// No database, no network — unit-tested in lib/__tests__/engineBrain.test.ts.
//
// The engine used to write to a clock: one line per beat, padded to 80–100% of
// a syllable budget, which is where lines like "That's it, that's literally
// all I gave it to work with" came from. Now the voice leads (templates.ts,
// the voice-first contract), so the job here is the opposite: catch anything a
// person would not say out loud.

export type Brand = "whichoutfit" | "comeback";

/** What is on screen during one beat, and how long that picture lasts. */
export type BeatCue = { seconds: number; shows: string };

/** One script the writer offered, with how to say it. */
export type Candidate = { voiceover: string[]; direction?: string; hook?: string };

/** A clip's worth of candidates for the critic: the picture, beat by beat, and the scripts to judge. */
export type ScriptCase = {
  id: string;
  brand: Brand;
  /** One line for the critic on what the clip is and who it is for. */
  about: string;
  beats: BeatCue[];
  /** The spoken end-card line that follows the script in the same take. */
  cta: string;
  candidates: Candidate[];
};

// --- lint ---------------------------------------------------------------------

/** Words that read as an ad or as a model wrote it. Both brands. */
const HYPE = /\b(game[- ]?changer|obsessed|insane(ly)?|elevate[sd]?|effortless(ly)?|seamless(ly)?|unlock(s|ed)?|revolutioni[sz]e[sd]?|level[- ]up|say goodbye to|crush(ing)? it|beast mode|next[- ]level|must[- ]have|life[- ]?changing|magic(al)?|stunning|curated|journey|delve|whether you're)\b/i;

/** Padding: words that exist to fill a beat, the fingerprint of the old syllable budget. */
const PADDING = /\b(go ahead and|simply|absolutely|literally|each and every|every single|the entire|whole entire|in order to|whatsoever|as a matter of fact|at the end of the day|that is the only thing|these days I just)\b/i;

/** Written English: fine on a page, wrong in a mouth. */
const WRITTEN = /\b(however|therefore|moreover|furthermore|additionally|in addition|utili[sz]e[sd]?|allows you to|enables you to|not only|as well as|thus|hence|upon|regarding|ensure[sd]?|features include|which means that)\b/i;

/** Forms a person contracts when talking. Sentence-final "it is." is left alone. */
const UNCONTRACTED = /\b(that is|it is|I am|I have got|you are|we are|they are|do not|does not|did not|can ?not|is not|are not|was not|will not|would not|could not|should not|I will|you will|it will|I would|let us)\b(?=\s+[a-z])/i;

/** The end card has its own spoken line; a script that also asks is two asks. */
const ASK = /\b(download|link in (my |the )?bio|app store|google play|sign up|join the waitlist|try it (free|today|now)|get the app)\b/i;

const WO_RULES: [RegExp, string][] = [
  // Tyler, 2026-11-16: the closet is the point; closet-optional is a day-one fallback.
  [/\bno closet (needed|required|necessary)\b|\bwithout (a|your|any) closet\b|\b(don'?t|do not|never) (even )?(need|have) to (upload|add|scan|photograph)\b|\bskip (the|your) closet\b|\bno (upload|uploading) (needed|required)\b/i, "sells skipping the closet (never \"no closet needed\")"],
  [/\$\s?\d|\bpremium\b|\bsubscri(be|ption)\b|\bper month\b|\bfree trial\b/i, "mentions price or Premium"],
  [/\b(update|version \d|v\d\.\d|2\.2)\b/i, "says \"update\" or a version number"],
];

// Comeback's health-claims guard lives in lib/comeback/runway.ts (claimProblem)
// and is applied by validatePiece; these are the spoken-word extras.
const CB_RULES: [RegExp, string][] = [
  [/\b(oura|whoop|garmin|fitbit|polar|coros|strava|myfitnesspal|cronometer|peloton|galaxy watch|pixel watch)\b/i, "names a device or app brand"],
];

/**
 * Everything about a script a person would not say, or the brand never says.
 * Empty means clean. These are hard stops: a candidate with any of them is
 * never shown to the critic, let alone the owner.
 */
export function lintSpoken(lines: string[], brand: Brand): string[] {
  const out: string[] = [];
  const say = (i: number, why: string, m?: RegExpMatchArray | null) => out.push(`line ${i + 1} ${why}${m ? ` ("${m[0]}")` : ""}`);
  lines.forEach((l, i) => {
    let m: RegExpMatchArray | null;
    if ((m = l.match(HYPE))) say(i, "uses an ad word", m);
    if ((m = l.match(PADDING))) say(i, "is padded", m);
    if ((m = l.match(WRITTEN))) say(i, "reads as written English", m);
    if ((m = l.match(UNCONTRACTED))) say(i, "isn't contracted the way people talk", m);
    if (/[!;()—–]|\p{Extended_Pictographic}/u.test(l)) say(i, "has punctuation nobody can say (! ; — or an emoji)");
    for (const [re, why] of brand === "whichoutfit" ? WO_RULES : CB_RULES) if ((m = l.match(re))) say(i, why, m);
  });
  const last = lines[lines.length - 1] ?? "";
  const ask = last.match(ASK);
  if (ask) say(lines.length - 1, "ends on a call to action (the end card has its own)", ask);
  if (lines.length > 1 && new Set(lines.map((l) => l.toLowerCase().split(/\s+/)[0])).size === 1) out.push("every line opens with the same word");
  return out;
}

// --- the critic's verdict -------------------------------------------------------

/** Each 1–5. 3 is "fine"; 5 is "a person said this unprompted". */
export type Scores = { spoken: number; hook: number; sync: number; specific: number; payoff: number; brand: number };

export type Review = {
  id: string;
  /** Which candidate the final script came from (0-based). */
  pick: number;
  /** The lines to use: the picked candidate, or the critic's edit of it. Same count as the beats. */
  final: string[];
  scores: Scores;
  notes: string;
};

const SCORE_KEYS: (keyof Scores)[] = ["spoken", "hook", "sync", "specific", "payoff", "brand"];

/**
 * The bar a script clears to reach the Studio. Naturalness, sync and brand
 * safety are each gates on their own; the rest is an average.
 */
export function passes(s: Scores): string | null {
  for (const k of SCORE_KEYS) if (!Number.isFinite(s[k])) return `no ${k} score`;
  if (s.spoken < 4) return `doesn't sound spoken (${s.spoken}/5)`;
  if (s.sync < 4) return `words don't match the picture (${s.sync}/5)`;
  if (s.brand < 4) return `off brand (${s.brand}/5)`;
  if (s.hook < 3) return `weak hook (${s.hook}/5)`;
  const mean = SCORE_KEYS.reduce((a, k) => a + s[k], 0) / SCORE_KEYS.length;
  if (mean < 3.8) return `not good enough overall (${mean.toFixed(1)}/5)`;
  return null;
}

export const meanScore = (s: Scores) => SCORE_KEYS.reduce((a, k) => a + s[k], 0) / SCORE_KEYS.length;

/** A candidate's own problems: shape, fit and lint. Null when it can go to the critic. */
export function candidateProblem(c: Candidate, sc: Pick<ScriptCase, "beats" | "cta" | "brand">): string | null {
  const lines = c.voiceover.map((l) => l.trim()).filter(Boolean);
  if (lines.length !== sc.beats.length) return `${lines.length} lines for ${sc.beats.length} beats`;
  const fit = scriptFit(lines, sc.beats.map((b) => b.seconds), sc.cta);
  if (fit) return fit;
  const lint = lintSpoken(lines, sc.brand);
  return lint.length ? lint[0] : null;
}

export type Chosen = { voiceover: string[]; direction: string; hook: string; scores: Scores | null; edited: boolean; note: string };

/**
 * Turn the critic's review into the script that ships, or the reason nothing
 * does. The critic's word is checked, not trusted: its final lines still have
 * to fit the footage and pass the lint, and its scores have to clear the bar.
 * With no review at all (the critic call failed) the first clean candidate goes
 * through, marked as unreviewed, so one outage doesn't cost the week's ideas.
 */
export function chooseScript(sc: ScriptCase, review: Review | undefined): Chosen | string {
  const clean = sc.candidates.map((c, i) => ({ c, i, problem: candidateProblem(c, sc) }));
  const ok = clean.filter((x) => !x.problem);
  if (!ok.length) return clean[0]?.problem ?? "no script written";
  if (!review) {
    const { c } = ok[0];
    return { voiceover: c.voiceover.map((l) => l.trim()), direction: c.direction?.trim() ?? "", hook: c.hook ?? "", scores: null, edited: false, note: "not reviewed (critic unavailable)" };
  }
  const fail = passes(review.scores);
  if (fail) return `critic: ${fail}${review.notes ? ` — ${review.notes.slice(0, 160)}` : ""}`;
  const from = sc.candidates[review.pick] ?? ok[0].c;
  const final: Candidate = { ...from, voiceover: (review.final ?? []).map((l) => l.trim()).filter(Boolean) };
  const edited = final.voiceover.join("\n") !== from.voiceover.map((l) => l.trim()).join("\n");
  const problem = candidateProblem(final, sc);
  if (problem) {
    // The critic's edit broke a rule; fall back to the untouched candidate it picked, if that one was clean.
    const untouched = ok.find((x) => x.i === review.pick);
    if (!edited || !untouched) return `critic's script: ${problem}`;
    return { voiceover: untouched.c.voiceover.map((l) => l.trim()), direction: untouched.c.direction?.trim() ?? "", hook: untouched.c.hook ?? "", scores: review.scores, edited: false, note: review.notes };
  }
  return { voiceover: final.voiceover, direction: from.direction?.trim() ?? "", hook: from.hook ?? "", scores: review.scores, edited, note: review.notes };
}

// --- delivery direction -----------------------------------------------------------

/** Keys the engine tucks into social_ideas.inputs (jsonb) beside the flow's real inputs. Never sent to the Mac as inputs. */
export const META = { direction: "_direction", pillar: "_pillar", series: "_series", episode: "_episode", hook: "_hook", slot: "_slot", score: "_score" } as const;

export const isMetaKey = (k: string) => k.startsWith("_");

/** The flow's real inputs (what gets typed into the app), with the engine's own notes removed. */
export function flowInputs(inputs: Record<string, string> | null | undefined): Record<string, string> {
  return Object.fromEntries(Object.entries(inputs ?? {}).filter(([k]) => !isMetaKey(k)));
}

/** A director's note is one plain sentence; anything that could read as a script or an instruction is trimmed out. */
export function cleanDirection(raw: string | null | undefined): string {
  return (raw ?? "").replace(/["“”\n\r]/g, " ").replace(/\s+/g, " ").trim().slice(0, 240);
}

/** What the narrator is told when a script carries no note of its own (every idea written before engine v2). */
export function defaultDirection(brand: Brand = "whichoutfit"): string {
  return brand === "comeback"
    ? "Someone who has spent years around athletes, talking to one person who is nervous about starting again: calm, direct, a little dry, easy conversational pace."
    : "Telling a friend about something that finally worked, mid-conversation: relaxed, a little amused, ordinary stress on every word, easy conversational pace.";
}

/** The note the renderer hands to TTS for this idea. Always a non-empty string. */
export function directionFor(inputs: Record<string, string> | null | undefined, brand: Brand = "whichoutfit"): string {
  return cleanDirection(inputs?.[META.direction]) || defaultDirection(brand);
}
