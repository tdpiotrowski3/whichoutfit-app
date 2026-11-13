import { FOOTAGE } from "./footage";
import { getTemplate, syllableBudget, countSyllables } from "./templates";
import { cleanHashtags } from "./hashtags";

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
  // A template that names its closet (flow:no_closet → fresh) is always filmed there.
  const closet = t.kind === "recut" ? "original" : t.closet ?? (raw.closet?.trim() || "original");
  if (!t.closet && !closets.includes(closet)) return `closet ${closet} is not available`;
  const captions = (raw.captions ?? []).map((c) => c.trim()).filter(Boolean).slice(0, 3);
  if (captions.length === 0) return "no captions";
  return {
    template: t.key,
    inputs,
    closet,
    title: (raw.title || t.key).slice(0, 80),
    voiceover: lines,
    captions,
    hashtags: cleanHashtags(raw.hashtags) || null,
    rationale: raw.rationale?.trim() || null,
  };
}

/**
 * Winter (Nov–Feb): every closet is stocked with ski gear, swim, night-out and
 * pajamas (personas.ts), so the trip-packing flow gets the two winter-trip
 * stories people actually search: packing for a ski trip, and a warm weekend
 * away from the cold.
 */
export function seasonalSteer(now: Date): string {
  const m = Number(now.toLocaleDateString("en-US", { month: "numeric", timeZone: "America/Chicago" }));
  if (m !== 11 && m !== 12 && m !== 1 && m !== 2) return "";
  return `
WINTER TRIPS: this week, include at least one "flow:trip_packing" idea, alternating between (a) a ski town (e.g. "Park City, UT", "Aspen, CO", "Breckenridge, CO", "Jackson, WY", "Stowe, VT") — the ski-trip packing list — and (b) a warm escape from the cold (e.g. "Miami Beach, FL", "Key West, FL", "Tulum, Mexico", "San Juan, Puerto Rico", "Scottsdale, AZ") — the beach-weekend packing list. Check ALREADY PLANNED and pick the one done less recently. Every closet has ski gear, swimwear and a night-out look, so rotate closets.`;
}

/**
 * Feature launches the feed should announce. A campaign is OFF until its
 * `liveFrom` date is set, and that must be the day the build carrying it is
 * live on BOTH stores (check with the live-versions script, never a repo doc):
 * the clips film the real app, so announcing early films features users can't
 * get. Set it with the Vercel env var named in `env` (no deploy of code
 * needed beyond the env change + redeploy).
 *
 * For `windowDays` after launch, the planner leads with the campaign, and every
 * idea it drafts lands as "proposed" even with autopilot on, so each launch clip
 * is looked at before it films and again before it posts (`needsReview`).
 */
export type LaunchCampaign = { key: string; env: string; windowDays: number; brief: string };

export const LAUNCH_CAMPAIGNS: LaunchCampaign[] = [
  {
    key: "closet-optional",
    env: "LAUNCH_CLOSET_OPTIONAL_LIVE_FROM",
    windowDays: 21,
    brief: `LAUNCH — "WhichOutfit now works even with an empty closet" (2.2). Week 1 opens with ONE announcement clip on "flow:no_closet" (the fresh account, filmed live): the honest story — "most of us never upload our whole closet, so now you don't have to": today's look for the real weather, built from real products you can tap, then pinned to a wishlist. The hook is "now no closet needed". Then follow-ups, one feature each, spread across closets and the Tue/Thu/Sat slots:
- A Miami-weekend packing list with a night-out look styled for Miami and the optional "Try it" swap (e.g. the bikini top under an open linen shirt).
- A ski-trip packing list that remembers what people forget: pajamas, base layers, ski socks, gloves, goggles.
- No closet at all, a second angle on "flow:no_closet" (e.g. the cold-morning or holiday-season version of today's look) once the announcement has posted.
- The wishlist: pin pieces from a suggested look or Rate My Outfit's "uplevel this outfit", then share it (holiday gift-list angle in December).
- "I have something like this": snap your own piece and the look swaps it in.
- "Shop suggestions" on a trip look.
Say "now" or "new" once per clip, never "update" or version numbers. Use only templates in the catalog; when a feature has no template yet, skip it rather than describing a screen the footage doesn't show.`,
  },
];

/** Days since a campaign went live, or null when it hasn't (or the date is bad). */
export function campaignDay(c: LaunchCampaign, now: Date, env: Record<string, string | undefined> = process.env): number | null {
  const raw = env[c.env]?.trim();
  if (!raw) return null;
  const start = new Date(`${raw}T00:00:00-06:00`);
  if (Number.isNaN(start.getTime())) return null;
  const day = Math.floor((now.getTime() - start.getTime()) / 86_400_000);
  return day >= 0 && day < c.windowDays ? day : null;
}

/** The planner's launch block for this week (empty when nothing is launching). */
export function launchSteer(now: Date, env: Record<string, string | undefined> = process.env): string {
  return LAUNCH_CAMPAIGNS.filter((c) => campaignDay(c, now, env) !== null)
    .map((c) => {
      const day = campaignDay(c, now, env)!;
      return `\n${c.brief}\n(This is day ${day + 1} of the launch window${day < 7 ? "; if no announcement clip is in ALREADY PLANNED yet, the first idea is the announcement" : ""}.)`;
    })
    .join("\n");
}

/** True while any launch window is open: drafted ideas need a human look even on autopilot. */
export function needsReview(now: Date, env: Record<string, string | undefined> = process.env): boolean {
  return LAUNCH_CAMPAIGNS.some((c) => campaignDay(c, now, env) !== null);
}
