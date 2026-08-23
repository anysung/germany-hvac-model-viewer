#!/usr/bin/env node
/**
 * match-canonical-to-agrement.mjs — attach the French listing overlay to canonical products.
 *
 * ARCHITECTURE (docs/CANONICAL_TECHNICAL_BASELINE_AND_LOCAL_MARKET_OVERLAY.md):
 * the direction is canonical → local registry, never the reverse.
 *
 *     canonical technical product  →  match against the ADEME agrément register  →  listing overlay
 *
 * The product exists because the canonical baseline says so. The register can only
 * tell us whether France has agréé it, and with which number. A failed match
 * removes nothing, changes no capacity and never touches a technical field.
 *
 * WHY THE REGISTER CAN NEVER CREATE A PRODUCT
 * It publishes marque, gamme, modèle, configuration, assembly country and the
 * agrément number — and NO performance data at all. Nothing in it could pass the
 * shared data-sheet eligibility rule, which is the same reason the Ofgem PEL is
 * an overlay and not a source. French-market brands absent from the German
 * baseline (Atlantic, De Dietrich, Saunier Duval, Thermor, Intuis…) therefore
 * stay absent; we do not invent products to cover them.
 *
 * EVIDENCE THAT MAY CONFIRM (deliberately stricter than the GB matcher):
 *   manufacturer_official  a committed cross-reference from the manufacturer
 *   exact_model            identical identity after formatting-only normalization
 *   component_identity     one side's product codes wholly contain the other's,
 *                          and exactly one canonical candidate results
 *   eprel_bridge           both sides resolve to the SAME EPREL registration —
 *                          the EU's own product identifier
 * A shared outdoor unit does NOT prove the agréé package is this package, and a
 * family/suffix resemblance is a name, not an identity — both go to review only.
 *
 * WHY THE EPREL BRIDGE IS ALLOWED TO CONFIRM, AND WHAT LIMITS IT
 * Neither EPREL link is published by a registry: we derived the register→EPREL
 * link (enrich-agrement-from-eprel.mjs) and the canonical→EPREL link
 * (match-bafa-to-eprel.mjs) ourselves. Two derived links chained together are not
 * automatically evidence, so the number only PROPOSES a candidate. It confirms
 * only when the register side was linked on an exact identifier — the commercial
 * reference ADEME prints, or an exact model — exactly one canonical product
 * carries that registration, and the two identities still share a strong product
 * code. The shared code is what confirms; EPREL only found the candidate. This is
 * the same shape as PL's eprel_bridge, tightened because ADEME publishes no EPREL
 * number of its own.
 *
 * The bridge is deliberately NOT brand-gated. An EPREL registration belongs to one
 * registered model, so «Ciat ITEV 160P» and «Carrier ITEV-160P» resolving to the
 * same registration are the same machine under two trading names — and the shared
 * code requirement still has to be met.
 *
 * CONTRADICTION GUARDS: refrigerant, electrical phase, and — specific to this
 * register — `configuration`. Split and Monobloc are different products however
 * similar the names, so a disagreement disqualifies the candidate outright.
 *
 * WE NEVER SAY "NOT LISTED". Only a market that owns its registry may say that.
 * A canonical product we cannot confirm is "vérification requise" — a statement
 * about our matching, not about the register.
 *
 * MATCH HISTORY (data_sources/ademe_agrement/agrement-match-history.json — committed):
 * a confirmed mapping that stops matching becomes `review_required` and keeps its
 * number. A matcher or parser regression is far likelier than ADEME withdrawing
 * an agrément, and only the source can prove withdrawal.
 *
 * Run:  node scripts/fr/match-canonical-to-agrement.mjs [--snapshot=YYYY-MM]
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compact, identityKeys, findCandidates, conflictsWith, isStrongCode } from '../ofgem/pel-match-lib.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const loadJSON = (p) => JSON.parse(readFileSync(resolve(ROOT, p), 'utf8'));
const newest = (d) => (existsSync(resolve(ROOT, d))
  ? readdirSync(resolve(ROOT, d)).filter((x) => /^\d{4}-\d{2}$/.test(x)).sort().reverse()[0] : null) ?? null;

const SNAPSHOT = process.argv.find((a) => a.startsWith('--snapshot='))?.split('=')[1]
  ?? newest('data_sources/ademe_agrement/raw');
if (!SNAPSHOT) { console.error('No ADEME snapshot found — run scripts/fr/fetch-ademe.mjs'); process.exit(1); }
const NOW = new Date().toISOString();

/** Only these may CONFIRM, with the confidence recorded on the record. */
const CONFIRMING = { manufacturer_official: 'official', exact_model: 'high', component_identity: 'high', eprel_bridge: 'high' };

// ── Inputs ───────────────────────────────────────────────────────────────────
// The canonical baseline is the GERMAN dataset — the same input the GB, PL and IT
// matchers read. Reading the FR build instead made this matcher depend on its own
// consumer's output; and once the ADEME×EPREL native layer landed in that file it
// would have matched the register against records derived FROM the register — a
// circular self-confirmation that would also have tripped the one-agrément-to-many
// guard below and destroyed the genuine matches along with it.
const canonical = [
  ...loadJSON('public/data/products.json').items,
  ...loadJSON('public/data/products-commercial.json').items,
];
const meta = loadJSON(`data_sources/ademe_agrement/raw/${SNAPSHOT}/_meta.json`);
if (!meta.complete) {
  console.error(`ADEME snapshot ${SNAPSHOT} is a PARTIAL read (${meta.records_read}/${meta.total_reported}) — refusing to match.`);
  console.error('Matching a partial register would downgrade confirmed products for a fetch problem.');
  process.exit(1);
}
const register = loadJSON(`data_sources/ademe_agrement/raw/${SNAPSHOT}/records.json`);

const XREF_PATH = 'data_sources/manufacturer_cross_reference/canonical-to-agrement.json';
const xref = existsSync(resolve(ROOT, XREF_PATH)) ? loadJSON(XREF_PATH) : { mappings: [] };

const HISTORY_PATH = 'data_sources/ademe_agrement/agrement-match-history.json';
const history = existsSync(resolve(ROOT, HISTORY_PATH)) ? loadJSON(HISTORY_PATH) : {
  version: 1, updated_at: null,
  note: 'Confirmed canonical↔ADEME agrément mappings. A mapping that stops matching becomes review_required, never "not agréé".',
  matches: {},
};

// ── Brand normalisation ──────────────────────────────────────────────────────
// The canonical `manufacturer` is a legal entity («Galmet Sp. z o.o.» Sp. K.);
// `manufacturer_short` is the trading name. The register prints trading names
// with their own suffixes (NIBE AB, Wolf GmbH, Hitachi Climat). Fold both to a
// bare trading name so brands are compared, not company registrations.
const LEGAL = /(ab|gmbh|nv|bv|sa|sas|sarl|spa|srl|as|oy|ltd|plc|inc|kg|ag|co|climat|electronics|europe|france|international|group)+$/;
const brandKey = (s) => compact(s).toLowerCase().replace(LEGAL, '') || compact(s).toLowerCase();

/**
 * Identity keys, widened for this register.
 *
 * The shared library keeps a hyphenated string together, because "ERGA04DAV3A"
 * is one code. Viessmann writes its identity with separators — the register says
 * "Vitocal 200-S AWB-M-E-AC-AF 201.E10 SP" and the canonical record says
 * "ODU 250-A AWMOF-251.A1.04-230-V001" — so the code that proves they are the
 * same machine only appears once the separators are split as well. Splitting on
 * them ADDS keys; nothing is removed, and isStrongCode still rejects the debris
 * ("230", "V001", "SP"), so a key remains a product identifier rather than a word.
 */
const keysOf = (...fields) => {
  const keys = new Set();
  for (const f of fields) {
    if (!f) continue;
    for (const k of identityKeys(f)) keys.add(k);
    for (const t of String(f).split(/[\s/,+&.\-–—]+/)) {
      const k = compact(t);
      if (isStrongCode(k)) keys.add(k);
    }
  }
  return keys;
};

/* ── Contradiction guard specific to this register ────────────────────────────
   Split vs Monobloc is a different machine, so a real disagreement disqualifies a
   candidate. But the two sides are not equally trustworthy, and treating them as
   if they were rejected 57 correct matches on the first run.

   ADEME publishes `configuration` as a fact about the agréé product. Our
   canonical `installation_type` is a DISPLAY-ONLY field from the pricing overlay
   (build-app-products-from-master-seed.mjs:340) whose documented behaviour
   includes a 'safe_app_fallback' that simply writes Monoblock when nothing could
   be classified (ibid.:139). The dataset shows what that costs: 6,133 Monoblock
   against 297 Split and 760 null, and 1,299 of those "Monoblock" records carry an
   indoor-unit model — a monobloc with an indoor unit is a contradiction in terms.

   So the guard is asymmetric, which is the only honest reading of the two
   provenances: canonical Split is a positive classification and may veto a
   register Monobloc, while canonical Monoblock may be nothing more than the
   fallback and vetoes nothing. Identity evidence still has to be met either way —
   this decides only whether a disagreement is allowed to destroy it. */
const configOf = (s) => {
  const t = String(s ?? '').toLowerCase();
  if (t.includes('monobloc') || t.includes('monoblock')) return 'monobloc';
  if (t.includes('split')) return 'split';
  return null;
};
/** True only for a disagreement we can stand behind — see the note above. */
const configContradicts = (regConfig, canonConfig) =>
  regConfig != null && canonConfig === 'split' && regConfig !== 'split';

// ── Index the canonical side by brand ────────────────────────────────────────
const byBrand = new Map();
const byEprel = new Map();                   // EPREL registration number -> candidates
for (const p of canonical) {
  const k = brandKey(p.manufacturer_short || p.manufacturer);
  if (!k) continue;
  if (!byBrand.has(k)) byBrand.set(k, []);
  const entry = {
    id: String(p.bafa_id ?? p.source_id),
    model: p.model,
    ck: compact(p.model),
    keys: keysOf(p.model, p.outdoor_unit_model, p.idu_model, p.hydraulic_module_model),
    config: configOf(p.installation_type),
    eprel: p.eprel_registration_number != null ? String(p.eprel_registration_number).trim() : null,
    specs: p,
  };
  byBrand.get(k).push(entry);
  if (entry.eprel) {
    if (!byEprel.has(entry.eprel)) byEprel.set(entry.eprel, []);
    byEprel.get(entry.eprel).push(entry);
  }
}

/* ── The EPREL bridge index ───────────────────────────────────────────────────
   Only register rows linked to EPREL on an EXACT identifier may propose a
   candidate. eprel_cleaned_model, eprel_unique_contain and eprel_component_subset
   are how the enrichment reaches coverage, not how it proves identity, so they
   never enter here — they can still be found by the name stages below like any
   other row. */
const EXACT_REGISTER_LINK = new Set(['eprel_commercial_ref', 'eprel_exact_model']);
const ENRICH_PATH = `data_sources/ademe_agrement/matching/${SNAPSHOT}/agrement-eprel-enrichment.json`;
const enrichment = existsSync(resolve(ROOT, ENRICH_PATH)) ? loadJSON(ENRICH_PATH) : null;
const bridgeOf = new Map();                  // agrément number -> { number, method, keys }
for (const e of enrichment?.entries ?? []) {
  if (!e.eprel_registration_number || !EXACT_REGISTER_LINK.has(e.match_method)) continue;
  bridgeOf.set(e.agrement, {
    number: String(e.eprel_registration_number).trim(),
    method: e.match_method,
    keys: keysOf(e.commercial_ref, e.model),
  });
}

// ── Official cross-references win outright ───────────────────────────────────
const officialFor = new Map();               // canonical id -> mapping
for (const m of xref.mappings ?? []) {
  for (const id of m.canonical_ids ?? []) officialFor.set(String(id), m);
}

// ── Match ────────────────────────────────────────────────────────────────────
const overlay = new Map();                   // canonical id -> entry
const review = [];
const stats = { register: register.length, canonical: canonical.length, confirmed: 0, review: 0, brand_absent: 0,
  bridge_no_shared_code: 0, bridge_one_to_many: 0, config_disagreement_ignored: 0 };
const byMethod = {};

for (const r of register) {
  const bk = brandKey(r.marque);
  const cands = byBrand.get(bk) ?? [];

  // The register's `modele` usually already carries the gamme prefix; try both.
  const names = [...new Set([r.modele, r.gamme && r.modele && r.modele.startsWith(r.gamme)
    ? r.modele.slice(r.gamme.length).trim() : null].filter(Boolean))];

  let found = null;

  /* Stage 0 — the EPREL bridge. The registration number picks the candidate; a
     shared product code is what confirms it. Runs before the brand gate because
     an EPREL registration identifies a model, not a trading name. */
  const bridge = bridgeOf.get(r.numeroAgrement);
  if (bridge) {
    const hits = byEprel.get(bridge.number) ?? [];
    if (hits.length === 1) {
      const shared = [...bridge.keys].filter((k) => hits[0].keys.has(k));
      if (shared.length) {
        found = { method: 'eprel_bridge', hits, name: r.modele,
          evidence: { eprel: bridge.number, register_link: bridge.method, shared_codes: shared } };
      } else {
        stats.bridge_no_shared_code++;
        review.push({ kind: 'eprel_bridge_no_shared_code', agrement: r.numeroAgrement, canonical_id: hits[0].id,
          eprel: bridge.number, register_model: r.modele, canonical_model: hits[0].model,
          reason: 'same EPREL registration, but the two identities share no product code — a derived link is not evidence on its own' });
      }
    } else if (hits.length > 1) {
      stats.bridge_one_to_many++;
      review.push({ kind: 'eprel_bridge_one_to_many', agrement: r.numeroAgrement, eprel: bridge.number,
        canonical_ids: hits.map((h) => h.id) });
    }
  }

  if (!found && !cands.length) { stats.brand_absent++; continue; }

  if (!found) for (const name of names) {
    const hit = findCandidates(name, cands);
    if (hit) { found = { ...hit, name }; break; }
  }
  // The library's stages work on the name as written. When they find nothing,
  // try the widened identity: the same package described with separators.
  if (!found) {
    const rk = keysOf(r.modele, r.gamme, r.refCommerciale);
    if (rk.size) {
      const hits = cands.filter((c) => {
        if (!c.keys?.size) return false;
        if (![...rk].some((k) => c.keys.has(k))) return false;
        return [...rk].every((k) => c.keys.has(k)) || [...c.keys].every((k) => rk.has(k));
      });
      if (hits.length) found = { method: 'component_identity', hits, keys: rk, name: r.modele };
    }
  }
  if (!found) continue;

  const regConfig = configOf(r.configuration);
  const kept = found.hits.filter((c) => {
    const clash = conflictsWith(found.name, c);
    if (clash) { review.push({ kind: 'conflict', agrement: r.numeroAgrement, model: r.modele, canonical_id: c.id, reason: clash }); return false; }
    if (configContradicts(regConfig, c.config)) {
      review.push({ kind: 'configuration_conflict', agrement: r.numeroAgrement, model: r.modele, canonical_id: c.id,
        reason: `register says ${regConfig}, canonical is positively classified ${c.config}` });
      return false;
    }
    // A register/canonical disagreement we are NOT willing to act on is still
    // worth seeing: it is the shortest list of products whose installation type
    // our own overlay probably has wrong.
    if (regConfig && c.config && regConfig !== c.config) {
      stats.config_disagreement_ignored++;
      review.push({ kind: 'configuration_disagreement_not_enforced', agrement: r.numeroAgrement, model: r.modele,
        canonical_id: c.id, canonical_model: c.model,
        reason: `register says ${regConfig}, canonical says ${c.config} — canonical Monoblock may be the overlay fallback, so it does not veto` });
    }
    return true;
  });
  if (!kept.length) continue;

  const confirming = CONFIRMING[found.method]
    && !(found.method === 'component_identity' && kept.length > 1);

  for (const c of kept) {
    const official = officialFor.get(c.id);
    const method = official ? 'manufacturer_official' : found.method;
    const status = (official || confirming) ? 'confirmed' : 'review_required';

    const prev = overlay.get(c.id);
    if (prev && prev.status === 'confirmed' && status !== 'confirmed') continue;   // do not downgrade a confirmed hit

    overlay.set(c.id, {
      canonical_id: c.id,
      canonical_model: c.model,
      agrement_number: r.numeroAgrement,
      register_brand: r.marque,
      register_gamme: r.gamme,
      register_model: r.modele,
      register_configuration: r.configuration,
      assembly_country: r.paysAssemblage,
      transitory: r.isTransitorySite === true,
      match_method: method,
      match_confidence: CONFIRMING[method] ?? 'low',
      candidates: kept.length,
      bridge_evidence: found.method === 'eprel_bridge' ? found.evidence : null,
      status,
      snapshot: SNAPSHOT,
      import_date: meta.import_date,
      last_confirmed_at: status === 'confirmed' ? NOW : (history.matches[c.id]?.last_confirmed_at ?? null),
    });
    if (status !== 'confirmed') review.push({ kind: 'not_confirming', method: found.method, agrement: r.numeroAgrement, canonical_id: c.id, candidates: kept.length });
  }
}

// ── One agrément number resolving to several canonical products ──────────────
// A single agrément can legitimately cover a family, and our matcher can equally
// have over-reached. We cannot tell them apart, so we assert neither: the
// products keep everything and simply lose the confirmed listing.
const byNumber = new Map();
for (const e of overlay.values()) {
  if (e.status !== 'confirmed') continue;
  if (!byNumber.has(e.agrement_number)) byNumber.set(e.agrement_number, []);
  byNumber.get(e.agrement_number).push(e);
}
let blocked = 0;
for (const [num, entries] of byNumber) {
  if (entries.length < 2) continue;
  if (entries.every((e) => officialFor.has(e.canonical_id))) continue;   // documented
  for (const e of entries) {
    blocked++;
    overlay.set(e.canonical_id, { ...e, status: 'verification_required', ambiguity_blocked: true, blocked_number: num,
      blocked_with: entries.map((x) => x.canonical_id), previous_status: 'confirmed_candidate' });
  }
  review.push({ kind: 'ambiguous_one_to_many', agrement: num, canonical_ids: entries.map((e) => e.canonical_id) });
}

// ── A confirmed mapping that stopped matching ────────────────────────────────
const canonicalIds = new Set(canonical.map((p) => String(p.bafa_id ?? p.source_id)));
let lost = 0;
for (const [id, prev] of Object.entries(history.matches)) {
  if (overlay.has(id) || !canonicalIds.has(id)) continue;
  lost++;
  overlay.set(id, { ...prev, canonical_id: id, status: 'review_required', previous_status: prev.status, lost_in_snapshot: SNAPSHOT });
}

for (const e of overlay.values()) {
  if (e.status === 'confirmed') { stats.confirmed++; byMethod[e.match_method] = (byMethod[e.match_method] ?? 0) + 1; }
  else stats.review++;
}
stats.ambiguity_blocked = blocked;
stats.lost_since_last_run = lost;

// ── Write ────────────────────────────────────────────────────────────────────
const outDir = resolve(ROOT, `data_sources/ademe_agrement/matching/${SNAPSHOT}`);
mkdirSync(outDir, { recursive: true });
writeFileSync(resolve(outDir, 'canonical-agrement-overlay.json'), JSON.stringify({
  _meta: { generated: NOW, generator: 'match-canonical-to-agrement.mjs v1.0', snapshot: SNAPSHOT,
    import_date: meta.import_date, stats, by_method: byMethod,
    rule: 'Confirmed => "Agréé" + number. Everything else => "Vérification de l\'agrément requise". Never "not agréé".' },
  entries: [...overlay.values()],
}, null, 1));
writeFileSync(resolve(outDir, 'canonical-agrement-review.json'), JSON.stringify({ _meta: { generated: NOW, snapshot: SNAPSHOT }, review }, null, 1));

for (const e of overlay.values()) {
  if (e.status !== 'confirmed') continue;
  history.matches[e.canonical_id] = {
    agrement_number: e.agrement_number, register_model: e.register_model,
    match_method: e.match_method, match_confidence: e.match_confidence,
    status: 'confirmed', last_confirmed_at: e.last_confirmed_at, snapshot: SNAPSHOT,
  };
}
history.updated_at = NOW;
writeFileSync(resolve(ROOT, HISTORY_PATH), JSON.stringify(history, null, 1));

console.log(`ADEME agrément overlay — snapshot ${SNAPSHOT} (register importDate ${meta.import_date})`);
console.log(`  register ${stats.register} · canonical ${stats.canonical}`);
console.log(`  confirmed ${stats.confirmed} · review ${stats.review} · ambiguity-blocked ${stats.ambiguity_blocked} · lost ${stats.lost_since_last_run}`);
console.log(`  register rows whose brand is absent from the baseline: ${stats.brand_absent}`);
console.log(`  EPREL bridge rejected: ${stats.bridge_no_shared_code} no shared code · ${stats.bridge_one_to_many} one-to-many`);
console.log(`  configuration disagreements recorded but not enforced: ${stats.config_disagreement_ignored}`);
console.log(`  by method: ${JSON.stringify(byMethod)}`);
console.log(`  -> ${outDir}`);
