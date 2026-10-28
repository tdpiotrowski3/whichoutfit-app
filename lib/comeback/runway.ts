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
  // --- teaser: the problem, the founder, the waitlist ---------------------
  { key: "founder_why", day: -28, phase: "teaser", format: "reel", source: "you", beats: [4, 5, 5, 5],
    brief: "Why Comeback exists, from the Athletic Trainer who built it: when a pro athlete gets hurt they never just stop, their Athletic Trainer programs around the injury; most people get none of that." },
  { key: "gap_carousel", day: -26, phase: "teaser", format: "carousel",
    brief: "The gap between PT discharge and being ready for your sport: what PT is built to do, what it isn't, and what fills the space in between." },
  { key: "pov_cleared", day: -24, phase: "teaser", format: "reel", source: "you", beats: [4, 5, 5, 4],
    brief: "POV: your PT just said 'you're cleared'. Now what? The relatable moment of being discharged with a sheet of exercises and no plan for getting back to your sport." },
  { key: "compare_carousel", day: -21, phase: "teaser", format: "carousel",
    brief: "Why another app: your health app collects your data, Comeback plans with it. One slide per difference against your health app and typical fitness apps (brings your devices together, turns it into today's plan, starts where you are, plans around an injury, moves you up only when earned, nine sports plus strength). Fair to other apps: say 'most' or 'some', never 'none'. Last slide: the waitlist." },
  { key: "momentum_reel", day: -19, phase: "teaser", format: "reel", source: "app", beats: [4, 5, 5, 5],
    screens: ["Today tab, Momentum ring", "A week with a missed stretch", "Momentum dips, not to zero", "Momentum climbing back"],
    brief: "Momentum, not streaks: a missed week shouldn't reset you to zero. First look at the app." },
  { key: "waitlist_story", day: -17, phase: "teaser", format: "story",
    brief: "Story set that ends on the waitlist link: a poll on where people are starting from (an injury, time off, or from scratch), then the invite." },
  { key: "scratch_reel", day: -15, phase: "teaser", format: "reel", source: "app", beats: [4, 5, 5, 5],
    screens: ["Setup: Let's meet you where you're at", "Starting from scratch picked", "Stage 1: walk and easy cardio", "Stages up to a first 5K"],
    brief: "Starting from scratch: someone who has never run picks 'Starting from scratch' and gets a plan that begins with walking and builds to a first 5K, one solid week at a time. No injury needed." },
  { key: "sneak_today", day: -14, phase: "teaser", format: "reel", source: "app", beats: [4, 5, 6, 5],
    screens: ["Today tab, Morning Brief", "Check-in sliders", "Today's session built around cleared moves", "Session start"],
    brief: "Sneak peek: one morning in the app. The brief reads sleep and recovery, a ten-second check-in, and today's session is built around how you are today." },
  { key: "timeoff_carousel", day: -12, phase: "teaser", format: "carousel",
    brief: "Getting back into it after time off: why week one goes wrong (picking up where you left off), and how starting a stage lower and earning the next one keeps you going. No injury needed. General education, no medical claims." },
  { key: "two_weeks_story", day: -10, phase: "teaser", format: "story",
    brief: "Two weeks out: a behind-the-scenes look at what's being finished, plus the waitlist link." },
  { key: "founder_athletes", day: -8, phase: "teaser", format: "reel", source: "you", beats: [4, 5, 5, 5],
    brief: "What years of working with injured pro athletes taught the founder about coming back, and the one thing everyone gets wrong (treating cleared as finished)." },

  // --- reveal: one feature a day ------------------------------------------
  { key: "week_email", day: -7, phase: "reveal", format: "email",
    brief: "To the waitlist: one week to go, what's coming, and that they'll be first to know on launch day." },
  { key: "reveal_brief", day: -7, phase: "reveal", format: "reel", source: "app", beats: [4, 5, 5, 5],
    screens: ["Morning Brief card", "Sleep, HRV, resting heart rate", "Push / steady / easy call", "Today's session adjusts"],
    brief: "Feature: one daily plan from all your health data. The Morning Brief reads sleep, HRV and resting heart rate from the watch, ring, scale and food app you already use (through Apple Health or Health Connect) plus a check-in, and makes one call: push, steady or easy." },
  { key: "reveal_pt_import", day: -6, phase: "reveal", format: "reel", source: "app", beats: [4, 5, 6, 5],
    screens: ["PT tab", "Photo of a PT exercise sheet", "Exercises read back for review", "Saved to the PT list"],
    brief: "Feature: add your PT exercises in seconds by snapping the sheet your PT gave you; you check every one before it's saved." },
  { key: "reveal_sports", day: -5, phase: "reveal", format: "reel", source: "app", beats: [4, 5, 5, 5],
    screens: ["Sport picker", "Stages", "Solid weeks toward the next stage", "Full training plan"],
    brief: "Feature: your sport in stages (running, cycling, tennis, pickleball, swimming and more). The next stage opens when your PT clears it, or once you've earned it with solid weeks." },
  { key: "reveal_paths", day: -4, phase: "reveal", format: "carousel",
    brief: "Let's meet you where you're at: the three ways in (coming back from an injury or surgery, getting back into it after time off, starting from scratch), what each one changes about where the plan starts and how fast it moves up. Built by a Board Certified Athletic Trainer." },
  { key: "reveal_pt_summary", day: -3, phase: "reveal", format: "reel", source: "app", beats: [4, 5, 5, 5],
    screens: ["Pain vs training chart", "30-day view", "Two-week summary", "Share link for your PT"],
    brief: "Feature: built for your PT visits. Pain charted against training, and a two-week summary or a link to share with your physical therapist." },
  { key: "reveal_watch", day: -2, phase: "reveal", format: "reel", source: "app", beats: [4, 5, 5, 4],
    screens: ["Today session, Send to Watch", "Watch set counter", "Hold and rest timers", "Finish summary"],
    brief: "Feature: the Apple Watch companion, today's session on your wrist with set counters, hold timers and heart rate." },
  { key: "tomorrow_story", day: -1, phase: "reveal", format: "story",
    brief: "Tomorrow: countdown story set, what launches, and a reminder to turn on notifications." },

  // --- launch day -----------------------------------------------------------
  { key: "launch_hero", day: 0, phase: "launch", format: "reel", source: "app", beats: [4, 5, 5, 5, 5],
    screens: ["Let's meet you where you're at", "Pick your sport and goal", "Morning call from your health data", "Today's plan", "Stages that open when you've earned them"],
    brief: "Launch hero: Comeback Health is live. Whatever you're coming back from (an injury, time off, or starting from scratch), the story from where you start to doing what you love." },
  { key: "launch_tour_carousel", day: 0, phase: "launch", format: "carousel",
    brief: "Everything in it: a slide per pillar (three ways in, one daily plan from your health data, stages you earn, plans around an injury and your PT's exercises, nine sports, Watch), last slide where to get it." },
  { key: "launch_story", day: 0, phase: "launch", format: "story",
    brief: "Launch day story set: it's live, a link sticker to download, and a thank-you to the waitlist." },
  { key: "launch_email", day: 0, phase: "launch", format: "email",
    brief: "To the waitlist: it's live, where to download on iPhone and Android, and the first three things to do: pick where you're starting from, connect your health data, check tomorrow's morning call." },

  // --- proof: three weeks after ---------------------------------------------
  { key: "howto_setup", day: 2, phase: "proof", format: "reel", source: "app", beats: [4, 5, 5, 5],
    screens: ["Let's meet you where you're at", "Sport and goal", "Health questions or clearances", "First day's plan"],
    brief: "How to set up Comeback in under a minute from any starting point and get your first day's plan." },
  { key: "faq_carousel", day: 4, phase: "proof", format: "carousel",
    brief: "Answers to the questions people ask first: do I need an injury (no), does it replace my PT (no), which devices and apps work, which sports, does it work without a Watch." },
  { key: "week_one_reel", day: 7, phase: "proof", format: "reel", source: "you", beats: [4, 5, 5, 5],
    brief: "One week in: what the founder is hearing from the first users, told as a story. Never quote or invent a user; speak to the kinds of comebacks people are using it for." },
  { key: "nudge_email", day: 10, phase: "proof", format: "email",
    brief: "To waitlist sign-ups who haven't opened the app yet: the one-minute setup from wherever they're starting, and why a small first week beats a big one." },
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

export const VOICE_RULES = `Comeback Health meets people where they're at: coming back from an injury or surgery, getting back into it after time off, or starting from scratch. It turns the sleep and recovery data from the devices they already wear into one plan for today, and moves them up a stage once they've earned it (on the injury path, when their PT clears it). For injuries it also tracks what their physical therapist gave them and keeps uncleared moves out. Positioning line: "Your health app collects it. Comeback plans with it." Built by a Board Certified Athletic Trainer who has spent years rehabilitating professional athletes. iPhone, Apple Watch, Android and web. Sports: running, cycling, rowing, tennis, pickleball, swimming, fitness classes, functional fitness, hybrid racing.
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
