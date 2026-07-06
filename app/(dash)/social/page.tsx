import { getSocialMetrics, type SocialMetricDbRow } from "@/lib/data";
import { Card, Stat } from "@/components/ui";
import { isTikTokConfigured } from "@/lib/tiktok";
import { isInstagramConfigured } from "@/lib/meta";
import { SocialSyncButton } from "@/components/SocialSyncButton";

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

export default async function SocialPage() {
  let rows: SocialMetricDbRow[];
  try {
    rows = await getSocialMetrics(30);
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
        <SocialSyncButton />
      </div>

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
