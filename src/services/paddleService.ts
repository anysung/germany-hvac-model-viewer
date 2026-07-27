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
import { hasPriceCatalogue } from '../config/paddlePrices';
import { User } from '../types';

declare global {
  // Paddle.js v2 global (loaded on demand from Paddle's CDN).
  interface Window { Paddle?: any }
}

/** True once ANY checkout can open (client token + a price catalogue for this market's currency). */
export const paddleConfigured = !!PUBLIC_ENV.PADDLE_CLIENT_TOKEN && hasPriceCatalogue;

export { checkoutConfigured };

let loader: Promise<any> | null = null;

/** Load + initialize Paddle.js v2 once. Rejects if unconfigured or blocked. */
function loadPaddle(): Promise<any> {
  if (!PUBLIC_ENV.PADDLE_CLIENT_TOKEN) return Promise.reject(new Error('paddle-not-configured'));
  if (window.Paddle) return Promise.resolve(window.Paddle);
  if (loader) return loader;
  loader = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.paddle.com/paddle/v2/paddle.js';
    s.async = true;
    s.onload = () => {
      try {
        if (PUBLIC_ENV.PADDLE_CLIENT_TOKEN.startsWith('test_')) {
          window.Paddle.Environment.set('sandbox');
        }
        window.Paddle.Initialize({ token: PUBLIC_ENV.PADDLE_CLIENT_TOKEN });
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
export async function openCheckout(user: User, plan: SubPlanCode, term: BillingTerm): Promise<void> {
  if (!checkoutConfigured(plan, term)) throw new Error('paddle-not-configured');
  const paddle = await loadPaddle();
  paddle.Checkout.open({
    items: [{ priceId: paddlePriceId(plan, term), quantity: 1 }],
    customer: user.email ? { email: user.email } : undefined,
    customData: {
      userId: user.id, planCode: plan, billingTerm: term,
      country: user.country ?? '', orgId: user.orgId ?? '',
    },
    settings: { displayMode: 'overlay', theme: 'dark' },
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
