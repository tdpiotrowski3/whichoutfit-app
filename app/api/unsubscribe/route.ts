import { NextResponse } from "next/server";
import { admin } from "@/lib/supabase";
import { verifyUnsubscribeToken } from "@/lib/unsubscribe";

export const runtime = "nodejs";

// Public, token-gated unsubscribe. No admin auth — the recipient is acting on
// their own consent and the signed token IS the authorization.
//
// GET never mutates: it only renders a confirm page. This matters because mail
// security scanners and link prefetchers fetch URLs in emails — a GET that
// unsubscribed would silently opt people out. The actual opt-out happens on
// POST, which serves both the manual "Unsubscribe" button AND the RFC 8058
// one-click List-Unsubscribe-Post that mail clients fire automatically.

async function optOut(userId: string): Promise<boolean> {
  const { error } = await admin()
    .from("marketing_consent")
    .update({ opted_in: false, updated_at: new Date().toISOString() })
    .eq("user_id", userId);
  return !error;
}

function page(heading: string, message: string, status: number, formAction?: string): NextResponse {
  const button = formAction
    ? `<form method="POST" action="${formAction}" style="margin-top:20px">
         <button type="submit" style="background:#2E6BFF;color:#fff;border:none;border-radius:14px;padding:12px 20px;font-size:15px;font-weight:600;cursor:pointer">Unsubscribe</button>
       </form>`
    : "";
  const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${heading}</title></head>
<body style="font-family:system-ui,-apple-system,sans-serif;max-width:480px;margin:80px auto;padding:0 24px;text-align:center;color:#10141b">
<h1 style="font-size:20px">${heading}</h1>
<p style="color:#5c6b7a;line-height:1.6">${message}</p>
${button}
</body></html>`;
  return new NextResponse(html, { status, headers: { "content-type": "text/html; charset=utf-8" } });
}

// Link click in the email body → confirmation page (no mutation).
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  const userId = verifyUnsubscribeToken(token);
  if (!userId) return page("Link error", "This unsubscribe link is invalid or has expired.", 400);
  return page(
    "Unsubscribe from WhichOutfit emails?",
    "Click below to stop receiving marketing emails. You can re-enable them anytime in the app under More.",
    200,
    `/api/unsubscribe?token=${encodeURIComponent(token!)}`,
  );
}

// Performs the opt-out. Mail clients (one-click) get JSON; the browser form
// submit (Accept: text/html) gets a confirmation page.
export async function POST(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  const userId = verifyUnsubscribeToken(token);
  const wantsHtml = (req.headers.get("accept") ?? "").includes("text/html");

  if (!userId) {
    return wantsHtml
      ? page("Link error", "This unsubscribe link is invalid or has expired.", 400)
      : NextResponse.json({ error: "Invalid token" }, { status: 400 });
  }

  await optOut(userId);
  return wantsHtml
    ? page("Unsubscribed", "You've been unsubscribed from WhichOutfit marketing emails. You can re-enable them anytime in the app under More.", 200)
    : NextResponse.json({ ok: true });
}
