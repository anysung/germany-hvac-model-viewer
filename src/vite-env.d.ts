/// <reference types="vite/client" />

/** TTF font assets imported as URLs (jsPDF embedded fonts). */
declare module '*.ttf?url' {
  const url: string;
  export default url;
}

/** Build fingerprint (vite.config define) — compared with /version.json by updateCheck.ts. */
declare const __BUILD_ID__: string;

/** Build-time market catalogue stats (vite.config define) — shown on the auth landing. */
declare const __MARKET_STATS__: { res: number; com: number; mfr: number };

/** Build-time stats for every market (vite.config define) — unified admin console. */
declare const __ALL_MARKET_STATS__: Record<string, { res: number; com: number; mfr: number }>;
