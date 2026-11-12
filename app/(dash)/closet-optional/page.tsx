import { getClosetOptional } from "@/lib/data";
import { Card, Stat, Bar } from "@/components/ui";

export const dynamic = "force-dynamic";

/** Does "no closet needed" work? Today looks, what people do with suggested pieces,
 *  whether product photos show, and whether the free styled-look pool runs out. */
export default async function ClosetOptionalPage() {
  let c;
  try {
    c = await getClosetOptional(30);
  } catch {
    return <Card title="Not configured"><p className="text-sm text-[var(--wo-muted)]">Set Supabase env vars to load these metrics.</p></Card>;
  }
  const pct = (n: number, of: number) => (of > 0 ? `${Math.round((n / of) * 100)}%` : "—");
  const rows = (m: Record<string, number>) => Object.entries(m).sort((a, b) => b[1] - a[1]);
  const maxAction = Math.max(1, ...Object.values(c.pieceActions));
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">No-closet looks</h1>
        <p className="text-sm text-[var(--wo-muted)]">
          Last {c.days} days. Events started with the 2026-11-12 builds, so older activity isn&apos;t here.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Today looks shown" value={c.looks.total} sub={`${c.looks.users} people`} accent="blue" />
        <Stat label="Fully suggested" value={pct(c.looks.fullySuggested, c.looks.total)} sub="looks with none of their own pieces" accent="teal" />
        <Stat label="Product photo hit rate" value={pct(c.shop.withPhotos, c.shop.searches)} sub={`${c.shop.searches} fresh searches`} accent="green" />
        <Stat label="Ran out of free looks" value={c.ambientExhaustedUsers} sub={`${c.ambientCalls} background AI calls`} accent={c.ambientExhaustedUsers > 0 ? "muted" : "green"} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Where looks came from">
          {rows(c.looks.bySource).map(([k, n]) => (
            <div key={k} className="flex justify-between text-sm py-1"><span>{k}</span><span>{n}</span></div>
          ))}
          <div className="flex justify-between text-sm py-1 text-[var(--wo-muted)]"><span>Different look taps</span><span>{c.differentLook}</span></div>
        </Card>
        <Card title="What people do with suggested pieces">
          {rows(c.pieceActions).map(([k, n]) => (
            <div key={k} className="py-1">
              <div className="flex justify-between text-sm"><span>{k.replace("_", " ")}</span><span>{n}</span></div>
              <Bar value={n} max={maxAction} />
            </div>
          ))}
        </Card>
        <Card title="Profile">
          {rows(c.deptDeclared).map(([k, n]) => (
            <div key={k} className="flex justify-between text-sm py-1"><span>Shop from: {k}</span><span>{n}</span></div>
          ))}
          <div className="flex justify-between text-sm py-1"><span>Opened Wardrobe Guide</span><span>{c.guideOpenedUsers}</span></div>
          <div className="flex justify-between text-sm py-1"><span>Profile reward claimed</span><span>{c.rewardClaimed}</span></div>
        </Card>
      </div>
    </div>
  );
}
