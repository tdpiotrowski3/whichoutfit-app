// When posts go out. The calendar so far runs Tue/Thu/Sat at 5pm Central, and
// every slot the engine adds follows the same rhythm, so a new clip or a
// re-post lands where the audience already expects one. Pure functions, no I/O,
// so the date maths is unit-tested (lib/__tests__/contentSchedule.test.ts).

export const SLOT_DAYS = [2, 4, 6]; // Tue, Thu, Sat (getUTCDay numbering)
export const SLOT_HOUR_LOCAL = 17;
export const SLOT_TZ = "America/Chicago";

/** How far ahead the queue should always reach before the engine tops it up. */
export const RUNWAY_DAYS = 14;

/** Offset of `tz` from UTC at `at`, in minutes (Chicago: -300 in summer, -360 in winter). */
function tzOffsetMinutes(at: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUTC = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return Math.round((asUTC - at.getTime()) / 60_000);
}

/** The UTC instant of 5pm local on the calendar day `y-m-d` (DST-correct). */
function slotInstant(y: number, m: number, d: number): Date {
  const guess = new Date(Date.UTC(y, m, d, SLOT_HOUR_LOCAL, 0));
  const off = tzOffsetMinutes(guess, SLOT_TZ);
  return new Date(guess.getTime() - off * 60_000);
}

/**
 * The next `n` free slots strictly after `after`, skipping any instant already
 * in `taken` (compared to the minute). `after` is usually the later of now and
 * the last thing already scheduled.
 */
export function nextSlots(after: Date, n: number, taken: Date[] = []): Date[] {
  const takenMin = new Set(taken.map((t) => Math.floor(t.getTime() / 60_000)));
  const out: Date[] = [];
  // Walk calendar days in the slot timezone, starting the day `after` falls on.
  const start = new Date(after.getTime() + tzOffsetMinutes(after, SLOT_TZ) * 60_000);
  for (let i = 0; out.length < n && i < 400; i++) {
    const day = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + i));
    if (!SLOT_DAYS.includes(day.getUTCDay())) continue;
    const slot = slotInstant(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate());
    if (slot.getTime() <= after.getTime()) continue;
    if (takenMin.has(Math.floor(slot.getTime() / 60_000))) continue;
    out.push(slot);
  }
  return out;
}

/** Days of queue left: from now until the last scheduled post (0 when empty or past). */
export function runwayDays(now: Date, scheduled: Date[]): number {
  if (scheduled.length === 0) return 0;
  const last = Math.max(...scheduled.map((d) => d.getTime()));
  return Math.max(0, Math.floor((last - now.getTime()) / 86_400_000));
}

/** How many slots it takes to stretch the queue to RUNWAY_DAYS (three a week). */
export function slotsToFill(now: Date, scheduled: Date[]): number {
  const target = new Date(now.getTime() + RUNWAY_DAYS * 86_400_000);
  const after = new Date(Math.max(now.getTime(), ...scheduled.map((d) => d.getTime())));
  if (after >= target) return 0;
  return nextSlots(after, 10).filter((s) => s <= target).length;
}
