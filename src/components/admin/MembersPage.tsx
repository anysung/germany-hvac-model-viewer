import React, { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { getUsers, approveUser, rejectUser, suspendUser, reactivateUser, disableUser, deleteUser } from '../../services/authService';
import { sendMemberEmail, listMemberEmails, previewMemberEmail, type SentMemberEmail } from '../../services/memberMailService';
import { MEMBER_EMAIL_TEMPLATES } from '../../config/memberEmailTemplates';
import { TRIAL_FLOW_ENABLED, adminFinalizeSignupFn } from '../../services/billingFnService';
import { requestDeletion, updateAdminNotes, setUserCountry } from '../../services/adminService';
import { adminClearSessions } from '../../services/opsService';
import { COUNTRY_PROFILES } from '../../config/countryProfiles';
import { createGrant, revokeGrant, emailKey } from '../../services/subscriptionService';
import { User } from '../../types';
import {
  SubPlanCode, BillingTerm, SUB_PLAN_CODES, BILLING_TERMS, SUB_PLAN_NAMES, TERM_NAMES, SUB_PLANS,
} from '../../config/subscriptionPlans';
import { StatusBadge, SubBadge, PageHeader, EmptyState } from './shared';
import { COMPANY_TYPES, normalizeCompanyType } from '../../config/companyTypes';
import { AdminLang, ADMIN_I18N } from './adminI18n';

/** English labels for the company-type codes (the admin console is EN | KO). */
const COMPANY_TYPE_LABELS: Record<string, string> = {
  manufacturer: 'Manufacturer',
  wholesaler: 'Wholesaler / Distributor',
  installer: 'Installer / HVAC Contractor',
  engineering: 'Engineering / Design / Consultancy',
  construction: 'Construction / Property Developer',
  esco_utility: 'Energy Service Company / Utility',
  housing: 'Housing Association / Property Management',
  public_research: 'Public Sector / Research / Industry Association',
  individual: 'Individual / Sole Trader',
  other: 'Other',
};

interface MembersPageProps {
  al: AdminLang;
  /** Restrict to one market (per-market workspace); omit for the global page. */
  country?: string;
  /** Rendered inside a market workspace — its own header is suppressed. */
  embedded?: boolean;
}

const matchesCountry = (u: User, cc?: string): boolean =>
  !cc || (u.country || 'DE') === cc;

export const MembersPage: React.FC<MembersPageProps> = ({ al, country, embedded }) => {
  const A = ADMIN_I18N[al];
  const [users, setUsers] = useState<User[]>([]);
  const [filtered, setFiltered] = useState<User[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [planFilter, setPlanFilter] = useState('all');
  const [companyTypeFilter, setCompanyTypeFilter] = useState('all');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [detailTab, setDetailTab] = useState<'profile' | 'subscription' | 'notes'>('profile');
  const [adminNotes, setAdminNotes] = useState('');
  const [notesSaved, setNotesSaved] = useState(false);

  const load = () => getUsers().then(u => setUsers(u.filter(x => matchesCountry(x, country))));
  useEffect(() => { load(); setSelectedUser(null); }, [country]);

  // Filtering
  useEffect(() => {
    let result = users;
    if (statusFilter !== 'all') {
      result = result.filter(u => (u.status || (u.isActive ? 'active' : 'suspended')) === statusFilter);
    }
    if (planFilter !== 'all') {
      if (planFilter === 'none') result = result.filter(u => !u.subscription);
      else result = result.filter(u => u.subscription?.planCode === planFilter);
    }
    if (companyTypeFilter !== 'all') {
      result = result.filter(u => normalizeCompanyType(u.companyType) === companyTypeFilter);
    }
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(u =>
        u.email.toLowerCase().includes(q) ||
        u.firstName.toLowerCase().includes(q) ||
        u.lastName.toLowerCase().includes(q) ||
        (u.companyName?.toLowerCase().includes(q))
      );
    }
    setFiltered(result);
  }, [search, statusFilter, planFilter, companyTypeFilter, users]);

  const pendingCount = users.filter(u => u.status === 'pending').length;

  const openDetail = (user: User) => {
    setSelectedUser(user);
    setDetailTab('profile');
    setAdminNotes(user.adminNotes || '');
    setNotesSaved(false);
  };

  const handleExport = () => {
    const rows = users.map(u => ({
      'First Name': u.firstName, 'Last Name': u.lastName,
      'Email': u.email, 'Country': u.country || 'DE',
      'Company Type': u.companyType, 'Type detail': u.companyTypeOther ?? '', 'Website': u.companyWebsite ?? '',
      'Company': u.companyName || '', 'City': u.companyCity || '',
      'Subscription': u.subscription ? `${SUB_PLAN_NAMES[u.subscription.planCode]} (${u.subscription.status})` : '-',
      'Term': u.subscription?.billingTerm ? TERM_NAMES[u.subscription.billingTerm] : '-',
      'Period End': u.subscription?.currentPeriodEndsAt?.slice(0, 10) || '-',
      'Trial Ends': (() => {
        const t = u.trialEndsAt as { seconds?: number } | string | undefined;
        const ms = t == null ? null : typeof t === 'string' ? Date.parse(t) : typeof t.seconds === 'number' ? t.seconds * 1000 : null;
        return ms ? new Date(ms).toISOString().slice(0, 10) : '-';
      })(),
      'Status': u.status || (u.isActive ? 'active' : 'disabled'),
      'Registered': u.registeredAt ? new Date(u.registeredAt).toLocaleDateString() : '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Members');
    XLSX.writeFile(wb, `members_${country ?? 'all'}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const handleAction = async (action: string, user: User) => {
    switch (action) {
      case 'approve':
        if (TRIAL_FLOW_ENABLED) {
          // The exception path runs the SAME server transaction as
          // self-service (trial, registry, consent stamp) — and the server
          // still refuses unverified email accounts. The old client-side
          // approve could not touch the one-trial-per-email ledger.
          try {
            const r = await adminFinalizeSignupFn(user.id);
            if (r.ok) alert(r.alreadyActive ? A.mbAlreadyActive : A.mbActivated(!!r.trial));
            else if (r.error === 'email-not-verified') { alert(A.mbNotVerified); return; }
            else { alert(A.mbActivateFailed(r.error ?? 'unknown')); return; }
          } catch (e) { alert(A.mbActivateFailed(String((e as Error).message ?? e))); return; }
        } else {
          await approveUser(user.id);
        }
        break;
      case 'reject': if (confirm(`Reject ${user.email}?`)) await rejectUser(user.id); else return; break;
      case 'suspend': if (confirm(`Suspend ${user.email}?`)) await suspendUser(user.id); else return; break;
      case 'disable': if (confirm(`Disable ${user.email}? They will be blocked from logging in.`)) await disableUser(user.id); else return; break;
      case 'reactivate': await reactivateUser(user.id); break;
      case 'delete': if (confirm(`Permanently delete ${user.email}? This cannot be undone.`)) await deleteUser(user.id); else return; break;
      case 'request_deletion': if (confirm(`Request deletion for ${user.email}?`)) await requestDeletion(user.id, 'Admin initiated'); else return; break;
    }
    load();
    if (selectedUser?.id === user.id) setSelectedUser(null);
  };

  return (
    <div className="flex flex-col h-full">
      {!embedded && (
        <PageHeader
          title={A.mbTitle}
          subtitle={`${filtered.length} ${A.mbOf} ${users.length}`}
          action={
            <button onClick={handleExport} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded shadow-sm text-sm font-bold flex items-center gap-2">
              📥 {A.mbExport}
            </button>
          }
        />
      )}

      {/* Pending notice */}
      {pendingCount > 0 && (
        <div className={`mb-4 flex items-center gap-3 border rounded-lg p-3 text-sm ${TRIAL_FLOW_ENABLED
          ? 'bg-blue-50 border-blue-200 text-blue-900'   // nothing to do — informational
          : 'bg-yellow-50 border-yellow-200 text-yellow-800'}`}>
          <span className="text-xl">{TRIAL_FLOW_ENABLED ? 'ℹ️' : '⚠️'}</span>
          <span>{TRIAL_FLOW_ENABLED ? A.mbVerifyNotice(pendingCount) : <strong>{A.mbPendingNotice(pendingCount)}</strong>}</span>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center bg-white p-4 rounded-lg shadow-sm border border-gray-200 mb-4">
        <div className="relative flex-grow min-w-[200px]">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
          <input
            type="text" placeholder={A.mbSearch}
            className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
            value={search} onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-2 border rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500">
          <option value="all">{A.mbAllStatus}</option>
          {['pending', 'active', 'suspended', 'rejected', 'disabled', 'deletion_requested'].map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select value={planFilter} onChange={e => setPlanFilter(e.target.value)}
          className="px-3 py-2 border rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500">
          <option value="all">{A.mbAllPlans}</option>
          {SUB_PLAN_CODES.map(p => <option key={p} value={p}>{SUB_PLAN_NAMES[p]}</option>)}
          <option value="none">{A.sbNone}</option>
        </select>
        <select value={companyTypeFilter} onChange={e => setCompanyTypeFilter(e.target.value)}
          className="px-3 py-2 border rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500">
          <option value="all">{A.mbAllTypes}</option>
          {COMPANY_TYPES.map(c => <option key={c} value={c}>{COMPANY_TYPE_LABELS[c]}</option>)}
        </select>
        {embedded && (
          <button onClick={handleExport} className="bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded shadow-sm text-sm font-bold">
            📥 {A.mbExport}
          </button>
        )}
      </div>

      <div className="flex gap-4 flex-grow min-h-0">
        {/* Member table */}
        <div className={`bg-white rounded-lg shadow border border-gray-200 overflow-hidden flex flex-col ${selectedUser ? 'flex-grow' : 'w-full'}`}>
          <div className="overflow-auto flex-grow">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  {['User', country ? '' : 'Market', 'Company', 'Subscription', 'Status', 'Registered', 'Actions'].filter(Boolean).map(h => (
                    <th key={h} className={`px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap ${h === 'Actions' ? 'text-right' : ''}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filtered.map(u => {
                  const userStatus = u.status || (u.isActive ? 'active' : 'suspended');
                  return (
                    <tr key={u.id}
                      className={`hover:bg-blue-50 transition-colors cursor-pointer ${userStatus === 'pending' ? 'bg-yellow-50/50' : ''} ${selectedUser?.id === u.id ? 'bg-blue-50' : ''}`}
                      onClick={() => openDetail(u)}
                    >
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="text-sm font-bold text-gray-900">{u.firstName} {u.lastName}</div>
                        <div className="text-xs text-gray-500">{u.email}</div>
                      </td>
                      {!country && (
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">{u.country || 'DE'}</td>
                      )}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="text-sm text-gray-700">{u.companyName || '-'}</div>
                        <div className="text-xs text-gray-400">{u.companyType}</div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <SubBadge user={u} />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <StatusBadge status={userStatus} />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                        {u.registeredAt ? new Date(u.registeredAt).toLocaleDateString() : '-'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right space-x-1.5" onClick={e => e.stopPropagation()}>
                        {userStatus === 'pending' && (
                          <>
                            <button onClick={() => handleAction('approve', u)} className="text-xs px-3 py-1 rounded border border-green-400 text-green-700 hover:bg-green-50 font-bold">{A.mbApprove}</button>
                            <button onClick={() => handleAction('reject', u)} className="text-xs px-3 py-1 rounded border border-red-300 text-red-600 hover:bg-red-50">{A.mbReject}</button>
                          </>
                        )}
                        {userStatus === 'active' && (
                          <>
                            <button onClick={() => handleAction('suspend', u)} className="text-xs px-3 py-1 rounded border border-orange-300 text-orange-600 hover:bg-orange-50">{A.mbSuspend}</button>
                            <button onClick={() => handleAction('disable', u)} className="text-xs px-3 py-1 rounded border border-red-300 text-red-600 hover:bg-red-50">{A.mbDisable}</button>
                          </>
                        )}
                        {(userStatus === 'suspended' || userStatus === 'rejected' || userStatus === 'disabled') && (
                          <button onClick={() => handleAction('reactivate', u)} className="text-xs px-3 py-1 rounded border border-teal-300 text-teal-600 hover:bg-teal-50">{A.mbReactivate}</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filtered.length === 0 && <EmptyState message={A.mbNoMembers} icon="👥" />}
          </div>
        </div>

        {/* Detail Panel */}
        {selectedUser && (
          <div className="w-[400px] flex-shrink-0 bg-white rounded-lg shadow border border-gray-200 overflow-y-auto">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <div className="font-bold text-gray-800">{selectedUser.firstName} {selectedUser.lastName}</div>
                <div className="text-xs text-gray-500">{selectedUser.email}</div>
              </div>
              <button onClick={() => setSelectedUser(null)} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
            </div>

            {/* Detail Tabs */}
            <div className="flex border-b border-gray-100">
              {(['profile', 'subscription', 'notes'] as const).map(tab => (
                <button key={tab} onClick={() => setDetailTab(tab)}
                  className={`flex-1 text-xs font-medium py-2.5 ${detailTab === tab ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-400 hover:text-gray-600'}`}>
                  {A.mbTabs[tab]}
                </button>
              ))}
            </div>

            <div className="p-4">
              {/* Profile Tab */}
              {detailTab === 'profile' && (
                <div className="space-y-3 text-sm">
                  <DetailRow label="Company" value={selectedUser.companyName || '-'} />
                  <DetailRow label="Company Type" value={(() => { const c = normalizeCompanyType(selectedUser.companyType); return c ? COMPANY_TYPE_LABELS[c] : '-'; })()} />
                  {selectedUser.companyTypeOther && <DetailRow label="Type detail" value={selectedUser.companyTypeOther} />}
                  <DetailRow label="City" value={selectedUser.companyCity || '-'} />
                  {selectedUser.companyWebsite && <DetailRow label="Website" value={selectedUser.companyWebsite} />}
                  <DetailRow label="Country" value={selectedUser.country || '-'} />
                  {/* Legacy fields — no longer collected, shown only where a document still has them. */}
                  {selectedUser.jobRole && <DetailRow label="Job Role (legacy)" value={selectedUser.jobRole} />}
                  {selectedUser.referralSource && <DetailRow label="Referral (legacy)" value={selectedUser.referralSource} />}
                  <DetailRow label="Status" value={<StatusBadge status={selectedUser.status} isActive={selectedUser.isActive} />} />
                  <DetailRow label="Role" value={selectedUser.role || 'user'} />
                  <DetailRow label="Registered" value={selectedUser.registeredAt ? new Date(selectedUser.registeredAt).toLocaleDateString() : '-'} />

                  <div className="pt-3 border-t border-gray-100 space-y-2">
                    <div className="text-xs font-bold text-gray-500 uppercase">{A.mbActions}</div>
                    <div className="flex flex-wrap gap-2">
                      {(selectedUser.status === 'active') && (
                        <>
                          <button onClick={() => handleAction('suspend', selectedUser)} className="text-xs px-3 py-1.5 rounded border border-orange-300 text-orange-600 hover:bg-orange-50">{A.mbSuspend}</button>
                          <button onClick={() => handleAction('disable', selectedUser)} className="text-xs px-3 py-1.5 rounded border border-red-300 text-red-600 hover:bg-red-50">{A.mbDisable}</button>
                        </>
                      )}
                      {(selectedUser.status === 'suspended' || selectedUser.status === 'rejected' || selectedUser.status === 'disabled') && (
                        <button onClick={() => handleAction('reactivate', selectedUser)} className="text-xs px-3 py-1.5 rounded border border-teal-300 text-teal-600 hover:bg-teal-50">{A.mbReactivate}</button>
                      )}
                      {selectedUser.status !== 'deletion_requested' && selectedUser.status !== 'deleted' && (
                        <button onClick={() => handleAction('request_deletion', selectedUser)} className="text-xs px-3 py-1.5 rounded border border-red-300 text-red-600 hover:bg-red-50">{A.mbReqDeletion}</button>
                      )}
                      <button onClick={() => handleAction('delete', selectedUser)} className="text-xs px-3 py-1.5 rounded border border-gray-300 text-gray-500 hover:bg-gray-100 hover:text-red-600">{A.mbDelete}</button>
                    </div>
                  </div>

                  {/* Support tools — resolve the two tickets that actually arrive:
                      "I can't sign in on my new device" and "I registered on the
                      wrong country site". Both are non-destructive. */}
                  <SupportTools al={al} user={selectedUser} onChanged={load} />

                  {/* Writing to a member is an admin action like any other, so it
                      lives with them rather than in a separate mail screen. */}
                  <MemberEmail al={al} user={selectedUser} />
                </div>
              )}

              {/* Subscription Tab */}
              {detailTab === 'subscription' && (
                <SubscriptionAdminPanel
                  al={al}
                  user={selectedUser}
                  onChanged={async () => {
                    await load();
                    const fresh = (await getUsers()).find(u => u.id === selectedUser.id);
                    if (fresh) setSelectedUser(fresh);
                  }}
                />
              )}

              {/* Notes Tab */}
              {detailTab === 'notes' && (
                <div className="space-y-3">
                  <textarea
                    className="w-full h-32 px-3 py-2 border rounded-lg text-sm focus:ring-blue-500 outline-none resize-none"
                    placeholder="Internal admin notes..."
                    value={adminNotes}
                    onChange={e => { setAdminNotes(e.target.value); setNotesSaved(false); }}
                  />
                  <button
                    className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-lg"
                    onClick={async () => {
                      await updateAdminNotes(selectedUser.id, adminNotes);
                      setNotesSaved(true);
                      setTimeout(() => setNotesSaved(false), 2000);
                    }}
                  >
                    {notesSaved ? A.cSaved : A.cSave}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ── Subscription panel: PAID = read-only (Paddle owns it) · GRANT = admin tool ──
//
// Owner decision 2026-08-03: the paid `subscription` slot has exactly ONE
// writer — the Paddle webhook — so this panel never edits it (Firestore rules
// also refuse). What admins DO manage here is the marketing/entitlement layer:
// a free-access GRANT (temporary access, promotions, support goodwill),
// which lives in `user.grant` and can never collide with Paddle data.

const SubscriptionAdminPanel: React.FC<{ al: AdminLang; user: User; onChanged: () => void }> = ({ al, user, onChanged }) => {
  const A = ADMIN_I18N[al];
  const sub = user.subscription;
  const grant = user.grant;
  const [plan, setPlan] = useState<SubPlanCode>('professional');
  const [endDate, setEndDate] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 3500); };

  const giveGrant = async () => {
    if (busy) return;
    if (!endDate) { flash(A.sbGrantNeedsEnd); return; }
    setBusy(true);
    try {
      await createGrant(
        user.email, plan,
        new Date().toISOString(),
        new Date(endDate + 'T23:59:59Z').toISOString(),
        note || 'Admin temporary access', 'Admin', user, user.country || '',
      );
      flash(A.sbGrantGiven);
      onChanged();
    } catch (e: any) { flash(String(e?.message ?? e)); }
    finally { setBusy(false); }
  };

  const endGrant = async () => {
    if (!confirm(A.sbGrantEndConfirm)) return;
    setBusy(true);
    try {
      await revokeGrant(emailKey(user.email));
      flash(A.sbGrantEnded);
      onChanged();
    } catch (e: any) { flash(String(e?.message ?? e)); }
    finally { setBusy(false); }
  };

  const sel = 'w-full px-2.5 py-1.5 border rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500';

  return (
    <div className="space-y-3 text-sm">
      {/* Paid subscription — read-only mirror of Paddle */}
      <div className="text-xs font-bold text-gray-500 uppercase">{A.sbPaidTitle}</div>
      {sub ? (
        <>
          <DetailRow label={A.sbPlan} value={`${SUB_PLAN_NAMES[sub.planCode]} (${SUB_PLANS[sub.planCode].seatLimit} ${A.sbSeats.toLowerCase()})`} />
          <DetailRow label={A.sbTerm} value={sub.billingTerm ? TERM_NAMES[sub.billingTerm] : '-'} />
          <DetailRow label={A.sbStatus} value={<SubBadge user={user} />} />
          <DetailRow label={A.sbPeriodEnd} value={sub.currentPeriodEndsAt?.slice(0, 10) || '-'} />
          {sub.paddleSubscriptionId && <DetailRow label="Paddle" value={sub.paddleSubscriptionId} />}
          {user.orgId && <DetailRow label="Org" value={`${user.orgRole ?? '-'} · ${user.orgId.slice(0, 8)}…`} />}
          <div className="text-[11px] text-gray-400 leading-snug">{A.sbPaidReadOnly}</div>
        </>
      ) : (
        <div className="text-gray-500">{A.sbNone}</div>
      )}

      {/* Grant layer — the admin's own lever */}
      <div className="pt-3 border-t border-gray-100 space-y-2">
        <div className="text-xs font-bold text-gray-500 uppercase">{A.sbGrantTitle}</div>
        {grant ? (
          <>
            <DetailRow label={A.sbPlan} value={SUB_PLAN_NAMES[grant.planCode]} />
            <DetailRow label={A.sbPeriodEnd} value={grant.endsAt.slice(0, 10)} />
            {grant.note && <DetailRow label={A.sbGrantNote} value={grant.note} />}
            <button onClick={endGrant} disabled={busy} className="px-4 py-1.5 border border-red-300 text-red-600 hover:bg-red-50 text-sm rounded-lg">
              {A.sbGrantEnd}
            </button>
          </>
        ) : (
          <>
            <div className="text-[11px] text-gray-400 leading-snug">{A.sbGrantHint}</div>
            <div className="grid grid-cols-2 gap-2">
              <select value={plan} onChange={e => setPlan(e.target.value as SubPlanCode)} className={sel}>
                {SUB_PLAN_CODES.map(pp => <option key={pp} value={pp}>{SUB_PLAN_NAMES[pp]}</option>)}
              </select>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className={sel} title={A.sbPeriodEnd} />
            </div>
            <input value={note} onChange={e => setNote(e.target.value)} placeholder={A.sbGrantNote} className={sel} />
            <button onClick={giveGrant} disabled={busy} className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-lg">
              {A.sbGrantGive}
            </button>
          </>
        )}
        {msg && <div className="text-xs text-green-700 font-medium">{msg}</div>}
      </div>
    </div>
  );
};

// ── Helper Components ─────────────────────────────────────────────────

/**
 * SupportTools — the two member problems that actually generate tickets.
 *
 * 1. LOCKED OUT BY THE DEVICE LIMIT. Two active devices are allowed, so a member
 *    who replaces a laptop (or clears storage) can be refused. Their own
 *    "sign out everywhere" cannot help: it requires being signed in, which is
 *    precisely what fails. The server clears session documents only — never
 *    entitlements, status or refresh tokens.
 * 2. REGISTERED ON THE WRONG COUNTRY SITE. `country` drives which market
 *    workspace the member appears in and which news/market content they see;
 *    the catalogue itself is identical everywhere, so correcting it is a
 *    filing fix, not an entitlement change.
 *
 * Password resets are NOT offered here: Firebase's own reset email is
 * self-service from the sign-in page, and sending it from the console would
 * mean an admin action that looks, to the member, like an unexplained
 * "reset your password" mail — a phishing pattern we should not create.
 */
/**
 * MemberEmail — write to a member from support@heatpumpdb.eu.
 *
 * The service had no way to send mail at all: the only member-facing channel
 * was the in-app ticket thread, which a suspended member cannot open because
 * suspension signs them out. So the one message that most needs to reach
 * someone — "your account was closed, here is why, here is how to appeal" —
 * was the one message the system could not deliver.
 *
 * A template fills the composer and then gets out of the way; what is sent is
 * whatever the admin has in front of them. The send is confirmed, recorded
 * server-side with the message as sent, and shown back here, because a notice
 * about someone's account is the kind of thing that gets disputed months later.
 */
const MemberEmail: React.FC<{ al: AdminLang; user: User }> = ({ al, user }) => {
  const A = ADMIN_I18N[al];
  const [templateId, setTemplateId] = useState(MEMBER_EMAIL_TEMPLATES[0].id);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [history, setHistory] = useState<SentMemberEmail[]>([]);
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  const template = MEMBER_EMAIL_TEMPLATES.find(t => t.id === templateId) ?? MEMBER_EMAIL_TEMPLATES[0];

  // A new member, or a new template, means a new draft — never a half-edited
  // message carried over to the wrong person.
  useEffect(() => {
    const d = template.build(user);
    setSubject(d.subject);
    setBody(d.body);
    setMsg('');
    setPreview(null);
  }, [user.id, templateId]);

  const loadHistory = () => {
    listMemberEmails(user.id)
      .then(r => setHistory(r.items ?? []))
      .catch(() => setHistory([]));
  };
  useEffect(() => { if (open) loadHistory(); }, [open, user.id]);

  const showPreview = async () => {
    if (preview) { setPreview(null); return; }     // toggle closed
    setBusy(true);
    try {
      const r = await previewMemberEmail(user.id, body);
      setPreview(r.html);
    } catch (e: any) {
      setMsg(`${A.meFailed} ${String(e?.message ?? e)}`);
    } finally { setBusy(false); }
  };

  const send = async () => {
    if (!confirm(A.meConfirm(user.email))) return;
    setBusy(true);
    setMsg('');
    try {
      const r = await sendMemberEmail(user.id, subject, body, template.kind);
      setMsg(`${A.meSent} ${r.to}`);
      loadHistory();
    } catch (e: any) {
      const err = String(e?.message ?? e);
      setMsg(err === 'smtp-not-configured' ? A.meNotConfigured : `${A.meFailed} ${err}`);
    } finally { setBusy(false); }
  };

  return (
    <div className="pt-3 border-t border-gray-100 space-y-2">
      <button onClick={() => setOpen(o => !o)} className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1">
        ✉️ {A.meTitle} <span className="text-gray-300">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-600 w-16">{A.meTemplate}</span>
            <select value={templateId} onChange={e => setTemplateId(e.target.value)}
              className="flex-1 px-2 py-1 border rounded text-xs bg-white">
              {MEMBER_EMAIL_TEMPLATES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>

          {template.fillIn?.length ? (
            <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
              <div className="font-semibold">{A.meFillIn}</div>
              <ul className="list-disc pl-4">{template.fillIn.map(f => <li key={f}>{f}</li>)}</ul>
            </div>
          ) : null}

          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-600 w-16">{A.meSubject}</span>
            <input value={subject} onChange={e => setSubject(e.target.value)}
              className="flex-1 px-2 py-1 border rounded text-xs" />
          </div>

          <textarea value={body} onChange={e => setBody(e.target.value)} rows={14}
            className="w-full px-2 py-1.5 border rounded text-xs font-mono leading-relaxed" />

          <div className="flex items-center gap-2">
            <button onClick={send} disabled={busy || subject.trim().length < 3 || body.trim().length < 10}
              className="text-xs px-3 py-1.5 rounded border border-blue-300 text-blue-700 hover:bg-blue-50 disabled:opacity-50">
              {busy ? A.meSending : A.meSend}
            </button>
            <button onClick={showPreview} disabled={busy || body.trim().length < 10}
              className="text-xs px-3 py-1.5 rounded border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50">
              {preview ? A.mePreviewHide : A.mePreview}
            </button>
            {msg && <span className="text-[11px] text-gray-600">{msg}</span>}
          </div>

          {/* srcDoc + a sandbox with nothing granted: the preview is our own
              HTML, but it is still rendered as a document and gets no script,
              no forms and no access back to the console. */}
          {preview && (
            <iframe title="preview" srcDoc={preview} sandbox=""
              className="w-full rounded border border-gray-200 bg-white" style={{ height: 520 }} />
          )}
          <div className="text-[11px] text-gray-400">{A.meHint}</div>

          <div className="pt-2 border-t border-gray-100">
            <div className="text-[11px] font-bold text-gray-500 uppercase mb-1">{A.meHistory}</div>
            {history.length === 0 && <div className="text-[11px] text-gray-400">{A.meNoHistory}</div>}
            {history.map(h => (
              <div key={h.id} className="text-[11px] text-gray-600 border-b border-gray-50 py-1">
                <span className={h.ok === false ? 'text-red-600' : 'text-gray-400'}>
                  {String(h.at).slice(0, 16).replace('T', ' ')}
                </span>{' '}
                <span className="font-medium">{h.subject}</span>{' '}
                <span className="text-gray-400">· {h.kind}{h.sentByEmail ? ` · ${h.sentByEmail}` : ''}</span>
                {h.ok === false && <span className="text-red-600"> · {h.error}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const SupportTools: React.FC<{ al: AdminLang; user: User; onChanged: () => void }> = ({ al, user, onChanged }) => {
  const A = ADMIN_I18N[al];
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [market, setMarket] = useState(user.country || '');

  useEffect(() => { setMarket(user.country || ''); setMsg(''); }, [user.id, user.country]);

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 4000); };

  const clearSessions = async () => {
    if (!confirm(A.stClearConfirm(user.email))) return;
    setBusy(true);
    try {
      const r = await adminClearSessions(user.id);
      flash(A.stCleared(r.revoked ?? 0));
    } catch (e: any) {
      flash(`${A.stFailed} ${String(e?.message ?? e)}`);
    } finally { setBusy(false); }
  };

  const saveMarket = async () => {
    if (!market || market === (user.country || '')) return;
    setBusy(true);
    try {
      await setUserCountry(user.id, market);
      flash(A.stMarketSaved);
      onChanged();
    } catch (e: any) {
      flash(`${A.stFailed} ${String(e?.message ?? e)}`);
    } finally { setBusy(false); }
  };

  const btn = 'text-xs px-3 py-1.5 rounded border disabled:opacity-50';

  return (
    <div className="pt-3 border-t border-gray-100 space-y-2">
      <div className="text-xs font-bold text-gray-500 uppercase">{A.stTitle}</div>

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={clearSessions} disabled={busy} className={`${btn} border-blue-300 text-blue-700 hover:bg-blue-50`}>
          🔓 {A.stClearSessions}
        </button>
        <span className="text-[11px] text-gray-400">{A.stClearHint}</span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-gray-600">{A.stMarket}</span>
        <select
          value={market}
          onChange={e => setMarket(e.target.value)}
          className="px-2 py-1 border rounded text-xs bg-white"
        >
          {Object.values(COUNTRY_PROFILES).map(m => (
            <option key={m.code} value={m.code}>{A.marketNames[m.code] ?? m.name}</option>
          ))}
        </select>
        <button
          onClick={saveMarket}
          disabled={busy || !market || market === (user.country || '')}
          className={`${btn} border-gray-300 text-gray-700 hover:bg-gray-50`}
        >
          {A.stMarketSave}
        </button>
      </div>

      {msg && <div className="text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded p-2">{msg}</div>}
    </div>
  );
};

const DetailRow: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="flex justify-between items-center">
    <span className="text-gray-500">{label}</span>
    <span className="font-medium text-gray-800 text-right">{value}</span>
  </div>
);

