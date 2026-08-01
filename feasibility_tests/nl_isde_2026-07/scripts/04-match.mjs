// NL Phase-0 PoC — staged matching (A–J) with a mutually exclusive final
// status per official row. Truth over coverage: every confirmation passes
// refrigerant/category/capacity contradiction guards; ambiguity stays ambiguous.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { identityKeys, compact, numericConflict } from '../../../scripts/ofgem/pel-match-lib.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, '../out');
const rows = JSON.parse(fs.readFileSync(path.join(OUT, 'rows.json'), 'utf8'));
const { records, byKey } = JSON.parse(fs.readFileSync(path.join(OUT, 'canonical-index.json'), 'utf8'));
const { eprel, eByKey } = JSON.parse(fs.readFileSync(path.join(OUT, 'eprel-index.json'), 'utf8'));
const byId = new Map(records.map(r => [r.id, r]));
const canonByEprel = new Map();
for (const r of records) if (r.eprel) (canonByEprel.get(r.eprel) ?? canonByEprel.set(r.eprel, []).get(r.eprel)).push(r.id);

/* ── Normalization (Stage B rules, all listed in the report) ─────────────── */
const LEGAL = new Set(['GMBH', 'KG', 'CO', 'COKG', 'SP', 'ZOO', 'SA', 'AG', 'SE', 'SRL', 'SAS',
  'LTD', 'LLC', 'BV', 'AS', 'OY', 'AB', 'SPA', 'THE', 'GROUP', 'HOLDING', 'EUROPE', 'POLAND',
  'POLSKA', 'DEUTSCHLAND', 'NEDERLAND', 'INTERNATIONAL', 'AIRCONDITIONING', 'AIR', 'CONDITIONING',
  'CLIMATE', 'SOLUTIONS', 'MARKETING', 'ELECTRIC', 'ELECTRONICS', 'INDUSTRIES', 'INDUSTRIAL',
  'TECHNOLOGY', 'ENERGY', 'NEW', 'HEATING', 'THERM', 'THERMEA']);
const brandTokens = s => new Set(String(s ?? '').toUpperCase().normalize('NFKD')
  .replace(/[^A-Z ]+/g, ' ').split(/\s+/).filter(t => (t.length >= 3 || t === 'LG' || t === 'ES') && !LEGAL.has(t)));
// Stage C/D: corporate-name aliases. C = already implied by repo normalization
// (token overlap); D = explicit deterministic additions discovered for NL.
const ALIAS = { // NL brand → tokens that identify the canonical corporate entity.
  // Deterministic corporate-identity aliases (Stage D) — each verified against
  // the canonical manufacturer list or EPREL supplier list, never guessed:
  HAIER: ['QINGDAO'], HITACHI: ['JOHNSON'], SPRSUN: ['GUANGZHOU', 'SPRSUN'],
  TOSHIBA: ['TOSHIBA'], AUX: ['NINGBO', 'AUX'], GREE: ['GREE'],
  'MITSUBISHI ELECTRIC': ['MITSUBISHI'], 'MITSUBISHI HEAVY INDUSTRIES': ['MITSUBISHI'],
  'ALPHA INNOTEC': ['AIT'],          // ait-deutschland GmbH (129 canonical records)
  NEFIT: ['BOSCH', 'NEFIT'],         // Nefit is Bosch's Dutch brand
  'NEFIT BOSCH': ['BOSCH', 'NEFIT'],
  'WEISHAUPT/MONARCH': ['WEISHAUPT'],
  'EMMETI/RADSON': ['EMMETI', 'RADSON'],
};
const mfrConsistent = (nlBrand, canonMfr, canonShort) => {
  const A = brandTokens(nlBrand);
  const B = brandTokens(canonMfr);
  if (canonShort) for (const t of brandTokens(canonShort)) B.add(t);
  for (const t of A) if (B.has(t)) return { ok: true, via: 'token' };
  const al = ALIAS[String(nlBrand).toUpperCase()] ?? ALIAS[[...A][0]];
  if (al && al.some(t => B.has(t))) return { ok: true, via: 'alias' };
  return { ok: false };
};
const refNorm = s => String(s ?? '').toUpperCase().replace(/\(.*\)/, '').replace(/^R0+/, 'R').trim();
const CAT_FAMILY = { 'Lucht-Water': 'air_water', 'Grond-Water': 'ground', 'Water-Water': 'ground', 'Warmtepompboiler': 'dhw' };
const typeFamily = t => /Luft \/ Luft/i.test(t ?? '') ? 'air_air'
  : /Luft/i.test(t ?? '') ? 'air_water' : /Sole|Wasser \/ Wasser/i.test(t ?? '') ? 'ground' : 'other';

/** Contradiction guards. exactIdentity widens the capacity band (conditions differ). */
function conflicts(z, c, exactIdentity) {
  const out = [];
  const zf = CAT_FAMILY[z.category];
  if (zf && zf !== 'dhw') {
    const cf = typeFamily(c.type);
    if (cf !== 'other' && zf !== cf) out.push(`type:${zf}≠${cf}`);
  }
  if (z.refrigerant && c.refrigerant && !String(c.refrigerant).toUpperCase().includes(refNorm(z.refrigerant))) {
    out.push(`ref:${refNorm(z.refrigerant)}≠${c.refrigerant}`);
  }
  if (z.kw != null && (c.kw35 != null || c.kw55 != null)) {
    const tol = exactIdentity ? 0.40 : 0.15; // subsidiabel vermogen ≠ rated condition
    const ok = [c.kw35, c.kw55, c.ratedKw].some(k => k != null
      && Math.abs(k - z.kw) / Math.max(k, z.kw) <= tol);
    if (!ok) out.push(`kw:${z.kw}vs${c.kw35}/${c.kw55}`);
  }
  return out;
}

const exactIdentity = (a, b) => {
  const A = compact(a ?? ''), B = compact(b ?? '');
  if (!A || !B) return false;
  if (A === B) return true;
  return (A.length >= 12 || B.length >= 12) && (A.includes(B) || B.includes(A));
};

/* ── Stage machine ───────────────────────────────────────────────────────── */
const seenDup = new Set();
const results = rows.map((z, i) => {
  const R = { meldcode: z.meldcode, brand: z.brand, model: z.model, category: z.category,
    kw: z.kw, refrigerant: z.refrigerant, gwp: z.gwp, amount: z.amount, xlsxRow: z.xlsxRow,
    status: null, stage: null, confidence: null, evidence: null, canonical_id: null,
    eprel_id: null, ambiguity: null, next_action: null };

  // duplicate source rows (same brand+model+kw+refrigerant under another meldcode)
  const dupKey = compact(z.brand) + '|' + compact(z.model) + '|' + z.kw + '|' + refNorm(z.refrigerant);
  if (seenDup.has(dupKey)) { R.status = 'duplicate_source_row'; R.stage = 'pre'; R.evidence = 'identical brand/model/kw/refrigerant under another meldcode'; return R; }
  seenDup.add(dupKey);

  // ── RVO string decoders (deterministic, documented) ──
  // 1) trailing/embedded article numbers "(0010016682)" → separate field
  const artikel = [...String(z.model).matchAll(/\((\d{7,})\)/g)].map(m => m[1]);
  const modelClean = String(z.model).replace(/\s*\(\d{7,}\)/g, '').trim();
  // 2) variant notation "EGSA(H)(X)06D9W(G)": parenthesized 1–2 letter groups are
  //    optional/alternative characters → expand to concrete code candidates (cap 16)
  const expandVariants = (m) => {
    let out = [''];
    const parts = m.split(/(\([A-Z]{1,2}\))/);
    for (const part of parts) {
      const g = part.match(/^\(([A-Z]{1,2})\)$/);
      if (g) out = out.flatMap(pre => [pre, pre + g[1]]);
      else out = out.map(pre => pre + part);
      if (out.length > 16) return [m];
    }
    return [...new Set(out)];
  };
  const variants = /\([A-Z]{1,2}\)/.test(modelClean) ? expandVariants(modelClean) : [modelClean];
  R.artikelnr = artikel.length ? artikel : null;
  R.variant_count = variants.length > 1 ? variants.length : null;

  const zc = compact(modelClean);
  // candidate pool via identity keys (models + components), over all variants
  const hits = new Set();
  for (const v of variants) {
    for (const k of identityKeys(v)) for (const id of byKey[k] ?? []) hits.add(id);
    const vc = compact(v);
    if (vc) for (const id of byKey[vc] ?? []) hits.add(id);
  }
  let pool = [...hits].map(id => byId.get(id));
  let brandPool = pool.map(c => ({ c, m: mfrConsistent(z.brand, c.manufacturer, c.manufacturer_short) }))
    .filter(x => x.m.ok);
  // Brand-scoped containment fallback: token keys miss decorated variant families
  // ("Compress 7800i LWF 8" vs "Compress 7800i LW 8 OR-S"). Compare directly
  // against ALL same-brand canonical records; confirmation still requires the
  // same containment/equality + contradiction guards — near-misses become
  // ambiguous or stay unresolved, never confirmed.
  if (!brandPool.length) {
    brandPool = records
      .map(c => ({ c, m: mfrConsistent(z.brand, c.manufacturer, c.manufacturer_short) }))
      .filter(x => x.m.ok)
      .filter(x => variants.some(v => exactIdentity(v, x.c.model)));
  }

  const finish = (c, status, stage, via, conf) => {
    R.status = status; R.stage = stage; R.confidence = conf;
    R.canonical_id = c.id; R.eprel_id = c.eprel ?? null;
    R.evidence = `${via}; canonical="${c.model}" (${c.manufacturer_short ?? c.manufacturer})`;
    return R;
  };

  // Stage A — exact raw equality (case-insensitive whitespace-tolerant, no other transforms)
  const rawExact = brandPool.filter(x =>
    String(x.c.model).toUpperCase().replace(/\s+/g, ' ').trim() === String(modelClean).toUpperCase().replace(/\s+/g, ' ').trim());
  if (rawExact.length === 1 && !conflicts(z, rawExact[0].c, true).length) {
    return finish(rawExact[0].c, 'confirmed_exact', 'A', 'raw equality', 'high');
  }

  // Stage B — normalized equality/containment over all decoded variants
  const normEq = brandPool.filter(x => variants.some(v => exactIdentity(v, x.c.model)));
  if (normEq.length === 1) {
    const conf = conflicts(z, normEq[0].c, true);
    if (!conf.length) {
      const status = normEq[0].m.via === 'alias' ? 'confirmed_new_alias' : 'confirmed_normalized';
      return finish(normEq[0].c, status, normEq[0].m.via === 'alias' ? 'D' : 'B', 'compact identity', 'high');
    }
    R.ambiguity = conf.join(',');
  }
  if (normEq.length > 1) {
    // Stage E — capacity resolution among identity-equal candidates
    const within = normEq.filter(x => !conflicts(z, x.c, false).length);
    if (within.length === 1) return finish(within[0].c, 'confirmed_capacity_supported', 'E', 'identity + unique capacity/spec fit', 'high');
    R.status = 'ambiguous_multiple_candidates'; R.stage = 'B';
    R.ambiguity = `${normEq.length} identity-equal candidates`; R.next_action = 'manual review / one-to-many exception';
    return R;
  }

  // Stage B/G — strong-code resolution incl. components (package strings)
  if (brandPool.length === 1) {
    const x = brandPool[0];
    if (variants.some(v => !numericConflict(v, x.c.model ?? ''))) {
      const conf = conflicts(z, x.c, false);
      if (!conf.length) {
        const status = x.m.via === 'alias' ? 'confirmed_new_alias' : 'confirmed_normalized';
        return finish(x.c, status, x.m.via === 'alias' ? 'D' : 'B', 'unique strong-code identity', 'high');
      }
    }
  }
  if (brandPool.length > 1) {
    const within = brandPool.filter(x => variants.some(v => !numericConflict(v, x.c.model ?? '')) && !conflicts(z, x.c, false).length);
    if (within.length === 1) return finish(within[0].c, 'confirmed_capacity_supported', 'E', 'strong-code + unique capacity/spec fit', 'medium-high');
    if (within.length > 1) {
      R.status = 'ambiguous_multiple_candidates'; R.stage = 'E';
      R.ambiguity = `${within.length} compatible candidates`; R.next_action = 'manual review';
      return R;
    }
  }

  // Stage H — EPREL bridge (brand-consistent, unique registration number)
  const eHits = new Set();
  for (const v of variants) {
    const vc = compact(v);
    if (vc) for (const rn of eByKey[vc] ?? []) eHits.add(rn);
    for (const k of identityKeys(v)) for (const rn of eByKey[k] ?? []) eHits.add(rn);
  }
  const eCands = [...eHits].map(rn => ({ rn, e: eprel[rn] }))
    .filter(x => mfrConsistent(z.brand, x.e.supplier, null).ok)
    .filter(x => variants.some(v => exactIdentity(v, x.e.model) || !numericConflict(v, x.e.model ?? '')));
  // capacity sanity vs EPREL
  const eOk = eCands.filter(x => z.kw == null || [x.e.kw35, x.e.kw55].some(k => k != null && Math.abs(k - z.kw) / Math.max(k, z.kw) <= 0.30));
  const uniqModels = new Set(eOk.map(x => compact(x.e.model)));
  if (eOk.length >= 1 && uniqModels.size === 1) {
    const x = eOk[0];
    R.eprel_id = x.rn;
    // (a) canonical record carries this EPREL number → confirmed via EPREL
    const viaCanon = (canonByEprel.get(x.rn) ?? []).map(id => byId.get(id))
      .filter(c => !conflicts(z, c, true).length);
    if (viaCanon.length === 1) return finish(viaCanon[0], 'confirmed_eprel_supported', 'H', `EPREL ${x.rn} bridges to canonical`, 'high');
    // (b) native candidate — spec completeness from EPREL + RVO
    const specOk = x.e.etas35 != null && (x.e.kw35 != null || x.e.kw55 != null)
      && (x.e.noiseIn != null || x.e.noiseOut != null); // + refrigerant from RVO ⇒ ≥2 core fields
    R.status = specOk ? 'native_spec_complete' : 'native_partial';
    R.stage = 'H';
    R.confidence = variants.some(v => exactIdentity(v, x.e.model)) ? 'high' : 'medium';
    R.evidence = `EPREL ${x.rn} "${x.e.model}" (${x.e.supplier}); etas35=${x.e.etas35} kw=${x.e.kw35 ?? x.e.kw55} noise=${x.e.noiseIn ?? x.e.noiseOut}`;
    R.next_action = specOk ? null : 'manufacturer datasheet for missing fields';
    return R;
  }
  if (eOk.length > 1) {
    R.status = 'ambiguous_multiple_candidates'; R.stage = 'H';
    R.ambiguity = `${uniqModels.size} distinct EPREL models`; R.next_action = 'manual EPREL disambiguation';
    return R;
  }

  // Stage J — nothing matched anywhere
  const brandKnown = records.some(c => mfrConsistent(z.brand, c.manufacturer, c.manufacturer_short).ok)
    || Object.values(eprel).some(e => mfrConsistent(z.brand, e.supplier, null).ok);
  R.status = 'eligibility_only';
  R.stage = 'J';
  R.evidence = brandKnown ? 'brand known, model untraceable in canonical/EPREL indexes' : 'brand absent from canonical and EPREL indexes';
  R.next_action = 'manufacturer-source enrichment or leave as eligibility info';
  return R;
});

/* ── Tallies ─────────────────────────────────────────────────────────────── */
const tally = {};
for (const r of results) tally[r.status] = (tally[r.status] ?? 0) + 1;
console.log(JSON.stringify(tally, null, 1));
const confirmed = results.filter(r => r.status.startsWith('confirmed'));
const native = results.filter(r => r.status === 'native_spec_complete');
console.log('confirmed:', confirmed.length, '| native_spec_complete:', native.length,
  '| tier1+2:', confirmed.length + native.length,
  `(${(100 * (confirmed.length + native.length) / results.length).toFixed(1)}% of ${results.length})`);
fs.writeFileSync(path.join(OUT, 'match-results.json'), JSON.stringify(results));
