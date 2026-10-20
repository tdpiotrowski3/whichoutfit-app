import { admin } from "@/lib/supabase";
import { generateJson } from "./gemini";
import { getTemplate } from "./templates";
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
  const { data, error } = await db.from("social_ideas").select("*").eq("id", id).single();
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
