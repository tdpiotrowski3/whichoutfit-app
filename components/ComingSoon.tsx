const APP_STORE_URL = "https://apps.apple.com/us/app/whichoutfit/id6778094125";

// Shown on the consumer webapp routes while CONSUMER_WEBAPP_ENABLED is off
// (see lib/flags.ts): iOS is the live product, Android and web are coming soon.
export function ComingSoon() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--wo-bg, #f5f7fb)",
        padding: "48px 24px",
      }}
    >
      <div style={{ maxWidth: 440, textAlign: "center" }}>
        <p style={{ fontWeight: 800, fontSize: 20, color: "var(--wo-text, #10141b)", marginBottom: 24 }}>
          WhichOutfit
        </p>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: "var(--wo-text, #10141b)", marginBottom: 12 }}>
          The web app is coming soon.
        </h1>
        <p style={{ fontSize: 15, lineHeight: 1.6, color: "var(--wo-text-secondary, #5c6b7a)", marginBottom: 28 }}>
          We&apos;re polishing WhichOutfit for the web. In the meantime, your
          personal AI stylist is live on iPhone — same closet, same account.
        </p>
        <a
          href={APP_STORE_URL}
          style={{
            display: "inline-block",
            background: "var(--wo-text, #10141b)",
            color: "#fff",
            borderRadius: 12,
            padding: "12px 22px",
            fontSize: 15,
            fontWeight: 700,
            textDecoration: "none",
          }}
        >
          Download on the App Store
        </a>
        <p style={{ marginTop: 20, fontSize: 13, color: "var(--wo-text-secondary, #5c6b7a)" }}>
          Android &amp; web are on the way.
        </p>
      </div>
    </main>
  );
}
