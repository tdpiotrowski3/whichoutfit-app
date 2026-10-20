// The content engine books real posts into a public calendar, so the date maths
// and the guard on what the model writes are tested here rather than trusted.
import { describe, expect, it } from "vitest";
import { nextSlots, runwayDays, slotsToFill } from "../contentEngine/schedule";
import { countSyllables, syllableBudget, TEMPLATES, getTemplate } from "../contentEngine/templates";
import { featureOf, scoreClip, validateIdea } from "../contentEngine/rules";
import { PERSONAS, getPersona, itemId, garmentPrompt, personaEmail } from "../contentEngine/personas";

const iso = (d: Date) => d.toISOString();

describe("nextSlots", () => {
  it("follows Tue/Thu/Sat at 5pm Central after the last booked post", () => {
    // Tue 2026-11-24 5pm CST, the last slot in the current calendar.
    const slots = nextSlots(new Date("2026-11-24T23:00:00Z"), 3);
    expect(slots.map(iso)).toEqual(["2026-11-26T23:00:00.000Z", "2026-11-28T23:00:00.000Z", "2026-12-01T23:00:00.000Z"]);
  });

  it("is 5pm local on both sides of the DST change", () => {
    // Sat 2026-10-31 is CDT (UTC-5), Tue 2026-11-03 is CST (UTC-6).
    const slots = nextSlots(new Date("2026-10-30T12:00:00Z"), 2);
    expect(slots.map(iso)).toEqual(["2026-10-31T22:00:00.000Z", "2026-11-03T23:00:00.000Z"]);
  });

  it("skips slots that are already taken", () => {
    const taken = [new Date("2026-11-26T23:00:00Z")];
    const slots = nextSlots(new Date("2026-11-24T23:00:00Z"), 1, taken);
    expect(iso(slots[0])).toBe("2026-11-28T23:00:00.000Z");
  });

  it("never returns the instant it starts from", () => {
    const slots = nextSlots(new Date("2026-11-26T23:00:00Z"), 1);
    expect(iso(slots[0])).toBe("2026-11-28T23:00:00.000Z");
  });
});

describe("runway", () => {
  const now = new Date("2026-11-20T12:00:00Z");
  const booked = [new Date("2026-11-21T23:00:00Z"), new Date("2026-11-24T23:00:00Z")];

  it("counts whole days to the last booked post", () => {
    expect(runwayDays(now, booked)).toBe(4);
    expect(runwayDays(now, [])).toBe(0);
  });

  it("asks for enough slots to reach 14 days out", () => {
    // Free slots after Nov 24 up to Dec 4: Nov 26, Nov 28, Dec 1, Dec 3.
    expect(slotsToFill(now, booked)).toBe(4);
  });

  it("asks for nothing when the queue already reaches far enough", () => {
    expect(slotsToFill(new Date("2026-10-19T12:00:00Z"), booked)).toBe(0);
  });
});

describe("syllables", () => {
  it("counts close enough to budget against", () => {
    expect(countSyllables("Every look is built from clothes you already own")).toBeGreaterThanOrEqual(10);
    expect(countSyllables("Every look is built from clothes you already own")).toBeLessThanOrEqual(13);
    expect(countSyllables("It gave me an 88")).toBe(6);
  });

  it("budgets each beat to land half a second short at 4.4 syl/s", () => {
    expect(syllableBudget({ start: 0, end: 5.1 })).toBe(20);
    expect(syllableBudget({ start: 0, end: 1 })).toBe(4); // floor, never zero
  });
});

describe("templates", () => {
  it("has a recut for every master clip and the two flows", () => {
    expect(getTemplate("flow:dress_for_event")?.inputs[0].name).toBe("occasion");
    expect(getTemplate("recut:06_resale_listing")?.beats).toHaveLength(5);
    expect(TEMPLATES.every((t) => t.beats.length >= 3)).toBe(true);
  });
});

describe("validateIdea", () => {
  const good = {
    template: "flow:dress_for_event",
    inputs: [{ name: "occasion", value: "first date at a wine bar" }],
    title: "Wine bar date",
    voiceover: [
      "Date tonight, and the closet is staring back at you.",
      "So open Dress for an Event and type the plan.",
      "First date at a wine bar, nothing more to say.",
      "Each look comes from things you already own.",
      "And the one piece that would finish it.",
    ],
    captions: ["A", "B", "C"],
    hashtags: "#whichoutfit #datenight",
    rationale: "Dress for event performs.",
  };

  it("accepts an idea that fits its template", () => {
    const v = validateIdea(good);
    expect(typeof v).toBe("object");
    if (typeof v === "object") expect(v.inputs).toEqual({ occasion: "first date at a wine bar" });
  });

  it("rejects the wrong number of lines", () => {
    expect(validateIdea({ ...good, voiceover: good.voiceover.slice(0, 4) })).toMatch(/4 lines for 5 beats/);
  });

  it("rejects a line that overruns its beat", () => {
    const long = [...good.voiceover];
    long[0] = "The invitation arrived several weeks ago and somehow you still have absolutely nothing whatsoever to wear tonight";
    expect(validateIdea({ ...good, voiceover: long })).toMatch(/line 1 is \d+ syllables over/);
  });

  it("rejects missing inputs and unknown templates", () => {
    expect(validateIdea({ ...good, inputs: [] })).toMatch(/missing input occasion/);
    expect(validateIdea({ ...good, template: "flow:nope" })).toMatch(/unknown template/);
  });
});

describe("featureOf / scoreClip", () => {
  it("maps hand-made, engine-made and re-posted clips to a feature", () => {
    expect(featureOf("13_photo_cleanup_real")).toBe("photo_cleanup");
    expect(featureOf("dress_for_event_a1b2c3")).toBe("dress_for_event");
    expect(featureOf("09_color_season_r2")).toBe("color_season");
  });

  it("weights installs and clicks far above views", () => {
    const base = { views: 0, likes: 0, saves: 0, shares: 0, clicks: 0, installs: 0 };
    expect(scoreClip({ ...base, installs: 1 })).toBeGreaterThan(scoreClip({ ...base, views: 200 }));
    expect(scoreClip({ ...base, clicks: 1 })).toBe(25);
  });
});

describe("persona closets", () => {
  it("derives a stable, app-shaped id per persona + slot", () => {
    const a = itemId("menswear", "oxford");
    expect(a).toBe(itemId("menswear", "oxford"));
    expect(a).not.toBe(itemId("streetwear", "oxford"));
    expect(a).toMatch(/^[0-9A-F]{8}-[0-9A-F]{4}-5[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/);
  });

  it("builds persona emails as plus-addresses on the configured mailbox", () => {
    expect(personaEmail("menswear", "owner@example.com")).toBe("owner+capture-menswear@example.com");
    expect(personaEmail("original", undefined)).toBe("whichoutfitreview@test.com");
    expect(() => personaEmail("menswear", undefined)).toThrow(/CAPTURE_EMAIL_BASE/);
    expect(() => personaEmail("menswear", "owner+x@example.com")).toThrow(/CAPTURE_EMAIL_BASE/);
  });

  it("gives every persona unique slots", () => {
    for (const p of PERSONAS) expect(new Set(p.wardrobe.map((w) => w.slot)).size).toBe(p.wardrobe.length);
  });

  it("shoots light garments on grey so the cut-out doesn't eat them", () => {
    const white = getPersona("menswear")!.wardrobe.find((w) => w.slot === "oxford")!;
    const navy = getPersona("menswear")!.wardrobe.find((w) => w.slot === "chore")!;
    expect(garmentPrompt(white)).toMatch(/grey/);
    expect(garmentPrompt(navy)).toMatch(/pure white/);
  });

  const flow = {
    template: "flow:trip_packing",
    inputs: [{ name: "city", value: "Chicago, IL" }],
    title: "Chicago in November",
    voiceover: ["Packing for Chicago in November.", "So type the city.", "Chicago, Illinois.", "A forecast, a capsule, a plan per day."],
    captions: ["A"],
    hashtags: "#whichoutfit",
    rationale: "r",
  };

  it("keeps a flow on the closet it asked for, if that closet is stocked", () => {
    const v = validateIdea({ ...flow, closet: "menswear" }, ["original", "menswear"]);
    expect(typeof v === "object" && v.closet).toBe("menswear");
    expect(validateIdea({ ...flow, closet: "streetwear" }, ["original", "menswear"])).toMatch(/not available/);
  });

  it("always films a recut on the original closet", () => {
    const recut = getTemplate("recut:01_rate_outfit")!;
    const v = validateIdea(
      { ...flow, template: recut.key, inputs: [], closet: "menswear", voiceover: recut.beats.map(() => "A short line.") },
      ["original", "menswear"]
    );
    expect(typeof v === "object" && v.closet).toBe("original");
  });
});
