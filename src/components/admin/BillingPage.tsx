/**
 * BillingPage — subscription operations for the Professional / Team 3 / Team 5
 * program. Paddle stays the merchant of record (payments, VAT, invoices);
 * everything operational lives HERE: who is on which plan, scheduled
 * renewal-time changes, and free-access promotions (auto-approved emails).
 */
import React, { useEffect, useState } from 'react';
import { getUsers } from '../../services/authService';
import {
  listGrants, createGrant, revokeGrant, listChangeRequests,
  adminAssignSubscription,
} from '../../services/subscriptionService';
import { collection, doc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { User, FreeAccessGrant, SubscriptionChangeRequest } from '../../types';
import {
  SubPlanCode, SUB_PLAN_CODES, SUB_PLAN_NAMES, TERM_NAMES,
} from '../../config/subscriptionPlans';
import { StatCard, SectionCard, PageHeader, EmptyState, SubBadge } from './shared';
import { AdminLang, ADMIN_I18N } from './adminI18n';

export const BillingPage: React.FC<{ al: AdminLang }> = ({ al }) => {
  const A = ADMIN_I18N[al];
  const [users, setUsers] = useState<User[]>([]);
  const [grants, setGrants] = useState<FreeAccessGrant[]>([]);
  const [changes, setChanges] = useState<SubscriptionChangeRequest[]>([]);
  // Paddle adjustments (refunds / chargebacks) parked for review — informational
  // by design: they never gate anyone automatically (owner principle 2026-07-27).
  const [reviews, setReviews] = useState<any[]>([]);
  const [msg, setMsg] = useState('');

  const load = async () => {
    const [u, g, c, r] = await Promise.all([
      getUsers(),
      listGrants().catch(() => []),
      listChangeRequests().catch(() => []),
      getDocs(query(collection(db, 'paddleAdjustments'), where('needsAdminReview', '==', true)))
        .then(s => s.docs.map(d => ({ id: d.id, ...d.data() })))
        .catch(() => []),
    ]);
    setUsers(u);
    setGrants(g);
    setChanges(c);
    setReviews(r);
  };
  useEffect(() => { load(); }, []);

  const markReviewed = async (id: string) => {
    await updateDoc(doc(db, 'paddleAdjustments', id), { needsAdminReview: false, reviewedAt: new Date().toISOString() });
    setReviews(rs => rs.filter(x => x.id !== id));
  };

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 3000); };

  const subs = users.filter(u => u.subscription);
  const count = (st: string) => subs.filter(u => u.subscription!.status === st).length;

  const applyChange = async (req: SubscriptionChangeRequest) => {
    const target = users.find(u => u.id === req.userId);
    if (!target) return;
    await adminAssignSubscription(target, req.requestedPlanCode, req.requestedBillingTerm, { status: 'active' });
    await updateDoc(doc(db, 'subscriptionChangeRequests', req.id), { status: 'applied' });
    flash(A.blApplied);
    load();
  };

  const markApplied = async (req: SubscriptionChangeRequest) => {
    await updateDoc(doc(db, 'subscriptionChangeRequests', req.id), { status: 'applied' });
    load();
  };

  return (
    <div>
      <PageHeader title={A.blTitle} subtitle={A.blSubtitle} />
      {msg && <div className="mb-4 bg-green-50 border border-green-200 text-green-800 text-sm rounded-lg p-3">{msg}</div>}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label={A.blActive} value={count('active')} color="green" icon="✅" />
        <StatCard label={A.blTrialing} value={count('trialing')} color="blue" icon="🕒" />
        <StatCard label={A.blPastDue} value={count('past_due')} color="orange" icon="⚠️" />
        <StatCard label={A.blGrants} value={grants.filter(g => !g.revokedAt && new Date(g.endsAt) > new Date()).length} color="purple" icon="🎁" />
      </div>

      {/* Billing review — refund/chargeback adjustments (audit-only, never auto-gating) */}
      <SectionCard title={A.brTitle} icon="🧾" className="mb-6">
        <p className="text-xs text-gray-500 mb-3">{A.brText}</p>
        {reviews.length === 0 ? (
          <div className="text-sm text-gray-400">{A.brNone}</div>
        ) : (
          <table className="min-w-full text-sm">
            <tbody className="divide-y divide-gray-100">
              {reviews.map(r => (
                <tr key={r.id}>
                  <td className="py-2 pr-4 font-medium text-gray-800 whitespace-nowrap">{r.action || r.kind || '—'}</td>
                  <td className="py-2 pr-4 whitespace-nowrap">{r.status || ''} {r.type ? `· ${r.type}` : ''}</td>
                  <td className="py-2 pr-4 text-gray-500 whitespace-nowrap">{r.subscriptionId || r.transactionId || ''}</td>
                  <td className="py-2 pr-4 text-gray-400 whitespace-nowrap">{(r.occurredAt || '').slice(0, 19).replace('T', ' ')}</td>
                  <td className="py-2 text-right">
                    <button onClick={() => markReviewed(r.id)} className="text-xs text-blue-600 hover:underline whitespace-nowrap">
                      {A.brMarkReviewed}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>

      {/* Free access grants (promotions) */}
      <SectionCard title={A.grTitle} icon="🎁" className="mb-6">
        <p className="text-xs text-gray-500 mb-4">{A.grText}</p>
        <GrantForm al={al} users={users} onCreated={existing => { flash(existing ? A.grCreatedExisting : A.grCreated); load(); }} />
        <div className="mt-5">
          <div className="text-xs font-bold text-gray-500 uppercase mb-2">{A.grList}</div>
          {grants.length === 0 ? (
            <div className="text-sm text-gray-400">{A.grNone}</div>
          ) : (
            <table className="min-w-full text-sm">
              <tbody className="divide-y divide-gray-100">
                {grants.map(g => {
                  const expired = new Date(g.endsAt) < new Date() || !!g.revokedAt;
                  return (
                    <tr key={g.email} className={expired ? 'opacity-50' : ''}>
                      <td className="py-2 pr-4 font-medium text-gray-800 whitespace-nowrap">{g.email}</td>
                      <td className="py-2 pr-4 whitespace-nowrap">{SUB_PLAN_NAMES[g.planCode]}</td>
                      <td className="py-2 pr-4 text-gray-500 whitespace-nowrap">{g.startsAt.slice(0, 10)} → {g.endsAt.slice(0, 10)}</td>
                      <td className="py-2 pr-4 text-xs whitespace-nowrap">
                        {expired ? <span className="text-gray-400">{A.grExpired}</span>
                          : g.redeemedByUid ? <span className="text-green-700 font-medium">✓ {A.grRedeemed}</span>
                          : <span className="text-yellow-700">{A.grOpen}</span>}
                      </td>
                      <td className="py-2 pr-4 text-xs text-gray-400 max-w-[200px] truncate">{g.note}</td>
                      <td className="py-2 text-right">
                        {!expired && (
                          <button
                            onClick={async () => { if (confirm(A.grRevokeConfirm(g.email))) { await revokeGrant(g.email); flash(A.grRevoked); load(); } }}
                            className="text-xs px-3 py-1 rounded border border-red-300 text-red-600 hover:bg-red-50"
                          >
                            {A.grRevoke}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </SectionCard>

      {/* Scheduled changes */}
      <SectionCard title={A.blChanges} icon="🔁" className="mb-6">
        {changes.length === 0 ? (
          <div className="text-sm text-gray-400">{A.blNoChanges}</div>
        ) : (
          <table className="min-w-full text-sm">
            <tbody className="divide-y divide-gray-100">
              {changes.map(c => (
                <tr key={c.id}>
                  <td className="py-2 pr-4 font-medium text-gray-800 whitespace-nowrap">{c.userEmail}</td>
                  <td className="py-2 pr-4 whitespace-nowrap text-gray-600">
                    {SUB_PLAN_NAMES[c.currentPlanCode as SubPlanCode] ?? c.currentPlanCode}
                    {' → '}
                    <strong>{SUB_PLAN_NAMES[c.requestedPlanCode]} · {TERM_NAMES[c.requestedBillingTerm]}</strong>
                  </td>
                  <td className="py-2 pr-4 text-gray-500 whitespace-nowrap text-xs">
                    {A.blEffective}: {c.effectiveAt?.slice(0, 10) ?? '—'} · {A.blRequested}: {c.createdAt.slice(0, 10)}
                    {c.keepMemberUids?.length ? ` · keep ${c.keepMemberUids.length}` : ''}
                  </td>
                  <td className="py-2 text-right space-x-1.5 whitespace-nowrap">
                    <button onClick={() => applyChange(c)} className="text-xs px-3 py-1 rounded border border-blue-300 text-blue-700 hover:bg-blue-50 font-bold">{A.blApplyNow}</button>
                    <button onClick={() => markApplied(c)} className="text-xs px-3 py-1 rounded border border-gray-300 text-gray-500 hover:bg-gray-50">{A.blMarkApplied}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>

      {/* All subscriptions */}
      <SectionCard title={A.blSubs} icon="💳">
        {subs.length === 0 ? (
          <div className="text-sm text-gray-400">{A.blNoSubs}</div>
        ) : (
          <table className="min-w-full text-sm">
            <tbody className="divide-y divide-gray-100">
              {subs.map(u => (
                <tr key={u.id}>
                  <td className="py-2 pr-4 font-medium text-gray-800 whitespace-nowrap">{u.email}</td>
                  <td className="py-2 pr-4 whitespace-nowrap">{u.country || 'DE'}</td>
                  <td className="py-2 pr-4 whitespace-nowrap"><SubBadge user={u} /></td>
                  <td className="py-2 pr-4 text-gray-500 whitespace-nowrap">{u.subscription!.billingTerm ? TERM_NAMES[u.subscription!.billingTerm] : '—'}</td>
                  <td className="py-2 pr-4 text-gray-500 whitespace-nowrap text-xs">{A.sbPeriodEnd}: {u.subscription!.currentPeriodEndsAt?.slice(0, 10) ?? '—'}</td>
                  <td className="py-2 text-gray-400 text-xs whitespace-nowrap">{u.subscription!.provider}{u.orgRole ? ` · ${u.orgRole}` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>
    </div>
  );
};

// ── Grant creation form ──────────────────────────────────────────────

const GrantForm: React.FC<{ al: AdminLang; users: User[]; onCreated: (existing: boolean) => void }> = ({ al, users, onCreated }) => {
  const A = ADMIN_I18N[al];
  const today = new Date().toISOString().slice(0, 10);
  const [email, setEmail] = useState('');
  const [plan, setPlan] = useState<SubPlanCode>('professional');
  const [startsAt, setStartsAt] = useState(today);
  const [endsAt, setEndsAt] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    const e = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) || !startsAt || !endsAt || endsAt < startsAt) {
      setErr(A.grInvalid); setTimeout(() => setErr(''), 2500); return;
    }
    if (busy) return;
    setBusy(true);
    try {
      const existing = users.find(u => u.email.toLowerCase() === e) ?? null;
      await createGrant(
        e, plan,
        new Date(startsAt + 'T00:00:00Z').toISOString(),
        new Date(endsAt + 'T23:59:59Z').toISOString(),
        note.trim(), 'Admin', existing,
      );
      setEmail(''); setNote(''); setEndsAt('');
      onCreated(!!existing);
    } catch (ex: any) {
      setErr(String(ex?.message ?? ex)); setTimeout(() => setErr(''), 3500);
    } finally { setBusy(false); }
  };

  const inp = 'px-3 py-2 border rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500';

  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-xs font-bold text-gray-500">
        {A.grEmail}
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="user@company.com" className={`${inp} w-56 font-normal`} />
      </label>
      <label className="flex flex-col gap-1 text-xs font-bold text-gray-500">
        {A.grPlan}
        <select value={plan} onChange={e => setPlan(e.target.value as SubPlanCode)} className={`${inp} font-normal`}>
          {SUB_PLAN_CODES.map(p => <option key={p} value={p}>{SUB_PLAN_NAMES[p]}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs font-bold text-gray-500">
        {A.grFrom}
        <input type="date" value={startsAt} onChange={e => setStartsAt(e.target.value)} className={`${inp} font-normal`} />
      </label>
      <label className="flex flex-col gap-1 text-xs font-bold text-gray-500">
        {A.grUntil}
        <input type="date" value={endsAt} min={startsAt} onChange={e => setEndsAt(e.target.value)} className={`${inp} font-normal`} />
      </label>
      <label className="flex flex-col gap-1 text-xs font-bold text-gray-500 flex-grow min-w-[160px]">
        {A.grNote}
        <input type="text" value={note} onChange={e => setNote(e.target.value)} className={`${inp} font-normal`} />
      </label>
      <button onClick={submit} disabled={busy} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-lg whitespace-nowrap">
        🎁 {A.grCreate}
      </button>
      {err && <span className="text-xs text-red-600 font-medium">{err}</span>}
    </div>
  );
};
