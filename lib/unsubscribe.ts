import crypto from "crypto";
import { sessionSecret } from "./secret";

// Marketing unsubscribe tokens: an HMAC-signed user id embedded in every
// outgoing email's unsubscribe link + List-Unsubscribe header. Domain-separated
// from the admin session token (which signs "admin", see lib/session.ts) by the
// "unsub:" prefix, so the two token types share SESSION_SECRET but can never be
// swapped for one another.
//
// FAILS CLOSED, and asymmetrically on purpose (same shape as lib/session.ts):
// minting THROWS, verifying REJECTS. This file previously resolved the secret
// itself with an unconditional `|| "insecure-dev-secret-change-me"`, so an unset
// SESSION_SECRET in production signed these with a string published in this repo
// — forgeable and replayable by anyone who read it.

function mac(userId: string, key: string): string {
  return crypto.createHmac("sha256", key).update("unsub:" + userId).digest("hex");
}

/**
 * Mint the token for one user's unsubscribe link.
 *
 * Throws when the secret is missing rather than returning a token signed with a
 * public string. The caller is the marketing send path, so the right failure is
 * a send that stops loudly: an email carrying a forgeable unsubscribe link is
 * worse than an email that never went out, and it cannot be recalled once sent.
 */
export function unsubscribeToken(userId: string): string {
  const key = sessionSecret();
  if (!key) throw new Error("SESSION_SECRET is not set");
  return `${userId}.${mac(userId, key)}`;
}

/** Returns the user id if the token is valid, else null. */
export function verifyUnsubscribeToken(token?: string | null): string | null {
  if (!token) return null;
  const key = sessionSecret();
  if (!key) return null;
  const idx = token.lastIndexOf(".");
  if (idx < 0) return null;
  const userId = token.slice(0, idx);
  const given = token.slice(idx + 1);
  const expected = mac(userId, key);
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  // Length check first: timingSafeEqual throws on a length mismatch, and && is
  // the short-circuit that keeps it from ever seeing one.
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return userId;
}
