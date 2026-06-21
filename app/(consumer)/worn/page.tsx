"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ds";
import { consumerClient } from "@/lib/consumer";

// Day-by-day worn history. The row's `data` jsonb mirrors the iOS WornOutfit.
type WornRow = {
  id: string;
  data: { date?: string; itemIDs?: string[]; note?: string; imageRef?: string };
};
type ClosetData = { name?: string; category?: string; imageRef?: string };

const BUCKET = "closet-images";
const SIGNED_URL_TTL = 3600;

export default function WornPage() {
  const router = useRouter();
  const [entries, setEntries] = useState<WornRow[] | null>(null);
  const [closet, setCloset] = useState<Record<string, ClosetData>>({});
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({}); // ref -> url
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

      const [wornRes, closetRes] = await Promise.all([
        sb.from("worn_outfits").select("id, data").is("deleted_at", null),
        sb.from("closet_items").select("id, data").is("deleted_at", null),
      ]);
      if (wornRes.error) {
        setError(wornRes.error.message);
        return;
      }
      const rows = (wornRes.data as WornRow[]) ?? [];
      // Newest first by worn date.
      rows.sort((a, b) => new Date(b.data.date ?? 0).getTime() - new Date(a.data.date ?? 0).getTime());
      setEntries(rows);

      const byId: Record<string, ClosetData> = {};
      for (const r of (closetRes.data as { id: string; data: ClosetData }[]) ?? []) byId[r.id.toLowerCase()] = r.data;
      setCloset(byId);

      // Sign worn-photo refs + the item thumbnails referenced by entries.
      const uid = session.user.id.toLowerCase();
      const refs = new Set<string>();
      for (const e of rows) {
        if (e.data.imageRef) refs.add(e.data.imageRef);
        for (const id of e.data.itemIDs ?? []) {
          const ref = byId[id.toLowerCase()]?.imageRef;
          if (ref) refs.add(ref);
        }
      }
      const refList = [...refs];
      if (refList.length === 0) return;
      const { data: signed } = await sb.storage.from(BUCKET).createSignedUrls(refList.map((r) => `${uid}/${r}.img`), SIGNED_URL_TTL);
      if (!signed) return;
      const urls: Record<string, string> = {};
      refList.forEach((r, i) => {
        const s = signed[i];
        if (s?.signedUrl && !s.error) urls[r] = s.signedUrl;
      });
      setImageUrls(urls);
    })();
  }, [router]);

  function items(e: WornRow): ClosetData[] {
    return (e.data.itemIDs ?? []).map((id) => closet[id.toLowerCase()]).filter(Boolean) as ClosetData[];
  }

  function fmtDate(iso?: string): string {
    if (!iso) return "";
    return new Date(iso).toLocaleDateString(undefined, { weekday: "short", year: "numeric", month: "short", day: "numeric" });
  }

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "32px 24px" }}>
      <header style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--wo-text, #10141b)" }}>Worn Log</h1>
      </header>

      {error ? (
        <p style={{ color: "#e5484d" }}>{error}</p>
      ) : entries === null ? (
        <p style={{ color: "var(--wo-text-secondary, #5c6b7a)" }}>Loading…</p>
      ) : entries.length === 0 ? (
        <p style={{ color: "var(--wo-text-secondary, #5c6b7a)" }}>Nothing logged yet. Log what you wear in the WhichOutfit app.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {entries.map((e) => {
            const its = items(e);
            const photo = e.data.imageRef ? imageUrls[e.data.imageRef] : undefined;
            return (
              <Card key={e.id}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--wo-text, #10141b)", marginBottom: 10 }}>{fmtDate(e.data.date)}</div>

                {photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photo} alt="Worn outfit" style={{ width: "100%", maxHeight: 320, objectFit: "cover", borderRadius: 10, marginBottom: 10, background: "var(--wo-surface-muted, #eef2f8)" }} />
                ) : null}

                {its.length > 0 ? (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {its.map((it, i) => (
                      <div key={i} style={{ width: 64, textAlign: "center" }}>
                        {it.imageRef && imageUrls[it.imageRef] ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={imageUrls[it.imageRef]} alt={it.name || ""} style={{ width: 64, height: 64, objectFit: "contain", background: "var(--wo-surface-muted, #eef2f8)", borderRadius: 8 }} />
                        ) : (
                          <div style={{ width: 64, height: 64, background: "var(--wo-surface-muted, #eef2f8)", borderRadius: 8 }} />
                        )}
                        <div style={{ fontSize: 10, color: "var(--wo-text-secondary, #5c6b7a)", marginTop: 3, lineHeight: 1.2, overflow: "hidden" }}>{it.name || it.category || ""}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 13, color: "var(--wo-text-secondary, #5c6b7a)" }}>Logged items are no longer in your closet.</div>
                )}

                {e.data.note ? (
                  <p style={{ fontSize: 14, color: "var(--wo-text-secondary, #5c6b7a)", margin: "10px 0 0", fontStyle: "italic" }}>“{e.data.note}”</p>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}
    </main>
  );
}
