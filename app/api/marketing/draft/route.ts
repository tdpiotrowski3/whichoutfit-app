import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/session";
import { generateJson } from "@/lib/contentEngine/gemini";
import { errorMessage } from "@/lib/contentEngine/auth";

export const runtime = "nodejs";
export const maxDuration = 60;

// POST {feature, featureLabel, angle?, current?} → {subject, message}: a draft
// nudge for opted-in users who haven't tried a feature. The owner edits it and
// sends a test first (SendNudgePanel); nothing is sent from here.

// What each feature does for the person, so the email sells the result, not the button.
const FEATURES: Record<string, string> = {
  cleanup: "Photo Cleanup turns a wrinkled, badly lit closet photo into a clean, catalog-style shot in one tap, so the closet looks good and the stylist reads the item better.",
  stylist: "The AI Stylist builds complete outfits from clothes they already own, for any occasion, the weather and their style.",
  tagging: "AI Tagging fills in an item's name, color, category and fabric from the photo, so adding clothes takes seconds.",
  tryon: "Try-On shows an outfit on them before they get dressed.",
  backdrop: "Backdrop swaps the background of an outfit photo for a clean scene that's ready to share.",
  rating: "Rate My Outfit scores what they're wearing out of 100 and suggests one swap that would lift it.",
  trip: "Trips & Packing checks the forecast and packs a small capsule wardrobe with an outfit for every day.",
  color: "Color Season reads one selfie and returns their seasonal palette: the colors to wear and the ones to skip.",
};

const SCHEMA = {
  type: "OBJECT",
  properties: { subject: { type: "STRING" }, message: { type: "STRING" } },
  required: ["subject", "message"],
};

const SYSTEM = `You write short re-engagement emails for WhichOutfit, an AI closet and stylist app, from its founder Tyler. The readers already have the app and opted in to email; they haven't tried one feature yet.

Rules:
- Subject: under 50 characters, specific and curious, no clickbait, no ALL CAPS, at most one emoji (usually none).
- Message: plain text, 50–110 words, 2–3 short paragraphs. Open on a moment the reader recognizes, say what the feature does for them in one or two concrete sentences, then one clear ask: open WhichOutfit and try it (say where it is in the app if given). Warm, personal, like a founder writing to a user, not a newsletter.
- Never invent discounts, prices, stats, testimonials or deadlines. No hashtags. No "Dear user".
- End with a sign-off line: "— Tyler, WhichOutfit".
- Don't add an unsubscribe line or postal address; those are appended automatically.`;

export async function POST(req: Request) {
  if (!(await isAuthed())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { feature, featureLabel, angle, current } = (await req.json().catch(() => ({}))) as {
    feature?: string; featureLabel?: string; angle?: string; current?: { subject?: string; message?: string };
  };
  if (!feature) return NextResponse.json({ error: "Pick a feature first." }, { status: 400 });
  const what = FEATURES[feature] ?? `${featureLabel ?? feature} is a feature of the app.`;
  const redo = current?.message?.trim()
    ? `\n\nThis is a rewrite. The current draft is below; write a clearly different take${angle?.trim() ? "" : " with a new angle"}.\nSubject: ${current.subject ?? ""}\n${current.message}`
    : "";
  const prompt = `Feature: ${featureLabel ?? feature}
What it does: ${what}${angle?.trim() ? `\nOwner's direction: ${angle.trim().slice(0, 300)}` : ""}${redo}`;
  try {
    const r = await generateJson<{ subject: string; message: string }>(SYSTEM, prompt, SCHEMA);
    return NextResponse.json({ subject: r.subject.trim().slice(0, 120), message: r.message.trim() });
  } catch (e) {
    return NextResponse.json({ error: errorMessage(e, "drafting failed") }, { status: 502 });
  }
}
