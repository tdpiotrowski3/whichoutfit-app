import { NextResponse } from "next/server";
import { speak, GeminiError } from "@/lib/contentEngine/gemini";
import { engineAuthorized, errorMessage } from "@/lib/contentEngine/auth";

export const runtime = "nodejs";
export const maxDuration = 60;

// POST {line} → {pcm, sampleRate, model}: one narration line, spoken. The
// Gemini key stays on the server; the Mac only ever sees audio. One line per
// request keeps every response far under Vercel's body limit.
//
// A per-minute 429 comes back as a 429 with Retry-After so the Mac waits and
// retries. The daily quota never reaches here — speak() moves to the next model.
export async function POST(req: Request) {
  if (!engineAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { line } = (await req.json().catch(() => ({}))) as { line?: string };
  if (!line?.trim() || line.length > 400) {
    return NextResponse.json({ error: "Need a line of narration (1–400 chars)." }, { status: 400 });
  }
  try {
    return NextResponse.json(await speak(line.trim()));
  } catch (e) {
    if (e instanceof GeminiError && e.status === 429) {
      const wait = Math.ceil(e.retryAfter ?? 20);
      return NextResponse.json({ error: "rate limited", retryAfter: wait }, { status: 429, headers: { "retry-after": String(wait) } });
    }
    return NextResponse.json({ error: errorMessage(e, "speech failed") }, { status: 502 });
  }
}
