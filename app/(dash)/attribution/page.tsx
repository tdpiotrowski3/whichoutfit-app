import { getAttribution } from "@/lib/attribution";
import { Card, Stat } from "@/components/ui";

export const dynamic = "force-dynamic";

const fmt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString());
const pct = (n: number, of: number) => (of > 0 ? `${Math.round((n / of) * 100)}%` : "—");

export default async function AttributionPage() {
  let a;
  try {
    a = await getAttribution(30);
  } catch {
    return (
      <Card title="Not configured">
        <p className="text-sm text-[var(--wo-muted)]">Set Supabase env vars to load attribution.</p>
      </Card>
    );
  }
  const t = a.totals;
  const installs = t.ios_downloads + t.android_installs;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Attribution</h1>
        <p className="text-sm text-[var(--wo-muted)]">
          Which posts bring people in, last {a.days} days: views → link clicks → installs → activated → paid.
        </p>
      </div>

      <Card title="Funnel">
        <div className="grid gap-4 sm:grid-cols-5">
          <Stat label="Reel views" value={fmt(t.views)} accent="muted" />
          <Stat label="Link clicks" value={fmt(t.clicks)} accent="blue" />
          <Stat label="Installs" value={fmt(installs)} accent="teal" />
          <Stat label="Activated (Android)" value={fmt(t.android_activated)} accent="green" />
          <Stat label="Paid (Android)" value={fmt(t.android_paid)} accent="green" />
        </div>
        <p className="mt-4 text-xs text-[var(--wo-muted)]">
          Click → install: {pct(installs, t.clicks)}. Android install → paid: {pct(t.android_paid, t.android_installs)}.
          Organic Android installs (no tracked link): {fmt(a.organicAndroid)}.
        </p>
      </Card>

      <Card title="By campaign">
        {a.rows.length === 0 ? (
          <p className="text-sm text-[var(--wo-muted)]">
            Nothing yet. Every post and bio link should use <span className="font-mono text-xs">whichoutfit.app/go?c=&lt;campaign&gt;</span>.
            iPhone downloads show up about two days after Apple counts them, and only once a campaign has 5 or more.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--wo-border)] text-left text-xs uppercase tracking-wide text-[var(--wo-muted)]">
                  <th className="py-2 pr-4 font-medium">Campaign</th>
                  <th className="py-2 pr-4 font-medium text-right">Views</th>
                  <th className="py-2 pr-4 font-medium text-right">Clicks</th>
                  <th className="py-2 pr-4 font-medium text-right">iPhone downloads</th>
                  <th className="py-2 pr-4 font-medium text-right">Android installs</th>
                  <th className="py-2 pr-4 font-medium text-right">Activated</th>
                  <th className="py-2 pr-4 font-medium text-right">Paid</th>
                </tr>
              </thead>
              <tbody>
                {a.rows.map((r) => (
                  <tr key={r.campaign} className="border-b border-[var(--wo-border)] last:border-0">
                    <td className="py-2.5 pr-4 font-mono text-xs">{r.campaign}</td>
                    <td className="py-2.5 pr-4 text-right">{fmt(r.views)}</td>
                    <td className="py-2.5 pr-4 text-right">{fmt(r.clicks)}</td>
                    <td className="py-2.5 pr-4 text-right">{fmt(r.ios_downloads)}</td>
                    <td className="py-2.5 pr-4 text-right">{fmt(r.android_installs)}</td>
                    <td className="py-2.5 pr-4 text-right">{fmt(r.android_activated)}</td>
                    <td className="py-2.5 pr-4 text-right">{fmt(r.android_paid)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-4 text-xs text-[var(--wo-muted)]">
          iPhone numbers are Apple&apos;s campaign totals (Apple never identifies individual users, so activation and
          paid are tracked per person on Android only). Apple&apos;s own App Analytics → Campaigns shows iPhone sales per campaign.
        </p>
      </Card>
    </div>
  );
}
