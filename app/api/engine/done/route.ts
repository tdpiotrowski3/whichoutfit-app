import { NextResponse } from "next/server";
import { completeIdea } from "@/lib/contentEngine/planner";
import { engineAuthorized, errorMessage } from "@/lib/contentEngine/auth";

export const runtime = "nodejs";

const PUBLIC_PREFIX = `${process.env.SUPABASE_URL}/storage/v1/object/public/social-clips/engine/`;

// POST {id, video_url} → {clip_id, scheduled_for}: the clip is uploaded, so
// book it into the next free slot (Instagram queued for the publisher, TikTok
// as 'manual' for the morning reminder). Safe to repeat — see completeIdea.
export async function POST(req: Request) {
  if (!engineAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, video_url } = (await req.json().catch(() => ({}))) as { id?: string; video_url?: string };
  if (!id || !video_url) return NextResponse.json({ error: "Need id and video_url." }, { status: 400 });
  // Only our own bucket: this URL is handed to Instagram to fetch and publish.
  if (!video_url.startsWith(PUBLIC_PREFIX)) {
    return NextResponse.json({ error: "video_url must be in the social-clips bucket." }, { status: 400 });
  }
  try {
    return NextResponse.json(await completeIdea(id, video_url));
  } catch (e) {
    return NextResponse.json({ error: errorMessage(e, "could not book the clip") }, { status: 500 });
  }
}
