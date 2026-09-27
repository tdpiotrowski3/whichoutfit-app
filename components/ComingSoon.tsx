const APP_STORE_URL = "https://apps.apple.com/us/app/whichoutfit/id6778094125";
const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=app.whichoutfit";

const storeButton = {
  display: "inline-block",
  background: "var(--wo-text, #10141b)",
  color: "#fff",
  borderRadius: 12,
  padding: "12px 22px",
  fontSize: 15,
  fontWeight: 700,
  textDecoration: "none",
} as const;

// Shown on the consumer webapp routes while CONSUMER_WEBAPP_ENABLED is off
// (see lib/flags.ts). iOS and Android are both live products now — Android
// reached the Play Store 2026-08; only the web app is still coming soon.
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
        <p
          style={{
            display: "inline-block",
            background: "linear-gradient(90deg, #2E6BFF, #0FA3A3)",
            color: "#fff",
            borderRadius: 999,
            padding: "6px 14px",
            fontSize: 13,
            fontWeight: 700,
            marginBottom: 16,
          }}
        >
          Now on Android
        </p>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: "var(--wo-text, #10141b)", marginBottom: 12 }}>
          The web app is coming soon.
        </h1>
        <p style={{ fontSize: 15, lineHeight: 1.6, color: "var(--wo-text-secondary, #5c6b7a)", marginBottom: 28 }}>
          We&apos;re polishing WhichOutfit for the web. In the meantime, your
          personal AI stylist is live on iPhone and Android — same closet, same
          account, whichever phone you pick up.
        </p>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            justifyContent: "center",
          }}
        >
          <a href={APP_STORE_URL} style={storeButton}>
            Download on the App Store
          </a>
          <a href={PLAY_STORE_URL} style={storeButton}>
            Get it on Google Play
          </a>
        </div>
        <p style={{ marginTop: 20, fontSize: 13, color: "var(--wo-text-secondary, #5c6b7a)" }}>
          The web app is on the way.
        </p>
      </div>
    </main>
  );
}
