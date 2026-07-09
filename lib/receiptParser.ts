// Receipt → structured expense extraction via the Gemini API (vision + PDF).
// Shared by the "drop a receipt" autofill (app/api/finance/parse-receipt) and the
// Gmail auto-ingest (lib/gmail.ts). Server-only: requires GEMINI_API_KEY.
//
// We reuse the SAME model backend the app already runs on (the Supabase `ai`
// edge function calls gemini-2.5-flash with GEMINI_API_KEY). The webapp needs
// its own copy of GEMINI_API_KEY in Vercel env — edge-function secrets are
// separate. Raw fetch, no SDK (matching lib/mercury.ts). Structured JSON is
// enforced with Gemini's responseSchema so parsing is reliable.

const DEFAULT_MODEL = "gemini-2.5-flash";
function endpoint(model: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}

export const RECEIPT_CATEGORIES = [
  "Software & subscriptions",
  "Advertising",
  "Web hosting & domains",
  "Legal & professional / Organizational costs",
  "Equipment / test devices",
  "Office supplies",
  "Meals & entertainment",
  "Travel",
  "Bank fees",
  "Uncategorized",
] as const;

export type ExtractedReceipt = {
  vendor: string;
  txn_date: string; // YYYY-MM-DD
  amount: number; // dollars, the total actually charged
  currency: string; // ISO, usually "USD"
  category: string;
  payment_method: string | null; // e.g. "MC ****1325", "Apple Pay", "Link"
  description: string | null;
  receipt_ref: string | null; // invoice / order / confirmation number
  entry_type: "cash" | "memo"; // memo = non-cash draw from a prepaid balance
  notes: string | null;
  confidence: number; // 0..1 self-reported
};

const SYSTEM = `You extract structured expense data from a single purchase receipt, invoice, or order confirmation for a small US LLC's bookkeeping.
- vendor: the merchant/company charged.
- txn_date: the charge/payment date as "YYYY-MM-DD".
- amount: the TOTAL amount actually charged (grand total incl. tax, not the subtotal), as a number. Never invent an amount.
- currency: ISO code, e.g. "USD".
- category: the single best fit from the allowed list.
- payment_method: card/last4/wallet if shown (e.g. "MC ****1325", "Apple Pay ****1325", "Link"), else null.
- description: one short line of what was bought, else null.
- receipt_ref: the invoice/order/receipt/confirmation number if present, else null.
- entry_type: "memo" if the money was drawn from an already-funded prepaid balance (e.g. Meta ad spend consuming prepaid funds); otherwise "cash".
- notes: any other useful detail, else null.
- confidence: your confidence 0..1 that vendor+date+amount are correct.`;

// Gemini responseSchema (OpenAPI subset) — forces valid, typed JSON back.
const SCHEMA = {
  type: "OBJECT",
  properties: {
    vendor: { type: "STRING" },
    txn_date: { type: "STRING" },
    amount: { type: "NUMBER" },
    currency: { type: "STRING" },
    category: { type: "STRING", enum: [...RECEIPT_CATEGORIES] },
    payment_method: { type: "STRING", nullable: true },
    description: { type: "STRING", nullable: true },
    receipt_ref: { type: "STRING", nullable: true },
    entry_type: { type: "STRING", enum: ["cash", "memo"] },
    notes: { type: "STRING", nullable: true },
    confidence: { type: "NUMBER" },
  },
  required: ["vendor", "txn_date", "amount", "currency", "category", "entry_type", "confidence"],
};

type Part = Record<string, unknown>;

async function callGemini(parts: Part[]): Promise<ExtractedReceipt> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("Missing GEMINI_API_KEY env var");
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;

  const res = await fetch(endpoint(model), {
    method: "POST",
    headers: { "x-goog-api-key": key, "content-type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: "user", parts }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: SCHEMA,
        temperature: 0,
        thinkingConfig: { thinkingBudget: 0 }, // flash 2.5: skip hidden thinking → fast + cheap
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Gemini ${res.status}: ${body.slice(0, 300)}`);
  }

  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = (json.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
  if (!text) throw new Error("Gemini returned no content (possibly blocked or truncated).");
  return normalize(parseJson(text));
}

function parseJson(text: string): Record<string, unknown> {
  const cleaned = text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]) as Record<string, unknown>;
    throw new Error("Could not parse extraction JSON from the model response.");
  }
}

function normalize(o: Record<string, unknown>): ExtractedReceipt {
  const str = (v: unknown): string | null => {
    if (v == null) return null;
    const s = String(v).trim();
    return s === "" || s.toLowerCase() === "null" ? null : s;
  };
  const amountRaw = typeof o.amount === "number" ? o.amount : parseFloat(String(o.amount ?? "").replace(/[$,]/g, ""));
  const date = str(o.txn_date) ?? "";
  const isoDate = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "";
  return {
    vendor: str(o.vendor) ?? "Unknown",
    txn_date: isoDate,
    amount: Number.isFinite(amountRaw) ? Math.round(amountRaw * 100) / 100 : 0,
    currency: (str(o.currency) ?? "USD").toUpperCase(),
    category: str(o.category) ?? "Uncategorized",
    payment_method: str(o.payment_method),
    description: str(o.description),
    receipt_ref: str(o.receipt_ref),
    entry_type: str(o.entry_type) === "memo" ? "memo" : "cash",
    notes: str(o.notes),
    confidence: typeof o.confidence === "number" ? o.confidence : 0.5,
  };
}

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

/** Extract from a receipt FILE (PDF or image). */
export async function parseReceiptFile(bytes: Uint8Array, mimeType: string): Promise<ExtractedReceipt> {
  const mime = (mimeType || "").toLowerCase() || "application/octet-stream";
  const inlineMime = mime === "application/pdf" || mime.startsWith("image/") ? mime : "application/pdf";
  return callGemini([
    { inline_data: { mime_type: inlineMime, data: toBase64(bytes) } },
    { text: "Extract the expense from this receipt." },
  ]);
}

/** Extract from a plain-text / HTML receipt body (e.g. an email with no PDF). */
export async function parseReceiptText(text: string): Promise<ExtractedReceipt> {
  return callGemini([{ text: `Extract the expense from this receipt email:\n\n${text.slice(0, 12000)}` }]);
}
