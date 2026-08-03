/**
 * Registration availability — one shared flag for every country edition.
 *
 * New-user registration is PAUSED (Jul 2026) while the European expansion review
 * runs. DE, GB and FR are the same build with a different VITE_COUNTRY_CODE, so
 * this single flag covers all three; there is deliberately no per-country switch.
 *
 * SCOPE — this is a UI pause, and only that. While it is closed, the Sign Up
 * entry stays visible but opens a maintenance notice instead of the form, so a
 * normal user cannot complete registration through the app. It is not a security
 * control: Firebase Auth and the Firestore rules are untouched, so registration
 * remains technically possible for anyone calling the APIs directly.
 *
 * TO REOPEN: set REGISTRATION_OPEN = true here, rebuild, deploy. Nothing reopens
 * on its own — REOPEN_DATE below is display copy that no code compares against
 * the clock.
 */

/** The one switch. false = the signup form is not offered, in any edition. */
const REGISTRATION_FLAG = false;

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
