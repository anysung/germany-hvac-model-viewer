/**
 * analyticsService — first-party, cookieless usage events (owner approval
 * 2026-08-01, marketing request 2026-07-28-analytics-events.md).
 *
 * THE CONTRACT (mirrors the privacy policy section added the same day —
 * change one, change both):
 *   • Six events only: search_performed · search_zero_results · product_view ·
 *     listing_status_viewed · comparison_created · datasheet_exported.
 *   • No PII, ever: no email, name, IP, company field, or free search text.
 *     Queries are reduced to normalised tokens (numbers and address-like
 *     fragments removed, length-capped).
 *   • Identity is a random per-session id + a ONE-WAY hashed account
 *     reference (SHA-256, truncated). The raw uid never leaves the device.
 *   • Third parties receive nothing; storage is our EU-region Firestore with
 *     a 13-month TTL (expireAt + Firestore TTL policy on `events`).
 *   • Fire-and-forget: a failed write must NEVER surface to the UI or block
 *     a feature. Analytics can misinform, never break.
 *   • Collection runs in PRODUCTION only, and never for preview sessions.
 *
 * Export: scripts/export-events.mjs produces the monthly raw CSV for the
 * marketing workspace (non-aggregated, per the request).
 */
import { addDoc, collection, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { ACTIVE_COUNTRY } from '../config/countryProfiles';

export type AnalyticsEvent =
  | 'search_performed'
  | 'search_zero_results'
  | 'product_view'
  | 'listing_status_viewed'
  | 'comparison_created'
  | 'datasheet_exported';

const TTL_MONTHS = 13;

/** Random id per app load — links events within one visit, nothing else. */
const sessionId = Math.random().toString(36).slice(2, 12);

let userRef: string | null = null;      // one-way hashed uid (16 hex chars)
let authState: 'trial' | 'paid' | 'free' | 'unknown' = 'unknown';
let plan = 'none';
let locale = '';

/** Compute the hashed account reference once per session. */
export async function analyticsIdentify(uid: string, state: typeof authState, planCode: string | null | undefined, lang: string): Promise<void> {
  authState = state;
  plan = planCode ?? 'none';
  locale = lang;
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('hpdb:' + uid));
    userRef = [...new Uint8Array(buf)].slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
  } catch { userRef = null; /* very old browser — events stay sessions-only */ }
}

const deviceClass = (): string => {
  const w = window.innerWidth;
  return w < 768 ? 'phone' : w < 1100 ? 'tablet' : 'desktop';
};

/**
 * Strip a search query down to a PII-safe normalised form: lowercase tokens,
 * digits collapsed (model numbers keep their SHAPE, not their value — enough
 * for gap analysis, useless for identification), email/URL-like and long
 * fragments dropped, hard length cap.
 */
export function normaliseQuery(q: string): string {
  return q
    .toLowerCase()
    .replace(/\S+@\S+|https?:\S+/g, '')     // emails / urls out entirely
    .replace(/\d/g, '#')                     // digits → shape only
    .replace(/[^\p{L}#\s-]/gu, ' ')          // punctuation out
    .split(/\s+/)
    .filter(t => t.length >= 2 && t.length <= 24)
    .slice(0, 6)
    .join(' ')
    .slice(0, 80);
}

const enabled = (): boolean =>
  import.meta.env.PROD && userRef !== 'preview' && !window.location.search.includes('preview=');

/** Fire-and-forget event write. Never throws, never blocks. */
export function track(event: AnalyticsEvent, props: Record<string, string | number | boolean> = {}): void {
  if (!enabled()) return;
  const expire = new Date();
  expire.setMonth(expire.getMonth() + TTL_MONTHS);
  addDoc(collection(db, 'events'), {
    event,
    at: Timestamp.now(),
    expireAt: Timestamp.fromDate(expire),
    market: ACTIVE_COUNTRY.code,
    locale,
    authState,
    plan,
    deviceClass: deviceClass(),
    sessionId,
    ...(userRef ? { userRef } : {}),
    ...props,
  }).catch(() => { /* analytics must never break the app */ });
}
