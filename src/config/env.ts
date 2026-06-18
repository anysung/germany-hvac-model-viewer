/**
 * env.ts — Public build-time environment values.
 *
 * POLICY (enforced):
 *   - Only VITE_-prefixed variables belong here. Vite exposes these to the
 *     browser bundle at build time; they are not secret.
 *   - Secret keys (EPREL_API_KEY, Gemini API key, Firebase service account, etc.)
 *     must NEVER appear in this file, in any src/ file, or in vite.config.ts.
 *   - Local secrets: .env.local (gitignored).
 *   - Production secrets: Google Secret Manager → Cloud Function env at runtime.
 *   - If you are tempted to add a non-VITE_ key here: don't. It belongs in a
 *     server-side script or Cloud Function instead.
 *
 * Adding a new public config value:
 *   1. Add VITE_MY_VAR=value to .env.local.
 *   2. Add MY_VAR: import.meta.env.VITE_MY_VAR to PUBLIC_ENV below.
 *   3. Document the allowed values in a comment.
 */

export const PUBLIC_ENV = {
  /**
   * ISO 3166-1 alpha-2 country code for this build.
   * Controls which CountryProfile is active. Defaults to 'DE'.
   * Set VITE_COUNTRY_CODE=GB for a UK build.
   */
  COUNTRY_CODE: (import.meta.env.VITE_COUNTRY_CODE as string | undefined) ?? 'DE',
} as const;
