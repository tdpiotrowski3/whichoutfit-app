"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

// The dashboard's navigation: a grouped sidebar on desktop, a top bar with a
// slide-in drawer on phones. Twelve pages no longer fit in one row of tabs, so
// they are grouped by the job they help with. The dashboard runs more than one
// company: a switcher under the logo flips between WhichOutfit's pages and
// Comeback Health's (everything under /comeback).

type Item = { href: string; label: string; icon: keyof typeof ICONS };
type Company = "whichoutfit" | "comeback";

const companyOf = (pathname: string): Company => (pathname === "/comeback" || pathname.startsWith("/comeback/") ? "comeback" : "whichoutfit");

// Comeback mirrors WhichOutfit's layout, reading Comeback's own Supabase (lib/comeback/data.ts).
const COMEBACK_GROUPS: { label: string | null; items: Item[] }[] = [
  { label: null, items: [{ href: "/comeback", label: "Overview", icon: "home" }] },
  {
    label: "Growth",
    items: [
      { href: "/comeback/growth", label: "Growth", icon: "trend" },
      { href: "/comeback/users", label: "Users", icon: "users" },
      { href: "/comeback/usage", label: "Usage", icon: "spark" },
    ],
  },
  { label: "Marketing", items: [{ href: "/comeback/runway", label: "Launch runway", icon: "calendar" }] },
  { label: "Business", items: [{ href: "/comeback/ai", label: "AI Usage", icon: "chip" }] },
];

const GROUPS: { label: string | null; items: Item[] }[] = [
  { label: null, items: [{ href: "/", label: "Overview", icon: "home" }] },
  {
    label: "Growth",
    items: [
      { href: "/growth", label: "Growth", icon: "trend" },
      { href: "/users", label: "Users", icon: "users" },
      { href: "/attribution", label: "Attribution", icon: "link" },
      { href: "/redemptions", label: "Redemptions", icon: "ticket" },
    ],
  },
  {
    label: "Marketing",
    items: [
      { href: "/content", label: "Studio", icon: "spark" },
      { href: "/social", label: "Social", icon: "calendar" },
      { href: "/ads", label: "Ads", icon: "megaphone" },
      { href: "/marketing", label: "Email & nudges", icon: "mail" },
    ],
  },
  {
    label: "Business",
    items: [
      { href: "/appstore", label: "App Store", icon: "store" },
      { href: "/finance", label: "Finance", icon: "wallet" },
      { href: "/ai", label: "AI Usage", icon: "chip" },
    ],
  },
];

// 24px stroke icons (lucide-style paths), drawn inline so there is no icon dependency.
const ICONS = {
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z",
  trend: "M3 17l6-6 4 4 8-8M15 7h6v6",
  users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  link: "M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5",
  ticket: "M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4zM13 5v2M13 17v2M13 11v2",
  spark: "M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z",
  calendar: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2",
  megaphone: "M3 11v2a1 1 0 0 0 1 1h3l5 4V6L7 10H4a1 1 0 0 0-1 1M16 8a5 5 0 0 1 0 8M19 5a9 9 0 0 1 0 14",
  mail: "M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2M22 6l-10 7L2 6",
  store: "M3 9l1.5-5h15L21 9M3 9v11h18V9M3 9h18M9 20v-6h6v6",
  wallet: "M20 7H5a2 2 0 0 1 0-4h13v4M3 5v14a2 2 0 0 0 2 2h15V7M16 14h.01",
  chip: "M9 3v2M15 3v2M9 19v2M15 19v2M3 9h2M3 15h2M19 9h2M19 15h2M7 5h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2M9 9h6v6H9z",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
} as const;

function Icon({ name, className = "" }: { name: keyof typeof ICONS; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d={ICONS[name]} />
    </svg>
  );
}

// Section roots ("/" and "/comeback") only light up on their own page, not on every page beneath them.
const isActive = (pathname: string, href: string) => (href === "/" || href === "/comeback" ? pathname === href : pathname === href || pathname.startsWith(href + "/"));

function Brand({ company }: { company: Company }) {
  const comeback = company === "comeback";
  return (
    <Link href={comeback ? "/comeback" : "/"} className="flex items-center gap-2.5">
      <span
        className="flex h-8 w-8 items-center justify-center rounded-lg text-white"
        style={{ background: comeback ? "linear-gradient(135deg, #0f766e, #22c55e)" : "linear-gradient(135deg, var(--wo-blue), var(--wo-teal))" }}
      >
        {comeback ? (
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 17l5-5 4 4 9-9M15 7h6v6" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 6a2 2 0 1 1 2 2c-1 0-2 .7-2 1.7V10l8.5 6.3c.8.6.4 1.7-.6 1.7H4.1c-1 0-1.4-1.1-.6-1.7L12 10" />
          </svg>
        )}
      </span>
      <span className="leading-tight">
        <span className="block text-[15px] font-semibold">{comeback ? "Comeback Health" : "WhichOutfit"}</span>
        <span className="block text-[11px] text-[var(--wo-muted)]">Admin</span>
      </span>
    </Link>
  );
}

function CompanySwitch({ company, onNavigate }: { company: Company; onNavigate?: () => void }) {
  const tab = (c: Company, href: string, label: string) => (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={company === c ? "page" : undefined}
      className={`flex-1 rounded-md px-2 py-1.5 text-center text-xs font-medium transition-colors ${
        company === c ? "bg-white text-[var(--wo-text)] shadow-sm" : "text-[var(--wo-muted)] hover:text-[var(--wo-text)]"
      }`}
    >
      {label}
    </Link>
  );
  return (
    <div className="flex gap-1 rounded-lg bg-[var(--wo-bg)] p-1" role="tablist" aria-label="Company">
      {tab("whichoutfit", "/", "WhichOutfit")}
      {tab("comeback", "/comeback", "Comeback")}
    </div>
  );
}

function Links({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  const groups = companyOf(pathname) === "comeback" ? COMEBACK_GROUPS : GROUPS;
  return (
    <div className="space-y-5">
      {groups.map((g, gi) => (
        <div key={gi}>
          {g.label ? <div className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-[var(--wo-muted)]/80">{g.label}</div> : null}
          <ul className="space-y-0.5">
            {g.items.map((t) => {
              const active = isActive(pathname, t.href);
              return (
                <li key={t.href}>
                  <Link
                    href={t.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={`group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      active
                        ? "bg-[var(--wo-blue)]/[0.08] text-[var(--wo-blue)]"
                        : "text-[var(--wo-muted)] hover:bg-[var(--wo-bg)] hover:text-[var(--wo-text)]"
                    }`}
                  >
                    {active ? <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-r bg-[var(--wo-blue)]" /> : null}
                    <Icon name={t.icon} className={active ? "" : "opacity-70 group-hover:opacity-100"} />
                    {t.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const company = companyOf(pathname);

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  const signOut = (
    <button onClick={logout} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-[var(--wo-muted)] hover:bg-[var(--wo-bg)] hover:text-[var(--wo-text)]">
      <Icon name="logout" className="opacity-70" />
      Sign out
    </button>
  );

  return (
    <>
      {/* Desktop: fixed sidebar. */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-[var(--wo-border)] bg-white md:flex">
        <div className="space-y-3 px-5 py-5"><Brand company={company} /><CompanySwitch company={company} /></div>
        <nav className="flex-1 overflow-y-auto px-3 pb-4" aria-label="Dashboard">
          <Links pathname={pathname} />
        </nav>
        <div className="border-t border-[var(--wo-border)] p-3">{signOut}</div>
      </aside>

      {/* Phone: top bar + drawer. */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-[var(--wo-border)] bg-white/90 px-4 py-2.5 backdrop-blur md:hidden">
        <Brand company={company} />
        <button
          type="button"
          aria-label="Open menu"
          aria-expanded={open}
          onClick={() => setOpen(true)}
          className="-mr-2 inline-flex h-11 w-11 items-center justify-center rounded-lg hover:bg-[var(--wo-bg)]"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M3 6h18M3 12h18M3 18h18" />
          </svg>
        </button>
      </header>
      {open ? (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-white shadow-xl">
            <div className="flex items-center justify-between px-5 py-4">
              <Brand company={company} />
              <button type="button" aria-label="Close menu" onClick={() => setOpen(false)} className="-mr-2 inline-flex h-11 w-11 items-center justify-center rounded-lg hover:bg-[var(--wo-bg)]">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </div>
            <div className="px-5 pb-3"><CompanySwitch company={company} onNavigate={() => setOpen(false)} /></div>
            <nav className="flex-1 overflow-y-auto px-3 pb-4" aria-label="Dashboard">
              <Links pathname={pathname} onNavigate={() => setOpen(false)} />
            </nav>
            <div className="border-t border-[var(--wo-border)] p-3">{signOut}</div>
          </div>
        </div>
      ) : null}
    </>
  );
}
