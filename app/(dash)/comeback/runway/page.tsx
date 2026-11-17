import { Card } from "@/components/ui";
import { RunwayView } from "@/components/comeback/RunwayView";
import { getLaunchDate, getPieces, type PieceRow } from "@/lib/comeback/runwayStore";
import { loadPlan } from "@/lib/contentEngine/strategyStore";
import { llmProvider } from "@/lib/contentEngine/llm";
import type { Plan } from "@/lib/contentEngine/strategy";

export const dynamic = "force-dynamic";

// Comeback Health's launch runway: load, then render RunwayView.
export default async function ComebackRunwayPage() {
  let pieces: PieceRow[] | null = null;
  let launch: string | null = null;
  let plan: Plan | null = null;
  try {
    [pieces, launch, plan] = await Promise.all([getPieces(), getLaunchDate(), loadPlan("comeback").catch(() => null)]);
  } catch {
    return (
      <Card title="Not configured">
        <p className="text-sm text-[var(--wo-muted)]">Set Supabase env vars to load the runway.</p>
      </Card>
    );
  }
  if (pieces === null) {
    return (
      <Card title="Not set up">
        <p className="text-sm text-[var(--wo-muted)]">
          Apply <span className="font-mono text-xs">FitCheck/supabase/social_brands.sql</span> to give ideas and posts a brand column.
        </p>
      </Card>
    );
  }
  return <RunwayView pieces={pieces} launch={launch} now={new Date()} plan={plan} provider={llmProvider()} />;
}
