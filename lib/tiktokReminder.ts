import { admin } from "@/lib/supabase";
import { WHICHOUTFIT } from "@/lib/brand";
import { sendAdminAlert, isAlertConfigured } from "@/lib/alert";
import { isTikTokAppConfigured, sendToInbox } from "@/lib/tiktokDisplay";
import { captionWithTags } from "@/lib/contentEngine/hashtags";

// TikTok can't be auto-posted yet (an unaudited app's Direct Post is forced to
// PRIVATE), so TikTok rows sit at status 'manual'. On the morning one is due,
// this drops the clip into the TikTok inbox as a draft (when TikTok is
// connected) and emails the owner the caption to paste, stamping reminded_at so
// it never sends twice. Runs from
// the daily social-sync cron, which fires mid-morning US Eastern.

const TZ = "America/New_York";

type ManualRow = {
  id: string;
  clip_id: string;
  caption: string;
  hashtags: string | null;
  video_url: string | null;
  scheduled_for: string;
};

/** YYYY-MM-DD for an instant, in US Eastern. */
function easternDay(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export type ReminderResult = { due: number; sent: boolean; reason?: string };

export async function sendTikTokReminder(now = new Date()): Promise<ReminderResult> {
  if (!isAlertConfigured()) return { due: 0, sent: false, reason: "alert email not configured" };

  // Anything due in the next ~36h that hasn't been reminded, then keep today's.
  const { data, error } = await admin()
    .from("social_posts")
    .select("id,clip_id,caption,hashtags,video_url,scheduled_for")
    .eq("brand", WHICHOUTFIT)
    .eq("platform", "tiktok")
    .eq("status", "manual")
    .is("reminded_at", null)
    .gte("scheduled_for", new Date(now.getTime() - 12 * 3_600_000).toISOString())
    .lte("scheduled_for", new Date(now.getTime() + 36 * 3_600_000).toISOString())
    .order("scheduled_for", { ascending: true });
  if (error) throw error;

  const today = easternDay(now);
  const due = ((data ?? []) as ManualRow[]).filter((r) => easternDay(new Date(r.scheduled_for)) === today);
  if (due.length === 0) return { due: 0, sent: false, reason: "nothing due today" };

  // Drafts first, so the email can say where the clip already is.
  const inInbox = new Set<string>();
  if (isTikTokAppConfigured()) {
    for (const r of due) {
      if (!r.video_url) continue;
      try {
        const publishId = await sendToInbox(r.video_url);
        await admin().from("social_posts").update({ container_id: publishId }).eq("id", r.id);
        inInbox.add(r.id);
      } catch (e) {
        console.error(`tiktok inbox ${r.clip_id}:`, (e as Error).message);
      }
    }
  }

  const time = (iso: string) =>
    new Date(iso).toLocaleTimeString("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" });

  const blocks = due
    .map((r) => {
      const text = captionWithTags(r.caption, r.hashtags);
      const link = inInbox.has(r.id)
        ? `<strong>It's in your TikTok inbox</strong> — open TikTok, tap the notification, paste the caption below, post. (<a href="${esc(r.video_url!)}">Clip</a> if you need it.)`
        : r.video_url
        ? `<a href="${esc(r.video_url)}">Download the clip</a>`
        : `<em>No clip uploaded yet for ${esc(r.clip_id)}.</em>`;
      return `<p><strong>${esc(r.clip_id)}</strong> at ${time(r.scheduled_for)} ET<br>${link}</p>
<p style="white-space:pre-wrap;background:#f3f5f8;padding:12px;border-radius:8px">${esc(text)}</p>`;
    })
    .join("<hr>");

  const subject =
    due.length === 1 ? `Post to TikTok today: ${due[0].clip_id}` : `Post ${due.length} clips to TikTok today`;
  const body = `<p>Today's TikTok post${due.length === 1 ? "" : "s"}. Instagram is posting on its own; these need you.</p>
${blocks}
<p style="color:#6b7280;font-size:13px">${inInbox.size === due.length ? "Post around the time shown so it lands with the Instagram one." : "Download the clip on your phone, open TikTok, upload it, and paste the caption."}</p>`;

  const res = await sendAdminAlert(subject, body);
  if (res.sent) {
    const { error: upErr } = await admin()
      .from("social_posts")
      .update({ reminded_at: new Date().toISOString() })
      .in("id", due.map((r) => r.id));
    if (upErr) throw upErr;
  }
  return { due: due.length, sent: res.sent, reason: res.reason };
}
