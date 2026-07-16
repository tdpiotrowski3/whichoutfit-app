import Link from "next/link";
import { getRedemptions, type RedemptionCode } from "@/lib/data";
import { Card, Stat, Bar } from "@/components/ui";

export const dynamic = "force-dynamic";

const COMP = "var(--wo-blue)";
const REFERRAL = "var(--wo-teal)";

const KIND_LABELS: Record<string, string> = {
  comp: "Comp",
  referral: "Referral",
};

function kindLabel(kind: string | null): string {
  if (!kind) return "—";
  return KIND_LABELS[kind] ?? kind.charAt(0).toUpperCase() + kind.slice(1);
}

/** Two-segment bar: comp (blue) + referral (teal), scaled against the busiest day. */
function SplitBar({ comp, referral, max }: { comp: number; referral: number; max: number }) {
  const w = (n: number) => (max > 0 ? `${Math.min(100, (n / max) * 100)}%` : "0%");
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-[var(--wo-bg)]">
      <div className="h-2" style={{ width: w(comp), background: COMP }} />
      <div className="h-2" style={{ width: w(referral), background: REFERRAL }} />
    </div>
  );
}

function Header() {
  return (
    <div>
      <h1 className="text-2xl font-semibold">Redemptions</h1>
      <p className="text-sm text-[var(--wo-muted)]">
        Comp &amp; referral code redemptions from <code>usage_events</code> (<code>code_redeemed</code> /{" "}
        <code>referral_code_created</code>, written server-side). Seed/founder accounts excluded — same list as
        Growth, so numbers stay at 0 until real users redeem.
      </p>
    </div>
  );
}

export default async function RedemptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code: requested } = await searchParams;

  let r;
  try {
    r = await getRedemptions(30, requested ?? null);
  } catch {
    return (
      <Card title="Not configured">
        <p className="text-sm text-[var(--wo-muted)]">
          Set Supabase env vars (and apply the <code>admin_redemptions</code> RPC) to load redemption metrics.
        </p>
      </Card>
    );
  }

  const pct = (n: number, of: number) => (of > 0 ? `${Math.round((n / of) * 100)}%` : "—");
  const selected = r.code_filter; // null = all codes
  const days = [...r.by_day].sort((a, b) => a.day.localeCompare(b.day));
  const maxDay = Math.max(1, ...days.map((d) => d.total));
  const byCode = r.by_code;
  const maxCode = Math.max(1, ...byCode.map((c) => c.n));
  const conversion = r.funnel.sharers > 0 ? r.funnel.referral_redemptions / r.funnel.sharers : null;

  const codeHref = (code: string | null) => (code ? `/redemptions?code=${encodeURIComponent(code)}` : "/redemptions");

  return (
    <div className="space-y-6">
      <Header />

      {/* Campaign filter — isolate a single code (e.g. SOHOFRIENDS). */}
      {r.codes.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <Link
            href={codeHref(null)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
              selected == null ? "text-white" : "border border-[var(--wo-border)] text-[var(--wo-muted)] hover:text-[var(--wo-text)]"
            }`}
            style={selected == null ? { background: "var(--wo-blue)" } : undefined}
          >
            All codes
          </Link>
          {r.codes.map((c: RedemptionCode) => {
            const active = selected === c.code;
            return (
              <Link
                key={c.code}
                href={codeHref(c.code)}
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                  active ? "text-white" : "border border-[var(--wo-border)] text-[var(--wo-muted)] hover:text-[var(--wo-text)]"
                }`}
                style={active ? { background: c.code_kind === "referral" ? REFERRAL : COMP } : undefined}
              >
                {c.code} <span className="opacity-70">· {kindLabel(c.code_kind)} · {c.n}</span>
              </Link>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat
          label={selected ? `Redemptions · ${selected}` : "Redemptions"}
          value={r.total_redemptions}
          sub={`last ${r.days} days`}
          accent="blue"
        />
        <Stat label="Comp" value={r.by_kind.comp} sub="comp codes" accent="blue" />
        <Stat label="Referral" value={r.by_kind.referral} sub="referral codes" accent="teal" />
        <Stat label="Premium days granted" value={r.granted_days_total} sub="sum of granted_days" accent="green" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card
          title="Redemptions by day"
          right={
            <span className="flex items-center gap-3 text-xs text-[var(--wo-muted)]">
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: COMP }} /> Comp
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: REFERRAL }} /> Referral
              </span>
            </span>
          }
        >
          {days.length === 0 ? (
            <p className="text-sm text-[var(--wo-muted)]">
              No redemptions in this window{selected ? ` for ${selected}` : ""}. Fills in as users redeem comp or
              referral codes.
            </p>
          ) : (
            <div className="space-y-2">
              {days.map((d) => (
                <div key={d.day} className="flex items-center gap-3 text-sm">
                  <span className="w-24 shrink-0 tabular-nums text-[var(--wo-muted)]">{d.day}</span>
                  <div className="flex-1">
                    <SplitBar comp={d.comp} referral={d.referral} max={maxDay} />
                  </div>
                  <span className="w-8 text-right tabular-nums">{d.total}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="By code">
          {byCode.length === 0 ? (
            <p className="text-sm text-[var(--wo-muted)]">No redemptions to break down yet.</p>
          ) : (
            <div className="space-y-2">
              {byCode.map((c) => (
                <div key={c.code} className="flex items-center gap-3 text-sm">
                  <span className="flex w-40 shrink-0 items-center gap-2 truncate">
                    <span className="truncate font-medium">{c.code}</span>
                    <span className="shrink-0 text-xs text-[var(--wo-muted)]">{kindLabel(c.code_kind)}</span>
                  </span>
                  <div className="flex-1">
                    <Bar value={c.n} max={maxCode} color={c.code_kind === "referral" ? REFERRAL : COMP} />
                  </div>
                  <span className="w-8 text-right tabular-nums">{c.n}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card
        title="Referral funnel"
        right={<span className="text-xs text-[var(--wo-muted)]">whole program · last {r.days} days</span>}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Stat label="Sharers" value={r.funnel.sharers} sub="users with a shareable code" accent="blue" />
          <Stat
            label="Referral redemptions"
            value={r.funnel.referral_redemptions}
            sub="code_kind = referral"
            accent="teal"
          />
          <Stat
            label="Conversion"
            value={conversion == null ? "—" : pct(r.funnel.referral_redemptions, r.funnel.sharers)}
            sub="redemptions ÷ sharers"
            accent="green"
          />
        </div>
        <p className="mt-4 text-xs text-[var(--wo-muted)]">
          Sharers = distinct users who reached Invite Friends (<code>referral_code_created</code>). The funnel spans
          the whole referral program and is not affected by the campaign filter above.
        </p>
      </Card>

      <p className="text-xs text-[var(--wo-muted)]">
        Data: <code>admin_redemptions()</code> over <code>usage_events</code>. Redemption tiles and the campaign filter
        cover both comp and referral codes; the funnel is referral-only.
      </p>
    </div>
  );
}
