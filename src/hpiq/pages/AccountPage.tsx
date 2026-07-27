/** Account — subscription program, team seats, profile, language, legal. */
import React, { useEffect, useState } from 'react';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../../firebase';
import { requestDeletion } from '../../services/adminService';
import { openCheckout, portalUrlFor, checkoutConfigured } from '../../services/paddleService';
import { TRIAL_FLOW_ENABLED, createTeamOrgFn, deleteAccountFn } from '../../services/billingFnService';
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
  formatEur, perMonth, perUserMonth, isTeamPlan, subscriptionUnlocked, sharedTermDiscountPct,
} from '../../config/subscriptionPlans';
import { FD, sectionLabel } from '../ui';
import { shortDate } from '../model';
import {
  Card, CardTitle, CompanyProfileCard, PersonalProfileCard,
  TeamSummaryCard, YourTeamCard, TeamManagementView, PoliciesCard, SupportCard,
} from './accountParts';
import { previewOrg } from '../devPreview';
import { MARKETING_EMAIL } from '../../config/legal';

/* ── Subscription program ─────────────────────────────────────────────────── */

const pill = (bg: string, color: string): React.CSSProperties => ({
  fontSize: 10.5, fontWeight: 700, letterSpacing: '.04em', borderRadius: 999,
  padding: '3px 10px', background: bg, color, whiteSpace: 'nowrap',
});

/**
 * Two-step plan picker: (1) who — Professional / Team 3 / Team 5,
 * (2) how long — monthly / 6 months / annual. Defaults: annual term,
 * Team 3 Annual highlighted as Most Popular.
 * mode 'checkout' opens Paddle (7-day trial on the price itself);
 * mode 'schedule' registers a renewal-time change instead.
 */
const PlanPicker: React.FC<{
  app: HpApp;
  mode: 'checkout' | 'schedule';
  org?: Organization | null;
  onSchedule?: (plan: SubPlanCode, term: BillingTerm, keepUids?: string[]) => void;
}> = ({ app, mode, org, onSchedule }) => {
  const t = tr(app.lang);
  const s = t.sub;
  const [term, setTerm] = useState<BillingTerm>('annual');
  const [pendingDowngrade, setPendingDowngrade] = useState<SubPlanCode | null>(null);
  const [keepUids, setKeepUids] = useState<string[]>([]);
  const isPreview = app.user.id === 'preview';

  const choose = (plan: SubPlanCode) => {
    if (isPreview) { app.notify(t.account.previewOnly); return; }
    if (mode === 'checkout') {
      if (!checkoutConfigured(plan, term)) { app.notify(s.notConfigured); return; }
      openCheckout(app.user, plan, term).catch(() => app.notify(s.notConfigured));
      return;
    }
    // Schedule mode: downgrades below the current member count need a keep-list.
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
          const popular = code === 'team_3' && term === 'annual';
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
              <span style={{ ...pill('#e7f6ee', '#0a7a43'), width: 'fit-content' }}>{team ? s.teamTrialBadge : s.trialBadge}</span>
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
  const sub = user.subscription;
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

  const doSchedule = (plan: SubPlanCode, term: BillingTerm, keepUids?: string[]) => {
    scheduleChange(user, plan, term, keepUids)
      .then(() => {
        setChangeReq({
          id: user.id, userId: user.id, userEmail: user.email,
          currentPlanCode: sub?.planCode ?? '', requestedPlanCode: plan, requestedBillingTerm: term,
          effectiveAt: sub?.currentPeriodEndsAt ?? null, status: 'scheduled', createdAt: new Date().toISOString(),
        });
        setScheduling(false);
        app.notify(s.scheduledOk);
      })
      .catch(() => app.notify(s.inviteFailed));
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
              <span className="hp-press" onClick={() => setScheduling(v => !v)} style={{ border: '1px solid #d2d2d7', borderRadius: 999, padding: '10px 22px', fontSize: 13.5, background: scheduling ? '#1d1d1f' : '#fff', color: scheduling ? '#fff' : '#1d1d1f', cursor: 'pointer' }}>
                {s.changeAtRenewal}
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
              <PlanPicker app={app} mode="schedule" org={org} onSchedule={doSchedule} />
            </div>
          )}
        </div>
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

  const openBillingPortal = () => {
    if (isPreview) { app.notify(t.account.previewOnly); return; }
    const url = portalUrlFor(user);
    if (url) window.open(url, '_blank', 'noopener');
    else app.notify(t.account.managePlanSoon);
  };

  const sendSetupLink = () => {
    if (isPreview) { app.notify(t.account.previewOnly); return; }
    sendPasswordResetEmail(auth, user.email)
      .then(() => app.notify(t.account.linkSent(user.email)))
      .catch(() => app.notify(t.account.linkFailed));
  };

  const deleteAccount = async () => {
    if (isPreview) { app.notify(t.account.previewOnly); return; }
    // A team owner cannot walk away and strand their members — ownership
    // transfer goes through Support (New inquiry).
    if (isOwner && org && org.members.length > 1) {
      app.notify(t.account.delOwnerBlocked);
      return;
    }
    if (!window.confirm(t.account.delConfirm)) return;
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
      setTimeout(app.onLogout, 1800);
    } catch {
      app.notify(t.account.delFailed);
    }
  };

  const shell = (children: React.ReactNode) => (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <div style={{ background: '#f5f5f7', padding: '40px 48px 32px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontFamily: FD, fontSize: 34, fontWeight: 600, letterSpacing: '-0.374px' }}>{t.account.heroTitle}</span>
        <span style={{ fontSize: 17, color: '#7a7a7a', letterSpacing: '-0.374px' }}>{t.account.heroSub}</span>
      </div>
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
