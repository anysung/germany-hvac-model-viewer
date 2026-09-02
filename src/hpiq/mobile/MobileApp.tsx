/**
 * Compact-device shell (phone + tablet) — a curated subset of the desktop app.
 *
 * Feature matrix (deliberate, per device class):
 *   phone   — bottom tab bar: Search · Products · Funding · News · Account;
 *             product detail as full-screen sheet. Excluded: data-sheet studio,
 *             EU label records, 4-way compare (desktop-only note shown).
 *   tablet  — same feature set, top tab bar, 2-column grids, persistent side
 *             detail panel.
 *   desktop — the full dense UI in HpiqApp.tsx (unchanged).
 */
import React, { useState, useEffect } from 'react';
import { HpApp, HpPage } from '../appState';
import { tr } from '../i18n';
import { UI_LANGUAGES, FUNDING_SOURCE_LINKS, MARKET_ICON_32 } from '../market';
import { LEGAL_ROUTES, LegalDoc, MARKETING_EMAIL } from '../../config/legal';
import { SupportCard, SignInMethodsCard, TeamManagementView } from '../pages/accountParts';
import { LEGAL_NAV } from '../../legal/LegalPage';
import { openCheckout, checkoutConfigured } from '../../services/paddleService';
import { TRIAL_FLOW_ENABLED, billingPortalFn } from '../../services/billingFnService';
import { getMyOrg } from '../../services/subscriptionService';
import { previewOrg } from '../devPreview';
import { SubPlanCode, BillingTerm, BILLING_TERMS, SUB_PLANS, SUB_PLAN_CODES, formatEur, isTeamPlan, subscriptionUnlocked, sharedTermDiscountPct, effectiveSubscription } from '../../config/subscriptionPlans';
import { FD, SignOutIcon, VideoExplainer, sectionLabel } from '../ui';
import { GUIDE_VIDEO_ID } from '../market';
import { BrandLogo, WavingFlag } from '../../components/BrandLogo';
import { NewsItem, Language, Organization } from '../../types';
import type { Viewport } from '../useViewport';
import { MobileFind, MobileProducts, MobileDetail } from './MobileCatalog';
import { DataSheetDoc } from '../pages/DataSheetPage';
import { showInstallUi, canPromptInstall, isIos, promptInstall, onInstallStateChange } from '../pwaInstall';
import { shortDate } from '../model';
import { NEWS_SERIF, localizedNews, newsEyebrow, articleDeepLink, emailArticleHref, makeArticlePdf } from '../newsModel';
import { NewsGallery, galleryOf } from '../NewsGallery';
import { TrendsPage } from '../pages/TrendsPage';
import { InstallPage } from '../pages/InstallPage';
import { SubTabs, recallSubTab } from '../ui';
import { printPdfViaShareSheet } from '../pdf/deliverPdf';

type MTab = Extract<HpPage, 'find' | 'products' | 'bafa' | 'datasheet' | 'news' | 'account' | 'label' | 'trends' | 'install'> | 'guide';

/* ── Tiny tab icons (stroke style matching the desktop icon set) ─────────── */

const Ic: React.FC<{ d: string; active: boolean }> = ({ d, active }) => (
  <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke={active ? '#1d1d1f' : '#9a9aa0'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);
const ICONS: Record<MTab, string> = {
  find: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  products: 'M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM13 13h8v8h-8z',
  bafa: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v10M9.5 9.5h3.8a1.8 1.8 0 0 1 0 3.6H9.5',
  news: 'M4 4h13v16H4zM17 8h3v12H6M7.5 8h6M7.5 12h6M7.5 16h6',
  guide: 'M4 5h16M4 12h16M4 19h10',
  account: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 3.6-6 8-6s8 2 8 6',
  datasheet: 'M6 2h9l5 5v15H6zM15 2v5h5M9 12h8M9 16h8M9 8h3',
  // EU energy label: tag outline with the class arrow
  label: 'M4 4h10l6 8-6 8H4zM8 9v6M8 12h5',
  // Market & Trends: rising chart
  trends: 'M4 20V10M10 20V4M16 20v-7M20 20H2M20 8l-4-4-3 3-3-3',
  // Installation videos: play button in a frame
  install: 'M3 5h18v14H3zM10 9l5 3-5 3z',
};

/* ── PWA install (mobile browsers never volunteer the prompt themselves) ── */

const INSTALL_DISMISS_KEY = 'hpdb-install-dismissed';

const useInstallState = () => {
  const [, force] = useState(0);
  React.useEffect(() => onInstallStateChange(() => force(x => x + 1)), []);
};

/** Dismissible banner under the header — Android triggers the native prompt,
 *  iOS opens step-by-step "Add to Home Screen" instructions. */
const InstallBanner: React.FC<{ app: HpApp; onIosGuide: () => void }> = ({ app, onIosGuide }) => {
  const t = tr(app.lang);
  useInstallState();
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(INSTALL_DISMISS_KEY) === '1'; } catch { return false; }
  });
  if (dismissed || !showInstallUi()) return null;
  const dismiss = () => { setDismissed(true); try { localStorage.setItem(INSTALL_DISMISS_KEY, '1'); } catch { /* ignore */ } };
  const install = async () => {
    if (canPromptInstall()) {
      const ok = await promptInstall();
      if (ok) { app.notify(t.m.installDone); dismiss(); }
    } else if (isIos()) {
      onIosGuide();
    }
  };
  return (
    <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', background: '#eef4fc', borderBottom: '1px solid #d9e6f7' }}>
      <span style={{ fontSize: 16 }}>📲</span>
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
        <span style={{ fontSize: 12.5, fontWeight: 600 }}>{t.m.installTitle}</span>
        <span style={{ fontSize: 11, color: '#5a6b80', lineHeight: 1.35 }}>{t.m.installText}</span>
      </div>
      <span className="hp-press" onClick={install} style={{ flex: 'none', background: '#0066cc', color: '#fff', borderRadius: 999, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
        {t.m.installBtn}
      </span>
      <span onClick={dismiss} style={{ flex: 'none', color: '#9aa8ba', cursor: 'pointer', fontSize: 14, padding: '2px 4px' }}>✕</span>
    </div>
  );
};

const IosInstallGuide: React.FC<{ app: HpApp; onClose: () => void }> = ({ app, onClose }) => {
  const t = tr(app.lang);
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 120, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '18px 18px 0 0', width: 'min(560px, 100%)', padding: '22px 22px calc(26px + env(safe-area-inset-bottom))', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <span style={{ fontFamily: FD, fontSize: 18, fontWeight: 600 }}>{t.m.installIosTitle}</span>
        <span style={{ fontSize: 14, lineHeight: 1.6 }}>{t.m.installIos1}</span>
        <span style={{ fontSize: 14, lineHeight: 1.6 }}>{t.m.installIos2}</span>
        <span className="hp-press" onClick={onClose} style={{ marginTop: 6, textAlign: 'center', border: '1px solid #d2d2d7', borderRadius: 999, padding: '11px 0', fontSize: 14, cursor: 'pointer' }}>
          {t.m.installLater}
        </span>
      </div>
    </div>
  );
};

/* ── Funding page (t.bafa content, stacked) ──────────────────────────────── */

const MobileFunding: React.FC<{ app: HpApp; goGuide: (tab: 'home' | 'pro') => void }> = ({ app, goGuide }) => {
  const t = tr(app.lang);
  const totalText = app.totalListed ? app.totalListed.toLocaleString(t.locale) : '—';
  const card: React.CSSProperties = { border: '1px solid #e0e0e0', borderRadius: 14, padding: '15px 17px', display: 'flex', flexDirection: 'column', gap: 5, background: '#fff' };
  return (
    <div style={{ padding: '20px 16px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <SubTabs
        group="funding"
        tabs={[{ id: 'bafa', label: t.nav.bafa }, { id: 'guide', label: t.nav.guide }]}
        active="bafa"
        onSelect={id => app.go(id as HpPage)}
      />
      <div data-tour="funding" style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <span style={{ fontFamily: FD, fontSize: 25, fontWeight: 600, letterSpacing: '-0.3px' }}>{t.bafa.heroTitle}</span>
        <span style={{ fontSize: 13.5, color: '#7a7a7a', lineHeight: 1.5 }}>{t.bafa.heroSub}</span>
      </div>

      {[
        [t.bafa.card1Title, t.bafa.card1Head, t.bafa.card1Text],
        [t.bafa.card2Title, t.bafa.card2Head, t.bafa.card2Text],
        [t.bafa.card3Title, t.bafa.card3Head(totalText), t.bafa.card3Text],
      ].map(([title, head, text]) => (
        <div key={title as string} style={card}>
          <span style={sectionLabel}>{title}</span>
          <span style={{ fontFamily: FD, fontSize: 19, fontWeight: 600 }}>{head}</span>
          <span style={{ fontSize: 12.5, color: '#7a7a7a', lineHeight: 1.5 }}>{text}</span>
        </div>
      ))}

      <span style={{ fontFamily: FD, fontSize: 18, fontWeight: 600, paddingTop: 4 }}>{t.bafa.recentChanges}</span>
      <div style={{ border: '1px solid #e0e0e0', borderRadius: 14, overflow: 'hidden', background: '#fff' }}>
        {t.bafa.timeline.map((e, i) => (
          <div key={e.date + e.strong} style={{ padding: '13px 16px', display: 'flex', flexDirection: 'column', gap: 5, borderBottom: i < t.bafa.timeline.length - 1 ? '1px solid #f0f0f0' : undefined }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: '#7a7a7a' }}>{e.date}</span>
              <span style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: '.05em', border: '1px solid #e0e0e0', borderRadius: 999, padding: '2px 8px', ...(e.badge === 'GUIDANCE' ? { color: '#7a7a7a' } : {}) }}>
                {e.badge === 'GUIDANCE' ? t.bafa.guidance : t.bafa.confirmed}
              </span>
            </div>
            <span style={{ fontSize: 13, lineHeight: 1.5 }}><strong style={{ fontWeight: 600 }}>{e.strong}</strong>{e.rest}</span>
          </div>
        ))}
      </div>

      <div style={{ ...card, background: '#272729', border: 'none', color: '#fff' }}>
        <span style={{ ...sectionLabel, color: '#ccc' }}>{t.bafa.installerTitle}</span>
        <span style={{ fontSize: 13, lineHeight: 1.55 }}>{t.bafa.installerText}</span>
        <span onClick={() => goGuide('pro')} style={{ fontSize: 13, color: '#2997ff', cursor: 'pointer' }}>{t.bafa.installerLink}</span>
      </div>
      <div style={card}>
        <span style={sectionLabel}>{t.bafa.homeownerTitle}</span>
        <span style={{ fontSize: 13, lineHeight: 1.55 }}>{t.bafa.homeownerText}</span>
        <span onClick={() => goGuide('home')} style={{ fontSize: 13, color: '#0066cc', cursor: 'pointer' }}>{t.bafa.homeownerLink}</span>
      </div>

      <span style={{ fontFamily: FD, fontSize: 18, fontWeight: 600, paddingTop: 4 }}>{t.bafa.sourcesTitle}</span>
      {FUNDING_SOURCE_LINKS.map((s, i) => (
        <div key={s.href} style={card} onClick={() => window.open(s.href, '_blank', 'noopener')}>
          <span style={{ fontWeight: 600, fontSize: 13.5 }}>{t.bafa.sources[i].title}</span>
          <span style={{ fontSize: 11.5, color: '#7a7a7a' }}>{t.bafa.sources[i].sub}</span>
          <span style={{ fontSize: 12.5, color: '#0066cc' }}>{s.link}</span>
        </div>
      ))}
      <span style={{ fontSize: 11, color: '#b6b6bc' }}>{t.bafa.sourcesNote}</span>
    </div>
  );
};

/* ── Data sheet (phone): fit-to-width preview of the SAME printable document
   the desktop studio produces, with Print / PDF actions on top. The core of
   the mobile journey: Find → product info → PDF/Print. ────────────────────── */

const MobileDataSheet: React.FC<{ app: HpApp }> = ({ app }) => {
  const t = tr(app.lang);
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const docRef = React.useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ scale: 1, h: 0 });
  const dsp = app.dsId && app.store ? app.store.byId.get(app.dsId) ?? null : app.store?.all[0] ?? null;

  // Fit the fixed-width (776px total) print document to the phone width by
  // scaling the whole node down; height follows so nothing overlaps.
  React.useEffect(() => {
    const measure = () => {
      const wrap = wrapRef.current, doc = docRef.current;
      if (!wrap || !doc) return;
      const avail = wrap.clientWidth - 20;
      const natural = doc.offsetWidth || 776;
      const scale = Math.min(1, avail / natural);
      setBox({ scale, h: doc.offsetHeight * scale });
    };
    measure();
    const id = setTimeout(measure, 350);   // re-measure after fonts/layout settle
    window.addEventListener('resize', measure);
    return () => { clearTimeout(id); window.removeEventListener('resize', measure); };
  }, [app.dsId, app.dsMode, app.lang, dsp]);

  const actionBtn = (label: string, primary: boolean): React.CSSProperties => ({
    flex: 1, textAlign: 'center', borderRadius: 999, padding: '11px 0', fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
    ...(primary ? { background: '#0066cc', color: '#fff' } : { border: '1px solid #d2d2d7', background: '#fff', color: '#1d1d1f' }),
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {/* action bar */}
      <div style={{ flex: 'none', padding: '12px 16px 10px', display: 'flex', flexDirection: 'column', gap: 8, background: 'rgba(245,245,247,.96)', borderBottom: '1px solid rgba(0,0,0,.06)' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span style={{ fontFamily: FD, fontSize: 21, fontWeight: 600 }}>{t.m.mdsTitle}</span>
          {dsp && <span style={{ fontSize: 12, color: '#7a7a7a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{dsp.model}</span>}
        </div>
        {/* Document kind — the same product/energy-label switch the desktop
            studio has (owner request 2026-07-31: the print/PDF view offered no
            EU-label option on mobile). Drives dsMode → the SAME jsPDF pipeline. */}
        {dsp && (
          <div style={{ display: 'flex', border: '1px solid #d2d2d7', borderRadius: 999, overflow: 'hidden', fontSize: 12.5, width: 'fit-content' }} data-testid="mds-mode" data-tour="ds-mode">
            {([['product', t.ds.modeProduct], ['label', t.ds.modeLabel]] as const).map(([m, lbl]) => (
              <span key={m} onClick={() => app.setDsMode(m)}
                style={{ padding: '7px 15px', cursor: 'pointer', whiteSpace: 'nowrap', ...(app.dsMode === m ? { background: '#1d1d1f', color: '#fff', fontWeight: 600 } : { color: '#1d1d1f' }) }}>
                {lbl}
              </span>
            ))}
          </div>
        )}
        {dsp ? (
          <div style={{ display: 'flex', gap: 9 }}>
            <span className="hp-press" onClick={app.downloadSheetPdf} style={actionBtn(t.m.mdsPdf, true)}>⬇ {t.m.mdsPdf}</span>
            <span className="hp-press" onClick={app.printSheet} style={actionBtn(t.m.mdsPrint, false)}>🖨 {t.m.mdsPrint}</span>
          </div>
        ) : (
          <span className="hp-press" onClick={() => app.go('products')} style={{ fontSize: 13, color: '#0066cc', cursor: 'pointer' }}>{t.m.mdsPick}</span>
        )}
      </div>

      {/* fit-to-width preview */}
      <div ref={wrapRef} style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '14px 10px calc(20px + env(safe-area-inset-bottom))' }}>
        {dsp ? (
          <div style={{ height: box.h, display: 'flex', justifyContent: 'center' }}>
            <div ref={docRef} className="hpiq-ds-scale" style={{ width: 776, transform: `scale(${box.scale})`, transformOrigin: 'top center', flex: 'none' }}>
              <DataSheetDoc app={app} />
            </div>
          </div>
        ) : (
          <div style={{ padding: '40px 16px', textAlign: 'center', color: '#7a7a7a', fontSize: 13.5 }}>{t.find.emptySub}</div>
        )}
      </div>
    </div>
  );
};

/* ── EU energy label (phone/tablet): the desktop page's CORE — class filter,
   record search, and the label sheet — in a card list. Reached from the header
   menu (owner request 2026-07-31); row tap opens the ENERGY LABEL data sheet
   (openDataSheet(id,'label')), matching the desktop inspector's primary action. */

const MobileLabel: React.FC<{ app: HpApp }> = ({ app }) => {
  const t = tr(app.lang);
  const [q, setQ] = useState('');
  const records = React.useMemo(() => {
    let list = app.store ? app.store.labelRecords(app.classFilter) : [];
    const needle = q.trim().toLowerCase();
    if (needle.length >= 2) list = list.filter(v => `${v.model} ${v.mfr}`.toLowerCase().includes(needle));
    return list;
  }, [app.store, app.classFilter, q]);
  const shown = records.slice(0, 80);

  return (
    <div style={{ padding: '18px 16px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <span style={{ fontFamily: FD, fontSize: 'clamp(21px, 6vw, 25px)', fontWeight: 600, letterSpacing: '-0.3px' }}>{t.label.title}</span>

      {/* search + class chips (sticky, like Find) */}
      <div style={{ position: 'sticky', top: 0, zIndex: 20, margin: '0 -16px', padding: '4px 16px 8px', background: 'rgba(245,245,247,.94)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, border: '1px solid #d2d2d7', background: '#fff', borderRadius: 999, padding: '10px 16px' }}>
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder={t.find.placeholder}
            style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 16, fontFamily: 'inherit', color: '#1d1d1f', padding: 0, outline: 'none' }}
          />
          {q && <span onClick={() => setQ('')} style={{ color: '#b6b6bc', cursor: 'pointer', fontSize: 15, padding: '2px 4px' }}>✕</span>}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {['A+++', 'A++', 'A+'].map(c => {
            const on = app.classFilter === c;
            return (
              <span key={c} className="hp-press" onClick={() => app.setClassFilter(on ? null : c)}
                style={{ borderRadius: 999, padding: '6px 14px', fontSize: 12.5, cursor: 'pointer', ...(on ? { background: '#0066cc', color: '#fff', fontWeight: 600 } : { border: '1px solid #d2d2d7', background: '#fff', color: '#1d1d1f' }) }}>
                {c}
              </span>
            );
          })}
          <span style={{ marginLeft: 'auto', fontSize: 11.5, color: '#7a7a7a' }}>{t.label.countLine(String(shown.length), records.length.toLocaleString())}</span>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {shown.map(v => (
          <div key={v.id} className="hp-press" onClick={() => app.openDataSheet(v.id, 'label')}
            style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 12, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 11, cursor: 'pointer' }}>
            {/* class badge — the record's W35 class, arrow-tag shaped like the EU label */}
            <span style={{ flex: 'none', minWidth: 44, textAlign: 'center', fontSize: 13, fontWeight: 700, color: '#fff', background: '#009036', borderRadius: 6, padding: '7px 8px' }}>{v.label || '—'}</span>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 13.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.model}</span>
              <span style={{ fontSize: 11.5, color: '#7a7a7a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.mfr}{v.ratedKw ? ` · ${v.ratedKw}` : ''}</span>
            </div>
            <span style={{ flex: 'none', fontSize: 12, color: '#0066cc', whiteSpace: 'nowrap' }}>{t.label.labelSheetBtn}</span>
          </div>
        ))}
        {records.length === 0 && (
          <div style={{ padding: '32px 8px', textAlign: 'center', color: '#7a7a7a', fontSize: 13 }}>{t.find.noMatchSub}</div>
        )}
      </div>

      <span style={{ fontSize: 10.5, color: '#9a9aa0', lineHeight: 1.5 }}>{t.label.aboutText}</span>
    </div>
  );
};

/* ── Guide (steps, checklist, FAQ) ───────────────────────────────────────── */

const MobileGuide: React.FC<{ app: HpApp }> = ({ app }) => {
  const t = tr(app.lang);
  const pro = app.guideTab === 'pro';
  const steps = pro ? t.guide.stepsPro : t.guide.stepsHome;
  const checks = pro ? t.guide.checkPro : t.guide.checkHome;
  return (
    <div style={{ padding: '20px 16px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <SubTabs
        group="funding"
        tabs={[{ id: 'bafa', label: t.nav.bafa }, { id: 'guide', label: t.nav.guide }]}
        active="guide"
        onSelect={id => app.go(id as HpPage)}
      />
      <span style={{ fontFamily: FD, fontSize: 25, fontWeight: 600, letterSpacing: '-0.3px' }}>{t.guide.heroTitle}</span>
      <div style={{ display: 'flex', border: '1px solid #d2d2d7', borderRadius: 999, overflow: 'hidden', fontSize: 13, width: 'fit-content' }}>
        {([['home', t.guide.tabHome], ['pro', t.guide.tabPro]] as const).map(([id, label]) => (
          <span key={id} onClick={() => { app.setGuideTab(id); app.setFaqOpen(0); /* FAQ list swaps with the tab */ }} style={{ padding: '8px 16px', cursor: 'pointer', ...(app.guideTab === id ? { background: '#1d1d1f', color: '#fff', fontWeight: 600 } : {}) }}>
            {label}
          </span>
        ))}
      </div>

      <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 14, overflow: 'hidden' }}>
        {steps.map(([n, head, text], i) => (
          <div key={n} style={{ display: 'flex', gap: 12, padding: '13px 16px', borderBottom: i < steps.length - 1 ? '1px solid #f0f0f0' : undefined }}>
            <span style={{ flex: 'none', width: 26, height: 26, borderRadius: '50%', background: '#1d1d1f', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12.5, fontWeight: 600 }}>{n}</span>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 13.5, fontWeight: 600 }}>{head}</span>
              <span style={{ fontSize: 12, color: '#7a7a7a', lineHeight: 1.5 }}>{text}</span>
            </span>
          </div>
        ))}
      </div>

      <span style={{ fontFamily: FD, fontSize: 18, fontWeight: 600 }}>{t.guide.checklistTitle}</span>
      <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 14, padding: '6px 16px' }}>
        {checks.map(item => {
          const key = `${app.guideTab}:${item}`;
          const on = !!app.checked[key];
          return (
            <span key={key} onClick={() => app.toggleChecked(key)} style={{ display: 'flex', gap: 11, alignItems: 'flex-start', padding: '10px 0', fontSize: 13, lineHeight: 1.45, cursor: 'pointer', color: on ? '#b6b6bc' : '#1d1d1f', textDecoration: on ? 'line-through' : 'none' }}>
              <span style={{ flex: 'none', width: 18, height: 18, marginTop: 1, borderRadius: 5, border: on ? 'none' : '1.5px solid #d2d2d7', background: on ? '#0066cc' : '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11 }}>{on ? '✓' : ''}</span>
              {item}
            </span>
          );
        })}
      </div>
      <span style={{ fontSize: 11, color: '#b6b6bc' }}>{t.guide.checklistNote}</span>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={sectionLabel}>{t.guide.explainer}</span>
        <VideoExplainer videoId={GUIDE_VIDEO_ID} onUnavailable={() => app.notify(t.guide.videoSoon)} />
        <span style={{ fontSize: 12.5, color: '#555', lineHeight: 1.5 }}>{t.guide.explainerText}</span>
      </div>

      <div style={{ background: '#f0f6ff', borderRadius: 14, padding: '13px 16px', display: 'flex', flexDirection: 'column', gap: 5 }}>
        <span style={sectionLabel}>{t.guide.goodToKnow}</span>
        <span style={{ fontSize: 12.5, lineHeight: 1.5 }}>{t.guide.goodToKnowText}</span>
        <span onClick={app.goProductsR290} style={{ fontSize: 13, color: '#0066cc', cursor: 'pointer' }}>{t.guide.showR290}</span>
      </div>

      <span style={{ fontFamily: FD, fontSize: 18, fontWeight: 600 }}>{t.guide.faqTitle}</span>
      <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 14, overflow: 'hidden' }}>
        {/* Audience-split FAQ — same rule as the desktop GuidePage: installer
            set on the pro tab, consumer set on the home tab. */}
        {(pro ? t.guide.faqsPro : t.guide.faqsHome).map(([q, a], i) => (
          <div key={q} style={{ borderBottom: i < (pro ? t.guide.faqsPro : t.guide.faqsHome).length - 1 ? '1px solid #f0f0f0' : undefined }}>
            <div onClick={() => app.setFaqOpen(app.faqOpen === i ? -1 : i)} style={{ padding: '13px 16px', display: 'flex', justifyContent: 'space-between', gap: 10, cursor: 'pointer' }}>
              <span style={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.4 }}>{q}</span>
              <span style={{ color: '#7a7a7a' }}>{app.faqOpen === i ? '−' : '+'}</span>
            </div>
            {app.faqOpen === i && <div style={{ padding: '0 16px 13px', fontSize: 12.5, color: '#555', lineHeight: 1.55 }}>{a}</div>}
          </div>
        ))}
      </div>
    </div>
  );
};

/* ── News (press-format list + full-screen article reader) ───────────────── */

const MNewsIcon: React.FC<{ d: string }> = ({ d }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);
const M_NEWS_ICONS = {
  pdf: 'M12 3v10m0 0l-4-4m4 4l4-4M5 17v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2',
  email: 'M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM3.5 6.5L12 13l8.5-6.5',
  share: 'M7 11l5-5 5 5M12 6v11M5 20h14',
};

const mNewsEyebrow: React.CSSProperties = {
  fontSize: 10.5, fontWeight: 700, letterSpacing: '.12em', color: '#0066cc', textTransform: 'uppercase',
};

const MobileNews: React.FC<{ app: HpApp }> = ({ app }) => {
  const t = tr(app.lang);
  const [openId, setOpenId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const items = q
    ? app.news.filter(n => {
        const loc = localizedNews(n, app.lang);
        return `${loc.title} ${loc.summary}`.toLowerCase().includes(q);
      })
    : app.news;
  const open = app.news.find(n => n.id === openId) ?? null;

  // ?article=<id> deep link from shared URLs.
  React.useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('article');
    if (id && app.news.some(n => n.id === id)) setOpenId(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.news.length]);

  React.useEffect(() => { if (openId) window.scrollTo(0, 0); }, [openId]);

  const shareArticle = (item: NewsItem) => {
    const url = articleDeepLink(item.id);
    const title = localizedNews(item, app.lang).title;
    if (navigator.share) navigator.share({ title, url }).catch(() => {});
    else navigator.clipboard?.writeText(url).then(() => app.notify(t.news.linkCopied)).catch(() => {});
  };

  /** PDF on mobile: the generated article PDF via the OS share sheet
   *  (the only route to save/print a PDF on iOS); falls back to a download. */
  const pdfArticle = (item: NewsItem) => {
    try {
      const made = makeArticlePdf(item, t, app.lang);
      printPdfViaShareSheet(made.doc, made.filename).catch(() => app.notify(t.ds.pdfFailed));
    } catch { app.notify(t.ds.pdfFailed); }
  };

  const emailArticle = (item: NewsItem) => {
    const loc = localizedNews(item, app.lang);
    window.location.href = emailArticleHref(loc.title, loc.summary, articleDeepLink(item.id));
  };

  if (open) {
    const loc = localizedNews(open, app.lang);
    const actionBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: '#1d1d1f', cursor: 'pointer', padding: '4px 0' };
    return (
      <div style={{ padding: '18px 16px 28px', background: '#fff', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span onClick={() => setOpenId(null)} style={{ fontSize: 13, color: '#0066cc', cursor: 'pointer' }}>‹ {t.nav.news}</span>
        </div>

        {/* eyebrow · serif headline · dek */}
        <span style={{ ...mNewsEyebrow, marginTop: 16 }}>{newsEyebrow(t, open)}</span>
        <h1 style={{ fontFamily: NEWS_SERIF, fontSize: 27, fontWeight: 700, lineHeight: 1.18, letterSpacing: '-0.01em', color: '#1d1d1f', margin: '9px 0 0' }}>{loc.title}</h1>
        <p style={{ fontSize: 15.5, color: '#6e6e73', lineHeight: 1.5, margin: '11px 0 0' }}>{loc.summary}</p>

        {/* byline */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 14, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12.5, color: '#555' }}>{t.news.by}</span>
          <img src={MARKET_ICON_32} alt="" width={18} height={18} style={{ borderRadius: '50%', display: 'block' }} />
          <span style={{ fontSize: 12.5, fontWeight: 600, color: '#1d1d1f' }}>{t.news.editorialTeam(t.news.marketCountry)}</span>
        </div>
        <span style={{ fontSize: 12, color: '#7a7a7a', marginTop: 4 }}>{t.news.updated} {shortDate(open.date, t.locale)}</span>

        {/* action bar — PDF (share sheet) · Email · Share */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 20, marginTop: 12, padding: '8px 0', borderTop: '1px solid #e0e0e0', borderBottom: '1px solid #e0e0e0' }}>
          <span style={actionBtn} onClick={() => pdfArticle(open)}><MNewsIcon d={M_NEWS_ICONS.pdf} />{t.news.actionPdf}</span>
          <span style={actionBtn} onClick={() => emailArticle(open)}><MNewsIcon d={M_NEWS_ICONS.email} />{t.news.actionEmail}</span>
          <span style={actionBtn} onClick={() => shareArticle(open)}><MNewsIcon d={M_NEWS_ICONS.share} />{t.news.share}</span>
        </div>

        {/* hero */}
        <NewsGallery images={galleryOf(open)} marginTop={16} />

        {/* serif body */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 15, marginTop: 18 }}>
          {loc.body.split(/\n\s*\n/).map((p, i) => (
            <p key={i} style={{ fontFamily: NEWS_SERIF, fontSize: 16.5, lineHeight: 1.7, color: '#1d1d1f', margin: 0 }}>{p}</p>
          ))}
        </div>

        {(open.sources?.length ?? 0) > 0 && (
          <div style={{ borderTop: '1px solid #e0e0e0', marginTop: 18, paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={sectionLabel}>{t.news.sources}</span>
            {open.sources!.map(s => (
              <span key={s.url} onClick={() => window.open(s.url, '_blank', 'noopener')} style={{ fontSize: 12.5, color: '#0066cc', cursor: 'pointer', overflowWrap: 'anywhere' }}>{s.title}</span>
            ))}
          </div>
        )}
        <span style={{ fontSize: 10.5, color: '#b6b6bc', lineHeight: 1.5, marginTop: 14 }}>{t.news.editorialNote}</span>
      </div>
    );
  }

  return (
    <div data-tour="news" style={{ padding: '20px 16px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <SubTabs
        group="newsTrends"
        tabs={[{ id: 'news', label: t.nav.news }, { id: 'trends', label: t.nav.trends }]}
        active="news"
        onSelect={id => app.go(id as HpPage)}
      />
      <span style={{ fontFamily: FD, fontSize: 25, fontWeight: 600, letterSpacing: '-0.3px' }}>{t.news.title}</span>
      <span style={{ fontSize: 11.5, color: '#7a7a7a' }}>{t.news.pill}</span>
      <input
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder={t.news.searchPlaceholder}
        style={{ border: '1px solid #d2d2d7', borderRadius: 999, padding: '9px 16px', fontSize: 13.5, fontFamily: 'inherit', background: '#fff', outline: 'none' }}
      />
      {items.length === 0 && (
        <div style={{ border: '1px solid #e0e0e0', borderRadius: 10, padding: '15px 17px', background: '#fff', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={mNewsEyebrow}>{(t.news.categories[t.news.fallbackFeatured.badge] ?? t.news.fallbackFeatured.badge)} • {t.news.marketCountry.toLocaleUpperCase()}</span>
          <span style={{ fontFamily: NEWS_SERIF, fontSize: 18, fontWeight: 700, lineHeight: 1.25, color: '#1d1d1f' }}>{t.news.fallbackFeatured.title}</span>
          <span style={{ fontSize: 12.5, color: '#6e6e73', lineHeight: 1.5 }}>{t.news.fallbackFeatured.dek}</span>
          <span style={{ fontSize: 11.5, color: '#b6b6bc' }}>{t.news.notPublished}</span>
        </div>
      )}
      {items.map(n => {
        const loc = localizedNews(n, app.lang);
        return (
          <div key={n.id} onClick={() => setOpenId(n.id)} style={{ border: '1px solid #e0e0e0', borderRadius: 10, background: '#fff', overflow: 'hidden', cursor: 'pointer' }}>
            {n.imageUrl && <img src={n.imageUrl} alt="" style={{ width: '100%', display: 'block', maxHeight: 150, objectFit: 'cover' }} />}
            <div style={{ padding: '13px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={mNewsEyebrow}>{newsEyebrow(t, n)}</span>
              <span style={{ fontFamily: NEWS_SERIF, fontSize: 17.5, fontWeight: 700, lineHeight: 1.28, color: '#1d1d1f' }}>{loc.title}</span>
              <span style={{ fontSize: 12.5, color: '#6e6e73', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{loc.summary}</span>
              <span style={{ fontSize: 11.5, color: '#7a7a7a' }}>{shortDate(n.date, t.locale)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
};

/* ── Account (compact) ───────────────────────────────────────────────────── */

const MobileAccount: React.FC<{ app: HpApp }> = ({ app }) => {
  const t = tr(app.lang);
  const s = t.sub;
  const [supportOpen, setSupportOpen] = useState(false);
  // Team seat management on the phone (owner 2026-08-04): the SAME component
  // the desktop Account page uses, in compact layout — one workflow, one set
  // of rules, nothing duplicated.
  const [teamOpen, setTeamOpen] = useState(false);
  const [org, setOrg] = useState<Organization | null>(null);
  useEffect(() => {
    if (app.user.id === 'preview') { setOrg(previewOrg(app.user)); return; }
    if (app.user.orgId) getMyOrg(app.user).then(setOrg).catch(() => {});
    else setOrg(null);
  }, [app.user.id, app.user.orgId]);
  const card: React.CSSProperties = { background: '#fff', border: '1px solid #e0e0e0', borderRadius: 14, padding: '15px 17px', display: 'flex', flexDirection: 'column', gap: 8 };
  const sub = effectiveSubscription(app.user);   // paid (Paddle) wins; else active marketing grant
  const unlocked = !!sub && subscriptionUnlocked(sub.status, sub.currentPeriodEndsAt);
  const isPro = unlocked || app.user.plan === 'premium';
  const isTeamMember = app.user.orgRole === 'member';
  const [term, setTerm] = useState<BillingTerm>('monthly');
  const startCheckout = (plan: SubPlanCode) => {
    if (!checkoutConfigured(plan, term)) { app.notify(s.notConfigured); return; }
    openCheckout(app.user, plan, term).catch(() => app.notify(s.notConfigured));
  };
  const openBillingPortal = () => {
    if (app.user.id === 'preview') { app.notify(t.account.previewOnly); return; }
    if (!TRIAL_FLOW_ENABLED || !app.user.paddleCustomerId) { app.notify(t.account.managePlanSoon); return; }
    billingPortalFn()
      .then(r => {
        if (r.ok && r.url) window.open(r.url, '_blank', 'noopener');
        else app.notify(t.account.managePlanSoon);
      })
      .catch(() => app.notify(t.account.managePlanSoon));
  };
  const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString(t.locale, { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
  const planLabel = sub ? `${s.planNames[sub.planCode]}${sub.billingTerm ? ` · ${s.termNames[sub.billingTerm]}` : ''}` : t.account.planBadge;
  const statusLine = !sub ? '' :
    sub.provider === 'free_grant' ? s.freeGrantBadge(fmtDate(sub.currentPeriodEndsAt))
    : sub.status === 'trialing' ? s.statusTrialing(fmtDate(sub.trialEndsAt ?? sub.currentPeriodEndsAt))
    : sub.status === 'past_due' ? s.statusPastDue
    : sub.cancelAtPeriodEnd || sub.status === 'canceled' ? s.statusCanceled(fmtDate(sub.currentPeriodEndsAt))
    : s.statusActive(fmtDate(sub.currentPeriodEndsAt));

  // Team subview — seat management (invite / cancel invite / remove member),
  // reusing the desktop component in compact mode.
  if (teamOpen && org && app.user.orgRole === 'team_admin') {
    return (
      <div style={{ padding: '18px 16px 24px' }}>
        <TeamManagementView
          app={app}
          org={org}
          compact
          onBack={() => setTeamOpen(false)}
          onChanged={setOrg}
          onManageBilling={openBillingPortal}
        />
      </div>
    );
  }

  // Support subview — the SAME in-app inquiry workflow the desktop/tablet Account
  // page uses (shared SupportCard, one data model, one country-tagging path). No
  // mailto, no second support system. Back returns to the phone Account.
  if (supportOpen) {
    return (
      <div style={{ padding: '18px 16px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <span
          className="hp-press"
          onClick={() => setSupportOpen(false)}
          data-testid="support-back"
          style={{ fontSize: 13.5, color: '#0066cc', cursor: 'pointer', width: 'fit-content' }}
        >
          {t.team.back}
        </span>
        <div style={card}><SupportCard app={app} embedded /></div>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px 16px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <span style={{ fontFamily: FD, fontSize: 25, fontWeight: 600, letterSpacing: '-0.3px' }}>{t.account.heroTitle}</span>

      <div style={card}>
        <span style={{ fontSize: 15, fontWeight: 600 }}>{app.user.firstName} {app.user.lastName}</span>
        <span style={{ fontSize: 12.5, color: '#7a7a7a' }}>{app.user.email}</span>
        <span style={{ fontSize: 11.5, borderRadius: 999, padding: '4px 12px', width: 'fit-content', fontWeight: 600, ...(isPro ? { color: '#0a7a43', background: '#e7f6ee' } : { color: '#555', background: '#f0f0f2' }) }}>
          {isTeamMember && sub ? `${s.memberViewBadge} · ${s.planNames[sub.planCode]}` : isPro ? planLabel : t.account.planBadgeFree}
        </span>
        {statusLine && <span style={{ fontSize: 11.5, color: '#7a7a7a' }}>{statusLine}</span>}
        <span style={{ fontSize: 11.5, color: '#7a7a7a', lineHeight: 1.5 }}>{t.account.planStoreNote}</span>
        {/* Team admin: seat management is available here too (owner call
            2026-08-04) — same component and rules as the desktop page. */}
        {app.user.orgRole === 'team_admin' && org && (
          <span
            className="hp-press"
            onClick={() => setTeamOpen(true)}
            data-testid="m-team-manage"
            style={{ marginTop: 2, textAlign: 'center', border: '1px solid #d2d2d7', borderRadius: 999, padding: '10px 0', fontSize: 13, background: '#fff', cursor: 'pointer', fontWeight: 600 }}
          >
            {t.team.manage} · {t.team.seats(org.members.length, org.seatLimit)}
          </span>
        )}
        {!isTeamMember && (
          <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
            <span className="hp-press" onClick={openBillingPortal} style={{ flex: 1, textAlign: 'center', border: '1px solid #d2d2d7', borderRadius: 999, padding: '10px 0', fontSize: 13, background: '#fff', cursor: 'pointer' }}>
              {t.account.managePlan}
            </span>
          </div>
        )}
      </div>

      {/* Plan picker (no subscription yet) — team seats are managed on desktop */}
      {!isPro && !isTeamMember && (
        <div style={card}>
          <span style={sectionLabel}>{s.pickTitle}</span>
          <span style={{ fontSize: 12, color: '#7a7a7a', lineHeight: 1.5 }}>{s.pickSub}</span>
          {/* Billing-term selector — three EQUAL segments (grid minmax(0,1fr) so a
              nowrap label can't widen a column past its 1/3 share; min-width:0 lets
              it shrink). Compact two-line layout: term label above, real discount
              badge below. The percentage is sharedTermDiscountPct — the LOWEST
              saving across all active plans for the term (same source as desktop,
              never overstates), rendered with the localized s.termSavePct. */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', border: '1px solid #d2d2d7', borderRadius: 14, overflow: 'hidden', fontSize: 12.5 }}>
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
                  style={{ padding: '7px 6px', cursor: 'pointer', minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, textAlign: 'center', ...(selected ? { background: '#1d1d1f', color: '#fff', fontWeight: 600 } : {}) }}
                >
                  <span style={{ whiteSpace: 'nowrap' }}>{s.termNames[tm]}</span>
                  {pct > 0 && (
                    <span style={{ fontSize: 9, fontWeight: 700, borderRadius: 999, padding: '1px 6px', lineHeight: 1.35, background: selected ? 'rgba(255,255,255,.18)' : '#e7f6ee', color: selected ? '#fff' : '#0a7a43' }}>
                      {s.termSavePct(pct)}
                    </span>
                  )}
                </span>
              );
            })}
          </div>
          {/* Plan cards — ONE fixed anatomy for every plan (owner report
              2026-07-31: Professional and Team rows wrapped differently and
              looked unprofessional). Row 1 name+badge, row 2 price line,
              row 3 full-width CTA: nothing wraps, nothing shifts between
              plans, the popular pick is marked instead of implied. */}
          {SUB_PLAN_CODES.map(code => {
            const popular = code === 'team_3' && term === 'monthly';   // owner call 2026-08-04: monthly first — annual sticker price scared first-time visitors
            return (
              <div key={code} style={{ position: 'relative', border: popular ? '2px solid #0066cc' : '1px solid #e0e0e0', borderRadius: 12, padding: '13px 14px 12px', display: 'flex', flexDirection: 'column', gap: 9 }}>
                {popular && (
                  <span style={{ position: 'absolute', top: -9, left: 14, fontSize: 9.5, fontWeight: 700, letterSpacing: '.04em', borderRadius: 999, padding: '2px 9px', background: '#0066cc', color: '#fff' }}>{s.mostPopular}</span>
                )}
                {/* No trial badge — checkout charges immediately; the free first
                    week is granted at signup, not by a plan (2026-07-31). */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                  <span style={{ fontSize: 14.5, fontWeight: 600 }}>{s.planNames[code]}</span>
                  <span style={{ fontSize: 11.5, color: '#7a7a7a' }}>{s.planUsers[code]}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: FD, fontSize: 20, fontWeight: 700, letterSpacing: '-0.3px' }}>{formatEur(SUB_PLANS[code].prices[term])}</span>
                  <span style={{ fontSize: 11.5, color: '#7a7a7a' }}>{s.perTerm[term]}{isTeamPlan(code) ? ` ${s.forWholeTeam}` : ''}</span>
                  <span style={{ fontSize: 10, fontWeight: 600, color: '#9a9aa0' }}>{s.exclVat}</span>
                </div>
                <span className="hp-press" onClick={() => startCheckout(code)}
                  style={{ display: 'block', textAlign: 'center', background: popular ? '#0066cc' : '#1d1d1f', color: '#fff', borderRadius: 999, padding: '11px 0', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  {s.startTrial.replace(' ›', '')}
                </span>
              </div>
            );
          })}
          <span style={{ fontSize: 10.5, color: '#9a9aa0', lineHeight: 1.5 }}>{s.trialNote} {s.vatNote} {s.eurBillingNote}</span>
        </div>
      )}

      {showInstallUi() && (
        <div style={card}>
          <span style={sectionLabel}>{t.m.installTitle}</span>
          <span style={{ fontSize: 12.5, color: '#555', lineHeight: 1.5 }}>{t.m.installText}</span>
          <span
            className="hp-press"
            onClick={async () => {
              if (canPromptInstall()) { const ok = await promptInstall(); if (ok) app.notify(t.m.installDone); }
              else window.dispatchEvent(new CustomEvent('hpdb-ios-guide'));
            }}
            style={{ background: '#0066cc', color: '#fff', borderRadius: 999, padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer', width: 'fit-content' }}
          >
            {t.m.installBtn}
          </span>
        </div>
      )}

      {/* Sign-in methods — same shared component as the desktop Account page */}
      <div style={card}>
        <span style={sectionLabel}>{(t.account as any).signinTitle}</span>
        <SignInMethodsCard app={app} plain />
      </div>

      {UI_LANGUAGES.length > 1 && (
        <div style={card}>
          <span style={sectionLabel}>{t.account.language}</span>
          <div style={{ display: 'flex', border: '1px solid #d2d2d7', borderRadius: 999, overflow: 'hidden', fontSize: 13, width: 'fit-content' }}>
            {(([['pl', 'Polski'], ['it', 'Italiano'], ['fr', 'Français'], ['de', 'Deutsch'], ['en', 'English']] as [Language, string][])
              .filter(([id]) => UI_LANGUAGES.includes(id))).map(([id, label]) => (
              <span key={id} onClick={() => app.setLang(id)} style={{ padding: '8px 16px', cursor: 'pointer', ...(app.lang === id ? { background: '#1d1d1f', color: '#fff', fontWeight: 600 } : {}) }}>
                {label}
              </span>
            ))}
          </div>
          <span style={{ fontSize: 11.5, color: '#7a7a7a' }}>{t.account.languageNote}</span>
        </div>
      )}

      {/* Feature-tour replay — its own always-rendered card (the language card
          above is hidden on single-language editions like GB, so the replay
          entry must not live inside it). */}
      <div style={card}>
        <span style={sectionLabel}>{t.tour.accountReplay}</span>
        <span style={{ fontSize: 12.5, color: '#555', lineHeight: 1.5 }}>{t.tour.accountReplayText}</span>
        <span
          className="hp-press"
          onClick={() => window.dispatchEvent(new CustomEvent('hpdb-tour-open'))}
          style={{ fontSize: 13, color: '#0066cc', cursor: 'pointer', width: 'fit-content' }}
        >
          {t.tour.inviteStart} ›
        </span>
      </div>

      <div style={card}>
        <span style={sectionLabel}>{t.account.support}</span>
        <span style={{ fontSize: 12.5, color: '#555', lineHeight: 1.5 }}>{t.account.supportText}</span>
        {/* Opens the in-app inquiry workflow (shared SupportCard) — NOT a mailto.
            The raw support address is not shown here (parity with desktop, 8fe2a80). */}
        <span
          className="hp-press"
          onClick={() => setSupportOpen(true)}
          style={{ fontSize: 13, color: '#0066cc', cursor: 'pointer', width: 'fit-content' }}
          data-testid="mobile-contact-support"
        >
          {t.account.contactSupport}
        </span>
      </div>

      {/* Advertising & partnerships — compact, direct email only (no form / CTA /
          admin workflow); mirrors the desktop card. Shared i18n keys (8fe2a80). */}
      <div style={card}>
        <span style={sectionLabel}>{t.account.adPartner}</span>
        <span style={{ fontSize: 12.5, color: '#555', lineHeight: 1.5 }}>{t.account.adPartnerText}</span>
        <a href={`mailto:${MARKETING_EMAIL}`} style={{ fontSize: 12.5, color: '#0066cc', textDecoration: 'none' }} data-testid="marketing-email">{MARKETING_EMAIL}</a>
      </div>

      <div style={card}>
        <span style={sectionLabel}>{t.account.legal}</span>
        {(Object.keys(LEGAL_ROUTES) as LegalDoc[]).map(d => (
          <a key={d} href={LEGAL_ROUTES[d]} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: '#0066cc', textDecoration: 'none' }} data-testid={`policy-${d}`}>
            {LEGAL_NAV[app.lang][d]} ›
          </a>
        ))}
      </div>

      <span
        className="hp-press"
        onClick={app.onLogout}
        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, border: '1px solid #d2d2d7', borderRadius: 999, padding: '12px 0', fontSize: 14, cursor: 'pointer', background: '#fff' }}
      >
        <SignOutIcon />
        {t.nav.signOut}
      </span>

      {/* ── Database rights / legal notice ── */}
      <div style={{ borderTop: '1px solid #e0e0e0', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 7 }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', color: '#7a7a7a', textTransform: 'uppercase' }}>{t.account.legalNoticeTitle}</span>
        <p style={{ fontSize: 10.5, color: '#9a9aa0', lineHeight: 1.6, margin: 0 }}>{t.account.legalNotice}</p>
        <span style={{ fontSize: 10.5, color: '#9a9aa0' }}>{t.footer.copyright(new Date().getFullYear())}</span>
      </div>
    </div>
  );
};

/* ── Shell ───────────────────────────────────────────────────────────────── */

export const MobileApp: React.FC<{ app: HpApp; viewport: Viewport }> = ({ app, viewport }) => {
  const t = tr(app.lang);
  const [detailOpen, setDetailOpen] = useState(false);

  // Footer tab set (owner decision 2026-07-31): News replaces Data sheet — the
  // sheet is a document you reach FROM a product (detail button / label row),
  // not a destination you browse to, so it left the tab bar (and deliberately
  // does NOT appear in the header menu either). Pages the footer cannot show
  // (Funding, EU energy label) live in the header dropdown menu instead.
  /* Grouped IA, mirroring the desktop nav (2026-09-02): ONE funding tab
     (policy + guide behind SubTabs, landing on the remembered one) and ONE
     news tab (news + trends the same way). The freed slots put the EU label
     into the header menu next to the new Installation page. */
  const MOBILE_TABS: MTab[] = ['find', 'products', 'bafa', 'news', 'account'];
  const MENU_PAGES: MTab[] = ['label', 'install'];
  const VALID_PAGES = ['find', 'products', 'datasheet', 'guide', 'bafa', 'news', 'trends', 'install', 'account', 'label'];
  const page: MTab = VALID_PAGES.includes(app.page) ? (app.page as MTab) : 'find';
  const tabLabel: Record<MTab, string> = {
    find: t.m.tabSearch, products: t.products.title, datasheet: t.m.mdsTitle,
    bafa: t.m.tabFunding, news: t.nav.news, guide: t.nav.guide, account: t.nav.account,
    label: t.nav.label, trends: t.nav.trends, install: t.nav.install,
  };
  /** A grouped tab lands on the sub-page the person used last (same memory the
   *  desktop nav reads — localStorage survives shell switches). */
  const groupGo = (id: MTab) => {
    const groups: Record<string, HpPage[]> = { bafa: ['bafa', 'guide'], news: ['news', 'trends'] };
    const pages = groups[id];
    if (!pages) return app.go(id as HpPage);
    const remembered = recallSubTab(id === 'bafa' ? 'funding' : 'newsTrends');
    app.go((pages as string[]).includes(remembered ?? '') ? (remembered as HpPage) : pages[0]);
  };
  const [menuOpen, setMenuOpen] = useState(false);

  const openProduct = (id: string) => {
    app.setSelectedId(id);
    if (viewport === 'phone') setDetailOpen(true);
    else app.go('products');
  };
  const sel = app.selectedId && app.store ? app.store.byId.get(app.selectedId) ?? null : null;

  const isTablet = viewport === 'tablet';
  const [iosGuide, setIosGuide] = useState(false);
  React.useEffect(() => {
    const open = () => setIosGuide(true);
    window.addEventListener('hpdb-ios-guide', open);
    return () => window.removeEventListener('hpdb-ios-guide', open);
  }, []);

  return (
    <div className="hpiq-root" style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: '#f5f5f7', width: '100%', maxWidth: '100vw', overflowX: 'hidden' }}>
      {/* header */}
      <div style={{ background: '#000', color: '#fff', display: 'flex', alignItems: 'center', gap: 12, padding: 'env(safe-area-inset-top) 16px 0', height: 'calc(52px + env(safe-area-inset-top))', flex: 'none' }}>
        <BrandLogo height={24} theme="dark" />
        <WavingFlag height={20} />
        {isTablet && (
          <div style={{ display: 'flex', gap: 3, fontSize: 13, marginLeft: 10, overflowX: 'auto' }}>
            {(['find', 'products', 'label', 'bafa', 'news', 'install'] as MTab[]).map(id => (
              <span key={id} onClick={() => { groupGo(id); }} style={{ padding: '6px 12px', borderRadius: 999, cursor: 'pointer', whiteSpace: 'nowrap', ...((page === id || (id === 'bafa' && page === 'guide') || (id === 'news' && page === 'trends')) ? { color: '#fff', fontWeight: 600, background: 'rgba(255,255,255,.12)' } : { color: 'rgba(255,255,255,.65)' }) }}>
                {tabLabel[id]}
              </span>
            ))}
          </div>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          {UI_LANGUAGES.length > 1 && (
            <div style={{ display: 'flex', border: '1px solid rgba(255,255,255,.3)', borderRadius: 999, overflow: 'hidden', fontSize: 11.5 }}>
              {UI_LANGUAGES.map(l => (
                <span key={l} onClick={() => app.setLang(l)} style={{ padding: '5px 10px', cursor: 'pointer', ...(app.lang === l ? { background: '#fff', color: '#1d1d1f', fontWeight: 600 } : { color: 'rgba(255,255,255,.75)' }) }}>
                  {l.toUpperCase()}
                </span>
              ))}
            </div>
          )}
          {isTablet && (
            <span onClick={() => app.go('account')} style={{ width: 26, height: 26, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10.5, cursor: 'pointer', background: page === 'account' ? '#fff' : '#2a2a2c', color: page === 'account' ? '#1d1d1f' : '#fff', border: '1px solid rgba(255,255,255,.25)' }}>
              {(((app.user.firstName?.[0] ?? '') + (app.user.lastName?.[0] ?? '')) || app.user.email?.[0] || 'U').toUpperCase()}
            </span>
          )}
          {/* Phone: header menu — the pages the footer cannot show (owner
              request 2026-07-31). Data sheet is deliberately absent: it is
              reached from a product, never browsed to. */}
          {viewport === 'phone' && (
            <span
              onClick={() => window.dispatchEvent(new CustomEvent('hpdb-tour-open'))}
              aria-label="Tutor"
              data-testid="mobile-tutor-btn"
              style={{ width: 30, height: 30, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', borderRadius: 8 }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 9l10-4.5L22 9l-10 4.5zM6.5 11v4.4c0 1.2 2.5 2.6 5.5 2.6s5.5-1.4 5.5-2.6V11M22 9v5" /></svg>
            </span>
          )}
          {viewport === 'phone' && (
            <span
              onClick={() => setMenuOpen(o => !o)}
              aria-label="Menu"
              data-testid="mobile-menu-btn"
              style={{ width: 30, height: 30, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', borderRadius: 8, background: menuOpen || MENU_PAGES.includes(page) ? 'rgba(255,255,255,.16)' : 'transparent' }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
            </span>
          )}
        </div>
      </div>

      {/* Phone: dropdown menu panel (tap-out to close) */}
      {viewport === 'phone' && menuOpen && (
        <>
          <div onClick={() => setMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 90 }} />
          <div data-testid="mobile-menu" style={{ position: 'fixed', top: 'calc(56px + env(safe-area-inset-top))', right: 10, zIndex: 91, background: '#fff', borderRadius: 14, border: '1px solid rgba(0,0,0,.08)', boxShadow: '0 12px 32px rgba(0,0,0,.18)', overflow: 'hidden', minWidth: 210 }}>
            {MENU_PAGES.map((id, i) => (
              <span
                key={id}
                onClick={() => { setMenuOpen(false); setDetailOpen(false); app.go(id as HpPage); }}
                style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '13px 17px', fontSize: 14.5, cursor: 'pointer', borderBottom: i < MENU_PAGES.length - 1 ? '1px solid #f0f0f0' : undefined, fontWeight: page === id ? 600 : 400, background: page === id ? '#f5f5f7' : '#fff', color: '#1d1d1f' }}
              >
                <Ic d={ICONS[id]} active={page === id} />
                {tabLabel[id]}
              </span>
            ))}
          </div>
        </>
      )}

      {/* PWA install (mobile browsers show no automatic prompt) */}
      <InstallBanner app={app} onIosGuide={() => setIosGuide(true)} />
      {iosGuide && <IosInstallGuide app={app} onClose={() => setIosGuide(false)} />}

      {/* content */}
      <div style={{ flex: 1, minHeight: 0, overflowY: (page === 'products' || page === 'datasheet') ? 'hidden' : 'auto', display: 'flex', flexDirection: 'column', maxWidth: isTablet ? 1100 : undefined, width: '100%', margin: '0 auto' }}>
        {page === 'find' && <MobileFind app={app} viewport={viewport} onOpen={openProduct} />}
        {page === 'products' && <MobileProducts app={app} viewport={viewport} onOpen={openProduct} />}
        {page === 'datasheet' && <MobileDataSheet app={app} />}
        {page === 'bafa' && <MobileFunding app={app} goGuide={tab => { app.setGuideTab(tab); app.go('guide'); }} />}
        {page === 'label' && <MobileLabel app={app} />}
        {page === 'guide' && <MobileGuide app={app} />}
        {page === 'news' && <MobileNews app={app} />}
        {page === 'trends' && <TrendsPage app={app} />}
        {page === 'install' && <InstallPage app={app} />}
        {page === 'account' && <MobileAccount app={app} />}
      </div>

      {/* phone: full-screen detail sheet */}
      {viewport === 'phone' && detailOpen && sel && (
        <MobileDetail app={app} v={sel} viewport="phone" onClose={() => setDetailOpen(false)} />
      )}

      {/* phone: bottom tab bar */}
      {viewport === 'phone' && (
        <div style={{ flex: 'none', display: 'flex', background: 'rgba(255,255,255,.92)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', borderTop: '1px solid rgba(0,0,0,.1)', paddingBottom: 'env(safe-area-inset-bottom)', zIndex: 85, position: 'relative' }}>
          {MOBILE_TABS.map(id => {
            const active = page === id || (id === 'bafa' && page === 'guide') || (id === 'news' && page === 'trends');
            return (
              <span key={id} onClick={() => { setDetailOpen(false); groupGo(id); }} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '8px 0 7px', cursor: 'pointer' }}>
                <Ic d={ICONS[id]} active={active} />
                <span style={{ fontSize: 10, fontWeight: active ? 600 : 400, color: active ? '#1d1d1f' : '#9a9aa0' }}>{tabLabel[id]}</span>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
};
