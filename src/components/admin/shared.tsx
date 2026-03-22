/**
 * Shared admin UI components — badges, cards, tables, and utility components
 * reused across all admin pages.
 */
import React from 'react';
import { PlanCode, PLANS, UserStatus, USER_STATUS_OPTIONS } from '../../config/adminConfig';
import { Language } from '../../types';

// ── Status Badge ──────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  pending:            { bg: 'bg-yellow-100', text: 'text-yellow-800', border: 'border-yellow-200' },
  active:             { bg: 'bg-green-100',  text: 'text-green-800',  border: 'border-green-200' },
  suspended:          { bg: 'bg-orange-100', text: 'text-orange-800', border: 'border-orange-200' },
  rejected:           { bg: 'bg-red-100',    text: 'text-red-800',    border: 'border-red-200' },
  deletion_requested: { bg: 'bg-red-50',     text: 'text-red-700',    border: 'border-red-200' },
  deleted:            { bg: 'bg-gray-100',   text: 'text-gray-600',   border: 'border-gray-200' },
  archived:           { bg: 'bg-slate-100',  text: 'text-slate-600',  border: 'border-slate-200' },
};

export const StatusBadge: React.FC<{ status?: string; isActive?: boolean }> = ({ status, isActive }) => {
  const resolved = status || (isActive ? 'active' : 'suspended');
  const label = USER_STATUS_OPTIONS.find(o => o.value === resolved)?.label || resolved;
  const colors = STATUS_COLORS[resolved] ?? STATUS_COLORS.suspended;
  return (
    <span className={`px-2 py-0.5 text-xs font-semibold rounded-full whitespace-nowrap border ${colors.bg} ${colors.text} ${colors.border}`}>
      {label}
    </span>
  );
};

// ── Plan Badge ────────────────────────────────────────────────────────

export const PlanBadge: React.FC<{ plan?: PlanCode }> = ({ plan }) => {
  const p = plan || 'standard';
  const isPremium = p === 'premium';
  return (
    <span className={`px-2 py-0.5 text-xs font-bold rounded-full whitespace-nowrap border ${
      isPremium
        ? 'bg-purple-100 text-purple-800 border-purple-200'
        : 'bg-gray-100 text-gray-700 border-gray-200'
    }`}>
      {isPremium ? '💎 Premium' : 'Standard'}
    </span>
  );
};

// ── Action Badge (for logs) ───────────────────────────────────────────

const ACTION_COLORS: Record<string, string> = {
  LOGIN: 'bg-blue-100 text-blue-700',
  LOGOUT: 'bg-gray-100 text-gray-600',
  REGISTER_PENDING: 'bg-yellow-100 text-yellow-700',
  APPROVE_USER: 'bg-green-100 text-green-700',
  REJECT_USER: 'bg-red-100 text-red-700',
  SUSPEND_USER: 'bg-orange-100 text-orange-700',
  REACTIVATE_USER: 'bg-teal-100 text-teal-700',
  DELETE_USER: 'bg-red-100 text-red-800',
  DELETION_REQUESTED: 'bg-red-50 text-red-600',
  DELETION_COMPLETED: 'bg-gray-100 text-gray-700',
  PASS_CHANGE: 'bg-indigo-100 text-indigo-700',
  PLAN_CHANGE: 'bg-purple-100 text-purple-700',
  QUOTA_GRANT: 'bg-blue-100 text-blue-700',
  QUOTA_RESTORE: 'bg-cyan-100 text-cyan-700',
  ENTITLEMENT_OVERRIDE: 'bg-violet-100 text-violet-700',
  BILLING_SYNC: 'bg-emerald-100 text-emerald-700',
  DATA_PIPELINE_RUN: 'bg-sky-100 text-sky-700',
  DATA_PIPELINE_ERROR: 'bg-red-100 text-red-700',
  SYSTEM: 'bg-gray-100 text-gray-500',
};

export const ActionBadge: React.FC<{ action: string }> = ({ action }) => {
  const cls = ACTION_COLORS[action] ?? 'bg-gray-100 text-gray-500';
  return <span className={`px-2 py-0.5 text-xs font-bold rounded ${cls}`}>{action}</span>;
};

// ── Stat Card ─────────────────────────────────────────────────────────

export const StatCard: React.FC<{
  label: string;
  value: number | string;
  color?: string;
  icon?: string;
  subtitle?: string;
}> = ({ label, value, color = 'blue', icon, subtitle }) => (
  <div className={`bg-white p-4 rounded-lg shadow-sm border-l-4 border-${color}-500 border border-gray-100`}>
    <div className="flex items-center justify-between">
      <div>
        <div className="text-gray-500 text-xs uppercase font-medium mb-1">{label}</div>
        <div className="text-2xl font-bold text-gray-800">{value}</div>
        {subtitle && <div className="text-xs text-gray-400 mt-0.5">{subtitle}</div>}
      </div>
      {icon && <span className="text-2xl opacity-60">{icon}</span>}
    </div>
  </div>
);

// ── Section Card ──────────────────────────────────────────────────────

export const SectionCard: React.FC<{
  title: string;
  icon?: string;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}> = ({ title, icon, children, className = '', action }) => (
  <div className={`bg-white rounded-lg shadow-sm border border-gray-200 ${className}`}>
    <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
      <h3 className="text-sm font-bold text-gray-700 flex items-center gap-2">
        {icon && <span>{icon}</span>}
        {title}
      </h3>
      {action}
    </div>
    <div className="p-5">{children}</div>
  </div>
);

// ── Empty State ───────────────────────────────────────────────────────

export const EmptyState: React.FC<{ icon?: string; message: string; sub?: string }> = ({ icon = '📭', message, sub }) => (
  <div className="text-center py-12">
    <div className="text-4xl mb-2">{icon}</div>
    <div className="text-gray-500 text-sm font-medium">{message}</div>
    {sub && <div className="text-gray-400 text-xs mt-1">{sub}</div>}
  </div>
);

// ── Scaffold Notice ───────────────────────────────────────────────────
// For pages that are scaffolded but not fully integrated yet.

export const ScaffoldNotice: React.FC<{ feature: string }> = ({ feature }) => (
  <div className="mb-4 flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
    <span className="text-lg">🚧</span>
    <div>
      <strong>{feature}</strong> — This section is scaffolded for future integration.
      Backend connectivity will be added in a subsequent phase.
    </div>
  </div>
);

// ── Page Header ───────────────────────────────────────────────────────

export const PageHeader: React.FC<{ title: string; subtitle?: string; action?: React.ReactNode }> = ({ title, subtitle, action }) => (
  <div className="mb-6 flex items-start justify-between">
    <div>
      <h2 className="text-2xl font-bold text-gray-800">{title}</h2>
      {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
    </div>
    {action}
  </div>
);
