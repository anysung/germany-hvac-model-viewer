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
