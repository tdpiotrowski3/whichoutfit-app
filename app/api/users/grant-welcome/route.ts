import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/session";
import { admin } from "@/lib/supabase";

export const runtime = "nodejs";

// Admin-only. Grants a single user the "2 weeks free" welcome promo — 14 days
// Premium + 15 Photo Studio credits — and queues the in-app celebratory popup
// (so the user gets the surprise + the share-for-2-more nudge on next app open).
// Backed by admin_grant_welcome_promo(), which reuses the standard comp-code
// grant (idempotent per user) and logs it to the Redemptions analytics.
type Body = { userId?: string };

export async function POST(req: Request) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as Body | null;
  const userId = body?.userId?.trim();
  if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });

  const { data, error } = await admin().rpc("admin_grant_welcome_promo", { p_user_id: userId });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const res = (data ?? {}) as { ok?: boolean; reason?: string };
  if (res.ok) {
    return NextResponse.json({ ok: true, message: "2 weeks + 15 credits granted" });
  }
  const reason = res.reason ?? "invalid";
  const message =
    reason === "already" ? "Already has the welcome promo" : `Couldn't grant (${reason})`;
  return NextResponse.json({ ok: false, message });
}
