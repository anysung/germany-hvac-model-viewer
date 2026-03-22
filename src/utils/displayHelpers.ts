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

// ─── Installation Type ──────────────────────────────────────────────────────

/**
 * Display the installation type directly from the raw data field.
 *   installation_type "Monoblock" → "Monoblock"
 *   installation_type "Split"     → "Split"
 *
 * package_scope (unit_only / with_hydromodule) is orthogonal and not shown here;
 * it describes packaging, not installation type.
 */
export function getInstallationTypeDisplay(item: HeatPump): string {
  if (item.installation_type) return item.installation_type;
  return '—';
}

/**
 * Check whether a product matches an installation-type filter value.
 * Matches directly against the raw installation_type field.
 */
export function matchesInstallationTypeFilter(item: HeatPump, filterValue: string): boolean {
  return item.installation_type === filterValue;
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
 * Generate the user-facing price display from product price fields.
 *
 * Priority (Phase 2 — canonical display fields from dataset):
 * 1. If pre-computed `display` fields exist → use them directly (no recomputation)
 * 2. Fallback: recompute ±15% band from raw typical (or midpoint of low+high)
 * 3. Otherwise → "—"
 */
export function getDisplayPrice(
  low: number | null,
  typical: number | null,
  high: number | null,
  displayRef?: number | null,
  displayLow?: number | null,
  displayHigh?: number | null,
): DisplayPrice {
  // Prefer canonical display fields from the dataset pipeline
  if (displayRef != null) {
    return {
      main: fmtEur(displayRef),
      range: displayLow != null && displayHigh != null
        ? `${fmtEur(displayLow)} – ${fmtEur(displayHigh)}`
        : null,
      typical: displayRef,
    };
  }

  // Fallback: recompute from raw fields (legacy path)
  let ref: number | null = typical;
  if (ref == null && low != null && high != null) {
    ref = Math.round((low + high) / 2);
  }

  if (ref == null) {
    return { main: '—', range: null, typical: null };
  }

  const computedLow = roundTo50(ref * 0.85);
  const computedHigh = roundTo50(ref * 1.15);

  return {
    main: fmtEur(ref),
    range: `${fmtEur(computedLow)} – ${fmtEur(computedHigh)}`,
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
