import { Card, Stat, Bar } from "@/components/ui";
import { NotConfigured, Period, daysParam } from "@/components/comeback/Bits";
import { getComebackGrowth } from "@/lib/comeback/data";

export const dynamic = "force-dynamic";

export default async function ComebackGrowthPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const days = daysParam((await searchParams).days);
  let g;
  try { g = await getComebackGrowth(days); } catch (e) { return <NotConfigured what="growth" error={e} />; }
  const top = g.funnel[0].people;
  const pct = (n: number, of: number) => (of > 0 ? `${Math.round((n / of) * 100)}%` : "—");
  const step = (i: number) => g.funnel[i].people;
  const maxDay = Math.max(1, ...g.signupsByDay.map((d) => d.signups + d.waitlist));
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Growth</h1>
          <p className="text-sm text-[var(--wo-muted)]">Last {days} days, by install. Rates are over installs that opened the app (never over actives).</p>
        </div>
        <Period path="/comeback/growth" days={days} />
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Opened the app" value={top} accent="blue" />
        <Stat label="Finished setup" value={pct(step(1), top)} sub={`${step(1)} of ${top}`} accent="teal" />
        <Stat label="Logged a session" value={pct(step(2), top)} sub={`${step(2)} of ${top}`} accent="teal" />
        <Stat label="Came back" value={pct(step(3), top)} sub="active on 2+ days" accent="green" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Funnel">
          <div className="space-y-3">
            {g.funnel.map((f) => (
              <div key={f.step}>
                <div className="mb-1 flex justify-between text-sm"><span>{f.step}</span><span className="tabular-nums text-[var(--wo-muted)]">{f.people} · {pct(f.people, top)}</span></div>
                <Bar value={f.people} max={top} color="var(--wo-teal)" />
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-[var(--wo-muted)]">Health connected in setup: {g.healthConnect.ok} of {g.healthConnect.asked} asked.</p>
        </Card>
        <Card title="Signups and waitlist by day">
          <div className="space-y-1.5">
            {g.signupsByDay.filter((d) => d.signups || d.waitlist).reverse().map((d) => (
              <div key={d.day} className="flex items-center gap-3 text-sm">
                <span className="w-24 shrink-0 tabular-nums text-[var(--wo-muted)]">{d.day}</span>
                <div className="flex-1"><Bar value={d.signups + d.waitlist} max={maxDay} /></div>
                <span className="w-28 shrink-0 text-right tabular-nums">{d.signups} <span className="text-[var(--wo-muted)]">+ {d.waitlist} waitlist</span></span>
              </div>
            ))}
            {g.signupsByDay.every((d) => !d.signups && !d.waitlist) ? <p className="text-sm text-[var(--wo-muted)]">No signups in this window.</p> : null}
          </div>
        </Card>
      </div>
    </div>
  );
}
