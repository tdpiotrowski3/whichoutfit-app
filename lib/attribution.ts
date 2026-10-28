import { admin } from "@/lib/supabase";
import { WHICHOUTFIT } from "@/lib/brand";
import { appleCampaign, isAndroid } from "@/lib/socialLinks";

// Post → click → install → activated → paid, per campaign.
//
// Where each number comes from:
//   views       social_posts.views (Instagram insights, daily social sync)
//   clicks      social_clicks (every /go hit, with the full per-post campaign)
//   iPhone      appstore_campaign_metrics: Apple App Analytics first-time
//               downloads per Apple campaign, daily App Store sync. Apple only
//               reports a campaign past 5 downloads, so /go gives Apple the
//               PLATFORM ("instagram", "tiktok") rather than the post. The
//               per-post iPhone figure is therefore an ESTIMATE: the platform's
//               Apple total split by each post's share of that platform's
//               iPhone clicks.
//   Android     acquisition_users: Play Install Referrer, per user and per post,
//               with activation (first AI result) and paid (premium) flags.

export type CampaignRow = {
  campaign: string;
  views: number | null;
  clicks: number;
  ios_clicks: number;
  ios_est: number;
  android_installs: number;
  android_activated: number;
  android_paid: number;
};

export type AppleGroup = { campaign: string; downloads: number; ios_clicks: number };

export type Attribution = {
  days: number;
  rows: CampaignRow[];
  apple: AppleGroup[];
  totals: { views: number; clicks: number; ios_downloads: number; android_installs: number; android_activated: number; android_paid: number };
  organicAndroid: number;
};

export async function getAttribution(days = 30): Promise<Attribution> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const db = admin();

  const [posts, clicks, ios, android] = await Promise.all([
    db.from("social_posts").select("campaign,views").eq("brand", WHICHOUTFIT).not("campaign", "is", null),
    db.from("social_clicks").select("campaign,user_agent").gte("created_at", since),
    db.from("appstore_campaign_metrics").select("campaign,first_downloads").gte("day", since.slice(0, 10)),
    db.from("acquisition_users").select("channel,activated,paid").eq("method", "link").gte("attributed_at", since),
  ]);
  for (const r of [posts, clicks, ios, android]) if (r.error) throw r.error;

  const by = new Map<string, CampaignRow>();
  const row = (c: string) => {
    let r = by.get(c);
    if (!r) {
      r = { campaign: c, views: null, clicks: 0, ios_clicks: 0, ios_est: 0, android_installs: 0, android_activated: 0, android_paid: 0 };
      by.set(c, r);
    }
    return r;
  };

  for (const p of (posts.data ?? []) as { campaign: string; views: number | null }[]) {
    if (p.views != null) { const r = row(p.campaign); r.views = (r.views ?? 0) + p.views; }
  }
  for (const c of (clicks.data ?? []) as { campaign: string; user_agent: string | null }[]) {
    const r = row(c.campaign);
    r.clicks++;
    if (!isAndroid(c.user_agent)) r.ios_clicks++;
  }

  let organicAndroid = 0;
  for (const u of (android.data ?? []) as { channel: string; activated: boolean; paid: boolean }[]) {
    if (u.channel === "organic") { organicAndroid++; continue; }
    const r = row(u.channel);
    r.android_installs++;
    if (u.activated) r.android_activated++;
    if (u.paid) r.android_paid++;
  }

  // Apple's real numbers, per Apple campaign (platform).
  const appleTotals = new Map<string, number>();
  for (const d of (ios.data ?? []) as { campaign: string; first_downloads: number }[]) {
    appleTotals.set(d.campaign, (appleTotals.get(d.campaign) ?? 0) + d.first_downloads);
  }
  const iosClicksByGroup = new Map<string, number>();
  for (const r of by.values()) {
    const g = appleCampaign(r.campaign);
    iosClicksByGroup.set(g, (iosClicksByGroup.get(g) ?? 0) + r.ios_clicks);
  }
  // Split each Apple total across its posts by iPhone-click share.
  for (const r of by.values()) {
    const g = appleCampaign(r.campaign);
    const total = appleTotals.get(g) ?? 0;
    const groupClicks = iosClicksByGroup.get(g) ?? 0;
    r.ios_est = total && groupClicks ? Math.round((total * r.ios_clicks) / groupClicks) : 0;
  }

  const rows: CampaignRow[] = [...by.values()]
    .filter((r) => r.clicks || r.android_installs || r.views)
    .sort((a, b) => (b.ios_est + b.android_installs) - (a.ios_est + a.android_installs) || b.clicks - a.clicks);

  const apple: AppleGroup[] = [...new Set([...appleTotals.keys(), ...iosClicksByGroup.keys()])]
    .map((c) => ({ campaign: c, downloads: appleTotals.get(c) ?? 0, ios_clicks: iosClicksByGroup.get(c) ?? 0 }))
    .filter((g) => g.downloads || g.ios_clicks)
    .sort((a, b) => b.downloads - a.downloads);

  const totals = {
    views: rows.reduce((t, r) => t + (r.views ?? 0), 0),
    clicks: rows.reduce((t, r) => t + r.clicks, 0),
    ios_downloads: [...appleTotals.values()].reduce((t, n) => t + n, 0),
    android_installs: rows.reduce((t, r) => t + r.android_installs, 0),
    android_activated: rows.reduce((t, r) => t + r.android_activated, 0),
    android_paid: rows.reduce((t, r) => t + r.android_paid, 0),
  };

  return { days, rows, apple, totals, organicAndroid };
}
