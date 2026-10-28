import { admin } from "@/lib/supabase";
import { WHICHOUTFIT } from "@/lib/brand";
import { generateJson } from "./gemini";
import { getTemplate, TEMPLATES } from "./templates";
import { validateIdea, type RawIdea } from "./rules";
import { PERSONAS, voiceFor } from "./personas";
import { closetSize } from "./personaAccounts";
import { availableClosets, templateBrief, IDEA_SCHEMA, IDEA_SYSTEM, type IdeaRow } from "./planner";

// The dashboard's Content Studio (app/(dash)/content): everything the owner does
// by hand — ask for a specific video, edit a script before approving it, see
// whether the Mac worker is alive. The weekly loop lives in planner.ts.

// --- the Mac worker's heartbeat --------------------------------------------

/** The worker asks for work every couple of minutes; this long without it means it is not running. */
export const WORKER_STALE_MIN = 10;

export async function beat(detail: Record<string, unknown> = {}): Promise<void> {
  // A missing table must never break the engine API; the heartbeat is advisory.
  await admin()
    .from("engine_status")
    .upsert({ id: "mac", seen_at: new Date().toISOString(), detail })
    .then(() => undefined, () => undefined);
}

export type WorkerStatus = { seenAt: string | null; online: boolean; detail: Record<string, unknown> };

export async function workerStatus(now = new Date()): Promise<WorkerStatus> {
  const { data } = await admin().from("engine_status").select("seen_at,detail").eq("id", "mac").maybeSingle();
  const seenAt = (data?.seen_at as string | undefined) ?? null;
  const online = !!seenAt && now.getTime() - new Date(seenAt).getTime() < WORKER_STALE_MIN * 60_000;
  return { seenAt, online, detail: (data?.detail as Record<string, unknown>) ?? {} };
}

// --- closets ---------------------------------------------------------------

export type ClosetInfo = { key: string; label: string; items: number; voice: string; cloned: boolean; available: boolean };

export async function closetInfo(): Promise<ClosetInfo[]> {
  const available = await availableClosets().catch(() => ["original"]);
  return Promise.all(
    PERSONAS.map(async (p) => ({
      key: p.key,
      label: p.label,
      items: await closetSize(p.key).catch(() => 0),
      voice: voiceFor(p.key),
      cloned: !!p.cloneFrom,
      available: available.includes(p.key),
    }))
  );
}

// --- editing an idea -------------------------------------------------------

export type IdeaEdit = {
  title?: string;
  voiceover?: string[];
  captions?: string[];
  caption_pick?: number;
  closet?: string;
  inputs?: Record<string, string>;
  hashtags?: string | null;
};

/**
 * Apply the owner's edits, held to the same rules as a drafted idea (one line
 * per beat, within budget, a stocked closet). Only an idea nothing is working on
 * can change: proposed, approved (not yet picked up) or failed.
 */
export async function editIdea(id: string, edit: IdeaEdit): Promise<IdeaRow> {
  const db = admin();
  const { data, error } = await db.from("social_ideas").select("*").eq("id", id).eq("brand", WHICHOUTFIT).single();
  if (error) throw error;
  const idea = data as IdeaRow;
  if (!["proposed", "approved", "failed"].includes(idea.status)) {
    throw new Error("That video is being made or is done; it can't be edited now.");
  }
  const inputs = { ...idea.inputs, ...(edit.inputs ?? {}) };
  const raw: RawIdea = {
    template: idea.template,
    inputs: Object.entries(inputs).map(([name, value]) => ({ name, value })),
    closet: edit.closet ?? idea.closet,
    title: edit.title ?? idea.title,
    voiceover: edit.voiceover ?? idea.voiceover,
    captions: edit.captions ?? idea.captions,
    hashtags: edit.hashtags ?? idea.hashtags ?? "",
    rationale: idea.rationale ?? "",
  };
  const v = validateIdea(raw, await availableClosets());
  if (typeof v === "string") throw new Error(v);
  const pick = Number.isInteger(edit.caption_pick) ? edit.caption_pick! : idea.caption_pick;
  const fields = {
    title: v.title,
    voiceover: v.voiceover,
    captions: v.captions,
    caption_pick: Math.max(0, Math.min(v.captions.length - 1, pick)),
    closet: v.closet,
    inputs: v.inputs,
    hashtags: v.hashtags,
  };
  const { data: saved, error: upErr } = await db.from("social_ideas").update(fields).eq("id", id).select("*").single();
  if (upErr) throw upErr;
  return saved as IdeaRow;
}

// --- asking for a specific video -------------------------------------------

export type VideoRequest = { template: string; inputs: Record<string, string>; closet?: string; note?: string };

/**
 * Draft ONE idea for exactly what the owner asked for: their template, input and
 * closet, with the script written in the same story style as the weekly ideas.
 * Lands as 'proposed' so it is reviewed like any other.
 */
export async function requestVideo(req: VideoRequest): Promise<IdeaRow> {
  const t = getTemplate(req.template);
  if (!t) throw new Error("Pick a video type.");
  for (const need of t.inputs) {
    if (!req.inputs?.[need.name]?.trim()) throw new Error(`Fill in the ${need.name}.`);
  }
  const closets = await availableClosets();
  const closet = t.kind === "recut" ? "original" : req.closet || "original";
  if (!closets.includes(closet)) throw new Error(`The ${closet} closet isn't stocked yet.`);
  const persona = PERSONAS.find((p) => p.key === closet);
  const inputs = Object.entries(req.inputs ?? {}).map(([k, v]) => `${k} = "${v.trim()}"`).join(", ");

  const prompt = `Draft exactly 1 clip idea, for this request from the owner.
Template: ${t.key}${inputs ? `\nInputs (use exactly these): ${inputs}` : ""}
Closet: ${closet}${persona ? ` — ${persona.describe}` : ""}${req.note?.trim() ? `\nOwner's note on the angle: ${req.note.trim().slice(0, 300)}` : ""}

TEMPLATE:
${templateBrief(t)}`;

  // The model gets two tries: a line over its beat is the usual miss, and a
  // second draft almost always fits.
  let reason = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await generateJson<{ ideas: RawIdea[] }>(IDEA_SYSTEM, prompt + (reason ? `\n\nYour last draft was rejected: ${reason}. Fix that.` : ""), IDEA_SCHEMA);
    const raw = r.ideas?.[0];
    if (!raw) { reason = "no idea returned"; continue; }
    // Hold the request to what was asked, whatever the model echoed back.
    raw.template = t.key;
    raw.closet = closet;
    raw.inputs = Object.entries(req.inputs ?? {}).map(([name, value]) => ({ name, value }));
    const v = validateIdea(raw, closets);
    if (typeof v === "string") { reason = v; continue; }
    const { data, error } = await admin()
      .from("social_ideas")
      .insert({ ...v, status: "proposed", source: "manual" })
      .select("*")
      .single();
    if (error) throw error;
    return data as IdeaRow;
  }
  throw new Error(`Couldn't write a script that fits (${reason}). Try again, or loosen the note.`);
}

// --- the agent: briefs, rewrites, autopilot, activity ----------------------

const BRIEF_SCHEMA = {
  type: "OBJECT",
  properties: {
    reply: { type: "STRING" },
    ideas: (IDEA_SCHEMA.properties as Record<string, unknown>).ideas,
  },
  required: ["reply", "ideas"],
};

/**
 * Turn a plain-words brief ("a TikTok about packing for Denver on my closet")
 * into one reviewed-ready idea: the model picks the template, inputs and closet
 * from the catalog, writes the script, and says in one sentence what it made.
 */
export async function briefToIdea(brief: string): Promise<{ idea: IdeaRow; reply: string }> {
  const text = brief.trim().slice(0, 500);
  if (!text) throw new Error("Tell the studio what you'd like.");
  const closets = await availableClosets();
  const closetBrief = PERSONAS.filter((p) => closets.includes(p.key)).map((p) => `- ${p.key}: ${p.describe}`).join("\n");
  const catalog = TEMPLATES.map((t) => templateBrief(t)).join("\n\n");
  const prompt = `The owner asked: "${text}"

Draft exactly 1 clip idea that does what they asked. Pick the template that fits best (a "flow" when they name a new occasion or city, a "recut" to re-tell existing footage), fill its inputs from what they said, and pick the closet they named or the one that suits it. "My closet" / "mine" means the menswear closet (a copy of the owner's).
Also write "reply": one short, friendly sentence to the owner saying what you made and why, e.g. "I made a Dress for an Event video for a fall wedding on your closet, opening on the last-minute panic."

CLOSETS (flow ideas only; recuts are "original"):
${closetBrief}

TEMPLATE CATALOG:
${catalog}`;

  let reason = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await generateJson<{ reply: string; ideas: RawIdea[] }>(
      IDEA_SYSTEM,
      prompt + (reason ? `\n\nYour last draft was rejected: ${reason}. Fix that.` : ""),
      BRIEF_SCHEMA
    );
    const raw = r.ideas?.[0];
    if (!raw) { reason = "no idea returned"; continue; }
    const v = validateIdea(raw, closets);
    if (typeof v === "string") { reason = v; continue; }
    const { data, error } = await admin()
      .from("social_ideas")
      .insert({ ...v, rationale: `Asked for: “${text}”`, status: "proposed", source: "agent" })
      .select("*")
      .single();
    if (error) throw error;
    return { idea: data as IdeaRow, reply: r.reply?.trim() || `Made “${v.title}”.` };
  }
  throw new Error(`I couldn't make that fit a video (${reason}). Try naming the feature or occasion.`);
}

/** Redo an idea's script from a note ("funnier", "open on the price"), same footage, input and closet. */
export async function rewriteIdea(id: string, note: string): Promise<IdeaRow> {
  const db = admin();
  const { data, error } = await db.from("social_ideas").select("*").eq("id", id).eq("brand", WHICHOUTFIT).single();
  if (error) throw error;
  const idea = data as IdeaRow;
  if (!["proposed", "failed"].includes(idea.status)) throw new Error("Only an idea waiting for review can be rewritten.");
  const t = getTemplate(idea.template);
  if (!t) throw new Error("Unknown template.");
  const closets = await availableClosets();
  const inputs = Object.entries(idea.inputs ?? {}).map(([k, v]) => `${k} = "${v}"`).join(", ");
  const prompt = `Rewrite this clip idea. Keep the template, inputs and closet exactly; write a new script, title and captions.
Owner's note: "${note.trim().slice(0, 300) || "make it better"}"
Template: ${t.key}${inputs ? `\nInputs: ${inputs}` : ""}
Closet: ${idea.closet}
Current script:
${idea.voiceover.map((l, i) => `${i + 1}. ${l}`).join("\n")}

TEMPLATE:
${templateBrief(t)}`;
  let reason = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await generateJson<{ ideas: RawIdea[] }>(IDEA_SYSTEM, prompt + (reason ? `\n\nYour last draft was rejected: ${reason}. Fix that.` : ""), IDEA_SCHEMA);
    const raw = r.ideas?.[0];
    if (!raw) { reason = "no idea returned"; continue; }
    raw.template = t.key;
    raw.closet = idea.closet;
    raw.inputs = Object.entries(idea.inputs ?? {}).map(([name, value]) => ({ name, value }));
    const v = validateIdea(raw, closets);
    if (typeof v === "string") { reason = v; continue; }
    const { data: saved, error: upErr } = await db
      .from("social_ideas")
      .update({ title: v.title, voiceover: v.voiceover, captions: v.captions, caption_pick: 0, hashtags: v.hashtags, status: "proposed", error: null })
      .eq("id", id)
      .select("*")
      .single();
    if (upErr) throw upErr;
    return saved as IdeaRow;
  }
  throw new Error(`The rewrite didn't fit the video (${reason}). Try a different note.`);
}

export type StudioSettings = { autopilot: boolean };

export async function getSettings(): Promise<StudioSettings> {
  const { data } = await admin().from("studio_settings").select("key,value");
  const map = new Map((data ?? []).map((r) => [r.key as string, r.value]));
  return { autopilot: map.get("autopilot") === true };
}

export async function setSetting(key: keyof StudioSettings, value: boolean): Promise<void> {
  const { error } = await admin().from("studio_settings").upsert({ key, value, updated_at: new Date().toISOString() });
  if (error) throw error;
}

export type ActivityItem = { at: string; kind: "drafted" | "asked" | "approved" | "filming" | "made" | "failed" | "posted" | "scheduled"; text: string };

type ActivityIdea = { id: string; created_at: string; updated_at?: string | null; status: string; title: string; source?: string | null; clip_id: string | null; error: string | null };
type ActivityPost = { clip_id: string; platform: string; status: string; scheduled_for: string; posted_at: string | null; views: number | null };

const clipName = (clip: string) =>
  clip.replace(/^\d\d_/, "").replace(/_r\d+$/, "").replace(/_[0-9a-f]{6}$/, "").replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

/**
 * What the studio has been doing, newest first, from the rows it already keeps.
 * Pure. A weekly batch reads as one line, and a video posted to both platforms
 * as one line, so the feed stays a story rather than a log dump.
 */
export function activity(ideas: ActivityIdea[], posts: ActivityPost[], now = new Date(), limit = 10): ActivityItem[] {
  const out: ActivityItem[] = [];
  const titleByClip = new Map(ideas.filter((i) => i.clip_id).map((i) => [i.clip_id!, i.title]));
  const name = (clip: string) => titleByClip.get(clip) ?? clipName(clip);

  const batches = new Map<string, ActivityIdea[]>();
  for (const i of ideas) {
    if (i.source === "agent" || i.source === "manual") {
      out.push({ at: i.created_at, kind: "asked", text: `Wrote “${i.title}” for you` });
    } else {
      const k = i.created_at.slice(0, 16); // one planner run inserts its batch in the same minute
      batches.set(k, [...(batches.get(k) ?? []), i]);
    }
    const at = i.updated_at ?? i.created_at;
    if (i.status === "approved") out.push({ at, kind: "approved", text: `“${i.title}” approved, queued for filming` });
    if (i.status === "rendering") out.push({ at, kind: "filming", text: `Filming and narrating “${i.title}”` });
    if (i.status === "rendered") out.push({ at, kind: "made", text: `Finished “${i.title}” and scheduled it` });
    if (i.status === "failed") out.push({ at, kind: "failed", text: `“${i.title}” didn't work: ${i.error ?? "no detail"}` });
  }
  for (const group of batches.values()) {
    out.push({
      at: group[0].created_at,
      kind: "drafted",
      text: group.length === 1 ? `Drafted “${group[0].title}”` : `Drafted ${group.length} ideas from what's performing`,
    });
  }

  const posted = new Map<string, ActivityPost[]>();
  for (const p of posts) {
    if (p.status !== "posted" || !p.posted_at) continue;
    const k = `${p.clip_id}|${p.posted_at.slice(0, 10)}`;
    posted.set(k, [...(posted.get(k) ?? []), p]);
  }
  for (const group of posted.values()) {
    const where = group.map((p) => (p.platform === "instagram" ? "Instagram" : "TikTok")).join(" and ");
    const views = group.reduce((a, p) => a + (p.views ?? 0), 0);
    out.push({
      at: group[0].posted_at!,
      kind: "posted",
      text: `Posted “${name(group[0].clip_id)}” to ${where}${group.some((p) => p.views != null) ? ` · ${views.toLocaleString()} views so far` : ""}`,
    });
  }
  return out
    .filter((a) => new Date(a.at).getTime() <= now.getTime())
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, limit);
}
