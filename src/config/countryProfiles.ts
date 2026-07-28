/**
 * countryProfiles.ts — Country-level configuration for the Heat Pump Intelligence Platform.
 *
 * PURPOSE:
 *   Centralises every public, non-secret, country-specific config value so that
 *   future country expansion requires only adding a profile entry here — not
 *   scattering country logic across components, services, or utility files.
 *
 * USAGE:
 *   Import ACTIVE_COUNTRY from this file wherever country-specific config is needed.
 *   ACTIVE_COUNTRY is a build-time constant resolved from VITE_COUNTRY_CODE.
 *   One deployment = one country; there is no runtime country-switching.
 *
 * ADDING A NEW COUNTRY:
 *   1. Add the country code to CountryCode.
 *   2. Add a full profile entry to COUNTRY_PROFILES.
 *   3. Set VITE_COUNTRY_CODE=<code> in the deployment environment.
 *   4. Do not modify any other file for basic country config.
 *
 * SECRET VALUES DO NOT BELONG HERE.
 *   Use .env.local (local) or Google Secret Manager (production) for API keys.
 */

import { PUBLIC_ENV } from './env';

// ─── Types ───────────────────────────────────────────────────────────────────

export type CountryCode = 'DE' | 'GB' | 'FR' | 'PL' | 'IT';

/** Identifies the primary eligibility/registry data source for a country. */
export type PrimaryRegistry = 'BAFA' | 'OFGEM_PEL';

/** Enrichment sources that may be layered on top of the primary registry. */
export type EnrichmentLayer = 'EPREL' | 'BAFA_REFERENCE' | 'NF_PAC';

export interface CountryProfile {
  /** ISO 3166-1 alpha-2. */
  code: CountryCode;

  /** Display name for this country/market. */
  name: string;

  /** Short market description used in AI prompts and UI copy. */
  marketName: string;

  /**
   * ISO 4217 **billing** currency — the currency this market's subscriptions
   * are charged in, and the key that selects the Paddle price catalogue
   * (config/paddlePrices.ts). A market whose currency has no catalogue keeps
   * checkout in "coming soon" mode, which is why this is a billing fact, not
   * a display preference.
   *
   * ONE CURRENCY FOR EVERY MARKET — EUR (owner decision 2026-07-29). Paddle
   * charges strictly in the currency a price is defined in; it does NOT
   * convert to a local currency at checkout (verified against the live API:
   * a GB customer on a EUR price is charged in EUR). Local-currency billing
   * would require GBP/PLN price overrides in Paddle plus a catalogue block
   * here. Until that is deliberately introduced, every market bills in EUR
   * so there is a single set of prices to manage — and the pricing UI says
   * so explicitly (i18n `sub.eurBillingNote`), because the customer's own
   * bank does any conversion and may add a foreign-transaction fee.
   */
  currency: string;

  /** Single character currency symbol for UI display. Matches `currency`. */
  currencySymbol: string;

  /** BCP 47 locale tag used for number/date formatting. */
  locale: string;

  /**
   * Firestore root path for this country's collections.
   * Format: 'countries/<code>'
   * All news, policy, eligibility, and metadata docs live under this root.
   */
  firestoreRoot: string;

  /**
   * The primary data source that determines product eligibility in this market.
   * Eligibility data from this source has legal meaning in this country only.
   */
  primaryRegistry: PrimaryRegistry;

  /**
   * The HeatPump field that stores the primary registry's product identifier.
   * Used as the display-level stable product ID (source_id) for this market.
   */
  primaryRegistryIdField: keyof { bafa_id: string; mcs_number: string };

  /** Full name of the subsidy authority shown in UI disclaimers. */
  subsidyAuthorityLabel: string;

  /** Short label for the subsidy/eligibility tab in the main navigation. */
  subsidyTabLabel: string;

  /** Injected into AI system prompts to scope news/policy to this market. */
  aiMarketContext: string;

  /** i18n label for the primary registry ID shown on data sheets. */
  sourceIdLabel: { en: string; de?: string };

  /**
   * Enrichment layers active for this country build.
   * EPREL: EU energy label data (server-side only, requires API key).
   * BAFA_REFERENCE: BAFA used as technical spec cross-reference (non-DE markets only).
   */
  enabledEnrichmentLayers: EnrichmentLayer[];

  /** Static JSON dataset paths served from /public/data/. */
  datasetPaths: {
    products: string;
    commercialProducts: string;
  };

  /**
   * EVERY market publishes the same canonical technical products — the same
   * identity, specs, capacity and 23 kW segmentation. This field exists to make
   * that explicit and to refuse a future country that tries to publish a local
   * registry as its technical catalogue (that is what broke the UK: see
   * docs/CANONICAL_TECHNICAL_BASELINE_AND_LOCAL_MARKET_OVERLAY.md).
   */
  technicalBaseline: 'canonical';

  /**
   * What this market may say about LOCAL LISTING — and nothing else. The overlay
   * never creates a product, never supplies a spec, and never removes a product
   * when a match fails.
   *
   * `source: null` = this market has no national product list (France:
   * MaPrimeRénov'/CEE are criteria-based). Then nothing is shown — a foreign
   * registry's listing is never relabelled as a local one.
   *
   * `filterEnabled` — offer the "listed only" search filter? A filter that returns
   * nearly everything, nearly nothing or zero is not discovery, it is a trap. This
   * is a decision, not something to compute from field presence.
   *
   * The two label keys point into the market dictionary (hpiq/i18n.ts) so the
   * wording stays translatable and no English leaks into a non-English site.
   */
  localListingOverlay: {
    source: 'BAFA' | 'PEL' | 'ZUM' | 'GSE' | null;
    filterEnabled: boolean;
    /**
     * Start with the "listed only" filter ON? Only sensible where the listed
     * subset dominates BOTH segments (Germany). Poland offers the filter but
     * starts unfiltered: ZUM covers 3–55 kW, so a default-on filter would
     * near-empty the commercial tab — the exact trap that once blanked UK
     * Commercial. Ignored when filterEnabled is false.
     */
    filterDefaultOn?: boolean;
  };
}

// ─── Profiles ────────────────────────────────────────────────────────────────

export const COUNTRY_PROFILES: Record<CountryCode, CountryProfile> = {
  DE: {
    code: 'DE',
    name: 'Germany',
    marketName: 'German market',
    currency: 'EUR',
    currencySymbol: '€',
    locale: 'de-DE',
    firestoreRoot: 'countries/DE',
    primaryRegistry: 'BAFA',
    primaryRegistryIdField: 'bafa_id',
    subsidyAuthorityLabel: 'BAFA (Bundesamt für Wirtschaft und Ausfuhrkontrolle)',
    subsidyTabLabel: 'BAFA / KfW',
    aiMarketContext: 'German market',
    sourceIdLabel: { en: 'BAFA ID', de: 'BAFA-ID' },
    enabledEnrichmentLayers: ['EPREL'],
    datasetPaths: {
      products: '/data/products.json',
      commercialProducts: '/data/products-commercial.json',
    },
    technicalBaseline: 'canonical',
    // Germany IS the registry it lists against: a delisting there is a verified
    // fact, not a failed match — so Germany is the one market that may say a
    // product is NOT listed. The listing also meaningfully divides the catalogue,
    // so the filter earns its place here.
    localListingOverlay: { source: 'BAFA', filterEnabled: true, filterDefaultOn: true },
  },

  FR: {
    code: 'FR',
    name: 'France',
    marketName: 'French market',
    currency: 'EUR',
    currencySymbol: '€',
    locale: 'fr-FR',
    firestoreRoot: 'countries/FR',
    // FR catalogue is derived from the German BAFA registry (same hardware sold
    // in both markets — user decision 2026-07-07). BAFA is the data source;
    // NF PAC references are attached as an enrichment layer only where a
    // confident match exists (uncertain → no reference shown, never guessed).
    primaryRegistry: 'BAFA',
    primaryRegistryIdField: 'bafa_id',
    subsidyAuthorityLabel: "MaPrimeRénov' (ANAH) / CEE",
    subsidyTabLabel: "MaPrimeRénov' / CEE",
    aiMarketContext: 'French market',
    // User-facing: neutral European reference — never names a foreign registry.
    sourceIdLabel: { en: 'European reference' },
    enabledEnrichmentLayers: ['EPREL', 'NF_PAC'],
    datasetPaths: {
      products: '/data/products-fr.json',
      commercialProducts: '/data/products-commercial-fr.json',
    },
    technicalBaseline: 'canonical',
    // France has NO national heat-pump list (MaPrimeRénov'/CEE are criteria-based,
    // not a product list). A foreign registry's listing must never be relabelled as
    // a French one, so France shows no local listing status at all.
    localListingOverlay: { source: null, filterEnabled: false },
  },

  GB: {
    code: 'GB',
    name: 'United Kingdom',
    marketName: 'UK market',
    // Billed in EUR like every market (see the `currency` field docs) — Paddle
    // does not convert, so a GBP value here would only disable checkout.
    currency: 'EUR',
    currencySymbol: '€',
    locale: 'en-GB',
    firestoreRoot: 'countries/GB',
    primaryRegistry: 'OFGEM_PEL',
    primaryRegistryIdField: 'mcs_number',
    subsidyAuthorityLabel: 'Ofgem BUS (Boiler Upgrade Scheme)',
    subsidyTabLabel: 'BUS / MCS',
    aiMarketContext: 'UK market',
    // Products come from the canonical baseline, so the id shown on a row/sheet is
    // the European reference. The PEL id (MCS number) is shown separately, and only
    // where the listing is confirmed.
    sourceIdLabel: { en: 'European reference' },
    enabledEnrichmentLayers: ['BAFA_REFERENCE', 'EPREL'],
    datasetPaths: {
      products: '/data/products-gb.json',
      commercialProducts: '/data/products-commercial-gb.json',
    },
    technicalBaseline: 'canonical',
    // The PEL publishes no performance data at all, so it can never be a technical
    // catalogue — it is purely a listing overlay on the canonical products. Only a
    // CONFIRMED match says "PEL Listed"; everything else says "verification
    // required", because a failed match is a fact about our matching, not about the
    // PEL. No search filter: the status divides the catalogue far too unevenly to
    // help discovery, and a default-on filter once emptied the whole page.
    localListingOverlay: { source: 'PEL', filterEnabled: false },
  },

  PL: {
    code: 'PL',
    name: 'Poland',
    marketName: 'Polish market',
    // Billed in EUR like every market (see the `currency` field docs).
    currency: 'EUR',
    currencySymbol: '€',
    locale: 'pl-PL',
    firestoreRoot: 'countries/PL',
    // PL catalogue is derived from the canonical (German-registry) baseline —
    // same hardware sold across the EU. Lista ZUM (IOŚ-PIB) is a LISTING overlay
    // only; it never becomes the technical catalogue.
    primaryRegistry: 'BAFA',
    primaryRegistryIdField: 'bafa_id',
    subsidyAuthorityLabel: 'NFOŚiGW (Czyste Powietrze / Moje Ciepło)',
    subsidyTabLabel: 'Czyste Powietrze / ZUM',
    aiMarketContext: 'Polish market',
    // User-facing: neutral European reference — never names a foreign registry.
    sourceIdLabel: { en: 'European reference' },
    enabledEnrichmentLayers: ['BAFA_REFERENCE', 'EPREL'],
    datasetPaths: {
      products: '/data/products-pl.json',
      commercialProducts: '/data/products-commercial-pl.json',
    },
    technicalBaseline: 'canonical',
    // Poland HAS a national product list — Lista ZUM — and heat pumps must be on
    // it for Czyste Powietrze grants (invoices from 14.06.2024). Only a CONFIRMED
    // match says "ZUM listed"; everything else says "verification required" (the
    // PEL rule: a failed match is a fact about our matching, not about the list).
    // The filter earns its place: ZUM listing meaningfully divides the catalogue
    // and is the question Polish installers actually ask.
    localListingOverlay: { source: 'ZUM', filterEnabled: true, filterDefaultOn: false },
  },

  IT: {
    code: 'IT',
    name: 'Italy',
    marketName: 'Italian market',
    currency: 'EUR',
    currencySymbol: '€',
    locale: 'it-IT',
    firestoreRoot: 'countries/IT',
    // IT catalogue is derived from the canonical (German-registry) baseline —
    // same hardware sold across the EU. The GSE Conto Termico pre-qualified
    // appliance catalogue is a LISTING overlay only; it never becomes the
    // technical catalogue (it publishes no refrigerant/sound data at all).
    primaryRegistry: 'BAFA',
    primaryRegistryIdField: 'bafa_id',
    subsidyAuthorityLabel: 'GSE (Conto Termico 3.0) / Agenzia delle Entrate (detrazioni)',
    subsidyTabLabel: 'Conto Termico',
    aiMarketContext: 'Italian market',
    // User-facing: neutral European reference — never names a foreign registry.
    sourceIdLabel: { en: 'European reference' },
    enabledEnrichmentLayers: ['BAFA_REFERENCE', 'EPREL'],
    datasetPaths: {
      products: '/data/products-it.json',
      commercialProducts: '/data/products-commercial-it.json',
    },
    technicalBaseline: 'canonical',
    // Italy HAS a national pre-qualified appliance catalogue (GSE Conto Termico
    // 3.0, catalogo III.A) — listed appliances get the simplified incentive
    // path. Only a CONFIRMED match says "nel catalogo GSE"; everything else
    // says "verifica richiesta" (the PEL rule: a failed match is a fact about
    // our matching, not about the catalogue). NO search filter: confirmed
    // listings divide the catalogue far too unevenly to help discovery —
    // the same trap that once emptied a whole page on the UK edition.
    localListingOverlay: { source: 'GSE', filterEnabled: false },
  },
};

// ─── Active Profile ───────────────────────────────────────────────────────────

function resolveActiveCountry(): CountryProfile {
  const code = PUBLIC_ENV.COUNTRY_CODE;
  if (code in COUNTRY_PROFILES) {
    return COUNTRY_PROFILES[code as CountryCode];
  }
  // Unknown code → safe fallback to DE; log a warning in non-production builds.
  if (import.meta.env.DEV) {
    console.warn(
      `[countryProfiles] Unknown VITE_COUNTRY_CODE="${code}". Falling back to DE.`,
    );
  }
  return COUNTRY_PROFILES.DE;
}

/**
 * The active CountryProfile for this build.
 * Resolved once at module load from VITE_COUNTRY_CODE; constant thereafter.
 * Import this wherever country-specific config is needed.
 */
export const ACTIVE_COUNTRY: CountryProfile = resolveActiveCountry();
