import { getSocialIdeas, getSocialPosts, type SocialIdeaDbRow, type SocialPostDbRow } from "@/lib/data";
import { Card } from "@/components/ui";
import { ContentStudioView } from "@/components/studio/ContentStudioView";
import { workerStatus, closetInfo, getSettings, type WorkerStatus, type ClosetInfo } from "@/lib/contentEngine/studio";

export const dynamic = "force-dynamic";

// The Content Studio route: load, then render ContentStudioView.
export default async function ContentStudioPage() {

  const now = new Date();
  let ideas: SocialIdeaDbRow[] | null = null;
  let posts: SocialPostDbRow[] = [];
  let worker: WorkerStatus = { seenAt: null, online: false, detail: {} };
  let closets: ClosetInfo[] = [];
  let autopilot = false;
  try {
    let settings;
    [ideas, posts, worker, closets, settings] = await Promise.all([getSocialIdeas(80), getSocialPosts(400), workerStatus(now), closetInfo(), getSettings()]);
    autopilot = settings.autopilot;
  } catch {
    return (
      <Card title="Not configured">
        <p className="text-sm text-[var(--wo-muted)]">Set Supabase env vars to load the content engine.</p>
      </Card>
    );
  }
  if (ideas === null) {
    return (
      <Card title="Not set up">
        <p className="text-sm text-[var(--wo-muted)]">Apply <span className="font-mono text-xs">FitCheck/supabase/social_engine.sql</span> to create the ideas table.</p>
      </Card>
    );
  }

  return <ContentStudioView now={now} ideas={ideas} posts={posts} worker={worker} closets={closets} autopilot={autopilot} />;
}
