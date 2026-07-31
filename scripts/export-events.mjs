#!/usr/bin/env node
/**
 * export-events.mjs — monthly raw event export for the marketing workspace
 * (request 2026-07-28-analytics-events.md; owner approval 2026-08-01).
 *
 * Reads the PREVIOUS calendar month (or --month=YYYY-MM) from the `events`
 * collection via the Firestore REST API (gcloud ADC — clients cannot read
 * events; rules are write-only) and writes a raw, NON-aggregated CSV into the
 * shared Cowork folder. No PII exists in the collection by contract, so the
 * export needs no scrubbing pass — the write path already guarantees it.
 *
 * Run (owner, monthly alongside the update cycle):
 *   node scripts/export-events.mjs            # previous month
 *   node scripts/export-events.mjs --month=2026-08
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const PROJECT = 'gen-lang-client-0324244302';
const OUT_DIR = join(homedir(), 'Claude/Projects/HeatPump DB Marketing/Claude Code/analytics');

const argMonth = process.argv.find(a => a.startsWith('--month='))?.slice(8);
const now = new Date();
const month = argMonth ?? new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 7);
const from = new Date(`${month}-01T00:00:00Z`);
const to = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1));

const token = execFileSync('gcloud', ['auth', 'print-access-token'], { encoding: 'utf8' }).trim();

const FIELDS = ['event', 'at', 'market', 'locale', 'authState', 'plan', 'deviceClass',
  'sessionId', 'userRef', 'qTokens', 'queryNormalised', 'models', 'via', 'mode'];

const rows = [];
let pageToken;
do {
  const body = {
    structuredQuery: {
      from: [{ collectionId: 'events' }],
      where: {
        compositeFilter: {
          op: 'AND',
          filters: [
            { fieldFilter: { field: { fieldPath: 'at' }, op: 'GREATER_THAN_OR_EQUAL', value: { timestampValue: from.toISOString() } } },
            { fieldFilter: { field: { fieldPath: 'at' }, op: 'LESS_THAN', value: { timestampValue: to.toISOString() } } },
          ],
        },
      },
      orderBy: [{ field: { fieldPath: 'at' }, direction: 'ASCENDING' }],
      limit: 10000,
    },
  };
  const res = await fetch(`https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents:runQuery`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) { console.error('Query failed:', res.status, await res.text()); process.exit(1); }
  const docs = await res.json();
  for (const d of docs) {
    if (!d.document) continue;
    const f = d.document.fields ?? {};
    const val = k => f[k]?.stringValue ?? f[k]?.integerValue ?? f[k]?.timestampValue ?? f[k]?.booleanValue ?? '';
    rows.push(FIELDS.map(k => String(val(k)).replace(/"/g, '""')));
  }
  pageToken = undefined;           // runQuery streams fully up to limit; >10k → rerun narrower
} while (pageToken);

mkdirSync(OUT_DIR, { recursive: true });
const out = join(OUT_DIR, `events-${month}.csv`);
writeFileSync(out, [FIELDS.join(','), ...rows.map(r => `"${r.join('","')}"`)].join('\n') + '\n');
console.log(`${rows.length} events → ${out}`);
if (rows.length >= 10000) console.warn('⚠ 10k limit hit — split the month with --month + code tweak before trusting totals.');
