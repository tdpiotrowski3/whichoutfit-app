import { NextResponse } from "next/server";
import { admin } from "@/lib/supabase";
import { appStoreURL, cleanCampaign, clipFromCampaign, platformFromCampaign } from "@/lib/socialLinks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// whichoutfit.app/go?c=<campaign> — the tracked link for captions, bios and
// end cards.
//
// It does two things: writes one row to public.social_clicks, then 302s to the
// App Store carrying ct=<campaign>. That pairing is the whole point — clicks
// are the input we can count ourselves, installs are the outcome only Apple
// reports, and `campaign` is the only thing that joins the two. Before this
// there was no link at all between a post going out and a download arriving.
//
//   /go?c=ig_12_scan_item
//   /go?c=tiktok_bio
//
// The redirect target is fixed in lib/socialLinks.ts — see the note there on
// why it never comes from the query string.

export async function GET(req: Request) {
  const url = new URL(req.url);
  const campaign = cleanCampaign(url.searchParams.get("c"));
  const platformHint = cleanCampaign(url.searchParams.get("p"));

  if (campaign) {
    try {
      await admin().from("social_clicks").insert({
        campaign,
        platform: platformHint ?? platformFromCampaign(campaign),
        clip_id: clipFromCampaign(campaign),
        // Coarse context only — no IP, no device id. This measures which POST
        // worked, not who clicked.
        referrer: req.headers.get("referer")?.slice(0, 500) ?? null,
        user_agent: req.headers.get("user-agent")?.slice(0, 500) ?? null,
        country: req.headers.get("x-vercel-ip-country") ?? null,
      });
    } catch {
      // A logging failure must never cost the install. Redirect regardless.
    }
  }

  // 302, not 301: browsers cache a permanent redirect, and every later click on
  // the same link would then skip the server and go uncounted.
  return NextResponse.redirect(appStoreURL(campaign), 302);
}
