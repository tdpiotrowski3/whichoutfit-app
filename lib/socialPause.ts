// Brand-level pause for social automation. SOCIAL_PAUSED is a comma list of
// brands ("whichoutfit"); unset = everything runs. Paused means: no Instagram
// auto-publish, no weekly idea drafting, no TikTok reminder emails. Queued rows
// are left untouched, so unpausing resumes the queue — but anything whose
// scheduled_for passed while paused is DUE at once, so reschedule or retire
// stale rows before clearing the variable.
export function socialPaused(brand: string): boolean {
  return (process.env.SOCIAL_PAUSED ?? "")
    .split(",")
    .map((b) => b.trim().toLowerCase())
    .includes(brand.toLowerCase());
}
