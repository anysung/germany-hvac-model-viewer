#!/usr/bin/env node
/**
 * export-news-public.mjs — snapshot the published news archive to committed
 * JSON, so the public news pages can be generated WITHOUT the build touching
 * the network.
 *
 * WHY A SNAPSHOT AND NOT A DIRECT READ
 * If `vite build` read Firestore, a credential expiry or a network blip would
 * become a BUILD FAILURE — i.e. we could not ship a fix or a data update when
 * we most need to. Reading a committed file has no failure mode. The snapshot
 * is also the review point: whatever lands in git is exactly what goes public,
 * and a bad article can be removed from the file instead of scrambling to
 * unpublish a live page.
 *
 * SCOPE: articles only (title / summary / body / date / category / sources).
 * No product data — the protected-database posture is untouched.
 *
 * Run after the monthly news cycle (docs/UPDATE_PIPELINE.md):
 *   node scripts/export-news-public.mjs           # all markets
 *   node scripts/export-news-public.mjs PL        # one market
 * then rebuild + deploy the affected sites.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'data_sources', 'news_public');
const PROJECT = 'gen-lang-client-0324244302';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

/** Market → the language suffix its stored translations use ('' = the English
 *  original is already the market language). */
const MARKETS = {
  DE: { suffix: '_de' },
  GB: { suffix: '' },
  FR: { suffix: '_fr' },
  PL: { suffix: '_pl' },
  IT: { suffix: '_it' },
};

const only = (process.argv[2] || '').toUpperCase();
const codes = only ? [only] : Object.keys(MARKETS);

const token = execFileSync('gcloud', ['auth', 'print-access-token'], { encoding: 'utf8' }).trim();
const val = (f) => (f ? Object.values(f)[0] : undefined);

mkdirSync(OUT_DIR, { recursive: true });

for (const cc of codes) {
  const cfg = MARKETS[cc];
  if (!cfg) { console.error(`unknown market ${cc}`); continue; }

  const res = await fetch(`${BASE}/countries/${cc}/news?pageSize=300`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) { console.error(`${cc}: fetch failed ${res.status} — snapshot left unchanged`); continue; }
  const docs = (await res.json()).documents ?? [];

  const pick = (f, key) => val(f[`${key}${cfg.suffix}`]) ?? val(f[key]) ?? '';

  const items = docs.map((d) => {
    const f = d.fields ?? {};
    return {
      id: val(f.id) ?? d.name.split('/').pop(),
      date: val(f.date) ?? '',
      category: val(f.category) ?? 'MARKET',
      title: pick(f, 'title'),
      summary: pick(f, 'summary'),
      body: pick(f, 'body'),
      imageUrl: val(f.imageUrl) ?? '',
      author: val(f.author) ?? 'HeatPump DataBase (Europe)',
      sources: (f.sources?.arrayValue?.values ?? [])
        .map((s) => ({
          title: val(s.mapValue?.fields?.title) ?? '',
          url: val(s.mapValue?.fields?.url) ?? '',
        }))
        .filter((s) => s.url),
    };
  })
    // A page needs real text; anything thin is left out rather than published
    // as a stub (thin pages are what gets a section deindexed).
    .filter((a) => a.title && a.body && a.body.length >= 600)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));

  const file = join(OUT_DIR, `${cc}.json`);
  const prev = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { items: [] };
  if (!items.length) {
    console.error(`${cc}: 0 usable articles — keeping the previous snapshot (${prev.items.length})`);
    continue;
  }
  writeFileSync(file, JSON.stringify({ market: cc, generatedAt: new Date().toISOString(), items }, null, 2) + '\n');
  const chars = items.reduce((n, a) => n + a.body.length, 0);
  console.log(`${cc}: ${items.length} articles (${chars.toLocaleString()} chars) → data_sources/news_public/${cc}.json`);
}
