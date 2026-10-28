// Comeback is a health product, so the guard on what the model writes is
// tested rather than trusted: no recovery promises, no clinician replacement,
// no trademarks, and every piece held to its slot's shape.
import { describe, expect, it } from "vitest";
import {
  RUNWAY, PHASES, beatBudget, claimProblem, cleanComebackHashtags, dateFor, dayLabel,
  postText, slotFromTemplate, templateKey, validatePiece, DISCLAIMER, type RawPiece,
  scheduleRunway, fullRunwayLaunch, daysBetween,
} from "../comeback/runway";
import { countSyllables } from "../contentEngine/templates";

const reel = RUNWAY.find((s) => s.key === "reveal_brief")!;

function piece(slot: string, content: string[], extra: Partial<RawPiece> = {}): RawPiece {
  return { slot, title: "A piece", content, captions: ["Hook", "Plain", "POV"], hashtags: "#injuryrecovery #returntosport", rationale: "Why.", ...extra };
}

/** Lines that fill each beat without going over. */
const fitting = (beats: number[]) => beats.map((s) => Array(Math.max(1, beatBudget(s) - 2)).fill("go").join(" "));

describe("the plan", () => {
  it("has unique keys, every phase used, and runs in day order within a phase", () => {
    expect(new Set(RUNWAY.map((s) => s.key)).size).toBe(RUNWAY.length);
    for (const p of PHASES) expect(RUNWAY.some((s) => s.phase === p.key)).toBe(true);
    for (let i = 1; i < RUNWAY.length; i++) expect(RUNWAY[i].day).toBeGreaterThanOrEqual(RUNWAY[i - 1].day);
  });

  it("gives every reel beats, and app reels a screen per beat", () => {
    for (const s of RUNWAY.filter((x) => x.format === "reel")) {
      expect(s.beats?.length).toBeGreaterThanOrEqual(4);
      if (s.source === "app") expect(s.screens?.length).toBe(s.beats?.length);
      expect(s.source).toBeDefined();
    }
  });

  it("puts pre-launch in negative days and launch day at 0", () => {
    for (const s of RUNWAY) {
      if (s.phase === "teaser" || s.phase === "reveal") expect(s.day).toBeLessThan(0);
      if (s.phase === "launch") expect(s.day).toBe(0);
      if (s.phase === "proof") expect(s.day).toBeGreaterThan(0);
    }
  });

  it("round-trips slot keys through the template column", () => {
    for (const s of RUNWAY) expect(slotFromTemplate(templateKey(s))?.key).toBe(s.key);
    expect(slotFromTemplate("recut:01_rate_outfit")).toBeUndefined();
  });
});

describe("dates", () => {
  it("labels and dates days across a month boundary", () => {
    expect(dayLabel(-28)).toBe("T-28");
    expect(dayLabel(0)).toBe("Launch day");
    expect(dayLabel(4)).toBe("T+4");
    expect(dateFor("2026-12-01", -28)).toBe("2026-11-03");
    expect(dateFor("2026-12-01", 21)).toBe("2026-12-22");
  });
});

describe("validatePiece", () => {
  it("accepts a reel that fits its beats and tags it with phase, day and source", () => {
    const v = validatePiece(piece(reel.key, fitting(reel.beats!)));
    expect(typeof v).toBe("object");
    if (typeof v === "string") return;
    expect(v.template).toBe("cb:reveal_brief");
    expect(v.inputs).toEqual({ phase: "reveal", day: "-7", format: "reel", source: "app" });
    expect(v.closet).toBe("comeback");
  });

  it("rejects a reel with the wrong line count or an overlong line", () => {
    expect(validatePiece(piece(reel.key, fitting(reel.beats!).slice(1)))).toMatch(/lines for/);
    const long = fitting(reel.beats!);
    long[0] = "this line goes on and on and on and on and on and on and on and on";
    expect(countSyllables(long[0])).toBeGreaterThan(beatBudget(reel.beats![0]) + 2);
    expect(validatePiece(piece(reel.key, long))).toMatch(/syllables over/);
  });

  it("holds carousels, stories and emails to their shape", () => {
    expect(validatePiece(piece("gap_carousel", ["one", "two"]))).toMatch(/slides/);
    expect(typeof validatePiece(piece("gap_carousel", ["Hook", "A: b.", "C: d.", "E: f.", "Join the waitlist"]))).toBe("object");
    expect(validatePiece(piece("waitlist_story", ["x".repeat(91), "b", "c"]))).toMatch(/frame 1 over/);
    expect(validatePiece(piece("week_email", ["Subject", "Preview"]))).toMatch(/subject, preview and body/);
    const email = validatePiece(piece("week_email", ["One week", "What's coming", "Hi,\n\nSoon.\n\nTyler"], { captions: [] }));
    expect(typeof email).toBe("object");
    if (typeof email !== "string") expect(email.hashtags).toBeNull();
  });

  it("rejects an unknown slot", () => {
    expect(validatePiece(piece("nope", ["a"]))).toMatch(/unknown slot/);
  });

  it("rejects a health claim anywhere in the piece", () => {
    const lines = fitting(reel.beats!);
    lines[2] = "so you heal faster";
    expect(validatePiece(piece(reel.key, lines))).toMatch(/faster recovery/);
    expect(validatePiece(piece(reel.key, fitting(reel.beats!), { captions: ["It replaces your physical therapist"] }))).toMatch(/replace a clinician/);
  });
});

describe("claimProblem", () => {
  it.each([
    ["Recover faster after ACL surgery", "promises faster recovery"],
    ["The app that cures back pain", "says it cures"],
    ["Prevents injury before it starts", "claims to prevent injury"],
    ["No need for a PT anymore", "suggests skipping the PT"],
    ["Clinically proven programs", "claims clinical proof"],
    ["Built for CrossFit athletes", "names a trademark"],
    ["Only $9.99 a month", "mentions a price"],
    ["The Athletic Training room approach", 'says "training room"'],
  ])("flags %s", (text, why) => {
    expect(claimProblem(text)).toBe(why);
  });

  it.each([
    "Train around what's healing, with what your PT cleared",
    "Works with your physical therapist, not instead of them",
    "Back to running after knee surgery, in stages",
    "Built by a Board Certified Athletic Trainer",
  ])("lets %s through", (text) => {
    expect(claimProblem(text)).toBeNull();
  });
});

describe("hashtags and post text", () => {
  it("drops our brand, giants and trademarks, then applies the shared rules", () => {
    expect(cleanComebackHashtags("#comeback #comebackhealth #fitness #crossfit #fyp #aclrecovery #returntosport")).toBe("#aclrecovery #returntosport");
  });

  it("always carries the disclaimer", () => {
    expect(postText("Cleared by PT. Now what?", "#returntosport")).toBe(`Cleared by PT. Now what?\n${DISCLAIMER}\n\n#returntosport`);
    expect(postText("No tags", "")).toBe(`No tags\n${DISCLAIMER}`);
  });
});

describe("scheduleRunway", () => {
  const today = "2026-10-28";
  const dates = (m: ReturnType<typeof scheduleRunway>) => RUNWAY.map((s) => m.get(s.key)!.date);

  it("keeps every planned day when launch is far enough out", () => {
    const launch = fullRunwayLaunch(today);
    expect(launch).toBe("2026-11-28");
    const m = scheduleRunway(launch, today);
    for (const s of RUNWAY) expect(m.get(s.key)).toEqual({ day: s.day, date: dateFor(launch, s.day), moved: false });
  });

  it("squeezes the teaser into the lead time..T-8 and keeps reveal week whole (Nov 16 launch)", () => {
    const m = scheduleRunway("2026-11-16", today);
    const all = dates(m);
    expect(all.every((d) => d >= "2026-10-31")).toBe(true);
    expect([...all].sort()).toEqual(all); // order survives
    const teaser = RUNWAY.filter((s) => s.phase === "teaser").map((s) => m.get(s.key)!);
    expect(teaser[0].date).toBe("2026-10-31");
    expect(teaser[teaser.length - 1].day).toBe(-8);
    expect(teaser.every((t) => t.moved || t.day === -8)).toBe(true);
    for (const s of RUNWAY.filter((x) => x.day >= -7)) expect(m.get(s.key)).toMatchObject({ day: s.day, moved: false });
  });

  it("shares the last days among every pre-launch piece when launch is under a week out", () => {
    const m = scheduleRunway("2026-11-02", today);
    const pre = RUNWAY.filter((s) => s.day < 0).map((s) => m.get(s.key)!);
    expect(pre[0].date).toBe("2026-10-31");
    expect(pre[pre.length - 1].day).toBe(-1);
    expect(pre.every((p) => p.date >= "2026-10-31" && p.date < "2026-11-02")).toBe(true);
    expect(m.get("launch_hero")!.date).toBe("2026-11-02");
  });

  it("leaves a past launch alone rather than inventing dates", () => {
    const m = scheduleRunway("2026-10-01", today);
    for (const s of RUNWAY) expect(m.get(s.key)!.moved).toBe(false);
  });

  it("counts days across a month end", () => {
    expect(daysBetween("2026-10-28", "2026-11-16")).toBe(19);
  });
});
