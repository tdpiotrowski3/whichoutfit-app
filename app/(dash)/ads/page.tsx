import { AdsView, type AdsTab } from "@/components/ads/AdsView";
import { getAdsOverview } from "@/lib/metaAds";
import { getTikTokAds } from "@/lib/tiktokAds";

export const dynamic = "force-dynamic";

const RANGES = [7, 30, 90];
const TABS: AdsTab[] = ["all", "meta", "tiktok"];

// The Ads route: load Meta and TikTok for the chosen range, then render AdsView.
export default async function AdsPage({ searchParams }: { searchParams: Promise<{ d?: string; p?: string }> }) {
  const { d, p } = await searchParams;
  const days = RANGES.includes(Number(d)) ? Number(d) : 30;
  const tab = TABS.includes(p as AdsTab) ? (p as AdsTab) : "all";
  const [meta, tiktok] = await Promise.all([getAdsOverview(days), getTikTokAds(days)]);
  return <AdsView tab={tab} days={days} meta={meta} tiktok={tiktok} />;
}
