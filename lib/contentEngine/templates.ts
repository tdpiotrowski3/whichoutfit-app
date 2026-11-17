import { FOOTAGE, type Beat } from "./footage";

// What the content engine knows how to make. Two kinds, both rendered on the
// Mac by FitCheck tools/capture-engine/social/engine.py:
//
//   recut — new narration over footage that already exists (final/<stem>.mp4,
//           the silent master). No Simulator, no AI spend, minutes per clip.
//           The cheapest way to test a new hook on a feature that already works.
//   flow  — films a proven capture flow with new inputs (a different occasion,
//           a different city). The Mac swaps the input into the flow and runs
//           capture.sh, so the footage itself is new.
//
// Each template carries its beats: the moments on screen each narration line
// is anchored to. Since engine v2 the voice leads and the footage is retimed to
// it, so a beat is where a line STARTS, not a window to fill (see scriptFit).

export type TemplateInput = { name: string; describe: string };

export type Template = {
  key: string;
  kind: "recut" | "flow";
  /** Feature family, for grouping performance across clips. */
  feature: string;
  /** recut: the silent master in final/. flow: the beat structure to follow. */
  footage: string;
  /** flow only: the flows.json flow the Mac films. */
  flow?: string;
  /** flow only: the persona closet this flow must be filmed on (overrides the idea's pick). */
  closet?: string;
  inputs: TemplateInput[];
  beats: Beat[];
  /** What a viewer sees, in one sentence, for the planner. */
  shows: string;
};

const RECUT_SHOWS: Record<string, string> = {
  "01_rate_outfit": "Two closet pieces picked, Test this look, a score of 88 with what works and one swap.",
  "02_dress_for_event": "'outdoor summer wedding' typed into Dress for an Event, full outfits from the closet come back.",
  "03_complete_outfit": "One smocked crop top in, three complete looks out, plus the gaps to fill.",
  "04_plan_week": "Plan my outfits for the week: a named, weather-matched outfit for each day.",
  "05_trip_packing": "Austin, TX in September: real forecast, a 6-piece capsule, outfits per day.",
  "06_resale_listing": "Sell This Item on a top: $18–$28 estimate, title, description, hashtags.",
  "07_closet_tour": "Scrolling the catalogued closet grid, category filters, one item's detail page.",
  "08_closet_insights": "Closet Insights: never-worn pieces with a one-tap Sell, the category split.",
  "09_color_season": "One selfie into Your Colors: Cool Winter, 8 best colours, 3 to skip.",
  "10_photo_cleanup": "A tee shot on a hanger cleaned into a catalog flat-lay, before and after.",
  "11_add_item": "A jacket photographed on a bed becomes a named, filed closet item.",
  "12_scan_item": "Scanning a jacket in a shop: the app says you already own it, 100% match.",
  "13_photo_cleanup_real": "A real phone photo on a bed becomes a clean catalog flat-lay in one tap.",
  "14_see_it_on": "Today's outfit rendered on a studio mannequin before getting dressed.",
  "15_ask_friends": "Two outfit options sent as a poll; friends vote without the app.",
};

const recuts: Template[] = Object.entries(FOOTAGE).map(([stem, f]) => ({
  key: `recut:${stem}`,
  kind: "recut",
  feature: f.feature,
  footage: stem,
  inputs: [],
  beats: f.beats,
  shows: RECUT_SHOWS[stem] ?? stem,
}));

/**
 * A flow re-films an old take with a new input, so its beat text (borrowed from
 * that old take) names an old occasion, city, forecast and pieces. Tell the
 * writer those specifics are stale; otherwise it copies their shape and invents
 * new ones ("nineteen degrees") the live footage then contradicts.
 */
function liveBeats(beats: Beat[]): Beat[] {
  return beats.map((b) => ({
    ...b,
    was: `${b.was} [Filmed live with the new input: any occasion, city, number, temperature, price or named piece above is from an old take and WILL differ. Say only the input and what is always true of this screen.]`,
  }));
}

const flows: Template[] = [
  {
    key: "flow:dress_for_event",
    kind: "flow",
    feature: "dress_for_event",
    footage: "02_dress_for_event",
    flow: "dress_for_event_social",
    inputs: [
      {
        name: "occasion",
        describe:
          "What gets typed into Dress for an Event, 2–5 words, lowercase, e.g. 'first date at a wine bar'. Pick moments people actually search for this season.",
      },
    ],
    beats: liveBeats(FOOTAGE["02_dress_for_event"].beats),
    shows: "The occasion typed into Dress for an Event, then full outfits from the closet.",
  },
  {
    key: "flow:trip_packing",
    kind: "flow",
    feature: "trip_packing",
    footage: "05_trip_packing",
    flow: "trip_packing_social",
    inputs: [
      {
        name: "city",
        describe:
          "Destination typed into Trips & Packing as 'City, ST' or 'City, Country', e.g. 'Chicago, IL'. Pick places with weather worth packing for: in winter, ski towns ('Park City, UT') and warm escapes ('Miami Beach, FL') — the app reads the destination and packs ski gear or swim accordingly.",
      },
    ],
    beats: liveBeats(FOOTAGE["05_trip_packing"].beats),
    shows: "A destination typed in, the real forecast, a packed capsule and outfits per day.",
  },
];

// Beats for footage that has no recut master: measured from the polished take
// (FitCheck tools/capture-engine/social, `no_closet_social`). `was` describes
// what is on screen, for the planner, not a line that was ever narrated.
const NO_CLOSET_BEATS: Beat[] = [
  // Measured 2026-11-13 from the polished take (16.9s; the engine trims the
  // teardown and the CTA J-cuts in after the last beat).
  { start: 0.0, end: 3.0, was: "A brand-new account's Planner: 'Today's look is ready' card with today's real weather (it changes every take, so never name a temperature); tapping in, the look loads." },
  { start: 3.0, end: 6.5, was: "'See it together': the whole outfit as product photos in a row, then the first piece (the pieces change every take: name none)." },
  { start: 6.5, end: 10.5, was: "Scrolling the suggested pieces, each a real product with a photo and price (a top, bottoms, a coat, shoes, a bag; which ones changes every take, so name none)." },
  { start: 10.5, end: 14.5, was: "Filled hearts on the pinned pieces, scrolling back up through the look." },
];

flows.push({
  key: "flow:no_closet",
  kind: "flow",
  feature: "closet_optional",
  footage: "no_closet_social",
  flow: "no_closet_social",
  closet: "fresh",
  inputs: [],
  beats: NO_CLOSET_BEATS,
  shows:
    "A brand-new account with an empty closet: the Planner's 'Today's look is ready' card, then a complete outfit for today's real weather built from real products with photos, the pieces laid out together, and one pinned to the wishlist.",
});

// A trip with plans: the destination plus three events typed into Trips &
// Packing, filmed on a real closet. The take scrolls until the 2nd and 3rd
// events' looks are on screen (scrollUntil), so those two beats always show the
// payoff. Measured 2026-11-17 from the menswear Vegas take after cap_freezes
// (32.5s). Forecast, piece count and the pieces themselves change every take.
const TRIP_EVENTS_BEATS: Beat[] = [
  { start: 0.0, end: 6.0, was: "Opening the app and going into Trips & Packing (plays before anything specific is on screen)." },
  { start: 6.0, end: 11.5, was: "The destination typed in, then the trip's three events added one by one as chips." },
  { start: 11.5, end: 14.5, was: "The real forecast for the trip's days at the destination (numbers change every take: name none)." },
  { start: 14.5, end: 22.0, was: "The packed capsule: one set of the person's own closet pieces, plus a couple of suggested add-ons with product photos (count and pieces change every take: name none)." },
  { start: 22.0, end: 29.5, was: "Scrolling to the look built for the SECOND event (e.g. a client dinner): own closet pieces plus at most one suggested piece." },
  { start: 29.5, end: 32.5, was: "The look for the THIRD event (e.g. a pool day), held on screen." },
];

flows.push({
  key: "flow:trip_events",
  kind: "flow",
  feature: "trip_packing",
  footage: "trip_events_social",
  flow: "trip_events_social",
  inputs: [
    { name: "city", describe: "Destination as 'City, ST' or 'City, Country', e.g. 'Las Vegas, NV'. A place whose trip has a mix of plans." },
    { name: "event1", describe: "First event on the trip, 1–3 words, e.g. 'Conference'. Shown only as a chip; its look is not on screen." },
    { name: "event2", describe: "Second event, 1–3 words, e.g. 'Client dinner'. Its look is the first payoff, so make it a dressy or specific occasion. Start it with a distinctive word (the take scrolls to the look titled with it)." },
    { name: "event3", describe: "Third event, 1–3 words, e.g. 'Pool day'. Its look closes the clip; a contrast with event2 (dressy then casual) reads best. Start it with a distinctive word." },
  ],
  beats: TRIP_EVENTS_BEATS,
  shows: "A destination and three plans typed into Trips & Packing, the real forecast, a capsule from the closet, then the look for the second plan and the look for the third.",
});

export const TEMPLATES: Template[] = [...flows, ...recuts];

export function getTemplate(key: string): Template | undefined {
  return TEMPLATES.find((t) => t.key === key);
}

/** Calm Host's measured rate. Used to ESTIMATE how long a line takes to say, not to fill time. */
export const SYLLABLES_PER_SEC = 4.4;

/**
 * LEGACY (engine v1): the most syllables a line could carry and still land 0.5s
 * short of its beat, back when narration was laid onto fixed footage and every
 * line was written to fill its window. Nothing budgets against it any more;
 * kept for the hand-made masters' notes and old tests.
 */
export function syllableBudget(beat: Pick<Beat, "start" | "end">): number {
  return Math.max(4, Math.floor((beat.end - beat.start - 0.5) * SYLLABLES_PER_SEC));
}

// --- the voice-first contract (engine v2) ------------------------------------
//
// The renderer now records ONE natural take of the whole script and retimes the
// footage to the voice (holds, trims, speed ramps, within limits). So a beat is
// an ANCHOR, not a duration to fill: voiceover[i]'s first words land as beat i's
// picture appears, and the line is as short as a person would naturally say it.
// Only two soft ceilings remain, both about how far footage can stretch:
//
//   - one line may run to LINE_STRETCH x its beat's length in speech time;
//   - the whole script plus the spoken end card fits the footage + SCRIPT_SLACK.
//
// A single line has no minimum: a three-word line is fine. The SCRIPT as a whole
// has a floor (SPEECH_FLOOR) once the footage kind is known: the Mac renderer
// compresses footage to a short script (trims waits, speeds motion to 1.5x, 2x as a
// last resort, and keeps each beat's payoff on screen 1.2s), and below the floor it
// can only do that with a visible fast-forward. Measured 2026-11-17 on the engine v2
// selftest (FitCheck tools/capture-engine/social, `./engine.py --selftest`):
// 5.2s of speech held a 17.4s recut master (0.30) and only just held a 12s
// scroll-heavy flow cut (0.43), with one line drifting 0.3s.

/** How far past its beat one line may run, in speech time, before the footage can't hold for it. */
export const LINE_STRETCH = 1.6;
/** How much longer than the footage the whole narration (script + end card) may run. */
export const SCRIPT_SLACK = 1.25;
/**
 * The least speech (script lines, end card excluded) per second of footage, by
 * footage kind. Recut masters are mostly stills, which compress for free; filmed
 * flows are mostly scrolling, which can only be sped up.
 */
export const SPEECH_FLOOR = { recut: 0.3, flow: 0.45 } as const;
export type FootageKind = keyof typeof SPEECH_FLOOR;

/** The fewest syllables a whole script (end card excluded) can have over this footage. */
export function scriptFloor(beatSeconds: number[], kind: FootageKind): number {
  const footage = beatSeconds.reduce((a, b) => a + b, 0);
  return Math.max(0, Math.ceil(footage * SPEECH_FLOOR[kind] * SYLLABLES_PER_SEC) - COUNT_SLOP);
}

/** The syllable counter is approximate, so the ceilings forgive this much. */
const COUNT_SLOP = 2;

/** The line spoken over WhichOutfit's end card; it is voiced in the same take as the script. */
export const CTA_LINE = "Download WhichOutfit on the App Store or Google Play, and never have nothing to wear again.";

/** Roughly how long a line takes to say at the narrator's ordinary pace. */
export function speechSeconds(text: string): number {
  return countSyllables(text) / SYLLABLES_PER_SEC;
}

/** The most syllables a line can run before its beat can't stretch to cover it. A ceiling, never a target. */
export function lineCeiling(beatSeconds: number): number {
  return Math.max(8, Math.floor(beatSeconds * LINE_STRETCH * SYLLABLES_PER_SEC));
}

/**
 * Does a script fit its footage under the voice-first contract? Returns why
 * not, or null. `beatSeconds[i]` is beat i's length on screen. With `kind`, a
 * script too short for its footage (under SPEECH_FLOOR) fails too.
 */
export function scriptFit(lines: string[], beatSeconds: number[], cta = "", opts: { kind?: FootageKind } = {}): string | null {
  for (let i = 0; i < lines.length; i++) {
    const over = countSyllables(lines[i]) - lineCeiling(beatSeconds[i] ?? 4) - COUNT_SLOP;
    if (over > 0) return `line ${i + 1} is ${over} syllables over what its beat can stretch to`;
  }
  const footage = beatSeconds.reduce((a, b) => a + b, 0);
  const spoken = [...lines, cta].reduce((a, l) => a + speechSeconds(l), 0);
  const most = footage * SCRIPT_SLACK + COUNT_SLOP / SYLLABLES_PER_SEC;
  if (spoken > most) return `the script runs about ${spoken.toFixed(1)}s spoken (with the end card) against ${footage.toFixed(1)}s of footage; cut ${Math.ceil((spoken - most) * SYLLABLES_PER_SEC)} syllables`;
  if (opts.kind) {
    const script = lines.reduce((a, l) => a + speechSeconds(l), 0);
    const least = footage * SPEECH_FLOOR[opts.kind] - COUNT_SLOP / SYLLABLES_PER_SEC;
    if (script < least) {
      return `the script is about ${script.toFixed(1)}s spoken over ${footage.toFixed(1)}s of footage, too short for the ${opts.kind} footage to follow without fast-forwarding; add about ${Math.ceil((least - script) * SYLLABLES_PER_SEC)} syllables`;
    }
  }
  return null;
}

/** Rough English syllable count — good to a syllable or two, which is all a budget needs. */
export function countSyllables(text: string): number {
  return (text.toLowerCase().match(/[a-z']+|\d+/g) ?? []).reduce((n, w) => {
    if (/^\d+$/.test(w)) return n + Math.max(1, w.length); // "88" ≈ "eighty-eight"
    const core = w.replace(/'s$/, "").replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "");
    const groups = core.match(/[aeiouy]{1,2}/g)?.length ?? 0;
    return n + Math.max(1, groups);
  }, 0);
}
