import { NextResponse } from "next/server";
import { engineAuthorized, errorMessage } from "@/lib/contentEngine/auth";
import { PERSONAS, getPersona, garmentPrompt, personaEmail } from "@/lib/contentEngine/personas";
import { personaOtp, signItemImage, commitItem, seededSlots } from "@/lib/contentEngine/personaAccounts";
import { generateImage } from "@/lib/contentEngine/gemini";

export const runtime = "nodejs";
export const maxDuration = 90;

// The persona closets, for the Mac (`./engine.py --seed-closets`, and
// capture.sh when it films as a persona). ENGINE_SECRET only.
//
//   {action: "list"}                     → personas, their wardrobes and which slots exist
//   {action: "otp", persona}             → {email, otp} to sign the capture account in
//   {action: "garment", persona, slot}   → a generated product photo (base64), not stored
//   {action: "sign", persona, slot}      → signed upload URL for the item's cut-out photo
//   {action: "commit", persona, slot}    → write the closet row once the photo is up
export async function POST(req: Request) {
  if (!engineAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { action?: string; persona?: string; slot?: string };

  try {
    if (b.action === "list") {
      const out = await Promise.all(
        PERSONAS.map(async (p) => {
          let email: string | null = null;
          try {
            email = personaEmail(p.key);
          } catch {
            // CAPTURE_EMAIL_BASE unset: persona accounts are off
          }
          return {
            key: p.key,
            label: p.label,
            email,
            wardrobe: p.wardrobe.map((w) => ({ slot: w.slot, name: w.name, category: w.category })),
            seeded: email && p.wardrobe.length ? await seededSlots(p.key) : [],
          };
        })
      );
      return NextResponse.json({ personas: out });
    }

    const p = b.persona ? getPersona(b.persona) : undefined;
    if (!p) return NextResponse.json({ error: "Unknown persona." }, { status: 400 });

    if (b.action === "otp") {
      // The original closet is the reviewer account, which signs in through reviewer-login.
      if (p.key === "original") return NextResponse.json({ error: "original signs in via reviewer-login" }, { status: 400 });
      return NextResponse.json(await personaOtp(p.key));
    }

    const it = p.wardrobe.find((w) => w.slot === b.slot);
    if (!it) return NextResponse.json({ error: "Unknown slot." }, { status: 400 });

    if (b.action === "garment") {
      const img = await generateImage(garmentPrompt(it));
      return NextResponse.json(img);
    }
    if (b.action === "sign") return NextResponse.json(await signItemImage(p.key, it.slot));
    if (b.action === "commit") return NextResponse.json(await commitItem(p.key, it.slot));
  } catch (e) {
    return NextResponse.json({ error: errorMessage(e, "failed") }, { status: 500 });
  }
  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
