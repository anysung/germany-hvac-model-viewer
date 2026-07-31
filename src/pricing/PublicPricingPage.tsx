/**
 * PublicPricingPage — the plans, billing terms, trial and VAT wording, rendered
 * WITHOUT a login so Paddle (and any prospective customer) can inspect pricing on
 * the public domain. App.tsx routes /pricing here before the auth gate.
 *
 * It is READ-ONLY: it reuses the shared subscription config
 * (config/subscriptionPlans.ts) and the shared i18n `sub` strings — no duplicated
 * prices, discounts or rules — and never opens Paddle checkout. Subscribing still
 * happens from the authenticated Account page; signup remains paused. The selector
 * and cards mirror the accepted Account pricing UI (equal-width grid, calculated
 * discounts, "excl. VAT" labels).
 */
import React, { useState } from 'react';
import { Language } from '../types';
import { tr } from '../hpiq/i18n';
import {
  SUB_PLAN_CODES, SUB_PLANS, BILLING_TERMS, BillingTerm,
  formatEur, perMonth, perUserMonth, isTeamPlan, sharedTermDiscountPct,
} from '../config/subscriptionPlans';
import { BrandLogo, WavingFlag } from '../components/BrandLogo';
import { UI_LANGUAGES } from '../hpiq/market';
import { LegalFooter } from '../legal/LegalPage';

const FD = '"SF Pro Display", system-ui, -apple-system, "Inter", sans-serif';

const BACK: Record<Language, string> = { en: 'Back to HeatPump DB', de: 'Zurück zu HeatPump DB', fr: 'Retour à HeatPump DB', pl: 'Powrót do HeatPump DB', it: 'Torna a HeatPump DB' };
/** "To subscribe, sign in to your account." — no signup here (paused); inspection only. */
const SUBSCRIBE_NOTE: Record<Language, string> = {
  en: 'To start a subscription, sign in to your account.',
  de: 'Um ein Abonnement zu starten, melden Sie sich in Ihrem Konto an.',
  fr: 'Pour souscrire un abonnement, connectez-vous à votre compte.',
  pl: 'Aby rozpocząć subskrypcję, zaloguj się na swoje konto.',
  it: 'Per attivare un abbonamento, accedi al tuo account.',
};

const pill = (bg: string, color: string): React.CSSProperties => ({
  fontSize: 10.5, fontWeight: 700, letterSpacing: '.04em', borderRadius: 999,
  padding: '3px 10px', background: bg, color, whiteSpace: 'nowrap',
});

export const PublicPricingPage: React.FC<{
  language: Language;
  setLanguage: (l: Language) => void;
}> = ({ language, setLanguage }) => {
  const t = tr(language);
  const s = t.sub;
  const [term, setTerm] = useState<BillingTerm>('annual');

  return (
    <div style={{ minHeight: '100vh', background: '#fff', color: '#1d1d1f', display: 'flex', flexDirection: 'column' }}>
      {/* Header — same lockup as the legal pages */}
      <div style={{ borderBottom: '1px solid #e8e8ed', padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
          <BrandLogo height={26} theme="light" animated={false} />
          <WavingFlag height={22} onLight animated={false} />
        </a>
        <span style={{ flex: 1 }} />
        {UI_LANGUAGES.length > 1 && (
          <div style={{ display: 'flex', border: '1px solid #e0e0e0', borderRadius: 999, overflow: 'hidden', fontSize: 12.5 }}>
            {UI_LANGUAGES.map(l => (
              <span
                key={l}
                onClick={() => setLanguage(l)}
                style={{ padding: '6px 14px', cursor: 'pointer', ...(language === l ? { background: '#1d1d1f', color: '#fff', fontWeight: 600 } : { color: '#1d1d1f' }) }}
              >
                {l.toUpperCase()}
              </span>
            ))}
          </div>
        )}
        <a href="/" style={{ fontSize: 13, color: '#0066cc', textDecoration: 'none' }}>{BACK[language]} ›</a>
      </div>

      {/* Pricing */}
      <div style={{ flex: 1, maxWidth: 1040, width: '100%', margin: '0 auto', padding: '44px 24px 56px', boxSizing: 'border-box' }} data-testid="public-pricing">
        <h1 style={{ fontFamily: FD, fontSize: 34, fontWeight: 600, letterSpacing: '-0.4px', margin: '0 0 6px' }}>{s.pickTitle}</h1>
        <p style={{ fontSize: 15, lineHeight: 1.6, color: '#7a7a7a', margin: '0 0 26px' }}>{s.pickSub}</p>

        {/* Billing-term selector — accepted equal-width grid (minmax(0,1fr) + min-width:0),
            calculated discounts via sharedTermDiscountPct (lowest across plans). */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', border: '1px solid #d2d2d7', borderRadius: 999, overflow: 'hidden', fontSize: 13, width: '100%', maxWidth: 560, marginBottom: 20 }}>
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
                className="hpiq-pricing-term"
                style={{ padding: '8px 10px', cursor: 'pointer', display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'center', textAlign: 'center', minWidth: 0, ...(selected ? { background: '#1d1d1f', color: '#fff', fontWeight: 600 } : {}) }}
              >
                <span style={{ whiteSpace: 'nowrap' }}>{s.termNames[tm]}</span>
                {pct > 0 && (
                  <span className="hpiq-pricing-badge" style={{ fontSize: 10, fontWeight: 700, borderRadius: 999, padding: '2px 7px', whiteSpace: 'nowrap', background: selected ? 'rgba(255,255,255,.18)' : '#e7f6ee', color: selected ? '#fff' : '#0a7a43' }}>
                    {s.termSavePct(pct)}
                  </span>
                )}
              </span>
            );
          })}
        </div>

        {/* Plan cards */}
        <div className="hpiq-pricing-cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 14 }}>
          {SUB_PLAN_CODES.map(code => {
            const plan = SUB_PLANS[code];
            const price = plan.prices[term];
            const popular = code === 'team_3' && term === 'annual';
            const team = isTeamPlan(code);
            return (
              <div
                key={code}
                style={{ border: popular ? '2px solid #0066cc' : '1px solid #e0e0e0', borderRadius: 18, padding: '20px 20px 18px', display: 'flex', flexDirection: 'column', gap: 7, position: 'relative', background: '#fff' }}
              >
                {popular && <span style={{ ...pill('#0066cc', '#fff'), position: 'absolute', top: -11, left: 18 }}>{s.mostPopular}</span>}
                <span style={{ fontFamily: FD, fontSize: 18, fontWeight: 600 }}>{s.planNames[code]}</span>
                <span style={{ fontSize: 12.5, color: '#7a7a7a' }}>{s.planUsers[code]}</span>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginTop: 4, flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: FD, fontSize: 27, fontWeight: 700, letterSpacing: '-0.4px' }}>{formatEur(price)}</span>
                  <span style={{ fontSize: 12.5, color: '#7a7a7a' }}>{s.perTerm[term]}{team ? ` ${s.forWholeTeam}` : ''}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#86868b', whiteSpace: 'nowrap' }}>{s.exclVat}</span>
                </div>
                <span style={{ fontSize: 11.5, color: '#7a7a7a' }}>
                  {team ? s.perUserEq(formatEur(Math.round(perUserMonth(code, term) * 100) / 100)) : (term !== 'monthly' ? s.perMonthEq(formatEur(Math.round(perMonth(code, term) * 100) / 100)) : ' ')}
                </span>
                <span style={{ fontSize: 12.5, color: '#333', lineHeight: 1.5, flex: 1 }}>{s.planBlurbs[code]}</span>
                {/* No trial badge: Paddle checkout charges immediately — the free
                    first week is an ACCOUNT property (granted at signup), not a
                    property of any plan (program fix 2026-07-31). */}
              </div>
            );
          })}
        </div>

        {/* Terms summary — same shared strings as the Account pricing UI */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 20 }}>
          <span style={{ fontSize: 12.5, color: '#333', lineHeight: 1.6 }}>{SUBSCRIBE_NOTE[language]}</span>
          <span style={{ fontSize: 11.5, color: '#7a7a7a', lineHeight: 1.55 }}>{s.trialNote}</span>
          <span style={{ fontSize: 11.5, color: '#7a7a7a', lineHeight: 1.55 }}>{s.cancelNote}</span>
          <span style={{ fontSize: 11.5, color: '#7a7a7a', lineHeight: 1.55 }}>{s.fixedTermNote}</span>
          <span style={{ fontSize: 11.5, color: '#9a9aa0', lineHeight: 1.55 }}>{s.vatNote}</span>
          {/* Every market bills in EUR (countryProfiles.currency) — say so, since
              a non-euro cardholder's own bank does the conversion. */}
          <span style={{ fontSize: 11.5, color: '#9a9aa0', lineHeight: 1.55 }} data-testid="eur-billing-note">{s.eurBillingNote}</span>
        </div>
      </div>

      {/* Footer — the four legal pages, reachable without a login */}
      <LegalFooter language={language} showCopyright />
    </div>
  );
};
