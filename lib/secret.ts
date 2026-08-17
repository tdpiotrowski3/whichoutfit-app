// The one place SESSION_SECRET is read.
//
// It signs two unrelated things — the admin session cookie (lib/session.ts) and
// marketing unsubscribe tokens (lib/unsubscribe.ts) — and each file used to
// resolve it independently. They drifted, which is exactly the failure this
// module exists to prevent: session.ts was hardened to fail closed in production
// while unsubscribe.ts kept an unconditional
//     process.env.SESSION_SECRET || "insecure-dev-secret-change-me"
// so an unset secret in production meant unsubscribe links were HMAC-signed with
// a string published in this repo, and anyone could forge or replay them.
//
// One definition, both callers. A future third caller gets the safe behaviour by
// default rather than by remembering to.

/**
 * The HMAC key, or null when it cannot be resolved safely.
 *
 * Outside production a fixed development value keeps local work frictionless.
 * In production a missing secret returns null — NEVER a fallback — so callers
 * fail closed. Deliberately not throwing here: the two call sites want different
 * failure shapes (minting must throw, verifying must reject), and that choice
 * belongs to them, not to this lookup.
 */
export function sessionSecret(): string | null {
  const s = process.env.SESSION_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV !== "production") return "insecure-dev-secret-change-me";
  return null;
}
