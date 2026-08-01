// Feasibility-test prep: canonical-side match index from LOCAL built datasets.
// Read-only over public/data/*.json; writes only to ../out/. Not production code.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { identityKeys, compact } from '../../../scripts/ofgem/pel-match-lib.mjs';
import { ratedCapacityKw, segmentOf, isDataSheetEligible } from '../../../scripts/lib/data-sheet-eligibility.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const outDir = path.resolve(here, '../out');
fs.mkdirSync(outDir, { recursive: true });

const load = f => {
  const d = JSON.parse(fs.readFileSync(path.join(root, 'public/data', f), 'utf8'));
  return Array.isArray(d) ? d : d.items ?? d.products;
};
const all = [...load('products.json'), ...load('products-commercial.json')];

const records = all.map(p => ({
  bafa_id: p.bafa_id,
  manufacturer: p.manufacturer,
  manufacturer_normalized: p.manufacturer_normalized ?? null,
  model: p.model,
  type: p.type,
  ratedKw: ratedCapacityKw(p),
  segment: segmentOf(p),
  eprel: p.eprel_registration_number != null ? String(p.eprel_registration_number) : null,
  refrigerant: p.refrigerant ?? null,
  eta35: p.efficiency_35C_percent ?? null,
  eta55: p.efficiency_55C_percent ?? null,
  odu: p.outdoor_unit_model ?? null,
  idu: p.idu_model ?? null,
  eligible: isDataSheetEligible(p),
  keys: [...identityKeys(p.model ?? '')],          // Set → array (JSON-safe)
  compactModel: compact(p.model ?? ''),
  mfrKey: compact(p.manufacturer_normalized ?? p.manufacturer ?? ''),
}));

const byEprel = {};
const byKey = {};
for (const r of records) {
  if (r.eprel) (byEprel[r.eprel] ??= []).push(r.bafa_id);
  for (const k of r.keys) (byKey[k] ??= []).push(r.bafa_id);
}

const stats = {
  total: records.length,
  eligible: records.filter(r => r.eligible).length,
  withEprel: records.filter(r => r.eprel).length,
  eprelUnique: Object.keys(byEprel).length,
  eprelSharedByMultiple: Object.values(byEprel).filter(v => v.length > 1).length,
  residential: records.filter(r => r.segment === 'residential').length,
  commercial: records.filter(r => r.segment === 'commercial').length,
  manufacturers: new Set(records.map(r => r.mfrKey)).size,
  generatedAt: new Date().toISOString(),
  source: 'public/data/products.json + products-commercial.json (local, read-only)',
};

fs.writeFileSync(path.join(outDir, 'canonical-index.json'),
  JSON.stringify({ stats, records, byEprel, byKey }));
console.log(JSON.stringify(stats, null, 2));
