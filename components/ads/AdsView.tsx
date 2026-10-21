"use client";

import Link from "next/link";
import { useState } from "react";
import { Card, Stat } from "@/components/ui";
import { TrendChart } from "@/components/charts/TrendChart";
import { sumAds, type AdsMetrics, type AdsOverview, type AdsPlatform, type AdsRow } from "@/lib/ads";

// The Ads page: Meta and TikTok ad spend and results, live from each
// platform's API. "All" compares them; each platform tab has the detail.
// Props-driven so it can be previewed with fixtures; the route loads it.

export type AdsTab = "all" | AdsPlatform;

const RANGES = [7, 30, 90];
// Fixed per platform, same slots as the Social page (Meta/Instagram = 1, TikTok = 2).
const PLATFORM: Record<AdsPlatform, { label: string; color: string }> = {
  meta: { label: "Meta", color: "#2E6BFF" },
  tiktok: { label: "TikTok", color: "#eb6834" },
};
const TABS: { key: AdsTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "meta", label: "Meta" },
  { key: "tiktok", label: "TikTok" },
];

type Metric = "spend" | "installs" | "linkClicks" | "impressions";
const METRICS: { key: Metric; label: string }[] = [
  { key: "spend", label: "Spend" },
  { key: "installs", label: "Installs" },
  { key: "linkClicks", label: "Link clicks" },
  { key: "impressions", label: "Impressions" },
];

const fmt = (n: number) => Math.round(n).toLocaleString();
const pct = (a: number, b: number) => (b > 0 ? `${((a / b) * 100).toFixed(2)}%` : "—");
const moneyIn = (currency: string) => (n: number, digits = 2) =>
  n.toLocaleString("en-US", { style: "currency", currency, maximumFractionDigits: digits, minimumFractionDigits: digits });
const valueOf = (d: AdsMetrics, m: Metric) => (m === "spend" ? Math.round(d.spend * 100) / 100 : d[m]);

function delta(cur: number, prev: number): string | undefined {
  if (!prev) return undefined;
  const d = ((cur - prev) / prev) * 100;
  return `${d >= 0 ? "▲" : "▼"} ${Math.abs(d).toFixed(0)}% vs previous period`;
}

function StatusPill({ status }: { status: string }) {
  const tone =
    status === "Active" ? "bg-[var(--wo-green)]/10 text-[var(--wo-green)]" :
    status === "Rejected" || status === "Has issues" || status === "Needs billing" ? "bg-red-50 text-[var(--wo-red,#e5484d)]" :
    "bg-[var(--wo-bg)] text-[var(--wo-muted)]";
  return <span className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>{status}</span>;
}

function MetricToggle({ metric, setMetric }: { metric: Metric; setMetric: (m: Metric) => void }) {
  return (
    <div className="flex flex-wrap gap-1 text-xs">
      {METRICS.map((m) => (
        <button key={m.key} onClick={() => setMetric(m.key)} className={`rounded-md px-2 py-1 ${metric === m.key ? "bg-[var(--wo-bg)] font-semibold" : "text-[var(--wo-muted)] hover:bg-[var(--wo-bg)]"}`}>{m.label}</button>
      ))}
    </div>
  );
}

export function AdsView({ tab, days, meta, tiktok }: { tab: AdsTab; days: number; meta: AdsOverview; tiktok: AdsOverview }) {
  const href = (t: AdsTab, d: number) => `/ads?p=${t}&d=${d}`;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-3">
          <h1 className="text-xl font-semibold">Ads</h1>
          <div className="flex gap-1 rounded-xl bg-[var(--wo-bg)] p-1 text-sm">
            {TABS.map((t) => (
              <Link key={t.key} href={href(t.key, days)} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 ${t.key === tab ? "bg-white font-semibold shadow-sm" : "text-[var(--wo-muted)] hover:text-[var(--wo-text)]"}`}>
                {t.key !== "all" ? <span className="inline-block h-2 w-2 rounded-full" style={{ background: PLATFORM[t.key].color }} /> : null}
                {t.label}
              </Link>
            ))}
          </div>
        </div>
        <div className="flex overflow-hidden rounded-lg border border-[var(--wo-border)] text-sm">
          {RANGES.map((d) => (
            <Link key={d} href={href(tab, d)} className={`px-3 py-1.5 ${d === days ? "bg-[var(--wo-blue)] text-white" : "hover:bg-[var(--wo-bg)]"}`}>{d}d</Link>
          ))}
        </div>
      </div>

      {tab === "all" ? <Compare days={days} meta={meta} tiktok={tiktok} /> : <Platform platform={tab} overview={tab === "meta" ? meta : tiktok} />}
    </div>
  );
}

// ── All: Meta vs TikTok ─────────────────────────────────────────────────────

function Compare({ days, meta, tiktok }: { days: number; meta: AdsOverview; tiktok: AdsOverview }) {
  const [metric, setMetric] = useState<Metric>("spend");
  const sides = (["meta", "tiktok"] as const).map((p) => ({ p, o: p === "meta" ? meta : tiktok }));
  const live = sides.filter((s): s is { p: AdsPlatform; o: Extract<AdsOverview, { state: "ok" }> } => s.o.state === "ok");
  const currency = live[0]?.o.account.currency ?? "USD";
  const mixed = live.some((s) => s.o.account.currency !== currency);
  const money = moneyIn(currency);
  const per = (spend: number, n: number) => (n > 0 ? money(spend / n) : "—");
  const total = sumAds(live.map((s) => s.o.totals));
  const totalPrev = sumAds(live.map((s) => s.o.prev));
  const daysList = live[0]?.o.daily.map((d) => d.day) ?? [];

  return (
    <>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label={`Spend (${days}d)`} value={money(total.spend, 0)} sub={delta(total.spend, totalPrev.spend) ?? (live.length ? `${live.map((s) => `${PLATFORM[s.p].label} ${money(s.o.totals.spend, 0)}`).join(" · ")}` : "no platform connected")} accent="blue" />
        <Stat label="Installs" value={fmt(total.installs)} sub={total.installs ? `${per(total.spend, total.installs)} per install` : "from app-install ads"} accent="green" />
        <Stat label="Link clicks" value={fmt(total.linkClicks)} sub={total.linkClicks ? `${per(total.spend, total.linkClicks)} per click` : "—"} accent="teal" />
        <Stat label="Impressions" value={fmt(total.impressions)} sub={`${pct(total.clicks, total.impressions)} click rate`} />
      </div>
      {mixed ? <p className="text-xs text-[var(--wo-muted)]">The accounts bill in different currencies, so totals mix them — compare each platform on its own tab.</p> : null}

      <Card title="Meta vs TikTok">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-sm">
            <thead>
              <tr className="border-b border-[var(--wo-border)] text-left text-xs text-[var(--wo-muted)]">
                <th className="py-2 pr-4 font-medium">Platform</th>
                <th className="py-2 pr-4 text-right font-medium">Spend</th>
                <th className="py-2 pr-4 text-right font-medium">Installs</th>
                <th className="py-2 pr-4 text-right font-medium">Per install</th>
                <th className="py-2 pr-4 text-right font-medium">Link clicks</th>
                <th className="py-2 pr-4 text-right font-medium">Per click</th>
                <th className="py-2 pr-4 text-right font-medium">Impressions</th>
                <th className="py-2 text-right font-medium">CTR</th>
              </tr>
            </thead>
            <tbody>
              {sides.map(({ p, o }) => (
                <tr key={p} className="border-b border-[var(--wo-border)] last:border-0">
                  <td className="py-2.5 pr-4">
                    <Link href={`/ads?p=${p}&d=${days}`} className="inline-flex items-center gap-2 font-medium hover:underline">
                      <span className="inline-block h-2 w-2 rounded-full" style={{ background: PLATFORM[p].color }} />{PLATFORM[p].label}
                    </Link>
                    {o.state === "ok" ? <div className="text-xs text-[var(--wo-muted)]">{o.account.name}{o.account.active ? "" : ` · ${o.account.statusText ?? "inactive"}`}</div> : null}
                  </td>
                  {o.state === "ok" ? (
                    <>
                      <td className="py-2.5 pr-4 text-right">{money(o.totals.spend)}</td>
                      <td className="py-2.5 pr-4 text-right">{o.totals.installs ? fmt(o.totals.installs) : "—"}</td>
                      <td className="py-2.5 pr-4 text-right">{per(o.totals.spend, o.totals.installs)}</td>
                      <td className="py-2.5 pr-4 text-right">{o.totals.linkClicks ? fmt(o.totals.linkClicks) : "—"}</td>
                      <td className="py-2.5 pr-4 text-right">{per(o.totals.spend, o.totals.linkClicks)}</td>
                      <td className="py-2.5 pr-4 text-right">{fmt(o.totals.impressions)}</td>
                      <td className="py-2.5 text-right">{pct(o.totals.clicks, o.totals.impressions)}</td>
                    </>
                  ) : (
                    <td colSpan={7} className="py-2.5 text-right text-xs text-[var(--wo-muted)]">
                      Not connected — <Link href={`/ads?p=${p}&d=${days}`} className="text-[var(--wo-blue)] hover:underline">set up</Link>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {live.length && total.impressions > 0 ? (
        <Card title="Day by day" right={<MetricToggle metric={metric} setMetric={setMetric} />}>
          <TrendChart
            days={daysList}
            series={live.map((s) => ({ key: s.p, label: PLATFORM[s.p].label, color: PLATFORM[s.p].color, values: s.o.daily.map((d) => valueOf(d, metric)) }))}
          />
        </Card>
      ) : live.length ? (
        <Card title="No ads ran in this period">
          <p className="text-sm text-[var(--wo-muted)]">Connected, but nothing spent in the last {days} days. Results show up here the day after a campaign runs.</p>
        </Card>
      ) : null}
    </>
  );
}

// ── One platform ────────────────────────────────────────────────────────────

function Setup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card title={title}>
      <div className="space-y-3 text-sm text-[var(--wo-muted)]">{children}</div>
    </Card>
  );
}

function PlatformSetup({ platform, overview }: { platform: AdsPlatform; overview: Exclude<AdsOverview, { state: "ok" }> }) {
  const err = overview.state === "no_account" && overview.error
    ? <p className="rounded-lg bg-red-50 px-3 py-2 text-[var(--wo-red,#e5484d)]">{PLATFORM[platform].label} says: {overview.error}</p>
    : null;
  if (platform === "meta") {
    if (overview.state === "no_token") {
      return <Setup title="Meta isn't connected"><p>Set <span className="font-mono text-xs">META_ACCESS_TOKEN</span> first — see Connections on the <Link href="/social" className="text-[var(--wo-blue)] hover:underline">Social</Link> page.</p></Setup>;
    }
    return (
      <Setup title="No Meta ad account linked yet">
        {err}
        <ol className="list-decimal space-y-2 pl-5">
          <li>Open <a className="text-[var(--wo-blue)] hover:underline" href="https://business.facebook.com/latest/settings/ad_accounts" target="_blank" rel="noreferrer">Business settings → Ad accounts</a>, select the ad account → <b>Assign people</b>.</li>
          <li>Tick <b>whichoutfit-server</b> and turn on <b>View performance</b>.</li>
        </ol>
        <p>Reload this page afterwards — the account is picked up automatically.</p>
      </Setup>
    );
  }
  return (
    <Setup title={overview.state === "no_token" ? "TikTok ads aren't connected" : "No TikTok ad account linked yet"}>
      {err}
      <ol className="list-decimal space-y-2 pl-5">
        <li>In <a className="text-[var(--wo-blue)] hover:underline" href="https://business-api.tiktok.com/portal/apps" target="_blank" rel="noreferrer">TikTok API for Business → My apps</a>, the WhichOutfit app needs the <b>Ads Management</b> and <b>Reporting</b> scopes.</li>
        <li>Authorize the app for your TikTok ad account (advertiser) and copy the access token it shows.</li>
        <li>Set <span className="font-mono text-xs">TIKTOK_ADVERTISER_ID</span> and <span className="font-mono text-xs">TIKTOK_ADS_ACCESS_TOKEN</span> in Vercel, then redeploy.</li>
      </ol>
    </Setup>
  );
}

function Platform({ platform, overview }: { platform: AdsPlatform; overview: AdsOverview }) {
  const [metric, setMetric] = useState<Metric>("spend");
  if (overview.state !== "ok") return <PlatformSetup platform={platform} overview={overview} />;

  const { account, managerUrl, days, daily, totals, prev, campaigns, ads, error } = overview;
  const { label, color } = PLATFORM[platform];
  const money = moneyIn(account.currency);
  const per = (spend: number, n: number) => (n > 0 ? money(spend / n) : "—");
  const active = campaigns.filter((c) => c.status === "Active").length;
  const nothingRan = totals.spend === 0 && totals.impressions === 0;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--wo-muted)]">
          {account.name} · {account.currency} · {active ? `${active} active campaign${active === 1 ? "" : "s"}` : "no active campaigns"}
          {!account.active ? <span className="ml-2 text-[var(--wo-red,#e5484d)]">· {account.statusText ?? "inactive"} — check {label} Ads Manager</span> : null}
        </p>
        <a href={managerUrl} target="_blank" rel="noreferrer" className="rounded-lg border border-[var(--wo-border)] px-3 py-1.5 text-sm hover:bg-[var(--wo-bg)]">Open {label} Ads Manager ↗</a>
      </div>

      {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-[var(--wo-red,#e5484d)]">Some numbers didn&apos;t load — {label} says: {error}</p> : null}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label={`Spend (${days}d)`} value={money(totals.spend, 0)} sub={delta(totals.spend, prev.spend) ?? `${money(totals.spend / days)}/day avg`} accent="blue" />
        <Stat label="Installs" value={fmt(totals.installs)} sub={totals.installs ? `${per(totals.spend, totals.installs)} per install` : delta(totals.installs, prev.installs) ?? "from app-install ads"} accent="green" />
        <Stat label="Link clicks" value={fmt(totals.linkClicks)} sub={totals.linkClicks ? `${per(totals.spend, totals.linkClicks)} per click` : "—"} accent="teal" />
        <Stat label="Impressions" value={fmt(totals.impressions)} sub={`${pct(totals.clicks, totals.impressions)} click rate`} />
      </div>

      {nothingRan ? (
        <Card title="No ads ran in this period">
          <p className="text-sm text-[var(--wo-muted)]">
            The account is connected and readable; there&apos;s just no spend in the last {days} days. Start or resume a campaign in{" "}
            <a href={managerUrl} target="_blank" rel="noreferrer" className="text-[var(--wo-blue)] hover:underline">{label} Ads Manager</a> and results show up here the next day.
          </p>
        </Card>
      ) : (
        <Card title="Day by day" right={<MetricToggle metric={metric} setMetric={setMetric} />}>
          <TrendChart
            days={daily.map((d) => d.day)}
            series={[{ key: metric, label: METRICS.find((m) => m.key === metric)!.label, color, values: daily.map((d) => valueOf(d, metric)) }]}
          />
        </Card>
      )}

      <Card title="Campaigns">
        {campaigns.length ? <Table rows={campaigns} money={money} per={per} /> : <p className="text-sm text-[var(--wo-muted)]">No campaigns in this account yet.</p>}
      </Card>

      {ads.length ? (
        <Card title="Ads">
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {ads.map((a) => (
              <li key={a.id} className="flex gap-3 rounded-xl border border-[var(--wo-border)] p-3">
                {a.thumbnail ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.thumbnail} alt="" className="h-16 w-16 shrink-0 rounded-lg bg-[var(--wo-bg)] object-cover" />
                ) : <div className="h-16 w-16 shrink-0 rounded-lg bg-[var(--wo-bg)]" />}
                <div className="min-w-0 flex-1 space-y-1 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <span className="truncate font-medium" title={a.name}>{a.name}</span>
                    <StatusPill status={a.status} />
                  </div>
                  <div className="truncate text-xs text-[var(--wo-muted)]">{a.detail}</div>
                  <div className="text-xs">{money(a.spend)} · {fmt(a.clicks)} clicks · {pct(a.clicks, a.impressions)} CTR{a.installs ? ` · ${fmt(a.installs)} installs` : ""}</div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </>
  );
}

function Table({ rows, money, per }: { rows: AdsRow[]; money: (n: number) => string; per: (s: number, n: number) => string }) {
  const total = sumAds(rows);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-[var(--wo-border)] text-left text-xs text-[var(--wo-muted)]">
            <th className="py-2 pr-4 font-medium">Campaign</th>
            <th className="py-2 pr-4 text-right font-medium">Spend</th>
            <th className="py-2 pr-4 text-right font-medium">Impressions</th>
            <th className="py-2 pr-4 text-right font-medium">CTR</th>
            <th className="py-2 pr-4 text-right font-medium">Installs</th>
            <th className="py-2 text-right font-medium">Per install</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-[var(--wo-border)] last:border-0">
              <td className="py-2 pr-4">
                <div className="flex items-center gap-2"><span className="font-medium">{r.name}</span><StatusPill status={r.status} /></div>
                {r.detail ? <div className="text-xs text-[var(--wo-muted)]">{r.detail}</div> : null}
              </td>
              <td className="py-2 pr-4 text-right">{money(r.spend)}</td>
              <td className="py-2 pr-4 text-right">{fmt(r.impressions)}</td>
              <td className="py-2 pr-4 text-right">{pct(r.clicks, r.impressions)}</td>
              <td className="py-2 pr-4 text-right">{r.installs ? fmt(r.installs) : "—"}</td>
              <td className="py-2 text-right">{per(r.spend, r.installs)}</td>
            </tr>
          ))}
        </tbody>
        {rows.length > 1 ? (
          <tfoot>
            <tr className="text-xs font-semibold">
              <td className="pt-2 pr-4">Total</td>
              <td className="pt-2 pr-4 text-right">{money(total.spend)}</td>
              <td className="pt-2 pr-4 text-right">{fmt(total.impressions)}</td>
              <td className="pt-2 pr-4 text-right">{pct(total.clicks, total.impressions)}</td>
              <td className="pt-2 pr-4 text-right">{total.installs ? fmt(total.installs) : "—"}</td>
              <td className="pt-2 text-right">{per(total.spend, total.installs)}</td>
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}
