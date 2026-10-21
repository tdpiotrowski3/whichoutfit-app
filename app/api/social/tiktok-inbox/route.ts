import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/session";
import { admin } from "@/lib/supabase";
import { sendToInbox } from "@/lib/tiktokDisplay";

export const runtime = "nodejs";
export const maxDuration = 60;

// The calendar's "Send to TikTok": drop one post's clip into the TikTok inbox
// as a draft right now, instead of waiting for the morning reminder. Admin only.
export async function POST(req: Request) {
  if (!(await isAuthed())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = (await req.json().catch(() => ({}))) as { id?: string };
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const db = admin();
  const { data, error } = await db.from("social_posts").select("id,platform,status,video_url").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const row = data as { id: string; platform: string; status: string; video_url: string | null } | null;
  if (!row || row.platform !== "tiktok") return NextResponse.json({ error: "not a TikTok post" }, { status: 404 });
  if (!row.video_url) return NextResponse.json({ error: "this post has no clip yet" }, { status: 400 });
  try {
    const publishId = await sendToInbox(row.video_url);
    await db.from("social_posts").update({ container_id: publishId }).eq("id", id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
