import { getAiDaily } from "@/lib/data";
import { Card } from "@/components/ui";

export const dynamic = "force-dynamic";

// Rough Gemini 2.5 Flash blended cost (USD per 1M tokens). Adjust as pricing moves.
const COST_PER_M_TOKENS = 0.30;

export default async function AiPage() {
  let rows;
  try {
    rows = await getAiDaily(30);
  } catch {
    return (
      <Card title="Not configured">
        <p className="text-sm text-[var(--wo-muted)]">Set Supabase env vars to load AI consumption.</p>
      </Card>
    );
  }

  // Aggregate by day (sum kinds) for the chart.
  const byDay = new Map<string, { calls: number; tokens: number }>();
  const byKind = new Map<string, { calls: number; tokens: number }>();
  let totalCalls = 0;
  let totalTokens = 0;
  for (const r of rows) {
    const d = byDay.get(r.day) ?? { calls: 0, tokens: 0 };
    d.calls += Number(r.calls);
    d.tokens += Number(r.total_tokens);
    byDay.set(r.day, d);
    const k = byKind.get(r.kind) ?? { calls: 0, tokens: 0 };
    k.calls += Number(r.calls);
    k.tokens += Number(r.total_tokens);
    byKind.set(r.kind, k);
    totalCalls += Number(r.calls);
    totalTokens += Number(r.total_tokens);
  }

  const days = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const maxCalls = Math.max(1, ...days.map(([, v]) => v.calls));
  const avgPerDay = days.length ? totalCalls / days.length : 0;
  const projMonthly = Math.round(avgPerDay * 30);
  const cost30d = (totalTokens / 1_000_000) * COST_PER_M_TOKENS;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">AI Consumption</h1>
        <p className="text-sm text-[var(--wo-muted)]">Last 30 days, from <code>usage_events</code>. Populates as calls flow through the proxy.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Calls · 30d" value={totalCalls} />
        <Stat label="Tokens · 30d" value={totalTokens.toLocaleString()} />
        <Stat label="Est. cost · 30d" value={`$${cost30d.toFixed(2)}`} />
        <Stat label="Proj. calls/mo" value={projMonthly} />
      </div>

      <Card title="Daily calls">
        {days.length === 0 ? (
          <p className="text-sm text-[var(--wo-muted)]">No AI calls logged yet. Trigger a stylist or tagging call in the app and refresh.</p>
        ) : (
          <div className="flex items-end gap-1 h-48">
            {days.map(([day, v]) => (
              <div key={day} className="flex flex-1 flex-col items-center justify-end gap-1" title={`${day}: ${v.calls} calls`}>
                <div className="w-full rounded-t" style={{ height: `${(v.calls / maxCalls) * 100}%`, background: "linear-gradient(180deg, var(--wo-blue), var(--wo-teal))", minHeight: 2 }} />
                <span className="text-[9px] text-[var(--wo-muted)]">{day.slice(5)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="By kind">
        <div className="space-y-2">
          {[...byKind.entries()].sort((a, b) => b[1].calls - a[1].calls).map(([kind, v]) => (
            <div key={kind} className="flex items-center justify-between border-b border-[var(--wo-border)] py-2 last:border-0">
              <span className="text-sm font-medium capitalize">{kind}</span>
              <span className="text-sm text-[var(--wo-muted)]">{v.calls} calls · {v.tokens.toLocaleString()} tokens</span>
            </div>
          ))}
          {byKind.size === 0 ? <p className="text-sm text-[var(--wo-muted)]">No data yet.</p> : null}
        </div>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl bg-white border border-[var(--wo-border)] p-5 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-[var(--wo-muted)]">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </div>
  );
}
