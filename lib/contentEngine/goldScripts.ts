import type { Brand } from "./scriptRules";

// The scripts the writer learns from. A model writes like its examples far more
// than it obeys its rules, so this file IS most of the writing quality: add a
// script here and the writer and the critic both see it on the next run.
//
// To add one: copy an entry, keep one line per beat of the clip it belongs to,
// and say in `why` what makes it work. Every GOLD script must pass the lint
// (lib/__tests__/engineBrain.test.ts checks them all), so a bad example can't
// be taught by accident. Keep them short: these are things a person says in one
// breath each, in the style of the approved promo — one person, one small
// story, problem → what I did → the turn → what I got.

export type Gold = {
  brand: Brand;
  /** What the clip shows, one phrase per beat, so the lines can be read against the picture. */
  clip: string;
  screens: string[];
  /** The opening archetype (strategy.ts hooks). */
  hook: string;
  direction: string;
  lines: string[];
  /** Why it works, in one line. */
  why: string;
};

export const GOLD: Gold[] = [
  {
    brand: "whichoutfit", clip: "Rate my outfit", hook: "confession",
    screens: ["opening screen", "tapping Test this look", "two closet pieces picked", "a score of 88 and one swap"],
    direction: "Telling a friend over coffee about her morning, a little amused at herself, easy pace.",
    lines: ["I changed three times this morning.", "So I just asked it.", "Two things from my closet. Top, jeans.", "Eighty-eight. And the one thing to swap."],
    why: "A true small moment, then four short beats; the number lands alone.",
  },
  {
    brand: "whichoutfit", clip: "Trip packing, Aspen", hook: "stakes",
    screens: ["opening screen", "Aspen, CO typed in", "the forecast: 19° and snow", "a six-piece capsule with base layers, ski socks and pajamas"],
    direction: "Packing the night before a trip, talking to whoever's sitting on the bed, dry, unbothered.",
    lines: ["Every ski trip, I forget the socks.", "So I typed in Aspen.", "Nineteen degrees. It knew before I did.", "Base layers, ski socks, even pajamas. Six pieces, and I'm done."],
    why: "Opens on the thing everyone forgets; the list at the end is three real items, not adjectives.",
  },
  {
    brand: "whichoutfit", clip: "Dress for an event, office holiday party", hook: "pov",
    screens: ["opening screen", "Dress for an Event", "'office holiday party' typed in", "an outfit from the closet: a green skirt with a black knit", "one suggested piece to finish it"],
    direction: "Reading an invite out loud to a coworker and rolling her eyes a little, light, quick.",
    lines: ["The invite says festive. Nobody knows what that means.", "So I asked.", "Office holiday party. Three words.", "The green skirt I forgot I had, with the black knit.", "And one thing it'd add. Just one."],
    why: "Line lengths go long, tiny, short, long, short; it names real pieces instead of saying 'great looks'.",
  },
  {
    brand: "whichoutfit", clip: "Closet insights", hook: "confession",
    screens: ["opening screen", "the never-worn list", "pieces not worn in ninety days, a blazer among them", "a Sell button beside each", "the category breakdown, mostly tops"],
    direction: "Admitting something to a friend who's about to see her closet, rueful, a small laugh in it.",
    lines: ["I wear about a fifth of my closet.", "It made a list of the rest. Rude.", "Ninety days, untouched. The blazer's on there.", "Sell button. Right there.", "And apparently I'm mostly tops."],
    why: "A confession, then a one-word reaction; the humour is in how short that word is.",
  },
  {
    brand: "whichoutfit", clip: "Scan an item in a shop", hook: "moment",
    screens: ["a denim jacket in a shop", "snapping a photo of it", "the app reading the piece", "'you already own this', 100% match", "the one already owned, styled"],
    direction: "Whispering to a friend in a shop while holding the hanger, conspiratorial, then caught out.",
    lines: ["I'm at the register with a denim jacket.", "Quick photo first.", "It's checking my closet.", "I already own it. Hundred percent match.", "So I put it back, and it styled the one at home."],
    why: "Present tense, in the shop; each line is exactly what's on screen as it appears.",
  },
  {
    brand: "whichoutfit", clip: "Day one, new account (closet not added yet)", hook: "confession",
    screens: ["'Today's look is ready', 40° and clear", "the outfit laid out, an ivory sweater first", "chinos, a camel coat, burgundy loafers with photos and prices", "two pinned pieces with filled hearts"],
    direction: "First week with something new, telling a friend honestly how it's going, warm, unhurried.",
    lines: ["Too busy to add my closet yet.", "Forty and clear. It dressed me anyway.", "Camel coat. Burgundy loafers.", "I pinned two. This weekend, my own clothes go in."],
    why: "Honest about day one and lands on adding her own closet next, which is the point of the app.",
  },
  {
    brand: "whichoutfit", clip: "Plan the week", hook: "moment",
    screens: ["opening screen", "one tap, the week fills in", "the forecast per day", "fog Wednesday, drizzle Thursday, clear by the weekend"],
    direction: "Sunday night on the couch, half talking to herself, relieved.",
    lines: ["Sunday night. I'm not doing this five mornings in a row.", "One tap.", "It checked the weather for every day.", "Fog Wednesday, drizzle Thursday. There's a jacket on both."],
    why: "The two-word line is the turn; the payoff reads the screen's own details back.",
  },
  {
    brand: "comeback", clip: "Week one back after time off", hook: "confession",
    screens: ["Setup: Let's meet you where you're at", "Sport and where to start", "The week, built around those days", "Solid weeks toward the next stage"],
    direction: "Someone who's watched this happen for years, telling one runner the truth kindly, calm and a little dry.",
    lines: ["First week back, I ran my old pace. Lasted four minutes.", "So this time it asked where I actually am.", "Three days. Forty minutes.", "Two solid weeks, and the next stage opens."],
    why: "The mistake everyone makes, said plainly; numbers do the persuading, no promises about the body.",
  },
  {
    brand: "comeback", clip: "Starting from scratch, day one", hook: "contrarian",
    screens: ["Setup: Let's meet you where you're at", "Starting from scratch", "Today: On track for your first 5K", "Stages up to the 5K"],
    direction: "Talking to a friend who's never run and is embarrassed about it, steady, encouraging without cheering.",
    lines: ["Day one is a walk. That's not the easy version.", "I picked starting from scratch.", "And it already says first 5K, with a date.", "Four stages. I only have to earn the next one."],
    why: "Disagrees with the idea that walking doesn't count, then shows the date on screen.",
  },
  {
    brand: "comeback", clip: "Morning call after a bad night", hook: "question",
    screens: ["Morning Brief card", "Sleep, HRV, resting heart rate", "Push / steady / easy call", "Today's session to match"],
    direction: "Seven a.m., tired, talking to a training partner over a first coffee, low and matter-of-fact.",
    lines: ["Slept five hours. Do I still train?", "It read my watch before I was up.", "Easy. It says easy today.", "So it swapped the session. I'm not arguing."],
    why: "The question people actually type; the answer is one word, then repeated the way people do.",
  },
  {
    brand: "comeback", clip: "Cleared by the PT, now what", hook: "pov",
    screens: ["PT tab: snap your sheet", "Exercises read back to check", "Uncleared moves kept out", "Two-week summary for your PT"],
    direction: "Someone from sports medicine talking to an athlete on their last day of PT, direct, on their side.",
    lines: ["Your PT hands you a sheet and says good luck.", "One photo. It reads every exercise back.", "Not cleared? It stays out.", "And my PT gets a link to all of it."],
    why: "Second person, concrete, and it keeps the clinician in charge the whole way through.",
  },
];

/** `judgment`: a taste call no lint can catch (the critic and the examples teach it instead). */
export type Rewrite = { brand: Brand; bad: string; good: string; why: string; judgment?: true };

/** The ways a draft usually goes wrong, each next to the fix. */
export const REWRITES: Rewrite[] = [
  { brand: "whichoutfit", bad: "So I opened up WhichOutfit, went to Dress for an Event, and typed in the occasion.", good: "So I asked.", why: "The screen already shows the taps. Say what you did in the fewest words; never narrate navigation." },
  { brand: "whichoutfit", bad: "It built a chic, cozy, perfectly polished look.", good: "Camel coat, the black knit, my old loafers.", why: "Stacked adjectives are an advert. Name the things on screen." },
  { brand: "whichoutfit", bad: "Getting dressed in the morning can be really stressful.", good: "It's 7:40 and I've changed twice.", why: "A general truth is not a hook. Start inside one specific minute." },
  { brand: "whichoutfit", bad: "Now you can plan your whole week of outfits in a single tap.", good: "One tap. The week's done.", why: "\"Now you can\" is an announcer. A person says what happened to them." },
  { brand: "whichoutfit", bad: "It comes back at eighty-eight out of a hundred, plus exactly what to swap.", good: "Eighty-eight. And the one thing to swap.", why: "Let the number stand alone; cut every word that only fills time." },
  { brand: "whichoutfit", bad: "I pick two pieces. / I tap the button. / I get a score. / I see the swap.", good: "Two pieces. / That's all it gets. / Eighty-eight. / Swap the shoes, apparently.", why: "Four lines the same length and shape sound like a list. Vary them: a long one, then a tiny one." },
  { brand: "whichoutfit", bad: "I've worn the same trousers four days straight.", good: "Four mornings in a row, I've grabbed the same shirt.", why: "The hook has to be a habit the viewer actually has. Nobody admits to re-wearing pants; everyone grabs the same shirt (owner, 2026-11-17).", judgment: true },
  { brand: "comeback", bad: "Comeback helps you recover smarter and get back stronger than ever.", good: "Two solid weeks, and the next stage opens.", why: "No promises about the body, ever. Say what the plan does, in its own numbers." },
  { brand: "comeback", bad: "The Morning Brief analyzes your sleep, HRV and resting heart rate to deliver a personalized recommendation.", good: "It read my watch before I was up. Easy today.", why: "That's a feature list. Say what you saw this morning." },
];

const scriptBlock = (g: Gold) =>
  `${g.clip} [${g.hook}] — on screen: ${g.screens.join(" → ")}\n${g.lines.map((l) => `    "${l}"`).join("\n")}\n    direction: ${g.direction}\n    why it works: ${g.why}`;

/** The examples block for a brand's writer: its own gold scripts, then the usual mistakes with their fixes. */
export function goldFor(brand: Brand): string {
  const gold = GOLD.filter((g) => g.brand === brand);
  const fixes = REWRITES.filter((r) => r.brand === brand);
  return `SCRIPTS THAT ARE RIGHT — write like these. Study the rhythm: lines of very different lengths, one of them tiny; real numbers and items; nothing explained twice. Never reuse their words or their opening lines.
${gold.map((g, i) => `${i + 1}. ${scriptBlock(g)}`).join("\n")}

THE USUAL MISTAKES, AND THE FIX:
${fixes.map((r) => `- Not: "${r.bad}"\n  But: "${r.good}"\n  Why: ${r.why}`).join("\n")}`;
}

/** For the critic: what a 5 and a 2 sound like, so its scores have an anchor. */
export function calibrationFor(brands: Brand[]): string {
  const five = GOLD.filter((g) => brands.includes(g.brand)).slice(0, brands.length > 1 ? 6 : 4);
  const two = REWRITES.filter((r) => brands.includes(r.brand));
  return `CALIBRATION. These would score 5 on "spoken":
${five.map((g) => `- ${g.lines.map((l) => `"${l}"`).join(" / ")}`).join("\n")}
These lines are a 2 on "spoken", and this is how each should have been said:
${two.map((r) => `- "${r.bad}" → "${r.good}" (${r.why})`).join("\n")}`;
}
