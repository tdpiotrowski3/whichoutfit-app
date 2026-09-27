# WhichOutfit

Your personal AI stylist. This repo is the **web codebase**: one consolidated
Next.js (App Router) app deployed to **Vercel**, serving three surfaces by
hostname. The native apps live in their own repos; everything shares one
Supabase backend.

## Platform status (September 2026)

| Platform | Status | Where |
|---|---|---|
| **iOS** | **Live — 2.0** (2026-09-15); 2.1 in TestFlight | [App Store](https://apps.apple.com/us/app/whichoutfit/id6778094125) |
| **Android** | **Live** (production since 2026-08-06); 2.1.0 build cut 2026-09-27 | [Google Play](https://play.google.com/store/apps/details?id=app.whichoutfit) |
| Web app | Built but **hidden** ("coming soon" page) | `app.whichoutfit.app` |

Both phone platforms are public. The system overview (architecture, security model, how to
build/test/ship) lives in the backend repo's `README.md` (`tdpiotrowski3/FitCheck`), with a
transfer checklist in `docs/TRANSFER-CHECKLIST.md`. Tests here: `npm test` (Vitest). The web app stays "coming soon", but
everything backend-side (Supabase schema, RLS, edge functions, auth) is built
cross-platform so it can ship later without rework.

## The three web surfaces (this repo)

One Vercel project, routed by hostname in `proxy.ts`:

| Host | Surface | Code |
|---|---|---|
| `whichoutfit.app` (+ www) | Marketing site, legal pages, referral/poll landing pages | static files in `public/` |
| `admin.whichoutfit.app` | Internal admin dashboard (overview, AI usage, users, App Store, social, finance, marketing email) | `app/(dash)/`, server-side only, service-role key |
| `app.whichoutfit.app` | Consumer webapp (closet, outfits, stylist, …) — **gated off** behind `CONSUMER_WEBAPP_ENABLED` (`lib/flags.ts`), renders `components/ComingSoon.tsx` until re-enabled | `app/(consumer)/`, browser-side, anon key + RLS |

Daily Vercel crons (`vercel.json`): App Store sync, social sync, Mercury sync.

## How it ties together

- **Supabase** (project `irfzsyzhoxxtzuugdtef`) is the single backend for iOS,
  Android, and web: Postgres (RLS-locked, rows scoped to `auth.uid()`), Auth
  (Google + email), Storage (`closet-images` bucket), and the `ai` edge
  function that logs to `usage_events`. Schema changes must stay
  platform-agnostic — no iOS-only shortcuts.
- **Admin dashboard** reads via the service-role key in Server Components /
  Route Handlers only (bypasses RLS; never shipped to the browser).
- **Consumer webapp** and the native apps talk to Supabase directly with the
  publishable/anon key and rely on RLS.
- **Payments**: Apple IAP (live), Google Play Billing (Android — wired and
  server-verified via the `play-verify` edge function; Play Console products
  must exist before the paywall can charge), Paddle (reserved for web).
- **Email**: Resend for marketing sends + ops alerts (admin dashboard).

See `SETUP.md` for local dev, environment variables, and deploy steps.
