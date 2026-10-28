import { admin } from "@/lib/supabase";
import { WHICHOUTFIT } from "@/lib/brand";
import { captionWithTags } from "@/lib/contentEngine/hashtags";
import {
  createReelContainer,
  containerStatus,
  publishContainer,
  isInstagramPublishConfigured,
} from "@/lib/instagram";

// Drains public.social_posts. Shared by the cron route and the admin
// "Publish due now" button, same arrangement as lib/socialSync.ts.
//
// A Reel goes out in three steps: hand Instagram the video (a "container"),
// wait while Meta downloads and transcodes it, then publish. When the caller
// passes `waitUntil`, a run does all three in one go, polling the container
// until it is ready or the deadline passes. That is what lets a single daily
// Vercel cron (all the Hobby plan allows) post on the day it is due. Without a
// deadline it does one step per row and the next run picks it up, so a
// half-finished post is never lost either way.
//
//   queued ──create container──▶ publishing ──FINISHED──▶ posted
//     ▲                              │
//     └───── create failed ──────────┘  (until attempts runs out → failed)
//
// TikTok rows are never touched. The Content Posting API's Direct Post endpoint
// forces every video to PRIVATE until the app passes TikTok's audit, so posting
// them from here would publish things nobody can see. They sit at 'manual' and
// the morning reminder email (lib/tiktokReminder.ts) hands them over.

const MAX_ATTEMPTS = 4;

/** Rows per run. A run only ever has a post or two due, so this is generous. */
const BATCH = 5;

/** A 'publishing' row with no container this old is a crashed claim, not a transcode. */
const STALE_CLAIM_MS = 10 * 60_000;

/** How often to re-check a container while waiting on Meta's transcode. */
const POLL_MS = 8_000;

export type SocialPostRow = {
  id: string;
  clip_id: string;
  platform: "instagram" | "tiktok";
  caption: string;
  hashtags: string | null;
  video_url: string | null;
  campaign: string | null;
  scheduled_for: string;
  status: "queued" | "publishing" | "posted" | "failed" | "manual";
  container_id: string | null;
  platform_post_id: string | null;
  attempts: number;
  error: string | null;
  posted_at: string | null;
  updated_at: string;
};

export type PublishResult = {
  posted: string[];
  pending: string[];
  failed: { clip: string; error: string }[];
  skipped: string[];
  errors: string[];
};

export type PublishOptions = {
  /** Epoch ms. If set, wait on each container until it publishes or this passes. */
  waitUntil?: number;
};

/** Instagram wants one text field, so the hashtags ride at the end of the caption. */
export function fullCaption(row: Pick<SocialPostRow, "caption" | "hashtags">): string {
  return captionWithTags(row.caption, row.hashtags);
}

/**
 * Claim a row for this run by flipping queued → publishing, conditional on it
 * STILL being queued. Two overlapping runs would otherwise both create a
 * container for the same post and the second one would publish a duplicate.
 * Returns false when another run got there first.
 */
async function claim(id: string, attempts: number): Promise<boolean> {
  const { data, error } = await admin()
    .from("social_posts")
    .update({ status: "publishing", attempts: attempts + 1, error: null })
    .eq("id", id)
    .eq("status", "queued")
    .select("id");
  if (error) throw error;
  return (data ?? []).length > 0;
}

async function patch(id: string, fields: Partial<SocialPostRow>): Promise<void> {
  const { error } = await admin().from("social_posts").update(fields).eq("id", id);
  if (error) throw error;
}

/** Out of retries → park it as failed; otherwise put it back for the next run. */
async function backOff(row: SocialPostRow, message: string): Promise<"failed" | "queued"> {
  const done = row.attempts + 1 >= MAX_ATTEMPTS;
  await patch(row.id, {
    status: done ? "failed" : "queued",
    container_id: null,
    error: message.slice(0, 500),
  });
  return done ? "failed" : "queued";
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Check a container once and act on what it says. When `waitUntil` is set,
 * keep checking until it settles or time runs out.
 */
async function advance(
  row: SocialPostRow,
  containerId: string,
  out: PublishResult,
  waitUntil?: number
): Promise<void> {
  for (;;) {
    const { status, detail } = await containerStatus(containerId);

    if (status === "FINISHED") {
      const mediaId = await publishContainer(containerId);
      await patch(row.id, {
        status: "posted",
        platform_post_id: mediaId,
        posted_at: new Date().toISOString(),
        error: null,
      });
      out.posted.push(row.clip_id);
      return;
    }
    if (status === "PUBLISHED") {
      // Published on a previous run that died before writing the row back.
      await patch(row.id, { status: "posted", posted_at: new Date().toISOString(), error: null });
      out.posted.push(row.clip_id);
      return;
    }
    if (status === "ERROR" || status === "EXPIRED") {
      const state = await backOff(row, `container ${status}: ${detail ?? "no detail"}`);
      if (state === "failed") out.failed.push({ clip: row.clip_id, error: detail ?? status });
      else out.pending.push(row.clip_id);
      return;
    }

    // IN_PROGRESS: wait and look again, or leave it for the next run.
    if (!waitUntil || Date.now() + POLL_MS > waitUntil) {
      out.pending.push(row.clip_id);
      return;
    }
    await sleep(POLL_MS);
  }
}

export async function runSocialPublish(now = new Date(), opts: PublishOptions = {}): Promise<PublishResult> {
  const out: PublishResult = { posted: [], pending: [], failed: [], skipped: [], errors: [] };

  if (!isInstagramPublishConfigured()) {
    out.errors.push("instagram: not configured (META_ACCESS_TOKEN / IG_USER_ID unset)");
    return out;
  }

  const { data, error } = await admin()
    .from("social_posts")
    .select("*")
    .eq("brand", WHICHOUTFIT)
    .eq("platform", "instagram")
    .in("status", ["queued", "publishing"])
    .lte("scheduled_for", now.toISOString())
    .order("scheduled_for", { ascending: true })
    .limit(BATCH);
  if (error) throw error;

  for (const row of (data ?? []) as SocialPostRow[]) {
    try {
      // --- already at the platform: check (and maybe wait on) the transcode --
      if (row.status === "publishing" && row.container_id) {
        await advance(row, row.container_id, out, opts.waitUntil);
        continue;
      }

      // --- claimed but never got a container: recover a crashed run -------
      if (row.status === "publishing" && !row.container_id) {
        if (Date.now() - new Date(row.updated_at).getTime() < STALE_CLAIM_MS) {
          out.pending.push(row.clip_id); // a sibling run may be mid-create
          continue;
        }
        await patch(row.id, { status: "queued" });
        out.pending.push(row.clip_id);
        continue;
      }

      // --- queued: create the container -----------------------------------
      if (!row.video_url) {
        await patch(row.id, { status: "failed", error: "No video_url — upload the clip and set it first." });
        out.failed.push({ clip: row.clip_id, error: "no video_url" });
        continue;
      }

      if (!(await claim(row.id, row.attempts))) {
        out.skipped.push(row.clip_id); // another run owns it
        continue;
      }

      let containerId: string;
      try {
        containerId = await createReelContainer(row.video_url, fullCaption(row));
        await patch(row.id, { container_id: containerId });
      } catch (e) {
        const msg = (e as Error).message;
        const state = await backOff({ ...row, attempts: row.attempts + 1 }, msg);
        if (state === "failed") out.failed.push({ clip: row.clip_id, error: msg });
        else out.pending.push(row.clip_id);
        continue;
      }

      await advance({ ...row, attempts: row.attempts + 1 }, containerId, out, opts.waitUntil);
    } catch (e) {
      // Never let one bad row stop the batch.
      out.errors.push(`${row.clip_id}: ${(e as Error).message}`);
    }
  }

  return out;
}
