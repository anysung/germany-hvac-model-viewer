/**
 * billingFnService — client bridge to the account/billing Cloud Function
 * (google_cloud_function_billing/). All calls carry the Firebase ID token;
 * the SERVER makes every decision (email verification against the Auth
 * record, trial grant, registry, deletion) — these wrappers only transport.
 *
 * TRIAL_FLOW_ENABLED is the launch switch: without VITE_BILLING_FN_URL the
 * app behaves exactly as before (pending profiles + admin approval), so the
 * new flow can ship dark and be turned on per build once the function and
 * the Paddle webhook are verified (plan P7).
 */
import { auth } from '../firebase';
import { PUBLIC_ENV } from '../config/env';
import { TERMS_VERSION, PRIVACY_VERSION, DATA_USE_VERSION } from '../config/legal';

export const TRIAL_FLOW_ENABLED = !!PUBLIC_ENV.BILLING_FN_URL;

export interface FinalizeResult {
  ok: boolean;
  error?: string;            // 'email-not-verified' | 'no-profile' | 'account-closed' | ...
  activated?: boolean;
  alreadyActive?: boolean;
  trial?: boolean;
  trialDays?: number;
}

async function call<T>(path: string, body: Record<string, unknown> = {}): Promise<T> {
  if (!TRIAL_FLOW_ENABLED) throw new Error('billing-fn-not-configured');
  const user = auth.currentUser;
  if (!user) throw new Error('unauthenticated');
  const token = await user.getIdToken();
  const res = await fetch(`${PUBLIC_ENV.BILLING_FN_URL}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`billing-fn-${res.status}`);
  return res.json() as Promise<T>;
}

/** Mint a Paddle customer-portal session (payment method, invoices,
 *  period-end cancellation). URL is temporary — fetched on every click. */
export const billingPortalFn = (): Promise<{ ok: boolean; url?: string; error?: string }> =>
  call('billingPortal');

/** User's own IMMEDIATE cancellation (the UI has taken the double warning).
 *  Paddle is called server-side; the webhook writes the final state. */
export const cancelSubscriptionFn = (): Promise<{ ok: boolean; error?: string }> =>
  call('cancelSubscription');

/** Admin: apply an approved upgrade request via the Paddle API (upgrade-only,
 *  do_not_bill — effective now, billed from the next renewal). */
export const applyPlanChangeFn = (requestId: string): Promise<{ ok: boolean; error?: string }> =>
  call('applyPlanChange', { requestId });

/** Admin: create a REAL Paddle discount; returns its id + code. */
export const createDiscountFn = (payload: {
  description: string; type: 'percentage' | 'flat'; amount: string;
  code?: string; enabledForCheckout?: boolean; recur?: boolean;
  maxRecurringIntervals?: number; expiresAt?: string; usageLimit?: number;
  restrictToPlans?: string[];
}): Promise<{ ok: boolean; discount?: { id: string; code: string | null; status: string }; error?: string }> =>
  call('createDiscount', payload);

/** Admin: archive a Paddle discount (no further redemptions). */
export const archiveDiscountFn = (discountId: string): Promise<{ ok: boolean; error?: string }> =>
  call('archiveDiscount', { discountId });

/**
 * Verification mail on OUR letterhead (logo, market language, support@ reply)
 * instead of the Firebase default, whose subject carries the raw project id.
 * The server generates the same oobCode Firebase would have sent, so the
 * verification itself is unchanged — only the envelope.
 *
 * The RETURN URL is not passed: the function derives it from the Origin it is
 * called from, checked against its own allowlist. A verification link is
 * clicked without being read, so the client does not get to aim it.
 *
 * Never let a failure here block a signup — every caller falls back to
 * Firebase’s own mail (see authService).
 */
export const sendVerificationEmailFn = (lang: string): Promise<{ ok: boolean; error?: string; retryAfter?: number }> =>
  call('sendVerificationEmail', { lang });

/** Activate the account (server checks Auth email verification + consents). */
export const finalizeSignupFn = (): Promise<FinalizeResult> =>
  call<FinalizeResult>('finalizeSignup', {
    termsVersion: TERMS_VERSION,
    privacyVersion: PRIVACY_VERSION,
    dataUseVersion: DATA_USE_VERSION,
  });

/** Start a trialing team (window anchored to the caller — the team admin). */
export const createTeamOrgFn = (planCode: 'team_3' | 'team_5'): Promise<{ ok: boolean; orgId?: string; error?: string }> =>
  call('createTeamOrg', { planCode });

/** Server-side account deletion (Firestore tx + Auth removal; retryable). */
export const deleteAccountFn = (): Promise<{ ok: boolean; error?: string }> =>
  call('deleteAccount');
