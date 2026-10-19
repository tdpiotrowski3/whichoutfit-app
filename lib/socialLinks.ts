// Campaign-link helpers for /go — the tracked link that goes in a caption, a
// bio, or a clip's end card. Kept out of the route file so the rules below are
// unit-testable; the route is a thin wrapper over them.

const APP_STORE_ID = "6778094125";
const PLAY_PACKAGE = "app.whichoutfit";

/**
 * Apple's App Analytics provider token (App Store Connect → App Analytics →
 * Campaigns → "Generate a campaign link", the pt= value). Not a secret. Apple
 * only counts a link as a campaign when BOTH pt and ct are present, so without
 * it the per-campaign downloads in App Analytics stay empty.
 */
function providerToken(): string | null {
  const pt = process.env.APPLE_PROVIDER_TOKEN?.trim();
  return pt && /^[0-9]+$/.test(pt) ? pt : null;
}

/**
 * The App Store listing. The destination is HARD-CODED on purpose: taking it
 * from a query parameter would turn our own domain into an open redirect,
 * which is precisely the primitive a phishing link wants to borrow.
 *
 * `ct` is Apple's campaign token and `pt` the provider token; together they
 * make App Analytics report impressions, downloads and sales per campaign,
 * which the daily App Store sync then pulls into the dashboard.
 */
export function appStoreURL(campaign: string | null, pt: string | null = providerToken()): string {
  const u = new URL(`https://apps.apple.com/us/app/whichoutfit/id${APP_STORE_ID}`);
  if (campaign && pt) u.searchParams.set("pt", pt);
  if (campaign) u.searchParams.set("ct", campaign);
  u.searchParams.set("mt", "8");
  return u.toString();
}

/**
 * The Google Play listing. Play passes `referrer` to the installed app through
 * the Install Referrer API, which is how the Android app reports exactly which
 * campaign link it was installed from.
 */
export function playStoreURL(campaign: string | null, source: string | null = null): string {
  const u = new URL("https://play.google.com/store/apps/details");
  u.searchParams.set("id", PLAY_PACKAGE);
  if (campaign) {
    const ref = new URLSearchParams({
      utm_source: source ?? platformFromCampaign(campaign) ?? "link",
      utm_medium: "social",
      utm_campaign: campaign,
    });
    u.searchParams.set("referrer", ref.toString());
  }
  return u.toString();
}

/** Android phones go to Play, everything else to the App Store. */
export function isAndroid(userAgent: string | null | undefined): boolean {
  return !!userAgent && /android/i.test(userAgent);
}

/** Where /go sends this visitor. */
export function storeURL(campaign: string | null, userAgent: string | null | undefined): string {
  return isAndroid(userAgent) ? playStoreURL(campaign) : appStoreURL(campaign);
}

/** Lowercase token, must start alphanumeric, 64 chars max. */
const CAMPAIGN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

/**
 * Anyone can hit /go with any `c`, so the value is constrained before it
 * becomes a database row. Junk returns null: the caller still redirects — a
 * dead link is a worse outcome than an uncounted click — it just isn't logged.
 */
export function cleanCampaign(v: string | null | undefined): string | null {
  if (!v) return null;
  const s = v.trim().toLowerCase();
  return CAMPAIGN.test(s) ? s : null;
}

/**
 * Campaigns are named "<platform>_<clip>" by the posting calendar, so both
 * parts fall out of the name and need no extra query parameters.
 */
export function platformFromCampaign(campaign: string): "instagram" | "tiktok" | null {
  if (campaign.startsWith("ig_") || campaign.startsWith("instagram")) return "instagram";
  if (campaign.startsWith("tiktok") || campaign.startsWith("tt_")) return "tiktok";
  return null;
}

export function clipFromCampaign(campaign: string): string | null {
  const i = campaign.indexOf("_");
  return i > 0 && i < campaign.length - 1 ? campaign.slice(i + 1) : null;
}
