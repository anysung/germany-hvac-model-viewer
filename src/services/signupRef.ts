/**
 * signupRef — which marketing channel brought this signup.
 *
 * Solo-operator marketing runs on time, not money, and the only way to decide
 * where the time goes is to know which channel actually produces accounts.
 * Every outbound link we control carries `?ref=<channel>` (LinkedIn comments,
 * the news/guide CTAs, YouTube descriptions); this module catches the value on
 * arrival and the registration flow stamps it on the profile. The admin
 * Marketing page then counts signups per channel — automatically, which is the
 * difference between a dashboard and a chore.
 *
 * sessionStorage, not localStorage: attribution should describe THIS visit.
 * A ref that sticks for weeks would credit the first touch with a conversion
 * that a later channel earned, silently — worse than no data.
 */

const KEY = 'hp_signup_ref';

/** The channels we actually use. An open vocabulary invites typos that split
 *  one channel into five rows ("li", "LI", "linkedIn"…). */
const KNOWN = new Set(['li', 'yt', 'news', 'guide', 'trends', 'seo', 'other']);

/** Call once on boot, before any routing. Idempotent; never throws. */
export function captureSignupRef(): void {
  try {
    const raw = new URLSearchParams(window.location.search).get('ref');
    if (!raw) return;
    const ref = raw.toLowerCase().slice(0, 24);
    sessionStorage.setItem(KEY, KNOWN.has(ref) ? ref : 'other');
  } catch { /* storage blocked (private mode etc.) — attribution is optional */ }
}

/** The captured channel, or undefined — spread into the profile via compact(). */
export function pendingSignupRef(): string | undefined {
  try { return sessionStorage.getItem(KEY) ?? undefined; } catch { return undefined; }
}
