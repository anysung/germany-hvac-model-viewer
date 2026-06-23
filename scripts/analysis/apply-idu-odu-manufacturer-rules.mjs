/**
 * apply-idu-odu-manufacturer-rules.mjs
 *
 * Applies the manufacturer-specific IDU/ODU rule registry to the BAFA master seed.
 * Produces three output files (all gitignored):
 *   - data_sources/bafa/idu_odu_mapping/2026-06/idu-odu-mapping.json   (full per-product mapping)
 *   - data_sources/bafa/idu_odu_mapping/2026-06/idu-odu-summary.json   (aggregate statistics)
 *   - data_sources/bafa/idu_odu_mapping/2026-06/manual-review-queue.json  (low-conf & research-needed)
 *
 * Output schema: v2.0.0 — policy v1.1.0 canonical fields
 *   - outdoor_unit_model / outdoor_unit_type
 *   - idu_model / idu_type  (true split IDU only — tank/controller excluded)
 *   - control_box_model, tank_model, tower_model, hydraulic_module_model
 *   - indoor_side_equipment_model, controller_model
 *   - system_architecture, component_mapping_status
 *   - component_confidence_score, component_evidence_type
 *   - component_rule_id, component_notes
 *
 * This script is READ-ONLY with respect to production data:
 * - Does NOT modify the master seed
 * - Does NOT modify public/data/
 * - Does NOT deploy anything
 *
 * Usage:
 *   node scripts/analysis/apply-idu-odu-manufacturer-rules.mjs
 *   node scripts/analysis/apply-idu-odu-manufacturer-rules.mjs --snapshot 2026-06
 *   node scripts/analysis/apply-idu-odu-manufacturer-rules.mjs --dry-run
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

const args = process.argv.slice(2);
const SNAPSHOT = args.find(a => a.startsWith('--snapshot='))?.split('=')[1]
  || args[args.indexOf('--snapshot') + 1]?.replace(/^--/, '') === undefined
    ? '2026-06'
    : args[args.indexOf('--snapshot') + 1];
const DRY_RUN = args.includes('--dry-run');

function loadJSON(rel) {
  const abs = resolve(ROOT, rel);
  if (!existsSync(abs)) { console.error('Not found:', abs); process.exit(1); }
  return JSON.parse(readFileSync(abs, 'utf8'));
}

// ── Load inputs ────────────────────────────────────────────────────────────────

const registry = loadJSON('data_sources/bafa/idu_odu_rules/manufacturer-idu-odu-rules.json');
const seed     = loadJSON(`data_sources/bafa/master_seed/${SNAPSHOT}/bafa-master-seed.json`);

// Support both v1.x flat structure (registry.rules) and v2.x manufacturer-nested structure
// Inactive rules (active === false) are skipped entirely
const allRules = registry.manufacturers
  ? registry.manufacturers.flatMap(m => m.rules)
  : (registry.rules || []);
const rules = allRules.filter(r => r.active !== false);
const inactiveCount = allRules.filter(r => r.active === false).length;

const items = seed.items || [];

const mfrCount = registry.manufacturers ? registry.manufacturers.length : '(flat)';
console.log(`Registry version: ${registry.version || '1.x'}  (${rules.length} active, ${inactiveCount} inactive)`);
console.log(`Manufacturer groups: ${mfrCount}`);
console.log(`Products loaded:  ${items.length}  (snapshot: ${SNAPSHOT})`);

// ── Component extractors ────────────────────────────────────────────────────────

const EXTRACTORS = {
  viessmann_idu_odu(model) {
    const parts = model.split(/\s*\/\s*|\s+(?=ODU\b)/);
    if (parts.length < 2) return null;
    return { idu: parts[0].trim(), odu: parts.slice(1).join(' ').trim() };
  },

  bracket_plus(model) {
    const m = model.match(/\[([^\[\]+]+)\s*\+\s*([^\[\]]+)\]/);
    return m ? { odu: m[1].trim(), idu: m[2].trim() } : null;
  },

  paren_ampersand(model) {
    const m = model.match(/\(([^()&]+)\s*&\s*([^()]+)\)/);
    return m ? { odu: m[1].trim(), idu: m[2].trim() } : null;
  },

  plus_separator(model) {
    // Prefer space-separated ' + ' first, then compact '+'
    const idx = model.indexOf(' + ');
    if (idx !== -1) {
      return { odu: model.slice(0, idx).trim(), idu: model.slice(idx + 3).trim() };
    }
    const idx2 = model.indexOf('+');
    if (idx2 !== -1) {
      return { odu: model.slice(0, idx2).trim(), idu: model.slice(idx2 + 1).trim() };
    }
    return null;
  },

  // Reversed plus_separator: position 1 (before +) = IDU, position 2 (after +) = ODU.
  // Vaillant VAI-002: BAFA name order is "indoor + outdoor" (flexoCOMPACT + aroCOLLECT).
  plus_separator_idu_first(model) {
    const idx = model.indexOf(' + ');
    if (idx !== -1) {
      return { idu: model.slice(0, idx).trim(), odu: model.slice(idx + 3).trim() };
    }
    const idx2 = model.indexOf('+');
    if (idx2 !== -1) {
      return { idu: model.slice(0, idx2).trim(), odu: model.slice(idx2 + 1).trim() };
    }
    return null;
  },

  // Position 1 = monoblock ODU, position 2 = tank. IDU field is null — tank is not an IDU.
  // Samsung SAM-001: AE-BXY/CXY monoblock outdoor + AE-DN/RNW/CNW buffer or DHW tank.
  plus_separator_tank(model) {
    const idx = model.indexOf(' + ');
    if (idx !== -1) {
      return { odu: model.slice(0, idx).trim(), idu: null, tank: model.slice(idx + 3).trim() };
    }
    const idx2 = model.indexOf('+');
    if (idx2 !== -1) {
      return { odu: model.slice(0, idx2).trim(), idu: null, tank: model.slice(idx2 + 1).trim() };
    }
    return null;
  },

  // Like bracket_plus but assigns position 2 as control_box instead of idu.
  // MTF-002: bracket notation where second element is a controller (MIM-E03EN), not an IDU.
  bracket_plus_control_box(model) {
    const m = model.match(/\[([^\[\]+]+)\s*\+\s*([^\[\]]+)\]/);
    if (!m) return null;
    return { odu: m[1].trim(), idu: null, control_box: m[2].trim() };
  },

  // Samsung EHS Mono + MIM-E03 control box. Returns { odu, idu: null, control_box }.
  samsung_mim_e03(model) {
    const spaceIdx = model.indexOf(' + ');
    const compactIdx = model.indexOf('+');
    const idx = spaceIdx !== -1 ? spaceIdx : compactIdx;
    if (idx === -1) return null;
    const sepLen = spaceIdx !== -1 ? 3 : 1;
    const odu = model.slice(0, idx).trim();
    const controlBox = model.slice(idx + sepLen).trim();
    if (!controlBox.startsWith('MIM-E03')) return null;
    return { odu, idu: null, control_box: controlBox };
  },

  paren_plus(model) {
    const m = model.match(/\(([^()]+)\s*\+\s*([^()]+)\)/);
    return m ? { odu: m[1].trim(), idu: m[2].trim() } : null;
  },

  clivet_edge_wisan_hqcn(model) {
    const m = model.match(/\/\s*(WiSAN-\S+(?:\s+\S+)*?)\s*\+\s*(HQCN-\S+(?:\s+\S+)*)$/);
    return m ? { odu: m[1].trim(), idu: m[2].trim() } : null;
  },

  clivet_edge_wisan_simple(model) {
    const slashIdx = model.indexOf('/');
    if (slashIdx === -1) return null;
    const wiSAN = model.slice(slashIdx + 1).trim();
    const edgePart = model.slice(0, slashIdx).trim();
    if (!wiSAN.startsWith('WiSAN')) return null;
    return { idu: edgePart, odu: wiSAN };
  },

  clivet_sphera_misan(model) {
    const m = model.match(/\b(SQKN-\S+(?:\s+\S+)*?)\s*\+\s*(MiSAN-\S+(?:\s+\S+)*)$/);
    return m ? { idu: m[1].trim(), odu: m[2].trim() } : null;
  },

  inventor_ats_hu(model) {
    const m = model.match(/^(ATS\w+)\/(HU\w+)$/);
    return m ? { odu: m[1].trim(), idu: m[2].trim() } : null;
  },

  jch_ras_rwm(model) {
    const m = model.match(/(RAS-\S+)\+(RW[MD]-\S+)$/);
    return m ? { odu: m[1].trim(), idu: m[2].trim() } : null;
  },

  nibe_split_paren(model) {
    const m = model.match(/SPLIT\s*\(([^)]+)\s*\+\s*([^)]+)\)/);
    return m ? { odu: m[1].trim(), idu: m[2].trim() } : null;
  },

  gdt_smkl_thf(model) {
    const spaceSlash = model.indexOf(' / ');
    if (spaceSlash !== -1) {
      return { idu: model.slice(0, spaceSlash).trim(), odu: model.slice(spaceSlash + 3).trim() };
    }
    const thfIdx = model.indexOf('/THF-');
    if (thfIdx !== -1) {
      return { idu: model.slice(0, thfIdx).trim(), odu: model.slice(thfIdx + 1).trim() };
    }
    return null;
  },

  none() { return null; },
};

// ── Rule matching helpers ───────────────────────────────────────────────────────

function matchesPattern(value, spec) {
  if (!spec) return false;
  const { type, patterns, pattern } = spec;
  const str = value || '';
  if (type === 'contains_all') return patterns.every(p => str.includes(p));
  if (type === 'contains_any') return patterns.some(p => str.includes(p));
  if (type === 'regex') return new RegExp(pattern).test(str);
  if (type === 'regex_and') return patterns.every(p => new RegExp(p).test(str));
  return false;
}

function applyRule(item, rule) {
  if (!item.manufacturer.includes(rule.manufacturer_contains)) return null;
  if (!matchesPattern(item.model, rule.model_match)) return null;
  if (rule.model_exclude && matchesPattern(item.model, rule.model_exclude)) return null;
  return rule;
}

// ── Canonical field derivation ─────────────────────────────────────────────────

function deriveOutdoorType(rule, extracted, classification) {
  if (rule.outdoor_unit_type) return rule.outdoor_unit_type;
  if (extracted?.control_box || extracted?.tank || extracted?.tower || extracted?.hydraulic_module) {
    return 'monoblock_outdoor_main';
  }
  if (classification === 'standalone_odu') return 'standalone_outdoor_unit';
  if (classification === 'confirmed_not_set') return 'monoblock_outdoor_main';
  if (extracted?.odu) return 'split_odu';
  return 'unknown';
}

function deriveIduType(rule, extracted) {
  if (!extracted?.idu) return 'none';
  if (rule.idu_type) return rule.idu_type;
  const lbl = (rule.idu_label || '').toLowerCase();
  if (lbl.includes('hydrobox') || lbl.includes('hydro-einheit') || lbl.includes('water module')) {
    return 'hydrobox_as_split_idu';
  }
  if (lbl.includes('indoor module') || lbl.includes('innenmodul')) {
    return 'indoor_module_as_split_idu';
  }
  return 'split_indoor_unit';
}

function deriveArchitecture(rule, extracted, classification) {
  if (rule.system_architecture) return rule.system_architecture;
  // system_architecture_note was used on SAM-002 and MTF-002 before v2.2.0
  if (rule.system_architecture_note) return rule.system_architecture_note;
  if (extracted?.control_box) return 'monoblock_with_control_box';
  if (extracted?.tank) return 'monoblock_with_tank';
  if (extracted?.tower) return 'monoblock_with_tower';
  if (extracted?.hydraulic_module) return 'monoblock_with_hydraulic_module';
  if (classification === 'standalone_odu') return 'component_only';
  if (classification === 'confirmed_not_set') return 'monoblock';
  if (classification === 'variant_label') return 'package';
  if (classification === 'requires_research') return 'unknown';
  if (classification === 'confirmed_set' && (extracted?.idu || extracted?.odu)) return 'split';
  return 'unknown';
}

function deriveMappingStatus(rule, extracted, classification) {
  if (classification === 'unclassified') return 'not_extractable';
  if (classification === 'requires_research') return 'requires_research';
  if (classification === 'variant_label') return 'package_label_only';
  if (classification === 'standalone_odu') return 'outdoor_only';
  if (classification === 'confirmed_not_set') return 'outdoor_only';
  if (classification === 'confirmed_set') {
    if (extracted?.idu && extracted?.odu) return 'outdoor_plus_idu';
    if (extracted?.control_box && extracted?.odu) return 'outdoor_plus_control_box';
    if (extracted?.tank && extracted?.odu) return 'outdoor_plus_tank';
    if (extracted?.tower && extracted?.odu) return 'outdoor_plus_tower';
    if (extracted?.hydraulic_module && extracted?.odu) return 'outdoor_plus_hydraulic_module';
    if (extracted?.indoor_side_equipment && extracted?.odu) return 'outdoor_plus_indoor_side_equipment';
    return 'not_extractable';
  }
  return 'not_extractable';
}

function deriveEvidenceType(rule) {
  if (!rule.evidence || !Array.isArray(rule.evidence) || !rule.evidence.length) return 'none';
  const best = rule.evidence.find(e => e.source_type === 'self_describing')
    || rule.evidence.find(e => e.source_type === 'manufacturer_official')
    || rule.evidence.find(e => e.source_type === 'bafa_pattern_analysis')
    || rule.evidence[0];
  const map = {
    self_describing: 'bafa_self_describing',
    manufacturer_official: 'manufacturer_official',
    bafa_pattern_analysis: 'bafa_pattern_only',
    third_party: 'third_party',
  };
  return map[best?.source_type] || 'none';
}

// ── Internal tracking helpers ──────────────────────────────────────────────────

function confidenceBand(score) {
  if (score >= 0.95) return 'high';
  if (score >= 0.90) return 'medium_high';
  if (score >= 0.75) return 'medium';
  if (score >= 0.50) return 'low';
  return 'uncertain';
}

function reviewStatus(score, classification) {
  if (classification === 'requires_research') return 'manual_review_pending';
  if (score >= 0.95) return 'auto_classified_high_conf';
  if (score >= 0.90) return 'auto_classified_medium_conf';
  return 'auto_classified_low_conf';
}

// ── Run classification ──────────────────────────────────────────────────────────

const mapping = [];
const manualQueue = [];
const stats = {
  total: items.length,
  matched_by_rule: 0,
  unmatched: 0,
  by_classification: {},
  by_outdoor_unit_type: {},
  by_system_architecture: {},
  by_component_mapping_status: {},
  by_confidence_band: {},
  by_rule: {},
  confirmed_set_extractable: 0,
  confirmed_set_not_extractable: 0,
};

for (const item of items) {
  let matched = null;
  for (const rule of rules) {
    matched = applyRule(item, rule);
    if (matched) break;
  }

  let entry;
  if (!matched) {
    stats.unmatched++;
    entry = {
      source_id: item.source_id,
      bafa_id: item.bafa_id,
      manufacturer: item.manufacturer,
      model: item.model,
      manufacturer_rule_id: null,
      classification: 'unclassified',
      is_set_product: false,
      // ── Canonical component fields ──────────────────────────────────────
      outdoor_unit_model: null,
      outdoor_unit_type: 'unknown',
      idu_model: null,
      idu_type: 'unknown',
      control_box_model: null,
      controller_model: null,
      tank_model: null,
      tower_model: null,
      hydraulic_module_model: null,
      indoor_side_equipment_model: null,
      system_architecture: 'unknown',
      component_mapping_status: 'not_extractable',
      component_confidence_score: 0,
      component_evidence_type: 'none',
      component_rule_id: null,
      component_notes: null,
      // ── Internal tracking ───────────────────────────────────────────────
      confidence_band: 'uncertain',
      source_basis: 'no_rule_matched',
      review_status: 'unclassified',
    };
  } else {
    stats.matched_by_rule++;
    stats.by_rule[matched.rule_id] = (stats.by_rule[matched.rule_id] || 0) + 1;

    const cls = matched.classification;
    const isSet = cls === 'confirmed_set';
    const extractor = EXTRACTORS[matched.extraction_method] || EXTRACTORS.none;
    const extracted = isSet ? extractor(item.model) : null;

    if (isSet) {
      if (extracted) stats.confirmed_set_extractable++;
      else stats.confirmed_set_not_extractable++;
    }

    // For standalone_odu and confirmed_not_set, the product IS the outdoor unit
    const outdoorUnitModel = extracted?.odu
      || ((cls === 'standalone_odu' || cls === 'confirmed_not_set') ? item.model : null);

    entry = {
      source_id: item.source_id,
      bafa_id: item.bafa_id,
      manufacturer: item.manufacturer,
      model: item.model,
      manufacturer_rule_id: matched.rule_id,
      classification: cls,
      is_set_product: isSet,
      // ── Canonical component fields ──────────────────────────────────────
      outdoor_unit_model: outdoorUnitModel,
      outdoor_unit_type: deriveOutdoorType(matched, extracted, cls),
      idu_model: extracted?.idu || null,
      idu_type: deriveIduType(matched, extracted),
      control_box_model: extracted?.control_box || null,
      controller_model: null,
      tank_model: extracted?.tank || null,
      tower_model: null,
      hydraulic_module_model: null,
      indoor_side_equipment_model: extracted?.indoor_side_equipment || null,
      system_architecture: deriveArchitecture(matched, extracted, cls),
      component_mapping_status: deriveMappingStatus(matched, extracted, cls),
      component_confidence_score: matched.confidence_score,
      component_evidence_type: deriveEvidenceType(matched),
      component_rule_id: matched.rule_id,
      component_notes: matched.notes || null,
      // ── Internal tracking ───────────────────────────────────────────────
      confidence_band: confidenceBand(matched.confidence_score),
      source_basis: (() => {
        if (!matched.evidence) return matched.label;
        if (Array.isArray(matched.evidence)) {
          const best = matched.evidence.find(e => e.source_type === 'manufacturer_official')
            || matched.evidence.find(e => e.source_type === 'self_describing')
            || matched.evidence[0];
          return (best?.what_it_proves || best?.title || matched.label).slice(0, 120);
        }
        return matched.evidence.slice(0, 120);
      })(),
      review_status: reviewStatus(matched.confidence_score, cls),
    };
  }

  stats.by_classification[entry.classification] = (stats.by_classification[entry.classification] || 0) + 1;
  stats.by_outdoor_unit_type[entry.outdoor_unit_type] = (stats.by_outdoor_unit_type[entry.outdoor_unit_type] || 0) + 1;
  stats.by_system_architecture[entry.system_architecture] = (stats.by_system_architecture[entry.system_architecture] || 0) + 1;
  stats.by_component_mapping_status[entry.component_mapping_status] = (stats.by_component_mapping_status[entry.component_mapping_status] || 0) + 1;
  stats.by_confidence_band[entry.confidence_band] = (stats.by_confidence_band[entry.confidence_band] || 0) + 1;

  mapping.push(entry);

  if (
    entry.classification === 'requires_research' ||
    entry.classification === 'standalone_odu' ||
    (entry.classification === 'confirmed_set' && entry.component_confidence_score < 0.90)
  ) {
    manualQueue.push(entry);
  }
}

// ── BAFA list status counts ─────────────────────────────────────────────────────

const bafaYesCount = items.filter(p => p.bafa_list_status === 'yes').length;
const bafaNoCount  = items.filter(p => p.bafa_list_status === 'no').length;

// ── Build summary ───────────────────────────────────────────────────────────────

const ouPopulated   = mapping.filter(e => e.outdoor_unit_model).length;
const iduPopulated  = mapping.filter(e => e.idu_model).length;
const cbPopulated   = mapping.filter(e => e.control_box_model).length;
const tankPopulated = mapping.filter(e => e.tank_model).length;
const towerPopulated = mapping.filter(e => e.tower_model).length;
const hmPopulated   = mapping.filter(e => e.hydraulic_module_model).length;
const isePopulated  = mapping.filter(e => e.indoor_side_equipment_model).length;

const mimInIdu = mapping.filter(e => e.idu_model && e.idu_model.includes('MIM') && e.idu_model.includes('E03')).length;
const mimInCb  = mapping.filter(e => e.control_box_model && e.control_box_model.includes('MIM') && e.control_box_model.includes('E03')).length;

const confirmedSets = mapping.filter(e => e.classification === 'confirmed_set');
const oldStrictBoth = mapping.filter(e => e.classification === 'confirmed_set' && e.outdoor_unit_model && e.idu_model).length;

const outdoorSideIdentifiableCount = mapping.filter(e => e.outdoor_unit_type && e.outdoor_unit_type !== 'unknown').length;

const summary = {
  snapshot: SNAPSHOT,
  generated_at: new Date().toISOString().slice(0, 10),
  rule_registry_version: registry.version,
  schema_version: '2.0.0',

  totals: {
    all_products: stats.total,
    bafa_list_yes: bafaYesCount,
    bafa_list_no: bafaNoCount,
    matched_by_rule: stats.matched_by_rule,
    unmatched_no_rule: stats.unmatched,
  },

  rule_counts: {
    active: rules.length,
    inactive: inactiveCount,
    total: allRules.length,
  },

  classification_breakdown: stats.by_classification,
  outdoor_unit_type_breakdown: stats.by_outdoor_unit_type,
  system_architecture_breakdown: stats.by_system_architecture,
  component_mapping_status_breakdown: stats.by_component_mapping_status,
  confidence_band_breakdown: stats.by_confidence_band,

  component_population: {
    outdoor_unit_model_populated: ouPopulated,
    idu_model_populated: iduPopulated,
    control_box_model_populated: cbPopulated,
    tank_model_populated: tankPopulated,
    tower_model_populated: towerPopulated,
    hydraulic_module_model_populated: hmPopulated,
    indoor_side_equipment_model_populated: isePopulated,
  },

  integrity_checks: {
    mim_e03_in_idu_model: mimInIdu,
    mim_e03_in_control_box_model: mimInCb,
  },

  coverage_comparison: {
    old_strict_both_idu_odu_extracted: oldStrictBoth,
    new_practical_outdoor_unit_model_populated: ouPopulated,
    outdoor_side_identifiable_count: outdoorSideIdentifiableCount,
    note: 'new_practical = standalone_odu and confirmed_not_set products where the BAFA model IS the outdoor unit. outdoor_side_identifiable = all products where outdoor role is known (includes confirmed_set where ODU model extracted, plus all outdoor-only products). monoblock_app_fallback_candidates (not rule-based, internal-only): ~2,400 additional products identifiable by cross-referencing app installation_type=Monoblock; confidence 0.88, below public display threshold.',
  },

  set_product_detail: {
    confirmed_set_total: confirmedSets.length,
    confirmed_set_extractable: stats.confirmed_set_extractable,
    confirmed_set_not_extractable: stats.confirmed_set_not_extractable,
  },

  key_thresholds: {
    public_display_min: 0.90,
    internal_high_conf: 0.95,
    outdoor_unit_model_at_public_display: mapping.filter(e => e.outdoor_unit_model && e.component_confidence_score >= 0.90).length,
    outdoor_unit_model_at_high_conf: mapping.filter(e => e.outdoor_unit_model && e.component_confidence_score >= 0.95).length,
  },

  rule_hit_counts: stats.by_rule,
  manual_review_queue_size: manualQueue.length,
};

// ── Output ─────────────────────────────────────────────────────────────────────

const OUT_DIR = resolve(ROOT, `data_sources/bafa/idu_odu_mapping/${SNAPSHOT}`);
if (!DRY_RUN) {
  mkdirSync(OUT_DIR, { recursive: true });
}

function writeOut(filename, data) {
  if (DRY_RUN) {
    console.log(`\n[DRY-RUN] Would write: ${filename}`);
    if (filename.endsWith('summary.json')) console.log(JSON.stringify(data, null, 2));
    return;
  }
  const path = resolve(OUT_DIR, filename);
  writeFileSync(path, JSON.stringify(data, null, 2), 'utf8');
  console.log(`Wrote: ${path}  (${(JSON.stringify(data).length / 1024).toFixed(1)} kB)`);
}

writeOut('idu-odu-mapping.json', { snapshot: SNAPSHOT, generated_at: summary.generated_at, items: mapping });
writeOut('idu-odu-summary.json', summary);
writeOut('manual-review-queue.json', { snapshot: SNAPSHOT, generated_at: summary.generated_at, count: manualQueue.length, items: manualQueue });

// ── Console report ─────────────────────────────────────────────────────────────

console.log('');
console.log('═══════════════════════════════════════════════════════════════════');
console.log(' Component Mapping — Results (schema v2.0.0)');
console.log('═══════════════════════════════════════════════════════════════════');
console.log(`Snapshot:        ${SNAPSHOT}`);
console.log(`Products total:  ${stats.total}  (BAFA yes: ${bafaYesCount}  BAFA no: ${bafaNoCount})`);
console.log(`Matched by rule: ${stats.matched_by_rule}  |  No rule: ${stats.unmatched}`);
console.log(`Rules:           ${rules.length} active  |  ${inactiveCount} inactive`);
console.log('');
console.log('── Classification breakdown ─────────────────────────────────────────');
Object.entries(stats.by_classification).sort((a,b) => b[1]-a[1]).forEach(([k,v]) => {
  console.log(`  ${k.padEnd(25)} ${v.toString().padStart(6)}`);
});
console.log('');
console.log('── outdoor_unit_type breakdown ──────────────────────────────────────');
Object.entries(stats.by_outdoor_unit_type).sort((a,b) => b[1]-a[1]).forEach(([k,v]) => {
  console.log(`  ${k.padEnd(30)} ${v.toString().padStart(6)}`);
});
console.log('');
console.log('── system_architecture breakdown ────────────────────────────────────');
Object.entries(stats.by_system_architecture).sort((a,b) => b[1]-a[1]).forEach(([k,v]) => {
  console.log(`  ${k.padEnd(30)} ${v.toString().padStart(6)}`);
});
console.log('');
console.log('── component_mapping_status breakdown ───────────────────────────────');
Object.entries(stats.by_component_mapping_status).sort((a,b) => b[1]-a[1]).forEach(([k,v]) => {
  console.log(`  ${k.padEnd(35)} ${v.toString().padStart(6)}`);
});
console.log('');
console.log('── Component population ─────────────────────────────────────────────');
console.log(`  outdoor_unit_model populated:         ${ouPopulated}`);
console.log(`  idu_model populated (split IDU only): ${iduPopulated}`);
console.log(`  control_box_model populated:          ${cbPopulated}`);
console.log(`  tank_model populated:                 ${tankPopulated}`);
console.log(`  tower_model populated:                ${towerPopulated}`);
console.log(`  hydraulic_module_model populated:     ${hmPopulated}`);
console.log(`  indoor_side_equipment_model populated:${isePopulated}`);
console.log('');
console.log('── Integrity checks ─────────────────────────────────────────────────');
console.log(`  MIM-E03 in idu_model:           ${mimInIdu}  (must be 0)`);
console.log(`  MIM-E03 in control_box_model:   ${mimInCb}  (expected 33)`);
console.log('');
console.log('── Coverage comparison ──────────────────────────────────────────────');
console.log(`  Old strict (both IDU+ODU extracted):         ${oldStrictBoth}`);
console.log(`  New practical (outdoor_unit_model populated): ${ouPopulated}`);
console.log(`  Outdoor side identifiable (type known):      ${outdoorSideIdentifiableCount}`);
console.log(`  Monoblock app-fallback candidates (internal): ~2,400  [conf 0.88, not rule-based]`);
console.log('');
console.log('── Confidence band breakdown ────────────────────────────────────────');
Object.entries(stats.by_confidence_band).sort((a,b) => b[1]-a[1]).forEach(([k,v]) => {
  console.log(`  ${k.padEnd(25)} ${v.toString().padStart(6)}`);
});
console.log('');
console.log('── Top rule hits ────────────────────────────────────────────────────');
Object.entries(stats.by_rule).sort((a,b) => b[1]-a[1]).slice(0, 20).forEach(([k,v]) => {
  console.log(`  ${k.padEnd(15)} ${v.toString().padStart(5)}`);
});
console.log('');
console.log(`Manual review queue: ${manualQueue.length} products`);
console.log('═══════════════════════════════════════════════════════════════════');
