// Comeback Health admin metrics: pure aggregation over rows read from Comeback's Supabase (lib/comeback/data.ts).
// Kept free of I/O so it can be tested. A "person" in event data is the account when signed in, else the
// install (events.user_id is set by the database for signed-in users since 2026-10-30).
import { describe, knownFeatures, AREA_ORDER, type Area } from "./features";

export type AuthUser = { id: string; email: string | null; created_at: string; last_sign_in_at: string | null };
export type StateRow = { user_id: string; updated_at: string; state: { sport?: { kind?: string; goal?: { mode?: string } }; path?: string; injury?: { area?: string }; onboarded?: boolean } | null };
export type EntRow = { user_id: string; pro_until: string | null; lifetime: boolean | null; status: string | null; platform: string | null; product_id: string | null };
/** source: "phone" | "watch" = logged in Comeback; "health" = imported from Apple Health / Health Connect (incl. years of history). */
export type SessRow = { user_id: string; date: string; source?: string | null };
const inApp = (s: SessRow) => s.source !== "health";
export type EvRow = { install_id: string; user_id: string | null; name: string; props: Record<string, unknown> | null; platform: string | null; at: string };
export type AiRow = { user_id: string | null; kind: string; at: string };
export type ShareRow = { user_id: string; created_at: string; revoked_at: string | null; last_viewed_at: string | null };
export type WaitRow = { created_at: string; platform: string | null; source: string | null };

export const SPORT_LABEL: Record<string, string> = {
  swim: "Swim", run: "Run", cycle: "Cycle", row: "Row", tennis: "Tennis", pickleball: "Pickleball", classes: "Classes",
  crossfit: "Functional fitness", hyrox: "Hybrid racing", triathlon: "Triathlon",
};
export const PATH_LABEL: Record<string, string> = { injury: "Injury or surgery", break: "Time off", new: "Starting from scratch" };

const DAY = 864e5;
const since = (now: Date, days: number) => now.getTime() - days * DAY;
const t = (iso: string | null | undefined) => (iso ? Date.parse(iso) : 0);
const person = (e: EvRow) => e.user_id || "i:" + e.install_id;

/**
 * Drop web installs that never signed in. The web app needs an account (accounts start on the phone), so these are
 * local test runs (smoke tests, crawls, screenshots sent events before 2026-10-30) or bounces at the sign-in page.
 */
export function realEvents(events: EvRow[]): { events: EvRow[]; excludedInstalls: number } {
  const signed = new Set(events.filter((e) => e.user_id).map((e) => e.install_id));
  const dropped = new Set<string>();
  const kept = events.filter((e) => { const drop = e.platform === "web" && !signed.has(e.install_id); if (drop) dropped.add(e.install_id); return !drop; });
  return { events: kept, excludedInstalls: dropped.size };
}

/** Active Pro: lifetime, or paid through a future date, and not refunded/revoked. */
export function isPro(e: EntRow | undefined, now: Date): boolean {
  if (!e || e.status === "refunded" || e.status === "revoked") return false;
  return !!e.lifetime || t(e.pro_until) > now.getTime();
}

/** Readable feature name for an event (lib/comeback/features.ts); funnel events by name; "" for UI plumbing. */
export function featureOf(e: EvRow): string {
  if (e.name !== "tab" && e.name !== "act") return e.name.replace(/_/g, " ");
  return describe(e.name, e.props)?.label ?? "";
}

export interface Overview {
  signups: number; signups30: number; pro: number; proIos: number; proAndroid: number; proLifetime: number;
  sessions30: number; healthImported30: number; ai30: number; aiTotal: number; active7: number; installs30: number; waitlist: number; ptLinks: number;
  excludedInstalls: number;
}
export function overview(r: { users: AuthUser[]; ents: EntRow[]; sessions: SessRow[]; events: EvRow[]; ai: AiRow[]; shares: ShareRow[]; waitlist: WaitRow[]; excludedInstalls?: number }, now: Date): Overview {
  const pros = r.ents.filter((e) => isPro(e, now));
  const d30 = since(now, 30), d7 = since(now, 7);
  return {
    signups: r.users.length,
    signups30: r.users.filter((u) => t(u.created_at) >= d30).length,
    pro: pros.length,
    proIos: pros.filter((e) => e.platform === "ios").length,
    proAndroid: pros.filter((e) => e.platform === "android").length,
    proLifetime: pros.filter((e) => e.lifetime).length,
    sessions30: r.sessions.filter((s) => inApp(s) && t(s.date) >= d30).length,
    healthImported30: r.sessions.filter((s) => !inApp(s) && t(s.date) >= d30).length,
    ai30: r.ai.filter((a) => t(a.at) >= d30).length,
    aiTotal: r.ai.length,
    active7: new Set(r.events.filter((e) => t(e.at) >= d7).map(person)).size,
    installs30: new Set(r.events.filter((e) => t(e.at) >= d30).map((e) => e.install_id)).size,
    waitlist: r.waitlist.length,
    ptLinks: r.shares.filter((s) => !s.revoked_at).length,
    excludedInstalls: r.excludedInstalls ?? 0,
  };
}

export interface UserRow {
  id: string; email: string | null; created_at: string; last_active: string | null; sport: string; path: string; area: string | null;
  goal: string | null; pro: boolean; platform: string | null; sessions: number; sessions30: number; healthImported: number; ai: number; features: number; uses: number;
}
export function users(r: { users: AuthUser[]; states: StateRow[]; ents: EntRow[]; sessions: SessRow[]; events: EvRow[]; ai: AiRow[] }, now: Date): UserRow[] {
  const st = new Map(r.states.map((s) => [s.user_id, s]));
  const ent = new Map(r.ents.map((e) => [e.user_id, e]));
  const count = <T,>(rows: T[], key: (x: T) => string | null) => { const m = new Map<string, number>(); for (const x of rows) { const k = key(x); if (k) m.set(k, (m.get(k) || 0) + 1); } return m; };
  const sess = count(r.sessions.filter(inApp), (s) => s.user_id), ai = count(r.ai, (a) => a.user_id);
  const sess30 = count(r.sessions.filter((s) => inApp(s) && t(s.date) >= since(now, 30)), (s) => s.user_id);
  const imported = count(r.sessions.filter((s) => !inApp(s)), (s) => s.user_id);
  const evBy = new Map<string, EvRow[]>();
  for (const e of r.events) if (e.user_id) evBy.set(e.user_id, [...(evBy.get(e.user_id) || []), e]);
  return r.users.map((u) => {
    const s = st.get(u.id)?.state || {};
    const evs = evBy.get(u.id) || [];
    const lastEv = evs.reduce((a, e) => (e.at > a ? e.at : a), "");
    const last = [lastEv, st.get(u.id)?.updated_at || "", u.last_sign_in_at || ""].sort().pop() || null;
    const feats = evs.filter((e) => (e.name === "tab" || e.name === "act") && featureOf(e));
    return {
      id: u.id, email: u.email, created_at: u.created_at, last_active: last,
      sport: SPORT_LABEL[s.sport?.kind || ""] || (s.sport?.kind ?? "—"), path: PATH_LABEL[s.path || ""] || (s.onboarded ? "Injury or surgery" : "Not set up"),
      area: s.path === "injury" || (!s.path && s.injury) ? s.injury?.area || null : null,
      goal: s.sport?.goal?.mode && s.sport.goal.mode !== "casual" ? s.sport.goal.mode : null,
      pro: isPro(ent.get(u.id), now), platform: ent.get(u.id)?.platform || null,
      sessions: sess.get(u.id) || 0, sessions30: sess30.get(u.id) || 0, healthImported: imported.get(u.id) || 0, ai: ai.get(u.id) || 0,
      features: new Set(feats.map(featureOf)).size, uses: feats.length,
    };
  }).sort((a, b) => (b.last_active || "").localeCompare(a.last_active || ""));
}

export interface Usage {
  days: number;
  /** People with any event in the window: the base for every adoption percentage. */
  active: number;
  areas: { area: Area | "Other"; people: number; share: number; uses: number }[];
  features: { area: Area | "Other"; feature: string; people: number; share: number; signedIn: number; uses: number }[];
  notUsed: { area: Area; feature: string }[];
  sports: { sport: string; people: number; sessions: number }[];
  paths: { path: string; people: number }[];
  platforms: { platform: string; people: number }[];
}
export function usage(r: { events: EvRow[]; states: StateRow[] }, now: Date, days = 30): Usage {
  const from = since(now, days);
  const evs = r.events.filter((e) => t(e.at) >= from);
  const active = new Set(evs.map(person)).size;
  const f = new Map<string, { area: Area | "Other"; label: string; people: Set<string>; signed: Set<string>; uses: number }>();
  const a = new Map<Area | "Other", { people: Set<string>; uses: number }>();
  for (const e of evs) {
    if (e.name !== "tab" && e.name !== "act") continue;
    const d = describe(e.name, e.props); if (!d) continue;
    const k = d.area + "|" + d.label;
    const g = f.get(k) || { area: d.area, label: d.label, people: new Set(), signed: new Set(), uses: 0 };
    g.people.add(person(e)); if (e.user_id) g.signed.add(e.user_id); g.uses++; f.set(k, g);
    const ag = a.get(d.area) || { people: new Set(), uses: 0 }; ag.people.add(person(e)); ag.uses++; a.set(d.area, ag);
  }
  const share = (n: number) => (active ? n / active : 0);
  const used = new Set([...f.values()].map((g) => g.area + "|" + g.label));
  // Sport per person: the synced plan for accounts, else what they picked in setup on that install.
  const sportOf = new Map<string, string>(), pathOf = new Map<string, string>();
  for (const e of r.events) if (e.name === "onboard_done") {
    if (e.props?.sport) sportOf.set(person(e), String(e.props.sport));
    if (e.props?.path) pathOf.set(person(e), String(e.props.path));
  }
  for (const s of r.states) { if (s.state?.sport?.kind) sportOf.set(s.user_id, s.state.sport.kind); if (s.state?.path) pathOf.set(s.user_id, s.state.path); }
  const sports = new Map<string, { people: number; sessions: number }>();
  for (const k of sportOf.values()) { const g = sports.get(k) || { people: 0, sessions: 0 }; g.people++; sports.set(k, g); }
  for (const e of evs) if (e.name === "session_finished" && e.props?.sport) { const k = String(e.props.sport); const g = sports.get(k) || { people: 0, sessions: 0 }; g.sessions++; sports.set(k, g); }
  const paths = new Map<string, number>(); for (const p of pathOf.values()) paths.set(p, (paths.get(p) || 0) + 1);
  const plat = new Map<string, Set<string>>(); for (const e of evs) { const k = e.platform || "unknown"; plat.set(k, (plat.get(k) || new Set()).add(person(e))); }
  return {
    days,
    active,
    areas: [...a.entries()].map(([area, g]) => ({ area, people: g.people.size, share: share(g.people.size), uses: g.uses }))
      .sort((x, y) => y.people - x.people || AREA_ORDER.indexOf(x.area as Area) - AREA_ORDER.indexOf(y.area as Area)),
    features: [...f.values()].map((g) => ({ area: g.area, feature: g.label, people: g.people.size, share: share(g.people.size), signedIn: g.signed.size, uses: g.uses }))
      .sort((x, y) => y.people - x.people || y.uses - x.uses),
    notUsed: knownFeatures().filter((k) => !used.has(k.area + "|" + k.label) && k.area !== "Setup" && k.area !== "Account").map((k) => ({ area: k.area, feature: k.label })),
    sports: [...sports.entries()].map(([k, g]) => ({ sport: SPORT_LABEL[k] || k, ...g })).sort((a, b) => b.people - a.people || b.sessions - a.sessions),
    paths: [...paths.entries()].map(([k, n]) => ({ path: PATH_LABEL[k] || k, people: n })).sort((a, b) => b.people - a.people),
    platforms: [...plat.entries()].map(([k, s]) => ({ platform: k, people: s.size })).sort((a, b) => b.people - a.people),
  };
}

export interface Growth {
  days: number;
  funnel: { step: string; people: number }[];
  signupsByDay: { day: string; signups: number; waitlist: number }[];
  healthConnect: { asked: number; ok: number };
}
/** Funnel by install over the window: opened, finished setup, logged a session, came back another day, saw Pro, went Pro. */
export function growth(r: { events: EvRow[]; users: AuthUser[]; waitlist: WaitRow[]; ents: EntRow[] }, now: Date, days = 30): Growth {
  const from = since(now, days);
  const evs = r.events.filter((e) => t(e.at) >= from);
  const byInstall = new Map<string, EvRow[]>();
  for (const e of evs) byInstall.set(e.install_id, [...(byInstall.get(e.install_id) || []), e]);
  const has = (name: string | string[]) => [...byInstall.values()].filter((l) => l.some((e) => (Array.isArray(name) ? name : [name]).includes(e.name))).length;
  const returned = [...byInstall.values()].filter((l) => new Set(l.map((e) => e.at.slice(0, 10))).size >= 2).length;
  const proNew = r.ents.filter((e) => isPro(e, now)).length;
  const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const daysList = Array.from({ length: days }, (_, i) => dayKey(now.getTime() - (days - 1 - i) * DAY));
  const su = new Map<string, number>(), wl = new Map<string, number>();
  for (const u of r.users) su.set(u.created_at.slice(0, 10), (su.get(u.created_at.slice(0, 10)) || 0) + 1);
  for (const w of r.waitlist) wl.set(w.created_at.slice(0, 10), (wl.get(w.created_at.slice(0, 10)) || 0) + 1);
  const hc = evs.filter((e) => e.name === "health_connect");
  return {
    days,
    funnel: [
      { step: "Opened the app", people: byInstall.size },
      { step: "Finished setup", people: has("onboard_done") },
      { step: "Logged a session", people: has(["session_finished", "quick_log"]) },
      { step: "Came back another day", people: returned },
      { step: "Saw the Pro screen", people: has("paywall_view") },
      { step: "Pro now (all time)", people: proNew },
    ],
    signupsByDay: daysList.map((d) => ({ day: d, signups: su.get(d) || 0, waitlist: wl.get(d) || 0 })),
    healthConnect: { asked: hc.length, ok: hc.filter((e) => e.props?.ok === true).length },
  };
}

export interface AiUsage { days: number; total: number; byKind: { kind: string; calls: number; people: number }[]; byDay: { day: string; calls: number }[] }
export function aiUsage(rows: AiRow[], now: Date, days = 30): AiUsage {
  const from = since(now, days);
  const r = rows.filter((a) => t(a.at) >= from);
  const k = new Map<string, { calls: number; people: Set<string> }>();
  for (const a of r) { const g = k.get(a.kind) || { calls: 0, people: new Set() }; g.calls++; if (a.user_id) g.people.add(a.user_id); k.set(a.kind, g); }
  const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const byDay = Array.from({ length: days }, (_, i) => { const d = dayKey(now.getTime() - (days - 1 - i) * DAY); return { day: d, calls: r.filter((a) => a.at.slice(0, 10) === d).length }; });
  return { days, total: r.length, byKind: [...k.entries()].map(([kind, g]) => ({ kind, calls: g.calls, people: g.people.size })).sort((a, b) => b.calls - a.calls), byDay };
}
