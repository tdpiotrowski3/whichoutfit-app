"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, Chip } from "@/components/ds";
import { consumerClient } from "@/lib/consumer";
import { fileToBase64JPEG } from "@/lib/image";
import { ratePhoto, StylistError, type FeedbackPersona, type TesterResult } from "@/lib/stylist";

const PERSONAS: { id: FeedbackPersona; label: string; blurb: string }[] = [
  { id: "best", label: "Best Friend", blurb: "Warm and hyped — gasses you up." },
  { id: "so", label: "Your S.O.", blurb: "Honest but loving." },
  { id: "miranda", label: "Miranda Priestly", blurb: "No mercy. The truth, darling." },
];

function shopUrl(query: string): string {
  return `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(query)}`;
}

function scoreColor(score: number): string {
  if (score >= 80) return "#1f9d57";
  if (score >= 55) return "var(--wo-brand, #2f6df6)";
  return "#e5681f";
}

export default function RatePage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [occasion, setOccasion] = useState("");
  const [persona, setPersona] = useState<FeedbackPersona>("so");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TesterResult | null>(null);

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

  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setResult(null);
    setError(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(f));
  }

  async function rate() {
    if (!file || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const base64 = await fileToBase64JPEG(file);
      setResult(await ratePhoto(base64, occasion, persona));
    } catch (e) {
      setError(e instanceof StylistError ? e.message : e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "32px 24px" }}>
      <header style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--wo-text, #10141b)" }}>Rate My Outfit</h1>
        <p style={{ fontSize: 14, color: "var(--wo-text-secondary, #5c6b7a)", marginTop: 4 }}>
          Upload a photo of what you&apos;re wearing and get a score with honest feedback.
        </p>
      </header>

      <Card>
        <input ref={fileRef} type="file" accept="image/*" onChange={pick} style={{ display: "none" }} />

        <button
          onClick={() => fileRef.current?.click()}
          style={{
            width: "100%",
            aspectRatio: preview ? undefined : "4 / 3",
            border: "2px dashed var(--wo-separator, #e3e8ef)",
            borderRadius: 12,
            background: "var(--wo-surface-muted, #eef2f8)",
            cursor: "pointer",
            padding: preview ? 8 : 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 14,
          }}
        >
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Your outfit" style={{ maxWidth: "100%", maxHeight: 360, borderRadius: 8, objectFit: "contain" }} />
          ) : (
            <span style={{ color: "var(--wo-text-secondary, #5c6b7a)", fontSize: 15 }}>Tap to add a photo</span>
          )}
        </button>

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, color: "var(--wo-text-secondary, #5c6b7a)", marginBottom: 6 }}>
            Who&apos;s rating you?
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {PERSONAS.map((p) => (
              <Chip key={p.id} selected={persona === p.id} onClick={() => setPersona(p.id)}>
                {p.label}
              </Chip>
            ))}
          </div>
          <div style={{ fontSize: 12, color: "var(--wo-text-secondary, #5c6b7a)", marginTop: 6 }}>
            {PERSONAS.find((p) => p.id === persona)?.blurb}
          </div>
        </div>

        <input
          value={occasion}
          onChange={(e) => setOccasion(e.target.value)}
          placeholder="Occasion (optional) — e.g. date night"
          style={{
            width: "100%",
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

        <Button onClick={rate} disabled={loading || !file} fullWidth>
          {loading ? "Rating…" : "Rate my outfit"}
        </Button>
      </Card>

      {error ? <p style={{ color: "#e5484d", marginTop: 16 }}>{error}</p> : null}

      {result ? (
        <Card key="result">
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: result.rationale ? 12 : 0 }}>
            {typeof result.score === "number" ? (
              <div style={{ fontSize: 44, fontWeight: 800, lineHeight: 1, color: scoreColor(result.score) }}>
                {result.score}
                <span style={{ fontSize: 18, fontWeight: 600, color: "var(--wo-text-secondary, #5c6b7a)" }}>/100</span>
              </div>
            ) : null}
            {result.headline ? (
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--wo-text, #10141b)" }}>{result.headline}</div>
            ) : null}
          </div>

          {result.rationale ? (
            <p style={{ fontSize: 14, color: "var(--wo-text-secondary, #5c6b7a)", margin: "0 0 12px" }}>{result.rationale}</p>
          ) : null}

          {result.pros && result.pros.length > 0 ? (
            <Section title="What works" items={result.pros} color="#1f9d57" />
          ) : null}
          {result.cons && result.cons.length > 0 ? (
            <Section title="Watch-outs" items={result.cons} color="#e5681f" />
          ) : null}

          {result.elevate && result.elevate.length > 0 ? (
            <div style={{ marginTop: 12 }}>
              <FieldLabel>Elevate it</FieldLabel>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
                {result.elevate.map((s, i) =>
                  s.name ? (
                    <a key={i} href={shopUrl(s.name)} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }} title={s.reason || ""}>
                      <Badge tone="brand">{s.name} ↗</Badge>
                    </a>
                  ) : null
                )}
              </div>
            </div>
          ) : null}
        </Card>
      ) : null}
    </main>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, color: "var(--wo-text-secondary, #5c6b7a)" }}>
      {children}
    </div>
  );
}

function Section({ title, items, color }: { title: string; items: string[]; color: string }) {
  return (
    <div style={{ marginTop: 10 }}>
      <FieldLabel>{title}</FieldLabel>
      <ul style={{ margin: "6px 0 0", paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 }}>
        {items.map((it, i) => (
          <li key={i} style={{ fontSize: 14, color: "var(--wo-text, #10141b)", display: "flex", gap: 8 }}>
            <span style={{ color, fontWeight: 700 }}>•</span>
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
