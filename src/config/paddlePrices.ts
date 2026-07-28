/**
 * Paddle recurring-price ids — the single place they live.
 *
 * Keyed by CURRENCY, not by country. Every EUR market (DE, FR, and any future
 * euro country) bills against the same nine prices, so onboarding a country adds
 * nothing here: countryProfiles already says which currency it bills in, and the
 * lookup below follows that. Never put a price id in a country profile, a market
 * file or a UI component — this module is the only source.
 *
 * ENVIRONMENT: Paddle sandbox and live are completely separate catalogues — a
 * `pri_…` from one does not exist in the other — so BOTH id sets live here and
 * the environment is chosen by the CLIENT TOKEN's prefix (`test_…` = sandbox,
 * `live_…` = production). That is the same signal paddleService uses to call
 * `Paddle.Environment.set('sandbox')`, so the token is the single switch: set
 * VITE_PADDLE_CLIENT_TOKEN and the whole build follows it. No id is ever
 * hard-coded outside this file.
 *
 * The live catalogue (created 2026-07) intentionally carries NO Paddle trial:
 * the free period is the in-app 7-day signup trial, so live checkout charges
 * immediately (see subscriptionPlans.ts). Sandbox prices still carry the old
 * 7-day Paddle trial — that difference is expected and harmless for testing.
 *
 * ADDING A CURRENCY (e.g. GBP for the UK):
 *   1. create the GBP prices in Paddle (a currency override on the existing
 *      prices, or separate prices — either way you get nine ids);
 *   2. add 'GBP' to BillingCurrency;
 *   3. add a GBP block to BOTH catalogues with those ids.
 * The UK build then picks it up automatically, because COUNTRY_PROFILES.GB
 * already declares `currency: 'GBP'`. Until then, GB resolves to no price id and
 * its plans stay "coming soon" — which is the intended, safe default.
 */
import type { BillingTerm, SubPlanCode } from './subscriptionPlans';
import { ACTIVE_COUNTRY } from './countryProfiles';
import { PUBLIC_ENV } from './env';

/** Currencies we hold a Paddle catalogue for. Add a code, then add its block. */
export type BillingCurrency = 'EUR';

type PriceMatrix = Record<SubPlanCode, Record<BillingTerm, string>>;

/** LIVE catalogue (production Paddle account) — no Paddle-side trial. */
const LIVE_PRICE_IDS: Record<BillingCurrency, PriceMatrix> = {
  EUR: {
    professional: {
      monthly:    'pri_01kxxw08bvfz6fe8ke0x4zgnt7',   // EUR 24.90 / month
      six_months: 'pri_01kxxw3yy10aw2qdy7y64xa0yn',   // EUR 139.00 / 6 months
      annual:     'pri_01kxxw5qbvmfx75rc7f42p5d50',   // EUR 249.00 / year
    },
    team_3: {
      monthly:    'pri_01kxxw8xtvk8dvpa60c0dzxyvn',   // EUR 59.00 / month
      six_months: 'pri_01kxxwbgmpnj9jvcp218evxqfc',   // EUR 329.00 / 6 months
      annual:     'pri_01kxxwde1bwd4x7tgn6sypkb4g',   // EUR 590.00 / year
    },
    team_5: {
      monthly:    'pri_01kxxwfm97ve7nfgnggtshfs49',   // EUR 99.00 / month
      six_months: 'pri_01kxxwhr4xyeq9gwd567j2x7me',   // EUR 549.00 / 6 months
      annual:     'pri_01kxxwkhfjj3wsy5k7jekt2acn',   // EUR 990.00 / year
    },
  },
};

/** SANDBOX catalogue — used only when the client token is a `test_…` token. */
const SANDBOX_PRICE_IDS: Record<BillingCurrency, PriceMatrix> = {
  EUR: {
    professional: {
      monthly:    'pri_01kxchdg26azdq1przy3hnezff',   // EUR 24.90 / month
      six_months: 'pri_01kxchdgawhejbptxtdgm6j5wq',   // EUR 139.00 / 6 months
      annual:     'pri_01kxchdgj2w4gpdmdfbqkhtsqn',   // EUR 249.00 / year
    },
    team_3: {
      monthly:    'pri_01kxchdh34vrxtxth8bkpzmh8n',   // EUR 59.00 / month
      six_months: 'pri_01kxchdh7r99cm3fwk1bz1gz0k',   // EUR 329.00 / 6 months
      annual:     'pri_01kxchdhcm7efjmkh7s1673j82',   // EUR 590.00 / year
    },
    team_5: {
      monthly:    'pri_01kxchdhrmrtqmhataynyqdcdm',   // EUR 99.00 / month
      six_months: 'pri_01kxchdj04dzbf9j5s92tkwvvz',   // EUR 549.00 / 6 months
      annual:     'pri_01kxchdj4rtpj7ndzj30sawddw',   // EUR 990.00 / year
    },
  },
};

/** True when this build talks to the Paddle SANDBOX (token prefix decides). */
export const IS_PADDLE_SANDBOX = PUBLIC_ENV.PADDLE_CLIENT_TOKEN.startsWith('test_');

/** The catalogue this build bills against — live unless a sandbox token is set. */
export const PADDLE_PRICE_IDS: Record<BillingCurrency, PriceMatrix> =
  IS_PADDLE_SANDBOX ? SANDBOX_PRICE_IDS : LIVE_PRICE_IDS;

/** The currency this build bills in, from the active country profile. */
export function activeBillingCurrency(): string {
  return ACTIVE_COUNTRY.currency;
}

function hasCatalogue(currency: string): currency is BillingCurrency {
  return currency in PADDLE_PRICE_IDS;
}

/**
 * Price id for a plan/term in the active market's currency.
 * '' when we hold no catalogue for that currency yet (e.g. GBP) — callers treat
 * an empty id as "not configured" and show the coming-soon notice.
 */
export function priceIdFor(plan: SubPlanCode, term: BillingTerm): string {
  const currency = activeBillingCurrency();
  if (!hasCatalogue(currency)) return '';
  return PADDLE_PRICE_IDS[currency][plan][term] ?? '';
}

/** True when this build has any price catalogue at all (its currency is covered). */
export const hasPriceCatalogue = hasCatalogue(ACTIVE_COUNTRY.currency);
