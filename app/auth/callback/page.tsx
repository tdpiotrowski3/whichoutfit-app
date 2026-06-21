"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { consumerClient } from "@/lib/consumer";

// OAuth return target. With the implicit flow + detectSessionInUrl, the client
// parses the session from the URL hash automatically on load — we just wait for
// it and route to the closet. (No PKCE code-exchange, so no "flow state" errors.)
export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const sb = consumerClient();
    if (!sb) {
      setError("Not configured");
      return;
    }

    // Surface any error the provider returned in the URL hash.
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const providerError = hash.get("error_description") ?? hash.get("error");
    if (providerError) {
      setError(providerError);
      return;
    }

    let done = false;
    const go = () => {
      if (!done) {
        done = true;
        router.replace("/closet");
      }
    };

    const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
      if (session) go();
    });
    // Covers the case where the session was set before we subscribed.
    sb.auth.getSession().then(({ data }) => {
      if (data.session) go();
    });

    const timeout = setTimeout(() => {
      if (!done) setError("Sign-in timed out — please try again.");
    }, 10000);

    return () => {
      sub.subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, [router]);

  return (
    <main style={{ maxWidth: 380, margin: "0 auto", padding: "96px 24px", textAlign: "center" }}>
      <p style={{ color: error ? "#e5484d" : "var(--wo-text-secondary, #5c6b7a)" }}>
        {error ? `Sign-in failed: ${error}` : "Signing you in…"}
      </p>
    </main>
  );
}
