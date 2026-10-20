import { createHash } from "crypto";

// The closets the content engine films against. Every clip used to be shot on
// one wardrobe (the App Store reviewer account), so every clip looked like the
// same person. Each persona here is its own capture account with its own
// closet, so the same flow — "dress me for a first date" — can be filmed on a
// menswear closet one week and a streetwear one the next.
//
// Personas are defined by WARDROBE and STYLE, never by who the viewer is. The
// app itself must never infer gender (FitCheck CLAUDE.md, inclusivity
// invariant); a marketing closet that happens to be menswear is just a closet.
//
// `original` is the existing reviewer account and its closet, which every clip
// made before 2026-10-19 was filmed on. The others are capture accounts that
// sign in through /api/engine/persona. Their emails are plus-addresses on the
// owner's real mailbox (CAPTURE_EMAIL_BASE, a Vercel env var — kept out of this
// public repo): the app's "Email me a code" step sends a real email, and
// made-up domains bounce, which hurts the project's sender reputation.
//
// Items are generated (/api/engine/persona/garment), cut out on the Mac, and
// written as real closet items (/api/engine/persona/item). Ids are derived from
// persona + slot, so re-seeding a closet replaces items instead of duplicating.

export type Category = "Top" | "Bottom" | "Dress" | "Outerwear" | "Shoes" | "Accessory";

export type WardrobeItem = {
  slot: string;
  name: string;
  category: Category;
  colorName: string;
  fabric?: string;
  tags: string[];
  resaleCategory: "Men's" | "Women's" | "Unisex";
};

export type Persona = {
  key: string;
  label: string;
  /** For the planner: who this closet reads as, and what occasions suit it. */
  describe: string;
  wardrobe: WardrobeItem[];
};

const item = (
  slot: string,
  name: string,
  category: Category,
  colorName: string,
  tags: string[],
  resaleCategory: WardrobeItem["resaleCategory"],
  fabric?: string
): WardrobeItem => ({ slot, name, category, colorName, tags, resaleCategory, fabric });

export const PERSONAS: Persona[] = [
  {
    key: "original",
    label: "Original",
    describe: "The closet every earlier clip used: denim, orange smocked tops, wide-leg trousers, a red satchel. Casual and feminine-leaning.",
    wardrobe: [], // a real closet built through the app; never seeded
  },
  {
    key: "menswear",
    label: "Classic menswear",
    describe: "Clean, classic menswear: oxford shirts, chinos, a chore jacket, loafers. Suits work, dates, weddings, weekends away.",
    wardrobe: [
      item("oxford", "White Oxford Button-Down Shirt", "Top", "White", ["button-down", "oxford", "long sleeve", "smart casual", "work", "classic"], "Men's", "Cotton"),
      item("tee", "Heather Grey Crew Neck T-Shirt", "Top", "Grey", ["crew neck", "short sleeve", "casual", "everyday", "basic"], "Men's", "Cotton"),
      item("sweater", "Navy Merino Crew Sweater", "Top", "Navy", ["knit", "crew neck", "smart casual", "fall", "winter", "layering"], "Men's", "Wool"),
      item("polo", "Olive Knit Polo Shirt", "Top", "Olive", ["polo", "knit", "short sleeve", "smart casual", "summer"], "Men's", "Cotton"),
      item("chinos", "Khaki Slim Chinos", "Bottom", "Khaki", ["chinos", "slim fit", "smart casual", "work", "classic"], "Men's", "Cotton"),
      item("jeans", "Dark Indigo Straight Jeans", "Bottom", "Indigo", ["jeans", "straight leg", "casual", "everyday"], "Men's", "Denim"),
      item("trousers", "Charcoal Wool Trousers", "Bottom", "Charcoal", ["trousers", "tailored", "formal", "work", "wedding"], "Men's", "Wool"),
      item("chore", "Navy Cotton Chore Jacket", "Outerwear", "Navy", ["chore jacket", "workwear", "casual", "spring", "fall", "layering"], "Men's", "Cotton"),
      item("blazer", "Grey Unstructured Blazer", "Outerwear", "Grey", ["blazer", "unstructured", "smart casual", "formal", "work"], "Men's", "Wool"),
      item("loafers", "Brown Leather Penny Loafers", "Shoes", "Brown", ["loafers", "leather", "smart casual", "formal"], "Men's", "Leather"),
      item("sneakers", "White Leather Low-Top Sneakers", "Shoes", "White", ["sneakers", "minimal", "casual", "everyday"], "Men's", "Leather"),
      item("watch", "Silver Field Watch with Brown Strap", "Accessory", "Silver", ["watch", "classic", "everyday"], "Men's", "Leather"),
    ],
  },
  {
    key: "streetwear",
    label: "Streetwear",
    describe: "Gender-neutral streetwear: oversized hoodies, cargos, a varsity jacket, chunky sneakers. Suits concerts, campus, nights out, casual weekends.",
    wardrobe: [
      item("hoodie", "Oversized Black Hoodie", "Top", "Black", ["hoodie", "oversized", "streetwear", "casual", "fall", "winter"], "Unisex", "Cotton"),
      item("graphic", "Cream Boxy Graphic T-Shirt", "Top", "Cream", ["graphic tee", "boxy", "streetwear", "casual", "summer"], "Unisex", "Cotton"),
      item("longsleeve", "Washed Green Long-Sleeve Tee", "Top", "Green", ["long sleeve", "washed", "streetwear", "layering"], "Unisex", "Cotton"),
      item("cargo", "Black Wide Cargo Pants", "Bottom", "Black", ["cargo pants", "wide leg", "streetwear", "casual", "utility"], "Unisex", "Cotton"),
      item("baggy", "Light Wash Baggy Jeans", "Bottom", "Light Blue", ["jeans", "baggy", "streetwear", "casual", "everyday"], "Unisex", "Denim"),
      item("shorts", "Grey Fleece Sweat Shorts", "Bottom", "Grey", ["shorts", "fleece", "casual", "summer", "lounge"], "Unisex", "Cotton"),
      item("varsity", "Burgundy Varsity Jacket", "Outerwear", "Burgundy", ["varsity jacket", "streetwear", "fall", "statement"], "Unisex", "Wool"),
      item("puffer", "Silver Cropped Puffer Jacket", "Outerwear", "Silver", ["puffer", "cropped", "streetwear", "winter", "statement"], "Unisex", "Nylon"),
      item("chunky", "White and Grey Chunky Sneakers", "Shoes", "White", ["sneakers", "chunky", "streetwear", "everyday"], "Unisex", "Leather"),
      item("hightop", "Black Canvas High-Top Sneakers", "Shoes", "Black", ["high-top", "canvas", "casual", "classic"], "Unisex", "Canvas"),
      item("beanie", "Orange Ribbed Beanie", "Accessory", "Orange", ["beanie", "knit", "winter", "streetwear"], "Unisex", "Acrylic"),
      item("crossbody", "Black Nylon Crossbody Bag", "Accessory", "Black", ["crossbody", "bag", "utility", "streetwear"], "Unisex", "Nylon"),
    ],
  },
  {
    key: "minimal",
    label: "Minimal neutrals",
    describe: "A small, androgynous capsule in black, cream and camel: turtlenecks, wide trousers, a long coat. Suits galleries, travel, dinners, work.",
    wardrobe: [
      item("turtleneck", "Black Fine-Knit Turtleneck", "Top", "Black", ["turtleneck", "fine knit", "minimal", "smart casual", "fall", "winter"], "Unisex", "Wool"),
      item("whitetee", "Heavyweight White T-Shirt", "Top", "White", ["t-shirt", "heavyweight", "minimal", "everyday", "basic"], "Unisex", "Cotton"),
      item("shirt", "Cream Relaxed Poplin Shirt", "Top", "Cream", ["shirt", "relaxed", "poplin", "minimal", "smart casual"], "Unisex", "Cotton"),
      item("widetrousers", "Black Wide-Leg Trousers", "Bottom", "Black", ["trousers", "wide leg", "minimal", "smart casual", "work"], "Unisex", "Wool"),
      item("ecru", "Ecru Straight Jeans", "Bottom", "Ecru", ["jeans", "straight leg", "minimal", "casual"], "Unisex", "Denim"),
      item("coat", "Camel Long Wool Coat", "Outerwear", "Camel", ["coat", "long", "minimal", "classic", "winter", "fall"], "Unisex", "Wool"),
      item("knitvest", "Oatmeal Knit Vest", "Outerwear", "Oatmeal", ["knit vest", "layering", "minimal", "fall"], "Unisex", "Wool"),
      item("boots", "Black Leather Chelsea Boots", "Shoes", "Black", ["chelsea boots", "leather", "minimal", "smart casual", "fall", "winter"], "Unisex", "Leather"),
      item("slides", "Tan Suede Mules", "Shoes", "Tan", ["mules", "suede", "minimal", "summer", "smart casual"], "Unisex", "Suede"),
      item("tote", "Black Leather Tote Bag", "Accessory", "Black", ["tote", "leather", "minimal", "work", "travel"], "Unisex", "Leather"),
      item("scarf", "Grey Cashmere Scarf", "Accessory", "Grey", ["scarf", "cashmere", "winter", "minimal"], "Unisex", "Cashmere"),
    ],
  },
  {
    key: "polished",
    label: "Polished workwear",
    describe: "Polished, feminine-leaning workwear: a tailored blazer, silk blouse, midi skirt, wrap dress, block heels. Suits the office, interviews, events, dinners.",
    wardrobe: [
      item("blouse", "Ivory Silk Button Blouse", "Top", "Ivory", ["blouse", "silk", "work", "smart casual", "classic"], "Women's", "Silk"),
      item("knit", "Camel Ribbed Knit Top", "Top", "Camel", ["knit", "ribbed", "fitted", "work", "fall"], "Women's", "Viscose"),
      item("stripe", "Navy Breton Stripe Top", "Top", "Navy", ["breton", "stripe", "long sleeve", "casual", "classic"], "Women's", "Cotton"),
      item("midi", "Black Satin Midi Skirt", "Bottom", "Black", ["midi skirt", "satin", "work", "evening", "smart casual"], "Women's", "Satin"),
      item("trousers", "Taupe High-Waist Tailored Trousers", "Bottom", "Taupe", ["trousers", "high waist", "tailored", "work"], "Women's", "Polyester"),
      item("jeans", "Mid Wash Straight Jeans", "Bottom", "Blue", ["jeans", "straight leg", "casual", "everyday"], "Women's", "Denim"),
      item("wrap", "Emerald Green Wrap Dress", "Dress", "Green", ["wrap dress", "midi", "work", "wedding guest", "evening"], "Women's", "Crepe"),
      item("blazer", "Black Tailored Blazer", "Outerwear", "Black", ["blazer", "tailored", "work", "formal", "classic"], "Women's", "Wool"),
      item("trench", "Beige Belted Trench Coat", "Outerwear", "Beige", ["trench coat", "belted", "classic", "spring", "fall"], "Women's", "Cotton"),
      item("heels", "Black Leather Block Heels", "Shoes", "Black", ["block heels", "leather", "work", "evening"], "Women's", "Leather"),
      item("flats", "Nude Pointed Ballet Flats", "Shoes", "Nude", ["ballet flats", "pointed", "work", "everyday"], "Women's", "Leather"),
      item("bag", "Cognac Structured Top-Handle Bag", "Accessory", "Cognac", ["bag", "top handle", "structured", "work", "classic"], "Women's", "Leather"),
    ],
  },
];

const REVIEWER_EMAIL = "whichoutfitreview@test.com";

/**
 * The sign-in email for a persona: the reviewer for `original`, otherwise
 * "<local>+capture-<key>@<domain>" built from CAPTURE_EMAIL_BASE. Throws when
 * the base is unset — persona accounts are simply off until it is configured.
 */
export function personaEmail(key: string, base = process.env.CAPTURE_EMAIL_BASE): string {
  if (key === "original") return REVIEWER_EMAIL;
  const m = base?.trim().match(/^([^@+\s]+)@([^@\s]+)$/);
  if (!m) throw new Error("CAPTURE_EMAIL_BASE is not set (an address like you@example.com)");
  return `${m[1]}+capture-${key}@${m[2]}`.toLowerCase();
}

export function getPersona(key: string): Persona | undefined {
  return PERSONAS.find((p) => p.key === key);
}

/**
 * A stable UUID for persona + slot, uppercase like the app's own ids, so the
 * same slot always maps to the same closet item and image path.
 */
export function itemId(persona: string, slot: string): string {
  const h = createHash("sha1").update(`whichoutfit-capture:${persona}:${slot}`).digest("hex");
  // Shape it as a v5 UUID (version and variant bits set) so it parses as one.
  const v = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${v}${h.slice(17, 20)}-${h.slice(20, 32)}`.toUpperCase();
}

/** Light garments vanish into a white background when it is cut away, so they get grey. */
const LIGHT = /^(white|cream|ivory|ecru|oatmeal|nude|beige|silver|light)/i;

/**
 * The garment photo prompt: a plain product shot on a flat, uniform background
 * with no cast shadow, so the Mac can cut it out by the background colour.
 */
export function garmentPrompt(it: WardrobeItem): string {
  const how = it.category === "Shoes" ? "a pair, side by side at a slight angle" : it.category === "Accessory" ? "on its own" : "laid flat, neatly arranged";
  const bg = LIGHT.test(it.colorName) || LIGHT.test(it.name) ? "a flat, uniform medium grey (#8c8c8c)" : "a flat, uniform pure white";
  return `Studio product photo of a ${it.name.toLowerCase()}${it.fabric ? ` in ${it.fabric.toLowerCase()}` : ""}, ${how}, centered, filling about 75% of the frame, isolated on ${bg} seamless background, soft even lighting, no cast shadow, no mannequin, no person, no hanger, no props, no text, no logo, no watermark. Square format.`;
}
