import { describe, expect, it } from "vitest";
import { overview, users, usage, growth, aiUsage, isPro, featureOf, realEvents, type EvRow, type AuthUser, type StateRow, type EntRow } from "../comeback/metrics";

const NOW = new Date("2026-10-31T12:00:00Z");
const ev = (o: Partial<EvRow>): EvRow => ({ install_id: "i1", user_id: null, name: "tab", props: {}, platform: "ios", at: "2026-10-30T10:00:00Z", ...o });
const U: AuthUser[] = [
  { id: "u1", email: "a@x.com", created_at: "2026-10-20T00:00:00Z", last_sign_in_at: "2026-10-29T00:00:00Z" },
  { id: "u2", email: "b@x.com", created_at: "2026-08-01T00:00:00Z", last_sign_in_at: null },
];
const ST: StateRow[] = [
  { user_id: "u1", updated_at: "2026-10-30T09:00:00Z", state: { sport: { kind: "triathlon", goal: { mode: "triSprint" } }, path: "injury", injury: { area: "knee" }, onboarded: true } },
  { user_id: "u2", updated_at: "2026-09-01T00:00:00Z", state: { sport: { kind: "run" }, path: "new", onboarded: true } },
];
const ENT: EntRow[] = [
  { user_id: "u1", pro_until: "2026-11-30T00:00:00Z", lifetime: false, status: "active", platform: "ios", product_id: "m" },
  { user_id: "u2", pro_until: "2026-10-01T00:00:00Z", lifetime: false, status: "expired", platform: "android", product_id: "m" },
];

describe("comeback metrics", () => {
  it("counts Pro by lifetime or a future paid-through date", () => {
    expect(isPro(ENT[0], NOW)).toBe(true);
    expect(isPro(ENT[1], NOW)).toBe(false);
    expect(isPro({ ...ENT[1], lifetime: true }, NOW)).toBe(true);
    expect(isPro({ ...ENT[0], status: "refunded" }, NOW)).toBe(false);
  });
  it("names features by tab or action", () => {
    expect(featureOf(ev({ name: "tab", props: { t: "pt" } }))).toBe("PT tab");
    expect(featureOf(ev({ name: "act", props: { a: "htab", v: "trends" } }))).toBe("Trends (Pro)");
    expect(featureOf(ev({ name: "act", props: { a: "onbArea" } }))).toBe("Picked injury area");
    expect(featureOf(ev({ name: "act", props: { a: "closeSheet" } }))).toBe("");
    expect(featureOf(ev({ name: "act", props: { a: "brandNewButton" } }))).toBe("brandNewButton");
    expect(featureOf(ev({ name: "session_finished" }))).toBe("session finished");
  });
  it("builds the overview", () => {
    const o = overview({ users: U, ents: ENT, sessions: [{ user_id: "u1", date: "2026-10-28", source: "phone" }, { user_id: "u1", date: "2026-10-27", source: "health" }, { user_id: "u1", date: "2016-01-01", source: "health" }], events: [ev({}), ev({ install_id: "i2", user_id: "u1" })], ai: [{ user_id: "u1", kind: "pt-text", at: "2026-10-25T00:00:00Z" }], shares: [{ user_id: "u1", created_at: "", revoked_at: null, last_viewed_at: null }], waitlist: [] }, NOW);
    expect(o).toMatchObject({ signups: 2, signups30: 1, pro: 1, proIos: 1, sessions30: 1, healthImported30: 1, ai30: 1, active7: 2, installs30: 2, ptLinks: 1 });
  });
  it("lists users with sport, path, area and feature counts, most recent first", () => {
    const sessions = [{ user_id: "u1", date: "2026-10-28", source: "watch" }, { user_id: "u1", date: "2026-01-01", source: "phone" }, { user_id: "u1", date: "2019-05-05", source: "health" }];
    const rows = users({ users: U, states: ST, ents: ENT, sessions, events: [ev({ user_id: "u1", props: { t: "pt" } }), ev({ user_id: "u1", name: "act", props: { a: "start" } }), ev({ user_id: "u1", name: "act", props: { a: "closeSheet" } })], ai: [] }, NOW);
    expect(rows[0]).toMatchObject({ id: "u1", sport: "Triathlon", path: "Injury or surgery", area: "knee", goal: "triSprint", pro: true, sessions: 2, sessions30: 1, healthImported: 1, features: 2, uses: 2 });
    expect(rows[1]).toMatchObject({ id: "u2", sport: "Run", path: "Starting from scratch", area: null, pro: false });
  });
  it("ranks features by distinct people and counts sports from plans and setup", () => {
    const u = usage({ events: [
      ev({ install_id: "i1", props: { t: "pt" } }), ev({ install_id: "i1", props: { t: "pt" } }), ev({ install_id: "i2", user_id: "u1", props: { t: "pt" } }),
      ev({ install_id: "i3", props: { t: "plan" } }),
      ev({ install_id: "i3", name: "onboard_done", props: { sport: "swim", path: "break" } }),
      ev({ install_id: "i2", user_id: "u1", name: "session_finished", props: { sport: "triathlon" } }),
    ], states: ST }, NOW);
    expect(u.active).toBe(3);
    expect(u.features[0]).toEqual({ area: "Navigation", feature: "PT tab", people: 2, share: 2 / 3, signedIn: 1, uses: 3 });
    expect(u.areas.find((a) => a.area === "Navigation")).toMatchObject({ people: 3, share: 1 });
    expect(u.notUsed.some((n) => n.feature === "Created a PT link")).toBe(true);
    expect(u.notUsed.some((n) => n.feature === "PT tab")).toBe(false);
    expect(u.sports.find((s) => s.sport === "Triathlon")).toEqual({ sport: "Triathlon", people: 1, sessions: 1 });
    expect(u.sports.map((s) => s.sport).sort()).toEqual(["Run", "Swim", "Triathlon"]);
    expect(u.paths.find((p) => p.path === "Time off")?.people).toBe(1);
  });
  it("builds the install funnel and daily signups", () => {
    const g = growth({ events: [
      ev({ install_id: "a", name: "onb_step" }), ev({ install_id: "a", name: "onboard_done" }), ev({ install_id: "a", name: "session_finished", at: "2026-10-31T08:00:00Z" }),
      ev({ install_id: "b", name: "onb_step" }),
    ], users: U, waitlist: [{ created_at: "2026-10-30T01:00:00Z", platform: "ios", source: "hero" }], ents: ENT }, NOW, 30);
    expect(g.funnel.map((f) => f.people)).toEqual([2, 1, 1, 1, 0, 1]);
    expect(g.signupsByDay.find((d) => d.day === "2026-10-30")?.waitlist).toBe(1);
    expect(g.signupsByDay.length).toBe(30);
  });
  it("groups AI calls by kind and day", () => {
    const a = aiUsage([{ user_id: "u1", kind: "pt-text", at: "2026-10-30T01:00:00Z" }, { user_id: "u2", kind: "pt-text", at: "2026-10-30T02:00:00Z" }, { user_id: "u1", kind: "pt-image", at: "2026-09-01T00:00:00Z" }], NOW, 30);
    expect(a.total).toBe(2);
    expect(a.byKind).toEqual([{ kind: "pt-text", calls: 2, people: 2 }]);
  });
  it("drops web installs that never signed in, keeps apps and signed-in web", () => {
    const r = realEvents([ev({ install_id: "w1", platform: "web" }), ev({ install_id: "w2", platform: "web" }), ev({ install_id: "w2", platform: "web", user_id: "u1" }), ev({ install_id: "p1", platform: "ios" })]);
    expect(r.excludedInstalls).toBe(1);
    expect(new Set(r.events.map((e) => e.install_id))).toEqual(new Set(["w2", "p1"]));
  });
});
