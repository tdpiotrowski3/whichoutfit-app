"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card } from "@/components/ds";
import { consumerClient } from "@/lib/consumer";
import { createSignedImageUrls } from "@/lib/storageImages";
import { dressForEvent, StylistError, type AIOutfit, type ClosetMap } from "@/lib/stylist";

const BUCKET = "closet-images";
const SIGNED_URL_TTL = 3600;

function shopUrl(query: string): string {
  return `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(query)}`;
}

export default function StylistPage() {
  const router = useRouter();
  const [occasion, setOccasion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outfits, setOutfits] = useState<AIOutfit[] | null>(null);
  const [closet, setCloset] = useState<ClosetMap>({});
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({}); // ref -> signed url

  // Bounce to sign-in if there's no session (the API call needs the JWT anyway).
  useEffect(() => {
    (async () => {
      const sb = consumerClient();
      if (!sb) return;
      const {
        data: { session },
      } = await sb.auth.getSession();
      if (!session) router.replace("/signin");
    })();
  }, [router]);

  async function generate() {
    const trimmed = occasion.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    setError(null);
    setOutfits(null);
    try {
      const { outfits, closet } = await dressForEvent(trimmed);
      setOutfits(outfits);
      setCloset(closet);
      await signImages(outfits, closet);
    } catch (e) {
      setError(e instanceof StylistError ? e.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function signImages(list: AIOutfit[], map: ClosetMap) {
    const sb = consumerClient();
    if (!sb) return;
    const {
      data: { session },
    } = await sb.auth.getSession();
    if (!session) return;
    const uid = session.user.id.toLowerCase();
    const refs = new Set<string>();
    for (const o of list) for (const id of o.itemIds ?? []) {
      const ref = map[id.toLowerCase()]?.imageRef;
      if (ref) refs.add(ref);
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
  }

  function itemsFor(o: AIOutfit) {
    return (o.itemIds ?? []).map((id) => closet[id.toLowerCase()]).filter(Boolean) as NonNullable<ClosetMap[string]>[];
  }

  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "32px 24px" }}>
      <header style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--wo-text, #10141b)" }}>Dress for an Event</h1>
        <p style={{ fontSize: 14, color: "var(--wo-text-secondary, #5c6b7a)", marginTop: 4 }}>
          Tell me the occasion and I&apos;ll style outfits from your closet.
        </p>
      </header>

      <Card>
        <textarea
          value={occasion}
          onChange={(e) => setOccasion(e.target.value)}
          placeholder="e.g. summer wedding, first day at a new job, gallery opening"
          rows={2}
          style={{
            width: "100%",
            resize: "vertical",
            border: "1px solid var(--wo-separator, #e3e8ef)",
            borderRadius: 12,
            padding: 12,
            fontSize: 15,
            fontFamily: "inherit",
            color: "var(--wo-text, #10141b)",
            background: "var(--wo-surface, #fff)",
            marginBottom: 12,
          }}
        />
        <Button onClick={generate} disabled={loading || !occasion.trim()} fullWidth>
          {loading ? "Styling…" : "Get outfits"}
        </Button>
      </Card>

      {error ? <p style={{ color: "#e5484d", marginTop: 16 }}>{error}</p> : null}

      {outfits && outfits.length === 0 && !error ? (
        <p style={{ color: "var(--wo-text-secondary, #5c6b7a)", marginTop: 16 }}>No outfits came back — try rephrasing the occasion.</p>
      ) : null}

      {outfits && outfits.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 16 }}>
          {outfits.map((o, oi) => {
            const items = itemsFor(o);
            return (
              <Card key={oi}>
                {o.title ? (
                  <div style={{ fontSize: 17, fontWeight: 700, color: "var(--wo-text, #10141b)", marginBottom: 8 }}>{o.title}</div>
                ) : null}

                {items.length > 0 ? (
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
                    {items.map((it, i) => (
                      <div key={i} style={{ width: 88, textAlign: "center" }}>
                        {it.imageRef && imageUrls[it.imageRef] ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={imageUrls[it.imageRef]}
                            alt={it.name || ""}
                            style={{ width: 88, height: 88, objectFit: "contain", background: "var(--wo-surface-muted, #eef2f8)", borderRadius: 10 }}
                          />
                        ) : (
                          <div style={{ width: 88, height: 88, background: "var(--wo-surface-muted, #eef2f8)", borderRadius: 10 }} />
                        )}
                        <div style={{ fontSize: 11, color: "var(--wo-text-secondary, #5c6b7a)", marginTop: 4, lineHeight: 1.2 }}>
                          {it.name || it.category || ""}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}

                {o.why ? (
                  <p style={{ fontSize: 14, color: "var(--wo-text-secondary, #5c6b7a)", margin: "0 0 10px" }}>{o.why}</p>
                ) : null}

                {o.shop && o.shop.length > 0 ? (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, color: "var(--wo-text-secondary, #5c6b7a)", marginBottom: 6 }}>
                      Complete the look
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {o.shop.map((s, si) =>
                        s.name ? (
                          <a key={si} href={shopUrl(s.name)} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }} title={s.reason || ""}>
                            <Badge tone="brand">{s.name} ↗</Badge>
                          </a>
                        ) : null
                      )}
                    </div>
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      ) : null}
    </main>
  );
}
