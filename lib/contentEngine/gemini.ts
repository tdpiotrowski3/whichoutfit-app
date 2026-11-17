// Gemini calls for the content engine: structured-JSON text for the planner and
// text-to-speech for narration. Raw fetch against AI Studio with GEMINI_API_KEY,
// the same arrangement as lib/receiptParser.ts. Model rules from FitCheck's
// supabase/functions/_shared/gemini.ts apply here too: no temperature/topP/topK,
// thinkingLevel lives INSIDE thinkingConfig and is "low" for text, and a
// retired model (404) gets exactly one retry on the fallback.

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

/** The stylist's model (picked by eval 2026-10-06); flash-lite is the cheap fallback. */
const TEXT_MODELS = [process.env.ENGINE_TEXT_MODEL || "gemini-3.8-flash", "gemini-3.1-flash-lite"];

/**
 * TTS models in preference order. Each has its OWN 100/day free bucket, so a
 * day's quota on the first falls through to the second instead of failing.
 */
const TTS_MODELS = [process.env.ENGINE_TTS_MODEL || "gemini-3.1-flash-tts-preview", "gemini-2.5-flash-preview-tts"];

/** The default narrator (warm, female), nearest to CapCut's Calm Host. Closets can override it (personas.ts). */
export const VOICE = process.env.ENGINE_VOICE || "Sulafat";

function key(): string {
  const k = process.env.GEMINI_API_KEY;
  if (!k) throw new Error("Missing GEMINI_API_KEY env var");
  return k;
}

export class GeminiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Seconds Google asked us to wait, when it said. */
    readonly retryAfter: number | null = null
  ) {
    super(message);
  }
}

async function call(model: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE}/${model}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": key(), "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.ok) return (await res.json()) as Record<string, unknown>;
  const text = await res.text().catch(() => "");
  // 429s carry RetryInfo.retryDelay like "16s" (per-minute) or "79200s" (daily).
  const delay = text.match(/"retryDelay":\s*"(\d+(?:\.\d+)?)s"/);
  throw new GeminiError(`Gemini ${model} ${res.status}: ${text.slice(0, 300)}`, res.status, delay ? Number(delay[1]) : null);
}

/** A 429 whose wait is hours long is the DAILY bucket — waiting it out is pointless. */
function isDailyQuota(e: unknown): boolean {
  return e instanceof GeminiError && e.status === 429 && (e.retryAfter ?? 0) > 600;
}

function textOf(json: Record<string, unknown>): string {
  const cands = json.candidates as { content?: { parts?: { text?: string }[] } }[] | undefined;
  return (cands?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
}

export type JsonOptions = {
  /**
   * How hard the model thinks before answering. "low" suits extraction and
   * captions; scripts and their critique use "high" (llm.ts), where judgment is
   * the whole job. Gemini 2.x has no levels and runs without thinking.
   */
  thinking?: "minimal" | "low" | "medium" | "high";
};

/**
 * One structured-JSON generation, schema-enforced.
 *
 * Sampling is left at Gemini's defaults on purpose (temperature 1.0): Gemini 3
 * is tuned for it, lower values make it loop and flatten, and the house rule
 * above is to send no temperature/topP/topK. Variety between a script's drafts
 * comes from the prompt instead: each draft is assigned a different opening
 * archetype in code (strategy.ts draftHooks).
 */
export async function generateJson<T>(system: string, prompt: string, schema: unknown, opts: JsonOptions = {}): Promise<T> {
  let last: unknown;
  const want = (process.env.ENGINE_TEXT_THINKING as JsonOptions["thinking"]) || opts.thinking || "low";
  for (const model of TEXT_MODELS) {
    // A level this model doesn't take is a 400; fall back to "low" once rather than fail the call.
    for (const level of want === "low" ? ["low"] : [want, "low"]) {
      try {
        const json = await call(model, {
          system_instruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: schema,
            thinkingConfig: model.startsWith("gemini-2") ? { thinkingBudget: 0 } : { thinkingLevel: level },
          },
        });
        const text = textOf(json).replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
        if (!text) throw new Error("Gemini returned no content (blocked or truncated).");
        return JSON.parse(text) as T;
      } catch (e) {
        last = e;
        if (e instanceof GeminiError && e.status === 400 && level !== "low" && /thinking/i.test(e.message)) continue;
        // Only a retired model or an exhausted day moves on; anything else is a real failure.
        if (!(e instanceof GeminiError && (e.status === 404 || isDailyQuota(e)))) throw e;
        break;
      }
    }
  }
  throw last;
}

/**
 * Image models, as in FitCheck _shared/gemini.ts: nano-banana first, capped at
 * 40s because newer image models stall 80–95s on roughly one call in seven, then
 * the fallback. `minimal` thinking is ~8s and plenty for a product shot.
 */
const IMAGE_MODELS = [process.env.ENGINE_IMAGE_MODEL || "gemini-nano-banana-2.1", "gemini-3.1-flash-lite-image"];
const IMAGE_TIMEOUT_MS = 40_000;

export type GeneratedImage = { data: string; mimeType: string; model: string };

/** One generated image (base64), for the persona closets. */
export async function generateImage(prompt: string): Promise<GeneratedImage> {
  let last: unknown;
  for (const model of IMAGE_MODELS) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), IMAGE_TIMEOUT_MS);
    try {
      const res = await fetch(`${BASE}/${model}:generateContent`, {
        method: "POST",
        signal: ctrl.signal,
        headers: { "x-goog-api-key": key(), "content-type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { responseModalities: ["IMAGE"], thinkingConfig: { thinkingLevel: "minimal" } },
        }),
      });
      if (!res.ok) throw new GeminiError(`Gemini ${model} ${res.status}: ${(await res.text()).slice(0, 300)}`, res.status);
      const json = (await res.json()) as { candidates?: { content?: { parts?: { inlineData?: { mimeType?: string; data?: string } }[] } }[] };
      const img = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData;
      if (!img?.data) throw new GeminiError(`Gemini ${model} returned no image`, 502);
      return { data: img.data, mimeType: img.mimeType ?? "image/png", model };
    } catch (e) {
      last = e; // timeout, retired model, or a bad generation: the fallback gets one go
    } finally {
      clearTimeout(timer);
    }
  }
  throw last;
}

export type Speech = {
  /** Raw 16-bit little-endian mono PCM, base64. */
  pcm: string;
  sampleRate: number;
  /** Which model actually spoke — a voice that changes partway through a batch is worth knowing. */
  model: string;
  voice: string;
  /** True when the take was performed from a director's note; false for the legacy quoted-line read. */
  directed: boolean;
};

/**
 * Delivery notes, by name, so the Mac can A/B them (`voice` route's `style`)
 * without a deploy. Every one asks for a brisk pace: narration is laid onto
 * fixed footage, and an "unhurried" note ran ~2.8 syllables/sec against the
 * ~4.4 the beats are budgeted for.
 */
export const STYLES = {
  even: "Read this the way a real person says it out loud — ordinary sentence stress, no word punched or drawn out, no dramatic pauses, relaxed and low-key, at a brisk conversational pace:",
  memo: "Read this like a quick, offhand voice memo to a friend — understated, a little flat, nothing emphasized more than normal speech, at a brisk pace:",
  friend: "Say this casually, like you're telling a friend about something you just tried — relaxed, smooth and natural, not like an announcer or an ad, at a brisk conversational pace:",
} as const;
export type SpeechStyle = keyof typeof STYLES;
export const DEFAULT_STYLE: SpeechStyle = "even";

/**
 * The director's note a clip gets when its job carries none (`job.direction`).
 * Written the way Gemini TTS takes direction: who is talking, to whom, in what
 * mood, at what pace. Not a list of things to avoid: "no dramatic pauses, no
 * word punched" still produced a read-aloud voice that rose ~9 semitones into
 * every comma (measured on the 2026-11-16 day-one cut).
 */
export const DEFAULT_DIRECTION =
  "She is showing a friend something on her phone and talking over the screen as she scrolls. " +
  "Unscripted and low-key, like a voice note: she already knows what she is going to say, so thoughts run on " +
  "and sentences fall at the end. Commas are barely a pause and never a rise. Quick, easy pace, about three words a second. " +
  "The last sentence is a recommendation to that friend, said in the same breath and the same voice, not an advert.";

/** Longest director's note the voice route accepts. */
export const MAX_DIRECTION = 400;

/**
 * The prompt for a directed read: scene and notes first, the transcript last
 * under its own heading (the layout Gemini's TTS guide uses). The whole script
 * is one performance, so the voice keeps one breath and one pitch range from the
 * first line to the end card.
 */
export function directedPrompt(transcript: string, direction: string = DEFAULT_DIRECTION): string {
  return [
    "Perform the transcript below as one natural take. Speak only the transcript's words, exactly as written.",
    "",
    "# SCENE",
    "A short vertical video for Instagram and TikTok: a phone screen recording of an app, with one person talking over it. " +
      "The listener is one person, phone in hand, sound on. (Both brands use this: the note below says who is talking.)",
    "",
    "# DIRECTOR'S NOTES",
    direction.trim(),
    "",
    "# TRANSCRIPT",
    transcript,
  ].join("\n");
}

/**
 * Speak narration. Two ways to ask:
 *
 *   directed (`direction` given, or "" for the default note) — a whole script in
 *     one take, performed from a director's note. What the voice-first renderer
 *     uses.
 *   legacy (no `direction`) — one quoted line behind a style note. Kept so a
 *     renderer that predates `direction` gets exactly what it got before. The
 *     line is quoted and never last, because a trailing word like "start" or
 *     "so" can read as an instruction and make the model answer in text (a 400).
 *
 * A directed take that comes back with no audio (the model answered in text)
 * falls back to the legacy framing once, so a render never dies on the prompt.
 */
export async function speak(
  line: string,
  voice: string = VOICE,
  style: SpeechStyle = DEFAULT_STYLE,
  direction?: string | null
): Promise<Speech> {
  const directed = direction !== undefined && direction !== null;
  if (directed) {
    try {
      return { ...(await generateSpeech(directedPrompt(line, direction.trim() || DEFAULT_DIRECTION), voice)), directed: true };
    } catch (e) {
      // Quota and rate limits are not the prompt's fault; only a refusal to speak is.
      if (!(e instanceof GeminiError && (e.status === 400 || e.status === 502))) throw e;
    }
  }
  // Pace matters as much as tone: the first live test with "unhurried" in this
  // note ran ~2.8 syllables/sec. The "friend" note alone made every voice lean
  // hard on the most interesting word ("a GALLERY opening"), which the owner
  // heard as fake. "even" asks for ordinary sentence stress.
  return { ...(await generateSpeech(`${STYLES[style]} "${line}" (read only the quoted words)`, voice)), directed: false };
}

async function generateSpeech(prompt: string, voice: string): Promise<Omit<Speech, "directed">> {
  let last: unknown;
  for (const model of TTS_MODELS) {
    try {
      const json = await call(model, {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
        },
      });
      const cands = json.candidates as { content?: { parts?: { inlineData?: { mimeType?: string; data?: string } }[] } }[];
      const inline = cands?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData;
      if (!inline?.data) throw new GeminiError(`Gemini ${model} returned no audio`, 502);
      const rate = Number(inline.mimeType?.match(/rate=(\d+)/)?.[1] ?? 24000);
      return { pcm: inline.data, sampleRate: rate, model, voice };
    } catch (e) {
      last = e;
      if (!(e instanceof GeminiError && (e.status === 404 || isDailyQuota(e)))) throw e;
    }
  }
  throw last;
}
