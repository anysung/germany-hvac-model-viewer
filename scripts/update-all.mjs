/**
 * update-all.mjs — the ONE entry point for regular data updates.
 *
 * Encodes the full cross-country pipeline as a dependency graph and runs it
 * in topologically-sorted order, so nobody has to remember that GB and FR
 * derive from the built DE datasets. Adding a country = one PIPELINES entry
 * (with dependsOn) — the execution order is computed, never hand-maintained.
 *
 *   node scripts/update-all.mjs [flags]
 *
 * Flags:
 *   --dry-run          Print the resolved plan and exit (no execution).
 *   --fetch            Also pull fresh source snapshots (BAFA API, Ofgem PEL)
 *                      and run parse/diff. Default: rebuild from what is on disk.
 *   --fetch-eprel      Also re-crawl the EPREL registry (~45k records, slow;
 *                      monthly at most). Runs before the matchers.
 *   --countries=DE,GB  Limit to these pipelines (dependencies are added
 *                      automatically — GB implies DE).
 *   --deploy           After a fully green run: vite-build every edition
 *                      (incl. the admin console) and deploy all hosting
 *                      targets in one atomic firebase call.
 *
 * Design rules (see docs/UPDATE_PIPELINE.md):
 *   - Fail fast: any REQUIRED step failing aborts the run (nothing deploys).
 *   - Matcher/overlay steps are OPTIONAL: a failure logs a warning and the
 *     builders fall back to unenriched output (their own validations still gate).
 *   - Deploy is all-sites-at-once ON PURPOSE: GB/FR derive from DE, so
 *     staggering deploys only creates cross-country inconsistency windows.
 */

import { execSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const has = f => args.includes(f);
const val = f => args.find(a => a.startsWith(f + '='))?.split('=')[1] ?? null;

const DRY = has('--dry-run');
const FETCH = has('--fetch');
const FETCH_EPREL = has('--fetch-eprel');
const DEPLOY = has('--deploy');
// Delisted preservation means catalogue counts must never shrink. A shrink is
// treated as a pipeline regression unless explicitly acknowledged.
const ALLOW_SHRINK = has('--allow-shrink');

// Live datasets moved to the auth-protected Storage bucket (anti-scraping,
// 2026-07-12) — the shrink guard reads them with the operator's gcloud
// credentials. Served copies carry ONE canary record per file
// (scripts/upload-datasets.mjs), which the guard subtracts before comparing.
const LIVE_GCS = {
  'public/data/products.json':               'gs://heatpumpdb-datasets/datasets/DE/products.json',
  'public/data/products-commercial.json':    'gs://heatpumpdb-datasets/datasets/DE/products-commercial.json',
  'public/data/products-gb.json':            'gs://heatpumpdb-datasets/datasets/GB/products-gb.json',
  'public/data/products-commercial-gb.json': 'gs://heatpumpdb-datasets/datasets/GB/products-commercial-gb.json',
  'public/data/products-fr.json':            'gs://heatpumpdb-datasets/datasets/FR/products-fr.json',
  'public/data/products-commercial-fr.json': 'gs://heatpumpdb-datasets/datasets/FR/products-commercial-fr.json',
  'public/data/products-pl.json':            'gs://heatpumpdb-datasets/datasets/PL/products-pl.json',
  'public/data/products-commercial-pl.json': 'gs://heatpumpdb-datasets/datasets/PL/products-commercial-pl.json',
  'public/data/products-it.json':            'gs://heatpumpdb-datasets/datasets/IT/products-it.json',
  'public/data/products-commercial-it.json': 'gs://heatpumpdb-datasets/datasets/IT/products-commercial-it.json',
};
const CANARIES_PER_FILE = 1;

/* ── Pipeline registry ──────────────────────────────────────────────────────
   step: { name, cmd, when?: 'fetch'|'always', optional?: true }
   To onboard a country: add an entry here + countryProfiles + vite stats map
   + a hosting target. dependsOn drives the execution order automatically.  */
const PIPELINES = {
  EPREL: {
    dependsOn: [],
    enabled: FETCH_EPREL,
    steps: [
      { name: 'fetch EPREL registry (full crawl)', cmd: 'node scripts/eprel/fetch-eprel-raw.mjs --full' },
    ],
  },
  DE: {
    dependsOn: ['EPREL'],
    steps: [
      { name: 'fetch BAFA raw', cmd: 'node scripts/bafa/fetch-bafa-raw.mjs --fetch', when: 'fetch' },
      { name: 'parse BAFA raw', cmd: 'node scripts/bafa/parse-bafa-raw.mjs', when: 'fetch' },
      { name: 'build master seed', cmd: 'node scripts/bafa/build-master-seed.mjs' },
      { name: 'match BAFA ↔ EPREL (link only)', cmd: 'node scripts/bafa/match-bafa-to-eprel.mjs', optional: true },
      { name: 'build DE app datasets', cmd: 'node scripts/bafa/build-app-products-from-master-seed.mjs' },
    ],
    requires: [
      'scraper/pricing/output/dataset-enriched-full.json',
      'data_sources/bafa/idu_odu_mapping',
      'scraper/pricing/manufacturer-short-names.json',
    ],
    datasets: ['public/data/products.json', 'public/data/products-commercial.json'],
  },
  GB: {
    dependsOn: ['DE'],
    steps: [
      { name: 'fetch Ofgem PEL xlsx', cmd: 'node scripts/ofgem/fetch-pel-xlsx.mjs --download', when: 'fetch' },
      { name: 'parse Ofgem PEL', cmd: 'node scripts/ofgem/parse-pel-xlsx.mjs', when: 'fetch' },
      // Direction: CANONICAL → PEL. The PEL is a listing overlay, never a product
      // source (docs/CANONICAL_TECHNICAL_BASELINE_AND_LOCAL_MARKET_OVERLAY.md).
      // The old PEL-first matchers (match-pel-to-bafa / -to-eprel / -recovery) are
      // no longer part of the production path; they survive as internal audit tools.
      { name: 'match canonical → Ofgem PEL (listing overlay)', cmd: 'node scripts/ofgem/match-canonical-to-pel.mjs', optional: true },
      { name: 'build GB app datasets', cmd: 'node scripts/ofgem/build-app-products-gb.mjs' },
    ],
    requires: ['data_sources/ofgem_pel/parsed', 'scripts/ofgem/manufacturer-short-names-gb.json'],
    datasets: ['public/data/products-gb.json', 'public/data/products-commercial-gb.json'],
  },
  FR: {
    dependsOn: ['DE'],
    steps: [
      // Direction: CANONICAL → ADEME agrément register. The register is a listing
      // overlay, never a product source (same rule as the Ofgem PEL and ZUM).
      // Only the ADEME×EPREL join may add records, and only for register entries
      // the canonical baseline does not have.
      { name: 'fetch ADEME agrément register', cmd: 'node scripts/fr/fetch-ademe.mjs', when: 'fetch' },
      // The register prints no heat-source type and no refrigerant; both are
      // recovered from its own public search facets. Must follow the fetch and
      // precede everything that reads a record as a specification.
      { name: 'recover ADEME facets (type / refrigerant / usage)', cmd: 'node scripts/fr/enrich-agrement-facets.mjs', when: 'fetch' },
      // Joins the register to EPREL: the performance half of the FR-native layer,
      // and the evidence the listing matcher's eprel_bridge stage depends on — so
      // it runs BEFORE the matcher, not after it as it did on the first day.
      { name: 'join ADEME register → EPREL', cmd: 'node scripts/fr/enrich-agrement-from-eprel.mjs', optional: true },
      { name: 'match canonical → ADEME agrément (listing overlay)', cmd: 'node scripts/fr/match-canonical-to-agrement.mjs', optional: true },
      { name: 'build FR app datasets (DE-derived + FR native layer)', cmd: 'node scripts/fr/build-app-products-fr.mjs' },
    ],
    requires: [],
    datasets: ['public/data/products-fr.json', 'public/data/products-commercial-fr.json'],
  },
  PL: {
    dependsOn: ['DE'],
    steps: [
      // Direction: CANONICAL → ZUM. Lista ZUM is a listing overlay, never a
      // product source (same rule as the Ofgem PEL).
      { name: 'fetch Lista ZUM (grid + details)', cmd: 'node scripts/pl/fetch-zum.mjs', when: 'fetch' },
      { name: 'parse Lista ZUM', cmd: 'node scripts/pl/parse-zum.mjs', when: 'fetch' },
      // Accumulate BEFORE the build: the PL extension records are published from
      // the seed, so a partial fetch must never shrink the catalogue (2026-08-12).
      { name: 'accumulate ZUM master seed', cmd: 'node scripts/pl/build-zum-master-seed.mjs' },
      { name: 'match canonical → Lista ZUM (listing overlay)', cmd: 'node scripts/pl/match-canonical-to-zum.mjs', optional: true },
      { name: 'build PL app datasets', cmd: 'node scripts/pl/build-app-products-pl.mjs' },
    ],
    requires: [],
    datasets: ['public/data/products-pl.json', 'public/data/products-commercial-pl.json'],
  },
  IT: {
    dependsOn: ['DE'],
    steps: [
      // Direction: CANONICAL → GSE. The Conto Termico catalogue is a listing
      // overlay, never a product source (same rule as the Ofgem PEL).
      { name: 'fetch GSE Conto Termico catalogues', cmd: 'node scripts/it/fetch-gse.mjs', when: 'fetch' },
      { name: 'parse GSE catalogues', cmd: 'node scripts/it/parse-gse.mjs', when: 'fetch' },
      { name: 'accumulate GSE master seed', cmd: 'node scripts/it/build-gse-master-seed.mjs' },
      { name: 'match canonical → GSE catalogue (listing overlay)', cmd: 'node scripts/it/match-canonical-to-gse.mjs', optional: true },
      { name: 'build IT app datasets', cmd: 'node scripts/it/build-app-products-it.mjs' },
    ],
    requires: [],
    datasets: ['public/data/products-it.json', 'public/data/products-commercial-it.json'],
  },
};

/* ── Resolve selection + topological order (Kahn) ─────────────────────────── */

const requested = (val('--countries')?.split(',').map(s => s.trim().toUpperCase()))
  ?? Object.keys(PIPELINES).filter(k => PIPELINES[k].enabled !== false);

// Pull in dependencies transitively (GB implies DE, DE implies EPREL-if-enabled).
const selected = new Set();
const addWithDeps = code => {
  if (selected.has(code) || !PIPELINES[code]) return;
  for (const d of PIPELINES[code].dependsOn) if (PIPELINES[d]?.enabled !== false || requested.includes(d)) addWithDeps(d);
  selected.add(code);
};
requested.forEach(addWithDeps);

const order = [];
const pending = new Set(selected);
while (pending.size) {
  const ready = [...pending].filter(c => PIPELINES[c].dependsOn.every(d => !pending.has(d)));
  if (!ready.length) { console.error('Dependency cycle in PIPELINES:', [...pending].join(',')); process.exit(1); }
  ready.sort().forEach(c => { order.push(c); pending.delete(c); });
}

/* ── Plan ─────────────────────────────────────────────────────────────────── */

const plan = [];
for (const code of order) {
  for (const step of PIPELINES[code].steps) {
    if (step.when === 'fetch' && !FETCH) continue;
    plan.push({ code, ...step });
  }
}

console.log('════ HeatPump DB — regular update ════');
console.log(`pipelines: ${order.join(' → ')}   (fetch=${FETCH}, eprel=${FETCH_EPREL}, deploy=${DEPLOY})`);
plan.forEach((s, i) => console.log(`  ${String(i + 1).padStart(2)}. [${s.code}] ${s.name}${s.optional ? ' (optional)' : ''}`));
if (DEPLOY) console.log('  →  vite build de/uk/fr/admin + firebase deploy (all named targets, one call)');
if (DRY) process.exit(0);

/* ── Preflight ────────────────────────────────────────────────────────────── */

let preflightFail = false;
for (const code of order) {
  for (const req of PIPELINES[code].requires ?? []) {
    if (!existsSync(resolve(ROOT, req))) {
      console.error(`PREFLIGHT FAIL [${code}]: missing required input ${req}`);
      preflightFail = true;
    }
  }
}
if (preflightFail) process.exit(1);

/* ── Execute ──────────────────────────────────────────────────────────────── */

const startedAt = new Date();
const results = [];
for (const step of plan) {
  const t0 = Date.now();
  console.log(`\n──── [${step.code}] ${step.name} ────`);
  try {
    execSync(step.cmd, { cwd: ROOT, stdio: 'inherit' });
    results.push({ ...step, ok: true, secs: ((Date.now() - t0) / 1000).toFixed(1) });
  } catch {
    if (step.optional) {
      console.warn(`WARN [${step.code}] optional step failed — builders will run without this overlay.`);
      results.push({ ...step, ok: false, secs: ((Date.now() - t0) / 1000).toFixed(1) });
    } else {
      console.error(`ABORT: required step failed — nothing will be deployed.`);
      process.exit(1);
    }
  }
}

/* ── Post-run verification: every dataset fresh and non-empty ─────────────── */

console.log('\n════ Dataset verification ════');
let verifyFail = false;
for (const code of order) {
  for (const rel of PIPELINES[code].datasets ?? []) {
    const abs = resolve(ROOT, rel);
    if (!existsSync(abs)) { console.error(`FAIL [${code}] ${rel} missing`); verifyFail = true; continue; }
    const d = JSON.parse(readFileSync(abs, 'utf8'));
    const n = d.items?.length ?? 0;
    const gen = d._meta?.generated ?? d._meta?.generated_at ?? null;
    const fresh = gen && new Date(gen) >= startedAt;
    // Commercial FR/DE always >0; GB residential etc. — only require non-empty
    // where the pipeline promises items (commercial GB may legitimately vary).
    const empty = n === 0 && !rel.includes('commercial');
    console.log(`  [${code}] ${rel}: ${n.toLocaleString()} items · generated ${gen ?? '—'} ${fresh ? '(fresh ✓)' : '(STALE ✗)'}`);
    if (empty || !fresh) verifyFail = true;
  }
}
if (verifyFail) { console.error('ABORT: dataset verification failed — nothing will be deployed.'); process.exit(1); }

/* ── Safety gate: the wall between GENERATION and PUBLICATION ─────────────── */
// Everything above only wrote candidate files into public/data. Nothing has
// touched production. The gate re-checks the candidate against the last approved
// manifest (counts, duplicates, segment integrity, local-match collapse,
// source-country leakage) and BLOCKS on anything alarming.
console.log('\n════ Dataset gate ════');
try {
  execSync('node scripts/dataset-gate.mjs', { cwd: ROOT, stdio: 'inherit' });
} catch {
  console.error('\nABORT: the dataset gate blocked this candidate. Production is untouched.');
  console.error('Nothing was uploaded and nothing was deployed.');
  console.error('Fix the cause, or record an override: node scripts/dataset-gate.mjs --override --reason="…"');
  process.exit(1);
}
console.log('\nCandidate is publishable. It has NOT been published:');
console.log('  publish:  node scripts/upload-datasets.mjs  &&  node scripts/dataset-gate.mjs --approve');

/* ── Shrink guard: new counts must be >= currently-live counts ────────────── */

console.log('\n════ Shrink guard (vs live Storage datasets) ════');
for (const code of order) {
  for (const rel of PIPELINES[code].datasets ?? []) {
    const gcs = LIVE_GCS[rel];
    if (!gcs) continue;
    try {
      const raw = execSync(`gcloud storage cat ${gcs}`, { cwd: ROOT, maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
      const liveN = (JSON.parse(raw.toString()).items?.length ?? 0) - CANARIES_PER_FILE;
      const newN = JSON.parse(readFileSync(resolve(ROOT, rel), 'utf8')).items?.length ?? 0;
      const shrink = newN < liveN;
      console.log(`  [${code}] ${rel}: live ${liveN.toLocaleString()} → new ${newN.toLocaleString()} ${shrink ? '(SHRINK ✗)' : '✓'}`);
      if (shrink && !ALLOW_SHRINK) {
        console.error('ABORT: catalogue shrank vs live — delisted preservation forbids this.');
        console.error('If the reduction is intentional (e.g. a policy change), rerun with --allow-shrink.');
        process.exit(1);
      }
    } catch { console.log(`  [${code}] ${rel}: live check failed — skipped`); }
  }
}

/* ── Deploy (opt-in): all editions in one atomic hosting release ──────────── */

if (DEPLOY) {
  console.log('\n════ Upload datasets (auth-protected Storage, + canaries) ════');
  execSync('node scripts/upload-datasets.mjs', { cwd: ROOT, stdio: 'inherit' });

  // Hosting releases are needed even for data-only updates: the landing-page
  // catalogue counts (__MARKET_STATS__) are baked at BUILD time from the
  // dataset files. The release itself is a sequential batch, NOT atomic —
  // a mid-batch failure leaves earlier sites on the new build. That is safe
  // for data (all sites already read the same re-published bucket objects),
  // but the failed sites must be redeployed promptly.
  console.log('\n════ Build & deploy all editions (sequential batch) ════');
  for (const cmd of ['npm run build:de', 'npm run build:uk', 'npm run build:fr', 'npm run build:pl', 'npm run build:it', 'npm run build:admin']) {
    execSync(cmd, { cwd: ROOT, stdio: 'inherit' });
  }
  try {
    execSync('firebase deploy --only hosting:de,hosting:uk,hosting:fr,hosting:pl,hosting:it,hosting:hub', { cwd: ROOT, stdio: 'inherit' });
  } catch {
    console.error('\n✗ HOSTING DEPLOY FAILED OR PARTIAL — datasets are already live (bucket), so');
    console.error('  the sites keep working; finish the release by redeploying the failed targets:');
    console.error('  firebase deploy --only hosting:de,hosting:uk,hosting:fr,hosting:pl,hosting:it,hosting:hub');
    process.exit(1);
  }
}

/* ── Summary ──────────────────────────────────────────────────────────────── */

console.log('\n════ Summary ════');
for (const r of results) console.log(`  ${r.ok ? '✓' : '✗ (optional)'} [${r.code}] ${r.name} — ${r.secs}s`);
console.log(DEPLOY ? '  ✓ deployed: de, uk, fr, pl, it, hub' : '  (no deploy — run with --deploy to ship)');

// The update is NOT DONE until the baseline is approved and pushed — a
// forgotten approval desynchronizes next month's gate/shrink checks and the
// rollback docs from what is actually live (2026-07-28 review, finding #3).
if (DEPLOY) {
  console.log('\n════ COMPLETION CHECKLIST — the update is not finished until all boxes are ticked ════');
  console.log('  [ ] serving verification passed above (upload step) and stable-release.json was promoted');
  console.log('  [ ] spot-check one product page per market (DE/UK/FR/PL/IT)');
  console.log('  [ ] node scripts/dataset-gate.mjs --approve');
  console.log('  [ ] git add data_manifests/ && git commit && git push origin main');
  console.log('  [ ] git status --short   → clean');
}
