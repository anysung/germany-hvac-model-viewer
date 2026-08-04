#!/usr/bin/env node
/**
 * linkedin-post.mjs — step through the launch batch one post at a time.
 *
 * Publishing is manual (see build-linkedin-posts.mjs for why), so the only
 * thing worth automating is the fetching: which post is next, its text on the
 * clipboard, its folder open in Finder. Two commands per post, no file hunting.
 *
 *   node scripts/linkedin-post.mjs            list the batch and what is done
 *   node scripts/linkedin-post.mjs 2          open #2, copy the POST text
 *   node scripts/linkedin-post.mjs 2 link     copy the FIRST-COMMENT link
 *   node scripts/linkedin-post.mjs 2 done     mark #2 as published
 *
 * Progress lives in linkedin_posts/.published.json, which is regenerated with
 * the packages — losing it costs nothing, LinkedIn itself is the record.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'linkedin_posts');
const BATCH = join(OUT, 'launch-batch.json');
const STATE = join(OUT, '.published.json');

if (!existsSync(BATCH)) {
  console.error('No launch batch. Run: npm run linkedin:build');
  process.exit(1);
}
const batch = JSON.parse(readFileSync(BATCH, 'utf8'));
const published = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : [];

const n = Number(process.argv[2]);
const mode = (process.argv[3] || 'post').toLowerCase();

if (!n) {
  console.log('\nLaunch batch — HeatPump Database Europe\n');
  batch.forEach((q, i) => {
    const mark = published.includes(q.folder) ? '✓' : ' ';
    console.log(`${mark} ${String(i + 1).padStart(2)}. [${q.market}] ${q.category}`);
    console.log(`      ${q.headline}`);
  });
  const left = batch.length - published.length;
  console.log(`\n${published.length}/${batch.length} published` + (left ? ` — next: node scripts/linkedin-post.mjs ${batch.findIndex((q) => !published.includes(q.folder)) + 1}` : ' — batch complete'));
  console.log();
  process.exit(0);
}

const item = batch[n - 1];
if (!item) { console.error(`No post #${n} (batch has ${batch.length}).`); process.exit(1); }
const dir = join(OUT, item.folder);

if (mode === 'done') {
  if (!published.includes(item.folder)) published.push(item.folder);
  writeFileSync(STATE, JSON.stringify(published, null, 2) + '\n');
  console.log(`✓ #${n} marked published — ${published.length}/${batch.length}`);
  process.exit(0);
}

const file = mode === 'link' ? 'comment.txt' : 'post.txt';
const text = readFileSync(join(dir, file), 'utf8');
execFileSync('pbcopy', { input: text });

console.log(`\n#${n} [${item.market}] ${item.headline}\n`);
if (mode === 'link') {
  console.log('FIRST COMMENT copied to the clipboard:\n');
  console.log('  ' + text.trim());
  console.log(`\nPaste it as a comment on the post you just published, then:`);
  console.log(`  node scripts/linkedin-post.mjs ${n} done\n`);
} else {
  execFileSync('open', [dir]);
  console.log('POST TEXT copied to the clipboard. Finder is open at the folder.\n');
  console.log(text.split('\n').map((l) => '  ' + l).join('\n'));
  console.log(`\n  Image: ${join(dir, 'image.jpg')}`);
  console.log(`\nAfter publishing, get the first comment:`);
  console.log(`  node scripts/linkedin-post.mjs ${n} link\n`);
}
