// Hashtag hygiene for every caption that leaves the app (Instagram publish,
// the TikTok reminder and the calendar's Copy caption), whatever wrote it —
// the model, an edit in the Studio, or an old queued row. Pure and import-free,
// so client components can use it too.
//
// Instagram caps posts at five hashtags and TikTok's search weights a few
// specific ones over a wall of them, so: five at most, each one describing
// what the clip shows or what someone would search to find it.

export const MAX_HASHTAGS = 5;

// Tags that spend a slot without reaching anyone new: our own brand (no one
// searches it yet), feed bait the platforms ignore or down-rank, platform and
// app/tech/AI tags, and single-word giants too broad to rank in.
const BANNED = new Set([
  "whichoutfit", "whichoutfitapp",
  "satisfying", "oddlysatisfying", "asmr",
  "fyp", "fy", "foryou", "foryoupage", "fypage", "viral", "viralvideo", "trending", "trend",
  "explore", "explorepage", "reels", "reel", "reelsinstagram", "instagram", "instagood", "insta",
  "tiktok", "tiktokmademebuyit", "tiktokfashion",
  "ai", "aistylist", "aiapp", "aifashion", "aistyle", "artificialintelligence", "chatgpt", "tech", "technology",
  "app", "apps", "styleapp", "fashionapp", "appstore", "newapp", "iphoneapp", "android", "ios",
  "fashion", "style", "love", "photooftheday", "followme", "follow", "like4like", "likeforlike",
]);

/** Up to five clean, distinct, lowercase hashtags as one space-separated string ("" when none survive). */
export function cleanHashtags(raw: string | null | undefined, max = MAX_HASHTAGS): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const token of (raw ?? "").split(/[\s,]+/)) {
    const tag = token.replace(/^#+/, "").toLowerCase().replace(/[^a-z0-9_]/g, "");
    if (tag.length < 3 || tag.length > 30 || /^\d+$/.test(tag)) continue;
    if (BANNED.has(tag) || seen.has(tag)) continue;
    seen.add(tag);
    out.push(`#${tag}`);
    if (out.length === max) break;
  }
  return out.join(" ");
}

/** The text that gets posted: caption, a blank line, then the cleaned hashtags. */
export function captionWithTags(caption: string, hashtags: string | null | undefined): string {
  const tags = cleanHashtags(hashtags);
  return tags ? `${caption.trim()}\n\n${tags}` : caption.trim();
}
