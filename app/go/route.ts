import { NextResponse } from "next/server";
import { admin } from "@/lib/supabase";
import { storeURL, cleanCampaign, clipFromCampaign, platformFromCampaign } from "@/lib/socialLinks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// whichoutfit.app/go?c=<campaign> — the tracked link for captions, bios and
// end cards.
//
// It writes one row to public.social_clicks, then 302s to the right store:
// Android to Google Play with the campaign in Play's install referrer (the
// Android app reports it back exactly), everyone else to the App Store with
// Apple's campaign tokens (pt + ct), which App Analytics reports per campaign
// and the daily App Store sync pulls into the dashboard. `campaign` is the one
// key that joins clicks, installs and revenue across both stores.
//
//   /go?c=ig_12_scan_item
//   /go?c=ig_bio
//
// The redirect targets are fixed in lib/socialLinks.ts — see the note there on
// why they never come from the query string.

export async function GET(req: Request) {
  const url = new URL(req.url);
  const campaign = cleanCampaign(url.searchParams.get("c"));
  const platformHint = cleanCampaign(url.searchParams.get("p"));
  const userAgent = req.headers.get("user-agent");

  if (campaign) {
    try {
      await admin().from("social_clicks").insert({
        campaign,
        platform: platformHint ?? platformFromCampaign(campaign),
        clip_id: clipFromCampaign(campaign),
        // Coarse context only — no IP, no device id. This measures which POST
        // worked, not who clicked.
        referrer: req.headers.get("referer")?.slice(0, 500) ?? null,
        user_agent: userAgent?.slice(0, 500) ?? null,
        country: req.headers.get("x-vercel-ip-country") ?? null,
      });
    } catch {
      // A logging failure must never cost the install. Redirect regardless.
    }
  }

  // 302, not 301: browsers cache a permanent redirect, and every later click on
  // the same link would then skip the server and go uncounted.
  return NextResponse.redirect(storeURL(campaign, userAgent), 302);
}
