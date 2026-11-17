import { admin } from "@/lib/supabase";
import { WHICHOUTFIT } from "@/lib/brand";
import { cleanHashtags } from "./hashtags";
import { errorMessage } from "./auth";
import { sendAdminAlert } from "@/lib/alert";
import { generateJson, llmProvider } from "./llm";
import { TEMPLATES, getTemplate, CTA_LINE, type Template } from "./templates";
import { launchSteer, needsReview, featureOf, type IdeaFields } from "./rules";
import { PERSONAS, voiceFor } from "./personas";
import { seededSlots, closetSize } from "./personaAccounts";
import { nextSlots, runwayDays, slotsToFill, RUNWAY_DAYS } from "./schedule";
import { baseClip, clipScores, loadPosts, type ClipScore, type PostRow } from "./performance";
import { CAPTION_SYSTEM, IDEA_SCHEMA, IDEA_SYSTEM, CANDIDATES, writeIdeas, templateBrief, cuesFor, type Written } from "./writer";
import { META, directionFor, flowInputs } from "./scriptRules";
import { PLAYBOOKS, RECYCLE_GAP_DAYS, episodeOf, markDrafted, openSlots, pillarOfFeature, slotBriefFor, type Plan, type PlanSlot } from "./strategy";
import { loadPlan, refreshPlan, savePlan } from "./strategyStore";

export { clipScores, type ClipScore };
export { IDEA_SCHEMA, IDEA_SYSTEM, CANDIDATES, writeIdeas, templateBrief, cuesFor, type Written };

// The content engine's brain. Runs weekly from /api/cron/social-plan and does
// four things, each best-effort so one failing never blocks the others:
//
//   0. re-plan      — rebuild the rolling six-week strategy from results
//      (strategy.ts): pillars, series episodes and the hook each slot tests.
//   1. refillRunway — if the queue reaches less than RUNWAY_DAYS ahead, re-post
//      the best-performing clips (with fresh captions) into the empty slots.
//      This is what keeps the account posting when nobody has made anything new.
//   2. draftIdeas   — writes this week's slots from the plan: several candidate
//      scripts each, judged by a separate critic (scriptRoom.ts); only scripts
//      that pass become 'proposed' rows for the owner to approve. Approved
//      ideas are rendered on the Mac (FitCheck tools/capture-engine/social).
//   3. digest       — one email: the strategy in a few sentences, runway, last
//      week's results, ideas waiting.
//
// completeIdea() is the other half of the render loop: the engine API calls it
// once a rendered video is uploaded, and it books the clip into the calendar.

/** Stop drafting while this many ideas are still waiting for a decision. */
const MAX_PENDING_IDEAS = 6;

const IDEAS_PER_WEEK = 4;

/** Renders before this were made by the old engine and are never re-posted. */
export const ENGINE_V2_FROM = "2026-11-17";

export type IdeaRow = {
  id: string;
  created_at: string;
  status: "proposed" | "approved" | "rejected" | "rendering" | "rendered" | "failed";
  template: string;
  inputs: Record<string, string>;
  closet: string;
  title: string;
  voiceover: string[];
  captions: string[];
  caption_pick: number;
  hashtags: string | null;
  rationale: string | null;
  source: string;
  clip_id: string | null;
  error: string | null;
};

// --- 1. keep the queue full ----------------------------------------------

export type RefillResult = { runwayBefore: number; needed: number; filled: string[]; short: number };

const CAPTION_SCHEMA = {
  type: "OBJECT",
  properties: {
    captions: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { clip_id: { type: "STRING" }, caption: { type: "STRING" } },
        required: ["clip_id", "caption"],
      },
    },
  },
  required: ["captions"],
};

export async function refillRunway(now = new Date()): Promise<RefillResult> {
  const posts = await loadPosts();
  const queuedIG = posts.filter((p) => p.platform === "instagram" && ["queued", "publishing"].includes(p.status));
  const scheduled = queuedIG.map((p) => new Date(p.scheduled_for)).filter((d) => d > now);
  const runwayBefore = runwayDays(now, scheduled);
  const needed = slotsToFill(now, scheduled);
  if (needed === 0) return { runwayBefore, needed, filled: [], short: 0 };

  // Candidates: clips that have actually gone out, aren't queued again, and
  // haven't been out for RECYCLE_GAP_DAYS. Best score first.
  const queuedBase = new Set(queuedIG.map((p) => baseClip(p.clip_id)));
  const gapCutoff = new Date(now.getTime() - RECYCLE_GAP_DAYS * 86_400_000).toISOString();
  const lastIG = new Map<string, PostRow>();
  for (const p of posts) if (p.platform === "instagram" && p.status === "posted") lastIG.set(baseClip(p.clip_id), p);

  // Only clips made by engine v2 are re-posted: the owner retired every older
  // render on 2026-11-17 ("any new videos should use this"). A clip's age is
  // when it was first booked.
  const firstBooked = new Map<string, string>();
  for (const p of posts) {
    if (p.platform !== "instagram") continue;
    const b = baseClip(p.clip_id);
    if (!firstBooked.has(b) || p.scheduled_for < firstBooked.get(b)!) firstBooked.set(b, p.scheduled_for);
  }
  const scores = await clipScores(posts);
  const picks = scores
    .filter((s) => (firstBooked.get(s.clip_id) ?? "") >= ENGINE_V2_FROM)
    .filter((s) => !queuedBase.has(s.clip_id) && s.lastOut && s.lastOut < gapCutoff && lastIG.get(s.clip_id)?.video_url)
    .slice(0, needed);
  if (picks.length === 0) return { runwayBefore, needed, filled: [], short: needed };

  // Fresh words on a proven clip: same video, a caption it hasn't used.
  const fresh = new Map<string, string>();
  try {
    const r = await generateJson<{ captions: { clip_id: string; caption: string }[] }>(
      CAPTION_SYSTEM,
      picks
        .map((s) => `clip_id: ${s.clip_id}\nshows: ${showsFor(s.clip_id)}\nprevious caption (do not reuse): ${lastIG.get(s.clip_id)!.caption}`)
        .join("\n\n"),
      CAPTION_SCHEMA
    );
    for (const c of r.captions) if (c.caption?.trim()) fresh.set(c.clip_id, c.caption.trim());
  } catch {
    // No new caption is not a reason to leave a slot empty; the old one still works.
  }

  const after = new Date(Math.max(now.getTime(), ...scheduled.map((d) => d.getTime())));
  const slots = nextSlots(after, picks.length, scheduled);
  const inserts: Record<string, unknown>[] = [];
  const filled: string[] = [];
  picks.forEach((s, i) => {
    const prev = lastIG.get(s.clip_id)!;
    const n = posts.filter((p) => p.platform === "instagram" && baseClip(p.clip_id) === s.clip_id).length + 1;
    const clip = `${s.clip_id}_r${n}`;
    const caption = fresh.get(s.clip_id) ?? prev.caption;
    const at = slots[i].toISOString();
    for (const platform of ["instagram", "tiktok"] as const) {
      inserts.push({
        clip_id: clip,
        platform,
        caption,
        hashtags: cleanHashtags(prev.hashtags) || null,
        video_url: prev.video_url,
        campaign: `${platform === "instagram" ? "ig" : "tt"}_${clip}`.slice(0, 64),
        scheduled_for: at,
        status: platform === "instagram" ? "queued" : "manual",
      });
    }
    filled.push(clip);
  });
  const { error } = await admin().from("social_posts").insert(inserts);
  if (error) throw error;
  return { runwayBefore, needed, filled, short: needed - filled.length };
}

function showsFor(clipId: string): string {
  const t = TEMPLATES.find((x) => x.kind === "recut" && x.footage === clipId);
  return t?.shows ?? featureOf(clipId).replace(/_/g, " ");
}

// --- 2. draft new ideas ---------------------------------------------------

export type DraftResult = { drafted: number; skipped?: string; dropped: string[] };

export async function draftIdeas(count = IDEAS_PER_WEEK, now = new Date()): Promise<DraftResult> {
  const db = admin();
  const { data: recent, error } = await db
    .from("social_ideas")
    .select("template,inputs,closet,title,status")
    .eq("brand", WHICHOUTFIT)
    .order("created_at", { ascending: false })
    .limit(60);
  if (error) throw error;
  const ideas = (recent ?? []) as Pick<IdeaRow, "template" | "inputs" | "closet" | "title" | "status">[];
  const pending = ideas.filter((i) => i.status === "proposed").length;
  if (pending >= MAX_PENDING_IDEAS) return { drafted: 0, skipped: `${pending} ideas already waiting for a decision`, dropped: [] };

  const closets = await availableClosets();
  // A template tied to a closet (flow:no_closet → fresh) is only offered while that closet is.
  const offered = TEMPLATES.filter((t) => !t.closet || closets.includes(t.closet));
  const canMake = (key: string) => offered.some((t) => t.key === key);

  // The plan decides WHAT this week is for; the writer decides how to say it.
  // If the plan can't be loaded or stored, an unsaved one built now still steers the week.
  let plan: Plan | null = await refreshPlan("whichoutfit", now, { canMake }).catch(() => null);
  if (!plan) plan = await refreshPlan("whichoutfit", now, { canMake, save: false }).catch(() => null);
  const slots: PlanSlot[] = plan ? openSlots(plan, count) : [];

  const scores = await clipScores().catch(() => [] as ClipScore[]);
  const byPillar = new Map<string, { views: number; clicks: number; installs: number; posts: number }>();
  for (const s of scores) {
    const k = pillarOfFeature(s.feature);
    const f = byPillar.get(k) ?? { views: 0, clicks: 0, installs: 0, posts: 0 };
    f.views += s.views; f.clicks += s.clicks; f.installs += s.installs; f.posts += s.posts;
    byPillar.set(k, f);
  }
  const perf = byPillar.size
    ? [...byPillar.entries()].map(([f, v]) => `- ${f}: ${v.posts} posts, ${v.views} views, ${v.clicks} link clicks, ${v.installs} installs`).join("\n")
    : "- No posted results yet.";

  const catalog = offered.map((t) => templateBrief(t)).join("\n\n");
  const done = ideas.map((i) => `- ${i.template} ${JSON.stringify(flowInputs(i.inputs))} on ${i.closet} "${i.title}" (${i.status})`).join("\n") || "- none yet";
  const closetBrief = PERSONAS.filter((p) => closets.includes(p.key)).map((p) => `- ${p.key}: ${p.describe}`).join("\n");
  const month = now.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/Chicago" });
  const launch = launchSteer(now);

  const prompt = `Today is ${month}. Write ${slots.length || count} clip idea${(slots.length || count) === 1 ? "" : "s"}${slots.length ? ", one for each SLOT below, in order" : ""}.
${slots.length ? `\nTHIS WEEK'S SLOTS (from the six-week plan; each says what the clip is for and which opening to test):\n${slots.map((s) => slotBriefFor(PLAYBOOKS.whichoutfit, s)).join("\n\n")}\n` : "\nNo plan is available this week: mix re-cuts and flows across different features, and pick seasonal inputs.\n"}${launch ? `${launch}\nWhere the LAUNCH block and a slot disagree, the launch block wins for that slot: keep the slot's id and hook, change the template, inputs and story.\n` : ""}
RESULTS SO FAR BY PILLAR (Instagram; small numbers, so a guide and not a rule):
${perf}

ALREADY PLANNED OR MADE — never repeat a template with the same inputs or the same opening:
${done}

CLOSETS (flow ideas only; recuts are "original"):
${closetBrief}

TEMPLATE CATALOG:
${catalog}`;

  const { written, dropped } = await writeIdeas(prompt, closets);
  // Autopilot (Content Studio switch): the weekly ideas skip review and go straight to the Mac.
  const { data: ap } = await db.from("studio_settings").select("value").eq("key", "autopilot").maybeSingle();
  // A launch window overrides autopilot: launch clips are reviewed before they film.
  // So does a script the critic never saw: autopilot only films what was checked.
  const autopilot = ap?.value === true && !needsReview(now);
  const bySlot = new Map(slots.map((s) => [s.id, s]));
  const rows = written.map((w) => ({ ...tagForPlan(w, bySlot.get(w.slot)), status: autopilot && w.reviewed ? "approved" : "proposed", source: "planner" }));
  if (rows.length) {
    const { data: saved, error: insErr } = await db.from("social_ideas").insert(rows).select("id,inputs");
    if (insErr) throw insErr;
    if (plan) {
      let next = plan;
      for (const row of (saved ?? []) as { id: string; inputs: Record<string, string> }[]) {
        const slot = row.inputs?.[META.slot];
        if (slot) next = markDrafted(next, slot, row.id);
      }
      await savePlan(next).catch(() => undefined); // the ideas are in; a plan that didn't save is rebuilt next run
    }
  }
  return { drafted: rows.length, dropped };
}

/** Stamp an idea with what it is testing (pillar, series, slot), so its results can teach the plan. */
function tagForPlan(w: Written, slot: PlanSlot | undefined): IdeaFields {
  const f = w.fields;
  const t = getTemplate(f.template);
  const made = episodeOf(PLAYBOOKS.whichoutfit, f.template, flowInputs(f.inputs));
  const inputs: Record<string, string> = { ...f.inputs, [META.pillar]: slot && slot.template === f.template ? slot.pillar : pillarOfFeature(t?.feature ?? featureOf(f.template)) };
  const [series, episode] = slot && slot.template === f.template ? [slot.series, slot.episode] : (made?.split(":") ?? []);
  if (series && episode) { inputs[META.series] = series; inputs[META.episode] = episode; }
  if (slot) inputs[META.slot] = slot.id;
  if (!inputs[META.hook] && slot) inputs[META.hook] = slot.hook;
  return { ...f, inputs };
}

/** A persona closet is offered once it is mostly stocked; an empty one would film an empty closet. */
const MIN_STOCKED = 8;

export async function availableClosets(): Promise<string[]> {
  const out = ["original"];
  for (const p of PERSONAS) {
    if (p.key === "original") continue;
    if (p.startsEmpty) {
      if (needsReview(new Date())) out.push(p.key); // only while a launch campaign is live
      continue;
    }
    if (p.cloneFrom) {
      // Available once the copy exists (its seeded add-ons don't count toward it).
      if ((await closetSize(p.key).catch(() => 0)) >= MIN_STOCKED) out.push(p.key);
      continue;
    }
    const have = await seededSlots(p.key).catch(() => []);
    if (have.length >= Math.min(MIN_STOCKED, p.wardrobe.length)) out.push(p.key);
  }
  return out;
}

// --- render completion (engine API) ---------------------------------------

export async function completeIdea(id: string, videoUrl: string, now = new Date()): Promise<{ clip_id: string; scheduled_for: string }> {
  const db = admin();
  const { data, error } = await db.from("social_ideas").select("*").eq("id", id).eq("brand", WHICHOUTFIT).single();
  if (error) throw error;
  const idea = data as IdeaRow;
  const t = getTemplate(idea.template);
  const clip = `${t?.feature ?? "clip"}_${id.replace(/-/g, "").slice(0, 6)}`;

  // Re-running a finished job must not book it twice.
  const { data: existing } = await db.from("social_posts").select("scheduled_for").eq("clip_id", clip).limit(1);
  if (existing?.length) {
    await db.from("social_ideas").update({ status: "rendered", clip_id: clip, error: null }).eq("id", id);
    return { clip_id: clip, scheduled_for: (existing[0] as { scheduled_for: string }).scheduled_for };
  }

  const posts = await loadPosts();
  const taken = posts.filter((p) => p.platform === "instagram" && p.status !== "failed").map((p) => new Date(p.scheduled_for));
  // New work goes out at the first free slot at least half a day away — two days
  // during a launch window, so the finished cut can be watched (and dropped from
  // the Social calendar) before Instagram auto-publishes it.
  const launch = needsReview(now);
  const [slot] = nextSlots(new Date(now.getTime() + (launch ? 48 : 12) * 3_600_000), 1, taken);
  const caption = idea.captions[idea.caption_pick] ?? idea.captions[0] ?? idea.title;
  const at = slot.toISOString();
  const { error: insErr } = await db.from("social_posts").insert(
    (["instagram", "tiktok"] as const).map((platform) => ({
      clip_id: clip,
      platform,
      caption,
      hashtags: cleanHashtags(idea.hashtags) || null,
      video_url: videoUrl,
      campaign: `${platform === "instagram" ? "ig" : "tt"}_${clip}`,
      scheduled_for: at,
      status: platform === "instagram" ? "queued" : "manual",
    }))
  );
  if (insErr) throw insErr;
  await db.from("social_ideas").update({ status: "rendered", clip_id: clip, error: null }).eq("id", id);
  if (launch) {
    const when = slot.toLocaleString("en-US", { timeZone: "America/Chicago", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    await sendAdminAlert(
      `Launch clip ready to check: ${idea.title}`,
      `<p><b>${esc(idea.title)}</b> is rendered and booked for <b>${when} CT</b>. Instagram posts it automatically then.</p>` +
        `<p><a href="${esc(videoUrl)}">Watch the cut</a>. If the results on screen aren't solid (a missing product photo, an off look, an error banner, dead air), drop it from the Social calendar and re-approve the idea to re-film.</p>` +
        `<p>Caption: ${esc(caption)}</p>`
    ).catch(() => undefined);
  }
  return { clip_id: clip, scheduled_for: at };
}

// --- 3. the weekly digest -------------------------------------------------

export type PlanResult = {
  refill: RefillResult | { error: string };
  ideas: DraftResult | { error: string };
  digest: { sent: boolean; reason?: string };
};

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

async function digestHtml(now: Date, refill: PlanResult["refill"], ideas: PlanResult["ideas"]): Promise<{ subject: string; html: string }> {
  const posts = await loadPosts();
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const lastWeek = posts.filter((p) => p.platform === "instagram" && p.status === "posted" && (p.posted_at ?? "") >= weekAgo);
  const queued = posts.filter((p) => p.platform === "instagram" && ["queued", "publishing"].includes(p.status));
  const runway = runwayDays(now, queued.map((p) => new Date(p.scheduled_for)));
  // Rows parked as failed by hand say so ("Dropped on purpose"); only real failures count.
  const failed = posts.filter((p) => p.status === "failed" && p.scheduled_for >= weekAgo && !/on purpose/i.test(p.error ?? ""));
  const { data: waiting } = await admin().from("social_ideas").select("title,template").eq("brand", WHICHOUTFIT).eq("status", "proposed");
  const { data: approved } = await admin().from("social_ideas").select("title").eq("brand", WHICHOUTFIT).eq("status", "approved");
  const top = (await clipScores(posts).catch(() => []))[0];

  const li = (s: string) => `<li>${s}</li>`;
  const parts: string[] = [];
  // The strategy first, in plain sentences: what we're testing, what we learned, what's next.
  for (const brand of ["whichoutfit", "comeback"] as const) {
    const plan = await loadPlan(brand).catch(() => null);
    if (!plan?.summary.length) continue;
    parts.push(`<p><b>${brand === "whichoutfit" ? "WhichOutfit" : "Comeback"} strategy:</b> ${plan.summary.map(esc).join(" ")}</p>`);
  }
  parts.push(`<p><b>Queue:</b> ${queued.length} Reels booked, reaching ${runway} days ahead${runway < RUNWAY_DAYS ? " — <b>short</b>" : ""}.</p>`);
  if ("error" in refill) parts.push(`<p>Top-up failed: ${esc(refill.error)}</p>`);
  else if (refill.filled.length) parts.push(`<p>Topped up with ${refill.filled.length} re-post(s) of proven clips: ${refill.filled.map(esc).join(", ")}.</p>`);
  else if (refill.short) parts.push(`<p>${refill.short} slot(s) need filling and nothing is old enough to re-post yet. Approve and render a new idea to cover them.</p>`);

  parts.push(
    `<p><b>Last 7 days:</b> ${lastWeek.length} Reel(s) went out.</p>` +
      (lastWeek.length ? `<ul>${lastWeek.map((p) => li(`${esc(p.clip_id)} — ${p.views ?? "?"} views, ${p.likes ?? 0} likes, ${p.saves ?? 0} saves`)).join("")}</ul>` : "")
  );
  if (top) parts.push(`<p><b>Best clip so far:</b> ${esc(top.clip_id)} (${top.views} views, ${top.clicks} clicks, ${top.installs} installs).</p>`);
  if (failed.length) parts.push(`<p><b>${failed.length} post(s) failed this week</b> — see the Social tab.</p>`);

  const drafted = "error" in ideas ? 0 : ideas.drafted;
  parts.push(
    `<p><b>Ideas:</b> ${drafted} new this week, ${(waiting ?? []).length} waiting for you, ${(approved ?? []).length} approved and ready to render.</p>` +
      ((waiting ?? []).length ? `<ul>${(waiting as { title: string }[]).map((w) => li(esc(w.title))).join("")}</ul>` : "")
  );
  if ("error" in ideas) parts.push(`<p>Drafting failed: ${esc(ideas.error)}</p>`);
  const p = llmProvider();
  parts.push(`<p><a href="https://admin.whichoutfit.app/content">Approve ideas in the Content Studio</a>; the six-week plan is on the same page. Scripts written and checked by ${p.provider === "claude" ? "Claude" : "Gemini"} (${esc(p.model)}).</p>`);

  const subject = `Social engine: ${runway}d of posts queued, ${(waiting ?? []).length} idea(s) to review`;
  return { subject, html: parts.join("\n") };
}

export async function runSocialPlan(now = new Date()): Promise<PlanResult> {
  // Comeback's plan is re-drawn every week too (no model call, no posts): its
  // pieces are drafted on request from /comeback/runway, never from this cron.
  await refreshPlan("comeback", now).catch(() => undefined);
  let refill: PlanResult["refill"];
  try {
    refill = await refillRunway(now);
  } catch (e) {
    refill = { error: errorMessage(e) };
  }
  let ideas: PlanResult["ideas"];
  try {
    ideas = await draftIdeas(IDEAS_PER_WEEK, now);
  } catch (e) {
    ideas = { error: errorMessage(e) };
  }
  let digest: PlanResult["digest"];
  try {
    const { subject, html } = await digestHtml(now, refill, ideas);
    digest = await sendAdminAlert(subject, html);
  } catch (e) {
    digest = { sent: false, reason: errorMessage(e) };
  }
  return { refill, ideas, digest };
}

export type EngineJob = Omit<IdeaRow, "inputs"> & {
  /** The flow's real inputs only (what gets typed into the app). */
  inputs: Record<string, string>;
  job: Template;
  /** The Gemini TTS voice name for this closet. */
  voice: string;
  /** One sentence for the narrator: who is talking, to whom, the mood, the pace. Always set. */
  direction: string;
  /** The spoken end-card line, voiced in the same take as the script. */
  cta: string;
  /** What the clip is testing, for logs; the renderer can ignore it. */
  meta: { pillar: string | null; series: string | null; episode: string | null; hook: string | null; slot: string | null };
};

/**
 * For the engine's GET /jobs: approved ideas with everything the Mac needs to
 * render them. Contract with the renderer (voice-first, engine v2):
 *   voiceover[i]  one line per beat, ANCHORED to job.beats[i] — its first words
 *                 land as that beat's picture appears. Beats are not durations
 *                 to fill; lines are as short as speech makes them.
 *   direction     the director's note for the take (pass to POST /voice).
 *   cta           the end-card line, to voice in the same take.
 * `voiceover`, `job.beats`, `voice`, `inputs` and `closet` are unchanged in
 * shape, so the v1 worker keeps working; `inputs` never carries the engine's
 * own "_" notes.
 */
export async function approvedJobs(): Promise<EngineJob[]> {
  const { data, error } = await admin().from("social_ideas").select("*").eq("brand", WHICHOUTFIT).eq("status", "approved").order("created_at");
  if (error) throw error;
  return ((data ?? []) as IdeaRow[]).flatMap((i) => {
    const t = getTemplate(i.template);
    return t ? [toJob(i, t)] : [];
  });
}

export function toJob(i: IdeaRow, t: Template): EngineJob {
  const m = i.inputs ?? {};
  return {
    ...i,
    inputs: flowInputs(m),
    job: t,
    voice: voiceFor(i.closet),
    direction: directionFor(m, "whichoutfit"),
    cta: CTA_LINE,
    meta: { pillar: m[META.pillar] ?? null, series: m[META.series] ?? null, episode: m[META.episode] ?? null, hook: m[META.hook] ?? null, slot: m[META.slot] ?? null },
  };
}
