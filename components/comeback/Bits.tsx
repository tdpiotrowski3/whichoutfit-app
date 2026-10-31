import Link from "next/link";
import { Card, Bar } from "@/components/ui";

// Small pieces shared by the Comeback admin pages.

/** Shown when a page's data fails to load: setup help if the Comeback env vars are missing, else the real error. */
export function NotConfigured({ what, error }: { what: string; error?: unknown }) {
  const msg = error instanceof Error ? error.message : error ? String(error) : "";
  if (msg && !msg.startsWith("Missing COMEBACK_")) {
    console.error("comeback admin: couldn't load " + what, error);
    return (
      <Card title={"Couldn't load " + what}>
        <p className="text-sm text-[var(--wo-muted)]">Comeback&apos;s Supabase answered with an error. Reload in a moment; if it keeps happening, this is the message:</p>
        <p className="mt-2 font-mono text-xs">{msg}</p>
      </Card>
    );
  }
  return (
    <Card title="Not configured">
      <p className="text-sm text-[var(--wo-muted)]">
        Set <code>COMEBACK_SUPABASE_URL</code> and <code>COMEBACK_SUPABASE_SERVICE_ROLE_KEY</code> (Comeback Health&apos;s own Supabase
        project, not WhichOutfit&apos;s) to load {what}.
      </p>
    </Card>
  );
}

/** 7 / 30 / 90-day switch, as links so pages stay server-rendered. */
export function Period({ path, days }: { path: string; days: number }) {
  return (
    <div className="flex gap-1 rounded-full bg-[var(--wo-bg)] p-1 text-xs">
      {[7, 30, 90].map((d) => (
        <Link key={d} href={`${path}?days=${d}`} className={`rounded-full px-3 py-1 ${d === days ? "bg-white font-semibold shadow-sm" : "text-[var(--wo-muted)]"}`}>
          {d} days
        </Link>
      ))}
    </div>
  );
}

export function Bars({ rows, color = "var(--wo-blue)", empty }: { rows: { label: string; value: number; note?: string }[]; color?: string; empty: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="text-sm text-[var(--wo-muted)]">{empty}</p>;
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-3 text-sm">
          <span className="w-44 shrink-0 truncate text-[var(--wo-muted)]" title={r.label}>{r.label}</span>
          <div className="flex-1"><Bar value={r.value} max={max} color={color} /></div>
          <span className="w-24 shrink-0 text-right tabular-nums">{r.value}{r.note ? <span className="text-[var(--wo-muted)]"> {r.note}</span> : null}</span>
        </div>
      ))}
    </div>
  );
}

export const daysParam = (v: string | string[] | undefined) => { const n = Number(Array.isArray(v) ? v[0] : v); return [7, 30, 90].includes(n) ? n : 30; };
