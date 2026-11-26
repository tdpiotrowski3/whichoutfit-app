// The writing pipeline end to end with the model stubbed out: writer reply →
// candidates → critic reply → the script that ships (or doesn't). No network,
// no database; `fetch` is replaced so both providers' wire formats are covered.
import { afterEach, describe, expect, it, vi } from "vitest";
import { writeIdeas, templateBrief, toJob, type IdeaRow } from "../contentEngine/planner";
import { getTemplate, CTA_LINE } from "../contentEngine/templates";
import { defaultDirection } from "../contentEngine/scriptRules";

const idea = (scripts: { hook: string; direction: string; voiceover: string[] }[]) => ({
  ideas: [{
    slot: "2026-11-16:2", template: "recut:01_rate_outfit", inputs: [], closet: "original", title: "The 88",
    scripts, captions: ["Does this outfit work? I asked.", "Rate my outfit, honestly.", "POV: you changed three times."],
    hashtags: "#outfitideas #ratemyoutfit #whichoutfit #fyp", rationale: "Verdict series.",
  }],
});

const padded = { hook: "moment", direction: "Brisk.", voiceover: ["I never really know if an outfit actually works on me.", "So these days I just let the app go ahead and score it for me.", "I pick just two pieces from my closet, and that is it.", "It comes back at eighty-eight out of a hundred, plus exactly what to swap."] };
const spoken = { hook: "confession", direction: "Telling a friend over coffee, a little amused at herself, easy pace.", voiceover: ["I changed three times this morning.", "Then I remembered I could just check.", "Picked the top, picked the jeans.", "Eighty-eight out of a hundred. Swap the shoes, apparently."] };

const review = (over: Record<string, unknown> = {}) => ({ reviews: [{ id: "c1", pick: 1, final: spoken.voiceover, spoken: 5, hook: 4, sync: 4, specific: 5, payoff: 4, brand: 5, notes: "Candidate 0 is padded.", ...over }] });

/** Answer the writer call, then the critic call, in the shape each provider returns. */
function stub(writer: unknown, critic: unknown | Error) {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  vi.stubGlobal("fetch", async (url: string, init: { body: string }) => {
    const body = JSON.parse(init.body) as Record<string, unknown>;
    calls.push({ url, body });
    const payload = calls.length === 1 ? writer : critic;
    if (payload instanceof Error) return new Response("down", { status: 500 });
    const text = JSON.stringify(payload);
    return Response.json(url.includes("anthropic") ? { stop_reason: "end_turn", content: [{ type: "text", text }] } : { candidates: [{ content: { parts: [{ text }] } }] });
  });
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("writeIdeas", () => {
  it("drops the padded candidate before the critic sees it and ships the one that passed, with its direction", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const calls = stub(idea([padded, spoken]), review());
    const r = await writeIdeas("Draft exactly 1 clip idea.", ["original"]);
    expect(r.dropped).toEqual([]);
    expect(r.written).toHaveLength(1);
    const f = r.written[0].fields;
    expect(f.voiceover).toEqual(spoken.voiceover);
    expect(f.inputs).toEqual({ _hook: "confession", _score: "4.5", _direction: "Telling a friend over coffee, a little amused at themselves, easy pace." });
    expect(f.hashtags).toBe("#outfitideas #ratemyoutfit");
    expect(r.written[0].slot).toBe("2026-11-16:2");
    // Two calls, both Gemini; the critic's prompt carries the screen cues and only the clean candidate.
    expect(calls).toHaveLength(2);
    expect(calls.every((c) => c.url.includes("generativelanguage"))).toBe(true);
    const criticPrompt = JSON.stringify(calls[1].body);
    expect(criticPrompt).toContain("CANDIDATE 1");
    expect(criticPrompt).not.toContain("CANDIDATE 0");
    expect(criticPrompt).toContain("end card");
  });

  it("never lets a script the critic failed reach the Studio", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    stub(idea([spoken]), review({ pick: 0, spoken: 2, notes: "Reads like an advert." }));
    const r = await writeIdeas("Draft exactly 1 clip idea.", ["original"]);
    expect(r.written).toEqual([]);
    expect(r.dropped[0]).toMatch(/The 88: critic: doesn't sound spoken \(2\/5\) — Reads like an advert/);
  });

  it("still delivers a clean script, flagged unreviewed, when the critic call fails", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    stub(idea([spoken]), new Error("down"));
    const r = await writeIdeas("Draft exactly 1 clip idea.", ["original"]);
    expect(r.written[0].reviewed).toBe(false);
    expect(r.written[0].fields.rationale).toMatch(/Not checked by the script editor/);
  });

  it("goes to Claude when a key is set: Messages API, opus, JSON-schema output, no sampling params", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
    const calls = stub(idea([spoken]), review({ pick: 0 }));
    const r = await writeIdeas("Draft exactly 1 clip idea.", ["original"]);
    expect(r.written).toHaveLength(1);
    expect(calls.map((c) => c.url)).toEqual(["https://api.anthropic.com/v1/messages", "https://api.anthropic.com/v1/messages"]);
    const body = calls[0].body as { model: string; temperature?: number; thinking?: unknown; output_config: { format: { type: string; schema: { additionalProperties: boolean } } } };
    expect(body.model).toBe("claude-opus-5-5");
    expect(body.output_config.format.type).toBe("json_schema");
    expect(body.output_config.format.schema.additionalProperties).toBe(false);
    expect(body.temperature).toBeUndefined();
    expect(body.thinking).toBeUndefined();
  });
});

describe("what the Mac gets", () => {
  const t = getTemplate("flow:trip_packing")!;
  const row = (inputs: Record<string, string>): IdeaRow => ({
    id: "1", created_at: "", status: "approved", template: t.key, inputs, closet: "menswear", title: "Aspen",
    voiceover: ["a", "b", "c", "d"], captions: ["x"], caption_pick: 0, hashtags: null, rationale: null, source: "planner", clip_id: null, error: null,
  });

  it("adds direction and cta, and keeps voiceover, job.beats, voice, inputs and closet as they were", () => {
    const job = toJob(row({ city: "Aspen, CO", _direction: "Packing the night before, talking to a friend.", _pillar: "trips", _hook: "stakes", _slot: "2026-11-16:4" }), t);
    expect(job.inputs).toEqual({ city: "Aspen, CO" });
    expect(job.direction).toBe("Packing the night before, talking to a friend.");
    expect(job.cta).toBe(CTA_LINE);
    expect(job.voice).toBe("Schedar");
    expect(job.closet).toBe("menswear");
    expect(job.voiceover).toHaveLength(job.job.beats.length);
    expect(job.meta).toEqual({ pillar: "trips", series: null, episode: null, hook: "stakes", slot: "2026-11-16:4", shot_quality: "auto" });
    // the Content Studio's per-idea shot setting reaches the Mac; anything unknown falls back to auto
    expect(toJob(row({ city: "Aspen, CO", _shot_quality: "none" }), t).meta.shot_quality).toBe("none");
    expect(toJob(row({ city: "Aspen, CO", _shot_quality: "veo" }), t).meta.shot_quality).toBe("auto");   // Veo is off
    expect(toJob(row({ city: "Aspen, CO", _shot_quality: "4k please" }), t).meta.shot_quality).toBe("auto");
  });

  it("gives an idea written before engine v2 a default direction", () => {
    expect(toJob(row({ city: "Aspen, CO" }), t).direction).toBe(defaultDirection("whichoutfit"));
  });

  it("tells the writer a ceiling per beat, never a budget to fill", () => {
    const brief = templateBrief(getTemplate("recut:01_rate_outfit")!);
    expect(brief).toMatch(/beat 1 \(4\.1s on screen, ≤28 syl\) on screen:/);
  });
});
