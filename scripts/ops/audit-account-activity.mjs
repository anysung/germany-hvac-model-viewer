#!/usr/bin/env node
/**
 * audit-account-activity.mjs — READ-ONLY abuse review for a set of accounts.
 *
 * WHY THIS EXISTS
 * The terms are one account per person and no data extraction. When two
 * registrations look like the same person under different markets, the question
 * is not "do they look similar" but "what does our own data actually record".
 * This script answers exactly that and nothing more. It never writes, never
 * suspends, never emails — the decision stays with the owner.
 *
 * WHAT WE HOLD, AND WHAT WE DELIBERATELY DO NOT
 *   users/{uid}                     registration facts, market, status, consents
 *   users/{uid}/sessions/{sid}      device list — SERVER-written (createdAt,
 *                                   lastSeenAt, deviceName, browser, os)
 *   events                          six product events, pseudonymous
 *
 *   NO IP address is stored anywhere, by design (sessionService + the ops
 *   function store no network identifier), and analytics carries no PII by
 *   contract. So this report can evidence SHARED DEVICE and CORRELATED USE —
 *   it cannot evidence a shared network, and must not be read as if it could.
 *
 * THE ONE STRONG SIGNAL
 * A session document's ID is the client's own `hpdb-session-id`, generated once
 * per BROWSER PROFILE and kept in localStorage (services/sessionService.ts).
 * The same id appearing under two accounts means the same browser profile
 * signed into both. That is a fact about a device, not a person — a shared
 * office machine produces it too — but it is the strongest link we hold.
 *
 * The analytics link is recomputable rather than stored: events carry
 * userRef = SHA-256('hpdb:' + uid) truncated to 16 hex (services/analyticsService.ts).
 * One-way from the event's side; we hold the uid, so we can address it.
 *
 * Run (owner, ADC via gcloud):
 *   node scripts/ops/audit-account-activity.mjs --emails=a@x.com,b@y.com
 *   node scripts/ops/audit-account-activity.mjs --emails=… --days=180 --json=out.json
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const PROJECT = 'gen-lang-client-0324244302';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const emails = (arg('emails') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const uidsArg = (arg('uids') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const DAYS = Number(arg('days') ?? 180);
const JSON_OUT = arg('json');

if (!emails.length && !uidsArg.length) {
  console.error('Usage: node scripts/ops/audit-account-activity.mjs --emails=a@x.com,b@y.com [--days=180] [--json=out.json]');
  process.exit(1);
}

const token = execFileSync('gcloud', ['auth', 'print-access-token'], { encoding: 'utf8' }).trim();
const H = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

async function get(path) {
  const res = await fetch(`${BASE}/${path}`, { headers: H });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET ${path} → ${res.status} ${await res.text()}`);
  return res.json();
}

async function runQuery(body) {
  const res = await fetch(`${BASE}:runQuery`, { method: 'POST', headers: H, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`runQuery → ${res.status} ${await res.text()}`);
  return (await res.json()).filter((r) => r.document).map((r) => r.document);
}

/** Firestore REST value → plain JS. */
function val(v) {
  if (v == null) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values ?? []).map(val);
  if ('mapValue' in v) return fields(v.mapValue.fields ?? {});
  return JSON.stringify(v);
}
const fields = (f) => Object.fromEntries(Object.entries(f ?? {}).map(([k, v]) => [k, val(v)]));
const idOf = (doc) => doc.name.split('/').pop();

/** The analytics account reference, recomputed (analyticsService.ts). */
const userRefOf = (uid) => createHash('sha256').update('hpdb:' + uid).digest('hex').slice(0, 16);

const since = new Date(Date.now() - DAYS * 86400_000).toISOString();

// ── Resolve the accounts ─────────────────────────────────────────────────────
const accounts = [];
for (const email of emails) {
  const docs = await runQuery({
    structuredQuery: {
      from: [{ collectionId: 'users' }],
      where: { fieldFilter: { field: { fieldPath: 'email' }, op: 'EQUAL', value: { stringValue: email } } },
      limit: 5,
    },
  });
  if (!docs.length) { console.error(`! no account with email ${email}`); continue; }
  for (const d of docs) accounts.push({ uid: idOf(d), profile: fields(d.fields) });
}
for (const uid of uidsArg) {
  const d = await get(`users/${uid}`);
  if (!d) { console.error(`! no account with uid ${uid}`); continue; }
  accounts.push({ uid, profile: fields(d.fields) });
}
if (!accounts.length) { console.error('nothing to audit'); process.exit(1); }

// ── Sessions + events per account ────────────────────────────────────────────
for (const a of accounts) {
  const sess = await get(`users/${a.uid}/sessions?pageSize=300`);
  a.sessions = (sess?.documents ?? []).map((d) => ({ sid: idOf(d), ...fields(d.fields) }));

  // What we have TOLD this member is part of their record, not a separate one:
  // a review that shows activity but not the notices sent about it is missing
  // half of what happened.
  const mail = await runQuery({
    structuredQuery: {
      from: [{ collectionId: 'memberEmails' }],
      where: { fieldFilter: { field: { fieldPath: 'uid' }, op: 'EQUAL', value: { stringValue: a.uid } } },
      limit: 200,
    },
  });
  a.mail = mail.map((d) => fields(d.fields)).sort((x, y) => String(y.at).localeCompare(String(x.at)));

  a.userRef = userRefOf(a.uid);
  const evs = await runQuery({
    structuredQuery: {
      from: [{ collectionId: 'events' }],
      where: { fieldFilter: { field: { fieldPath: 'userRef' }, op: 'EQUAL', value: { stringValue: a.userRef } } },
      limit: 5000,
    },
  });
  a.events = evs.map((d) => fields(d.fields))
    .filter((e) => !e.at || e.at >= since)
    .sort((x, y) => String(x.at).localeCompare(String(y.at)));
}

// ── Report ───────────────────────────────────────────────────────────────────
const pad = (s, n) => String(s ?? '').padEnd(n);
const count = (arr, key) => arr.reduce((m, e) => (m[e[key] ?? '—'] = (m[e[key] ?? '—'] ?? 0) + 1, m), {});
const line = (n = 78) => console.log('─'.repeat(n));

console.log(`\nAccount activity audit — ${accounts.length} account(s), last ${DAYS} days\n`);

for (const a of accounts) {
  const p = a.profile;
  line();
  console.log(`${p.email}   (uid ${a.uid})`);
  console.log(`  name/company   ${[p.firstName, p.lastName].filter(Boolean).join(' ')} · ${p.companyName ?? '—'} (${p.companyType ?? '—'})`);
  console.log(`  website/city   ${p.companyWebsite ?? '—'} · ${p.companyCity ?? '—'}`);
  console.log(`  market/status  ${p.country ?? '—'} · ${p.status ?? (p.isActive ? 'active' : '—')} · role ${p.role ?? 'user'}`);
  console.log(`  registered     ${p.registeredAt ?? '—'}   signupRef ${p.signupRef ?? '—'}`);
  console.log(`  consents       terms ${p.termsAcceptedAt ?? '—'} · data-use ${p.dataUseConsentAt ?? '—'}`);
  console.log(`  last active    ${p.lastActiveAt ?? '—'}`);
  console.log(`  analytics ref  ${a.userRef}`);

  console.log(`  sessions (${a.sessions.length}) — id is the browser profile's localStorage value:`);
  for (const s of a.sessions) {
    console.log(`     ${pad(s.sid, 38)} ${pad(s.deviceName ?? `${s.browser ?? '?'} · ${s.os ?? '?'}`, 24)} first ${String(s.createdAt ?? '—').slice(0, 16)}  last ${String(s.lastSeenAt ?? '—').slice(0, 16)}${s.revokedAt ? '  REVOKED' : ''}`);
  }

  console.log(`  messages sent (${a.mail.length}):`);
  for (const m of a.mail) {
    console.log(`     ${String(m.at).slice(0, 16).replace('T', ' ')}  ${m.ok === false ? 'FAILED' : 'sent  '}  ${pad(m.kind, 20)} ${m.subject}${m.ok === false ? `  — ${m.error}` : ''}`);
  }

  console.log(`  events (${a.events.length}):`);
  if (a.events.length) {
    console.log(`     by type      ${JSON.stringify(count(a.events, 'event'))}`);
    console.log(`     by market    ${JSON.stringify(count(a.events, 'market'))}`);
    console.log(`     by device    ${JSON.stringify(count(a.events, 'deviceClass'))}`);
    console.log(`     by locale    ${JSON.stringify(count(a.events, 'locale'))}`);
    console.log(`     visits       ${new Set(a.events.map((e) => e.sessionId)).size} distinct app loads`);
    console.log(`     window       ${String(a.events[0].at).slice(0, 16)} → ${String(a.events.at(-1).at).slice(0, 16)}`);
    const exports_ = a.events.filter((e) => e.event === 'datasheet_exported').length;
    const views = a.events.filter((e) => e.event === 'product_view').length;
    console.log(`     extraction-relevant: ${views} product views · ${exports_} data-sheet exports`);
    const q = a.events.filter((e) => e.queryNormalised).map((e) => e.queryNormalised);
    if (q.length) console.log(`     search tokens (normalised, first 15): ${JSON.stringify([...new Set(q)].slice(0, 15))}`);
  }
}

// ── Cross-account correlation ────────────────────────────────────────────────
if (accounts.length > 1) {
  console.log('');
  line();
  console.log('CORRELATION\n');
  for (let i = 0; i < accounts.length; i++) {
    for (let j = i + 1; j < accounts.length; j++) {
      const A = accounts[i], B = accounts[j];
      console.log(`${A.profile.email}  ×  ${B.profile.email}`);

      const shared = A.sessions.map((s) => s.sid).filter((sid) => B.sessions.some((t) => t.sid === sid));
      console.log(`  shared session ids (same browser profile): ${shared.length ? shared.join(', ') : 'none'}`);

      const dev = (a) => new Set(a.sessions.map((s) => `${s.browser ?? '?'}/${s.os ?? '?'}`));
      const devShared = [...dev(A)].filter((d) => dev(B).has(d));
      console.log(`  same browser+OS combination:              ${devShared.length ? devShared.join(', ') : 'none'}`);

      // Interleaving: activity from both accounts inside the same short window
      // is what a single person switching logins produces.
      const WINDOW_MIN = 30;
      const ta = A.events.map((e) => Date.parse(e.at)).filter(Number.isFinite);
      const tb = B.events.map((e) => Date.parse(e.at)).filter(Number.isFinite);
      let near = 0, closest = Infinity;
      for (const x of ta) for (const y of tb) {
        const d = Math.abs(x - y);
        if (d < closest) closest = d;
        if (d <= WINDOW_MIN * 60_000) { near++; break; }
      }
      console.log(`  events within ${WINDOW_MIN} min of the other account:   ${near}${Number.isFinite(closest) ? `  (closest ${Math.round(closest / 60_000)} min)` : '  (no events on one side)'}`);

      const daysOf = (a) => new Set(a.events.map((e) => String(e.at).slice(0, 10)));
      const sameDays = [...daysOf(A)].filter((d) => daysOf(B).has(d));
      console.log(`  days active on both accounts:             ${sameDays.length ? sameDays.join(', ') : 'none'}`);
      console.log('');
    }
  }
}

line();
console.log('Read-only. Nothing was modified. IP addresses are not collected, so');
console.log('a shared network cannot be shown or ruled out from this data.');

if (JSON_OUT) {
  writeFileSync(JSON_OUT, JSON.stringify(accounts, null, 1));
  console.log(`\nraw → ${JSON_OUT}`);
}
