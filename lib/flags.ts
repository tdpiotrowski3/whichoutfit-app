// Server-only feature flags. Read these in Server Components or proxy.ts —
// they are plain env vars (no NEXT_PUBLIC_ prefix) so they never ship to the
// browser bundle.

/**
 * The consumer webapp (app.whichoutfit.app) is hidden while the focus is on
 * growing iOS — its routes render the ComingSoon page instead. The code
 * underneath stays intact and working for the cross-platform build-out: set
 * CONSUMER_WEBAPP_ENABLED=true (Vercel env or .env.local) and redeploy to
 * bring it back. Pages are prerendered, so the flag is read at build time.
 */
export function consumerWebappEnabled(): boolean {
  return process.env.CONSUMER_WEBAPP_ENABLED === "true";
}
