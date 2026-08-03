/**
 * subscriptionPlans.ts — the HeatPump DB subscription program (single source of truth).
 *
 * Program (decided 2026-07-12; trial model revised 2026-07-27):
 *   Professional (1 user) / Team 3 (admin + 2) / Team 5 (admin + 4)
 *   Terms: monthly / 6 months (~7% off) / annual (~17% off, "12 for the price of 10")
 *
 *   FREE TRIAL = the IN-APP signup trial: 7 days of full access with NO
 *   payment method, granted server-side (finalizeSignup) at the account's
 *   first activation — ONE per email across the whole service, ever
 *   (emailRegistry). Paddle prices carry NO trial: checkout charges
 *   immediately. Team trials are ONE per organization, anchored to the team
 *   ADMIN's own signup trial — member join dates never extend it, and on day
 *   8 without payment the whole team is gated (accessUntilTs).
 *
 * Operating principles (enforced in UI + admin, not Paddle proration):
 *   - Plan and term are FIXED during a paid period. No mid-term upgrades,
 *     downgrades, seat changes or pro-rated charges.
 *   - Upgrades/downgrades are SCHEDULED and apply at the next renewal
 *     (subscriptionChangeRequests collection; ops/webhook applies them).
 *   - Team member replacement (remove + invite into the freed seat) is always
 *     allowed and never touches the Paddle subscription.
 *   - Downgrading Team 5 → Team 3 requires choosing the members to keep at
 *     scheduling time; the rest lose access at renewal.
 *   - Cancelling stops the next renewal only; access runs to period end.
 *
 * Prices are VAT-exclusive; Paddle computes VAT at checkout per country.
 * Paddle catalogue: 3 products × 3 recurring prices, NO trial on any price
 * (immediate charge — the free period lives in the app, not in Paddle).
 * The price ids live in paddlePrices.ts, keyed by currency (EUR today); a market
 * whose currency has no catalogue stays in "coming soon" mode.
 */
import { PUBLIC_ENV } from './env';
import { priceIdFor } from './paddlePrices';

export type SubPlanCode = 'professional' | 'team_3' | 'team_5';
export type BillingTerm = 'monthly' | 'six_months' | 'annual';
export type SubStatus = 'trialing' | 'active' | 'past_due' | 'canceled' | 'expired';

export const TRIAL_DAYS = 7;

export interface SubPlanDef {
  code: SubPlanCode;
  /** Seats INCLUDING the team admin (1 for Professional). */
  seatLimit: number;
  /** VAT-exclusive EUR prices per term. */
  prices: Record<BillingTerm, number>;
  sortOrder: number;
}

export const SUB_PLANS: Record<SubPlanCode, SubPlanDef> = {
  professional: {
    code: 'professional', seatLimit: 1, sortOrder: 1,
    prices: { monthly: 24.90, six_months: 139, annual: 249 },
  },
  team_3: {
    code: 'team_3', seatLimit: 3, sortOrder: 2,
    prices: { monthly: 59, six_months: 329, annual: 590 },
  },
  team_5: {
    code: 'team_5', seatLimit: 5, sortOrder: 3,
    prices: { monthly: 99, six_months: 549, annual: 990 },
  },
};

export const SUB_PLAN_CODES: SubPlanCode[] = ['professional', 'team_3', 'team_5'];
export const BILLING_TERMS: BillingTerm[] = ['monthly', 'six_months', 'annual'];

/** English display names (admin console + fallbacks; app UI uses i18n keys). */
export const SUB_PLAN_NAMES: Record<SubPlanCode, string> = {
  professional: 'Professional',
  team_3: 'Team 3',
  team_5: 'Team 5',
};

export const TERM_NAMES: Record<BillingTerm, string> = {
  monthly: 'Monthly',
  six_months: '6 Months',
  annual: 'Annual',
};

/** Months covered by a term (for per-month equivalents and period math). */
export const TERM_MONTHS: Record<BillingTerm, number> = {
  monthly: 1, six_months: 6, annual: 12,
};

export const isTeamPlan = (code: SubPlanCode | undefined | null): boolean =>
  code === 'team_3' || code === 'team_5';

export const formatEur = (v: number): string =>
  `€${v % 1 === 0 ? v.toLocaleString('en-IE') : v.toFixed(2)}`;

/** Effective monthly cost of a term, e.g. annual €249 → €20.75/month. */
export const perMonth = (plan: SubPlanCode, term: BillingTerm): number =>
  SUB_PLANS[plan].prices[term] / TERM_MONTHS[term];

/** Per-user per-month when the team is fully used (team plans only). */
export const perUserMonth = (plan: SubPlanCode, term: BillingTerm): number =>
  perMonth(plan, term) / SUB_PLANS[plan].seatLimit;

/**
 * Whole-percent saving of a term versus paying monthly for the same number of
 * months, for ONE plan, derived straight from the configured prices — never a
 * hard-coded figure. Monthly (or a bad/zero price) → 0. Rounded to a whole
 * percent, which is the rounding the UI has always shown ("~7%", "~17%").
 */
export function termDiscountPct(plan: SubPlanCode, term: BillingTerm): number {
  const months = TERM_MONTHS[term];
  const monthlyTotal = SUB_PLANS[plan].prices.monthly * months;
  if (months <= 1 || monthlyTotal <= 0) return 0;
  return Math.round((1 - SUB_PLANS[plan].prices[term] / monthlyTotal) * 100);
}

/**
 * The saving the plan-agnostic billing-period selector shows for a term: the
 * LOWEST discount across every currently active plan. One "Save ~X%" badge sits
 * above all three cards, so it must be the smallest of the three — that way the
 * shared claim can never overstate the saving for any plan, whatever the prices
 * become after a future change (it is not pinned to any one reference plan).
 */
export function sharedTermDiscountPct(term: BillingTerm): number {
  return Math.min(...SUB_PLAN_CODES.map(code => termDiscountPct(code, term)));
}

/**
 * Paddle recurring-price id for a plan/term ('' = not configured yet).
 * The ids live in paddlePrices.ts, keyed by currency — DE and FR share the EUR
 * catalogue, and a market whose currency has no catalogue yet resolves to ''.
 */
export function paddlePriceId(plan: SubPlanCode, term: BillingTerm): string {
  return priceIdFor(plan, term);
}

/** True when checkout can actually open for this plan/term. */
export function checkoutConfigured(plan: SubPlanCode, term: BillingTerm): boolean {
  return !!(PUBLIC_ENV.PADDLE_CLIENT_TOKEN && paddlePriceId(plan, term));
}

/** A subscription (or grant) that currently unlocks the product. */
export function subscriptionUnlocked(status: SubStatus | undefined | null, periodEndsAt?: string | null): boolean {
  if (status === 'trialing' || status === 'active' || status === 'past_due') return true;
  // Cancelled-but-paid: access runs to the end of the paid period.
  if (status === 'canceled' && periodEndsAt) return new Date(periodEndsAt).getTime() > Date.now();
  return false;
}

/* ── Entitlement view (2026-08-03 two-layer program) ─────────────────────────
 * `user.subscription` = paid facts, written ONLY by the Paddle webhook.
 * `user.grant`        = marketing free access, written only by admin tooling.
 * Display and unlock decisions read the EFFECTIVE view below; the layers
 * never write into each other, so a paid subscription starting during a
 * grant simply takes the lead (auto-conversion) with no data conflict. */

import type { User, UserGrant, UserSubscription } from '../types';

/** A marketing grant presented in the UserSubscription shape the UI knows. */
export function grantAsSubscription(g: UserGrant | null | undefined): UserSubscription | null {
  if (!g) return null;
  const activeNow = new Date(g.endsAt).getTime() > Date.now();
  return {
    provider: 'free_grant',
    planCode: g.planCode,
    status: activeNow ? 'active' : 'expired',
    seatLimit: SUB_PLANS[g.planCode]?.seatLimit ?? 1,
    paidPeriodStartsAt: g.startsAt,
    currentPeriodEndsAt: g.endsAt,
    cancelAtPeriodEnd: true,
  };
}

/** The subscription-like record the UI should show: an unlocking paid
 *  subscription wins; otherwise an active grant; otherwise whichever exists. */
export function effectiveSubscription(user: Pick<User, 'subscription' | 'grant'>): UserSubscription | null {
  const sub = user.subscription ?? null;
  if (sub && subscriptionUnlocked(sub.status, sub.currentPeriodEndsAt)) return sub;
  const g = grantAsSubscription(user.grant);
  if (g && g.status === 'active') return g;
  return sub ?? g;
}
