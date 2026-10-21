import Link from "next/link";
import {
  type SocialIdeaDbRow,
  type SocialMetricDbRow,
  type SocialPostDbRow,
  type SocialClickRow,
} from "@/lib/data";
import { Card, Stat } from "@/components/ui";
import { SocialSyncButton } from "@/components/SocialSyncButton";
import { SocialPublishButton } from "@/components/SocialPublishButton";
import { TrendChart, BarList, type TrendSeries } from "@/components/charts/TrendChart";
import { PostCalendar, type CalendarPost } from "@/components/social/PostCalendar";
import { Connections } from "@/components/social/Connections";
import type { Connection } from "@/lib/socialHealth";


// Social & Ads: how the accounts and the posts are doing. Making videos lives in
// the Content Studio (/content); this page is the scoreboard and the calendar.
// Series colors are fixed per platform (validated with the dataviz checker):
const IG = "#2E6BFF";
const TT = "#eb6834";

function fmt(n: number | null | undefined): string {
  return n == null ? "—" : n.toLocaleString();
}

function fmtMoney(n: number): string {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

/** "02_dress_for_event" → "Dress for event"; engine clips use their idea's title. */
function clipTitle(clip: string, titles: Map<string, string>): string {
  return titles.get(clip) ?? clip.replace(/^\d\d_/, "").replace(/_r\d+$/, "").replace(/_[0-9a-f]{6}$/, "").replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

function delta(cur: number, prev: number): string | undefined {
  if (!prev) return undefined;
  const pct = Math.round(((cur - prev) / prev) * 100);
  return `${pct >= 0 ? "▲" : "▼"} ${Math.abs(pct)}% vs prior 30 days`;
}

function sumBy(rows: SocialMetricDbRow[], key: keyof SocialMetricDbRow): number {
  return rows.reduce((a, r) => a + (Number(r[key]) || 0), 0);
}

function lastDays(n: number, now: Date): string[] {
  return Array.from({ length: n }, (_, i) => new Date(now.getTime() - (n - 1 - i) * 86_400_000).toISOString().slice(0, 10));
}

function seriesFor(rows: SocialMetricDbRow[], platform: string, key: keyof SocialMetricDbRow, days: string[]): (number | null)[] {
  const byDay = new Map(rows.filter((r) => r.platform === platform).map((r) => [r.day, r[key] as number | null]));
  return days.map((d) => byDay.get(d) ?? null);
}

function QueueTable({ posts, titles }: { posts: SocialPostDbRow[]; titles: Map<string, string> }) {
  const failed = posts.filter((p) => p.status === "failed");
  return (
    <details className="group">
      <summary className="cursor-pointer list-none text-sm font-medium text-[var(--wo-blue)]">
        <span className="group-open:hidden">Show every post as a table ({posts.length})</span>
        <span className="hidden group-open:inline">Hide table</span>
        {failed.length ? <span className="ml-2 text-[var(--wo-red,#e5484d)]">{failed.length} failed</span> : null}
      </summary>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--wo-border)] text-left text-xs uppercase tracking-wide text-[var(--wo-muted)]">
              <th className="py-2 pr-4 font-medium">When</th>
              <th className="py-2 pr-4 font-medium">Video</th>
              <th className="py-2 pr-4 font-medium">Where</th>
              <th className="py-2 pr-4 font-medium">Status</th>
              <th className="py-2 pr-4 text-right font-medium">Views</th>
              <th className="py-2 pr-4 text-right font-medium">Likes</th>
              <th className="py-2 pr-4 text-right font-medium">Saves</th>
              <th className="py-2 pr-4 text-right font-medium">Shares</th>
            </tr>
          </thead>
          <tbody>
            {[...posts].reverse().map((p) => (
              <tr key={p.id} className="border-b border-[var(--wo-border)] last:border-0">
                <td className="whitespace-nowrap py-2 pr-4 text-[var(--wo-muted)]">
                  {new Date(p.posted_at ?? p.scheduled_for).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" })}
                </td>
                <td className="py-2 pr-4">{clipTitle(p.clip_id, titles)}</td>
                <td className="py-2 pr-4 capitalize">{p.platform}</td>
                <td className="py-2 pr-4">{p.status === "failed" ? <span className="text-[var(--wo-red,#e5484d)]" title={p.error ?? ""}>failed</span> : p.status}</td>
                <td className="py-2 pr-4 text-right">{fmt(p.views)}</td>
                <td className="py-2 pr-4 text-right">{fmt(p.likes)}</td>
                <td className="py-2 pr-4 text-right">{fmt(p.saves)}</td>
                <td className="py-2 pr-4 text-right">{fmt(p.shares)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export type SocialData = {
  now: Date;
  rows: SocialMetricDbRow[];
  posts: SocialPostDbRow[];
  clicks: SocialClickRow[];
  ideas: SocialIdeaDbRow[] | null;
  configured: { instagram: boolean; instagramPublish: boolean; tiktok: boolean };
  connections: Connection[];
};

/** The whole page, from its data — the route loads it (app/(dash)/social/page.tsx). */
export function SocialView({ now, rows, posts, clicks, ideas, configured, connections }: SocialData) {
  const titles = new Map((ideas ?? []).filter((i) => i.clip_id).map((i) => [i.clip_id!, i.title]));
  const cut = new Date(now.getTime() - 30 * 86_400_000).toISOString().slice(0, 10);
  const cut60 = new Date(now.getTime() - 60 * 86_400_000).toISOString().slice(0, 10);
  const cur = rows.filter((r) => r.day >= cut);
  const prev = rows.filter((r) => r.day < cut);

  const latest = (rs: SocialMetricDbRow[], p: string) =>
    rs.filter((r) => r.platform === p && r.followers != null).sort((a, b) => b.day.localeCompare(a.day))[0]?.followers ?? null;
  const total = (vals: (number | null)[]) => (vals.some((v) => v != null) ? vals.reduce<number>((a, v) => a + (v ?? 0), 0) : null);
  const followers = total([latest(rows, "instagram"), latest(rows, "tiktok")]);
  const followersPrev = total([latest(prev, "instagram"), latest(prev, "tiktok")]);

  const posted = posts.filter((p) => p.status === "posted");
  const postedRecent = posted.filter((p) => (p.posted_at ?? "") >= cut);
  const postedPrev = posted.filter((p) => (p.posted_at ?? "") < cut && (p.posted_at ?? "") >= cut60);
  const views = (ps: SocialPostDbRow[]) => ps.reduce((a, p) => a + (p.views ?? 0), 0);
  const clicksCur = clicks.filter((c) => c.day >= cut).reduce((a, c) => a + c.clicks, 0);
  const clicksPrev = clicks.filter((c) => c.day < cut).reduce((a, c) => a + c.clicks, 0);

  const days = lastDays(30, now);
  const reach: TrendSeries[] = [];
  const engage: TrendSeries[] = [];
  if (configured.instagram || cur.some((r) => r.platform === "instagram")) {
    reach.push({ key: "ig", label: "Instagram", color: IG, values: seriesFor(cur, "instagram", "reach", days) });
    engage.push({ key: "ig", label: "Instagram", color: IG, values: seriesFor(cur, "instagram", "engagements", days) });
  }
  if (configured.tiktok || cur.some((r) => r.platform === "tiktok")) {
    reach.push({ key: "tt", label: "TikTok", color: TT, values: seriesFor(cur, "tiktok", "reach", days) });
    engage.push({ key: "tt", label: "TikTok", color: TT, values: seriesFor(cur, "tiktok", "engagements", days) });
  }

  const byClip = new Map<string, { views: number; likes: number; posts: number }>();
  for (const p of posted) {
    const c = byClip.get(p.clip_id) ?? { views: 0, likes: 0, posts: 0 };
    c.views += p.views ?? 0;
    c.likes += p.likes ?? 0;
    c.posts += 1;
    byClip.set(p.clip_id, c);
  }
  const topVideos = [...byClip.entries()]
    .sort((a, b) => b[1].views - a[1].views)
    .slice(0, 8)
    .map(([clip, v]) => ({ label: clipTitle(clip, titles), value: v.views, sub: `${v.likes.toLocaleString()} likes · posted ${v.posts}×` }));

  const byCampaign = new Map<string, number>();
  for (const c of clicks.filter((c) => c.day >= cut)) byCampaign.set(c.campaign, (byCampaign.get(c.campaign) ?? 0) + c.clicks);
  const campaigns = [...byCampaign.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([label, value]) => ({ label, value }));

  const calendar: CalendarPost[] = posts.map((p) => ({
    id: p.id, clip_id: p.clip_id, title: clipTitle(p.clip_id, titles), platform: p.platform, status: p.status,
    scheduled_for: p.scheduled_for, posted_at: p.posted_at, caption: p.caption, video_url: p.video_url,
    views: p.views, likes: p.likes, saves: p.saves, shares: p.shares, error: p.error,
  }));
  const today = now.toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  const spend = sumBy(cur, "spend");
  const waiting = (ideas ?? []).filter((i) => i.status === "proposed" || i.status === "failed").length;
  const conn = (k: Connection["key"]) => connections.find((c) => c.key === k);
  const working = (k: Connection["key"]) => conn(k)?.state === "ok" || conn(k)?.state === "partial";
  const connected = [
    { label: "Instagram", on: working("instagram"), set: configured.instagram, note: configured.instagramPublish ? "auto-posts" : "stats only" },
    { label: "TikTok", on: working("tiktok"), set: configured.tiktok || !!conn("tiktok")?.connectUrl, note: "post by hand" },
  ];
  const broken = connections.filter((c) => c.key !== "instagram_ads" && c.state !== "ok");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Social</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            {connected.map((c) => (
              <span key={c.label} className="inline-flex items-center gap-1.5 rounded-full border border-[var(--wo-border)] bg-white px-2.5 py-1">
                <span className={`inline-block h-1.5 w-1.5 rounded-full ${c.on ? "bg-[var(--wo-green)]" : c.set ? "bg-[var(--wo-red,#e5484d)]" : "bg-[var(--wo-muted)]/50"}`} />
                <span className="font-medium">{c.label}</span>
                <span className="text-[var(--wo-muted)]">{c.on ? c.note : c.set ? "not working" : "not connected"}</span>
              </span>
            ))}
            <span className="text-[var(--wo-muted)]">Synced daily</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SocialSyncButton />
          <SocialPublishButton />
          <Link href="/content" className="rounded-lg bg-[var(--wo-blue)] px-3 py-1.5 text-sm font-medium text-white">
            Content Studio{waiting ? ` · ${waiting} to review` : ""}
          </Link>
        </div>
      </div>

      {broken.length ? (
        <Card title="Connections" right={<span className="text-xs text-[var(--wo-muted)]">checked live just now</span>}>
          <Connections connections={connections} />
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Followers"
          value={fmt(followers)}
          sub={followers != null && followersPrev != null ? delta(followers, followersPrev) ?? "Instagram + TikTok" : "Instagram + TikTok"}
          accent="blue"
        />
        <Stat label="Reach (30d)" value={fmt(sumBy(cur, "reach"))} sub={delta(sumBy(cur, "reach"), sumBy(prev, "reach"))} accent="teal" />
        <Stat label="Video views (30d)" value={fmt(views(postedRecent))} sub={delta(views(postedRecent), views(postedPrev)) ?? `${postedRecent.length} posts`} accent="green" />
        <Stat label="Link clicks (30d)" value={fmt(clicksCur)} sub={delta(clicksCur, clicksPrev) ?? "via whichoutfit.app/go"} />
      </div>

      <Card title="Calendar">
        <PostCalendar posts={calendar} today={today} />
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Reach per day">
          <TrendChart days={days} series={reach} empty="No reach data yet — it fills in with the daily sync." />
        </Card>
        <Card title="Engagements per day">
          <TrendChart days={days} series={engage} empty="No engagement data yet — it fills in with the daily sync." />
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Top videos" right={<span className="text-xs text-[var(--wo-muted)]">by views, all time</span>}>
          <BarList rows={topVideos} unit="views" empty="Results appear once posts have been out for a day." />
        </Card>
        <Card title="Link clicks by campaign" right={<span className="text-xs text-[var(--wo-muted)]">last 30 days</span>}>
          <BarList
            rows={campaigns}
            unit="clicks"
            color="#0FA3A3"
            empty="No clicks yet. Captions link through whichoutfit.app/go?c=<campaign>, which counts them and forwards to the App Store."
          />
        </Card>
      </div>

      {spend > 0 ? (
        <Card title="Ads (30d)">
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat label="Spend" value={fmtMoney(spend)} accent="muted" />
            <Stat label="Ad impressions" value={fmt(sumBy(cur, "ad_impressions"))} />
            <Stat label="Conversions" value={fmt(sumBy(cur, "conversions"))} accent="green" />
          </div>
        </Card>
      ) : null}

      <Card>
        <QueueTable posts={posts} titles={titles} />
      </Card>

      {broken.length === 0 ? (
        <Card title="Connections" right={<span className="text-xs text-[var(--wo-muted)]">checked live just now</span>}>
          <Connections connections={connections} />
        </Card>
      ) : null}
    </div>
  );
}
