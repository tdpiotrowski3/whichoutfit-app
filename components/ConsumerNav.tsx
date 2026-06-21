"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { consumerClient } from "@/lib/consumer";

// Top nav for the consumer webapp (app.whichoutfit.app). Mirrors the iOS tab
// destinations that have synced cloud data: Closet, Outfits, Profile. (Planner
// and Trips are local-only on iOS, so there's nothing to show on the web yet.)
const LINKS = [
  { href: "/closet", label: "Closet" },
  { href: "/outfits", label: "Outfits" },
  { href: "/profile", label: "Profile" },
];

export function ConsumerNav() {
  const pathname = usePathname();
  const router = useRouter();

  // The sign-in screen has no nav.
  if (pathname?.startsWith("/signin")) return null;

  async function signOut() {
    await consumerClient()?.auth.signOut();
    router.replace("/signin");
  }

  return (
    <nav
      style={{
        borderBottom: "1px solid var(--wo-separator, #e3e8ef)",
        background: "var(--wo-surface, #ffffff)",
        position: "sticky",
        top: 0,
        zIndex: 10,
      }}
    >
      <div
        style={{
          maxWidth: 960,
          margin: "0 auto",
          padding: "0 24px",
          height: 56,
          display: "flex",
          alignItems: "center",
          gap: 20,
        }}
      >
        <Link
          href="/closet"
          style={{ fontWeight: 800, fontSize: 16, color: "var(--wo-text, #10141b)", textDecoration: "none", marginRight: 8 }}
        >
          WhichOutfit
        </Link>

        {LINKS.map((link) => {
          const active = pathname === link.href || pathname?.startsWith(link.href + "/");
          return (
            <Link
              key={link.href}
              href={link.href}
              style={{
                fontSize: 14,
                fontWeight: active ? 700 : 500,
                color: active ? "var(--wo-brand, #2f6df6)" : "var(--wo-text-secondary, #5c6b7a)",
                textDecoration: "none",
              }}
            >
              {link.label}
            </Link>
          );
        })}

        <button
          onClick={signOut}
          style={{
            marginLeft: "auto",
            background: "none",
            border: "none",
            color: "var(--wo-text-secondary, #5c6b7a)",
            cursor: "pointer",
            fontSize: 14,
          }}
        >
          Sign out
        </button>
      </div>
    </nav>
  );
}
