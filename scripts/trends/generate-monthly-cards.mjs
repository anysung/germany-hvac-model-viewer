#!/usr/bin/env node
/**
 * generate-monthly-cards.mjs — one Market & Trends card per market, from the
 * month's own news (owner, 2026-09-02).
 *
 * WHY THIS EXISTS
 * The trends PAGE refreshed with every build, but new CARDS were a manual
 * owner→Claude workflow, and the monthly window had no step for them — the
 * page quietly stopped gaining content whenever nobody happened to think of
 * it. From October this runs inside the monthly window, right after the news
 * snapshot it reads from; the cards ship in the same build as the articles
 * they were selected from.
 *
 * WHAT IT TRUSTS AND WHAT IT DOESN'T
 * The month's articles are already published editorial content (Gemini-written,
 * grounded, reviewed by the same pipeline every reader sees). This script asks
 * the same model family to CONDENSE one selected article into a card spec and
 * a short write-up — it never asks it to research anything new, and the prompt
 * forbids any number that does not appear verbatim in the article. A lint pass
 * then enforces the house content rules mechanically:
 *   - no eligibility promises, in any language
 *   - never any "not listed / absent from the register" phrasing
 *   - "BAFA" only ever on the German card
 * A card that fails lint is retried once with the violations quoted, then
 * dropped — a month without a card beats a card that breaks the rules.
 *
 * IDEMPOTENT: a market that already has a card dated in the target month is
 * skipped, so a re-run (or a second window) cannot double-publish.
 *
 * Usage:
 *   node scripts/trends/generate-monthly-cards.mjs [--month=YYYY-MM]
 *        [--markets=DE,FR] [--dry-run]
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const STORE = join(ROOT, 'data_sources/market_trends');

/* Same env loading as the maintenance window: .env, .env.local, ~/.heatpumpdb/env. */
for (const f of ['.env', '.env.local', join(process.env.HOME ?? '', '.heatpumpdb', 'env')]) {
  const p = join(ROOT, f).startsWith('/') && f.startsWith('/') ? f : (f.startsWith('/') ? f : join(ROOT, f));
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

const args = process.argv.slice(2);
const arg = (k, d) => (args.find((a) => a.startsWith(`--${k}=`)) ?? '').split('=')[1] || d;
const DRY = args.includes('--dry-run');
const MONTH = arg('month', new Date().toISOString().slice(0, 7));
const MARKETS = arg('markets', 'DE,GB,FR,PL,IT').split(',').map((s) => s.trim().toUpperCase());

const KEY = process.env.GEMINI_API_KEY;
if (!KEY) { console.error('GEMINI_API_KEY not set — no cards this month (non-fatal).'); process.exit(0); }

const LOCALE = {
  DE: { label: 'Deutschland', lang: 'German', months: ['JANUAR', 'FEBRUAR', 'MÄRZ', 'APRIL', 'MAI', 'JUNI', 'JULI', 'AUGUST', 'SEPTEMBER', 'OKTOBER', 'NOVEMBER', 'DEZEMBER'] },
  GB: { label: 'United Kingdom', lang: 'English', months: ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'] },
  FR: { label: 'France', lang: 'French', months: ['JANVIER', 'FÉVRIER', 'MARS', 'AVRIL', 'MAI', 'JUIN', 'JUILLET', 'AOÛT', 'SEPTEMBRE', 'OCTOBRE', 'NOVEMBRE', 'DÉCEMBRE'] },
  PL: { label: 'Polska', lang: 'Polish', months: ['STYCZEŃ', 'LUTY', 'MARZEC', 'KWIECIEŃ', 'MAJ', 'CZERWIEC', 'LIPIEC', 'SIERPIEŃ', 'WRZESIEŃ', 'PAŹDZIERNIK', 'LISTOPAD', 'GRUDZIEŃ'] },
  IT: { label: 'Italia', lang: 'Italian', months: ['GENNAIO', 'FEBBRAIO', 'MARZO', 'APRILE', 'MAGGIO', 'GIUGNO', 'LUGLIO', 'AGOSTO', 'SETTEMBRE', 'OTTOBRE', 'NOVEMBRE', 'DICEMBRE'] },
};

/* ── The house content rules, as machine checks ──────────────────────────────
   The same rules every published surface obeys. Patterns are deliberately a
   little broad: a false positive costs one retry, a false negative publishes
   a rule violation. */
const RULES = [
  { name: 'no absence claims', re: /not (?:currently )?(?:on|in|listed)(?: the)? (?:PEL|list|register|catalogue)|nie ma na li[sś]cie|nicht (?:mehr )?gelistet|absent[oe]? d[au]l? (?:catalogo|registre)|non figure pas|fuori (?:dal )?catalogo\b.*?(?:quindi|perci)|delisted/i },
  { name: 'no eligibility promises', re: /guarantee[ds]? (?:funding|eligibility|the grant)|garantiert.*f[öo]rder|garantisce.*(?:incentivo|ammissibilit)|gwarantuje.*dotacj|garantit.*(?:aide|éligibilit)|qualifies? for (?:the )?(?:grant|subsidy)|automatically eligible/i },
  { name: 'BAFA stays German', re: /BAFA/i, except: 'DE' },
];
function lint(cc, text) {
  return RULES
    .filter((r) => r.except !== cc)
    .filter((r) => r.re.test(text))
    .map((r) => r.name);
}

/** Every field the model returned, flattened for linting. */
const flatten = (o) => JSON.stringify(o);

/**
 * The verbatim-number rule, enforced mechanically rather than trusted to the
 * prompt: every figure on the card must exist in the article body (spacing
 * and thin-space variants tolerated). A stats item that fails is not an
 * error — the card simply falls back to points-only, which rule 1 already
 * defines as the honest shape for a story without two provable figures.
 */
function verifiedStats(stats, articleText) {
  if (!Array.isArray(stats)) return null;
  const hay = articleText.replace(/[\u00a0\u202f\s]+/g, '');
  const ok = stats.filter((it) => {
    const needle = String(it.value ?? '').replace(/[\u00a0\u202f\s]+/g, '');
    return needle.length > 0 && hay.includes(needle);
  });
  if (ok.length < stats.length) {
    console.warn(`   stats trimmed: ${stats.length - ok.length} figure(s) not found verbatim in the article`);
  }
  return ok.length >= 2 ? ok : null;
}

async function gemini(prompt) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4, responseMimeType: 'application/json' },
      }),
    },
  );
  if (!res.ok) throw new Error(`gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  return JSON.parse(text);
}

const PROMPT = (cc, L, article) => `You are the editor of HeatPump DB ${L.label}, a B2B heat-pump database.
Condense ONE published news article of ours into (a) an infographic card spec and (b) a short companion write-up for the "Market & Trends" page.

THE ARTICLE (already published, ${L.lang}):
TITLE: ${article.title}
CATEGORY: ${article.category}
BODY:
${article.body}

HARD RULES — violating any of these makes the output unusable:
1. NUMBERS: you may only use a figure that appears VERBATIM in the article body above. If the article has fewer than two usable figures, return "stats": null and carry the story with points instead. Never compute, extrapolate or round differently.
2. Never state or imply that any product is absent from, or not listed in, any register/catalogue/list.
3. Never promise or imply funding eligibility. Conditions may be described; outcomes never guaranteed.
4. ${cc === 'DE' ? 'This is the German edition; BAFA may be named.' : 'NEVER use the word "BAFA" — this is not the German edition.'}
5. Card text is ${L.lang}. The *En fields are an English twin of the write-up (not of the card).
6. Tone: sober trade-press. No exclamation marks, no marketing superlatives.

Return EXACTLY this JSON shape:
{
  "slug": "<2-4 lowercase-ascii-words-hyphenated, no dates>",
  "cardTitle": ["<line 1, <=26 chars>", "<line 2, <=26 chars>"],
  "cardSub": "<one ${L.lang} sentence, <=90 chars>",
  "stats": null | [{"value": "<verbatim figure>", "label": "<${L.lang}, <=38 chars>"}, ... up to 3],
  "points": [{"label": "<${L.lang}, <=70 chars>", "no": false}, ... 3 or 4],   // "no": true only for an explicit caveat/limit
  "pointsTitle": "<${L.lang} panel heading, <=30 chars>",
  "fazitTitle": "<${L.lang} takeaway heading, <=24 chars>",
  "fazitLines": ["<${L.lang}, <=60 chars>", "<${L.lang}, <=60 chars>"],
  "motif": "<one of: chart, doc, scales, house, leaf, factory, coins, clock>",
  "icon": "<one of: doc, chart, coins, clock, shield, stamp, scales, hp-unit>",
  "articleTitle": "<${L.lang} headline for the write-up, <=90 chars>",
  "excerpt": "<1-2 ${L.lang} sentences>",
  "body": ["<${L.lang} paragraph>", "...", "3 to 4 paragraphs total"],
  "sourceNote": "<${L.lang}: 'Quelle/Source/Źródło/Fonte: HeatPump DB ${L.label} News, <article date>' plus institutions the article itself cites>",
  "titleEn": "<English headline>",
  "excerptEn": "<English excerpt>",
  "bodyEn": ["<English twin paragraphs, same count>"],
  "sourceNoteEn": "<English source note>"
}`;

/* ── Selection: this month's articles, policy first, newest first ─────────── */
const CATEGORY_RANK = { FUNDING: 0, MARKET: 1, TECHNOLOGY: 2 };
function pickArticle(items) {
  const monthly = items.filter((a) => String(a.date ?? '').startsWith(MONTH));
  monthly.sort((a, b) =>
    (CATEGORY_RANK[a.category] ?? 9) - (CATEGORY_RANK[b.category] ?? 9)
    || String(b.date).localeCompare(String(a.date)));
  return monthly[0] ?? null;
}

function buildSpec(cc, L, g) {
  const [y, m] = MONTH.split('-').map(Number);
  const sections = [];
  if (Array.isArray(g.stats) && g.stats.length >= 2) {
    sections.push({ type: 'stats', items: g.stats.slice(0, 3) });
  }   // g.stats has already been through verifiedStats() by the caller
  sections.push({
    type: 'checks', icon: g.icon ?? 'doc', title: g.pointsTitle,
    rows: (g.points ?? []).slice(0, 4).map((p) => ({ label: p.label, ...(p.no ? { no: true } : {}) })),
  });
  sections.push({ type: 'fazit', title: g.fazitTitle, lines: (g.fazitLines ?? []).slice(0, 2) });
  return {
    country: cc, countryLabel: L.label,
    month: `${L.months[m - 1]} ${y}`,
    motif: g.motif ?? 'chart',
    title: g.cardTitle, sub: g.cardSub,
    sections,
  };
}

let made = 0, skipped = 0, failed = 0;
for (const cc of MARKETS) {
  const L = LOCALE[cc];
  if (!L) { console.error(`unknown market ${cc}`); continue; }

  const storePath = join(STORE, `${cc}.json`);
  const cards = JSON.parse(readFileSync(storePath, 'utf8'));
  if (cards.some((c) => String(c.date ?? '').startsWith(MONTH))) {
    console.log(`[${cc}] already has a ${MONTH} card — skipping (idempotent)`);
    skipped++; continue;
  }

  const snapPath = join(ROOT, 'data_sources/news_public', `${cc}.json`);
  const items = JSON.parse(readFileSync(snapPath, 'utf8')).items ?? [];
  const article = pickArticle(items);
  if (!article) { console.log(`[${cc}] no ${MONTH} articles in the snapshot — nothing to condense`); skipped++; continue; }
  console.log(`[${cc}] selected: ${article.id} (${article.category}) — ${String(article.title).slice(0, 70)}`);

  try {
    let g = await gemini(PROMPT(cc, L, article));
    let violations = lint(cc, flatten(g));
    if (violations.length) {
      console.warn(`[${cc}] lint: ${violations.join(', ')} — one retry with the violations quoted`);
      g = await gemini(PROMPT(cc, L, article)
        + `\n\nYOUR PREVIOUS ANSWER VIOLATED: ${violations.join('; ')}. Produce a compliant version.`);
      violations = lint(cc, flatten(g));
      if (violations.length) throw new Error(`still violating after retry: ${violations.join(', ')}`);
    }
    for (const k of ['slug', 'cardTitle', 'cardSub', 'points', 'articleTitle', 'excerpt', 'body', 'sourceNote']) {
      if (!g[k] || (Array.isArray(g[k]) && !g[k].length)) throw new Error(`model returned no ${k}`);
    }
    g.stats = verifiedStats(g.stats, `${article.title}\n${article.body}`);

    const slug = `${MONTH}-${String(g.slug).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '')}`.slice(0, 48);
    const base = `${cc.toLowerCase()}-${slug}`;
    const spec = buildSpec(cc, L, g);
    const specPath = join(STORE, 'specs', `${base}.spec.json`);
    const pngPath = join(STORE, 'images', `${base}.png`);

    if (DRY) { console.log(`[${cc}] DRY — would write ${base}`); console.log(JSON.stringify(spec, null, 1).slice(0, 600)); continue; }

    writeFileSync(specPath, JSON.stringify(spec, null, 1));
    execFileSync('node', [join(ROOT, 'scripts/build-trends-card.mjs'), specPath, pngPath], { stdio: 'inherit' });
    execFileSync('cwebp', ['-q', '88', pngPath, '-o', join(STORE, 'images', `${base}.webp`)], { stdio: 'ignore' });
    execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '85', pngPath, '--out', join(STORE, 'images', `${base}.jpg`)], { stdio: 'ignore' });
    execFileSync('rm', [pngPath]);

    const today = new Date().toISOString().slice(0, 10);
    cards.unshift({
      slug, date: today, image: `${base}.webp`,
      title: g.articleTitle, excerpt: g.excerpt, body: g.body, sourceNote: g.sourceNote,
      ...(cc === 'GB' ? {} : { titleEn: g.titleEn, excerptEn: g.excerptEn, bodyEn: g.bodyEn, sourceNoteEn: g.sourceNoteEn }),
    });
    writeFileSync(storePath, JSON.stringify(cards, null, 1));
    console.log(`[${cc}] card published to the store: ${slug}`);
    made++;
  } catch (e) {
    console.error(`[${cc}] FAILED (card skipped this month): ${e.message}`);
    failed++;
  }
}

console.log(`\ncards: ${made} made, ${skipped} skipped, ${failed} failed`);
/* Non-fatal by design even when invoked directly: a missing card must never
   block the window that also ships the catalogue. */
process.exit(0);
