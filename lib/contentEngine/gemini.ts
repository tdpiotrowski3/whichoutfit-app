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

/** The narrator. Warm and unhurried, the nearest Gemini voice to CapCut's Calm Host. */
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

/** One structured-JSON generation, schema-enforced. */
export async function generateJson<T>(system: string, prompt: string, schema: unknown): Promise<T> {
  let last: unknown;
  for (const model of TEXT_MODELS) {
    try {
      const json = await call(model, {
        system_instruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: schema,
          thinkingConfig: model.startsWith("gemini-2") ? { thinkingBudget: 0 } : { thinkingLevel: "low" },
        },
      });
      const text = textOf(json).replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
      if (!text) throw new Error("Gemini returned no content (blocked or truncated).");
      return JSON.parse(text) as T;
    } catch (e) {
      last = e;
      // Only a retired model or an exhausted day moves on; anything else is a real failure.
      if (!(e instanceof GeminiError && (e.status === 404 || isDailyQuota(e)))) throw e;
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
};

/**
 * Speak one line. The style note goes in the prompt; the line itself is quoted
 * and never last, because a trailing word like "start" or "so" can read as an
 * instruction and make the model answer in text (a 400) instead of speaking.
 */
export async function speak(line: string): Promise<Speech> {
  const prompt = `Read this line as a calm, warm, friendly host talking to one person, unhurried and natural: "${line}" (read only the quoted words)`;
  let last: unknown;
  for (const model of TTS_MODELS) {
    try {
      const json = await call(model, {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } },
        },
      });
      const cands = json.candidates as { content?: { parts?: { inlineData?: { mimeType?: string; data?: string } }[] } }[];
      const inline = cands?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData;
      if (!inline?.data) throw new GeminiError(`Gemini ${model} returned no audio`, 502);
      const rate = Number(inline.mimeType?.match(/rate=(\d+)/)?.[1] ?? 24000);
      return { pcm: inline.data, sampleRate: rate, model };
    } catch (e) {
      last = e;
      if (!(e instanceof GeminiError && (e.status === 404 || isDailyQuota(e)))) throw e;
    }
  }
  throw last;
}
