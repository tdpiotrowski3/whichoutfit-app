import { admin } from "@/lib/supabase";
import { getPersona, itemId, personaEmail, type Persona, type WardrobeItem } from "./personas";

// Server-side plumbing for the persona capture accounts (lib/contentEngine/
// personas.ts). Only emails in PERSONAS can ever pass through here — this is
// not a general way to sign in as someone.

/** The capture account's user id, creating it (confirmed) the first time. */
export async function ensurePersonaUser(p: Persona): Promise<string> {
  const db = admin();
  const email = personaEmail(p.key);
  const { data: created, error } = await db.auth.admin.createUser({ email, email_confirm: true });
  if (created?.user?.id) return created.user.id;
  if (error && !/registered|exists/i.test(error.message)) throw error;
  // Already there: page through users for the email (a handful of pages at our size).
  for (let page = 1; page <= 20; page++) {
    const { data, error: listErr } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (listErr) throw listErr;
    const hit = data.users.find((u) => (u.email ?? "").toLowerCase() === email);
    if (hit) return hit.id;
    if (data.users.length < 200) break;
  }
  throw new Error(`capture user for ${p.key} not found after create`);
}

/**
 * A fresh one-time code for the capture account, the same way reviewer-login
 * mints one for the reviewer. Also grants unlimited entitlement: without
 * Premium the app neither syncs the closet down nor lets the AI features run
 * unmetered, and both are what gets filmed.
 */
export async function personaOtp(key: string): Promise<{ email: string; otp: string }> {
  const p = getPersona(key);
  if (!p) throw new Error(`unknown persona ${key}`);
  const db = admin();
  const uid = await ensurePersonaUser(p);
  const { error: entErr } = await db
    .from("entitlements")
    .upsert({ user_id: uid, premium_until: "2099-01-01T00:00:00Z", image_unlimited: true }, { onConflict: "user_id" });
  if (entErr) throw entErr;
  const email = personaEmail(p.key);
  const { data, error } = await db.auth.admin.generateLink({ type: "magiclink", email });
  const otp = data?.properties?.email_otp;
  if (error || !otp) throw error ?? new Error("could not mint a code");
  return { email, otp };
}

/** The ClothingItem document the iOS/Android apps decode (Models.swift). */
export function clothingDoc(persona: string, it: WardrobeItem, index: number) {
  const id = itemId(persona, it.slot);
  return {
    id,
    name: it.name,
    category: it.category,
    colorName: it.colorName,
    ...(it.fabric ? { fabric: it.fabric } : {}),
    tags: it.tags,
    imageRef: id,
    extraImageRefs: [],
    wearCount: 0,
    // Seconds precision: iOS decodes .iso8601 WITHOUT fractional seconds and
    // drops a document that has them (CLAUDE.md, wire-format invariant).
    dateAdded: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    sortIndex: -index,
    resaleCategory: it.resaleCategory,
    processingStatus: "ready",
  };
}

const BUCKET = "closet-images";

/** A signed URL for the item's photo, at the exact path sync reads: <uid>/<REF>.img */
export async function signItemImage(persona: string, slot: string): Promise<{ uploadUrl: string; path: string }> {
  const p = getPersona(persona);
  const it = p?.wardrobe.find((w) => w.slot === slot);
  if (!p || !it) throw new Error(`unknown item ${persona}/${slot}`);
  const uid = await ensurePersonaUser(p);
  const path = `${uid.toLowerCase()}/${itemId(persona, slot)}.img`;
  const { data, error } = await admin().storage.from(BUCKET).createSignedUploadUrl(path, { upsert: true });
  if (error || !data) throw error ?? new Error("could not sign upload");
  return { uploadUrl: data.signedUrl, path };
}

/** Write (or rewrite) the closet row once its photo is in place. */
export async function commitItem(persona: string, slot: string): Promise<{ id: string }> {
  const p = getPersona(persona);
  const index = p?.wardrobe.findIndex((w) => w.slot === slot) ?? -1;
  if (!p || index < 0) throw new Error(`unknown item ${persona}/${slot}`);
  const uid = await ensurePersonaUser(p);
  const doc = clothingDoc(persona, p.wardrobe[index], index);
  const { error } = await admin()
    .from("closet_items")
    .upsert(
      { id: doc.id.toLowerCase(), user_id: uid, data: doc, updated_at: new Date().toISOString(), deleted_at: null },
      { onConflict: "user_id,id" } // the table's primary key is (user_id, id)
    );
  if (error) throw error;
  return { id: doc.id };
}

/** Which slots of a persona's closet already exist, for resumable seeding. */
export async function seededSlots(persona: string): Promise<string[]> {
  const p = getPersona(persona);
  if (!p || p.wardrobe.length === 0) return [];
  const uid = await ensurePersonaUser(p);
  const ids = new Map(p.wardrobe.map((w) => [itemId(persona, w.slot).toLowerCase(), w.slot]));
  const { data, error } = await admin().from("closet_items").select("id").eq("user_id", uid).is("deleted_at", null);
  if (error) throw error;
  return (data ?? []).map((r) => ids.get((r as { id: string }).id)).filter((s): s is string => !!s);
}
