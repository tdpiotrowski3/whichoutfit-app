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
| `SESSION_SECRET` | random string for cookie signing | e.g. `openssl rand -hex 32` |

**Consumer webapp (app.whichoutfit.app).** Browser-side, RLS-protected — these are
safe to expose (unlike the service-role key):

| Var | What | Where to get it |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://irfzsyzhoxxtzuugdtef.supabase.co` | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | publishable/anon key | Supabase → Project Settings → API (publishable) |

> Also in Supabase → Authentication → URL Configuration, add the redirect URLs
> `https://app.whichoutfit.app/auth/callback` (and `http://localhost:3000/auth/callback`
> for dev). Google is already enabled as a provider (the iOS app uses it).

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
