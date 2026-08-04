/**
 * SignupForm — the revised registration form, shared by every country edition.
 *
 * Minimum required data (GDPR): name, email, password, company name and company
 * type. City and website are optional; job role and referral source are gone.
 * The country is taken from the active edition and never asked for.
 *
 * Two shapes, one component:
 *   - public signup  → account + company + consent → "Continue to plan selection"
 *   - invited member → account + consent only; the company details are inherited
 *                      from the team, and the email is fixed to the invited one.
 */
import React, { useState } from 'react';
import { authInput, authLabel, authSelect, primaryBtn } from './AuthShell';
import { Language } from '../../types';
import { COMPANY_TYPES, COMPANY_TYPE_OTHER_MAX } from '../../config/companyTypes';
import { LEGAL_ROUTES } from '../../config/legal';
import { isValidEmail, normalizeWebsite, trim } from '../../utils/profile';
import { SignupData } from '../../services/authService';

export interface SignupFormValues extends SignupData {
  consent: boolean;
}

const empty: SignupFormValues = {
  firstName: '', lastName: '', email: '', password: '',
  companyName: '', companyType: '', companyTypeOther: '',
  companyCity: '', companyWebsite: '',
  marketingConsent: false, consent: false,
};

/** Company-type labels live in the app dictionary; the auth surface mirrors them. */
const TYPE_LABELS: Record<Language, Record<string, string>> = {
  en: {
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
  },
  de: {
    manufacturer: 'Hersteller',
    wholesaler: 'Großhandel / Distribution',
    installer: 'Installateur / SHK-Fachbetrieb',
    engineering: 'Planung / Ingenieurbüro / Beratung',
    construction: 'Bau / Projektentwicklung',
    esco_utility: 'Energiedienstleister / Versorger',
    housing: 'Wohnungswirtschaft / Hausverwaltung',
    public_research: 'Öffentliche Hand / Forschung / Verband',
    individual: 'Einzelperson / Einzelunternehmer',
    other: 'Sonstige',
  },
  fr: {
    manufacturer: 'Fabricant',
    wholesaler: 'Grossiste / Distributeur',
    installer: 'Installateur / Entreprise CVC',
    engineering: 'Ingénierie / Bureau d’études / Conseil',
    construction: 'Construction / Promotion immobilière',
    esco_utility: 'Société de services énergétiques / Fournisseur',
    housing: 'Bailleur social / Gestion immobilière',
    public_research: 'Secteur public / Recherche / Fédération',
    individual: 'Particulier / Indépendant',
    other: 'Autre',
  },
  pl: {
    manufacturer: 'Producent',
    wholesaler: 'Hurtownia / Dystrybutor',
    installer: 'Instalator / firma instalacyjna',
    engineering: 'Inżynieria / Biuro projektowe / Doradztwo',
    construction: 'Budownictwo / Deweloper',
    esco_utility: 'Przedsiębiorstwo usług energetycznych / Dostawca energii',
    housing: 'Spółdzielnia mieszkaniowa / Zarządzanie nieruchomościami',
    public_research: 'Sektor publiczny / Badania / Stowarzyszenie branżowe',
    individual: 'Osoba prywatna / Działalność jednoosobowa',
    other: 'Inne',
  },
  it: {
    manufacturer: 'Produttore',
    wholesaler: 'Grossista / Distributore',
    installer: 'Installatore / Impresa termoidraulica',
    engineering: 'Ingegneria / Studio di progettazione / Consulenza',
    construction: 'Costruzioni / Sviluppo immobiliare',
    esco_utility: 'ESCo / Utility energetica',
    housing: 'Edilizia residenziale pubblica / Amministrazione immobiliare',
    public_research: 'Settore pubblico / Ricerca / Associazione di categoria',
    individual: 'Privato / Ditta individuale',
    other: 'Altro',
  },
};

export const SignupForm: React.FC<{
  t: any;
  language: Language;
  isLoading: boolean;
  /** Invited-member mode: email is fixed and the company block is not shown. */
  invitedEmail?: string;
  onSubmit: (values: SignupFormValues) => void;
}> = ({ t, language, isLoading, invitedEmail, onSubmit }) => {
  const invited = !!invitedEmail;
  const [v, setV] = useState<SignupFormValues>({ ...empty, email: invitedEmail ?? '' });
  const [error, setError] = useState('');

  const set = (patch: Partial<SignupFormValues>) => setV(prev => ({ ...prev, ...patch }));
  const isOther = v.companyType === 'other';
  const isIndividual = v.companyType === 'individual';

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const email = invited ? invitedEmail! : trim(v.email);

    if (!trim(v.firstName) || !trim(v.lastName) || !email || !v.password) return setError(t.suErrRequired);
    if (!isValidEmail(email)) return setError(t.suErrEmail);
    if (!invited) {
      if (!trim(v.companyName) || !v.companyType) return setError(t.suErrRequired);
      if (isOther && !trim(v.companyTypeOther)) return setError(t.suErrOther);
    }
    const site = invited ? '' : normalizeWebsite(v.companyWebsite);
    if (site === null) return setError(t.suErrWebsite);
    if (!v.consent) return setError(t.suErrConsent);

    setError('');
    onSubmit({
      ...v,
      firstName: trim(v.firstName),
      lastName: trim(v.lastName),
      email,
      companyName: invited ? '' : trim(v.companyName),
      companyType: invited ? '' : v.companyType,
      companyTypeOther: !invited && isOther ? trim(v.companyTypeOther).slice(0, COMPANY_TYPE_OTHER_MAX) : '',
      companyCity: invited ? '' : trim(v.companyCity),
      companyWebsite: invited ? '' : (site as string),
    });
  };

  const sectionTitle: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.45)', marginTop: 4,
  };
  const link = 'text-emerald-300 underline hover:text-emerald-200';

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" data-testid="signup-form" noValidate>
      {/* ── Account information ── */}
      <span style={sectionTitle}>{t.suAccountSection}</span>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className={authLabel}>{t.firstName} *</label>
          <input type="text" className={authInput} value={v.firstName} onChange={e => set({ firstName: e.target.value })} data-testid="su-first" />
        </div>
        <div>
          <label className={authLabel}>{t.lastName} *</label>
          <input type="text" className={authInput} value={v.lastName} onChange={e => set({ lastName: e.target.value })} data-testid="su-last" />
        </div>
        <div className="md:col-span-2">
          <label className={authLabel}>{t.email} *</label>
          <input
            type="email"
            autoComplete="email"
            className={authInput}
            value={invited ? invitedEmail : v.email}
            onChange={e => set({ email: e.target.value })}
            readOnly={invited}
            style={invited ? { opacity: 0.75, cursor: 'not-allowed' } : undefined}
            data-testid="su-email"
          />
          {invited
            ? <p className="text-white/40 text-xs mt-1">{t.invEmailFixed}</p>
            /* Say what a wrong choice costs, not just what we prefer: the account
               email is immutable by design, so the only fix is deleting the
               account — which burns the email's one free trial for a year. */
            : <p className="text-white/45 text-xs mt-1.5 leading-relaxed" data-testid="su-email-advice">{t.suEmailAdvice}</p>}
        </div>
        <div className="md:col-span-2">
          <label className={authLabel}>{t.password} *</label>
          <input type="password" autoComplete="new-password" className={authInput} value={v.password} onChange={e => set({ password: e.target.value })} data-testid="su-password" />
        </div>
      </div>

      {/* ── Company information (public signup only — a member inherits the team's) ── */}
      {!invited && (
        <>
          <span style={sectionTitle}>{t.suCompanySection}</span>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className={authLabel}>{t.companyName} *</label>
              <input type="text" className={authInput} value={v.companyName} onChange={e => set({ companyName: e.target.value })} data-testid="su-company-name" />
              {isIndividual && <p className="text-amber-200/80 text-xs mt-1.5" data-testid="su-individual-hint">{t.suIndividualHint}</p>}
            </div>
            <div className="md:col-span-2">
              <label className={authLabel}>{t.companyType} *</label>
              <select className={authSelect} value={v.companyType} onChange={e => set({ companyType: e.target.value })} data-testid="su-company-type">
                <option value="">{t.select}</option>
                {COMPANY_TYPES.map(c => <option key={c} value={c}>{TYPE_LABELS[language][c]}</option>)}
              </select>
            </div>
            {isOther && (
              <div className="md:col-span-2">
                <label className={authLabel}>{t.suCompanyTypeOther} *</label>
                <input
                  type="text"
                  maxLength={COMPANY_TYPE_OTHER_MAX}
                  className={authInput}
                  value={v.companyTypeOther}
                  onChange={e => set({ companyTypeOther: e.target.value })}
                  data-testid="su-company-type-other"
                />
              </div>
            )}
            <div>
              <label className={authLabel}>{t.city} <span className="text-white/35">({t.suOptional})</span></label>
              <input type="text" className={authInput} value={v.companyCity} onChange={e => set({ companyCity: e.target.value })} data-testid="su-city" />
            </div>
            <div>
              <label className={authLabel}>{t.suCompanyWebsite} <span className="text-white/35">({t.suOptional})</span></label>
              <input type="text" placeholder="example.com" className={authInput} value={v.companyWebsite} onChange={e => set({ companyWebsite: e.target.value })} data-testid="su-website" />
            </div>
          </div>
          <p className="text-white/40 text-xs leading-relaxed" data-testid="su-company-guidance">{t.suCompanyGuidance}</p>
        </>
      )}

      {/* ── Consent (required) + marketing (optional, unchecked) ── */}
      <label className="flex items-start gap-3 text-sm text-white/70 mt-2 cursor-pointer">
        <input type="checkbox" checked={v.consent} onChange={e => set({ consent: e.target.checked })} className="mt-1" data-testid="su-consent" />
        <span>
          {t.suConsentPre}
          <a href={LEGAL_ROUTES.terms} target="_blank" rel="noopener noreferrer" className={link} data-testid="su-terms-link">{t.suConsentTerms}</a>
          {t.suConsentMid}
          <a href={LEGAL_ROUTES.privacy} target="_blank" rel="noopener noreferrer" className={link} data-testid="su-privacy-link">{t.suConsentPrivacy}</a>
          {t.suConsentPost}
        </span>
      </label>
      <label className="flex items-start gap-3 text-sm text-white/50 cursor-pointer">
        <input type="checkbox" checked={!!v.marketingConsent} onChange={e => set({ marketingConsent: e.target.checked })} className="mt-1" data-testid="su-marketing" />
        <span>{t.suMarketing}</span>
      </label>

      {error && <p className="text-red-300 text-sm" data-testid="su-error">{error}</p>}

      <button type="submit" disabled={isLoading} className={primaryBtn} data-testid="su-submit">
        {isLoading ? t.registering : invited ? t.invContinue : t.suContinue}
      </button>
    </form>
  );
};
