/**
 * Centralized display helpers for HeatPump product fields.
 *
 * These functions decouple UI display values from raw data fields,
 * so the UI does not depend on how the storage layer encodes them.
 */

import { HeatPump } from '../types';

// ─── Text Truncation ─────────────────────────────────────────────────────────

/** Truncate to at most maxChars visible characters, appending '...' if cut. */
export function truncateChars(value: string, maxChars: number): string {
  if (!value || value.length <= maxChars) return value;
  return value.slice(0, maxChars) + '...';
}

/** Truncate to at most maxWords whitespace-separated words, appending '...' if cut. */
export function truncateWords(value: string, maxWords: number): string {
  if (!value) return value;
  const words = value.trim().split(/\s+/);
  if (words.length <= maxWords) return value;
  return words.slice(0, maxWords).join(' ') + '...';
}

// ─── Component Lines ─────────────────────────────────────────────────────────

export interface ComponentLines {
  /** Formatted ODU line text, e.g. "ODU : PUHZ-SW75", or null if not identified. */
  oduLine: string | null;
  /** Full ODU display model value for title/tooltip. */
  oduFull: string | null;
  /** Formatted inner line combining all indoor-side components, or null if none. */
  innerLine: string | null;
}

/**
 * Build up to two component display lines for a product row.
 *
 * Uses outdoor_side_display_model (pipeline-computed) for the ODU line, which
 * covers: exact extracted ODU, monoblock products where the product itself is
 * the outdoor unit, and all inference categories. Falls back to outdoor_unit_model
 * when outdoor_side_display_model is absent (e.g. legacy data).
 *
 * ODU line is shown whenever a display model exists — it is NOT suppressed when
 * the display model equals the main BAFA model name.
 *
 * Inner line lists indoor-side components in priority order, joined by ' · '.
 * Labels: IDU, Cont. Unit, Tank, Tower, Hyd. Unit, Indoor Eq.
 */
export function buildComponentLines(item: HeatPump): ComponentLines {
  const odu = item.outdoor_side_display_model ?? item.outdoor_unit_model ?? null;

  const innerParts: string[] = [];
  if (item.idu_model)                   innerParts.push(`IDU : ${item.idu_model}`);
  if (item.control_box_model)           innerParts.push(`Cont. Unit : ${item.control_box_model}`);
  if (item.tank_model)                  innerParts.push(`Tank : ${item.tank_model}`);
  if (item.tower_model)                 innerParts.push(`Tower : ${item.tower_model}`);
  if (item.hydraulic_module_model)      innerParts.push(`Hyd. Unit : ${item.hydraulic_module_model}`);
  if (item.indoor_side_equipment_model) innerParts.push(`Indoor Eq. : ${item.indoor_side_equipment_model}`);

  return {
    oduLine: odu ? `ODU : ${odu}` : null,
    oduFull: odu,
    innerLine: innerParts.length > 0 ? innerParts.join(' · ') : null,
  };
}

// ─── Dynamic Truncation ──────────────────────────────────────────────────────

/**
 * Calculate the Nth percentile of string lengths in an array.
 * Returns 40 as a safe fallback for empty arrays.
 */
export function getPercentileLength(values: string[], percentile: number): number {
  if (values.length === 0) return 40;
  const lengths = values.map(v => (v || '').length).sort((a, b) => a - b);
  const idx = Math.max(0, Math.min(lengths.length - 1, Math.floor((lengths.length - 1) * percentile)));
  return lengths[idx];
}

/**
 * Truncate a string to at most `limit` characters, appending '...' if cut.
 * Identical contract to truncateChars but intended for a data-driven limit.
 */
export function truncateByDynamicLimit(value: string, limit: number): string {
  if (!value || value.length <= limit) return value;
  return value.slice(0, limit) + '...';
}

// ─── Model Card Component Data ───────────────────────────────────────────────

export interface ModelCardComponentData {
  /** ODU display value (full — apply truncateChars for visual clipping). */
  oduValue: string | null;
  /** First indoor-side component label (e.g. 'IDU', 'Cont. Unit', 'Tank'). */
  indoorLabel: string | null;
  /** First indoor-side component value (full). */
  indoorValue: string | null;
  /** All indoor components joined as 'Label : Value · ...' for tooltip title. */
  allIndoorTitle: string | null;
  /** True when any component data is available for display. */
  hasComponents: boolean;
}

/**
 * Extract component display data for the model card bottom row.
 *
 * ODU: outdoor_side_display_model (pipeline-computed) first, then outdoor_unit_model.
 * ODU is shown even when it equals the product's own BAFA model name (monoblock case).
 *
 * Indoor: first available in priority order:
 *   IDU > Cont. Unit > Tank > Tower > Hyd. Unit > Indoor Eq.
 *
 * allIndoorTitle: all non-null indoor components joined for the tooltip.
 */
export function buildModelCardComponentData(item: HeatPump): ModelCardComponentData {
  const oduValue = item.outdoor_side_display_model ?? item.outdoor_unit_model ?? null;

  const indoorCandidates: Array<[string, string | null | undefined]> = [
    ['IDU', item.idu_model],
    ['Cont. Unit', item.control_box_model],
    ['Tank', item.tank_model],
    ['Tower', item.tower_model],
    ['Hyd. Unit', item.hydraulic_module_model],
    ['Indoor Eq.', item.indoor_side_equipment_model],
  ];

  const first = indoorCandidates.find(([, v]) => v);
  const indoorLabel = first ? first[0] : null;
  const indoorValue = first ? (first[1] as string) : null;

  const allIndoorTitle =
    indoorCandidates
      .filter(([, v]) => v)
      .map(([l, v]) => `${l} : ${v}`)
      .join(' · ') || null;

  return {
    oduValue,
    indoorLabel,
    indoorValue,
    allIndoorTitle,
    hasComponents: !!(oduValue || indoorValue),
  };
}

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
