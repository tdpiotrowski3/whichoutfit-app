// Engine v2's brain: the voice-first script contract, the spoken-word lint and
// critic gate, the strategy plan and its learning, and the job the Mac gets.
import { describe, expect, it } from "vitest";
import { TEMPLATES, getTemplate, scriptFit, lineCeiling, speechSeconds, CTA_LINE, LINE_STRETCH, SYLLABLES_PER_SEC, SPEECH_FLOOR } from "../contentEngine/templates";
import {
  lintSpoken, passes, chooseScript, candidateProblem, directionFor, defaultDirection, flowInputs, cleanDirection, META,
  type ScriptCase, type Review, type Scores,
} from "../contentEngine/scriptRules";
import {
  PLAYBOOKS, buildPlan, learn, evidence, thompson, rng, weekOf, inWindow, momentsFor, openSlots, markDrafted, strategySummary,
  episodeOf, pillarOfFeature, slotBriefFor, learnings, type Outcome,
} from "../contentEngine/strategy";
import { toJsonSchema, llmProvider } from "../contentEngine/llm";
import { GOLD, REWRITES, goldFor, calibrationFor } from "../contentEngine/goldScripts";
import { draftHooks } from "../contentEngine/strategy";
import { spokenRules } from "../contentEngine/scriptRoom";
import { getSlot, seriesSlotKey, validatePiece, slotFromTemplate, claimProblem } from "../comeback/runway";

describe("the voice-first contract", () => {
  const beats = [4.1, 4.5, 3.5, 5.3]; // recut:01_rate_outfit

  it("treats a beat as an anchor: short lines pass, with no minimum", () => {
    expect(scriptFit(["Does this work?", "So I asked.", "Two pieces.", "Eighty-eight."], beats, CTA_LINE)).toBeNull();
  });

  it("caps one line at 1.6x its beat in speech time", () => {
    expect(lineCeiling(4.1)).toBe(Math.floor(4.1 * LINE_STRETCH * SYLLABLES_PER_SEC));
    const long = Array(lineCeiling(4.1) + 4).fill("go").join(" ");
    expect(scriptFit([long, "a", "b", "c"], beats, CTA_LINE)).toMatch(/line 1 is \d+ syllables over/);
  });

  it("caps the whole script plus the end card at the footage + 25%", () => {
    // Each line under its own ceiling, but together far past the footage.
    const lines = beats.map((s) => Array(lineCeiling(s) - 1).fill("go").join(" "));
    expect(scriptFit(lines, beats, CTA_LINE)).toMatch(/against 17\.4s of footage/);
    expect(speechSeconds(CTA_LINE)).toBeGreaterThan(4);
  });

  it("has a speech floor per footage kind once the kind is known", () => {
    const tiny = ["Does this work?", "So I asked.", "Two pieces.", "Eighty-eight."];
    expect(scriptFit(tiny, beats, CTA_LINE)).toBeNull(); // no kind: no floor (old callers)
    expect(scriptFit(tiny, beats, CTA_LINE, { kind: "recut" })).toMatch(/too short for the recut footage.*add about \d+ syllables/);
    // ~7s spoken over the 17.4s master: enough for a recut (mostly stills), too little for a flow (mostly scrolling).
    const mid = ["I can never tell if an outfit works.", "So I pick two pieces I'm thinking of.", "It scores the look, an 88.", "And it says what to swap."];
    const secs = mid.reduce((a, l) => a + speechSeconds(l), 0) / 17.4;
    expect(secs).toBeGreaterThan(SPEECH_FLOOR.recut - 0.03);
    expect(secs).toBeLessThan(SPEECH_FLOOR.flow);
    expect(scriptFit(mid, beats, CTA_LINE, { kind: "recut" })).toBeNull();
    expect(scriptFit(mid, beats, CTA_LINE, { kind: "flow" })).toMatch(/too short for the flow footage/);
  });

  it("puts every template's original narration above its floor", () => {
    for (const t of TEMPLATES.filter((x) => x.kind === "recut")) {
      expect(scriptFit(t.beats.map((b) => b.was), t.beats.map((b) => b.end - b.start), CTA_LINE, { kind: t.kind }), t.key).toBeNull();
    }
  });

  it("still accepts every hand-made master's original narration, so old ideas stay editable", () => {
    for (const t of TEMPLATES.filter((x) => x.kind === "recut")) {
      expect(scriptFit(t.beats.map((b) => b.was), t.beats.map((b) => b.end - b.start), CTA_LINE), t.key).toBeNull();
    }
  });
});

describe("lintSpoken", () => {
  it("passes lines a person would say", () => {
    expect(lintSpoken(["Okay, be honest. Does this actually go together?", "I can never tell, so I just ask.", "Two things from my closet, that's it.", "Eighty-eight. And it told me what to swap."], "whichoutfit")).toEqual([]);
  });

  it("catches the old budget-filling padding", () => {
    expect(lintSpoken(["So these days I just let the app go ahead and score it for me."], "whichoutfit")[0]).toMatch(/padded/);
    expect(lintSpoken(["That's it, that's literally all I gave it to work with."], "whichoutfit")[0]).toMatch(/padded/);
  });

  it("catches written English, missing contractions, ad words and unsayable punctuation", () => {
    expect(lintSpoken(["However, the closet had other ideas."], "whichoutfit")[0]).toMatch(/written English/);
    expect(lintSpoken(["I pick two pieces, and that is all it needs."], "whichoutfit")[0]).toMatch(/contracted/);
    expect(lintSpoken(["It's an effortless way to get dressed."], "whichoutfit")[0]).toMatch(/ad word/);
    expect(lintSpoken(["Eighty-eight!"], "whichoutfit")[0]).toMatch(/punctuation/);
    expect(lintSpoken(["That's what it is."], "whichoutfit")).toEqual([]);
  });

  it("never lets a script sell skipping the closet, or end on an ask", () => {
    expect(lintSpoken(["No closet needed, it just works."], "whichoutfit")[0]).toMatch(/no closet needed/);
    expect(lintSpoken(["You don't have to upload a thing."], "whichoutfit")[0]).toMatch(/skipping the closet/);
    expect(lintSpoken(["My closet isn't in yet.", "Next, I add my own pieces."], "whichoutfit")).toEqual([]);
    expect(lintSpoken(["It packed for me.", "Download it on the App Store."], "whichoutfit")[0]).toMatch(/call to action/);
  });

  it("holds Comeback to its own bans", () => {
    expect(lintSpoken(["My Garmin said I slept five hours."], "comeback")[0]).toMatch(/device or app brand/);
    expect(lintSpoken(["My watch said I slept five hours."], "comeback")).toEqual([]);
    expect(claimProblem("Straight from the training room")).toMatch(/training room/);
    expect(claimProblem("Built by an athletic trainer")).toMatch(/professional title/);
  });
});

describe("the critic's gate", () => {
  const sc: ScriptCase = {
    id: "c1", brand: "whichoutfit", about: "rate outfit", cta: CTA_LINE,
    beats: [4.1, 4.5, 3.5, 5.3].map((seconds, i) => ({ seconds, shows: `beat ${i}` })),
    candidates: [
      { voiceover: ["I changed three times this morning.", "Then I remembered I could just check.", "Picked the top, picked the jeans.", "Eighty-eight out of a hundred."], direction: "To a friend, amused.", hook: "confession" },
      { voiceover: ["It is simply the best.", "a", "b", "c"], hook: "pov" },
    ],
  };
  const good: Scores = { spoken: 5, hook: 4, sync: 4, specific: 4, payoff: 4, brand: 5 };
  const review = (over: Partial<Review> = {}): Review => ({ id: "c1", pick: 0, final: sc.candidates[0].voiceover, scores: good, notes: "", ...over });

  it("sets a bar: spoken, sync and brand each gate on their own", () => {
    expect(passes(good)).toBeNull();
    expect(passes({ ...good, spoken: 3 })).toMatch(/spoken/);
    expect(passes({ ...good, sync: 3 })).toMatch(/picture/);
    expect(passes({ ...good, brand: 3 })).toMatch(/brand/);
    expect(passes({ spoken: 4, hook: 3, sync: 4, specific: 3, payoff: 3, brand: 4 })).toMatch(/overall/);
  });

  it("keeps the picked candidate with its direction and hook", () => {
    const c = chooseScript(sc, review());
    expect(typeof c === "object" && c).toMatchObject({ direction: "To a friend, amused.", hook: "confession", edited: false });
  });

  it("takes the critic's tighter edit, but only if it still passes the rules", () => {
    const edit = ["Changed three times this morning.", "Then I just checked.", "Top, jeans.", "Eighty-eight."];
    const c = chooseScript(sc, review({ final: edit }));
    expect(typeof c === "object" && c.voiceover).toEqual(edit);
    expect(typeof c === "object" && c.edited).toBe(true);
    // An edit that breaks a rule falls back to the untouched pick.
    const bad = chooseScript(sc, review({ final: ["No closet needed.", "a", "b", "c"] }));
    expect(typeof bad === "object" && bad.voiceover).toEqual(sc.candidates[0].voiceover);
  });

  it("throws a weak script away instead of showing it", () => {
    expect(chooseScript(sc, review({ scores: { ...good, spoken: 2 }, notes: "reads like an ad" }))).toMatch(/doesn't sound spoken.*reads like an ad/);
    expect(candidateProblem(sc.candidates[1], sc)).toMatch(/padded|contracted/);
    expect(chooseScript({ ...sc, candidates: [sc.candidates[1]] }, undefined)).toMatch(/line 1/);
  });

  it("lets a clean script through, marked unreviewed, when the critic is down", () => {
    const c = chooseScript(sc, undefined);
    expect(typeof c === "object" && c.note).toMatch(/not reviewed/);
    expect(typeof c === "object" && c.scores).toBeNull();
  });
});

describe("direction", () => {
  it("is always a non-empty string, from the script or a brand default", () => {
    expect(directionFor({ occasion: "x", [META.direction]: "Telling a friend over coffee, a little amused." })).toBe("Telling a friend over coffee, a little amused.");
    expect(directionFor({ occasion: "x" })).toBe(defaultDirection("whichoutfit"));
    expect(directionFor(null, "comeback")).toBe(defaultDirection("comeback"));
    expect(cleanDirection('Say "this"\nnow')).toBe("Say this now");
  });

  it("keeps the engine's notes out of the inputs the Mac types into the app", () => {
    expect(flowInputs({ city: "Aspen, CO", _direction: "x", _pillar: "trips", _hook: "moment" })).toEqual({ city: "Aspen, CO" });
  });
});

describe("the playbooks", () => {
  it("only plans WhichOutfit episodes the engine can make, with their inputs", () => {
    for (const s of PLAYBOOKS.whichoutfit.series) {
      for (const e of s.episodes) {
        const t = getTemplate(e.template!);
        expect(t, `${s.key}:${e.key}`).toBeDefined();
        for (const need of t!.inputs) expect(e.inputs?.[need.name], `${s.key}:${e.key} ${need.name}`).toBeTruthy();
      }
    }
  });

  it("covers reach, trust and convert for both brands, with shares that sum to one", () => {
    for (const b of Object.values(PLAYBOOKS)) {
      expect(new Set(b.pillars.map((p) => p.job))).toEqual(new Set(["reach", "trust", "convert"]));
      expect(b.pillars.reduce((a, p) => a + p.share, 0)).toBeCloseTo(1);
      for (const s of b.series) expect(b.pillars.some((p) => p.key === s.pillar), s.key).toBe(true);
      for (const m of b.moments) expect(b.pillars.some((p) => p.key === m.pillar), m.key).toBe(true);
      expect(b.hooks.length).toBeGreaterThanOrEqual(6);
    }
  });

  it("keeps every word of both playbooks inside the brand rules", () => {
    const wo = PLAYBOOKS.whichoutfit;
    for (const h of wo.hooks) expect(lintSpoken([h.example], "whichoutfit"), h.key).toEqual([]);
    const cbk = PLAYBOOKS.comeback;
    for (const h of cbk.hooks) expect(lintSpoken([h.example], "comeback"), h.key).toEqual([]);
    for (const text of [...cbk.series.flatMap((s) => [s.name, s.promise, ...(s.screens ?? []), ...s.episodes.flatMap((e) => [e.label, e.angle])]), ...cbk.hooks.map((h) => h.example), ...cbk.moments.map((m) => m.steer)]) {
      expect(claimProblem(text), text).toBeNull();
    }
  });

  it("maps made ideas back to their episode and old clips to a pillar", () => {
    expect(episodeOf(PLAYBOOKS.whichoutfit, "flow:trip_packing", { city: "aspen, co" })).toBe("packing_for:aspen");
    expect(episodeOf(PLAYBOOKS.whichoutfit, "recut:01_rate_outfit")).toBe("rate_it:the_88");
    expect(episodeOf(PLAYBOOKS.whichoutfit, "flow:trip_packing", { city: "Reno, NV" })).toBeNull();
    for (const t of TEMPLATES) expect(PLAYBOOKS.whichoutfit.pillars.some((p) => p.key === pillarOfFeature(t.feature)), t.feature).toBe(true);
  });

  it("gives Comeback's series real reel slots that validate like runway pieces", () => {
    const key = seriesSlotKey("week_one_back", "the_trap");
    const slot = getSlot(key)!;
    expect(slot.format).toBe("reel");
    expect(slot.screens).toHaveLength(slot.beats!.length);
    expect(slotFromTemplate(`cb:${key}`)?.key).toBe(key);
    const v = validatePiece({
      slot: key, title: "Week one trap", captions: ["A"], hashtags: "#returntorunning", rationale: "r", direction: "Calm, to one person.",
      content: ["First week back, I ran my old pace.", "So this starts me a stage below.", "Three days, built around my week.", "Two solid weeks, then it moves me up."],
    });
    expect(typeof v === "object" && v.template).toBe(`cb:${key}`);
    expect(typeof v === "object" && v.inputs._direction).toBe("Calm, to one person.");
    expect(getSlot("s:nope:nope")).toBeUndefined();
  });
});

describe("the calendar", () => {
  it("finds the Monday of the week in Chicago time", () => {
    expect(weekOf(new Date("2026-11-16T18:00:00Z"))).toBe("2026-11-16");
    expect(weekOf(new Date("2026-11-22T23:00:00Z"))).toBe("2026-11-16"); // Sunday afternoon in Chicago
    expect(weekOf(new Date("2026-11-23T03:00:00Z"))).toBe("2026-11-16"); // still Sunday night in Chicago
  });

  it("handles windows that wrap the year", () => {
    expect(inWindow("01-10", "11-15", "03-10")).toBe(true);
    expect(inWindow("06-10", "11-15", "03-10")).toBe(false);
  });

  it("knows the season for each brand", () => {
    const keys = (brand: "whichoutfit" | "comeback", monday: string) => momentsFor(PLAYBOOKS[brand], monday).map((m) => m.key);
    expect(keys("whichoutfit", "2026-11-16")).toEqual(expect.arrayContaining(["thanksgiving", "holiday_parties", "ski_season"]));
    expect(keys("whichoutfit", "2027-06-07")).toEqual(expect.arrayContaining(["wedding_season", "summer_travel"]));
    expect(keys("comeback", "2026-12-28")).toContain("resolutions");
    expect(keys("comeback", "2027-07-05")).not.toContain("resolutions");
  });
});

describe("learning", () => {
  const o = (clip: string, score: number, extra: Partial<Outcome> = {}): Outcome => ({ clip, pillar: "trips", hook: "moment", kind: "recut", score, views: score, clicks: 0, installs: 0, ageDays: 10, ...extra });

  it("ignores clips whose numbers aren't in yet", () => {
    expect(learn([o("a", 50, { ageDays: 1 })]).mature).toBe(0);
  });

  it("counts a win as beating the median, or any click or install", () => {
    const L = learn([o("a", 10), o("b", 20), o("c", 90, { hook: "confession" }), o("d", 5, { hook: "confession", clicks: 1 })]);
    expect(L.baseline).toBe(15);
    expect(L.arms.find((a) => a.dim === "hook" && a.key === "confession")).toMatchObject({ n: 2, wins: 2 });
    expect(L.arms.find((a) => a.dim === "hook" && a.key === "moment")).toMatchObject({ n: 2, wins: 1 });
  });

  it("is honest about tiny samples", () => {
    expect([0, 1, 4, 5, 11, 12].map(evidence)).toEqual(["none", "thin", "thin", "lean", "lean", "signal"]);
    const few = buildPlan({ brand: "whichoutfit", now: new Date("2026-11-16T18:00:00Z"), outcomes: [o("a", 10), o("b", 40)] });
    expect(learnings(few)[0]).toMatch(/Too early to call anything: 2 clips have results/);
    expect(learnings({ brand: "whichoutfit", arms: [], mature: 0 })[0]).toMatch(/Nothing has results yet/);
  });

  it("draws wide for an untried arm and tight around a proven one", () => {
    const r = rng("seed");
    const untried = Array.from({ length: 400 }, () => thompson(undefined, r));
    const proven = Array.from({ length: 400 }, () => thompson({ n: 40, wins: 32 }, r));
    const spread = (xs: number[]) => Math.max(...xs) - Math.min(...xs);
    expect(spread(untried)).toBeGreaterThan(0.9);
    expect(spread(proven)).toBeLessThan(0.5);
    expect(proven.reduce((a, x) => a + x, 0) / 400).toBeGreaterThan(0.7);
  });
});

describe("the rolling plan", () => {
  const now = new Date("2026-11-16T18:00:00Z");
  const plan = buildPlan({ brand: "whichoutfit", now, launchIn: (m) => (m <= "2026-11-30" ? "closet-optional" : null), canMake: (t) => t !== "flow:no_closet" });

  it("plans six weeks of four slots, the same way every time for the same inputs", () => {
    expect(plan.weeks).toHaveLength(6);
    expect(plan.weeks[0].weekOf).toBe("2026-11-16");
    for (const w of plan.weeks) expect(w.slots).toHaveLength(4);
    expect(buildPlan({ brand: "whichoutfit", now, launchIn: (m) => (m <= "2026-11-30" ? "closet-optional" : null), canMake: (t) => t !== "flow:no_closet" }).weeks).toEqual(plan.weeks);
  });

  it("covers reach and trust every week, converts in launch weeks, and doesn't repeat itself", () => {
    for (const w of plan.weeks) {
      const jobs = w.slots.map((s) => s.job);
      expect(jobs).toContain("reach");
      expect(jobs).toContain("trust");
      if (w.launch) expect(jobs).toContain("convert");
    }
    // No episode twice in a week; the big series (trips, occasions) never repeat inside the plan.
    for (const w of plan.weeks) expect(new Set(w.slots.map((s) => `${s.series}:${s.episode}`)).size).toBe(w.slots.length);
    const big = plan.weeks.flatMap((w) => w.slots).filter((s) => ["packing_for", "what_to_wear", "closet_files"].includes(s.series)).map((s) => `${s.series}:${s.episode}`);
    expect(new Set(big).size).toBe(big.length);
  });

  it("respects the season, the filming budget and what can be made", () => {
    const slots = plan.weeks.flatMap((w) => w.slots);
    expect(slots.some((s) => s.template === "flow:no_closet")).toBe(false);
    // Nothing out of season in November–December: no spring wedding, no Lisbon.
    expect(slots.some((s) => ["spring_wedding", "lisbon", "graduation"].includes(s.episode))).toBe(false);
    for (const w of plan.weeks) expect(w.slots.filter((s) => s.template?.startsWith("flow:")).length).toBeLessThanOrEqual(2);
    expect(plan.weeks[0].theme).toMatch(/Launch/);
  });

  it("spends one slot a week on the least-tried hook and never repeats a hook in a week", () => {
    for (const w of plan.weeks) {
      expect(w.slots.filter((s) => s.explore)).toHaveLength(1);
      expect(new Set(w.slots.map((s) => s.hook)).size).toBe(w.slots.length);
    }
    const tried: Outcome[] = PLAYBOOKS.whichoutfit.hooks.filter((h) => h.key !== "test").map((h, i) => ({ clip: `c${i}`, pillar: "trips", hook: h.key, kind: "recut", score: 10 + i, views: 10, clicks: 0, installs: 0, ageDays: 9 }));
    const p2 = buildPlan({ brand: "whichoutfit", now, outcomes: tried });
    expect(p2.weeks[0].slots.find((s) => s.explore)!.hook).toBe("test");
  });

  it("keeps what is already written when it re-plans, and re-draws the rest", () => {
    const first = openSlots(plan, 2);
    const marked = markDrafted(markDrafted(plan, first[0].id, "idea-1"), first[1].id, "idea-2");
    const again = buildPlan({ brand: "whichoutfit", now: new Date("2026-11-18T18:00:00Z"), prev: marked, used: first.map((s) => `${s.series}:${s.episode}`) });
    const kept = again.weeks[0].slots.filter((s) => s.status === "drafted");
    expect(kept.map((s) => s.ideaId)).toEqual(["idea-1", "idea-2"]);
    expect(again.weeks[0].slots).toHaveLength(4);
    expect(openSlots(again, 4).every((s) => s.status === "planned")).toBe(true);
    // The following Monday the window rolls forward a week.
    expect(buildPlan({ brand: "whichoutfit", now: new Date("2026-11-23T18:00:00Z"), prev: marked }).weeks[0].weekOf).toBe("2026-11-23");
  });

  it("explains itself in three to five plain sentences", () => {
    const s = strategySummary(plan);
    expect(s.length).toBeGreaterThanOrEqual(3);
    expect(s.length).toBeLessThanOrEqual(5);
    expect(s[0]).toMatch(/^This week/);
    expect(s.join(" ")).toMatch(/Testing: the ".*" hook/);
    expect(s.join(" ")).toMatch(/Next week/);
    expect(s.join(" ")).not.toMatch(/no closet needed/i);
  });

  it("briefs the writer on the slot: series, episode, template, search phrase and hook", () => {
    const slot = plan.weeks[0].slots.find((s) => s.series === "packing_for") ?? plan.weeks[1].slots[0];
    const brief = slotBriefFor(PLAYBOOKS.whichoutfit, slot);
    expect(brief).toMatch(new RegExp(`SLOT ${slot.id}`));
    expect(brief).toMatch(/people search/);
    expect(brief).toMatch(/hook to test/);
  });

  it("plans Comeback separately, three reels a week, resolutions-first in January", () => {
    const cbPlan = buildPlan({ brand: "comeback", now: new Date("2026-12-28T18:00:00Z") });
    expect(cbPlan.brand).toBe("comeback");
    for (const w of cbPlan.weeks) expect(w.slots).toHaveLength(3);
    expect(cbPlan.weeks[0].theme).toMatch(/New Year's resolutions/);
    const all = cbPlan.weeks.flatMap((w) => w.slots);
    // Every Comeback slot is a Comeback series; none can be mistaken for a WhichOutfit template.
    expect(all.every((s) => !s.template && PLAYBOOKS.comeback.series.some((x) => x.key === s.series))).toBe(true);
    expect(all.every((s) => getSlot(seriesSlotKey(s.series, s.episode)))).toBe(true);
  });
});

describe("the provider layer", () => {
  it("uses Claude only when a key is present, Gemini otherwise", () => {
    expect(llmProvider({})).toEqual({ provider: "gemini", model: "gemini-3.8-flash" });
    expect(llmProvider({ ANTHROPIC_API_KEY: " " }).provider).toBe("gemini");
    expect(llmProvider({ ANTHROPIC_API_KEY: "sk-test" })).toEqual({ provider: "claude", model: "claude-opus-5-5" });
  });

  it("converts the engine's schemas to closed JSON Schema", () => {
    const js = toJsonSchema({ type: "OBJECT", properties: { ideas: { type: "ARRAY", items: { type: "OBJECT", properties: { n: { type: "INTEGER" }, t: { type: "STRING" } }, required: ["t"] } } }, required: ["ideas"] });
    expect(js).toEqual({
      type: "object", required: ["ideas"], additionalProperties: false,
      properties: { ideas: { type: "array", items: { type: "object", required: ["n", "t"], additionalProperties: false, properties: { n: { type: "integer" }, t: { type: "string" } } } } },
    });
  });
});

describe("the gold scripts the writer learns from", () => {
  it("has enough of them, for both brands, and every one passes the lint it teaches", () => {
    expect(GOLD.length).toBeGreaterThanOrEqual(8);
    for (const brand of ["whichoutfit", "comeback"] as const) expect(GOLD.filter((g) => g.brand === brand).length).toBeGreaterThanOrEqual(3);
    for (const g of GOLD) {
      expect(g.lines, g.clip).toHaveLength(g.screens.length);
      expect(lintSpoken(g.lines, g.brand), g.clip).toEqual([]);
      expect(lintSpoken([g.direction], g.brand).filter((p) => !/call to action/.test(p)), g.clip).toEqual([]);
      if (g.brand === "comeback") for (const l of g.lines) expect(claimProblem(l), l).toBeNull();
      // Rhythm: at least one line of five words or fewer.
      expect(Math.min(...g.lines.map((l) => l.split(/\s+/).length)), g.clip).toBeLessThanOrEqual(5);
    }
  });

  it("pairs each usual mistake with a fix that passes, and the lint catches the mistakes itself", () => {
    const caught = REWRITES.filter((r) => lintSpoken(r.bad.split(" / "), r.brand).length > 0);
    expect(caught.length).toBeGreaterThanOrEqual(REWRITES.length - 1);
    for (const r of REWRITES) expect(lintSpoken(r.good.split(" / "), r.brand), r.good).toEqual([]);
  });

  it("puts the examples in front of the writer and the critic, and no budget to fill", () => {
    const rules = spokenRules("whichoutfit");
    expect(rules).toContain(GOLD[0].lines[0]);
    expect(rules).not.toContain(GOLD.find((g) => g.brand === "comeback")!.lines[0]);
    expect(rules).not.toMatch(/80.{1,3}100%/);
    expect(goldFor("comeback")).toContain("Slept five hours. Do I still train?");
    expect(calibrationFor(["whichoutfit", "comeback"])).toMatch(/would score 5[\s\S]*are a 2/);
  });

  it("catches the ways a draft usually goes wrong", () => {
    expect(lintSpoken(["So I opened up WhichOutfit and typed it in."], "whichoutfit")[0]).toMatch(/narrates the taps/);
    expect(lintSpoken(["It built a chic, cozy look."], "whichoutfit")[0]).toMatch(/advert adjective/);
    expect(lintSpoken(["Now you can plan your week in one tap."], "whichoutfit")[0]).toMatch(/announcer/);
    expect(lintSpoken(["Have you ever stood in front of your closet?"], "whichoutfit")[0]).toMatch(/generic hook/);
    expect(lintSpoken(["I pick two pieces from mine.", "Then I tap the big button.", "It gives me back a score.", "And I see the one swap."], "whichoutfit").join(" ")).toMatch(/same length/);
    expect(lintSpoken(["Get back stronger than ever."], "comeback")[0]).toMatch(/promises an outcome/);
  });

  it("assigns each draft a different opening, the plan's hook first", () => {
    const hooks = draftHooks(PLAYBOOKS.whichoutfit, "2026-11-16:1", "stakes");
    expect(hooks).toHaveLength(3);
    expect(hooks[0].key).toBe("stakes");
    expect(new Set(hooks.map((h) => h.key)).size).toBe(3);
    expect(draftHooks(PLAYBOOKS.whichoutfit, "2026-11-16:1", "stakes")).toEqual(hooks);
    expect(draftHooks(PLAYBOOKS.comeback, "a").map((h) => h.key)).not.toEqual(draftHooks(PLAYBOOKS.comeback, "b").map((h) => h.key));
  });
});
