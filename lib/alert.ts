import { Resend } from "resend";

// Internal ops alerts (owner-to-owner), separate from the marketing pipeline in
// lib/email.ts. INERT until all three are set, so nothing sends by accident:
//   RESEND_API_KEY     – Resend API key (shared with marketing)
//   EMAIL_FROM         – verified sender (shared with marketing)
//   ADMIN_ALERT_EMAIL  – where ops alerts land (e.g. Tyler's inbox)
function alertConfig(): { from: string; to: string; key: string } | null {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  const to = process.env.ADMIN_ALERT_EMAIL;
  if (!key || !from || !to) return null;
  return { from, to, key };
}

export function isAlertConfigured(): boolean {
  return alertConfig() !== null;
}

export type AlertResult = { sent: boolean; reason?: string };

/**
 * Send a single plain ops alert to the admin. No unsubscribe footer / postal
 * address — this is a transactional notification to the owner, not marketing.
 * Never throws: returns `{ sent: false, reason }` when unconfigured or on error,
 * so callers (e.g. a cron) can fire-and-report without wrapping in try/catch.
 */
export async function sendAdminAlert(subject: string, bodyHtml: string): Promise<AlertResult> {
  const cfg = alertConfig();
  if (!cfg) return { sent: false, reason: "alert email not configured" };
  try {
    const resend = new Resend(cfg.key);
    const { error } = await resend.emails.send({
      from: cfg.from,
      to: cfg.to,
      subject,
      html: `<div style="font-family:system-ui,-apple-system,sans-serif;font-size:15px;line-height:1.6;color:#10141b">${bodyHtml}</div>`,
    });
    if (error) return { sent: false, reason: error.message };
    return { sent: true };
  } catch (e) {
    return { sent: false, reason: e instanceof Error ? e.message : "send failed" };
  }
}
