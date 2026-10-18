// Campaign-link helpers for /go — the tracked link that goes in a caption, a
// bio, or a clip's end card. Kept out of the route file so both rules below are
// unit-testable; the route is a thin wrapper over them.

const APP_STORE_ID = "6778094125";

/**
 * Where /go sends people. The destination is HARD-CODED on purpose: taking it
 * from a query parameter would turn our own domain into an open redirect, which
 * is precisely the primitive a phishing link wants to borrow.
 *
 * `ct` is Apple's campaign token — it comes back verbatim in App Store Connect
 * under App Analytics → Campaigns, which is what lets a click on one of our
 * posts be joined to the install it produced.
 */
export function appStoreURL(campaign: string | null): string {
  const u = new URL(`https://apps.apple.com/us/app/whichoutfit/id${APP_STORE_ID}`);
  if (campaign) u.searchParams.set("ct", campaign);
  u.searchParams.set("mt", "8");
  return u.toString();
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
