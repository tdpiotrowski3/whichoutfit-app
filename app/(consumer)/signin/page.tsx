"use client";

import { useState } from "react";
import { Button } from "@/components/ds";
import { consumerClient, isConsumerConfigured } from "@/lib/consumer";

export default function SignInPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const configured = isConsumerConfigured();

  async function sendMagicLink() {
    const sb = consumerClient();
    if (!sb || !email.trim()) return;
    setBusy(true);
    setError(null);
    // Email magic link — no OAuth provider/secret needed. The link returns to
    // /auth/callback, which exchanges the code for a session.
    const { error } = await sb.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) setError(error.message);
    else setSent(true);
    setBusy(false);
  }

  const input: React.CSSProperties = {
    width: "100%",
    boxSizing: "border-box",
    padding: "12px 14px",
    fontSize: 15,
    borderRadius: 12,
    border: "1px solid var(--wo-separator, #e2e8f0)",
    background: "var(--wo-surface, #fff)",
    color: "var(--wo-text, #10141b)",
    marginBottom: 12,
  };

  return (
    <main style={{ maxWidth: 380, margin: "0 auto", padding: "96px 24px", textAlign: "center" }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--wo-text, #10141b)" }}>WhichOutfit</h1>
      <p style={{ color: "var(--wo-text-secondary, #5c6b7a)", margin: "8px 0 28px" }}>
        Sign in to see your closet and outfits.
      </p>

      {!configured ? (
        <p style={{ fontSize: 13, color: "var(--wo-text-secondary, #5c6b7a)" }}>
          Sign-in isn&apos;t configured yet — set <code>NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
          <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>.
        </p>
      ) : sent ? (
        <p style={{ color: "var(--wo-text, #10141b)", lineHeight: 1.6 }}>
          Check your email — we sent a sign-in link to <strong>{email}</strong>. Open it on this device to
          continue.
        </p>
      ) : (
        <>
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") sendMagicLink();
            }}
            style={input}
          />
          <Button variant="primary" fullWidth onClick={sendMagicLink} disabled={busy || !email.trim()}>
            {busy ? "Sending…" : "Email me a sign-in link"}
          </Button>
        </>
      )}

      {error ? <p style={{ color: "#e5484d", fontSize: 13, marginTop: 16 }}>{error}</p> : null}
    </main>
  );
}
