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
  /**
   * "owner" = this closet is a COPY of the owner's real closet (the account at
   * CAPTURE_OWNER_EMAIL), made by `./engine.py --clone-closet`. Filming signs in
   * as the persona's own capture account, never the owner's, so nothing a
   * capture run does can touch the real account.
   */
  cloneFrom?: "owner";
  /** Narrator for clips filmed on this closet (a Gemini prebuilt voice). */
  voice?: string;
  /**
   * An account that deliberately has NO closet, for filming the closet-optional
   * features (fully suggested looks, wishlist). Never seeded; offered to the
   * planner only while a launch campaign is live (rules.ts), since before that
   * the app has nothing to show on an empty closet.
   */
  startsEmpty?: boolean;
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

type Named = [name: string, colorName: string];

/**
 * The cold-weather + ski-trip layer every closet gets for winter content (a
 * city-winter coat, knit, boots and scarf; a ski jacket, pants, base layer,
 * snow boots, hat and gloves), in each closet's own colours. Slots are
 * "w-" prefixed so they never collide with a closet's existing slots; leave an
 * entry out where the closet already has that piece.
 */
function winterTrips(
  p: Partial<Record<"coat" | "sweater" | "boots" | "scarf" | "skiJacket" | "skiPants" | "baseLayer" | "snowBoots" | "hat" | "gloves", Named>>,
  resale: WardrobeItem["resaleCategory"]
): WardrobeItem[] {
  const out: WardrobeItem[] = [];
  const add = (key: keyof typeof p, category: Category, tags: string[], fabric?: string) => {
    const v = p[key];
    if (v) out.push(item(`w-${key.toLowerCase()}`, v[0], category, v[1], tags, resale, fabric));
  };
  add("coat", "Outerwear", ["coat", "winter", "cold weather", "warm", "city"], "Wool");
  add("sweater", "Top", ["sweater", "knit", "winter", "cozy", "apres-ski"], "Wool");
  add("boots", "Shoes", ["boots", "winter", "cold weather", "warm"], "Leather");
  add("scarf", "Accessory", ["scarf", "knit", "winter", "cold weather"], "Wool");
  add("skiJacket", "Outerwear", ["ski jacket", "ski", "snowboard", "snow", "insulated", "waterproof", "winter"], "Nylon");
  add("skiPants", "Bottom", ["ski pants", "snow pants", "ski", "snowboard", "insulated", "waterproof", "winter"], "Nylon");
  add("baseLayer", "Top", ["base layer", "thermal", "ski", "layering", "winter", "cold weather"], "Merino Wool");
  add("snowBoots", "Shoes", ["snow boots", "insulated", "waterproof", "snow", "winter"], "Nylon");
  add("hat", "Accessory", ["beanie", "knit", "winter", "ski", "cold weather"], "Wool");
  add("gloves", "Accessory", ["gloves", "ski gloves", "insulated", "ski", "winter", "cold weather"], "Nylon");
  return out;
}

export const PERSONAS: Persona[] = [
  {
    key: "original",
    label: "Original",
    describe: "The closet every earlier clip used: denim, orange smocked tops, wide-leg trousers, a red satchel. Casual and feminine-leaning. Also stocked for winter and trips: a long puffer, chunky knits, shearling boots, a red ski jacket and white ski pants, an orange ruffle bikini and crochet cover-up, a black sequin mini dress for nights out, leggings and a sports bra, pajamas.",
    // The core of this closet was built through the app (it is the App Store
    // reviewer account). These add-ons were seeded on 2026-11-08 so it can
    // film winter, ski-trip, beach-weekend and night-out clips too.
    wardrobe: [
      ...winterTrips({
        coat: ["Cream Long Puffer Coat", "Cream"],
        sweater: ["Cream Chunky Cable-Knit Sweater", "Cream"],
        boots: ["Chestnut Suede Shearling Boots", "Chestnut"],
        scarf: ["Rust Ribbed Knit Scarf", "Rust"],
        skiJacket: ["Red Insulated Ski Jacket", "Red"],
        skiPants: ["White Insulated Ski Pants", "White"],
        baseLayer: ["Black Thermal Base Layer Top", "Black"],
        snowBoots: ["White Waterproof Snow Boots", "White"],
        hat: ["Cream Knit Pom-Pom Beanie", "Cream"],
        gloves: ["Black Insulated Ski Gloves", "Black"],
      }, "Women's"),
      item("bikinitop", "Orange Ruffle Bikini Top", "Top", "Orange", ["bikini", "swimwear", "swim", "beach", "pool", "summer", "vacation"], "Women's", "Nylon"),
      item("bikinibottom", "Orange Ruffle Bikini Bottom", "Bottom", "Orange", ["bikini", "swimwear", "swim", "beach", "pool", "summer", "vacation"], "Women's", "Nylon"),
      item("coverup", "White Crochet Cover-Up Dress", "Dress", "White", ["cover-up", "crochet", "beach", "resort", "summer", "vacation"], "Women's", "Cotton"),
      item("sandals", "Tan Platform Sandals", "Shoes", "Tan", ["sandals", "platform", "summer", "beach", "vacation"], "Women's", "Leather"),
      item("sequin", "Black Sequin Mini Dress", "Dress", "Black", ["mini dress", "sequin", "night out", "party", "evening", "going out"], "Women's", "Polyester"),
      item("strappyheels", "Black Strappy Heeled Sandals", "Shoes", "Black", ["heels", "strappy", "night out", "evening", "party"], "Women's", "Leather"),
      item("leggings", "Black Flare Leggings", "Bottom", "Black", ["leggings", "flare", "activewear", "workout", "yoga", "athletic"], "Women's", "Nylon"),
      item("sportsbra", "White Ribbed Sports Bra", "Top", "White", ["sports bra", "activewear", "workout", "gym", "athletic"], "Women's", "Nylon"),
      item("trainers", "White and Grey Training Sneakers", "Shoes", "White", ["sneakers", "training", "athletic", "workout", "gym"], "Women's", "Mesh"),
      item("pajamas", "Blue Striped Cotton Pajama Set", "Top", "Blue", ["pajamas", "sleepwear", "lounge", "sleep"], "Women's", "Cotton"),
    ],
  },
  {
    key: "menswear",
    label: "Menswear (a copy of the owner's real closet)",
    describe: "A real, lived-in menswear closet of 250+ pieces: tees, henleys, button-ups, chinos, jeans, performance pants, sweatshirts, loafers, lots of athletic gear and swim shorts, linen. Plus winter add-ons: a navy wool overcoat, a down puffer, a ski jacket and pants, base layers, beanie and gloves, winter boots, a black camp-collar shirt and suede loafers for nights out, flannel pajamas. Suits work, dates, weddings, travel, ski trips, beach weekends.",
    // Add-ons seeded ON TOP of the copy (2026-11-08): the owner's closet has
    // swim, athletic and linen but no real winter coat, ski gear or sleepwear.
    // A re-clone keeps these (cloneCloset never removes a seeded slot).
    wardrobe: [
      ...winterTrips({
        coat: ["Navy Wool Overcoat", "Navy"],
        sweater: ["Charcoal Cable-Knit Wool Sweater", "Charcoal"],
        boots: ["Brown Waterproof Leather Winter Boots", "Brown"],
        scarf: ["Grey Wool Scarf", "Grey"],
        skiJacket: ["Navy Insulated Ski Jacket", "Navy"],
        skiPants: ["Black Insulated Ski Pants", "Black"],
        baseLayer: ["Black Merino Base Layer Top", "Black"],
        snowBoots: ["Black Insulated Snow Boots", "Black"],
        hat: ["Black Ribbed Beanie", "Black"],
        gloves: ["Black Insulated Ski Gloves", "Black"],
      }, "Men's"),
      item("puffer", "Black Down Puffer Jacket", "Outerwear", "Black", ["puffer", "down", "winter", "cold weather", "warm"], "Men's", "Nylon"),
      item("leathergloves", "Brown Leather Gloves", "Accessory", "Brown", ["gloves", "leather", "winter", "cold weather"], "Men's", "Leather"),
      item("goggles", "Black Ski Goggles", "Accessory", "Black", ["ski goggles", "ski", "snowboard", "snow", "winter"], "Men's"),
      item("campshirt", "Black Camp-Collar Shirt", "Top", "Black", ["camp collar", "button-up", "night out", "date night", "evening", "smart casual"], "Men's", "Viscose"),
      item("trousers", "Charcoal Slim Wool Trousers", "Bottom", "Charcoal", ["trousers", "slim", "night out", "dinner", "smart casual", "dressy"], "Men's", "Wool"),
      item("loafers", "Brown Suede Penny Loafers", "Shoes", "Brown", ["loafers", "suede", "night out", "dinner", "smart casual"], "Men's", "Suede"),
      item("pajamas", "Navy Plaid Flannel Pajama Pants", "Bottom", "Navy", ["pajamas", "sleepwear", "lounge", "sleep", "flannel"], "Men's", "Cotton"),
    ],
    cloneFrom: "owner",
    voice: "Schedar", // picked by ear by the owner (2026-10-20) over Charon, Orus, Iapetus, Sadachbia, Achird
  },
  {
    key: "fresh",
    label: "Fresh (no closet)",
    describe: "A brand-new account with NO closet at all: every look is built from suggested pieces with real product photos. Use it for the empty-closet, wishlist and real-products clips.",
    wardrobe: [],
    startsEmpty: true,
  },
  {
    key: "streetwear",
    label: "Streetwear",
    describe: "Gender-neutral streetwear: oversized hoodies, cargos, a varsity jacket, chunky sneakers. Also stocked for winter and trips: a long down parka, sherpa fleece, combat boots, a snowboard jacket and baggy snow pants, goggles and mittens, board shorts and slides, a mesh top and faux leather pants for nights out, training gear, pajamas. Suits concerts, campus, nights out, casual weekends, snowboard trips, beach weekends.",
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
      // Winter, ski trip, beach weekend, nights out, workouts, sleep (2026-11-08).
      ...winterTrips({
        coat: ["Black Long Hooded Down Parka", "Black"],
        sweater: ["Charcoal Sherpa Fleece Quarter-Zip", "Charcoal"],
        boots: ["Black Lug-Sole Combat Boots", "Black"],
        skiJacket: ["Black Waterproof Snowboard Jacket", "Black"],
        skiPants: ["Olive Baggy Snow Pants", "Olive"],
        baseLayer: ["Grey Thermal Base Layer Top", "Grey"],
        snowBoots: ["Black Insulated Snow Boots", "Black"],
        gloves: ["Black Snowboard Mittens", "Black"],
      }, "Unisex"),
      item("goggles", "Black Snowboard Goggles", "Accessory", "Black", ["ski goggles", "snowboard", "ski", "snow", "winter"], "Unisex"),
      item("boardshorts", "Washed Black Board Shorts", "Bottom", "Black", ["board shorts", "swim trunks", "swimwear", "swim", "beach", "summer", "vacation"], "Unisex", "Polyester"),
      item("slides", "Black Rubber Slides", "Shoes", "Black", ["slides", "pool", "beach", "summer", "casual"], "Unisex", "Rubber"),
      item("mesh", "Black Mesh Long-Sleeve Top", "Top", "Black", ["mesh", "sheer", "night out", "party", "going out", "streetwear"], "Unisex", "Nylon"),
      item("leatherpants", "Black Faux Leather Straight Pants", "Bottom", "Black", ["faux leather", "pants", "night out", "party", "going out"], "Unisex", "Faux Leather"),
      item("trainingtee", "Grey Performance Training Tee", "Top", "Grey", ["training tee", "performance", "activewear", "workout", "gym", "athletic"], "Unisex", "Polyester"),
      item("trainingshorts", "Black Nylon Training Shorts", "Bottom", "Black", ["training shorts", "activewear", "workout", "gym", "athletic", "running"], "Unisex", "Nylon"),
      item("runners", "Black and Volt Running Shoes", "Shoes", "Black", ["running shoes", "sneakers", "athletic", "workout", "gym"], "Unisex", "Mesh"),
      item("pajamas", "Grey Waffle-Knit Pajama Set", "Top", "Grey", ["pajamas", "sleepwear", "lounge", "sleep"], "Unisex", "Cotton"),
    ],
  },
  {
    key: "minimal",
    label: "Minimal neutrals",
    describe: "A small, androgynous capsule in black, cream and camel: turtlenecks, wide trousers, a long coat. Also stocked for winter and trips: a long down puffer, ivory cable knit, a cream ski jacket and slim black ski pants, merino base layer, swim shorts with a linen camp shirt and sandals, a black silk shirt and loafers for dinners out, training gear, pajamas. Suits galleries, travel, dinners, work, ski trips, warm-weather escapes.",
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
      // Winter, ski trip, beach weekend, nights out, workouts, sleep (2026-11-08).
      ...winterTrips({
        sweater: ["Ivory Cable-Knit Wool Sweater", "Ivory"],
        skiJacket: ["Cream Insulated Ski Jacket", "Cream"],
        skiPants: ["Black Slim Ski Pants", "Black"],
        baseLayer: ["Charcoal Merino Base Layer Top", "Charcoal"],
        snowBoots: ["Black Waterproof Snow Boots", "Black"],
        hat: ["Oatmeal Ribbed Wool Beanie", "Oatmeal"],
        gloves: ["Black Leather Gloves", "Black"],
      }, "Unisex"),
      item("puffer", "Black Long Down Puffer Coat", "Outerwear", "Black", ["puffer", "down", "long", "winter", "cold weather", "minimal"], "Unisex", "Nylon"),
      item("swimshorts", "Black Tailored Swim Shorts", "Bottom", "Black", ["swim shorts", "swimwear", "swim", "beach", "pool", "summer", "vacation"], "Unisex", "Polyester"),
      item("linenshirt", "White Linen Camp-Collar Shirt", "Top", "White", ["linen", "camp collar", "summer", "beach", "resort", "vacation", "minimal"], "Unisex", "Linen"),
      item("sandals", "Black Leather Strap Sandals", "Shoes", "Black", ["sandals", "leather", "summer", "beach", "vacation", "minimal"], "Unisex", "Leather"),
      item("silkshirt", "Black Silk Camp-Collar Shirt", "Top", "Black", ["silk", "camp collar", "night out", "dinner", "evening", "minimal"], "Unisex", "Silk"),
      item("loafers", "Black Leather Loafers", "Shoes", "Black", ["loafers", "leather", "night out", "dinner", "smart casual", "minimal"], "Unisex", "Leather"),
      item("seamless", "Black Seamless Training Top", "Top", "Black", ["training top", "seamless", "activewear", "workout", "gym", "athletic"], "Unisex", "Nylon"),
      item("joggers", "Charcoal Tapered Training Joggers", "Bottom", "Charcoal", ["joggers", "activewear", "workout", "gym", "athletic"], "Unisex", "Polyester"),
      item("trainers", "White Minimal Trainers", "Shoes", "White", ["trainers", "sneakers", "athletic", "workout", "gym", "minimal"], "Unisex", "Mesh"),
      item("pajamas", "Cream Cotton Pajama Set", "Top", "Cream", ["pajamas", "sleepwear", "lounge", "sleep"], "Unisex", "Cotton"),
    ],
  },
  {
    key: "polished",
    label: "Polished workwear",
    describe: "Polished, feminine-leaning workwear: a tailored blazer, silk blouse, midi skirt, wrap dress, block heels. Also stocked for winter and trips: a long down puffer, cashmere crewneck, knee-high boots, a white belted ski jacket with black flared ski pants and faux-fur snow boots, a black bikini, linen cover-up and straw tote, a satin slip dress with gold heels for nights out, leggings and a sports bra, satin pajamas. Suits the office, interviews, events, dinners, ski trips, beach weekends.",
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
      // Winter, ski trip, beach weekend, nights out, workouts, sleep (2026-11-08).
      ...winterTrips({
        coat: ["Black Long Down Puffer Coat", "Black"],
        sweater: ["Grey Cashmere Crewneck Sweater", "Grey"],
        boots: ["Black Knee-High Leather Boots", "Black"],
        scarf: ["Camel Wool Blanket Scarf", "Camel"],
        skiJacket: ["White Belted Ski Jacket", "White"],
        skiPants: ["Black Flared Ski Pants", "Black"],
        baseLayer: ["Black Thermal Base Layer Top", "Black"],
        snowBoots: ["Cream Faux-Fur Trim Snow Boots", "Cream"],
        hat: ["Cream Knit Pom-Pom Beanie", "Cream"],
        gloves: ["Black Insulated Ski Gloves", "Black"],
      }, "Women's"),
      item("bikinitop", "Black Triangle Bikini Top", "Top", "Black", ["bikini", "swimwear", "swim", "beach", "pool", "summer", "vacation"], "Women's", "Nylon"),
      item("bikinibottom", "Black High-Waist Bikini Bottom", "Bottom", "Black", ["bikini", "swimwear", "swim", "beach", "pool", "summer", "vacation"], "Women's", "Nylon"),
      item("coverup", "White Linen Beach Cover-Up Dress", "Dress", "White", ["cover-up", "linen", "beach", "resort", "summer", "vacation"], "Women's", "Linen"),
      item("slidesandals", "Tan Leather Slide Sandals", "Shoes", "Tan", ["sandals", "slides", "summer", "beach", "vacation"], "Women's", "Leather"),
      item("straw", "Natural Straw Beach Tote", "Accessory", "Tan", ["straw bag", "tote", "beach", "summer", "vacation"], "Women's", "Straw"),
      item("slip", "Black Satin Slip Dress", "Dress", "Black", ["slip dress", "satin", "night out", "evening", "date night", "party"], "Women's", "Satin"),
      item("goldheels", "Gold Strappy Heeled Sandals", "Shoes", "Gold", ["heels", "strappy", "night out", "evening", "party"], "Women's", "Leather"),
      item("leggings", "Black High-Waist Leggings", "Bottom", "Black", ["leggings", "activewear", "workout", "yoga", "gym", "athletic"], "Women's", "Nylon"),
      item("sportsbra", "Sage Green Sports Bra", "Top", "Sage", ["sports bra", "activewear", "workout", "yoga", "gym", "athletic"], "Women's", "Nylon"),
      item("runners", "White Running Sneakers", "Shoes", "White", ["running shoes", "sneakers", "athletic", "workout", "gym"], "Women's", "Mesh"),
      item("pajamas", "Blush Satin Pajama Set", "Top", "Blush", ["pajamas", "sleepwear", "lounge", "sleep"], "Women's", "Satin"),
    ],
  },
];

const REVIEWER_EMAIL = "whichoutfitreview@test.com";

/**
 * The sign-in email for a persona: the reviewer for `original`, otherwise
 * "<local>+capture-<key>@<domain>" built from CAPTURE_EMAIL_BASE. Throws when
 * the base is unset — persona accounts are simply off until it is configured.
 * A cloned closet signs in the same way: never as the account it was copied from.
 */
export function personaEmail(key: string, base = process.env.CAPTURE_EMAIL_BASE): string {
  if (key === "original") return REVIEWER_EMAIL;
  const m = base?.trim().match(/^([^@+\s]+)@([^@\s]+)$/);
  if (!m) throw new Error("CAPTURE_EMAIL_BASE is not set (an address like you@example.com)");
  return `${m[1]}+capture-${key}@${m[2]}`.toLowerCase();
}

/** The narrators the engine may use; the voice endpoint accepts nothing else. */
export const VOICES = [
  "Sulafat",
  // Male, for closets that want one. Kept broad so a narrator can be chosen by ear.
  "Algieba", "Achird", "Umbriel", "Charon", "Orus", "Iapetus", "Enceladus", "Schedar",
  "Sadachbia", "Sadaltager", "Zubenelgenubi", "Alnilam", "Algenib", "Rasalgethi", "Puck", "Fenrir",
] as const;

/** Who narrates a clip filmed on this closet. Re-cuts are on `original`, so Sulafat. */
export function voiceFor(closet: string | null | undefined): string {
  return getPersona(closet ?? "original")?.voice ?? "Sulafat";
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
const LIGHT = /^(white|cream|ivory|ecru|oatmeal|nude|beige|silver|light|blush|natural)/i;

/**
 * The garment photo prompt: a plain product shot on a flat, uniform background
 * with no cast shadow, so the Mac can cut it out by the background colour.
 */
export function garmentPrompt(it: WardrobeItem): string {
  const how = it.category === "Shoes" ? "a pair, side by side at a slight angle" : it.category === "Accessory" ? "on its own" : "laid flat, neatly arranged";
  const bg = LIGHT.test(it.colorName) || LIGHT.test(it.name) ? "a flat, uniform medium grey (#8c8c8c)" : "a flat, uniform pure white";
  return `Studio product photo of a ${it.name.toLowerCase()}${it.fabric ? ` in ${it.fabric.toLowerCase()}` : ""}, ${how}, centered, filling about 75% of the frame, isolated on ${bg} seamless background, soft even lighting, no cast shadow, no mannequin, no person, no hanger, no props, no text, no logo, no watermark. Square format.`;
}
