# WhichOutfit — Admin Dashboard

Internal reporting dashboard (Next.js, App Router). Reads live from the WhichOutfit
Supabase project, server-side only. Becomes the consumer webapp later (same app).

## What it shows
- **Overview** — signups, premium, AI calls (30d + all-time), content counts, IAP counts, storage/DB usage + free-tier projections.
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
| `CRON_SECRET` | bearer secret for the daily Vercel cron | e.g. `openssl rand -hex 32` |

**Marketing email (Resend) — required only for the Marketing tab's bulk-send.** The
feature is inert until all four are set:

| Var | What | Where to get it |
|---|---|---|
| `RESEND_API_KEY` | Resend API key | Resend → API Keys |
| `EMAIL_FROM` | verified sender, e.g. `WhichOutfit <hello@whichoutfit.app>` | domain must be verified in Resend |
| `MARKETING_PHYSICAL_ADDRESS` | postal address shown in every marketing email | required by CAN-SPAM |
| `PUBLIC_BASE_URL` | stable https origin that serves `/api/unsubscribe`, e.g. `https://admin.whichoutfit.app` | your deployed dashboard URL |

> The service-role key bypasses RLS — it lives ONLY in server env, never shipped to the browser. All Supabase reads happen in Server Components / Route Handlers.

## Deploy to Vercel
1. Push this folder to a new GitHub repo (e.g. `whichoutfit-app`).
2. Vercel → Add New Project → import that repo.
3. Add the 4 env vars above in Vercel → Settings → Environment Variables.
4. Deploy. Optionally map `admin.whichoutfit.app` to it (Vercel → Domains).

## Backend dependencies (already live)
- `public.usage_events` table (RLS-locked, service-role only).
- `ai` edge function logs each call to `usage_events`.
- RPCs: `admin_overview()`, `admin_ai_daily(int)`, `admin_user_usage()` (execute = service_role only).
