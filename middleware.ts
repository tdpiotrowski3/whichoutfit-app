import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Hostname-based routing for the consolidated app:
//   whichoutfit.app (apex/www) → marketing site (static files in public/)
//   admin.whichoutfit.app      → admin dashboard (the App Router pages)
//   (future) app.whichoutfit.app → consumer webapp
//
// Defensive by design: anything that ISN'T the marketing host (admin domain,
// Vercel preview URLs, localhost) passes straight through, so the live
// dashboard behaves exactly as before. We only special-case the apex homepage,
// because "/" is otherwise owned by the dashboard's Overview page. All other
// marketing pages (/features.html, /privacy.html, …) and assets are served
// directly from public/ and need no rewrite.

const MARKETING_HOSTS = new Set(["whichoutfit.app", "www.whichoutfit.app"]);

export function middleware(req: NextRequest) {
  const host = (req.headers.get("host") ?? "").toLowerCase().split(":")[0];
  if (!MARKETING_HOSTS.has(host)) return NextResponse.next();

  if (req.nextUrl.pathname === "/") {
    const url = req.nextUrl.clone();
    url.pathname = "/index.html";
    return NextResponse.rewrite(url);
  }
  return NextResponse.next();
}

// Only run on the root path — the one place the marketing homepage and the
// dashboard Overview collide. Everything else is untouched.
export const config = { matcher: ["/"] };
