// Feasibility-test prep: EPREL-number → identity/spec index from the LOCAL
// EPREL 2026-07 heat-pump snapshot (complete, 457 pages). No network access.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { identityKeys, compact } from '../../../scripts/ofgem/pel-match-lib.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.resolve(here, '../../../data_sources/eprel_raw/raw/2026-07/spaceheaters-heatpump');
const outDir = path.resolve(here, '../out');
fs.mkdirSync(outDir, { recursive: true });

const index = {};   // eprelRegistrationNumber -> record
let total = 0;
for (const f of fs.readdirSync(dir).filter(x => /^page-\d+\.json$/.test(x))) {
  const { hits } = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  for (const h of hits) {
    total++;
    const rn = String(h.eprelRegistrationNumber);
    index[rn] = {
      supplier: h.supplierOrTrademark ?? null,
      supplierKey: compact(h.supplierOrTrademark ?? ''),
      model: h.modelIdentifier ?? null,
      keys: identityKeys(h.modelIdentifier ?? ''),
      status: h.status ?? null,
      onMarketStart: h.onMarketStartDate ?? null,
      onMarketEnd: h.onMarketEndDate ?? null,
      // 55 °C ("medium temp") figures are what ZUM primarily gates on
      ratedKw55: h.mediumTempRatedHeatOutputAverage ?? null,
      etas55: h.mediumTempSeasonalSpaceHeatingEnergyEfficiencyWarm
           ?? h.mediumTempSeasonalSpaceHeatingEnergyEfficiencyAverage ?? null,
      ratedKw35: h.ratedHeatOutputAverage ?? null,
      etas35: h.seasonalSpaceHeatingEnergyEfficiencyAverage ?? null,
    };
  }
}

const meta = {
  snapshot: '2026-07',
  totalRecords: total,
  uniqueRegistrationNumbers: Object.keys(index).length,
  generatedAt: new Date().toISOString(),
  source: 'data_sources/eprel_raw/raw/2026-07/spaceheaters-heatpump (local, read-only)',
};
fs.writeFileSync(path.join(outDir, 'eprel-index.json'), JSON.stringify({ meta, index }));
console.log(JSON.stringify(meta, null, 2));
