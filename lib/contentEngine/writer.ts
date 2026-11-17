import { generateJson } from "./llm";
import { FOOTAGE } from "./footage";
import { getTemplate, lineCeiling, scriptFloor, CTA_LINE, type Template } from "./templates";
import { validateIdea, type IdeaFields, type RawIdea } from "./rules";
import { spokenRules, runScriptRoom } from "./scriptRoom";
import { META, meanScore, type Candidate, type Scores, type ScriptCase } from "./scriptRules";
import { PLAYBOOKS, draftHooks, hooksLine } from "./strategy";

// WhichOutfit's writer: the prompts, and the pipeline that turns a brief into
// scripts that passed the script room. No database and no "@/" imports, so it
// runs anywhere there is a model key — the weekly planner (planner.ts), the
// Studio (studio.ts) and the offline eval (scripts/script-eval.ts) all call
// writeIdeas().

export const VOICE_RULES = `WhichOutfit builds, rates and plans outfits from the clothes you already own.
Lead with that payoff, never the technology: don't say "AI" in narration or captions unless the clip is literally about how it works, and then once at most. The viewer cares about the outfit, the trip, the event, not the model behind it.
Voice: second person or first person singular, plain, specific, a little dry, the way a person talks to a friend. Concrete details from the footage beat adjectives. No hype or AI-sounding words (game-changer, obsessed, insane, elevate, effortless, seamless, unlock, revolutionize, "say goodbye to", "level up"), no emojis, no exclamation marks in narration.
The closet is the point of the app: looks built from clothes you own. Never say or imply "no closet needed", that you don't have to add your clothes, or that skipping the closet is the idea; when a clip shows a new account, it lands on adding your own pieces next.
Never imply gender or body type; clothing talk is gender-neutral.
Never mention price, Premium, subscriptions, or downloading — a call-to-action end card is added automatically after every clip.`;

// Shared by every caption the engine writes. Platform search reads caption
// text, so a searchable phrase does more than any hashtag.
export const CAPTION_RULES = `Caption rules (Instagram and TikTok):
- The first line is the hook and must work alone; only about the first 100 characters show before "more".
- Work in one phrase people actually search, said naturally ("what to wear to a fall wedding", "capsule wardrobe for a weekend trip", "closet clean out").
- Optionally end with one low-effort prompt that earns a comment or a save ("Which one would you wear?", "Save this for your next trip"); vary it, never the same one twice in a row.
- Under 150 characters. No hashtags in the caption, no emojis, no em dashes.`;

export const HASHTAG_RULES = `Hashtags: exactly 5, lowercase, space-separated. 1–2 broad but on-niche (#outfitideas #whattowear #capsulewardrobe #closetorganization), 3–4 specific to what THIS clip shows and how someone would search for it (#weddingguestoutfit #packinglist #fallfits #thriftflip). Never: our brand (#whichoutfit), feed bait (#fyp #viral #satisfying #explore), platform names, AI/tech/app tags, or one-word giants (#fashion #style). Anything past five, or on that list, is stripped before posting.`;

export const CAPTION_SYSTEM = `${VOICE_RULES}
${CAPTION_RULES}
You write captions for clips that already exist. One caption per clip, clearly different from the previous caption you are shown — a different angle, not a rewording.`;

/** How many scripts the writer offers per idea; the critic keeps one. */
export const CANDIDATES = 3;

export const IDEA_SCHEMA = {
  type: "OBJECT",
  properties: {
    ideas: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          slot: { type: "STRING" },
          template: { type: "STRING" },
          inputs: {
            type: "ARRAY",
            items: { type: "OBJECT", properties: { name: { type: "STRING" }, value: { type: "STRING" } }, required: ["name", "value"] },
          },
          closet: { type: "STRING" },
          title: { type: "STRING" },
          scripts: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                hook: { type: "STRING" },
                direction: { type: "STRING" },
                voiceover: { type: "ARRAY", items: { type: "STRING" } },
              },
              required: ["hook", "direction", "voiceover"],
            },
          },
          captions: { type: "ARRAY", items: { type: "STRING" } },
          hashtags: { type: "STRING" },
          rationale: { type: "STRING" },
        },
        required: ["slot", "template", "inputs", "closet", "title", "scripts", "captions", "hashtags", "rationale"],
      },
    },
  },
  required: ["ideas"],
};

export const IDEA_SYSTEM = `${VOICE_RULES}

You write short vertical clips (15–30s) for WhichOutfit's Instagram and TikTok: screen footage of the app with one person's voice over it. Each idea uses one TEMPLATE from the catalog.

${spokenRules("whichoutfit")}

SCRIPTS: for every idea write ${CANDIDATES} complete scripts in "scripts". They are three different scripts, each opening with the archetype it is assigned under OPENINGS (or in its SLOT), each with its own way into the story. An editor reads them aloud and keeps one, so write three you would be glad to have picked. For each: "hook" is its archetype key, "direction" is the note for the voice, "voiceover" is the lines, one per beat.

Facts and footage:
- "on screen:" is what the viewer sees in that beat. Change the angle, the hook and the wording; keep the facts on screen, and say only what the screen shows.
- Closet: "recut" ideas are always "original" (the footage already exists). For "flow" ideas pick a closet from CLOSETS whose style suits the input — a menswear closet for a groom's-party occasion, streetwear for a concert — and spread flow ideas across different closets so the feed doesn't show one wardrobe every time. Talk about the clothes and the occasion, never the person's looks.
- For "flow" templates, the new input replaces what the footage originally showed (e.g. a new occasion instead of "outdoor summer wedding"); say the new input where the picture shows it, and leave the old one out.
- When a SLOT is given, write that slot: set "slot" to its id, use its template and inputs exactly, and tell its episode's story. With no slot, set "slot" to "".

Captions: exactly three options — [0] hook/curiosity, [1] plain and useful, [2] personal or POV.
${CAPTION_RULES}
${HASHTAG_RULES}
Title: a short internal name, 3–6 words.
Rationale: one sentence on why this idea now (the season, the series, the results), in plain words.`;

type WriterIdea = Omit<RawIdea, "voiceover" | "direction"> & { slot?: string; scripts?: Candidate[]; voiceover?: string[] };

export type Written = {
  fields: IdeaFields;
  slot: string;
  /** True when the critic tightened the script it picked. */
  edited: boolean;
  /** False when the critic could not be reached and the script went through on the lint alone. */
  reviewed: boolean;
  scores: Scores | null;
  /** The critic's one-line note. */
  note: string;
};

/**
 * What a beat shows, in words. The hand-made masters only record the line that
 * used to be narrated over each beat (footage.ts), which describes the picture
 * second-hand; newer templates describe the screen directly.
 */
function screenCue(t: Template, was: string): string {
  return t.footage in FOOTAGE ? `the moment the old narration described as "${was}"` : was;
}

/** The on-screen cue for each beat of a template, for the critic. */
export function cuesFor(t: Template, inputs: Record<string, string> = {}): ScriptCase["beats"] {
  const swap = Object.keys(inputs).length && t.kind === "flow" ? ` (this take shows ${Object.entries(inputs).map(([k, v]) => `${k} "${v}"`).join(", ")} instead of the original input)` : "";
  return t.beats.map((b) => ({ seconds: b.end - b.start, shows: `${screenCue(t, b.was)}${swap}` }));
}

/**
 * The whole writing pipeline for WhichOutfit, used by the weekly plan and by
 * every Studio action that writes a script: one writer call (several candidate
 * scripts per idea), one critic call across all of them, then the template's
 * own rules. Returns what passed and, per title, why the rest was dropped.
 * `pin` forces fields the caller already decided (a request's template, an
 * existing idea's closet) whatever the model echoed back.
 */
export async function writeIdeas(
  prompt: string,
  closets: string[],
  opts: { pin?: (raw: WriterIdea) => void; schema?: unknown } = {}
): Promise<{ written: Written[]; dropped: string[]; reply?: string; cases: ScriptCase[] }> {
  // A brief with no plan slot still gets three assigned openings, different on every call.
  const openings = /^SLOT /m.test(prompt) ? "" : `\n\nOPENINGS: ${hooksLine(draftHooks(PLAYBOOKS.whichoutfit, `${prompt.length}:${Date.now()}`))}.`;
  const r = await generateJson<{ ideas: WriterIdea[]; reply?: string }>(IDEA_SYSTEM, prompt + openings, opts.schema ?? IDEA_SCHEMA, { thinking: "high" });
  const dropped: string[] = [];
  const cases: ScriptCase[] = [];
  const raws = new Map<string, WriterIdea>();
  (r.ideas ?? []).forEach((raw, n) => {
    opts.pin?.(raw);
    const name = raw.title || raw.template;
    const t = getTemplate(raw.template);
    if (!t) return void dropped.push(`${name}: unknown template ${raw.template}`);
    // A model that ignored "scripts" and wrote one voiceover still gets judged.
    const candidates = (raw.scripts?.length ? raw.scripts : raw.voiceover ? [{ voiceover: raw.voiceover }] : []).filter((c) => Array.isArray(c.voiceover));
    if (!candidates.length) return void dropped.push(`${name}: no script written`);
    const id = `c${n + 1}`;
    const inputs = Object.fromEntries((raw.inputs ?? []).filter((i) => !i.name.startsWith("_")).map((i) => [i.name, i.value]));
    raws.set(id, raw);
    cases.push({ id, brand: "whichoutfit", about: `${t.key}: ${t.shows}`, beats: cuesFor(t, inputs), cta: CTA_LINE, kind: t.kind, candidates });
  });

  const room = await runScriptRoom(cases, VOICE_RULES);
  const written: Written[] = [];
  for (const sc of cases) {
    const raw = raws.get(sc.id)!;
    const name = raw.title || raw.template;
    const why = room.dropped.get(sc.id);
    const pick = room.chosen.get(sc.id);
    if (!pick) { dropped.push(`${name}: ${why ?? "no script passed"}`); continue; }
    const meta = [
      pick.hook && { name: META.hook, value: pick.hook.split(/[\s(]/)[0] },
      pick.scores && { name: META.score, value: meanScore(pick.scores).toFixed(1) },
    ].filter(Boolean) as { name: string; value: string }[];
    const v = validateIdea(
      { ...raw, inputs: [...(raw.inputs ?? []), ...meta], voiceover: pick.voiceover, direction: pick.direction, rationale: `${raw.rationale ?? ""}${room.reviewed ? "" : " (Not checked by the script editor: it was unavailable.)"}` },
      closets
    );
    if (typeof v === "string") dropped.push(`${name}: ${v}`);
    else written.push({ fields: v, slot: raw.slot?.trim() ?? "", edited: pick.edited, reviewed: room.reviewed, scores: pick.scores, note: pick.note });
  }
  return { written, dropped, reply: r.reply, cases };
}

export function templateBrief(t: Template): string {
  const beats = t.beats
    .map((b, i) => `  beat ${i + 1} (${(b.end - b.start).toFixed(1)}s on screen, ≤${lineCeiling(b.end - b.start)} syl) on screen: ${screenCue(t, b.was)}`)
    .join("\n");
  const inputs = t.inputs.length ? `\n  inputs: ${t.inputs.map((i) => `${i.name} — ${i.describe}`).join("; ")}` : "";
  const floor = scriptFloor(t.beats.map((b) => b.end - b.start), t.kind);
  return `${t.key} [${t.kind}] — ${t.shows}${inputs}\n${beats}\n  whole script: at least ${floor} syllables across all lines (the footage can only shrink so far)`;
}

