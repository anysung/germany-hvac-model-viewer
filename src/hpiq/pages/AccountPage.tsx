/** Account — subscription program, team seats, profile, language, legal. */
import React, { useEffect, useState } from 'react';
import { sendPasswordResetEmail } from 'firebase/auth';
import { collection, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../../firebase';
import { getSessionId, revokeSessionFn, revokeOtherSessionsFn, signOutEverywhereFn } from '../../services/sessionService';
import { tsToMillis } from '../../config/entitlement';
import { requestDeletion } from '../../services/adminService';
import { openCheckout, checkoutConfigured } from '../../services/paddleService';
import { TeamNameGate, nameNeededForCheckout } from '../../components/OnboardingSheet';
import { TRIAL_FLOW_ENABLED, createTeamOrgFn, deleteAccountFn, cancelSubscriptionFn, billingPortalFn } from '../../services/billingFnService';
import { accessInfo } from '../../config/entitlement';
import {
  getMyOrg, seatsUsed, getMyChangeRequest, scheduleChange, cancelChange, leaveTeam,
} from '../../services/subscriptionService';
import { HpApp } from '../appState';
import { UI_LANGUAGES } from '../market';
import { tr } from '../i18n';
import { Language, Organization, SubscriptionChangeRequest } from '../../types';
import {
  SubPlanCode, BillingTerm, SUB_PLANS, SUB_PLAN_CODES, BILLING_TERMS,
  formatEur, perMonth, perUserMonth, isTeamPlan, subscriptionUnlocked, sharedTermDiscountPct, effectiveSubscription,
} from '../../config/subscriptionPlans';
import { FD, sectionLabel } from '../ui';
import { shortDate } from '../model';
import {
  Card, CardTitle, CompanyProfileCard, PersonalProfileCard,
  TeamSummaryCard, YourTeamCard, TeamManagementView, PoliciesCard, SupportCard,
  SignInMethodsCard,
} from './accountParts';
import { previewOrg } from '../devPreview';
import { MARKETING_EMAIL } from '../../config/legal';

/* ── Subscription program ─────────────────────────────────────────────────── */

const pill = (bg: string, color: string): React.CSSProperties => ({
  fontSize: 10.5, fontWeight: 700, letterSpacing: '.04em', borderRadius: 999,
  padding: '3px 10px', background: bg, color, whiteSpace: 'nowrap',
});

/**
 * Two-step danger confirmation (owner spec 2026-08-03): destructive choices
 * (immediate cancellation, account deletion) pass TWO explicit warnings —
 * first the consequence (remaining paid time forfeited, no refund/recovery),
 * then a final are-you-sure whose confirm button completes the action.
 */
const DangerStepModal: React.FC<{
  title: string; body: string; confirmLabel: string; backLabel: string;
  final?: boolean; busy?: boolean; onConfirm: () => void; onBack: () => void;
}> = ({ title, body, confirmLabel, backLabel, final, busy, onConfirm, onBack }) => (
  <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
    <div style={{ background: '#fff', borderRadius: 18, padding: '26px 26px 22px', maxWidth: 460, width: '100%', display: 'flex', flexDirection: 'column', gap: 12, boxShadow: '0 24px 60px rgba(0,0,0,.25)' }} data-testid={final ? 'danger-step-2' : 'danger-step-1'}>
      <span style={{ fontFamily: FD, fontSize: 19, fontWeight: 700, color: final ? '#b3261e' : '#1d1d1f' }}>{title}</span>
      <span style={{ fontSize: 13.5, color: '#333', lineHeight: 1.65 }}>{body}</span>
      <div style={{ display: 'flex', gap: 10, marginTop: 6, flexWrap: 'wrap' }}>
        <span className="hp-press" onClick={busy ? undefined : onBack}
          style={{ flex: 1, textAlign: 'center', border: '1px solid #d2d2d7', borderRadius: 999, padding: '11px 16px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', background: '#fff' }}
          data-testid="danger-back">
          {backLabel}
        </span>
        <span className="hp-press" onClick={busy ? undefined : onConfirm}
          style={{ flex: 1, textAlign: 'center', borderRadius: 999, padding: '11px 16px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', background: final ? '#b3261e' : '#1d1d1f', color: '#fff', opacity: busy ? .6 : 1 }}
          data-testid="danger-confirm">
          {busy ? '…' : confirmLabel}
        </span>
      </div>
    </div>
  </div>
);

/**
 * Two-step plan picker: (1) who — Professional / Team 3 / Team 5,
 * (2) how long — monthly / 6 months / annual. Defaults: annual term,
 * Team 3 Annual highlighted as Most Popular.
 * mode 'checkout' opens Paddle (7-day trial on the price itself);
 * mode 'schedule' registers a renewal-time change instead.
 */
const PLAN_ORDER: Record<SubPlanCode, number> = { professional: 1, team_3: 2, team_5: 3 };
const TERM_ORDER: Record<BillingTerm, number> = { monthly: 1, six_months: 2, annual: 3 };

const PlanPicker: React.FC<{
  app: HpApp;
  mode: 'checkout' | 'schedule';
  org?: Organization | null;
  onSchedule?: (plan: SubPlanCode, term: BillingTerm, keepUids?: string[]) => void;
  /** Upgrade-only floor (schedule mode, owner rule 2026-08-03): plans/terms
   *  BELOW the current ones are not selectable — mid-term shrinking is
   *  impossible for tax/settlement reasons. */
  minPlan?: SubPlanCode;
  minTerm?: BillingTerm;
}> = ({ app, mode, org, onSchedule, minPlan, minTerm }) => {
  const t = tr(app.lang);
  const s = t.sub;
  const [term, setTerm] = useState<BillingTerm>('monthly');
  const [pendingDowngrade, setPendingDowngrade] = useState<SubPlanCode | null>(null);
  const [profileFor, setProfileFor] = useState<SubPlanCode | null>(null);
  const [keepUids, setKeepUids] = useState<string[]>([]);
  const isPreview = app.user.id === 'preview';

  const choose = (plan: SubPlanCode) => {
    if (isPreview) { app.notify(t.account.previewOnly); return; }
    if (mode === 'checkout') {
      if (!checkoutConfigured(plan, term)) { app.notify(s.notConfigured); return; }
      // Only a Team plan still stops here, and only for a missing name — the
      // invitation mail has to say who is inviting. Paddle collects the rest.
      if (nameNeededForCheckout(app.user, isTeamPlan(plan))) { setProfileFor(plan); return; }
      openCheckout(app.user, plan, term).catch(() => app.notify(s.notConfigured));
      return;
    }
    // Schedule mode is UPGRADE-ONLY: both dimensions may only move up, and at
    // least one must actually move.
    if (minPlan && minTerm) {
      const planUp = PLAN_ORDER[plan] - PLAN_ORDER[minPlan];
      const termUp = TERM_ORDER[term] - TERM_ORDER[minTerm];
      if (planUp < 0 || termUp < 0 || (planUp === 0 && termUp === 0)) {
        app.notify(s.upgradeOnlyBlocked);
        return;
      }
    }
    // Downgrades below the current member count would need a keep-list —
    // unreachable under upgrade-only, kept as a safety net.
    const members = org?.members ?? [];
    const targetSeats = SUB_PLANS[plan].seatLimit;
    if (members.length > targetSeats) {
      setPendingDowngrade(plan);
      setKeepUids(org ? [org.ownerUid] : []);
      return;
    }
    onSchedule?.(plan, term);
  };

  const confirmDowngrade = () => {
    if (!pendingDowngrade) return;
    const target = SUB_PLANS[pendingDowngrade].seatLimit;
    if (keepUids.length !== target) return;
    onSchedule?.(pendingDowngrade, term, keepUids);
    setPendingDowngrade(null);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {profileFor && (
        <TeamNameGate
          language={app.lang as any}
          user={app.user}
          onSaved={(patch) => {
            const plan = profileFor;
            setProfileFor(null);
            openCheckout({ ...app.user, ...patch }, plan, term)
              .catch(() => app.notify(s.notConfigured));
          }}
          onCancel={() => setProfileFor(null)}
        />
      )}
      {mode === 'schedule' && minPlan && (
        <span style={{ fontSize: 12.5, color: '#9a6b00', background: '#fdf6e7', border: '1px solid #f0e2c0', borderRadius: 10, padding: '9px 13px', lineHeight: 1.55 }}>
          {s.upgradeOnlyNote}
        </span>
      )}
      {/* Step 2 first visually: billing-term toggle (annual default).
          Three EQUAL segments, each centering its label + discount badge. The
          badge shows the real saving from the configured prices via
          sharedTermDiscountPct — the LOWEST discount across all plans, so the
          single shared claim never overstates any plan; no hard-coded percentages,
          no vague "best value". minmax(0, 1fr) (not plain 1fr) so a nowrap label
          can never blow a column past its 1/3 share, and min-width:0 lets each
          segment shrink — together they keep the three exactly equal and prevent
          horizontal overflow at any width. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', border: '1px solid #d2d2d7', borderRadius: 999, overflow: 'hidden', fontSize: 13, width: '100%', maxWidth: 560 }}>
        {BILLING_TERMS.map(tm => {
          const pct = sharedTermDiscountPct(tm);
          const selected = term === tm;
          return (
            <span
              key={tm}
              role="button"
              tabIndex={0}
              aria-pressed={selected}
              onClick={() => setTerm(tm)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setTerm(tm); } }}
              style={{ padding: '8px 10px', cursor: 'pointer', display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'center', textAlign: 'center', minWidth: 0, ...(selected ? { background: '#1d1d1f', color: '#fff', fontWeight: 600 } : {}) }}
            >
              <span style={{ whiteSpace: 'nowrap' }}>{s.termNames[tm]}</span>
              {pct > 0 && (
                <span style={{ fontSize: 10, fontWeight: 700, borderRadius: 999, padding: '2px 7px', whiteSpace: 'nowrap', background: selected ? 'rgba(255,255,255,.18)' : '#e7f6ee', color: selected ? '#fff' : '#0a7a43' }}>
                  {s.termSavePct(pct)}
                </span>
              )}
            </span>
          );
        })}
      </div>

      {/* Plan cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
        {SUB_PLAN_CODES.map(code => {
          const plan = SUB_PLANS[code];
          const price = plan.prices[term];
          const popular = code === 'team_3' && term === 'monthly';   // owner call 2026-08-04: monthly first — annual sticker price scared first-time visitors
          const team = isTeamPlan(code);
          return (
            <div
              key={code}
              style={{
                border: popular ? '2px solid #0066cc' : '1px solid #e0e0e0', borderRadius: 18,
                padding: '20px 20px 18px', display: 'flex', flexDirection: 'column', gap: 7, position: 'relative', background: '#fff',
              }}
            >
              {popular && (
                <span style={{ ...pill('#0066cc', '#fff'), position: 'absolute', top: -11, left: 18 }}>{s.mostPopular}</span>
              )}
              <span style={{ fontFamily: FD, fontSize: 18, fontWeight: 600 }}>{s.planNames[code]}</span>
              <span style={{ fontSize: 12.5, color: '#7a7a7a' }}>{s.planUsers[code]}</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginTop: 4, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: FD, fontSize: 27, fontWeight: 700, letterSpacing: '-0.4px' }}>{formatEur(price)}</span>
                <span style={{ fontSize: 12.5, color: '#7a7a7a' }}>{s.perTerm[term]}{team ? ` ${s.forWholeTeam}` : ''}</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#86868b', whiteSpace: 'nowrap' }}>{s.exclVat}</span>
              </div>
              <span style={{ fontSize: 11.5, color: '#7a7a7a' }}>
                {team ? s.perUserEq(formatEur(Math.round(perUserMonth(code, term) * 100) / 100)) : (term !== 'monthly' ? s.perMonthEq(formatEur(Math.round(perMonth(code, term) * 100) / 100)) : ' ')}
              </span>
              <span style={{ fontSize: 12.5, color: '#333', lineHeight: 1.5, flex: 1 }}>{s.planBlurbs[code]}</span>
              {/* No trial badge — checkout charges immediately; the free first
                  week is granted at signup, not by a plan (2026-07-31). */}
              <span
                className="hp-press"
                onClick={() => choose(code)}
                style={{
                  marginTop: 8, textAlign: 'center', borderRadius: 999, padding: '10px 0', fontSize: 13, cursor: 'pointer', fontWeight: 600,
                  ...(popular ? { background: '#0066cc', color: '#fff' } : { border: '1px solid #d2d2d7', background: '#fff' }),
                }}
              >
                {mode === 'checkout' ? s.startTrial : s.confirmSchedule}
              </span>
            </div>
          );
        })}
      </div>

      {/* Downgrade keep-list (schedule mode only) */}
      {pendingDowngrade && org && (
        <div style={{ border: '1px solid #f0c36d', background: '#fff8e8', borderRadius: 14, padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 13, lineHeight: 1.55 }}>
            {s.downgradeSeats(s.planNames[pendingDowngrade], SUB_PLANS[pendingDowngrade].seatLimit, org.members.length)}
          </span>
          <span style={sectionLabel}>{s.keepMembersTitle(SUB_PLANS[pendingDowngrade].seatLimit)}</span>
          {org.members.map(m => {
            const isOwner = m.uid === org.ownerUid;
            const checked = keepUids.includes(m.uid);
            return (
              <label key={m.uid} style={{ display: 'flex', gap: 9, alignItems: 'center', fontSize: 13, cursor: isOwner ? 'default' : 'pointer' }}>
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={isOwner}
                  onChange={() => setKeepUids(prev => checked ? prev.filter(u => u !== m.uid) : (prev.length < SUB_PLANS[pendingDowngrade].seatLimit ? [...prev, m.uid] : prev))}
                />
                {m.email}{isOwner ? ` — ${s.teamAdminLabel}` : ''}
              </label>
            );
          })}
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <span
              className="hp-press"
              onClick={confirmDowngrade}
              style={{ background: keepUids.length === SUB_PLANS[pendingDowngrade].seatLimit ? '#0066cc' : '#b6b6bc', color: '#fff', borderRadius: 999, padding: '8px 18px', fontSize: 12.5, cursor: 'pointer' }}
            >
              {s.confirmSchedule}
            </span>
            <span className="hp-press" onClick={() => setPendingDowngrade(null)} style={{ border: '1px solid #d2d2d7', borderRadius: 999, padding: '8px 18px', fontSize: 12.5, background: '#fff', cursor: 'pointer' }}>
              ✕
            </span>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 11.5, color: '#7a7a7a', lineHeight: 1.55 }}>{s.trialNote}</span>
        <span style={{ fontSize: 11.5, color: '#7a7a7a', lineHeight: 1.55 }}>{s.cancelNote}</span>
        <span style={{ fontSize: 11.5, color: '#7a7a7a', lineHeight: 1.55 }}>{s.fixedTermNote}</span>
        <span style={{ fontSize: 11.5, color: '#9a9aa0', lineHeight: 1.55 }}>{s.vatNote}</span>
        <span style={{ fontSize: 11.5, color: '#9a9aa0', lineHeight: 1.55 }}>{s.eurBillingNote}</span>
      </div>
    </div>
  );
};

/** The whole subscription area: member view / active-subscription view / plan picker. */
const SubscriptionSection: React.FC<{
  app: HpApp;
  org: Organization | null;
  onBilling: () => void;
  /** Trial flow: a trialing team was just created server-side. */
  onOrgCreated?: (orgId: string) => void;
}> = ({ app, org, onBilling, onOrgCreated }) => {
  const t = tr(app.lang);
  const s = t.sub;
  const { user } = app;
  const isPreview = user.id === 'preview';
  const sub = effectiveSubscription(user);   // paid (Paddle) wins; else active marketing grant
  const unlocked = !!sub && subscriptionUnlocked(sub.status, sub.currentPeriodEndsAt);
  const legacyPro = !sub && user.plan === 'premium';
  const [changeReq, setChangeReq] = useState<SubscriptionChangeRequest | null>(null);
  const [scheduling, setScheduling] = useState(false);

  useEffect(() => {
    if (isPreview) return;
    if (sub) getMyChangeRequest(user.id).then(setChangeReq).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id]);

  const openBillingPortal = onBilling;

  // Upgrade-only change requests (owner rule 2026-08-03): the picker calls
  // doSchedule, which opens a CONSENT modal (immediate effect, no charge for
  // the current period, no downgrades/shortening, one change per 30 days).
  // Only after the explicit agreement is the request stored.
  const [pendingChange, setPendingChange] = useState<{ plan: SubPlanCode; term: BillingTerm; keepUids?: string[] } | null>(null);
  const [consentChecked, setConsentChecked] = useState(false);

  const changeCooldownDays = (): number => {
    const last = user.lastPlanChangeAt ? new Date(user.lastPlanChangeAt).getTime() : null;
    if (!last) return 0;
    const left = 30 - Math.floor((Date.now() - last) / 86400000);
    return Math.max(0, left);
  };

  const doSchedule = (plan: SubPlanCode, term: BillingTerm, keepUids?: string[]) => {
    setConsentChecked(false);
    setPendingChange({ plan, term, keepUids });
  };

  const confirmSchedule = () => {
    if (!pendingChange || !consentChecked) return;
    const { plan, term, keepUids } = pendingChange;
    scheduleChange(user, plan, term, keepUids)
      .then(() => {
        setChangeReq({
          id: user.id, userId: user.id, userEmail: user.email,
          currentPlanCode: sub?.planCode ?? '', requestedPlanCode: plan, requestedBillingTerm: term,
          effectiveAt: sub?.currentPeriodEndsAt ?? null, status: 'scheduled', createdAt: new Date().toISOString(),
        });
        setScheduling(false);
        setPendingChange(null);
        app.notify(s.scheduledOk);
      })
      .catch(() => { setPendingChange(null); app.notify(s.inviteFailed); });
  };

  // Immediate cancellation (owner spec 2026-08-03): two-step warning, then the
  // billing function calls Paddle; remaining paid time is forfeited.
  const [cxStep, setCxStep] = useState<0 | 1 | 2>(0);
  const [cxBusy, setCxBusy] = useState(false);
  const runCancel = async () => {
    setCxBusy(true);
    try {
      const r = await cancelSubscriptionFn();
      if (!r.ok) throw new Error(r.error || 'cancel-failed');
      app.notify(s.cxDone);
      setCxStep(0);
      // Reflect locally right away (the webhook confirms server-side).
      app.patchUser({
        subscription: user.subscription ? { ...user.subscription, status: 'canceled' } : undefined,
      });
    } catch {
      app.notify(s.cxFailed);
      setCxStep(0);
    } finally { setCxBusy(false); }
  };

  const fmt = (d?: string | null) => (d ? shortDate(d, t.locale) : '—');

  // ── Team member: access managed by the team admin — no billing controls ──
  if (user.orgRole === 'member' && org) {
    return (
      <div style={{ border: '1px solid #e0e0e0', borderRadius: 18, padding: '26px 28px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <CardTitle style={{ fontSize: 21 }}>{s.currentTitle}</CardTitle>
          <span style={pill('#e7f6ee', '#0a7a43')}>{s.memberViewBadge} · {s.planNames[org.planCode]}</span>
        </div>
        <span style={{ fontSize: 13.5, color: '#333', lineHeight: 1.6, maxWidth: 640 }}>
          {s.memberViewText(s.planNames[org.planCode], org.ownerEmail)}
        </span>
        <span style={{ fontSize: 12, color: '#7a7a7a' }}>{t.team.memberNoBilling}</span>
      </div>
    );
  }

  // ── Active subscription (or legacy premium): status + management ──
  if (unlocked || legacyPro) {
    const statusLine = legacyPro
      ? t.account.planBadge
      : sub!.provider === 'free_grant'
        ? s.freeGrantBadge(fmt(sub!.currentPeriodEndsAt))
        : sub!.status === 'trialing' ? s.statusTrialing(fmt(sub!.trialEndsAt ?? sub!.currentPeriodEndsAt))
        : sub!.status === 'past_due' ? s.statusPastDue
        : sub!.cancelAtPeriodEnd || sub!.status === 'canceled' ? s.statusCanceled(fmt(sub!.currentPeriodEndsAt))
        : s.statusActive(fmt(sub!.currentPeriodEndsAt));
    return (
      <>
        <div style={{ border: '1px solid #e0e0e0', borderRadius: 18, padding: '26px 28px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <CardTitle style={{ fontSize: 21 }}>{s.currentTitle}</CardTitle>
            <span style={pill('#e7f6ee', '#0a7a43')}>
              {legacyPro ? t.account.planBadge : `${s.planNames[sub!.planCode]}${sub!.billingTerm ? ` · ${s.termNames[sub!.billingTerm]}` : ''}`}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 26, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={sectionLabel}>{s.currentPlanLabel}</span>
              <span style={{ fontSize: 14, fontWeight: 600 }}>
                {legacyPro ? 'HeatPump DB Pro' : `${s.planNames[sub!.planCode]}${sub!.billingTerm ? ` · ${s.termNames[sub!.billingTerm]}` : ''}`}
              </span>
              <span style={{ fontSize: 12.5, color: '#7a7a7a' }}>{statusLine}</span>
            </div>
            {changeReq && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span style={sectionLabel}>{s.nextPlanLabel}</span>
                <span style={{ fontSize: 14, fontWeight: 600 }}>
                  {s.planNames[changeReq.requestedPlanCode]} · {s.termNames[changeReq.requestedBillingTerm]}
                </span>
                <span style={{ fontSize: 12.5, color: '#7a7a7a' }}>{s.startsOn(fmt(changeReq.effectiveAt))}</span>
              </div>
            )}
          </div>
          <span style={{ fontSize: 12, color: '#7a7a7a', lineHeight: 1.55, maxWidth: 640 }}>{t.account.planStoreNote}</span>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <span className="hp-press" onClick={openBillingPortal} style={{ background: '#0066cc', color: '#fff', borderRadius: 999, padding: '10px 22px', fontSize: 13.5, cursor: 'pointer' }}>
              {t.account.managePlan}
            </span>
            {!legacyPro && !changeReq && (
              <span className="hp-press" onClick={() => {
                const left = changeCooldownDays();
                if (left > 0) { app.notify(s.upgradeCooldown(left)); return; }
                setScheduling(v => !v);
              }} style={{ border: '1px solid #d2d2d7', borderRadius: 999, padding: '10px 22px', fontSize: 13.5, background: scheduling ? '#1d1d1f' : '#fff', color: scheduling ? '#fff' : '#1d1d1f', cursor: 'pointer' }}>
                {s.changeAtRenewal}
              </span>
            )}
            {!legacyPro && sub!.provider === 'paddle' && sub!.status !== 'canceled' && (
              <span className="hp-press" onClick={() => setCxStep(1)}
                style={{ border: '1px solid #e8c5be', color: '#b3261e', borderRadius: 999, padding: '10px 22px', fontSize: 13.5, background: '#fff', cursor: 'pointer' }}
                data-testid="cancel-subscription">
                {s.cxTitle}
              </span>
            )}
            {changeReq && (
              <span
                className="hp-press"
                onClick={() => cancelChange(user.id).then(() => { setChangeReq(null); app.notify(s.scheduleCancelled); })}
                style={{ border: '1px solid #d2d2d7', borderRadius: 999, padding: '10px 22px', fontSize: 13.5, background: '#fff', cursor: 'pointer' }}
              >
                {s.cancelScheduled}
              </span>
            )}
          </div>
          <span style={{ fontSize: 11.5, color: '#9a9aa0' }}>{s.cancelNote}</span>
          {scheduling && !legacyPro && (
            <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <span style={{ fontSize: 13.5, fontWeight: 600 }}>{s.scheduleTitle}</span>
              <span style={{ fontSize: 12.5, color: '#7a7a7a' }}>{s.scheduleApply(fmt(sub!.currentPeriodEndsAt))}</span>
              <PlanPicker app={app} mode="schedule" org={org} onSchedule={doSchedule}
                minPlan={sub!.planCode} minTerm={sub!.billingTerm ?? 'monthly'} />
            </div>
          )}
        </div>

        {/* Immediate-cancel double warning (owner spec 2026-08-03) */}
        {cxStep === 1 && (
          <DangerStepModal title={s.cxWarn1Title} body={s.cxWarn1Body}
            confirmLabel={s.cxContinue} backLabel={s.cxBack}
            onConfirm={() => setCxStep(2)} onBack={() => setCxStep(0)} />
        )}
        {cxStep === 2 && (
          <DangerStepModal final busy={cxBusy} title={s.cxWarn2Title} body={s.cxWarn2Body}
            confirmLabel={s.cxFinal} backLabel={s.cxBack}
            onConfirm={runCancel} onBack={() => setCxStep(0)} />
        )}

        {/* Upgrade consent (upgrade-only, once / 30 days) */}
        {pendingChange && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <div style={{ background: '#fff', borderRadius: 18, padding: '26px 26px 22px', maxWidth: 480, width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }} data-testid="upgrade-consent">
              <span style={{ fontFamily: FD, fontSize: 19, fontWeight: 700 }}>{s.upgradeConsentTitle}</span>
              <span style={{ fontSize: 13, color: '#7a7a7a' }}>
                {s.planNames[pendingChange.plan]} · {s.termNames[pendingChange.term]}
              </span>
              <span style={{ fontSize: 13.5, color: '#333', lineHeight: 1.65 }}>{s.upgradeConsentBody}</span>
              <label style={{ display: 'flex', gap: 9, alignItems: 'flex-start', fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" checked={consentChecked} onChange={e => setConsentChecked(e.target.checked)} style={{ marginTop: 2 }} data-testid="upgrade-consent-check" />
                <span>{s.upgradeConsentCheck}</span>
              </label>
              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <span className="hp-press" onClick={() => setPendingChange(null)} style={{ flex: 1, textAlign: 'center', border: '1px solid #d2d2d7', borderRadius: 999, padding: '11px 16px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>
                  {t.account.copyFailed ? s.cxBack : s.cxBack}
                </span>
                <span className="hp-press" onClick={consentChecked ? confirmSchedule : undefined}
                  style={{ flex: 1, textAlign: 'center', borderRadius: 999, padding: '11px 16px', fontSize: 13.5, fontWeight: 700, cursor: consentChecked ? 'pointer' : 'not-allowed', background: consentChecked ? '#0066cc' : '#c7c7cc', color: '#fff' }}
                  data-testid="upgrade-consent-confirm">
                  {s.upgradeConfirm}
                </span>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  // ── No subscription yet: the two-step picker ──
  const inOwnTrial = accessInfo(user).state === 'trial';
  const startTeamTrial = (plan: 'team_3' | 'team_5') => {
    if (isPreview) { app.notify(t.account.previewOnly); return; }
    createTeamOrgFn(plan)
      .then(r => {
        if (r.ok && r.orgId) { app.notify(t.trial.teamStartCreated); onOrgCreated?.(r.orgId); }
        else app.notify(t.trial.teamStartFailed);
      })
      .catch(() => app.notify(t.trial.teamStartFailed));
  };
  return (
    <div style={{ border: '1px solid #e0e0e0', borderRadius: 18, padding: '26px 28px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <CardTitle style={{ fontSize: 21 }}>{s.pickTitle}</CardTitle>
        <span style={{ fontSize: 13.5, color: '#7a7a7a' }}>{s.pickSub}</span>
      </div>
      <PlanPicker app={app} mode="checkout" />
      {/* Team during the free trial: create the org now (no payment), invite
          members right away — everyone runs on the admin's trial end date. */}
      {TRIAL_FLOW_ENABLED && inOwnTrial && !org && (
        <div data-testid="team-trial-card" style={{ borderTop: '1px solid #f0f0f0', paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 13.5, fontWeight: 600 }}>{t.trial.teamStartTitle}</span>
          <span style={{ fontSize: 12.5, color: '#7a7a7a', lineHeight: 1.55, maxWidth: 640 }}>{t.trial.teamStartBody}</span>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {(['team_3', 'team_5'] as const).map(p => (
              <span
                key={p}
                className="hp-press"
                onClick={() => startTeamTrial(p)}
                style={{ border: '1px solid #d2d2d7', borderRadius: 999, padding: '9px 20px', fontSize: 13, cursor: 'pointer' }}
                data-testid={`team-trial-${p}`}
              >
                {t.trial.teamStartBtn(s.planNames[p], SUB_PLANS[p].seatLimit)}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Devices & sessions — the concurrent-session limit's visibility surface
 * (docs/CONCURRENT_SESSIONS.md). Session docs are CLIENT-READ-ONLY: this card
 * subscribes to the list and calls the server function for every action —
 * there is deliberately no client write path to session state.
 */
const SessionsCard: React.FC<{ app: HpApp }> = ({ app }) => {
  const t = tr(app.lang);
  const s = t.session;
  const { user } = app;
  const isPreview = user.id === 'preview';
  const mySid = getSessionId();
  const [sessions, setSessions] = useState<{ id: string; deviceName?: string; lastSeenAt?: any; revokedAt?: any }[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isPreview) return;
    const unsub = onSnapshot(
      collection(db, 'users', user.id, 'sessions'),
      snap => setSessions(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }))),
      () => {},   // fail-open: the card just stays empty
    );
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id]);

  // Show only sessions the SERVER considers active (same 10-minute lastSeenAt
  // window the limit enforcement uses — docs/CONCURRENT_SESSIONS.md). Idle
  // docs from closed browsers/old logins stay out of sight; "Sign out other
  // devices" still revokes them server-side regardless of what is listed.
  const ACTIVE_WINDOW_MS = 10 * 60 * 1000;
  const alive = sessions
    .filter(x => !x.revokedAt)
    .filter(x => x.id === mySid || (tsToMillis(x.lastSeenAt) ?? 0) > Date.now() - ACTIVE_WINDOW_MS)
    .sort((a, b) => (tsToMillis(b.lastSeenAt) ?? 0) - (tsToMillis(a.lastSeenAt) ?? 0));

  const fmtSeen = (v: any) => {
    const ms = tsToMillis(v);
    if (ms == null) return '—';
    const mins = Math.max(0, Math.round((Date.now() - ms) / 60000));
    if (mins < 1) return s.lastSeen(app.lang === 'de' ? 'jetzt' : 'now');
    if (mins < 60) return s.lastSeen(`${mins} min`);
    return s.lastSeen(shortDate(new Date(ms).toISOString(), t.locale));
  };

  const act = (fn: () => Promise<{ ok: boolean }>, after?: () => void) => {
    if (isPreview) { app.notify(t.account.previewOnly); return; }
    setBusy(true);
    fn()
      .then(r => { app.notify(r.ok ? s.done : s.failed); after?.(); })
      .catch(() => app.notify(s.failed))
      .finally(() => setBusy(false));
  };

  return (
    <Card style={{ gap: 10 }}>
      <CardTitle>{s.cardTitle}</CardTitle>
      <span style={{ fontSize: 12.5, color: '#7a7a7a', lineHeight: 1.55 }}>{s.cardText}</span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }} data-testid="session-list">
        {alive.map(x => (
          <div key={x.id} style={{ display: 'flex', alignItems: 'center', gap: 10, border: '1px solid #f0f0f0', borderRadius: 10, padding: '9px 13px', fontSize: 13 }}>
            <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
              <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {x.deviceName || x.id.slice(0, 8)}
                {x.id === mySid && (
                  <span style={{ marginLeft: 8, fontSize: 10.5, fontWeight: 700, background: '#e7f6ee', color: '#0a7a43', borderRadius: 999, padding: '2px 8px' }}>{s.thisDevice}</span>
                )}
              </span>
              <span style={{ fontSize: 11.5, color: '#7a7a7a' }}>{fmtSeen(x.lastSeenAt)}</span>
            </div>
            {x.id !== mySid && (
              <span
                onClick={() => act(() => revokeSessionFn(x.id))}
                style={{ marginLeft: 'auto', color: '#0066cc', fontSize: 12.5, cursor: 'pointer', flex: 'none' }}
              >
                {s.signOutOne}
              </span>
            )}
          </div>
        ))}
        {alive.filter(x => x.id !== mySid).length === 0 && (
          <span style={{ fontSize: 12.5, color: '#9a9aa0' }}>{s.noneOther}</span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <span
          className="hp-press"
          onClick={() => !busy && act(() => revokeOtherSessionsFn())}
          style={{ border: '1px solid #d2d2d7', borderRadius: 999, padding: '8px 16px', fontSize: 12.5, cursor: 'pointer', background: '#fff' }}
          data-testid="signout-others"
        >
          {s.signOutOthers}
        </span>
        <span
          className="hp-press"
          onClick={() => {
            if (busy) return;
            if (!window.confirm(s.confirmAll)) return;
            act(() => signOutEverywhereFn(), () => setTimeout(app.onLogout, 900));
          }}
          style={{ border: '1px solid #d2d2d7', borderRadius: 999, padding: '8px 16px', fontSize: 12.5, cursor: 'pointer', background: '#fff', color: '#c0392b' }}
          data-testid="signout-all"
        >
          {s.signOutAll}
        </span>
      </div>
    </Card>
  );
};

/** Compact direct-email card for advertising / business enquiries. No form,
 *  no admin workflow — a mailto link only (marketing@heatpumpdb.eu). */
const AdvertisingCard: React.FC<{ app: HpApp }> = ({ app }) => {
  const t = tr(app.lang);
  return (
    <Card style={{ gap: 9 }}>
      <CardTitle>{t.account.adPartner}</CardTitle>
      <span style={{ fontSize: 13, color: '#333', lineHeight: 1.5 }}>{t.account.adPartnerText}</span>
      <a href={`mailto:${MARKETING_EMAIL}`} style={{ fontSize: 13, color: '#0066cc', textDecoration: 'none', marginTop: 2 }} data-testid="marketing-email">{MARKETING_EMAIL}</a>
    </Card>
  );
};

export const AccountPage: React.FC<{ app: HpApp }> = ({ app }) => {
  const t = tr(app.lang);
  const { user } = app;
  const displayName = [user.firstName, user.lastName].filter(Boolean).join(' ') || '—';
  const isPreview = user.id === 'preview';

  // The organization is fetched once here: the subscription section, the team
  // cards and the Team management subview all read the same copy.
  const [org, setOrg] = useState<Organization | null>(null);
  const [view, setView] = useState<'account' | 'team'>('account');

  useEffect(() => {
    if (isPreview) { setOrg(previewOrg(user)); return; }
    if (user.orgId) getMyOrg(user).then(setOrg).catch(() => {});
    else setOrg(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id, user.orgId]);

  const isOwner = user.orgRole === 'team_admin' && !!org;
  const isMember = user.orgRole === 'member' && !!org;

  // Paddle customer portal (payment method, invoices, stop-next-renewal).
  // Portal URLs carry temporary auth tokens, so a session is minted
  // server-side on EVERY click — never stored (Paddle requirement).
  const openBillingPortal = () => {
    if (isPreview) { app.notify(t.account.previewOnly); return; }
    if (!TRIAL_FLOW_ENABLED || !user.paddleCustomerId) { app.notify(t.account.managePlanSoon); return; }
    billingPortalFn()
      .then(r => {
        if (r.ok && r.url) window.open(r.url, '_blank', 'noopener');
        else app.notify(t.account.managePlanSoon);
      })
      .catch(() => app.notify(t.account.managePlanSoon));
  };

  const sendSetupLink = () => {
    if (isPreview) { app.notify(t.account.previewOnly); return; }
    sendPasswordResetEmail(auth, user.email)
      .then(() => app.notify(t.account.linkSent(user.email)))
      .catch(() => app.notify(t.account.linkFailed));
  };

  const [delStep, setDelStep] = useState<0 | 1 | 2>(0);
  const [delBusy, setDelBusy] = useState(false);

  const deleteAccount = () => {
    if (isPreview) { app.notify(t.account.previewOnly); return; }
    // A team owner cannot walk away and strand their members — ownership
    // transfer goes through Support (New inquiry).
    if (isOwner && org && org.members.length > 1) {
      app.notify(t.account.delOwnerBlocked);
      return;
    }
    setDelStep(1);   // two-step warning (owner spec 2026-08-03)
  };

  const runDelete = async () => {
    setDelBusy(true);
    try {
      if (TRIAL_FLOW_ENABLED) {
        // Server-side deletion: one Firestore transaction (registry retention,
        // seat release, PII removal) + Auth account removal, all idempotent.
        const r = await deleteAccountFn();
        if (!r.ok) {
          app.notify(r.error === 'team-has-members' ? t.account.delOwnerBlocked : t.account.delFailed);
          return;
        }
      } else {
        // Legacy flow: a member leaves the team first, so the seat is freed
        // rather than left pointing at a deleted account.
        if (isMember && org) await leaveTeam(org, user).catch(() => {});
        await requestDeletion(user.id, 'Self-service request from Account page', displayName);
      }
      app.notify(t.account.delDone);
      setDelStep(0);
      setTimeout(app.onLogout, 1800);
    } catch {
      app.notify(t.account.delFailed);
    } finally {
      setDelBusy(false);
      setDelStep(0);
    }
  };

  const shell = (children: React.ReactNode) => (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <div style={{ background: '#f5f5f7', padding: '40px 48px 32px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontFamily: FD, fontSize: 34, fontWeight: 600, letterSpacing: '-0.374px' }}>{t.account.heroTitle}</span>
        <span style={{ fontSize: 17, color: '#7a7a7a', letterSpacing: '-0.374px' }}>{t.account.heroSub}</span>
      </div>
      {delStep === 1 && (
        <DangerStepModal title={t.account.del} body={t.account.delConfirm.replace(/\n\n/g, ' ')}
          confirmLabel={t.sub.cxContinue} backLabel={t.sub.cxBack}
          onConfirm={() => setDelStep(2)} onBack={() => setDelStep(0)} />
      )}
      {delStep === 2 && (
        <DangerStepModal final busy={delBusy} title={t.sub.delWarn2Title} body={t.sub.delWarn2Body}
          confirmLabel={t.sub.delFinal} backLabel={t.sub.cxBack}
          onConfirm={runDelete} onBack={() => setDelStep(0)} />
      )}
      <div style={{ maxWidth: 1160, width: '100%', margin: '0 auto', padding: '28px 48px 48px', display: 'flex', flexDirection: 'column', gap: 20, boxSizing: 'border-box' }}>
        {children}
      </div>
    </div>
  );

  // ── Account → Team management (a subview, never a separate app) ──────────
  if (view === 'team' && org && isOwner) {
    return shell(
      <TeamManagementView
        app={app}
        org={org}
        onBack={() => setView('account')}
        onChanged={setOrg}
        onManageBilling={openBillingPortal}
      />,
    );
  }

  return shell(
    <>
      {/* 1. Subscription & billing (a member sees their company's plan, read-only) */}
      <SubscriptionSection
        app={app}
        org={org}
        onBilling={openBillingPortal}
        onOrgCreated={(orgId) => {
          // Server set orgId/orgRole on the profile; mirror locally and load the org.
          app.patchUser({ orgId, orgRole: 'team_admin' });
          getMyOrg({ ...user, orgId, orgRole: 'team_admin' }).then(setOrg).catch(() => {});
        }}
      />

      {/* 2. Cards — two independent columns on desktop, a single stack on mobile.
          Card ORDER is set per card so both layouts are correct from ONE DOM tree:
          on desktop each column sorts its own cards (values are DOM-ascending, so no
          visual change); on mobile the columns become `display:contents` and all
          cards sort into the required single-column sequence 1..7. Adding a country
          changes nothing here — the layout is shared, differences are config only.

          LEFT : Company profile · Support · Terms & policies
          RIGHT: (Team) · App language · Email & password · Advertising · Delete
          Mobile: Company · App language · Email · Support · Advertising · Terms · Delete */}
      <div className="hpiq-acc-cols">
        <div className="hpiq-acc-col">
          {/* L1 · Company (or personal, for a team member) profile */}
          <div style={{ order: 1 }}>
            {isMember
              ? <PersonalProfileCard app={app} org={org} />
              : <CompanyProfileCard app={app} org={org} isOwner={isOwner} onOrgChanged={setOrg} />}
          </div>
          {/* L2 · Support */}
          <div style={{ order: 4 }}><SupportCard app={app} /></div>
          {/* L3 · Terms & policies */}
          <div style={{ order: 6 }}><PoliciesCard app={app} /></div>
        </div>

        <div className="hpiq-acc-col">
          {/* Role-based: Team management (owner) / Your team (member) — sits at the
              top of the right column, and right after Company profile on mobile. */}
          {isOwner && org && <div style={{ order: 1 }}><TeamSummaryCard app={app} org={org} onManage={() => setView('team')} /></div>}
          {isMember && org && <div style={{ order: 1 }}><YourTeamCard app={app} org={org} onLeft={() => setOrg(null)} /></div>}

          {/* R1 · App language */}
          <div style={{ order: 2 }}>
            <Card style={{ gap: 12 }}>
              <CardTitle>{t.account.language}</CardTitle>
              <div style={{ display: 'flex', border: '1px solid #e0e0e0', borderRadius: 999, overflow: 'hidden', fontSize: 13, width: 'fit-content' }}>
                {(([['pl', 'Polski'], ['it', 'Italiano'], ['fr', 'Français'], ['de', 'Deutsch'], ['en', 'English']] as [Language, string][])
                  .filter(([id]) => UI_LANGUAGES.includes(id))).map(([id, label]) => (
                  <span
                    key={id}
                    onClick={() => app.setLang(id)}
                    style={{
                      padding: '7px 18px', cursor: 'pointer',
                      ...(app.lang === id ? { background: '#1d1d1f', color: '#fff', fontWeight: 600 } : { color: '#1d1d1f' }),
                    }}
                  >
                    {label}
                  </span>
                ))}
              </div>
              <span style={{ fontSize: 12.5, color: '#7a7a7a', lineHeight: 1.5 }}>{t.account.languageNote}</span>
              {/* Feature-tour replay — what makes the 5-session invitation
                  ceiling safe: the tour is reachable here forever. */}
              <span
                className="hp-press"
                onClick={() => window.dispatchEvent(new CustomEvent('hpdb-tour-open'))}
                style={{ fontSize: 13, color: '#0066cc', cursor: 'pointer', width: 'fit-content' }}
                data-testid="tour-replay"
              >
                {t.tour.accountReplay} ›
              </span>
            </Card>
          </div>

          {/* R2 · Email & password */}
          <div style={{ order: 3 }}>
            <Card style={{ gap: 9 }}>
              <CardTitle>{t.account.security}</CardTitle>
              <span style={{ fontSize: 13, color: '#333', lineHeight: 1.5 }}>{t.account.securityText}</span>
              <span onClick={sendSetupLink} style={{ color: '#0066cc', fontSize: 13, cursor: 'pointer', marginTop: 2 }}>{t.account.sendLink(user.email)}</span>
            </Card>
          </div>

          {/* R2a · Sign-in methods (link/unlink Google & Apple) */}
          <div style={{ order: 3 }}><SignInMethodsCard app={app} /></div>

          {/* R2b · Devices & sessions (concurrent-session limit — docs/CONCURRENT_SESSIONS.md) */}
          <div style={{ order: 4 }}><SessionsCard app={app} /></div>

          {/* R3 · Advertising & partnerships */}
          <div style={{ order: 5 }}><AdvertisingCard app={app} /></div>

          {/* R4 · Delete account */}
          <div style={{ order: 7 }}>
            <Card style={{ gap: 10 }}>
              <CardTitle>{t.account.del}</CardTitle>
              <span style={{ fontSize: 13, color: '#333', lineHeight: 1.5 }}>{t.account.delText}</span>
              <span style={{ fontSize: 12, color: '#7a7a7a', lineHeight: 1.55, border: '1px solid #e0e0e0', borderRadius: 8, padding: '10px 14px', background: '#f5f5f7' }}>
                {t.account.delStoreNote}
              </span>
              {isOwner && org && org.members.length > 1 && (
                <span style={{ fontSize: 12, color: '#9a6b00', lineHeight: 1.55, border: '1px solid #e8d9b5', borderRadius: 8, padding: '10px 14px', background: '#fdf8ec' }} data-testid="owner-delete-blocked">
                  {t.account.delOwnerBlocked}
                </span>
              )}
              <span
                className="hp-press"
                onClick={deleteAccount}
                style={{ border: '1px solid #d2d2d7', borderRadius: 999, padding: '9px 20px', fontSize: 13, background: '#fff', cursor: 'pointer', width: 'fit-content', color: '#c0392b' }}
                data-testid="delete-account"
              >
                {t.account.delBtn}
              </span>
            </Card>
          </div>
        </div>
      </div>

      {/* Fair use: one-person accounts + no data extraction */}
      <div style={{ border: '1px solid #e8d9b5', background: '#fdf8ec', borderRadius: 14, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 7 }}>
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.06em', color: '#8a6d1f', textTransform: 'uppercase' }}>{t.account.fairUseTitle}</span>
        <span style={{ fontSize: 12.5, color: '#5c4d1e', lineHeight: 1.6 }}>{t.account.fairUseAccount}</span>
        <span style={{ fontSize: 12.5, color: '#5c4d1e', lineHeight: 1.6 }}>{t.account.fairUseData}</span>
      </div>

      {/* Database rights / legal notice — same content container and the same box
          treatment (radius + padding) as the fair-use notice directly above, so
          its left/right edges align with the rest of the page instead of sitting
          flush against the container. Neutral palette; wording unchanged. */}
      <div style={{ border: '1px solid #e0e0e0', background: '#f7f7f9', borderRadius: 14, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', color: '#7a7a7a', textTransform: 'uppercase' }}>{t.account.legalNoticeTitle}</span>
        <p style={{ fontSize: 11, color: '#9a9aa0', lineHeight: 1.65, textAlign: 'justify', margin: 0 }}>{t.account.legalNotice}</p>
        <span style={{ fontSize: 11, color: '#9a9aa0' }}>{t.footer.copyright(new Date().getFullYear())}</span>
      </div>
    </>,
  );
};
