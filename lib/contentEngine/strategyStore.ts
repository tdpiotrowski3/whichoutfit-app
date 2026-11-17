import { admin } from "@/lib/supabase";
import { WHICHOUTFIT } from "@/lib/brand";
import { clipScores, loadPosts } from "./performance";
import { campaignDay, LAUNCH_CAMPAIGNS } from "./rules";
import { META, type Brand } from "./scriptRules";
import { getTemplate } from "./templates";
import { PLAYBOOKS, buildPlan, episodeOf, pillarOfFeature, type Outcome, type Plan } from "./strategy";

// The I/O around strategy.ts. The rolling plan lives in studio_settings (one
// jsonb row per brand, key "strategy:<brand>"), so it needs no table of its
// own; each brand's plan is built only from that brand's ideas and posts.

const key = (brand: Brand) => `strategy:${brand}`;

export async function loadPlan(brand: Brand): Promise<Plan | null> {
  const { data } = await admin().from("studio_settings").select("value").eq("key", key(brand)).maybeSingle();
  const v = data?.value as Plan | null | undefined;
  return v && v.version === 1 && v.brand === brand && Array.isArray(v.weeks) ? v : null;
}

export async function savePlan(plan: Plan): Promise<void> {
  const { error } = await admin().from("studio_settings").upsert({ key: key(plan.brand), value: plan, updated_at: new Date().toISOString() });
  if (error) throw error;
}

type IdeaMeta = { template: string; inputs: Record<string, string> | null; clip_id: string | null; status: string };

/** Finished clips for a brand, each tagged with the pillar, hook and format it was testing. */
export async function outcomesFor(brand: Brand, ideas: IdeaMeta[], now = new Date()): Promise<Outcome[]> {
  const posts = await loadPosts(brand);
  const scores = await clipScores(posts, brand);
  const byClip = new Map(ideas.filter((i) => i.clip_id).map((i) => [i.clip_id!, i]));
  return scores.map((s) => {
    const idea = byClip.get(s.clip_id);
    const t = idea ? getTemplate(idea.template) : undefined;
    return {
      clip: s.clip_id,
      // Clips made before ideas carried a pillar are filed by their feature; their hook is unknown and counts toward no hook.
      pillar: idea?.inputs?.[META.pillar] || (brand === WHICHOUTFIT ? pillarOfFeature(s.feature) : undefined),
      hook: idea?.inputs?.[META.hook] || undefined,
      kind: brand === WHICHOUTFIT ? (t?.kind === "flow" ? "filmed" : "recut") : undefined,
      score: s.score,
      views: s.views,
      clicks: s.clicks,
      installs: s.installs,
      ageDays: s.lastOut ? (now.getTime() - new Date(s.lastOut).getTime()) / 86_400_000 : 0,
    };
  });
}

export type RefreshOptions = { canMake?: (template: string) => boolean; save?: boolean };

/**
 * Re-plan a brand from its latest results and store the plan. Runs every
 * Monday (planner.ts runSocialPlan), before drafting, and on demand from the
 * Studio. Slots that already have an idea drafted keep their place.
 */
export async function refreshPlan(brand: Brand, now = new Date(), opts: RefreshOptions = {}): Promise<Plan> {
  const db = admin();
  const { data, error } = await db
    .from("social_ideas")
    .select("template,inputs,clip_id,status")
    .eq("brand", brand)
    .neq("status", "rejected")
    .order("created_at", { ascending: false })
    .limit(120);
  if (error) throw error;
  const ideas = (data ?? []) as IdeaMeta[];
  const b = PLAYBOOKS[brand];
  const used = ideas
    .map((i) => (i.inputs?.[META.series] && i.inputs?.[META.episode] ? `${i.inputs[META.series]}:${i.inputs[META.episode]}` : episodeOf(b, i.template, i.inputs ?? {})))
    .filter((x): x is string => !!x);
  const [prev, outcomes] = await Promise.all([loadPlan(brand).catch(() => null), outcomesFor(brand, ideas, now).catch(() => [] as Outcome[])]);
  const plan = buildPlan({
    brand,
    now,
    prev,
    outcomes,
    used,
    canMake: opts.canMake,
    // Launch campaigns are WhichOutfit's; a week is a launch week if its Thursday falls in a live window.
    launchIn: brand === WHICHOUTFIT
      ? (monday) => LAUNCH_CAMPAIGNS.find((c) => campaignDay(c, new Date(`${monday}T18:00:00Z`)) !== null || campaignDay(c, new Date(new Date(`${monday}T18:00:00Z`).getTime() + 3 * 86_400_000)) !== null)?.key ?? null
      : undefined,
  });
  if (opts.save !== false) await savePlan(plan);
  return plan;
}
