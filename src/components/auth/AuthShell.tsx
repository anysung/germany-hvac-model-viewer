/**
 * AuthShell — eco-futuristic authentication surface for HeatPump DB.
 *
 * Design concept: "Energy Field" — a deep near-black canvas with a slow-moving
 * aurora of emerald (renewable) and cyan (intelligence), a faint smart-grid
 * overlay, and animated heat-flow lines (cold blue → warm amber) along the
 * bottom edge as a heat-pump metaphor.
 *
 * Country expansion: the market badge is driven entirely by ACTIVE_COUNTRY
 * (countryProfiles.ts). A new market deployment changes the flag, name and
 * subsidy label here with zero component changes.
 */
import React from 'react';
import { Language } from '../../types';
import { ACTIVE_COUNTRY } from '../../config/countryProfiles';
import { PUBLIC_ENV } from '../../config/env';
import { UI_LANGUAGES } from '../../hpiq/market';
import { BrandLogo, WavingFlag } from '../BrandLogo';

/** The unified ops console (hub) is cross-market — no single-country identity. */
const IS_ADMIN_BUILD = PUBLIC_ENV.APP_MODE === 'admin';

/** ISO 3166-1 alpha-2 → regional-indicator flag emoji. */
const flagEmoji = (code: string) =>
  code.toUpperCase().replace(/./g, c => String.fromCodePoint(127397 + c.charCodeAt(0)));

/* ── Shared style tokens (auth surface only) ─────────────────────────────── */

export const authLabel =
  'block text-[11px] font-semibold uppercase tracking-wider text-white/60 mb-1.5';

export const authInput =
  'w-full px-4 py-3 rounded-xl bg-white/5 border border-white/15 text-white placeholder-white/35 outline-none transition focus:border-emerald-400/70 focus:bg-white/[0.08] focus:ring-2 focus:ring-emerald-400/25';

/** Selects need a solid dark background so native dropdown options stay legible. */
export const authSelect =
  'w-full px-4 py-3 rounded-xl bg-[#0e1c18] border border-white/15 text-white outline-none transition focus:border-emerald-400/70 focus:ring-2 focus:ring-emerald-400/25';

export const primaryBtn =
  'w-full py-3.5 px-4 rounded-xl font-bold text-[#04251d] bg-gradient-to-r from-emerald-400 to-cyan-400 hover:from-emerald-300 hover:to-cyan-300 shadow-lg shadow-emerald-500/20 transition disabled:opacity-60 disabled:cursor-not-allowed';

export const ghostBtn =
  'w-full py-3.5 px-4 rounded-xl font-semibold text-white bg-white/[0.07] hover:bg-white/[0.13] border border-white/15 transition';

export const socialBtn =
  'w-full py-3 px-4 rounded-xl font-semibold text-gray-900 bg-white hover:bg-gray-100 flex items-center justify-center gap-2.5 transition disabled:opacity-60 disabled:cursor-not-allowed';

export const GoogleIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg className={className} viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.1 29.5 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.2-.1-2.3-.4-3.5z" />
    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.1 29.5 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.2 0 10-2 13.6-5.2l-6.3-5.3C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.4-11.3-8.1l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.5l6.3 5.3C36.9 40.4 44 36 44 24c0-1.2-.1-2.3-.4-3.5z" />
  </svg>
);

export const AppleIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg className={className} viewBox="0 0 384 512" fill="currentColor" aria-hidden="true">
    <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
  </svg>
);

/* ── Icons (inline SVG, minimal 1.5px stroke) ────────────────────────────── */

export const LeafIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M11 20A7 7 0 0 1 4 13c0-5 4-9 16-9 0 12-4 16-9 16Z" />
    <path d="M4 21c4-4 6-6 9-9" />
  </svg>
);

export const HomeIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5.5 9.5V20a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V9.5" />
    <path d="M10 21v-6h4v6" />
  </svg>
);

export const BuildingIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16" />
    <path d="M15 9h4a1 1 0 0 1 1 1v11" />
    <path d="M2 21h20" />
    <path d="M7.5 8h1M11 8h1M7.5 12h1M11 12h1M7.5 16h1M11 16h1M17.5 13h.5M17.5 17h.5" />
  </svg>
);

/* ── Primitives ──────────────────────────────────────────────────────────── */

export const GlassCard: React.FC<{ className?: string; children: React.ReactNode }> = ({
  className = '',
  children,
}) => (
  <div className={`bg-white/[0.035] backdrop-blur-md border border-white/10 rounded-3xl shadow-2xl shadow-black/40 ${className}`}>
    {children}
  </div>
);

const SegmentTile: React.FC<{
  icon: React.ReactNode;
  title: string;
  desc: string;
  accent: 'emerald' | 'cyan';
}> = ({ icon, title, desc, accent }) => (
  <div className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl bg-white/[0.05] border border-white/10 backdrop-blur">
    <span
      className={`shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-lg border ${
        accent === 'emerald'
          ? 'bg-emerald-400/15 border-emerald-400/25 text-emerald-300'
          : 'bg-cyan-400/15 border-cyan-400/25 text-cyan-300'
      }`}
    >
      {icon}
    </span>
    <div>
      <p className="font-semibold text-white text-[13px]">{title}</p>
      <p className="text-white/50 text-[11px] mt-0.5 leading-snug">{desc}</p>
    </div>
  </div>
);

/** Residential / Commercial duality — the two market segments the database covers. */
export const SegmentTiles: React.FC<{ t: any }> = ({ t }) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
    <SegmentTile icon={<HomeIcon />} title={t.tabResidential} desc={t.authResidentialDesc} accent="emerald" />
    <SegmentTile icon={<BuildingIcon />} title={t.tabCommercial} desc={t.authCommercialDesc} accent="cyan" />
  </div>
);

/* ── Background layers ───────────────────────────────────────────────────── */

/** Heat-flow lines: cold blue → renewable emerald → warm amber, drifting right. */
const FlowWave: React.FC = () => (
  <svg
    className="absolute bottom-0 left-0 w-full h-40 md:h-56 opacity-60"
    viewBox="0 0 1440 240"
    fill="none"
    preserveAspectRatio="none"
    aria-hidden="true"
  >
    <defs>
      <linearGradient id="hpFlow" x1="0" y1="0" x2="1440" y2="0" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#38bdf8" stopOpacity="0.5" />
        <stop offset="0.55" stopColor="#34d399" stopOpacity="0.7" />
        <stop offset="1" stopColor="#fbbf24" stopOpacity="0.45" />
      </linearGradient>
    </defs>
    <path className="hp-flow-line" d="M0 170 C 240 120, 420 220, 720 170 S 1200 120, 1440 160" stroke="url(#hpFlow)" strokeWidth="1.5" />
    <path className="hp-flow-line" style={{ animationDelay: '-2.5s' }} d="M0 200 C 260 150, 460 245, 760 195 S 1220 150, 1440 190" stroke="url(#hpFlow)" strokeWidth="1.25" opacity="0.6" />
    <path d="M0 140 C 240 90, 420 190, 720 140 S 1200 90, 1440 130" stroke="url(#hpFlow)" strokeWidth="1" opacity="0.3" />
  </svg>
);

/* ── Installation scenes (line-art, looping) ─────────────────────────────
 * Background-only concept animations: crews installing outdoor units.
 * Stroke-only drawing — structures in faint white, units in emerald,
 * people in cyan. Sits behind all content; cards/text overlap freely.
 */

const SCENE_STRUCT = 'rgba(255,255,255,0.38)';
const SCENE_FILL = 'rgba(255,255,255,0.30)';
const SCENE_UNIT = '#34d399';
const SCENE_CREW = '#67e8f9';

/** Pictogram figure: filled head + thick round limbs (movers-style). */
const CrewHead: React.FC<{ cx: number; cy: number; r?: number }> = ({ cx, cy, r = 7 }) => (
  <circle cx={cx} cy={cy} r={r} fill={SCENE_CREW} stroke="none" />
);

/** Bottom-left: detached house, one tech commissioning a unit, two carrying the next one in. */
const ResidentialInstallScene: React.FC = () => (
  <svg
    className="hp-scene absolute bottom-0 left-0 w-[clamp(180px,36vw,540px)] h-auto opacity-[0.55]"
    viewBox="0 0 520 260"
    fill="none"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <defs>
      {/* openings punched out of the solid house silhouette */}
      <mask id="hpHouseMask">
        <rect x="0" y="0" width="520" height="260" fill="#fff" />
        <rect x="84" y="198" width="30" height="50" rx="2" fill="#000" />
        <rect x="58" y="158" width="28" height="24" rx="2" fill="#000" />
        <rect x="126" y="158" width="28" height="24" rx="2" fill="#000" />
        <rect x="178" y="188" width="52" height="60" rx="2" fill="#000" />
      </mask>
    </defs>

    {/* ground */}
    <line x1="0" y1="248" x2="520" y2="248" stroke={SCENE_STRUCT} strokeWidth="4" />

    {/* house — solid pictogram silhouette: pitched roof, chimney, attached garage */}
    <g fill={SCENE_FILL} stroke="none" mask="url(#hpHouseMask)">
      <path d="M52 248 V134 H170 V248 Z" />
      <path d="M28 144 L111 56 L194 144 Z" />
      <path d="M138 80 H158 V140 H138 Z" />
      <path d="M162 162 H240 V174 H162 Z" />
      <path d="M168 174 H234 V248 H168 Z" />
    </g>
    {/* window cross bars + garage door slats drawn back over the openings */}
    <g stroke={SCENE_FILL} strokeWidth="3">
      <path d="M72 158 V182 M58 170 H86 M140 158 V182 M126 170 H154" />
      <path d="M178 208 H230 M178 228 H230" opacity="0.7" />
    </g>

    {/* installed outdoor unit — bold outline, petal fan, chunky grill */}
    <g stroke={SCENE_UNIT} strokeWidth="3.5">
      <line x1="252" y1="247" x2="362" y2="247" strokeWidth="6" opacity="0.7" />
      <rect x="260" y="184" width="94" height="58" rx="8" />
      <circle cx="292" cy="213" r="20" />
      <circle cx="292" cy="213" r="3.5" fill={SCENE_UNIT} stroke="none" />
      <g className="hp-fan">
        <path d="M292 213 C286 207 286 199 292 195" />
        <path d="M292 213 C294 221 301 224 307 221" />
        <path d="M292 213 C284 215 279 222 282 228" transform="rotate(-125 292 213)" />
      </g>
      <path d="M326 198 V230 M337 198 V230 M348 198 V230" strokeWidth="3" opacity="0.75" />
      <path className="hp-flow-line" d="M260 200 H234" strokeWidth="3" opacity="0.9" />
    </g>

    {/* tech A — kneeling, torquing the service valve (pictogram) */}
    <g stroke={SCENE_CREW} strokeWidth="5">
      <CrewHead cx={380} cy={191} />
      <path d="M379 199 L373 226" />
      <path d="M373 226 L362 246 M373 226 L382 246" />
      <path d="M378 205 L388 220" />
      <g className="hp-wrench-arm">
        <path d="M378 205 L358 213" />
        <path d="M358 213 l-7 -8" strokeWidth="4" />
      </g>
    </g>

    {/* techs B + C — carrying the next unit in from the right (movers pictogram, loops) */}
    <g className="hp-carry">
      <g className="hp-bob">
        <g stroke={SCENE_UNIT} strokeWidth="3">
          <rect x="408" y="198" width="46" height="34" rx="4" />
          <circle cx="422" cy="215" r="8" strokeWidth="2.5" />
          <path d="M440 205 V225" strokeWidth="2.5" opacity="0.75" />
        </g>
        <g stroke={SCENE_CREW} strokeWidth="5">
          <CrewHead cx={390} cy={184} />
          <path d="M391 192 L387 220" />
          <path d="M387 220 L375 246 M387 220 L397 246" />
          <path d="M390 198 L408 208" />
          <path d="M389 202 L408 222" />
          <CrewHead cx={472} cy={184} />
          <path d="M471 192 L475 220" />
          <path d="M475 220 L465 246 M475 220 L485 246" />
          <path d="M472 198 L454 208" />
          <path d="M473 202 L454 222" />
        </g>
      </g>
    </g>
  </svg>
);

/** Bottom-right: commercial rooftop — unit lowered by crane, two crew guiding, one servicing. */
const CommercialInstallScene: React.FC = () => (
  <svg
    className="hp-scene absolute bottom-0 right-0 w-[clamp(190px,38vw,560px)] h-auto opacity-[0.55]"
    viewBox="0 0 520 300"
    fill="none"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <defs>
      {/* window grid + door punched out of the solid tower silhouettes */}
      <mask id="hpBldgMask">
        <rect x="0" y="0" width="520" height="300" fill="#fff" />
        {[134, 162, 190, 218].map(y =>
          [176, 220, 264, 308].map(x => (
            <rect key={`f${x}-${y}`} x={x} y={y} width="30" height="18" rx="1.5" fill="#000" />
          )),
        )}
        {[172, 198, 224].map(y =>
          [382, 414].map(x => (
            <rect key={`s${x}-${y}`} x={x} y={y} width="24" height="16" rx="1.5" fill="#000" />
          )),
        )}
        <rect x="250" y="240" width="36" height="38" rx="2" fill="#000" />
      </mask>
    </defs>

    {/* ground */}
    <line x1="0" y1="288" x2="520" y2="288" stroke={SCENE_STRUCT} strokeWidth="4" />

    {/* building — solid pictogram: stepped towers, rooftop penthouse, base plinth */}
    <g fill={SCENE_FILL} stroke="none" mask="url(#hpBldgMask)">
      <path d="M160 278 V120 H368 V278 Z" />
      <path d="M368 278 V156 H452 V278 Z" />
      <path d="M164 120 V98 H200 V120 Z" />
      <rect x="146" y="278" width="320" height="10" rx="2" />
    </g>

    {/* existing rooftop unit — chiller pictogram, twin spinning fan panels */}
    <g stroke={SCENE_UNIT} strokeWidth="3.5">
      <rect x="208" y="78" width="88" height="36" rx="3" />
      <rect x="214" y="84" width="32" height="24" rx="2" strokeWidth="3" />
      <g className="hp-fan-slow">
        <path d="M221 87 L239 105 M239 87 L221 105" strokeWidth="3" />
      </g>
      <circle cx="230" cy="96" r="2.5" fill={SCENE_UNIT} stroke="none" />
      <rect x="252" y="84" width="32" height="24" rx="2" strokeWidth="3" />
      <g className="hp-fan-slow" style={{ animationDelay: '-2s' }}>
        <path d="M259 87 L277 105 M277 87 L259 105" strokeWidth="3" />
      </g>
      <circle cx="268" cy="96" r="2.5" fill={SCENE_UNIT} stroke="none" />
      <path d="M216 114 V120 M288 114 V120" strokeWidth="4" />
      {/* landing marks for the incoming unit */}
      <path d="M316 120 h12 M352 120 h12" strokeWidth="5" opacity="0.65" />
    </g>

    {/* hoisted unit descending from crane (loops) */}
    <g className="hp-hoist">
      <line x1="340" y1="-320" x2="340" y2="68" stroke={SCENE_STRUCT} strokeWidth="3" />
      <g stroke={SCENE_UNIT} strokeWidth="3.5">
        <line x1="320" y1="68" x2="360" y2="68" strokeWidth="4" />
        <path d="M320 68 L312 80 M360 68 L368 80" strokeWidth="3" />
        <rect x="312" y="80" width="56" height="40" rx="5" />
        <circle cx="332" cy="100" r="11" />
        <circle cx="332" cy="100" r="2.5" fill={SCENE_UNIT} stroke="none" />
        <path d="M352 88 V112 M360 88 V112" strokeWidth="3" opacity="0.75" />
      </g>
    </g>

    {/* crew — servicing tech at the chiller + two riggers on the lower roof (pictogram) */}
    <g stroke={SCENE_CREW} strokeWidth="5">
      <CrewHead cx={304} cy={84} r={6.5} />
      <path d="M303 91 L299 106" />
      <path d="M299 106 L291 120 M299 106 L305 120" />
      <g className="hp-wrench-arm">
        <path d="M302 95 L287 102" />
        <path d="M287 102 l-6 -7" strokeWidth="4" />
      </g>

      {/* riggers guiding from the lower side-tower roof */}
      <CrewHead cx={392} cy={116} r={6.5} />
      <path d="M392 123 V142" />
      <path d="M392 142 L384 156 M392 142 L400 156" />
      <g className="hp-wave-arms">
        <path d="M392 127 L380 114 M392 127 L404 114" />
      </g>

      <CrewHead cx={430} cy={116} r={6.5} />
      <path d="M430 123 V142" />
      <path d="M430 142 L422 156 M430 142 L438 156" />
      <g className="hp-wave-arms">
        <path d="M430 127 L418 114 M430 127 L442 114" />
      </g>
    </g>
  </svg>
);

/* ── Market background palettes ──────────────────────────────────────────────
   Each edition gets its own hue family so the three landings read differently
   at a glance: DE emerald, GB blue, FR indigo with a warm highlight,
   PL crimson/rose (white-red flag analog).
   (Rollback: git tag auth-bg-v1 holds the previous grid-overlay design.) */
const MARKET_BG: Record<string, {
  baseMid: string; base: string; baseDeep: string;
  glowA: string; glowB: string; lineA: string; lineB: string;
}> = {
  DE: { baseMid: '#0e2019', base: '#0a1712', baseDeep: '#071009', glowA: '#34d399', glowB: '#22d3ee', lineA: '#34d399', lineB: '#38bdf8' },
  GB: { baseMid: '#0c1a2e', base: '#081322', baseDeep: '#050c18', glowA: '#38bdf8', glowB: '#818cf8', lineA: '#38bdf8', lineB: '#818cf8' },
  FR: { baseMid: '#111a38', base: '#0b1128', baseDeep: '#070b1c', glowA: '#60a5fa', glowB: '#fb7185', lineA: '#60a5fa', lineB: '#22d3ee' },
  PL: { baseMid: '#2a1019', base: '#1c0a11', baseDeep: '#12060b', glowA: '#fb7185', glowB: '#f9a8d4', lineA: '#fb7185', lineB: '#fda4af' },
  // IT: tricolore analog — deep green base with a warm red counter-glow.
  IT: { baseMid: '#10241a', base: '#0a1a0f', baseDeep: '#061109', glowA: '#4ade80', glowB: '#f87171', lineA: '#4ade80', lineB: '#fca5a5' },
};
const BG = MARKET_BG[ACTIVE_COUNTRY.code] ?? MARKET_BG.DE;

/**
 * SpacetimeField — the circulation background: streamlines flowing across the
 * page bend around two invisible "masses" (one behind the entry card, one in
 * the lower hero), ringed by faint elliptical lens distortions. The dash
 * drift keeps everything in slow, continuous motion (air/water circulation
 * feel without literal imagery). Dash cycles are 480 units and the keyframe
 * travels −960, so every line loops seamlessly at any duration.
 */
const SpacetimeField: React.FC = () => (
  <svg
    className="absolute inset-0 w-full h-full"
    viewBox="0 0 1440 900"
    preserveAspectRatio="xMidYMid slice"
    fill="none"
    aria-hidden="true"
  >
    <defs>
      <linearGradient id="hpFieldLine" x1="0" y1="0" x2="1440" y2="0" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor={BG.lineA} stopOpacity="0" />
        <stop offset="0.22" stopColor={BG.lineA} stopOpacity="0.55" />
        <stop offset="0.62" stopColor={BG.lineB} stopOpacity="0.55" />
        <stop offset="1" stopColor={BG.lineB} stopOpacity="0" />
      </linearGradient>
    </defs>

    {/* streamlines — curvature increases near the two foci */}
    <g stroke="url(#hpFieldLine)" strokeWidth="1.2" opacity="0.34">
      <path className="hp-field-line" style={{ animationDuration: '34s' }} strokeDasharray="330 150" d="M-40 70 C 500 40, 900 95, 1480 60" />
      <path className="hp-field-line" style={{ animationDuration: '27s', animationDelay: '-9s' }} strokeDasharray="300 180" d="M-40 165 C 320 135, 720 185, 1480 140" />
      <path className="hp-field-line" style={{ animationDuration: '30s', animationDelay: '-4s' }} strokeDasharray="360 120" d="M-40 275 C 420 255, 820 245, 1035 205 S 1310 185, 1480 210" />
      <path className="hp-field-line" style={{ animationDuration: '24s', animationDelay: '-14s' }} strokeDasharray="280 200" d="M-40 390 C 380 380, 760 400, 980 435 S 1250 470, 1480 420" />
      <path className="hp-field-line" style={{ animationDuration: '31s', animationDelay: '-6s' }} strokeDasharray="320 160" d="M-40 520 C 260 500, 430 468, 645 498 S 1110 560, 1480 520" />
      <path className="hp-field-line" style={{ animationDuration: '26s', animationDelay: '-18s' }} strokeDasharray="340 140" d="M-40 655 C 210 636, 330 598, 485 610 S 770 685, 1480 640" />
      <path className="hp-field-line" style={{ animationDuration: '36s', animationDelay: '-11s' }} strokeDasharray="300 180" d="M-40 775 C 420 752, 920 792, 1480 750" />
    </g>

    {/* lens distortions — faint elliptical rings around the two masses */}
    <g className="hp-lens-a" fill="none" stroke={BG.lineB}>
      <ellipse cx="1050" cy="320" rx="62" ry="54" strokeOpacity="0.11" />
      <ellipse cx="1050" cy="320" rx="98" ry="86" strokeOpacity="0.085" />
      <ellipse cx="1050" cy="320" rx="140" ry="122" strokeOpacity="0.06" />
      <ellipse cx="1050" cy="320" rx="188" ry="164" strokeOpacity="0.04" />
    </g>
    <g className="hp-lens-b" fill="none" stroke={BG.lineA}>
      <ellipse cx="385" cy="645" rx="52" ry="45" strokeOpacity="0.10" />
      <ellipse cx="385" cy="645" rx="88" ry="76" strokeOpacity="0.07" />
      <ellipse cx="385" cy="645" rx="128" ry="110" strokeOpacity="0.045" />
    </g>
  </svg>
);

/* ── Chrome ──────────────────────────────────────────────────────────────── */

/** Dynamic brand lockup + waving market flag — instantly reads as this country's build.
 *  Admin build shows no flag: the ops console spans every market. */
/**
 * The `height` props are the no-CSS fallback; the classes are what actually
 * sizes these. Both marks render an <svg> whose width/height attributes CSS
 * overrides, so `h-* w-auto` scales them without touching the components — a
 * fixed 40px logo plus a 36px flag is 300px of a 390px phone header, which is
 * how the language switch ended up off-screen.
 */
const Wordmark: React.FC = () => (
  <span className="inline-flex items-center gap-2 sm:gap-4 select-none flex-none">
    <BrandLogo height={40} theme="dark" className="h-[26px] sm:h-9 md:h-10 w-auto" />
    {/* Below ~380px there is not room for wordmark + flag + social + language
        switch, and something has to go. The flag goes: the market is already
        implied by the domain and the language, whereas the wordmark is the
        brand. Hiding it beats letting flexbox squash both. */}
    {!IS_ADMIN_BUILD && (
      <WavingFlag height={36} className="hidden min-[380px]:inline-block h-[22px] sm:h-8 md:h-9 w-auto" />
    )}
  </span>
);

/** Country-profile-driven market identity — swaps automatically per deployment.
 *  Admin build gets a cross-market ops-console badge instead. */
const MarketBadge: React.FC<{ t: any }> = ({ t }) =>
  IS_ADMIN_BUILD ? (
    <span className="hidden sm:inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/15 bg-white/5 backdrop-blur text-xs font-medium text-white/80">
      <span className="text-sm leading-none">🛠️</span>
      Ops Console · All markets
    </span>
  ) : (
  <span className="hidden sm:inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/15 bg-white/5 backdrop-blur text-xs font-medium text-white/80 min-w-0">
    <span className="text-sm leading-none flex-none">{flagEmoji(ACTIVE_COUNTRY.code)}</span>
    {/* The only elastic thing in the header. Market labels differ wildly in
        length (FR "MaPrimeRénov' / CEE", PL "Czyste Powietrze / ZUM"), and
        without this the badge pushed the brand mark until it squashed. */}
    <span className="truncate">{t.authMarketLabel}: {ACTIVE_COUNTRY.name} · {ACTIVE_COUNTRY.subsidyTabLabel}</span>
  </span>
);

const LanguagePill: React.FC<{ language: Language; setLanguage: (l: Language) => void }> = ({
  language,
  setLanguage,
}) => (
  // Single-language editions (e.g. GB) render no pill at all.
  UI_LANGUAGES.length < 2 ? null : (
  <div className="flex items-center rounded-full border border-white/15 bg-white/5 backdrop-blur p-0.5 sm:p-1 text-[11px] sm:text-xs font-semibold flex-none">
    {UI_LANGUAGES.map(l => (
      <button
        key={l}
        onClick={() => setLanguage(l)}
        className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full transition-colors ${
          language === l ? 'bg-white text-gray-900' : 'text-white/60 hover:text-white'
        }`}
      >
        {l.toUpperCase()}
      </button>
    ))}
  </div>
  )
);

/* ── Shell ───────────────────────────────────────────────────────────────── */

/** Official channels of the same organisation (mirrored in the JSON-LD
 *  `sameAs`, so search engines read them as one identity). */
export const SOCIAL_LINKS = {
  linkedin: 'https://www.linkedin.com/company/heatpumpdb/',
  youtube: 'https://www.youtube.com/@heatpumpdb',
};

const LinkedInIcon: React.FC<{ className?: string }> = ({ className = 'w-[18px] h-[18px]' }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9h4v12H3V9Zm7 0h3.8v1.7h.05c.53-1 1.83-2.05 3.76-2.05C21.4 8.65 22 11.1 22 14.3V21h-4v-5.9c0-1.4-.03-3.2-1.95-3.2-1.96 0-2.26 1.53-2.26 3.1V21h-4V9Z" />
  </svg>
);

const YouTubeIcon: React.FC<{ className?: string }> = ({ className = 'w-[20px] h-[20px]' }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path d="M23.5 6.9a3 3 0 0 0-2.1-2.1C19.5 4.3 12 4.3 12 4.3s-7.5 0-9.4.5A3 3 0 0 0 .5 6.9C0 8.8 0 12 0 12s0 3.2.5 5.1a3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1C24 15.2 24 12 24 12s0-3.2-.5-5.1ZM9.6 15.6V8.4L15.8 12l-6.2 3.6Z" />
  </svg>
);

/**
 * Official channels, header right — a new B2B brand with no reviews yet needs
 * some evidence it is a real company, and these are it. Deliberately quiet and
 * deliberately in a new tab: the signal works by existing, and a visitor who
 * clicks must not lose the page they were about to sign up on.
 */
const SocialLinks: React.FC = () => (
  <div className="flex items-center gap-0.5 sm:gap-1 flex-none">
    {[
      { href: SOCIAL_LINKS.linkedin, label: 'LinkedIn', Icon: LinkedInIcon },
      { href: SOCIAL_LINKS.youtube, label: 'YouTube', Icon: YouTubeIcon },
    ].map(({ href, label, Icon }) => (
      <a
        key={label}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={label}
        title={label}
        className="p-1.5 sm:p-2 rounded-full text-white/40 hover:text-white/85 hover:bg-white/[0.07] transition-colors"
      >
        <Icon />
      </a>
    ))}
  </div>
);

export const AuthShell: React.FC<{
  t: any;
  language: Language;
  setLanguage: (l: Language) => void;
  children: React.ReactNode;
  /** Landing and login only. On the signup form, the invite screen or the
   *  pause notice, an outbound link is a way to lose someone mid-task. */
  showSocial?: boolean;
}> = ({ t, language, setLanguage, children, showSocial }) => (
  <div
    className="min-h-screen relative overflow-hidden text-white font-sans flex flex-col"
    style={{ background: `radial-gradient(120% 100% at 30% 20%, ${BG.baseMid} 0%, ${BG.base} 55%, ${BG.baseDeep} 100%)` }}
  >
    {/* Circulation-field background (market-tinted; rollback tag: auth-bg-v1) */}
    <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
      <div className="hp-aurora-a absolute -top-40 -left-40 w-[42rem] h-[42rem] rounded-full blur-[120px]" style={{ background: `${BG.glowA}2e` }} />
      <div className="hp-aurora-b absolute top-1/3 -right-52 w-[40rem] h-[40rem] rounded-full blur-[120px]" style={{ background: `${BG.glowB}24` }} />
      <div className="absolute -bottom-52 left-1/4 w-[36rem] h-[36rem] rounded-full blur-[130px]" style={{ background: `${BG.glowA}14` }} />
      <SpacetimeField />
      <FlowWave />
      <ResidentialInstallScene />
      <CommercialInstallScene />
    </div>

    <header className="relative z-20 flex items-center justify-between gap-2 sm:gap-4 px-4 sm:px-6 md:px-10 py-4 sm:py-5">
      <div className="flex items-center gap-2 sm:gap-4 min-w-0">
        <Wordmark />
        <MarketBadge t={t} />
      </div>
      <div className="flex items-center gap-2 sm:gap-3 md:gap-5 flex-none">
        {showSocial && <SocialLinks />}
        <LanguagePill language={language} setLanguage={setLanguage} />
      </div>
    </header>

    {/* items-start + small top padding keeps content high so the bottom
        installation scenes stay visible on laptop-height screens */}
    <main className="relative z-20 flex-1 flex items-start justify-center px-4 pt-[4vh] md:pt-[5vh] pb-8">
      {children}
    </main>

    <footer className="relative z-20 px-6 pb-6 flex flex-col items-center">
      {/* Copyright only — market keywords for search live in the meta
          description and JSON-LD (vite market-html plugin), not on screen. */}
      <p className="text-xs text-white/35 text-center">{t.authCopyright}</p>
    </footer>
  </div>
);
