import Link from "next/link";

export function Stat({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: "blue" | "teal" | "green" | "muted";
}) {
  const color =
    accent === "blue" ? "var(--wo-blue)" :
    accent === "teal" ? "var(--wo-teal)" :
    accent === "green" ? "var(--wo-green)" : "var(--wo-text)";
  return (
    <div className="rounded-2xl bg-white border border-[var(--wo-border)] p-5 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-[var(--wo-muted)]">{label}</div>
      <div className="mt-2 text-3xl font-semibold" style={{ color }}>{value}</div>
      {sub ? <div className="mt-1 text-sm text-[var(--wo-muted)]">{sub}</div> : null}
    </div>
  );
}

export function Card({ title, children, right }: { title?: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white border border-[var(--wo-border)] p-5 shadow-sm">
      {(title || right) && (
        <div className="mb-4 flex items-center justify-between">
          {title ? <h2 className="text-base font-semibold">{title}</h2> : <span />}
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

export function Bar({ value, max, color = "var(--wo-blue)" }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="h-2 w-full rounded-full bg-[var(--wo-bg)]">
      <div className="h-2 rounded-full" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

export function NavLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
        active ? "bg-white text-[var(--wo-blue)] shadow-sm" : "text-[var(--wo-muted)] hover:text-[var(--wo-text)]"
      }`}
    >
      {label}
    </Link>
  );
}
