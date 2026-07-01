import { getOverview } from "@/lib/data";
import { Stat, Card, Bar } from "@/components/ui";

export const dynamic = "force-dynamic";

// Supabase free-tier ceilings (for projection bars).
const FREE_STORAGE_MB = 1024;
const FREE_DB_MB = 500;

export default async function OverviewPage() {
  let o;
  try {
    o = await getOverview();
  } catch {
    return (
      <Card title="Not configured">
        <p className="text-sm text-[var(--wo-muted)]">
          Couldn&apos;t reach Supabase. Set <code>SUPABASE_URL</code> and{" "}
          <code>SUPABASE_SERVICE_ROLE_KEY</code> in your environment.
        </p>
      </Card>
    );
  }

  // Projection excludes seed/test accounts (see admin_overview: proj_*), so a
  // couple of dev accounts hoarding hundreds of items don't skew the per-user
  // average. The Storage bar below still shows true total usage.
  const mbPerUser = o.proj_users > 0 ? o.proj_storage_mb / o.proj_users : 0;
  const usersToStorageCap = mbPerUser > 0 ? Math.floor(FREE_STORAGE_MB / mbPerUser) : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Overview</h1>
        <p className="text-sm text-[var(--wo-muted)]">Live from Supabase. Downloads &amp; conversion live in App Store Connect.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Signups" value={o.total_signups} accent="blue" sub={`${o.profiles} with synced data`} />
        <Stat label="Premium active" value={o.premium_active} accent="green" />
        <Stat label="AI calls · 30d" value={o.ai_calls_30d} accent="teal" sub={`${o.ai_calls_total} all-time`} />
        <Stat label="Limit hits · 30d" value={o.ai_limit_hits_30d} sub="paywall triggers" accent="muted" />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card title="Content">
          <div className="grid grid-cols-2 gap-4">
            <Stat label="Closet items" value={o.closet_items} sub={`${o.users_with_closet} users`} />
            <Stat label="Saved looks" value={o.saved_looks} />
            <Stat label="Worn outfits" value={o.worn_outfits} />
            <Stat label="Credits outstanding" value={o.credits_outstanding} />
          </div>
        </Card>

        <Card title="Revenue (App Store)">
          <div className="grid grid-cols-2 gap-4">
            <Stat label="Subscriptions" value={o.iap_subscriptions} accent="green" />
            <Stat label="Credit packs" value={o.iap_credit_packs} accent="green" />
          </div>
          <p className="mt-4 text-xs text-[var(--wo-muted)]">
            Transaction counts from the IAP ledger. Dollar amounts &amp; payouts live in App Store Connect.
          </p>
        </Card>
      </div>

      <Card title="Infrastructure & projections">
        <div className="space-y-5">
          <div>
            <div className="mb-1 flex justify-between text-sm">
              <span className="font-medium">Storage</span>
              <span className="text-[var(--wo-muted)]">{o.storage_mb} / {FREE_STORAGE_MB} MB · {o.storage_objects} files</span>
            </div>
            <Bar value={o.storage_mb} max={FREE_STORAGE_MB} color="var(--wo-blue)" />
          </div>
          <div>
            <div className="mb-1 flex justify-between text-sm">
              <span className="font-medium">Database</span>
              <span className="text-[var(--wo-muted)]">{o.db_size_mb} / {FREE_DB_MB} MB</span>
            </div>
            <Bar value={o.db_size_mb} max={FREE_DB_MB} color="var(--wo-teal)" />
          </div>
          <p className="text-sm text-[var(--wo-muted)]">
            {usersToStorageCap != null ? (
              <>
                At ~{mbPerUser.toFixed(1)} MB/user <span className="text-xs">(real users only — seed accounts excluded)</span>, the free 1&nbsp;GB storage tier covers about{" "}
                <strong className="text-[var(--wo-text)]">{usersToStorageCap} users</strong>. Budget ~$25/mo for Supabase Pro (100&nbsp;GB storage, 8&nbsp;GB database) beyond that — storage is your first paid trigger.
              </>
            ) : (
              "Add users with closets to project the storage ceiling."
            )}
          </p>
        </div>
      </Card>
    </div>
  );
}
