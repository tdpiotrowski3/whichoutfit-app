import crypto from "crypto";
import zlib from "zlib";

// App Store Connect — Sales & Trends pull (Tier 1: downloads / redownloads /
// updates / proceeds). Validated against the real daily SALES/SUMMARY report.
// All secrets come from env; nothing is hardcoded.

function b64u(b: crypto.BinaryLike): string {
  return Buffer.from(b as Buffer).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function privateKey(): string {
  let k = process.env.APPLE_ASC_PRIVATE_KEY || "";
  // Vercel env may store the PEM with escaped newlines.
  if (k.includes("\\n")) k = k.replace(/\\n/g, "\n");
  return k.trim();
}

export function makeJwt(): string {
  const keyId = process.env.APPLE_ASC_KEY_ID || "";
  const issuer = process.env.APPLE_ASC_ISSUER_ID || "";
  const now = Math.floor(Date.now() / 1000);
  const header = b64u(JSON.stringify({ alg: "ES256", kid: keyId, typ: "JWT" }));
  const payload = b64u(JSON.stringify({ iss: issuer, iat: now, exp: now + 1200, aud: "appstoreconnect-v1" }));
  const input = `${header}.${payload}`;
  const sig = crypto.sign("SHA256", Buffer.from(input), { key: privateKey(), dsaEncoding: "ieee-p1363" });
  return `${input}.${b64u(sig)}`;
}

export type DayMetric = {
  day: string;
  units: number;
  downloads: number;
  redownloads: number;
  updates: number;
  proceeds: number;
};

function parseReport(tsv: string, day: string): DayMetric {
  const lines = tsv.trim().split("\n");
  const hdr = lines[0].split("\t");
  const iType = hdr.indexOf("Product Type Identifier");
  const iUnits = hdr.indexOf("Units");
  const iProc = hdr.indexOf("Developer Proceeds");
  let units = 0, downloads = 0, redownloads = 0, updates = 0, proceeds = 0;
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split("\t");
    if (c.length < hdr.length) continue;
    const t = (c[iType] || "").trim();
    const u = parseInt(c[iUnits] || "0", 10) || 0;
    const p = parseFloat(c[iProc] || "0") || 0;
    units += u;
    proceeds += u * p;
    if (t.startsWith("7")) updates += u;
    else if (t.startsWith("3")) redownloads += u;
    else if (t.startsWith("IA")) { /* in-app purchase units — not a download */ }
    else if (t.startsWith("1") || t.startsWith("F")) downloads += u;
  }
  return { day, units, downloads, redownloads, updates, proceeds: Math.round(proceeds * 100) / 100 };
}

async function fetchDay(date: string): Promise<DayMetric | null> {
  const params = new URLSearchParams({
    "filter[frequency]": "DAILY",
    "filter[reportType]": "SALES",
    "filter[reportSubType]": "SUMMARY",
    "filter[vendorNumber]": process.env.APPLE_VENDOR_NUMBER || "",
    "filter[version]": "1_0",
    "filter[reportDate]": date,
  });
  const res = await fetch(`https://api.appstoreconnect.apple.com/v1/salesReports?${params}`, {
    headers: { Authorization: `Bearer ${makeJwt()}`, Accept: "application/a-gzip" },
  });
  if (res.status === 404) return { day: date, units: 0, downloads: 0, redownloads: 0, updates: 0, proceeds: 0 };
  if (!res.ok) throw new Error(`ASC ${res.status} for ${date}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const tsv = zlib.gunzipSync(buf).toString("utf8");
  return parseReport(tsv, date);
}

// Pull the last `days` daily reports (idempotent; recent days self-heal as Apple
// restates). Returns only days with data plus zero-filled no-sale days.
export async function fetchSalesRange(days = 10): Promise<DayMetric[]> {
  const out: DayMetric[] = [];
  let lastError: Error | null = null;
  const now = new Date();
  for (let i = 1; i <= days; i++) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    const ds = d.toISOString().slice(0, 10);
    try {
      const m = await fetchDay(ds);
      if (m) out.push(m);
    } catch (e) {
      // One bad day is genuinely transient (Apple's report not ready yet) and the
      // next run backfills — so tolerate partial failure. But remember the reason.
      lastError = e instanceof Error ? e : new Error(String(e));
    }
  }
  // A 404 day still yields a zero-filled row, so `out` is only empty when EVERY
  // day threw — i.e. a systemic failure (revoked ASC key, wrong vendor number,
  // network), never a quiet-sales period. Surface it instead of returning a
  // clean empty result that the caller would silently persist as a flatline.
  if (out.length === 0 && lastError) throw lastError;
  return out;
}
