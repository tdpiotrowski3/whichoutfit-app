"use client";

import { useEffect, useRef, useState } from "react";

// A small line chart for daily metrics: one y-axis, 2px lines, a crosshair +
// tooltip on hover, a legend and end labels when there are two series, and a
// table view so nothing is color-only. Series colors are fixed per entity
// (Instagram = slot 1, TikTok = slot 2; validated with the dataviz checker).

export type TrendSeries = { key: string; label: string; color: string; values: (number | null)[] };

const H = 220;
const PAD = { top: 16, right: 76, bottom: 28, left: 44 };

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return ([1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((s) => n <= s) ?? 10) * p;
}

function short(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(Math.round(n));
}

function dayLabel(d: string): string {
  return new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function TrendChart({ days, series, empty }: { days: string[]; series: TrendSeries[]; empty?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(600);
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.floor(e.contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  const all = series.flatMap((s) => s.values.filter((v): v is number => v != null));
  if (!days.length || !all.length) {
    return <div className="flex h-[220px] items-center justify-center text-sm text-[var(--wo-muted)]">{empty ?? "No data yet."}</div>;
  }

  const max = niceMax(Math.max(...all));
  const iw = w - PAD.left - PAD.right;
  const ih = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (days.length === 1 ? iw / 2 : (i / (days.length - 1)) * iw);
  const y = (v: number) => PAD.top + ih - (v / max) * ih;
  const ticks = [0, max / 2, max];
  const xEvery = Math.max(1, Math.ceil(days.length / Math.max(2, Math.floor(iw / 70))));

  const path = (vals: (number | null)[]) => {
    let d = "";
    let pen = false;
    vals.forEach((v, i) => {
      if (v == null) { pen = false; return; }
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };

  function onMove(e: React.PointerEvent<SVGRectElement>) {
    const r = (e.currentTarget as SVGRectElement).getBoundingClientRect();
    const px = e.clientX - r.left;
    const i = days.length === 1 ? 0 : Math.round((px / r.width) * (days.length - 1));
    setHover(Math.max(0, Math.min(days.length - 1, i)));
  }

  const lastIdx = (vals: (number | null)[]) => {
    for (let i = vals.length - 1; i >= 0; i--) if (vals[i] != null) return i;
    return -1;
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        {series.length > 1 ? (
          <div className="flex flex-wrap gap-4 text-xs text-[var(--wo-muted)]">
            {series.map((s) => (
              <span key={s.key} className="inline-flex items-center gap-1.5">
                <span className="inline-block h-0.5 w-4 rounded" style={{ background: s.color }} />
                {s.label}
              </span>
            ))}
          </div>
        ) : <span />}
        <button onClick={() => setTable(!table)} className="text-xs text-[var(--wo-blue)] hover:underline">
          {table ? "Chart" : "Table"}
        </button>
      </div>

      {table ? (
        <div className="max-h-[220px] overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--wo-border)] text-left text-xs text-[var(--wo-muted)]">
                <th className="py-1.5 pr-4 font-medium">Day</th>
                {series.map((s) => <th key={s.key} className="py-1.5 pr-4 text-right font-medium">{s.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {days.map((d, i) => (
                <tr key={d} className="border-b border-[var(--wo-border)] last:border-0">
                  <td className="py-1.5 pr-4 text-[var(--wo-muted)]">{dayLabel(d)}</td>
                  {series.map((s) => <td key={s.key} className="py-1.5 pr-4 text-right">{s.values[i] == null ? "—" : s.values[i]!.toLocaleString()}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={ref} className="relative">
          <svg width={w} height={H} role="img" aria-label={series.map((s) => s.label).join(" and ") + " per day"}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={PAD.left} x2={PAD.left + iw} y1={y(t)} y2={y(t)} stroke="var(--wo-border)" strokeWidth={1} />
                <text x={PAD.left - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize={11} fill="var(--wo-muted)">{short(t)}</text>
              </g>
            ))}
            {days.map((d, i) => (i % xEvery === 0 || i === days.length - 1) && (i === days.length - 1 || days.length - 1 - i >= xEvery / 2) ? (
              <text key={d} x={x(i)} y={H - 8} textAnchor="middle" fontSize={11} fill="var(--wo-muted)">{dayLabel(d)}</text>
            ) : null)}
            {hover != null ? <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + ih} stroke="var(--wo-muted)" strokeWidth={1} strokeDasharray="3 3" /> : null}
            {series.map((s) => (
              <path key={s.key} d={path(s.values)} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            ))}
            {series.map((s) => {
              const i = lastIdx(s.values);
              if (i < 0) return null;
              return (
                <g key={s.key}>
                  <circle cx={x(i)} cy={y(s.values[i]!)} r={4} fill={s.color} stroke="var(--wo-surface)" strokeWidth={2} />
                  {series.length > 1 ? (
                    <text x={x(i) + 8} y={y(s.values[i]!)} dominantBaseline="middle" fontSize={11} fill="var(--wo-text)">{s.label}</text>
                  ) : null}
                </g>
              );
            })}
            {hover != null ? series.map((s) => s.values[hover] != null ? (
              <circle key={s.key} cx={x(hover)} cy={y(s.values[hover]!)} r={4.5} fill={s.color} stroke="var(--wo-surface)" strokeWidth={2} />
            ) : null) : null}
            <rect x={PAD.left} y={PAD.top} width={iw} height={ih} fill="transparent" onPointerMove={onMove} onPointerLeave={() => setHover(null)} />
          </svg>
          {hover != null ? (
            <div
              className="pointer-events-none absolute z-10 rounded-lg border border-[var(--wo-border)] bg-white px-3 py-2 text-xs shadow-md"
              style={{ left: Math.min(x(hover) + 12, w - 150), top: PAD.top }}
            >
              <div className="mb-1 font-medium">{dayLabel(days[hover])}</div>
              {series.map((s) => (
                <div key={s.key} className="flex items-center justify-between gap-4">
                  <span className="inline-flex items-center gap-1.5 text-[var(--wo-muted)]">
                    <span className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />{s.label}
                  </span>
                  <span>{s.values[hover] == null ? "—" : s.values[hover]!.toLocaleString()}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

/** Ranked horizontal bars (top videos, clicks by campaign) with a hover readout. */
export function BarList({ rows, color = "#2E6BFF", unit, empty }: { rows: { label: string; value: number; sub?: string }[]; color?: string; unit: string; empty?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  if (!rows.length) return <p className="text-sm text-[var(--wo-muted)]">{empty ?? "No data yet."}</p>;
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="space-y-2.5">
      {rows.map((r, i) => (
        <li key={r.label} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)} className="space-y-1">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate">{r.label}</span>
            <span className="shrink-0 text-[var(--wo-muted)]">
              {r.value.toLocaleString()} {unit}
              {hover === i && r.sub ? <span className="ml-2">· {r.sub}</span> : null}
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-[var(--wo-bg)]">
            <div className="h-2 rounded-full" style={{ width: `${Math.max(2, (r.value / max) * 100)}%`, background: color, opacity: hover == null || hover === i ? 1 : 0.55 }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
