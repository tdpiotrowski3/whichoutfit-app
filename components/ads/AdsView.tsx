"use client";

import Link from "next/link";
import { useState } from "react";
import { Card, Stat } from "@/components/ui";
import { TrendChart } from "@/components/charts/TrendChart";
import type { AdsMetrics, AdsOverview, AdsRow } from "@/lib/metaAds";

// The Ads page: Meta ad spend and results, live from the Marketing API.
// Props-driven so it can be previewed with fixtures; the route loads it.

const RANGES = [7, 30, 90];
const BLUE = "#2E6BFF";

type Metric = "spend" | "installs" | "linkClicks" | "impressions";
const METRICS: { key: Metric; label: string }[] = [
  { key: "spend", label: "Spend" },
  { key: "installs", label: "Installs" },
  { key: "linkClicks", label: "Link clicks" },
  { key: "impressions", label: "Impressions" },
];

const fmt = (n: number) => Math.round(n).toLocaleString();
const pct = (a: number, b: number) => (b > 0 ? `${((a / b) * 100).toFixed(2)}%` : "—");

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

function Setup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Ads</h1>
      <Card title={title}>
        <div className="space-y-3 text-sm text-[var(--wo-muted)]">{children}</div>
      </Card>
    </div>
  );
}

export function AdsView({ overview }: { overview: AdsOverview }) {
  const [metric, setMetric] = useState<Metric>("spend");

  if (overview.state === "no_token") {
    return (
      <Setup title="Meta isn't connected">
        <p>Set <span className="font-mono text-xs">META_ACCESS_TOKEN</span> first — see Connections on the <Link href="/social" className="text-[var(--wo-blue)] hover:underline">Social</Link> page.</p>
      </Setup>
    );
  }
  if (overview.state === "no_account") {
    return (
      <Setup title="No ad account linked yet">
        {overview.error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-[var(--wo-red,#e5484d)]">Meta says: {overview.error}</p> : null}
        <ol className="list-decimal space-y-2 pl-5">
          <li>Open <a className="text-[var(--wo-blue)] hover:underline" href="https://business.facebook.com/latest/settings/system_users" target="_blank" rel="noreferrer">Business settings → System users</a> → <b>whichoutfit-server</b> → ⋯ → <b>Assign assets</b>.</li>
          <li>Pick <b>Ad accounts</b>, tick your ad account and turn on <b>View performance</b> (add <b>Manage campaigns</b> if you want that later).</li>
          <li>If the token was generated without <span className="font-mono text-xs">ads_read</span>, generate a new one with it and save it the same way as before.</li>
        </ol>
        <p>Reload this page afterwards — the account is picked up automatically.</p>
      </Setup>
    );
  }

  const { account, days, daily, totals, prev, campaigns, ads, error } = overview;
  const money = (n: number, digits = 2) => n.toLocaleString("en-US", { style: "currency", currency: account.currency, maximumFractionDigits: digits, minimumFractionDigits: digits });
  const per = (spend: number, n: number) => (n > 0 ? money(spend / n) : "—");
  const actNum = account.id.replace(/^act_/, "");
  const managerUrl = `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${actNum}`;
  const active = campaigns.filter((c) => c.status === "Active").length;
  const nothingRan = totals.spend === 0 && totals.impressions === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Ads</h1>
          <p className="mt-1 text-sm text-[var(--wo-muted)]">
            {account.name} · {account.currency} · {active ? `${active} active campaign${active === 1 ? "" : "s"}` : "no active campaigns"}
            {account.status !== 1 ? <span className="ml-2 text-[var(--wo-red,#e5484d)]">· account status {account.status} — check Ads Manager</span> : null}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex overflow-hidden rounded-lg border border-[var(--wo-border)] text-sm">
            {RANGES.map((d) => (
              <Link key={d} href={`/ads?d=${d}`} className={`px-3 py-1.5 ${d === days ? "bg-[var(--wo-blue)] text-white" : "hover:bg-[var(--wo-bg)]"}`}>{d}d</Link>
            ))}
          </div>
          <a href={managerUrl} target="_blank" rel="noreferrer" className="rounded-lg border border-[var(--wo-border)] px-3 py-1.5 text-sm hover:bg-[var(--wo-bg)]">Open Ads Manager ↗</a>
        </div>
      </div>

      {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-[var(--wo-red,#e5484d)]">Some numbers didn&apos;t load — Meta says: {error}</p> : null}

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
            <a href={managerUrl} target="_blank" rel="noreferrer" className="text-[var(--wo-blue)] hover:underline">Ads Manager</a> and results show up here the next day.
          </p>
        </Card>
      ) : (
        <Card
          title="Day by day"
          right={
            <div className="flex flex-wrap gap-1 text-xs">
              {METRICS.map((m) => (
                <button key={m.key} onClick={() => setMetric(m.key)} className={`rounded-md px-2 py-1 ${metric === m.key ? "bg-[var(--wo-bg)] font-semibold" : "text-[var(--wo-muted)] hover:bg-[var(--wo-bg)]"}`}>{m.label}</button>
              ))}
            </div>
          }
        >
          <TrendChart
            days={daily.map((d) => d.day)}
            series={[{ key: metric, label: METRICS.find((m) => m.key === metric)!.label, color: BLUE, values: daily.map((d) => (metric === "spend" ? Math.round(d.spend * 100) / 100 : d[metric])) }]}
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
    </div>
  );
}

function Table({ rows, money, per }: { rows: AdsRow[]; money: (n: number) => string; per: (s: number, n: number) => string }) {
  const total = rows.reduce<AdsMetrics>((t, r) => ({
    spend: t.spend + r.spend, impressions: t.impressions + r.impressions, reach: 0,
    clicks: t.clicks + r.clicks, linkClicks: t.linkClicks + r.linkClicks, installs: t.installs + r.installs,
  }), { spend: 0, impressions: 0, reach: 0, clicks: 0, linkClicks: 0, installs: 0 });
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
