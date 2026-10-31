import { Card, Stat } from "@/components/ui";
import { NotConfigured, Period, Bars, daysParam } from "@/components/comeback/Bits";
import { getComebackAi } from "@/lib/comeback/data";

export const dynamic = "force-dynamic";

const KIND: Record<string, string> = { "pt-text": "PT import · typed", "pt-image": "PT import · photo", "pt-starter": "Starter suggestions" };

export default async function ComebackAiPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const days = daysParam((await searchParams).days);
  let a;
  try { a = await getComebackAi(days); } catch { return <NotConfigured what="AI usage" />; }
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">AI Usage</h1>
          <p className="text-sm text-[var(--wo-muted)]">Gemini calls from PT import (typed, photo, starter suggestions), last {days} days.</p>
        </div>
        <Period path="/comeback/ai" days={days} />
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Calls" value={a.total} accent="teal" />
        {a.byKind.slice(0, 3).map((k) => <Stat key={k.kind} label={KIND[k.kind] || k.kind} value={k.calls} sub={`${k.people} people`} />)}
      </div>
      <Card title="Calls by day">
        <Bars rows={a.byDay.filter((d) => d.calls).reverse().map((d) => ({ label: d.day, value: d.calls }))} color="var(--wo-teal)" empty="No AI calls in this window." />
      </Card>
    </div>
  );
}
