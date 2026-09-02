#!/usr/bin/env node
/**
 * enrich-install-videos.mjs — upload year + REAL caption tracks per video.
 *
 * Two honesty duties the store cannot meet from oEmbed alone:
 *   - the refrigerant transition makes a video's AGE part of its meaning, so
 *     the upload year must sit on the card (an R410A-era install shown as
 *     current practice is a disservice);
 *   - "English with subtitles" is only claimable for CREATOR-PROVIDED tracks.
 *     The watch page lists caption tracks with kind:"asr" marking YouTube's
 *     auto-generated ones — everything else is a real track. Auto-translate
 *     is NEVER surfaced as subtitle support (house rule).
 *
 * Writes per entry: uploadYear (number|null), captions (creator-track
 * language codes, [] when none). Run at sourcing time; the monthly health
 * check does availability, this does meaning.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const STORE = join(ROOT, 'data_sources/install_videos/videos.json');
const data = JSON.parse(readFileSync(STORE, 'utf8'));

let enriched = 0, failed = 0;
for (const [market, list] of Object.entries(data.markets)) {
  for (const v of list) {
    try {
      const res = await fetch(`https://www.youtube.com/watch?v=${v.videoId}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh) AppleWebKit/537.36', 'Accept-Language': 'en' },
        signal: AbortSignal.timeout(20000),
      });
      const html = await res.text();

      const up = /"uploadDate":"(\d{4})-\d{2}-\d{2}/.exec(html)
        ?? /itemprop="uploadDate" content="(\d{4})-/.exec(html);
      if (up) v.uploadYear = Number(up[1]);

      // Creator tracks only: strip every track marked kind:"asr".
      const seg = /"captionTracks":(\[.*?\])/.exec(html);
      if (seg) {
        try {
          const tracks = JSON.parse(seg[1]);
          v.captions = [...new Set(tracks
            .filter((tr) => tr.kind !== 'asr')
            .map((tr) => String(tr.languageCode).slice(0, 2)))];
        } catch { /* keep whatever we had */ }
      } else if (html.includes('"playerCaptionsTracklistRenderer"') || html.includes('ytInitialPlayerResponse')) {
        v.captions = v.captions ?? [];
      }
      enriched++;
      console.log(`  [${market}] ${v.videoId}  year=${v.uploadYear ?? '?'}  cc=[${(v.captions ?? []).join(',')}]  ${v.title.slice(0, 50)}`);
    } catch (e) {
      failed++;
      console.warn(`  [${market}] ${v.videoId}  enrich failed: ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, 700));   // politeness
  }
}

writeFileSync(STORE, JSON.stringify(data, null, 2) + '\n');
console.log(`\nenriched ${enriched}, failed ${failed}`);
