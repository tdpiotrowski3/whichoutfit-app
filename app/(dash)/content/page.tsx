import { getSocialIdeas, getSocialPosts, type SocialIdeaDbRow, type SocialPostDbRow } from "@/lib/data";
import { Card, Stat } from "@/components/ui";
import { DraftIdeasButton } from "@/components/studio/DraftIdeasButton";
import { IdeaReview, NewVideo, CancelButton, ClosetRefresh, type TemplateOption, type ClosetOption } from "@/components/studio/StudioClient";
import { TEMPLATES, syllableBudget, type Template } from "@/lib/contentEngine/templates";
import { nextSlots, runwayDays } from "@/lib/contentEngine/schedule";
import { workerStatus, closetInfo, WORKER_STALE_MIN, type WorkerStatus, type ClosetInfo } from "@/lib/contentEngine/studio";

export const dynamic = "force-dynamic";

// The Content Studio: the content engine, end to end, from the dashboard.
//   make a video → review & edit the script → approve → the Mac worker films,
//   narrates and uploads it → it is booked into the calendar → it posts → results.
// The Mac worker is FitCheck tools/capture-engine/social/engine.py --worker.

const human = (s: string) => s.replace(/^\d\d_/, "").replace(/_social$/, "").replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

function templateLabel(t: Template): string {
  if (t.kind === "flow") return human(t.feature);
  const n = t.footage.match(/^(\d\d)_/)?.[1];
  return `${human(t.feature)}${n ? ` (clip ${n})` : ""}`;
}

function fmt(n: number | null | undefined): string {
  return n == null ? "—" : n.toLocaleString();
}

function fmtSlot(iso: string | Date): string {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago",
  });
}

function ago(iso: string, now: Date): string {
  const m = Math.round((now.getTime() - new Date(iso).getTime()) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h}h ago` : `${Math.round(h / 24)} days ago`;
}

const POST_STATUS: Record<SocialPostDbRow["status"], { label: string; tone: string }> = {
  queued: { label: "scheduled", tone: "text-[var(--wo-blue)]" },
  publishing: { label: "posting…", tone: "text-[var(--wo-blue)]" },
  posted: { label: "posted", tone: "text-[var(--wo-green)]" },
  failed: { label: "failed", tone: "text-[var(--wo-red,#e5484d)]" },
  manual: { label: "post by hand", tone: "text-[var(--wo-muted)]" },
};

function WorkerCallout({ worker, approved, now }: { worker: WorkerStatus; approved: number; now: Date }) {
  if (worker.online) return null;
  return (
    <div className="rounded-2xl border border-[var(--wo-border)] bg-white p-5 text-sm shadow-sm">
      <p className="font-medium">
        The video maker on the Mac isn&apos;t running{worker.seenAt ? ` (last seen ${ago(worker.seenAt, now)})` : ""}.
        {approved ? ` ${approved} approved video${approved === 1 ? " is" : "s are"} waiting for it.` : ""}
      </p>
      <p className="mt-1 text-[var(--wo-muted)]">
        Videos are filmed on the Mac&apos;s iPhone Simulator, so the Mac has to be on. Start the worker there with{" "}
        <span className="font-mono text-xs">./engine.py --worker</span> in FitCheck/tools/capture-engine/social, or install it
        as a background service (README → &ldquo;Run it on its own&rdquo;) so it starts with the Mac. It checks for approved
        videos every two minutes and shows as online here within {WORKER_STALE_MIN} minutes.
      </p>
    </div>
  );
}

function VideoCard({ idea, posts }: { idea: SocialIdeaDbRow; posts: SocialPostDbRow[] }) {
  const ig = posts.find((p) => p.platform === "instagram");
  const tt = posts.find((p) => p.platform === "tiktok");
  const url = ig?.video_url ?? tt?.video_url ?? null;
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--wo-border)]">
      {url ? (
        <video src={url} controls preload="metadata" playsInline className="aspect-[9/16] w-full bg-black object-contain" />
      ) : (
        <div className="flex aspect-[9/16] w-full items-center justify-center bg-[var(--wo-bg)] text-xs text-[var(--wo-muted)]">No file</div>
      )}
      <div className="space-y-2 p-3 text-sm">
        <div className="font-medium">{idea.title}</div>
        <p className="line-clamp-3 text-xs text-[var(--wo-muted)]">{idea.captions[idea.caption_pick] ?? idea.captions[0]}</p>
        {ig ? <div className="text-xs text-[var(--wo-muted)]">{fmtSlot(ig.scheduled_for)}</div> : null}
        <div className="space-y-1 text-xs">
          {[ig, tt].filter(Boolean).map((p) => {
            const s = POST_STATUS[p!.status];
            return (
              <div key={p!.id} className="flex items-center justify-between gap-2">
                <span className="capitalize">{p!.platform}</span>
                <span className={s.tone}>
                  {s.label}
                  {p!.status === "posted" ? ` · ${fmt(p!.views)} views · ${fmt(p!.likes)} likes` : ""}
                </span>
              </div>
            );
          })}
        </div>
        {tt?.status === "manual" && url ? (
          <a href={url} download className="inline-block text-xs text-[var(--wo-blue)] hover:underline">
            Download for TikTok
          </a>
        ) : null}
        {[ig, tt].some((p) => p?.status === "failed") ? (
          <p className="text-xs text-[var(--wo-red,#e5484d)]">{[ig, tt].find((p) => p?.status === "failed")?.error}</p>
        ) : null}
      </div>
    </div>
  );
}

function Calendar({ posts, now }: { posts: SocialPostDbRow[]; now: Date }) {
  const ig = posts.filter((p) => p.platform === "instagram" && p.status !== "failed");
  const slots = nextSlots(now, 6);
  return (
    <ul className="divide-y divide-[var(--wo-border)] text-sm">
      {slots.map((slot) => {
        const booked = ig.find((p) => Math.abs(new Date(p.scheduled_for).getTime() - slot.getTime()) < 60 * 60_000);
        return (
          <li key={slot.toISOString()} className="flex flex-wrap items-baseline justify-between gap-2 py-2.5">
            <span className="w-44 shrink-0 text-[var(--wo-muted)]">{fmtSlot(slot)}</span>
            {booked ? (
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium">{booked.clip_id}</span>
                <span className="text-[var(--wo-muted)]"> — {booked.caption}</span>
              </span>
            ) : (
              <span className="flex-1 text-[var(--wo-muted)]">Open — Monday&apos;s run fills it with a proven clip if nothing new is ready</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Closets({ closets }: { closets: ClosetInfo[] }) {
  return (
    <ul className="divide-y divide-[var(--wo-border)] text-sm">
      {closets.map((c) => (
        <li key={c.key} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
          <div>
            <div className="font-medium">{c.label}</div>
            <div className="text-xs text-[var(--wo-muted)]">
              {c.items} items · narrator {c.voice}
              {c.available ? "" : " · not stocked yet"}
            </div>
          </div>
          {c.cloned ? <ClosetRefresh persona={c.key} /> : null}
        </li>
      ))}
    </ul>
  );
}

export default async function ContentStudioPage() {
  const now = new Date();
  let ideas: SocialIdeaDbRow[] | null = null;
  let posts: SocialPostDbRow[] = [];
  let worker: WorkerStatus = { seenAt: null, online: false, detail: {} };
  let closets: ClosetInfo[] = [];
  try {
    [ideas, posts, worker, closets] = await Promise.all([getSocialIdeas(60), getSocialPosts(300), workerStatus(now), closetInfo()]);
  } catch {
    return (
      <Card title="Not configured">
        <p className="text-sm text-[var(--wo-muted)]">Set Supabase env vars to load the content engine.</p>
      </Card>
    );
  }
  if (ideas === null) {
    return (
      <Card title="Not set up">
        <p className="text-sm text-[var(--wo-muted)]">
          Apply <span className="font-mono text-xs">FitCheck/supabase/social_engine.sql</span> to create the ideas table.
        </p>
      </Card>
    );
  }

  const templates: TemplateOption[] = TEMPLATES.map((t) => ({
    key: t.key,
    label: templateLabel(t),
    kind: t.kind,
    inputs: t.inputs,
    budgets: t.beats.map((b) => syllableBudget(b)),
    was: t.beats.map((b) => b.was),
  }));
  const closetOptions: ClosetOption[] = closets.map((c) => ({ key: c.key, label: c.label, available: c.available }));
  const review = ideas.filter((i) => i.status === "proposed" || i.status === "failed");
  const inFlight = ideas.filter((i) => i.status === "approved" || i.status === "rendering");
  const made = ideas.filter((i) => i.status === "rendered" && i.clip_id);
  const postsByClip = new Map<string, SocialPostDbRow[]>();
  for (const p of posts) postsByClip.set(p.clip_id, [...(postsByClip.get(p.clip_id) ?? []), p]);

  const queuedIg = posts.filter((p) => p.platform === "instagram" && (p.status === "queued" || p.status === "publishing"));
  const runway = runwayDays(now, queuedIg.map((p) => new Date(p.scheduled_for)));
  const next = queuedIg.filter((p) => new Date(p.scheduled_for) > now).sort((a, b) => a.scheduled_for.localeCompare(b.scheduled_for))[0];
  const working = typeof worker.detail.working === "string" ? ideas.find((i) => i.id === worker.detail.working) : undefined;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Content Studio</h1>
        <p className="text-sm text-[var(--wo-muted)]">
          Make, review and schedule the app&apos;s Reels and TikToks. Approved videos are filmed and narrated on the Mac,
          then post themselves Tue / Thu / Sat at 5pm.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Stat
          label="Video maker"
          value={worker.online ? "Online" : "Offline"}
          sub={worker.seenAt ? `Mac checked in ${ago(worker.seenAt, now)}` : "Never seen yet"}
          accent={worker.online ? "green" : "muted"}
        />
        <Stat label="Next post" value={next ? fmtSlot(next.scheduled_for).split(",")[0] : "—"} sub={next ? next.clip_id : "nothing scheduled"} accent="blue" />
        <Stat label="Booked ahead" value={`${runway} days`} sub="target 14" accent={runway < 14 ? "teal" : "green"} />
        <Stat label="To review" value={fmt(review.length)} sub={inFlight.length ? `${inFlight.length} being made` : undefined} accent="blue" />
      </div>

      <WorkerCallout worker={worker} approved={inFlight.filter((i) => i.status === "approved").length} now={now} />

      <Card title="Make a video" right={<DraftIdeasButton />}>
        <NewVideo templates={templates} closets={closetOptions} />
        <p className="mt-3 text-xs text-[var(--wo-muted)]">
          Or press Draft ideas now for a batch picked from what&apos;s performing. A fresh batch is also drafted every Monday.
        </p>
      </Card>

      <Card title={`Review${review.length ? ` (${review.length})` : ""}`}>
        {review.length === 0 ? (
          <p className="text-sm text-[var(--wo-muted)]">Nothing waiting. Make a video above, or wait for Monday&apos;s ideas.</p>
        ) : (
          <div className="space-y-4">
            {review.map((i) => (
              <IdeaReview key={`${i.id}-${i.status}`} idea={i} template={templates.find((t) => t.key === i.template)} closets={closetOptions} />
            ))}
          </div>
        )}
      </Card>

      {inFlight.length ? (
        <Card title="Being made">
          <ul className="divide-y divide-[var(--wo-border)] text-sm">
            {inFlight.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <span>
                  <span className="font-medium">{i.title}</span>
                  <span className="text-[var(--wo-muted)]">
                    {" "}— {i.status === "rendering" || working?.id === i.id
                      ? "filming and narrating now (a few minutes)"
                      : worker.online ? "next up on the Mac" : "waiting for the Mac video maker"}
                  </span>
                </span>
                {i.status === "approved" ? <CancelButton id={i.id} /> : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card title="Calendar" right={<span className="text-xs text-[var(--wo-muted)]">Instagram posts itself · TikTok gets a morning reminder</span>}>
        <Calendar posts={posts} now={now} />
      </Card>

      <Card title={`Videos${made.length ? ` (${made.length})` : ""}`}>
        {made.length === 0 ? (
          <p className="text-sm text-[var(--wo-muted)]">Videos the engine makes appear here, ready to watch, with when they post and how they did.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {made.map((i) => (
              <VideoCard key={i.id} idea={i} posts={postsByClip.get(i.clip_id!) ?? []} />
            ))}
          </div>
        )}
      </Card>

      <Card title="Closets" right={<span className="text-xs text-[var(--wo-muted)]">The wardrobes videos are filmed on</span>}>
        <Closets closets={closets} />
      </Card>
    </div>
  );
}
