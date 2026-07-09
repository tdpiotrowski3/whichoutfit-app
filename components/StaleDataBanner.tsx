import type { AppstoreFreshness } from "@/lib/data";
import { SyncAppstoreButton } from "@/components/SyncAppstoreButton";

/**
 * App Store freshness banner. Self-guarding: renders nothing when the sync is
 * healthy. Distinguishes a genuinely stalled cron (amber — the real failure, e.g.
 * Apple auth revoked) from normal Apple reporting lag while the cron keeps
 * running (blue — informational). Carries a "Sync App Store" button so a missed
 * daily run can be re-triggered on the spot. Shown on Overview and App Store.
 */
export function StaleDataBanner({ freshness }: { freshness: AppstoreFreshness | null }) {
  if (!freshness || !freshness.isStale) return null;
  const { reason, latestDay, daysStale, hoursSinceRun } = freshness;
  const stalled = reason === "cron_stalled";
  return (
    <div
      className={`rounded-lg border px-4 py-3 text-sm ${
        stalled ? "border-amber-300 bg-amber-50 text-amber-900" : "border-sky-200 bg-sky-50 text-sky-900"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          {stalled ? (
            <>
              <strong>App Store sync stalled.</strong> No data written in <strong>{hoursSinceRun ?? "?"}h</strong> (the{" "}
              <code>appstore-sync</code> cron runs every 24h). Latest synced day is {latestDay ?? "—"}. Apple auth may have
              been revoked (common after an Apple Developer org change) — check the Vercel cron logs, or re-run now.
            </>
          ) : (
            <>
              <strong>App Store data catching up.</strong> Apple hasn&apos;t published past {latestDay} ({daysStale} days) —
              normal reporting lag. The sync itself ran {hoursSinceRun ?? "?"}h ago and is healthy.
            </>
          )}
        </div>
        <SyncAppstoreButton />
      </div>
    </div>
  );
}
