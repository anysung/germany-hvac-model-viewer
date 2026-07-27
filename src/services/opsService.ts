/**
 * opsService — owner-only dataset operations (Panic Button backend bridge).
 * docs/DATASET_ROLLBACK_AND_PANIC.md. Server-side authority: the accountBilling
 * function verifies the OWNER token (custom claim / verified owner email) on
 * every call — this client is transport only.
 */
import { auth } from '../firebase';
import { PUBLIC_ENV } from '../config/env';

// The admin console must reach the ops endpoints even when the billing-flow
// switch (VITE_BILLING_FN_URL) is not set for a build: the function URL is
// stable and public (auth happens per-request), so a fixed fallback is safe.
const OPS_FN_URL = PUBLIC_ENV.BILLING_FN_URL
  || 'https://europe-west1-gen-lang-client-0324244302.cloudfunctions.net/accountBilling';

export interface LiveObject { path: string; md5: string; size: number; updated: string; contentEncoding: string }
export interface RollbackStatus {
  ok: boolean;
  error?: string;
  live?: LiveObject[];
  snapshots?: string[];
  lock?: { by: string; snapshotId: string; startedAt: string; expiresAtMs: number } | null;
}
export interface RollbackResult {
  ok: boolean;
  error?: string;
  restored?: { path: string; items: number }[];
}

async function call<T>(path: string, body: Record<string, unknown> = {}): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new Error('unauthenticated');
  const token = await user.getIdToken();
  const res = await fetch(`${OPS_FN_URL}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  // Failures carry proper HTTP codes (400 invalid snapshot / 409 in-progress /
  // 500 restore failure) WITH a JSON body — surface the server's error text.
  const payload = await res.json().catch(() => null);
  if (!res.ok) return (payload ?? { ok: false, error: `ops-${res.status}` }) as T;
  return payload as T;
}

export const fetchRollbackStatus = (): Promise<RollbackStatus> => call('rollbackStatus');

/** Restore a COMPLETE snapshot set to live. `confirm` must be 'ROLLBACK'. */
export const executePanicRollback = (snapshotId: string, confirm: string): Promise<RollbackResult> =>
  call('panicRollback', { snapshotId, confirm });
