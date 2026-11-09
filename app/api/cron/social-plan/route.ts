import { NextResponse } from "next/server";
import { runSocialPlan } from "@/lib/contentEngine/planner";
import { cronAuthorized } from "@/lib/contentEngine/auth";
import { socialPaused } from "@/lib/socialPause";

export const runtime = "nodejs";
// One Gemini call to draft ideas, one for re-post captions, then the digest.
export const maxDuration = 120;

// Weekly (vercel.json, Mondays): top up the queue, draft ideas, email the digest.
// See lib/contentEngine/planner.ts.
export async function GET(req: Request) {
  if (!cronAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Paused before a launch: drafting now would make clips of the old app.
  if (socialPaused("whichoutfit")) return NextResponse.json({ ok: true, paused: true });
  const result = await runSocialPlan(new Date());
  const ok = !("error" in result.refill) && !("error" in result.ideas);
  return NextResponse.json({ ok, ...result });
}
