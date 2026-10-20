import { NextResponse } from "next/server";
import { admin } from "@/lib/supabase";
import { engineAuthorized } from "@/lib/contentEngine/auth";

export const runtime = "nodejs";

const BUCKET = "social-clips";

// POST {id} → {uploadUrl, publicUrl}: a one-time signed URL the Mac PUTs the
// finished mp4 to, so the video never passes through a Vercel function (whose
// request body tops out far below a 20MB clip). Same public bucket as the
// hand-made set, under engine/.
export async function POST(req: Request) {
  if (!engineAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = (await req.json().catch(() => ({}))) as { id?: string };
  if (!id || !/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: "Need an idea id." }, { status: 400 });

  const path = `engine/${id}.mp4`;
  const storage = admin().storage.from(BUCKET);
  const { data, error } = await storage.createSignedUploadUrl(path, { upsert: true });
  if (error || !data) return NextResponse.json({ error: error?.message ?? "could not sign upload" }, { status: 500 });
  const { data: pub } = storage.getPublicUrl(path);
  return NextResponse.json({ uploadUrl: data.signedUrl, publicUrl: pub.publicUrl });
}
