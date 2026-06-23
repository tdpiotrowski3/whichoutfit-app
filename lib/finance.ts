// Default ROI classification for auto-ingested expenses (Mercury sync, CSV
// import). ROI = marketing + AI + the infra/hosting that runs the product;
// everything else (LLC/formation, furniture, bank fees, …) defaults to
// Overhead. Always overridable per-row via the ledger chip in the dashboard.

const ROI_VENDOR_KEYWORDS = ["anthropic", "claude", "google", "porkbun", "openai", "vercel", "supabase"];

export function isRoiCost(vendor: string, category?: string | null, description?: string | null): boolean {
  if ((category ?? "").toLowerCase() === "advertising") return true;
  const hay = `${vendor} ${description ?? ""}`.toLowerCase();
  return ROI_VENDOR_KEYWORDS.some((k) => hay.includes(k));
}
