import { NextResponse } from "next/server";
import { engineAuthorized } from "@/lib/contentEngine/auth";
import { socialHealth } from "@/lib/socialHealth";

export const runtime = "nodejs";

// GET → each social connection's state with the APIs' own error text, for the
// Mac tooling. The dashboard shows the same on Social & Ads → Connections.
// Never returns tokens.
export async function GET(req: Request) {
  if (!engineAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ connections: await socialHealth() });
}
