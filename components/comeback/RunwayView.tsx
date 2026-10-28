import { Card } from "@/components/ui";
import { DraftRunwayButton, LaunchDateForm, PieceActions } from "@/components/comeback/RunwayClient";
import {
  RUNWAY, PHASES, FORMATS, dayLabel, dateFor, beatBudget, ctaFor, templateKey, DISCLAIMER,
  type Slot,
} from "@/lib/comeback/runway";
import type { PieceRow } from "@/lib/comeback/runwayStore";

// Comeback's launch runway, top to bottom: every slot of the plan in order,
// each either still a brief (not drafted yet) or its drafted piece with the
// owner's controls. Dates appear once a launch date is set; until then the
// plan reads in T-minus days and nothing is booked anywhere.

const STATUS: Record<PieceRow["status"], { label: string; tone: string }> = {
  proposed: { label: "To review", tone: "bg-[var(--wo-blue)]/10 text-[var(--wo-blue)]" },
  approved: { label: "Approved", tone: "bg-[var(--wo-green)]/10 text-[var(--wo-green)]" },
  rendering: { label: "Being made", tone: "bg-[var(--wo-blue)]/10 text-[var(--wo-blue)]" },
  rendered: { label: "Made", tone: "bg-[var(--wo-green)]/10 text-[var(--wo-green)]" },
  failed: { label: "Failed", tone: "bg-red-50 text-red-600" },
  rejected: { label: "Rejected", tone: "bg-[var(--wo-bg)] text-[var(--wo-muted)]" },
};

const dateText = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

function Chip({ children, tone = "bg-[var(--wo-bg)] text-[var(--wo-muted)]" }: { children: React.ReactNode; tone?: string }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${tone}`}>{children}</span>;
}

function Content({ slot, piece }: { slot: Slot; piece: PieceRow }) {
  if (slot.format === "email") {
    const [subject, preview, body] = piece.voiceover;
    return (
      <div className="space-y-1 text-sm">
        <div><span className="text-[var(--wo-muted)]">Subject:</span> <span className="font-medium">{subject}</span></div>
        <div className="text-[var(--wo-muted)]">{preview}</div>
        <div className="mt-2 whitespace-pre-line rounded-lg bg-[var(--wo-bg)] p-3">{body}</div>
      </div>
    );
  }
  const unit = slot.format === "reel" ? "Beat" : slot.format === "story" ? "Frame" : "Slide";
  return (
    <ol className="space-y-1.5 text-sm">
      {piece.voiceover.map((line, i) => (
        <li key={i} className="flex gap-3">
          <span className="w-14 shrink-0 text-xs leading-5 text-[var(--wo-muted)]">
            {unit} {i + 1}
            {slot.format === "reel" && slot.beats ? <span className="block">{slot.beats[i]}s · ≤{beatBudget(slot.beats[i])}</span> : null}
          </span>
          <span className="min-w-0">
            {line}
            {slot.screens?.[i] ? <span className="block text-xs text-[var(--wo-muted)]">On screen: {slot.screens[i]}</span> : null}
          </span>
        </li>
      ))}
      {slot.format === "reel" ? (
        <li className="flex gap-3 text-[var(--wo-muted)]">
          <span className="w-14 shrink-0 text-xs leading-5">End card</span>
          <span className="min-w-0 italic">{ctaFor(slot.phase)}</span>
        </li>
      ) : null}
    </ol>
  );
}

function SlotRow({ slot, piece, launch }: { slot: Slot; piece?: PieceRow; launch: string | null }) {
  const when = launch ? dateText(dateFor(launch, slot.day)) : null;
  return (
    <li className="rounded-xl border border-[var(--wo-border)] bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold tabular-nums">{dayLabel(slot.day)}</span>
        {when ? <span className="text-sm text-[var(--wo-muted)]">{when}</span> : null}
        <Chip>{FORMATS[slot.format]}</Chip>
        {slot.source === "you" ? <Chip tone="bg-amber-50 text-amber-700">You film this</Chip> : null}
        {slot.source === "app" ? <Chip>App footage</Chip> : null}
        {piece ? <Chip tone={STATUS[piece.status].tone}>{STATUS[piece.status].label}</Chip> : <Chip>Not drafted</Chip>}
      </div>
      {piece ? (
        <div className="mt-3 space-y-3">
          <div className="font-medium">{piece.title}</div>
          <Content slot={slot} piece={piece} />
          {piece.captions.length ? (
            <div className="space-y-1 text-sm">
              <div className="text-xs font-medium uppercase tracking-wide text-[var(--wo-muted)]">Caption</div>
              <div>{piece.captions[piece.caption_pick] ?? piece.captions[0]}</div>
              <div className="text-xs text-[var(--wo-muted)]">{DISCLAIMER}</div>
              {piece.hashtags ? <div className="text-xs text-[var(--wo-blue)]">{piece.hashtags}</div> : null}
            </div>
          ) : null}
          {piece.error ? <div className="text-sm text-red-600">{piece.error}</div> : null}
          <PieceActions piece={piece} />
        </div>
      ) : (
        <p className="mt-2 text-sm text-[var(--wo-muted)]">{slot.brief}</p>
      )}
    </li>
  );
}

export function RunwayView({ pieces, launch, now }: { pieces: PieceRow[]; launch: string | null; now: Date }) {
  const bySlot = new Map<string, PieceRow>();
  // Newest first from the query, so the first seen per slot is the live one.
  for (const p of pieces) if (!bySlot.has(p.template)) bySlot.set(p.template, p);
  const live = RUNWAY.map((s) => bySlot.get(templateKey(s)));
  const counts = {
    total: RUNWAY.length,
    drafted: live.filter(Boolean).length,
    approved: live.filter((p) => p && ["approved", "rendering", "rendered"].includes(p.status)).length,
    yours: RUNWAY.filter((s) => s.source === "you").length,
  };
  const daysOut = launch ? Math.round((new Date(`${launch}T12:00:00Z`).getTime() - now.getTime()) / 86_400_000) : null;
  const firstDay = Math.min(...RUNWAY.map((s) => s.day));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Comeback launch runway</h1>
        <p className="mt-1 text-sm text-[var(--wo-muted)]">
          {RUNWAY.length} pieces from {dayLabel(firstDay)} to {dayLabel(Math.max(...RUNWAY.map((s) => s.day)))}. Drafted here, approved by you; reels are made on the Mac.
          Nothing posts until Comeback&apos;s Instagram and TikTok are connected.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Launch", value: launch ? dateText(launch) : "TBD", sub: daysOut !== null ? (daysOut > 0 ? `in ${daysOut} days` : daysOut === 0 ? "today" : `${-daysOut} days ago`) : "plan runs in T-minus days" },
          { label: "Drafted", value: `${counts.drafted}/${counts.total}`, sub: "pieces written" },
          { label: "Approved", value: `${counts.approved}/${counts.total}`, sub: "ready to make" },
          { label: "You film", value: String(counts.yours), sub: "founder reels" },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-[var(--wo-border)] bg-white p-4 shadow-sm">
            <div className="text-xs font-medium uppercase tracking-wide text-[var(--wo-muted)]">{s.label}</div>
            <div className="mt-1 text-2xl font-semibold">{s.value}</div>
            <div className="text-xs text-[var(--wo-muted)]">{s.sub}</div>
          </div>
        ))}
      </div>

      <Card title="Plan" right={<DraftRunwayButton empty={counts.total - counts.drafted} />}>
        <LaunchDateForm launch={launch} startsOn={launch ? dateFor(launch, firstDay) : null} />
      </Card>

      {PHASES.map((phase) => (
        <section key={phase.key} className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold">{phase.label}</h2>
            <p className="text-sm text-[var(--wo-muted)]">{phase.goal}</p>
          </div>
          <ul className="space-y-3">
            {RUNWAY.filter((s) => s.phase === phase.key).map((slot) => (
              <SlotRow key={slot.key} slot={slot} piece={bySlot.get(templateKey(slot))} launch={launch} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
