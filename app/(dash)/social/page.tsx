import {
  getSocialMetrics,
  getSocialPosts,
  getSocialClicks,
  getSocialIdeas,
  type SocialIdeaDbRow,
  type SocialMetricDbRow,
  type SocialPostDbRow,
  type SocialClickRow,
} from "@/lib/data";
import { Card } from "@/components/ui";
import { isTikTokConfigured } from "@/lib/tiktok";
import { isInstagramConfigured } from "@/lib/meta";
import { isInstagramPublishConfigured } from "@/lib/instagram";
import { SocialView } from "@/components/social/SocialView";

export const dynamic = "force-dynamic";

// The Social & Ads route: load, then render SocialView.
export default async function SocialPage() {

  const now = new Date();
  let rows: SocialMetricDbRow[];
  let posts: SocialPostDbRow[] = [];
  let clicks: SocialClickRow[] = [];
  let ideas: SocialIdeaDbRow[] | null = null;
  try {
    [rows, posts, clicks, ideas] = await Promise.all([getSocialMetrics(60), getSocialPosts(400), getSocialClicks(60), getSocialIdeas(100)]);
  } catch {
    return (
      <Card title="Not configured">
        <p className="text-sm text-[var(--wo-muted)]">Set Supabase env vars to load social metrics.</p>
      </Card>
    );
  }

  return (
    <SocialView
      now={now}
      rows={rows}
      posts={posts}
      clicks={clicks}
      ideas={ideas}
      configured={{ instagram: isInstagramConfigured(), instagramPublish: isInstagramPublishConfigured(), tiktok: isTikTokConfigured() }}
    />
  );
}
