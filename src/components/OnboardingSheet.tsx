/**
 * OnboardingSheet — the three questions asked once, right after an account is
 * created, and skippable in one click.
 *
 * WHY IT IS SEPARATE FROM SIGNING UP
 * Signing up is now Google / Apple / email and a consent box — nothing else,
 * because every field in front of that button costs registrations we do not
 * have. These three are asked AFTER the account exists, when leaving costs the
 * visitor something. Skipping is a first-class outcome: the account is already
 * real and the Account page carries the same fields.
 *
 * WHY THESE THREE AND NOT OTHERS
 *  · name    — a team invitation has to say who is inviting. This is the only
 *              one with a hard downstream requirement, which is why a Team
 *              subscription asks for it again if it is still empty.
 *  · company — which trade the account belongs to. Drives nothing automatic;
 *              it is how we know who our members are.
 *  · role    — job function, for segmenting what we send.
 *
 * WHAT IS DELIBERATELY NOT ASKED: how they found us. The `?ref=` token already
 * records that from the link they arrived on (services/signupRef.ts). Asking
 * as well would produce a second answer to the same question, and the two
 * would disagree — a LinkedIn arrival who remembers it as "search" is not a
 * correction, just noise on top of a measurement.
 */
import React, { useState } from 'react';
import { User, Language } from '../types';
import { COMPANY_TYPES, COMPANY_TYPE_OTHER_MAX } from '../config/companyTypes';
import { COMPANY_TYPE_LABELS_I18N } from '../config/companyTypeLabels';
import { JOB_ROLES, jobRoleLabel } from '../config/jobRoles';
import { updateMyProfile } from '../services/authService';
import { trim } from '../utils/profile';

/** Copy lives here rather than in either dictionary: this sheet is shown from
 *  the auth surface AND from inside the app, which carry different `t`. */
const COPY: Record<string, {
  title: string; sub: string; name: string; namePh: string; nameHint: string;
  company: string; role: string; choose: string; save: string; later: string; saving: string;
}> = {
  en: { title: 'Welcome — three quick questions', sub: 'All optional. You can fill these in later on your account page.',
        name: 'Your name', namePh: 'e.g. Alex Schneider', nameHint: 'Shown to colleagues when you invite them to a team.',
        company: 'Type of company', role: 'Your role', choose: 'Select…',
        save: 'Save and continue', later: 'Later', saving: 'Saving…' },
  de: { title: 'Willkommen — drei kurze Fragen', sub: 'Alles freiwillig. Sie können das später im Konto ergänzen.',
        name: 'Ihr Name', namePh: 'z. B. Alex Schneider', nameHint: 'Wird Kolleginnen und Kollegen bei einer Team-Einladung angezeigt.',
        company: 'Art des Unternehmens', role: 'Ihre Funktion', choose: 'Bitte wählen…',
        save: 'Speichern und weiter', later: 'Später', saving: 'Wird gespeichert…' },
  fr: { title: 'Bienvenue — trois questions rapides', sub: 'Facultatif. Vous pourrez compléter plus tard depuis votre compte.',
        name: 'Votre nom', namePh: 'p. ex. Alex Schneider', nameHint: 'Affiché à vos collègues lors d’une invitation d’équipe.',
        company: 'Type d’entreprise', role: 'Votre fonction', choose: 'Sélectionner…',
        save: 'Enregistrer et continuer', later: 'Plus tard', saving: 'Enregistrement…' },
  pl: { title: 'Witamy — trzy krótkie pytania', sub: 'Wszystko opcjonalne. Możesz uzupełnić później na swoim koncie.',
        name: 'Imię i nazwisko', namePh: 'np. Alex Schneider', nameHint: 'Widoczne dla współpracowników przy zaproszeniu do zespołu.',
        company: 'Typ firmy', role: 'Twoja rola', choose: 'Wybierz…',
        save: 'Zapisz i kontynuuj', later: 'Później', saving: 'Zapisywanie…' },
  it: { title: 'Benvenuto — tre domande rapide', sub: 'Tutto facoltativo. Puoi completare più tardi dal tuo account.',
        name: 'Il tuo nome', namePh: 'es. Alex Schneider', nameHint: 'Mostrato ai colleghi quando li inviti in un team.',
        company: 'Tipo di azienda', role: 'Il tuo ruolo', choose: 'Seleziona…',
        save: 'Salva e continua', later: 'Più tardi', saving: 'Salvataggio…' },
};

/** One display name in, first/last out — the same split the social sign-in
 *  uses, so a name typed here and a name from Google land in the same shape.
 *  No second name field exists anywhere: firstName/lastName stay the storage. */
export const splitName = (full: string): { firstName: string; lastName: string } => {
  const parts = trim(full).split(/\s+/).filter(Boolean);
  return { firstName: parts[0] ?? '', lastName: parts.slice(1).join(' ') };
};

/** Has the account got the name a team invitation needs? */
export const hasDisplayName = (u: User | null | undefined): boolean =>
  !!(u && trim(u.firstName ?? ''));

/**
 * The one thing a checkout is still allowed to stop for: a Team plan whose
 * buyer has no name yet.
 *
 * Everything else that used to be asked here — company, type, city — is gone
 * (owner, 2026-08-31). None of it reaches the invoice: Paddle is the merchant
 * of record, collects its own billing details and company name at checkout,
 * and we read them back from the webhook. Asking again was a form between a
 * decided buyer and their card for data we already get.
 *
 * A name is different, and only for teams: the invitation mail has to say who
 * is inviting. "Someone has added you to a team" is not an invitation anyone
 * accepts.
 */
export const nameNeededForCheckout = (u: User | null | undefined, isTeam: boolean): boolean =>
  isTeam && !hasDisplayName(u);

export const OnboardingSheet: React.FC<{
  language: Language;
  user: User;
  onDone: (patch: Partial<User>) => void;
  /** Skipping is not cancelling — the account exists either way. */
  onSkip: () => void;
}> = ({ language, user, onDone, onSkip }) => {
  const c = COPY[language] ?? COPY.en;
  const typeLabels = COMPANY_TYPE_LABELS_I18N[language] ?? COMPANY_TYPE_LABELS_I18N.en;

  const [name, setName] = useState(
    [user.firstName, user.lastName].filter(Boolean).join(' '),
  );
  const [companyType, setCompanyType] = useState(user.companyType ?? '');
  const [companyTypeOther, setCompanyTypeOther] = useState(user.companyTypeOther ?? '');
  const [jobRole, setJobRole] = useState(user.jobRole ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const save = async () => {
    setBusy(true); setErr('');
    try {
      /* Only non-empty answers are written. A skipped question must not
         overwrite something the account already had. */
      const patch: Partial<User> = {};
      if (trim(name)) Object.assign(patch, splitName(name));
      if (companyType) {
        patch.companyType = companyType;
        if (companyType === 'other' && trim(companyTypeOther)) {
          patch.companyTypeOther = trim(companyTypeOther).slice(0, COMPANY_TYPE_OTHER_MAX);
        }
      }
      if (jobRole) patch.jobRole = jobRole;

      if (Object.keys(patch).length) await updateMyProfile(user.id, patch);
      onDone(patch);
    } catch (e: any) {
      setErr(e?.message || 'save failed');
      setBusy(false);
    }
  };

  const field = 'w-full px-4 py-3 rounded-xl bg-[#0e1c18] border border-white/15 text-white outline-none transition focus:border-emerald-400/70 focus:ring-2 focus:ring-emerald-400/25';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-md bg-[#0b1713] border border-white/12 rounded-2xl shadow-2xl p-6">
        <h2 className="text-xl font-bold text-white">{c.title}</h2>
        <p className="text-sm text-white/55 mt-1.5">{c.sub}</p>

        <div className="mt-5 space-y-4">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-white/60 mb-1.5">{c.name}</label>
            <input className={field} value={name} placeholder={c.namePh} onChange={e => setName(e.target.value)} autoFocus />
            <p className="text-[11px] text-white/40 mt-1.5">{c.nameHint}</p>
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-white/60 mb-1.5">{c.company}</label>
            <select className={field} value={companyType} onChange={e => setCompanyType(e.target.value)}>
              <option value="">{c.choose}</option>
              {COMPANY_TYPES.map(code => <option key={code} value={code}>{typeLabels[code]}</option>)}
            </select>
            {companyType === 'other' && (
              <input
                className={`${field} mt-2`}
                maxLength={COMPANY_TYPE_OTHER_MAX}
                value={companyTypeOther}
                onChange={e => setCompanyTypeOther(e.target.value)}
              />
            )}
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-white/60 mb-1.5">{c.role}</label>
            <select className={field} value={jobRole} onChange={e => setJobRole(e.target.value)}>
              <option value="">{c.choose}</option>
              {JOB_ROLES.map(code => <option key={code} value={code}>{jobRoleLabel(code, language)}</option>)}
            </select>
          </div>
        </div>

        {err && <p className="text-sm text-rose-300 mt-3">{err}</p>}

        <div className="mt-6 flex items-center gap-3">
          <button
            onClick={save}
            disabled={busy}
            className="flex-1 py-3 px-4 rounded-xl font-bold text-[#04251d] bg-gradient-to-r from-emerald-400 to-cyan-400 hover:from-emerald-300 hover:to-cyan-300 transition disabled:opacity-60"
          >
            {busy ? c.saving : c.save}
          </button>
          <button
            onClick={onSkip}
            disabled={busy}
            className="py-3 px-5 rounded-xl font-semibold text-white/70 hover:text-white hover:bg-white/[0.07] transition"
          >
            {c.later}
          </button>
        </div>
      </div>
    </div>
  );
};


/* ── Name gate (Team checkout) ───────────────────────────────────────────── */

const GATE: Record<string, { title: string; body: string; ph: string; go: string; cancel: string; saving: string }> = {
  en: { title: 'One thing before checkout', body: 'Team invitations are sent in your name, so your colleagues can see who added them.',
        ph: 'e.g. Alex Schneider', go: 'Continue to checkout', cancel: 'Cancel', saving: 'Saving…' },
  de: { title: 'Eine Angabe fehlt noch', body: 'Team-Einladungen werden in Ihrem Namen versendet, damit Kolleginnen und Kollegen sehen, wer sie hinzugefügt hat.',
        ph: 'z. B. Alex Schneider', go: 'Weiter zur Zahlung', cancel: 'Abbrechen', saving: 'Wird gespeichert…' },
  fr: { title: 'Une information avant le paiement', body: 'Les invitations d’équipe sont envoyées en votre nom, afin que vos collègues sachent qui les a ajoutés.',
        ph: 'p. ex. Alex Schneider', go: 'Continuer vers le paiement', cancel: 'Annuler', saving: 'Enregistrement…' },
  pl: { title: 'Jeszcze jedna informacja', body: 'Zaproszenia do zespołu są wysyłane w Twoim imieniu, aby współpracownicy wiedzieli, kto ich dodał.',
        ph: 'np. Alex Schneider', go: 'Przejdź do płatności', cancel: 'Anuluj', saving: 'Zapisywanie…' },
  it: { title: 'Un dato prima del pagamento', body: 'Gli inviti al team vengono inviati a tuo nome, così i colleghi sanno chi li ha aggiunti.',
        ph: 'es. Alex Schneider', go: 'Continua al pagamento', cancel: 'Annulla', saving: 'Salvataggio…' },
};

export const TeamNameGate: React.FC<{
  language: Language;
  user: User;
  onSaved: (patch: Partial<User>) => void;
  onCancel: () => void;
}> = ({ language, user, onSaved, onCancel }) => {
  const c = GATE[language] ?? GATE.en;
  const [name, setName] = useState([user.firstName, user.lastName].filter(Boolean).join(' '));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const go = async () => {
    if (!trim(name)) return;
    setBusy(true); setErr('');
    try {
      const patch = splitName(name);
      await updateMyProfile(user.id, patch);
      onSaved(patch);
    } catch (e: any) { setErr(e?.message || 'save failed'); setBusy(false); }
  };

  const field = 'w-full px-4 py-3 rounded-xl bg-[#0e1c18] border border-white/15 text-white outline-none transition focus:border-emerald-400/70 focus:ring-2 focus:ring-emerald-400/25';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" data-testid="team-name-gate">
      <div className="w-full max-w-md bg-[#0b1713] border border-white/12 rounded-2xl shadow-2xl p-6">
        <h2 className="text-xl font-bold text-white">{c.title}</h2>
        <p className="text-sm text-white/60 mt-2 leading-relaxed">{c.body}</p>
        <input
          className={`${field} mt-5`}
          value={name}
          placeholder={c.ph}
          autoFocus
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') go(); }}
          data-testid="team-name-input"
        />
        {err && <p className="text-sm text-rose-300 mt-3">{err}</p>}
        <div className="mt-6 flex items-center gap-3">
          <button
            onClick={go}
            disabled={busy || !trim(name)}
            className="flex-1 py-3 px-4 rounded-xl font-bold text-[#04251d] bg-gradient-to-r from-emerald-400 to-cyan-400 hover:from-emerald-300 hover:to-cyan-300 transition disabled:opacity-50"
            data-testid="team-name-continue"
          >
            {busy ? c.saving : c.go}
          </button>
          <button onClick={onCancel} disabled={busy} className="py-3 px-5 rounded-xl font-semibold text-white/70 hover:text-white hover:bg-white/[0.07] transition">
            {c.cancel}
          </button>
        </div>
      </div>
    </div>
  );
};
