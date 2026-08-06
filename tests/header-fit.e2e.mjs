/**
 * header-fit.e2e.mjs — the auth header must FIT, at every phone width, in every
 * edition and every UI language.
 *
 * WHY THIS EXISTS
 * The header overflowed by 113px on a 390px phone and the language switch was
 * simply not on screen — and the check that was supposed to catch it passed.
 * It compared `document.documentElement.scrollWidth` against the viewport, but
 * AuthShell's root carries `overflow-hidden` (it clips the background aurora
 * layers), so overflowing children are CLIPPED rather than made scrollable and
 * the document width never grows. A page can therefore lose its entire
 * top-right corner while every document-level measurement says it is fine.
 *
 * So this measures the header itself — scrollWidth vs clientWidth — and then
 * each visible descendant's right edge against the viewport. Those two catch
 * clipping; the document-level one cannot.
 *
 * Language matters: the market badge and the button labels are translated, and
 * a longer word is exactly how this comes back.
 *
 * Run: bash tests/run-header-fit-e2e.sh
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:5199';
const COUNTRY = process.env.COUNTRY || 'DE';

/** iPhone SE through to a large phone in landscape-ish width. 320 is the
 *  narrowest viewport still worth supporting. */
const WIDTHS = [320, 360, 390, 430, 768, 1024];

let passed = 0, failed = 0;
const check = (name, ok, detail = '') => {
  if (ok) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.error(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
};

const browser = await chromium.launch();

console.log(`\nHeader fit — ${COUNTRY} edition (${BASE})\n`);

for (const width of WIDTHS) {
  const page = await (await browser.newContext({ viewport: { width, height: 800 } })).newPage();
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  // Two waits, both needed: the selector wait absorbs the dev server's cold
  // compile (a fixed sleep once read "header does not exist" on a page that
  // had not painted yet), and the settle wait lets the entrance animations
  // finish — measuring mid-fade reports transitional geometry as an overflow.
  await page.waitForSelector('header', { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(2000);

  // Landing, then login — the two screens that carry the social links, i.e.
  // the two with the most in the header.
  for (const screen of ['landing', 'login']) {
    if (screen === 'login') {
      const btn = page.getByRole('button', { name: /Log In|Anmelden|Se connecter|Zaloguj się|Accedi/i }).first();
      if (!(await btn.count())) continue;
      await btn.click();
      await page.waitForTimeout(700);
    }

    const r = await page.evaluate((vw) => {
      const h = document.querySelector('header');
      if (!h) return null;
      const overflowing = [];
      for (const el of h.querySelectorAll('*')) {
        const b = el.getBoundingClientRect();
        if (b.width > 0 && b.height > 0 && (b.right > vw + 0.5 || b.left < -0.5)) {
          overflowing.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 30)} → ${Math.round(b.right)}px`);
        }
      }
      // Fitting is not enough. The header is a flex row with min-w-0, so an
      // oversized mark no longer pushes the language switch off screen — it
      // gets SQUASHED instead, rendering inside a box far narrower than its
      // own viewBox and leaving the brand letterboxed. Comparing each mark's
      // painted ratio with its viewBox ratio catches that; measuring overflow
      // never will.
      const marks = [...h.querySelectorAll('svg[viewBox]')].map((el) => {
        const [, , vbW, vbH] = el.getAttribute('viewBox').trim().split(/[\s,]+/).map(Number);
        const b = el.getBoundingClientRect();
        if (!vbW || !vbH || !b.width || !b.height) return null;
        return { natural: vbW / vbH, painted: b.width / b.height, w: Math.round(b.width), h: Math.round(b.height) };
      }).filter(Boolean);
      return { scrollWidth: h.scrollWidth, clientWidth: h.clientWidth, overflowing: overflowing.slice(0, 3), marks };
    }, width);

    if (!r) { check(`[${width}px ${screen}] header exists`, false); continue; }

    check(
      `[${width}px ${screen}] header does not overflow`,
      r.scrollWidth <= r.clientWidth,
      `scrollWidth ${r.scrollWidth} > clientWidth ${r.clientWidth}`,
    );
    check(
      `[${width}px ${screen}] every header element is on screen`,
      r.overflowing.length === 0,
      r.overflowing.join('  |  '),
    );
    const squashed = r.marks.filter((m) => m.painted < m.natural * 0.9);
    check(
      `[${width}px ${screen}] brand marks keep their aspect ratio`,
      squashed.length === 0,
      squashed.map((m) => `painted ${m.w}×${m.h} (${m.painted.toFixed(2)}) vs viewBox ${m.natural.toFixed(2)}`).join('  |  '),
    );
  }
  await page.close();
}

await browser.close();
console.log(`\n${COUNTRY}: ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
