#!/usr/bin/env node
/**
 * trigger-monthly-news.mjs — run the news/policies function and WAIT for it.
 *
 * The Cloud Scheduler fires this same function and forgets about it, which is
 * fine when news is a thing that happens on its own. Inside the maintenance
 * window it is not: the site build reads the exported news snapshot, so the run
 * has to finish before the build starts. This calls the function directly and
 * blocks until it answers.
 *
 * Ordering is deliberate — news runs AFTER the database it describes (owner's
 * instruction, 2026-08-19). The month's articles talk about the data that has
 * just landed, so writing them first would describe last month's catalogue.
 *
 * AUTH: the function accepts either a Cloud Scheduler header or an x-api-key.
 * We are not the scheduler, so the key is required and comes from the
 * environment — never from a file in the repo.
 *
 *   NEWS_FN_KEY=… node scripts/news/trigger-monthly-news.mjs [--countries DE,FR]
 */
const FN = process.env.NEWS_FN_URL
  ?? 'https://us-central1-gen-lang-client-0324244302.cloudfunctions.net/autoUpdateDatabase';
const KEY = process.env.NEWS_FN_KEY ?? process.env.SECRET_KEY;

if (!KEY) {
  console.error('NEWS_FN_KEY (or SECRET_KEY) is not set — refusing to call the news function.');
  console.error('The maintenance window treats this as non-fatal: the catalogue still ships,');
  console.error('and the month simply carries last month\'s news until the key is supplied.');
  process.exit(1);
}

const i = process.argv.indexOf('--countries');
const countries = i >= 0 ? process.argv[i + 1].split(',').map(s => s.trim().toUpperCase()) : undefined;

const body = { newsOnly: true, ...(countries ? { countries } : {}) };
console.log(`news: calling ${FN} ${countries ? `for ${countries.join(', ')}` : 'for all markets'}`);

const started = Date.now();
const res = await fetch(FN, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-api-key': KEY },
  body: JSON.stringify(body),
});
const text = await res.text();
const secs = Math.round((Date.now() - started) / 1000);

if (!res.ok) {
  console.error(`news: HTTP ${res.status} after ${secs}s — ${text.slice(0, 400)}`);
  process.exit(1);
}
console.log(`news: completed in ${secs}s`);
console.log(text.slice(0, 800));
