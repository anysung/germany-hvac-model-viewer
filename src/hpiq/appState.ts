/**
 * Cross-page app state contract (see handoff README "Interactions & state").
 * One shell owns this state; every cross-page link preserves context.
 */
import { NewsItem, PolicyItem, User, Language } from '../types';
import { ProductStore } from './productService';

export type HpPage = 'find' | 'products' | 'label' | 'datasheet' | 'bafa' | 'guide' | 'news' | 'trends' | 'account';
export type DsMode = 'product' | 'label';
export type DsSectionKey = 'identity' | 'performance' | 'env' | 'bafa';
export type HpSegment = 'residential' | 'commercial';

export interface HpApp {
  store: ProductStore | null;
  /** Full downloaded catalog (residential + commercial) — used by the EU energy label page. */
  allStore: ProductStore | null;
  user: User;
  /** Reflect a self-service profile edit locally (Firestore is the source of truth). */
  patchUser: (patch: Partial<User>) => void;
  news: NewsItem[];
  /** Market policy/programme items (countries/<cc>/policies) — refreshed monthly
   *  by the news pipeline; the funding page renders them as the live
   *  "current programmes" list. */
  policies: PolicyItem[];

  /** "Data status" / footer snapshot date. */
  dataStatusDate: string;
  /** BAFA source snapshot date (e.g. "19 Mar 2026"). */
  bafaSnapshotDate: string;
  /** EPREL-style records sync date. */
  eprelSyncDate: string;
  /** Total BAFA-listed heat pumps in the app (residential + commercial). */
  totalListed: number;


  page: HpPage;
  go: (p: HpPage) => void;

  query: string;
  setQuery: (q: string) => void;

  compare: string[];
  toggleCompare: (id: string) => void;

  selectedId: string | null;
  setSelectedId: (id: string | null) => void;

  labelSelId: string | null;
  setLabelSelId: (id: string | null) => void;

  showCompare: boolean;
  setShowCompare: (v: boolean) => void;

  dsMode: DsMode;
  setDsMode: (m: DsMode) => void;
  dsId: string | null;
  setDsId: (id: string | null) => void;
  dsSections: Record<DsSectionKey, boolean>;
  toggleDsSection: (k: DsSectionKey) => void;

  /** Product catalog segment — switches the active ProductStore dataset. */
  segment: HpSegment;
  /** Switch segment; clears selection/compare/manufacturer filters (datasets differ). */
  setSegment: (s: HpSegment) => void;

  /** FÖRDERUNG toggle — restrict list to BAFA-listed units. */
  bafaOnly: boolean;
  /**
   * Whether this market offers a national-listing search filter at all
   * (config: searchCapabilities.localListingFilter). False where the status would
   * not meaningfully divide the catalogue (UK) or no national list exists (FR).
   */
  listingFilterOffered: boolean;
  /** Records with no published rated capacity — in neither segment; disclosed, not hidden. */
  unclassifiedCount: number;
  setBafaOnly: (v: boolean) => void;

  refFilter: string | null;
  setRefFilter: (r: string | null) => void;
  classFilter: string | null;
  setClassFilter: (c: string | null) => void;
  mfrFilter: string[];
  setMfrFilter: (m: string[]) => void;

  guideTab: 'home' | 'pro';
  setGuideTab: (t: 'home' | 'pro') => void;
  checked: Record<string, boolean>;
  toggleChecked: (k: string) => void;
  faqOpen: number;
  setFaqOpen: (i: number) => void;

  lang: Language;
  setLang: (l: Language) => void;

  onLogout: () => void;
  /** Generates the data-sheet PDF and sends it to print (share sheet / PDF viewer). */
  printSheet: () => void;
  /** Generates the data-sheet PDF and hands it over for saving (share sheet / download). */
  downloadSheetPdf: () => void;
  /** Show a transient toast message (bottom center, ~2.5s). */
  notify: (msg: string) => void;

  // Cross-page navigation with context
  openProduct: (id: string) => void;                 // → Products, row selected
  openDataSheet: (id: string, mode: DsMode) => void; // → Data sheet, model preselected
  openLabelRecord: (id: string) => void;             // → EU energy label, record selected
  goProductsR290: () => void;                        // → Products with R290 filter
}
