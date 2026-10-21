import type { Connection } from "@/lib/socialHealth";

// Social & Ads → Connections: each source the dashboard pulls from, whether it
// works right now (checked live against the API), and what to do when it
// doesn't. The fix steps name the exact Vercel variable to set.

const PILL: Record<Connection["state"], { text: string; cls: string }> = {
  ok: { text: "Working", cls: "bg-emerald-50 text-[var(--wo-green)]" },
  partial: { text: "Partly working", cls: "bg-amber-50 text-amber-700" },
  failing: { text: "Not working", cls: "bg-red-50 text-[var(--wo-red,#e5484d)]" },
  not_set: { text: "Not connected", cls: "bg-[var(--wo-bg)] text-[var(--wo-muted)]" },
};

const FIX: Record<Connection["key"], string[]> = {
  instagram: [
    "Meta Business Suite → Settings → Users → System users → add one (Admin) and assign it the Instagram account, its Facebook Page and your app.",
    "Generate token on that system user for your app, expiry Never, with: instagram_basic, instagram_content_publish, instagram_manage_insights, pages_show_list, pages_read_engagement, business_management.",
    "Set it in Vercel as META_ACCESS_TOKEN (Production), exactly as copied: no quotes, spaces or line breaks. IG_USER_ID is the Instagram Business account id (Graph API: /me/accounts → page → instagram_business_account).",
    "Redeploy, then press Sync now. This panel turns green when it works.",
  ],
  tiktok: [
    "Click Connect TikTok and approve WhichOutfit with the WhichOutfit TikTok account (it must be a target user on the app's sandbox at developers.tiktok.com).",
    "Needs TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET (the sandbox's credentials) in Vercel.",
  ],
  tiktok_ads: [
    "In TikTok API for Business → My apps, give the WhichOutfit app the Ads Management and Reporting scopes, then authorize it for your TikTok ad account.",
    "Set TIKTOK_ADVERTISER_ID and TIKTOK_ADS_ACCESS_TOKEN in Vercel (the ads token can be the same as TIKTOK_ACCESS_TOKEN if it carries both scopes).",
  ],
  instagram_ads: [
    "In Business settings → Users → System users → whichoutfit-server → Assign assets → Ad accounts, give it your ad account (View performance is enough).",
    "Make sure the token was generated with ads_read. The Ads page picks the account up on its own — no env var needed.",
  ],
};

const DOT: Record<Connection["key"], string> = {
  instagram: "#2E6BFF",
  instagram_ads: "#2E6BFF",
  tiktok: "#eb6834",
  tiktok_ads: "#eb6834",
};

/** The one line a tile shows: the account summary when it works, the first problem when it doesn't. */
function headline(c: Connection): string {
  if (c.state === "not_set" && c.missing.length) return "Not set up yet";
  const bad = c.checks.find((k) => !k.ok);
  if (bad) return bad.detail;
  return c.checks[0]?.detail ?? "Working";
}

export function Connections({ connections }: { connections: Connection[] }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {connections.map((c) => {
        const pill = PILL[c.state];
        const needsFix = c.state !== "ok";
        return (
          <li key={c.key} className="flex flex-col rounded-xl border border-[var(--wo-border)] p-3.5">
            <div className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-2">
                <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: DOT[c.key] }} />
                <span className="truncate text-sm font-semibold">{c.label}</span>
              </span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${pill.cls}`}>{pill.text}</span>
            </div>
            <p className={`mt-1.5 line-clamp-2 text-xs ${needsFix && c.state !== "not_set" ? "text-[var(--wo-red,#e5484d)]" : "text-[var(--wo-muted)]"}`} title={headline(c)}>
              {headline(c)}
            </p>
            <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-2.5">
              {c.connectUrl && needsFix ? (
                <a href={c.connectUrl} className="rounded-lg bg-[var(--wo-blue)] px-2.5 py-1 text-xs font-medium text-white">Connect</a>
              ) : null}
              <details className="group text-xs">
                <summary className="cursor-pointer list-none text-[var(--wo-blue)] hover:underline">{needsFix ? "How to fix" : "Details"}</summary>
                <div className="mt-2 space-y-2 text-[var(--wo-muted)]">
                  {c.checks.length ? (
                    <ul className="space-y-1">
                      {c.checks.map((k) => (
                        <li key={k.name} className="flex gap-1.5">
                          <span className={k.ok ? "text-[var(--wo-green)]" : "text-[var(--wo-red,#e5484d)]"}>{k.ok ? "✓" : "✕"}</span>
                          <span><b className="font-medium text-[var(--wo-text)]">{k.name}</b> {k.detail}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {c.missing.length ? (
                    <p>Missing in Vercel: {c.missing.map((m) => <code key={m} className="mr-1 rounded bg-[var(--wo-bg)] px-1 py-0.5">{m}</code>)}</p>
                  ) : null}
                  {needsFix ? (
                    <ol className="list-decimal space-y-1 pl-4">
                      {FIX[c.key].map((step) => <li key={step}>{step}</li>)}
                    </ol>
                  ) : null}
                  {c.connectUrl && !needsFix ? <a href={c.connectUrl} className="text-[var(--wo-blue)] hover:underline">Reconnect</a> : null}
                </div>
              </details>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
