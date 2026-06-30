"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Card } from "@/components/ds";
import { consumerClient } from "@/lib/consumer";
import { createSignedImageUrls } from "@/lib/storageImages";

// A saved look — the row's `data` jsonb mirrors the iOS SavedLook Codable.
type SavedLook = {
  id: string;
  data: {
    name?: string;
    itemIDs?: string[];
    coverImageRef?: string;
  };
};

// Minimal closet item, used to resolve a look's itemIDs into names + thumbnails.
type ClosetItem = {
  id: string;
  data: { name?: string; category?: string; imageRef?: string };
};

const BUCKET = "closet-images";
const SIGNED_URL_TTL = 3600; // 1h

export default function OutfitsPage() {
  const router = useRouter();
  const [looks, setLooks] = useState<SavedLook[] | null>(null);
  const [closet, setCloset] = useState<Record<string, ClosetItem["data"]>>({});
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({}); // ref -> signed url
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

      // Looks + the closet (to resolve itemIDs). RLS scopes both to this user.
      const [looksRes, closetRes] = await Promise.all([
        sb.from("saved_looks").select("id, data").is("deleted_at", null).order("updated_at", { ascending: false }),
        sb.from("closet_items").select("id, data").is("deleted_at", null),
      ]);
      if (looksRes.error) {
        setError(looksRes.error.message);
        return;
      }
      const lookRows = (looksRes.data as SavedLook[]) ?? [];
      setLooks(lookRows);

      // Closet lookup keyed by lowercased id (iOS sends uppercase UUIDs; the
      // uuid column comes back lowercased).
      const byId: Record<string, ClosetItem["data"]> = {};
      for (const row of (closetRes.data as ClosetItem[]) ?? []) byId[row.id.toLowerCase()] = row.data;
      setCloset(byId);

      // Collect every image ref we need: each look's cover, plus the first few
      // items in each look (for the preview), then batch-sign once.
      const uid = session.user.id.toLowerCase();
      const refs = new Set<string>();
      for (const look of lookRows) {
        if (look.data.coverImageRef) refs.add(look.data.coverImageRef);
        for (const id of (look.data.itemIDs ?? []).slice(0, 4)) {
          const ref = byId[id.toLowerCase()]?.imageRef;
          if (ref) refs.add(ref);
        }
      }
      const refList = [...refs];
      if (refList.length === 0) return;
      const signed = await createSignedImageUrls(sb, BUCKET, refList.map((r) => `${uid}/${r}.img`), SIGNED_URL_TTL);
      if (!signed) return;
      const urls: Record<string, string> = {};
      refList.forEach((r, i) => {
        const s = signed[i];
        if (s?.signedUrl && !s.error) urls[r] = s.signedUrl;
      });
      setImageUrls(urls);
    })();
  }, [router]);

  function lookItems(look: SavedLook): ClosetItem["data"][] {
    return (look.data.itemIDs ?? [])
      .map((id) => closet[id.toLowerCase()])
      .filter((d): d is ClosetItem["data"] => !!d);
  }

  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: "32px 24px" }}>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--wo-text, #10141b)" }}>Outfits</h1>
      </header>

      {error ? (
        <p style={{ color: "#e5484d" }}>{error}</p>
      ) : looks === null ? (
        <p style={{ color: "var(--wo-text-secondary, #5c6b7a)" }}>Loading…</p>
      ) : looks.length === 0 ? (
        <p style={{ color: "var(--wo-text-secondary, #5c6b7a)" }}>
          No saved outfits yet. Save looks in the WhichOutfit app and they&apos;ll appear here.
        </p>
      ) : (
        <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
          {looks.map((look) => {
            const items = lookItems(look);
            const cover = look.data.coverImageRef ? imageUrls[look.data.coverImageRef] : undefined;
            return (
              <Card key={look.id}>
                {cover ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={cover}
                    alt={look.data.name || "Outfit"}
                    style={{ width: "100%", aspectRatio: "4 / 3", objectFit: "cover", background: "var(--wo-surface-muted, #eef2f8)", borderRadius: 12, marginBottom: 10 }}
                  />
                ) : (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 6,
                      background: "var(--wo-surface-muted, #eef2f8)",
                      borderRadius: 12,
                      padding: 8,
                      marginBottom: 10,
                      aspectRatio: "4 / 3",
                    }}
                  >
                    {items.slice(0, 4).map((it, i) =>
                      it.imageRef && imageUrls[it.imageRef] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={i}
                          src={imageUrls[it.imageRef]}
                          alt={it.name || ""}
                          style={{ width: "100%", height: "100%", objectFit: "contain", minHeight: 0 }}
                        />
                      ) : (
                        <div key={i} />
                      )
                    )}
                  </div>
                )}
                <div style={{ fontWeight: 600, color: "var(--wo-text, #10141b)" }}>{look.data.name || "Untitled look"}</div>
                <div style={{ fontSize: 13, color: "var(--wo-text-secondary, #5c6b7a)", margin: "4px 0 10px" }}>
                  {items.length} {items.length === 1 ? "piece" : "pieces"}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {items.slice(0, 4).map((it, i) => (
                    <Badge key={i}>{it.name || it.category || "Item"}</Badge>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </main>
  );
}
