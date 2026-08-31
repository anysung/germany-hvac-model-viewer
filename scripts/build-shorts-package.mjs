#!/usr/bin/env node
/**
 * build-shorts-package.mjs — one ready-to-upload folder per Short.
 *
 * WHY ONE FOLDER PER CLIP
 * Uploading is done one video at a time, from a phone as often as a desk. A
 * single sheet listing thirteen titles guarantees that on the ninth upload the
 * wrong description gets pasted under the wrong video, and nobody notices for a
 * month. A folder that holds exactly one video, its thumbnail and its text
 * cannot be got wrong.
 *
 * WHAT IT DOES NOT DECIDE
 * The copy. Titles, descriptions and the pinned comment are written by hand in
 * the manifest against the primary source, because a generated description is
 * precisely how a wrong subsidy rate ends up under our logo. This script only
 * assembles what is already written.
 *
 * Run:  node scripts/build-shorts-package.mjs <manifest.json> [--out DIR]
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, rmSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const manifestPath = process.argv[2];
if (!manifestPath) { console.error('Usage: build-shorts-package.mjs <manifest.json> [--out DIR]'); process.exit(1); }
const M = JSON.parse(readFileSync(manifestPath, 'utf8'));
const ROOT = dirname(resolve(manifestPath));
const outIdx = process.argv.indexOf('--out');
const OUT = resolve(outIdx >= 0 ? process.argv[outIdx + 1] : join(ROOT, 'uploads'));
const BRANDED = join(ROOT, 'branded');

if (existsSync(OUT)) rmSync(OUT, { recursive: true });
mkdirSync(OUT, { recursive: true });

const warnings = [];
let n = 0;

for (const S of M.shorts) {
  const src = join(BRANDED, S.file);
  if (!existsSync(src)) { console.error(`! ${S.slug}: 영상 없음 — ${S.file}`); continue; }

  const dir = join(OUT, S.slug);
  mkdirSync(dir, { recursive: true });
  copyFileSync(src, join(dir, 'video.mp4'));

  /* Thumbnail: built on the clip's own opening frame, so the still and the
     first second of playback are the same picture. */
  const spec = {
    video: 'video.mp4',
    at: S.at ?? 0,
    kicker: S.kicker ?? M.kicker,
    headline: S.headline,
    host: M.host,
  };
  const specFile = join(dir, 'thumbnail.spec.json');
  writeFileSync(specFile, JSON.stringify(spec, null, 2) + '\n');
  execFileSync('node', [join(HERE, 'build-short-thumbnail.mjs'), specFile, join(dir, 'thumbnail.png')],
    { stdio: ['ignore', 'ignore', 'inherit'] });

  const link = `www.${M.host}/?ref=${M.ref}`;
  const dur = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration',
    '-of', 'default=nw=1:nk=1', src], { encoding: 'utf8' }).trim();

  const md = [
    `# ${S.slug}`,
    '',
    `**영상** \`video.mp4\` · ${Number(dur).toFixed(1)}초 · 9:16 · 독일 국기 상시 + 3초 브랜드 엔딩`,
    `**썸네일** \`thumbnail.png\` — 0초 프레임 위에 한 줄. 업로드 시 **직접 지정**하세요`,
    `**원본 파일명** ${S.file}`,
    '',
    ...(S.warn ? ['', `> ⚠️ **원본 클립 주의** — ${S.warn}`] : []),
    '',
    '---',
    '',
    '## 제목',
    '',
    '```',
    S.title,
    '```',
    `(${S.title.length}자 · 한도 100자)`,
    '',
    '## 설명란',
    '',
    '```',
    S.body,
    '',
    M.closing,
    '',
    M.tags,
    '```',
    '',
    '## 고정 댓글',
    '',
    '```',
    `${S.comment}\n\nModelle vergleichen: ${link}`,
    '```',
    '',
    '---',
    '',
    '## 확인',
    '',
    '- [ ] 썸네일 직접 업로드 (자동 추출 프레임 쓰지 않기)',
    `- [ ] 링크에 \`?ref=${M.ref}\``,
    '- [ ] 적격 여부를 약속하지 않는 문단이 설명란에 있는지',
    '- [ ] 게시 후 URL을 `00_ADMIN/COMPLETION_LOG.md` 에 기록',
    '',
  ].join('\n');

  writeFileSync(join(dir, 'UPLOAD.md'), md + '\n');
  if (S.warn) warnings.push({ slug: S.slug, warn: S.warn });
  console.log(`  ${S.slug}${S.warn ? '  ⚠️' : ''}`);
  n++;
}

/* The index: posting order and the two clips that need a second look. */
const index = [
  `# Shorts 업로드 패키지 — ${M.country} · ${n}편`,
  '',
  '편마다 폴더 하나입니다: `video.mp4` + `thumbnail.png` + `UPLOAD.md`.',
  '한 번에 한 폴더만 열고 그 안의 것만 쓰면 영상과 문구가 어긋날 일이 없습니다.',
  '',
  '## 올리는 순서',
  '',
  '하루 1~2편. 같은 채널의 같은 주제가 한꺼번에 올라가면 서로 노출을 나눠 가집니다.',
  '아래 순서는 **주제가 이어지도록** 배열한 것입니다 — 큰 그림 → 구성 요소 → 시한 → 제품.',
  '',
  ...M.shorts.map((s, i) => `${String(i + 1).padStart(2, ' ')}. \`${s.slug}\` — ${s.headline}`),
  '',
  '## 모든 편에 공통으로 들어간 문단',
  '',
  '```',
  M.closing,
  '```',
  '',
  '이 문단이 있어야 우리가 보조금을 약속하지 않는 위치에 섭니다. BAFA 자신의 표현',
  '("Voraussetzung, keine Garantie")과 같습니다. 빼지 마십시오.',
  '',
];

if (warnings.length) {
  index.push('## ⚠️ 원본 클립이 1차 자료와 어긋나는 편', '',
    '아래 편들은 **원본 영상 자막에 사실과 다른 표현**이 있습니다. 우리 제목·썸네일·설명은',
    '바로잡아 두었지만, 영상 화면 자체는 그대로입니다. 그대로 올릴지, 해당 편만 다시 만들지는',
    '판단이 필요합니다.', '');
  for (const w of warnings) index.push(`- **\`${w.slug}\`** — ${w.warn}`);
  index.push('');
}

index.push('## 출처', '',
  '수치는 `02_MARKET_INTELLIGENCE/MONITORING/DIGEST_2026-08-17.md` — KfW/BAFA Merkblatt',
  'Stand 07/2026(2026-07-21 시행)에서 직접 읽은 값입니다. 2차 비교 사이트의 값',
  '("최대 30 %", "21.000 €")은 채택하지 않습니다.', '');

writeFileSync(join(OUT, 'README.md'), index.join('\n'));
console.log(`\n${n}편 → ${OUT}${warnings.length ? `\n⚠️ 원본 사실 확인 필요: ${warnings.length}편` : ''}`);
