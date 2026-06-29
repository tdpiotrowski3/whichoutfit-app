// Single source for the HMAC signing secret shared by the admin session token
// (lib/session.ts) and marketing unsubscribe tokens (lib/unsubscribe.ts).
//
// Fail closed: in production a missing SESSION_SECRET throws rather than falling
// back to a hardcoded value — otherwise the signing key would be public and
// anyone could forge admin cookies / unsubscribe links. The dev fallback only
// applies outside production so local work doesn't need the env var set.
export function sessionSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET must be set in production");
  }
  return "insecure-dev-secret-change-me";
}
