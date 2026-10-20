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
