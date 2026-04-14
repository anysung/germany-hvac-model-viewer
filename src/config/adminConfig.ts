/**
 * Admin Configuration — centralized plan definitions, entitlement rules,
 * quota policies, and admin constants.
 *
 * All plan/entitlement business logic lives here.
 * UI and services import from this single source of truth.
 */

// ── Plan Definitions ──────────────────────────────────────────────────

export type PlanCode = 'standard' | 'premium';

export interface PlanDefinition {
  code: PlanCode;
  displayName: string;
  displayNameDe: string;
  dataSheetMonthlyLimit: number;
  industryInsightAccess: boolean;
  active: boolean;
  sortOrder: number;
}

export const PLANS: Record<PlanCode, PlanDefinition> = {
  standard: {
    code: 'standard',
    displayName: 'Standard',
    displayNameDe: 'Standard',
    dataSheetMonthlyLimit: 20,
    industryInsightAccess: false,
    active: true,
    sortOrder: 1,
  },
  premium: {
    code: 'premium',
    displayName: 'Premium',
    displayNameDe: 'Premium',
    dataSheetMonthlyLimit: 100,
    industryInsightAccess: true,
    active: true,
    sortOrder: 2,
  },
};

/** Get the base monthly quota for a plan */
export function getBaseQuotaForPlan(plan: PlanCode): number {
  return PLANS[plan]?.dataSheetMonthlyLimit ?? PLANS.standard.dataSheetMonthlyLimit;
}

/** Check if a plan grants Industry Insight access */
export function hasIndustryInsightAccess(plan: PlanCode): boolean {
  return PLANS[plan]?.industryInsightAccess ?? false;
}

// ── User Status Lifecycle ─────────────────────────────────────────────

export type UserStatus = 'pending' | 'active' | 'rejected' | 'suspended' | 'disabled' | 'deletion_requested' | 'deleted' | 'archived';

export const USER_STATUS_OPTIONS: { value: UserStatus; label: string; labelDe: string; color: string }[] = [
  { value: 'pending',            label: 'Pending',            labelDe: 'Ausstehend',        color: 'yellow' },
  { value: 'active',             label: 'Active',             labelDe: 'Aktiv',             color: 'green' },
  { value: 'rejected',           label: 'Rejected',           labelDe: 'Abgelehnt',         color: 'red' },
  { value: 'suspended',          label: 'Suspended',          labelDe: 'Gesperrt',          color: 'orange' },
  { value: 'disabled',           label: 'Disabled',           labelDe: 'Deaktiviert',       color: 'red' },
  { value: 'deletion_requested', label: 'Deletion Requested', labelDe: 'Löschung angefragt', color: 'red' },
  { value: 'deleted',            label: 'Deleted',            labelDe: 'Gelöscht',          color: 'gray' },
  { value: 'archived',           label: 'Archived',           labelDe: 'Archiviert',        color: 'slate' },
];

// ── User Roles ────────────────────────────────────────────────────────
// All possible values for User.role.
// 'user' = standard app member (default for registration).
// 'owner' = full admin access (currently hardcoded to OWNER_EMAIL).
// 'admin', 'support', 'ops' = future admin roles (defined but not yet enforced).

export type UserRole = 'user' | 'owner' | 'admin' | 'support' | 'ops';

/** Roles that grant access to the Admin area. */
export const ADMIN_ACCESS_ROLES: UserRole[] = ['owner', 'admin', 'support', 'ops'];

export const USER_ROLES: { value: UserRole; label: string; isAdmin: boolean }[] = [
  { value: 'user',    label: 'User',       isAdmin: false },
  { value: 'owner',   label: 'Owner',      isAdmin: true },
  { value: 'admin',   label: 'Admin',      isAdmin: true },
  { value: 'support', label: 'Support',    isAdmin: true },
  { value: 'ops',     label: 'Operations', isAdmin: true },
];

// ── Entitlement Sources ───────────────────────────────────────────────

export type EntitlementSource = 'plan' | 'admin_override' | 'promo' | 'system';

// ── Billing Channels ──────────────────────────────────────────────────

export type BillingChannel = 'apple' | 'google' | 'direct' | 'admin_grant' | 'trial';

export const BILLING_CHANNELS: { value: BillingChannel; label: string }[] = [
  { value: 'apple',       label: 'Apple App Store' },
  { value: 'google',      label: 'Google Play' },
  { value: 'direct',      label: 'Direct (Stripe)' },
  { value: 'admin_grant', label: 'Admin Grant' },
  { value: 'trial',       label: 'Trial' },
];

// ── Audit Action Types ────────────────────────────────────────────────

export const AUDIT_ACTIONS = [
  'LOGIN', 'LOGOUT', 'REGISTER_PENDING',
  'APPROVE_USER', 'REJECT_USER', 'SUSPEND_USER', 'REACTIVATE_USER',
  'DELETE_USER', 'DELETION_REQUESTED', 'DELETION_COMPLETED',
  'PASS_CHANGE',
  'PLAN_CHANGE', 'QUOTA_GRANT', 'QUOTA_RESTORE',
  'ENTITLEMENT_OVERRIDE', 'BILLING_SYNC',
  'DATA_PIPELINE_RUN', 'DATA_PIPELINE_ERROR',
  'SYSTEM',
] as const;

export type AuditAction = typeof AUDIT_ACTIONS[number];

// ── Data Pipeline Types ───────────────────────────────────────────────

export type PipelineType = 'product' | 'news' | 'industry_insight';

export interface PipelineStatus {
  type: PipelineType;
  displayName: string;
  lastRun: string | null;
  nextRun: string | null;
  status: 'idle' | 'running' | 'success' | 'error';
  recordsProcessed: number;
  recordsAdded: number;
  recordsUpdated: number;
  errorCount: number;
  estimatedCostUsd: number | null;
  triggerSource: 'scheduler' | 'manual' | 'webhook';
}

// ── Admin Menu Structure ──────────────────────────────────────────────

export type AdminPage =
  | 'overview'
  | 'members'
  | 'plans'
  | 'billing'
  | 'usage'
  | 'compliance'
  | 'data_ops'
  | 'audit'
  | 'analytics'
  | 'settings';

export interface AdminMenuItem {
  key: AdminPage;
  icon: string;
  labelEn: string;
  labelDe: string;
  /** Show notification badge count (e.g. pending approvals) */
  getBadge?: (ctx: { pendingUsers: number; deletionRequests: number }) => number;
}

export const ADMIN_MENU: AdminMenuItem[] = [
  { key: 'overview',   icon: '📊', labelEn: 'Overview',              labelDe: 'Übersicht' },
  { key: 'members',    icon: '👥', labelEn: 'Members',               labelDe: 'Mitglieder',
    getBadge: ctx => ctx.pendingUsers },
  { key: 'plans',      icon: '💎', labelEn: 'Plans & Entitlements',  labelDe: 'Pläne & Berechtigungen' },
  { key: 'billing',    icon: '💳', labelEn: 'Billing & Store Sync',  labelDe: 'Abrechnung & Store-Sync' },
  { key: 'usage',      icon: '📈', labelEn: 'Usage & Quotas',        labelDe: 'Nutzung & Kontingente' },
  { key: 'compliance', icon: '🛡️', labelEn: 'Access & Compliance',  labelDe: 'Zugang & Compliance',
    getBadge: ctx => ctx.deletionRequests },
  { key: 'data_ops',   icon: '🔧', labelEn: 'Data Operations',       labelDe: 'Datenoperationen' },
  { key: 'audit',      icon: '📋', labelEn: 'Audit Logs',            labelDe: 'Audit-Protokolle' },
  { key: 'analytics',  icon: '📉', labelEn: 'Analytics',             labelDe: 'Analytik' },
  { key: 'settings',   icon: '⚙️', labelEn: 'Settings',              labelDe: 'Einstellungen' },
];

