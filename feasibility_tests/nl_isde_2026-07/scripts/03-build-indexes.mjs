// NL Phase-0 PoC — canonical + EPREL match indexes (local data only).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { identityKeys, compact } from '../../../scripts/ofgem/pel-match-lib.mjs';
import { ratedCapacityKw, segmentOf } from '../../../scripts/lib/data-sheet-eligibility.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '../../..');
const OUT = path.resolve(here, '../out');
fs.mkdirSync(OUT, { recursive: true });

/* canonical (DE published set — the technical baseline) */
const load = f => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data', f), 'utf8')).items;
const canonical = [...load('products.json'), ...load('products-commercial.json')];
const records = canonical.map(p => ({
  id: String(p.bafa_id),
  manufacturer: p.manufacturer, manufacturer_short: p.manufacturer_short ?? null,
  model: p.model, type: p.type,
  kw35: p.power_35C_kw ?? p.power_design_35C_kw ?? null,
  kw55: p.power_55C_kw ?? p.power_design_55C_kw ?? null,
  ratedKw: ratedCapacityKw(p), segment: segmentOf(p),
  refrigerant: p.refrigerant ?? null,
  eprel: p.eprel_registration_number != null ? String(p.eprel_registration_number) : null,
  compactModel: compact(p.model ?? ''),
  keys: [...identityKeys(p.model ?? ''),
    ...identityKeys(p.outdoor_unit_model ?? ''), ...identityKeys(p.idu_model ?? '')],
}));
const byKey = {};
for (const r of records) for (const k of r.keys) (byKey[k] ??= []).push(r.id);
fs.writeFileSync(path.join(OUT, 'canonical-index.json'), JSON.stringify({ records, byKey }));
console.log('canonical:', records.length, 'records |', Object.keys(byKey).length, 'identity keys');

/* EPREL (local 2026-07 snapshot) — identity keys + spec values incl. noise */
const dir = path.join(ROOT, 'data_sources/eprel_raw/raw/2026-07/spaceheaters-heatpump');
const eprel = {};
const eByKey = {};
let n = 0;
for (const f of fs.readdirSync(dir).filter(x => /^page-\d+\.json$/.test(x))) {
  for (const h of JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).hits ?? []) {
    n++;
    const rn = String(h.eprelRegistrationNumber);
    eprel[rn] = {
      supplier: h.supplierOrTrademark ?? '', model: h.modelIdentifier ?? '',
      etas35: h.seasonalSpaceHeatingEnergyEfficiencyAverage35 ?? h.seasonalSpaceHeatingEnergyEfficiencyAverage ?? null,
      etas55: h.seasonalSpaceHeatingEnergyEfficiencyAverage55 ?? h.mediumTempSeasonalSpaceHeatingEnergyEfficiencyAverage ?? null,
      kw35: h.ratedHeatOutputAverage35 ?? h.ratedHeatOutput ?? null,
      kw55: h.ratedHeatOutputAverage55 ?? h.mediumTempRatedHeatOutputAverage ?? null,
      noiseIn: h.noise ?? null, noiseOut: h.outdoorNoise ?? null,
      onMarketEnd: Array.isArray(h.onMarketEndDate) ? h.onMarketEndDate[0] : null,
    };
    const km = compact(h.modelIdentifier ?? '');
    if (km) (eByKey[km] ??= []).push(rn);
    for (const k of identityKeys(h.modelIdentifier ?? '')) (eByKey[k] ??= []).push(rn);
  }
}
fs.writeFileSync(path.join(OUT, 'eprel-index.json'), JSON.stringify({ eprel, eByKey }));
console.log('eprel:', n, 'records |', Object.keys(eprel).length, 'unique ids |', Object.keys(eByKey).length, 'keys');
