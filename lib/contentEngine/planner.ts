import { admin } from "@/lib/supabase";
import { cleanHashtags } from "./hashtags";
import { errorMessage } from "./auth";
import { getAttribution } from "@/lib/attribution";
import { sendAdminAlert } from "@/lib/alert";
import { generateJson } from "./gemini";
import { TEMPLATES, getTemplate, syllableBudget, type Template } from "./templates";
import { featureOf, scoreClip, validateIdea, type RawIdea } from "./rules";
import { PERSONAS, voiceFor } from "./personas";
import { seededSlots, closetSize } from "./personaAccounts";
import { nextSlots, runwayDays, slotsToFill, RUNWAY_DAYS } from "./schedule";

// The content engine's brain. Runs weekly from /api/cron/social-plan and does
// three things, each best-effort so one failing never blocks the others:
//
//   1. refillRunway — if the queue reaches less than RUNWAY_DAYS ahead, re-post
//      the best-performing clips (with fresh captions) into the empty slots.
//      This is what keeps the account posting when nobody has made anything new.
//   2. draftIdeas   — writes new clip ideas from what is working, as 'proposed'
//      rows for the owner to approve on the Social tab. Approved ideas are
//      rendered on the Mac (FitCheck tools/capture-engine/social/engine.py).
//   3. digest       — one email: runway, last week's results, ideas waiting.
//
// completeIdea() is the other half of the render loop: the engine API calls it
// once a rendered video is uploaded, and it books the clip into the calendar.

/** A clip is not re-posted until this long after it last went out. */
const RECYCLE_GAP_DAYS = 28;

/** Stop drafting while this many ideas are still waiting for a decision. */
const MAX_PENDING_IDEAS = 6;

const IDEAS_PER_WEEK = 4;

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

type PostRow = {
  clip_id: string;
  platform: "instagram" | "tiktok";
  caption: string;
  hashtags: string | null;
  video_url: string | null;
  campaign: string | null;
  scheduled_for: string;
  status: string;
  posted_at: string | null;
  views: number | null;
  likes: number | null;
  saves: number | null;
  shares: number | null;
  error: string | null;
};

// --- performance ----------------------------------------------------------

export type ClipScore = {
  clip_id: string;
  feature: string;
  posts: number;
  views: number;
  clicks: number;
  installs: number;
  score: number;
  lastOut: string | null;
};

async function loadPosts(): Promise<PostRow[]> {
  const { data, error } = await admin()
    .from("social_posts")
    .select("clip_id,platform,caption,hashtags,video_url,campaign,scheduled_for,status,posted_at,views,likes,saves,shares,error")
    .order("scheduled_for", { ascending: true });
  if (error) throw error;
  return (data ?? []) as PostRow[];
}

export async function clipScores(posts?: PostRow[]): Promise<ClipScore[]> {
  const rows = posts ?? (await loadPosts());
  const attribution = await getAttribution(120).catch(() => null);
  const byCampaign = new Map(attribution?.rows.map((r) => [r.campaign, r]) ?? []);

  const by = new Map<string, ClipScore & { likes: number; saves: number; shares: number }>();
  for (const p of rows) {
    if (p.platform !== "instagram" || p.status !== "posted") continue;
    const base = baseClip(p.clip_id);
    let s = by.get(base);
    if (!s) {
      s = { clip_id: base, feature: featureOf(base), posts: 0, views: 0, clicks: 0, installs: 0, score: 0, lastOut: null, likes: 0, saves: 0, shares: 0 };
      by.set(base, s);
    }
    s.posts++;
    s.views += p.views ?? 0;
    s.likes += p.likes ?? 0;
    s.saves += p.saves ?? 0;
    s.shares += p.shares ?? 0;
    if (p.posted_at && (!s.lastOut || p.posted_at > s.lastOut)) s.lastOut = p.posted_at;
    // Clicks and installs are keyed by campaign; both platforms' links count.
    for (const c of [p.campaign, p.campaign?.replace(/^ig_/, "tt_")]) {
      const a = c ? byCampaign.get(c) : undefined;
      if (a) {
        s.clicks += a.clicks;
        s.installs += a.ios_est + a.android_installs;
        byCampaign.delete(c!); // count each campaign once even if two rows share it
      }
    }
  }
  return [...by.values()]
    .map(({ likes, saves, shares, ...s }) => ({ ...s, score: scoreClip({ ...s, likes, saves, shares }) }))
    .sort((a, b) => b.score - a.score);
}

/** "06_resale_listing_r2" → "06_resale_listing": a re-post is the same clip. */
function baseClip(clipId: string): string {
  return clipId.replace(/_r\d+$/, "");
}

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

  const scores = await clipScores(posts);
  const picks = scores
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

const VOICE_RULES = `WhichOutfit builds, rates and plans outfits from the clothes you already own.
Lead with that payoff, never the technology: don't say "AI" in narration or captions unless the clip is literally about how it works, and then once at most. The viewer cares about the outfit, the trip, the event, not the model behind it.
Voice: second person or first person singular, plain, specific, a little dry, the way a person talks to a friend. Concrete details from the footage beat adjectives. No hype or AI-sounding words (game-changer, obsessed, insane, elevate, effortless, seamless, unlock, revolutionize, "say goodbye to", "level up"), no emojis, no exclamation marks in narration.
Never imply gender or body type; clothing talk is gender-neutral.
Never mention price, Premium, subscriptions, or downloading — a call-to-action end card is added automatically after every clip.`;

// Shared by every caption the engine writes. Platform search reads caption
// text, so a searchable phrase does more than any hashtag.
const CAPTION_RULES = `Caption rules (Instagram and TikTok):
- The first line is the hook and must work alone; only about the first 100 characters show before "more".
- Work in one phrase people actually search, said naturally ("what to wear to a fall wedding", "capsule wardrobe for a weekend trip", "closet clean out").
- Optionally end with one low-effort prompt that earns a comment or a save ("Which one would you wear?", "Save this for your next trip"); vary it, never the same one twice in a row.
- Under 150 characters. No hashtags in the caption, no emojis, no em dashes.`;

const HASHTAG_RULES = `Hashtags: exactly 5, lowercase, space-separated. 1–2 broad but on-niche (#outfitideas #whattowear #capsulewardrobe #closetorganization), 3–4 specific to what THIS clip shows and how someone would search for it (#weddingguestoutfit #packinglist #fallfits #thriftflip). Never: our brand (#whichoutfit), feed bait (#fyp #viral #satisfying #explore), platform names, AI/tech/app tags, or one-word giants (#fashion #style). Anything past five, or on that list, is stripped before posting.`;

const CAPTION_SYSTEM = `${VOICE_RULES}
${CAPTION_RULES}
You write captions for clips that already exist. One caption per clip, clearly different from the previous caption you are shown — a different angle, not a rewording.`;

export const IDEA_SCHEMA = {
  type: "OBJECT",
  properties: {
    ideas: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          template: { type: "STRING" },
          inputs: {
            type: "ARRAY",
            items: { type: "OBJECT", properties: { name: { type: "STRING" }, value: { type: "STRING" } }, required: ["name", "value"] },
          },
          closet: { type: "STRING" },
          title: { type: "STRING" },
          voiceover: { type: "ARRAY", items: { type: "STRING" } },
          captions: { type: "ARRAY", items: { type: "STRING" } },
          hashtags: { type: "STRING" },
          rationale: { type: "STRING" },
        },
        required: ["template", "inputs", "closet", "title", "voiceover", "captions", "hashtags", "rationale"],
      },
    },
  },
  required: ["ideas"],
};

export const IDEA_SYSTEM = `${VOICE_RULES}

You plan short vertical clips (15–30s) for WhichOutfit's Instagram and TikTok. Each idea uses one TEMPLATE from the catalog and writes a fresh voiceover for it.

Voiceover rules — these are hard limits, the narration is synthesized and laid onto fixed footage:
- Exactly one line per beat, in order. The line count must equal the template's beat count.
- Each line must fit its beat's syllable budget (shown as "≤N syl"), and should use most of it (aim for 80–100%). Over is never fine; well under leaves dead air on the clip.
- The lines are ONE person telling ONE short story, first person, the way a friend would: the problem (beat 1), what they did, the turn ("and here's the thing", "but then"), the payoff. Each line leads into the next; never a list of features. Model: "You know when a wedding invite shows up, and you have absolutely nothing to wear?" / "So I opened up WhichOutfit, went to Dress for an Event, and typed in the occasion." / "Outdoor summer wedding. That's it, that's literally all I gave it to work with." / "And every single look it built came straight out of my own closet."
- Don't end on a call to action; the clip's end card has its own spoken line ("Download WhichOutfit…").
- Prefer commas to full stops inside a line; every mid-line full stop costs a pause.
- Each line must match what is on screen during that beat (the "was:" text is the line that used to play there). Change the angle, the hook and the wording, never the facts on screen.
- Beat 1 is the hook: a situation the viewer recognizes, said in a way that makes them stay. It plays over the opening screen, so it must not depend on what is on screen.
- The last beat lands the payoff on screen.
- Closet: "recut" ideas are always "original" (the footage already exists). For "flow" ideas pick a closet from CLOSETS whose style suits the input — a menswear closet for a groom's-party occasion, streetwear for a concert — and spread flow ideas across different closets so the feed doesn't show one wardrobe every time. Never describe the person; talk about the clothes and the occasion.
- For "flow" templates, the new input replaces what the footage originally showed (e.g. a new occasion instead of "outdoor summer wedding"); say the new input where the old line said the old one, and never mention the old one.

Captions: exactly three options — [0] hook/curiosity, [1] plain and useful, [2] personal or POV.
${CAPTION_RULES}
${HASHTAG_RULES}
Title: a short internal name, 3–6 words.
Rationale: one sentence on why this idea, citing the performance data when it informed the choice.`;

export type DraftResult = { drafted: number; skipped?: string; dropped: string[] };

export async function draftIdeas(count = IDEAS_PER_WEEK, now = new Date()): Promise<DraftResult> {
  const db = admin();
  const { data: recent, error } = await db
    .from("social_ideas")
    .select("template,inputs,closet,title,status")
    .order("created_at", { ascending: false })
    .limit(60);
  if (error) throw error;
  const ideas = (recent ?? []) as Pick<IdeaRow, "template" | "inputs" | "closet" | "title" | "status">[];
  const pending = ideas.filter((i) => i.status === "proposed").length;
  if (pending >= MAX_PENDING_IDEAS) return { drafted: 0, skipped: `${pending} ideas already waiting for a decision`, dropped: [] };

  const scores = await clipScores().catch(() => [] as ClipScore[]);
  const byFeature = new Map<string, { views: number; clicks: number; installs: number; posts: number }>();
  for (const s of scores) {
    const f = byFeature.get(s.feature) ?? { views: 0, clicks: 0, installs: 0, posts: 0 };
    f.views += s.views; f.clicks += s.clicks; f.installs += s.installs; f.posts += s.posts;
    byFeature.set(s.feature, f);
  }
  const perf = byFeature.size
    ? [...byFeature.entries()]
        .sort((a, b) => b[1].views - a[1].views)
        .map(([f, v]) => `- ${f}: ${v.posts} posts, ${v.views} views, ${v.clicks} link clicks, ${v.installs} installs`)
        .join("\n")
    : "- No posted results yet. Favour the features with the most concrete payoff on screen (a score, a price, a palette).";

  const catalog = TEMPLATES.map((t) => templateBrief(t)).join("\n\n");
  const done = ideas.map((i) => `- ${i.template} ${JSON.stringify(i.inputs)} on ${i.closet} "${i.title}" (${i.status})`).join("\n") || "- none yet";
  const closets = await availableClosets();
  const closetBrief = PERSONAS.filter((p) => closets.includes(p.key)).map((p) => `- ${p.key}: ${p.describe}`).join("\n");
  const month = now.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "America/Chicago" });

  const prompt = `Today is ${month}. Draft ${count} new clip ideas.
Mix: about half "recut" (cheap, re-narrates existing footage) and half "flow" (films new inputs). Lean toward features that are performing; give at least one idea to a feature with little or no data so we keep learning. Seasonal hooks are welcome when they fit (${month}).

PERFORMANCE BY FEATURE (Instagram, posts the app published):
${perf}

ALREADY PLANNED OR MADE — do not repeat a template with the same inputs or the same angle:
${done}

CLOSETS (flow ideas only; recuts are "original"):
${closetBrief}

TEMPLATE CATALOG:
${catalog}`;

  const r = await generateJson<{ ideas: RawIdea[] }>(IDEA_SYSTEM, prompt, IDEA_SCHEMA);
  // Autopilot (Content Studio switch): the weekly ideas skip review and go straight to the Mac.
  const { data: ap } = await db.from("studio_settings").select("value").eq("key", "autopilot").maybeSingle();
  const autopilot = ap?.value === true;
  const rows: Record<string, unknown>[] = [];
  const dropped: string[] = [];
  for (const raw of r.ideas ?? []) {
    const v = validateIdea(raw, closets);
    if (typeof v === "string") dropped.push(`${raw.title || raw.template}: ${v}`);
    else rows.push({ ...v, status: autopilot ? "approved" : "proposed", source: "planner" });
  }
  if (rows.length) {
    const { error: insErr } = await db.from("social_ideas").insert(rows);
    if (insErr) throw insErr;
  }
  return { drafted: rows.length, dropped };
}

/** A persona closet is offered once it is mostly stocked; an empty one would film an empty closet. */
const MIN_STOCKED = 8;

export async function availableClosets(): Promise<string[]> {
  const out = ["original"];
  for (const p of PERSONAS) {
    if (p.key === "original") continue;
    if (p.cloneFrom) {
      // A cloned closet is never seeded; it's available once the copy exists.
      if ((await closetSize(p.key).catch(() => 0)) >= MIN_STOCKED) out.push(p.key);
      continue;
    }
    const have = await seededSlots(p.key).catch(() => []);
    if (have.length >= Math.min(MIN_STOCKED, p.wardrobe.length)) out.push(p.key);
  }
  return out;
}

export function templateBrief(t: Template): string {
  const beats = t.beats
    .map((b, i) => `  beat ${i + 1} (${(b.end - b.start).toFixed(1)}s, ≤${syllableBudget(b)} syl) was: "${b.was}"`)
    .join("\n");
  const inputs = t.inputs.length ? `\n  inputs: ${t.inputs.map((i) => `${i.name} — ${i.describe}`).join("; ")}` : "";
  return `${t.key} [${t.kind}] — ${t.shows}${inputs}\n${beats}`;
}

// --- render completion (engine API) ---------------------------------------

export async function completeIdea(id: string, videoUrl: string, now = new Date()): Promise<{ clip_id: string; scheduled_for: string }> {
  const db = admin();
  const { data, error } = await db.from("social_ideas").select("*").eq("id", id).single();
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
  // New work goes out at the first free slot at least half a day away.
  const [slot] = nextSlots(new Date(now.getTime() + 12 * 3_600_000), 1, taken);
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
  const { data: waiting } = await admin().from("social_ideas").select("title,template").eq("status", "proposed");
  const { data: approved } = await admin().from("social_ideas").select("title").eq("status", "approved");
  const top = (await clipScores(posts).catch(() => []))[0];

  const li = (s: string) => `<li>${s}</li>`;
  const parts: string[] = [];
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
  parts.push(`<p><a href="https://admin.whichoutfit.app/social">Approve ideas on the Social tab</a>. Then run <code>./engine.py</code> on the Mac to film and queue them.</p>`);

  const subject = `Social engine: ${runway}d of posts queued, ${(waiting ?? []).length} idea(s) to review`;
  return { subject, html: parts.join("\n") };
}

export async function runSocialPlan(now = new Date()): Promise<PlanResult> {
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

/** For the engine's GET /jobs: approved ideas with everything the Mac needs to render them. */
export async function approvedJobs(): Promise<(IdeaRow & { job: Template; voice: string })[]> {
  const { data, error } = await admin().from("social_ideas").select("*").eq("status", "approved").order("created_at");
  if (error) throw error;
  return ((data ?? []) as IdeaRow[]).flatMap((i) => {
    const t = getTemplate(i.template);
    return t ? [{ ...i, job: t, voice: voiceFor(i.closet) }] : [];
  });
}

