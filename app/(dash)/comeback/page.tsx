import { Card, Stat } from "@/components/ui";
import { NotConfigured } from "@/components/comeback/Bits";
import { getComebackOverview } from "@/lib/comeback/data";

export const dynamic = "force-dynamic";

// Comeback Health overview: the same shape as WhichOutfit's, from Comeback's own Supabase.
export default async function ComebackOverviewPage() {
  let o;
  try { o = await getComebackOverview(); } catch (e) { return <NotConfigured what="the overview" error={e} />; }
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Overview</h1>
        <p className="text-sm text-[var(--wo-muted)]">Comeback Health, live from its Supabase. Downloads &amp; conversion live in App Store Connect and Play Console.</p>
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Signups" value={o.signups} accent="blue" sub={`${o.signups30} in the last 30 days`} />
        <Stat label="Pro active" value={o.pro} accent="green" sub={`${o.proIos} App Store · ${o.proAndroid} Play · ${o.proLifetime} lifetime`} />
        <Stat label="Active · 7d" value={o.active7} accent="teal" sub="people with any event (accounts or installs)" />
        <Stat label="Sessions · 30d" value={o.sessions30} sub="synced from signed-in accounts" accent="muted" />
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <Card title="Reach">
          <div className="grid grid-cols-2 gap-4">
            <Stat label="Installs · 30d" value={o.installs30} sub="distinct app installs sending events" />
            <Stat label="Waitlist" value={o.waitlist} sub="comebackhealth.app signups" />
          </div>
        </Card>
        <Card title="Engagement">
          <div className="grid grid-cols-2 gap-4">
            <Stat label="AI calls · 30d" value={o.ai30} sub={`${o.aiTotal} all-time`} accent="teal" />
            <Stat label="PT links live" value={o.ptLinks} sub="shared with a PT, not revoked" />
          </div>
        </Card>
      </div>
      <p className="text-xs text-[var(--wo-muted)]">
        Events from signed-in people carry their account since Oct 30, 2026; earlier events count by install only.
        {o.excludedInstalls ? ` Leaves out ${o.excludedInstalls} web installs that never signed in (local test runs and sign-in bounces).` : ""}
      </p>
    </div>
  );
}
