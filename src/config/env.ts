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

  /**
   * 'admin' builds the unified operations console (all markets, admin-only,
   * served on its own hosting site). Anything else = the normal country app.
   */
  APP_MODE: (import.meta.env.VITE_APP_MODE as string | undefined) ?? 'app',

  /**
   * Firebase App Check — reCAPTCHA Enterprise site key (public by design).
   * Blocks non-app clients (scripts/bots) from Firebase backends once a
   * service is set to ENFORCED. Unset = App Check is not initialized.
   */
  RECAPTCHA_SITE_KEY: (import.meta.env.VITE_RECAPTCHA_SITE_KEY as string | undefined) ?? '',

  /**
   * Paddle Billing (web checkout — the app is NOT distributed via app stores).
   * Client tokens are publishable by design; 'test_…' selects the sandbox.
   * Unset = billing UI shows a "coming soon" notice instead of a checkout.
   */
  PADDLE_CLIENT_TOKEN: (import.meta.env.VITE_PADDLE_CLIENT_TOKEN as string | undefined) ?? '',

  /**
   * Account/billing Cloud Function base URL (google_cloud_function_billing/,
   * endpoints /finalizeSignup /createTeamOrg /deleteAccount /paddleWebhook).
   * THIS IS THE TRIAL-FLOW SWITCH: unset → the app keeps the legacy
   * pending/admin-approval signup flow and the client-side deletion request;
   * set → email-verification signup, server-granted 15-day trial and
   * server-side account deletion. Do not set it in production builds before
   * the function is deployed and verified.
   */
  BILLING_FN_URL: ((import.meta.env.VITE_BILLING_FN_URL as string | undefined) ?? '').replace(/\/+$/, ''),

  // Paddle price ids are NOT env vars — they live in config/paddlePrices.ts,
  // keyed by currency so every EUR market shares one catalogue.
} as const;
