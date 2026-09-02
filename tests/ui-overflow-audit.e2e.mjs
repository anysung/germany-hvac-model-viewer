/**
 * UI overflow audit — finds clipped, overflowing and colliding text on every
 * hpiq page, per market and per UI language, at a laptop viewport.
 *
 * Usage: node tests/ui-overflow-audit.e2e.mjs <DE|GB|FR|PL|IT> <port> [outDir]
 *
 * Runs against the dev preview (?preview=hpiq) — no sign-in, local datasets.
 * For each page it reports:
 *   CLIP     an element hides part of its own text (overflow hidden, no
 *            ellipsis) — the "Commerciale" button cut mid-word
 *   BLEED    an element's box escapes the viewport to the right
 *   COLLIDE  two sibling text spans whose boxes overlap — the RUMOROSITÀ/STATO
 *            header collision
 * plus a full-page screenshot for eyes-on review.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const COUNTRY = (process.argv[2] || 'IT').toUpperCase();
const PORT = process.argv[3] || '5199';
const OUT = process.argv[4] || '/tmp/ui-audit';
const BASE = `http://localhost:${PORT}/?preview=hpiq`;
const VIEW = { width: 1440, height: 900 };   // common MacBook logical resolution

fs.mkdirSync(OUT, { recursive: true });

// Grouped nav (2026-09-02): six entries; the two merged entries carry a
// SubTabs switcher, and the audit visits BOTH tabs of each.
const NAV_COUNT = 6;
const PAGE_NAMES = ['find', 'products', 'label', 'datasheet', 'funding', 'newsTrends'];
const SECOND_TABS = { funding: 'subtab-guide', newsTrends: 'subtab-trends' };

const AUDIT_JS = `(() => {
  const issues = [];
  const vw = window.innerWidth;
  const seen = new Set();
  const snip = (el) => (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 60);
  const path = (el) => {
    const bits = [];
    for (let e = el; e && e !== document.body && bits.length < 4; e = e.parentElement) {
      bits.unshift(e.tagName.toLowerCase() + (e.dataset.testid ? '[' + e.dataset.testid + ']' : ''));
    }
    return bits.join('>');
  };
  const els = [...document.querySelectorAll('body *')];
  for (const el of els) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;

    // CLIP: own text cut off with no ellipsis to admit it
    if ((cs.overflowX === 'hidden' || cs.overflow === 'hidden')
        && el.scrollWidth > el.clientWidth + 3
        && cs.textOverflow !== 'ellipsis'
        && el.childElementCount === 0 && snip(el)) {
      const k = 'C' + snip(el);
      if (!seen.has(k)) { seen.add(k); issues.push({ kind: 'CLIP', text: snip(el), by: el.scrollWidth - el.clientWidth, at: path(el) }); }
    }
    // BLEED: box escapes the viewport
    if (r.right > vw + 2 && r.left < vw && snip(el) && el.childElementCount === 0) {
      const k = 'B' + snip(el);
      if (!seen.has(k)) { seen.add(k); issues.push({ kind: 'BLEED', text: snip(el), by: Math.round(r.right - vw), at: path(el) }); }
    }
  }
  // COLLIDE: leaf text nodes of the same parent whose boxes overlap
  const parents = new Set(els.filter(e => e.childElementCount >= 2).slice(0, 4000));
  for (const p of parents) {
    const kids = [...p.children].filter(c => c.childElementCount === 0 && snip(c) && getComputedStyle(c).position !== 'absolute');
    for (let i = 0; i < kids.length - 1 && i < 12; i++) {
      const a = kids[i].getBoundingClientRect(), b = kids[i + 1].getBoundingClientRect();
      if (a.width === 0 || b.width === 0) continue;
      const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (ox > 4 && oy > a.height * 0.5) {
        const k = 'X' + snip(kids[i]) + snip(kids[i + 1]);
        if (!seen.has(k)) { seen.add(k); issues.push({ kind: 'COLLIDE', text: snip(kids[i]) + ' ⇄ ' + snip(kids[i + 1]), by: Math.round(ox), at: path(kids[i]) }); }
      }
    }
  }
  return issues.slice(0, 40);
})()`;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: VIEW });
const page = await ctx.newPage();
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(6000);

/** The gnav language toggle offers the market languages; return them. */
const langs = await page.evaluate(() => {
  const nav = document.querySelector('.hp-gnav');
  if (!nav) return [];
  return [...nav.querySelectorAll('div > span')]
    .map(s => (s.textContent || '').trim())
    .filter(t => /^[A-Z]{2}$/.test(t));
});
const languages = langs.length ? [...new Set(langs)] : ['(single)'];

const report = {};
for (const lang of languages) {
  if (lang !== '(single)') {
    await page.locator('.hp-gnav span', { hasText: new RegExp(`^${lang}$`) }).last().click().catch(() => {});
    await page.waitForTimeout(800);
  }
  for (let i = 0; i < NAV_COUNT; i++) {
    // Click the i-th destination — from the row, or from the overflow menu.
    const visible = await page.locator('.hp-gnav-links').first().locator('span.hp-navlink, span:not(.hp-navlink)').count();
    const links = page.locator('.hp-gnav-links').first().locator('> span');
    const n = await links.count();
    const inRow = i < n - (await page.locator('[data-testid="nav-more"]').count() ? 1 : 0) && i < n;
    try {
      if (i < n && !(await page.locator('[data-testid="nav-more"]').count() && i >= n - 1)) {
        await links.nth(i).click();
      } else {
        await page.locator('[data-testid="nav-more"]').click();
        await page.waitForTimeout(300);
        await page.locator('[data-testid="nav-more-menu"] > span').nth(i - (n - 1)).click();
      }
    } catch { continue; }
    await page.waitForTimeout(i === 1 ? 2500 : 1500);

    const name = PAGE_NAMES[i];
    const issues = await page.evaluate(AUDIT_JS);
    report[`${lang}/${name}`] = issues;
    await page.screenshot({ path: `${OUT}/${COUNTRY}-${lang}-${name}.png`, fullPage: false });

    // Merged entries: audit the second tab too.
    const second = SECOND_TABS[name];
    if (second && await page.locator(`[data-testid="${second}"]`).count()) {
      await page.locator(`[data-testid="${second}"]`).first().click();
      await page.waitForTimeout(1500);
      report[`${lang}/${name}#2`] = await page.evaluate(AUDIT_JS);
      await page.screenshot({ path: `${OUT}/${COUNTRY}-${lang}-${name}-2.png`, fullPage: false });
    }
  }
}

fs.writeFileSync(`${OUT}/${COUNTRY}-report.json`, JSON.stringify(report, null, 1));
let total = 0;
for (const [k, v] of Object.entries(report)) {
  if (!v.length) continue;
  total += v.length;
  console.log(`\n■ ${COUNTRY} ${k} — ${v.length} issue(s)`);
  for (const i of v.slice(0, 10)) console.log(`   ${i.kind.padEnd(7)} ${String(i.by).padStart(4)}px  ${i.text}  @${i.at}`);
}
console.log(`\n${COUNTRY}: ${total} issues across ${Object.keys(report).length} page-views → ${OUT}`);
await browser.close();
