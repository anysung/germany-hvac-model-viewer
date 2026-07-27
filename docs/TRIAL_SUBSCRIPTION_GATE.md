# Trial & Subscription Gate (2026-07-27)

The subscription program's free period moved OUT of Paddle and INTO the app:
every new account gets **7 days of full access with no payment method**, and on
day 8 the server closes access until a subscription is paid (checkout charges
immediately — Paddle prices carry **no trial**).

## System principle (owner decision — binding)

**Never wrongly block a paying user.** Automatic access termination happens
ONLY through:

1. **Natural expiry** — `request.time` passes `accessUntilTs` and no payment
   extended it, or
2. **Confirmed final cancellation** — Paddle `subscription.canceled` (access
   still runs to the paid period end).

Refunds (requested / pending / approved / rejected / partial), `past_due`,
**chargebacks and chargeback reversals**, webhook ordering errors, missing
events, API failures and any ambiguous state **never** remove access — they are
recorded to `paddleAdjustments` and surfaced in the admin Billing page
("Billing review") only. Allow-signals (payment completed, active subscription)
apply immediately; on conflict, allow wins and the case is flagged.

The sanctioned exceptions (unrelated to payment errors): the user's own account
deletion, and an explicit owner/admin stop (`adminClearSubscription`,
`revokeGrant`, suspend).

## Architecture

- **One gating field**: `accessUntilTs` (Firestore Timestamp) on `users/{uid}`
  and `organizations/{orgId}`. Server-written ONLY (finalizeSignup, webhook,
  admin backstop). Rules allow reads while `request.time < accessUntilTs`; a
  document **without** the field is not gated (legacy accounts, owner —
  fail-open by construction).
- **Entitlement rule** (firestore.rules `isEntitled()`, mirrored in
  storage.rules): `admin/owner → allow` else `active AND (own window open OR
  team window open)`. Applied to `countries/**` reads and the datasets bucket.
- **Client mirror**: `src/config/entitlement.ts` (`accessInfo`) drives the
  trial banner (D-3..D-1) and the SubscribeGate screen — UX only; the server
  rules are the enforcement.
- **One trial per email, service-wide**: `emailRegistry/{trim+lowercase
  email}` records first registration / trial use; survives account deletion
  with `retentionUntil = deletion + 1 year` (Firestore TTL deletes it after
  that). Re-registration within the year → active account with an
  already-expired window → straight to checkout. No hashing (owner decision);
  the collection is admin/server-only in rules.
- **Teams**: every condition anchors to the team ADMIN. `createTeamOrg` makes
  a `trialing` org BEFORE payment with the admin's own `trialEndsAt` /
  `accessUntilTs`; members inherit the org window (rules read the org — no
  per-member fan-out). Webhook payment flips org + admin together.

## Cloud Function (`google_cloud_function_billing/`, entry `accountBilling`)

| Endpoint | Auth | Purpose |
|---|---|---|
| `POST /finalizeSignup` | ID token | THE activation point. Verifies the **Firebase Auth server record** (`getUser().emailVerified`; social providers skip mail check), consents (versions stamped server-side), registry history; grants the one trial (or activates with a closed window); one Firestore transaction. |
| `POST /createTeamOrg` | ID token | Trialing org anchored to the caller. |
| `POST /deleteAccount` | ID token | One Firestore transaction (registry retention, seat release by uid-filter, PII-free profile skeleton, change-request delete) → ticket anonymization → **Auth deletion last**. Fully idempotent/retryable. |
| `POST /paddleWebhook` | Paddle signature | Event matrix below; idempotent via `paddleWebhookEvents/{event_id}`; `occurred_at` ordering guard; `extendWindowPatch` = windows only ever grow. |

Webhook matrix: `subscription.activated` / `transaction.completed` → extend
window + sync org · `subscription.updated` → record (extend-only) ·
`past_due` → record only · `canceled` → status recorded, window untouched
(natural expiry does the rest) · `adjustment.*` (refund/chargeback/credit) →
`paddleAdjustments` audit + admin review flag, **no access change ever**.

## Launch switch (P7)

The client flow is dark until **`VITE_BILLING_FN_URL`** is set at build time
(src/config/env.ts). Unset → exactly the legacy behavior (pending profile +
admin approval). The rules gate is data-driven: only accounts that
finalizeSignup stamped can ever expire, so deploying rules early is safe.

**Do not reopen registration (`src/config/registration.ts`) until:**
1. `google_cloud_function_billing/deploy.sh` deployed; `/health` OK.
2. Firestore TTL policy created:
   `gcloud firestore fields ttls update retentionUntil --collection-group=emailRegistry --enable-ttl --project=gen-lang-client-0324244302`
3. Paddle catalogue created **without trial periods**; price ids in
   `src/config/paddlePrices.ts`; `VITE_PADDLE_CLIENT_TOKEN` set.
4. Webhook endpoint registered in Paddle (Notifications → Destinations →
   `<function-url>/paddleWebhook`) with events: subscription.activated,
   subscription.updated, subscription.canceled, subscription.past_due,
   transaction.completed, adjustment.created, adjustment.updated.
   `PADDLE_WEBHOOK_SECRET` env set via deploy.sh.
5. **Sandbox verification passed** (paddle sandbox + test cards): first
   checkout → window extends; renewal; past_due (declined card) → access
   kept; cancel → access to period end; refund approved → access kept +
   review item appears; duplicate/replayed webhook → no double-apply.
6. Owner custom claim set once (optional hardening, recommended):
   `admin.auth().setCustomUserClaims(<owner uid>, { owner: true })`.
7. Build every market with `VITE_BILLING_FN_URL=<function url>` and deploy.

## Test checklist (e2e targets)

- Email signup → consent popup (decline aborts) → verify mail → activate →
  `trialEndsAt = +7d`; banner at D-3/D-2/D-1; SubscribeGate on day 8; datasets
  + news actually denied by rules (SDK-level check, not just UI).
- Social signup: consent gate before activation; provider-verified (no mail).
- Re-registration after deletion → no trial → immediate SubscribeGate;
  after TTL expiry (simulate by deleting registry doc) → trial again.
- Team: trial admin creates org → invite existing/new emails → member's gate
  date == admin's; admin payment unblocks all; member leaving then signing up
  solo gets no trial.
- Owner account: never gated, all markets readable, admin console intact.
- Grant: `createGrant` → redemption opens window == grant `endsAtTs` (rules
  reject any other value).
- deleteAccount: retry after simulated failure completes; seat freed once;
  registry has `retentionUntil`; Auth account gone.
