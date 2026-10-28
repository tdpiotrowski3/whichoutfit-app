import crypto from "node:crypto";
import { WHICHOUTFIT } from "@/lib/brand";
import { admin } from "./supabase";
import { num, utcDay, type SocialMetricRow } from "./social";

// TikTok organic stats via Login Kit + the Display API (developers.tiktok.com).
// The Business API route (lib/tiktok.ts) needs a TikTok for Business developer
// approval we don't have yet; this one works in the app's sandbox for our own
// account, with no review.
//
//   TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET – the app's (sandbox) credentials
//
// The owner connects once from the dashboard (/api/tiktok/connect). The tokens
// live in social_tokens (service role only): the access token lasts a day and
// is refreshed on use; the refresh token lasts a year.

const AUTH = "https://www.tiktok.com/v2/auth/authorize/";
const API = "https://open.tiktokapis.com/v2";
// video.upload sends clips to the account's TikTok inbox as drafts; public
// Direct Post needs TikTok's app review, which we don't have.
const SCOPES = ["user.info.basic", "user.info.stats", "video.list", "video.upload"];
const REDIRECT = "https://admin.whichoutfit.app/api/tiktok/callback";
const PROVIDER = "tiktok";

type TokenRow = { access_token: string; refresh_token: string; expires_at: string; refresh_expires_at: string; open_id: string | null };
type TokenResponse = { access_token?: string; refresh_token?: string; expires_in?: number; refresh_expires_in?: number; open_id?: string; error?: string; error_description?: string };

export function isTikTokAppConfigured(): boolean {
  return !!process.env.TIKTOK_CLIENT_KEY && !!process.env.TIKTOK_CLIENT_SECRET;
}

export function newState(): string {
  return crypto.randomBytes(16).toString("hex");
}

export function authorizeUrl(state: string): string {
  const q = new URLSearchParams({
    client_key: process.env.TIKTOK_CLIENT_KEY ?? "",
    response_type: "code",
    scope: SCOPES.join(","),
    redirect_uri: REDIRECT,
    state,
  });
  return `${AUTH}?${q}`;
}

async function tokenCall(params: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(`${API}/oauth/token/`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: process.env.TIKTOK_CLIENT_KEY ?? "",
      client_secret: process.env.TIKTOK_CLIENT_SECRET ?? "",
      ...params,
    }),
    cache: "no-store",
  });
  const body = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!body.access_token) throw new Error(body.error_description || body.error || `token exchange failed (HTTP ${res.status})`);
  return body;
}

async function save(t: TokenResponse): Promise<string> {
  const now = Date.now();
  const { error } = await admin().from("social_tokens").upsert({
    provider: PROVIDER,
    access_token: t.access_token,
    refresh_token: t.refresh_token,
    expires_at: new Date(now + (t.expires_in ?? 86400) * 1000).toISOString(),
    refresh_expires_at: new Date(now + (t.refresh_expires_in ?? 31536000) * 1000).toISOString(),
    open_id: t.open_id ?? null,
    updated_at: new Date(now).toISOString(),
  });
  if (error) throw error;
  return t.access_token!;
}

/** Finish the connect: trade the callback's code for tokens and keep them. */
export async function exchangeCode(code: string): Promise<void> {
  await save(await tokenCall({ code, grant_type: "authorization_code", redirect_uri: REDIRECT }));
}

/** A live access token, refreshed when it is within 10 minutes of expiring; null when not connected. */
export async function accessToken(): Promise<string | null> {
  const { data, error } = await admin().from("social_tokens").select("*").eq("provider", PROVIDER).maybeSingle();
  if (error || !data) return null;
  const row = data as TokenRow;
  if (Date.parse(row.expires_at) - Date.now() > 10 * 60_000) return row.access_token;
  if (Date.parse(row.refresh_expires_at) < Date.now()) return null;
  return save(await tokenCall({ grant_type: "refresh_token", refresh_token: row.refresh_token }));
}

async function call<T>(token: string, path: string, init?: { body?: unknown }): Promise<T> {
  const res = await fetch(`${API}/${path}`, {
    method: init?.body ? "POST" : "GET",
    headers: { authorization: `Bearer ${token}`, ...(init?.body ? { "content-type": "application/json" } : {}) },
    body: init?.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  const body = (await res.json().catch(() => ({}))) as { data?: T; error?: { code?: string; message?: string } };
  if (body.error && body.error.code !== "ok") throw new Error(`${body.error.message || body.error.code} (${body.error.code})`);
  if (!body.data) throw new Error(`no data (HTTP ${res.status})`);
  return body.data;
}

export type TikTokProfile = { display_name?: string; follower_count?: number; likes_count?: number; video_count?: number };
export type TikTokVideo = { id: string; title?: string; create_time?: number; view_count?: number; like_count?: number; comment_count?: number; share_count?: number; share_url?: string };

export async function fetchProfile(token: string): Promise<TikTokProfile> {
  const d = await call<{ user: TikTokProfile }>(token, "user/info/?fields=open_id,display_name,follower_count,likes_count,video_count");
  return d.user;
}

/** The account's most recent videos (up to `max`), newest first. */
export async function fetchVideos(token: string, max = 60): Promise<TikTokVideo[]> {
  const out: TikTokVideo[] = [];
  let cursor: number | undefined;
  while (out.length < max) {
    const d = await call<{ videos?: TikTokVideo[]; cursor?: number; has_more?: boolean }>(
      token,
      "video/list/?fields=id,title,create_time,view_count,like_count,comment_count,share_count,share_url",
      { body: { max_count: 20, ...(cursor ? { cursor } : {}) } },
    );
    out.push(...(d.videos ?? []));
    if (!d.has_more || !d.cursor) break;
    cursor = d.cursor;
  }
  return out;
}

/**
 * Daily TikTok snapshot for the social sync: today's follower count as a
 * social_metrics row (the Display API only has current totals, so history
 * builds up one day at a time). [] when not connected or on any error.
 */
export async function fetchTikTokDisplayDaily(): Promise<SocialMetricRow[]> {
  if (!isTikTokAppConfigured()) return [];
  try {
    const token = await accessToken();
    if (!token) return [];
    const p = await fetchProfile(token);
    return [{ day: utcDay(0), platform: "tiktok", followers: num(p.follower_count) }];
  } catch {
    return [];
  }
}

export type TikTokPostResult = { matched: number; updated: number; errors: string[] };

/**
 * TikTok posts go up by hand, so their social_posts rows never learn their
 * video. Match each to the one video posted between just before its slot and
 * the next slot (at most three days later) — only when exactly one fits, so a
 * guess never mislabels a clip — mark it posted, and refresh the numbers on
 * every matched row.
 */
export async function syncTikTokPosts(): Promise<TikTokPostResult> {
  const out: TikTokPostResult = { matched: 0, updated: 0, errors: [] };
  if (!isTikTokAppConfigured()) return out;
  const token = await accessToken();
  if (!token) return out;
  const videos = await fetchVideos(token);
  const db = admin();
  const { data, error } = await db
    .from("social_posts")
    .select("id,clip_id,status,scheduled_for,platform_post_id")
    .eq("brand", WHICHOUTFIT)
    .eq("platform", "tiktok")
    .in("status", ["manual", "posted"])
    .gte("scheduled_for", new Date(Date.now() - 90 * 86400_000).toISOString());
  if (error) throw error;
  const rows = ((data ?? []) as { id: string; clip_id: string; status: string; scheduled_for: string; platform_post_id: string | null }[])
    .sort((a, b) => Date.parse(a.scheduled_for) - Date.parse(b.scheduled_for));

  const stats = (v: TikTokVideo) => ({
    views: num(v.view_count),
    likes: num(v.like_count),
    comments: num(v.comment_count),
    shares: num(v.share_count),
    stats_updated_at: new Date().toISOString(),
  });
  const byId = new Map(videos.map((v) => [v.id, v]));
  const taken = new Set(rows.map((r) => r.platform_post_id).filter(Boolean));

  for (const r of rows) {
    try {
      let v = r.platform_post_id ? byId.get(r.platform_post_id) : undefined;
      let extra: Record<string, unknown> = {};
      if (!r.platform_post_id) {
        // A video posted from a few hours before the slot until the next
        // post's slot (or three days, whichever is first) belongs to this row,
        // as long as it is the only unclaimed video in that window.
        const start = Date.parse(r.scheduled_for) - 6 * 3600_000;
        const next = rows
          .map((x) => Date.parse(x.scheduled_for))
          .filter((t) => t > Date.parse(r.scheduled_for))
          .sort((a, b) => a - b)[0];
        const end = Math.min(next ?? Infinity, Date.parse(r.scheduled_for) + 3 * 86400_000);
        const inWindow = videos.filter((x) => !taken.has(x.id) && x.create_time && x.create_time * 1000 >= start && x.create_time * 1000 < end);
        if (inWindow.length !== 1) continue;
        v = inWindow[0];
        taken.add(v.id);
        extra = { platform_post_id: v.id, status: "posted", posted_at: new Date(v.create_time! * 1000).toISOString(), error: null };
        out.matched++;
      }
      if (!v) continue;
      const { error: upErr } = await db.from("social_posts").update({ ...stats(v), ...extra }).eq("id", r.id);
      if (upErr) throw upErr;
      out.updated++;
    } catch (e) {
      out.errors.push(`${r.clip_id}: ${(e as Error).message}`);
    }
  }
  return out;
}

/**
 * Send a clip to the connected account's TikTok inbox as a draft (Content
 * Posting API, "Upload to TikTok"). The owner gets a notification in the app,
 * adds the caption and taps Post. Uploads the file itself (push_by_file), since
 * pull_by_url needs a verified domain and the clips live on Supabase Storage.
 * Returns TikTok's publish_id.
 */
export async function sendToInbox(videoUrl: string): Promise<string> {
  const token = await accessToken();
  if (!token) throw new Error("TikTok isn't connected");
  const res = await fetch(videoUrl, { cache: "no-store" });
  if (!res.ok) throw new Error(`couldn't fetch the clip (HTTP ${res.status})`);
  const bytes = Buffer.from(await res.arrayBuffer());
  const size = bytes.length;
  // One chunk is allowed up to 64 MB; our clips are a few MB.
  if (size > 64 * 1024 * 1024) throw new Error("clip is over 64 MB");
  const init = await call<{ publish_id: string; upload_url: string }>(token, "post/publish/inbox/video/init/", {
    body: { source_info: { source: "FILE_UPLOAD", video_size: size, chunk_size: size, total_chunk_count: 1 } },
  });
  const put = await fetch(init.upload_url, {
    method: "PUT",
    headers: { "content-type": "video/mp4", "content-length": String(size), "content-range": `bytes 0-${size - 1}/${size}` },
    body: bytes,
  });
  if (!put.ok) throw new Error(`TikTok upload failed (HTTP ${put.status})`);
  return init.publish_id;
}
