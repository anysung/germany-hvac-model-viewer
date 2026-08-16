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

// Whatever was collapsed must still be reachable — and "reachable" means the
// entry NAVIGATES, not merely that it is listed. Asserting only that the menu
// has children is what let a dead menu ship: the panel renders outside the nav
// row, the outside-click handler closed it on mousedown, and the click landed
// on nothing (2026-08-16). Every entry is therefore clicked for real.
//
// The overflow button wears the current page's name whenever that page is one
// of the collapsed ones, so the button's own label is the arrival signal.
const MENU = '[data-testid="nav-more-menu"]';
for (const w of [1152, 1280, 1440]) {
  await page.setViewportSize({ width: w, height: 900 });
  await page.waitForTimeout(400);
  const more = page.locator('[data-testid="nav-more"]');
  if (!(await more.count())) {
    check(true, `[${CC} ${w}px] everything fits — no overflow menu needed`);
    continue;
  }

  await more.click();
  await page.waitForTimeout(250);
  const labels = await page.locator(`${MENU} > div`).allTextContents();
  check(labels.length > 0, `[${CC} ${w}px] overflow menu lists the collapsed destinations`, `${labels.length} entries`);

  for (const label of labels) {
    if (!(await page.locator(MENU).count())) {
      await more.click();
      await page.waitForTimeout(250);
    }
    await page.locator(`${MENU} > div`, { hasText: label }).first().click();
    await page.waitForTimeout(400);

    // Arrival is "this destination is now the ACTIVE one in the bar", not
    // "the overflow button wears its name". Landing on a page changes what the
    // button says, which changes its width, which can let the destination back
    // into the row as a normal item — a correct outcome that a button-only
    // check reads as a failure.
    const arrived = await page.evaluate((wanted) => {
      const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const bar = document.querySelector('.hp-gnav-links');
      const inRow = [...(bar?.children ?? [])].some(el =>
        el.tagName === 'SPAN' && el.offsetParent !== null
        && norm(el.textContent) === norm(wanted)
        && getComputedStyle(el).fontWeight === '600');
      const btn = document.querySelector('[data-testid="nav-more"]');
      const onButton = !!btn && norm(btn.textContent).startsWith(norm(wanted));
      return inRow || onButton;
    }, label);

    check(arrived, `[${CC} ${w}px] "${label}" navigates when clicked`,
      'menu closed but the destination never became active');
  }
}

await browser.close();
console.log(`\n${CC}: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
