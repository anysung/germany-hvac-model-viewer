/**
 * HeatPump DB — app shell (global nav, page routing, footer).
 * Implements the approved design in design_handoff_heatpumpiq/ pixel-faithfully.
 */
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './hpiq.css';
import { HeatPumpDatabase, Language, User } from '../types';
import { ProductStore } from './productService';
import { shortDate } from './model';
import { HpApp, HpPage, HpSegment, DsMode, DsSectionKey } from './appState';
import { tr } from './i18n';
import { UI_LANGUAGES, SOURCE_ID_ABBR, IS_GB, IS_PL, IS_IT } from './market';
import { recallSubTab, rememberSubTab } from './ui';
import { LOCAL_LISTING_FILTER, LOCAL_LISTING_FILTER_DEFAULT_ON } from './listing';
import { splitBySegment } from '../config/segmentation';
import { ACTIVE_COUNTRY } from '../config/countryProfiles';
import { accessInfo } from '../config/entitlement';
import { buildDataSheetPdf, pdfFileName } from './pdf/dataSheetPdf';
import { preloadBrandArtwork } from './pdf/brandArtwork';
import { preloadPdfFonts } from './pdf/pdfFonts';
import { downloadPdf, printPdfViaShareSheet } from './pdf/deliverPdf';
import { isIos } from './pwaInstall';
import { FD, SignOutIcon, AccountIcon } from './ui';
import { BrandLogo, WavingFlag } from '../components/BrandLogo';
import { useViewport } from './useViewport';
import { MobileApp } from './mobile/MobileApp';
import { OnboardingTour } from './OnboardingTour';
import { analyticsIdentify, track, normaliseQuery } from '../services/analyticsService';
import { FindPage } from './pages/FindPage';
import { ProductsPage } from './pages/ProductsPage';
import { LabelPage } from './pages/LabelPage';
import { DataSheetPage, DataSheetDoc } from './pages/DataSheetPage';
import { BafaPage } from './pages/BafaPage';
import { GuidePage } from './pages/GuidePage';
import { NewsPage } from './pages/NewsPage';
import { TrendsPage } from './pages/TrendsPage';
import { InstallPage } from './pages/InstallPage';
import { AccountPage } from './pages/AccountPage';

interface Props {
  user: User;
  onLogout: () => void;
  onAdminAccess?: () => void;
  dbData: HeatPumpDatabase | null;
  /** Dataset download failed (Storage/network/access layer) — show the error
   *  banner instead of letting the catalogue look silently empty. */
  datasetsFailed?: boolean;
  onRetryDatasets?: () => void;
  language: Language;
  setLanguage: (l: Language) => void;
  /** Concurrent-session grace deadline (epoch ms) — drives the countdown banner. */
  sessionGraceUntil?: number | null;
  /** First-run onboarding sheet is on screen — the tour invite waits for it. */
  tourHold?: boolean;
}

type NavPage = Exclude<HpPage, 'account'>;
/**
 * Grouped nav (owner, 2026-09-02): eight destinations became six entries.
 * The two subsidy pages share one market-native subsidy word, News and
 * Market & Trends share one editorial entry; the pages themselves carry a
 * SubTabs switcher and remember which tab the reader used last, so the menu
 * click lands where that person actually works.
 */
const NAV_GROUPS: { id: string; pages: NavPage[] }[] = [
  { id: 'find', pages: ['find'] },
  { id: 'products', pages: ['products'] },
  { id: 'label', pages: ['label'] },
  { id: 'datasheet', pages: ['datasheet'] },
  { id: 'funding', pages: ['bafa', 'guide'] },
  { id: 'newsTrends', pages: ['news', 'trends'] },
  { id: 'install', pages: ['install'] },
];
const groupOf = (page: HpPage) => NAV_GROUPS.find(g => (g.pages as HpPage[]).includes(page));
/** Where a group's nav entry lands: the remembered sub-tab, else the first page. */
const groupTarget = (g: { id: string; pages: NavPage[] }): NavPage => {
  const remembered = recallSubTab(g.id);
  return (g.pages as string[]).includes(remembered ?? '') ? (remembered as NavPage) : g.pages[0];
};


export const HpiqApp: React.FC<Props> = ({ user: userProp, onLogout, onAdminAccess, dbData, datasetsFailed, onRetryDatasets, language, setLanguage, sessionGraceUntil, tourHold }) => {
  // Profile edits are written to Firestore; this overlay reflects them at once
  // (the auth listener would only refresh the profile on the next sign-in).
  const [userPatch, setUserPatch] = useState<Partial<User>>({});
  const user = { ...userProp, ...userPatch };
  const patchUser = (patch: Partial<User>) => setUserPatch(prev => ({ ...prev, ...patch }));
  const t = tr(language);
  const viewport = useViewport();
  // Shared-article deep links (?article=<id>) land on the news page directly.
  const [page, setPage] = useState<HpPage>(() =>
    new URLSearchParams(window.location.search).has('article') ? 'news' : 'find');
  const [query, setQuery] = useState('');
  const [compare, setCompare] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [labelSelId, setLabelSelId] = useState<string | null>(null);
  const [showCompare, setShowCompare] = useState(false);
  const [dsMode, setDsMode] = useState<DsMode>('product');
  const [dsId, setDsId] = useState<string | null>(null);
  const [dsSections, setDsSections] = useState<Record<DsSectionKey, boolean>>({
    identity: true, performance: true, env: true, bafa: true,
  });
  const [segment, setSegment] = useState<HpSegment>('residential');
  const [bafaOnly, setBafaOnly] = useState(LOCAL_LISTING_FILTER_DEFAULT_ON);
  /**
   * The local-listing filter is only ever applied where this market actually
   * offers it (config: localListingOverlay.filterEnabled). Neutralising it in
   * state — not just hiding the control — means a stale toggle can never silently
   * empty the catalogue, which is exactly how UK Commercial came to show nothing.
   */
  const effectiveBafaOnly = bafaOnly && LOCAL_LISTING_FILTER;
  const [refFilter, setRefFilter] = useState<string | null>(null);
  const [classFilter, setClassFilter] = useState<string | null>(null);
  const [mfrFilter, setMfrFilter] = useState<string[]>([]);
  const [guideTab, setGuideTab] = useState<'home' | 'pro'>('home');
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [faqOpen, setFaqOpen] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── Global nav fit ──────────────────────────────────────────────────────
     How many destinations actually fit this window, in this language. The row
     itself is flex:1 with a fixed share of the bar, so hiding items never
     changes the space available — the measurement cannot oscillate. */
  const navRowRef = useRef<HTMLDivElement>(null);
  const navSizerRef = useRef<HTMLDivElement>(null);
  const navMoreRef = useRef<HTMLSpanElement>(null);
  const navMenuRef = useRef<HTMLDivElement>(null);
  const [navVisible, setNavVisible] = useState(NAV_GROUPS.length);

  // Any arrival on a merged page — sub-tab click, tour, deep link — becomes the
  // group's remembered tab, so the next nav click returns there.
  useEffect(() => {
    const g = groupOf(page);
    if (g && g.pages.length > 1) rememberSubTab(g.id, page);
  }, [page]);
  const [navMenu, setNavMenu] = useState(false);
  const [navMenuLeft, setNavMenuLeft] = useState(0);

  /** Width the collapsed button actually occupies. It is measured, not assumed:
   *  it renders as "•••" most of the time but wears the active page's NAME when
   *  the current page is one of the collapsed ones, and a guessed constant
   *  under-reserved by a few pixels — enough to clip the last item. */
  const navMoreW = useRef(72);

  const computeNavFit = React.useCallback(() => {
    const GAP = 5;
    const row = navRowRef.current, sizer = navSizerRef.current;
    if (!row || !sizer) return;
    const widths = Array.from(sizer.children).map(el => el.getBoundingClientRect().width);
    const avail = row.clientWidth;
    let used = 0, n = 0;
    for (const w of widths) {
      const next = used + (n ? GAP : 0) + w;
      if (next > avail) break;
      used = next; n++;
    }
    // Everything fits: no button needed. Otherwise make room for it.
    if (n < widths.length) {
      while (n > 0 && used + GAP + navMoreW.current > avail) { used -= widths[n - 1] + GAP; n--; }
    }
    setNavVisible(n);
  }, []);

  useLayoutEffect(() => {
    computeNavFit();
    const ro = new ResizeObserver(computeNavFit);
    if (navRowRef.current) ro.observe(navRowRef.current);
    if (navSizerRef.current) ro.observe(navSizerRef.current);
    return () => ro.disconnect();
  }, [language, computeNavFit]);

  // Feed the button's real width back into the fit, once per change in it.
  useLayoutEffect(() => {
    const w = navMoreRef.current?.getBoundingClientRect().width;
    if (w && Math.abs(w - navMoreW.current) > 2) { navMoreW.current = w; computeNavFit(); }
  });

  // Close the overflow menu on any outside click (never on the button itself,
  // which toggles) and whenever the page changes.
  //
  // The PANEL must be spared as well as the row. It renders as a sibling of the
  // row, not a child, so a `contains(row)` test alone calls a click on a menu
  // item "outside": mousedown closed the menu, the item unmounted, and the
  // click that followed had nothing left to land on — the entries looked dead
  // (2026-08-16). Anything that closes on mousedown must exempt every element
  // the user can legitimately press.
  useEffect(() => {
    if (!navMenu) return;
    setNavMenuLeft(navMoreRef.current?.getBoundingClientRect().left ?? 0);
    const close = (e: MouseEvent) => {
      const target = e.target as Node;
      if (navRowRef.current?.contains(target) || navMenuRef.current?.contains(target)) return;
      setNavMenu(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [navMenu]);
  useEffect(() => { setNavMenu(false); }, [page]);

  const navOverflowActive = NAV_GROUPS.slice(navVisible).some(g => (g.pages as HpPage[]).includes(page));
  const navLinkStyle = (active: boolean): React.CSSProperties => ({
    padding: '8px 14px', borderRadius: 999, cursor: 'pointer', whiteSpace: 'nowrap',
    ...(active
      ? { color: '#fff', fontWeight: 600, background: 'rgba(255,255,255,.12)' }
      : { color: 'rgba(255,255,255,.65)' }),
  });

  const notify = (msg: string) => {
    setNotice(msg);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 2600);
  };

  /**
   * ONE segmentation rule for every market: rated capacity ≤ 23 kW is residential,
   * above it is commercial (config/segmentation.ts). The dataset FILES are split by
   * source, not by capacity — the UK's "residential" file runs to 177 kW — so the
   * whole pool is re-split here and the source's own labels are ignored entirely.
   * Records with no published capacity are unclassified: they are counted and
   * disclosed, never quietly filed as residential.
   */
  const segments = useMemo(() => {
    const pool = [...(dbData?.products ?? []), ...(dbData?.commercialProducts ?? [])];
    return splitBySegment(pool);
  }, [dbData?.products, dbData?.commercialProducts]);

  const resStore = useMemo(
    () => (segments.residential.length ? new ProductStore(segments.residential) : null),
    [segments],
  );
  const comStore = useMemo(
    () => (segments.commercial.length ? new ProductStore(segments.commercial) : null),
    [segments],
  );
  const unclassifiedCount = segments.unclassified.length;
  const store = segment === 'commercial' ? comStore : resStore;
  // Full catalog for the EU energy label page — every downloaded product, both segments.
  const allStore = useMemo(() => {
    const src = [...(dbData?.products ?? []), ...(dbData?.commercialProducts ?? [])];
    return src.length ? new ProductStore(src) : null;
  }, [dbData?.products, dbData?.commercialProducts]);

  /** Which segment dataset a product id belongs to (label page spans both). */
  const segmentOf = (id: string): HpSegment | null =>
    resStore?.byId.has(id) ? 'residential' : comStore?.byId.has(id) ? 'commercial' : null;

  // Segment switch swaps the dataset — ids/manufacturers from the other
  // segment do not resolve, so selection-dependent state is reset (the
  // default-selection effect below refills it from the new store).
  const switchSegment = (s: HpSegment) => {
    if (s === segment) return;
    setSegment(s);
    setSelectedId(null);
    setLabelSelId(null);
    setDsId(null);
    setCompare([]);
    setShowCompare(false);
    setMfrFilter([]);
  };

  // The PDF header draws the app's own logo + flag SVGs; rasterize them up front
  // so buildDataSheetPdf() can stay synchronous (iOS needs navigator.share to be
  // reached inside the click gesture — an await in between loses it).
  useEffect(() => { void preloadBrandArtwork(ACTIVE_COUNTRY.code); void preloadPdfFonts(); }, []);

  // First-party usage analytics (privacy-policy contract, 2026-08-01): hashed
  // identity once per session; six events wired below. Fire-and-forget only.
  useEffect(() => {
    const acc = accessInfo(user);
    const state = acc.state === 'trial' ? 'trial' : user.subscription ? 'paid' : 'free';
    void analyticsIdentify(user.id, state as any, user.subscription?.planCode, language);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id, language]);

  // search_performed / search_zero_results — debounced on the shared query
  // (Find page, both shells use app.query). Zero-result queries carry only the
  // normalised token form (see analyticsService.normaliseQuery).
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2 || !store) return;
    const t = setTimeout(() => {
      const res = store.search(q, 1);
      track('search_performed', { qTokens: normaliseQuery(q) ? normaliseQuery(q).split(' ').length : 0 });
      if (res.total === 0) track('search_zero_results', { queryNormalised: normaliseQuery(q) });
    }, 1400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // comparison_created — rising edge of the compare modal with >=2 models.
  useEffect(() => {
    if (showCompare && compare.length >= 2) track('comparison_created', { models: compare.length });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showCompare]);

  // Default selections once data arrives (inspector patterns are always-on).
  useEffect(() => {
    if (!store) return;
    setSelectedId(prev => prev ?? store.all[0]?.id ?? null);
    setLabelSelId(prev => prev ?? store.all[0]?.id ?? null);
    setDsId(prev => prev ?? store.all[0]?.id ?? null);
  }, [store]);

  const dataStatusDate = shortDate(dbData?.generatedAt ?? new Date().toISOString(), t.locale);
  // Derived from the data files themselves (bafa_snapshot_fetched_at /
  // source_snapshot_generated_at) — they move automatically with each
  // regular data update; read from allStore so they are segment-independent.
  const bafaSnapshotDate = shortDate((allStore ?? store)?.bafaSnapshotDate ?? undefined, t.locale);
  const eprelSyncDate = shortDate((allStore ?? store)?.sourceSnapshotDate ?? undefined, t.locale);
  const totalListed = (dbData?.products?.length ?? 0) + (dbData?.commercialProducts?.length ?? 0);

  const toggleCompare = (id: string) => {
    setCompare(prev => {
      const has = prev.includes(id);
      if (!has && prev.length >= 4) return prev;
      return has ? prev.filter(x => x !== id) : [...prev, id];
    });
  };

  /** The generated A4 PDF for the currently selected model (null if no data). */
  const makePdf = () => {
    const v = (dsId && store ? store.byId.get(dsId) : null) ?? store?.all[0] ?? null;
    if (!v) return null;
    return {
      doc: buildDataSheetPdf({
        v, t,
        sections: dsSections,
        isLabelMode: dsMode === 'label',
        sourceAbbr: SOURCE_ID_ABBR,
        isGb: IS_GB,
        useRawType: IS_GB || IS_PL || IS_IT,
      }),
      filename: pdfFileName(v),
    };
  };

  /**
   * PRINT.
   * Chrome (desktop + Android) and macOS Safari print the DOM correctly and give
   * a real print dialog — keep that, it is what users expect and it works.
   * ONLY iOS (iPhone/iPad) is broken there (WebKit lays print out against the
   * meta-viewport and ignores @page margins → clipped, edge-to-edge sheets, and
   * a web page cannot override the print dialog). For iOS we hand our own,
   * correctly-sized A4 PDF to the system share sheet, whose actions include
   * "Print" — the only reliable way to reach a printer with the right geometry.
   */
  const printSheet = () => {
    track('datasheet_exported', { via: 'print', mode: dsMode });
    if (!isIos()) { window.print(); return; }
    const made = makePdf();
    if (!made) return;
    printPdfViaShareSheet(made.doc, made.filename).catch(() => notify(t.ds.pdfFailed));
  };

  /** PDF DOWNLOAD: always just saves the generated file. Never a share sheet. */
  const downloadSheetPdf = () => {
    track('datasheet_exported', { via: 'pdf', mode: dsMode });
    const made = makePdf();
    if (!made) return;
    try { downloadPdf(made.doc, made.filename); }
    catch { notify(t.ds.pdfFailed); }
  };

  const app: HpApp = {
    store, allStore, user, patchUser,
    news: dbData?.newsFeed ?? [],
    policies: dbData?.policySummary ?? [],
    dataStatusDate, bafaSnapshotDate, eprelSyncDate, totalListed,
    page, go: setPage,
    query, setQuery,
    compare, toggleCompare,
    selectedId, setSelectedId,
    labelSelId, setLabelSelId,
    showCompare, setShowCompare,
    dsMode, setDsMode, dsId, setDsId,
    dsSections, toggleDsSection: (k) => setDsSections(s => ({ ...s, [k]: !s[k] })),
    segment, setSegment: switchSegment,
    bafaOnly: effectiveBafaOnly, setBafaOnly,
    listingFilterOffered: LOCAL_LISTING_FILTER,
    unclassifiedCount,
    refFilter, setRefFilter, classFilter, setClassFilter, mfrFilter, setMfrFilter,
    guideTab, setGuideTab,
    checked, toggleChecked: (k) => setChecked(c => ({ ...c, [k]: !c[k] })),
    faqOpen, setFaqOpen,
    lang: language, setLang: setLanguage,
    onLogout, printSheet, downloadSheetPdf, notify,
    // Label records span both segments — switch to the id's segment first
    // (switchSegment clears selection; the setters below win within the batch).
    openProduct: (id) => {
      const s = segmentOf(id);
      if (s && s !== segment) switchSegment(s);
      setSelectedId(id); setPage('products');
      track('product_view', {});
      if (LOCAL_LISTING_FILTER) track('listing_status_viewed', {});
    },
    openDataSheet: (id, mode) => {
      const s = segmentOf(id);
      if (s && s !== segment) switchSegment(s);
      setDsId(id); setDsMode(mode); setPage('datasheet');
    },
    openLabelRecord: (id) => { setLabelSelId(id); setPage('label'); },
    goProductsR290: () => { setRefFilter('R290'); setPage('products'); },
  };


  // The one printable document, mounted at <body> level (outside #root) so that
  // `@media print { #root { display:none } }` can't clip or blank it. It is
  // display:none on screen and shown only during printing. Rendered for both
  // the phone and desktop shells.
  const printPortal = createPortal(
    <div id="hpiq-print-mount"><DataSheetDoc app={app} /></div>,
    document.body,
  );

  // Concurrent-session grace countdown: one live-ticking banner replaces the
  // 20/10/5-minute discrete alerts (upgrade agreed 2026-07-28). Banner
  // priority, single slot: dataset error > session grace > trial countdown.
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    if (!sessionGraceUntil) return;
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [sessionGraceUntil]);
  const graceLeftMs = sessionGraceUntil ? Math.max(0, sessionGraceUntil - nowTick) : 0;
  const graceUrgent = graceLeftMs > 0 && graceLeftMs <= 5 * 60_000;
  const mmss = `${Math.floor(graceLeftMs / 60000)}:${String(Math.floor(graceLeftMs / 1000) % 60).padStart(2, '0')}`;
  const sessionBanner = sessionGraceUntil && graceLeftMs > 0 ? (
    <div data-testid="session-grace-banner" style={{ background: graceUrgent ? '#b42318' : '#9a6b00', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, padding: '9px 20px', fontSize: 13.5, flex: 'none' }}>
      <span>{t.session.banner(mmss)}</span>
      <button
        onClick={() => setPage('account')}
        style={{ background: '#fff', color: graceUrgent ? '#b42318' : '#9a6b00', border: 'none', borderRadius: 999, padding: '5px 15px', fontWeight: 600, cursor: 'pointer', fontSize: 12.5 }}
      >
        {t.session.cardTitle}
      </button>
    </div>
  ) : null;

  // Trial countdown (days 5/6/7 = D-3..D-1): a slim nudge under the nav on
  // every app entry, linking to the Account subscription section. Pure UX —
  // the server rules close the window on day 8 regardless.
  const access = accessInfo(user);
  const trialBanner = access.state === 'trial' && access.daysLeft <= 3 ? (
    <div data-testid="trial-banner" style={{ background: '#0a6847', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, padding: '9px 20px', fontSize: 13.5, flex: 'none' }}>
      <span>{t.trial.banner(access.daysLeft)}</span>
      <button
        onClick={() => setPage('account')}
        style={{ background: '#fff', color: '#0a6847', border: 'none', borderRadius: 999, padding: '5px 15px', fontWeight: 600, cursor: 'pointer', fontSize: 12.5 }}
      >
        {t.trial.bannerCta}
      </button>
    </div>
  ) : null;

  // A failed dataset download must be visible: banner + retry, both shells.
  // (2026-07-18 PL incident: an access-layer failure looked like an empty
  // catalogue — "0 z 0" — and was undiagnosable from the UI.)
  const dataBanner = datasetsFailed ? (
    <div data-testid="dataset-load-error" style={{ background: '#b42318', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, padding: '10px 20px', fontSize: 13.5, flex: 'none' }}>
      <span>{t.products.loadError}</span>
      <button
        onClick={onRetryDatasets}
        style={{ background: '#fff', color: '#b42318', border: 'none', borderRadius: 999, padding: '6px 16px', fontWeight: 600, cursor: 'pointer', fontSize: 12.5 }}
      >
        {t.products.loadRetry}
      </button>
    </div>
  ) : null;

  // Phones get the curated mobile shell. Tablets get the FULL desktop UI
  // (owner decision 2026-07-12 — no curated subset on tablets); the <1100px
  // nav/typography tolerances live in hpiq.css (@media max-width:1099px).
  if (viewport === 'phone') {
    return (
      <>
        {printPortal}
        {(dataBanner || sessionBanner || trialBanner) && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 120 }}>{dataBanner}{sessionBanner || trialBanner}</div>
        )}
        <OnboardingTour app={app} viewport="phone" hold={tourHold} />
        <MobileApp app={app} viewport={viewport} />
        {notice && (
          <div style={{ position: 'fixed', bottom: 84, left: '50%', transform: 'translateX(-50%)', zIndex: 100, background: '#1d1d1f', color: '#fff', borderRadius: 999, padding: '11px 22px', fontSize: 13.5, boxShadow: '0 8px 24px rgba(0,0,0,.22)', maxWidth: '86vw' }}>
            {notice}
          </div>
        )}
      </>
    );
  }

  return (
    <div className="hpiq-root" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#fff' }}>
      {printPortal}
      <OnboardingTour app={app} viewport="desktop" hold={tourHold} />

      {/* ============ Global nav ============ */}
      <div className="hp-gnav" style={{ background: '#000', color: '#fff', display: 'flex', alignItems: 'center', gap: 28, padding: '0 28px', height: 60, position: 'sticky', top: 0, zIndex: 50, flex: 'none' }}>
        <span
          onDoubleClick={onAdminAccess}
          style={{ display: 'flex', alignItems: 'center', gap: 12 }}
        >
          <BrandLogo height={30} theme="dark" />
          <WavingFlag height={26} className="waving-flag" />
        </span>
        <div ref={navRowRef} className="hp-gnav-links" style={{ display: 'flex', gap: 5, fontSize: 14, position: 'relative' }}>
          {NAV_GROUPS.slice(0, navVisible).map(g => {
            const on = (g.pages as HpPage[]).includes(page);
            return (
              <span
                key={g.id}
                className={on ? undefined : 'hp-navlink'}
                onClick={() => setPage(groupTarget(g))}
                style={navLinkStyle(on)}
              >
                {(t.nav as Record<string, string>)[g.id]}
              </span>
            );
          })}

          {/* Overflow menu — the eight destinations do not fit every window in
              every language (Polish and French labels are the longest), and a
              row that merely scrolls hides whichever page happens to be last.
              What does not fit collapses into this menu instead, and when the
              CURRENT page is one of them the button wears its name so the user
              still sees where they are. */}
          {navVisible < NAV_GROUPS.length && (
            <span
              ref={navMoreRef}
              className={navOverflowActive ? undefined : 'hp-navlink'}
              onClick={() => setNavMenu(v => !v)}
              data-testid="nav-more"
              style={{ ...navLinkStyle(navOverflowActive), display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              {navOverflowActive ? (t.nav as Record<string, string>)[groupOf(page)?.id ?? ''] : '•••'}
              <svg width="9" height="6" viewBox="0 0 9 6" fill="none" aria-hidden><path d="M1 1l3.5 3.5L8 1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
            </span>
          )}

          {/* Off-screen twin of the full row: it inherits the same CSS (so its
              widths follow the responsive padding/font steps) and is what the
              fit calculation measures. Measuring the REAL row instead would
              mean hiding items to learn whether they fit — which changes the
              answer while asking the question. */}
          <div
            ref={navSizerRef}
            aria-hidden
            className="hp-gnav-links"
            style={{ position: 'absolute', left: 0, top: 0, display: 'flex', gap: 5, fontSize: 14, visibility: 'hidden', pointerEvents: 'none', overflow: 'visible' }}
          >
            {/* Measured in the ACTIVE weight (600) on purpose: the selected item
                renders bold, so measuring the lighter weight under-reserves by a
                few pixels and clips the last item. Over-reserving is harmless. */}
            {NAV_GROUPS.map(g => <span key={g.id} style={navLinkStyle(true)}>{(t.nav as Record<string, string>)[g.id]}</span>)}
          </div>
        </div>

        {/* The overflow panel is `fixed`, not absolute inside the row: the row
            clips its own overflow (so the full set never flashes wider than the
            bar on first paint), and a clipped dropdown would be unusable. */}
        {navMenu && navVisible < NAV_GROUPS.length && (
          <div
            ref={navMenuRef}
            data-testid="nav-more-menu"
            style={{
              position: 'fixed', top: 60, left: navMenuLeft, minWidth: 200,
              background: '#1d1d1f', border: '1px solid rgba(255,255,255,.16)', borderRadius: 14,
              padding: 6, boxShadow: '0 12px 32px rgba(0,0,0,.45)', zIndex: 60,
            }}
          >
            {NAV_GROUPS.slice(navVisible).map(g => {
              const on = (g.pages as HpPage[]).includes(page);
              return (
                <div
                  key={g.id}
                  className="hp-navlink"
                  onClick={() => { setPage(groupTarget(g)); setNavMenu(false); }}
                  style={{
                    padding: '9px 13px', borderRadius: 9, cursor: 'pointer', fontSize: 13.5, whiteSpace: 'nowrap',
                    ...(on
                      ? { color: '#fff', fontWeight: 600, background: 'rgba(255,255,255,.12)' }
                      : { color: 'rgba(255,255,255,.72)' }),
                  }}
                >
                  {(t.nav as Record<string, string>)[g.id]}
                </div>
              );
            })}
          </div>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 14, fontSize: 13, color: 'rgba(255,255,255,.75)', flex: 'none' }}>
          {UI_LANGUAGES.length > 1 && (
            <div style={{ display: 'flex', border: '1px solid rgba(255,255,255,.3)', borderRadius: 999, overflow: 'hidden', fontSize: 12.5 }}>
              {UI_LANGUAGES.map(l => (
                <span
                  key={l}
                  onClick={() => setLanguage(l)}
                  style={{
                    padding: '6px 12px', cursor: 'pointer',
                    ...(language === l ? { background: '#fff', color: '#1d1d1f', fontWeight: 600 } : { color: 'rgba(255,255,255,.75)' }),
                  }}
                >
                  {l.toUpperCase()}
                </span>
              ))}
            </div>
          )}
          {/* Tutor icon — replay the interactive tour any time (owner 2026-07-31). */}
          <span
            onClick={() => window.dispatchEvent(new CustomEvent('hpdb-tour-open'))}
            title={t.tour.accountReplay}
            data-testid="nav-tutor"
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: '50%', cursor: 'pointer', flex: 'none', color: 'rgba(255,255,255,.75)' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,.75)')}
          >
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 9l10-4.5L22 9l-10 4.5zM6.5 11v4.4c0 1.2 2.5 2.6 5.5 2.6s5.5-1.4 5.5-2.6V11M22 9v5" /></svg>
          </span>
          <span
            onClick={() => setPage('account')}
            title={t.nav.account}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 7, borderRadius: 999, padding: '6px 14px',
              fontSize: 12.5, cursor: 'pointer', whiteSpace: 'nowrap', flex: 'none', boxSizing: 'border-box',
              ...(page === 'account'
                ? { background: '#fff', color: '#1d1d1f', border: '1px solid #fff', fontWeight: 600 }
                : { background: '#2a2a2c', color: '#fff', border: '1px solid rgba(255,255,255,.3)' }),
            }}
            data-testid="nav-account"
          >
            <AccountIcon />
            <span className="hp-btn-label">{t.nav.account}</span>
          </span>
          <span
            className="hp-press"
            onClick={onLogout}
            title="Sign out"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid rgba(255,255,255,.3)', borderRadius: 999, padding: '6px 14px', fontSize: 12.5, color: 'rgba(255,255,255,.85)', cursor: 'pointer', whiteSpace: 'nowrap', flex: 'none' }}
          >
            <SignOutIcon />
            <span className="hp-btn-label">{t.nav.signOut}</span>
          </span>
        </div>
      </div>

      {dataBanner}
      {sessionBanner || trialBanner}

      {/* ============ Pages ============ */}
      {page === 'find' && <FindPage app={app} />}
      {page === 'products' && <ProductsPage app={app} />}
      {page === 'label' && <LabelPage app={app} />}
      {page === 'datasheet' && <DataSheetPage app={app} />}
      {page === 'bafa' && <BafaPage app={app} />}
      {page === 'guide' && <GuidePage app={app} />}
      {page === 'news' && <NewsPage app={app} />}
      {page === 'trends' && <TrendsPage app={app} />}
      {page === 'install' && <InstallPage app={app} />}
      {page === 'account' && <AccountPage app={app} />}

      {/* ============ Toast ============ */}
      {notice && (
        <div style={{ position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', zIndex: 100, background: '#1d1d1f', color: '#fff', borderRadius: 999, padding: '11px 22px', fontSize: 13.5, boxShadow: '0 8px 24px rgba(0,0,0,.22)', maxWidth: '80vw' }}>
          {notice}
        </div>
      )}

      {/* ============ Footer ============ */}
      <div style={{ borderTop: '1px solid rgba(0,0,0,.08)', background: '#f5f5f7', padding: '18px 28px', display: 'flex', alignItems: 'center', gap: 18, fontSize: 11.5, color: '#7a7a7a', flex: 'none', flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 600, color: '#1d1d1f' }}>HeatPump DB</span>
        <span>{t.footer.edition}</span>
        <span>{t.footer.copyright(new Date().getFullYear())}</span>
        <span style={{ marginLeft: 'auto' }}>{t.footer.note}</span>
      </div>
    </div>
  );
};
