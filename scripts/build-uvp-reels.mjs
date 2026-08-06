#!/usr/bin/env node
/**
 * build-uvp-reels.mjs — stitch the UVP library into the three reels
 * (owner spec, 2026-08-07), each: intro bumper + clips + closing bumper,
 * with an energetic synthesized music bed kept low under the voices.
 *
 * THE MUSIC is generated right here as PCM — there are no licensed tracks on
 * this machine and a marketing video must not ship music we cannot prove we
 * own. A 122-BPM four-on-the-floor bed (kick, offbeat hats, minor-pentatonic
 * bass arpeggio, airy pluck) is synthesized per run, mixed at low gain so the
 * Chirp voices stay clearly on top, and faded out over the closing bumper.
 *
 * Reels:
 *   reel-full.mp4       intro + all 9 + closing            (~55s)
 *   reel-core.mp4       intro + 5 core UVPs + closing      (~35s)
 *   reel-workflow.mp4   intro + 5 workflow UVPs + closing  (~35s)
 *
 * Run:  node scripts/build-uvp-reels.mjs      (library + bumper must exist)
 */
import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const UVP = join(ROOT, 'demo_video', 'uvp');
const LIB = join(UVP, 'library');
const BUMPER = join(UVP, 'brand-bumper.mp4');

const ALL = [
  'Every HeatPump in Europe',
  'The Latest Information',
  'Easy & Quick Finding',
  'Comparison at a glance',
  'Instant Data Sheet',
  'EU Energy Label',
  'Practical Subsidy Guide',
  'Industry News Publishment',
  'Across Europe',
];

const REELS = {
  'reel-full': ALL,
  'reel-core': ['Every HeatPump in Europe', 'Comparison at a glance', 'EU Energy Label', 'Industry News Publishment', 'Across Europe'],
  'reel-workflow': ['The Latest Information', 'Easy & Quick Finding', 'Instant Data Sheet', 'Practical Subsidy Guide', 'Across Europe'],
};

/* ── 1. Synthesize the bed ───────────────────────────────────────────────── */
function makeMusic(outWav, seconds) {
  const SR = 48000, BPM = 122, beat = 60 / BPM;
  const n = Math.ceil(SR * seconds);
  const L = new Float32Array(n), R = new Float32Array(n);
  const PENTA = [55.0, 65.41, 73.42, 82.41, 98.0];            // A1 minor pentatonic
  const PLUCK = [440, 523.25, 587.33, 659.25, 783.99];        // A4 pentatonic

  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const inBeat = (t / beat) % 1;
    const beatNo = Math.floor(t / beat);
    let s = 0;

    // Kick: every beat, 50Hz thump with fast pitch drop.
    const kEnv = Math.exp(-inBeat * 22);
    s += 0.5 * kEnv * Math.sin(2 * Math.PI * (48 + 60 * Math.exp(-inBeat * 30)) * t);

    // Offbeat hat: filtered noise burst on the "and".
    const hatPhase = ((t + beat / 2) / beat) % 1;
    if (hatPhase < 0.09) s += 0.10 * (Math.random() * 2 - 1) * Math.exp(-hatPhase * 60);

    // Bass: eighth-note pentatonic arpeggio, slightly detuned saw-ish.
    const eighth = Math.floor(t / (beat / 2));
    const f = PENTA[[0, 0, 3, 2, 0, 4, 3, 2][eighth % 8]];
    const bEnv = Math.exp(-((t / (beat / 2)) % 1) * 5);
    s += 0.16 * bEnv * (Math.sin(2 * Math.PI * f * t) + 0.5 * Math.sin(4 * Math.PI * f * t + 0.4));

    // Pluck: sparkle on beats 2 and 4, echoing.
    if (beatNo % 2 === 1) {
      const pf = PLUCK[(Math.floor(beatNo / 2) * 3) % PLUCK.length];
      s += 0.07 * Math.exp(-inBeat * 7) * Math.sin(2 * Math.PI * pf * t) * (1 + 0.3 * Math.sin(2 * Math.PI * 5 * t));
    }

    // Gentle stereo width via short delay on the right.
    L[i] = s;
    R[i] = i > 480 ? 0.92 * s + 0.08 * L[i - 480] : s;
  }
  // Master fade-in 0.5s, fade-out over the final 3s.
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const g = Math.min(1, t / 0.5) * Math.min(1, Math.max(0, (seconds - t) / 3));
    L[i] *= g; R[i] *= g;
  }
  // 16-bit interleaved WAV.
  const pcm = Buffer.alloc(n * 4);
  for (let i = 0; i < n; i++) {
    pcm.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(L[i] * 32767))), i * 4);
    pcm.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(R[i] * 32767))), i * 4 + 2);
  }
  const hdr = Buffer.alloc(44);
  hdr.write('RIFF', 0); hdr.writeUInt32LE(36 + pcm.length, 4); hdr.write('WAVE', 8);
  hdr.write('fmt ', 12); hdr.writeUInt32LE(16, 16); hdr.writeUInt16LE(1, 20); hdr.writeUInt16LE(2, 22);
  hdr.writeUInt32LE(SR, 24); hdr.writeUInt32LE(SR * 4, 28); hdr.writeUInt16LE(4, 32); hdr.writeUInt16LE(16, 34);
  hdr.write('data', 36); hdr.writeUInt32LE(pcm.length, 40);
  writeFileSync(outWav, Buffer.concat([hdr, pcm]));
}

/* ── 2. Assemble each reel ───────────────────────────────────────────────── */
for (const [name, clips] of Object.entries(REELS)) {
  const missing = clips.filter((c) => !existsSync(join(LIB, `${c}.mp4`)));
  if (missing.length || !existsSync(BUMPER)) {
    console.error(`${name}: missing ${missing.join(', ') || 'bumper'}`); continue;
  }
  const segs = [BUMPER, ...clips.map((c) => join(LIB, `${c}.mp4`)), BUMPER];
  const total = segs.length * 5;
  const music = join(UVP, `_bed-${total}s.wav`);
  makeMusic(music, total);

  // filter_complex concat: normalize every segment to 25fps stereo 48k; the
  // silent bumper contributes anullsrc audio (it has no audio stream at all).
  const args = ['-y'];
  segs.forEach((s) => args.push('-i', s));
  args.push('-i', music);
  const vparts = [], aparts = [];
  segs.forEach((s, i) => {
    vparts.push(`[${i}:v]fps=25,scale=1280:720,setsar=1,setpts=PTS-STARTPTS[v${i}]`);
    if (s === BUMPER) {
      aparts.push(`anullsrc=r=48000:cl=stereo,atrim=duration=5,asetpts=PTS-STARTPTS[a${i}]`);
    } else {
      aparts.push(`[${i}:a]aresample=48000,aformat=channel_layouts=stereo,apad=whole_dur=5,atrim=duration=5,asetpts=PTS-STARTPTS[a${i}]`);
    }
  });
  const pairs = segs.map((_, i) => `[v${i}][a${i}]`).join('');
  const fc = [
    ...vparts, ...aparts,
    `${pairs}concat=n=${segs.length}:v=1:a=1[vall][voice]`,
    // Music sits UNDER the voices: fixed low gain, no ducking needed at -18dB-ish.
    `[${segs.length}:a]volume=0.16[bed]`,
    `[voice][bed]amix=inputs=2:duration=first:normalize=0[aout]`,
  ].join(';');
  args.push('-filter_complex', fc, '-map', '[vall]', '-map', '[aout]',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '19', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart',
    join(UVP, `${name}.mp4`));
  execFileSync('ffmpeg', args, { stdio: 'ignore' });
  execFileSync('rm', [music]);
  console.log(`✓ ${name}.mp4  (${segs.length} × 5s = ${total}s)`);
}
