import { comebackDb, allRows } from "./db";
import * as m from "./metrics";

// Loads Comeback Health's rows (its own Supabase project) for the admin pages and runs the pure metrics.
// Volumes are small (a few thousand events), so pages read the last 90 days of events and aggregate in code.

const EVENT_DAYS = 90;
const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * 864e5).toISOString();

async function authUsers(): Promise<m.AuthUser[]> {
  const db = comebackDb(); const out: m.AuthUser[] = [];
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(error.message);
    out.push(...data.users.map((u) => ({ id: u.id, email: u.email ?? null, created_at: u.created_at, last_sign_in_at: u.last_sign_in_at ?? null })));
    if (data.users.length < 1000) return out;
  }
}
const states = () => allRows<m.StateRow>((a, b) => comebackDb().from("app_state").select("user_id,updated_at,state").range(a, b));
const ents = () => allRows<m.EntRow>((a, b) => comebackDb().from("entitlements").select("user_id,pro_until,lifetime,status,platform,product_id").range(a, b));
const sessions = () => allRows<m.SessRow>((a, b) => comebackDb().from("sessions").select("user_id,date,source:data->>source").range(a, b));
const rawEvents = () => allRows<m.EvRow>((a, b) => comebackDb().from("events").select("install_id,user_id,name,props,platform,at").gte("at", iso(EVENT_DAYS)).order("at").range(a, b));
/** Events without anonymous web installs (test runs and sign-in bounces); see metrics.realEvents. */
const events = async () => m.realEvents(await rawEvents()).events;
const ai = () => allRows<m.AiRow>((a, b) => comebackDb().from("ai_requests").select("user_id,kind,at").range(a, b));
const shares = () => allRows<m.ShareRow>((a, b) => comebackDb().from("pt_shares").select("user_id,created_at,revoked_at,last_viewed_at").range(a, b));
const waitlist = () => allRows<m.WaitRow>((a, b) => comebackDb().from("waitlist").select("created_at,platform,source").neq("source", "test").range(a, b));

export async function getComebackOverview(): Promise<m.Overview> {
  const [u, e, s, raw, a, sh, w] = await Promise.all([authUsers(), ents(), sessions(), rawEvents(), ai(), shares(), waitlist()]);
  const real = m.realEvents(raw);
  return m.overview({ users: u, ents: e, sessions: s, events: real.events, ai: a, shares: sh, waitlist: w, excludedInstalls: real.excludedInstalls }, new Date());
}
export async function getComebackUsers(): Promise<m.UserRow[]> {
  const [u, st, e, s, ev, a] = await Promise.all([authUsers(), states(), ents(), sessions(), events(), ai()]);
  return m.users({ users: u, states: st, ents: e, sessions: s, events: ev, ai: a }, new Date());
}
export async function getComebackUsage(days = 30): Promise<m.Usage> {
  const [ev, st] = await Promise.all([events(), states()]);
  return m.usage({ events: ev, states: st }, new Date(), days);
}
export async function getComebackGrowth(days = 30): Promise<m.Growth> {
  const [ev, u, w, e] = await Promise.all([events(), authUsers(), waitlist(), ents()]);
  return m.growth({ events: ev, users: u, waitlist: w, ents: e }, new Date(), days);
}
export async function getComebackAi(days = 30): Promise<m.AiUsage> {
  return m.aiUsage(await ai(), new Date(), days);
}
