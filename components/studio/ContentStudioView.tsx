import Link from "next/link";
import type { SocialIdeaDbRow, SocialPostDbRow } from "@/lib/data";
import { Card } from "@/components/ui";
import { DraftIdeasButton } from "@/components/studio/DraftIdeasButton";
import { NewVideo, CancelButton, ClosetRefresh, type TemplateOption, type ClosetOption } from "@/components/studio/StudioClient";
import { AgentConsole, IdeaCard, type AgentState } from "@/components/studio/Agent";
import { TEMPLATES, syllableBudget, type Template } from "@/lib/contentEngine/templates";
import { nextSlots } from "@/lib/contentEngine/schedule";
import { voiceFor } from "@/lib/contentEngine/personas";
import {
  activity, WORKER_STALE_MIN,
  type WorkerStatus, type ClosetInfo, type ActivityItem,
} from "@/lib/contentEngine/studio";


// The Content Studio, run as an agent: it says what it is doing and what it
// needs, takes plain-words requests, and the owner makes only the calls that
// are theirs. Underneath: ideas → approve → the Mac worker (engine.py --worker)
// films and narrates → booked into the calendar → posted → results.

const human = (s: string) => s.replace(/^\d\d_/, "").replace(/_social$/, "").replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

function templateLabel(t: Template): string {
  if (t.kind === "flow") return human(t.feature);
  const n = t.footage.match(/^(\d\d)_/)?.[1];
  return `${human(t.feature)}${n ? ` (clip ${n})` : ""}`;
}

const TZ = "America/Chicago";
const slotText = (d: string | Date) =>
  new Date(d).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: TZ });
const dayText = (d: string | Date) => new Date(d).toLocaleString("en-US", { weekday: "long", hour: "numeric", timeZone: TZ });

function ago(iso: string, now: Date): string {
  const m = Math.round((now.getTime() - new Date(iso).getTime()) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}

const FEED_ICON: Record<ActivityItem["kind"], { glyph: string; tone: string }> = {
  drafted: { glyph: "✦", tone: "text-[var(--wo-blue)]" },
  asked: { glyph: "✦", tone: "text-[var(--wo-blue)]" },
  approved: { glyph: "✓", tone: "text-[var(--wo-muted)]" },
  filming: { glyph: "●", tone: "text-[var(--wo-blue)]" },
  made: { glyph: "▶", tone: "text-[var(--wo-green)]" },
  scheduled: { glyph: "◷", tone: "text-[var(--wo-muted)]" },
  posted: { glyph: "↗", tone: "text-[var(--wo-green)]" },
  failed: { glyph: "!", tone: "text-[var(--wo-red,#e5484d)]" },
};

function Pipeline({ stages }: { stages: { label: string; n: number; hint: string }[] }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      {stages.map((s, i) => (
        <div key={s.label} className="relative rounded-xl border border-[var(--wo-border)] bg-white px-4 py-3 shadow-sm">
          <div className="text-xs font-medium uppercase tracking-wide text-[var(--wo-muted)]">{s.label}</div>
          <div className="mt-1 text-2xl font-semibold">{s.n}</div>
          <div className="text-xs text-[var(--wo-muted)]">{s.hint}</div>
          {i < stages.length - 1 ? <span className="absolute -right-2 top-1/2 z-10 hidden -translate-y-1/2 text-[var(--wo-border)] sm:block">›</span> : null}
        </div>
      ))}
    </div>
  );
}

function VideoTile({ idea, posts }: { idea: SocialIdeaDbRow; posts: SocialPostDbRow[] }) {
  const ig = posts.find((p) => p.platform === "instagram");
  const tt = posts.find((p) => p.platform === "tiktok");
  const url = ig?.video_url ?? tt?.video_url ?? null;
  const live = ig?.status === "posted";
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--wo-border)] bg-white">
      {url ? (
        <video src={url} controls preload="metadata" playsInline className="aspect-[9/16] w-full bg-black object-contain" />
      ) : (
        <div className="flex aspect-[9/16] w-full items-center justify-center bg-[var(--wo-bg)] text-xs text-[var(--wo-muted)]">No file</div>
      )}
      <div className="space-y-1 p-3">
        <div className="truncate text-sm font-medium">{idea.title}</div>
        <div className="text-xs text-[var(--wo-muted)]">
          {live ? `Posted · ${(ig?.views ?? 0).toLocaleString()} views · ${(ig?.likes ?? 0).toLocaleString()} likes` : ig ? `Posts ${slotText(ig.scheduled_for)}` : "Not scheduled"}
        </div>
        {tt?.status === "manual" && url ? (
          <a href={url} download className="text-xs text-[var(--wo-blue)] hover:underline">Download for TikTok</a>
        ) : null}
      </div>
    </div>
  );
}

export type ContentStudioData = {
  now: Date;
  ideas: SocialIdeaDbRow[];
  posts: SocialPostDbRow[];
  worker: WorkerStatus;
  closets: ClosetInfo[];
  autopilot: boolean;
};

/** The whole page, from its data — the route loads it (app/(dash)/content/page.tsx). */
export function ContentStudioView({ now, ideas, posts, worker, closets, autopilot }: ContentStudioData) {
  const templates: TemplateOption[] = TEMPLATES.map((t) => ({
    key: t.key, label: templateLabel(t), kind: t.kind, inputs: t.inputs,
    budgets: t.beats.map((b) => syllableBudget(b)), was: t.beats.map((b) => b.was),
  }));
  const closetOptions: ClosetOption[] = closets.map((c) => ({ key: c.key, label: c.label, available: c.available }));
  const footageUrl = new Map(posts.filter((p) => p.video_url).map((p) => [p.clip_id, p.video_url!]));

  const review = ideas.filter((i) => i.status === "proposed" || i.status === "failed");
  const approved = ideas.filter((i) => i.status === "approved");
  const rendering = ideas.filter((i) => i.status === "rendering");
  const made = ideas.filter((i) => i.status === "rendered" && i.clip_id);
  const postsByClip = new Map<string, SocialPostDbRow[]>();
  for (const p of posts) postsByClip.set(p.clip_id, [...(postsByClip.get(p.clip_id) ?? []), p]);
  const scheduled = posts.filter((p) => p.platform === "instagram" && (p.status === "queued" || p.status === "publishing") && new Date(p.scheduled_for) > now)
    .sort((a, b) => a.scheduled_for.localeCompare(b.scheduled_for));
  const postedCount = posts.filter((p) => p.status === "posted").length;
  const next = scheduled[0];
  const titleOf = (clip: string) => ideas.find((i) => i.clip_id === clip)?.title ?? human(clip.replace(/_r\d+$/, "").replace(/_[0-9a-f]{6}$/, ""));

  // What the agent says about itself, most urgent first.
  let state: AgentState = "idle";
  let headline = next ? `All caught up. Next up: “${titleOf(next.clip_id)}” on ${dayText(next.scheduled_for)}.` : "All caught up, but nothing is scheduled yet.";
  if (review.length) {
    state = "needs-you";
    headline = `${review.length} video idea${review.length === 1 ? "" : "s"} need${review.length === 1 ? "s" : ""} your call.`;
  }
  if (rendering.length) {
    state = "working";
    headline = `Filming and narrating “${rendering[0].title}” now.`;
  }
  if (approved.length && !worker.online) {
    state = "blocked";
    headline = `${approved.length} approved video${approved.length === 1 ? " is" : "s are"} ready to film, but the Mac video maker is off.`;
  }
  const detailParts = [
    next && state !== "idle" ? `Next post: “${titleOf(next.clip_id)}”, ${slotText(next.scheduled_for)}.` : null,
    `${scheduled.length} post${scheduled.length === 1 ? "" : "s"} scheduled.`,
    autopilot ? "Autopilot is on: Monday's ideas get made without asking." : "New ideas arrive every Monday.",
  ].filter(Boolean);

  const upcoming = nextSlots(now, 4).map((slot) => ({
    slot,
    post: posts.find((p) => p.platform === "instagram" && p.status !== "failed" && Math.abs(new Date(p.scheduled_for).getTime() - slot.getTime()) < 3_600_000),
  }));
  const feed = activity(ideas, posts, now);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Content Studio</h1>
          <p className="text-sm text-[var(--wo-muted)]">Your AI video team for Instagram and TikTok. Results and the full calendar are on <Link href="/social" className="text-[var(--wo-blue)] hover:underline">Social &amp; Ads</Link>.</p>
        </div>
        <DraftIdeasButton />
      </div>

      <AgentConsole state={state} headline={headline} detail={detailParts.join(" ")} autopilot={autopilot} />

      <Pipeline
        stages={[
          { label: "Ideas", n: review.length, hint: "waiting for you" },
          { label: "Approved", n: approved.length, hint: worker.online ? "next on the Mac" : "Mac is off" },
          { label: "Filming", n: rendering.length, hint: "a few minutes each" },
          { label: "Scheduled", n: scheduled.length, hint: next ? `next ${slotText(next.scheduled_for).split(",")[0]}` : "none" },
          { label: "Posted", n: postedCount, hint: "all time" },
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title={review.length ? `Needs your call (${review.length})` : "Needs your call"}>
            {review.length === 0 ? (
              <p className="text-sm text-[var(--wo-muted)]">Nothing waiting. Ask for a video above, or I&apos;ll bring new ideas on Monday.</p>
            ) : (
              <div className="space-y-4">
                {review.map((i) => {
                  const t = TEMPLATES.find((x) => x.key === i.template);
                  return (
                    <IdeaCard
                      key={`${i.id}-${i.status}-${i.voiceover.join("|").length}`}
                      idea={i}
                      template={templates.find((x) => x.key === i.template)}
                      closets={closetOptions}
                      footageUrl={t ? footageUrl.get(t.footage) ?? null : null}
                      closetLabel={closets.find((c) => c.key === i.closet)?.label ?? i.closet}
                      narrator={voiceFor(i.closet)}
                      beats={t?.beats ?? []}
                    />
                  );
                })}
              </div>
            )}
            <details className="mt-4 border-t border-[var(--wo-border)] pt-4">
              <summary className="cursor-pointer text-sm font-medium text-[var(--wo-blue)]">Or pick the format yourself</summary>
              <div className="mt-3"><NewVideo templates={templates} closets={closetOptions} /></div>
            </details>
          </Card>

          {approved.length || rendering.length ? (
            <Card title="Being made">
              <ul className="divide-y divide-[var(--wo-border)] text-sm">
                {[...rendering, ...approved].map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <span className="flex items-center gap-2">
                      <span className={`inline-block h-2 w-2 rounded-full ${i.status === "rendering" ? "animate-pulse bg-[var(--wo-blue)]" : "bg-[var(--wo-border)]"}`} />
                      <span className="font-medium">{i.title}</span>
                      <span className="text-[var(--wo-muted)]">
                        {i.status === "rendering" ? "filming and narrating now" : worker.online ? "next up" : "waiting for the Mac"}
                      </span>
                    </span>
                    {i.status === "approved" ? <CancelButton id={i.id} /> : null}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Card title={made.length ? `Videos made (${made.length})` : "Videos made"}>
            {made.length === 0 ? (
              <p className="text-sm text-[var(--wo-muted)]">Finished videos show up here, ready to watch, with when they post and how they did.</p>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                {made.map((i) => <VideoTile key={i.id} idea={i} posts={postsByClip.get(i.clip_id!) ?? []} />)}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Up next" right={<Link href="/social" className="text-xs text-[var(--wo-blue)] hover:underline">Calendar →</Link>}>
            <ul className="space-y-3 text-sm">
              {upcoming.map(({ slot, post }) => (
                <li key={slot.toISOString()} className="flex gap-3">
                  <span className="w-20 shrink-0 text-xs text-[var(--wo-muted)]">{slotText(slot).replace(/, \d+:\d+ [AP]M$/, "")}</span>
                  {post ? <span className="min-w-0 truncate font-medium">{titleOf(post.clip_id)}</span> : <span className="text-[var(--wo-muted)]">Open slot</span>}
                </li>
              ))}
            </ul>
          </Card>

          <Card title="Activity">
            {feed.length === 0 ? (
              <p className="text-sm text-[var(--wo-muted)]">Nothing yet.</p>
            ) : (
              <ol className="space-y-3">
                {feed.map((a, n) => (
                  <li key={n} className="flex gap-3 text-sm">
                    <span className={`w-4 shrink-0 text-center ${FEED_ICON[a.kind].tone}`}>{FEED_ICON[a.kind].glyph}</span>
                    <span className="min-w-0 flex-1">
                      {a.text}
                      <span className="block text-xs text-[var(--wo-muted)]">{ago(a.at, now)}</span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </Card>

          <Card title="Video maker">
            <div className="flex items-center gap-2 text-sm">
              <span className={`inline-block h-2 w-2 rounded-full ${worker.online ? "bg-[var(--wo-green)]" : "bg-[var(--wo-red,#e5484d)]"}`} />
              <span className="font-medium">{worker.online ? "Online" : "Offline"}</span>
              <span className="text-[var(--wo-muted)]">{worker.seenAt ? `· Mac checked in ${ago(worker.seenAt, now)}` : "· never connected"}</span>
            </div>
            {!worker.online ? (
              <p className="mt-2 text-xs text-[var(--wo-muted)]">
                Videos are filmed on the Mac, so it has to be on with the worker running. Install it once with{" "}
                <span className="font-mono">./install_worker.sh</span> in FitCheck/tools/capture-engine/social; it shows online here within {WORKER_STALE_MIN} minutes.
              </p>
            ) : null}
          </Card>

          <Card title="Closets">
            <ul className="space-y-3 text-sm">
              {closets.map((c) => (
                <li key={c.key} className="space-y-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium">{c.label.replace(/ \(.*\)$/, "")}</span>
                    <span className="text-xs text-[var(--wo-muted)]">{c.items} items</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs text-[var(--wo-muted)]">
                    <span>narrator {c.voice}{c.available ? "" : " · not stocked"}</span>
                    {c.cloned ? <ClosetRefresh persona={c.key} /> : null}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
