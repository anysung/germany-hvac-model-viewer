#!/usr/bin/env node
/**
 * dataset-gate.mjs — the gate between GENERATING datasets and PUBLISHING them.
 *
 *   generate → validate → review → publish
 *
 * Nothing reaches the production bucket without passing here. A failed or
 * half-finished update leaves the live datasets exactly as they were: this script
 * only ever READS the candidate files and compares them with the last approved
 * manifest. It writes no dataset and uploads nothing.
 *
 *   node scripts/dataset-gate.mjs                 validate the candidate, print the report
 *   node scripts/dataset-gate.mjs --approve       record the candidate as the new baseline
 *                                                 (only after a clean pass; do this when the
 *                                                 upload succeeded)
 *   node scripts/dataset-gate.mjs --override --reason="..."   publish anyway, on the record
 *
 * The approved baseline lives in data_manifests/production.json — a small,
 * committed summary (counts and hashes, never the products themselves), so any
 * checkout can tell what production is supposed to look like.
 *
 * THRESHOLDS: every number below is justified in-line. They are deliberately
 * loose enough to let a normal monthly update through and tight enough that a
 * catastrophic regression — a parser returning half the file, a matcher collapsing,
 * a builder emitting duplicates — cannot reach users silently.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ratedCapacityKw, segmentOf, isDataSheetEligible, isPublishable } from './lib/data-sheet-eligibility.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const APPROVE = args.includes('--approve');
// Rebuild the baseline from what is ACTUALLY LIVE in the bucket. The baseline must
// describe production, not the candidate we happen to have on disk — otherwise the
// change gates compare a candidate with itself and prove nothing.
const FROM_LIVE = args.includes('--baseline-from-live');
const OVERRIDE = args.includes('--override');
const REASON = args.find(a => a.startsWith('--reason='))?.slice(9) ?? null;

const BASELINE = 'data_manifests/production.json';
const CANDIDATE = 'data_manifests/candidate.json';

const DATASETS = {
  DE: ['public/data/products.json', 'public/data/products-commercial.json'],
  GB: ['public/data/products-gb.json', 'public/data/products-commercial-gb.json'],
  FR: ['public/data/products-fr.json', 'public/data/products-commercial-fr.json'],
  PL: ['public/data/products-pl.json', 'public/data/products-commercial-pl.json'],
  IT: ['public/data/products-it.json', 'public/data/products-commercial-it.json'],
};

/** German registry status/funding fields must never leave Germany. */
const GERMAN_ONLY_FIELDS = ['bafa_listing_status', 'bafa_foerderung_von', 'bafa_foerderung_bis', 'bafa_snapshot_fetched_at'];

/**
 * Markets whose PUBLIC schema must be fully neutral: no field name matching
 * /bafa/i and no German-market source labels in provenance values. (GB/FR keep
 * the legacy bafa_reference_* technical-traceability fields; Poland publishes
 * european_reference_* instead.)
 */
const NEUTRAL_PUBLIC_MARKETS = ['PL', 'IT'];

/**
 * Approved one-to-many local-id exceptions. An entry says a document proves this
 * identifier really does cover all those canonical products. An entry WITHOUT an
 * evidence reference is itself a blocking condition — an unevidenced exception is
 * just an override wearing a disguise.
 */
const loadExceptions = file => {
  const p = resolve(ROOT, 'data_sources/manufacturer_cross_reference', file);
  return existsSync(p)
    ? (JSON.parse(readFileSync(p, 'utf8')).exceptions ?? []).filter(e => e.approved)
    : [];
};

/**
 * Per-market local-listing overlay field names. The integrity rules are shared
 * (one local id → one confirmed product, no cross-manufacturer/capacity/type/
 * segment conflicts, no id without a confirmed listing); only the field names
 * differ per registry. Markets without an overlay (DE has its own registry
 * fields, FR has no list) simply count zero local ids here.
 */
const LOCAL_OVERLAY = {
  GB: {
    status: 'pel_match_status', id: 'mcs_number', extraId: 'pel_source_id',
    method: 'pel_match_method', exceptions: loadExceptions('pel-one-to-many-exceptions.json'),
  },
  PL: {
    status: 'zum_match_status', id: 'zum_id', extraId: null,
    method: 'zum_match_method', exceptions: loadExceptions('zum-one-to-many-exceptions.json'),
  },
  IT: {
    // The GSE catalogue publishes no per-row id; gse_entry_key is our
    // deterministic entry key — the same one-key-one-product integrity applies.
    status: 'gse_match_status', id: 'gse_entry_key', extraId: null,
    method: 'gse_match_method', exceptions: [],
  },
};
const NO_OVERLAY = { status: 'pel_match_status', id: 'mcs_number', extraId: 'pel_source_id', method: 'pel_match_method', exceptions: [] };
const ALL_EXCEPTIONS = Object.values(LOCAL_OVERLAY).flatMap(o => o.exceptions);
const UNEVIDENCED = ALL_EXCEPTIONS.filter(e => !e.evidence_reference || !Array.isArray(e.canonical_ids) || !e.canonical_ids.length);

// ── Thresholds ───────────────────────────────────────────────────────────────
const T = {
  // A month of registry churn moves the catalogue by well under 1 %. 2 % is a
  // generous ceiling; a parser truncation or a lost source blows straight past it.
  productDropPct: 2,
  // Same reasoning: eligibility is a property of the data, not of the weather.
  eligibleDropPct: 2,
  // Local matching is the brittle part (brand strings, model formats). A fifth of
  // the confirmed listings vanishing at once is a matcher or parser regression,
  // not Ofgem delisting a fifth of the market.
  localMatchDropPct: 20,
  // Products moving segment is possible (a spec correction) but a mass shift means
  // the capacity field changed meaning.
  segmentShiftPct: 5,
  // A source snapshot older than this is stale enough to question publishing.
  sourceAgeDays: 120,
  // Of the previously published ids we sampled, how many must still exist. With a
  // 2 % product-drop ceiling, ordinary churn leaves ~98 % of a sample intact; a
  // changed id scheme leaves ~0 %. 80 % is far below normal and far above churn.
  idCarryOverPct: 80,
};

/** How many ids to keep per market as carry-over probes (see id_probes). */
const ID_PROBES = 250;

/** cc → full Set of candidate source_ids, for testing baseline probes against. */
const candidateIdSets = {};

const fmtPct = (a, b) => (b === 0 ? 0 : ((a - b) / b) * 100);

// ── Build the candidate manifest ─────────────────────────────────────────────
function loadItems(rel) {
  const abs = resolve(ROOT, rel);
  if (!existsSync(abs)) return null;
  const j = JSON.parse(readFileSync(abs, 'utf8'));
  return { items: j.items ?? [], meta: j._meta ?? {} };
}

/** Read a dataset straight out of the production bucket (canaries subtracted). */
const CANARIES_PER_FILE = 1;
function loadLive(rel) {
  const cc = rel.includes('-gb') ? 'GB' : rel.includes('-fr') ? 'FR' : rel.includes('-pl') ? 'PL' : rel.includes('-it') ? 'IT' : 'DE';
  const gcs = `gs://heatpumpdb-datasets/datasets/${cc}/${rel.split('/').pop()}`;
  const raw = execFileSync('gcloud', ['storage', 'cat', gcs], { maxBuffer: 512 * 1024 * 1024 });
  const j = JSON.parse(raw.toString());
  // The served copies carry one canary record each; the real catalogue is one shorter.
  return { items: (j.items ?? []).slice(0, Math.max(0, (j.items ?? []).length - CANARIES_PER_FILE)), meta: j._meta ?? {} };
}

/**
 * A one-time migration allowance. It authorises ONE declared structural transition
 * (legacy PEL-first UK catalogue → canonical baseline) and nothing else: the
 * candidate must land on the declared target counts EXACTLY, or the allowance does
 * not apply and the normal gates fire. It never disables an absolute check —
 * duplicates, missing capacity, ambiguous listings, leakage and source failures are
 * all still enforced.
 */
const MIG_PATH = resolve(ROOT, 'data_manifests/migration.json');
const migration = existsSync(MIG_PATH) ? JSON.parse(readFileSync(MIG_PATH, 'utf8')) : null;
const migrationActive = migration && !migration.completed_at
  && (!migration.expires_after || Date.parse(migration.expires_after) > Date.now());

const blockers = [];
const warnings = [];
const block = m => blockers.push(m);
const warn = m => warnings.push(m);

const manifest = { generated_at: new Date().toISOString(), markets: {} };

for (const [cc, files] of Object.entries(DATASETS)) {
  const parts = files.map(f => ({ file: f, data: loadItems(f) }));

  // A missing or unreadable dataset is never "zero products" — it is a failure.
  const missing = parts.filter(p => !p.data);
  if (missing.length) {
    block(`[${cc}] dataset missing: ${missing.map(m => m.file).join(', ')} — the source or builder failed`);
    continue;
  }
  const items = parts.flatMap(p => p.data.items);
  if (!items.length) {
    block(`[${cc}] dataset parsed to ZERO records — refusing to publish an empty catalogue`);
    continue;
  }

  const seg = { residential: 0, commercial: 0, unclassified: 0 };
  items.forEach(i => seg[segmentOf(i)]++);

  const ids = items.map(i => String(i.source_id));
  const dupIds = ids.length - new Set(ids).size;

  // IT publishes an additional GSE-native layer under the Italy-specific tier;
  // isPublishable applies the global rule everywhere else (no other market
  // carries GSE_CATALOGUE records — guarded below).
  const eligible = items.filter(isPublishable).length;
  if (cc !== 'IT') {
    const foreignNative = items.filter(i => i.performance_source === 'GSE_CATALOGUE').length;
    if (foreignNative) block(`[${cc}] ${foreignNative} Italy-only GSE-native records leaked into a non-IT dataset`);
  }
  const withCapacity = items.filter(i => ratedCapacityKw(i) != null).length;
  const missingModel = items.filter(i => !i.model).length;
  const badCapacity = items.filter(i => {
    const kw = ratedCapacityKw(i);
    return kw != null && (!Number.isFinite(kw) || kw <= 0 || kw > 2000);
  }).length;

  /**
   * ηs COLUMN-SWAP DETECTOR. A heat pump is always more efficient at a lower
   * flow temperature, so seasonal efficiency at 35 °C must exceed 55 °C
   * (EU 811/2013). The reverse is not a plausible measurement — it means the two
   * columns were transposed somewhere in parsing, which would silently invert
   * every energy-label class we derive. Measured 0 inversions in 20,238 records
   * carrying both values (DE/PL/IT, 2026-07-30), so this can only fire on a
   * regression. Equal values are allowed: a few registry rows genuinely repeat.
   */
  const etaInversions = items.filter(i => {
    const a = i.efficiency_35C_percent, b = i.efficiency_55C_percent;
    return typeof a === 'number' && typeof b === 'number' && a < b;
  }).length;

  /**
   * ID CARRY-OVER PROBES. The counts above catch a catalogue that shrinks, and
   * `hash` tells us the id set changed — but it changes every month by design, so
   * neither notices the dangerous case: the same NUMBER of products republished
   * under DIFFERENT ids. That happens when model-name normalisation or a derived
   * key changes (PL `PL-<zum id>`, IT `IT-<gse entry key>` are OUR keys), and it
   * would silently re-create every product as new: match history orphaned, saved
   * links dead, listing continuity lost.
   *
   * Storing every id would bloat the manifest, so we keep an evenly-spaced sample
   * and later check how many still exist. Wholesale churn drops carry-over to
   * ~zero; ordinary removals barely move it.
   */
  const sortedIds = [...new Set(ids)].sort();
  candidateIdSets[cc] = new Set(sortedIds);
  const probeStep = Math.max(1, Math.floor(sortedIds.length / ID_PROBES));
  const idProbes = sortedIds.filter((_, n) => n % probeStep === 0).slice(0, ID_PROBES);

  // Local listing overlay (field names differ per registry — LOCAL_OVERLAY)
  const OV = LOCAL_OVERLAY[cc] ?? NO_OVERLAY;
  const EXCEPTIONS = OV.exceptions;
  const confirmed = items.filter(i => i[OV.status] === 'confirmed').length;
  const reviewReq = items.filter(i => i[OV.status] === 'review_required').length;
  const verifyReq = items.filter(i => i[OV.status] === 'verification_required').length;
  const localIds = items.filter(i => i[OV.id]).map(i => String(i[OV.id]));

  // ── Local-ID integrity ────────────────────────────────────────────────────
  // The rule is one local registration id → one confirmed canonical product. A
  // certificate may well cover a family of packages, but the data cannot tell that
  // apart from our matcher over-reaching, so an unproven one-to-many mapping is
  // downgraded upstream and must never arrive here still confirmed.
  const byLocalId = {};
  items.filter(i => i[OV.id]).forEach(i => {
    (byLocalId[String(i[OV.id])] ??= []).push(i);
  });
  const localGroups = Object.entries(byLocalId);
  const approvedIds = new Set(EXCEPTIONS.map(e => e.local_id));

  const ambiguousConfirmed = localGroups.filter(([id, v]) =>
    v.length > 1
    && !(approvedIds.has(id) && v.every(x => x[OV.method] === 'approved_one_to_many')));

  const crossManufacturer = localGroups.filter(([, v]) =>
    new Set(v.map(x => x.manufacturer_short ?? x.manufacturer)).size > 1);
  const capacityConflict = localGroups.filter(([, v]) =>
    new Set(v.map(x => Math.round((ratedCapacityKw(x) ?? 0) * 10))).size > 1);
  const refrigerantConflict = localGroups.filter(([, v]) =>
    new Set(v.map(x => x.refrigerant ?? '')).size > 1);
  const typeConflict = localGroups.filter(([, v]) =>
    new Set(v.map(x => x.installation_type ?? '')).size > 1
    || new Set(v.map(x => x.type ?? '')).size > 1);
  const segmentConflict = localGroups.filter(([, v]) => new Set(v.map(segmentOf)).size > 1);

  const sharedLocalIds = localGroups.filter(([, v]) => v.length > 1).length;
  const conflictingLocalIds = segmentConflict.length;
  // Anything not confirmed must carry no identity at all, or the UI could imply a
  // listing we never established.
  const idWithoutConfirmation = items.filter(i => i[OV.status] !== 'confirmed'
    && (i[OV.id] || (OV.extraId && i[OV.extraId]))).length;

  const m = {
    products: items.length,
    data_sheet_eligible: eligible,
    with_rated_capacity: withCapacity,
    residential: seg.residential,
    commercial: seg.commercial,
    unclassified: seg.unclassified,
    duplicate_source_ids: dupIds,
    invalid_capacities: badCapacity,
    eta_inversions: etaInversions,
    missing_model: missingModel,
    manufacturers: new Set(items.map(i => i.manufacturer_short ?? i.manufacturer)).size,
    local_confirmed: confirmed,
    local_review_required: reviewReq,
    local_verification_required: verifyReq,
    local_ids: new Set(localIds).size,
    shared_local_ids: sharedLocalIds,
    conflicting_local_ids: conflictingLocalIds,
    ambiguous_confirmed_local_ids: ambiguousConfirmed.length,
    approved_one_to_many: EXCEPTIONS.length,
    source_snapshot: parts[0].data.meta.pel_snapshot ?? parts[0].data.meta.source_snapshot ?? null,
    generated_at: parts[0].data.meta.generated_at ?? null,
    hash: createHash('sha256').update(JSON.stringify(items.map(i => i.source_id).sort())).digest('hex').slice(0, 16),
    id_probes: idProbes,
  };
  manifest.markets[cc] = m;

  // ── Absolute rules (no baseline needed) ────────────────────────────────────
  if (dupIds > 0) block(`[${cc}] ${dupIds} duplicate canonical ids (source_id) — the catalogue would show the same product twice`);
  if (ambiguousConfirmed.length > 0) {
    block(`[${cc}] ${ambiguousConfirmed.length} local ids are CONFIRMED for several canonical products without an approved exception `
      + `(e.g. ${ambiguousConfirmed[0][0]} → ${ambiguousConfirmed[0][1].length} products). An unproven one-to-many mapping must be `
      + `downgraded to verification-required, not published as a listing.`);
  }
  if (crossManufacturer.length > 0) block(`[${cc}] ${crossManufacturer.length} local ids are confirmed across DIFFERENT MANUFACTURERS — the match is wrong`);
  if (capacityConflict.length > 0) block(`[${cc}] ${capacityConflict.length} local ids are confirmed across CONFLICTING rated capacities`);
  if (refrigerantConflict.length > 0) block(`[${cc}] ${refrigerantConflict.length} local ids are confirmed across CONFLICTING refrigerants`);
  if (typeConflict.length > 0) block(`[${cc}] ${typeConflict.length} local ids are confirmed across incompatible product families (type / monobloc-split)`);
  if (conflictingLocalIds > 0) block(`[${cc}] ${conflictingLocalIds} local ids cover canonical products in DIFFERENT SEGMENTS — the overlay is contradicting itself`);
  if (idWithoutConfirmation > 0) block(`[${cc}] ${idWithoutConfirmation} products carry a local registration id without a confirmed listing — that implies a listing we never established`);
  if (sharedLocalIds > 0) warn(`[${cc}] ${sharedLocalIds} local ids cover several canonical products and are approved by an evidenced exception`);
  if (badCapacity > 0) block(`[${cc}] ${badCapacity} records have an implausible rated capacity`);
  if (etaInversions > 0) {
    block(`[${cc}] ${etaInversions} records have seasonal efficiency at 35 °C BELOW 55 °C — physically impossible, `
      + `so the two columns were transposed. Publishing this would invert the derived energy-label classes.`);
  }
  if (missingModel > 0) block(`[${cc}] ${missingModel} records have no model name`);
  if (seg.unclassified > 0) block(`[${cc}] ${seg.unclassified} published products have no segment — every public product must be classifiable`);
  if (eligible !== items.length) block(`[${cc}] ${items.length - eligible} published products fail Data Sheet eligibility`);

  // Germany's registry status must not travel to another market.
  if (cc !== 'DE') {
    const leaked = GERMAN_ONLY_FIELDS.filter(f => f in items[0]);
    if (leaked.length) block(`[${cc}] German registry/funding fields present in a non-German dataset: ${leaked.join(', ')}`);
  }
  if (NEUTRAL_PUBLIC_MARKETS.includes(cc)) {
    const keyLeak = Object.keys(items[0]).filter(k => /bafa/i.test(k));
    const valueLeak = items.filter(i => /BAFA/i.test(String(i.performance_source ?? ''))
      || /^BAFA$/i.test(String(i.primary_source ?? ''))).length;
    if (keyLeak.length) block(`[${cc}] German-market field names in a neutral public schema: ${keyLeak.join(', ')}`);
    if (valueLeak) block(`[${cc}] ${valueLeak} records carry German-market provenance labels in a neutral public schema`);
  }
  // A "confirmed" listing must have the registry's own id behind it.
  const confirmedWithoutId = items.filter(i => i.pel_match_status === 'confirmed' && !i.mcs_number).length;
  if (confirmedWithoutId > 0) block(`[${cc}] ${confirmedWithoutId} products are marked listed with no local registration id`);
}

if (UNEVIDENCED.length) {
  block(`${UNEVIDENCED.length} one-to-many exception(s) are approved with no evidence reference or no canonical ids — `
    + `an exception without a document is an override in disguise (data_sources/manufacturer_cross_reference/pel-one-to-many-exceptions.json)`);
}

// ── Compare with the last approved baseline ──────────────────────────────────
if (FROM_LIVE) {
  console.log('Reading the LIVE datasets from the production bucket to rebuild the baseline…');
  const live = { generated_at: new Date().toISOString(), source: 'live-bucket', markets: {} };
  for (const [cc, files] of Object.entries(DATASETS)) {
    const items = files.flatMap(f => loadLive(f).items);
    const seg = { residential: 0, commercial: 0, unclassified: 0 };
    items.forEach(i => seg[segmentOf(i)]++);
    live.markets[cc] = {
      products: items.length,
      data_sheet_eligible: items.filter(isDataSheetEligible).length,
      with_rated_capacity: items.filter(i => ratedCapacityKw(i) != null).length,
      residential: seg.residential, commercial: seg.commercial, unclassified: seg.unclassified,
      manufacturers: new Set(items.map(i => i.manufacturer_short ?? i.manufacturer)).size,
      local_confirmed: items.filter(i => i.pel_match_status === 'confirmed').length,
      local_verification_required: items.filter(i => i.pel_match_status === 'verification_required').length,
      hash: createHash('sha256').update(JSON.stringify(items.map(i => i.source_id).sort())).digest('hex').slice(0, 16),
    };
    console.log(`  [${cc}] live: ${items.length} products (${seg.residential} residential, ${seg.commercial} commercial, ${seg.unclassified} unclassified)`);
  }
  mkdirSync(resolve(ROOT, 'data_manifests'), { recursive: true });
  writeFileSync(resolve(ROOT, BASELINE), JSON.stringify(live, null, 2) + '\n');
  console.log(`\n✓ Baseline rebuilt from production: ${BASELINE}`);
  process.exit(0);
}

const baseline = existsSync(resolve(ROOT, BASELINE)) ? JSON.parse(readFileSync(resolve(ROOT, BASELINE), 'utf8')) : null;
const rows = [];

if (!baseline) {
  warn('No approved baseline yet — this run establishes one. Change gates are not evaluated.');
} else {
  for (const [cc, cur] of Object.entries(manifest.markets)) {
    const prev = baseline.markets?.[cc];
    if (!prev) { warn(`[${cc}] no previous baseline for this market — change gates skipped`); continue; }

    const d = (k) => fmtPct(cur[k], prev[k]);
    rows.push({ cc, prev, cur });

    // A declared, one-time migration: the change gates below compare against the
    // OLD architecture, so they would fire on a transition we have already approved.
    // The allowance applies only when the candidate hits the declared target on the
    // nose — otherwise something other than the migration is going on, and the normal
    // gates must speak.
    const mig = migrationActive ? migration.markets?.[cc] : null;
    if (mig) {
      const target = mig.target;
      const hit = Object.entries(target).every(([k, v]) => cur[k] === v);
      if (hit) {
        console.log(`  [${cc}] migration allowance applied — candidate matches the declared target exactly `
          + `(${Object.entries(target).map(([k, v]) => `${k}=${v}`).join(', ')})`);
        continue;      // absolute checks above already ran; only the CHANGE gates are waived
      }
      block(`[${cc}] a migration allowance is declared but the candidate does NOT match its target: `
        + Object.entries(target).map(([k, v]) => `${k} expected ${v}, got ${cur[k]}`).filter((_, i) => true).join('; '));
      continue;
    }

    if (d('products') < -T.productDropPct) {
      block(`[${cc}] product count fell ${d('products').toFixed(1)}% (${prev.products} → ${cur.products}), limit ${T.productDropPct}% — looks like a truncated source or a failed builder`);
    }
    if (d('data_sheet_eligible') < -T.eligibleDropPct) {
      block(`[${cc}] Data Sheet eligible fell ${d('data_sheet_eligible').toFixed(1)}% (${prev.data_sheet_eligible} → ${cur.data_sheet_eligible}), limit ${T.eligibleDropPct}% — products are losing technical fields`);
    }
    if (prev.local_confirmed > 0 && d('local_confirmed') < -T.localMatchDropPct) {
      block(`[${cc}] confirmed local listings collapsed ${d('local_confirmed').toFixed(1)}% (${prev.local_confirmed} → ${cur.local_confirmed}), limit ${T.localMatchDropPct}% — a matcher or parser regression is far likelier than a mass delisting`);
    }
    const segShift = Math.abs(fmtPct(cur.residential, prev.residential));
    if (prev.residential > 0 && segShift > T.segmentShiftPct) {
      block(`[${cc}] residential/commercial split moved ${segShift.toFixed(1)}% (${prev.residential} → ${cur.residential}), limit ${T.segmentShiftPct}% — the capacity field may have changed meaning`);
    }
    if (cur.manufacturers < prev.manufacturers * 0.9) {
      block(`[${cc}] ${prev.manufacturers - cur.manufacturers} manufacturers disappeared — a normalization or parser regression`);
    }

    /**
     * ID CARRY-OVER. Every check above compares SIZES, so republishing the same
     * number of products under new ids passes them all. Sample the baseline's
     * probe ids and see how many survive: normal removals barely move this,
     * a changed id scheme takes it to almost nothing.
     */
    if (Array.isArray(prev.id_probes) && prev.id_probes.length >= 20) {
      const live = new Set(cur.id_probes ?? []);
      // cur.id_probes is a SAMPLE, so membership must be tested against the full
      // candidate id set, not the candidate's own sample.
      const candidateIds = candidateIdSets[cc] ?? live;
      const kept = prev.id_probes.filter(id => candidateIds.has(id)).length;
      const keptPct = (kept / prev.id_probes.length) * 100;
      if (keptPct < T.idCarryOverPct) {
        block(`[${cc}] only ${keptPct.toFixed(1)}% of previously published ids still exist `
          + `(${kept}/${prev.id_probes.length} sampled), floor ${T.idCarryOverPct}% — the SAME products are being `
          + `republished under NEW ids. Model-name normalisation or a derived key changed; match history, `
          + `saved links and listing continuity would all be orphaned.`);
      }
    }
  }
}

// ── Source freshness ─────────────────────────────────────────────────────────
for (const [cc, m] of Object.entries(manifest.markets)) {
  if (!m.generated_at) { warn(`[${cc}] dataset carries no generation timestamp`); continue; }
  const ageDays = (Date.now() - Date.parse(m.generated_at)) / 86_400_000;
  if (ageDays > T.sourceAgeDays) warn(`[${cc}] dataset was generated ${Math.round(ageDays)} days ago — regenerate before publishing`);
}

// ── Report ───────────────────────────────────────────────────────────────────
const pad = (v, n) => String(v).padStart(n);
console.log('\n════ Dataset gate ════════════════════════════════════════════════');
for (const [cc, cur] of Object.entries(manifest.markets)) {
  const prev = baseline?.markets?.[cc];
  console.log(`\n[${cc}]  ${'metric'.padEnd(28)} ${pad('previous', 9)} ${pad('candidate', 10)} ${pad('change', 8)}`);
  const metrics = ['products', 'data_sheet_eligible', 'residential', 'commercial', 'unclassified',
    'with_rated_capacity', 'local_confirmed', 'local_review_required', 'local_verification_required',
    'duplicate_source_ids', 'shared_local_ids', 'ambiguous_confirmed_local_ids', 'conflicting_local_ids',
    'manufacturers'];
  for (const k of metrics) {
    const p = prev?.[k];
    const c = cur[k];
    const delta = p == null ? '—' : (c - p >= 0 ? `+${c - p}` : `${c - p}`);
    console.log(`     ${k.padEnd(28)} ${pad(p ?? '—', 9)} ${pad(c, 10)} ${pad(delta, 8)}`);
  }
  console.log(`     source snapshot: ${cur.source_snapshot ?? '—'} | generated: ${cur.generated_at ?? '—'}`);
}

if (warnings.length) {
  console.log('\n── Warnings ──');
  warnings.forEach(w => console.log(`  ⚠ ${w}`));
}

mkdirSync(resolve(ROOT, 'data_manifests'), { recursive: true });
writeFileSync(resolve(ROOT, CANDIDATE), JSON.stringify(manifest, null, 2) + '\n');

if (blockers.length) {
  console.log('\n── PUBLICATION BLOCKED ──');
  blockers.forEach(b => console.error(`  ✗ ${b}`));
  if (OVERRIDE) {
    if (!REASON) {
      console.error('\n--override requires --reason="why this is safe". Refusing.');
      process.exit(1);
    }
    // An override is a decision, so it is recorded next to the data it overrode.
    manifest.override = { at: new Date().toISOString(), reason: REASON, blockers };
    writeFileSync(resolve(ROOT, CANDIDATE), JSON.stringify(manifest, null, 2) + '\n');
    console.warn(`\n⚠ OVERRIDDEN by the operator: "${REASON}"`);
    console.warn('  The blockers above were NOT fixed. This is recorded in data_manifests/candidate.json.');
    process.exit(0);
  }
  console.error('\nNothing was uploaded; the live datasets are untouched.');
  console.error('Fix the cause, or rerun with --override --reason="…" if you know it is safe.');
  process.exit(1);
}

console.log('\n✓ Gate passed — the candidate may be published.');
console.log('  next: node scripts/upload-datasets.mjs   then   node scripts/dataset-gate.mjs --approve');

if (APPROVE) {
  writeFileSync(resolve(ROOT, BASELINE), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`\n✓ Approved: ${BASELINE} now describes production.`);
}
console.log('══════════════════════════════════════════════════════════════════');
