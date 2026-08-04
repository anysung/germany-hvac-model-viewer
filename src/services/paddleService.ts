/**
 * paddleService — web billing via Paddle (merchant of record).
 *
 * The app is NOT distributed through app stores; subscriptions are sold on
 * the web. Paddle handles payment methods, EU VAT, invoices/receipts and the
 * customer self-service flows — we never store card data, and the only
 * billing identifiers kept on the user profile are the Paddle customer /
 * subscription ids (written by the payment webhook, server-side).
 *
 * Catalogue: 3 products (Professional / Team 3 / Team 5) × 3 recurring prices
 * (monthly / 6 months / annual), each with a 7-day trial configured on the price
 * in Paddle. The ids live in config/paddlePrices.ts, keyed by currency; a market
 * whose currency has no catalogue keeps that option in "coming soon" mode.
 */
import { PUBLIC_ENV } from '../config/env';
import { SubPlanCode, BillingTerm, paddlePriceId, checkoutConfigured } from '../config/subscriptionPlans';
import { hasPriceCatalogue, IS_PADDLE_SANDBOX } from '../config/paddlePrices';
import { User } from '../types';

declare global {
  // Paddle.js v2 global (loaded on demand from Paddle's CDN).
  interface Window { Paddle?: any }
}

/** True once ANY checkout can open (client token + a price catalogue for this market's currency). */
export const paddleConfigured = !!PUBLIC_ENV.PADDLE_CLIENT_TOKEN && hasPriceCatalogue;

export { checkoutConfigured };

let loader: Promise<any> | null = null;

/** Paddle Retain identity: ONLY a Paddle customer id (`ctm_…`) is accepted —
 *  never our uid or an email (docs: pwCustomer). Absent until the billing
 *  webhook has written one, which is exactly the pre-first-purchase case
 *  where Retain has nothing to work with anyway. */
const pwCustomerFor = (user?: User | null) =>
  user?.paddleCustomerId?.startsWith('ctm_') ? { id: user.paddleCustomerId } : {};

/** Load + initialize Paddle.js v2 once. Rejects if unconfigured or blocked.
 *  `user` (when known) identifies the signed-in customer to Paddle Retain. */
function loadPaddle(user?: User | null): Promise<any> {
  if (!PUBLIC_ENV.PADDLE_CLIENT_TOKEN) return Promise.reject(new Error('paddle-not-configured'));
  if (window.Paddle) {
    // Already initialized (SPA: the customer may only now be known) — Retain
    // is updated through Update(), because Initialize() may run only once.
    try {
      const pw = pwCustomerFor(user);
      if (window.Paddle.Initialized && (pw as any).id) window.Paddle.Update({ pwCustomer: pw });
    } catch { /* Retain identity is best-effort; never block checkout */ }
    return Promise.resolve(window.Paddle);
  }
  if (loader) return loader;
  loader = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.paddle.com/paddle/v2/paddle.js';
    s.async = true;
    s.onload = () => {
      try {
        // Live is Paddle.js's default; the sandbox switch fires ONLY for a
        // `test_…` token, which is the same signal that selects the sandbox
        // price catalogue (config/paddlePrices.ts). One env var, one
        // environment — a live token can never reach the sandbox and vice versa.
        if (IS_PADDLE_SANDBOX) window.Paddle.Environment.set('sandbox');
        window.Paddle.Initialize({
          token: PUBLIC_ENV.PADDLE_CLIENT_TOKEN,
          // Retain only loads on live accounts; an empty object is the
          // documented "no signed-in customer yet" value.
          pwCustomer: pwCustomerFor(user),
          // A completed checkout changes the profile SERVER-side (webhook
          // writes subscription, and creates the organization for team
          // plans). onUserChange reads the profile once at sign-in, so
          // without this the buyer would sit on a stale Account page —
          // Team buyers saw a Team badge with no seat management until they
          // reloaded (2026-08-04). The app listens and refetches.
          eventCallback: (ev: any) => {
            if (ev?.name === 'checkout.completed') {
              window.dispatchEvent(new CustomEvent('hpdb-checkout-completed'));
            }
          },
        });
        resolve(window.Paddle);
      } catch (e) { reject(e); }
    };
    s.onerror = () => reject(new Error('paddle-load-failed'));
    document.head.appendChild(s);
  });
  return loader;
}

/**
 * Open the Paddle overlay checkout for a plan/term. The free period is the
 * IN-APP signup trial (no payment method) — Paddle prices carry NO trial, so
 * checkout charges immediately (program change 2026-07-27). customData lets
 * the billing webhook attach the subscription to the Firebase account (and
 * the team org) regardless of the email used at checkout.
 */
const COUPON_KEY = 'hpdb-coupon';

/** Stash a campaign link's ?coupon=CODE for the (possibly later) checkout. */
export function captureCouponFromUrl(): void {
  try {
    const code = new URLSearchParams(window.location.search).get('coupon');
    if (code && /^[a-zA-Z0-9]{1,32}$/.test(code)) sessionStorage.setItem(COUPON_KEY, code.toUpperCase());
  } catch { /* storage unavailable — the checkout field still works */ }
}

function pendingCouponCode(): string | null {
  try { return sessionStorage.getItem(COUPON_KEY); } catch { return null; }
}

export async function openCheckout(user: User, plan: SubPlanCode, term: BillingTerm): Promise<void> {
  if (!checkoutConfigured(plan, term)) throw new Error('paddle-not-configured');
  const paddle = await loadPaddle(user);
  // Marketing coupons (owner program 2026-08-03): the overlay shows Paddle's
  // own discount-code field, and a code carried in from a campaign link
  // (?coupon=CODE, stashed at app start) is pre-applied. Paddle alone
  // validates codes and computes prices — the app never does.
  const coupon = pendingCouponCode();
  paddle.Checkout.open({
    items: [{ priceId: paddlePriceId(plan, term), quantity: 1 }],
    customer: user.email ? { email: user.email } : undefined,
    ...(coupon ? { discountCode: coupon } : {}),
    customData: {
      userId: user.id, planCode: plan, billingTerm: term,
      country: user.country ?? '', orgId: user.orgId ?? '',
    },
    settings: { displayMode: 'overlay', theme: 'dark', showAddDiscounts: true },
  });
}

/**
 * Paddle's hosted customer portal (cancel / payment method / invoices).
 * The per-customer portal URL is minted server-side from the Paddle API and
 * stored on the profile by the billing webhook; absent → not yet available.
 */
export function portalUrlFor(user: User): string | null {
  return user.paddlePortalUrl ?? null;
}
