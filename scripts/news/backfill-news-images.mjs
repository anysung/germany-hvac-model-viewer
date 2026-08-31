/**
 * backfill-news-images.mjs — one-time (re-runnable) reassignment of EVERY news
 * article's imageUrl to the curated local pool at /news-images/ (2026-07-19
 * press-format redesign). Replaces legacy Unsplash URLs and generated SVG
 * data-URIs alike.
 *
 * Assignment rules — identical to google_cloud_function/index.js (the mirror
 * lives there because the function deploys as a standalone file; keep both in
 * sync):
 *   - subject = article category field + keyword nudges (EU-policy / energy);
 *   - POLICY → the market's own <cc>-policy-* set (images carry that country's
 *     flag — never cross markets); EU-level policy → eu-policy-* rotation;
 *   - non-policy → COMMON pools by subject;
 *   - within one (market, month) no file twice; rotation walks the pool via a
 *     running per-pool counter so consecutive months don't restart at file 01;
 *   - every article gets an image (exhausted pool → least-used this month).
 *
 * Transport: Firestore REST with a gcloud access token — no npm deps.
 *   node scripts/news/backfill-news-images.mjs --dry-run   (print plan only)
 *   node scripts/news/backfill-news-images.mjs             (apply)
 */
import { execFileSync } from 'node:child_process';

const PROJECT = 'gen-lang-client-0324244302';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const MARKETS = ['DE', 'GB', 'FR', 'PL', 'IT'];
const DRY = process.argv.includes('--dry-run');

const TOKEN = execFileSync('gcloud', ['auth', 'print-access-token'], { encoding: 'utf8' }).trim();
const authed = { Authorization: `Bearer ${TOKEN}`, 'x-goog-user-project': PROJECT };

/* ── pools + classification (mirror of google_cloud_function/index.js) ────── */
const NEWS_IMAGE_POOLS = {
  policy: {
    DE: ['de-policy-01.webp', 'de-policy-02.webp', 'de-policy-03.webp'],
    GB: ['uk-policy-01.webp', 'uk-policy-02.webp', 'uk-policy-03.webp'],
    FR: ['fr-policy-01.webp', 'fr-policy-02.webp', 'fr-policy-03.webp', 'fr-policy-04.webp'],
    PL: ['pl-policy-01.webp', 'pl-policy-02.webp', 'pl-policy-03.webp'],
    IT: ['it-policy-01.webp', 'it-policy-02.webp', 'it-policy-03.webp'],
    EU: ['eu-policy-01.webp', 'eu-policy-02.webp', 'eu-policy-03.webp'],
  },
  install: ['common-install-01.webp', 'common-install-02.webp', 'common-install-03.webp', 'common-install-04.webp', 'common-install-05.webp'],
  market: ['common-market-01.webp', 'common-market-02-factory-layoff.webp', 'common-market-03.webp', 'common-market-04.webp', 'common-market-05.webp', 'common-market-06.webp'],
  tech: ['common-tech-01.webp', 'common-tech-02.webp', 'common-tech-03.webp', 'common-tech-04.webp', 'common-tech-05.webp', 'common-tech-06.webp'],
  energy: ['common-energy-01.webp', 'common-energy-02.webp', 'common-energy-03.webp', 'common-energy-04.webp', 'common-energy-05.webp'],
};
const NATIONAL_POLICY_KEYWORDS = ['bafa', 'beg', 'kfw', 'geg', 'bundes',
  'boiler upgrade', 'bus grant', 'mcs', 'clean heat market', 'future homes', 'ofgem',
  'maprimerénov', 'maprimerenov', 'coup de pouce', 'cee', 'anah', 'france rénov',
  'czyste powietrze', 'moje ciepło', 'cieple mieszkanie', 'ciepłe mieszkanie', 'lista zum', 'nfośigw', 'nfosigw',
  'conto termico', 'gse', 'ecobonus', 'detrazion', 'agenzia delle entrate', 'enea'];
const EU_POLICY_KEYWORDS = ['epbd', 'european commission', 'eu directive', 'eu-richtlinie',
  'direttiva', 'dyrektywa', 'brussels', 'bruxelles', 'case green', 'european union',
  'f-gas', 'ecodesign', 'red iii', 'fit for 55'];
const ENERGY_KEYWORDS = ['district heating', 'fernwärme', 'waste heat', 'data center',
  'data centre', 'industrial heat', 'solar', 'photovoltaic', 'battery', 'grid',
  'decarbon', 'carbon', 'geothermal'];

function newsImageCategory(category = 'MARKET', title = '', summary = '') {
  const text = `${title} ${summary}`.toLowerCase();
  if (category === 'FUNDING') {
    if (NATIONAL_POLICY_KEYWORDS.some(k => text.includes(k))) return 'policy';
    return EU_POLICY_KEYWORDS.some(k => text.includes(k)) ? 'eu-policy' : 'policy';
  }
  if (category === 'INSTALLER INSIGHT') return 'install';
  if (category === 'TECHNOLOGY') return ENERGY_KEYWORDS.some(k => text.includes(k)) ? 'energy' : 'tech';
  return ENERGY_KEYWORDS.some(k => text.includes(k)) ? 'energy' : 'market';
}
const poolFor = (cc, cat) =>
  cat === 'eu-policy' ? NEWS_IMAGE_POOLS.policy.EU
    : cat === 'policy' ? (NEWS_IMAGE_POOLS.policy[cc] ?? NEWS_IMAGE_POOLS.market)
      : (NEWS_IMAGE_POOLS[cat] ?? NEWS_IMAGE_POOLS.market);

/** Images whose subject is only appropriate for specific story angles: the
 *  file is SKIPPED in rotation unless the article text matches its keywords
 *  (2026-07-19: the factory-layoff photo appeared on a routine DE market
 *  article — a layoff image belongs only on job-loss/decline stories). */
const CONDITIONAL_IMAGES = {
  'common-market-02-factory-layoff.webp': ['layoff', 'lay-off', 'job cut', 'job loss', 'jobs lost',
    'redundan', 'stellenabbau', 'arbeitsplatzabbau', 'entlassung', 'kurzarbeit',
    'licenzia', 'esuber', 'zwolnien', 'licenciement', 'suppression d', 'downturn', 'slump', 'insolven'],
};
function chooseNewsImage(pool, usedThisMonth, rotationOffset, articleText = '') {
  const eligible = pool.filter(f => !CONDITIONAL_IMAGES[f]
    || CONDITIONAL_IMAGES[f].some(k => articleText.includes(k)));
  pool = eligible.length ? eligible : pool;
  for (let i = 0; i < pool.length; i++) {
    const f = pool[(rotationOffset + i) % pool.length];
    if (!usedThisMonth.includes(f)) return f;
  }
  const counts = pool.map(f => [f, usedThisMonth.filter(u => u === f).length]);
  counts.sort((a, b) => a[1] - b[1]);
  return counts[0][0];
}

/* ── REST helpers ─────────────────────────────────────────────────────────── */
async function listDocs(cc) {
  const out = [];
  let pageToken = '';
  do {
    const url = `${BASE}/countries/${cc}/news?pageSize=300${pageToken ? `&pageToken=${pageToken}` : ''}`;
    const res = await fetch(url, { headers: authed });
    const j = await res.json();
    if (j.error) throw new Error(`${cc}: ${j.error.message}`);
    out.push(...(j.documents ?? []));
    pageToken = j.nextPageToken ?? '';
  } while (pageToken);
  return out;
}
const sv = (doc, f) => doc.fields?.[f]?.stringValue ?? '';

async function patchImage(docName, imageUrl) {
  const res = await fetch(`https://firestore.googleapis.com/v1/${docName}?updateMask.fieldPaths=imageUrl`, {
    method: 'PATCH',
    headers: { ...authed, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { imageUrl: { stringValue: imageUrl } } }),
  });
  if (!res.ok) throw new Error(`PATCH ${docName}: ${res.status} ${await res.text()}`);
}

/* ── Run ─────────────────────────────────────────────────────────────────── */
for (const cc of MARKETS) {
  const docs = await listDocs(cc);
  // Chronological by id (news-YYYYMMDD-cc-NNN sorts correctly).
  docs.sort((a, b) => a.name.split('/').pop().localeCompare(b.name.split('/').pop()));
  const rotation = {};              // pool identity -> running counter (across months)
  let month = '', usedThisMonth = [];
  let changed = 0;
  for (const d of docs) {
    const id = d.name.split('/').pop();

    // Articles whose picture IS the point — the Special Report covers — opt out
    // of the rotation. Without this, the next run would quietly swap a report
    // cover for a stock pool image and nobody would notice until a share
    // preview looked wrong.
    if (d.fields?.imagePinned?.booleanValue === true) {
      console.log(`[${cc}] ${id} ${'—'.padEnd(17)} → pinned    ${sv(d, 'imageUrl')} (kept)`);
      continue;
    }

    const m = (id.match(/^news-(\d{6})/) ?? [])[1] ?? sv(d, 'date').slice(0, 7).replace('-', '') ?? 'unknown';
    if (m !== month) { month = m; usedThisMonth = []; }
    const cat = newsImageCategory(sv(d, 'category'), sv(d, 'title'), sv(d, 'summary'));
    const pool = poolFor(cc, cat);
    const poolKey = pool[0];
    const file = chooseNewsImage(pool, usedThisMonth, (rotation[poolKey] ?? 0) % pool.length,
      `${sv(d, 'title')} ${sv(d, 'summary')}`.toLowerCase());
    rotation[poolKey] = (rotation[poolKey] ?? 0) + 1;
    usedThisMonth.push(file);
    const target = `/news-images/${file}`;
    const current = sv(d, 'imageUrl');
    const mark = current === target ? '=' : 'Δ';
    console.log(`[${cc}] ${id} ${sv(d, 'category').padEnd(17)} → ${cat.padEnd(9)} ${file} ${mark}`);
    if (current !== target) {
      changed++;
      if (!DRY) await patchImage(d.name, target);
    }
  }
  console.log(`[${cc}] ${docs.length} articles, ${changed} ${DRY ? 'would change' : 'updated'}\n`);
}
console.log(DRY ? 'DRY RUN — nothing written.' : 'Backfill complete.');
