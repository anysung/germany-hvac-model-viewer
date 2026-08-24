/**
 * SignupForm — the registration form, shared by every country edition.
 *
 * TWO FIELDS (2026-08-24). Email, a password, and consent. Nothing else.
 *
 * It used to ask for seven: first name, last name, email, email again,
 * password, company name and company type. Every one of them stood between a
 * visitor and a product they had not seen yet, on the step where a funnel loses
 * the most people, and none was needed to start a trial. The name only fed an
 * email salutation; the company details fed an admin column and a marketing
 * segment; the retyped email guarded against a typo the verification mail
 * catches better by simply never arriving.
 *
 * WHERE THAT DATA WENT, AND WHY NOT HERE
 * Name, company, type and city are asked at the moment of SUBSCRIBING — not
 * during the trial (owner decision 2026-08-24). Someone reaching for a card has
 * already decided; someone three days into a trial has not, and a form put in
 * front of them there is an interruption charged against the very evaluation we
 * want them to finish. Invoices do not need any of it either: Paddle is the
 * merchant of record and collects its own billing details at checkout — we hand
 * it the email and nothing else.
 *
 * NOTHING ON THIS SCREEN NAMES A PLAN OR A PRICE (owner decision 2026-08-24).
 * The trial is free and needs no plan, so naming one here only raises "what will
 * this cost me" at the exact moment we are asking for trust. Pricing is
 * discovered later, inside the product.
 *
 * The one thing still worth interrupting for is the address itself: it becomes
 * the account identity and cannot be changed afterwards. So a consumer mailbox
 * gets a confirmation step — after typing, before committing — and a company
 * address gets none.
 *
 * Two shapes, one component:
 *   - public signup  → email + password + consent
 *   - invited member → the same, with the email fixed by the invitation
 */
import React, { useState } from 'react';
import { authInput, authLabel, primaryBtn } from './AuthShell';
import { Language } from '../../types';
import { LEGAL_ROUTES } from '../../config/legal';
import { isFreeMailAddress } from '../../config/freeMailDomains';
import { isValidEmail, trim } from '../../utils/profile';
import { SignupData } from '../../services/authService';

export interface SignupFormValues extends SignupData {
  consent: boolean;
}

/* The profile fields left the FORM, not the payload: registerUser still writes
   them, empty, so the document shape is unchanged and the subscription step
   fills them in later. */
const empty: SignupFormValues = {
  firstName: '', lastName: '', email: '', password: '',
  companyName: '', companyType: '', companyTypeOther: '',
  companyCity: '', companyWebsite: '',
  marketingConsent: false, consent: false,
};

export const SignupForm: React.FC<{
  t: any;
  language: Language;
  isLoading: boolean;
  /** Invited-member mode: the email is fixed by the invitation. */
  invitedEmail?: string;
  onSubmit: (values: SignupFormValues) => void;
}> = ({ t, isLoading, invitedEmail, onSubmit }) => {
  const invited = !!invitedEmail;
  const [v, setV] = useState<SignupFormValues>({ ...empty, email: invitedEmail ?? '' });
  const [error, setError] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [confirmFreeMail, setConfirmFreeMail] = useState<string | null>(null);

  /**
   * Catches the HABIT (gmial.com), not the slip. The slip is caught by the
   * verification mail not arriving while the person is still on the screen that
   * told them to expect it — which is also why retyping the address is gone.
   */
  const domainHint = (() => {
    const at = trim(v.email).toLowerCase().split('@');
    if (at.length !== 2 || !at[1]) return null;
    const fix: Record<string, string> = {
      'gmial.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gmail.co': 'gmail.com',
      'gmali.com': 'gmail.com', 'gmail.con': 'gmail.com', 'gnail.com': 'gmail.com',
      'hotmial.com': 'hotmail.com', 'hotmai.com': 'hotmail.com', 'hotmil.com': 'hotmail.com',
      'outlok.com': 'outlook.com', 'outllok.com': 'outlook.com', 'outloo.com': 'outlook.com',
      'yaho.com': 'yahoo.com', 'yahooo.com': 'yahoo.com', 'yhaoo.com': 'yahoo.com',
      'iclod.com': 'icloud.com', 'icloud.co': 'icloud.com',
      'web.de.com': 'web.de', 'gmx.de.com': 'gmx.de', 'wanadoo.f': 'wanadoo.fr',
    };
    const better = fix[at[1]];
    return better ? `${at[0]}@${better}` : null;
  })();

  const set = (patch: Partial<SignupFormValues>) => setV(prev => ({ ...prev, ...patch }));

  const send = (email: string) => {
    setError('');
    setConfirmFreeMail(null);
    onSubmit({ ...v, email });
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const email = invited ? invitedEmail! : trim(v.email);
    if (!email || !v.password) return setError(t.suErrRequired);
    if (!isValidEmail(email)) return setError(t.suErrEmail);
    if (!v.consent) return setError(t.suErrConsent);
    // An invited member's address was chosen by their team admin, not by them.
    if (!invited && isFreeMailAddress(email)) return setConfirmFreeMail(email);
    send(email);
  };

  const link = 'text-emerald-300 underline hover:text-emerald-200';

  return (
    <>
      <form onSubmit={submit} className="flex flex-col gap-4" data-testid="signup-form" noValidate>
        <div>
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
            : <p className="text-white/45 text-xs mt-1.5 leading-relaxed" data-testid="su-email-advice">{t.suEmailAdvice}</p>}
          {!invited && domainHint && (
            <button
              type="button"
              onClick={() => set({ email: domainHint })}
              className="text-amber-300/90 hover:text-amber-200 text-xs mt-1.5 underline text-left"
              data-testid="su-email-hint"
            >
              {t.suEmailDidYouMean(domainHint)}
            </button>
          )}
        </div>

        <div>
          <label className={authLabel}>{t.password} *</label>
          {/* One field with a reveal, not two. A mistyped password locks someone
              out with no signal at all — but retyping is the clumsy guard; being
              able to SEE what was typed is the direct one, and it is what people
              now expect. */}
          <div style={{ position: 'relative' }}>
            <input
              type={showPass ? 'text' : 'password'}
              autoComplete="new-password"
              className={authInput}
              style={{ paddingRight: 76 }}
              value={v.password}
              onChange={e => set({ password: e.target.value })}
              data-testid="su-password"
            />
            <button
              type="button"
              onClick={() => setShowPass(s => !s)}
              className="text-white/55 hover:text-white/85 text-xs underline"
              style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)' }}
              data-testid="su-password-toggle"
            >
              {showPass ? t.suHide : t.suShow}
            </button>
          </div>
        </div>

        <label className="flex items-start gap-3 text-sm text-white/70 mt-1 cursor-pointer">
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
          {isLoading ? t.registering : invited ? t.invContinue : t.suCreateAccount}
        </button>
      </form>

      {/* Consumer mailbox: confirm the address before it becomes permanent. */}
      {confirmFreeMail && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.62)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 90 }}
          data-testid="su-freemail-dialog"
        >
          <div style={{ background: '#12181c', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 18, padding: '26px 26px 22px', maxWidth: 470, width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <span className="text-white text-lg font-semibold">{t.suFreeMailTitle}</span>
            <p className="text-white/70 text-sm leading-relaxed" style={{ whiteSpace: 'pre-line' }}>{t.suFreeMailBody(confirmFreeMail)}</p>
            <div className="flex gap-3 justify-end mt-1">
              <button
                type="button"
                onClick={() => setConfirmFreeMail(null)}
                className="text-white/70 hover:text-white text-sm px-4 py-2"
                data-testid="su-freemail-change"
              >
                {t.suFreeMailChange}
              </button>
              <button
                type="button"
                onClick={() => send(confirmFreeMail)}
                className="text-emerald-200 hover:text-emerald-100 text-sm px-4 py-2 rounded-lg"
                style={{ border: '1px solid rgba(110,231,183,0.45)' }}
                data-testid="su-freemail-continue"
              >
                {t.suFreeMailContinue}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
