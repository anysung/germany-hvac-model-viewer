#!/usr/bin/env node
/**
 * build-gse-master-seed.mjs — self-accumulating seed for the GSE Conto Termico layer.
 *
 * Italy publishes GSE-native product records (performance_source
 * 'GSE_CATALOGUE'): catalogue entries whose only source is the GSE PDF
 * catalogue. Reading a single parsed snapshot meant one failed fetch, one
 * withdrawn PDF or one cleaned snapshot folder removed those products from the
 * published catalogue without a trace — the 2026-07-12 German regression,
 * which IT had no guard against until 2026-08-12. The seed unions every
 * snapshot and every previous seed; `seed.in_latest` keeps the listing claim
 * honest for anything the newest catalogue did not contain.
 *
 * Note on the key: the GSE catalogue publishes no per-row id, so
 * `gse_entry_key` is OUR deterministic key (history and integrity only, never
 * shown as an official id) — which is exactly what makes it usable here.
 *
 * Run:  node scripts/it/build-gse-master-seed.mjs [--dry-run]
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { accumulate } from '../lib/registry-master-seed.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const BASE = join(ROOT, 'data_sources', 'gse_ct');
const DRY = process.argv.includes('--dry-run');

const { entries, meta } = accumulate({
  parsedDir: join(BASE, 'parsed'),
  seedDir: join(BASE, 'master_seed'),
  parsedFile: 'gse-normalized.json',
  seedFile: 'gse-master-seed.json',
  entriesOf: (doc) => doc.entries ?? [],
  keyOf: (e) => e.gse_entry_key,
});

const latestParsed = JSON.parse(
  readFileSync(join(BASE, 'parsed', meta.latest_snapshot, 'gse-normalized.json'), 'utf8'));

const doc = {
  meta: {
    ...meta,
    source: latestParsed.meta?.source ?? 'GSE Conto Termico catalogues III.A / III.B / III.E',
    latest_snapshot_fetched_at: latestParsed.meta?.fetched_at ?? null,
    generated_at: new Date().toISOString(),
  },
  entries,
};

console.log(`GSE master seed (${meta.latest_snapshot}): ${meta.total_entries} entries`
  + ` · in latest ${meta.in_latest} · absent ${meta.absent_from_latest}`
  + ` · carried over from seed ${meta.carried_over_from_seed}`
  + ` · snapshots ${meta.snapshots_on_disk.join(', ')}`);
if (meta.suspect_partial_fetch) {
  console.error(`⚠️  latest catalogue covers only ${(meta.latest_coverage * 100).toFixed(1)}% of the seed`
    + ' — treat as a suspected partial parse and check the PDF fetch before shipping.'
    + ' No product is dropped; the uncovered ones publish as "verification required".');
}

if (DRY) { console.log('(dry run — nothing written)'); process.exit(0); }

const outDir = join(BASE, 'master_seed', meta.latest_snapshot);
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'gse-master-seed.json'), JSON.stringify(doc) + '\n');
console.log(`→ ${join('data_sources/gse_ct/master_seed', meta.latest_snapshot, 'gse-master-seed.json')}`);

const manifestFile = join(BASE, 'manifest.json');
if (existsSync(manifestFile)) {
  const man = JSON.parse(readFileSync(manifestFile, 'utf8'));
  man.known_master_seeds = {
    ...(man.known_master_seeds ?? {}),
    [meta.latest_snapshot]: {
      total_entries: meta.total_entries,
      in_latest: meta.in_latest,
      absent_from_latest: meta.absent_from_latest,
      snapshots_covered: meta.snapshots_on_disk,
      generated_at: doc.meta.generated_at,
    },
  };
  writeFileSync(manifestFile, JSON.stringify(man, null, 2) + '\n');
  console.log('   manifest.json · known_master_seeds updated');
}
