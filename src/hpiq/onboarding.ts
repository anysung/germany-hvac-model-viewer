/**
 * onboarding — state for the feature-tour invitation (owner request 2026-07-31).
 *
 * PATTERN (industry practice — Slack/Notion/Linear-style onboarding):
 *   • The tour is INVITED, never forced: a small dialog offers it and is easy
 *     to decline. Auto-starting a tour is the classic onboarding mistake.
 *   • The invitation re-appears on later logins — people skip it the first
 *     time and want it later — but with a hard ceiling (5 sessions, owner
 *     decision) so it can never become nagware.
 *   • "Not today" snoozes to the end of the local day (owner request).
 *   • The tour stays reachable forever from Account ("App tour"), so the
 *     ceiling costs nothing.
 *
 * STORAGE: localStorage, per user id — deliberately NOT Firestore. Losing this
 * state on a new device merely re-offers a skippable dialog; putting it in the
 * profile would add schema/rules surface for zero safety gain. The counter
 * increments once per app SESSION in which the invitation was actually shown,
 * which is the honest reading of "5 logins".
 */

export interface TourState {
  /** Sessions in which the invitation has been shown. */
  shown: number;
  /** Epoch ms until which "not today" suppresses the invitation. */
  snoozeUntil?: number;
  /** Set when the user finished OR explicitly declined the tour for good. */
  doneAt?: number;
}

const KEY = (uid: string) => `hpdb-tour-${uid}`;
const MAX_INVITES = 5;

export function readTour(uid: string): TourState {
  try {
    const raw = localStorage.getItem(KEY(uid));
    if (raw) return JSON.parse(raw) as TourState;
  } catch { /* storage unavailable → behave as fresh */ }
  return { shown: 0 };
}

function write(uid: string, s: TourState): void {
  try { localStorage.setItem(KEY(uid), JSON.stringify(s)); } catch { /* best-effort */ }
}

/** Should this session offer the tour? (Call once on app mount.) */
export function shouldInvite(uid: string, now = Date.now()): boolean {
  const s = readTour(uid);
  if (s.doneAt) return false;
  if (s.shown >= MAX_INVITES) return false;
  if (s.snoozeUntil && now < s.snoozeUntil) return false;
  return true;
}

/** Record that the invitation was shown this session (counts toward the 5). */
export function markShown(uid: string): void {
  const s = readTour(uid);
  write(uid, { ...s, shown: s.shown + 1 });
}

/** "Not today" — suppress until local midnight. */
export function snoozeToday(uid: string, now = new Date()): void {
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  const s = readTour(uid);
  write(uid, { ...s, snoozeUntil: midnight.getTime() });
}

/** Tour finished or permanently declined — never invite again. */
export function markDone(uid: string): void {
  const s = readTour(uid);
  write(uid, { ...s, doneAt: Date.now() });
}
