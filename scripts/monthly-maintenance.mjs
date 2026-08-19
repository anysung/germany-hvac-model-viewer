#!/usr/bin/env node
/**
 * monthly-maintenance.mjs — the unattended monthly window.
 *
 * 00:00 Europe/Berlin on the 1st: the service goes down with a notice.
 * 00:05: this runs. Everything must be finished by 04:00, or the window closes
 * itself on the version that was already live.
 *
 * WHY A WINDOW AT ALL
 * Datasets, news and the deployed sites have to move together. A visitor who
 * arrives mid-run would otherwise see a catalogue from one epoch, news from
 * another, and pages built against a third. Three hours at European night costs
 * almost nothing; an incoherent site costs trust.
 *
 * ORDER, AND WHY
 *   1  fetch + build + gate      reversible. Nothing outside this machine has
 *                                changed yet, so any failure here is free.
 *   2  publish datasets          the point of no return: Storage now serves the
 *                                new catalogue. Guarded by the gate above and
 *                                recoverable through the snapshot set.
 *   3  news                      AFTER the database, by owner's instruction —
 *                                the month's articles describe the data that has
 *                                just landed. Non-fatal: news failing must not
 *                                strand a good catalogue behind a notice.
 *   4  export news snapshot      the site build reads the committed snapshot,
 *                                so this has to sit between news and build.
 *   5  build + deploy all sites  last, so every surface ships one epoch.
 *
 * Germany leads inside step 1 because GB, FR, PL and IT all derive from the
 * built German datasets — update-all.mjs already owns that graph and is called
 * rather than reimplemented.
 *
 * ON FAILURE the run stops where it is, writes what happened, tells the owner,
 * and LEAVES THE NOTICE UP so nobody meets a half-updated service. It does not
 * decide anything by itself. If no instruction arrives, the 03:00 closer
 * (--close) lifts the notice on whatever was last serving.
 *
 * EPREL IS crawled here. It was left out on the assumption that 45k records
 * means hours — measured, it is 457 pages at 1s, about eight minutes. Leaving it
 * to a second schedule would have been a second thing to remember for no gain,
 * and the French join reads it, so a stale EPREL quietly stops matching new
 * models. It is non-fatal: without a key, or on a bad crawl, the window carries
 * on with last month's snapshot rather than holding the catalogue back.
 *
 *   node scripts/monthly-maintenance.mjs --run        the window
 *   node scripts/monthly-maintenance.mjs --close      lift the notice (04:00 guard)
 *   node scripts/monthly-maintenance.mjs --status     what happened last time
 *   node scripts/monthly-maintenance.mjs --run --dry-run
 */
import { execSync } from 'node:child_process';
import { writeFileSync, readFileSync, existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PROJECT = 'gen-lang-client-0324244302';
const FS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const STATE_DIR = join(ROOT, '.maintenance');
const STATE = join(STATE_DIR, 'state.json');
const LOG_DIR = join(ROOT, '.maintenance', 'logs');

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const MODE = args.includes('--close') ? 'close' : args.includes('--status') ? 'status' : 'run';
const runId = new Date().toISOString().replace(/[:.]/g, '-');

mkdirSync(STATE_DIR, { recursive: true });
mkdirSync(LOG_DIR, { recursive: true });
const LOG = join(LOG_DIR, `${runId}.log`);
const say = (m) => { const line = `[${new Date().toISOString()}] ${m}`; console.log(line); try { appendFileSync(LOG, line + '\n'); } catch {} };

/* ── Environment ─────────────────────────────────────────────────────────────
   launchd starts with almost nothing, and the keys this run needs are already
   on this machine — SECRET_KEY in .env, EPREL_API_KEY in .env.local, both
   gitignored and both entered long before this window existed. Asking the owner
   to copy them into a third file would have been a second place to keep in sync
   and a second place to leak them from. They are read here, in order, and an
   existing environment variable always wins so a manual run can override. */
for (const f of ['.env', '.env.local', join(process.env.HOME ?? '', '.heatpumpdb', 'env')]) {
  const path = f.startsWith('/') ? f : join(ROOT, f);
  if (!existsSync(path)) continue;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;                                    // comments and blanks
    const [, k, rawV] = m;
    if (process.env[k]) continue;                        // never clobber the caller
    process.env[k] = rawV.trim().replace(/^["']|["']$/g, '');
  }
}

const token = () => execSync('gcloud auth print-access-token', { encoding: 'utf8' }).trim();

/* ── Berlin wall-clock ───────────────────────────────────────────────────────
   The window is defined where the USERS are, not where this Mac is. launchd
   only understands local time and knows nothing about European summer time, so
   every decision about "is it the window yet" is made here against Europe/Berlin
   and the launchd trigger merely has to fire often enough to catch it. */
const BERLIN = 'Europe/Berlin';
const berlinParts = (d = new Date()) => {
  const p = new Intl.DateTimeFormat('sv-SE', {
    timeZone: BERLIN, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(d).reduce((a, x) => (a[x.type] = x.value, a), {});
  return { date: `${p.year}-${p.month}-${p.day}`, day: +p.day, hour: +p.hour, minute: +p.minute };
};

/** The instant at which Berlin's wall clock reads today h:m — DST-correct.
 *  Converge by measuring the offset at the guess rather than assuming one:
 *  a fixed +1/+2 would be wrong twice a year, and one of those days is a
 *  Sunday in October when the hour runs twice. */
const berlinISOToday = (h, m) => {
  const { date } = berlinParts();
  const wanted = `${date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
  let guess = new Date(`${wanted}Z`);
  for (let i = 0; i < 3; i++) {
    const seen = new Intl.DateTimeFormat('sv-SE', {
      timeZone: BERLIN, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).format(guess).replace(' ', 'T');
    guess = new Date(guess.getTime() + (new Date(`${wanted}Z`) - new Date(`${seen}Z`)));
  }
  return guess.toISOString();
};

async function setMaintenance(active, until) {
  if (DRY) { say(`DRY: maintenance ${active ? 'ON' : 'OFF'}`); return; }
  const fields = {
    active: { booleanValue: active },
    since: { stringValue: new Date().toISOString() },
    until: until ? { stringValue: until } : { nullValue: null },
    runId: { stringValue: runId },
  };
  const res = await fetch(`${FS}/config/maintenance?updateMask.fieldPaths=active`
    + '&updateMask.fieldPaths=since&updateMask.fieldPaths=until&updateMask.fieldPaths=runId', {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token()}`, 'x-goog-user-project': PROJECT, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error(`maintenance flag ${active ? 'ON' : 'OFF'} failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
  say(`maintenance ${active ? 'ON' : 'OFF'}`);
}

/** What the SERVICE currently says — not what this machine remembers. */
async function liveMaintenance() {
  const res = await fetch(`${FS}/config/maintenance`, {
    headers: { Authorization: `Bearer ${token()}`, 'x-goog-user-project': PROJECT },
  });
  if (res.status === 404) return false;
  if (!res.ok) throw new Error(`could not read the maintenance flag: ${res.status}`);
  return ((await res.json()).fields?.active?.booleanValue) === true;
}

const saveState = (s) => writeFileSync(STATE, JSON.stringify({ ...s, runId, at: new Date().toISOString() }, null, 2) + '\n');
const loadState = () => (existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : null);

function step(name, cmd, { fatal = true } = {}) {
  say(`── ${name}`);
  if (DRY) { say(`   DRY: ${cmd}`); return true; }
  try {
    execSync(cmd, { cwd: ROOT, stdio: 'inherit', env: process.env });
    return true;
  } catch (e) {
    if (!fatal) { say(`   NON-FATAL failure: ${name} — continuing (${e.message.slice(0, 120)})`); return false; }
    throw new Error(`${name} failed: ${e.message.slice(0, 300)}`);
  }
}

/* ── window guard ────────────────────────────────────────────────────────────
   launchd fires this on a local-time schedule that brackets the target, and the
   guard decides whether this particular firing is the one. Without it the job
   would run an hour early or late for half the year. */
if (args.includes('--if-window')) {
  const b = berlinParts();
  const wantHour = MODE === 'close' ? 4 : 0;
  const ok = b.day === 1 && b.hour === wantHour;
  if (!ok) {
    console.log(`not the window (Berlin ${b.date} ${String(b.hour).padStart(2, '0')}:${String(b.minute).padStart(2, '0')}) — exiting`);
    process.exit(0);
  }
  console.log(`window matched: Berlin ${b.date} ${String(b.hour).padStart(2, '0')}:${String(b.minute).padStart(2, '0')}`);
}

/* ── status ──────────────────────────────────────────────────────────────── */
if (MODE === 'status') {
  const s = loadState();
  console.log(s ? JSON.stringify(s, null, 2) : 'no run recorded yet');
  process.exit(0);
}

/* ── close: the 04:00 guard ──────────────────────────────────────────────── */
if (MODE === 'close') {
  const s = loadState();
  // Ask the SERVICE, never this machine's memory. A state file that says "done"
  // while the notice is still up is exactly how five sites stay dark for a day:
  // the run can be interrupted after writing state, the state file can be stale
  // from a dry run, or a person can have raised the notice by hand. The guard
  // exists for the case where something went wrong, so it must not trust the
  // record written by the thing that went wrong.
  const live = await liveMaintenance();
  if (!live) {
    say('the service is already serving normally — nothing to lift');
    if (s?.phase !== 'done') saveState({ ...(s ?? {}), phase: 'closed-noop', closedAt: new Date().toISOString() });
    process.exit(0);
  }
  say(s?.phase === 'failed'
    ? `notice is still up after a failure in "${s.failedStep}" and no instruction arrived — restoring service on the version that was already live`
    : `notice is still up (last recorded phase: ${s?.phase ?? 'none'}) — restoring service on the version that was already live`);
  await setMaintenance(false, null);
  saveState({ ...(s ?? {}), phase: 'closed-by-guard', closedAt: new Date().toISOString() });
  say('service resumed. The update was NOT applied; sources are unchanged on disk for inspection.');
  process.exit(0);
}

/* ── run ─────────────────────────────────────────────────────────────────── */
const until = berlinISOToday(4, 0);
say(`monthly window ${runId} — must finish by 04:00 Europe/Berlin (${until})`);
saveState({ phase: 'starting' });

try {
  await setMaintenance(true, until);
  saveState({ phase: 'running', step: 'maintenance-on' });

  // 1 — everything reversible: fetch, build every market, gate.
  saveState({ phase: 'running', step: 'sources+build+gate' });
  step('fetch sources, build all markets, verify (DE first; GB/FR/PL/IT derive from it)',
    'node scripts/update-all.mjs --fetch');

  // 1b — EPREL, before anything that reads it.
  saveState({ phase: 'running', step: 'eprel' });
  step('refresh EPREL snapshot (EU energy-label registry)',
    'node scripts/eprel/fetch-eprel-raw.mjs --full', { fatal: false });

  // 1c — France's own layer, which joins the register to that EPREL snapshot.
  saveState({ phase: 'running', step: 'fr-agrement' });
  step('FR: ADEME agrément register snapshot', 'node scripts/fr/fetch-ademe.mjs');
  step('FR: recover type/refrigerant/usage facets', 'node scripts/fr/enrich-agrement-facets.mjs');
  step('FR: join agrément ↔ EPREL', 'node scripts/fr/enrich-agrement-from-eprel.mjs');
  step('FR: match canonical ↔ agrément (listing overlay)', 'node scripts/fr/match-canonical-to-agrement.mjs', { fatal: false });
  step('FR: rebuild datasets with the native layer', 'node scripts/fr/build-app-products-fr.mjs');

  // 2 — point of no return.
  saveState({ phase: 'running', step: 'publish-datasets' });
  step('publish datasets (gate + upload + serving verification)', 'node scripts/upload-datasets.mjs');

  // 3 — news, after the database it describes. Never fatal.
  saveState({ phase: 'running', step: 'news' });
  const newsOk = step('news + policies (all markets)',
    `node scripts/news/trigger-monthly-news.mjs`, { fatal: false });

  // 4 — the snapshot the site build reads.
  saveState({ phase: 'running', step: 'news-snapshot' });
  if (newsOk) step('export public news snapshot', 'node scripts/export-news-public.mjs', { fatal: false });

  // 5 — every surface ships one epoch, the admin console included: it runs the
  // same app code, so leaving it on last month's bundle is how an ops screen
  // starts disagreeing with the service it is meant to describe.
  saveState({ phase: 'running', step: 'build+deploy' });
  step('build + deploy all sites',
    'npm run build:de && npm run build:uk && npm run build:fr && npm run build:pl && npm run build:it'
    + ' && npm run build:hub && npm run build:admin'
    + ' && firebase deploy --only hosting:de,hosting:uk,hosting:fr,hosting:pl,hosting:it,hosting:eu,hosting:hub');

  // 6 — record the epoch as the new baseline. Without this the gate keeps
  // comparing next month against the month before last and blocks a change it
  // already let through — which is how a gate teaches people to override it.
  saveState({ phase: 'running', step: 'approve-baseline' });
  step('approve the published set as the new baseline', 'node scripts/dataset-gate.mjs --approve');

  // 7 — the run edits COMMITTED files: match histories, the BAFA fetched-at
  // index, the public news snapshot, the manifests. Left uncommitted they are
  // one careless checkout from gone, and next month starts from a dirty tree.
  saveState({ phase: 'running', step: 'commit' });
  step('commit and push what the run changed',
    'git add -A && (git diff --cached --quiet || git commit -q -m '
    + `"chore(data): monthly update ${runId}" ) && git push -q origin main`, { fatal: false });

  await setMaintenance(false, null);
  saveState({ phase: 'done', newsOk });
  say('window complete — service resumed on the new epoch');
  process.exit(0);
} catch (err) {
  const s = loadState() ?? {};
  saveState({ ...s, phase: 'failed', failedStep: s.step ?? 'unknown', error: String(err.message ?? err) });
  say(`STOPPED: ${err.message ?? err}`);
  say('The notice stays UP and nothing further runs. Waiting for the owner.');
  say(`If no instruction arrives, the 04:00 guard restores service on the previous version.`);
  say(`log: ${LOG}`);
  process.exit(1);
}
