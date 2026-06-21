import crypto from "crypto";

// Marketing unsubscribe tokens: an HMAC-signed user id embedded in every
// outgoing email's unsubscribe link + List-Unsubscribe header. Domain-separated
// from the admin session token (which signs "admin", see lib/session.ts) by the
// "unsub:" prefix, so the two token types share SESSION_SECRET but can never be
// swapped for one another.

function secret(): string {
  return process.env.SESSION_SECRET || "insecure-dev-secret-change-me";
}

function mac(userId: string): string {
  return crypto.createHmac("sha256", secret()).update("unsub:" + userId).digest("hex");
}

export function unsubscribeToken(userId: string): string {
  return `${userId}.${mac(userId)}`;
}

/** Returns the user id if the token is valid, else null. */
export function verifyUnsubscribeToken(token?: string | null): string | null {
  if (!token) return null;
  const idx = token.lastIndexOf(".");
  if (idx < 0) return null;
  const userId = token.slice(0, idx);
  const given = token.slice(idx + 1);
  const expected = mac(userId);
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return userId;
}
