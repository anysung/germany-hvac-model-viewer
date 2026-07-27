/**
 * Legal identity, policy versions and the public policy routes.
 *
 * The four policy pages are reachable WITHOUT a login on the same customer-facing
 * domain (hosting rewrites every path to index.html; App.tsx renders the policy
 * before the auth gate). One shared set of routes for every country edition.
 *
 * IDENTITY: the full operator identity — trading name, owner, registered address,
 * business registration number and merchant of record — is published in the
 * LEGAL NOTICE (the `imprint` document) and, for the parts that belong there, in
 * the Terms operator provision and the Privacy "Data Controller" section. These
 * are the same verified facts in every country edition, from the constants below
 * (one source of truth). The marketing surfaces — homepage, pricing cards, nav,
 * Account summary — deliberately do NOT repeat the owner name, address, country
 * or registration number: those stay one click away in the Legal Notice.
 * The identity facts (trading name, owner, address, registration number, email)
 * are never translated; only the surrounding headings and sentences are.
 */

/** Customer-facing product/brand identity used across the policy pages. */
export const SERVICE_NAME = 'HeatPump Database (Europe)';

/** Prominent brand mark (trademark form) — Legal Notice, Terms intro, footers. */
export const BRAND_TM = 'HeatPump Database (Europe)™';

/* ── Verified operator identity (Paddle review). Facts, never translated. ──── */

/** Registered trading name of the service operator. */
export const OPERATOR_NAME = 'A Company';
/** Owner and operator of the sole proprietorship. */
export const OPERATOR_OWNER = 'Yong Soo Sung';
/** Business registration number of the operator. */
export const BUSINESS_REG_NUMBER = '854-76-00547';
/** Registered business address, one postal line per entry (never altered/translated). */
export const BUSINESS_ADDRESS_LINES = [
  '1st Floor, 16-32, Seogyeong-ro 2-gil',
  'Seongbuk-gu, Seoul',
  'Republic of Korea',
] as const;
/** Payment merchant of record (Paddle legal entity). */
export const PADDLE_ENTITY = 'Paddle.com Market Ltd';

/** The single customer-facing support address (policies, Legal Notice, Account). */
export const SUPPORT_EMAIL = 'support@heatpumpdb.eu';

/** Advertising / business-partnership contact — Account "Advertising & partnerships" card only. */
export const MARKETING_EMAIL = 'marketing@heatpumpdb.eu';

/** Bump when the wording changes materially; stamped on the profile at signup. */
export const TERMS_VERSION = '2026-07-22';
export const PRIVACY_VERSION = '2026-07-27';
/**
 * Data-use consent (anti-extraction notice shown in the signup consent popup —
 * translations termsData). Bump when that wording changes materially; the
 * accepted version is server-stamped by finalizeSignup (dataUseConsentVersion).
 */
export const DATA_USE_VERSION = '2026-07-27';

export const LEGAL_ROUTES = {
  privacy: '/privacy',
  terms: '/terms',
  refund: '/refund-policy',
  imprint: '/imprint',
} as const;

/**
 * Public, read-only pricing page (no login) so Paddle can inspect the plans,
 * billing terms, trial and VAT-exclusive wording without an account. It renders
 * the SAME shared subscription config (config/subscriptionPlans.ts) — no duplicated
 * prices or rules — and never opens checkout (signup stays paused).
 */
export const PRICING_ROUTE = '/pricing';

export type LegalDoc = keyof typeof LEGAL_ROUTES;

export const LEGAL_DOCS = Object.keys(LEGAL_ROUTES) as LegalDoc[];

/** Resolve a pathname to a policy page (null = not a policy route). */
export function legalDocForPath(pathname: string): LegalDoc | null {
  const path = pathname.replace(/\/+$/, '') || '/';
  const hit = LEGAL_DOCS.find(doc => LEGAL_ROUTES[doc] === path);
  return hit ?? null;
}
