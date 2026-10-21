import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/session";
import { authorizeUrl, isTikTokAppConfigured, newState } from "@/lib/tiktokDisplay";

export const runtime = "nodejs";

// Start connecting the TikTok account: admin only. The state cookie ties the
// callback to this browser, so a forged callback can't swap in another account.
export async function GET(req: Request) {
  if (!(await isAuthed())) return NextResponse.redirect(new URL("/login", req.url));
  if (!isTikTokAppConfigured()) return NextResponse.redirect(new URL("/social?tiktok=not_configured", req.url));
  const state = newState();
  const res = NextResponse.redirect(authorizeUrl(state));
  res.cookies.set("wo_tiktok_state", state, { httpOnly: true, secure: true, sameSite: "lax", path: "/api/tiktok", maxAge: 600 });
  return res;
}
