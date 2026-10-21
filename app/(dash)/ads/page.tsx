import { AdsView } from "@/components/ads/AdsView";
import { getAdsOverview } from "@/lib/metaAds";

export const dynamic = "force-dynamic";

const RANGES = [7, 30, 90];

// The Ads route: load Meta ads for the chosen range, then render AdsView.
export default async function AdsPage({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const { d } = await searchParams;
  const days = RANGES.includes(Number(d)) ? Number(d) : 30;
  const overview = await getAdsOverview(days);
  return <AdsView overview={overview} />;
}
