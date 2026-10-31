// Comeback app actions (data-act ids in comeback/src) mapped to readable features grouped by product area.
// null = UI plumbing (closing a sheet, pausing a timer) that says nothing about what people value; hidden.
// Several ids can share a label (e.g. the three password-reset steps count as one feature).
// When the app adds a button, add it here; anything unmapped shows under "Other" with its raw id.

export type Area =
  | "Setup" | "Today" | "Workout" | "Logging" | "PT" | "Plan editing" | "Sport" | "Health" | "AI coach"
  | "Sharing" | "Watch" | "Pro" | "Account" | "Settings" | "Help" | "Navigation";

export const AREA_ORDER: Area[] = ["Today", "Workout", "Logging", "PT", "Sport", "Health", "AI coach", "Sharing", "Watch", "Pro", "Plan editing", "Setup", "Account", "Settings", "Help", "Navigation"];

const F: Record<string, [Area, string] | null> = {
  // Setup
  onbWelcome: ["Setup", "Started setup"], onbPath: ["Setup", "Picked a way in"], onbArea: ["Setup", "Picked injury area"],
  onbSide: ["Setup", "Picked injury side"], onbSurg: ["Setup", "Answered surgery question"], onbSport: ["Setup", "Picked a sport"],
  onbStroke: ["Setup", "Picked swim strokes"], onbGoal: ["Setup", "Set a race goal"], onbDay: ["Setup", "Picked training days"],
  onbMin: ["Setup", "Picked session length"], onbPlace: ["Setup", "Picked where they train"], onbGym: ["Setup", "Picked where they train"],
  onbProp: ["Setup", "Picked equipment"], onbAns: ["Setup", "Answered readiness questions"], onbHealth: ["Setup", "Connected Health in setup"],
  onbSignIn: ["Setup", "Signed in during setup"], onbEmail: ["Setup", "Signed in during setup"], onbSkip: ["Setup", "Skipped a setup step"],
  consentGo: ["Setup", "Agreed to the terms"], redoSetup: ["Setup", "Redid setup"], onbNext: null, onbBack: null,
  // Today
  strip: ["Today", "Browsed other days"], selDay: ["Today", "Browsed other days"], openDay: ["Today", "Browsed other days"],
  ci: ["Today", "Morning check-in"], checkSheet: ["Today", "Morning check-in"], ckSet: ["Today", "Morning check-in"], ckSave: ["Today", "Morning check-in"],
  int: ["Today", "Changed today's intensity"], surprise: ["Today", "Shuffled exercises"], shuffle: ["Today", "Shuffled exercises"], swap: ["Today", "Swapped an exercise"],
  // Workout player
  start: ["Workout", "Started a session with the timer"], qStart: ["Workout", "Started a session with the timer"],
  runDone: ["Workout", "Finished sets"], runSave: ["Workout", "Saved a session"], runDiscard: ["Workout", "Discarded a session"],
  runTimer: ["Workout", "Used the set timer"], runVoice: ["Workout", "Turned voice cues on/off"], runSkip: ["Workout", "Skipped an exercise"],
  runEnd: ["Workout", "Ended a session early"], loadStep: ["Workout", "Set the load"], loadPick: ["Workout", "Set the load"], loadUnit: ["Workout", "Set the load"],
  runPrev: null, runGo: null, runSegSkip: null, runSkipRest: null, runAddRest: null,
  // Logging without the timer
  qDone: ["Logging", "Marked a block done"], qAll: ["Logging", "Marked the whole day done"], qSkip: ["Logging", "Skipped a block"], qUndo: ["Logging", "Undid a log"],
  actSheet: ["Logging", "Logged another activity"], actLog: ["Logging", "Logged another activity"], actKind: ["Logging", "Logged another activity"],
  actMin: ["Logging", "Logged another activity"], actPlan: ["Logging", "Logged another activity"],
  logSport: ["Logging", "Logged sport minutes"], logSwim: ["Logging", "Logged a swim"],
  xLog: ["Logging", "Edited a logged session"], xMin: ["Logging", "Edited a logged session"], xRm: ["Logging", "Deleted a logged session"],
  // PT
  tPT: ["PT", "Opened PT exercises"], ptAdd: ["PT", "Opened add PT exercise"], ptAddMode: ["PT", "Opened add PT exercise"],
  ptAddRead: ["PT", "Added PT exercises (typed or photo)"], ptAddSave: ["PT", "Added PT exercises (typed or photo)"],
  ptAddStarter: ["PT", "Used a starter list"], ptAddBuiltin: ["PT", "Used a starter list"], ptAddManual: ["PT", "Added an exercise by hand"],
  ptOk: ["PT", "Marked an exercise PT-okayed"], ptRm: ["PT", "Edited the PT list"], ptMv: ["PT", "Edited the PT list"], ptCopy: ["PT", "Copied the PT summary"],
  addTrack: ["PT", "Added a progression"], trkUp: ["PT", "Moved up a progression step"], trkBack: ["PT", "Stepped back a progression"],
  trkDone: ["PT", "Finished a progression"], trkHold: ["PT", "Held a progression step"], trkRm: ["PT", "Removed a progression"],
  // Plan editing
  openPicker: ["Plan editing", "Edited a day's workout"], pkAdd: ["Plan editing", "Edited a day's workout"], pkFocus: ["Plan editing", "Edited a day's workout"],
  pkEquip: ["Plan editing", "Edited a day's workout"], addLib: ["Plan editing", "Edited a day's workout"], addCustom: ["Plan editing", "Added a custom exercise"],
  rmMix: ["Plan editing", "Edited a day's workout"], rmCustom: ["Plan editing", "Edited a day's workout"], resetDay: ["Plan editing", "Reset a day"],
  tplPT: ["Plan editing", "Changed the weekly template"], tplSwim: ["Plan editing", "Changed the weekly template"], tplRm: ["Plan editing", "Changed the weekly template"],
  tplXRm: ["Plan editing", "Changed the weekly template"], preset: ["Plan editing", "Picked a workout preset"], gym: ["Plan editing", "Changed equipment"], prop: ["Plan editing", "Changed equipment"],
  wk: ["Plan editing", "Browsed weeks"], closePicker: null,
  // Sport
  tSwim: ["Sport", "Opened the sport session"], swAlso: ["Sport", "Changed swim strokes"], swOpenWater: ["Sport", "Turned open water on/off"],
  goalMode: ["Sport", "Changed race goal"], runUnits: ["Sport", "Changed run units"], runEv: ["Sport", "Set run events/times"], setCSS: ["Sport", "Set swim threshold pace"],
  // Health
  htab: ["Health", "Health section"], healthAuth: ["Health", "Connected Health"], history: ["Health", "Imported Health history"],
  importSwims: ["Health", "Imported workouts"], syncNow: ["Health", "Synced now"],
  // AI coach
  coachOpen: ["AI coach", "Opened Adjust today"], coachAsk: ["AI coach", "Asked the coach to adjust today"], coachClose: null,
  // Sharing
  shareNew: ["Sharing", "Created a PT link"], shareCopy: ["Sharing", "Sent a PT link"], shareSend: ["Sharing", "Sent a PT link"],
  shareOff: ["Sharing", "Turned a PT link off"], msShare: ["Sharing", "Shared a milestone"],
  // Watch
  toWatch: ["Watch", "Sent today to the Watch"],
  // Pro
  paywall: ["Pro", "Opened the Pro screen"], payPlan: ["Pro", "Picked a Pro plan"], payBuy: ["Pro", "Tapped buy"], payRestore: ["Pro", "Restored purchases"],
  payManage: ["Pro", "Managed subscription"], review: ["Pro", "Opened the weekly review"],
  // Account
  google: ["Account", "Google sign-in"], signIn: ["Account", "Email sign-in"], resetOpen: ["Account", "Password reset"], resetSend: ["Account", "Password reset"],
  resetDo: ["Account", "Password reset"], signOut: ["Account", "Signed out"], signOutGo: ["Account", "Signed out"], delAcct: ["Account", "Deleted account"], delAcctGo: ["Account", "Deleted account"],
  // Settings
  settings: ["Settings", "Opened settings"], remToggle: ["Settings", "Reminders"], remOn: ["Settings", "Reminders"], remNo: ["Settings", "Reminders"],
  wipeLocal: ["Settings", "Erased device data"], wipeLocalGo: ["Settings", "Erased device data"], usage: null,
  // Help
  info: ["Help", "Opened a how-to"], safetySheet: ["Help", "Opened 'When to stop'"], safetySheetFromConsent: ["Help", "Opened 'When to stop'"],
  closeSheet: null, longKey: null, cnt: null,
};

const TABS: Record<string, string> = { today: "Today tab", plan: "Plan tab", swim: "Sport tab", pt: "PT tab", health: "Health tab" };
const HEALTH_SECTION: Record<string, string> = { overview: "Health overview", trends: "Trends (Pro)", body: "Body & pain", fuel: "Fuel (Pro)" };

/** Readable feature for a tab or button event; null = plumbing, not shown. Unmapped actions land in "Other". */
export function describe(name: string, props: Record<string, unknown> | null): { area: Area | "Other"; label: string } | null {
  const p = props || {};
  if (name === "tab") return { area: "Navigation", label: TABS[String(p.t)] || String(p.t) + " tab" };
  if (name !== "act") return null;
  const id = String(p.a);
  if (!(id in F)) return { area: "Other", label: id };
  const f = F[id]; if (!f) return null;
  if (id === "htab" && p.v) return { area: "Health", label: HEALTH_SECTION[String(p.v)] || "Health · " + String(p.v) };
  return { area: f[0], label: f[1] };
}

/** Every known feature, for the "not used yet" list. */
export function knownFeatures(): { area: Area; label: string }[] {
  const seen = new Set<string>(); const out: { area: Area; label: string }[] = [];
  const add = (area: Area, label: string) => { if (!seen.has(area + label)) { seen.add(area + label); out.push({ area, label }); } };
  for (const t of Object.values(TABS)) add("Navigation", t);
  for (const f of Object.values(F)) if (f && !(f[0] === "Health" && f[1] === "Health section")) add(f[0], f[1]);
  for (const h of Object.values(HEALTH_SECTION)) add("Health", h);
  return out;
}
