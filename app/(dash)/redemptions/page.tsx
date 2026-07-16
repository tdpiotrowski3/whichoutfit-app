import Link from "next/link";
import { getRedemptions, type RedemptionCode, type RedemptionsDayRow } from "@/lib/data";
import { Card } from "@/components/ui";

export const dynamic = "force-dynamic";

const COMP = "var(--wo-blue)";
const REFERRAL = "var(--wo-teal)";
const GREEN = "var(--wo-green)";
const LOSS = "#DC2626";
const GRADIENT = "linear-gradient(120deg, var(--wo-blue), var(--wo-teal))";

// ── Program economics (tune here as App Store pricing changes) ────────────────
const PREMIUM_MONTHLY_USD = 14.99; // App Store monthly price
const PREMIUM_ANNUAL_USD = 99.99; // App Store annual price ($8.33/mo)
// Retail value of one free premium week given away (monthly rate ÷ ~4.33 weeks).
const FREE_WEEK_VALUE_USD = (PREMIUM_MONTHLY_USD * 12) / 52; // ≈ $3.46
// First-year revenue booked per paying convert — annual price is the conservative anchor.
const VALUE_PER_CONVERT_USD = PREMIUM_ANNUAL_USD;

const usd0 = (n: number) =>
  n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const KIND_LABELS: Record<string, string> = { comp: "Comp", referral: "Referral" };
const kindLabel = (k: string | null) =>
  !k ? "—" : KIND_LABELS[k] ?? k.charAt(0).toUpperCase() + k.slice(1);
const kindColor = (k: string | null) => (k === "referral" ? REFERRAL : COMP);
const tint = (color: string, pct: number) => `color-mix(in srgb, ${color} ${pct}%, white)`;

/** Round up to a "nice" y-axis max divisible by 4, so the four gridline labels are whole numbers. */
function niceMax(v: number): number {
  return Math.max(4, Math.ceil(v / 4) * 4);
}

function fmtDay(iso: string): string {
  return iso.slice(5); // MM-DD
}

// ── Icons (inline, brand-tinted) ──────────────────────────────────────────────
type IconProps = { color: string };
const Icon = ({ color, d }: IconProps & { d: React.ReactNode }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {d}
  </svg>
);
const TicketIcon = ({ color }: IconProps) => (
  <Icon color={color} d={<><path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4z" /><path d="M13 5v14" /></>} />
);
const GiftIcon = ({ color }: IconProps) => (
  <Icon color={color} d={<><path d="M20 12v9H4v-9" /><path d="M2 7h20v5H2z" /><path d="M12 22V7" /><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" /><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" /></>} />
);
const ShareIcon = ({ color }: IconProps) => (
  <Icon color={color} d={<><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" /></>} />
);
const CalendarIcon = ({ color }: IconProps) => (
  <Icon color={color} d={<><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>} />
);

// ── KPI tile ──────────────────────────────────────────────────────────────────
function Tile({
  label,
  value,
  sub,
  color,
  icon,
  primary,
}: {
  label: string;
  value: string | number;
  sub: string;
  color: string;
  icon: React.ReactNode;
  primary?: boolean;
}) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-[var(--wo-border)] bg-white p-5 shadow-sm transition hover:shadow-md">
      {primary && <div className="absolute inset-x-0 top-0 h-1" style={{ background: GRADIENT }} />}
      <div className="flex items-start justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--wo-muted)]">{label}</div>
        <div className="flex h-8 w-8 items-center justify-center rounded-xl" style={{ background: tint(color, 12) }}>
          {icon}
        </div>
      </div>
      <div className="mt-3 text-3xl font-semibold tabular-nums" style={primary ? undefined : { color }}>
        {value}
      </div>
      <div className="mt-1 text-sm text-[var(--wo-muted)]">{sub}</div>
    </div>
  );
}

// ── Stacked-bar time series (comp on bottom, referral on top) ─────────────────
function TrendChart({ days, max }: { days: RedemptionsDayRow[]; max: number }) {
  const ticks = [max, (max * 3) / 4, max / 2, max / 4, 0];
  const labelIdx = [0, Math.floor(days.length / 2), days.length - 1];

  return (
    <>
      <div className="flex">
        {/* y-axis gutter */}
        <div className="relative mr-2 h-56 w-7 shrink-0 text-[10px] tabular-nums text-[var(--wo-muted)]">
          {ticks.map((t, i) => (
            <span
              key={i}
              className="absolute right-0"
              style={{ top: `${(i / (ticks.length - 1)) * 100}%`, transform: "translateY(-50%)" }}
            >
              {t}
            </span>
          ))}
        </div>
        {/* plot */}
        <div className="relative h-56 flex-1">
          <div className="absolute inset-0 flex flex-col justify-between">
            {ticks.map((_, i) => (
              <div key={i} className={i === 0 || i === ticks.length - 1 ? "border-t border-[var(--wo-border)]" : "border-t border-[var(--wo-border)]/60"} />
            ))}
          </div>
          <div className="absolute inset-0 flex items-end gap-[3px]">
            {days.map((d) => {
              const compH = (d.comp / max) * 100;
              const refH = (d.referral / max) * 100;
              const compRounded = d.comp > 0 && d.referral === 0;
              return (
                <div key={d.day} className="group relative flex h-full flex-1 flex-col justify-end">
                  {d.referral > 0 && (
                    <div className="w-full rounded-t-[3px]" style={{ height: `${refH}%`, minHeight: 2, background: REFERRAL }} />
                  )}
                  {d.comp > 0 && (
                    <div
                      className={`w-full ${d.referral > 0 ? "mt-[2px]" : ""} ${compRounded ? "rounded-t-[3px]" : ""}`}
                      style={{ height: `${compH}%`, minHeight: 2, background: COMP }}
                    />
                  )}
                  {/* hover tooltip */}
                  <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-[var(--wo-text)] px-2.5 py-1.5 text-[11px] text-white shadow-lg group-hover:block">
                    <div className="font-medium">{fmtDay(d.day)}</div>
                    <div className="mt-0.5 flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: COMP }} />Comp {d.comp}</div>
                    <div className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: REFERRAL }} />Referral {d.referral}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {/* x-axis labels: first · middle · last */}
      <div className="mt-2 flex pl-9 text-[10px] text-[var(--wo-muted)]">
        {labelIdx.map((idx, i) => (
          <span key={i} className={`flex-1 ${i === 0 ? "text-left" : i === 1 ? "text-center" : "text-right"}`}>
            {days[idx] ? fmtDay(days[idx].day) : ""}
          </span>
        ))}
      </div>
    </>
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

  const pct = (n: number, of: number) => (of > 0 ? Math.round((n / of) * 100) : 0);
  const selected = r.code_filter; // null = all codes
  const total = r.total_redemptions;
  const days = [...r.by_day].sort((a, b) => a.day.localeCompare(b.day));
  const chartMax = niceMax(Math.max(0, ...days.map((d) => d.total)));
  const byCode = r.by_code;
  const maxCode = Math.max(1, ...byCode.map((c) => c.n));
  const { sharers, referral_redemptions: refRedeemed } = r.funnel;
  const conversion = sharers > 0 ? pct(refRedeemed, sharers) : null;

  // Free weeks = premium days given away ÷ 7 (the ROI cost proxy). Whole where it
  // divides evenly (comp grants are 14-day multiples), else one decimal.
  const freeWeeks = r.granted_days_total / 7;
  const freeWeeksLabel = Number.isInteger(freeWeeks) ? String(freeWeeks) : freeWeeks.toFixed(1);
  // "Past the free weeks": redeemers who now hold a paid subscription.
  const { redeemers, converted_paid: convertedPaid } = r.retention;
  const paidConversion = redeemers > 0 ? pct(convertedPaid, redeemers) : null;

  // Program ROI: value returned (paying converts) vs value given away (free weeks,
  // priced at retail — an opportunity cost, not cash). "Am I losing money?" = net sign.
  const giveawayValue = freeWeeks * FREE_WEEK_VALUE_USD;
  const convertRevenue = convertedPaid * VALUE_PER_CONVERT_USD;
  const netUsd = convertRevenue - giveawayValue;
  const roiRatio = giveawayValue > 0 ? convertRevenue / giveawayValue : null;
  const breakEvenConverts = Math.ceil(giveawayValue / VALUE_PER_CONVERT_USD);
  const breakEvenPct = redeemers > 0 ? pct(breakEvenConverts, redeemers) : null;
  const hasRoiData = redeemers > 0 || giveawayValue > 0;
  const profitable = netUsd >= 0;

  const codeHref = (code: string | null) => (code ? `/redemptions?code=${encodeURIComponent(code)}` : "/redemptions");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Redemptions</h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--wo-muted)]">
            Comp &amp; referral code redemptions from <code className="rounded bg-[var(--wo-bg)] px-1 py-0.5 text-xs">usage_events</code>,
            written server-side. Seed/founder accounts excluded — same basis as Growth, so numbers stay at 0 until real
            users redeem.
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--wo-border)] bg-white px-4 py-2 text-right shadow-sm">
          <div className="text-[11px] font-medium uppercase tracking-wide text-[var(--wo-muted)]">Last {r.days} days</div>
          <div className="text-lg font-semibold tabular-nums">
            {total} redemption{total === 1 ? "" : "s"}
          </div>
        </div>
      </div>

      {/* Campaign filter */}
      {r.codes.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs font-medium uppercase tracking-wide text-[var(--wo-muted)]">Campaign</span>
          <Link
            href={codeHref(null)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium shadow-sm transition ${
              selected == null ? "text-white" : "border border-[var(--wo-border)] bg-white text-[var(--wo-muted)] hover:text-[var(--wo-text)]"
            }`}
            style={selected == null ? { background: GRADIENT } : undefined}
          >
            All codes
          </Link>
          {r.codes.map((c: RedemptionCode) => {
            const active = selected === c.code;
            const color = kindColor(c.code_kind);
            return (
              <Link
                key={c.code}
                href={codeHref(c.code)}
                className={`group inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-medium shadow-sm transition ${
                  active ? "text-white" : "border border-[var(--wo-border)] bg-white text-[var(--wo-muted)] hover:text-[var(--wo-text)]"
                }`}
                style={active ? { background: color } : undefined}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: active ? "white" : color }} />
                {c.code}
                <span className="tabular-nums opacity-60">· {c.n}</span>
              </Link>
            );
          })}
        </div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile
          primary
          label={selected ? `Redemptions · ${selected}` : "Redemptions"}
          value={total}
          sub={`last ${r.days} days`}
          color={COMP}
          icon={<TicketIcon color={COMP} />}
        />
        <Tile
          label="Comp"
          value={r.by_kind.comp}
          sub={total > 0 ? `comp codes · ${pct(r.by_kind.comp, total)}%` : "comp codes"}
          color={COMP}
          icon={<GiftIcon color={COMP} />}
        />
        <Tile
          label="Referral"
          value={r.by_kind.referral}
          sub={total > 0 ? `referral codes · ${pct(r.by_kind.referral, total)}%` : "referral codes"}
          color={REFERRAL}
          icon={<ShareIcon color={REFERRAL} />}
        />
        <Tile
          label="Free weeks granted"
          value={freeWeeksLabel}
          sub={`${r.granted_days_total.toLocaleString()} premium days given`}
          color="var(--wo-green)"
          icon={<CalendarIcon color="var(--wo-green)" />}
        />
      </div>

      {/* Trend chart */}
      <div className="rounded-2xl border border-[var(--wo-border)] bg-white p-5 shadow-sm">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">Redemptions over time</h2>
            <p className="text-xs text-[var(--wo-muted)]">Daily, stacked by code type</p>
          </div>
          <div className="flex items-center gap-4 text-xs text-[var(--wo-muted)]">
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: COMP }} />Comp</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: REFERRAL }} />Referral</span>
          </div>
        </div>
        {days.length === 0 ? (
          <div className="flex h-56 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-[var(--wo-border)] text-center">
            <p className="text-sm font-medium">No redemptions in this window{selected ? ` for ${selected}` : ""}.</p>
            <p className="text-xs text-[var(--wo-muted)]">Fills in as users redeem comp or referral codes.</p>
          </div>
        ) : (
          <TrendChart days={days} max={chartMax} />
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* By code */}
        <div className="rounded-2xl border border-[var(--wo-border)] bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-base font-semibold">By code</h2>
          {byCode.length === 0 ? (
            <p className="text-sm text-[var(--wo-muted)]">No redemptions to break down yet.</p>
          ) : (
            <div className="space-y-3.5">
              {byCode.map((c) => {
                const color = kindColor(c.code_kind);
                return (
                  <div key={c.code}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2 truncate">
                        <span className="truncate font-medium">{c.code}</span>
                        <span
                          className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase"
                          style={{ color, background: tint(color, 12) }}
                        >
                          {kindLabel(c.code_kind)}
                        </span>
                      </span>
                      <span className="shrink-0 tabular-nums text-[var(--wo-muted)]">
                        {c.n} · {pct(c.n, total)}%
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-[var(--wo-bg)]">
                      <div className="h-2 rounded-full" style={{ width: `${(c.n / maxCode) * 100}%`, background: color }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Referral funnel */}
        <div className="rounded-2xl border border-[var(--wo-border)] bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold">Referral funnel</h2>
            <span className="text-xs text-[var(--wo-muted)]">whole program · {r.days} days</span>
          </div>
          <div className="space-y-3">
            <div>
              <div className="mb-1.5 flex items-baseline justify-between text-sm">
                <span className="font-medium">Sharers</span>
                <span className="font-semibold tabular-nums">{sharers}</span>
              </div>
              <div className="h-9 w-full overflow-hidden rounded-lg" style={{ background: tint(COMP, 10) }}>
                <div
                  className="h-9 rounded-lg"
                  style={{ width: sharers > 0 ? "100%" : "0%", background: `linear-gradient(90deg, ${tint(COMP, 85)}, ${COMP})` }}
                />
              </div>
              <div className="mt-1 text-xs text-[var(--wo-muted)]">users who reached Invite Friends</div>
            </div>

            <div className="flex items-center justify-center py-0.5 text-[var(--wo-muted)]">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M5 12l7 7 7-7" />
              </svg>
            </div>

            <div>
              <div className="mb-1.5 flex items-baseline justify-between text-sm">
                <span className="font-medium">Referral redemptions</span>
                <span className="font-semibold tabular-nums">{refRedeemed}</span>
              </div>
              <div className="h-9 w-full overflow-hidden rounded-lg" style={{ background: tint(REFERRAL, 10) }}>
                <div
                  className="h-9 rounded-lg"
                  style={{
                    width: sharers > 0 && refRedeemed > 0 ? `${Math.max(4, (refRedeemed / sharers) * 100)}%` : "0%",
                    background: `linear-gradient(90deg, ${tint(REFERRAL, 85)}, ${REFERRAL})`,
                  }}
                />
              </div>
              <div className="mt-1 text-xs text-[var(--wo-muted)]">redeemed a friend&apos;s code</div>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between rounded-xl border border-[var(--wo-border)] bg-[var(--wo-bg)] px-4 py-3">
            <span className="text-sm font-medium text-[var(--wo-muted)]">Conversion</span>
            <span className="text-2xl font-semibold tabular-nums" style={{ color: REFERRAL }}>
              {conversion == null ? "—" : `${conversion}%`}
            </span>
          </div>
        </div>
      </div>

      {/* Past the free weeks — free-trial → paid conversion (respects campaign filter) */}
      <div className="rounded-2xl border border-[var(--wo-border)] bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">Past the free weeks</h2>
            <p className="text-xs text-[var(--wo-muted)]">Free-code redeemers who became paying subscribers</p>
          </div>
          <span className="text-xs text-[var(--wo-muted)]">{selected ?? "all codes"} · {r.days} days</span>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* stage bars */}
          <div className="space-y-3">
            <div>
              <div className="mb-1.5 flex items-baseline justify-between text-sm">
                <span className="font-medium">Redeemed a free code</span>
                <span className="font-semibold tabular-nums">{redeemers}</span>
              </div>
              <div className="h-9 w-full overflow-hidden rounded-lg" style={{ background: tint(COMP, 10) }}>
                <div className="h-9 rounded-lg" style={{ width: redeemers > 0 ? "100%" : "0%", background: `linear-gradient(90deg, ${tint(COMP, 85)}, ${COMP})` }} />
              </div>
            </div>
            <div className="flex items-center justify-center py-0.5 text-[var(--wo-muted)]">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M5 12l7 7 7-7" />
              </svg>
            </div>
            <div>
              <div className="mb-1.5 flex items-baseline justify-between text-sm">
                <span className="font-medium">Now paying</span>
                <span className="font-semibold tabular-nums">{convertedPaid}</span>
              </div>
              <div className="h-9 w-full overflow-hidden rounded-lg" style={{ background: tint("var(--wo-green)", 10) }}>
                <div
                  className="h-9 rounded-lg"
                  style={{
                    width: redeemers > 0 && convertedPaid > 0 ? `${Math.max(4, (convertedPaid / redeemers) * 100)}%` : "0%",
                    background: `linear-gradient(90deg, ${tint("var(--wo-green)", 85)}, var(--wo-green))`,
                  }}
                />
              </div>
              <div className="mt-1 text-xs text-[var(--wo-muted)]">hold a paid App Store subscription</div>
            </div>
          </div>

          {/* conversion + ROI summary */}
          <div className="flex flex-col justify-center gap-3">
            <div className="flex items-center justify-between rounded-xl border border-[var(--wo-border)] bg-[var(--wo-bg)] px-4 py-3">
              <span className="text-sm font-medium text-[var(--wo-muted)]">Free → paid conversion</span>
              <span className="text-2xl font-semibold tabular-nums" style={{ color: "var(--wo-green)" }}>
                {paidConversion == null ? "—" : `${paidConversion}%`}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-[var(--wo-border)] px-4 py-3">
              <span className="text-sm font-medium text-[var(--wo-muted)]">Free weeks given{selected ? "" : " (all codes)"}</span>
              <span className="text-lg font-semibold tabular-nums">{freeWeeksLabel} wk</span>
            </div>
            <p className="text-xs text-[var(--wo-muted)]">
              The cost side of the trade: {freeWeeksLabel} free weeks handed out to lift installs. The value math —
              are the converts worth more than the give-away? — is in <strong>Program ROI</strong> below.
            </p>
          </div>
        </div>
      </div>

      {/* Program ROI — value returned (paying converts) vs value given away (free weeks) */}
      <div className="rounded-2xl border border-[var(--wo-border)] bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">Program ROI</h2>
            <p className="text-xs text-[var(--wo-muted)]">Value returned vs. value given away — comp + referral{selected ? ` · ${selected}` : ""}</p>
          </div>
          {hasRoiData ? (
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold"
              style={{ color: profitable ? GREEN : LOSS, background: tint(profitable ? GREEN : LOSS, 12) }}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: profitable ? GREEN : LOSS }} />
              {profitable ? "In the black" : "Underwater"}
            </span>
          ) : (
            <span className="rounded-full bg-[var(--wo-bg)] px-3 py-1 text-xs font-medium text-[var(--wo-muted)]">No data yet</span>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-[var(--wo-border)] p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--wo-muted)]">Revenue from converts</div>
            <div className="mt-2 text-2xl font-semibold tabular-nums" style={{ color: GREEN }}>{usd0(convertRevenue)}</div>
            <div className="mt-1 text-xs text-[var(--wo-muted)]">{convertedPaid} paying × {usd0(VALUE_PER_CONVERT_USD)}/yr</div>
          </div>
          <div className="rounded-xl border border-[var(--wo-border)] p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--wo-muted)]">Free weeks given (retail)</div>
            <div className="mt-2 text-2xl font-semibold tabular-nums">{usd0(giveawayValue)}</div>
            <div className="mt-1 text-xs text-[var(--wo-muted)]">{freeWeeksLabel} wk × {usd0(FREE_WEEK_VALUE_USD)}</div>
          </div>
          <div className="rounded-xl border p-4" style={{ borderColor: hasRoiData ? tint(profitable ? GREEN : LOSS, 45) : "var(--wo-border)" }}>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--wo-muted)]">Net</div>
            <div className="mt-2 text-2xl font-semibold tabular-nums" style={{ color: hasRoiData ? (profitable ? GREEN : LOSS) : "var(--wo-text)" }}>
              {netUsd < 0 ? `−${usd0(Math.abs(netUsd))}` : usd0(netUsd)}
            </div>
            <div className="mt-1 text-xs text-[var(--wo-muted)]">{roiRatio == null ? "return —" : `${roiRatio.toFixed(1)}× return on give-away`}</div>
          </div>
        </div>

        {/* break-even */}
        <div className="mt-4 rounded-xl bg-[var(--wo-bg)] px-4 py-3">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-[var(--wo-muted)]">Break-even</span>
            <span className="tabular-nums">
              needs <strong>{breakEvenConverts}</strong> convert{breakEvenConverts === 1 ? "" : "s"}
              {breakEvenPct == null ? "" : ` (${breakEvenPct}%)`} · at <strong>{convertedPaid}</strong>
              {paidConversion == null ? "" : ` (${paidConversion}%)`}
            </span>
          </div>
          <div className="relative mt-2 h-2 w-full rounded-full bg-white">
            <div
              className="h-2 rounded-full"
              style={{ width: `${Math.min(100, breakEvenConverts > 0 ? (convertedPaid / breakEvenConverts) * 100 : 0)}%`, background: profitable ? GREEN : LOSS }}
            />
            {/* break-even marker at 100% of the needed line */}
            <div className="absolute inset-y-0 right-0 w-px bg-[var(--wo-muted)]" />
          </div>
        </div>

        <p className="mt-3 text-xs text-[var(--wo-muted)]">
          Give-away is valued at retail (an opportunity cost, not cash out the door). Prices:{" "}
          {usd0(PREMIUM_MONTHLY_USD)}/mo · {usd0(PREMIUM_ANNUAL_USD)}/yr. For true cash ROI including ad spend, see the{" "}
          <code className="rounded bg-[var(--wo-bg)] px-1 py-0.5">Finance</code> tab.
        </p>
      </div>

      <p className="text-xs text-[var(--wo-muted)]">
        Data: <code className="rounded bg-[var(--wo-bg)] px-1 py-0.5">admin_redemptions()</code> over{" "}
        <code className="rounded bg-[var(--wo-bg)] px-1 py-0.5">usage_events</code> (+ <code className="rounded bg-[var(--wo-bg)] px-1 py-0.5">entitlements</code> for
        paid conversion). Redemption tiles, free weeks, the campaign filter and conversion cover both comp and referral
        codes; the referral funnel is referral-only and spans the whole program.
      </p>
    </div>
  );
}
