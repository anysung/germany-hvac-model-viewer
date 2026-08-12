#!/usr/bin/env node
/**
 * build-zum-master-seed.mjs — self-accumulating seed for the Lista ZUM layer.
 *
 * Poland publishes ZUM-native product records (performance_source
 * 'ZUM_REGISTRY'/'ZUM_EPREL'): catalogue entries whose only source is this
 * registry. Before this script the PL builder read the newest parsed snapshot
 * alone, so a failed fetch, a cleaned snapshot folder or a registry outage
 * removed those products from the published catalogue without a word. The seed
 * unions every snapshot AND every previous seed, so nothing observed is ever
 * lost, while `seed.in_latest` keeps the listing claim honest for anything the
 * newest snapshot did not contain.
 *
 * Run:  node scripts/pl/build-zum-master-seed.mjs [--dry-run]
 * In:   data_sources/lista_zum/parsed/<YYYY-MM>/zum-normalized.json  (all of them)
 *       data_sources/lista_zum/master_seed/<YYYY-MM>/zum-master-seed.json (previous)
 * Out:  data_sources/lista_zum/master_seed/<latest>/zum-master-seed.json
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { accumulate } from '../lib/registry-master-seed.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const BASE = join(ROOT, 'data_sources', 'lista_zum');
const DRY = process.argv.includes('--dry-run');

const { entries, meta } = accumulate({
  parsedDir: join(BASE, 'parsed'),
  seedDir: join(BASE, 'master_seed'),
  parsedFile: 'zum-normalized.json',
  seedFile: 'zum-master-seed.json',
  entriesOf: (doc) => doc.entries ?? [],
  keyOf: (e) => e.zum_id,
});

// The parsed snapshot's own meta travels with the seed: the builder stamps
// `source_snapshot_generated_at` from it, and that must stay the date the
// registry was actually read.
const latestParsed = JSON.parse(
  readFileSync(join(BASE, 'parsed', meta.latest_snapshot, 'zum-normalized.json'), 'utf8'));

const doc = {
  meta: {
    ...meta,
    source: latestParsed.meta?.source ?? 'https://lista-zum.ios.edu.pl (Lista ZUM, IOŚ-PIB)',
    latest_snapshot_generated_at: latestParsed.meta?.generated_at ?? null,
    generated_at: new Date().toISOString(),
  },
  entries,
};

console.log(`ZUM master seed (${meta.latest_snapshot}): ${meta.total_entries} entries`
  + ` · in latest ${meta.in_latest} · absent ${meta.absent_from_latest}`
  + ` · carried over from seed ${meta.carried_over_from_seed}`
  + ` · snapshots ${meta.snapshots_on_disk.join(', ')}`);
if (meta.suspect_partial_fetch) {
  console.error(`⚠️  latest snapshot covers only ${(meta.latest_coverage * 100).toFixed(1)}% of the seed`
    + ' — treat as a suspected partial fetch and check the fetch log before shipping.'
    + ' No product is dropped; the uncovered ones publish as "verification required".');
}

if (DRY) { console.log('(dry run — nothing written)'); process.exit(0); }

const outDir = join(BASE, 'master_seed', meta.latest_snapshot);
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'zum-master-seed.json'), JSON.stringify(doc) + '\n');
console.log(`→ ${join('data_sources/lista_zum/master_seed', meta.latest_snapshot, 'zum-master-seed.json')}`);

// Manifest is committed: it is how a cleaned disk still reveals which seeds
// existed and how big they were.
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
