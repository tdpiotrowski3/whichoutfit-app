import { getAppstore } from "@/lib/data";
import { Card, Stat } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AppStorePage() {
  let rows;
  try {
    rows = await getAppstore(30);
  } catch {
    return (
      <Card title="Not configured">
        <p className="text-sm text-[var(--wo-muted)]">Set Supabase env vars to load App Store data.</p>
      </Card>
    );
  }

  const totalDownloads = rows.reduce((a, r) => a + r.downloads, 0);
  const totalRedownloads = rows.reduce((a, r) => a + r.redownloads, 0);
  const totalUpdates = rows.reduce((a, r) => a + r.updates, 0);
  const totalProceeds = rows.reduce((a, r) => a + Number(r.proceeds), 0);
  const maxDl = Math.max(1, ...rows.map((r) => r.downloads));

  // Tier 2 — present only once Apple's analytics reports have generated.
  const totalImpr = rows.reduce((a, r) => a + (r.impressions ?? 0), 0);
  const totalViews = rows.reduce((a, r) => a + (r.product_page_views ?? 0), 0);
  const hasAnalytics = totalImpr > 0 || totalViews > 0;
  const conversion = totalImpr > 0 ? (totalDownloads / totalImpr) * 100 : null;

  // Freshness — Apple restates ~1 day late, so up to 2 days stale is normal.
  // Anything older means the daily sync cron has stopped and these totals are wrong.
  const latestDay = rows.reduce<string | null>((max, r) => (max == null || r.day > max ? r.day : max), null);
  const daysStale = latestDay
    ? Math.floor((Date.now() - new Date(`${latestDay}T00:00:00Z`).getTime()) / 86_400_000)
    : null;
  const isStale = daysStale != null && daysStale > 2;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">App Store</h1>
        <p className="text-sm text-[var(--wo-muted)]">
          From the App Store Connect API · last 30 days. Syncs daily (~1 day Apple latency). Conversion &amp; impressions coming in Tier 2.
          {latestDay && <> Data through <strong className="text-[var(--wo-text)]">{latestDay}</strong>.</>}
        </p>
      </div>

      {isStale && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong>Stale data.</strong> The latest synced day is {latestDay} ({daysStale} days ago) — the daily{" "}
          <code>appstore-sync</code> cron has stopped, so these totals are behind App Store Connect. Check the Vercel
          cron logs and re-run <code>/api/cron/appstore-sync</code>.
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Downloads · 30d" value={totalDownloads} accent="blue" />
        <Stat label="Redownloads · 30d" value={totalRedownloads} accent="teal" />
        <Stat label="Updates · 30d" value={totalUpdates} accent="muted" />
        <Stat label="Proceeds · 30d" value={`$${totalProceeds.toFixed(2)}`} accent="green" />
      </div>

      <Card title="Conversion (Tier 2 · App Store Analytics)">
        {hasAnalytics ? (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            <Stat label="Impressions · 30d" value={totalImpr.toLocaleString()} />
            <Stat label="Product page views · 30d" value={totalViews.toLocaleString()} />
            <Stat label="Impression → install" value={conversion != null ? `${conversion.toFixed(1)}%` : "—"} accent="blue" />
          </div>
        ) : (
          <p className="text-sm text-[var(--wo-muted)]">
            Analytics initialized — Apple generates the first impressions/conversion data ~1–2 days after setup, then it fills in here daily.
          </p>
        )}
      </Card>

      <Card title="Daily downloads">
        {rows.length === 0 ? (
          <p className="text-sm text-[var(--wo-muted)]">
            No data yet. Run the sync (or wait for the daily cron) once the Apple env vars are set in Vercel.
          </p>
        ) : (
          <div className="flex h-48 items-end gap-1">
            {rows.map((r) => (
              <div key={r.day} className="flex flex-1 flex-col items-center justify-end gap-1" title={`${r.day}: ${r.downloads} downloads`}>
                <div
                  className="w-full rounded-t"
                  style={{ height: `${(r.downloads / maxDl) * 100}%`, background: "linear-gradient(180deg, var(--wo-blue), var(--wo-teal))", minHeight: r.downloads > 0 ? 3 : 0 }}
                />
                <span className="text-[9px] text-[var(--wo-muted)]">{r.day.slice(5)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <p className="text-xs text-[var(--wo-muted)]">
        Downloads = first-time installs · Redownloads = re-installs by existing users · Proceeds = your cut (free app shows $0; IAP revenue lands here once you have paid users).
        Full impressions → install conversion lives in App Store Connect → App Analytics until Tier 2 ships.
      </p>
    </div>
  );
}
