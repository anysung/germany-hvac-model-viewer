/**
 * Registration pause — UI tests (Playwright, against the dev server).
 *
 * The pause is a UI-level pause (see src/config/registration.ts), so these are
 * UI-level checks. Per country edition:
 *   1. the Sign Up entry is still visible;
 *   2. choosing it opens the localized maintenance notice with the reopening date;
 *   3. the registration form is NOT rendered (no inputs, no submit button);
 *   4. an existing approved member can still sign in and reach the app.
 *
 * Usage: node tests/registration-pause.e2e.mjs <DE|GB|FR> <port>
 *   (the caller starts the dev server for that edition — see tests/run-registration-e2e.sh)
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const COUNTRY = (process.argv[2] || 'DE').toUpperCase();
const PORT = process.argv[3] || '5199';
const BASE = `http://localhost:${PORT}/`;
const SCRATCH = process.env.HPDB_TEST_SECRETS || '.';

const EXISTING_USER = 'e2e-verify@heatpumpdb.de';
const EXISTING_PASS = readFileSync(`${SCRATCH}/e2e-pw.txt`, 'utf8').trim();
const APPCHECK_DEBUG = readFileSync(`${SCRATCH}/appcheck-debug-token.txt`, 'utf8').trim();

/** The localized notice each UI language must show. */
const NOTICE = {
  en: { title: 'Registration is temporarily unavailable', date: '7 August 2026' },
  de: { title: 'Registrierung vorübergehend nicht möglich', date: '7. August 2026' },
  fr: { title: 'Les inscriptions sont temporairement suspendues', date: '7 août 2026' },
  pl: { title: 'Rejestracja jest tymczasowo niedostępna', date: '7 sierpnia 2026' },
  it: { title: 'Le registrazioni sono temporaneamente sospese', date: '7 agosto 2026' },
};
/** Languages the edition must be able to show it in. */
const LANGS = { DE: ['en', 'de'], GB: ['en'], FR: ['fr'], PL: ['pl', 'en'], IT: ['it', 'en'] }[COUNTRY];
const DEFAULT_LANG = COUNTRY === 'FR' ? 'fr' : COUNTRY === 'PL' ? 'pl' : COUNTRY === 'IT' ? 'it' : 'en';

const SIGNUP_BTN = /Sign Up|Registrieren|Créer un compte|Zarejestruj się|Registrati/i;
const LOGIN_BTN = /Log In|Anmelden|Se connecter|Zaloguj się|Accedi/i;

let passed = 0;
let failed = 0;
const check = (name, ok, detail = '') => {
  if (ok) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.error(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
};

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
await page.addInitScript(t => { window.FIREBASE_APPCHECK_DEBUG_TOKEN = t; }, APPCHECK_DEBUG);

console.log(`\nRegistration pause — ${COUNTRY} edition (${BASE})\n`);

await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3500);

// ── 1. The Sign Up entry stays visible ───────────────────────────────────
check(
  'Sign Up entry is still visible on the landing page',
  await page.getByRole('button', { name: SIGNUP_BTN }).first().isVisible(),
);

// ── 2+3. It opens the localized notice, and no form is rendered ──────────
for (const lang of LANGS) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  if (lang !== DEFAULT_LANG) {
    await page.getByRole('button', { name: lang.toUpperCase(), exact: true }).first().click();
    await page.waitForTimeout(400);
  }
  await page.getByRole('button', { name: SIGNUP_BTN }).first().click();
  await page.waitForTimeout(800);

  const card = page.locator('[data-testid="registration-paused"]');
  check(`[${lang}] maintenance notice is shown`, await card.isVisible());

  const title = (await card.locator('h2').innerText().catch(() => '')).trim();
  check(`[${lang}] notice is localized`, title === NOTICE[lang].title, `got: "${title}"`);

  const date = (await page.locator('[data-testid="registration-reopen-date"]').innerText().catch(() => '')).trim();
  check(`[${lang}] reopening date shown as ${NOTICE[lang].date}`, date === NOTICE[lang].date, `got: "${date}"`);

  const inputs = await page.locator('form input').count();
  const submit = await page.locator('button[type="submit"]').count();
  check(`[${lang}] registration form is NOT rendered`, inputs === 0 && submit === 0, `inputs: ${inputs}, submit: ${submit}`);
}

// ── 3b. Social is offered as a LOGIN method only ─────────────────────────
// The pause used to be bypassable here: the notice's only button leads to the
// login screen, whose Google/Apple buttons created a full account for an
// unknown identity. Social no longer registers (authService.finishProviderSignIn),
// and the screen says so before the click.
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);
await page.getByRole('button', { name: LOGIN_BTN }).first().click();
await page.waitForTimeout(800);
{
  const google = page.getByRole('button', { name: /Google/i }).first();
  check('login screen still offers Google sign-in', await google.isVisible());
  const body = await page.locator('body').innerText();
  check(
    'social buttons are labelled as login-only (not a signup route)',
    /already exist|bereits bestehende|déjà existants|istniejących|già esistenti/i.test(body),
    body.slice(0, 200),
  );
}

// ── 4. Existing approved member can still sign in ────────────────────────
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);
await page.getByRole('button', { name: LOGIN_BTN }).first().click();
await page.waitForTimeout(800);
await page.locator('input[type="email"]').fill(EXISTING_USER);
await page.locator('input[type="password"]').fill(EXISTING_PASS);
await page.locator('button[type="submit"]').click();
await page.waitForTimeout(12000);

const signedIn =
  (await page.locator('[class*="hp-gnav"]').count()) > 0 ||
  (await page.getByText(/Products|Produkte|Produits/i).first().isVisible().catch(() => false));
check('existing approved user can still log in normally', signedIn);

await browser.close();
console.log(`\n${COUNTRY}: ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
