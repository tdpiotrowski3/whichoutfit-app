"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

const TABS = [
  { href: "/", label: "Overview" },
  { href: "/growth", label: "Growth" },
  { href: "/redemptions", label: "Redemptions" },
  { href: "/ai", label: "AI Consumption" },
  { href: "/appstore", label: "App Store" },
  { href: "/finance", label: "Finance" },
  { href: "/users", label: "Users" },
  { href: "/marketing", label: "Marketing" },
  { href: "/social", label: "Social & Ads" },
];

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  const brand = (
    <span
      className="text-lg font-bold"
      style={{ background: "linear-gradient(120deg, var(--wo-blue), var(--wo-teal))", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}
    >
      WhichOutfit
    </span>
  );

  return (
    <header className="sticky top-0 z-20 border-b border-[var(--wo-border)] bg-[var(--wo-bg)]/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-6">
          {brand}
          {/* Desktop: inline pill nav (hidden on small screens). */}
          <nav className="hidden gap-1 rounded-xl bg-[var(--wo-border)]/40 p-1 md:flex">
            {TABS.map((t) => {
              const active = pathname === t.href;
              return (
                <Link
                  key={t.href}
                  href={t.href}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    active ? "bg-white text-[var(--wo-blue)] shadow-sm" : "text-[var(--wo-muted)] hover:text-[var(--wo-text)]"
                  }`}
                >
                  {t.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Desktop sign-out. */}
        <button onClick={logout} className="hidden text-sm font-medium text-[var(--wo-muted)] hover:text-[var(--wo-text)] md:block">
          Sign out
        </button>

        {/* Mobile: hamburger toggle (≥44px tap target). */}
        <button
          type="button"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="-mr-2 inline-flex h-11 w-11 items-center justify-center rounded-lg text-[var(--wo-text)] hover:bg-[var(--wo-border)]/40 md:hidden"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            {open ? (
              <>
                <line x1="6" y1="6" x2="18" y2="18" />
                <line x1="18" y1="6" x2="6" y2="18" />
              </>
            ) : (
              <>
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </>
            )}
          </svg>
        </button>
      </div>

      {/* Mobile drawer: stacked links with large tap targets. */}
      {open && (
        <nav className="border-t border-[var(--wo-border)] bg-[var(--wo-bg)] px-2 py-2 md:hidden">
          {TABS.map((t) => {
            const active = pathname === t.href;
            return (
              <Link
                key={t.href}
                href={t.href}
                onClick={() => setOpen(false)}
                className={`block rounded-lg px-3 py-3 text-base font-medium transition-colors ${
                  active ? "bg-white text-[var(--wo-blue)] shadow-sm" : "text-[var(--wo-muted)] hover:text-[var(--wo-text)]"
                }`}
              >
                {t.label}
              </Link>
            );
          })}
          <button
            onClick={logout}
            className="mt-1 block w-full rounded-lg px-3 py-3 text-left text-base font-medium text-[var(--wo-muted)] hover:text-[var(--wo-text)]"
          >
            Sign out
          </button>
        </nav>
      )}
    </header>
  );
}
