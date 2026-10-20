import { FOOTAGE } from "./footage";
import { getTemplate, syllableBudget, countSyllables } from "./templates";

// The content engine's pure rules — no database, no network — so they are
// unit-tested directly (lib/__tests__/contentEngine.test.ts). planner.ts
// does the I/O around them.

export type IdeaFields = {
  template: string;
  inputs: Record<string, string>;
  closet: string;
  title: string;
  voiceover: string[];
  captions: string[];
  hashtags: string | null;
  rationale: string | null;
};

/**
 * Engine-made clips are named "<feature>_<id6>"; the hand-made set is
 * "NN_<name>", which FOOTAGE maps. Anything else falls back to the name.
 */
export function featureOf(clipId: string): string {
  if (FOOTAGE[clipId]) return FOOTAGE[clipId].feature;
  const m = clipId.match(/^(.*)_[0-9a-f]{6}$/);
  if (m) return m[1];
  return clipId.replace(/^\d\d_/, "").replace(/_r\d+$/, "");
}

/**
 * One number per clip that ranks what to re-post and what to make more of.
 * Weighted toward the outcome we actually want: an install counts for 250
 * views, a link click for 25. At ~5 weekly actives, views are the only signal
 * most clips will ever have, so they still count.
 */
export function scoreClip(s: { views: number; likes: number; saves: number; shares: number; clicks: number; installs: number }): number {
  return s.views + 3 * s.likes + 8 * (s.saves + s.shares) + 25 * s.clicks + 250 * s.installs;
}

export type RawIdea = {
  template: string;
  inputs: { name: string; value: string }[];
  closet?: string;
  title: string;
  voiceover: string[];
  captions: string[];
  hashtags: string;
  rationale: string;
};

/**
 * Hold the model to the template. Returns the row to insert, or why it was
 * dropped. A line may run TWO syllables over its budget — the counter is
 * approximate and the Mac re-measures the real audio — but no more.
 */
export function validateIdea(raw: RawIdea, closets: string[] = ["original"]): IdeaFields | string {
  const t = getTemplate(raw.template);
  if (!t) return `unknown template ${raw.template}`;
  const inputs: Record<string, string> = {};
  for (const i of raw.inputs ?? []) if (i.value?.trim()) inputs[i.name] = i.value.trim().slice(0, 60);
  for (const need of t.inputs) if (!inputs[need.name]) return `missing input ${need.name}`;
  const lines = (raw.voiceover ?? []).map((l) => l.trim()).filter(Boolean);
  if (lines.length !== t.beats.length) return `${lines.length} lines for ${t.beats.length} beats`;
  for (let i = 0; i < lines.length; i++) {
    const over = countSyllables(lines[i]) - syllableBudget(t.beats[i]);
    if (over > 2) return `line ${i + 1} is ${over} syllables over its beat`;
  }
  // Re-cuts are existing footage, so they are on the closet they were shot on.
  // A flow is filmed fresh, on any closet that is actually stocked.
  const closet = t.kind === "recut" ? "original" : raw.closet?.trim() || "original";
  if (!closets.includes(closet)) return `closet ${closet} is not available`;
  const captions = (raw.captions ?? []).map((c) => c.trim()).filter(Boolean).slice(0, 3);
  if (captions.length === 0) return "no captions";
  return {
    template: t.key,
    inputs,
    closet,
    title: (raw.title || t.key).slice(0, 80),
    voiceover: lines,
    captions,
    hashtags: raw.hashtags?.trim() || null,
    rationale: raw.rationale?.trim() || null,
  };
}
