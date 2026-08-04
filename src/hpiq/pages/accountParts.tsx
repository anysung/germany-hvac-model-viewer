/**
 * Account building blocks — company/personal profile, the team card and the
 * Team management subview.
 *
 * Split out of AccountPage so that page stays readable. All of it is shared by
 * every country edition; nothing here branches on the market.
 *
 * Who owns the company profile:
 *   - Professional  → their own user document (they edit it).
 *   - Team owner    → the ORGANIZATION document (they edit it; members inherit).
 *   - Team member   → read-only view of the organization's data. They may only
 *                     edit their own first/last name.
 */
import React, { useEffect, useState } from 'react';
import { HpApp } from '../appState';
import { tr } from '../i18n';
import { FD, sectionLabel } from '../ui';
import { shortDate } from '../model';
import { Organization, SupportTicket, TicketCategory, User } from '../../types';
import { createTicket, getMyTickets, userReply, deleteMyTicket } from '../../services/supportService';
import { COMPANY_TYPES, COMPANY_TYPE_OTHER_MAX, normalizeCompanyType } from '../../config/companyTypes';
import { LEGAL_ROUTES, LegalDoc } from '../../config/legal';
import { LEGAL_NAV } from '../../legal/LegalPage';
import { normalizeWebsite, trim, websiteHref } from '../../utils/profile';
import {
  updateMyProfile, currentSignInMethods, linkSignInProvider, unlinkSignInProvider,
} from '../../services/authService';
import {
  inviteMember, cancelInvite, resendInvite, removeMember, leaveTeam,
  updateOrgCompany, seatsUsed,
} from '../../services/subscriptionService';
import { SUB_PLAN_NAMES } from '../../config/subscriptionPlans';

export const Card: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div style={{ border: '1px solid #e0e0e0', borderRadius: 18, padding: '24px 26px', display: 'flex', flexDirection: 'column', ...style }}>{children}</div>
);

export const CardTitle: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <span style={{ fontFamily: FD, fontSize: 19, fontWeight: 600, letterSpacing: '-0.2px', ...style }}>{children}</span>
);

/** A profile row. Optional rows with no value are simply not rendered. */
export const Row: React.FC<{ label: string; value?: string | null; href?: string; last?: boolean }> = ({ label, value, href, last }) => {
  if (!trim(value)) return null;
  return (
    <span style={{ display: 'flex', justifyContent: 'space-between', gap: 16, fontSize: 13.5, padding: '10px 0', borderBottom: last ? undefined : '1px solid #f0f0f0' }}>
      <span style={{ color: '#7a7a7a' }}>{label}</span>
      {href
        ? <a href={href} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 600, color: '#0066cc', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</a>
        : <span style={{ fontWeight: 600, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</span>}
    </span>
  );
};

const input: React.CSSProperties = {
  border: '1px solid #d2d2d7', borderRadius: 10, padding: '9px 12px', fontSize: 13.5,
  fontFamily: 'inherit', background: '#fff', outline: 'none', width: '100%', boxSizing: 'border-box',
};
const btn = (primary?: boolean): React.CSSProperties => ({
  borderRadius: 999, padding: '9px 20px', fontSize: 13, cursor: 'pointer', width: 'fit-content',
  ...(primary ? { background: '#0066cc', color: '#fff' } : { border: '1px solid #d2d2d7', background: '#fff', color: '#1d1d1f' }),
});
const pill = (bg: string, color: string): React.CSSProperties => ({
  fontSize: 11.5, fontWeight: 600, borderRadius: 999, padding: '3px 10px', background: bg, color,
});

/** The company fields, as edited on the Account page and in Team settings. */
export interface CompanyFields {
  companyName: string;
  companyType: string;
  companyTypeOther?: string;
  companyCity?: string;
  companyWebsite?: string;
}

/** Shared company-fields form (user profile AND organization settings use it). */
export const CompanyForm: React.FC<{
  app: HpApp;
  initial: CompanyFields;
  onSave: (fields: CompanyFields) => Promise<void>;
  onCancel: () => void;
  extra?: React.ReactNode;
}> = ({ app, initial, onSave, onCancel, extra }) => {
  const t = tr(app.lang);
  const [f, setF] = useState<CompanyFields>({ ...initial, companyType: normalizeCompanyType(initial.companyType) ?? '' });
  const [busy, setBusy] = useState(false);
  const isOther = f.companyType === 'other';
  const isIndividual = f.companyType === 'individual';

  const save = async () => {
    if (busy) return;
    if (!trim(f.companyName) || !f.companyType) { app.notify(t.account.saveFailed); return; }
    if (isOther && !trim(f.companyTypeOther)) { app.notify(t.company.otherLabel); return; }
    const site = normalizeWebsite(f.companyWebsite);
    if (site === null) { app.notify(t.account.saveFailed); return; }
    setBusy(true);
    try {
      await onSave({
        companyName: trim(f.companyName),
        companyType: f.companyType,
        companyTypeOther: isOther ? trim(f.companyTypeOther).slice(0, COMPANY_TYPE_OTHER_MAX) : '',
        companyCity: trim(f.companyCity),
        companyWebsite: site,
      });
      app.notify(t.account.savedOk);
    } catch {
      app.notify(t.account.saveFailed);
    } finally { setBusy(false); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
      {extra}
      <label style={sectionLabel}>{t.account.fCompanyName}</label>
      <input style={input} value={f.companyName} onChange={e => setF({ ...f, companyName: e.target.value })} data-testid="company-name" />
      {isIndividual && <span style={{ fontSize: 12, color: '#9a6b00', background: '#fff4e0', borderRadius: 8, padding: '8px 11px', lineHeight: 1.5 }}>{t.company.individualHint}</span>}

      <label style={sectionLabel}>{t.account.fCompanyType}</label>
      <select style={input} value={f.companyType} onChange={e => setF({ ...f, companyType: e.target.value })} data-testid="company-type">
        <option value="">—</option>
        {COMPANY_TYPES.map(c => <option key={c} value={c}>{t.company.types[c]}</option>)}
      </select>

      {isOther && (
        <>
          <label style={sectionLabel}>{t.company.otherLabel}</label>
          <input style={input} maxLength={COMPANY_TYPE_OTHER_MAX} value={f.companyTypeOther ?? ''} onChange={e => setF({ ...f, companyTypeOther: e.target.value })} data-testid="company-type-other" />
        </>
      )}

      <label style={sectionLabel}>{t.account.fCity}</label>
      <input style={input} value={f.companyCity ?? ''} onChange={e => setF({ ...f, companyCity: e.target.value })} />

      <label style={sectionLabel}>{t.account.fWebsite}</label>
      <input style={input} placeholder="example.com" value={f.companyWebsite ?? ''} onChange={e => setF({ ...f, companyWebsite: e.target.value })} />

      <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
        <span className="hp-press" onClick={save} style={{ ...btn(true), opacity: busy ? 0.6 : 1 }}>{t.account.saveBtn}</span>
        <span className="hp-press" onClick={onCancel} style={btn()}>{t.account.cancelBtn}</span>
      </div>
    </div>
  );
};

/** Company profile — editable by a Professional (own profile) or a Team owner (org). */
export const CompanyProfileCard: React.FC<{
  app: HpApp;
  org: Organization | null;
  isOwner: boolean;
  onOrgChanged: (o: Organization) => void;
}> = ({ app, org, isOwner, onOrgChanged }) => {
  const t = tr(app.lang);
  const { user } = app;
  const isPreview = user.id === 'preview';
  const [editing, setEditing] = useState(false);

  // A team owner edits the ORG record (members inherit it); everyone else their own.
  const source: CompanyFields = isOwner && org
    ? {
        companyName: org.companyName ?? org.name ?? '',
        companyType: org.companyType ?? '',
        companyTypeOther: org.companyTypeOther,
        companyCity: org.companyCity,
        companyWebsite: org.companyWebsite,
      }
    : {
        companyName: user.companyName ?? '',
        companyType: user.companyType ?? '',
        companyTypeOther: user.companyTypeOther,
        companyCity: user.companyCity,
        companyWebsite: user.companyWebsite,
      };

  const typeCode = normalizeCompanyType(source.companyType);
  const typeLabel = typeCode ? t.company.types[typeCode] : '';

  const save = async (f: CompanyFields) => {
    if (isPreview) { app.notify(t.account.previewOnly); setEditing(false); return; }
    if (isOwner && org) {
      await updateOrgCompany(org, f);
      onOrgChanged({ ...org, ...f, name: f.companyName });
    } else {
      await updateMyProfile(user.id, f);
      app.patchUser(f);
    }
    setEditing(false);
  };

  return (
    <Card style={{ gap: 4 }} >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <CardTitle>{t.account.companyProfile}</CardTitle>
        {isOwner && <span style={pill('#eef4ff', '#0055aa')}>{t.team.owner}</span>}
      </div>
      <Row label={t.account.email} value={user.email} />
      <Row label={t.account.displayName} value={[user.firstName, user.lastName].filter(Boolean).join(' ')} />
      {!editing && (
        <>
          <Row label={t.account.fCompanyName} value={source.companyName} />
          <Row label={t.account.fCompanyType} value={typeLabel} />
          {typeCode === 'other' && <Row label={t.account.fCompanyTypeOther} value={source.companyTypeOther} />}
          <Row label={t.account.fCity} value={source.companyCity} />
          <Row label={t.account.fWebsite} value={source.companyWebsite} href={websiteHref(source.companyWebsite)} last />
          <span className="hp-press" onClick={() => setEditing(true)} style={{ fontSize: 12.5, color: '#0066cc', cursor: 'pointer', marginTop: 8 }} data-testid="edit-company">
            {t.account.editProfile}
          </span>
        </>
      )}
      {editing && (
        <CompanyForm
          app={app}
          initial={source}
          onCancel={() => setEditing(false)}
          onSave={save}
          extra={isOwner ? <span style={{ fontSize: 12, color: '#7a7a7a' }}>{t.team.companyNote}</span> : undefined}
        />
      )}
    </Card>
  );
};

/** Team member: read-only company info + their own name. */
export const PersonalProfileCard: React.FC<{ app: HpApp; org: Organization | null }> = ({ app, org }) => {
  const t = tr(app.lang);
  const { user } = app;
  const isPreview = user.id === 'preview';
  const [editing, setEditing] = useState(false);
  const [first, setFirst] = useState(user.firstName ?? '');
  const [last, setLast] = useState(user.lastName ?? '');
  const [busy, setBusy] = useState(false);

  const typeCode = normalizeCompanyType(org?.companyType);

  const save = async () => {
    if (busy) return;
    if (!trim(first) || !trim(last)) { app.notify(t.account.saveFailed); return; }
    if (isPreview) { app.notify(t.account.previewOnly); setEditing(false); return; }
    setBusy(true);
    try {
      await updateMyProfile(user.id, { firstName: trim(first), lastName: trim(last) });
      app.patchUser({ firstName: trim(first), lastName: trim(last) });
      app.notify(t.account.savedOk);
      setEditing(false);
    } catch { app.notify(t.account.saveFailed); } finally { setBusy(false); }
  };

  return (
    <Card style={{ gap: 4 }}>
      <CardTitle style={{ marginBottom: 8 }}>{t.account.personalProfile}</CardTitle>
      <Row label={t.account.email} value={user.email} />
      {!editing ? (
        <>
          <Row label={t.account.fFirstName} value={user.firstName} />
          <Row label={t.account.fLastName} value={user.lastName} last />
          <span className="hp-press" onClick={() => setEditing(true)} style={{ fontSize: 12.5, color: '#0066cc', cursor: 'pointer', margin: '8px 0 4px' }}>
            {t.account.editProfile}
          </span>
        </>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '8px 0' }}>
          <label style={sectionLabel}>{t.account.fFirstName}</label>
          <input style={input} value={first} onChange={e => setFirst(e.target.value)} />
          <label style={sectionLabel}>{t.account.fLastName}</label>
          <input style={input} value={last} onChange={e => setLast(e.target.value)} />
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <span className="hp-press" onClick={save} style={{ ...btn(true), opacity: busy ? 0.6 : 1 }}>{t.account.saveBtn}</span>
            <span className="hp-press" onClick={() => setEditing(false)} style={btn()}>{t.account.cancelBtn}</span>
          </div>
        </div>
      )}

      {/* Company details come from the team and cannot be edited here. */}
      <div style={{ borderTop: '1px solid #f0f0f0', marginTop: 6, paddingTop: 10, display: 'flex', flexDirection: 'column' }}>
        <span style={{ fontSize: 11.5, color: '#9a9aa0', marginBottom: 2 }}>{t.account.managedByAdmin}</span>
        <Row label={t.account.fCompanyName} value={org?.companyName ?? org?.name} />
        <Row label={t.account.fCompanyType} value={typeCode ? t.company.types[typeCode] : ''} />
        <Row label={t.account.fCity} value={org?.companyCity} />
        <Row label={t.account.fWebsite} value={org?.companyWebsite} href={websiteHref(org?.companyWebsite)} last />
      </div>
    </Card>
  );
};

/** Team owner: the summary card on the Account page (Manage team opens the subview). */
export const TeamSummaryCard: React.FC<{ app: HpApp; org: Organization; onManage: () => void }> = ({ app, org, onManage }) => {
  const t = tr(app.lang);
  const owner = org.members.find(m => m.uid === org.ownerUid);
  const invites = (org.invitedEmails ?? []).length;
  return (
    <Card style={{ gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <CardTitle>{t.team.title}</CardTitle>
        <span style={pill('#f0f0f0', '#1d1d1f')}>{SUB_PLAN_NAMES[org.planCode]}</span>
      </div>
      <span style={{ fontSize: 14, fontWeight: 600 }} data-testid="team-seats">{t.team.seats(org.members.length, org.seatLimit)}</span>
      {invites > 0 && <span style={{ fontSize: 12.5, color: '#9a6b00' }} data-testid="team-pending">{t.team.pending(invites)}</span>}
      <span style={{ fontSize: 12.5, color: '#7a7a7a' }}>{t.team.owner}: {owner?.name || owner?.email || app.user.email}</span>
      <span className="hp-press" onClick={onManage} style={{ ...btn(true), marginTop: 4 }} data-testid="manage-team">{t.team.manage}</span>
    </Card>
  );
};

/** Team member: read-only "Your team" card. */
export const YourTeamCard: React.FC<{ app: HpApp; org: Organization; onLeft: () => void }> = ({ app, org, onLeft }) => {
  const t = tr(app.lang);
  const owner = org.members.find(m => m.uid === org.ownerUid);
  const isPreview = app.user.id === 'preview';

  const leave = async () => {
    if (isPreview) { app.notify(t.account.previewOnly); return; }
    if (!window.confirm(t.team.leaveConfirm)) return;
    try {
      await leaveTeam(org, app.user);
      app.patchUser({ orgId: undefined, orgRole: undefined });
      app.notify(t.team.leaveOk);
      onLeft();
    } catch { app.notify(t.team.failed); }
  };

  return (
    <Card style={{ gap: 9 }} >
      <CardTitle>{t.team.yourTeam}</CardTitle>
      <Row label={t.team.company} value={org.companyName ?? org.name} />
      <Row label={t.team.plan} value={SUB_PLAN_NAMES[org.planCode]} />
      <Row label={t.team.owner} value={owner?.name || owner?.email} />
      <Row label={t.team.memberStatus} value={t.team.statusActive} last />
      <span style={{ fontSize: 12.5, color: '#7a7a7a', lineHeight: 1.55, marginTop: 6 }}>{t.team.memberNoBilling}</span>
      <span style={{ fontSize: 12, color: '#7a7a7a', lineHeight: 1.55 }}>{t.team.leaveText}</span>
      <span className="hp-press" onClick={leave} style={{ ...btn(), color: '#c0392b', marginTop: 4 }} data-testid="leave-team">{t.team.leave}</span>
    </Card>
  );
};

/** Account → Team management (a subview, not a separate app). */
export const TeamManagementView: React.FC<{
  app: HpApp;
  org: Organization;
  onBack: () => void;
  onChanged: (o: Organization) => void;
  onManageBilling: () => void;
  /** Phone shell: same features, rows wrap instead of sitting on one line
   *  (owner 2026-08-04 — seat management is simple enough for a phone; the
   *  documented mobile exclusions are the dense table surfaces, not this). */
  compact?: boolean;
}> = ({ app, org, onBack, onChanged, onManageBilling, compact }) => {
  const t = tr(app.lang);
  const isPreview = app.user.id === 'preview';
  const [invite, setInvite] = useState('');
  const [busy, setBusy] = useState(false);
  const [editingCompany, setEditingCompany] = useState(false);

  const used = seatsUsed(org);
  const free = org.seatLimit - used;
  const inviteLink = (email: string) =>
    `${window.location.origin}/?invite=${encodeURIComponent(org.id)}&email=${encodeURIComponent(email)}`;

  const copy = (email: string) =>
    navigator.clipboard?.writeText(inviteLink(email))
      .then(() => app.notify(t.team.linkCopied))
      .catch(() => app.notify(t.account.copyFailed));

  const doInvite = async () => {
    const email = invite.trim().toLowerCase();
    if (!email || busy) return;
    if (isPreview) { app.notify(t.account.previewOnly); return; }
    if (free <= 0) { app.notify(t.team.noSeats); return; }
    setBusy(true);
    try {
      await inviteMember(org, email);
      onChanged({
        ...org,
        invitedEmails: [...(org.invitedEmails ?? []), email],
        invitedAt: { ...(org.invitedAt ?? {}), [email]: new Date().toISOString() },
      });
      setInvite('');
      app.notify(t.team.inviteSent(email));
      copy(email);
    } catch (e: any) {
      app.notify(e?.message === 'no-seats' ? t.team.noSeats : String(e?.message ?? '').startsWith('already') ? t.team.dupInvite : t.team.failed);
    } finally { setBusy(false); }
  };

  const doResend = async (email: string) => {
    if (isPreview) { app.notify(t.account.previewOnly); return; }
    try {
      await resendInvite(org, email);
      onChanged({ ...org, invitedAt: { ...(org.invitedAt ?? {}), [email]: new Date().toISOString() } });
      copy(email);
      app.notify(t.team.resent);
    } catch { app.notify(t.team.failed); }
  };

  const doCancelInvite = async (email: string) => {
    if (isPreview) { app.notify(t.account.previewOnly); return; }
    try {
      await cancelInvite(org, email);
      const rest = { ...(org.invitedAt ?? {}) };
      delete rest[email];
      onChanged({ ...org, invitedEmails: (org.invitedEmails ?? []).filter(e => e !== email), invitedAt: rest });
    } catch { app.notify(t.team.failed); }
  };

  const doRemove = async (uid: string, name: string) => {
    if (isPreview) { app.notify(t.account.previewOnly); return; }
    if (!window.confirm(`${t.team.removeTitle(name)}\n\n${t.team.removeBody}`)) return;
    try {
      await removeMember(org, uid);
      onChanged({ ...org, members: org.members.filter(m => m.uid !== uid), memberUids: (org.memberUids ?? []).filter(u => u !== uid) });
      app.notify(t.team.removed);
    } catch { app.notify(t.team.failed); }
  };

  const row: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: compact ? 7 : 10,
    padding: '11px 0', borderBottom: '1px solid #f0f0f0', fontSize: 13,
    ...(compact ? { flexWrap: 'wrap' } : {}),
  };
  /** On a phone the name takes the full first line; chips/actions wrap under it. */
  const nameCell: React.CSSProperties = compact
    ? { flex: '1 0 100%', minWidth: 0 }
    : { flex: 1, minWidth: 0 };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }} data-testid="team-management">
      <span className="hp-press" onClick={onBack} style={{ fontSize: 13, color: '#0066cc', cursor: 'pointer', width: 'fit-content' }} data-testid="team-back">{t.team.back}</span>

      {/* A. Team summary */}
      <Card style={{ gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <CardTitle>{t.team.title}</CardTitle>
          <span style={pill('#f0f0f0', '#1d1d1f')}>{SUB_PLAN_NAMES[org.planCode]}</span>
          <span style={pill('#e7f6ee', '#0a7a43')} data-testid="tm-seats">{t.team.seats(org.members.length, org.seatLimit)}</span>
        </div>
        <div style={{ display: 'flex', gap: 26, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={sectionLabel}>{t.team.owner}</span>
            <span style={{ fontSize: 13.5, fontWeight: 600 }}>{org.members.find(m => m.uid === org.ownerUid)?.name || org.ownerEmail}</span>
          </div>
          {org.subscriptionStatus && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={sectionLabel}>{t.team.status}</span>
              <span style={{ fontSize: 13.5, fontWeight: 600 }}>{org.subscriptionStatus}</span>
            </div>
          )}
          {org.currentPeriodEndsAt && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={sectionLabel}>{t.team.nextBilling}</span>
              <span style={{ fontSize: 13.5, fontWeight: 600 }}>{shortDate(org.currentPeriodEndsAt, t.locale)}</span>
            </div>
          )}
        </div>
        <span className="hp-press" onClick={onManageBilling} style={{ ...btn(true), marginTop: 4 }}>{t.team.manageBilling}</span>
      </Card>

      {/* B. Active members */}
      <Card style={{ gap: 4 }}>
        <CardTitle style={{ marginBottom: 6 }}>{t.team.members}</CardTitle>
        {org.members.map(m => {
          const isOwner = m.uid === org.ownerUid;
          return (
            <div key={m.uid} style={row}>
              <span style={nameCell}>
                <span style={{ fontWeight: 600, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name || m.email}</span>
                <span style={{ color: '#9a9aa0', fontSize: 12 }}>{m.email}</span>
              </span>
              <span style={pill(isOwner ? '#eef4ff' : '#f5f5f7', isOwner ? '#0055aa' : '#555')}>{isOwner ? t.team.roleOwner : t.team.roleMember}</span>
              <span style={{ fontSize: 11.5, color: '#0a7a43' }}>{t.team.statusActive}</span>
              {!isOwner && (
                <span className="hp-press" onClick={() => doRemove(m.uid, m.name || m.email)} style={{ fontSize: 11.5, color: '#c0392b', border: '1px solid #e8c5be', borderRadius: 999, padding: '4px 12px', cursor: 'pointer' }} data-testid="remove-member">
                  {t.team.remove}
                </span>
              )}
            </div>
          );
        })}
      </Card>

      {/* C. Pending invitations */}
      <Card style={{ gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <CardTitle>{t.team.invites}</CardTitle>
          <span style={pill('#f5f5f7', '#555')} data-testid="tm-free-seats">{t.team.seatsFree(Math.max(0, free))}</span>
        </div>
        {(org.invitedEmails ?? []).map(email => (
          <div key={email} style={row}>
            <span style={{ ...nameCell, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{email}</span>
            <span style={{ fontSize: 11.5, color: '#7a7a7a' }}>
              {org.invitedAt?.[email] ? t.team.invitedOn(shortDate(org.invitedAt[email], t.locale)) : ''}
            </span>
            <span style={{ fontSize: 11.5, color: '#9a6b00' }}>{t.team.statusInvited}</span>
            <span className="hp-press" onClick={() => doResend(email)} style={{ fontSize: 11.5, color: '#0066cc', border: '1px solid #cfe0f5', borderRadius: 999, padding: '4px 12px', cursor: 'pointer' }} data-testid="resend-invite">{t.team.resend}</span>
            <span className="hp-press" onClick={() => doCancelInvite(email)} style={{ fontSize: 11.5, color: '#7a7a7a', border: '1px solid #d2d2d7', borderRadius: 999, padding: '4px 12px', cursor: 'pointer' }} data-testid="cancel-invite">{t.team.cancelInvite}</span>
          </div>
        ))}

        {free > 0 ? (
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <input
              value={invite}
              onChange={e => setInvite(e.target.value)}
              placeholder={t.team.invitePlaceholder}
              type="email"
              style={{ ...input, flex: 1, minWidth: 200 }}
              onKeyDown={e => { if (e.key === 'Enter') doInvite(); }}
              data-testid="invite-email"
            />
            <span className="hp-press" onClick={doInvite} style={{ ...btn(true), opacity: busy ? 0.6 : 1 }} data-testid="invite-send">{t.team.send}</span>
          </div>
        ) : (
          <span style={{ fontSize: 12.5, color: '#9a6b00', marginTop: 8 }} data-testid="no-seats">{t.team.noSeats}</span>
        )}
      </Card>

      {/* D. Company settings — inherited by every member */}
      <Card style={{ gap: 4 }}>
        <CardTitle style={{ marginBottom: 6 }}>{t.team.companySettings}</CardTitle>
        {!editingCompany ? (
          <>
            <Row label={t.account.fCompanyName} value={org.companyName ?? org.name} />
            <Row label={t.account.fCompanyType} value={(() => { const c = normalizeCompanyType(org.companyType); return c ? t.company.types[c] : ''; })()} />
            {normalizeCompanyType(org.companyType) === 'other' && <Row label={t.account.fCompanyTypeOther} value={org.companyTypeOther} />}
            <Row label={t.account.fCity} value={org.companyCity} />
            <Row label={t.account.fWebsite} value={org.companyWebsite} href={websiteHref(org.companyWebsite)} last />
            <span className="hp-press" onClick={() => setEditingCompany(true)} style={{ fontSize: 12.5, color: '#0066cc', cursor: 'pointer', marginTop: 8 }} data-testid="edit-org-company">{t.account.editBtn}</span>
          </>
        ) : (
          <CompanyForm
            app={app}
            initial={{
              companyName: org.companyName ?? org.name ?? '',
              companyType: org.companyType ?? '',
              companyTypeOther: org.companyTypeOther,
              companyCity: org.companyCity,
              companyWebsite: org.companyWebsite,
            }}
            extra={<span style={{ fontSize: 12, color: '#7a7a7a' }}>{t.team.companyNote}</span>}
            onCancel={() => setEditingCompany(false)}
            onSave={async f => {
              if (isPreview) { app.notify(t.account.previewOnly); setEditingCompany(false); return; }
              await updateOrgCompany(org, f);
              onChanged({ ...org, ...f, name: f.companyName });
              setEditingCompany(false);
            }}
          />
        )}
        <span style={{ fontSize: 12, color: '#9a9aa0', marginTop: 8, lineHeight: 1.55 }}>{t.team.ownerTransfer}</span>
      </Card>
    </div>
  );
};

/** Public policy links — same list everywhere, no login needed. */
export const PoliciesCard: React.FC<{ app: HpApp }> = ({ app }) => {
  const t = tr(app.lang);
  return (
    <Card style={{ gap: 9 }}>
      <CardTitle>{t.account.legal}</CardTitle>
      <span style={{ fontSize: 12.5, color: '#7a7a7a' }}>{t.account.legalIntro}</span>
      {(Object.keys(LEGAL_ROUTES) as LegalDoc[]).map(doc => (
        <a
          key={doc}
          href={LEGAL_ROUTES[doc]}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: '#0066cc', fontSize: 13.5, textDecoration: 'none' }}
          data-testid={`policy-${doc}`}
        >
          {LEGAL_NAV[app.lang][doc]} ›
        </a>
      ))}
    </Card>
  );
};

const statusChip = (status: string, label: string) => (
  <span style={{
    fontSize: 10.5, fontWeight: 700, letterSpacing: '.03em', borderRadius: 999, padding: '2.5px 9px',
    ...(status === 'open' ? { background: '#fff4e0', color: '#9a6b00' }
      : status === 'answered' ? { background: '#e6f4ea', color: '#1a7f37' }
      : { background: '#f0f0f0', color: '#7a7a7a' }),
  }}>{label}</span>
);

/**
 * In-app support: create inquiries, read admin replies, follow up — the
 * store-required support channel, wired to the admin inbox.
 *
 * SHARED by the desktop/tablet Account page AND the phone shell (its Support
 * subview), so both use exactly ONE inquiry workflow and one data model. The
 * ticket is tagged with the active country inside supportService.createTicket
 * (user.country || ACTIVE_COUNTRY.code), so phone and desktop inquiries route to
 * the same country Admin context with no per-shell logic.
 *
 * `embedded` drops the outer Card chrome so the phone subview can host it inside
 * its own back-navigated screen without a double border.
 */
/* ── Sign-in methods (link/unlink Google & Apple) ─────────────────────────────
 * Adds LOGIN CREDENTIALS to the existing Firebase account — the account email,
 * team seat, entitlements and billing are keyed to the uid and never change.
 * Popup only (see authService.linkSignInProvider). Shared by the desktop
 * Account page (Card) and the phone shell (plain — caller wraps it). */
export const SignInMethodsCard: React.FC<{ app: HpApp; plain?: boolean }> = ({ app, plain }) => {
  const t = tr(app.lang);
  const a = t.account as any;
  const isPreview = app.user.id === 'preview';
  const [methods, setMethods] = useState<string[]>(currentSignInMethods());
  const [busy, setBusy] = useState(false);

  const notifyError = (e: any) => {
    const code = String(e?.code ?? e?.message ?? '');
    if (code.includes('popup-closed') || code.includes('cancelled-popup')) return; // user backed out
    app.notify(
      code.includes('credential-already-in-use') || code.includes('email-already-in-use') ? a.signinInUse
      : code.includes('popup-blocked') || code.includes('operation-not-supported') ? a.signinPopupBlocked
      : code.includes('last-method') ? a.signinLastMethod
      : a.signinFailed,
    );
  };

  const doLink = async (name: 'google' | 'apple') => {
    if (busy) return;
    if (isPreview) { app.notify(t.account.previewOnly); return; }
    setBusy(true);
    try {
      await linkSignInProvider(name);
      setMethods(currentSignInMethods());
      app.notify(a.signinLinked);
    } catch (e) { notifyError(e); }
    finally { setBusy(false); }
  };

  const doUnlink = async (pid: string) => {
    if (busy) return;
    if (isPreview) { app.notify(t.account.previewOnly); return; }
    if (methods.length <= 1) { app.notify(a.signinLastMethod); return; }
    setBusy(true);
    try {
      await unlinkSignInProvider(pid);
      setMethods(currentSignInMethods());
      app.notify(a.signinUnlinked);
    } catch (e) { notifyError(e); }
    finally { setBusy(false); }
  };

  const row: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid #f0f0f0', fontSize: 13.5 };
  const badge: React.CSSProperties = { fontSize: 11, fontWeight: 600, borderRadius: 999, padding: '3px 10px', background: '#e7f6ee', color: '#0a7a43' };
  const actionBtn = (primary: boolean): React.CSSProperties => ({
    fontSize: 12, borderRadius: 999, padding: '5px 14px', cursor: 'pointer',
    ...(primary ? { background: '#0066cc', color: '#fff' } : { border: '1px solid #d2d2d7', background: '#fff', color: '#1d1d1f' }),
  });

  const providers: Array<{ pid: string; label: string; linkName?: 'google' | 'apple' }> = [
    { pid: 'password', label: a.signinEmailMethod },
    { pid: 'google.com', label: 'Google', linkName: 'google' },
    { pid: 'apple.com', label: 'Apple', linkName: 'apple' },
  ];

  const body = (
    <>
      <span style={{ fontSize: 13, color: '#333', lineHeight: 1.55 }}>{a.signinText}</span>
      <div style={{ display: 'flex', flexDirection: 'column' }} data-testid="signin-methods">
        {providers.map((p, i) => {
          const connected = methods.includes(p.pid);
          return (
            <div key={p.pid} style={{ ...row, ...(i === providers.length - 1 ? { borderBottom: 'none' } : {}) }}>
              <span style={{ flex: 1, fontWeight: 600 }}>{p.label}</span>
              {connected && <span style={badge}>{a.signinConnected}</span>}
              {connected
                ? (methods.length > 1 && (
                    <span className="hp-press" onClick={() => doUnlink(p.pid)} style={actionBtn(false)} data-testid={`signin-unlink-${p.pid}`}>
                      {a.signinDisconnect}
                    </span>
                  ))
                : (p.linkName && (
                    <span className="hp-press" onClick={() => doLink(p.linkName!)} style={actionBtn(true)} data-testid={`signin-link-${p.pid}`}>
                      {a.signinConnect}
                    </span>
                  ))}
            </div>
          );
        })}
      </div>
    </>
  );

  if (plain) return <>{body}</>;
  return (
    <Card style={{ gap: 9 }}>
      <CardTitle>{a.signinTitle}</CardTitle>
      {body}
    </Card>
  );
};

export const SupportCard: React.FC<{ app: HpApp; embedded?: boolean }> = ({ app, embedded }) => {
  const t = tr(app.lang);
  const { user } = app;
  const isPreview = user.id === 'preview';
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState<TicketCategory>('general');
  const [message, setMessage] = useState('');
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = () => {
    if (isPreview) return;
    getMyTickets(user.id).then(setTickets);
  };
  useEffect(refresh, [user.id]);

  const submit = () => {
    if (isPreview) { app.notify(t.account.previewOnly); return; }
    if (!subject.trim() || !message.trim() || busy) return;
    setBusy(true);
    createTicket(user, category, subject.trim(), message.trim())
      .then(() => {
        setSubject(''); setMessage(''); setShowForm(false);
        app.notify(t.account.tkSent);
        refresh();
      })
      .catch(() => app.notify(t.account.tkFailed))
      .finally(() => setBusy(false));
  };

  const sendReply = (ticket: SupportTicket) => {
    if (!reply.trim() || busy) return;
    setBusy(true);
    userReply(ticket, user, reply.trim())
      .then(() => { setReply(''); app.notify(t.account.tkReplySent); refresh(); })
      .catch(() => app.notify(t.account.tkFailed))
      .finally(() => setBusy(false));
  };

  const inputStyle: React.CSSProperties = {
    border: '1px solid #d2d2d7', borderRadius: 10, padding: '9px 12px', fontSize: 13,
    fontFamily: 'inherit', color: '#1d1d1f', background: '#fff', outline: 'none', width: '100%', boxSizing: 'border-box',
  };

  const inner = (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <CardTitle>{t.account.support}</CardTitle>
        <span
          className="hp-press"
          onClick={() => setShowForm(f => !f)}
          data-testid="support-new-inquiry"
          style={{ border: '1px solid #d2d2d7', borderRadius: 999, padding: '7px 16px', fontSize: 12.5, background: showForm ? '#1d1d1f' : '#fff', color: showForm ? '#fff' : '#1d1d1f', cursor: 'pointer', fontWeight: 600 }}
        >
          {t.account.tkNew}
        </span>
      </div>
      <span style={{ fontSize: 13, color: '#333', lineHeight: 1.5 }}>{t.account.supportText}</span>

      {showForm && (
        <div data-testid="support-form" style={{ display: 'flex', flexDirection: 'column', gap: 8, border: '1px solid #e0e0e0', borderRadius: 12, padding: 14, background: '#fafafa' }}>
          {/* column on the phone (narrow), row on desktop — no horizontal overflow either way */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <select value={category} onChange={e => setCategory(e.target.value as TicketCategory)} data-testid="support-category" style={{ ...inputStyle, width: 180, flex: '1 1 160px', minWidth: 0 }}>
              {Object.entries(t.account.tkCats).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <input value={subject} onChange={e => setSubject(e.target.value)} placeholder={t.account.tkSubject} data-testid="support-subject" style={{ ...inputStyle, flex: '1 1 160px', minWidth: 0 }} maxLength={120} />
          </div>
          <textarea value={message} onChange={e => setMessage(e.target.value)} placeholder={t.account.tkMessage} rows={4} data-testid="support-message" style={{ ...inputStyle, resize: 'vertical' }} maxLength={4000} />
          <span
            className="hp-press"
            onClick={submit}
            data-testid="support-send"
            style={{ background: '#0066cc', color: '#fff', borderRadius: 999, padding: '9px 20px', fontSize: 13, cursor: 'pointer', width: 'fit-content', opacity: busy ? 0.6 : 1 }}
          >
            {t.account.tkSend}
          </span>
        </div>
      )}

      <span style={{ ...sectionLabel, marginTop: 4 }}>{t.account.tkMine}</span>
      {tickets.length === 0 && <span style={{ fontSize: 12.5, color: '#7a7a7a' }} data-testid="support-none">{t.account.tkNone}</span>}
      {tickets.map(tk => {
        const expanded = openId === tk.id;
        return (
          <div key={tk.id} data-testid="support-ticket" style={{ border: '1px solid #e0e0e0', borderRadius: 12, overflow: 'hidden' }}>
            <div
              onClick={() => setOpenId(expanded ? null : tk.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', cursor: 'pointer', background: expanded ? '#f5f5f7' : '#fff' }}
            >
              <span style={{ fontSize: 10, color: '#7a7a7a', transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>▶</span>
              <span style={{ fontSize: 13, fontWeight: 600, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tk.subject}</span>
              {statusChip(tk.status, t.account.tkStatus[tk.status])}
              <span style={{ fontSize: 11.5, color: '#7a7a7a' }}>{shortDate(tk.updatedAt, t.locale)}</span>
            </div>
            {expanded && (
              <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid #f0f0f0' }}>
                {tk.messages.map((m, i) => (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: m.from === 'user' ? 'flex-end' : 'flex-start' }}>
                    <span style={{ fontSize: 10.5, color: '#7a7a7a' }}>{t.account.tkFrom[m.from]} · {shortDate(m.at, t.locale)}</span>
                    <span style={{
                      fontSize: 13, lineHeight: 1.55, borderRadius: 12, padding: '9px 13px', maxWidth: '85%', whiteSpace: 'pre-wrap',
                      ...(m.from === 'user' ? { background: '#0066cc', color: '#fff' } : { background: '#f0f0f0', color: '#1d1d1f' }),
                    }}>{m.text}</span>
                  </div>
                ))}
                {tk.status !== 'closed' && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                    <input value={reply} onChange={e => setReply(e.target.value)} placeholder={t.account.tkReplyPlaceholder} style={inputStyle} maxLength={4000} onKeyDown={e => { if (e.key === 'Enter') sendReply(tk); }} />
                    <span className="hp-press" onClick={() => sendReply(tk)} style={{ border: '1px solid #d2d2d7', borderRadius: 999, padding: '8px 18px', fontSize: 12.5, background: '#fff', cursor: 'pointer', whiteSpace: 'nowrap', opacity: busy ? 0.6 : 1 }}>
                      {t.account.tkReply}
                    </span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 2 }}>
                  <span
                    className="hp-press"
                    data-testid="support-delete"
                    onClick={() => {
                      if (isPreview) { app.notify(t.account.previewOnly); return; }
                      if (!window.confirm(t.account.tkDeleteConfirm)) return;
                      deleteMyTicket(tk.id)
                        .then(() => { app.notify(t.account.tkDeleted); setOpenId(null); refresh(); })
                        .catch(() => app.notify(t.account.tkFailed));
                    }}
                    style={{ fontSize: 11.5, color: '#c0392b', border: '1px solid #e8c5be', borderRadius: 999, padding: '5px 14px', cursor: 'pointer' }}
                  >
                    {t.account.tkDelete}
                  </span>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </>
  );

  // Phone hosts this inside its own back-navigated screen → no outer Card chrome.
  return embedded
    ? <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{inner}</div>
    : <Card style={{ gap: 10 }}>{inner}</Card>;
};
