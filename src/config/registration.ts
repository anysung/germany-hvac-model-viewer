/**
 * Registration availability — one shared flag for every country edition.
 *
 * REOPENED 2026-08-06 (launch): the in-app trial flow is live (15 days since
 * 2026-09-07; 7 before that) — email
 * signup → verification → finalizeSignup activates and starts the trial.
 * The pause (Jul 2026, European expansion review) is over; the paused-notice
 * branch in App.tsx stays in the code so any future pause is this one flag
 * again.
 *
 * SCOPE — this is a UI switch, and only that. Closing it hides the form but is
 * not a security control: Firebase Auth and the Firestore rules are untouched.
 */

/** The one switch. false = the signup form is not offered, in any edition. */
const REGISTRATION_FLAG = true;

/**
 * Dev/e2e may open the form to exercise the reopened flow (VITE_REGISTRATION_OPEN=true).
 * Production builds never see that variable, so the flag above is the only switch
 * that matters there.
 */
export const REGISTRATION_OPEN =
  REGISTRATION_FLAG ||
  (import.meta.env.DEV && import.meta.env.VITE_REGISTRATION_OPEN === 'true');

/** Expected reopening date, shown to visitors. Informational only.
 *  Moved from 2026-08-03 on the owner's call (2026-08-03): subscription
 *  billing setup is not finished, and reopening before checkout works would
 *  hand new accounts a trial they cannot convert. */
export const REGISTRATION_REOPEN_DATE = '2026-08-07';
