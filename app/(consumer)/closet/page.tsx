"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Card } from "@/components/ds";
import { consumerClient } from "@/lib/consumer";

// One closet item. The row's `data` jsonb mirrors the iOS ClothingItem Codable;
// `imageRef` points at the cutout in the private `closet-images` bucket
// (path `{uid}/{imageRef}.img`), which we resolve to a short-lived signed URL.
type ClosetItem = {
  id: string;
  data: {
    name?: string;
    category?: string;
    colorName?: string;
    brand?: string;
    tags?: string[];
    imageRef?: string;
  };
};

const BUCKET = "closet-images";
const SIGNED_URL_TTL = 3600; // 1h

export default function ClosetPage() {
  const router = useRouter();
  const [items, setItems] = useState<ClosetItem[] | null>(null);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
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
      // RLS scopes this to the signed-in user's rows.
      const { data, error } = await sb
        .from("closet_items")
        .select("id, data")
        .is("deleted_at", null)
        .order("updated_at", { ascending: false });
      if (error) {
        setError(error.message);
        return;
      }
      const rows = (data as ClosetItem[]) ?? [];
      setItems(rows);

      // Batch-sign the cutout images. Storage RLS lets the owner read their own
      // `{uid}/*` objects; path matches the iOS uploader (lowercased uid).
      const uid = session.user.id.toLowerCase();
      const withRefs = rows.filter((r) => r.data.imageRef);
      if (withRefs.length === 0) return;
      const paths = withRefs.map((r) => `${uid}/${r.data.imageRef}.img`);
      const { data: signed } = await sb.storage.from(BUCKET).createSignedUrls(paths, SIGNED_URL_TTL);
      if (!signed) return;
      const urls: Record<string, string> = {};
      withRefs.forEach((r, i) => {
        const s = signed[i];
        if (s?.signedUrl && !s.error) urls[r.id] = s.signedUrl;
      });
      setImageUrls(urls);
    })();
  }, [router]);

  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: "32px 24px" }}>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--wo-text, #10141b)" }}>My Closet</h1>
      </header>

      {error ? (
        <p style={{ color: "#e5484d" }}>{error}</p>
      ) : items === null ? (
        <p style={{ color: "var(--wo-text-secondary, #5c6b7a)" }}>Loading…</p>
      ) : items.length === 0 ? (
        <p style={{ color: "var(--wo-text-secondary, #5c6b7a)" }}>Your closet is empty. Add pieces in the WhichOutfit app.</p>
      ) : (
        <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
          {items.map((it) => (
            <Card key={it.id}>
              {imageUrls[it.id] ? (
                // Cutouts can be transparent; a neutral tile keeps them legible.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={imageUrls[it.id]}
                  alt={it.data.name || "Closet item"}
                  style={{ width: "100%", aspectRatio: "1 / 1", objectFit: "contain", background: "var(--wo-surface-muted, #eef2f8)", borderRadius: 12, marginBottom: 10 }}
                />
              ) : null}
              <div style={{ fontWeight: 600, color: "var(--wo-text, #10141b)" }}>{it.data.name || "Untitled"}</div>
              <div style={{ fontSize: 13, color: "var(--wo-text-secondary, #5c6b7a)", margin: "4px 0 10px" }}>
                {[it.data.colorName, it.data.category].filter(Boolean).join(" · ") || "—"}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {(it.data.tags ?? []).slice(0, 4).map((t) => (
                  <Badge key={t}>{t}</Badge>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
