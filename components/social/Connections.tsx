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
    "TikTok for Business: create a Business Center and link the @whichoutfit TikTok account (it must be a Business account).",
    "TikTok for Developers → your app → add the Business API product with the account-insights scopes, and authorize the account.",
    "Set TIKTOK_ACCESS_TOKEN (the long-lived token) and TIKTOK_BUSINESS_ID in Vercel (Production), then redeploy.",
    "TikTok posting stays by hand either way: TikTok only allows automated public posts for audited apps.",
  ],
  instagram_ads: [
    "Only needed once you run Meta ads. Set META_AD_ACCOUNT_ID to the ad account id (act_…) from Ads Manager, and give the system user ads_read on it.",
  ],
};

export function Connections({ connections }: { connections: Connection[] }) {
  return (
    <ul className="divide-y divide-[var(--wo-border)]">
      {connections.map((c) => {
        const pill = PILL[c.state];
        const needsFix = c.state !== "ok";
        return (
          <li key={c.key} className="py-3 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <span className="font-medium">{c.label}</span>
                {c.account ? <span className="text-sm text-[var(--wo-muted)]">{c.account}</span> : null}
              </span>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${pill.cls}`}>{pill.text}</span>
            </div>
            {c.checks.length ? (
              <ul className="mt-2 space-y-1 text-sm">
                {c.checks.map((k) => (
                  <li key={k.name} className="flex gap-2">
                    <span className={k.ok ? "text-[var(--wo-green)]" : "text-[var(--wo-red,#e5484d)]"}>{k.ok ? "✓" : "✕"}</span>
                    <span className="font-medium">{k.name}</span>
                    <span className="min-w-0 text-[var(--wo-muted)]">{k.detail}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {c.missing.length ? (
              <p className="mt-1 text-sm text-[var(--wo-muted)]">
                Missing in Vercel: {c.missing.map((m) => <code key={m} className="mr-1 rounded bg-[var(--wo-bg)] px-1 py-0.5 text-xs">{m}</code>)}
              </p>
            ) : null}
            {needsFix ? (
              <details className="mt-2">
                <summary className="cursor-pointer text-sm text-[var(--wo-blue)]">How to {c.state === "not_set" ? "connect" : "fix"} it</summary>
                <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-[var(--wo-muted)]">
                  {FIX[c.key].map((s) => <li key={s}>{s}</li>)}
                </ol>
              </details>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
