#!/usr/bin/env node
/**
 * registry-seed.unit.mjs — the accumulation guarantee for PL (ZUM) and IT (GSE).
 *
 * These two markets publish products whose ONLY source is a monthly registry
 * snapshot. Before 2026-08-12 their builders read the newest snapshot alone, so
 * a partial fetch or a cleaned snapshot folder deleted products from the
 * published catalogue in silence — the failure Germany already suffered on
 * 2026-07-12 (289 products lost). This test pins the two properties that make
 * that impossible to repeat:
 *
 *   1. nothing observed is ever lost — not when a snapshot shrinks, not when a
 *      snapshot folder is deleted from disk;
 *   2. nothing absent from the newest snapshot is ever reported as still
 *      listed — it is carried with in_latest false, which the builders turn
 *      into "verification required".
 *
 * Run:  node tests/registry-seed.unit.mjs
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { accumulate } from '../scripts/lib/registry-master-seed.mjs';

let pass = 0, fail = 0;
const check = (ok, name, detail = '') => {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
};

const root = mkdtempSync(join(tmpdir(), 'seed-test-'));
const parsedDir = join(root, 'parsed');
const seedDir = join(root, 'master_seed');
const PARSED = 'reg-normalized.json', SEED = 'reg-seed.json';

const writeSnapshot = (id, entries) => {
  mkdirSync(join(parsedDir, id), { recursive: true });
  writeFileSync(join(parsedDir, id, PARSED), JSON.stringify({ meta: { snapshot: id }, entries }));
};
const writeSeed = (id, doc) => {
  mkdirSync(join(seedDir, id), { recursive: true });
  writeFileSync(join(seedDir, id, SEED), JSON.stringify(doc));
};
const run = () => accumulate({
  parsedDir, seedDir, parsedFile: PARSED, seedFile: SEED,
  entriesOf: (d) => d.entries ?? [], keyOf: (e) => e.id,
});

/* ── 1. Union across snapshots, newest values win ───────────────────────── */
writeSnapshot('2026-06', [{ id: 'A', kw: 8 }, { id: 'B', kw: 10 }]);
writeSnapshot('2026-07', [{ id: 'A', kw: 9 }, { id: 'C', kw: 12 }]);
let r = run();
check(r.entries.length === 3, 'every product ever observed is in the seed', `got ${r.entries.length}`);
check(r.entries.find((e) => e.id === 'A').kw === 9, 'the newest reading wins on values');
check(r.entries.find((e) => e.id === 'A').seed.first_seen === '2026-06', 'first_seen is the earliest snapshot');

/* ── 2. Absence from the newest snapshot is marked, never dropped ───────── */
const b = r.entries.find((e) => e.id === 'B');
check(b !== undefined, 'a product missing from the newest snapshot is kept');
check(b.seed.in_latest === false, 'and is flagged as absent from the latest snapshot');
check(r.entries.find((e) => e.id === 'C').seed.in_latest === true, 'a product in the newest snapshot stays in_latest');
check(r.meta.absent_from_latest === 1 && r.meta.in_latest === 2, 'the meta counts match', JSON.stringify(r.meta));

/* ── 3. A partial fetch shrinks nothing ─────────────────────────────────── */
writeSnapshot('2026-08', [{ id: 'A', kw: 9 }]);            // 1 of 3 — a broken fetch
r = run();
check(r.entries.length === 3, 'a 1-of-3 fetch still yields the full catalogue', `got ${r.entries.length}`);
check(r.meta.suspect_partial_fetch === true, 'and the partial fetch is flagged for the operator');
check(r.entries.filter((e) => e.seed.in_latest).length === 1, 'only the re-observed product keeps the listing claim');

/* ── 4. Deleting snapshot folders loses nothing once a seed exists ──────── */
writeSeed('2026-08', r);                                   // seed the state, then clean disk
rmSync(join(parsedDir, '2026-06'), { recursive: true });
rmSync(join(parsedDir, '2026-07'), { recursive: true });
r = run();
check(r.entries.length === 3, 'products survive the deletion of their snapshot folders', `got ${r.entries.length}`);
check(r.meta.carried_over_from_seed === 2, 'and are reported as carried over from the seed', `got ${r.meta.carried_over_from_seed}`);
check(r.entries.find((e) => e.id === 'B').seed.in_latest === false, 'carried-over products never claim to be listed');

/* ── 5. A recovered registry restores the claim ─────────────────────────── */
writeSnapshot('2026-09', [{ id: 'A', kw: 9 }, { id: 'B', kw: 10 }, { id: 'C', kw: 12 }]);
r = run();
check(r.entries.filter((e) => e.seed.in_latest).length === 3, 'a full fetch re-confirms every product');
check(r.meta.suspect_partial_fetch === false, 'and the partial-fetch flag clears');

rmSync(root, { recursive: true, force: true });
console.log(`\nregistry seed: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
