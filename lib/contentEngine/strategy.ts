import type { Brand } from "./scriptRules";

// The content engine's strategy layer, for both companies. Pure — no database,
// no network, no model — so every decision in it is unit-tested
// (lib/__tests__/engineBrain.test.ts). strategyStore.ts does the I/O.
//
// Before this, the weekly planner started cold every Monday: "half recut, half
// flow, lean toward what's performing". Now there is a standing plan:
//
//   PILLARS   what the account is about, each with a funnel job (reach, trust,
//             convert) and the search phrase it is trying to be found for.
//   SERIES    repeatable formats people can follow ("Packing for ___"), each a
//             list of episodes, some tied to a season.
//   HOOKS     a bank of opening archetypes, tracked by how they perform.
//   MOMENTS   the calendar: holidays, ski season, New Year's resolutions.
//   the PLAN  six weeks of slots (pillar x series episode x hook), rebuilt every
//             week from results. Past the current week nothing is fixed.
//
// Learning is Thompson sampling over pillar, hook and format, and it is honest
// about how little data there is: most clips have tens of views, so an arm
// needs a handful of finished clips before the plan leans on it at all, and
// one slot a week always goes to whatever has been tried least.

export type FunnelJob = "reach" | "trust" | "convert";

export type Pillar = {
  key: string;
  label: string;
  job: FunnelJob;
  /** The phrase people type that this pillar should be found for. */
  intent: string;
  /** Share of slots when nothing else has a say (sums to ~1 per brand). */
  share: number;
};

export type Episode = {
  key: string;
  /** What the owner sees: "Packing for Aspen". */
  label: string;
  /** WhichOutfit: the template that films it. */
  template?: string;
  inputs?: Record<string, string>;
  /** The story to tell, for the writer. */
  angle: string;
  /** Only planned inside this window, "MM-DD" to "MM-DD" (may wrap the year). */
  window?: [string, string];
};

export type Series = {
  key: string;
  /** The name people would know it by. */
  name: string;
  pillar: string;
  /** Why someone follows it. */
  promise: string;
  episodes: Episode[];
  /** Comeback reels: seconds per beat and the app screens filmed, shared by every episode. */
  beats?: number[];
  screens?: string[];
};

export type HookType = { key: string; label: string; how: string; example: string };

export type Moment = { key: string; label: string; from: string; to: string; pillar: string; steer: string };

export type Playbook = {
  brand: Brand;
  slotsPerWeek: number;
  /** Clips that need new footage filmed are the expensive ones. */
  maxFilmedPerWeek: number;
  pillars: Pillar[];
  series: Series[];
  hooks: HookType[];
  moments: Moment[];
};

// --- WhichOutfit ----------------------------------------------------------------

const trip = (key: string, city: string, angle: string, window?: [string, string]): Episode => ({
  key, label: `Packing for ${city.split(",")[0]}`, template: "flow:trip_packing", inputs: { city }, angle, window,
});
const wear = (key: string, occasion: string, angle: string, window?: [string, string]): Episode => ({
  key, label: `What to wear: ${occasion}`, template: "flow:dress_for_event", inputs: { occasion }, angle, window,
});

const SKI: [string, string] = ["11-01", "03-15"];
const WARM: [string, string] = ["11-15", "03-31"];
const SKI_ANGLE = "A ski trip, packed from the closet: the forecast, the capsule, and the things people forget (base layers, ski socks, gloves, pajamas).";
const WARM_ANGLE = "A warm weekend away from the cold: swim, a night-out look for that city, one bag.";

const WHICHOUTFIT_PLAYBOOK: Playbook = {
  brand: "whichoutfit",
  slotsPerWeek: 4,
  maxFilmedPerWeek: 2,
  pillars: [
    { key: "occasion", label: "What do I wear to this", job: "reach", intent: "what to wear to a ___", share: 0.28 },
    { key: "trips", label: "Packing for a trip", job: "reach", intent: "packing list for ___", share: 0.24 },
    { key: "verdict", label: "Does this outfit work", job: "reach", intent: "rate my outfit", share: 0.14 },
    // The closet is the product (closet upload stays core): this pillar is what earns trust in it.
    { key: "closet", label: "Your closet, finally visible", job: "trust", intent: "digital closet, closet clean out", share: 0.22 },
    { key: "day_one", label: "Styled from day one", job: "convert", intent: "outfit planner, what to wear today", share: 0.12 },
  ],
  series: [
    {
      key: "packing_for", name: "Packing for ___", pillar: "trips",
      promise: "One destination a week, packed from a real closet for the real forecast. Save it for your own trip.",
      episodes: [
        trip("park_city", "Park City, UT", SKI_ANGLE, SKI), trip("miami", "Miami Beach, FL", WARM_ANGLE, WARM),
        trip("aspen", "Aspen, CO", SKI_ANGLE, SKI), trip("key_west", "Key West, FL", WARM_ANGLE, WARM),
        trip("breckenridge", "Breckenridge, CO", SKI_ANGLE, SKI), trip("tulum", "Tulum, Mexico", WARM_ANGLE, WARM),
        trip("jackson", "Jackson, WY", SKI_ANGLE, SKI), trip("scottsdale", "Scottsdale, AZ", WARM_ANGLE, WARM),
        trip("stowe", "Stowe, VT", SKI_ANGLE, SKI), trip("san_juan", "San Juan, Puerto Rico", WARM_ANGLE, WARM),
        trip("home_for_thanksgiving", "Chicago, IL", "Flying home for Thanksgiving with a carry-on: cold, one nice dinner, a lot of couch.", ["11-08", "11-25"]),
        trip("home_for_christmas", "Minneapolis, MN", "Home for the holidays: real cold, a party, pajamas that will be in photos.", ["12-05", "12-23"]),
        trip("cabo", "Cabo San Lucas, Mexico", "Spring break, carry-on only.", ["02-15", "04-10"]),
        trip("charleston", "Charleston, SC", "A long spring weekend: warm days, cool nights, one dinner worth dressing for.", ["03-01", "05-31"]),
        trip("nashville", "Nashville, TN", "A bachelorette or birthday weekend: two nights out, one brunch.", ["04-01", "09-30"]),
        trip("lisbon", "Lisbon, Portugal", "A week in Europe out of one bag: hills, heat, dinners.", ["05-01", "09-15"]),
        trip("rome", "Rome, Italy", "A week in Europe out of one bag: walking all day, covered shoulders, dinners.", ["05-01", "09-15"]),
        trip("san_diego", "San Diego, CA", "A summer weekend: beach by day, a layer for the evening.", ["05-15", "09-15"]),
        trip("new_york_fall", "New York, NY", "A fall city weekend: ten miles of walking a day and one real dinner.", ["09-01", "11-07"]),
        trip("asheville", "Asheville, NC", "A fall cabin weekend: layers, boots, one sweater doing three jobs.", ["09-15", "11-07"]),
        { key: "austin_recut", label: "Three days in Austin, six pieces", template: "recut:05_trip_packing", angle: "The overpacking confession: three days, six pieces, an outfit for each day.", window: ["03-16", "10-31"] },
      ],
    },
    {
      key: "what_to_wear", name: "What do I wear to ___", pillar: "occasion",
      promise: "The invite everyone is dreading this month, answered from clothes you already own.",
      episodes: [
        wear("thanksgiving_inlaws", "thanksgiving dinner at the in-laws", "Nice enough for the photo, stretchy enough for the meal.", ["11-08", "11-25"]),
        wear("friendsgiving", "friendsgiving potluck", "Casual but you tried; you're carrying a casserole.", ["11-08", "11-25"]),
        wear("office_holiday_party", "office holiday party", "Festive without becoming a story on Monday.", ["11-20", "12-19"]),
        wear("festive_cocktail", "festive cocktail party", "Nobody knows what the dress code on the invite means.", ["11-25", "12-23"]),
        wear("christmas_eve", "christmas eve dinner", "Family, photos, and a long sit at a table.", ["12-05", "12-23"]),
        wear("nye_house_party", "new year's eve house party", "Sparkle that still works on someone's couch at 1am.", ["12-12", "12-30"]),
        wear("valentines_dinner", "valentine's dinner date", "The reservation was hard to get; the outfit shouldn't be.", ["01-25", "02-13"]),
        wear("galentines_brunch", "galentine's brunch", "Brunch with friends who will notice.", ["01-28", "02-13"]),
        wear("spring_wedding", "spring wedding guest", "Outdoors, might rain, definitely photos.", ["03-15", "05-31"]),
        wear("graduation", "graduation ceremony", "Hot, long, and you're in every picture.", ["04-25", "06-10"]),
        wear("rehearsal_dinner", "rehearsal dinner", "The night before the wedding: dressed, not competing.", ["04-15", "10-15"]),
        wear("concert_park", "concert in the park", "Standing for four hours as it cools off.", ["05-15", "09-15"]),
        wear("fall_wedding", "fall wedding guest", "Warm at 4, cold by 8.", ["09-01", "11-07"]),
        wear("job_interview", "job interview", "You want them to remember what you said."),
        wear("first_date", "first date at a wine bar", "Effort that doesn't look like effort."),
        wear("meeting_parents", "meeting the parents", "One chance, and their sofa is white."),
        wear("work_conference", "work conference", "Three days, badge, walking shoes, one dinner."),
        wear("baby_shower", "baby shower", "Daytime, pastel-adjacent, a lot of sitting on the floor."),
        { key: "summer_wedding_recut", label: "The outdoor summer wedding", template: "recut:02_dress_for_event", angle: "The invite came weeks ago and the answer was in the closet the whole time.", window: ["05-01", "08-31"] },
      ],
    },
    {
      key: "rate_it", name: "Rating my outfit", pillar: "verdict",
      promise: "An honest score and the one swap that fixes it. Would you have worn it?",
      episodes: [
        { key: "the_88", label: "An 88, and the one swap", template: "recut:01_rate_outfit", angle: "Two pieces, an honest score out of a hundred, and the one thing to change." },
        { key: "friends_vote", label: "Two options, friends vote", template: "recut:15_ask_friends", angle: "Stuck between two outfits, so the group chat decides, without anyone needing the app." },
        { key: "see_it_on", label: "See it on before getting dressed", template: "recut:14_see_it_on", angle: "Seeing today's outfit on a mannequin before committing to it." },
      ],
    },
    {
      key: "closet_files", name: "What my closet told me", pillar: "closet",
      promise: "One thing you only find out once your closet is in one place.",
      episodes: [
        { key: "never_worn", label: "The pieces I've never worn", template: "recut:08_closet_insights", angle: "The uncomfortable list: what has never been worn, and the one-tap way out." },
        { key: "already_own_it", label: "I almost bought a jacket I own", template: "recut:12_scan_item", angle: "In a shop, about to buy it, and the closet says you already have it." },
        { key: "the_tour", label: "The whole closet on one screen", template: "recut:07_closet_tour", angle: "Everything you own, scrollable and filterable, and what that changes about getting dressed." },
        { key: "bed_to_catalog", label: "A photo on the bed becomes a catalog shot", template: "recut:13_photo_cleanup_real", angle: "Adding a piece is one messy photo; the clean-up is done for you." },
        { key: "sell_it", label: "What that top is worth", template: "recut:06_resale_listing", angle: "The top that never gets worn, priced and listed in a tap." },
        { key: "add_a_jacket", label: "Adding one jacket", template: "recut:11_add_item", angle: "How little it takes to put one piece into the closet: one photo, named and filed." },
        { key: "hanger_to_flatlay", label: "Hanger shot to flat-lay", template: "recut:10_photo_cleanup", angle: "Before and after: the photo you took against the one the closet keeps." },
      ],
    },
    {
      key: "day_one", name: "Day one", pillar: "day_one",
      promise: "What the first day with the app looks like, ending on adding your own pieces.",
      episodes: [
        { key: "styled_today", label: "Styled on day one, closet next", template: "flow:no_closet", angle: "Too busy to add my closet yet, and it still dressed me for today's weather; next I add my own pieces. Never \"no closet needed\"." },
        { key: "the_week", label: "The week, planned", template: "recut:04_plan_week", angle: "Sunday night: every day's outfit already picked for the weather." },
        { key: "one_piece_in", label: "One piece in, three looks out", template: "recut:03_complete_outfit", angle: "The piece you love and never know how to wear, finished three ways." },
        { key: "your_colors", label: "The colours that suit you", template: "recut:09_color_season", angle: "One selfie, the eight colours to reach for and the three to skip." },
      ],
    },
  ],
  hooks: [
    { key: "moment", label: "Drop into a moment", how: "Open inside a specific minute the viewer has lived: a time, a place, a thing in their hand.", example: "It's 7:40, the car's four minutes away, and I'm still in a towel." },
    { key: "confession", label: "Confession", how: "Admit something slightly embarrassing and true.", example: "I've owned this skirt for two years. Worn it once." },
    { key: "result_first", label: "Result first", how: "Say the outcome before anything else, then go back to how.", example: "Eighty-eight out of a hundred. For an outfit I nearly didn't wear." },
    { key: "question", label: "Their question", how: "Ask, word for word, the question they'd type into search.", example: "What do you even wear to a wedding in November?" },
    { key: "stakes", label: "What goes wrong", how: "Name the small disaster this avoids, as it usually happens.", example: "Every trip, I pack six tops and wear two." },
    { key: "contrarian", label: "Disagree", how: "Push back on the advice everyone gives.", example: "You don't need more clothes. You need to see the ones you've got." },
    { key: "pov", label: "POV", how: "Put the viewer in the situation in second person.", example: "The invite says festive cocktail, and you have no idea what that means." },
    { key: "test", label: "I tried it", how: "Set up a small test and let the screen answer it.", example: "I gave it one sentence and my actual closet. That's all." },
  ],
  moments: [
    { key: "thanksgiving", label: "Thanksgiving", from: "11-08", to: "11-25", pillar: "occasion", steer: "Dinner at someone else's house and a flight home." },
    { key: "holiday_parties", label: "Holiday parties", from: "11-20", to: "12-23", pillar: "occasion", steer: "Office parties, festive dress codes, family dinners." },
    { key: "gift_lists", label: "Gift lists", from: "12-01", to: "12-18", pillar: "day_one", steer: "The wishlist as a gift list to share." },
    { key: "nye", label: "New Year's Eve", from: "12-12", to: "12-30", pillar: "occasion", steer: "One night, one outfit, photographed all night." },
    { key: "ski_season", label: "Ski season", from: "11-15", to: "03-10", pillar: "trips", steer: "Ski-trip packing lists and what people forget." },
    { key: "warm_escape", label: "Warm escapes", from: "12-26", to: "03-25", pillar: "trips", steer: "A beach weekend away from the cold." },
    { key: "closet_reset", label: "New-year closet reset", from: "12-27", to: "01-31", pillar: "closet", steer: "Closet clean-out season: what you never wore, what to sell." },
    { key: "valentines", label: "Valentine's", from: "01-25", to: "02-13", pillar: "occasion", steer: "Date-night outfits." },
    { key: "spring_break", label: "Spring break", from: "02-15", to: "04-05", pillar: "trips", steer: "Carry-on beach trips." },
    { key: "wedding_season", label: "Wedding season", from: "04-01", to: "10-15", pillar: "occasion", steer: "Wedding guest outfits, showers, rehearsal dinners." },
    { key: "graduation", label: "Graduation", from: "04-25", to: "06-10", pillar: "occasion", steer: "Ceremonies and the dinner after." },
    { key: "summer_travel", label: "Summer travel", from: "05-15", to: "08-20", pillar: "trips", steer: "A week in Europe out of one bag." },
    { key: "back_to_work", label: "Back to routine", from: "08-15", to: "09-15", pillar: "day_one", steer: "The week planned on Sunday night." },
    { key: "fall_reset", label: "Fall closet switch", from: "09-01", to: "10-20", pillar: "closet", steer: "Switching the closet over: what comes back out, what goes." },
  ],
};

// --- Comeback -------------------------------------------------------------------

const cb = (key: string, label: string, angle: string, window?: [string, string]): Episode => ({ key, label, angle, window });

const COMEBACK_PLAYBOOK: Playbook = {
  brand: "comeback",
  slotsPerWeek: 3,
  maxFilmedPerWeek: 3,
  pillars: [
    { key: "time_off", label: "Getting back into it", job: "reach", intent: "getting back into running after a break", share: 0.26 },
    { key: "from_scratch", label: "Starting from scratch", job: "reach", intent: "couch to 5k for beginners", share: 0.24 },
    { key: "after_injury", label: "Cleared. Now what?", job: "trust", intent: "return to sport after injury", share: 0.2 },
    { key: "daily_call", label: "Push, steady or easy", job: "trust", intent: "should I train today after bad sleep", share: 0.16 },
    { key: "earned", label: "Stages you earn", job: "convert", intent: "training plan that adapts", share: 0.14 },
  ],
  series: [
    {
      key: "week_one_back", name: "Week one back", pillar: "time_off",
      promise: "The first week after time off, done the way it should be: a stage below where you were.",
      beats: [4, 5, 5, 5],
      screens: ["Setup: Let's meet you where you're at", "Sport and where to start", "The week, built around those days", "Solid weeks toward the next stage"],
      episodes: [
        cb("the_trap", "The week-one trap", "Picking up exactly where you left off is the mistake; the plan starts a stage below and makes you earn it back."),
        cb("your_days", "Three days is enough", "You have three days and forty minutes; the week is built around that, not around a program written for someone else."),
        cb("month_slipped", "A month slipped by", "Life happened for a month; the plan steps back a stage instead of pretending it didn't."),
        cb("years_off", "Back after years off", "Returning to a sport you used to be good at, and the ego problem of starting below your old level."),
      ],
    },
    {
      key: "scratch_day_n", name: "Starting from scratch, day N", pillar: "from_scratch",
      promise: "Never done this before? Follow one beginner from day one to a first 5K.",
      beats: [4, 5, 5, 5],
      screens: ["Setup: Let's meet you where you're at", "Starting from scratch", "Today: On track for your first 5K", "Stages up to the 5K"],
      episodes: [
        cb("day_1", "Day 1", "Day one is a walk, and that is the plan working, not the plan being easy.", undefined),
        cb("resolution", "The January plan that survives February", "A resolution with a date on it: on track for a first 5K, one stage at a time.", ["12-26", "01-31"]),
        cb("week_2", "Week 2", "The second week is where most plans lose people; this one only asks for a solid week."),
        cb("first_stage", "The first stage opens", "Moving up because the weeks were solid, not because the calendar said so."),
        cb("turkey_trot", "A first 5K with a date", "Signing up for a first 5K and seeing the date the plan is tracking toward.", ["09-15", "11-20"]),
      ],
    },
    {
      key: "cleared_now_what", name: "Cleared. Now what?", pillar: "after_injury",
      promise: "The gap between being discharged and being back, filled in. Works with your PT, never instead of them.",
      beats: [4, 5, 5, 5],
      screens: ["PT tab: snap your sheet", "Exercises read back to check", "Uncleared moves kept out", "Two-week summary for your PT"],
      episodes: [
        cb("the_sheet", "The sheet of exercises", "You leave PT with a printed sheet and no plan around it; one photo puts it into your week."),
        cb("kept_out", "What you're not cleared for stays out", "The plan trains everything your clinician has cleared and leaves the rest out until they say so."),
        cb("next_visit", "What to bring to your next visit", "A two-week summary for your PT, so the appointment starts with what actually happened."),
      ],
    },
    {
      key: "push_steady_easy", name: "Push, steady or easy", pillar: "daily_call",
      promise: "One call each morning from the data your devices already have.",
      beats: [4, 5, 5, 5],
      screens: ["Morning Brief card", "Sleep, HRV, resting heart rate", "Push / steady / easy call", "Today's session to match"],
      episodes: [
        cb("bad_night", "After a bad night", "Five hours of sleep and a session on the calendar: the morning call says easy, and why."),
        cb("green_light", "The day it says push", "Everything recovered, and the plan says so; permission to go hard is useful too."),
        cb("holidays", "Through the holidays", "Travel, late nights, big dinners: the week gets lighter instead of falling apart.", ["11-15", "12-31"]),
      ],
    },
    {
      key: "earned_not_guessed", name: "Earned, not guessed", pillar: "earned",
      promise: "Where the plan is heading and what it takes to get there.",
      beats: [4, 5, 5, 5],
      screens: ["Today: On track for … around a date", "Stage 2 of 4", "Solid weeks toward the next stage", "Next stage opens"],
      episodes: [
        cb("the_date", "A date, not a hope", "Today says what you're on track for and roughly when."),
        cb("solid_weeks", "What a solid week is", "Stages open after solid weeks, so there's always one clear thing to do next."),
        cb("stage_two", "Stage two opens", "The moment a stage opens because you earned it."),
      ],
    },
  ],
  hooks: [
    { key: "moment", label: "Drop into a moment", how: "Open inside a specific minute the viewer has lived.", example: "Six a.m., shoes by the door, and I haven't run since March." },
    { key: "confession", label: "Confession", how: "Admit something true that people don't say.", example: "My first week back, I tried to run my old pace. Lasted four minutes." },
    { key: "result_first", label: "Result first", how: "Say the outcome first, then how.", example: "On track for a first 5K. From someone who walked on day one." },
    { key: "question", label: "Their question", how: "Ask the question they'd type into search.", example: "Slept five hours. Do you still train?" },
    { key: "stakes", label: "What goes wrong", how: "Name how it usually goes wrong.", example: "Week one back is where most people overdo it." },
    { key: "contrarian", label: "Disagree", how: "Push back on the usual advice.", example: "Don't pick up where you left off. Start a stage below." },
    { key: "pov", label: "POV", how: "Put the viewer in the situation.", example: "Your PT just said you're cleared. And handed you a sheet." },
    { key: "test", label: "I tried it", how: "Set up something small and let the screen answer.", example: "I told it three days a week, forty minutes. Here's the week it built." },
  ],
  moments: [
    { key: "resolutions", label: "New Year's resolutions", from: "12-26", to: "01-31", pillar: "from_scratch", steer: "The biggest starting-from-scratch month of the year: a plan with a date on it." },
    { key: "week_three", label: "The week resolutions slip", from: "01-12", to: "02-07", pillar: "time_off", steer: "Missed a week? The plan steps back instead of ending." },
    { key: "spring_races", label: "Spring race build", from: "02-01", to: "04-20", pillar: "earned", steer: "5K, 10K and half-marathon builds; stages with a date." },
    { key: "court_season", label: "Back on the court", from: "03-01", to: "05-31", pillar: "time_off", steer: "Tennis, pickleball and golf coming back after winter." },
    { key: "summer", label: "Summer", from: "06-01", to: "08-15", pillar: "daily_call", steer: "Heat, travel and broken routines: the daily call earns its keep." },
    { key: "back_to_routine", label: "Back to routine", from: "08-20", to: "09-30", pillar: "time_off", steer: "September restarts after a summer off." },
    { key: "fall_races", label: "Fall race season", from: "09-01", to: "11-20", pillar: "from_scratch", steer: "A first 5K before the end of the year." },
    { key: "holidays", label: "The holidays", from: "11-15", to: "12-25", pillar: "daily_call", steer: "Keeping going through travel and late nights: lighter weeks, not lost months." },
  ],
};

export const PLAYBOOKS: Record<Brand, Playbook> = { whichoutfit: WHICHOUTFIT_PLAYBOOK, comeback: COMEBACK_PLAYBOOK };

export const getPillar = (b: Playbook, key: string) => b.pillars.find((p) => p.key === key);
export const getSeries = (b: Playbook, key: string) => b.series.find((s) => s.key === key);
export const getHook = (b: Playbook, key: string) => b.hooks.find((h) => h.key === key);

/** WhichOutfit: which pillar a feature's clips belong to, for clips made before ideas carried a pillar. */
export function pillarOfFeature(feature: string): string {
  const map: Record<string, string> = {
    dress_for_event: "occasion", trip_packing: "trips",
    rate_outfit: "verdict", ask_friends: "verdict", see_it_on: "verdict",
    closet_tour: "closet", closet_insights: "closet", resale_listing: "closet", scan_item: "closet", photo_cleanup: "closet", add_item: "closet",
    closet_optional: "day_one", plan_week: "day_one", complete_outfit: "day_one", color_season: "day_one",
  };
  return map[feature] ?? "closet";
}

/** The series episode a made idea corresponds to ("series:episode"), by template and inputs. */
export function episodeOf(b: Playbook, template: string, inputs: Record<string, string> = {}): string | null {
  const norm = (s: string) => s.trim().toLowerCase();
  for (const s of b.series) {
    for (const e of s.episodes) {
      if (e.template !== template) continue;
      const want = Object.entries(e.inputs ?? {});
      if (want.every(([k, v]) => norm(inputs[k] ?? "") === norm(v))) return `${s.key}:${e.key}`;
    }
  }
  return null;
}

// --- the calendar -----------------------------------------------------------------

const TZ = "America/Chicago";

/** YYYY-MM-DD of the Monday of the week `now` falls in, in the posting timezone. */
export function weekOf(now: Date): string {
  const [y, m, d] = now.toLocaleDateString("en-CA", { timeZone: TZ }).split("-").map(Number);
  const day = new Date(Date.UTC(y, m - 1, d));
  const back = (day.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(y, m - 1, d - back)).toISOString().slice(0, 10);
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Is MM-DD inside a window that may wrap the year ("11-15" to "03-10")? */
export function inWindow(mmdd: string, from: string, to: string): boolean {
  return from <= to ? mmdd >= from && mmdd <= to : mmdd >= from || mmdd <= to;
}

/** True when any day of the week starting `monday` falls in the window. */
function weekTouches(monday: string, from: string, to: string): boolean {
  for (let i = 0; i < 7; i++) if (inWindow(addDays(monday, i).slice(5), from, to)) return true;
  return false;
}

export function momentsFor(b: Playbook, monday: string): Moment[] {
  return b.moments.filter((m) => weekTouches(monday, m.from, m.to));
}

// --- learning ---------------------------------------------------------------------

/** One finished clip's results, tagged with what it was testing. */
export type Outcome = {
  clip: string;
  pillar?: string;
  hook?: string;
  /** "filmed" (new footage) or "recut". */
  kind?: string;
  score: number;
  views: number;
  clicks: number;
  installs: number;
  /** Days since it posted. */
  ageDays: number;
};

export type Arm = { dim: "pillar" | "hook" | "kind"; key: string; n: number; wins: number; views: number };

/** A clip's numbers aren't in until it has been out this long. */
export const MATURE_DAYS = 3;

export type Evidence = "none" | "thin" | "lean" | "signal";

/**
 * How much a count of finished clips is worth. With tens of views per clip,
 * fewer than five is noise and is treated as "we don't know yet".
 */
export function evidence(n: number): Evidence {
  return n === 0 ? "none" : n < 5 ? "thin" : n < 12 ? "lean" : "signal";
}

export type Learning = { arms: Arm[]; mature: number; baseline: number };

/**
 * Score every arm. A clip "wins" if it beat the median score of all finished
 * clips, or earned a real outcome (a link click or an install) at any size:
 * relative, so it works at fifty views as well as fifty thousand.
 */
export function learn(outcomes: Outcome[]): Learning {
  const done = outcomes.filter((o) => o.ageDays >= MATURE_DAYS);
  const sorted = done.map((o) => o.score).sort((a, b) => a - b);
  const baseline = sorted.length ? (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.ceil((sorted.length - 1) / 2)]) / 2 : 0;
  const arms = new Map<string, Arm>();
  for (const o of done) {
    const win = o.score > baseline || o.clicks > 0 || o.installs > 0;
    for (const [dim, key] of [["pillar", o.pillar], ["hook", o.hook], ["kind", o.kind]] as const) {
      if (!key) continue;
      const id = `${dim}:${key}`;
      const a = arms.get(id) ?? { dim, key, n: 0, wins: 0, views: 0 };
      a.n++;
      if (win) a.wins++;
      a.views += o.views;
      arms.set(id, a);
    }
  }
  return { arms: [...arms.values()], mature: done.length, baseline };
}

/** Seeded PRNG (mulberry32): the same week always draws the same plan from the same results. */
export function rng(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gamma(k: number, r: () => number): number {
  // Marsaglia–Tsang; k >= 1 here (Beta(1+wins, 1+losses)).
  const d = k - 1 / 3, c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number, v: number;
    do {
      const u1 = Math.max(r(), 1e-12), u2 = r();
      x = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = Math.max(r(), 1e-12);
    if (Math.log(u) < 0.5 * x * x + d - d * v + d * Math.log(v)) return d * v;
  }
}

/**
 * One Thompson draw for an arm: a sample from Beta(1 + wins, 1 + losses). An
 * untried arm draws from Beta(1, 1), anywhere from 0 to 1, which is the point:
 * with little data everything gets its turn, and the draws only tighten around
 * a winner as clips pile up.
 */
export function thompson(arm: Pick<Arm, "n" | "wins"> | undefined, r: () => number): number {
  const wins = arm?.wins ?? 0, losses = (arm?.n ?? 0) - wins;
  const x = gamma(1 + wins, r), y = gamma(1 + losses, r);
  return x / (x + y);
}

// --- the plan ---------------------------------------------------------------------

export type PlanSlot = {
  /** "2026-11-16:1" — the week and position; ideas drafted from it carry this id. */
  id: string;
  pillar: string;
  job: FunnelJob;
  series: string;
  episode: string;
  label: string;
  angle: string;
  template?: string;
  inputs?: Record<string, string>;
  hook: string;
  /** True for the slot spent on whatever has been tried least. */
  explore: boolean;
  /** One plain line on why this slot is here. */
  why: string;
  status: "planned" | "drafted";
  ideaId?: string;
};

export type PlanWeek = { weekOf: string; theme: string; moments: string[]; launch: string | null; slots: PlanSlot[] };

export type Plan = {
  brand: Brand;
  version: 1;
  updatedAt: string;
  weeks: PlanWeek[];
  arms: Arm[];
  /** Finished clips the learning is based on. */
  mature: number;
  /** Three to five plain sentences: what we're testing, what we learned, what's next. */
  summary: string[];
};

export const PLAN_WEEKS = 6;
/** A clip is not re-posted until this long after it last went out; a winner gets a new hook before a straight re-post. */
export const RECYCLE_GAP_DAYS = 28;

export type PlanInput = {
  brand: Brand;
  now: Date;
  prev?: Plan | null;
  outcomes?: Outcome[];
  /** "series:episode" keys already made, newest first. */
  used?: string[];
  /** The launch campaign live in the week starting on this Monday, if any (rules.ts campaignDay). */
  launchIn?: (monday: string) => string | null;
  /** WhichOutfit: whether a template can be made right now (a closet it needs may not be stocked). */
  canMake?: (template: string) => boolean;
  weeks?: number;
};

const isFilmed = (e: Episode, b: Playbook) => (b.brand === "comeback" ? true : !!e.template?.startsWith("flow:"));

function pickWeighted<T>(items: T[], weight: (t: T) => number, r: () => number): T | undefined {
  const w = items.map((t) => Math.max(0, weight(t)));
  const total = w.reduce((a, x) => a + x, 0);
  if (!items.length || total <= 0) return items[0];
  let x = r() * total;
  for (let i = 0; i < items.length; i++) if ((x -= w[i]) <= 0) return items[i];
  return items[items.length - 1];
}

const armLine = (a: Arm | undefined) =>
  !a || a.n === 0 ? "untested" : `${a.wins} of ${a.n} beat the median${evidence(a.n) === "thin" ? ", too few to call" : evidence(a.n) === "lean" ? ", an early lean" : ""}`;

function buildWeek(b: Playbook, monday: string, index: number, inp: PlanInput, L: Learning, taken: Set<string>): PlanWeek {
  const r = rng(`${b.brand}:${monday}`);
  const arm = (dim: Arm["dim"], key: string) => L.arms.find((a) => a.dim === dim && a.key === key);
  const moments = momentsFor(b, monday);
  const launch = inp.launchIn?.(monday) ?? null;
  const mid = addDays(monday, 3).slice(5);
  const used = inp.used ?? [];

  // An episode can be planned if it is in season, makeable, and not already in this plan.
  const open = (s: Series) =>
    s.episodes.filter(
      (e) => !taken.has(`${s.key}:${e.key}`) && (!e.window || inWindow(mid, e.window[0], e.window[1])) && (!e.template || !inp.canMake || inp.canMake(e.template))
    );
  // Freshest first: never-made episodes, then the ones made longest ago.
  const freshness = (s: Series, e: Episode) => {
    const i = used.indexOf(`${s.key}:${e.key}`);
    return i < 0 ? Infinity : i;
  };

  // Funnel mix first: every week reaches new people and earns trust; every
  // other week (and every launch week) asks for the install.
  const jobs: (FunnelJob | null)[] = ["reach", "trust"];
  if (launch || index % 2 === 0) jobs.unshift("convert");
  while (jobs.length < b.slotsPerWeek) jobs.push(null);

  const slots: PlanSlot[] = [];
  const hooksUsed = new Set<string>();
  let filmed = 0;
  const pillarCount = new Map<string, number>();
  for (let n = 0; n < b.slotsPerWeek; n++) {
    const job = jobs[n];
    const pillars = b.pillars.filter((p) => (job ? p.job === job : true) && b.series.some((s) => s.pillar === p.key && open(s).length));
    const pillar = pickWeighted(
      pillars,
      (p) => p.share * (moments.some((m) => m.pillar === p.key) ? 1.6 : 1) * (0.5 + thompson(arm("pillar", p.key), r)) / (1 + 2 * (pillarCount.get(p.key) ?? 0)),
      r
    );
    if (!pillar) continue;
    pillarCount.set(pillar.key, (pillarCount.get(pillar.key) ?? 0) + 1);

    const cands = b.series.filter((s) => s.pillar === pillar.key).flatMap((s) => open(s).map((e) => ({ s, e })));
    // Past the filming budget, prefer a re-cut; in season beats evergreen; fresh beats repeated.
    const rank = ({ s, e }: { s: Series; e: Episode }) =>
      (filmed >= b.maxFilmedPerWeek && isFilmed(e, b) && b.brand !== "comeback" ? -1000 : 0) + (e.window ? 100 : 0) + Math.min(freshness(s, e), 50);
    const best = Math.max(...cands.map(rank));
    const top = cands.filter((c) => rank(c) === best);
    const pick = top[Math.floor(r() * top.length)] ?? cands[0];
    if (!pick) continue;
    taken.add(`${pick.s.key}:${pick.e.key}`);
    if (isFilmed(pick.e, b)) filmed++;

    // Hooks: the last slot of the week goes to the least-tried archetype; the
    // rest are Thompson draws, never the same hook twice in a week.
    const explore = n === b.slotsPerWeek - 1;
    const free = b.hooks.filter((h) => !hooksUsed.has(h.key));
    const draws = free.map((h) => ({ h, d: thompson(arm("hook", h.key), r), n: arm("hook", h.key)?.n ?? 0 }));
    const hook = (explore ? [...draws].sort((x, y) => x.n - y.n || y.d - x.d)[0] : [...draws].sort((x, y) => y.d - x.d)[0]).h;
    hooksUsed.add(hook.key);

    const moment = moments.find((m) => m.pillar === pillar.key);
    const why = [
      `${pillar.job === "reach" ? "Reach" : pillar.job === "trust" ? "Trust" : "Convert"}: found for "${pillar.intent}"`,
      launch && pillar.job === "convert" ? "launch window" : moment ? moment.label.toLowerCase() : null,
      `${hook.label.toLowerCase()} hook (${armLine(arm("hook", hook.key))})${explore ? ", this week's experiment" : ""}`,
    ].filter(Boolean).join(" · ");
    slots.push({
      id: `${monday}:${n + 1}`, pillar: pillar.key, job: pillar.job, series: pick.s.key, episode: pick.e.key,
      label: pick.e.label, angle: pick.e.angle, template: pick.e.template, inputs: pick.e.inputs,
      hook: hook.key, explore, why, status: "planned",
    });
  }
  const theme = launch ? `Launch: ${launch.replace(/-/g, " ")}` : moments.length ? moments.slice(0, 2).map((m) => m.label).join(" + ") : "Evergreen";
  return { weekOf: monday, theme, moments: moments.map((m) => m.key), launch, slots };
}

/**
 * Build the rolling plan. The current week keeps any slot that already has an
 * idea drafted from it (re-planning never orphans work in review); everything
 * else, this week and the five after it, is drawn fresh from the results.
 */
export function buildPlan(inp: PlanInput): Plan {
  const b = PLAYBOOKS[inp.brand];
  const L = learn(inp.outcomes ?? []);
  const first = weekOf(inp.now);
  const taken = new Set<string>();
  const weeks: PlanWeek[] = [];
  for (let i = 0; i < (inp.weeks ?? PLAN_WEEKS); i++) {
    const monday = addDays(first, 7 * i);
    const kept = inp.prev?.weeks.find((w) => w.weekOf === monday)?.slots.filter((s) => s.status === "drafted") ?? [];
    for (const s of kept) taken.add(`${s.series}:${s.episode}`);
    const fresh = buildWeek(b, monday, i, inp, L, taken);
    if (kept.length) {
      const keptIds = new Set(kept.map((s) => s.id));
      const rest = fresh.slots.filter((s) => !keptIds.has(s.id)).slice(0, Math.max(0, b.slotsPerWeek - kept.length));
      fresh.slots = [...kept, ...rest].sort((x, y) => x.id.localeCompare(y.id));
    }
    weeks.push(fresh);
  }
  const plan: Plan = { brand: inp.brand, version: 1, updatedAt: inp.now.toISOString(), weeks, arms: L.arms, mature: L.mature, summary: [] };
  plan.summary = strategySummary(plan);
  return plan;
}

const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/** What the results say so far, in sentences that don't claim more than the data can. */
export function learnings(plan: Pick<Plan, "arms" | "mature" | "brand">): string[] {
  const b = PLAYBOOKS[plan.brand];
  if (plan.mature === 0) return ["Nothing has results yet, so nothing is being favoured: every pillar and every hook gets a turn."];
  const out: string[] = [];
  const name = (a: Arm) =>
    a.dim === "pillar" ? `"${getPillar(b, a.key)?.label ?? a.key}"` : a.dim === "hook" ? `the ${(getHook(b, a.key)?.label ?? a.key).toLowerCase()} hook` : a.key === "filmed" ? "newly filmed clips" : "re-cuts";
  const strong = plan.arms.filter((a) => a.n >= 5).sort((x, y) => y.wins / y.n - x.wins / x.n);
  const best = strong[0];
  const worst = strong[strong.length - 1];
  if (plan.mature < 8 || !best) {
    out.push(`Too early to call anything: ${plan.mature} clip${plan.mature === 1 ? " has" : "s have"} results, most with tens of views, and no pillar or hook has five finished clips yet. Treat every lean as a guess.`);
  } else {
    out.push(
      `${name(best)[0].toUpperCase()}${name(best).slice(1)} ${evidence(best.n) === "signal" ? "is ahead" : "is an early lean"}: ${best.wins} of ${best.n} beat the median clip${best !== worst && worst.wins / worst.n < best.wins / best.n ? `, against ${worst.wins} of ${worst.n} for ${name(worst)}` : ""}. That is still a small sample, so it gets more slots, not all of them.`
    );
  }
  const real = plan.arms.filter((a) => a.dim === "pillar");
  const views = real.reduce((a, x) => a + x.views, 0);
  if (plan.mature > 0 && views / plan.mature < 200) out.push(`Clips average ${Math.round(views / Math.max(1, plan.mature))} views, so a single link click or install outweighs any view count in what the plan learns from.`);
  return out;
}

/** The plan in three to five plain sentences: what we're testing, what we learned, what's next. */
export function strategySummary(plan: Plan): string[] {
  const b = PLAYBOOKS[plan.brand];
  const [now, next] = plan.weeks;
  const out: string[] = [];
  if (now?.slots.length) {
    const what = now.slots.map((s) => `${getSeries(b, s.series)?.name.replace(/ ___$/, "") ?? s.series}: ${s.label.replace(/^(Packing for|What to wear:) /, "")}`);
    out.push(`This week (${now.theme.toLowerCase() === "evergreen" ? "no holiday in play" : now.theme}): ${list(what)}.`);
    const ex = now.slots.find((s) => s.explore);
    const others = [...new Set(now.slots.filter((s) => !s.explore).map((s) => (getHook(b, s.hook)?.label ?? s.hook).toLowerCase()))];
    if (ex) out.push(`Testing: the ${(getHook(b, ex.hook)?.label ?? ex.hook).toLowerCase()} hook, the least-tried opening, against ${list(others)}; and ${list([...new Set(now.slots.map((s) => getPillar(b, s.pillar)?.job ?? ""))].filter(Boolean))} are each covered so the feed isn't all one job.`);
  }
  out.push(...learnings(plan));
  if (now?.launch) out.push("A launch window is open: every idea waits for your review before it films, and again before it posts.");
  if (next?.slots.length) {
    const upcoming = plan.weeks.slice(1).flatMap((w) => w.moments).filter((m, i, a) => a.indexOf(m) === i && !now?.moments.includes(m));
    const label = (k: string) => b.moments.find((m) => m.key === k)?.label ?? k;
    out.push(`Next week: ${next.theme === "Evergreen" ? "evergreen" : next.theme}, starting with ${next.slots[0].label}${upcoming.length ? `; coming up in the six-week plan: ${list(upcoming.slice(0, 3).map(label))}` : ""}.`);
  }
  return out.slice(0, 5);
}

/** The next slots with no idea drafted from them yet, this week first. */
export function openSlots(plan: Plan, count: number): PlanSlot[] {
  return plan.weeks.flatMap((w) => w.slots).filter((s) => s.status === "planned").slice(0, count);
}

/** Mark a slot as drafted (immutably); unknown ids are ignored. */
export function markDrafted(plan: Plan, slotId: string, ideaId: string): Plan {
  return { ...plan, weeks: plan.weeks.map((w) => ({ ...w, slots: w.slots.map((s) => (s.id === slotId ? { ...s, status: "drafted" as const, ideaId } : s)) })) };
}

/** What the writer is told about one slot. */
export function slotBriefFor(b: Playbook, s: PlanSlot): string {
  const series = getSeries(b, s.series);
  const hook = getHook(b, s.hook);
  const pillar = getPillar(b, s.pillar);
  return [
    `SLOT ${s.id}`,
    `  series: "${series?.name}" — ${series?.promise}`,
    `  episode: ${s.label}. ${s.angle}`,
    s.template ? `  template: ${s.template}${s.inputs && Object.keys(s.inputs).length ? ` with ${Object.entries(s.inputs).map(([k, v]) => `${k} = "${v}"`).join(", ")}` : ""}` : null,
    `  job: ${s.job} (${pillar?.label}); people search: "${pillar?.intent}" — the caption should carry a phrase like that`,
    `  hook to test: ${hook?.label} — ${hook?.how} e.g. "${hook?.example}" (never reuse the example's words)`,
  ].filter(Boolean).join("\n");
}
