import { NextResponse } from "next/server";
import { draftIdeas } from "@/lib/contentEngine/planner";
import { engineAuthorized, errorMessage } from "@/lib/contentEngine/auth";

export const runtime = "nodejs";
export const maxDuration = 90;

// POST → the same drafting as the Monday cron and the Social tab's "Draft ideas
// now", for `./engine.py --draft` on the Mac.
export async function POST(req: Request) {
  if (!engineAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await draftIdeas());
  } catch (e) {
    return NextResponse.json({ error: errorMessage(e, "drafting failed") }, { status: 500 });
  }
}
