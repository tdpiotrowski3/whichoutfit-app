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
// Each template carries its beats: the windows the narration has to land in.
// Calm Host was measured at ~4.4 syllables/sec and lines were written to land
// 0.3–0.9s short of their window (FitCheck social-clips skill); the planner gets
// the same budget per beat.

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
    beats: FOOTAGE["02_dress_for_event"].beats,
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
          "Destination typed into Trips & Packing as 'City, ST' or 'City, Country', e.g. 'Chicago, IL'. Pick places with weather worth packing for.",
      },
    ],
    beats: FOOTAGE["05_trip_packing"].beats,
    shows: "A destination typed in, the real forecast, a packed capsule and outfits per day.",
  },
];

export const TEMPLATES: Template[] = [...flows, ...recuts];

export function getTemplate(key: string): Template | undefined {
  return TEMPLATES.find((t) => t.key === key);
}

/** Calm Host's measured rate. Lines are budgeted against it, not a word count. */
export const SYLLABLES_PER_SEC = 4.4;

/** The most syllables a line can carry and still land 0.5s short of its beat. */
export function syllableBudget(beat: Pick<Beat, "start" | "end">): number {
  return Math.max(4, Math.floor((beat.end - beat.start - 0.5) * SYLLABLES_PER_SEC));
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
