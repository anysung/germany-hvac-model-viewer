/**
 * Quota Service — per-account monthly print quota for Data Sheets.
 *
 * Firestore collection: `printQuotas`
 * Document ID: `{userId}_{YYYY-MM}` (e.g. "abc123_2026-03")
 *
 * Quota is consumed on Print click (not Preview).
 * Default monthly limit: 10 prints.
 * Admins can grant extra quota per user via `extraPrintQuota` on the user doc.
 */

import { doc, getDoc, setDoc, updateDoc, increment } from 'firebase/firestore';
import { db } from '../firebase';

/** Default monthly print allowance */
export const DEFAULT_MONTHLY_QUOTA = 10;

/** Firestore document shape for monthly quota tracking */
export interface PrintQuotaDoc {
  userId: string;
  month: string;        // "YYYY-MM"
  used: number;
  createdAt: string;    // ISO timestamp
  updatedAt: string;    // ISO timestamp
}

/** Get current month key in YYYY-MM format */
function currentMonthKey(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/** Build the Firestore document ID for a user + month */
function quotaDocId(userId: string, month?: string): string {
  return `${userId}_${month || currentMonthKey()}`;
}

/**
 * Get the current quota usage and limit for a user.
 * Reads the user doc for extraPrintQuota and the monthly quota doc for usage.
 */
export async function getQuotaStatus(userId: string): Promise<{
  used: number;
  limit: number;
  remaining: number;
  month: string;
}> {
  const month = currentMonthKey();

  // Read extra quota from user doc
  let extraQuota = 0;
  try {
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (userDoc.exists()) {
      extraQuota = userDoc.data().extraPrintQuota || 0;
    }
  } catch {
    // If user doc read fails, proceed with default
  }

  const totalLimit = DEFAULT_MONTHLY_QUOTA + extraQuota;

  // Read monthly usage
  let used = 0;
  try {
    const quotaDoc = await getDoc(doc(db, 'printQuotas', quotaDocId(userId, month)));
    if (quotaDoc.exists()) {
      used = quotaDoc.data().used || 0;
    }
  } catch {
    // If quota doc doesn't exist yet, used = 0
  }

  return {
    used,
    limit: totalLimit,
    remaining: Math.max(0, totalLimit - used),
    month,
  };
}

/**
 * Consume one print quota unit. Returns true if allowed, false if exhausted.
 * Creates the monthly doc if it doesn't exist yet.
 */
export async function consumePrintQuota(userId: string): Promise<boolean> {
  const status = await getQuotaStatus(userId);
  if (status.remaining <= 0) return false;

  const month = currentMonthKey();
  const docRef = doc(db, 'printQuotas', quotaDocId(userId, month));
  const now = new Date().toISOString();

  try {
    const existing = await getDoc(docRef);
    if (existing.exists()) {
      await updateDoc(docRef, {
        used: increment(1),
        updatedAt: now,
      });
    } else {
      await setDoc(docRef, {
        userId,
        month,
        used: 1,
        createdAt: now,
        updatedAt: now,
      });
    }
    return true;
  } catch (err) {
    console.error('Failed to consume print quota:', err);
    return false;
  }
}

/**
 * Admin: set extra monthly print quota for a user.
 * This is stored on the user document as `extraPrintQuota`.
 */
export async function setExtraPrintQuota(userId: string, extra: number): Promise<void> {
  await updateDoc(doc(db, 'users', userId), {
    extraPrintQuota: Math.max(0, Math.floor(extra)),
  });
}

/**
 * Admin: get current quota info for a specific user (for admin display).
 */
export async function getAdminQuotaInfo(userId: string): Promise<{
  used: number;
  defaultLimit: number;
  extraQuota: number;
  totalLimit: number;
  remaining: number;
  month: string;
}> {
  const month = currentMonthKey();

  let extraQuota = 0;
  try {
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (userDoc.exists()) {
      extraQuota = userDoc.data().extraPrintQuota || 0;
    }
  } catch { /* proceed with 0 */ }

  const totalLimit = DEFAULT_MONTHLY_QUOTA + extraQuota;

  let used = 0;
  try {
    const quotaDoc = await getDoc(doc(db, 'printQuotas', quotaDocId(userId, month)));
    if (quotaDoc.exists()) {
      used = quotaDoc.data().used || 0;
    }
  } catch { /* proceed with 0 */ }

  return {
    used,
    defaultLimit: DEFAULT_MONTHLY_QUOTA,
    extraQuota,
    totalLimit,
    remaining: Math.max(0, totalLimit - used),
    month,
  };
}
