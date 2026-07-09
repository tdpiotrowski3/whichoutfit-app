import { admin } from "./supabase";
import { isRoiCost } from "./finance";
import { parseReceiptFile, parseReceiptText } from "./receiptParser";

// Gmail auto-ingest — poll a label of forwarded receipts and turn each new
// message into an expense row (Gemini extraction), attaching the PDF to the
// receipts bucket. Mirrors lib/mercury.ts: idempotent, keyed by
// receipt_ref = "gmail:<messageId>", so re-running only adds new mail.
//
// Uses the Gmail REST API directly (no SDK) with an offline refresh token.
// Required env: GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, GMAIL_LABEL.
// Optional: GMAIL_QUERY (default "newer_than:180d"), GMAIL_MAX_PER_RUN (default 25).

const OAUTH = "https://oauth2.googleapis.com/token";
const API = "https://gmail.googleapis.com/gmail/v1/users/me";

function env(k: string): string {
  const v = process.env[k];
  if (!v) throw new Error(`Missing ${k} env var`);
  return v;
}

async function accessToken(): Promise<string> {
  const body = new URLSearchParams({
    client_id: env("GMAIL_CLIENT_ID"),
    client_secret: env("GMAIL_CLIENT_SECRET"),
    refresh_token: env("GMAIL_REFRESH_TOKEN"),
    grant_type: "refresh_token",
  });
  const res = await fetch(OAUTH, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`Gmail auth ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = (await res.json()) as { access_token?: string };
  if (!j.access_token) throw new Error("Gmail auth returned no access_token");
  return j.access_token;
}

async function api<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  if (!res.ok) throw new Error(`Gmail ${res.status} on ${path}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as T;
}

function b64urlToBytes(data: string): Uint8Array {
  const b64 = data.replace(/-/g, "+").replace(/_/g, "/");
  return new Uint8Array(Buffer.from(b64, "base64"));
}

type Part = {
  mimeType?: string;
  filename?: string;
  body?: { data?: string; attachmentId?: string; size?: number };
  parts?: Part[];
  headers?: { name: string; value: string }[];
};
type Message = { id: string; snippet?: string; payload?: Part };

function walk(part: Part | undefined, fn: (p: Part) => void) {
  if (!part) return;
  fn(part);
  for (const c of part.parts ?? []) walk(c, fn);
}

function header(msg: Message, name: string): string | null {
  const h = (msg.payload?.headers ?? []).find((x) => x.name.toLowerCase() === name.toLowerCase());
  return h?.value ?? null;
}

function htmlToText(html: string): string {
  return html.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

async function resolveLabelId(token: string, label: string): Promise<string> {
  // Accept a raw label id (system labels or "Label_xxx") or a display name.
  if (label === label.toUpperCase() || label.startsWith("Label_")) return label;
  const { labels } = await api<{ labels: { id: string; name: string }[] }>(token, "/labels");
  const found = labels.find((l) => l.name.toLowerCase() === label.toLowerCase());
  if (!found) throw new Error(`Gmail label "${label}" not found`);
  return found.id;
}

export type GmailSyncResult = { scanned: number; inserted: number; skipped: number; remaining: number };

export async function syncGmail(): Promise<GmailSyncResult> {
  const maxPerRun = Number(process.env.GMAIL_MAX_PER_RUN || 25);
  const query = process.env.GMAIL_QUERY || "newer_than:180d";
  const token = await accessToken();
  const labelId = await resolveLabelId(token, env("GMAIL_LABEL"));
  const sb = admin();

  // Idempotency + cross-source double-count guard.
  const { data: existing } = await sb.from("expenses").select("receipt_ref, vendor, txn_date, amount_cents");
  const seenGmail = new Set<string>();
  const seenCharge = new Set<string>();
  for (const e of existing ?? []) {
    if (e.receipt_ref) seenGmail.add(e.receipt_ref as string);
    seenCharge.add(`${String(e.vendor).toLowerCase()}|${e.txn_date}|${e.amount_cents}`);
  }

  // List message ids under the label.
  const list = await api<{ messages?: { id: string }[] }>(
    token,
    `/messages?labelIds=${encodeURIComponent(labelId)}&maxResults=200&q=${encodeURIComponent(query)}`,
  );
  const ids = (list.messages ?? []).map((m) => m.id);

  let scanned = 0;
  let inserted = 0;
  let remaining = 0;

  for (const id of ids) {
    const ref = `gmail:${id}`;
    if (seenGmail.has(ref)) continue;
    scanned++;
    if (inserted >= maxPerRun) { remaining++; continue; }

    const msg = await api<Message>(token, `/messages/${id}?format=full`);

    // Prefer a PDF attachment; fall back to the text/HTML body.
    let pdf: { attachmentId: string; filename: string } | null = null;
    let textBody = "";
    let htmlBody = "";
    walk(msg.payload, (p) => {
      const mt = (p.mimeType || "").toLowerCase();
      if (mt === "application/pdf" && p.body?.attachmentId && !pdf) {
        pdf = { attachmentId: p.body.attachmentId, filename: p.filename || `${id}.pdf` };
      } else if (mt === "text/plain" && p.body?.data && !textBody) {
        textBody = Buffer.from(b64urlToBytes(p.body.data)).toString("utf8");
      } else if (mt === "text/html" && p.body?.data && !htmlBody) {
        htmlBody = htmlToText(Buffer.from(b64urlToBytes(p.body.data)).toString("utf8"));
      }
    });

    let extracted;
    let receiptPath: string | null = null;
    try {
      if (pdf) {
        const att = await api<{ data: string }>(token, `/messages/${id}/attachments/${(pdf as { attachmentId: string }).attachmentId}`);
        const bytes = b64urlToBytes(att.data);
        extracted = await parseReceiptFile(bytes, "application/pdf");
        // Store the source PDF in the private receipts bucket.
        const path = `gmail/${id}.pdf`;
        const { error: upErr } = await sb.storage.from("receipts").upload(path, bytes, { contentType: "application/pdf", upsert: true });
        if (!upErr) receiptPath = path;
      } else {
        const body = textBody || htmlBody || msg.snippet || "";
        if (!body.trim()) continue;
        extracted = await parseReceiptText(body);
      }
    } catch {
      // Skip messages the model can't parse; they'll be retried next run.
      continue;
    }

    if (!extracted.txn_date || !extracted.amount) continue; // not a usable receipt

    const cents = Math.round(extracted.amount * 100);
    const chargeKey = `${extracted.vendor.toLowerCase()}|${extracted.txn_date}|${cents}`;
    if (seenCharge.has(chargeKey)) continue; // already in the ledger from another source
    seenCharge.add(chargeKey);
    seenGmail.add(ref);

    const subject = header(msg, "Subject");
    const noteBits = [extracted.notes, extracted.receipt_ref ? `ref ${extracted.receipt_ref}` : null, subject ? `email: ${subject}` : null].filter(Boolean);

    const { error } = await sb.from("expenses").insert({
      txn_date: extracted.txn_date,
      vendor: extracted.vendor,
      description: extracted.description,
      category: extracted.category || "Uncategorized",
      amount_cents: cents,
      payment_method: extracted.payment_method,
      entry_type: extracted.entry_type,
      excluded: extracted.entry_type === "memo",
      roi_impacting: isRoiCost(extracted.vendor, extracted.category, extracted.description),
      deductible: true,
      receipt_ref: ref,
      receipt_path: receiptPath,
      source: "gmail",
      notes: noteBits.join(" · ") || null,
    });
    if (error) throw error;
    inserted++;
  }

  return { scanned, inserted, skipped: scanned - inserted - remaining, remaining };
}
