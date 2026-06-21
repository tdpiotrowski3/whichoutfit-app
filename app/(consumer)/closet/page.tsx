"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Card } from "@/components/ds";
import { consumerClient } from "@/lib/consumer";

// One closet item. The row's `data` jsonb mirrors the iOS ClothingItem Codable;
// we read the fields the web cares about (images come from Storage — a follow-up).
type ClosetItem = {
  id: string;
  data: {
    name?: string;
    category?: string;
    colorName?: string;
    brand?: string;
    tags?: string[];
  };
};

export default function ClosetPage() {
  const router = useRouter();
  const [items, setItems] = useState<ClosetItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const sb = consumerClient();
    if (!sb) {
      setError("Not configured");
      return;
    }
    (async () => {
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
      if (error) setError(error.message);
      else setItems((data as ClosetItem[]) ?? []);
    })();
  }, [router]);

  async function signOut() {
    const sb = consumerClient();
    await sb?.auth.signOut();
    router.replace("/signin");
  }

  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: "32px 24px" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--wo-text, #10141b)" }}>My Closet</h1>
        <button onClick={signOut} style={{ background: "none", border: "none", color: "var(--wo-text-secondary, #5c6b7a)", cursor: "pointer", fontSize: 14 }}>
          Sign out
        </button>
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
