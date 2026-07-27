/**
 * datasetChecks — the ONE dataset validation logic (2026-07-28).
 *
 * Shared verbatim by all three verification points, so "verified" always
 * means the same thing (review finding #2):
 *   1. post-publish self-check          (scripts/verify-serving.mjs)
 *   2. automatic-fallback verification  (upload pipeline, via verify-serving)
 *   3. Panic Button pre/post-restore    (accountBilling function)
 *
 * CommonJS so the Cloud Function can require() it directly; the ESM script
 * loads it via createRequire. Callers supply the canary id (the honeytoken
 * registry file stays in scripts/canary/; deploy.sh copies it beside the
 * function). No I/O here — pure checks over parsed data.
 */

/** market → { segment → served file name } — the ONE expected-set definition. */
const DATASETS = {
  DE: { residential: 'products.json',    commercial: 'products-commercial.json' },
  GB: { residential: 'products-gb.json', commercial: 'products-commercial-gb.json' },
  FR: { residential: 'products-fr.json', commercial: 'products-commercial-fr.json' },
  PL: { residential: 'products-pl.json', commercial: 'products-commercial-pl.json' },
  IT: { residential: 'products-it.json', commercial: 'products-commercial-it.json' },
};

/** The exact live object paths (10) — a restore set must match this exactly. */
function expectedObjectPaths() {
  const paths = [];
  for (const [cc, files] of Object.entries(DATASETS)) {
    for (const file of Object.values(files)) paths.push(`datasets/${cc}/${file}`);
  }
  return paths;
}

/** Canonical rated capacity — mirror of src/config/segmentation.ts. */
const ratedKw = p => p.power_35C_kw ?? p.power_55C_kw ?? p.declared_capacity_kw ?? null;

/**
 * All structural/data checks for one dataset file. Throws Error(reason).
 * opts: { cc, segment, canaryId, expectedItems? (count baseline, ±20%) }
 */
function checkDataset(data, opts) {
  const { cc, segment, canaryId, expectedItems } = opts;
  if (!data || typeof data !== 'object') throw new Error('not an object');
  if (!data._meta) throw new Error('missing _meta');
  if (!Array.isArray(data.items)) throw new Error('missing items array');
  const items = data.items;
  if (items.length < 100) throw new Error(`only ${items.length} items (floor 100)`);

  if (expectedItems && (items.length < expectedItems * 0.8 || items.length > expectedItems * 1.2)) {
    throw new Error(`item count ${items.length} outside ±20% of stable ${expectedItems}`);
  }

  // Canary present AND it is THIS market/segment's canary — file integrity
  // and country/segment identity in one check. canaryId === null means the
  // caller explicitly cannot supply it (degraded emergency mode — the caller
  // must surface that); undefined is a caller bug and fails.
  if (canaryId === undefined) throw new Error(`no canary id supplied for ${cc}/${segment}`);
  if (canaryId !== null && !items.some(i => String(i.bafa_id ?? i.source_id) === String(canaryId))) {
    throw new Error(`canary ${canaryId} missing — wrong file or truncated upload`);
  }

  // Identity fields + null ratio on a spread sample.
  const step = Math.max(1, Math.floor(items.length / 200));
  let nullId = 0;
  for (let i = 0; i < items.length; i += step) {
    const p = items[i];
    if (!p.manufacturer || !p.model) nullId++;
  }
  const sampled = Math.ceil(items.length / step);
  if (nullId / sampled > 0.01) throw new Error(`identity-null ratio ${(nullId / sampled * 100).toFixed(1)}% (>1%)`);

  const ids = items.map(i => i.source_id ?? i.bafa_id).filter(Boolean);
  const dupes = ids.length - new Set(ids).size;
  if (dupes > 5) throw new Error(`${dupes} duplicate ids`);

  const mfrs = new Set(items.map(i => i.manufacturer).filter(Boolean));
  if (mfrs.size < 20) throw new Error(`only ${mfrs.size} manufacturers (floor 20)`);

  return { items, manufacturers: mfrs.size };
}

/**
 * Functional simulation of what the app does with one market's pool:
 * 23 kW re-split, sample model search, id lookup. Throws Error(reason).
 */
function simulateMarket(cc, resItems, comItems) {
  const pool = [...resItems, ...comItems];
  const res = pool.filter(p => { const kw = ratedKw(p); return kw != null && kw <= 23; });
  const com = pool.filter(p => { const kw = ratedKw(p); return kw != null && kw > 23; });
  if (res.length < 100) throw new Error(`${cc}: residential split ${res.length} (floor 100)`);
  if (com.length < 20) throw new Error(`${cc}: commercial split ${com.length} (floor 20)`);

  const probe = res[Math.floor(res.length / 2)];
  const needle = String(probe.model ?? '').split(' ')[0]?.toLowerCase();
  if (!needle || needle.length < 2) throw new Error(`${cc}: unusable probe model "${probe.model}"`);
  if (!pool.some(p => `${p.model} ${p.manufacturer}`.toLowerCase().includes(needle))) {
    throw new Error(`${cc}: sample search "${needle}" returned nothing`);
  }
  const byId = new Map(pool.map(p => [String(p.source_id ?? p.bafa_id), p]));
  if (!byId.get(String(probe.source_id ?? probe.bafa_id))) throw new Error(`${cc}: id lookup failed`);
}

module.exports = { DATASETS, expectedObjectPaths, checkDataset, simulateMarket };
