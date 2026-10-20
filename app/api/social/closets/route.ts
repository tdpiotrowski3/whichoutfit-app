import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/session";
import { errorMessage } from "@/lib/contentEngine/auth";
import { cloneCloset } from "@/lib/contentEngine/personaAccounts";
import { getPersona } from "@/lib/contentEngine/personas";

export const runtime = "nodejs";
export const maxDuration = 120;

// POST {persona, offset} → one batch of "refresh the copy of the owner's closet".
// The Content Studio button calls it until `next` is null, so no single request
// runs long. Same copy as `./engine.py --clone-closet`; the owner is only read.
export async function POST(req: Request) {
  if (!(await isAuthed())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { persona, offset } = (await req.json().catch(() => ({}))) as { persona?: string; offset?: number };
  if (!persona || !getPersona(persona)?.cloneFrom) {
    return NextResponse.json({ error: "Only a copied closet can be refreshed." }, { status: 400 });
  }
  try {
    return NextResponse.json(await cloneCloset(persona, Math.max(0, Number(offset) || 0)));
  } catch (e) {
    return NextResponse.json({ error: errorMessage(e, "refresh failed") }, { status: 500 });
  }
}
