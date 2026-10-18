import {
  getSocialMetrics,
  getSocialPosts,
  getSocialClicks,
  type SocialMetricDbRow,
  type SocialPostDbRow,
  type SocialClickRow,
} from "@/lib/data";
import { Card, Stat } from "@/components/ui";
import { isTikTokConfigured } from "@/lib/tiktok";
import { isInstagramConfigured } from "@/lib/meta";
import { isInstagramPublishConfigured } from "@/lib/instagram";
import { SocialSyncButton } from "@/components/SocialSyncButton";
import { SocialPublishButton } from "@/components/SocialPublishButton";

export const dynamic = "force-dynamic";

const PLATFORMS = [
  { key: "tiktok", label: "TikTok", configured: isTikTokConfigured },
  { key: "instagram", label: "Instagram", configured: isInstagramConfigured },
] as const;

function fmt(n: number | null | undefined): string {
  return n == null ? "—" : n.toLocaleString();
}

function fmtMoney(n: number | null | undefined): string {
  return n == null ? "—" : n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function fmtDay(d: string): string {
  return new Date(d + "T00:00:00Z").toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function sum(rows: SocialMetricDbRow[], key: keyof SocialMetricDbRow): number {
  return rows.reduce((a, r) => a + (Number(r[key]) || 0), 0);
}

const STATUS_STYLE: Record<SocialPostDbRow["status"], string> = {
  queued: "bg-[var(--wo-bg)] text-[var(--wo-muted)]",
  publishing: "bg-[var(--wo-bg)] text-[var(--wo-blue)]",
  posted: "bg-[var(--wo-bg)] text-[var(--wo-green)]",
  failed: "bg-[var(--wo-bg)] text-[var(--wo-red,#e5484d)]",
  manual: "bg-[var(--wo-bg)] text-[var(--wo-muted)]",
};

function StatusPill({ status }: { status: SocialPostDbRow["status"] }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[status]}`}>
      {status}
    </span>
  );
}

function fmtSlot(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

/**
 * The publish queue. Instagram rows drain themselves on the every-15-minutes cron; TikTok
 * rows are 'manual' by design — the Content Posting API forces an unaudited
 * Direct Post to private, so posting them from here would publish videos nobody
 * can see. They show up here so they can be posted by hand on time.
 */
function QueueCard({ posts }: { posts: SocialPostDbRow[] }) {
  const upcoming = posts.filter((p) => p.status !== "posted");
  const posted = posts.filter((p) => p.status === "posted").length;
  const failed = posts.filter((p) => p.status === "failed");
  const manual = upcoming.filter((p) => p.status === "manual").length;

  return (
    <Card
      title="Publish queue"
      right={
        <span className="text-xs text-[var(--wo-muted)]">
          {isInstagramPublishConfigured() ? "Instagram auto-publishes" : "Instagram not connected"}
        </span>
      }
    >
      {posts.length === 0 ? (
        <p className="text-sm text-[var(--wo-muted)]">
          Nothing queued. Seed it from the posting calendar
          (<span className="font-mono text-xs">docs/SOCIAL-POSTING-CALENDAR.md</span> in the iOS repo).
        </p>
      ) : (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-4">
            <Stat label="Posted" value={fmt(posted)} accent="green" />
            <Stat label="Scheduled" value={fmt(upcoming.length - manual)} accent="blue" />
            <Stat label="By hand (TikTok)" value={fmt(manual)} accent="muted" />
            <Stat label="Failed" value={fmt(failed.length)} accent={failed.length ? "teal" : "muted"} />
          </div>

          {failed.length ? (
            <ul className="space-y-1 rounded-lg bg-[var(--wo-bg)] p-3 text-xs">
              {failed.map((f) => (
                <li key={f.id}>
                  <span className="font-medium">{f.clip_id}</span>
                  <span className="text-[var(--wo-muted)]"> — {f.error ?? "no reason recorded"}</span>
                </li>
              ))}
            </ul>
          ) : null}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--wo-border)] text-left text-xs uppercase tracking-wide text-[var(--wo-muted)]">
                  <th className="py-2 pr-4 font-medium">Slot</th>
                  <th className="py-2 pr-4 font-medium">Clip</th>
                  <th className="py-2 pr-4 font-medium">Where</th>
                  <th className="py-2 pr-4 font-medium">Campaign</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {posts.slice(0, 20).map((p) => (
                  <tr key={p.id} className="border-b border-[var(--wo-border)] last:border-0">
                    <td className="py-2.5 pr-4 text-[var(--wo-muted)]">{fmtSlot(p.scheduled_for)}</td>
                    <td className="py-2.5 pr-4 font-medium">{p.clip_id}</td>
                    <td className="py-2.5 pr-4 capitalize">{p.platform}</td>
                    <td className="py-2.5 pr-4 font-mono text-xs text-[var(--wo-muted)]">{p.campaign ?? "—"}</td>
                    <td className="py-2.5 pr-4"><StatusPill status={p.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Card>
  );
}

/**
 * Clicks on /go?c=<campaign>, which is the only thing we can count ourselves.
 * The installs those clicks produced live in App Store Connect under
 * App Analytics → Campaigns, keyed by the SAME campaign string — clicks are the
 * input, installs the outcome, and `campaign` is the join.
 */
function ClicksCard({ clicks }: { clicks: SocialClickRow[] }) {
  const byCampaign = new Map<string, number>();
  for (const c of clicks) byCampaign.set(c.campaign, (byCampaign.get(c.campaign) ?? 0) + c.clicks);
  const ranked = [...byCampaign.entries()].sort((a, b) => b[1] - a[1]);
  const total = ranked.reduce((a, [, n]) => a + n, 0);

  return (
    <Card title="Link clicks (30d)" right={<span className="text-xs text-[var(--wo-muted)]">whichoutfit.app/go</span>}>
      {ranked.length === 0 ? (
        <p className="text-sm text-[var(--wo-muted)]">
          No clicks yet. Put <span className="font-mono text-xs">whichoutfit.app/go?c=&lt;campaign&gt;</span> in the
          caption or bio — it logs the click, then forwards to the App Store with{" "}
          <span className="font-mono text-xs">ct=&lt;campaign&gt;</span> so Apple reports the installs under the same name.
        </p>
      ) : (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Stat label="Clicks (30d)" value={fmt(total)} accent="blue" />
            <Stat label="Campaigns" value={fmt(ranked.length)} accent="teal" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--wo-border)] text-left text-xs uppercase tracking-wide text-[var(--wo-muted)]">
                  <th className="py-2 pr-4 font-medium">Campaign</th>
                  <th className="py-2 pr-4 font-medium text-right">Clicks</th>
                </tr>
              </thead>
              <tbody>
                {ranked.map(([campaign, n]) => (
                  <tr key={campaign} className="border-b border-[var(--wo-border)] last:border-0">
                    <td className="py-2.5 pr-4 font-mono text-xs">{campaign}</td>
                    <td className="py-2.5 pr-4 text-right">{fmt(n)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Card>
  );
}

export default async function SocialPage() {
  let rows: SocialMetricDbRow[];
  let posts: SocialPostDbRow[] = [];
  let clicks: SocialClickRow[] = [];
  try {
    [rows, posts, clicks] = await Promise.all([getSocialMetrics(30), getSocialPosts(40), getSocialClicks(30)]);
  } catch {
    return (
      <Card title="Not configured">
        <p className="text-sm text-[var(--wo-muted)]">Set Supabase env vars to load social metrics.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Social &amp; Ads</h1>
          <p className="text-sm text-[var(--wo-muted)]">Organic reach &amp; ad spend by platform, last 30 days. Synced daily.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <SocialPublishButton />
          <SocialSyncButton />
        </div>
      </div>

      <QueueCard posts={posts} />
      <ClicksCard clicks={clicks} />

      {PLATFORMS.map((p) => {
        const pr = rows.filter((r) => r.platform === p.key);
        const latest = pr[0]; // rows come back day-desc
        const configured = p.configured();
        const hasAds = pr.some((r) => r.spend != null);

        return (
          <Card
            key={p.key}
            title={p.label}
            right={
              configured ? (
                <span className="text-xs text-[var(--wo-muted)]">{pr.length} day{pr.length === 1 ? "" : "s"}</span>
              ) : (
                <span className="rounded-full bg-[var(--wo-bg)] px-2 py-0.5 text-xs font-medium text-[var(--wo-muted)]">Not connected</span>
              )
            }
          >
            {pr.length === 0 ? (
              <p className="text-sm text-[var(--wo-muted)]">
                {configured
                  ? "Connected — waiting for the first daily sync (or no data returned yet)."
                  : `Not connected. Set this platform's token + account id in Vercel (see SETUP.md) to start syncing.`}
              </p>
            ) : (
              <div className="space-y-5">
                <div className={`grid gap-4 ${hasAds ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
                  <Stat label="Followers" value={fmt(latest?.followers)} accent="blue" />
                  <Stat label="Reach (30d)" value={fmt(sum(pr, "reach"))} accent="teal" />
                  <Stat label="Engagements (30d)" value={fmt(sum(pr, "engagements"))} accent="green" />
                  {hasAds ? <Stat label="Ad spend (30d)" value={fmtMoney(sum(pr, "spend"))} accent="muted" /> : null}
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[var(--wo-border)] text-left text-xs uppercase tracking-wide text-[var(--wo-muted)]">
                        <th className="py-2 pr-4 font-medium">Day</th>
                        <th className="py-2 pr-4 font-medium text-right">Followers</th>
                        <th className="py-2 pr-4 font-medium text-right">Reach</th>
                        <th className="py-2 pr-4 font-medium text-right">Impressions</th>
                        <th className="py-2 pr-4 font-medium text-right">Engagements</th>
                        {hasAds ? <th className="py-2 pr-4 font-medium text-right">Spend</th> : null}
                        {hasAds ? <th className="py-2 pr-4 font-medium text-right">Conv.</th> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {pr.map((r) => (
                        <tr key={r.day} className="border-b border-[var(--wo-border)] last:border-0">
                          <td className="py-2.5 pr-4 text-[var(--wo-muted)]">{fmtDay(r.day)}</td>
                          <td className="py-2.5 pr-4 text-right">{fmt(r.followers)}</td>
                          <td className="py-2.5 pr-4 text-right">{fmt(r.reach)}</td>
                          <td className="py-2.5 pr-4 text-right">{fmt(r.impressions)}</td>
                          <td className="py-2.5 pr-4 text-right">{fmt(r.engagements)}</td>
                          {hasAds ? <td className="py-2.5 pr-4 text-right">{fmtMoney(r.spend)}</td> : null}
                          {hasAds ? <td className="py-2.5 pr-4 text-right">{fmt(r.conversions)}</td> : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
