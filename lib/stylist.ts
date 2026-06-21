// Client-side stylist for the consumer webapp. Mirrors the iOS AIService prompt
// assembly (globalRules + style profile + closet catalog + recent worn log +
// task + schema) so the web produces equivalent results, then calls the
// server-side /api/ai proxy (which adds the app secret + forwards the JWT).

import { consumerClient } from "@/lib/consumer";

export type ShopItem = { name?: string; reason?: string };
export type AIOutfit = {
  title?: string;
  itemIds?: string[];
  why?: string;
  shop?: ShopItem[];
};

export type ClosetData = { name?: string; category?: string; colorName?: string; brand?: string; notes?: string; imageRef?: string };
export type ClosetMap = Record<string, ClosetData>; // keyed by lowercased item id

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

const SCHEMA = `{
  "outfits": [
    {
      "title": "short outfit name",
      "itemIds": ["<exact id of a closet item>", "..."],
      "why": "why this suits the occasion and the user",
      "shop": [ { "name": "search query", "reason": "why it completes the look" } ]
    }
  ]
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
  if (p.comfortStatement != null) {
    lines.push(`Comfort↔statement: ${Math.round(p.comfortStatement * 100)}% toward bold statement (0 = pure comfort).`);
  }
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
      const names = (entry.itemIDs ?? [])
        .map((id) => byId[id.toLowerCase()]?.name)
        .filter(Boolean);
      const date = entry.date ? new Date(entry.date).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "";
      let line = `- ${date}: ${names.length ? names.join(", ") : "(logged items no longer in closet)"}`;
      if (entry.note) line += ` — “${entry.note}”`;
      return line;
    })
    .join("\n");
}

/** Pull the outermost JSON object/array out of a possibly fenced/noisy reply. */
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

/**
 * Generate outfits for an occasion from the user's closet. Returns the outfits
 * plus a closet lookup (id → data) so callers can resolve item ids to thumbnails.
 */
export async function dressForEvent(occasion: string): Promise<{ outfits: AIOutfit[]; closet: ClosetMap }> {
  const trimmed = occasion.trim();
  if (!trimmed) return { outfits: [], closet: {} };

  const sb = consumerClient();
  if (!sb) throw new StylistError("AI is not configured.");

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
  const profile = ((profileRes.data?.data as ProfileData) ?? {}) as ProfileData;
  const worn = ((wornRes.data as { id: string; data: WornData }[]) ?? []).map((r) => r.data);

  const instruction = `The user is dressing for this occasion: "${trimmed}".
Propose 2 to 4 outfits appropriate for it, built from the user's closet items (reference each by its EXACT id). Keep every look coherent with the occasion's formality and the user's learned taste. For EACH outfit include 1 to 3 shoppable "shop" items that would complete or elevate it.`;

  const system = [
    GLOBAL_RULES,
    "# YOUR TASK\n" + instruction,
    "# THE USER'S STYLE PROFILE\n" + profileText(profile),
    "# THE USER'S CLOSET — build looks from these real items first\n" + closetCatalog(closet),
    `# RECENT WORN LOG — last ${worn.length}, newest first (a strong taste signal)\n` + wornText(worn, byId),
    "# RESPONSE FORMAT\nReturn ONLY valid JSON, no prose, matching this shape:\n" + SCHEMA,
  ].join("\n\n");

  const res = await fetch("/api/ai", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-ai-kind": "stylist",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ system, prompt: `What should I wear for: ${trimmed}?` }),
  });

  const payload = await res.json().catch(() => ({}));
  if (res.status === 402) throw new StylistError("You've used your free styling calls for this month. Upgrade in the app for unlimited.");
  if (res.status === 401) throw new StylistError("Please sign in again to keep using AI styling.");
  if (!res.ok) throw new StylistError((payload as { error?: string }).error || "The AI service hit a problem. Please try again.");

  const json = extractJSON((payload as { text?: string }).text ?? "");
  if (!json) throw new StylistError("We couldn't understand the response. Please try again.");
  let parsed: { outfits?: AIOutfit[] };
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new StylistError("We couldn't understand the response. Please try again.");
  }
  return { outfits: parsed.outfits ?? [], closet: byId };
}
