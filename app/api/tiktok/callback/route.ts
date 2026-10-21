import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { isAuthed } from "@/lib/session";
import { exchangeCode } from "@/lib/tiktokDisplay";

export const runtime = "nodejs";

// TikTok sends the owner back here after they approve the app. Checks the
// session and the state cookie from /api/tiktok/connect, stores the tokens,
// then lands on the Social page with the outcome in the URL.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const back = (outcome: string) => {
    const res = NextResponse.redirect(new URL(`/social?tiktok=${outcome}`, req.url));
    res.cookies.delete({ name: "wo_tiktok_state", path: "/api/tiktok" });
    return res;
  };
  if (!(await isAuthed())) return NextResponse.redirect(new URL("/login", req.url));
  const jar = await cookies();
  const state = url.searchParams.get("state");
  if (!state || state !== jar.get("wo_tiktok_state")?.value) return back("bad_state");
  if (url.searchParams.get("error")) return back("denied");
  const code = url.searchParams.get("code");
  if (!code) return back("no_code");
  try {
    await exchangeCode(code);
    return back("connected");
  } catch (e) {
    console.error("tiktok callback:", (e as Error).message);
    return back("failed");
  }
}
