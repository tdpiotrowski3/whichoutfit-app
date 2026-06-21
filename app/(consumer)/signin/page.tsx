"use client";

import { useState } from "react";
import { Button } from "@/components/ds";
import { consumerClient, isConsumerConfigured } from "@/lib/consumer";

export default function SignInPage() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const configured = isConsumerConfigured();

  async function signInWithGoogle() {
    const sb = consumerClient();
    if (!sb) return;
    setBusy(true);
    setError(null);
    const { error } = await sb.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setError(error.message);
      setBusy(false);
    }
    // On success the browser is redirected to Google, so no further work here.
  }

  return (
    <main style={{ maxWidth: 380, margin: "0 auto", padding: "96px 24px", textAlign: "center" }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--wo-text, #10141b)" }}>WhichOutfit</h1>
      <p style={{ color: "var(--wo-text-secondary, #5c6b7a)", margin: "8px 0 28px" }}>
        Sign in to see your closet and outfits.
      </p>

      {configured ? (
        <Button variant="primary" fullWidth onClick={signInWithGoogle} disabled={busy}>
          {busy ? "Redirecting…" : "Continue with Google"}
        </Button>
      ) : (
        <p style={{ fontSize: 13, color: "var(--wo-text-secondary, #5c6b7a)" }}>
          Sign-in isn&apos;t configured yet — set <code>NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
          <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>.
        </p>
      )}

      {error ? <p style={{ color: "#e5484d", fontSize: 13, marginTop: 16 }}>{error}</p> : null}
    </main>
  );
}
