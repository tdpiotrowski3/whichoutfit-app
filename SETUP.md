# WhichOutfit — Web app setup

One Next.js (App Router) app on Vercel serving the marketing site, the admin
dashboard, and the (currently hidden) consumer webapp — see `README.md` for the
architecture and platform status. The admin dashboard reads live from the
WhichOutfit Supabase project, server-side only.

## What it shows
- **Overview** — signups, premium, AI calls (30d + all-time), content counts, IAP counts, storage/DB usage + free-tier projections.
- **Redemptions** — comp/referral code redemptions over time from `usage_events` (`code_redeemed`), with a per-code breakdown, a comp-vs-referral split, a campaign filter to isolate a single code (e.g. `SOHOFRIENDS`), a **free-weeks-granted** counter (granted_days ÷ 7, the ROI cost side), a **"past the free weeks"** free→paid conversion (redeemers who kept a paid App Store subscription *beyond* their comp window — `entitlements.premium_original_transaction_id` present and `premium_until` past `redeemed_at + granted_days`), a **Program ROI** card (revenue from converts vs. retail value of the free weeks given away → net / return multiple / break-even, prices tunable at the top of the page), and a referral funnel (sharers → referral redemptions → conversion, from `referral_code_created`).
- **AI Consumption** — daily calls, tokens, estimated cost, monthly projection, by-kind breakdown (from `usage_events`).
- **Users** — email, tier, signup, last active, AI usage, closet size.

## Local dev
```sh
npm install
cp .env.example .env.local   # then fill in the values
npm run dev
```

## Environment variables (set in `.env.local` locally AND in Vercel project settings)
| Var | What | Where to get it |
|---|---|---|
| `SUPABASE_URL` | `https://irfzsyzhoxxtzuugdtef.supabase.co` | Supabase → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | **secret** service-role key | Supabase → Project Settings → API → `service_role` |
| `ADMIN_PASSWORD` | password to log in | choose a strong one |
| `SESSION_SECRET` | random string for cookie signing (also signs unsubscribe tokens) | e.g. `openssl rand -hex 32` |
| `CRON_SECRET` | bearer secret for the daily Vercel crons | e.g. `openssl rand -hex 32` |

**Marketing email (Resend) — required only for the Marketing tab's bulk-send.** The
feature is inert until all four are set:

| Var | What | Where to get it |
|---|---|---|
| `RESEND_API_KEY` | Resend API key | Resend → API Keys |
| `EMAIL_FROM` | verified sender, e.g. `WhichOutfit <hello@whichoutfit.app>` | domain must be verified in Resend |
| `MARKETING_PHYSICAL_ADDRESS` | postal address shown in every marketing email | required by CAN-SPAM |
| `PUBLIC_BASE_URL` | stable https origin that serves `/api/unsubscribe`, e.g. `https://admin.whichoutfit.app` | your deployed dashboard URL |

**Ops alerts (optional).** If set, the daily `appstore-sync` cron emails this address
when the App Store data goes stale (>2 days old) — so a silently failing sync can't
rot unnoticed. Reuses `RESEND_API_KEY` + `EMAIL_FROM`; inert until `ADMIN_ALERT_EMAIL`
is set (the in-app stale banner still shows regardless).

| Var | What | Where to get it |
|---|---|---|
| `ADMIN_ALERT_EMAIL` | inbox for ops alerts (stale-data notifications) | your own email |

**Social & ads metrics (optional).** Each platform's sync is inert until its token
+ account id are set. Use a long-lived / system-user token (no in-app OAuth). The
TikTok app must be built in **sandbox** and submitted/published before production
data flows; the sandbox token works against sandbox data in the meantime.

| Var | What | Where to get it |
|---|---|---|
| `TIKTOK_ACCESS_TOKEN` | TikTok long-lived token | TikTok developer portal (app → sandbox, then published) |
| `TIKTOK_BUSINESS_ID` | business account id (organic insights) | TikTok Business Center |
| `TIKTOK_ADVERTISER_ID` | (optional) advertiser id for ads spend/ROAS | TikTok Ads Manager |
| `META_ACCESS_TOKEN` | Meta long-lived / system-user token | Meta Business Suite / Graph API |
| `IG_USER_ID` | IG Business account id (organic insights) | linked to a FB Page |
| `META_AD_ACCOUNT_ID` | (optional) `act_<id>` for ads spend/ROAS | Meta Ads Manager |

> App credentials (TikTok client key/secret, Meta app id/secret) are used only to
> mint/refresh tokens out-of-band — they are NOT needed by the running app and
> must never be committed.

**Receipt ingestion (Gemini extraction + Gmail auto-import).** Powers the "Drop a
receipt to autofill" box on the Add-expense form and the "Sync Gmail" button /
daily `gmail-sync` cron. Uses the SAME model backend the app already runs on
(gemini-2.5-flash). Receipt parsing is inert until `GEMINI_API_KEY` is set;
Gmail import is inert until all four `GMAIL_*` vars are set.

| Var | What | Where to get it |
|---|---|---|
| `GEMINI_API_KEY` | Gemini API key for receipt (PDF/image) extraction — **same value already used by the Supabase `ai` edge function**, just add it to Vercel too (edge-function secrets are separate) | Google AI Studio → API Keys |
| `GEMINI_MODEL` | (optional) override model; default `gemini-2.5-flash` | — |
| `GMAIL_CLIENT_ID` | Google OAuth client id | Google Cloud Console → APIs & Services → Credentials |
| `GMAIL_CLIENT_SECRET` | Google OAuth client secret | same |
| `GMAIL_REFRESH_TOKEN` | offline refresh token for your Gmail account | OAuth consent once with scope `gmail.readonly` (see below) |
| `GMAIL_LABEL` | label to scan, e.g. `Receipts` (name) or a `Label_…` id | the Gmail label you file receipts into |
| `GMAIL_QUERY` | (optional) Gmail search to bound the scan; default `newer_than:180d` | — |
| `GMAIL_MAX_PER_RUN` | (optional) max new receipts imported per run; default `25` | — |

**Getting a `GMAIL_REFRESH_TOKEN` (one-time):** In Google Cloud Console, enable the
**Gmail API**, create an OAuth client, and add your Google account as a **Test user**
on the consent screen. Then run the OAuth flow once with scope
`https://www.googleapis.com/auth/gmail.readonly` and `access_type=offline` (the
OAuth Playground at developers.google.com/oauthplayground works: gear → "Use your
own OAuth credentials", authorize the Gmail readonly scope, exchange for tokens,
copy the **refresh token**). File the receipts you want imported under the
`GMAIL_LABEL` label. Ingestion is idempotent (keyed by message id) and skips any
charge whose vendor+date+amount already exists in the ledger, so it won't
double-count what Mercury already pulled in.

**Consumer webapp (app.whichoutfit.app) — currently HIDDEN.** While the focus is on
iOS, every consumer route (and `/auth/callback`) renders the "coming soon" page
(`components/ComingSoon.tsx`). The webapp code stays intact and building; flip the
flag and redeploy to bring it back. Browser-side, RLS-protected — the two
`NEXT_PUBLIC_` vars are safe to expose (unlike the service-role key):

| Var | What | Where to get it |
|---|---|---|
| `CONSUMER_WEBAPP_ENABLED` | set to `true` to un-hide the webapp; unset = coming-soon page. Read at build time (`lib/flags.ts`), so redeploy after changing it. | — |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://irfzsyzhoxxtzuugdtef.supabase.co` | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | publishable/anon key | Supabase → Project Settings → API (publishable) |

> Also in Supabase → Authentication → URL Configuration, add the redirect URLs
> `https://app.whichoutfit.app/auth/callback` (and `http://localhost:3000/auth/callback`
> for dev). Google is already enabled as a provider (the iOS app uses it).

> The service-role key bypasses RLS — it lives ONLY in server env, never shipped to the browser. All Supabase reads happen in Server Components / Route Handlers.

## Google Play Console MCP server (dev tooling, optional)

`.mcp.json` wires up a **`google-play`** [MCP](https://modelcontextprotocol.io) server
([`google-play-mcp`](https://github.com/Jang-myoung-gyoon/google-play-mcp), Android
Publisher API v3) so an MCP client — Claude Code, or any editor that reads `.mcp.json` —
can query and manage the Android app (currently in closed testing). It's **dev-only
tooling**: it is not imported by the Next.js app, has nothing to do with Vercel, and is
inert until the two vars below are set. The server is Python-based and bootstraps its own
venv on first run via `npx`, so you need `python3` + `pip` on PATH.

**What it can do** — read: `get_app_info`, `list_inapp_products`, `list_subscriptions`;
**write** (mutates Play Console): `deploy_internal` / `deploy_track` (upload an AAB),
`promote_track_release` (move a release between tracks), and in-app-product create/
activate/deactivate. ⚠️ The write tools can push a release to **any** track including
**production** — while Android is closed-testing-only, treat `deploy_track` /
`promote_track_release` with care and stick to the `internal` track.

| Var | What | Where to get it |
|---|---|---|
| `GOOGLE_PLAY_KEY_FILE` | path to the Google Cloud **service-account JSON key** (default `.secrets/google-play-service-account.json`, git-ignored) | see below |
| `GOOGLE_PLAY_PACKAGE_NAME` | the Android app id, e.g. `com.whichoutfit.app` | Play Console → your app → Dashboard (or the native Android repo's `applicationId`) |

**One-time setup (needs a human — creating the key and granting Play access require
your Google credentials):**
1. **Google Cloud Console** → the project linked to Play → *APIs & Services* → enable the
   **Google Play Android Developer API**.
2. *IAM & Admin → Service Accounts* → create a service account → *Keys* → *Add key →
   JSON*. Save it as `.secrets/google-play-service-account.json` (git-ignored) or point
   `GOOGLE_PLAY_KEY_FILE` elsewhere.
3. **Play Console** → *Users & permissions* → *Invite new users* → add that service
   account's email and grant it access to the WhichOutfit app (Releases permissions for
   deploy; read is enough for the `get_*`/`list_*` tools). Permission changes can take a
   few minutes to propagate.
4. Set `GOOGLE_PLAY_KEY_FILE` and `GOOGLE_PLAY_PACKAGE_NAME` (e.g. in `.env.local`, or
   exported in your shell — the MCP client expands them into `.mcp.json`). In Claude Code,
   approve the project MCP server when prompted, then `/mcp` to confirm it's connected.

## Deploy to Vercel
1. Push this folder to a new GitHub repo (e.g. `whichoutfit-app`).
2. Vercel → Add New Project → import that repo.
3. Add the 4 env vars above in Vercel → Settings → Environment Variables.
4. Deploy. Optionally map `admin.whichoutfit.app` to it (Vercel → Domains).

## Backend dependencies (already live)
- `public.usage_events` table (RLS-locked, service-role only).
- `ai` edge function logs each call to `usage_events`.
- RPCs: `admin_overview()`, `admin_ai_daily(int)`, `admin_user_usage()`, `admin_redemptions(int, text)` (execute = service_role only).
- `code_redeemed` / `referral_code_created` events on `usage_events`, written server-side by DB triggers (no app release needed).
