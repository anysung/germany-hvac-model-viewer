/**
 * BillingProfileForm — the details we ask for at the moment of subscribing.
 *
 * WHY HERE AND NOWHERE EARLIER (owner decision 2026-08-24)
 * Name, company, company type and city used to be required at signup, where
 * they cost us people who had not yet seen the product. They are not needed to
 * run a trial, and they are not needed for an invoice either — Paddle is the
 * merchant of record and collects its own billing details at checkout. What
 * they ARE needed for is knowing who our customers are: which trades subscribe,
 * which company a seat belongs to, and whether an account is what it claims.
 *
 * So they are asked once, here, of someone who has already decided to pay. That
 * person will not abandon over four fields; a visitor on the signup screen will.
 * It is also deliberately not asked DURING the trial: someone three days into an
 * evaluation has not decided anything yet, and a form put in front of them there
 * is an interruption charged against the evaluation we want them to finish.
 *
 * Shown only when something is missing, and never twice: once saved, the next
 * checkout goes straight through.
 */
import React, { useState } from 'react';
import { User, Language } from '../types';
import { COMPANY_TYPES, COMPANY_TYPE_OTHER_MAX } from '../config/companyTypes';
import { COMPANY_TYPE_LABELS_I18N } from '../config/companyTypeLabels';
import { updateMyProfile } from '../services/authService';
import { translations } from '../translations';
import { trim } from '../utils/profile';

/** What a paying account must carry. City stays optional, as it always was. */
export function billingProfileComplete(u: User | null | undefined): boolean {
  if (!u) return false;
  return !!(trim(u.firstName ?? '') && trim(u.lastName ?? '')
    && trim(u.companyName ?? '') && trim(u.companyType ?? ''));
}

export const BillingProfileForm: React.FC<{
  language: Language;
  user: User;
  /** Called after the profile is saved — the caller then opens checkout. */
  onSaved: (patch: Partial<User>) => void;
  onCancel: () => void;
}> = ({ language, user, onSaved, onCancel }) => {
  /* This form is opened from two places that carry DIFFERENT dictionaries —
     the auth surface (src/translations.ts) and the hpiq app (hpiq/i18n.ts) —
     so it looks its own strings up instead of trusting whichever `t` the caller
     happens to hold. Taking one would have type-checked and then rendered
     `undefined` as every label on the Account page. */
  const t = translations[language] ?? translations.en;
  const [firstName, setFirstName] = useState(user.firstName ?? '');
  const [lastName, setLastName] = useState(user.lastName ?? '');
  const [companyName, setCompanyName] = useState(user.companyName ?? '');
  const [companyType, setCompanyType] = useState(user.companyType ?? '');
  const [companyTypeOther, setCompanyTypeOther] = useState(user.companyTypeOther ?? '');
  const [companyCity, setCompanyCity] = useState(user.companyCity ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const isOther = companyType === 'other';
  const labels = COMPANY_TYPE_LABELS_I18N[language] ?? COMPANY_TYPE_LABELS_I18N.en;

  const save = async () => {
    if (!trim(firstName) || !trim(lastName) || !trim(companyName) || !companyType) {
      return setError(t.suErrRequired);
    }
    if (isOther && !trim(companyTypeOther)) return setError(t.suErrOther);
    setBusy(true);
    setError('');
    const patch = {
      firstName: trim(firstName),
      lastName: trim(lastName),
      companyName: trim(companyName),
      companyType,
      companyTypeOther: isOther ? trim(companyTypeOther).slice(0, COMPANY_TYPE_OTHER_MAX) : '',
      companyCity: trim(companyCity),
    };
    try {
      await updateMyProfile(user.id, patch);
      onSaved(patch);
    } catch (e: any) {
      setError(String(e?.message ?? e));
      setBusy(false);
    }
  };

  const field: React.CSSProperties = {
    width: '100%', padding: '10px 12px', borderRadius: 10,
    border: '1px solid #dcdce2', fontSize: 14, background: '#fff', color: '#1d1d1f',
  };
  const label: React.CSSProperties = {
    fontSize: 11.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase',
    color: '#6e6e73', display: 'block', marginBottom: 5,
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 95 }}
      data-testid="billing-profile"
    >
      <div style={{ background: '#fff', borderRadius: 18, padding: '26px 26px 22px', maxWidth: 520, width: '100%', maxHeight: '90vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <div style={{ fontSize: 19, fontWeight: 700, color: '#1d1d1f' }}>{t.bpTitle}</div>
          <p style={{ fontSize: 13.5, color: '#6e6e73', lineHeight: 1.6, marginTop: 6 }}>{t.bpIntro}</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={label}>{t.firstName} *</label>
            <input style={field} value={firstName} onChange={e => setFirstName(e.target.value)} data-testid="bp-first" />
          </div>
          <div>
            <label style={label}>{t.lastName} *</label>
            <input style={field} value={lastName} onChange={e => setLastName(e.target.value)} data-testid="bp-last" />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={label}>{t.companyName} *</label>
            <input style={field} value={companyName} onChange={e => setCompanyName(e.target.value)} data-testid="bp-company" />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={label}>{t.companyType} *</label>
            <select style={field} value={companyType} onChange={e => setCompanyType(e.target.value)} data-testid="bp-type">
              <option value="">{t.select}</option>
              {COMPANY_TYPES.map(c => <option key={c} value={c}>{labels[c]}</option>)}
            </select>
          </div>
          {isOther && (
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={label}>{t.suCompanyTypeOther} *</label>
              <input style={field} maxLength={COMPANY_TYPE_OTHER_MAX} value={companyTypeOther}
                onChange={e => setCompanyTypeOther(e.target.value)} data-testid="bp-type-other" />
            </div>
          )}
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={label}>{t.city} <span style={{ color: '#9a9aa0' }}>({t.suOptional})</span></label>
            <input style={field} value={companyCity} onChange={e => setCompanyCity(e.target.value)} data-testid="bp-city" />
          </div>
        </div>

        {error && <p style={{ color: '#c0392b', fontSize: 13 }} data-testid="bp-error">{error}</p>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 2 }}>
          <button onClick={onCancel} disabled={busy}
            style={{ padding: '10px 16px', fontSize: 14, color: '#6e6e73', background: 'none', border: 'none', cursor: 'pointer' }}
            data-testid="bp-cancel">
            {t.termsCancel}
          </button>
          <button onClick={save} disabled={busy}
            style={{ padding: '10px 18px', fontSize: 14, fontWeight: 600, borderRadius: 10, border: '1px solid #0a7d5a', background: '#0a7d5a', color: '#fff', cursor: 'pointer', opacity: busy ? 0.6 : 1 }}
            data-testid="bp-save">
            {busy ? t.bpSaving : t.bpContinue}
          </button>
        </div>
      </div>
    </div>
  );
};
