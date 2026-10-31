import { Card } from "@/components/ui";
import { NotConfigured, Period, Bars, daysParam } from "@/components/comeback/Bits";
import { getComebackUsage } from "@/lib/comeback/data";

export const dynamic = "force-dynamic";

const pct = (x: number) => Math.round(x * 100) + "%";

// What's working in the app: areas and features by the share of active people who use them.
// A person is the account when signed in, else the install. Feature names: lib/comeback/features.ts.
export default async function ComebackUsagePage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const days = daysParam((await searchParams).days);
  let u;
  try { u = await getComebackUsage(days); } catch (e) { return <NotConfigured what="usage" error={e} />; }
  const byArea = new Map<string, string[]>();
  for (const n of u.notUsed) byArea.set(n.area, [...(byArea.get(n.area) || []), n.feature]);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Usage</h1>
          <p className="text-sm text-[var(--wo-muted)]">
            What people use, last {days} days. Percentages are of the <strong>{u.active}</strong> {u.active === 1 ? "person" : "people"} active in this window. Feature names only, never health values.
          </p>
        </div>
        <Period path="/comeback/usage" days={days} />
      </div>

      <Card title="What's working, by area">
        <Bars rows={u.areas.filter((a) => a.area !== "Setup" && a.area !== "Account").map((a) => ({ label: a.area, value: Math.round(a.share * 100), note: `% · ${a.people} of ${u.active}` }))} empty="No feature events yet. They start with the Oct 30 builds." />
        <p className="mt-3 text-xs text-[var(--wo-muted)]">Share of active people who used anything in that area. Setup and account steps are left out here; they&apos;re in the table below.</p>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Sports">
          <Bars rows={u.sports.map((s) => ({ label: s.sport, value: s.people, note: `· ${s.sessions} sessions` }))} empty="No sport picked yet." />
          <p className="mt-3 text-xs text-[var(--wo-muted)]">People per chosen sport (all time); sessions finished in this window.</p>
        </Card>
        <Card title="Ways in and platforms">
          <Bars rows={u.paths.map((p) => ({ label: p.path, value: p.people }))} color="var(--wo-teal)" empty="No setups finished yet." />
          <div className="mt-5 border-t border-[var(--wo-border)] pt-4">
            <Bars rows={u.platforms.map((p) => ({ label: p.platform === "ios" ? "iPhone" : p.platform === "android" ? "Android" : p.platform === "web" ? "Web" : p.platform, value: p.people }))} color="var(--wo-green)" empty="No events in this window." />
          </div>
        </Card>
      </div>

      <Card title="Features">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--wo-border)] text-left text-xs uppercase tracking-wide text-[var(--wo-muted)]">
                <th className="py-2 pr-4 font-medium">Feature</th>
                <th className="py-2 pr-4 font-medium">Area</th>
                <th className="py-2 pr-4 font-medium text-right">Of active</th>
                <th className="py-2 pr-4 font-medium text-right">People</th>
                <th className="py-2 pl-4 font-medium text-right">Uses</th>
              </tr>
            </thead>
            <tbody>
              {u.features.slice(0, 80).map((f) => (
                <tr key={f.area + f.feature} className="border-b border-[var(--wo-border)] last:border-0">
                  <td className="py-2 pr-4">{f.feature}</td>
                  <td className="py-2 pr-4"><span className="rounded-full bg-[var(--wo-bg)] px-2 py-0.5 text-xs text-[var(--wo-muted)]">{f.area}</span></td>
                  <td className="py-2 pr-4 text-right tabular-nums font-medium">{pct(f.share)}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{f.people}<span className="text-[var(--wo-muted)]">{f.signedIn ? ` · ${f.signedIn} signed in` : ""}</span></td>
                  <td className="py-2 pl-4 text-right tabular-nums text-[var(--wo-muted)]">{f.uses}</td>
                </tr>
              ))}
              {u.features.length === 0 ? <tr><td colSpan={5} className="py-6 text-center text-[var(--wo-muted)]">No feature events yet. They start with the Oct 30 builds.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Not used yet">
        {byArea.size === 0 ? <p className="text-sm text-[var(--wo-muted)]">Every feature was used at least once in this window.</p> : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[...byArea.entries()].map(([area, fs]) => (
              <div key={area}>
                <div className="text-xs font-semibold uppercase tracking-wide text-[var(--wo-muted)]">{area}</div>
                <ul className="mt-1 space-y-0.5 text-sm">{fs.map((f) => <li key={f}>{f}</li>)}</ul>
              </div>
            ))}
          </div>
        )}
        <p className="mt-3 text-xs text-[var(--wo-muted)]">Nobody touched these in the last {days} days. Low numbers early on just mean few people; watch which stay empty as usage grows.</p>
      </Card>
    </div>
  );
}
