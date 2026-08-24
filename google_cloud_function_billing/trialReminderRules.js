/**
 * trialReminderRules — who gets a trial reminder, and which one.
 *
 * Separated from index.js so it can be tested without a Firestore, because the
 * cost of a mistake here is asymmetric: failing to mail someone loses a sale,
 * but mailing the wrong person sends a cheerful note about their trial to an
 * account we suspended an hour earlier. The second is not recoverable.
 *
 * Pure functions, no I/O, no clock of their own — the caller passes `nowMs`.
 */

const DAY = 86400000;

/** Timestamp-ish → epoch ms. Accepts Firestore Timestamp, ISO string, number. */
function tsMillis(v) {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') { const t = Date.parse(v); return Number.isFinite(t) ? t : null; }
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (typeof v.seconds === 'number') return v.seconds * 1000;
  return null;
}

/**
 * Which reminder this account is due, or null.
 *
 *   > 2 days left     nothing — too early to be useful, early enough to annoy
 *   1–2 days left     two_days_left
 *   < 1 day left      last_day
 *   ended < 7 days    expired
 *   ended > 7 days    nothing — a stale trial is not a lead, and a note about
 *                     it months later reads as a system that lost track
 */
function trialStageFor(user, nowMs) {
  const endsMs = tsMillis(user.trialEndsAt);
  if (endsMs == null) return null;
  const left = endsMs - nowMs;
  if (left > 2 * DAY) return null;
  if (left > DAY) return 'two_days_left';
  if (left > 0) return 'last_day';
  if (left > -7 * DAY) return 'expired';
  return null;
}

/**
 * Why this account must NOT be mailed, or null when it may be.
 *
 * Order matters only for the reason string; every check is a hard stop.
 */
function skipReminder(user) {
  const status = user.status ?? (user.isActive ? 'active' : '');
  if (status !== 'active') return 'not-active';
  if (!user.email) return 'no-email';
  // A team member cannot buy anything: the window belongs to the team admin.
  if (user.orgRole === 'member') return 'team-member';
  if (user.grant && !user.grant.revokedAt) return 'has-grant';
  const sub = user.subscription;
  if (sub && ['active', 'trialing', 'past_due', 'paused'].includes(String(sub.status))) return 'subscribed';
  if (user.billingChannel === 'paddle') return 'paddle-customer';
  return null;
}

module.exports = { trialStageFor, skipReminder, tsMillis, DAY };
