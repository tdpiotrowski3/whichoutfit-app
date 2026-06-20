"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const TABS = [
  { href: "/", label: "Overview" },
  { href: "/ai", label: "AI Consumption" },
  { href: "/users", label: "Users" },
];

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-10 border-b border-[var(--wo-border)] bg-[var(--wo-bg)]/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <div className="flex items-center gap-6">
          <span
            className="text-lg font-bold"
            style={{ background: "linear-gradient(120deg, var(--wo-blue), var(--wo-teal))", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}
          >
            WhichOutfit
          </span>
          <nav className="flex gap-1 rounded-xl bg-[var(--wo-border)]/40 p-1">
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
        <button onClick={logout} className="text-sm font-medium text-[var(--wo-muted)] hover:text-[var(--wo-text)]">
          Sign out
        </button>
      </div>
    </header>
  );
}
