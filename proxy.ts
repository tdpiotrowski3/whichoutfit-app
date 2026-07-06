import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Hostname-based routing for the consolidated app (Next 16 renamed the
// deprecated middleware.ts convention to proxy.ts — same behavior):
//   whichoutfit.app (apex/www) → marketing site (static files in public/)
//   admin.whichoutfit.app      → admin dashboard (the App Router pages)
//   app.whichoutfit.app        → consumer webapp (currently gated behind
//                                CONSUMER_WEBAPP_ENABLED — see lib/flags.ts —
//                                so it renders a "coming soon" page)
//
// Defensive by design: anything that ISN'T the marketing host (admin domain,
// Vercel preview URLs, localhost) passes straight through, so the live
// dashboard behaves exactly as before. We only special-case the apex homepage,
// because "/" is otherwise owned by the dashboard's Overview page. All other
// marketing pages (/features.html, /privacy.html, …) and assets are served
// directly from public/ and need no rewrite.

const MARKETING_HOSTS = new Set(["whichoutfit.app", "www.whichoutfit.app"]);
const CONSUMER_HOSTS = new Set(["app.whichoutfit.app"]);

export function proxy(req: NextRequest) {
  const host = (req.headers.get("host") ?? "").toLowerCase().split(":")[0];
  if (req.nextUrl.pathname !== "/") return NextResponse.next();

  // Each surface owns "/" on its own host; the dashboard keeps "/" everywhere else.
  if (MARKETING_HOSTS.has(host)) {
    const url = req.nextUrl.clone();
    url.pathname = "/index.html";
    return NextResponse.rewrite(url);
  }
  if (CONSUMER_HOSTS.has(host)) {
    // The (consumer) layout decides what /closet shows: the real webapp when
    // CONSUMER_WEBAPP_ENABLED is on, the ComingSoon page otherwise.
    const url = req.nextUrl.clone();
    url.pathname = "/closet";
    return NextResponse.rewrite(url);
  }
  return NextResponse.next();
}

// Only run on the root path — the one place the marketing homepage and the
// dashboard Overview collide. Everything else is untouched.
export const config = { matcher: ["/"] };
