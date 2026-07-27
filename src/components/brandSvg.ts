/**
 * brandSvg — the ONE source of the HeatPump DB artwork.
 *
 * Both renderers read from here, so the logo can never drift between surfaces:
 *   - the React <BrandLogo> / <WavingFlag> components (nav, auth, data sheet),
 *   - the generated PDF data sheet, which rasterizes the standalone documents
 *     below (see hpiq/pdf/brandArtwork.ts).
 * Never redraw the mark or the flag by hand anywhere else — that is exactly how
 * the PDF ended up with a different circle and a square flag (Jul 2026).
 *
 * Geometry is the shipped brand artwork (brand-assets/svg 4a): the symbol lives
 * in a 64x64 box, the full lockup in 348x64, the flag cloth in 96x66.
 * Colors follow brand-assets/README.md.
 */
import { COUNTRY_PROFILES, CountryCode } from '../config/countryProfiles';
import { INTER_600_WORDMARK_WOFF2 } from './interWordmarkFont';

export type BrandTheme = 'dark' | 'light';

/**
 * The hub is a SOLID dot in the ink of the theme — it must read against the
 * background (a white hub on white paper is invisible), exactly as the shipped
 * assets have it: brand-assets/svg/heatpumpdb-symbol-3a-{light,dark}.svg.
 */
export const BRAND_COLORS: Record<BrandTheme, { red: string; blue: string; ink: string; hub: string }> = {
  dark: { red: '#ff6b52', blue: '#2997ff', ink: '#f5f5f7', hub: '#f5f5f7' },
  light: { red: '#e0452c', blue: '#0066cc', ink: '#1d1d1f', hub: '#1d1d1f' },
};

/** Aspect ratios of the artwork boxes (width / height). */
export const LOGO_ASPECT = 348 / 64;
export const SYMBOL_ASPECT = 1;
export const FLAG_ASPECT = 96 / 66;

const WORDMARK_FONT = "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif";

/** Outer cloth boundary shared by every flag face (wave shape + hairline). */
const CLOTH = 'M0 6 C16 0 32 12 48 6 C64 0 80 12 96 6 L96 60 C80 66 64 54 48 60 C32 66 16 54 0 60 Z';

/**
 * Inner markup of the logo. `animated` adds the classes the index.css keyframes
 * hook into (half-turn spin, alternating DB color) — off for documents, where
 * the logo must sit in its canonical orientation.
 *
 * " DB" tracks the arc that is currently on TOP: the canonical (unrotated) frame
 * has the RED arc over the top, so the static logo's DB is RED — that is the
 * frame the shipped assets ship (brand-assets/svg/heatpumpdb-4a-animated-*.svg).
 * The animation then swaps it to blue on the half turn.
 */
export function logoInner(opts: { theme: BrandTheme; symbolOnly?: boolean; animated?: boolean }): string {
  const c = BRAND_COLORS[opts.theme];
  const spin = opts.animated ? ' class="hp-logo-spin"' : '';
  const db = opts.animated ? ' class="hp-logo-db"' : ` fill="${c.red}"`;
  const wordmark = opts.symbolOnly
    ? ''
    : `<text x="82" y="46" font-family="${WORDMARK_FONT}" font-weight="600" font-size="40" letter-spacing="-0.7" fill="${c.ink}">HeatPump<tspan${db}> DB</tspan></text>`;
  return (
    `<g${spin}>` +
    `<path d="M10 32 A22 22 0 0 1 54 32" stroke="${c.red}" stroke-width="5.5" stroke-linecap="round"/>` +
    `<path d="M54 32 A22 22 0 0 1 10 32" stroke="${c.blue}" stroke-width="5.5" stroke-linecap="round"/>` +
    `<path d="M49 31 L54 38 L59 31" stroke="${c.red}" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="M5 33 L10 26 L15 33" stroke="${c.blue}" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/>` +
    `</g>` +
    `<circle cx="32" cy="32" r="6.5" fill="${c.hub}"/>` +
    wordmark
  );
}

/** Inner markup of the market flag. `uid` keeps the clip-path id unique per instance. */
export function flagInner(opts: { country: CountryCode; onLight?: boolean; animated?: boolean; uid: string }): string {
  const { country, onLight = false, animated = false, uid } = opts;
  const sway = animated ? ' class="hp-flag-sway"' : '';
  const hairline = `<path d="${CLOTH}" stroke="${onLight ? 'rgba(0,0,0,0.22)' : 'rgba(255,255,255,0.3)'}" stroke-width="1.5" fill="none"/>`;

  // Germany: the bands are drawn wavy themselves — richer cloth than a clip.
  if (country === 'DE') {
    return (
      `<g${sway}>` +
      `<path d="M0 6 C16 0 32 12 48 6 C64 0 80 12 96 6 L96 24 C80 30 64 18 48 24 C32 30 16 18 0 24 Z" fill="#1a1a1a"/>` +
      `<path d="M0 24 C16 18 32 30 48 24 C64 18 80 30 96 24 L96 42 C80 48 64 36 48 42 C32 48 16 36 0 42 Z" fill="#dd0000"/>` +
      `<path d="M0 42 C16 36 32 48 48 42 C64 36 80 48 96 42 L96 60 C80 66 64 54 48 60 C32 66 16 54 0 60 Z" fill="#ffcc00"/>` +
      hairline +
      `</g>`
    );
  }

  // Other markets: a flat flag face clipped by the wavy cloth shape.
  // GB follows the DE convention (2026-07-27): the Union Jack's horizontal bar
  // and diagonals RIDE THE CLOTH WAVE (same ±6 offsets, same phase as CLOTH) —
  // straight internal lines read as a flat printed rectangle, not waving cloth.
  // The vertical bar stays straight (a vertical line on swaying cloth does).
  const face =
    country === 'GB'
      ? `<rect x="0" y="0" width="96" height="66" fill="#012169"/>` +
        `<path d="M0 0 C16 5 32 28 48 33 C64 38 80 61 96 66 M0 66 C16 49 32 50 48 33 C64 16 80 17 96 0" stroke="#fff" stroke-width="13" fill="none"/>` +
        `<path d="M0 0 C16 5 32 28 48 33 C64 38 80 61 96 66 M0 66 C16 49 32 50 48 33 C64 16 80 17 96 0" stroke="#C8102E" stroke-width="5" fill="none"/>` +
        `<path d="M48 0 V66 M0 33 C16 27 32 39 48 33 C64 27 80 39 96 33" stroke="#fff" stroke-width="20" fill="none"/>` +
        `<path d="M48 0 V66 M0 33 C16 27 32 39 48 33 C64 27 80 39 96 33" stroke="#C8102E" stroke-width="11" fill="none"/>`
      : country === 'FR'
        ? `<rect x="0" y="0" width="32" height="66" fill="#000091"/>` +
          `<rect x="32" y="0" width="32" height="66" fill="#ffffff"/>` +
          `<rect x="64" y="0" width="32" height="66" fill="#E1000F"/>`
        : country === 'PL'
          ? `<rect x="0" y="0" width="96" height="33" fill="#ffffff"/>` +
            `<rect x="0" y="33" width="96" height="33" fill="#D4213D"/>`
          : country === 'IT'
            ? `<rect x="0" y="0" width="32" height="66" fill="#008C45"/>` +
              `<rect x="32" y="0" width="32" height="66" fill="#F4F9FF"/>` +
              `<rect x="64" y="0" width="32" height="66" fill="#CD212A"/>`
            : `<rect x="0" y="0" width="96" height="66" fill="#7a7a7a"/>`;

  return (
    `<g${sway}>` +
    `<clipPath id="${uid}"><path d="${CLOTH}"/></clipPath>` +
    `<g clip-path="url(#${uid})">${face}</g>` +
    hairline +
    `</g>`
  );
}

export function flagLabel(country: CountryCode): string {
  return COUNTRY_PROFILES[country]?.name ?? country;
}

/**
 * Standalone SVG documents — for rasterizing into the PDF. Static (no keyframe
 * classes exist outside the app) and, for the lockup, carrying the subsetted
 * Inter face inline: an SVG inside an <img> may not fetch the Google webfont,
 * so without the data URI the PDF wordmark would drift to a system font.
 */
export function logoSvgDoc(theme: BrandTheme, symbolOnly = false): string {
  const vbW = symbolOnly ? 64 : 348;
  const font = symbolOnly
    ? ''
    : `<defs><style>@font-face{font-family:'Inter';font-style:normal;font-weight:600;src:url(${INTER_600_WORDMARK_WOFF2}) format('woff2');}</style></defs>`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vbW} 64" width="${vbW}" height="64" fill="none">` +
    font +
    logoInner({ theme, symbolOnly, animated: false }) +
    `</svg>`
  );
}

export function flagSvgDoc(country: CountryCode, onLight = true): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 66" width="96" height="66" fill="none">` +
    flagInner({ country, onLight, animated: false, uid: 'pdfclip' }) +
    `</svg>`
  );
}
