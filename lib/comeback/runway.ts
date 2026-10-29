import { cleanHashtags } from "../contentEngine/hashtags";
import { countSyllables, SYLLABLES_PER_SEC } from "../contentEngine/templates";

// Comeback Health's launch runway: the fixed plan of what goes out, counted in
// days from launch (T-0), so the whole thing can be drafted, reviewed and
// produced before the launch date is known. Pure — no database, no network —
// so it is unit-tested (lib/__tests__/comebackRunway.test.ts). runwayStore.ts
// does the I/O around it.
//
// Same engine as WhichOutfit's Content Studio (Gemini drafts, the owner
// approves, the Mac renders reels), different company: its own voice, its own
// claims guard (it is a health product), and its own rows (brand = 'comeback'
// on social_ideas). Nothing here can reach WhichOutfit's accounts.

export type Phase = "teaser" | "reveal" | "launch" | "proof";
export type Format = "reel" | "carousel" | "story" | "email";
/** Who makes the footage: the Mac films the app ("app"), or Tyler films himself ("you"). */
export type Source = "app" | "you";

export type Slot = {
  key: string;
  /** Days from launch: -28 is four weeks before, 0 is launch day. */
  day: number;
  phase: Phase;
  format: Format;
  source?: Source;
  /** What this piece has to do, for the planner. */
  brief: string;
  /** reel only: seconds per beat; one narration line each. */
  beats?: number[];
  /** reel + source "app": the screens the Mac films, in beat order. */
  screens?: string[];
};

export const PHASES: { key: Phase; label: string; goal: string }[] = [
  { key: "teaser", label: "Teaser", goal: "Name the problem and the person behind the app; grow the waitlist." },
  { key: "reveal", label: "Reveal", goal: "One feature a day, each shown working, the week before launch." },
  { key: "launch", label: "Launch day", goal: "It's live: the hero video, the full tour, the waitlist email." },
  { key: "proof", label: "Proof", goal: "Three weeks of how-tos, answers and progress after launch." },
];

export const FORMATS: Record<Format, string> = {
  reel: "Reel / TikTok",
  carousel: "Carousel",
  story: "Story set",
  email: "Waitlist email",
};

// The plan. Reels are 18–24s (four or five beats) in the story style that
// works for WhichOutfit: one first-person story, problem → turn → payoff.
export const RUNWAY: Slot[] = [
  // --- teaser: who it's for, why it's different, the waitlist ----------------
  { key: "founder_why", day: -28, phase: "teaser", format: "reel", source: "you", beats: [4, 5, 5, 5],
    brief: "Why Comeback exists, from the Athletic Trainer who built it: pros who get hurt never just stop, someone plans around where they are. Most people coming back from an injury, a year off, or starting from scratch get a generic plan instead. Comeback meets you where you're at." },
  { key: "compare_carousel", day: -26, phase: "teaser", format: "carousel",
    brief: "Why another app: your health app collects your data, Comeback plans with it. One slide per difference against your health app and typical fitness apps (brings your devices together, turns it into today's plan, starts where you are, plans around an injury, moves you up only when earned, nine sports plus strength). Fair to other apps: 'most' or 'some', never 'none'. Last slide: the waitlist." },
  { key: "pov_cleared", day: -24, phase: "teaser", format: "reel", source: "you", beats: [4, 5, 5, 4],
    brief: "POV: your PT just said you're cleared. Now what? Being discharged with a sheet of exercises and no plan for getting back to your sport, and how a plan that starts there would feel." },
  { key: "scratch_reel", day: -21, phase: "teaser", format: "reel", source: "app", beats: [4, 5, 5, 5],
    screens: ["Setup: Let's meet you where you're at", "Starting from scratch", "Today: On track for your first 5K", "Stages up to the 5K"],
    brief: "Starting from scratch: someone who has never run picks 'Starting from scratch', and Today says where it's heading: on track for their first 5K, with a date. Walk first, each stage earned with solid weeks." },
  { key: "timeoff_carousel", day: -19, phase: "teaser", format: "carousel",
    brief: "Back after time off: week one is the trap (picking up where you left off). Start a stage below where you were, count solid weeks, move up. And if a month slips by, the plan steps you back a stage instead of pretending nothing happened. No injury needed." },
  { key: "waitlist_story", day: -17, phase: "teaser", format: "story",
    brief: "Story set that ends on the waitlist link: a poll on where people are starting from (an injury, time off, or from scratch), then the invite." },
  { key: "week_reel", day: -15, phase: "teaser", format: "reel", source: "app", beats: [4, 5, 5, 5],
    screens: ["Setup: Which days can you train?", "How long on a training day?", "The week, built around those days", "Strength sized to the time"],
    brief: "Your week, built around your days: pick the days you can train and how long you have, and the plan fits that, with strength chosen for your sport. Not a generic program." },
  { key: "data_carousel", day: -12, phase: "teaser", format: "carousel",
    brief: "One plan from everything you wear: your watch, ring, scale and food app already know how you slept and recovered. Comeback reads them through Apple Health or Health Connect and makes one call each morning: push, steady or easy. Never name device or app brands. Last slide: the waitlist." },
  { key: "two_weeks_story", day: -10, phase: "teaser", format: "story",
    brief: "Two weeks out: a behind-the-scenes look at what's being finished, plus the waitlist link." },
  { key: "founder_stages", day: -8, phase: "teaser", format: "reel", source: "you", beats: [4, 5, 5, 5],
    brief: "Earned, not guessed: why the founder built stages that move up on solid weeks instead of a calendar, and why a missed month steps you back rather than throwing you in where you left off." },

  // --- reveal: one capability a day ----------------------------------------
  { key: "week_email", day: -7, phase: "reveal", format: "email",
    brief: "To the waitlist: one week to go, what Comeback does for each starting point (an injury, time off, from scratch), and that they'll be first to know on launch day." },
  { key: "reveal_brief", day: -7, phase: "reveal", format: "reel", source: "app", beats: [4, 5, 5, 5],
    screens: ["Morning Brief card", "Sleep, HRV, resting heart rate", "Push / steady / easy call", "Today's session to match"],
    brief: "Feature: one daily call from all your health data. The Morning Brief reads sleep, HRV and resting heart rate from the watch, ring, scale and food app you already use, plus a ten-second check-in, and calls push, steady or easy." },
  { key: "reveal_destination", day: -6, phase: "reveal", format: "reel", source: "app", beats: [4, 5, 5, 5],
    screens: ["Today: On track for … around a date", "Stage 2 of 4", "Solid weeks toward the next stage", "Next stage opens"],
    brief: "Feature: you always know where it's heading. Today says what you're on track for and roughly when, which stage you're in, and how many solid weeks until the next one opens." },
  { key: "reveal_strength", day: -5, phase: "reveal", format: "reel", source: "app", beats: [4, 5, 5, 5],
    screens: ["Strength session", "Reps going up (+2)", "Ready for more", "New load, reps start again"],
    brief: "Feature: strength that actually progresses. Every two complete sessions add reps, then it tells you you're ready for a little more weight or the harder version. Moves picked for your sport." },
  { key: "reveal_paths", day: -4, phase: "reveal", format: "carousel",
    brief: "Let's meet you where you're at: the three ways in (coming back from an injury or surgery, getting back into it after time off, starting from scratch), what each changes about where the plan starts and how fast it moves up. Built by a Board Certified Athletic Trainer." },
  { key: "reveal_lighter", day: -3, phase: "reveal", format: "reel", source: "app", beats: [4, 5, 5, 5],
    screens: ["Lighter week note", "HRV under normal last week", "Week scaled back", "Sunday weekly review"],
    brief: "Feature: a plan that listens. When last week's recovery dipped (HRV under your normal, resting heart rate up, sore check-ins) this week gets lighter and says why. Every Sunday, a review of your week and where the next one goes." },
  { key: "reveal_watch", day: -2, phase: "reveal", format: "reel", source: "app", beats: [4, 5, 5, 4],
    screens: ["Watch: On track for …", "Today's session on the wrist", "Reps and timers", "Finish summary"],
    brief: "Feature: the Apple Watch companion. Where you're heading and today's session on your wrist, with rep counts, hold and rest timers, and heart rate." },
  { key: "tomorrow_story", day: -1, phase: "reveal", format: "story",
    brief: "Tomorrow: countdown story set, what launches, and a reminder to turn on notifications." },

  // --- launch day -----------------------------------------------------------
  { key: "launch_hero", day: 0, phase: "launch", format: "reel", source: "app", beats: [4, 5, 5, 5, 5],
    screens: ["Let's meet you where you're at", "Your days, your time", "Morning call from your health data", "On track for …", "Stages you earn"],
    brief: "Launch hero: Comeback Health is live. Whatever you're coming back from (an injury, time off, or starting from scratch), the story from where you start to doing what you love." },
  { key: "launch_tour_carousel", day: 0, phase: "launch", format: "carousel",
    brief: "Everything in it: a slide per capability (three ways in, a week built around your days, one daily plan from your health data, a destination you can see, stages you earn, strength that progresses, lighter weeks and the weekly review, PT exercises and clearances, nine sports, Watch), last slide where to get it." },
  { key: "launch_story", day: 0, phase: "launch", format: "story",
    brief: "Launch day story set: it's live, a link sticker to download, and a thank-you to the waitlist." },
  { key: "launch_email", day: 0, phase: "launch", format: "email",
    brief: "To the waitlist: it's live, where to download on iPhone and Android, and the first three things to do: pick where you're starting from and your days, connect your health data, check tomorrow's morning call." },

  // --- proof: three weeks after ---------------------------------------------
  { key: "howto_setup", day: 2, phase: "proof", format: "reel", source: "app", beats: [4, 5, 5, 5],
    screens: ["Let's meet you where you're at", "Sport and where to start", "Your days and time", "First day's plan"],
    brief: "How to set up Comeback in about a minute from any starting point and get your first day's plan." },
  { key: "faq_carousel", day: 4, phase: "proof", format: "carousel",
    brief: "Answers to the questions people ask first: do I need an injury (no), does it take over from my PT (no), which devices and apps work, which sports, does it work without a Watch, what if I miss a few weeks." },
  { key: "injury_reel", day: 6, phase: "proof", format: "reel", source: "app", beats: [4, 5, 5, 5],
    screens: ["PT tab: snap your sheet", "Exercises read back to check", "Uncleared moves kept out", "Two-week summary for your PT"],
    brief: "Coming back from an injury: snap the sheet your PT gave you, keep training what you're cleared for, and bring a two-week summary to your next visit." },
  { key: "week_one_reel", day: 7, phase: "proof", format: "reel", source: "you", beats: [4, 5, 5, 5],
    brief: "One week in: what the founder is hearing from the first users, told as a story. Never quote or invent a user; speak to the kinds of starting points people are using it for." },
  { key: "review_reel", day: 9, phase: "proof", format: "reel", source: "app", beats: [4, 5, 5, 5],
    screens: ["Sunday: Your week in review", "Sessions and minutes", "Sleep and HRV against normal", "Next week's plan"],
    brief: "The Sunday weekly review: what you did, how you recovered against your normal, and where next week goes." },
  { key: "nudge_email", day: 10, phase: "proof", format: "email",
    brief: "To waitlist sign-ups who haven't opened the app yet: the one-minute setup from wherever they're starting, and why a small first week beats a big one." },
  { key: "swim_reel", day: 12, phase: "proof", format: "reel", source: "app", beats: [4, 5, 5, 5],
    screens: ["Swim: Get comfortable", "Kickboard and breathing drills", "Building continuous swims", "Longer sets"],
    brief: "Swimming from scratch or after years away: get comfortable, then drills, then continuous swims, each stage earned with solid weeks." },
  { key: "milestone_reel", day: 14, phase: "proof", format: "reel", source: "app", beats: [4, 5, 5, 5],
    screens: ["A stage reached", "Milestone card", "Share card", "Next stage"],
    brief: "Milestones: reaching a new stage, the share card, and what opens next." },
  { key: "three_weeks_carousel", day: 21, phase: "proof", format: "carousel",
    brief: "Three weeks in: what's been added or fixed from feedback, and what's coming next." },
];

export function getSlot(key: string): Slot | undefined {
  return RUNWAY.find((s) => s.key === key);
}

/** social_ideas.template for a runway piece. */
export const templateKey = (slot: Pick<Slot, "key">) => `cb:${slot.key}`;
export const slotFromTemplate = (template: string) => (template.startsWith("cb:") ? getSlot(template.slice(3)) : undefined);

/** "T-28", "Launch day", "T+4". */
export function dayLabel(day: number): string {
  if (day === 0) return "Launch day";
  return day < 0 ? `T${day}` : `T+${day}`;
}

/** The calendar date of a runway day, given launch day as YYYY-MM-DD. */
export function dateFor(launch: string, day: number): string {
  const [y, m, d] = launch.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + day)).toISOString().slice(0, 10);
}

/** Syllables a reel line can carry and still land 0.5s short of its beat. */
export function beatBudget(seconds: number): number {
  return Math.max(4, Math.floor((seconds - 0.5) * SYLLABLES_PER_SEC));
}

/** Whole days from `a` to `b`, both YYYY-MM-DD. */
export function daysBetween(a: string, b: string): number {
  const t = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
  return Math.round((t(b) - t(a)) / 86_400_000);
}

/** Today's date in Chicago, where the posting calendar lives. */
export function todayLocal(now = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
}

/** The reveal week is kept whole whenever there is room for it before launch. */
const REVEAL_START = -7;

/** Days of lead before the first post can go out: accounts, filming, approval. */
export const LEAD_DAYS = 3;

export type Scheduled = {
  /** The day this piece actually goes out, counted from launch. */
  day: number;
  date: string;
  /** True when the piece was pulled later than planned to fit the time left. */
  moved: boolean;
};

/** The earliest launch day that leaves room for the whole plan after the lead time. */
export function fullRunwayLaunch(today: string): string {
  return dateFor(today, LEAD_DAYS - Math.min(...RUNWAY.map((s) => s.day)));
}

/**
 * Fit the plan to the time actually left. With a launch far enough out every
 * piece keeps its planned day. Closer than that, nothing is ever scheduled in
 * the past or before LEAD_DAYS from now: the teaser is squeezed, in order,
 * into the days left before reveal week, and reveal week stays whole. Under a week out,
 * everything before launch shares the days that remain. Launch and the weeks
 * after keep their days.
 */
export function scheduleRunway(launch: string, today: string): Map<string, Scheduled> {
  // The first day anything can go out (after the lead time), counted from launch.
  const first = daysBetween(launch, today) + LEAD_DAYS;
  const keepReveal = first < REVEAL_START;
  const squeeze = RUNWAY.filter((s) => s.day < (keepReveal ? REVEAL_START : 0));
  const planLo = Math.min(...squeeze.map((s) => s.day));
  const planHi = Math.max(...squeeze.map((s) => s.day));
  const hi = keepReveal ? REVEAL_START - 1 : -1;
  // Squeeze only when the plan starts too soon and there are days left to squeeze into.
  const squeezing = first > planLo && first <= hi;
  const out = new Map<string, Scheduled>();
  for (const s of RUNWAY) {
    let day = s.day;
    if (squeezing && squeeze.includes(s)) {
      // Linear map of the planned span onto [first, hi], so order and spacing survive.
      day = first + Math.round(((s.day - planLo) * (hi - first)) / Math.max(1, planHi - planLo));
    }
    out.set(s.key, { day, date: dateFor(launch, day), moved: day !== s.day });
  }
  return out;
}

// --- voice and rules ---------------------------------------------------------

/** Spoken over every reel's end card, by phase: before launch it is the waitlist. */
export function ctaFor(phase: Phase): string {
  return phase === "teaser" || phase === "reveal"
    ? "Join the waitlist at comebackhealth dot app, and be first in when it launches."
    : "Download Comeback Health on the App Store or Google Play, and get back to your sport.";
}

export const VOICE_RULES = `Comeback Health meets people where they're at: coming back from an injury or surgery, getting back into it after time off, or starting from scratch. Setup builds their week around the days and time they have. It turns the sleep and recovery data from the devices they already wear into one call each morning, shows where the plan is heading (e.g. "on track for your first 5K around Dec 7"), and moves them up a stage once they've earned it with solid weeks (on the injury path, when their PT clears it); a month off steps them back a stage. Strength progresses (reps, then load). Lighter weeks when recovery dips, and a weekly review every Sunday. For injuries it also reads the PT's exercise sheet, keeps uncleared moves out and makes a summary for PT visits. Nine sports plus strength, Apple Watch. Positioning line: "Your health app collects it. Comeback plans with it." Built by a Board Certified Athletic Trainer who has spent years rehabilitating professional athletes. iPhone, Apple Watch, Android and web. Sports: running, cycling, rowing, tennis, pickleball, swimming, fitness classes, functional fitness, hybrid racing.
Voice: an Athletic Trainer talking to an athlete, calm, direct, specific, a little dry. Plain words, concrete details. No hype or AI-sounding words (game-changer, elevate, effortless, seamless, unlock, revolutionize, level up, crush it, beast mode), no emojis, no exclamation marks in narration. Sport-neutral: never make it about one sport; use a mix.
Say "AI" only if the piece is literally about how a feature works, and then once at most.
It is a training and tracking tool, NOT medical care. Hard rules, never broken:
- Never claim it heals, treats, cures, diagnoses, prevents injury, speeds up recovery, or replaces a physical therapist, surgeon or doctor. It works WITH the care team.
- Never say what anyone is cleared for. Clearance always comes from their clinician; the app follows it.
- Never invent statistics, studies, testimonials, users, quotes or outcomes.
- Never invent personal details about the founder (his own injuries, his athletes' names or teams). Speak from what an Athletic Trainer sees working with athletes.
- Never say "training room" or "Athletic Training room".
- Never name a device, wearable or food-app brand; say "your watch, ring, scale and food app" or "anything that shares with Apple Health or Health Connect". Apple Watch only as Comeback's own Watch app.
- Speak to all three starting points across the runway; don't make every piece about injury.
- Never name trademarked programs (CrossFit, HYROX); say "functional fitness" and "hybrid racing".
- Before launch (teaser, reveal) the ask is the waitlist at comebackhealth.app; from launch day on it is the App Store and Google Play. Never mention prices.`;

export const CAPTION_RULES = `Caption rules (Instagram and TikTok):
- The first line is the hook and must work alone; only about the first 100 characters show before "more".
- Work in one phrase people actually search, said naturally ("back to running after knee surgery", "couch to 5k for beginners", "getting back into running after a break").
- Optionally end with a low-effort prompt that earns a comment or a save; vary it.
- Under 150 characters. No hashtags in the caption, no emojis, no em dashes. "Not medical advice" is added automatically; don't write it.`;

export const HASHTAG_RULES = `Hashtags: exactly 5, lowercase, space-separated. 1–2 broad but on-niche (#injuryrecovery #returntosport #physicaltherapy #sportsrehab), 3–4 specific to this piece and how someone would search for it (#aclrecovery #runninginjury #shoulderrehab #tennisinjury #athletictrainer #couchto5k #beginnerrunner). Never: our brand (#comeback #comebackhealth), feed bait (#fyp #viral #explore), platform, AI/app/tech tags, trademarks (#crossfit #hyrox), or one-word giants (#fitness #health #workout #gym #motivation).`;

/** What the claims guard rejects outright. The prompt forbids these; this catches the slips. */
const CLAIMS: [RegExp, string][] = [
  [/\b(heal|recover|rehab|get better)\w*\s+(faster|quicker|sooner)\b/i, "promises faster recovery"],
  [/\b(cures?|cured|curing)\b/i, "says it cures"],
  [/\bprevents?\s+(\w+\s+)?(injur|re-?injur)/i, "claims to prevent injury"],
  [/\breplaces?\s+(your\s+)?(pt|physio|physical therapist|therap|doctor|surgeon)/i, "claims to replace a clinician"],
  [/\b(no|without( a)?)\s+(need for( a)?\s+)?(pt|physical therapist|physio)\b/i, "suggests skipping the PT"],
  [/\b(clinically|scientifically|doctor)[- ](proven|approved|backed)\b/i, "claims clinical proof"],
  [/\bguarantee/i, "promises a guarantee"],
  [/\btraining[- ]rooms?\b/i, "says \"training room\""],
  [/\b(crossfit|hyrox)\b/i, "names a trademark"],
  [/\$\s?\d|\bper month\b|\/mo\b/i, "mentions a price"],
];

/** The first claim a text breaks, or null. */
export function claimProblem(text: string): string | null {
  for (const [re, why] of CLAIMS) if (re.test(text)) return why;
  return null;
}

const OWN_TAGS = new Set([
  "comeback", "comebackhealth", "comebackapp", "comebackhealthapp",
  "fitness", "health", "workout", "gym", "motivation", "fitnessmotivation", "fit", "healthy", "training",
  "crossfit", "hyrox", "physio",
]);

/** Comeback's hashtag hygiene: its own banned list first, then the shared rules (five max, no bait). */
export function cleanComebackHashtags(raw: string | null | undefined): string {
  const kept = (raw ?? "").split(/[\s,]+/).filter((t) => !OWN_TAGS.has(t.replace(/^#+/, "").toLowerCase()));
  return cleanHashtags(kept.join(" "));
}

export const DISCLAIMER = "Not medical advice. Follow your care team's guidance.";

/** The text that gets posted: caption, the disclaimer, a blank line, then the hashtags. */
export function postText(caption: string, hashtags: string | null | undefined): string {
  const tags = cleanComebackHashtags(hashtags);
  const body = `${caption.trim()}\n${DISCLAIMER}`;
  return tags ? `${body}\n\n${tags}` : body;
}

// --- holding the model to the plan -------------------------------------------

export type RawPiece = {
  slot: string;
  title: string;
  /** reel: one narration line per beat. carousel: slides. story: frames. email: [subject, preview, body]. */
  content: string[];
  captions: string[];
  hashtags: string;
  rationale: string;
};

export type PieceFields = {
  template: string;
  inputs: Record<string, string>;
  closet: string;
  title: string;
  voiceover: string[];
  captions: string[];
  hashtags: string | null;
  rationale: string | null;
};

const LIMITS = {
  carousel: { min: 5, max: 8, chars: 160 },
  story: { min: 3, max: 4, chars: 90 },
};

/**
 * Hold a drafted piece to its slot's shape and to the claims guard. Returns
 * the social_ideas row (minus brand/status), or why it was dropped. A reel
 * line may run TWO syllables over its budget, as on WhichOutfit: the counter
 * is approximate and the Mac re-measures the real audio.
 */
export function validatePiece(raw: RawPiece): PieceFields | string {
  const slot = getSlot(raw.slot);
  if (!slot) return `unknown slot ${raw.slot}`;
  const content = (raw.content ?? []).map((l) => l.trim()).filter(Boolean);

  if (slot.format === "reel") {
    const beats = slot.beats ?? [];
    if (content.length !== beats.length) return `${content.length} lines for ${beats.length} beats`;
    for (let i = 0; i < content.length; i++) {
      const over = countSyllables(content[i]) - beatBudget(beats[i]);
      if (over > 2) return `line ${i + 1} is ${over} syllables over its beat`;
    }
  } else if (slot.format === "email") {
    if (content.length !== 3) return "an email needs subject, preview and body";
    if (content[0].length > 70) return "subject over 70 characters";
    if (content[1].length > 110) return "preview over 110 characters";
    if (content[2].length > 1200) return "body over 1200 characters";
  } else {
    const lim = LIMITS[slot.format];
    if (content.length < lim.min || content.length > lim.max) return `${content.length} ${slot.format === "story" ? "frames" : "slides"}, need ${lim.min}–${lim.max}`;
    const long = content.findIndex((c) => c.length > lim.chars);
    if (long >= 0) return `${slot.format === "story" ? "frame" : "slide"} ${long + 1} over ${lim.chars} characters`;
  }

  const captions = slot.format === "email" ? [] : (raw.captions ?? []).map((c) => c.trim()).filter(Boolean).slice(0, 3);
  if (slot.format !== "email" && captions.length === 0) return "no captions";

  for (const text of [raw.title ?? "", ...content, ...captions]) {
    const problem = claimProblem(text);
    if (problem) return `${problem}: "${text.slice(0, 60)}"`;
  }

  const inputs: Record<string, string> = { phase: slot.phase, day: String(slot.day), format: slot.format };
  if (slot.source) inputs.source = slot.source;
  return {
    template: templateKey(slot),
    inputs,
    closet: "comeback",
    title: (raw.title?.trim() || slot.key).slice(0, 80),
    voiceover: content,
    captions,
    hashtags: slot.format === "email" ? null : cleanComebackHashtags(raw.hashtags) || null,
    rationale: raw.rationale?.trim() || null,
  };
}

/** What the planner reads for one slot: its job, shape and limits. */
export function slotBrief(slot: Slot): string {
  const head = `${slot.key} — ${dayLabel(slot.day)}, ${FORMATS[slot.format]}${slot.source === "you" ? " (Tyler films himself)" : slot.source === "app" ? " (screen footage of the app)" : ""}\n  job: ${slot.brief}`;
  if (slot.format === "reel") {
    const beats = (slot.beats ?? [])
      .map((s, i) => `  beat ${i + 1} (${s}s, ≤${beatBudget(s)} syl)${slot.screens?.[i] ? ` on screen: ${slot.screens[i]}` : ""}`)
      .join("\n");
    return `${head}\n  content: exactly ${slot.beats?.length} narration lines, one per beat\n${beats}`;
  }
  if (slot.format === "email") return `${head}\n  content: exactly 3 entries: [subject ≤70 chars, preview text ≤110 chars, body ≤1200 chars in short plain paragraphs separated by blank lines]`;
  const lim = LIMITS[slot.format];
  const unit = slot.format === "story" ? "frames" : "slides";
  return `${head}\n  content: ${lim.min}–${lim.max} ${unit}, each ≤${lim.chars} chars. ${slot.format === "carousel" ? 'Slide 1 is the hook (≤60 chars); each later slide is "Headline: one or two plain sentences"; the last slide is the ask.' : "Frame 1 hooks; the last frame is the ask (a link sticker)."}`;
}
