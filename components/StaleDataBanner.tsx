import { APPSTORE_STALE_AFTER_DAYS } from "@/lib/data";

/**
 * Amber warning shown whenever the App Store sync has gone stale. Self-guarding:
 * renders nothing unless `daysStale` exceeds the tolerated window, so callers can
 * drop it in unconditionally. Used on the Overview landing page (so a stale sync
 * is visible the moment Tyler opens the dashboard) and on the App Store page.
 */
export function StaleDataBanner({ latestDay, daysStale }: { latestDay: string | null; daysStale: number | null }) {
  if (daysStale == null || daysStale <= APPSTORE_STALE_AFTER_DAYS) return null;
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <strong>Stale App Store data.</strong> The latest synced day is {latestDay} ({daysStale} days ago) — the daily{" "}
      <code>appstore-sync</code> cron hasn&apos;t landed fresh data, so App Store totals are behind App Store Connect. Check
      the Vercel cron logs and re-run <code>/api/cron/appstore-sync</code>.
    </div>
  );
}
