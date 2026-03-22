/**
 * Admin Service — centralized admin operations for plan management,
 * compliance, and enhanced audit logging.
 *
 * Extends authService (user CRUD) and quotaService (quota tracking)
 * with plan-aware operations and richer audit trails.
 */

import { doc, updateDoc, getDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { logActivity } from './authService';
import { User } from '../types';
import { PlanCode, getBaseQuotaForPlan, hasIndustryInsightAccess } from '../config/adminConfig';

// ── Plan Management ───────────────────────────────────────────────────

/** Change a user's plan and update their entitlements accordingly */
export async function changeUserPlan(
  userId: string,
  newPlan: PlanCode,
  adminName = 'Admin'
): Promise<void> {
  const userRef = doc(db, 'users', userId);
  const userDoc = await getDoc(userRef);
  const oldPlan = userDoc.exists() ? (userDoc.data().plan || 'standard') : 'standard';

  await updateDoc(userRef, {
    plan: newPlan,
  });

  await logActivity(
    'ADMIN', 'PLAN_CHANGE',
    `Plan changed: ${oldPlan} → ${newPlan} for user ${userId}`,
    '', adminName
  );
}

/** Get effective entitlements for a user based on plan + overrides */
export function getEffectiveEntitlements(user: User): {
  plan: PlanCode;
  dataSheetMonthlyLimit: number;
  industryInsightAccess: boolean;
  extraQuota: number;
  effectiveQuota: number;
  entitlementSource: string;
} {
  const plan: PlanCode = (user.plan as PlanCode) || 'standard';
  const baseQuota = getBaseQuotaForPlan(plan);
  const extraQuota = user.extraPrintQuota || 0;
  const industryInsight = user.industryInsightOverride !== undefined
    ? user.industryInsightOverride
    : hasIndustryInsightAccess(plan);

  return {
    plan,
    dataSheetMonthlyLimit: baseQuota,
    industryInsightAccess: industryInsight,
    extraQuota,
    effectiveQuota: baseQuota + extraQuota,
    entitlementSource: user.industryInsightOverride !== undefined ? 'admin_override' : 'plan',
  };
}

// ── Compliance Operations ─────────────────────────────────────────────

/** Request account deletion (sets status, does not delete immediately) */
export async function requestDeletion(
  userId: string,
  note: string,
  adminName = 'Admin'
): Promise<void> {
  await updateDoc(doc(db, 'users', userId), {
    status: 'deletion_requested',
    isActive: false,
    deletionRequestedAt: new Date().toISOString(),
    deletionNote: note || '',
  });

  await logActivity(
    'ADMIN', 'DELETION_REQUESTED',
    `Deletion requested for user ${userId}: ${note}`,
    '', adminName
  );
}

/** Complete deletion — marks user as deleted (soft delete for audit trail) */
export async function completeDeletion(
  userId: string,
  adminName = 'Admin'
): Promise<void> {
  await updateDoc(doc(db, 'users', userId), {
    status: 'deleted',
    isActive: false,
  });

  await logActivity(
    'ADMIN', 'DELETION_COMPLETED',
    `Deletion completed for user ${userId}`,
    '', adminName
  );
}

/** Cancel a pending deletion request */
export async function cancelDeletion(
  userId: string,
  adminName = 'Admin'
): Promise<void> {
  await updateDoc(doc(db, 'users', userId), {
    status: 'active',
    isActive: true,
    deletionRequestedAt: '',
    deletionNote: '',
  });

  await logActivity(
    'ADMIN', 'REACTIVATE_USER',
    `Deletion request cancelled, user reactivated: ${userId}`,
    '', adminName
  );
}

// ── Admin Notes ───────────────────────────────────────────────────────

/** Add/update internal admin notes on a user */
export async function updateAdminNotes(
  userId: string,
  notes: string,
  adminName = 'Admin'
): Promise<void> {
  await updateDoc(doc(db, 'users', userId), {
    adminNotes: notes,
  });

  await logActivity(
    'ADMIN', 'SYSTEM',
    `Admin notes updated for user ${userId}`,
    '', adminName
  );
}

// ── Industry Insight Override ─────────────────────────────────────────

/** Override Industry Insight access for a specific user */
export async function setIndustryInsightOverride(
  userId: string,
  enabled: boolean | undefined, // undefined = follow plan default
  adminName = 'Admin'
): Promise<void> {
  const update: Record<string, any> = {};
  if (enabled === undefined) {
    // Remove override — will follow plan default
    update.industryInsightOverride = null;
  } else {
    update.industryInsightOverride = enabled;
  }

  await updateDoc(doc(db, 'users', userId), update);

  await logActivity(
    'ADMIN', 'ENTITLEMENT_OVERRIDE',
    `Industry Insight override set to ${enabled === undefined ? 'plan default' : enabled} for user ${userId}`,
    '', adminName
  );
}

// ── Quota Grant with Audit ────────────────────────────────────────────

/** Grant bonus quota with audit logging */
export async function grantBonusQuota(
  userId: string,
  extraQuota: number,
  adminName = 'Admin'
): Promise<void> {
  const userRef = doc(db, 'users', userId);
  const userDoc = await getDoc(userRef);
  const oldExtra = userDoc.exists() ? (userDoc.data().extraPrintQuota || 0) : 0;

  await updateDoc(userRef, {
    extraPrintQuota: Math.max(0, Math.floor(extraQuota)),
  });

  await logActivity(
    'ADMIN', 'QUOTA_GRANT',
    `Extra quota changed: ${oldExtra} → ${extraQuota} for user ${userId}`,
    '', adminName
  );
}

// ── User Stats Aggregation ────────────────────────────────────────────

export interface AdminStats {
  total: number;
  pending: number;
  active: number;
  rejected: number;
  suspended: number;
  deletionRequested: number;
  standard: number;
  premium: number;
  manufacturers: number;
  installers: number;
  distributors: number;
  privateIndividuals: number;
}

export function computeAdminStats(users: User[]): AdminStats {
  return {
    total: users.length,
    pending: users.filter(u => u.status === 'pending').length,
    active: users.filter(u => u.status === 'active' || (!u.status && u.isActive)).length,
    rejected: users.filter(u => u.status === 'rejected').length,
    suspended: users.filter(u => u.status === 'suspended').length,
    deletionRequested: users.filter(u => u.status === 'deletion_requested').length,
    standard: users.filter(u => !u.plan || u.plan === 'standard').length,
    premium: users.filter(u => u.plan === 'premium').length,
    manufacturers: users.filter(u => u.companyType === 'Manufacturer').length,
    installers: users.filter(u => u.companyType === 'Installer').length,
    distributors: users.filter(u => u.companyType === 'Distributor').length,
    privateIndividuals: users.filter(u => u.companyType === 'Private Individual').length,
  };
}
