import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Server-side proxy to the Supabase `ai` edge function. The browser must NEVER
// hold the app shared secret, so the consumer webapp posts {system, prompt} here
// with the signed-in user's Supabase access token (Authorization: Bearer …); this
// route adds the secret and forwards the JWT so the edge function meters per user.
// Mirrors the iOS AIService wire contract exactly (same body + headers).
const AI_FN_PATH = "/functions/v1/ai";

export async function POST(req: Request) {
  const base = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) {
    return NextResponse.json({ error: "AI is not configured." }, { status: 503 });
  }
  // Same dual-name convention as the edge function (AI_APP_SECRET ?? APP_SHARED_SECRET).
  const secret = process.env.AI_APP_SECRET ?? process.env.APP_SHARED_SECRET;
  const auth = req.headers.get("authorization");
  const kind = req.headers.get("x-ai-kind") === "tagging" ? "tagging" : "stylist";

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const headers: Record<string, string> = { "Content-Type": "application/json", "x-ai-kind": kind };
  if (secret) headers["x-app-secret"] = secret;
  if (auth) headers["authorization"] = auth;

  let upstream: Response;
  try {
    upstream = await fetch(base + AI_FN_PATH, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  } catch {
    return NextResponse.json({ error: "The AI service is unavailable. Please try again." }, { status: 503 });
  }

  // Pass the edge function's status + JSON body straight through ({text} on 200,
  // {error} on 401/402/503) so the client can react to each case.
  const text = await upstream.text();
  return new NextResponse(text, {
    status: upstream.status,
    headers: { "Content-Type": "application/json" },
  });
}
