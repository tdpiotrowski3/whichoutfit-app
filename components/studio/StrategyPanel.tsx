import { Card } from "@/components/ui";
import { ReplanButton } from "@/components/studio/ReplanButton";
import { PLAYBOOKS, RECYCLE_GAP_DAYS, evidence, getHook, getPillar, getSeries, type Arm, type Plan } from "@/lib/contentEngine/strategy";
import type { Brand } from "@/lib/contentEngine/scriptRules";
import type { Provider } from "@/lib/contentEngine/llm";

// The strategy, per brand: what the account is for (pillars), the series it
// runs, the six-week plan, and what the results say so far. Everything here is
// read from the stored plan (studio_settings "strategy:<brand>"), which the
// Monday run rebuilds; "Re-plan" rebuilds it now.

const JOB: Record<string, { label: string; tone: string }> = {
  reach: { label: "Reach", tone: "bg-[var(--wo-blue)]/10 text-[var(--wo-blue)]" },
  trust: { label: "Trust", tone: "bg-[var(--wo-bg)] text-[var(--wo-muted)]" },
  convert: { label: "Convert", tone: "bg-[var(--wo-green)]/10 text-[var(--wo-green)]" },
};

const READ: Record<ReturnType<typeof evidence>, string> = { none: "untested", thin: "too few to call", lean: "early lean", signal: "signal" };

const weekText = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

function Chip({ children, tone = "bg-[var(--wo-bg)] text-[var(--wo-muted)]" }: { children: React.ReactNode; tone?: string }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${tone}`}>{children}</span>;
}

const record = (a: Arm | undefined) => (a && a.n ? `${a.wins} of ${a.n} beat the median · ${READ[evidence(a.n)]}` : "no results yet");

export function StrategyPanel({ brand, plan, provider, endpoint }: { brand: Brand; plan: Plan | null; provider: Provider; endpoint: string }) {
  const b = PLAYBOOKS[brand];
  const arm = (dim: Arm["dim"], key: string) => plan?.arms.find((a) => a.dim === dim && a.key === key);
  return (
    <Card title="Strategy" right={<ReplanButton endpoint={endpoint} label={plan ? "Re-plan" : "Build the plan"} />}>
      {!plan ? (
        <p className="text-sm text-[var(--wo-muted)]">No plan yet. It is built on Monday&apos;s run, or now with the button: six weeks of series episodes, each testing an opening, re-drawn every week from results.</p>
      ) : (
        <div className="space-y-5">
          <div className="space-y-1.5 text-sm">
            {plan.summary.map((s, i) => <p key={i}>{s}</p>)}
          </div>

          <div>
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--wo-muted)]">Pillars</div>
            <ul className="space-y-1.5 text-sm">
              {b.pillars.map((p) => (
                <li key={p.key} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <Chip tone={JOB[p.job].tone}>{JOB[p.job].label}</Chip>
                  <span className="font-medium">{p.label}</span>
                  <span className="text-xs text-[var(--wo-muted)]">found for “{p.intent}” · {record(arm("pillar", p.key))}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--wo-muted)]">The next {plan.weeks.length} weeks</div>
            <ol className="space-y-3">
              {plan.weeks.map((w, n) => (
                <li key={w.weekOf} className="rounded-xl border border-[var(--wo-border)] p-3">
                  <div className="flex flex-wrap items-baseline gap-2 text-sm">
                    <span className="font-semibold">{n === 0 ? "This week" : `Week of ${weekText(w.weekOf)}`}</span>
                    <span className="text-[var(--wo-muted)]">{w.theme}</span>
                    {n > 0 ? <span className="text-xs text-[var(--wo-muted)]">· re-drawn each Monday</span> : null}
                  </div>
                  <ul className="mt-2 space-y-1.5 text-sm">
                    {w.slots.map((s) => (
                      <li key={s.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5" title={s.why}>
                        <Chip tone={JOB[s.job].tone}>{JOB[s.job].label}</Chip>
                        <span className="font-medium">{s.label}</span>
                        <span className="text-xs text-[var(--wo-muted)]">
                          {getSeries(b, s.series)?.name} · {(getHook(b, s.hook)?.label ?? s.hook).toLowerCase()} hook
                        </span>
                        {s.explore ? <Chip tone="bg-amber-50 text-amber-700">experiment</Chip> : null}
                        {s.status === "drafted" ? <Chip tone="bg-[var(--wo-green)]/10 text-[var(--wo-green)]">written</Chip> : null}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          </div>

          <details>
            <summary className="cursor-pointer text-sm font-medium text-[var(--wo-blue)]">Hook bank and series</summary>
            <div className="mt-3 space-y-4">
              <ul className="space-y-2 text-sm">
                {b.hooks.map((h) => (
                  <li key={h.key}>
                    <span className="font-medium">{h.label}</span>{" "}
                    <span className="text-xs text-[var(--wo-muted)]">{record(arm("hook", h.key))}</span>
                    <span className="block text-xs text-[var(--wo-muted)]">{h.how} “{h.example}”</span>
                  </li>
                ))}
              </ul>
              <ul className="space-y-2 text-sm">
                {b.series.map((s) => (
                  <li key={s.key}>
                    <span className="font-medium">{s.name}</span>{" "}
                    <span className="text-xs text-[var(--wo-muted)]">{getPillar(b, s.pillar)?.label} · {s.episodes.length} episodes</span>
                    <span className="block text-xs text-[var(--wo-muted)]">{s.promise}</span>
                  </li>
                ))}
              </ul>
            </div>
          </details>

          <p className="text-xs text-[var(--wo-muted)]">
            Learning from {plan.mature} finished clip{plan.mature === 1 ? "" : "s"}: a clip counts as a win if it beats the median clip or earns a link click or an install. One slot a week always tests the least-tried opening.
            Proven clips re-post after {RECYCLE_GAP_DAYS} days with a new caption. Scripts are written and checked by {provider.provider === "claude" ? "Claude" : "Gemini"} ({provider.model}).
          </p>
        </div>
      )}
    </Card>
  );
}
