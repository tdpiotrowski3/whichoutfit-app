import { Card } from "@/components/ui";
import { NotConfigured, Period, Bars, daysParam } from "@/components/comeback/Bits";
import { getComebackUsage } from "@/lib/comeback/data";

export const dynamic = "force-dynamic";

// Who uses what: features by people, sports, paths and platforms. A person is the account when signed in,
// else the install.
export default async function ComebackUsagePage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const days = daysParam((await searchParams).days);
  let u;
  try { u = await getComebackUsage(days); } catch (e) { return <NotConfigured what="usage" error={e} />; }
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Usage</h1>
          <p className="text-sm text-[var(--wo-muted)]">What people use in the app, last {days} days. Feature names only, never health values.</p>
        </div>
        <Period path="/comeback/usage" days={days} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Sports">
          <Bars rows={u.sports.map((s) => ({ label: s.sport, value: s.people, note: `· ${s.sessions} sessions` }))} empty="No sport picked yet." />
          <p className="mt-3 text-xs text-[var(--wo-muted)]">People per chosen sport (all time); sessions finished in this window.</p>
        </Card>
        <Card title="Ways in">
          <Bars rows={u.paths.map((p) => ({ label: p.path, value: p.people }))} color="var(--wo-teal)" empty="No setups finished yet." />
          <div className="mt-5 border-t border-[var(--wo-border)] pt-4">
            <Bars rows={u.platforms.map((p) => ({ label: p.platform === "ios" ? "iPhone" : p.platform === "android" ? "Android" : p.platform === "web" ? "Web" : p.platform, value: p.people }))} color="var(--wo-green)" empty="No events in this window." />
          </div>
        </Card>
      </div>
      <Card title="Features, by how many people use them">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--wo-border)] text-left text-xs uppercase tracking-wide text-[var(--wo-muted)]">
                <th className="py-2 pr-4 font-medium">Feature</th>
                <th className="py-2 pr-4 font-medium text-right">People</th>
                <th className="py-2 pr-4 font-medium text-right">Signed in</th>
                <th className="py-2 pl-4 font-medium text-right">Uses</th>
              </tr>
            </thead>
            <tbody>
              {u.features.slice(0, 60).map((f) => (
                <tr key={f.feature} className="border-b border-[var(--wo-border)] last:border-0">
                  <td className="py-2 pr-4">{f.feature}</td>
                  <td className="py-2 pr-4 text-right tabular-nums font-medium">{f.people}</td>
                  <td className="py-2 pr-4 text-right tabular-nums text-[var(--wo-muted)]">{f.signedIn}</td>
                  <td className="py-2 pl-4 text-right tabular-nums text-[var(--wo-muted)]">{f.uses}</td>
                </tr>
              ))}
              {u.features.length === 0 ? <tr><td colSpan={4} className="py-6 text-center text-[var(--wo-muted)]">No feature events yet. They start with the Oct 30 builds.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
