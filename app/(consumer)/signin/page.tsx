"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ds";
import { consumerClient, isConsumerConfigured } from "@/lib/consumer";

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const configured = isConsumerConfigured();

  async function sendCode() {
    const sb = consumerClient();
    if (!sb || !email.trim()) return;
    setBusy(true);
    setError(null);
    // No emailRedirectTo → an OTP code email (verified with verifyOtp), which
    // works across devices: request on one device, type the code on another.
    const { error } = await sb.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: true },
    });
    if (error) setError(error.message);
    else setStage("code");
    setBusy(false);
  }

  async function verify() {
    const sb = consumerClient();
    if (!sb || code.trim().length < 6) return;
    setBusy(true);
    setError(null);
    const { error } = await sb.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "email" });
    if (error) {
      setError(error.message);
      setBusy(false);
    } else {
      router.replace("/closet");
    }
  }

  async function oauth(provider: "google" | "apple") {
    const sb = consumerClient();
    if (!sb) return;
    setBusy(true);
    setError(null);
    const { error } = await sb.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setError(error.message);
      setBusy(false);
    }
    // On success the browser redirects to the provider.
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
      ) : stage === "email" ? (
        <>
          <Button variant="primary" fullWidth onClick={() => oauth("google")} disabled={busy}>
            Continue with Google
          </Button>
          <div style={{ height: 10 }} />
          <Button variant="secondary" fullWidth onClick={() => oauth("apple")} disabled={busy}>
            Continue with Apple
          </Button>
          <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "18px 0" }}>
            <span style={{ flex: 1, height: 1, background: "var(--wo-separator, #e2e8f0)" }} />
            <span style={{ fontSize: 12, color: "var(--wo-text-secondary, #5c6b7a)" }}>or</span>
            <span style={{ flex: 1, height: 1, background: "var(--wo-separator, #e2e8f0)" }} />
          </div>
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendCode()}
            style={input}
          />
          <Button variant="secondary" fullWidth onClick={sendCode} disabled={busy || !email.trim()}>
            {busy ? "Sending…" : "Email me a code"}
          </Button>
        </>
      ) : (
        <>
          <p style={{ color: "var(--wo-text-secondary, #5c6b7a)", marginBottom: 12, fontSize: 14 }}>
            Enter the code we emailed to <strong>{email}</strong>.
          </p>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 10))}
            onKeyDown={(e) => e.key === "Enter" && verify()}
            style={{ ...input, textAlign: "center", letterSpacing: "0.3em", fontSize: 20 }}
          />
          <Button variant="primary" fullWidth onClick={verify} disabled={busy || code.trim().length < 6}>
            {busy ? "Verifying…" : "Verify & sign in"}
          </Button>
          <button
            onClick={() => {
              setStage("email");
              setCode("");
              setError(null);
            }}
            style={{ background: "none", border: "none", color: "var(--wo-text-secondary, #5c6b7a)", cursor: "pointer", fontSize: 13, marginTop: 14 }}
          >
            Use a different email
          </button>
        </>
      )}

      {error ? <p style={{ color: "#e5484d", fontSize: 13, marginTop: 16 }}>{error}</p> : null}
    </main>
  );
}
