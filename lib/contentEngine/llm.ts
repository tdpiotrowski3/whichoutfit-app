import { generateJson as geminiJson } from "./gemini";

// One door for every piece of writing the content engine asks a model for.
//
//   ANTHROPIC_API_KEY set  → Claude (Messages API, raw fetch, JSON-schema output)
//   otherwise              → Gemini (gemini.ts generateJson). This is production
//                            today, and what the prompts and examples are tuned for.
//
// Writing quality is the point of the engine, so the writer, the critic and the
// planner all come through here; a Claude failure of any kind (bad key, 5xx,
// refusal, truncated JSON) falls back to Gemini rather than failing the week.
// Speech (TTS) and images stay on Gemini and do not come through here.
//
// Callers keep writing schemas in Gemini's dialect ({type: "OBJECT", ...});
// toJsonSchema() converts for Claude.

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2026-10-21";
/** Planning, writing and criticism. Override with ENGINE_CLAUDE_MODEL. */
export const CLAUDE_MODEL = "claude-opus-5-5";
const CLAUDE_TIMEOUT_MS = 150_000;

export type Provider = { provider: "claude" | "gemini"; model: string };

/** Which model the engine's writing will come from in this environment. */
export function llmProvider(env: Record<string, string | undefined> = process.env): Provider {
  if (env.ANTHROPIC_API_KEY?.trim()) return { provider: "claude", model: env.ENGINE_CLAUDE_MODEL?.trim() || CLAUDE_MODEL };
  return { provider: "gemini", model: env.ENGINE_TEXT_MODEL?.trim() || "gemini-3.8-flash" };
}

type GeminiSchema = { type?: string; properties?: Record<string, GeminiSchema>; items?: GeminiSchema; required?: string[]; enum?: string[]; description?: string };

/**
 * Gemini's schema dialect → the JSON Schema Claude's structured outputs take:
 * lowercase types, and every object closed (additionalProperties: false) with
 * all of its properties required, which is what the schemas here mean anyway.
 */
export function toJsonSchema(s: GeminiSchema): Record<string, unknown> {
  const type = (s.type ?? "string").toLowerCase();
  const out: Record<string, unknown> = { type };
  if (s.description) out.description = s.description;
  if (s.enum) out.enum = s.enum;
  if (type === "object") {
    const props = s.properties ?? {};
    out.properties = Object.fromEntries(Object.entries(props).map(([k, v]) => [k, toJsonSchema(v)]));
    out.required = Object.keys(props);
    out.additionalProperties = false;
  }
  if (type === "array") out.items = toJsonSchema(s.items ?? { type: "STRING" });
  return out;
}

export class ClaudeError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function claudeJson<T>(system: string, prompt: string, schema: unknown, model: string, effort: string): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CLAUDE_TIMEOUT_MS);
  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY!.trim(),
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
      },
      // No sampling params and no thinking config: this model rejects the
      // former and always thinks; depth is set by effort alone.
      body: JSON.stringify({
        model,
        max_tokens: 16000,
        system,
        messages: [{ role: "user", content: prompt }],
        output_config: { effort, format: { type: "json_schema", schema: toJsonSchema(schema as GeminiSchema) } },
      }),
    });
    if (!res.ok) throw new ClaudeError(`Claude ${model} ${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}`, res.status);
    const json = (await res.json()) as { stop_reason?: string; content?: { type: string; text?: string }[] };
    // A refusal or a cut-off reply is HTTP 200 with JSON that may not match the schema.
    if (json.stop_reason === "refusal" || json.stop_reason === "max_tokens") throw new ClaudeError(`Claude ${model} stopped: ${json.stop_reason}`, 502);
    const text = (json.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("").trim();
    if (!text) throw new ClaudeError(`Claude ${model} returned no text`, 502);
    return JSON.parse(text) as T;
  } finally {
    clearTimeout(timer);
  }
}

export type LlmOptions = {
  /**
   * How hard to think. The critic and the writer run at "medium" (the model's
   * default); set ENGINE_CLAUDE_EFFORT to change both. Ignored by Gemini.
   */
  effort?: "low" | "medium" | "high";
  /** Gemini's thinking level for this call (gemini.ts). Scripts and critique ask for "high". Ignored by Claude. */
  thinking?: "minimal" | "low" | "medium" | "high";
};

/** One structured-JSON generation from whichever provider this environment has. */
export async function generateJson<T>(system: string, prompt: string, schema: unknown, opts: LlmOptions = {}): Promise<T> {
  const p = llmProvider();
  if (p.provider === "claude") {
    try {
      return await claudeJson<T>(system, prompt, schema, p.model, process.env.ENGINE_CLAUDE_EFFORT?.trim() || opts.effort || "medium");
    } catch (e) {
      // Never lose the week to one provider; say so in the logs and carry on.
      console.warn(`content engine: Claude failed, falling back to Gemini — ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return geminiJson<T>(system, prompt, schema, { thinking: opts.thinking });
}
