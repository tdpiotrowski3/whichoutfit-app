import crypto from "crypto";

// Marketing unsubscribe tokens: an HMAC-signed user id embedded in every
// outgoing email's unsubscribe link + List-Unsubscribe header. Domain-separated
// from the admin session token (which signs "admin", see lib/session.ts) by the
// "unsub:" prefix, so the two token types share SESSION_SECRET but can never be
// swapped for one another.

// Fail closed in production, same as lib/session.ts: a missing secret must never
// silently fall back to a value anyone can read in this repo, or every
// unsubscribe link becomes forgeable for any user id.
function secret(): string | null {
  const s = process.env.SESSION_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV !== "production") return "insecure-dev-secret-change-me";
  return null;
}

function mac(userId: string): string | null {
  const key = secret();
  if (!key) return null;
  return crypto.createHmac("sha256", key).update("unsub:" + userId).digest("hex");
}

export function unsubscribeToken(userId: string): string {
  const m = mac(userId);
  // Throw rather than mint an unsignable token: a send that would embed
  // forgeable links should fail loudly, not go out.
  if (!m) throw new Error("SESSION_SECRET is not set");
  return `${userId}.${m}`;
}

/** Returns the user id if the token is valid, else null. */
export function verifyUnsubscribeToken(token?: string | null): string | null {
  if (!token) return null;
  const idx = token.lastIndexOf(".");
  if (idx < 0) return null;
  const userId = token.slice(0, idx);
  const given = token.slice(idx + 1);
  const expected = mac(userId);
  if (!expected) return null;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return userId;
}
