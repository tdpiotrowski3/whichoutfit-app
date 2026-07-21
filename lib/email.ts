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

// Brand tokens mirrored from public/style.css (blue→teal gradient, ink text,
// light canvas). Email HTML must be table-based with inline styles: many clients
// (notably Outlook) strip <style> blocks, flexbox, and unknown CSS.
const FONT = "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const GRADIENT = "linear-gradient(135deg,#2E6BFF 0%,#0FA3A3 100%)";

/**
 * Wrap the admin's message in the WhichOutfit-branded shell (logo header,
 * gradient accent, surface card) plus the CAN-SPAM footer (postal address +
 * unsubscribe). `baseUrl` serves the hosted app icon used as the logo mark.
 */
function wrap(bodyHtml: string, unsubUrl: string, address: string, baseUrl: string): string {
  const logo = `${baseUrl}/apple-touch-icon.png`;
  return `<!--[if mso]><style>body,table,td{font-family:Arial,Helvetica,sans-serif !important}</style><![endif]-->
<div style="display:none;max-height:0;overflow:hidden;opacity:0">WhichOutfit — the digital closet that builds your outfits for you.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F5F7FB;margin:0;padding:0;width:100%">
  <tr>
    <td align="center" style="padding:32px 16px">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:#FFFFFF;border:1px solid #E2E8F0;border-radius:20px;overflow:hidden">
        <!-- gradient accent bar -->
        <tr><td style="height:5px;line-height:5px;font-size:0;background:#2E6BFF;background-image:${GRADIENT}">&nbsp;</td></tr>
        <!-- header / logo -->
        <tr>
          <td style="padding:26px 32px 22px 32px;border-bottom:1px solid #EEF2F8">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="padding-right:12px;vertical-align:middle">
                  <img src="${logo}" width="40" height="40" alt="WhichOutfit" style="display:block;width:40px;height:40px;border-radius:11px" />
                </td>
                <td style="vertical-align:middle">
                  <span style="font-family:${FONT};font-size:22px;font-weight:800;letter-spacing:-.02em;color:#10141B">Which<span style="color:#0FA3A3">Outfit</span></span>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <!-- body -->
        <tr>
          <td style="padding:34px 32px 30px 32px;font-family:${FONT};font-size:15px;line-height:1.65;color:#10141B">
${bodyHtml}
          </td>
        </tr>
        <!-- footer -->
        <tr>
          <td style="padding:22px 32px 28px 32px;border-top:1px solid #EEF2F8;background:#F5F7FB">
            <p style="margin:0;font-family:${FONT};font-size:12px;line-height:1.6;color:#5C6B7A">
              You're receiving this because you opted in to WhichOutfit emails.
              <a href="${unsubUrl}" style="color:#2E6BFF;text-decoration:underline">Unsubscribe</a>.<br/>
              <span style="color:#C4CDD8">${escapeHtml(address)}</span>
            </p>
          </td>
        </tr>
      </table>
      <!-- wordmark under the card -->
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px">
        <tr>
          <td align="center" style="padding:18px 16px 4px 16px;font-family:${FONT};font-size:12px;color:#9AA7B6">
            Which<span style="color:#5C6B7A">Outfit</span> &middot; your smart digital closet
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;
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
        html: wrap(opts.bodyHtml, unsubUrl, cfg.address, cfg.baseUrl),
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
