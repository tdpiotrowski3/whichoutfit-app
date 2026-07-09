import { admin } from "./supabase";
import { fetchSalesRange } from "./appstore";
import { syncAnalytics } from "./appstoreAnalytics";

// Shared App Store sync: pull the last 14 days of Sales (Tier 1) + Analytics
// (Tier 2) and upsert into public.appstore_metrics by day. Called by both the
// daily cron (/api/cron/appstore-sync) and the admin "Sync App Store" button
// (/api/appstore/sync). Analytics is best-effort — it never fails the sales sync.

export type AppstoreSyncResult = {
  sales_days: number;
  downloads: number;
  redownloads: number;
  analytics: { days: number; note: string; discovered?: { name: string; category: string }[] };
};

export async function syncAppstore(): Promise<AppstoreSyncResult> {
  const rows = await fetchSalesRange(14);
  if (rows.length) {
    const { error } = await admin()
      .from("appstore_metrics")
      .upsert(
        rows.map((r) => ({ ...r, updated_at: new Date().toISOString() })),
        { onConflict: "day" },
      );
    if (error) throw error;
  }
  const totals = rows.reduce(
    (a, r) => ({ downloads: a.downloads + r.downloads, redownloads: a.redownloads + r.redownloads }),
    { downloads: 0, redownloads: 0 },
  );

  let analytics: AppstoreSyncResult["analytics"] = { days: 0, note: "skipped" };
  try {
    const a = await syncAnalytics();
    if (a.days.length) {
      const { error } = await admin()
        .from("appstore_metrics")
        .upsert(
          a.days.map((d) => ({ day: d.day, impressions: d.impressions, product_page_views: d.product_page_views, updated_at: new Date().toISOString() })),
          { onConflict: "day" },
        );
      if (error) throw error;
    }
    analytics = { days: a.days.length, note: a.note, discovered: a.discovered };
  } catch (e) {
    analytics = { days: 0, note: e instanceof Error ? e.message : "analytics failed" };
  }

  return { sales_days: rows.length, ...totals, analytics };
}
