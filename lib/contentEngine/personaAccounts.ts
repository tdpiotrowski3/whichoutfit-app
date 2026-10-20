import { admin } from "@/lib/supabase";
import { getPersona, itemId, personaEmail, type Persona, type WardrobeItem } from "./personas";

// Server-side plumbing for the persona capture accounts (lib/contentEngine/
// personas.ts). Only emails in PERSONAS can ever pass through here — this is
// not a general way to sign in as someone.

/** The capture account's user id, creating it (confirmed) the first time. */
export async function ensurePersonaUser(p: Persona): Promise<string> {
  const email = personaEmail(p.key);
  const { data: created, error } = await admin().auth.admin.createUser({ email, email_confirm: true });
  if (created?.user?.id) return created.user.id;
  if (error && !/registered|exists/i.test(error.message)) throw error;
  const id = await findUserId(email);
  if (!id) throw new Error(`capture user for ${p.key} not found after create`);
  return id;
}

/** A user id by email, paging the admin list (a handful of pages at our size). */
async function findUserId(email: string): Promise<string | null> {
  const db = admin();
  for (let page = 1; page <= 20; page++) {
    const { data, error: listErr } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (listErr) throw listErr;
    const hit = data.users.find((u) => (u.email ?? "").toLowerCase() === email.toLowerCase());
    if (hit) return hit.id;
    if (data.users.length < 200) break;
  }
  return null;
}

/**
 * A fresh one-time code for the capture account, the same way reviewer-login
 * mints one for the reviewer. Also makes sure the account has Premium: without
 * it the app neither syncs the closet down nor runs the AI features unmetered,
 * and both are what gets filmed.
 *
 * Premium is only ADDED where the account has no entitlement row at all; an
 * existing row is never touched. Nothing should ever point this at a real
 * account, but if it did, overwriting premium_until would corrupt real billing
 * data (the owner's own row is a real paid subscription).
 *
 * `readOnly` would tell capture.sh to run the app pull-only (for a real
 * account; none of the personas is one now); `syncWait` is how long to let the
 * closet come down after a fresh install — longer for a big cloned closet.
 */
export async function personaOtp(key: string): Promise<{ email: string; otp: string; readOnly: boolean; syncWait: number }> {
  const p = getPersona(key);
  if (!p) throw new Error(`unknown persona ${key}`);
  const db = admin();
  const uid = await ensurePersonaUser(p);
  const { error: entErr } = await db
    .from("entitlements")
    .upsert(
      { user_id: uid, premium_until: "2099-01-01T00:00:00Z", image_unlimited: true },
      { onConflict: "user_id", ignoreDuplicates: true }
    );
  if (entErr) throw entErr;
  const email = personaEmail(p.key);
  const { data, error } = await db.auth.admin.generateLink({ type: "magiclink", email });
  const otp = data?.properties?.email_otp;
  if (error || !otp) throw error ?? new Error("could not mint a code");
  return { email, otp, readOnly: false, syncWait: p.cloneFrom ? 90 : 30 };
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

// --- cloning the owner's closet ------------------------------------------------
//
// A persona with cloneFrom: "owner" films on a COPY of the owner's real closet:
// rows copied as-is (same item ids, which are only unique per user), primary
// photos copied server-side in Storage. The owner's account is only ever read.
// Extra photos (kept originals) are not copied and are dropped from the copy, so
// the copy never references an object it doesn't have.

const CLONE_BATCH = 25;

export type CloneResult = { copied: number; total: number; next: number | null; removed: number };

/**
 * Copy one batch of the owner's live closet, starting at `offset` (stable order
 * by id). The last batch also removes anything in the persona's closet that is
 * no longer in the owner's, so re-running mirrors it — including the generated
 * items an earlier menswear closet had.
 */
export async function cloneCloset(persona: string, offset = 0): Promise<CloneResult> {
  const p = getPersona(persona);
  if (!p?.cloneFrom) throw new Error(`${persona} is not a cloned closet`);
  const ownerEmail = process.env.CAPTURE_OWNER_EMAIL?.trim();
  if (!ownerEmail) throw new Error("CAPTURE_OWNER_EMAIL is not set");
  const ownerId = await findUserId(ownerEmail);
  if (!ownerId) throw new Error("owner account not found");
  const uid = await ensurePersonaUser(p);
  if (uid === ownerId) throw new Error("refusing to clone a closet onto itself");

  const db = admin();
  const { count, error: cErr } = await db
    .from("closet_items")
    .select("id", { count: "exact", head: true })
    .eq("user_id", ownerId)
    .is("deleted_at", null);
  if (cErr) throw cErr;
  const total = count ?? 0;

  const { data, error } = await db
    .from("closet_items")
    .select("id,data")
    .eq("user_id", ownerId)
    .is("deleted_at", null)
    .order("id")
    .range(offset, offset + CLONE_BATCH - 1);
  if (error) throw error;
  const rows = (data ?? []) as { id: string; data: Record<string, unknown> }[];

  const storage = db.storage.from(BUCKET);
  let copied = 0;
  for (const r of rows) {
    const ref = typeof r.data.imageRef === "string" ? r.data.imageRef : null;
    if (ref) {
      const to = `${uid.toLowerCase()}/${ref}.img`;
      await storage.remove([to]); // copy() won't overwrite; a re-run refreshes the photo
      const { error: cpErr } = await storage.copy(`${ownerId.toLowerCase()}/${ref}.img`, to);
      if (cpErr && !/not.?found/i.test(cpErr.message)) throw cpErr;
      if (cpErr) continue; // the owner's row points at a missing photo; skip it rather than ship a blank tile
    }
    const { error: upErr } = await db.from("closet_items").upsert(
      {
        id: r.id,
        user_id: uid,
        data: { ...r.data, extraImageRefs: [] },
        updated_at: new Date().toISOString(),
        deleted_at: null,
      },
      { onConflict: "user_id,id" }
    );
    if (upErr) throw upErr;
    copied++;
  }

  const next = offset + rows.length < total ? offset + rows.length : null;
  let removed = 0;
  if (next === null) {
    const { data: ownerIds, error: idErr } = await db.from("closet_items").select("id").eq("user_id", ownerId).is("deleted_at", null);
    if (idErr) throw idErr;
    const keep = new Set((ownerIds ?? []).map((x) => (x as { id: string }).id));
    const { data: mine, error: mErr } = await db.from("closet_items").select("id,data").eq("user_id", uid).is("deleted_at", null);
    if (mErr) throw mErr;
    const staleRows = ((mine ?? []) as { id: string; data: { imageRef?: string } }[]).filter((x) => !keep.has(x.id));
    const stale = staleRows.map((x) => x.id);
    if (stale.length) {
      // Their photos go too: closet-images already leaks orphans (FitCheck CLAUDE.md).
      const paths = staleRows.flatMap((x) => (x.data.imageRef ? [`${uid.toLowerCase()}/${x.data.imageRef}.img`] : []));
      if (paths.length) await storage.remove(paths);
      // Soft delete, the way the apps do, so a synced device drops them too.
      const { error: dErr } = await db
        .from("closet_items")
        .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("user_id", uid)
        .in("id", stale);
      if (dErr) throw dErr;
      removed = stale.length;
    }
  }
  return { copied, total, next, removed };
}

/** Live items in a persona's closet, for the planner's "is it stocked?" check. */
export async function closetSize(persona: string): Promise<number> {
  const p = getPersona(persona);
  if (!p) return 0;
  const uid = await ensurePersonaUser(p);
  const { count, error } = await admin()
    .from("closet_items")
    .select("id", { count: "exact", head: true })
    .eq("user_id", uid)
    .is("deleted_at", null);
  if (error) throw error;
  return count ?? 0;
}
