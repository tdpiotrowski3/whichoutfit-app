import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/session";
import { getFeatureSegment } from "@/lib/data";
import { admin } from "@/lib/supabase";
import { emailConfig, escapeHtml, sendMarketing, type Recipient } from "@/lib/email";
import { unsubscribeToken } from "@/lib/unsubscribe";

export const runtime = "nodejs";
export const maxDuration = 60;

// Admin-only. Sends a marketing nudge either as a single test (to a typed
// address) or to every opted-in user in a feature segment. Inert unless email
// env is configured.

type Body = {
  mode?: "test" | "segment";
  feature?: string;
  subject?: string;
  message?: string;
  testEmail?: string;
};

/** Build the email body HTML from the admin's plain-text message (escaped). */
function bodyHtml(message: string): string {
  return `<p style="margin:0 0 20px 0">${escapeHtml(message).replace(/\n/g, "<br/>")}</p>
<a href="https://whichoutfit.app" style="display:inline-block;background:#2E6BFF;background-image:linear-gradient(135deg,#2E6BFF 0%,#0FA3A3 100%);color:#FFFFFF;font-weight:700;font-size:14px;text-decoration:none;padding:12px 26px;border-radius:999px">Open WhichOutfit</a>`;
}

export async function POST(req: Request) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!emailConfig()) {
    return NextResponse.json({ error: "Email not configured" }, { status: 503 });
  }

  const body = (await req.json().catch(() => null)) as Body | null;
  const mode = body?.mode;
  const subject = body?.subject?.trim();
  const message = body?.message?.trim();
  if (!subject || !message) {
    return NextResponse.json({ error: "Subject and message are required" }, { status: 400 });
  }
  const html = bodyHtml(message);

  if (mode === "test") {
    const testEmail = body?.testEmail?.trim();
    if (!testEmail) return NextResponse.json({ error: "Test email is required" }, { status: 400 });
    // Token "test" never matches a real user, so the unsubscribe link is inert.
    const result = await sendMarketing({
      recipients: [{ email: testEmail, unsubscribeToken: unsubscribeToken("test") }],
      subject,
      bodyHtml: html,
    });
    return NextResponse.json({ mode, ...result });
  }

  if (mode === "segment") {
    const feature = body?.feature?.trim();
    if (!feature) return NextResponse.json({ error: "Feature is required" }, { status: 400 });

    const rows = await getFeatureSegment(feature);
    const targets = rows
      .filter((r) => r.opted_in)
      .map((r) => ({ userId: r.user_id, email: r.consent_email || r.email }))
      .filter((t): t is { userId: string; email: string } => !!t.email);

    if (targets.length === 0) {
      return NextResponse.json({ mode, sent: 0, failed: 0, errors: ["No emailable recipients in this segment"] });
    }

    const recipients: Recipient[] = targets.map((t) => ({
      email: t.email,
      unsubscribeToken: unsubscribeToken(t.userId),
    }));
    const result = await sendMarketing({ recipients, subject, bodyHtml: html });

    // Best-effort audit log — never fail the response if logging hiccups.
    if (result.sent > 0) {
      await admin()
        .from("marketing_sends")
        .insert(targets.map((t) => ({ user_id: t.userId, email: t.email, feature, subject })))
        .then(undefined, () => {});
    }

    return NextResponse.json({ mode, recipients: targets.length, ...result });
  }

  return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
}
