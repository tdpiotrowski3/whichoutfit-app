import { Resend } from "resend";

// Resend-backed marketing email. The whole feature is INERT until these four
// env vars are set (so nothing can send by accident in an unconfigured env):
//   RESEND_API_KEY            – Resend API key
//   EMAIL_FROM                – verified sender, e.g. "WhichOutfit <hello@whichoutfit.app>"
//   MARKETING_PHYSICAL_ADDRESS– postal address (required in every marketing email by CAN-SPAM)
//   PUBLIC_BASE_URL           – stable https origin that serves /api/unsubscribe

export type EmailConfig = { from: string; address: string; baseUrl: string };

export function emailConfig(): EmailConfig | null {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  const address = process.env.MARKETING_PHYSICAL_ADDRESS;
  const baseUrl = process.env.PUBLIC_BASE_URL?.replace(/\/$/, "");
  if (!key || !from || !address || !baseUrl) return null;
  return { from, address, baseUrl };
}

export function isEmailConfigured(): boolean {
  return emailConfig() !== null;
}

function client(): Resend {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY not set");
  return new Resend(key);
}

/** Minimal HTML escape for admin-authored plain-text bodies. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type Recipient = { email: string; unsubscribeToken: string };
export type SendResult = { sent: number; failed: number; errors: string[] };

function unsubscribeUrl(baseUrl: string, token: string): string {
  return `${baseUrl}/api/unsubscribe?token=${encodeURIComponent(token)}`;
}

/** Wrap the admin's message with the compliant footer (postal address + unsubscribe). */
function wrap(bodyHtml: string, unsubUrl: string, address: string): string {
  return `<div style="font-family:system-ui,-apple-system,sans-serif;font-size:15px;line-height:1.6;color:#10141b">
${bodyHtml}
<hr style="margin:28px 0 12px;border:none;border-top:1px solid #e2e8f0" />
<p style="font-size:12px;color:#5c6b7a;line-height:1.5">
You're receiving this because you opted in to WhichOutfit emails.
<a href="${unsubUrl}" style="color:#5c6b7a">Unsubscribe</a>.<br/>
${escapeHtml(address)}
</p>
</div>`;
}

/**
 * Send one marketing email per recipient (each with its own unsubscribe link +
 * RFC 8058 one-click List-Unsubscribe headers), batched 100 at a time via
 * Resend's batch API. Throws only if email isn't configured; per-batch send
 * failures are tallied into the result.
 */
export async function sendMarketing(opts: {
  recipients: Recipient[];
  subject: string;
  bodyHtml: string;
}): Promise<SendResult> {
  const cfg = emailConfig();
  if (!cfg) throw new Error("Email not configured");
  const resend = client();

  const result: SendResult = { sent: 0, failed: 0, errors: [] };
  for (let i = 0; i < opts.recipients.length; i += 100) {
    const chunk = opts.recipients.slice(i, i + 100);
    const messages = chunk.map((r) => {
      const unsubUrl = unsubscribeUrl(cfg.baseUrl, r.unsubscribeToken);
      return {
        from: cfg.from,
        to: r.email,
        subject: opts.subject,
        html: wrap(opts.bodyHtml, unsubUrl, cfg.address),
        headers: {
          "List-Unsubscribe": `<${unsubUrl}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      };
    });
    const { error } = await resend.batch.send(messages);
    if (error) {
      result.failed += chunk.length;
      result.errors.push(error.message);
    } else {
      result.sent += chunk.length;
    }
  }
  return result;
}
