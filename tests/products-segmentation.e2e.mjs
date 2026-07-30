/**
 * Products page e2e — segmentation, country-source leakage, listing, reactivity.
 *
 * Usage: node tests/products-segmentation.e2e.mjs <DE|GB|FR> <port>
 *        (or tests/run-products-e2e.sh, which starts a dev server per edition)
 *
 * Guards the permanent rules in
 * docs/EUROPE_DATA_AND_PRODUCT_SEGMENTATION_PRINCIPLES.md:
 *   1. residential ≤ 23 kW < commercial, the same in every country
 *   2. the word BAFA (and any other foreign national term) never leaves its own country
 *   3. a market only offers a filter that actually divides its catalogue
 *   4. local listing status is only ever the market's OWN list
 *
 * Runs against the dev preview (?preview=hpiq), which needs no sign-in and reads
 * the datasets straight from public/data. Nothing is written to Firestore.
 */
import { chromium } from 'playwright';

const COUNTRY = (process.argv[2] || 'GB').toUpperCase();
const PORT = process.argv[3] || '5199';
const BASE = `http://localhost:${PORT}/?preview=hpiq`;
const THRESHOLD = 23;

let passed = 0, failed = 0;
const check = (n, ok, d = '') => {
  if (ok) { passed++; console.log(`  PASS  ${n}`); }
  else { failed++; console.error(`  FAIL  ${n}${d ? `\n        ${d}` : ''}`); }
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1500, height: 980 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e).slice(0, 160)));

console.log(`\nProducts — ${COUNTRY} edition\n`);

await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(5000);          // datasets load from public/data

await page.getByText(/^Products$|^Produkte$|^Produits$|^Produkty$|^Prodotti$/).first().click();
await page.waitForTimeout(3500);

/** The result count shown in the header ("N models"). */
const total = async () => {
  const txt = await page.locator('body').innerText();
  const m = txt.match(/([\d]{1,3}(?:[.,\s\u00A0\u202F]\d{3})*|\d+)\s*(models|Modelle|modèles|of|von|sur|z|di)\b/i);
  return m ? parseInt(m[1].replace(/[.,\s\u00A0\u202F]/g, ''), 10) : -1;
};
const rows = () => page.locator('[data-row-id]').count();
const bodyText = () => page.locator('body').innerText();

// Rows are `content-visibility: auto`, so an off-screen row has no rendered text
// and innerText comes back empty — read textContent, which is always the truth.
const text = loc => loc.evaluate(el => el.textContent?.trim() ?? '');

/** Sort the visible list, then read the capacity of the row that lands on top. */
const sortAndReadTopKw = async optionRe => {
  await page.locator('[data-testid="sort-trigger"]').first().click();
  await page.waitForTimeout(250);
  await page.locator('[data-testid="sort-option"]').filter({ hasText: optionRe }).first().click();
  await page.waitForTimeout(400);
  const raw = await text(page.locator('[data-testid="row-kw"]').first());
  return parseFloat(raw.replace(',', '.'));
};

/** Switch the UI language (the DE edition defaults to English; DE is a chip). */
const setLang = async code => {
  const chip = page.getByText(new RegExp(`^${code}$`)).first();
  if (await chip.count()) { await chip.click(); await page.waitForTimeout(400); }
};

/* ── Residential ──────────────────────────────────────────────────────── */
check('[residential] products load', (await rows()) > 0);

// Sorting capacity high→low brings the single largest residential product to the
// top: if THAT one is ≤ 23 kW, then no residential product is above the threshold.
// German says "Leistung — absteigend" (never "hoch"); the old word only worked
// while the DE preview still defaulted to English.
const resMaxKw = await sortAndReadTopKw(/high to low|absteigend|décroissante|haut|od najwyższej|decrescente/i);
check(`[segment] no residential product exceeds ${THRESHOLD} kW`,
  Number.isFinite(resMaxKw) && resMaxKw <= THRESHOLD, `largest residential = ${resMaxKw} kW`);

/* ── Commercial ───────────────────────────────────────────────────────── */
await page.getByText(/^Commercial$|^Gewerbe$|^Tertiaire$|^Komercyjne$|^Commerciale$/).first().click();
await page.waitForTimeout(2500);
const comRows = await rows();
const comTotal = await total();
check('[commercial] catalogue loads (non-zero)', comRows > 0, `rows=${comRows}`);
check('[commercial] total is plausible (>100)', comTotal > 100, `total=${comTotal}`);

// Mirror image: the smallest commercial product must still be above the threshold.
const comMinKw = await sortAndReadTopKw(/low to high|aufsteigend|croissante|bas|od najniższej|crescente/i);
check(`[segment] every commercial product is above ${THRESHOLD} kW`,
  Number.isFinite(comMinKw) && comMinKw > THRESHOLD, `smallest commercial = ${comMinKw} kW`);

/* ── Every published product is classifiable (canonical baseline) ────────── */
check('[architecture] no unclassified public products are disclosed',
  (await page.locator('[data-testid="unclassified-note"]').count()) === 0);

/* ── The 23 kW rule is disclosed, in the page's own language ───────────── */
const note = page.locator('[data-testid="segment-note"]');
check('[disclosure] the 23 kW rule is stated next to the segment control', (await note.count()) >= 1);
if (await note.count()) {
  check('[disclosure] the note names the threshold', /23 kW/.test(await text(note.first())));
  // Each market's own language: GB is English-only, FR opens in French, and the
  // DE edition opens in English with German behind the DE chip.
  if (COUNTRY === 'DE') await setLang('DE');
  const nt = await text(note.first());
  const lang = COUNTRY === 'DE' ? /Nennleistung/i : COUNTRY === 'FR' ? /puissance nominale/i : COUNTRY === 'PL' ? /moc[a-zy]* znamionow/i : COUNTRY === 'IT' ? /potenza nominale/i : /rated capacity/i;
  check(`[disclosure] the note is in the ${COUNTRY} market language`, lang.test(nt), nt);
  check('[disclosure] the note still names the threshold in that language', /23 kW/.test(nt), nt);
  if (COUNTRY === 'DE') await setLang('EN');
}

/* ── Country-source leakage — the word BAFA lives only in Germany ──────── */
const comBody = await bodyText();
const around = (txt, re) => (txt.match(new RegExp(`.{0,60}${re}.{0,60}`, 'i')) || [])[0] || '';

/**
 * "Do not name the source country" is about OUR wording, not about a company's
 * registered name: "Tongfang Germany GmbH" is the manufacturer's actual legal
 * name and must be printed verbatim. Drop those before scanning.
 */
const stripCompanyNames = txt =>
  txt.replace(/[\wÀ-ÿ.&'’-]+\s+(Germany|Deutschland)\s+(GmbH|AG|SE|KG|mbH|Ltd\.?|Limited|B\.?V\.?)/gi, '');
const namesSourceCountry = txt => /\bGerman\b|\bGermany\b|\bdeutsch/i.test(stripCompanyNames(txt));
if (COUNTRY === 'DE') {
  check('[DE] BAFA wording is still present (this IS the German registry)', /BAFA/i.test(comBody));
} else {
  check(`[${COUNTRY}] the word "BAFA" does not appear on the Products page`,
    !/BAFA/i.test(comBody), around(comBody, 'BAFA'));
  check(`[${COUNTRY}] the source country is not named`,
    !namesSourceCountry(comBody), around(stripCompanyNames(comBody), 'German'));
}

/* ── Local listing: only ever the market's OWN list ────────────────────── */
if (COUNTRY === 'GB') {
  check('[GB] the PEL "listed only" filter is NOT offered (it does not divide the catalogue)',
    (await page.locator('[data-testid="listed-only-toggle"]').count()) === 0);
  check('[GB] PEL status is still shown on the list', /\bPEL\b/i.test(comBody));
  // The architecture change: a failed match is OUR failure, not evidence that the
  // product is absent from the Ofgem list.
  check('[GB] "Not on PEL" is GONE — absence of a match is not absence from the list',
    !/not on (the )?(current )?PEL/i.test(comBody), around(comBody, 'Not on'));
  check('[GB] unconfirmed products say "verification required"',
    /verification required/i.test(comBody));
  check('[GB] no BUS eligibility is claimed', !/eligible for BUS|BUS eligible/i.test(comBody));
} else if (COUNTRY === 'FR') {
  check('[FR] no listing filter is offered (France has no national list)',
    (await page.locator('[data-testid="listed-only-toggle"]').count()) === 0);
  check('[FR] no local listing status is shown at all',
    (await page.locator('[data-testid="local-listing-status"]').count()) === 0);
  check('[FR] no foreign listing is relabelled as French', !/Ofgem|\bPEL\b/i.test(comBody));
} else if (COUNTRY === 'PL') {
  // Poland has its own national list (Lista ZUM) — PEL rules apply: only a
  // confirmed match is "listed", a failed match is never absence.
  check('[PL] ZUM status is shown on the list', /\bZUM\b/i.test(comBody));
  // The honest verification wording legitimately contains "…nie ma na liście"
  // inside a negation ("this is NOT proof the product is absent") — ban only
  // STATUS-style absence claims.
  check('[PL] no product is claimed absent from ZUM ("Brak na liście" as a status is banned)',
    !/Brak na liście ZUM|Nieobecny na liście|Usunięto z listy ZUM|not on (the )?ZUM/i.test(comBody), around(comBody, 'na liście'));
  check('[PL] no foreign listing leaks onto the Polish edition', !/Ofgem|\bPEL\b|\bMCS\b/i.test(comBody));
  check('[PL] no grant eligibility is claimed',
    !/gwarantuje dotacj|kwalifikuje się do dotacji|eligible for (a )?grant/i.test(comBody));
  check('[PL] the ZUM "listed only" filter IS offered',
    (await page.locator('[data-testid="listed-only-toggle"]').count()) === 1);
  {
    // The PL filter starts OFF (ZUM covers 3–55 kW; a default-on filter would
    // near-empty the commercial tab) — the assertion is order-agnostic.
    const a = await total();
    await page.locator('[data-testid="listed-only-toggle"]').first().click();
    await page.waitForTimeout(300);
    const b = await total();
    check('[PL] the ZUM filter narrows the catalogue without emptying it',
      Math.min(a, b) > 0 && Math.min(a, b) < Math.max(a, b), `totals ${a} ↔ ${b}`);
    await page.locator('[data-testid="listed-only-toggle"]').first().click();
    await page.waitForTimeout(300);
    check('[PL] toggling back restores the unfiltered list', (await total()) === a);
  }
} else if (COUNTRY === 'IT') {
  // Italy has its own national catalogue (GSE Conto Termico, III.A) — PEL rules
  // apply: only a confirmed match is "listed", a failed match is never absence.
  check('[IT] GSE catalogue status is shown on the list', /\bGSE\b/i.test(comBody));
  check('[IT] no product is claimed absent from the GSE catalogue',
    !/Non (è |e )?nel catalogo|(?<!sia )assente dal catalogo|rimosso dal catalogo|not in (the )?GSE catalogue/i.test(comBody), around(comBody, 'catalogo'));
  check('[IT] no foreign listing leaks onto the Italian edition', !/Ofgem|\bPEL\b|\bMCS\b|\bZUM\b/i.test(comBody));
  check('[IT] no incentive eligibility is claimed',
    !/garantisce l.incentivo|idoneo all.incentivo|diritto all.incentivo|eligible for (an? )?(grant|incentive)/i.test(comBody));
  check('[IT] the "listed only" filter is NOT offered (a discovery trap)',
    (await page.locator('[data-testid="listed-only-toggle"]').count()) === 0);
  check('[IT] the two data sources are disclosed next to the count (GSE catalogue vs European reference)',
    (await page.locator('[data-testid="source-mix-note"]').count()) === 1);
} else {
  check('[DE] the BAFA listing filter IS offered (it meaningfully divides the catalogue)',
    (await page.locator('[data-testid="listed-only-toggle"]').count()) === 1);
  // The filter is ON by default, so the visible count starts filtered. It must
  // NARROW the catalogue without emptying it — an always-empty filter is exactly
  // what made UK Commercial show nothing.
  const withFilter = await total();
  await page.locator('[data-testid="listed-only-toggle"]').first().click();   // → off
  await page.waitForTimeout(300);
  const withoutFilter = await total();
  check('[DE] the listing filter narrows the catalogue without emptying it',
    withFilter > 0 && withFilter < withoutFilter, `listed ${withFilter} of ${withoutFilter}`);
  await page.locator('[data-testid="listed-only-toggle"]').first().click();   // → back on
  await page.waitForTimeout(300);
  check('[DE] toggling the listing filter back restores the filtered list', (await total()) === withFilter);
}

/* ── Reactive filtering / sorting — every change lands in ONE render ───── */
const firstModel = async () => (await text(page.locator('[data-row-id]').first())).slice(0, 40);
const baseTotal = await total();

const mfr = page.locator('[data-testid="mfr-option"]').first();
if (await mfr.count()) {
  const before = await rows();
  await mfr.click();
  await page.waitForTimeout(150);          // one frame — no debounce allowed
  const after = await rows();
  const t2 = await total();
  check('[filter] manufacturer updates the list immediately',
    after !== before || t2 < baseTotal, `${before} → ${after}, total ${baseTotal} → ${t2}`);
  await mfr.click();                        // clear
  await page.waitForTimeout(150);
  check('[filter] clearing the manufacturer immediately restores the list', (await total()) === baseTotal);
}

const ref = page.locator('[data-testid="ref-option"]').first();
if (await ref.count()) {
  const t0 = await total();
  await ref.click();
  await page.waitForTimeout(150);
  const t1 = await total();
  check('[filter] refrigerant updates the list immediately', t1 !== t0, `${t0} → ${t1}`);
  await page.locator('[data-testid="ref-option"]').first().click();
  await page.waitForTimeout(150);
  check('[filter] clearing refrigerant immediately restores the list', (await total()) === t0);
}

const top0 = await firstModel();
await page.locator('[data-testid="sort-trigger"]').first().click();
await page.waitForTimeout(200);
const opt = page.locator('[data-testid="sort-option"]').nth(1);
if (await opt.count()) {
  await opt.click();
  await page.waitForTimeout(150);
  check('[sort] changing the sort immediately reorders the list', (await firstModel()) !== top0);
}

const search = page.locator('input[placeholder]').first();
if (await search.count()) {
  const t0 = await total();
  await search.fill('Daikin');
  await page.waitForTimeout(250);
  check('[search] free text narrows the list quickly', (await total()) <= t0);
  await search.fill('');
  await page.waitForTimeout(250);
}

/* ── Detail / compare / data sheet on a commercial record ──────────────── */
await page.locator('[data-row-id]').first().click();
await page.waitForTimeout(900);
const detail = await bodyText();
check('[commercial] product detail opens', /Manufacturer|Hersteller|Fabricant|Producent|Produttore/i.test(detail));
if (COUNTRY === 'GB') {
  check('[GB] product detail keeps PEL status', /\bPEL Listed|verification required/i.test(detail));
  check('[GB] product detail never says "Not on PEL"', !/not on (the )?(current )?PEL/i.test(detail));
  check('[GB] product detail never says BAFA', !/BAFA/i.test(detail), around(detail, 'BAFA'));
}
if (COUNTRY === 'FR') {
  check('[FR] product detail never says BAFA', !/BAFA/i.test(detail), around(detail, 'BAFA'));
}
if (COUNTRY === 'PL') {
  check('[PL] product detail never says BAFA', !/BAFA/i.test(detail), around(detail, 'BAFA'));
  check('[PL] product detail keeps ZUM status wording',
    /Na liście ZUM|Weryfikacja ZUM|ZUM listed|ZUM verification/i.test(detail));
}
if (COUNTRY === 'IT') {
  check('[IT] product detail never says BAFA', !/BAFA/i.test(detail), around(detail, 'BAFA'));
  check('[IT] product detail keeps GSE status wording',
    /catalogo GSE|GSE catalogue|Verifica.*GSE|GSE verification/i.test(detail));
}

const cmp = page.locator('[data-testid="compare-toggle"]');
check('[commercial] compare controls render', (await cmp.count()) >= 2);
await cmp.nth(0).click();
await cmp.nth(1).click();
await page.waitForTimeout(500);
const cmpText = await bodyText();
check('[commercial] two records can be compared', /2/.test(cmpText) && /Compare|Vergleich|Comparer|Porówn|Confront/i.test(cmpText));

await page.getByText(/^Data sheet$|^Datenblatt$|^Fiche technique$|^Karta danych$|^Scheda tecnica$/).first().click();
await page.waitForTimeout(2500);
check('[commercial] Data Sheet opens for a commercial record',
  (await page.locator('.hpiq-print-doc').count()) >= 1);
const sheet = await page.locator('.hpiq-print-doc').first().innerText();
if (COUNTRY === 'GB') {
  check('[GB] the Data Sheet keeps PEL status', /PEL Listed|PEL verification required/i.test(sheet));
  check('[GB] the Data Sheet never says "Not on PEL"', !/not on (the )?(current )?PEL/i.test(sheet));
  check('[GB] the Data Sheet never says BAFA', !/BAFA/i.test(sheet), around(sheet, 'BAFA'));
  check('[GB] the Data Sheet does not name the source country',
    !namesSourceCountry(sheet), around(stripCompanyNames(sheet), 'German'));
}
if (COUNTRY === 'FR') {
  check('[FR] the Data Sheet never says BAFA', !/BAFA/i.test(sheet), around(sheet, 'BAFA'));
  check('[FR] the Data Sheet shows no local listing status', !/Ofgem|\bPEL\b/i.test(sheet));
}
if (COUNTRY === 'PL') {
  check('[PL] the Data Sheet never says BAFA', !/BAFA/i.test(sheet), around(sheet, 'BAFA'));
  check('[PL] the Data Sheet does not name the source country',
    !namesSourceCountry(sheet), around(stripCompanyNames(sheet), 'German'));
  check('[PL] the Data Sheet shows no foreign listing', !/Ofgem|\bPEL\b|\bMCS\b/i.test(sheet));
}
if (COUNTRY === 'IT') {
  check('[IT] the Data Sheet never says BAFA', !/BAFA/i.test(sheet), around(sheet, 'BAFA'));
  check('[IT] the Data Sheet does not name the source country',
    !namesSourceCountry(sheet), around(stripCompanyNames(sheet), 'German'));
  check('[IT] the Data Sheet shows no foreign listing', !/Ofgem|\bPEL\b|\bMCS\b|\bZUM\b/i.test(sheet));
}
if (COUNTRY === 'DE') {
  check('[DE] the Data Sheet still shows a valid BAFA reference', /BAFA/i.test(sheet));
}

const dsLogo = await page.evaluate(async () => {
  const g = document.querySelector('.hpiq-print-doc .hp-logo-spin');
  if (!g) return null;
  const t1 = getComputedStyle(g).transform;
  await new Promise(r => setTimeout(r, 600));
  return { rotating: t1 !== getComputedStyle(g).transform, origin: getComputedStyle(g).transformOrigin };
});
check('[logo] Data Sheet mark is animated on screen', !!dsLogo?.rotating);
check('[logo] Data Sheet mark uses the same centre', dsLogo?.origin === '32px 32px');

/* ── Logo animation (header) ──────────────────────────────────────────── */
const logo = await page.evaluate(async () => {
  const g = document.querySelector('.hp-logo-spin');
  if (!g) return null;
  const cs = getComputedStyle(g);
  const t1 = cs.transform;
  await new Promise(r => setTimeout(r, 600));
  return {
    origin: cs.transformOrigin,
    rotating: t1 !== getComputedStyle(g).transform && t1 !== 'none',
    textAnim: getComputedStyle(document.querySelector('svg text')).animationName,
  };
});
check('[logo] header mark is rotating', !!logo?.rotating);
check('[logo] rotation centre is the exact mark centre (32px 32px)', logo?.origin === '32px 32px', logo?.origin);
check('[logo] the wordmark does not rotate', logo?.textAnim === 'none');

/* ── Whole-app leakage sweep — every page, in every language this market offers ──
 *
 * A market's SECOND language is where foreign terminology creeps back: the GB and
 * FR dictionaries are built as { ...EN, ...overrides }, and EN is the GERMAN
 * market's English — so any key a market forgets to override silently inherits
 * German registry wording. That is how the cross-reference note reached the GB
 * data sheet, and how the outdoor-unit note reached the French one. Scanning only
 * the default language would have missed both.
 */
if (COUNTRY !== 'DE') {
  const langs = COUNTRY === 'FR' ? ['FR', 'EN'] : COUNTRY === 'PL' ? ['PL', 'EN'] : COUNTRY === 'IT' ? ['IT', 'EN'] : ['EN'];
  const pages = [
    /^Find product$|^Rechercher$|^Znajdź produkt$/,
    /^Products$|^Produits$|^Produkty$|^Prodotti$/,
    /^EU energy label$|^Étiquette énergie UE$|^Étiquette énergétique UE$|^Etykieta energetyczna UE$/,
  ];
  for (const l of langs) {
    await setLang(l);
    for (const nav of pages) {
      const link = page.getByText(nav).first();
      if (!(await link.count())) continue;
      await link.click();
      await page.waitForTimeout(1200);
      const txt = await text(page.locator('body'));
      const label = `${COUNTRY} · ${l} · ${(await text(link)).slice(0, 18)}`;
      check(`[sweep] ${label}: no "BAFA"`, !/BAFA/i.test(txt), around(txt, 'BAFA'));
      check(`[sweep] ${label}: source country not named`,
        !namesSourceCountry(txt), around(stripCompanyNames(txt), 'German'));
    }
  }
}

/* ── Mobile shell — the same rules on the phone catalogue ──────────────── */
const m = await ctx.newPage();
await m.setViewportSize({ width: 390, height: 844 });
await m.goto(BASE, { waitUntil: 'domcontentloaded' });
await m.waitForTimeout(6000);
await m.getByText(/^Products$|^Produkte$|^Produits$|^Produkty$|^Prodotti$/).first().click();
await m.waitForTimeout(3000);
const mBody = await m.locator('body').innerText();
check('[mobile] the catalogue renders', (await m.locator('[data-row-id]').count()) > 0 || /kW/.test(mBody));
check('[mobile] the 23 kW rule is disclosed', (await m.locator('[data-testid="segment-note"]').count()) >= 1);
if (COUNTRY === 'PL') {
  // Poland offers its OWN list's filter (Lista ZUM) on mobile too — it lives
  // in the bottom-sheet filter panel, so open that first.
  await m.getByText(/^Filtry/).first().click();
  await m.waitForTimeout(600);
  check('[mobile PL] the ZUM listing filter is offered (in the filter sheet)',
    (await m.locator('[data-testid="listed-only-toggle"]').count()) === 1);
  check('[mobile PL] the word "BAFA" does not appear', !/BAFA/i.test(mBody), around(mBody, 'BAFA'));
} else if (COUNTRY !== 'DE') {
  check(`[mobile ${COUNTRY}] no listing filter is offered`,
    (await m.locator('[data-testid="listed-only-toggle"]').count()) === 0);
  check(`[mobile ${COUNTRY}] the word "BAFA" does not appear`, !/BAFA/i.test(mBody), around(mBody, 'BAFA'));
}
await m.close();

check('no page errors', errors.length === 0, errors[0] ?? '');

await browser.close();
console.log(`\n${COUNTRY}: ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
