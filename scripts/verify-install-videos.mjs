#!/usr/bin/env node
/**
 * verify-install-videos.mjs — monthly health check for the installation-video
 * store (owner, 2026-09-02).
 *
 * Manufacturers reorganize their channels; a video that worked in September is
 * a grey box in November. Every entry is re-checked against YouTube oEmbed:
 * a 200 means the video exists and is embeddable; anything else marks the
 * entry. The check only REPORTS — removal is an editorial decision, so a
 * failing entry gets "unavailableSince" stamped into the store (the page can
 * skip it) and the run prints loudly, but nothing is deleted.
 *
 * Exit code: 0 always when invoked from the window (non-fatal step); pass
 * --strict to exit 1 on failures (CI / manual use).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const STORE = join(ROOT, 'data_sources/install_videos/videos.json');
const STRICT = process.argv.includes('--strict');

const data = JSON.parse(readFileSync(STORE, 'utf8'));
let ok = 0, failed = 0, changed = false;

for (const [market, list] of Object.entries(data.markets)) {
  for (const v of list) {
    const url = 'https://www.youtube.com/oembed?url=' +
      encodeURIComponent(`https://www.youtube.com/watch?v=${v.videoId}`) + '&format=json';
    let good = false;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (res.ok) {
        const d = await res.json();
        good = true;
        // A channel rename is worth noticing (it can mean a re-upload or an
        // ownership change) but is not a failure.
        if (d.author_name && d.author_name !== v.channel) {
          console.warn(`  [${market}] ${v.videoId}: channel now "${d.author_name}" (was "${v.channel}")`);
        }
      }
    } catch { /* network/timeout → treated as unavailable this run */ }

    if (good) {
      ok++;
      if (v.unavailableSince) { delete v.unavailableSince; changed = true; }
    } else {
      failed++;
      console.error(`  [${market}] UNAVAILABLE: ${v.manufacturer} — ${v.title} (${v.videoId})`);
      if (!v.unavailableSince) { v.unavailableSince = new Date().toISOString().slice(0, 10); changed = true; }
    }
    await new Promise(r => setTimeout(r, 300));   // politeness
  }
}

if (changed) {
  data.verifiedAt = new Date().toISOString().slice(0, 10);
  writeFileSync(STORE, JSON.stringify(data, null, 2) + '\n');
}
console.log(`install videos: ${ok} ok, ${failed} unavailable${changed ? ' (store updated)' : ''}`);
process.exit(STRICT && failed ? 1 : 0);
