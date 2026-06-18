/**
 * sourceProfiles.ts — Data source definitions for the Heat Pump Intelligence Platform.
 *
 * PURPOSE:
 *   Defines the role, scope, legal meaning, and access rules for every data source
 *   the platform uses or plans to use. These profiles inform:
 *     - UI disclaimers and attribution labels
 *     - Matching pipeline code (which field to use as the join key)
 *     - Access control (which sources can be called from the frontend vs. server only)
 *     - Caching and refresh cadence rules
 *
 * IMPORTANT — SOURCE ROLE RULES:
 *   BAFA:       Germany eligibility source. When reused as a technical spec reference
 *               in non-German markets, it must NOT be shown as implying eligibility.
 *   OFGEM_PEL:  UK eligibility source. No technical specs; identity/eligibility only.
 *   EPREL:      EU energy label enrichment. NOT a country eligibility source.
 *               Requires server-side API key — never call from the frontend.
 *
 * SECRET VALUES DO NOT BELONG HERE.
 *   The requiresSecret flag documents that a secret is needed; it does not store it.
 *   Secrets live in .env.local (local) or Google Secret Manager (production).
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type SourceId = 'BAFA' | 'OFGEM_PEL' | 'EPREL';

/**
 * eligibility       — The source determines subsidy or regulatory eligibility.
 * technical_reference — The source provides technical specifications used as a
 *                     reference cross-match (not as eligibility in this context).
 * energy_label      — The source provides EU energy label data (class, ηs, LWA).
 * market_reference  — General market/pricing/trend reference; no legal standing.
 */
export type SourceType =
  | 'eligibility'
  | 'technical_reference'
  | 'energy_label'
  | 'market_reference';

export interface SourceProfile {
  /** Unique identifier for this source. Matches SourceId union. */
  sourceId: SourceId;

  /** Human-readable name for UI labels and documentation. */
  displayName: string;

  /**
   * Jurisdiction where this source has legal meaning.
   * 'DE' | 'GB' | 'EU' | 'GLOBAL'
   */
  jurisdiction: string;

  /**
   * How this source is used in the platform.
   * A source may act as 'eligibility' in its home market and as
   * 'technical_reference' when cross-matched in another market.
   */
  sourceType: SourceType;

  /**
   * The HeatPump field that stores this source's primary product identifier.
   * Used as the join key in pipeline matching code.
   */
  primaryKeyField: string;

  /**
   * Plain-language description of what this source legally confirms.
   * Shown in UI tooltips and data sheet disclaimers.
   */
  legalMeaning: string;

  /**
   * Exhaustive list of permitted uses in the UI.
   * Matching pipeline code must not use a source for a purpose not listed here.
   */
  allowedUiUse: string[];

  /**
   * How often the local copy of this source must be refreshed.
   * For EPREL, monthly refresh is legally required by T&C Art. 4 §2.f.
   */
  updateCadence: string;

  /**
   * True if bulk/list access to this source requires a secret API key.
   * EPREL Public API requires a key; BAFA and PEL are public downloads.
   */
  requiresSecret: boolean;

  /**
   * False means the platform must NEVER call this source directly from the browser.
   * Bulk/list calls must go through a server-side script or Cloud Function.
   */
  isFrontendCallable: boolean;

  /** Attribution string required by the source's terms of use. */
  attributionLabel: string;

  /**
   * Caveat or disclaimer text shown wherever this source's data appears.
   * Must be translated for DE market; en is always required.
   */
  caveats: { en: string; de?: string };
}

// ─── Source Profile Registry ──────────────────────────────────────────────────

export const SOURCE_PROFILES: Record<SourceId, SourceProfile> = {
  BAFA: {
    sourceId: 'BAFA',
    displayName: 'BAFA Heat Pump Registry',
    jurisdiction: 'DE',
    sourceType: 'eligibility',
    primaryKeyField: 'bafa_id',
    legalMeaning:
      'Confirms eligibility for BAFA/BEG heat pump subsidy programmes in Germany. ' +
      'Has no legal eligibility meaning outside Germany.',
    allowedUiUse: [
      'Display as subsidy eligibility confirmation for German BAFA/BEG programmes',
      'Use as technical specification reference for products in any market',
      'Cross-reference to identify equivalent products listed in a non-German primary registry',
      'Display COP, SCOP, noise, capacity, refrigerant, and physical spec data',
    ],
    updateCadence: 'Weekly (BAFA publishes updated lists); pipeline refresh on demand',
    requiresSecret: false,
    isFrontendCallable: true,
    attributionLabel: 'Source: BAFA (Bundesamt für Wirtschaft und Ausfuhrkontrolle)',
    caveats: {
      en:
        'BAFA eligibility data applies to German subsidy programmes only. ' +
        'When BAFA data is displayed alongside UK PEL data, it provides a technical ' +
        'specification reference only — not UK subsidy eligibility. ' +
        'Always verify current eligibility status directly with BAFA.',
      de:
        'BAFA-Förderfähigkeitsdaten gelten ausschließlich für deutsche Förderprogramme (BAFA/BEG). ' +
        'Aktuelle Förderfähigkeit stets direkt bei der BAFA verifizieren.',
    },
  },

  OFGEM_PEL: {
    sourceId: 'OFGEM_PEL',
    displayName: 'Ofgem BUS Product Eligibility List (PEL)',
    jurisdiction: 'GB',
    sourceType: 'eligibility',
    primaryKeyField: 'mcs_number',
    legalMeaning:
      'Confirms product eligibility for the UK Boiler Upgrade Scheme (BUS) via MCS certification. ' +
      'Has no legal eligibility meaning outside the United Kingdom.',
    allowedUiUse: [
      'Display as eligibility confirmation for the UK Boiler Upgrade Scheme (BUS)',
      'Verify MCS Certification Number and certification period',
      'Identify products eligible for BUS grant applications',
    ],
    updateCadence: 'Monthly (Ofgem publishes updated PEL); pipeline refresh on demand',
    requiresSecret: false,
    isFrontendCallable: true,
    attributionLabel: 'Source: Ofgem BUS Product Eligibility List (MCS certified products)',
    caveats: {
      en:
        'PEL data confirms MCS-certified products eligible for the Boiler Upgrade Scheme. ' +
        'The PEL does not contain detailed technical specifications. ' +
        'Eligibility status may change — always verify current status at ofgem.gov.uk. ' +
        'BAFA technical spec data shown alongside PEL records is a cross-reference match ' +
        'and does not imply German subsidy eligibility for these products.',
    },
  },

  EPREL: {
    sourceId: 'EPREL',
    displayName: 'EU Energy Label Registry (EPREL)',
    jurisdiction: 'EU',
    sourceType: 'energy_label',
    primaryKeyField: 'eprel_registration_number',
    legalMeaning:
      'Confirms EU energy label registration and energy class under EU Ecodesign ' +
      'regulations (Regulation (EU) 811/2013). Not a country-level subsidy eligibility source.',
    allowedUiUse: [
      'Display EU energy class (A+++, A++, A+, A, B, C)',
      'Display seasonal space heating energy efficiency (ηs) values',
      'Display sound power level (LWA indoor/outdoor) from EU test conditions',
      'Display rated heat output at EU test reference temperatures',
      'Link to official EPREL product page at eprel.ec.europa.eu',
    ],
    updateCadence:
      'Monthly refresh required per EPREL Public API Terms & Conditions Art. 4 §2.f. ' +
      'Refresh obligation is standing once EPREL data is stored locally.',
    requiresSecret: true,
    isFrontendCallable: false,
    attributionLabel:
      'Source: European Commission EPREL (European Product Registry for Energy Labelling). ' +
      'Data is supplier-declared and not guaranteed for accuracy (EPREL T&C Art. 7).',
    caveats: {
      en:
        'EPREL energy label data is provided under the EPREL Public API Terms & Conditions ' +
        '(effective 2024-06-03). Energy label data is supplier-declared and not independently ' +
        'verified by the European Commission (EPREL T&C Art. 7). ' +
        'EPREL registration does not confirm subsidy eligibility in any country. ' +
        'Data is refreshed monthly per T&C obligations.',
    },
  },
};
