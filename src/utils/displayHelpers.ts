/**
 * Centralized display helpers for HeatPump product fields.
 *
 * These functions decouple UI display values from raw data fields,
 * so the UI does not depend on how the storage layer encodes them.
 */

import { HeatPump } from '../types';

// ─── Manufacturer Display ────────────────────────────────────────────────────

/** Return the shortest usable manufacturer name for display. */
export function getDisplayName(item: HeatPump): string {
  return item.manufacturer_short || item.manufacturer;
}

// ─── Unit Type (IDU / ODU) ───────────────────────────────────────────────────

/**
 * Mapping rules (raw → display):
 *   installation_type "Monoblock"                      → "ODU"
 *   installation_type "Split"                           → "IDU"
 *   package_scope "with_hydromodule" (or other set)     → "IDU + ODU"
 *
 * Set detection takes priority over installation_type.
 */
export function getUnitTypeDisplay(item: HeatPump): string {
  // Set products contain both indoor and outdoor units
  if (item.package_scope && item.package_scope !== 'unit_only') {
    return 'IDU + ODU';
  }
  if (item.installation_type === 'Split') return 'IDU';
  if (item.installation_type === 'Monoblock') return 'ODU';
  return '—';
}

/** Map a UI filter value (IDU / ODU) back to raw installation_type for filtering. */
export function unitTypeFilterToInstallationType(filterValue: string): string | null {
  if (filterValue === 'ODU') return 'Monoblock';
  if (filterValue === 'IDU') return 'Split';
  return null;
}

/**
 * Check whether a product matches a unit-type filter value.
 * IDU + ODU (set) products match both IDU and ODU filters.
 */
export function matchesUnitTypeFilter(item: HeatPump, filterValue: string): boolean {
  const display = getUnitTypeDisplay(item);
  if (display === 'IDU + ODU') return true; // sets match either filter
  return display === filterValue;
}

// ─── Price Display (±15% confidence band) ───────────────────────────────────

/**
 * User-facing price range derived from the reference/typical price.
 *
 * The pricing engine produces raw low/high bounds with ~100% spread
 * (multiplicative min/max adjustments across brand, refrigerant, performance).
 * For user-facing display, we tighten this to a ±15% band around the
 * reference price to convey a confidence-oriented estimated range.
 *
 * Reference price: `equipment_price_typical_eur` (engine midpoint estimate)
 * Display min: reference × 0.85, rounded to nearest €50
 * Display max: reference × 1.15, rounded to nearest €50
 */
export interface DisplayPrice {
  /** Main headline price (formatted) */
  main: string;
  /** Secondary range line, or null if no reference price */
  range: string | null;
  /** Raw numeric reference price, or null */
  typical: number | null;
}

/** Round to nearest €50 (matching engine convention) */
function roundTo50(v: number): number {
  return Math.round(v / 50) * 50;
}

/** Format a euro amount with German locale. */
function fmtEur(v: number): string {
  return `€${v.toLocaleString('de-DE')}`;
}

/**
 * Generate the user-facing price display from raw product price fields.
 *
 * Priority:
 * 1. If `typical` exists → headline = typical, range = typical ±15%
 * 2. If only low+high exist → headline = midpoint, range = midpoint ±15%
 * 3. Otherwise → "—"
 */
export function getDisplayPrice(
  low: number | null,
  typical: number | null,
  high: number | null,
): DisplayPrice {
  // Determine the reference price
  let ref: number | null = typical;
  if (ref == null && low != null && high != null) {
    ref = Math.round((low + high) / 2);
  }

  if (ref == null) {
    return { main: '—', range: null, typical: null };
  }

  const displayLow = roundTo50(ref * 0.85);
  const displayHigh = roundTo50(ref * 1.15);

  return {
    main: fmtEur(ref),
    range: `${fmtEur(displayLow)} – ${fmtEur(displayHigh)}`,
    typical: ref,
  };
}

// ─── Grid Ready (formerly SG Ready) ─────────────────────────────────────────

/** Format grid_ready + grid_ready_type for display. */
export function fmtGridReady(ready: boolean, type: string | null): string {
  if (!ready) return '—';
  if (type) return type.replace(/_/g, ' ');
  return 'Yes';
}
