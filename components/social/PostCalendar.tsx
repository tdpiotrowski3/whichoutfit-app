"use client";

import { useMemo, useState } from "react";

// Month view of everything posted and scheduled. One chip per video per day,
// with a dot per platform; click a chip to watch the video and see how it did.
// Days run in Chicago time, the zone the posting slots are defined in.

export type CalendarPost = {
  id: string;
  clip_id: string;
  title: string;
  platform: "instagram" | "tiktok";
  status: "queued" | "publishing" | "posted" | "failed" | "manual";
  scheduled_for: string;
  posted_at: string | null;
  caption: string;
  hashtags?: string | null;
  video_url: string | null;
  views: number | null;
  likes: number | null;
  saves: number | null;
  shares: number | null;
  error: string | null;
};

const PLATFORM = {
  instagram: { label: "Instagram", color: "#2E6BFF" },
  tiktok: { label: "TikTok", color: "#eb6834" },
} as const;

const STATUS = {
  queued: { label: "Scheduled", glyph: "◷" },
  publishing: { label: "Posting…", glyph: "◷" },
  posted: { label: "Posted", glyph: "✓" },
  failed: { label: "Failed", glyph: "!" },
  manual: { label: "Post by hand", glyph: "✋" },
} as const;

const TZ = "America/Chicago";
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SLOT_DAYS = new Set([2, 4, 6]);

/** "YYYY-MM-DD" for an instant, in Chicago. */
function dayKey(iso: string | Date): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ });
}

type Group = { key: string; clip_id: string; title: string; posts: CalendarPost[] };

export function PostCalendar({ posts, today }: { posts: CalendarPost[]; today: string }) {
  const [month, setMonth] = useState(() => today.slice(0, 7)); // "YYYY-MM"
  const [open, setOpen] = useState<Group | null>(null);

  const byDay = useMemo(() => {
    const m = new Map<string, Group[]>();
    for (const p of posts) {
      const k = dayKey(p.posted_at ?? p.scheduled_for);
      const groups = m.get(k) ?? [];
      let g = groups.find((x) => x.clip_id === p.clip_id);
      if (!g) {
        g = { key: `${k}-${p.clip_id}`, clip_id: p.clip_id, title: p.title, posts: [] };
        groups.push(g);
      }
      g.posts.push(p);
      m.set(k, groups);
    }
    return m;
  }, [posts]);

  const [yy, mm] = month.split("-").map(Number);
  const first = new Date(Date.UTC(yy, mm - 1, 1));
  const daysIn = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
  const lead = first.getUTCDay();
  const cells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysIn }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`),
  ];
  while (cells.length % 7) cells.push(null);

  const shift = (n: number) => {
    const d = new Date(Date.UTC(yy, mm - 1 + n, 1));
    setMonth(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
    setOpen(null);
  };
  const monthName = first.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  const inMonth = posts.filter((p) => dayKey(p.posted_at ?? p.scheduled_for).startsWith(month));
  const posted = inMonth.filter((p) => p.status === "posted").length;
  const upcoming = inMonth.filter((p) => p.status === "queued" || p.status === "manual" || p.status === "publishing").length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button onClick={() => shift(-1)} className="rounded-lg border border-[var(--wo-border)] px-2.5 py-1 text-sm hover:bg-[var(--wo-bg)]" aria-label="Previous month">‹</button>
          <span className="min-w-36 text-center text-sm font-semibold">{monthName}</span>
          <button onClick={() => shift(1)} className="rounded-lg border border-[var(--wo-border)] px-2.5 py-1 text-sm hover:bg-[var(--wo-bg)]" aria-label="Next month">›</button>
          {month !== today.slice(0, 7) ? (
            <button onClick={() => { setMonth(today.slice(0, 7)); setOpen(null); }} className="text-xs text-[var(--wo-blue)] hover:underline">Today</button>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-4 text-xs text-[var(--wo-muted)]">
          <span>{posted} posted · {upcoming} upcoming</span>
          {Object.values(PLATFORM).map((p) => (
            <span key={p.label} className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.color }} />{p.label}
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-7 overflow-hidden rounded-xl border border-[var(--wo-border)] text-xs">
        {WEEKDAYS.map((d) => (
          <div key={d} className="border-b border-[var(--wo-border)] bg-[var(--wo-bg)] px-2 py-1.5 font-medium text-[var(--wo-muted)]">{d}</div>
        ))}
        {cells.map((d, i) => {
          const groups = d ? byDay.get(d) ?? [] : [];
          const isToday = d === today;
          const future = !!d && d > today;
          const slot = !!d && SLOT_DAYS.has(new Date(d + "T12:00:00Z").getUTCDay());
          return (
            <div
              key={i}
              className={`min-h-24 border-b border-r border-[var(--wo-border)] p-1.5 ${i % 7 === 6 ? "border-r-0" : ""} ${d ? "bg-white" : "bg-[var(--wo-bg)]"}`}
            >
              {d ? (
                <div className="mb-1 flex items-center justify-between">
                  <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full ${isToday ? "bg-[var(--wo-blue)] font-semibold text-white" : "text-[var(--wo-muted)]"}`}>
                    {Number(d.slice(8))}
                  </span>
                  {slot && future && groups.length === 0 ? <span className="text-[10px] text-[var(--wo-muted)]">5pm open</span> : null}
                </div>
              ) : null}
              <div className="space-y-1">
                {groups.map((g) => {
                  const worst = g.posts.find((p) => p.status === "failed") ?? g.posts.find((p) => p.status !== "posted") ?? g.posts[0];
                  return (
                    <button
                      key={g.key}
                      onClick={() => setOpen(open?.key === g.key ? null : g)}
                      className={`flex w-full items-center gap-1 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-[var(--wo-bg)] ${open?.key === g.key ? "bg-[var(--wo-bg)] ring-1 ring-[var(--wo-blue)]" : "bg-[var(--wo-bg)]/60"}`}
                      title={`${g.title} — ${g.posts.map((p) => `${PLATFORM[p.platform].label}: ${STATUS[p.status].label}`).join(", ")}`}
                    >
                      <span className="flex shrink-0 gap-0.5">
                        {g.posts.map((p) => <span key={p.id} className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: PLATFORM[p.platform].color }} />)}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{g.title}</span>
                      <span className={`shrink-0 ${worst.status === "failed" ? "text-[var(--wo-red,#e5484d)]" : worst.status === "posted" ? "text-[var(--wo-green)]" : "text-[var(--wo-muted)]"}`}>
                        {STATUS[worst.status].glyph}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {open ? <Detail group={open} onClose={() => setOpen(null)} /> : (
        <p className="text-xs text-[var(--wo-muted)]">Click a video to watch it and see how it did. Tue / Thu / Sat at 5pm are the posting slots.</p>
      )}
    </div>
  );
}

function Detail({ group, onClose }: { group: Group; onClose: () => void }) {
  const url = group.posts.find((p) => p.video_url)?.video_url ?? null;
  const first = group.posts[0];
  const caption = first ? (first.hashtags?.trim() ? `${first.caption.trim()}\n\n${first.hashtags.trim()}` : first.caption) : "";
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-[var(--wo-border)] p-4 sm:flex-row">
      {url ? (
        <video key={url} src={url} controls playsInline preload="metadata" className="aspect-[9/16] w-full shrink-0 rounded-lg bg-black object-contain sm:w-48" />
      ) : null}
      <div className="min-w-0 flex-1 space-y-3 text-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-semibold">{group.title}</div>
            <div className="font-mono text-xs text-[var(--wo-muted)]">{group.clip_id}</div>
          </div>
          <button onClick={onClose} className="text-xs text-[var(--wo-muted)] hover:text-[var(--wo-text)]">Close</button>
        </div>
        <p className="whitespace-pre-wrap text-[var(--wo-muted)]">{caption}</p>
        <div className="space-y-2">
          {group.posts.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[var(--wo-bg)] px-3 py-2">
              <span className="inline-flex items-center gap-2 font-medium">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: PLATFORM[p.platform].color }} />
                {PLATFORM[p.platform].label}
              </span>
              <span className="text-xs text-[var(--wo-muted)]">
                {STATUS[p.status].label} ·{" "}
                {new Date(p.posted_at ?? p.scheduled_for).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: TZ })}
              </span>
              {p.status === "posted" ? (
                <span className="w-full text-xs">
                  {[["views", p.views], ["likes", p.likes], ["saves", p.saves], ["shares", p.shares]]
                    .map(([k, v]) => `${v == null ? "—" : Number(v).toLocaleString()} ${k}`).join(" · ")}
                </span>
              ) : null}
              {p.status === "failed" && p.error ? <span className="w-full text-xs text-[var(--wo-red,#e5484d)]">{p.error}</span> : null}
              {p.status === "manual" && p.video_url ? (
                <span className="flex w-full flex-wrap items-center gap-3 text-xs">
                  <SendToTikTok id={p.id} />
                  <CopyCaption text={p.hashtags?.trim() ? `${p.caption.trim()}\n\n${p.hashtags.trim()}` : p.caption.trim()} />
                  <a href={p.video_url} download className="text-[var(--wo-blue)] hover:underline">Download the clip</a>
                </span>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Drops the clip into the TikTok app's inbox as a draft; the owner adds the caption and posts. */
function SendToTikTok({ id }: { id: string }) {
  const [state, setState] = useState<"idle" | "busy" | "sent" | string>("idle");
  async function send() {
    setState("busy");
    const res = await fetch("/api/social/tiktok-inbox", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) });
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    setState(res.ok ? "sent" : j.error || "Couldn't send");
  }
  if (state === "sent") return <span className="text-[var(--wo-green)]">✓ In your TikTok inbox — open TikTok to post</span>;
  return (
    <>
      <button onClick={send} disabled={state === "busy"} className="rounded-md bg-[var(--wo-text)] px-2.5 py-1 font-medium text-white disabled:opacity-50">
        {state === "busy" ? "Sending…" : "Send to TikTok"}
      </button>
      {state !== "idle" && state !== "busy" ? <span className="text-[var(--wo-red,#e5484d)]">{state}</span> : null}
    </>
  );
}

/** TikTok drafts can't carry a caption, so make pasting it one tap (works on the phone too). */
function CopyCaption({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }
  return (
    <button onClick={copy} className="rounded-md border border-[var(--wo-border)] px-2.5 py-1 font-medium hover:bg-[var(--wo-bg)]">
      {copied ? "✓ Copied" : "Copy caption"}
    </button>
  );
}
