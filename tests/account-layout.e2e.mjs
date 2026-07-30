/**
 * Account page — card layout, ordering, Advertising card, Support email removal.
 *
 * Usage: node tests/account-layout.e2e.mjs <DE|GB|FR> <port>
 *        (or tests/run-account-e2e.sh, which starts a dev server per edition)
 *
 * The layout is ONE shared component (hpiq/pages/AccountPage.tsx) — there is no
 * per-country Account page. So the test drives the same edition three ways
 * (?preview=hpiq&as=pro|owner|member) and asserts the required geometry from the
 * rendered boxes, in whichever UI language the market defaults to.
 *
 * Runs against the dev preview: no sign-in, nothing written to Firestore.
 */
import { chromium } from 'playwright';

const COUNTRY = (process.argv[2] || 'DE').toUpperCase();
const PORT = process.argv[3] || '5199';
const BASE = `http://localhost:${PORT}/?preview=hpiq`;

let passed = 0, failed = 0;
const check = (n, ok, d = '') => {
  if (ok) { passed++; console.log(`  PASS  ${n}`); }
  else { failed++; console.error(`  FAIL  ${n}${d ? `\n        ${d}` : ''}`); }
};

// Each edition opens in its DEFAULT UI language (market.ts UI_LANGUAGES order):
// DE→German, GB→English, FR→French, PL→Polish, IT→Italian. Titles below must be
// the DEFAULT language of each market — assuming English for DE broke this suite
// when the DE preview started booting German (found 2026-07-31; same stale
// premise as the products sort-label fix). navAccount is the header button's
// title attribute (t.nav.account), which the click selector needs per market.
const EN = { company: 'Company profile.', personal: 'Personal profile.', support: 'Support.',
  terms: 'Terms & policies.', language: 'App language.', email: 'Email & password.',
  ad: 'Advertising & partnerships.', del: 'Delete account.', adBody: 'Advertising inquiries and business opportunities.',
  navAccount: 'Account' };
const TITLES = {
  DE: { company: 'Unternehmensprofil.', personal: 'Persönliches Profil.', support: 'Support.',
    terms: 'Rechtliches.', language: 'App-Sprache.', email: 'E-Mail & Passwort.',
    ad: 'Werbung & Partnerschaften.', del: 'Konto löschen.', adBody: 'Anfragen zu Werbung und Geschäftsmöglichkeiten.',
    navAccount: 'Konto' },
  GB: EN,
  FR: { company: 'Profil de l’entreprise.', personal: 'Profil personnel.', support: 'Support.',
    terms: 'Conditions & politiques.', language: 'Langue de l’application.', email: 'E-mail & mot de passe.',
    ad: 'Publicité & partenariats.', del: 'Supprimer le compte.', adBody: 'Demandes publicitaires et opportunités commerciales.',
    navAccount: 'Compte' },
  PL: { company: 'Profil firmy.', personal: 'Profil osobisty.', support: 'Pomoc.',
    terms: 'Regulaminy i polityki.', language: 'Język aplikacji.', email: 'E-mail i hasło.',
    ad: 'Reklama i partnerstwa.', del: 'Usuń konto.', adBody: 'Zapytania reklamowe i możliwości współpracy biznesowej.',
    navAccount: 'Konto' },
  // IT was in the runner's market loop but missing here, so [IT] crashed with
  // "T.company undefined" before any check ran (found 2026-07-31). Titles from
  // the IT_IT dictionary — the IT edition defaults to Italian.
  IT: { company: 'Profilo aziendale.', personal: 'Profilo personale.', support: 'Supporto.',
    terms: 'Termini e politiche.', language: 'Lingua dell’app.', email: 'E-mail e password.',
    ad: 'Pubblicità e partnership.', del: 'Elimina account.', adBody: 'Richieste pubblicitarie e opportunità di collaborazione.',
    navAccount: 'Account' },
}[COUNTRY];

const browser = await chromium.launch();

/** Bounding box (centre) of the card whose CardTitle is exactly `title`. */
async function cardBox(page, title) {
  // The title span sits at the top of its Card; walk up to the bordered card div.
  const loc = page.locator(`text="${title}"`).first();
  if (!(await loc.count())) return null;
  return loc.evaluate(el => {
    let card = el;
    while (card && !(card.style && card.style.borderRadius === '18px')) card = card.parentElement;
    const r = (card ?? el).getBoundingClientRect();
    return { x: r.x, y: r.y, cx: r.x + r.width / 2, w: r.width };
  });
}

async function run(role) {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 980 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 140)));

  await page.goto(`${BASE}&as=${role}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  await page.locator(`[title="${TITLES.navAccount}"]`).first().click();
  await page.waitForTimeout(1500);

  console.log(`\n[${COUNTRY} · ${role}]`);
  const T = TITLES;
  const profileTitle = role === 'member' ? T.personal : T.company;

  const boxes = {};
  for (const [k, title] of [['company', profileTitle], ['support', T.support], ['terms', T.terms],
    ['language', T.language], ['email', T.email], ['ad', T.ad], ['del', T.del]]) {
    boxes[k] = await cardBox(page, title);
  }
  const allPresent = Object.entries(boxes).every(([, b]) => b);
  check('all seven base cards render', allPresent, JSON.stringify(Object.fromEntries(Object.entries(boxes).map(([k, v]) => [k, !!v]))));
  if (!allPresent) { await ctx.close(); return errors; }

  // ── Desktop columns: left cards share a smaller centre-x than right cards ──
  const leftCx = Math.max(boxes.company.cx, boxes.support.cx, boxes.terms.cx);
  const rightCx = Math.min(boxes.language.cx, boxes.email.cx, boxes.ad.cx, boxes.del.cx);
  check('[desktop] left column sits left of the right column', leftCx < rightCx, `leftMax=${Math.round(leftCx)} rightMin=${Math.round(rightCx)}`);

  // ── Left column order: Company → Support → Terms (top to bottom) ──
  check('[desktop] left column order = Company, Support, Terms',
    boxes.company.y < boxes.support.y && boxes.support.y < boxes.terms.y,
    `y: company=${Math.round(boxes.company.y)} support=${Math.round(boxes.support.y)} terms=${Math.round(boxes.terms.y)}`);

  // ── Right column order: App language → Email → Advertising → Delete ──
  check('[desktop] right column order = App language, Email, Advertising, Delete',
    boxes.language.y < boxes.email.y && boxes.email.y < boxes.ad.y && boxes.ad.y < boxes.del.y,
    `y: lang=${Math.round(boxes.language.y)} email=${Math.round(boxes.email.y)} ad=${Math.round(boxes.ad.y)} del=${Math.round(boxes.del.y)}`);

  // ── Advertising card ──
  const adText = await page.locator('[data-testid="marketing-email"]').first();
  check('[ad] marketing email is shown', (await adText.count()) === 1 && (await adText.innerText()) === 'marketing@heatpumpdb.eu');
  check('[ad] it is a mailto link', (await adText.getAttribute('href')) === 'mailto:marketing@heatpumpdb.eu');
  const body = await page.locator('body').innerText();
  check('[ad] body text is present in the market language', body.includes(T.adBody));
  check('[ad] no form / CTA inside the Advertising card',
    await page.locator(`text="${T.ad}"`).first().evaluate((el, adBody) => {
      let card = el;
      while (card && !(card.style && card.style.borderRadius === '18px')) card = card.parentElement;
      if (!card) return false;
      return !card.querySelector('input, textarea, select, button') && card.innerText.includes(adBody);
    }, T.adBody));

  // ── Support: wording kept, email removed from THIS card, form still opens ──
  check('[support] the Account Support card no longer shows support@heatpumpdb.eu',
    await page.locator(`text="${T.support}"`).first().evaluate(el => {
      let card = el;
      while (card && !(card.style && card.style.borderRadius === '18px')) card = card.parentElement;
      return card ? !card.innerText.includes('support@heatpumpdb.eu') : false;
    }));
  check('[support] the "New inquiry" control is still present', (await page.locator('text=/New inquiry|Neue Anfrage|Nouvelle demande|Nowe zgłoszenie|Nuova richiesta/').count()) > 0);

  // ── Team card position (role-based) ──
  if (role === 'owner' || role === 'member') {
    // Team titles follow the same default-language rule (DE/GB → English, FR → French).
    const teamTitle = role === 'owner'
      ? (COUNTRY === 'DE' ? 'Teamverwaltung.' : COUNTRY === 'FR' ? 'Gestion de l’équipe.' : COUNTRY === 'PL' ? 'Zarządzanie zespołem.' : COUNTRY === 'IT' ? 'Gestione del team.' : 'Team management.')
      : (COUNTRY === 'DE' ? 'Ihr Team.' : COUNTRY === 'FR' ? 'Votre équipe.' : COUNTRY === 'PL' ? 'Twój zespół.' : COUNTRY === 'IT' ? 'Il tuo team.' : 'Your team.');
    const team = await cardBox(page, teamTitle);
    check(`[${role}] the team card renders in the right column, above App language`,
      !!team && team.cx > leftCx - 1 && team.y < boxes.language.y,
      team ? `teamCx=${Math.round(team.cx)} teamY=${Math.round(team.y)} langY=${Math.round(boxes.language.y)}` : 'team card not found');
  }

  check('no page errors', errors.length === 0, errors[0] ?? '');
  await ctx.close();
  return errors;
}

for (const role of ['pro', 'owner', 'member']) await run(role);

/* ── Narrow (single-column) mode of the shared Account page ─────────────────
   The phone (<700px) uses a separate curated shell; the SHARED AccountPage is
   used for tablet/desktop (≥700px) and collapses to one column at ≤860px
   (hpiq.css). 760px exercises exactly that collapse on the shared component. */
{
  const ctx = await browser.newContext({ viewport: { width: 760, height: 1000 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}&as=pro`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  await page.locator(`[title="${TITLES.navAccount}"]`).first().click();
  await page.waitForTimeout(1500);
  console.log(`\n[${COUNTRY} · single-column @760px]`);

  const T = TITLES;
  const seq = [['company', T.company], ['language', T.language], ['email', T.email],
    ['support', T.support], ['ad', T.ad], ['terms', T.terms], ['del', T.del]];
  const ys = [];
  for (const [, title] of seq) { const b = await cardBox(page, title); ys.push(b ? b.y : null); }
  check('[mobile] all cards present', ys.every(y => y != null));
  const ordered = ys.every((y, i) => i === 0 || (ys[i - 1] != null && y > ys[i - 1]));
  check('[mobile] order = Company, App language, Email, Support, Advertising, Terms, Delete', ordered,
    seq.map(([k], i) => `${k}=${Math.round(ys[i])}`).join(' '));

  // No horizontal overflow.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  check('[mobile] no horizontal overflow', !overflow);
  await ctx.close();
}

await browser.close();
console.log(`\n${COUNTRY}: ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
