import { getGrowth } from "@/lib/data";
import { Card, Stat, Bar } from "@/components/ui";

export const dynamic = "force-dynamic";

// Human labels for the onboarding start-screen cards (onboarding v3).
const CHOICE_LABELS: Record<string, string> = {
  rate_photo: "Rate what I'm wearing",
  complete_outfit: "Complete an outfit",
  build_closet: "Build my closet",
  skip: "Skipped",
};

const STEP_LABELS: Record<string, string> = {
  tour_done: "Finished tour",
  start_choice: "Picked a start",
  taste_done: "Finished taste test",
  quiz_done: "Finished style quiz",
};

export default async function GrowthPage() {
  let g;
  try {
    g = await getGrowth(30);
  } catch {
    return (
      <Card title="Not configured">
        <p className="text-sm text-[var(--wo-muted)]">
          Set Supabase env vars (and apply the <code>admin_growth</code> RPC) to load growth metrics.
        </p>
      </Card>
    );
  }

  const pct = (n: number, of: number) => (of > 0 ? `${Math.round((n / of) * 100)}%` : "—");
  const days = [...g.signups_by_day].sort((a, b) => a.day.localeCompare(b.day));
  const maxSignups = Math.max(1, ...days.map((d) => d.signups));
  const choices = Object.entries(g.start_choices).sort((a, b) => b[1] - a[1]);
  const totalChoices = choices.reduce((sum, [, n]) => sum + n, 0);
  const steps = Object.entries(g.onboarding_steps).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Growth</h1>
        <p className="text-sm text-[var(--wo-muted)]">
          Last {g.days} days, real users only (seed/founder accounts excluded — same list as Overview).
          North star: <strong>40%+ of signups hit an AI moment on day 1</strong>.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Signups" value={g.signups_window} accent="blue" />
        <Stat
          label="Activated day 1"
          value={pct(g.activated_day1, g.signups_window)}
          sub={`${g.activated_day1} of ${g.signups_window} hit an AI moment in 24h`}
          accent={g.signups_window > 0 && g.activated_day1 / g.signups_window >= 0.4 ? "green" : "muted"}
        />
        <Stat
          label="Second sessions"
          value={pct(g.second_session_users, g.signups_window)}
          sub={`${g.second_session_users} came back a later day`}
          accent="teal"
        />
        <Stat label="Premium (real)" value={g.premium_real} sub="active, seeds excluded" accent="green" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Signups by day">
          {days.length === 0 ? (
            <p className="text-sm text-[var(--wo-muted)]">No signups in this window.</p>
          ) : (
            <div className="space-y-2">
              {days.map((d) => (
                <div key={d.day} className="flex items-center gap-3 text-sm">
                  <span className="w-24 shrink-0 tabular-nums text-[var(--wo-muted)]">{d.day}</span>
                  <div className="flex-1"><Bar value={d.signups} max={maxSignups} /></div>
                  <span className="w-6 text-right tabular-nums">{d.signups}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Onboarding start choice">
          {choices.length === 0 ? (
            <p className="text-sm text-[var(--wo-muted)]">
              No events yet — <code>start_choice</code> flows from builds with the track client
              (shipped alongside onboarding v3). This fills in as new users install.
            </p>
          ) : (
            <div className="space-y-2">
              {choices.map(([choice, n]) => (
                <div key={choice} className="flex items-center gap-3 text-sm">
                  <span className="w-44 shrink-0 text-[var(--wo-muted)]">{CHOICE_LABELS[choice] ?? choice}</span>
                  <div className="flex-1"><Bar value={n} max={totalChoices} color="var(--wo-teal)" /></div>
                  <span className="w-10 text-right tabular-nums">{pct(n, totalChoices)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Referral redemptions" value={g.referral_redemptions} accent="teal" />
        <Stat label="Activated (any time)" value={g.activated_ever} sub="of this window's signups" />
        <Stat label="Product lookups" value={g.product_searches} sub="receipt import photo search" />
        <Stat
          label="Onboarding events"
          value={steps.reduce((sum, [, n]) => sum + n, 0)}
          sub={steps.map(([s, n]) => `${STEP_LABELS[s] ?? s}: ${n}`).join(" · ") || "waiting for first build"}
        />
      </div>

      <p className="text-xs text-[var(--wo-muted)]">
        Data: <code>admin_growth()</code> over <code>usage_events</code> (<code>ai_call</code> from the AI proxy;{" "}
        <code>app_open</code> / <code>onboarding_step</code> from the <code>track</code> function). Second-session and
        onboarding numbers populate as users install builds ≥ the one shipping funnel instrumentation.
      </p>
    </div>
  );
}
