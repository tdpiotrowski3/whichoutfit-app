import { admin } from "@/lib/supabase";

// Post → click → install → activated → paid, per campaign.
//
// Where each number comes from:
//   views       social_posts.views (Instagram insights, daily social sync)
//   clicks      social_clicks (every /go hit)
//   iOS         appstore_campaign_metrics: Apple App Analytics first-time
//               downloads per ct=, daily App Store sync. Totals only: Apple
//               never says WHICH user, and hides campaigns under 5 downloads.
//   Android     acquisition_users: Play Install Referrer, reported by the app
//               once the user signs in, so these ARE per user and carry
//               activation (first AI result) and paid (premium) flags.

export type CampaignRow = {
  campaign: string;
  views: number | null;
  clicks: number;
  ios_downloads: number;
  android_installs: number;
  android_activated: number;
  android_paid: number;
};

export type Attribution = {
  days: number;
  rows: CampaignRow[];
  totals: Omit<CampaignRow, "campaign">;
  organicAndroid: number;
};

export async function getAttribution(days = 30): Promise<Attribution> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const sinceDay = since.slice(0, 10);
  const db = admin();

  const [posts, clicks, ios, android] = await Promise.all([
    db.from("social_posts").select("campaign,views").not("campaign", "is", null),
    db.from("social_clicks").select("campaign").gte("created_at", since),
    db.from("appstore_campaign_metrics").select("campaign,first_downloads").gte("day", sinceDay),
    db.from("acquisition_users").select("channel,activated,paid").eq("method", "link").gte("attributed_at", since),
  ]);
  for (const r of [posts, clicks, ios, android]) if (r.error) throw r.error;

  const by = new Map<string, CampaignRow>();
  const row = (c: string) => {
    let r = by.get(c);
    if (!r) {
      r = { campaign: c, views: null, clicks: 0, ios_downloads: 0, android_installs: 0, android_activated: 0, android_paid: 0 };
      by.set(c, r);
    }
    return r;
  };

  for (const p of (posts.data ?? []) as { campaign: string; views: number | null }[]) {
    if (p.views != null) { const r = row(p.campaign); r.views = (r.views ?? 0) + p.views; }
  }
  for (const c of (clicks.data ?? []) as { campaign: string }[]) row(c.campaign).clicks++;
  for (const d of (ios.data ?? []) as { campaign: string; first_downloads: number }[]) row(d.campaign).ios_downloads += d.first_downloads;

  let organicAndroid = 0;
  for (const u of (android.data ?? []) as { channel: string; activated: boolean; paid: boolean }[]) {
    if (u.channel === "organic") { organicAndroid++; continue; }
    const r = row(u.channel);
    r.android_installs++;
    if (u.activated) r.android_activated++;
    if (u.paid) r.android_paid++;
  }

  // Only campaigns that did something in the window (a queued post with no
  // views yet and no clicks is noise here; it lives on the Social tab).
  const rows = [...by.values()]
    .filter((r) => r.clicks || r.ios_downloads || r.android_installs || r.views)
    .sort((a, b) => (b.ios_downloads + b.android_installs) - (a.ios_downloads + a.android_installs) || b.clicks - a.clicks);

  const totals = rows.reduce(
    (t, r) => ({
      views: (t.views ?? 0) + (r.views ?? 0),
      clicks: t.clicks + r.clicks,
      ios_downloads: t.ios_downloads + r.ios_downloads,
      android_installs: t.android_installs + r.android_installs,
      android_activated: t.android_activated + r.android_activated,
      android_paid: t.android_paid + r.android_paid,
    }),
    { views: 0 as number | null, clicks: 0, ios_downloads: 0, android_installs: 0, android_activated: 0, android_paid: 0 },
  );

  return { days, rows, totals, organicAndroid };
}
