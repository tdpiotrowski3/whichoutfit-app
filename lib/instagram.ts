// Instagram Reels publishing via the Meta Graph API. Read-side metrics live in
// lib/meta.ts; this is the write side, and it shares that file's env-var token
// model so the whole thing is INERT until the vars are set.
//
//   META_ACCESS_TOKEN   – long-lived / system-user token (same one meta.ts uses)
//   IG_USER_ID          – the IG Business account id
//
// WHY THIS NEEDS NO APP REVIEW. Meta's Standard Access is the default level and
// covers accounts that hold a role on the app. Publishing to an account you own
// or manage therefore needs no App Review and no Business Verification — those
// are for serving accounts you DON'T own. Requirements that do bite: the target
// must be a Business (not personal) account linked to a Facebook Page, and the
// token's holder must have a role on the app.
//
// PUBLISHING IS TWO CALLS WITH A WAIT IN THE MIDDLE:
//   1. POST /{ig-user-id}/media          → a container id, status IN_PROGRESS
//   2. (Meta downloads and transcodes the video — tens of seconds)
//   3. POST /{ig-user-id}/media_publish  → the live media id
//
// That middle wait is why nothing here loops. A serverless function has a 60s
// budget and a Reel can take longer, so the caller (lib/socialPublish.ts) does
// ONE transition per run and comes back. Each function below is a single step.

const VERSION = "v21.0";
const BASE = `https://graph.facebook.com/${VERSION}`;

type Env = { token: string; igUserId: string };

function env(): Env | null {
  const token = process.env.META_ACCESS_TOKEN;
  const igUserId = process.env.IG_USER_ID;
  if (!token || !igUserId) return null;
  return { token, igUserId };
}

export function isInstagramPublishConfigured(): boolean {
  return env() !== null;
}

/** Container transcode states, straight from the Graph API's status_code. */
export type ContainerStatus = "IN_PROGRESS" | "FINISHED" | "ERROR" | "EXPIRED" | "PUBLISHED";

export class InstagramError extends Error {}

/**
 * POST helper. Meta reports failures in a 200-shaped envelope as often as by
 * status code, so both are checked and the message is surfaced verbatim — a
 * swallowed Graph error here is hours of guessing later.
 */
async function post(path: string, body: Record<string, string>): Promise<Record<string, unknown>> {
  const e = env();
  if (!e) throw new InstagramError("Instagram publishing is not configured (META_ACCESS_TOKEN / IG_USER_ID).");

  const res = await fetch(`${BASE}/${path}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ ...body, access_token: e.token }),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    error?: { message?: string; code?: number; error_subcode?: number };
  } & Record<string, unknown>;

  if (!res.ok || json.error) {
    const m = json.error?.message ?? `HTTP ${res.status}`;
    const code = json.error?.code != null ? ` (code ${json.error.code})` : "";
    throw new InstagramError(`${m}${code}`);
  }
  return json;
}

/**
 * Step 1 — create a REELS container. Returns the container id.
 *
 * `videoUrl` must be PUBLICLY fetchable: Meta's servers download it themselves,
 * so a signed or private URL fails here with an unhelpful generic error. The
 * caption is sent whole — hashtags belong inside it, Instagram has no separate
 * field for them.
 */
export async function createReelContainer(videoUrl: string, caption: string): Promise<string> {
  const e = env()!;
  const json = await post(`${e.igUserId}/media`, {
    media_type: "REELS",
    video_url: videoUrl,
    caption,
  });
  const id = json.id;
  if (typeof id !== "string" || !id) throw new InstagramError("Container created but no id came back.");
  return id;
}

/** Step 2 — where the transcode has got to. `ERROR`/`EXPIRED` carry a reason. */
export async function containerStatus(containerId: string): Promise<{ status: ContainerStatus; detail?: string }> {
  const e = env();
  if (!e) throw new InstagramError("Instagram publishing is not configured.");

  const params = new URLSearchParams({ fields: "status_code,status", access_token: e.token });
  const res = await fetch(`${BASE}/${containerId}?${params}`, { cache: "no-store" });
  const json = (await res.json().catch(() => ({}))) as {
    status_code?: string;
    status?: string;
    error?: { message?: string };
  };
  if (!res.ok || json.error) throw new InstagramError(json.error?.message ?? `HTTP ${res.status}`);

  // status_code is the machine-readable one; `status` is prose that explains an
  // ERROR, which status_code alone never does.
  return { status: (json.status_code as ContainerStatus) ?? "IN_PROGRESS", detail: json.status };
}

/**
 * Step 3 — publish a FINISHED container. Returns the live media id.
 *
 * Also the double-post guard: Instagram refuses to publish a container it has
 * already published, so if the process dies between this call and the database
 * write, the retry fails loudly instead of posting the Reel twice.
 */
export async function publishContainer(containerId: string): Promise<string> {
  const e = env()!;
  const json = await post(`${e.igUserId}/media_publish`, { creation_id: containerId });
  const id = json.id;
  if (typeof id !== "string" || !id) throw new InstagramError("Publish returned no media id.");
  return id;
}

/**
 * How many more posts Instagram will accept in the rolling 24h window.
 * Returns null when the field can't be read — the caller treats that as
 * "unknown, proceed", because failing a post on a missing quota reading would
 * be worse than hitting the real limit and getting a clear error.
 */
export async function remainingQuota(): Promise<number | null> {
  const e = env();
  if (!e) return null;
  try {
    const params = new URLSearchParams({ fields: "quota_usage,config", access_token: e.token });
    const res = await fetch(`${BASE}/${e.igUserId}/content_publishing_limit?${params}`, { cache: "no-store" });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: { quota_usage?: number; config?: { quota_total?: number } }[] };
    const row = json.data?.[0];
    if (!row) return null;
    const total = row.config?.quota_total ?? 50; // documented default
    const used = row.quota_usage ?? 0;
    return Math.max(0, total - used);
  } catch {
    return null;
  }
}

// --- Read side for our own posts: per-Reel results ----------------------------

export type ReelStats = {
  views: number | null;
  reach: number | null;
  likes: number | null;
  comments: number | null;
  saves: number | null;
  shares: number | null;
};

const REEL_INSIGHTS = ["views", "reach", "saved", "shares"] as const;

/**
 * Results for one published Reel. Likes and comments come off the media object;
 * the rest are insights (needs instagram_manage_insights). Each insight is asked
 * for on its own, because Meta rejects the whole request when any one metric is
 * unavailable for that media or API version. A metric that fails comes back
 * null rather than failing the post. Throws only when the token itself is bad.
 */
export async function fetchReelStats(mediaId: string): Promise<ReelStats> {
  const e = env();
  if (!e) throw new InstagramError("Instagram is not configured.");

  const get = async (url: string) => {
    const res = await fetch(url, { cache: "no-store" });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown> & {
      error?: { message?: string; code?: number };
    };
    if (json.error?.code === 190) throw new InstagramError(json.error.message ?? "Access token rejected.");
    return res.ok && !json.error ? json : null;
  };

  const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

  const base = await get(
    `${BASE}/${mediaId}?${new URLSearchParams({ fields: "like_count,comments_count", access_token: e.token })}`
  );

  const insight: Record<string, number | null> = {};
  for (const metric of REEL_INSIGHTS) {
    const json = await get(
      `${BASE}/${mediaId}/insights?${new URLSearchParams({ metric, access_token: e.token })}`
    );
    const data = (json?.data as { name?: string; values?: { value?: unknown }[] }[] | undefined) ?? [];
    insight[metric] = num(data[0]?.values?.[0]?.value);
  }

  return {
    views: insight.views,
    reach: insight.reach,
    likes: num(base?.like_count),
    comments: num(base?.comments_count),
    saves: insight.saved,
    shares: insight.shares,
  };
}
