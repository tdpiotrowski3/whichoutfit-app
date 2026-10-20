// The engine API (app/api/engine/*) is called by the Mac render command, not a
// browser, so it takes a bearer secret. It has its OWN secret, ENGINE_SECRET,
// rather than reusing CRON_SECRET: the Mac holds it (Keychain service
// "whichoutfit-engine"), and a laptop is a worse place to keep the key to every
// cron route than the key to this one API. Unset = fail closed.
export function engineAuthorized(req: Request): boolean {
  const secret = process.env.ENGINE_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

/** Vercel's cron sends CRON_SECRET; same scheme as the other cron routes. */
export function cronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

/**
 * A readable message for any thrown value. Supabase errors are plain objects
 * with a `message`, not Error instances, so `e instanceof Error` alone turns
 * them into an anonymous "failed" — which is exactly how the first closet seed
 * hid a primary-key mismatch.
 */
export function errorMessage(e: unknown, fallback = "failed"): string {
  if (e instanceof Error) return e.message || fallback;
  if (e && typeof e === "object" && "message" in e && typeof (e as { message: unknown }).message === "string") {
    const o = e as { message: string; details?: string; hint?: string; code?: string };
    return [o.message, o.details, o.hint, o.code && `(${o.code})`].filter(Boolean).join(" — ");
  }
  return typeof e === "string" ? e : fallback;
}
