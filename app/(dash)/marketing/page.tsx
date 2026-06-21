import Link from "next/link";
import { getUsageFeatures, getFeatureSegment, type FeatureSegmentRow } from "@/lib/data";
import { Card, Stat } from "@/components/ui";
import { isEmailConfigured } from "@/lib/email";
import { SendNudgePanel } from "./SendNudgePanel";

export const dynamic = "force-dynamic";

const FEATURE_LABELS: Record<string, string> = {
  tagging: "AI Tagging",
  stylist: "AI Stylist",
};

function label(kind: string): string {
  return FEATURE_LABELS[kind] ?? kind.charAt(0).toUpperCase() + kind.slice(1);
}

function fmt(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "2-digit" });
}

/** The address a nudge would actually go to: consent-time email wins, else auth email. */
function deliverableEmail(r: FeatureSegmentRow): string | null {
  return r.consent_email || r.email || null;
}

function isPrivateRelay(email: string | null): boolean {
  return !!email && email.endsWith("privaterelay.appleid.com");
}

function Header() {
  return (
    <div>
      <h1 className="text-2xl font-semibold">Marketing segmentation</h1>
      <p className="text-sm text-[var(--wo-muted)]">
        Users who haven&apos;t used a feature yet — for opted-in re-engagement nudges.
      </p>
    </div>
  );
}

export default async function MarketingPage({
  searchParams,
}: {
  searchParams: Promise<{ feature?: string }>;
}) {
  let features;
  try {
    features = await getUsageFeatures();
  } catch {
    return (
      <Card title="Not configured">
        <p className="text-sm text-[var(--wo-muted)]">Set Supabase env vars to load segmentation.</p>
      </Card>
    );
  }

  if (features.length === 0) {
    return (
      <div className="space-y-6">
        <Header />
        <Card>
          <p className="text-sm text-[var(--wo-muted)]">No usage events yet — nothing to segment on.</p>
        </Card>
      </div>
    );
  }

  // Selected feature: the requested one if it's real, else the first known feature.
  const { feature: requested } = await searchParams;
  const selected = requested && features.some((f) => f.kind === requested) ? requested : features[0].kind;

  const rows = await getFeatureSegment(selected);
  const emailable = rows.filter((r) => r.opted_in && deliverableEmail(r));
  const privateRelay = emailable.filter((r) => isPrivateRelay(deliverableEmail(r)));

  return (
    <div className="space-y-6">
      <Header />

      <div className="flex flex-wrap gap-2">
        {features.map((f) => {
          const active = f.kind === selected;
          return (
            <Link
              key={f.kind}
              href={`/marketing?feature=${encodeURIComponent(f.kind)}`}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                active
                  ? "text-white"
                  : "border border-[var(--wo-border)] text-[var(--wo-muted)] hover:text-[var(--wo-text)]"
              }`}
              style={active ? { background: "var(--wo-blue)" } : undefined}
            >
              {label(f.kind)} <span className="opacity-70">· {f.users} used</span>
            </Link>
          );
        })}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label={`Haven't used ${label(selected)}`} value={rows.length} accent="blue" />
        <Stat
          label="Reachable (opted in + email)"
          value={emailable.length}
          accent="green"
          sub={privateRelay.length ? `${privateRelay.length} via Apple private relay` : undefined}
        />
        <Stat label="Not opted in" value={rows.length - emailable.length} accent="muted" />
      </div>

      <Card title="Send a nudge" right={<span className="text-xs text-[var(--wo-muted)]">{label(selected)} non-users</span>}>
        <SendNudgePanel
          feature={selected}
          featureLabel={label(selected)}
          emailableCount={emailable.length}
          configured={isEmailConfigured()}
        />
      </Card>

      <Card title={`Users who haven't used ${label(selected)}`} right={<span className="text-xs text-[var(--wo-muted)]">opted-in first</span>}>
        <p className="mb-4 text-xs text-[var(--wo-muted)]">
          ⚠️ Only the {emailable.length} opted-in user{emailable.length === 1 ? "" : "s"} may be emailed. Bulk
          sends still require CAN-SPAM / GDPR compliance (sender identity + one-click unsubscribe); Apple
          private-relay addresses may be unreachable.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--wo-border)] text-left text-xs uppercase tracking-wide text-[var(--wo-muted)]">
                <th className="py-2 pr-4 font-medium">Email</th>
                <th className="py-2 pr-4 font-medium">Marketing consent</th>
                <th className="py-2 pr-4 font-medium">Signed up</th>
                <th className="py-2 pr-4 font-medium">Last active</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const email = deliverableEmail(r);
                const reachable = r.opted_in && !!email;
                return (
                  <tr key={r.user_id} className="border-b border-[var(--wo-border)] last:border-0">
                    <td className="py-2.5 pr-4 font-medium">
                      {email ?? <span className="text-[var(--wo-muted)]">no email</span>}
                      {isPrivateRelay(email) ? (
                        <span className="ml-2 text-xs text-[var(--wo-muted)]">private relay</span>
                      ) : null}
                    </td>
                    <td className="py-2.5 pr-4">
                      {reachable ? (
                        <span className="rounded-full px-2 py-0.5 text-xs font-semibold text-white" style={{ background: "var(--wo-green)" }}>
                          Emailable
                        </span>
                      ) : (
                        <span className="rounded-full bg-[var(--wo-bg)] px-2 py-0.5 text-xs font-medium text-[var(--wo-muted)]">
                          {r.opted_in ? "Opted in · no email" : "Not opted in"}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 pr-4 text-[var(--wo-muted)]">{fmt(r.created_at)}</td>
                    <td className="py-2.5 pr-4 text-[var(--wo-muted)]">{fmt(r.last_sign_in_at)}</td>
                  </tr>
                );
              })}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-[var(--wo-muted)]">
                    Everyone has used {label(selected)}. 🎉
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
