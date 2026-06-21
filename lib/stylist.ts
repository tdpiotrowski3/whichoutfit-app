// Client-side stylist for the consumer webapp. Mirrors the iOS AIService prompt
// assembly (globalRules + style profile + closet catalog + recent worn log +
// task + schema) so the web produces equivalent results, then calls the
// server-side /api/ai proxy (which adds the app secret + forwards the JWT).

import { consumerClient } from "@/lib/consumer";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ShopItem = { name?: string; reason?: string };
export type AIOutfit = { title?: string; itemIds?: string[]; why?: string; shop?: ShopItem[] };
export type TesterResult = {
  mode?: string;
  headline?: string;
  score?: number | null;
  rationale?: string;
  pros?: string[];
  cons?: string[];
  elevate?: ShopItem[];
};

export type ClosetData = { name?: string; category?: string; colorName?: string; brand?: string; notes?: string; imageRef?: string };
export type ClosetMap = Record<string, ClosetData>; // keyed by lowercased item id

export type FeedbackPersona = "best" | "so" | "miranda";

type ProfileData = {
  displayName?: string;
  pronouns?: string;
  favoriteColors?: string[];
  preferredStyles?: string[];
  inspirations?: string[];
  vibes?: string[];
  places?: string[];
  sizes?: Record<string, string>;
  comfortStatement?: number;
  fitPreference?: string;
};

type WornData = { date?: string; itemIDs?: string[]; note?: string };

export class StylistError extends Error {}

// Verbatim from iOS AIService.globalRules (kept in lockstep — see the iOS source).
const GLOBAL_RULES = `You are FitCheck's personal stylist. Obey these GLOBAL RULES on every single response:

1) TASTE SIGNAL. Treat the user's Style Profile (including their inspirations) and their last 20 worn-log entries as the PRIMARY signal of their taste. Use them to judge what this specific person will actually wear and like.

2) INCLUSIVITY. Never infer gender from pronouns or names. Never restrict, gate, or steer suggestions by gender — pronouns are optional and limit nothing. This does NOT mean ignoring aesthetics: keep every suggestion coherent with the formality, color, silhouette, and overall vibe of the items in play and of the learned profile. Never pivot a look to an unrelated style.

3) REAL CLOSET FIRST. Build outfits from the user's actual closet items whenever possible, referencing them by their exact id. Suggest purchases ONLY to complete or elevate a look, and express each purchase as a Google Shopping search link of the form https://www.google.com/search?tbm=shop&q=URL+ENCODED+QUERY . Never invent specific products, brand SKUs, prices, or availability.

4) OCCASION FIT. When a day/event/activity is given, the outfit MUST be functionally appropriate for it — respect the activity's real-world dress code and practicality, not just aesthetics. Athletic or active plans (golf, gym, run, tennis, hike, yoga, sports, practice) call for activewear and athletic shoes — NEVER a dress, heels, platform shoes, or formalwear. Formal or professional occasions call for dressier, tailored pieces. If the closet lacks anything suitable for the occasion, say so plainly and pick the closest reasonable option (or suggest one purchase per rule 3) — do NOT dress up an occasion-inappropriate item as if it fits. Never rationalize a mismatch.`;

// Persona directives — ported from iOS FeedbackTone.promptDirective.
const PERSONAS: Record<FeedbackPersona, string> = {
  best: "FEEDBACK PERSONA: You are the user's hype best friend — warm, excited, generous. Lead with what works, gas them up, frame any critique as a gentle optional tip, and round borderline scores up. Never harsh.",
  so: "FEEDBACK PERSONA: You are the user's significant other — honest but loving. Give clear pros and cons and a fair score, with warmth. You tell the truth because you care, never to wound.",
  miranda: "FEEDBACK PERSONA: You are Miranda Priestly — exacting, witheringly chic, no mercy. Deliver a sharp high-fashion verdict and score strictly. Be cutting about the CLOTHES and styling ONLY — NEVER about the person's body, weight, or appearance. Devastating about the outfit, never about them.",
};

const DRESS_SCHEMA = `{
  "outfits": [
    { "title": "short outfit name", "itemIds": ["<exact id of a closet item>", "..."], "why": "why this suits the occasion and the user", "shop": [ { "name": "search query", "reason": "why it completes the look" } ] }
  ]
}`;

const TESTER_SCHEMA = `{
  "mode": "scored",
  "headline": "one-line verdict",
  "score": 0-100,
  "rationale": "2-4 sentences explaining the verdict",
  "pros": ["short positive", "..."],
  "cons": ["short concern", "..."],
  "elevate": [ { "name": "search query", "reason": "why it elevates the look" } ]
}`;

function profileText(p: ProfileData): string {
  const lines: string[] = [];
  if (p.displayName) lines.push(`Name: ${p.displayName}`);
  if (p.pronouns) lines.push(`Pronouns: ${p.pronouns} — do NOT use these to gender or limit suggestions.`);
  if (p.favoriteColors?.length) lines.push(`Favorite colors: ${p.favoriteColors.join(", ")}`);
  if (p.preferredStyles?.length) lines.push(`Preferred styles: ${p.preferredStyles.join(", ")}`);
  if (p.inspirations?.length) lines.push(`Inspirations: ${p.inspirations.join(", ")}`);
  if (p.vibes?.length) lines.push(`Vibe: ${p.vibes.join(", ")}`);
  if (p.places?.length) lines.push(`Dresses for: ${p.places.join(", ")}`);
  const sizeText = p.sizes ? Object.entries(p.sizes).map(([k, v]) => `${k} ${v}`).join(", ") : "";
  if (sizeText) lines.push(`Sizes (for FIT only — never to gender or gate suggestions): ${sizeText}`);
  if (p.fitPreference) lines.push(`Preferred fit (for FIT only — never to gender or gate suggestions): ${p.fitPreference}`);
  if (lines.length === 0) return "(No style profile set yet.)";
  if (p.comfortStatement != null) lines.push(`Comfort↔statement: ${Math.round(p.comfortStatement * 100)}% toward bold statement (0 = pure comfort).`);
  return lines.join("\n");
}

function closetCatalog(closet: { id: string; data: ClosetData }[]): string {
  if (closet.length === 0) return "(The closet is empty.)";
  return closet
    .map(({ id, data }) => {
      const parts = [`id=${id}`, data.name ?? "", `category: ${data.category ?? ""}`];
      if (data.colorName) parts.push(`color: ${data.colorName}`);
      if (data.brand) parts.push(`brand: ${data.brand}`);
      if (data.notes) parts.push(`notes: ${data.notes}`);
      return "- " + parts.join(" | ");
    })
    .join("\n");
}

function wornText(worn: WornData[], byId: ClosetMap): string {
  if (worn.length === 0) return "(No worn history yet.)";
  return worn
    .map((entry) => {
      const names = (entry.itemIDs ?? []).map((id) => byId[id.toLowerCase()]?.name).filter(Boolean);
      const date = entry.date ? new Date(entry.date).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "";
      let line = `- ${date}: ${names.length ? names.join(", ") : "(logged items no longer in closet)"}`;
      if (entry.note) line += ` — “${entry.note}”`;
      return line;
    })
    .join("\n");
}

function extractJSON(text: string): string | null {
  const trimmed = text.trim();
  let best: string | null = null;
  for (const [open, close] of [["{", "}"], ["[", "]"]] as const) {
    const start = trimmed.indexOf(open);
    const end = trimmed.lastIndexOf(close);
    if (start >= 0 && end > start) {
      const slice = trimmed.slice(start, end + 1);
      if (!best || slice.length > best.length) best = slice;
    }
  }
  return best ?? (trimmed.length ? trimmed : null);
}

type Context = {
  accessToken: string;
  uid: string;
  closet: { id: string; data: ClosetData }[];
  byId: ClosetMap;
  contextSections: string[]; // profile / closet / worn, ready to slot into the system prompt
};

async function fetchContext(sb: SupabaseClient): Promise<Context> {
  const {
    data: { session },
  } = await sb.auth.getSession();
  if (!session) throw new StylistError("Please sign in again.");

  const [closetRes, profileRes, wornRes] = await Promise.all([
    sb.from("closet_items").select("id, data").is("deleted_at", null),
    sb.from("profiles").select("data").limit(1).maybeSingle(),
    sb.from("worn_outfits").select("id, data").is("deleted_at", null).order("updated_at", { ascending: false }).limit(20),
  ]);
  if (closetRes.error) throw new StylistError(closetRes.error.message);

  const closet = (closetRes.data as { id: string; data: ClosetData }[]) ?? [];
  const byId: ClosetMap = {};
  for (const row of closet) byId[row.id.toLowerCase()] = row.data;
  const profile = (profileRes.data?.data as ProfileData) ?? {};
  const worn = ((wornRes.data as { id: string; data: WornData }[]) ?? []).map((r) => r.data);

  return {
    accessToken: session.access_token,
    uid: session.user.id.toLowerCase(),
    closet,
    byId,
    contextSections: [
      "# THE USER'S STYLE PROFILE\n" + profileText(profile),
      "# THE USER'S CLOSET — build looks from these real items first\n" + closetCatalog(closet),
      `# RECENT WORN LOG — last ${worn.length}, newest first (a strong taste signal)\n` + wornText(worn, byId),
    ],
  };
}

async function callAI<T>(
  accessToken: string,
  system: string,
  prompt: string,
  imageBase64?: string
): Promise<T> {
  const res = await fetch("/api/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-ai-kind": "stylist", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(imageBase64 ? { system, prompt, imageBase64 } : { system, prompt }),
  });
  const payload = await res.json().catch(() => ({}));
  if (res.status === 402) throw new StylistError("You've used your free styling calls for this month. Upgrade in the app for unlimited.");
  if (res.status === 401) throw new StylistError("Please sign in again to keep using AI styling.");
  if (!res.ok) throw new StylistError((payload as { error?: string }).error || "The AI service hit a problem. Please try again.");
  const json = extractJSON((payload as { text?: string }).text ?? "");
  if (!json) throw new StylistError("We couldn't understand the response. Please try again.");
  try {
    return JSON.parse(json) as T;
  } catch {
    throw new StylistError("We couldn't understand the response. Please try again.");
  }
}

/** Dress for an occasion — 2-4 outfits from the closet. Returns outfits + a closet lookup. */
export async function dressForEvent(occasion: string): Promise<{ outfits: AIOutfit[]; closet: ClosetMap }> {
  const trimmed = occasion.trim();
  if (!trimmed) return { outfits: [], closet: {} };
  const sb = consumerClient();
  if (!sb) throw new StylistError("AI is not configured.");
  const ctx = await fetchContext(sb);

  const instruction = `The user is dressing for this occasion: "${trimmed}".
Propose 2 to 4 outfits appropriate for it, built from the user's closet items (reference each by its EXACT id). Keep every look coherent with the occasion's formality and the user's learned taste. For EACH outfit include 1 to 3 shoppable "shop" items that would complete or elevate it.`;

  const system = [
    GLOBAL_RULES,
    "# YOUR TASK\n" + instruction,
    ...ctx.contextSections,
    "# RESPONSE FORMAT\nReturn ONLY valid JSON, no prose, matching this shape:\n" + DRESS_SCHEMA,
  ].join("\n\n");

  const result = await callAI<{ outfits?: AIOutfit[] }>(ctx.accessToken, system, `What should I wear for: ${trimmed}?`);
  return { outfits: result.outfits ?? [], closet: ctx.byId };
}

/** Rate a photo of an outfit the user is wearing. `imageBase64` is a JPEG (no data: prefix). */
export async function ratePhoto(imageBase64: string, occasion: string, persona: FeedbackPersona): Promise<TesterResult> {
  const sb = consumerClient();
  if (!sb) throw new StylistError("AI is not configured.");
  const ctx = await fetchContext(sb);

  const occasionLine = occasion.trim()
    ? `Occasion: "${occasion.trim()}".`
    : "No specific occasion was given — judge it as an everyday look true to the user's taste.";
  const instruction = `The user uploaded a PHOTO of an outfit they are wearing right now. ${occasionLine}
Evaluate the outfit shown IN THE PHOTO. Set "mode" to "scored": give a 0–100 "score", a one-line "headline", a short "rationale", plus "pros" and "cons". Do NOT include "swaps" — you cannot reference their closet item ids from a photo. You may include 1–3 "elevate" shoppable picks that would complete or improve the look. Judge fit, color harmony, formality, and proportion; stay true to the vibe shown.

${PERSONAS[persona]}`;

  const system = [
    GLOBAL_RULES,
    "# YOUR TASK\n" + instruction,
    ...ctx.contextSections,
    "# RESPONSE FORMAT\nReturn ONLY valid JSON, no prose, matching this shape:\n" + TESTER_SCHEMA,
  ].join("\n\n");

  return callAI<TesterResult>(ctx.accessToken, system, "Evaluate the outfit in this photo.", imageBase64);
}
