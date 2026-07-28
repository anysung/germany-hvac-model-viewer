import React, { useState, useEffect } from 'react';
import {
  loginUser, registerUser, registerInvitedMember, logoutUser, onUserChange,
  loginWithProvider, completeRedirectSignIn, isAdminRole,
  WRONG_COUNTRY_PREFIX, EMAIL_ELSEWHERE, VERIFY_EMAIL_SENTINEL,
  tryFinalizeSignup, resendVerificationEmail, refetchSessionUser,
  adminGoogleSignIn,
} from './services/authService';
import { TRIAL_FLOW_ENABLED } from './services/billingFnService';
import { startSessionTracking } from './services/sessionService';
import { accessExpired } from './config/entitlement';
import { getMyOrg } from './services/subscriptionService';
import { Organization } from './types';
import {
  SUB_PLANS, SUB_PLAN_CODES, SUB_PLAN_NAMES, BILLING_TERMS, TERM_NAMES,
  formatEur, perMonth, checkoutConfigured, BillingTerm, SubPlanCode,
} from './config/subscriptionPlans';
import { openCheckout } from './services/paddleService';
import { HpiqApp } from './hpiq/HpiqApp';
import { AdminDashboard } from './components/AdminDashboard';
import {
  AuthShell, GlassCard, SegmentTiles, LeafIcon, GoogleIcon, AppleIcon,
  authInput, authSelect, authLabel, primaryBtn, ghostBtn, socialBtn,
} from './components/auth/AuthShell';
import { HeatPumpDatabase, HeatPump, User, AppMode, Language } from './types';
import { auth } from './firebase';
import { translations } from './translations';
import { DEFAULT_LANGUAGE, COUNTRY_SITES } from './hpiq/market';
import { PUBLIC_ENV } from './config/env';
import { REGISTRATION_OPEN, REGISTRATION_REOPEN_DATE } from './config/registration';
import { legalDocForPath, PRICING_ROUTE } from './config/legal';
import { LegalPage, LegalFooter } from './legal/LegalPage';
import { PublicPricingPage } from './pricing/PublicPricingPage';
import { SignupForm, SignupFormValues } from './components/auth/SignupForm';
import { previewUserPatch } from './hpiq/devPreview';
import { AdminLogin } from './components/admin/AdminLogin';
import { AdminLang, ADMIN_I18N, loadAdminLang, saveAdminLang } from './components/admin/adminI18n';

// Unified operations console build (own hosting site, all markets, admin-only).
const IS_ADMIN_BUILD = PUBLIC_ENV.APP_MODE === 'admin';
// Use Firestore Service
import { getProducts, getCommercialProducts, getNews, getPolicies, getBAFA } from './services/dbService';

type ViewState = 'LANDING' | 'LOGIN' | 'SIGNUP' | 'PENDING_APPROVAL' | 'VERIFY_EMAIL' | 'APP' | 'ADMIN_DASHBOARD' | 'COUNTRY_MISMATCH';

/** Landing-page link to the public pricing page. Typed as a full Record so a new
 *  UI language cannot silently fall back to English (the IT edition did — 03f92c0). */
const VIEW_PRICING: Record<Language, string> = {
  en: 'View plans & pricing',
  de: 'Tarife & Preise ansehen',
  fr: 'Voir les offres et tarifs',
  pl: 'Zobacz plany i cennik',
  it: 'Scopri piani e prezzi',
};

/**
 * Day-8 gate: the trial (or subscription) window is closed — the server rules
 * already refuse product/news/dataset reads, so the app is replaced by this
 * subscribe screen. Payment is the only way forward (immediate charge — no
 * Paddle trial); the webhook re-opens the window and "I've paid" refreshes.
 */
const SubscribeGate: React.FC<{
  t: any;
  language: Language;
  setLanguage: (l: Language) => void;
  user: User;
  isMemberOfTeam: boolean;
  onRefreshed: (u: User) => void;
  onLogout: () => void;
}> = ({ t, language, setLanguage, user, isMemberOfTeam, onRefreshed, onLogout }) => {
  const [term, setTerm] = useState<BillingTerm>('monthly');
  const [busy, setBusy] = useState(false);
  const hadTrial = !!user.trialEndsAt;

  const subscribe = async (plan: SubPlanCode) => {
    try { await openCheckout(user, plan, term); }
    catch { alert(t.subReqComingSoon); }
  };

  const refresh = async () => {
    setBusy(true);
    try {
      const fresh = await refetchSessionUser();
      if (fresh) onRefreshed(fresh);
    } finally { setBusy(false); }
  };

  return (
    <AuthShell t={t} language={language} setLanguage={setLanguage}>
      <GlassCard className="w-full max-w-3xl p-8 hp-fade-up">
        <div data-testid="subscribe-gate">
          <h2 className="text-2xl font-bold text-white mb-2">{t.subReqTitle}</h2>
          <p className="text-white/70 mb-1">{hadTrial ? t.subReqBodyTrialEnded : t.subReqBodyNoTrial}</p>
          {isMemberOfTeam && (
            <p className="text-amber-300/90 text-sm mb-2" data-testid="subscribe-gate-team">{t.subReqTeamNote}</p>
          )}
          <p className="text-white/45 text-sm mb-6">{t.subReqAfterPay}</p>

          {/* Billing term */}
          <div className="flex gap-2 mb-5">
            {BILLING_TERMS.map(bt => (
              <button
                key={bt}
                onClick={() => setTerm(bt)}
                className={`px-4 py-2 rounded-full text-sm border transition-colors ${
                  term === bt
                    ? 'bg-emerald-400/20 border-emerald-400/60 text-emerald-200 font-semibold'
                    : 'border-white/15 text-white/60 hover:bg-white/5'
                }`}
              >
                {TERM_NAMES[bt]}
              </button>
            ))}
          </div>

          {/* Plans */}
          <div className="grid md:grid-cols-3 gap-4 mb-6">
            {SUB_PLAN_CODES.map(code => {
              const plan = SUB_PLANS[code];
              const configured = checkoutConfigured(code, term);
              return (
                <div key={code} className="rounded-2xl border border-white/12 bg-white/5 p-5 flex flex-col gap-2">
                  <p className="text-white font-semibold">{SUB_PLAN_NAMES[code]}</p>
                  <p className="text-2xl font-bold text-white">{formatEur(plan.prices[term])}</p>
                  <p className="text-white/45 text-xs">
                    {t.subReqPerMonth.replace('{v}', formatEur(Math.round(perMonth(code, term) * 100) / 100))}
                    {' · '}{t.subReqVatNote}
                  </p>
                  <button
                    onClick={() => subscribe(code)}
                    disabled={!configured}
                    className={`${primaryBtn} mt-auto ${configured ? '' : 'opacity-40 cursor-not-allowed'}`}
                    data-testid={`subscribe-${code}`}
                  >
                    {configured ? t.subReqSubscribe : t.subReqComingSoon}
                  </button>
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-3">
            <button onClick={refresh} disabled={busy} className={ghostBtn} data-testid="subscribe-refresh">
              {busy ? t.loading : t.subReqRefresh}
            </button>
            <button onClick={onLogout} className="text-white/45 hover:text-white text-sm transition-colors ml-auto">
              {t.subReqSignOut}
            </button>
          </div>
        </div>
        <LegalFooter language={language} dark />
      </GlassCard>
    </AuthShell>
  );
};

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<ViewState>(IS_ADMIN_BUILD ? 'LOGIN' : 'LANDING');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  // One-email-one-country redirect screen: { country } for a login/social block
  // (registered elsewhere), or null-country for a signup with an existing email.
  const [mismatch, setMismatch] = useState<{ country: string | null } | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [language, setLanguage] = useState<Language>(DEFAULT_LANGUAGE);
  // Operations-console language (EN | KO only) — separate from the country
  // Language type, persisted so the choice carries into the dashboard.
  const [adminLang, setAdminLangState] = useState<AdminLang>(loadAdminLang());
  const setAdminLang = (l: AdminLang) => { setAdminLangState(l); saveAdminLang(l); };

  const [fullDatabase, setFullDatabase] = useState<HeatPumpDatabase | null>(null);
  // Dataset download failure (Storage/network/access layer) — surfaced as a
  // banner with retry in the app shell, never as a silently empty catalogue.
  const [datasetsFailed, setDatasetsFailed] = useState(false);
  const [datasetsRetryTick, setDatasetsRetryTick] = useState(0);
  
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPass, setLoginPass] = useState('');
  // Team invitation link produced by the Team Owner in Account → Team management.
  const inviteParams = new URLSearchParams(window.location.search);
  const inviteOrgId = inviteParams.get('invite') ?? '';
  const invitedEmail = (inviteParams.get('email') ?? '').trim().toLowerCase();
  const isInvite = !!inviteOrgId && !!invitedEmail;
  // Account/data-use consent popup (signup gate) — resolves on agree.
  const [termsPrompt, setTermsPrompt] = useState<{ resolve: () => void; reject: () => void } | null>(null);
  const requestTermsConsent = () =>
    new Promise<void>((resolve, reject) => setTermsPrompt({ resolve, reject }));

  // Concurrent sessions (docs/CONCURRENT_SESSIONS.md): grace deadline for the
  // countdown banner, and the reason notice shown after a server-side revoke.
  const [sessionGraceUntil, setSessionGraceUntil] = useState<number | null>(null);
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!currentUser || currentUser.id === 'preview' || currentUser.status !== 'active') {
      setSessionGraceUntil(null);
      return;
    }
    const stop = startSessionTracking(currentUser.id, {
      onState: st => setSessionGraceUntil(st.graceUntilMs),
      onRevoked: reason => {
        setSessionGraceUntil(null);
        setSessionNotice(reason === 'auto-limit' ? (t as any).sessionRevokedLimit : (t as any).sessionRevokedOther);
        logoutUser();
      },
    });
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id, currentUser?.status]);

  // The signed-in user's team, for the entitlement check (a member's access
  // window is the org's). Loaded lazily; while null the check can only be
  // MORE permissive (fail-open), never lock anyone out.
  const [myOrg, setMyOrg] = useState<Organization | null>(null);
  useEffect(() => {
    let alive = true;
    if (currentUser?.orgId) {
      getMyOrg(currentUser).then(o => { if (alive) setMyOrg(o); }).catch(() => {});
    } else {
      setMyOrg(null);
    }
    return () => { alive = false; };
  }, [currentUser?.id, currentUser?.orgId]);

  const t = translations[language];

  useEffect(() => {
    // 1. Auth
    const unsubscribe = onUserChange((user) => {
      setCurrentUser(user);
      if (user) {
        // Enforce approval status in ALL views — including while the user is already in the app.
        // This ensures real-time enforcement if an admin suspends/rejects a live session.
        if (user.status === 'pending') {
          // Trial flow keeps the session open while the verification mail is
          // outstanding; legacy flow waits for admin approval (signed out).
          setCurrentView(TRIAL_FLOW_ENABLED ? 'VERIFY_EMAIL' : 'PENDING_APPROVAL');
        } else if (
          user.status === 'suspended' ||
          user.status === 'rejected' ||
          user.status === 'disabled' ||
          // Deleted (or mid-deletion) accounts must never keep a live app
          // session — e.g. after a deleteAccount where only the final Auth
          // removal failed (2026-07-27 audit item 5).
          user.status === 'deleted' ||
          user.status === 'deletion_requested'
        ) {
          logoutUser();
        } else {
          // User is approved — only redirect to APP when coming from pre-app views.
          // If already in APP or ADMIN_DASHBOARD, leave them where they are.
          const needsRouting =
            currentView === 'LANDING' ||
            currentView === 'LOGIN' ||
            currentView === 'SIGNUP' ||
            currentView === 'PENDING_APPROVAL' ||
            currentView === 'VERIFY_EMAIL';
          if (needsRouting) {
            if (IS_ADMIN_BUILD) {
              if (isAdminRole(user.role)) {
                setCurrentView('ADMIN_DASHBOARD');
              } else {
                alert('This console requires an administrator account.');
                logoutUser();
              }
            } else {
              setCurrentView('APP');
            }
          }
        }
      } else {
        if (IS_ADMIN_BUILD) {
          if (currentView !== 'LOGIN') setCurrentView('LOGIN');
        } else if (currentView === 'APP' || currentView === 'PENDING_APPROVAL') {
          setCurrentView('LANDING');
        }
      }
      setAuthLoading(false);
    });

    // 2. Load Data from Firestore
    const loadData = async () => {
      try {
        // Dataset fetches report failure (banner + retry) but never abort the
        // rest of the load — news/policies still render.
        let productsFailed = false;
        const orEmpty = <T,>(p: Promise<T[]>): Promise<T[]> =>
          p.catch(err => { console.error('Dataset load failed:', err); productsFailed = true; return []; });
        const [products, commercialProducts, news, policies, bafa] = await Promise.all([
            orEmpty(getProducts()),
            orEmpty(getCommercialProducts()),
            getNews(),
            getPolicies(),
            getBAFA()
        ]);
        setDatasetsFailed(productsFailed);

        const dbData: HeatPumpDatabase = {
            generatedAt: new Date().toISOString(),
            version: "Firestore-Live",
            appMode: 'DATABASE',
            products: products,
            commercialProducts: commercialProducts,
            newsFeed: news,
            policySummary: policies,
            bafaListLinks: bafa
        };
        setFullDatabase(dbData);
      } catch (err) {
          console.error("Failed to load Firestore data", err);
      }
    };
    // Datasets + Firestore content are auth-protected (anti-scraping):
    // loading before sign-in would only produce permission errors, so wait
    // for a session. The effect re-runs on the post-login view change.
    // Dev server reads local files and may load immediately (previews).
    if (import.meta.env.DEV || auth.currentUser) loadData();

    return () => unsubscribe();
  }, [currentView, datasetsRetryTick]);

  // ... (Keep all Handlers: handleLogin, handleSignup, etc. EXACTLY AS THEY WERE) ...
  /** Route the one-email-one-country sentinels to the mismatch screen. Returns
   *  true when handled, so callers skip the default alert(). */
  const routeAuthError = (err: any): boolean => {
    const msg = String(err?.message ?? '');
    if (msg.startsWith(WRONG_COUNTRY_PREFIX)) {
      setMismatch({ country: msg.slice(WRONG_COUNTRY_PREFIX.length) || null });
      setCurrentView('COUNTRY_MISMATCH');
      return true;
    }
    if (msg === EMAIL_ELSEWHERE) {
      setMismatch({ country: null });
      setCurrentView('COUNTRY_MISMATCH');
      return true;
    }
    return false;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await loginUser(loginEmail, loginPass);
      setLoginEmail(''); setLoginPass('');
    } catch (err: any) {
      if (String(err?.message) === VERIFY_EMAIL_SENTINEL) {
        // Account exists but the verification link is still unclicked —
        // session is kept; the verify screen can re-check and re-send.
        setCurrentView('VERIFY_EMAIL');
        return;
      }
      if (!routeAuthError(err)) alert(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignup = async (values: SignupFormValues) => {
    // Final-step consent popup (account terms + data-use notice) — the same
    // gate every first-time social sign-in passes. Declining aborts signup.
    try { await requestTermsConsent(); }
    catch { alert(t.termsDeclined); return; }

    setIsLoading(true);
    try {
      const { consent, ...data } = values;   // consent is recorded as termsAcceptedAt/version
      const result = await registerUser(data);
      if (result.state === 'active') {
        // Free-access grant applied — the account is live, go straight in.
        setCurrentUser(result.user);
        setCurrentView('APP');
      } else if (result.state === 'verify-email') {
        setCurrentView('VERIFY_EMAIL');
      } else {
        setCurrentView('PENDING_APPROVAL');
      }
    } catch (err: any) {
      if (!routeAuthError(err)) alert(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  /** VERIFY_EMAIL screen: user says they clicked the link — ask the server. */
  const handleVerifyCheck = async () => {
    setIsLoading(true);
    try {
      const fin = await tryFinalizeSignup();
      if (fin.state === 'active') {
        setCurrentUser(fin.user);
        setCurrentView('APP');
      } else if (fin.state === 'unverified') {
        alert((t as any).verifyNotYet);
      } else {
        alert((t as any).verifyFailed);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyResend = async () => {
    try {
      await resendVerificationEmail();
      alert((t as any).verifyResent);
    } catch {
      alert((t as any).verifyFailed);
    }
  };

  /**
   * Invited team member: the seat is already paid for by the Team Owner, so this
   * is not a public registration — no plan choice, no checkout, no approval
   * queue. The profile is created active and the seat is claimed at once.
   */
  const handleInvitedSignup = async (values: SignupFormValues) => {
    setIsLoading(true);
    try {
      const user = await registerInvitedMember(inviteOrgId, {
        firstName: values.firstName,
        lastName: values.lastName,
        email: invitedEmail,
        password: values.password,
        marketingConsent: values.marketingConsent,
      });
      setCurrentUser(user);
      setCurrentView('APP');
    } catch (err: any) {
      alert(err?.code === 'auth/email-already-in-use' ? err.message : t.invFailed);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSocialLogin = async (provider: 'google' | 'apple') => {
    setIsLoading(true);
    try {
      const result = await loginWithProvider(provider, requestTermsConsent);
      // 'active' → onUserChange routes into the app automatically.
      // 'redirecting' → the page is navigating to the provider (popup was
      // blocked, e.g. Safari); the redirect-return effect below finishes.
      if (result === 'pending-created') setCurrentView('PENDING_APPROVAL');
    } catch (err: any) {
      // User closed/cancelled the popup — not an error worth alerting.
      if (err?.code === 'auth/popup-closed-by-user' || err?.code === 'auth/cancelled-popup-request') return;
      if (err?.message === 'terms-declined') { alert(t.termsDeclined); return; }
      if (!routeAuthError(err)) alert(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    const email = currentUser?.email || '';
    const name = currentUser ? `${currentUser.firstName} ${currentUser.lastName}` : '';
    await logoutUser(email, name);
  };

  // Redirect-flow return (Safari popup-blocked fallback): finish the social
  // sign-in the popup path could not run — same terms gate and status routing.
  useEffect(() => {
    (async () => {
      try {
        const result = await completeRedirectSignIn(requestTermsConsent);
        if (result === 'pending-created') setCurrentView('PENDING_APPROVAL');
        // 'active' → onUserChange routes into the app; null → nothing pending.
      } catch (err: any) {
        if (err?.message === 'terms-declined') { alert(t.termsDeclined); return; }
        if (!routeAuthError(err) && err?.message) alert(err.message);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Admin access is role-based (Firebase account): owner/admin/support/ops only.
  // Firestore security rules enforce the same roles server-side, so the view
  // gate here is UX — data access is protected even if the gate were bypassed.
  const handleAdminAccess = () => {
    if (currentUser && isAdminRole(currentUser.role)) {
      setCurrentView('ADMIN_DASHBOARD');
    } else if (currentUser) {
      alert(language === 'de'
        ? 'Der Admin-Bereich erfordert ein Administratorkonto.'
        : 'The admin console requires an administrator account.');
    } else {
      alert(language === 'de'
        ? 'Bitte melden Sie sich mit einem Administratorkonto an.'
        : 'Please log in with an administrator account first.');
      setCurrentView('LOGIN');
    }
  };

  // ── Public policy pages (/privacy, /terms, /refund-policy, /imprint) ──────
  // Rendered before the auth gate: no login, no redirect, shareable link. Hosting
  // rewrites every path to index.html, so this is all the routing they need.
  const legalDoc = legalDocForPath(window.location.pathname);
  if (legalDoc) {
    return <LegalPage doc={legalDoc} language={language} setLanguage={setLanguage} />;
  }

  // ── Public pricing page (/pricing) — read-only, no login, shared plan config ──
  if (window.location.pathname.replace(/\/+$/, '') === PRICING_ROUTE) {
    return <PublicPricingPage language={language} setLanguage={setLanguage} />;
  }

  // Dev-only admin console preview (no auth, layout only — Firestore reads
  // still require a real admin account): vite dev server + ?preview=admin
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).get('preview') === 'admin') {
    return (
      <AdminDashboard
        onLogout={() => {}}
        cachedDatabase={fullDatabase ? [...fullDatabase.products, ...(fullDatabase.commercialProducts ?? [])] : null}
        lastUpdated={fullDatabase?.generatedAt || null}
        language={language}
      />
    );
  }

  // Dev-only UI preview (no auth): vite dev server + ?preview=hpiq
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).get('preview') === 'hpiq') {
    const previewUser: User = {
      id: 'preview', email: 'c.sung@example.de', firstName: 'Christopher', lastName: 'Sung',
      companyType: 'installer', companyName: 'Sung Haustechnik', companyCity: 'Hamburg',
      companyWebsite: 'sung-haustechnik.example',
      isActive: true, registeredAt: new Date().toISOString(),
      ...previewUserPatch(),        // ?as=owner | member → team account shapes
    };
    return (
      <HpiqApp
        user={previewUser}
        onLogout={() => {}}
        dbData={fullDatabase}
        datasetsFailed={datasetsFailed}
        onRetryDatasets={() => setDatasetsRetryTick(n => n + 1)}
        language={language}
        setLanguage={setLanguage}
      />
    );
  }

  if (authLoading) return <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-400">{t.loading}</div>;


  // ... (Return JSX - Keep exactly the same structure as before) ...
  // I am omitting the full JSX here for brevity as it hasn't changed, just the data loading logic above.
  // Please ensure you keep the full JSX for LANDING, LOGIN, SIGNUP, APP, ADMIN_DASHBOARD.
  
  // Account/data-use consent popup — gates every registration path
  // (signup form + first-time social sign-in). Fixed overlay above the auth UI.
  const termsModal = termsPrompt ? (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl border border-white/15 bg-[#101b16] p-7 shadow-2xl">
        <h3 className="text-lg font-bold text-white mb-1">{t.termsTitle}</h3>
        <p className="text-white/50 text-sm mb-4">{t.termsIntro}</p>
        <div className="space-y-3 mb-6">
          <p className="text-[13px] leading-relaxed text-white/80 bg-white/5 border border-white/10 rounded-xl p-3.5">{t.termsAccount}</p>
          <p className="text-[13px] leading-relaxed text-white/80 bg-white/5 border border-white/10 rounded-xl p-3.5">{t.termsData}</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => { termsPrompt.resolve(); setTermsPrompt(null); }}
            className="flex-1 py-3 rounded-xl font-semibold text-gray-900 bg-gradient-to-r from-emerald-400 to-cyan-400 hover:opacity-90 transition-opacity"
          >
            {t.termsAgree}
          </button>
          <button
            onClick={() => { termsPrompt.reject(); setTermsPrompt(null); }}
            className="px-5 py-3 rounded-xl font-medium text-white/70 border border-white/20 hover:bg-white/5 transition-colors"
          >
            {t.termsCancel}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  // Post-revoke reason notice (never a bare login screen) — shown on the auth
  // surface after the server signed this device out.
  const sessionNoticeEl = sessionNotice ? (
    <div className="w-full max-w-xl mx-auto mb-5 flex items-start gap-3 rounded-xl border border-amber-300/40 bg-amber-400/10 px-4 py-3 text-sm text-amber-100" data-testid="session-notice">
      <span className="flex-1 leading-relaxed">{sessionNotice}</span>
      <button onClick={() => setSessionNotice(null)} className="text-amber-200/70 hover:text-white">×</button>
    </div>
  ) : null;

  // ... (Previous JSX code) ...
  if (currentView === 'LANDING') {
    return (
      <AuthShell t={t} language={language} setLanguage={setLanguage}>
        <div className="w-full flex flex-col items-center gap-10">
        {sessionNoticeEl}
        <div className="w-full max-w-6xl grid lg:grid-cols-[1.15fr_0.85fr] gap-12 lg:gap-16 items-center">
          {/* Hero — market story */}
          <div className="max-w-xl hp-fade-up">
            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-400/10 border border-emerald-400/25 text-emerald-300 text-xs font-semibold tracking-wide uppercase">
              <LeafIcon className="w-3.5 h-3.5" />
              {t.authTagline}
            </span>
            <h1 className="mt-5 text-4xl md:text-5xl font-bold tracking-tight leading-[1.08]">
              {t.authHeadline}
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400">
                {t.authHeadlineAccent}
              </span>
            </h1>
            <p className="mt-4 text-white/60 text-base md:text-lg">{t.subTitle}</p>
            <div className="mt-5">
              <SegmentTiles t={t} />
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {[t.authChipBafa, t.authChipRefrigerant, t.authChipScop].map((chip: string) => (
                <span key={chip} className="px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-[11px] text-white/70 whitespace-nowrap">
                  {chip}
                </span>
              ))}
            </div>
            {/* Indexable market keywords — compact two-line copy (search visibility). */}
            {(t as any).authSeoLine && (
              <p className="mt-4 text-[11px] leading-relaxed text-white/40 max-w-lg">
                {(t as any).authSeoLine}
              </p>
            )}
          </div>

          {/* Entry card */}
          <div className="w-full max-w-md justify-self-center lg:justify-self-end flex flex-col gap-3 hp-fade-up-delay">
            {/* Live catalogue stats (build-time counts) — the app's USP,
                presented as a three-line lockup above the entry card. */}
            {__MARKET_STATS__.res > 0 && (
              <div className="text-center flex flex-col gap-1.5 mb-1">
                <p className="text-[11px] tracking-[0.16em] uppercase text-white/50">{(t as any).authStatsTitle}</p>
                <p className="text-3xl font-bold leading-none text-transparent bg-clip-text bg-gradient-to-r from-emerald-300 via-teal-200 to-cyan-300">
                  {(t as any).authStatsTotal} {(__MARKET_STATS__.res + __MARKET_STATS__.com).toLocaleString()}
                </p>
                <p className="text-[12.5px] text-white/60">
                  {t.tabResidential} <span className="font-semibold text-white/85">{__MARKET_STATS__.res.toLocaleString()}</span>
                  <span className="mx-2 text-white/30">·</span>
                  {t.tabCommercial} <span className="font-semibold text-white/85">{__MARKET_STATS__.com.toLocaleString()}</span>
                </p>
              </div>
            )}
          <GlassCard className="w-full p-8">
            <h2 className="text-xl font-semibold text-white mb-6 text-center">{t.welcomeTitle}</h2>
            <div className="flex flex-col gap-3">
              <button onClick={() => setCurrentView('SIGNUP')} className={primaryBtn}>{t.signup}</button>
              <button onClick={() => setCurrentView('LOGIN')} className={ghostBtn}>{t.login}</button>
            </div>
            {/* Public, read-only plans & pricing (no login required to view) */}
            <div className="mt-4 text-center">
              <a href={PRICING_ROUTE} className="text-emerald-300/90 text-sm font-medium hover:text-emerald-200 transition-colors">
                {VIEW_PRICING[language]} ›
              </a>
            </div>
            {/* Admin access + legal links are intentionally NOT on the landing
                page — they live on the login/signup pages (header Admin button +
                their footer). The legal PAGES stay public at /terms etc.; Paddle
                needs them publicly reachable and linked, which the auth pages do. */}
          </GlassCard>
          </div>
        </div>
        </div>
      </AuthShell>
    );
  }
  if (currentView === 'LOGIN') {
    // Operations console (heatpumpdb-hub): its own EN|KO sign-in, no country
    // chrome, no social/sign-up — the console is admin-only.
    if (IS_ADMIN_BUILD) {
      return (
        <AdminLogin
          email={loginEmail} setEmail={setLoginEmail}
          password={loginPass} setPassword={setLoginPass}
          onSubmit={handleLogin} isLoading={isLoading}
          onGoogle={async () => {
            setIsLoading(true);
            try {
              // Existing admin accounts only — success routes via onUserChange.
              await adminGoogleSignIn();
            } catch (err: any) {
              const L = ADMIN_I18N[adminLang].login;
              const msg = String(err?.message ?? '');
              if (err?.code === 'auth/popup-closed-by-user' || err?.code === 'auth/cancelled-popup-request') return;
              if (msg === 'admin-account-required') alert(L.adminOnly);
              else if (msg === 'admin-popup-blocked') alert(L.popupBlocked);
              else alert(msg);
            } finally {
              setIsLoading(false);
            }
          }}
          lang={adminLang} setLang={setAdminLang}
        />
      );
    }
    return (
      <AuthShell t={t} language={language} setLanguage={setLanguage}>
        {termsModal}
        <div className="w-full flex flex-col items-center">
        {sessionNoticeEl}
        <GlassCard className="w-full max-w-md p-8 hp-fade-up">
          <button onClick={() => setCurrentView('LANDING')} className="text-white/40 hover:text-white text-sm mb-6 transition-colors">← {t.back}</button>
          <h2 className="text-2xl font-bold text-white mb-1">{t.loginTitle}</h2>
          <p className="text-white/50 text-sm mb-7">{t.loginSub}</p>
          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className={authLabel}>{t.email}</label>
              <input type="email" required autoComplete="email" className={authInput} value={loginEmail} onChange={e => setLoginEmail(e.target.value)} />
            </div>
            <div>
              <label className={authLabel}>{t.password}</label>
              <input type="password" required autoComplete="current-password" className={authInput} value={loginPass} onChange={e => setLoginPass(e.target.value)} />
            </div>
            <div className="flex justify-end">
              <button type="button" onClick={() => alert("Reset link sent to email.")} className="text-sm text-emerald-300/80 hover:text-emerald-200 transition-colors">{t.forgotPass}</button>
            </div>
            <button type="submit" disabled={isLoading} className={primaryBtn}>{isLoading ? t.loggingIn : t.loginTitle}</button>
          </form>
          <div className="flex items-center gap-3 my-6">
            <span className="flex-1 h-px bg-white/10" />
            <span className="text-xs text-white/40">{t.orContinueWith}</span>
            <span className="flex-1 h-px bg-white/10" />
          </div>
          <div className="flex flex-col gap-3">
            <button type="button" onClick={() => handleSocialLogin('google')} disabled={isLoading} className={socialBtn}>
              <GoogleIcon /> {t.continueGoogle}
            </button>
            <button type="button" onClick={() => handleSocialLogin('apple')} disabled={isLoading} className={socialBtn}>
              <AppleIcon /> {t.continueApple}
            </button>
          </div>
          <p className="mt-6 text-center text-sm text-white/45">
            {t.authNoAccount}{' '}
            <button onClick={() => setCurrentView('SIGNUP')} className="text-emerald-300 font-semibold hover:text-emerald-200 transition-colors">{t.signup}</button>
          </p>
          <LegalFooter language={language} dark />
        </GlassCard>
        </div>
      </AuthShell>
    );
  }
  if (isInvite && !currentUser) {
    return (
      <AuthShell t={t} language={language} setLanguage={setLanguage}>
        <GlassCard className="w-full max-w-xl p-8 hp-fade-up" >
          <h2 className="text-2xl font-bold text-white mb-1" data-testid="invite-title">{t.invTitle}</h2>
          <p className="text-white/50 text-sm mb-6">{t.invSub}</p>
          <SignupForm t={t} language={language} isLoading={isLoading} invitedEmail={invitedEmail} onSubmit={handleInvitedSignup} />
          <LegalFooter language={language} dark />
        </GlassCard>
      </AuthShell>
    );
  }

  // Registration pause — the Sign Up entry stays visible everywhere; choosing it
  // explains why it is closed instead of showing a form that cannot succeed.
  // Same copy in every country edition (DE/GB/FR), localized by the active UI
  // language. The date is display only — see src/config/registration.ts.
  if (currentView === 'SIGNUP' && !REGISTRATION_OPEN) {
    const reopen = new Date(`${REGISTRATION_REOPEN_DATE}T00:00:00Z`).toLocaleDateString(
      language === 'de' ? 'de-DE' : language === 'fr' ? 'fr-FR' : 'en-GB',
      { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' },
    );
    return (
      <AuthShell t={t} language={language} setLanguage={setLanguage}>
        <GlassCard className="w-full max-w-md p-10 text-center hp-fade-up">
          <div data-testid="registration-paused">
          <button onClick={() => setCurrentView('LANDING')} className="text-white/40 hover:text-white text-sm mb-6 transition-colors">← {t.back}</button>
          <h2 className="text-2xl font-bold text-white mb-4">{(t as any).regPausedTitle}</h2>
          <p className="text-white/70 text-sm leading-relaxed mb-6">{(t as any).regPausedBody}</p>
          <div className="rounded-xl border border-white/10 bg-white/5 px-5 py-4 mb-7">
            <p className="text-[11px] uppercase tracking-[0.16em] text-white/45 mb-1">{(t as any).regPausedReopen}</p>
            <p className="text-lg font-semibold text-emerald-300" data-testid="registration-reopen-date">{reopen}</p>
          </div>
          <p className="text-white/45 text-sm mb-4">{(t as any).regPausedExisting}</p>
          <button onClick={() => setCurrentView('LOGIN')} className={primaryBtn}>{t.login}</button>
          </div>
          <LegalFooter language={language} dark />
        </GlassCard>
      </AuthShell>
    );
  }

  if (currentView === 'SIGNUP') {
    return (
      <AuthShell t={t} language={language} setLanguage={setLanguage}>
        <GlassCard className="w-full max-w-2xl p-8 hp-fade-up">
          <button onClick={() => setCurrentView('LANDING')} className="text-white/40 hover:text-white text-sm mb-6 transition-colors">← {t.back}</button>
          <h2 className="text-2xl font-bold text-white mb-1">{t.createAccount}</h2>
          <SignupForm t={t} language={language} isLoading={isLoading} onSubmit={handleSignup} />
          <p className="mt-6 text-center text-sm text-white/45">
            {t.authHaveAccount}{' '}
            <button onClick={() => setCurrentView('LOGIN')} className="text-emerald-300 font-semibold hover:text-emerald-200 transition-colors">{t.login}</button>
          </p>
          <LegalFooter language={language} dark />
        </GlassCard>
      </AuthShell>
    );
  }
  if (currentView === 'VERIFY_EMAIL') {
    // Trial flow: the account exists (pending) and a verification mail is out.
    // The session is kept so "check again" / "resend" work; activation itself
    // happens server-side (finalizeSignup checks the Auth record).
    const pendingEmail = currentUser?.email || auth.currentUser?.email || '';
    return (
      <AuthShell t={t} language={language} setLanguage={setLanguage}>
        <GlassCard className="w-full max-w-md p-10 text-center hp-fade-up">
          <div data-testid="verify-email">
            <div className="text-6xl mb-6">📧</div>
            <h2 className="text-2xl font-bold text-white mb-3">{(t as any).verifyTitle}</h2>
            <p className="text-white/70 mb-2">
              {(t as any).verifyBodyPre}
              {pendingEmail && <span className="font-semibold text-emerald-300"> {pendingEmail}</span>}
            </p>
            <p className="text-white/50 text-sm mb-8">{(t as any).verifyBody}</p>
            <button onClick={handleVerifyCheck} disabled={isLoading} className={primaryBtn} data-testid="verify-check">
              {isLoading ? t.loading : (t as any).verifyCheckBtn}
            </button>
            <button onClick={handleVerifyResend} className={`${ghostBtn} mt-3`} data-testid="verify-resend">
              {(t as any).verifyResendBtn}
            </button>
            <button
              onClick={() => { logoutUser(); setCurrentView('LANDING'); }}
              className="mt-6 text-white/40 hover:text-white text-sm transition-colors block mx-auto"
            >
              ← {t.back}
            </button>
          </div>
        </GlassCard>
      </AuthShell>
    );
  }

  if (currentView === 'PENDING_APPROVAL') {
    return (
      <AuthShell t={t} language={language} setLanguage={setLanguage}>
        <GlassCard className="w-full max-w-md p-10 text-center hp-fade-up">
          <div className="text-6xl mb-6">⏳</div>
          <h2 className="text-2xl font-bold text-white mb-3">{t.pendingTitle}</h2>
          <p className="text-white/70 mb-2">{t.pendingSubPre}<span className="font-semibold text-amber-300">{t.pendingSubEm}</span>.</p>
          <p className="text-white/50 text-sm mb-8">
            {t.pendingBody}
          </p>
          <div className="bg-emerald-400/10 border border-emerald-400/20 rounded-xl p-4 text-sm text-emerald-200 mb-8 text-left">
            <p className="font-bold mb-1">{t.pendingNextTitle}</p>
            <ol className="list-decimal list-inside space-y-1 text-emerald-200/80">
              <li>{t.pendingNext1}</li>
              <li>{t.pendingNext2}</li>
              <li>{t.pendingNext3}</li>
            </ol>
          </div>
          <button onClick={() => setCurrentView('LANDING')} className={ghostBtn}>
            {t.pendingBackHome}
          </button>
        </GlassCard>
      </AuthShell>
    );
  }

  if (currentView === 'COUNTRY_MISMATCH') {
    // One email = one country. `mismatch.country` set → login/social from the
    // wrong market (we know their registered country: offer the correct site).
    // null → signup with an email already registered somewhere (country unknown
    // pre-auth): show the generic guidance.
    const site = mismatch?.country ? COUNTRY_SITES[mismatch.country] : null;
    const fill = (tpl: string) => (site ? tpl.replace('{country}', site.name) : tpl);
    return (
      <AuthShell t={t} language={language} setLanguage={setLanguage}>
        <GlassCard className="w-full max-w-md p-10 text-center hp-fade-up">
          <div className="text-6xl mb-6">🌍</div>
          <h2 className="text-2xl font-bold text-white mb-3">
            {site ? t.wrongCountryTitle : t.emailElsewhereTitle}
          </h2>
          <p className="text-white/70 mb-2">{site ? fill(t.wrongCountryBody) : t.emailElsewhereBody}</p>
          <p className="text-white/50 text-sm mb-8">{t.oneAccountOneCountry}</p>
          {site && (
            <a href={site.url} className={`${primaryBtn} block mb-3 no-underline`}>
              {fill(t.wrongCountryCta)}
            </a>
          )}
          <button onClick={() => { setMismatch(null); setCurrentView('LANDING'); }} className={ghostBtn}>
            ← {t.wrongCountryBack}
          </button>
        </GlassCard>
      </AuthShell>
    );
  }

  if (currentView === 'ADMIN_DASHBOARD') {
    // Role guard: never render the console without an admin account.
    if (!currentUser || !isAdminRole(currentUser.role)) {
      setTimeout(() => setCurrentView(currentUser ? 'APP' : 'LANDING'), 0);
      return <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-400">Redirecting…</div>;
    }
    // The console owns its own EN/KO language toggle (sidebar buttons) — no
    // floating flag switcher overlaying the content.
    return (
      <AdminDashboard
        onLogout={() => {
          if (IS_ADMIN_BUILD) { logoutUser(); setCurrentView('LOGIN'); }
          else setCurrentView(currentUser ? 'APP' : 'LANDING');
        }}
        cachedDatabase={fullDatabase ? [...fullDatabase.products, ...(fullDatabase.commercialProducts ?? [])] : null}
        lastUpdated={fullDatabase?.generatedAt || null}
      />
    );
  }
  if (currentView === 'APP' && currentUser) {
    // Day-8 gate (data-driven: only accounts the server stamped with a window
    // can ever expire; admins and legacy accounts never see this). The server
    // rules already deny data reads — this screen is the honest UI for it.
    if (accessExpired(currentUser, myOrg)) {
      return (
        <SubscribeGate
          t={t}
          language={language}
          setLanguage={setLanguage}
          user={currentUser}
          isMemberOfTeam={currentUser.orgRole === 'member'}
          onRefreshed={setCurrentUser}
          onLogout={handleLogout}
        />
      );
    }
    // HeatPump DB shell owns its own language toggle (DE|EN in the global nav) —
    // no floating switcher overlay here.
    return (
      <HpiqApp
        user={currentUser}
        onLogout={handleLogout}
        onAdminAccess={isAdminRole(currentUser.role) ? handleAdminAccess : undefined}
        dbData={fullDatabase}
        datasetsFailed={datasetsFailed}
        onRetryDatasets={() => setDatasetsRetryTick(n => n + 1)}
        language={language}
        setLanguage={setLanguage}
        sessionGraceUntil={sessionGraceUntil}
      />
    );
  }

  return <div>{t.loading}</div>;
};
export default App;