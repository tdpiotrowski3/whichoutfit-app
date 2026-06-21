"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Card } from "@/components/ds";
import { consumerClient } from "@/lib/consumer";

// The `data` jsonb mirrors the iOS StyleProfile Codable.
type StyleProfile = {
  displayName?: string;
  pronouns?: string;
  favoriteColors?: string[];
  preferredStyles?: string[];
  inspirations?: string[];
  vibes?: string[];
  places?: string[];
  sizes?: Record<string, string>;
  comfortStatement?: number;
  fitPreference?: string;
};

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<StyleProfile | null>(null);
  const [loaded, setLoaded] = useState(false);
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
      // RLS scopes to this user's single profile row.
      const { data, error } = await sb.from("profiles").select("data").limit(1).maybeSingle();
      if (error) {
        setError(error.message);
        setLoaded(true);
        return;
      }
      setProfile((data?.data as StyleProfile) ?? {});
      setLoaded(true);
    })();
  }, [router]);

  const comfortPct =
    profile?.comfortStatement != null ? Math.round(profile.comfortStatement * 100) : null;
  const sizeEntries = profile?.sizes ? Object.entries(profile.sizes) : [];

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "32px 24px" }}>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--wo-text, #10141b)" }}>Style Profile</h1>
      </header>

      {error ? (
        <p style={{ color: "#e5484d" }}>{error}</p>
      ) : !loaded ? (
        <p style={{ color: "var(--wo-text-secondary, #5c6b7a)" }}>Loading…</p>
      ) : !profile || isEmpty(profile) ? (
        <p style={{ color: "var(--wo-text-secondary, #5c6b7a)" }}>
          No style profile yet. Take the style quiz in the WhichOutfit app to build one.
        </p>
      ) : (
        <Card>
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {(profile.displayName || profile.pronouns) && (
              <div>
                <div style={{ fontSize: 20, fontWeight: 700, color: "var(--wo-text, #10141b)" }}>
                  {profile.displayName || "—"}
                </div>
                {profile.pronouns ? (
                  <div style={{ fontSize: 13, color: "var(--wo-text-secondary, #5c6b7a)" }}>{profile.pronouns}</div>
                ) : null}
              </div>
            )}

            <Pills label="Vibe" values={profile.vibes} />
            <Pills label="Inspirations" values={profile.inspirations} />
            <Pills label="Dresses for" values={profile.places} />
            <Pills label="Favorite colors" values={profile.favoriteColors} />
            <Pills label="Preferred styles" values={profile.preferredStyles} />
            {profile.fitPreference ? <Pills label="Preferred fit" values={[profile.fitPreference]} /> : null}
            {sizeEntries.length > 0 ? (
              <Pills label="Sizes" values={sizeEntries.map(([k, v]) => `${k}: ${v}`)} />
            ) : null}

            {comfortPct != null && (
              <div>
                <FieldLabel>Comfort &harr; statement</FieldLabel>
                <div
                  style={{
                    height: 8,
                    borderRadius: 999,
                    background: "var(--wo-surface-muted, #eef2f8)",
                    overflow: "hidden",
                    marginTop: 6,
                  }}
                >
                  <div
                    style={{
                      width: `${comfortPct}%`,
                      height: "100%",
                      background: "var(--wo-brand, #2f6df6)",
                    }}
                  />
                </div>
                <div style={{ fontSize: 12, color: "var(--wo-text-secondary, #5c6b7a)", marginTop: 4 }}>
                  {comfortPct}% toward bold statement
                </div>
              </div>
            )}
          </div>
        </Card>
      )}
    </main>
  );
}

function isEmpty(p: StyleProfile): boolean {
  return (
    !p.displayName &&
    !p.pronouns &&
    !(p.vibes?.length) &&
    !(p.inspirations?.length) &&
    !(p.places?.length) &&
    !(p.favoriteColors?.length) &&
    !(p.preferredStyles?.length) &&
    !p.fitPreference &&
    p.comfortStatement == null &&
    !(p.sizes && Object.keys(p.sizes).length)
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 12,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: 0.4,
        color: "var(--wo-text-secondary, #5c6b7a)",
      }}
    >
      {children}
    </div>
  );
}

function Pills({ label, values }: { label: string; values?: string[] }) {
  if (!values || values.length === 0) return null;
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
        {values.map((v, i) => (
          <Badge key={i}>{v}</Badge>
        ))}
      </div>
    </div>
  );
}
