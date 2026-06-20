"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setLoading(false);
    if (res.ok) {
      router.replace("/");
      router.refresh();
    } else {
      setError("Incorrect password.");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl bg-white border border-[var(--wo-border)] p-8 shadow-sm">
        <div
          className="mb-1 text-2xl font-bold"
          style={{ background: "linear-gradient(120deg, var(--wo-blue), var(--wo-teal))", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}
        >
          WhichOutfit
        </div>
        <p className="mb-6 text-sm text-[var(--wo-muted)]">Admin dashboard — internal use only.</p>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          autoFocus
          className="w-full rounded-lg border border-[var(--wo-border)] px-3 py-2.5 text-sm outline-none focus:border-[var(--wo-blue)]"
        />
        {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
        <button
          type="submit"
          disabled={loading || !password}
          className="mt-4 w-full rounded-lg py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: "linear-gradient(120deg, var(--wo-blue), var(--wo-teal))" }}
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
