import { admin } from "@/lib/supabase";
import {
  createReelContainer,
  containerStatus,
  publishContainer,
  isInstagramPublishConfigured,
} from "@/lib/instagram";

// Drains public.social_posts. Shared by the Vercel cron and the admin
// "Publish due now" button, same arrangement as lib/socialSync.ts.
//
// ONE TRANSITION PER ROW PER RUN. Instagram needs tens of seconds to transcode
// a Reel and a serverless function gets 60, so this never waits on a container:
// a run either creates one or checks one, and the next run picks it up. Call it
// often (every 15 min) and a post goes out within ~15 min of its slot.
//
//   queued ──create container──▶ publishing ──FINISHED──▶ posted
//      ▲                              │
//      └───── create failed ──────────┘ (until attempts runs out → failed)
//
// TikTok rows are never touched. The Content Posting API's Direct Post endpoint
// forces every video to PRIVATE until the app passes TikTok's audit, so posting
// them from here would publish things nobody can see. They sit at 'manual' and
// the morning reminder hands them over. See supabase/social_publishing.sql.

const MAX_ATTEMPTS = 4;

/** Rows per run. Each costs 1–2 Graph calls, so this stays far inside 60s. */
const BATCH = 5;

/** A 'publishing' row with no container this old is a crashed claim, not a transcode. */
const STALE_CLAIM_MS = 10 * 60_000;

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

/** Instagram wants one text field, so the hashtags ride at the end of the caption. */
export function fullCaption(row: Pick<SocialPostRow, "caption" | "hashtags">): string {
  return row.hashtags?.trim() ? `${row.caption.trim()}\n\n${row.hashtags.trim()}` : row.caption.trim();
}

/**
 * Claim a row for this run by flipping queued → publishing, conditional on it
 * STILL being queued. Two overlapping cron runs would otherwise both create a
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

export async function runSocialPublish(now = new Date()): Promise<PublishResult> {
  const out: PublishResult = { posted: [], pending: [], failed: [], skipped: [], errors: [] };

  if (!isInstagramPublishConfigured()) {
    out.errors.push("instagram: not configured (META_ACCESS_TOKEN / IG_USER_ID unset)");
    return out;
  }

  const { data, error } = await admin()
    .from("social_posts")
    .select("*")
    .eq("platform", "instagram")
    .in("status", ["queued", "publishing"])
    .lte("scheduled_for", now.toISOString())
    .order("scheduled_for", { ascending: true })
    .limit(BATCH);
  if (error) throw error;

  for (const row of (data ?? []) as SocialPostRow[]) {
    try {
      // --- already at the platform: check the transcode -------------------
      if (row.status === "publishing" && row.container_id) {
        const { status, detail } = await containerStatus(row.container_id);

        if (status === "FINISHED") {
          const mediaId = await publishContainer(row.container_id);
          await patch(row.id, {
            status: "posted",
            platform_post_id: mediaId,
            posted_at: new Date().toISOString(),
            error: null,
          });
          out.posted.push(row.clip_id);
        } else if (status === "PUBLISHED") {
          // Published on a previous run that died before writing the row back.
          // Not an error — reconcile and move on.
          await patch(row.id, { status: "posted", posted_at: new Date().toISOString(), error: null });
          out.posted.push(row.clip_id);
        } else if (status === "ERROR" || status === "EXPIRED") {
          const state = await backOff(row, `container ${status}: ${detail ?? "no detail"}`);
          if (state === "failed") out.failed.push({ clip: row.clip_id, error: detail ?? status });
          else out.pending.push(row.clip_id);
        } else {
          out.pending.push(row.clip_id); // IN_PROGRESS — next run
        }
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

      try {
        const containerId = await createReelContainer(row.video_url, fullCaption(row));
        await patch(row.id, { container_id: containerId });
        out.pending.push(row.clip_id); // publishes on a later run, once transcoded
      } catch (e) {
        const msg = (e as Error).message;
        const state = await backOff({ ...row, attempts: row.attempts + 1 }, msg);
        if (state === "failed") out.failed.push({ clip: row.clip_id, error: msg });
        else out.pending.push(row.clip_id);
      }
    } catch (e) {
      // Never let one bad row stop the batch.
      out.errors.push(`${row.clip_id}: ${(e as Error).message}`);
    }
  }

  return out;
}
