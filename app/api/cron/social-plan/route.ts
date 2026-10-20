import { NextResponse } from "next/server";
import { runSocialPlan } from "@/lib/contentEngine/planner";
import { cronAuthorized } from "@/lib/contentEngine/auth";

export const runtime = "nodejs";
// One Gemini call to draft ideas, one for re-post captions, then the digest.
export const maxDuration = 120;

// Weekly (vercel.json, Mondays): top up the queue, draft ideas, email the digest.
// See lib/contentEngine/planner.ts.
export async function GET(req: Request) {
  if (!cronAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await runSocialPlan(new Date());
  const ok = !("error" in result.refill) && !("error" in result.ideas);
  return NextResponse.json({ ok, ...result });
}
