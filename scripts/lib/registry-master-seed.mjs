/**
 * registry-master-seed — self-accumulating seed for the local-registry layers.
 *
 * WHY THIS EXISTS
 * Poland publishes ZUM-native product records and Italy publishes GSE-native
 * ones: catalogue entries whose ONLY source is the monthly registry snapshot.
 * Both builders read the newest parsed snapshot and nothing else, so anything
 * absent from that one fetch silently disappeared from the published
 * catalogue — the exact failure Germany already suffered on 2026-07-12, when
 * cleaning parsed/raw dropped 289 products (docs/UPDATE_PIPELINE.md). Germany
 * was fixed with a self-accumulating master seed; PL and IT never got one, and
 * an owner review on 2026-08-12 caught that gap.
 *
 * WHAT IT GUARANTEES
 *   1. Nothing ever observed is lost. The seed is the union of every parsed
 *      snapshot on disk AND every previous seed, so a snapshot folder can be
 *      cleaned, a fetch can fail, or a registry can go offline without the
 *      catalogue shrinking.
 *   2. No listing is ever claimed from memory. An entry missing from the
 *      LATEST snapshot is kept with `in_latest: false`; the builders turn that
 *      into "verification required" — never "listed", and never "not listed",
 *      which only a market that owns its registry may say.
 *
 * Newest observation wins for values: a registry may correct a figure, and the
 * most recent reading of a live list is the one to publish.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Snapshot folder names, oldest first. */
export function snapshotIds(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((d) => /^\d{4}-\d{2}$/.test(d)).sort();
}

/**
 * Accumulate one registry's entries across every snapshot and seed on disk.
 *
 * @param {object} o
 * @param {string} o.parsedDir     …/parsed        (contains <YYYY-MM>/<parsedFile>)
 * @param {string} o.seedDir       …/master_seed   (contains <YYYY-MM>/<seedFile>)
 * @param {string} o.parsedFile    e.g. 'zum-normalized.json'
 * @param {string} o.seedFile      e.g. 'zum-master-seed.json'
 * @param {(doc:object)=>object[]} o.entriesOf   pull the entry array out of a parsed doc
 * @param {(e:object)=>string} o.keyOf           stable registry key for an entry
 * @returns {{entries:object[], meta:object}}
 */
export function accumulate({ parsedDir, seedDir, parsedFile, seedFile, entriesOf, keyOf }) {
  const snaps = snapshotIds(parsedDir);
  if (!snaps.length) throw new Error(`no parsed snapshot found in ${parsedDir}`);
  const latest = snaps[snaps.length - 1];

  /** key → { entry, first_seen, last_seen, seen_count, in_latest } */
  const byKey = new Map();

  for (const snap of snaps) {
    const file = join(parsedDir, snap, parsedFile);
    if (!existsSync(file)) continue;
    const doc = JSON.parse(readFileSync(file, 'utf8'));
    for (const e of entriesOf(doc)) {
      const key = keyOf(e);
      if (!key) continue;
      const prev = byKey.get(key);
      byKey.set(key, {
        // Newest wins on values, but never lose a field the newer read omitted.
        entry: prev ? { ...prev.entry, ...e } : e,
        first_seen: prev?.first_seen ?? snap,
        last_seen: snap,
        seen_count: (prev?.seen_count ?? 0) + 1,
        in_latest: snap === latest,
      });
    }
  }

  // Union in every previous seed. A seed may hold entries whose snapshot folder
  // was deleted — that is precisely the case this guards.
  let carriedOver = 0;
  for (const seedSnap of snapshotIds(seedDir)) {
    const file = join(seedDir, seedSnap, seedFile);
    if (!existsSync(file)) continue;
    let prevEntries = [];
    try { prevEntries = JSON.parse(readFileSync(file, 'utf8')).entries ?? []; } catch { continue; }
    for (const e of prevEntries) {
      const key = keyOf(e);
      if (!key || byKey.has(key)) continue;
      const seed = e.seed ?? {};
      byKey.set(key, {
        entry: e,
        first_seen: seed.first_seen ?? seedSnap,
        last_seen: seed.last_seen ?? seedSnap,
        seen_count: seed.seen_count ?? 1,
        in_latest: false,
      });
      carriedOver++;
    }
  }

  const entries = [...byKey.values()].map(({ entry, ...seed }) => {
    const { seed: _drop, ...rest } = entry;
    return { ...rest, seed };
  });

  const inLatest = entries.filter((e) => e.seed.in_latest).length;
  const latestFile = join(parsedDir, latest, parsedFile);
  const latestCount = existsSync(latestFile)
    ? entriesOf(JSON.parse(readFileSync(latestFile, 'utf8'))).length : 0;

  /**
   * Shrink signal for the operator. A latest snapshot far smaller than the
   * accumulated total is far more likely to be a broken fetch than a mass
   * delisting — the seed keeps the products either way, but the run should be
   * looked at before it ships.
   */
  const coverage = entries.length ? inLatest / entries.length : 1;

  return {
    entries,
    meta: {
      latest_snapshot: latest,
      snapshots_on_disk: snaps,
      carried_over_from_seed: carriedOver,
      total_entries: entries.length,
      in_latest: inLatest,
      absent_from_latest: entries.length - inLatest,
      latest_snapshot_entries: latestCount,
      latest_coverage: Number(coverage.toFixed(4)),
      suspect_partial_fetch: entries.length > 0 && coverage < 0.7,
    },
  };
}
