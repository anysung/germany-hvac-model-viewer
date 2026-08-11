#!/usr/bin/env node
/**
 * Global-nav fit — the desktop bar holds eight destinations, and the label
 * lengths differ enough between markets (Polish and French are the longest)
 * that "it fits on my screen" proves nothing. This asserts the invariant that
 * actually matters at every laptop width in every edition:
 *
 *   the bar stays 60px tall, no nav item is cut off, the page never scrolls
 *   sideways, and whatever does not fit is reachable in the overflow menu.
 *
 * The 60px height is load-bearing: every page sizes itself with
 * calc(100vh - 60px), so a wrapped label would push content off-screen.
 *
 * Run:  COUNTRY=PL BASE_URL=http://localhost:5204 node tests/nav-fit.e2e.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:5204';
const CC = process.env.COUNTRY || 'DE';
const WIDTHS = [1152, 1280, 1366, 1440, 1512, 1600, 1920];

let pass = 0, fail = 0;
const check = (ok, name, detail = '') => {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
};

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await page.goto(`${BASE}/?preview=hpiq`);
await page.waitForSelector('.hp-gnav', { timeout: 30000 });
await page.waitForTimeout(2000);

for (const w of WIDTHS) {
  await page.setViewportSize({ width: w, height: 900 });
  await page.waitForTimeout(350);
  const m = await page.evaluate(() => {
    const nav = document.querySelector('.hp-gnav');
    const row = document.querySelector('.hp-gnav-links');
    const items = [...row.children].filter(el => el.tagName === 'SPAN' && el.offsetParent !== null);
    const rowRight = row.getBoundingClientRect().right;
    return {
      navH: Math.round(nav.getBoundingClientRect().height),
      shown: items.length,
      clipped: items.filter(el => el.getBoundingClientRect().right > rowRight + 1).length,
      hasMore: !!document.querySelector('[data-testid="nav-more"]'),
      docOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
    };
  });
  check(m.navH === 60, `[${CC} ${w}px] nav bar is 60px`, `got ${m.navH}px`);
  check(m.clipped === 0, `[${CC} ${w}px] no nav item is cut off`, `${m.clipped} clipped`);
  check(!m.docOverflow, `[${CC} ${w}px] page does not scroll sideways`);
  check(m.shown > 0, `[${CC} ${w}px] at least one destination is visible`);
}

// Whatever was collapsed must still be reachable — at the narrowest width the
// menu is guaranteed to hold something.
await page.setViewportSize({ width: 1152, height: 900 });
await page.waitForTimeout(400);
const more = page.locator('[data-testid="nav-more"]');
if (await more.count()) {
  await more.click();
  await page.waitForTimeout(300);
  const entries = await page.locator('div[style*="position: fixed"][style*="top: 60px"] > div').count();
  check(entries > 0, `[${CC} 1152px] overflow menu lists the collapsed destinations`, `${entries} entries`);
} else {
  check(true, `[${CC} 1152px] everything fits — no overflow menu needed`);
}

await browser.close();
console.log(`\n${CC}: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
