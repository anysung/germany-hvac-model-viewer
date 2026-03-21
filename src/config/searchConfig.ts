/**
 * Search Configuration — drives the Product Search UI for each segment.
 *
 * Each config defines manufacturers, capacity buckets, refrigerants,
 * and any inline/extra filters.  The shared UI reads from these objects
 * instead of hardcoding segment-specific values.
 */

import { HeatPump } from '../types';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface FilterDef {
  key: string;            // internal filter state key
  labelKey: string;       // i18n translation key for the section heading
  options: string[];      // display values for filter badges
  /** Custom match function. */
  match: (item: HeatPump, value: string) => boolean;
}

export interface SearchConfig {
  id: 'residential' | 'commercial';
  manufacturers: string[];
  capacityRanges: string[];
  refrigerants: string[];
  /** Whether to show the IDU/ODU Unit Type filter in Row 2 */
  showUnitType: boolean;
  /**
   * Inline filter placed in Row 2 alongside Capacity and Refrigerant.
   * Used when showUnitType is false to fill the slot (e.g. Market Segment).
   * null means the slot is empty (Unit Type is shown instead).
   */
  inlineFilter: FilterDef | null;
  /** Extra filter rows beyond Row 2 (shown in their own Row 3) */
  extraFilters: FilterDef[];
  /** Parse capacity range label → numeric bounds */
  parseCapacity: (label: string) => { min: number; max: number } | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Extract numeric bounds from a range label like "4 kW ~ 7 kW" or "≤ 40 kW" or "301+ kW" */
function parseRangeLabel(label: string): { min: number; max: number } | null {
  // "≤ 40 kW"
  const lte = label.match(/≤\s*(\d+)/);
  if (lte) return { min: 0, max: Number(lte[1]) };
  // "301+ kW"
  const gte = label.match(/(\d+)\+/);
  if (gte) return { min: Number(gte[1]), max: Infinity };
  // "4 kW ~ 7 kW" or "41 – 80 kW"
  const nums = label.match(/(\d+(?:\.\d+)?)/g)?.map(Number);
  if (nums && nums.length >= 2) return { min: nums[0], max: nums[1] };
  return null;
}

// ─── Market Segment filter definition (shared) ──────────────────────────────

const marketSegmentFilter: FilterDef = {
  key: 'marketSegment',
  labelKey: 'filterMarketSegment',
  options: ['Light Commercial', 'Project & Commercial'],
  match: (item: HeatPump, value: string) => {
    const raw = item.market_segment || '';
    if (value === 'Light Commercial') return raw === 'light_commercial';
    if (value === 'Project & Commercial') return raw === 'commercial_project';
    return false;
  },
};

// ─── Residential ─────────────────────────────────────────────────────────────

export const residentialConfig: SearchConfig = {
  id: 'residential',
  manufacturers: [
    'Mitsubishi', 'Viessmann', 'Buderus', 'Daikin',
    'Panasonic', 'Samsung', 'Bosch', 'LG',
  ],
  capacityRanges: [
    '4 kW ~ 7 kW',
    '8 kW ~ 10 kW',
    '11 kW ~ 12 kW',
    '13 kW ~ 17 kW',
  ],
  refrigerants: ['R290', 'R32', 'R410A'],
  showUnitType: true,
  inlineFilter: null,
  extraFilters: [],
  parseCapacity: parseRangeLabel,
};

// ─── Commercial ──────────────────────────────────────────────────────────────

/**
 * Manufacturer selection rationale:
 *
 * 5 Premium (S / A+ / A tier):
 *   Daikin (A+, 61 models)  — global commercial HVAC leader
 *   Buderus (S, 35)         — super-premium Bosch subsidiary
 *   ELCO (A, 28)            — established European commercial brand
 *   Dimplex (A, 15)         — well-known commercial heat pump maker
 *   Waterkotte (A, 15)      — premium German geothermal/commercial brand
 *
 * 5 Non-Premium by model count:
 *   Mitsubishi (B+, 571)    — dominant in commercial VRF/split systems
 *   Clivet (C, 302)         — Italian commercial HVAC specialist
 *   Trane (C, 229)          — major global commercial equipment brand
 *   Aermec (C, 179)         — Italian commercial chiller/HP specialist
 *   FläktGroup (C, 124)     — Nordic commercial ventilation/HP leader
 */
export const commercialConfig: SearchConfig = {
  id: 'commercial',
  manufacturers: [
    // Premium (S/A+/A)
    'Daikin', 'Buderus', 'ELCO', 'Dimplex', 'Waterkotte',
    // Non-premium top-count
    'Mitsubishi', 'Clivet', 'Trane', 'Aermec', 'FläktGroup',
  ],
  /**
   * Capacity buckets — data-driven from 2,127 commercial products:
   *   ≤ 40 kW   : 530 products  (small commercial / light commercial)
   *   41 – 80 kW: 299 products  (medium)
   *   81 – 150 kW: 339 products (large)
   *   151 – 300 kW: 419 products (major systems)
   *   301+ kW   : 508 products  (industrial scale, up to ~1018 kW)
   *
   * These are much wider than Residential (4–17 kW) because commercial
   * products span 4 kW to 1000+ kW.
   */
  capacityRanges: [
    '≤ 40 kW',
    '41 – 80 kW',
    '81 – 150 kW',
    '151 – 300 kW',
    '301+ kW',
  ],
  /**
   * Refrigerants — by commercial prevalence:
   *   R32: 653, R454B: 630, R290: 361, R410A: 282, R513A: 65
   *   R134a (59) and R407C (52) omitted — legacy/niche, would clutter the UI.
   */
  refrigerants: ['R32', 'R454B', 'R290', 'R410A', 'R513A'],
  /**
   * Unit Type (IDU/ODU) is hidden for Commercial — 2,126 of 2,127 products
   * are Monoblock, so the filter provides no useful discrimination.
   * Market Segment takes its place in the filter row.
   */
  showUnitType: false,
  inlineFilter: marketSegmentFilter,
  extraFilters: [],
  parseCapacity: parseRangeLabel,
};
