"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ds";
import { consumerClient } from "@/lib/consumer";

// Mirrors the iOS InsightsView: analytics from the synced closet + worn log.
// No AI — wear counts/recency from worn_outfits, cost-per-wear/value from price.
type ClosetData = { name?: string; category?: string; price?: number; imageRef?: string };
type ClosetRow = { id: string; data: ClosetData };
type WornData = { date?: string; itemIDs?: string[] };

const BUCKET = "closet-images";
const SIGNED_URL_TTL = 3600;
const DEAD_DAYS = 90;

const money = (v: number) => new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(v);

export default function InsightsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<ClosetRow[] | null>(null);
  const [wearCounts, setWearCounts] = useState<Record<string, number>>({});
  const [lastWorn, setLastWorn] = useState<Record<string, number>>({}); // id -> epoch ms
  const [daysLogged, setDaysLogged] = useState(0);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({}); // ref -> url
  const [now, setNow] = useState(0); // captured at load so render stays pure
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const sb = consumerClient();
      if (!sb) {
        setError("Not configured");
        return;
      }
      const {
        data: { session },
      } = await sb.auth.getSession();
      if (!session) {
        router.replace("/signin");
        return;
      }
      setNow(Date.now());

      const [closetRes, wornRes] = await Promise.all([
        sb.from("closet_items").select("id, data").is("deleted_at", null),
        sb.from("worn_outfits").select("id, data").is("deleted_at", null),
      ]);
      if (closetRes.error) {
        setError(closetRes.error.message);
        return;
      }
      const closet = (closetRes.data as ClosetRow[]) ?? [];
      setRows(closet);

      const worn = ((wornRes.data as { id: string; data: WornData }[]) ?? []).map((r) => r.data);
      setDaysLogged(worn.length);
      const counts: Record<string, number> = {};
      const last: Record<string, number> = {};
      for (const entry of worn) {
        const t = entry.date ? new Date(entry.date).getTime() : 0;
        for (const id of entry.itemIDs ?? []) {
          const key = id.toLowerCase();
          counts[key] = (counts[key] ?? 0) + 1;
          if (!last[key] || t > last[key]) last[key] = t;
        }
      }
      setWearCounts(counts);
      setLastWorn(last);

      // Sign thumbnails for every item (small closets); render uses what's needed.
      const uid = session.user.id.toLowerCase();
      const refs = closet.map((r) => r.data.imageRef).filter(Boolean) as string[];
      if (refs.length === 0) return;
      const { data: signed } = await sb.storage.from(BUCKET).createSignedUrls(refs.map((r) => `${uid}/${r}.img`), SIGNED_URL_TTL);
      if (!signed) return;
      const urls: Record<string, string> = {};
      refs.forEach((r, i) => {
        const s = signed[i];
        if (s?.signedUrl && !s.error) urls[r] = s.signedUrl;
      });
      setImageUrls(urls);
    })();
  }, [router]);

  const wears = (r: ClosetRow) => wearCounts[r.id.toLowerCase()] ?? 0;

  if (error) return <Shell><p style={{ color: "#e5484d" }}>{error}</p></Shell>;
  if (rows === null) return <Shell><p style={{ color: "var(--wo-text-secondary, #5c6b7a)" }}>Loading…</p></Shell>;
  if (rows.length === 0)
    return (
      <Shell>
        <p style={{ color: "var(--wo-text-secondary, #5c6b7a)" }}>
          No insights yet. Add pieces and log what you wear in the WhichOutfit app; add prices to unlock cost-per-wear.
        </p>
      </Shell>
    );

  const priced = rows.filter((r) => (r.data.price ?? 0) > 0);
  const closetValue = priced.reduce((sum, r) => sum + (r.data.price ?? 0), 0);
  const mostWorn = rows.filter((r) => wears(r) > 0).sort((a, b) => wears(b) - wears(a)).slice(0, 5);
  const bestValue = priced
    .map((r) => ({ r, cpw: (r.data.price ?? 0) / Math.max(wears(r), 1) }))
    .sort((a, b) => a.cpw - b.cpw)
    .slice(0, 5);
  const cutoff = now - DEAD_DAYS * 86400_000;
  const deadStock = rows
    .filter((r) => {
      const t = lastWorn[r.id.toLowerCase()];
      return !t || t < cutoff;
    })
    .sort((a, b) => (lastWorn[a.id.toLowerCase()] ?? 0) - (lastWorn[b.id.toLowerCase()] ?? 0));
  const categories = Object.entries(
    rows.reduce<Record<string, number>>((acc, r) => {
      const c = r.data.category || "Other";
      acc[c] = (acc[c] ?? 0) + 1;
      return acc;
    }, {})
  ).sort((a, b) => b[1] - a[1]);

  const deadSubtitle = (r: ClosetRow) => {
    const t = lastWorn[r.id.toLowerCase()];
    return t ? `Last worn ${new Date(t).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}` : "Never worn";
  };

  return (
    <Shell>
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <Stat value={`${rows.length}`} label="Pieces" color="var(--wo-brand, #2f6df6)" />
        <Stat value={`${daysLogged}`} label="Days logged" color="#1f9d57" />
        {priced.length > 0 ? <Stat value={money(closetValue)} label="Closet value" color="#e5681f" /> : null}
      </div>

      {mostWorn.length > 0 ? (
        <ListSection title="Most worn">
          {mostWorn.map((r) => (
            <Row key={r.id} url={r.data.imageRef ? imageUrls[r.data.imageRef] : undefined} name={r.data.name || r.data.category || "Item"} trailing={`${wears(r)} ${wears(r) === 1 ? "wear" : "wears"}`} />
          ))}
        </ListSection>
      ) : null}

      {bestValue.length > 0 ? (
        <ListSection title="Best value (cost per wear)">
          {bestValue.map(({ r, cpw }) => (
            <Row
              key={r.id}
              url={r.data.imageRef ? imageUrls[r.data.imageRef] : undefined}
              name={r.data.name || r.data.category || "Item"}
              subtitle={`${wears(r)} ${wears(r) === 1 ? "wear" : "wears"} · ${money(r.data.price ?? 0)}`}
              trailing={`${money(cpw)}/wear`}
            />
          ))}
        </ListSection>
      ) : null}

      {deadStock.length > 0 ? (
        <ListSection title={`Dead stock — not worn in ${DEAD_DAYS}+ days`}>
          {deadStock.slice(0, 8).map((r) => (
            <Row key={r.id} url={r.data.imageRef ? imageUrls[r.data.imageRef] : undefined} name={r.data.name || r.data.category || "Item"} subtitle={deadSubtitle(r)} />
          ))}
        </ListSection>
      ) : null}

      <ListSection title="By category">
        {categories.map(([cat, n]) => (
          <div key={cat} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", fontSize: 14, color: "var(--wo-text, #10141b)" }}>
            <span>{cat}</span>
            <span style={{ fontWeight: 700, color: "var(--wo-text-secondary, #5c6b7a)" }}>{n}</span>
          </div>
        ))}
      </ListSection>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "32px 24px" }}>
      <header style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--wo-text, #10141b)" }}>Closet Insights</h1>
      </header>
      {children}
    </main>
  );
}

function Stat({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <div style={{ flex: 1, minWidth: 120 }}>
      <Card>
        <div style={{ fontSize: 22, fontWeight: 800, color }}>{value}</div>
        <div style={{ fontSize: 12, color: "var(--wo-text-secondary, #5c6b7a)" }}>{label}</div>
      </Card>
    </div>
  );
}

function ListSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, color: "var(--wo-text-secondary, #5c6b7a)", marginBottom: 8 }}>{title}</div>
      <Card>
        <div style={{ display: "flex", flexDirection: "column" }}>{children}</div>
      </Card>
    </div>
  );
}

function Row({ url, name, subtitle, trailing }: { url?: string; name: string; subtitle?: string; trailing?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0" }}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={name} style={{ width: 40, height: 40, objectFit: "contain", background: "var(--wo-surface-muted, #eef2f8)", borderRadius: 8, flexShrink: 0 }} />
      ) : (
        <div style={{ width: 40, height: 40, background: "var(--wo-surface-muted, #eef2f8)", borderRadius: 8, flexShrink: 0 }} />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--wo-text, #10141b)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</div>
        {subtitle ? <div style={{ fontSize: 12, color: "var(--wo-text-secondary, #5c6b7a)" }}>{subtitle}</div> : null}
      </div>
      {trailing ? <div style={{ fontSize: 14, fontWeight: 700, color: "#1f9d57" }}>{trailing}</div> : null}
    </div>
  );
}
