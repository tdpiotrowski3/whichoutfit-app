"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { consumerClient } from "@/lib/consumer";

// OAuth return target. Exchanges the PKCE code for a session, then sends the
// user to their closet. Client-side so it works with the browser Supabase client.
export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const sb = consumerClient();
    if (!sb) {
      setError("Not configured");
      return;
    }
    sb.auth.exchangeCodeForSession(window.location.href).then(({ error }) => {
      if (error) setError(error.message);
      else router.replace("/closet");
    });
  }, [router]);

  return (
    <main style={{ maxWidth: 380, margin: "0 auto", padding: "96px 24px", textAlign: "center" }}>
      <p style={{ color: error ? "#e5484d" : "var(--wo-text-secondary, #5c6b7a)" }}>
        {error ? `Sign-in failed: ${error}` : "Signing you in…"}
      </p>
    </main>
  );
}
