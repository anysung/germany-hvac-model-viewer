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

// ─── Grid Ready (formerly SG Ready) ─────────────────────────────────────────

/** Format grid_ready + grid_ready_type for display. */
export function fmtGridReady(ready: boolean, type: string | null): string {
  if (!ready) return '—';
  if (type) return type.replace(/_/g, ' ');
  return 'Yes';
}
