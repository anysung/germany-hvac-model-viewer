/**
 * Admin Configuration — centralized plan definitions, entitlement rules
 * and admin constants. (Print quotas were removed 2026-07-12 — data-sheet
 * printing is unlimited for all members.)
 *
 * All plan/entitlement business logic lives here.
 * UI and services import from this single source of truth.
 */

// ── Plan Definitions ──────────────────────────────────────────────────

export type PlanCode = 'standard' | 'premium';

export interface PlanDefinition {
  code: PlanCode;
  displayName: string;
  industryInsightAccess: boolean;
  active: boolean;
  sortOrder: number;
}

export const PLANS: Record<PlanCode, PlanDefinition> = {
  standard: {
    code: 'standard',
    displayName: 'Standard',
    industryInsightAccess: false,
    active: true,
    sortOrder: 1,
  },
  premium: {
    code: 'premium',
    displayName: 'Premium',
    industryInsightAccess: true,
    active: true,
    sortOrder: 2,
  },
};

/** Check if a plan grants Industry Insight access */
export function hasIndustryInsightAccess(plan: PlanCode): boolean {
  return PLANS[plan]?.industryInsightAccess ?? false;
}

// ── User Status Lifecycle ─────────────────────────────────────────────

export type UserStatus = 'pending' | 'active' | 'rejected' | 'suspended' | 'disabled' | 'deletion_requested' | 'deleted' | 'archived';

export const USER_STATUS_OPTIONS: { value: UserStatus; label: string; color: string }[] = [
  { value: 'pending',            label: 'Pending',                   color: 'yellow' },
  { value: 'active',             label: 'Active',                         color: 'green' },
  { value: 'rejected',           label: 'Rejected',                   color: 'red' },
  { value: 'suspended',          label: 'Suspended',                   color: 'orange' },
  { value: 'disabled',           label: 'Disabled',                 color: 'red' },
  { value: 'deletion_requested', label: 'Deletion Requested', color: 'red' },
  { value: 'deleted',            label: 'Deleted',                     color: 'gray' },
  { value: 'archived',           label: 'Archived',                  color: 'slate' },
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

// Console layout (2026-07): the unified dashboard ('overview') shows all
// markets + action alerts; the actual member/support WORK happens in the
// per-market workspaces ('market:<CC>'). Global cross-market pages remain
// for billing, usage, data and audit. Labels live in adminI18n (EN/KO).
export type AdminPage =
  | 'overview'
  | `market:${string}`
  | 'billing'
  | 'inbox'
  | 'members'
  | 'data'
  | 'marketing'
  | 'audit';

export interface AdminMenuItem {
  key: AdminPage;
  icon: string;
  /** adminI18n key for the label. */
  labelKey: 'menuOverview' | 'menuBilling' | 'menuInbox' | 'menuMembers' | 'menuData' | 'menuMarketing' | 'menuAudit';
  /** Show notification badge count (e.g. pending approvals) */
  getBadge?: (ctx: { pendingUsers: number; deletionRequests: number; openTickets: number; billingAlerts: number }) => number;
}

/** Global (cross-market) menu — the market workspaces are rendered as their own section. */
export const ADMIN_MENU: AdminMenuItem[] = [
  { key: 'overview',   icon: '📊', labelKey: 'menuOverview' },
  { key: 'billing',    icon: '💳', labelKey: 'menuBilling',
    getBadge: ctx => ctx.billingAlerts },
  { key: 'inbox',      icon: '📬', labelKey: 'menuInbox',
    getBadge: ctx => ctx.openTickets },
  { key: 'members',    icon: '👥', labelKey: 'menuMembers',
    getBadge: ctx => ctx.pendingUsers + ctx.deletionRequests },
  { key: 'data',       icon: '🗄️', labelKey: 'menuData' },
  { key: 'marketing',  icon: '📣', labelKey: 'menuMarketing' },
  { key: 'audit',      icon: '📋', labelKey: 'menuAudit' },
];

