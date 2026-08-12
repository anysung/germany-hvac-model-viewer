/**
 * Sign Up + Account + Team + policies — browser tests (Playwright, dev server).
 *
 * Usage: node tests/signup-account.e2e.mjs <DE|GB|FR> <port>
 *
 * The dev server is started by the caller with VITE_REGISTRATION_OPEN=true, so
 * the REOPENED Sign Up form can be exercised. The pause itself is covered by
 * tests/registration-pause.e2e.mjs, which runs against the shipped flag.
 *
 * The team Account shapes are driven through the DEV preview (?preview=hpiq&as=…)
 * so the tests never write organizations into the live Firestore.
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const COUNTRY = (process.argv[2] || 'DE').toUpperCase();
const PORT = process.argv[3] || '5199';
const BASE = `http://localhost:${PORT}/`;
const SECRETS = process.env.HPDB_TEST_SECRETS || '.';
const PW = readFileSync(`${SECRETS}/e2e-pw.txt`, 'utf8').trim();
const APPCHECK = readFileSync(`${SECRETS}/appcheck-debug-token.txt`, 'utf8').trim();
const USER = 'e2e-verify@heatpumpdb.de';

const LANG = { DE: 'en', GB: 'en', FR: 'fr' }[COUNTRY];
const SIGNUP_BTN = /Sign Up|Registrieren|Créer un compte|Zarejestruj się|Registrati/i;
const LOGIN_BTN = /Log In|Anmelden|Se connecter|Zaloguj się|Accedi/i;

let passed = 0, failed = 0;
const check = (name, ok, detail = '') => {
  if (ok) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.error(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
await ctx.addInitScript(t => { window.FIREBASE_APPCHECK_DEBUG_TOKEN = t; }, APPCHECK);
const page = await ctx.newPage();

console.log(`\nSign Up / Account / Team — ${COUNTRY} edition\n`);

/* ── 1. SIGN UP (registration reopened) ─────────────────────────────────── */
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
await page.getByRole('button', { name: SIGNUP_BTN }).first().click();
await page.waitForTimeout(700);

check('signup form is rendered (registration reopened)', await page.locator('[data-testid="signup-form"]').isVisible());

for (const f of ['su-first', 'su-last', 'su-email', 'su-password', 'su-company-name', 'su-company-type']) {
  check(`required field present: ${f}`, (await page.locator(`[data-testid="${f}"]`).count()) === 1);
}
check('optional field present: company city', (await page.locator('[data-testid="su-city"]').count()) === 1);
check('optional field present: company website', (await page.locator('[data-testid="su-website"]').count()) === 1);

const body = await page.locator('body').innerText();
check('Job Role field removed', !/Job Role|Funktion|Fonction/i.test(body));
check('Referral Source field removed', !/Referral|Wie sind Sie auf uns|Source de/i.test(body));
check('no separate country field', !/^Country$|Land \*|Pays \*/m.test(body));
check('company guidance shown', await page.locator('[data-testid="su-company-guidance"]').isVisible());

// Company types: the controlled list
const options = await page.locator('[data-testid="su-company-type"] option').allInnerTexts();
check('10 company types offered', options.length === 11, `got ${options.length} (incl. placeholder)`);

// Individual / Sole Trader guidance
await page.selectOption('[data-testid="su-company-type"]', 'individual');
await page.waitForTimeout(250);
check('Individual / Sole Trader guidance appears', await page.locator('[data-testid="su-individual-hint"]').isVisible());

// "Other" requires the detail field
await page.selectOption('[data-testid="su-company-type"]', 'other');
await page.waitForTimeout(250);
check('"Other" reveals the detail field', await page.locator('[data-testid="su-company-type-other"]').isVisible());

// Validation: consent is required
const fill = async () => {
  const probe = `probe-${Date.now()}@example.com`;
  await page.fill('[data-testid="su-first"]', 'Test');
  await page.fill('[data-testid="su-last"]', 'User');
  await page.fill('[data-testid="su-email"]', probe);
  // Re-entry is required: the account email is immutable, so a typo is not a
  // correctable mistake (2026-08-13).
  await page.fill('[data-testid="su-email-confirm"]', probe);
  await page.fill('[data-testid="su-password"]', 'Sup3rSecret!');
  await page.fill('[data-testid="su-company-name"]', 'Probe GmbH');
  await page.selectOption('[data-testid="su-company-type"]', 'installer');
};
await fill();
await page.click('[data-testid="su-submit"]');
await page.waitForTimeout(400);
check('terms acceptance is required', await page.locator('[data-testid="su-error"]').isVisible());

// Validation: the two email fields must agree, and a typo'd domain is offered a fix
await fill();
await page.fill('[data-testid="su-email-confirm"]', 'someone-else@example.com');
await page.check('[data-testid="su-consent"]');
await page.click('[data-testid="su-submit"]');
await page.waitForTimeout(400);
check('mismatched confirmation email is rejected', await page.locator('[data-testid="su-error"]').isVisible());

await page.fill('[data-testid="su-email"]', 'someone@gmial.com');
await page.waitForTimeout(250);
check('a mistyped domain is offered a correction', await page.locator('[data-testid="su-email-hint"]').isVisible());
await page.locator('[data-testid="su-email-hint"]').click();
await page.waitForTimeout(250);
check('accepting the correction rewrites the address',
  (await page.inputValue('[data-testid="su-email"]')) === 'someone@gmail.com');

// Validation: website format
await page.check('[data-testid="su-consent"]');
await page.fill('[data-testid="su-website"]', 'not a website');
await page.click('[data-testid="su-submit"]');
await page.waitForTimeout(400);
check('invalid website is rejected', await page.locator('[data-testid="su-error"]').isVisible());

// Policy links on the signup page
check('Terms link on signup', (await page.locator('[data-testid="su-terms-link"]').getAttribute('href')) === '/terms');
check('Privacy link on signup', (await page.locator('[data-testid="su-privacy-link"]').getAttribute('href')) === '/privacy');
check('CTA reads "continue to plan selection"',
  /plan selection|Tarifauswahl|choix de la formule|wyboru planu|scelta del piano/i.test(await page.locator('[data-testid="su-submit"]').innerText()));

/* ── 2. PUBLIC POLICY PAGES (no login; Paddle-review business identity) ────── */
// Every legal page is public over the same domain, shows the brand and the one
// support contact, and never carries a "to be completed" placeholder or app-store
// wording (billing is web-only via Paddle). The verified operator identity now
// lives in the Legal Notice; the sensitive registration NUMBER appears ONLY there.
const FORBIDDEN = [
  [/to be completed|zu ergänzen|à compléter|\[.*?\]/i, 'placeholder'],
  // Widened 2026-08-02: the old pattern missed "Store subscriptions" (EN) and
  // "abonnements boutique" (FR), which survived in the delete-account dialog
  // long after app-store distribution was dropped.
  [/app store|App-Store|Google Play|in-app purchase|boutique d.applications|store subscription|abonnements? boutique|restore purchases?/i, 'app-store wording'],
];

for (const [path, id] of [['/privacy', 'legal-privacy'], ['/terms', 'legal-terms'], ['/refund-policy', 'legal-refund'], ['/imprint', 'legal-imprint']]) {
  const p2 = await ctx.newPage();
  await p2.goto(`${BASE.replace(/\/$/, '')}${path}`, { waitUntil: 'domcontentloaded' });
  await p2.waitForTimeout(900);
  check(`${path} opens without a login`, await p2.locator(`[data-testid="${id}"]`).isVisible().catch(() => false));
  const text = await p2.locator('body').innerText();
  check(`${path} shows "HeatPump DataBase (Europe)"`, text.includes('HeatPump DataBase (Europe)'));
  check(`${path} shows support@heatpumpdb.eu`, text.includes('support@heatpumpdb.eu'));
  // The business registration number is sensitive: Legal Notice only.
  check(`${path} shows the registration number only on the Legal Notice`,
    text.includes('854-76-00547') === (path === '/imprint'));
  for (const [re, label] of FORBIDDEN) {
    check(`${path} has no ${label}`, !re.test(text), re.test(text) ? `matched: ${(text.match(re) || [])[0]}` : '');
  }
  await p2.close();
}

// The Legal Notice carries the full verified operator identity (Paddle review):
// operator, owner, registered address, registration number, contact, brand, MoR.
const imp = await ctx.newPage();
await imp.goto(`${BASE.replace(/\/$/, '')}/imprint`, { waitUntil: 'domcontentloaded' });
await imp.waitForTimeout(700);
const impText = await imp.locator('[data-testid="legal-imprint"]').innerText();
// Six sections since 2026-08-04: "Owner and Operator" is no longer its own
// section — the owner's name appears only as "(Operator: …)" inside the
// address block (owner decision: minimise personal exposure).
check('/imprint has the six Legal Notice sections', (await imp.locator('[data-testid="legal-imprint"] section').count()) === 6);
for (const fact of [
  'A Company', 'Yong Soo Sung', '854-76-00547',
  '1st Floor, 16-32, Seogyeong-ro 2-gil', 'Seongbuk-gu, Seoul', 'Republic of Korea',
  'support@heatpumpdb.eu', 'Paddle.com Market Ltd', 'HeatPump DataBase (Europe)™',
]) {
  check(`/imprint shows "${fact}"`, impText.includes(fact));
}
// Terms name the operator and point to the Legal Notice; Privacy names the controller.
const termsText = await (async () => { const t = await ctx.newPage(); await t.goto(`${BASE.replace(/\/$/, '')}/terms`, { waitUntil: 'domcontentloaded' }); await t.waitForTimeout(600); const x = await t.locator('body').innerText(); await t.close(); return x; })();
check('/terms identifies A Company as operator', /A Company/.test(termsText));
check('/terms links to / references the Legal Notice', /Legal Notice|Impressum|Mentions légales|Informacj\w* o usługodawcy|Note legali/i.test(termsText));
const privText = await (async () => { const t = await ctx.newPage(); await t.goto(`${BASE.replace(/\/$/, '')}/privacy`, { waitUntil: 'domcontentloaded' }); await t.waitForTimeout(600); const x = await t.locator('body').innerText(); await t.close(); return x; })();
// The 2026-08-04 minimisation moved the owner's name OUT of Privacy — the
// controller is named as the company, personal details live in the Legal
// Notice only. The name reappearing here would be the regression.
check('/privacy names A Company as controller, without the owner name',
  /A Company/.test(privText) && !/Yong Soo Sung/.test(privText));
check('/privacy does NOT claim A Company is EU-established',
  !/(established|incorporated|registered)\s+(in\s+)?(the\s+)?(EU|European Union)/i.test(privText));
await imp.close();

/* ── 3. ACCOUNT (professional) — real signed-in user ────────────────────── */
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);
await page.getByRole('button', { name: LOGIN_BTN }).first().click();
await page.waitForTimeout(700);
await page.fill('input[type="email"]', USER);
await page.fill('input[type="password"]', PW);
await page.click('button[type="submit"]');
await page.waitForTimeout(14000);
check('existing user still logs in', (await page.locator('[class*="hp-gnav"]').count()) > 0);

// The onboarding-tour invite opens over everything on a fresh profile (every
// Playwright context is one) and intercepts pointer events — dismiss it with
// "snooze today" before touching the nav.
const tourInvite = page.locator('[data-testid="tour-today"]');
if (await tourInvite.count()) { await tourInvite.click(); await page.waitForTimeout(400); }
// data-testid, not title: the title attribute is localized (DE "Konto",
// IT "Account", PL "Konto") and a language-dependent locator dies per edition.
await page.locator('[data-testid="nav-account"]').first().click();
await page.waitForTimeout(3000);
const acc = await page.locator('body').innerText();
check('"Use on the web" section is gone', !/Use on the web|Im Web nutzen|Utiliser sur le web/i.test(acc));
check('no "Copy link" / "Email me the link" buttons', !/Copy link|Link kopieren|Email me the link|M’envoyer le lien/i.test(acc));
check('Company profile card shown', /Company profile|Unternehmensprofil|Profil de l’entreprise|Profil firmy|Profilo aziendale/i.test(acc));
check('Job Role row removed from Account', !/Job Role|Funktion:/i.test(acc));
check('policy links on Account', (await page.locator('[data-testid="policy-privacy"]').count()) > 0);
check('New inquiry still available', /New inquiry|Neue Anfrage|Nouvelle demande|Nowe zgłoszenie|Nuova richiesta/i.test(acc));
// Support became in-app-only (2026-08-04 support redesign): no mailto address
// on the Account page — the entry point is the New-inquiry control instead.
check('in-app support entry present (no mailto)', (await page.locator('[data-testid="support-new-inquiry"]').count()) > 0);
check('"A Company" appears on Account only in the Disclaimer', (acc.match(/A Company/g) || []).length === 1 && /protected database|geschützte Datenbank|base de données protégée|bazą danych chronioną|banca dati protetta/i.test(acc));
check('Email & password card still there', /Email & password|E-Mail & Passwort|E-mail & mot de passe|E-mail i hasło|E-mail e password/i.test(acc));
check('App language card still there', /App language|App-Sprache|Langue de l’application|Język aplikacji|Lingua dell’app/i.test(acc));
check('Delete account still there', (await page.locator('[data-testid="delete-account"]').count()) > 0);
check('profile edit is available', (await page.locator('[data-testid="edit-company"]').count()) > 0);
check('no team card for a professional', (await page.locator('[data-testid="manage-team"]').count()) === 0);

/* ── 4. TEAM OWNER (dev preview) ────────────────────────────────────────── */
const owner = await ctx.newPage();
await owner.goto(`${BASE}?preview=hpiq&as=owner`, { waitUntil: 'domcontentloaded' });
await owner.waitForTimeout(3000);
{ const ti = owner.locator('[data-testid="tour-today"]'); if (await ti.count()) { await ti.click(); await owner.waitForTimeout(400); } }
await owner.locator('[data-testid="nav-account"]').first().click();
await owner.waitForTimeout(1200);
check('[owner] Team management card visible', await owner.locator('[data-testid="manage-team"]').isVisible());
check('[owner] seats shown as "2 of 3 seats used"', /2 (of|von|di) 3|2 sièges sur 3|Zajęte miejsca: 2 z 3/i.test(await owner.locator('[data-testid="team-seats"]').innerText()));
check('[owner] pending invitation count shown', /1/.test(await owner.locator('[data-testid="team-pending"]').innerText()));

await owner.locator('[data-testid="manage-team"]').click();
await owner.waitForTimeout(900);
check('[owner] Team management subview opens', await owner.locator('[data-testid="team-management"]').isVisible());
const tm = await owner.locator('body').innerText();
check('[owner] active members listed', /Tom Klein|Anna Berger/.test(tm));
check('[owner] pending invitation listed', /neu@nordwind.example/.test(tm));
check('[owner] resend + cancel actions', (await owner.locator('[data-testid="resend-invite"]').count()) > 0 && (await owner.locator('[data-testid="cancel-invite"]').count()) > 0);
check('[owner] remove-member action for a member', (await owner.locator('[data-testid="remove-member"]').count()) === 1);
check('[owner] owner cannot remove themselves (only 1 remove button for 2 members)', (await owner.locator('[data-testid="remove-member"]').count()) === 1);
check('[owner] seat limit enforced: no invite box when full', (await owner.locator('[data-testid="no-seats"]').count()) === 1);
check('[owner] company settings editable', (await owner.locator('[data-testid="edit-org-company"]').count()) === 1);
check('[owner] ownership-transfer guidance points at Support', /New inquiry|Neue Anfrage|Nouvelle demande|Nowe zgłoszenie|Nuova richiesta/i.test(tm));
await owner.locator('[data-testid="team-back"]').click();
await owner.waitForTimeout(600);
check('[owner] back returns to the account', (await owner.locator('[data-testid="team-management"]').count()) === 0);
await owner.close();

/* ── 5. TEAM MEMBER (dev preview) ───────────────────────────────────────── */
const member = await ctx.newPage();
await member.goto(`${BASE}?preview=hpiq&as=member`, { waitUntil: 'domcontentloaded' });
await member.waitForTimeout(3000);
{ const ti = member.locator('[data-testid="tour-today"]'); if (await ti.count()) { await ti.click(); await member.waitForTimeout(400); } }
await member.locator('[data-testid="nav-account"]').first().click();
await member.waitForTimeout(1200);
const mem = await member.locator('body').innerText();
check('[member] "Your team" card shown', /Your team|Ihr Team|Votre équipe|Twój zespół|Il tuo team/i.test(mem));
check('[member] team info is read-only (no manage button)', (await member.locator('[data-testid="manage-team"]').count()) === 0);
check('[member] no invite controls', (await member.locator('[data-testid="invite-email"]').count()) === 0);
check('[member] no member-removal controls', (await member.locator('[data-testid="remove-member"]').count()) === 0);
check('[member] company info marked as managed by the admin', /Managed by your team administrator|Wird von Ihrem Team-Administrator|Géré par votre administrateur|Zarządzane przez administratora|Gestito dall’amministratore/i.test(mem));
check('[member] Leave team available', await member.locator('[data-testid="leave-team"]').isVisible());
check('[member] Delete account is separate from Leave team', (await member.locator('[data-testid="delete-account"]').count()) === 1);
check('[member] personal profile card shown', /Personal profile|Persönliches Profil|Profil personnel|Profil osobisty|Profilo personale/i.test(mem));
await member.close();

await browser.close();
console.log(`\n${COUNTRY}: ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
