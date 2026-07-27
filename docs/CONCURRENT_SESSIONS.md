# Concurrent-Session Limit (owner-approved design, 2026-07-28)

Goal: allow normal multi-device use but suppress persistent multi-person
sharing of ONE personal account. Explicitly NOT an anti-scraping control
(datasets are already on-device once downloaded) and NOT a device cap.

## Policy

| Plan | Registered devices | Concurrently ACTIVE sessions | Over limit |
|---|---|---|---|
| Professional | unlimited | 2 | 30-min grace, then LRU eviction |
| Team member | unlimited (per member) | 2 per member | same |
| Owner/admin roles | unlimited | unlimited | exempt (server-side) |

- **Active session** = `revokedAt` absent AND server-written `lastSeenAt`
  within the last 10 minutes.
- **3rd active session**: NOT blocked. A 30-minute grace starts
  (`graceUntil`); every signed-in device shows a live countdown banner.
  If active sessions drop to ≤2 before expiry the grace cancels silently —
  normal device switching (old device idles out of the 10-min window)
  resolves itself with no eviction.
- **At expiry, still ≥3 active**: the server revokes the session with the
  oldest `lastSeenAt` (ties → oldest `createdAt`). The judging caller is
  structurally never evicted (it just heartbeated). The evicted device shows
  a reason notice, then signs out. Re-login is allowed (a new grace cycle
  starts); repeats are counted server-side for later admin review.

## Enforcement is SERVER-side (binding — 2026-07-28 review)

The adversary for this feature is the account owner's own client, so the
client is never trusted with limit state:

- Session docs (`users/{uid}/sessions/{sid}`) are **client-read-only**
  (owner may subscribe/list; ALL writes `if false` in rules — created and
  mutated exclusively by the function with server time).
- `sessionHeartbeat` (accountBilling fn) does, in one Firestore transaction:
  ensure/create the caller's session doc → update `lastSeenAt` (server
  time) → compute active count → set `graceUntil` (+30 min) when >limit and
  no grace → clear grace when ≤limit → after expiry with >limit, revoke the
  LRU session (reason + audit fields) → return
  `{ session, activeCount, graceUntil, limit, revoked? }`.
- `revokeSession { sessionId }` — sign out ONE of your own sessions.
- `revokeOtherSessions { keepSessionId }` — sign out every other session.
  Does NOT touch refresh tokens (the current device must survive).
- `signOutEverywhere` — revokes all session docs AND
  `admin.auth().revokeRefreshTokens(uid)` (hard cutoff ≤1 h for all
  devices INCLUDING the caller, which then signs out locally).
- Server-only bookkeeping on the user doc: `overLimitEvents`,
  `autoRevokedCount`, `lastAutoRevokeAt`. Revoked session docs carry
  `revokeReason` ('auto-limit' | 'manual' | 'sign-out-everywhere').

## Ops config (kill switch, no redeploy)

`opsConfig/sessions` Firestore doc — owner-writable from the console
(rules: read isAdmin, write ownerToken), function reads with a 60 s
in-memory cache: `{ enabled, activeLimit: 2, activeWindowMin: 10,
graceMin: 30 }`. `enabled: false` = heartbeats still record sessions
(visibility survives) but no grace/eviction ever runs.

## Fail-open (binding)

Sessions are an ADVISORY layer bolted beside auth: every client call is
fire-and-forget with swallowed errors. Function down / CORS broken /
Firestore hiccup → login and app use are completely unaffected; session
tracking just goes stale. The revoked-state listener only ever signs the
LOCAL device out following an explicit server-written `revokedAt`.

## Client behaviour

- `sessionId` in localStorage → one session per browser profile; multiple
  tabs share it (multi-tab is ONE session by design).
- Heartbeat every 4 min + on visibility resume (mobile sleep recovery).
- Banner priority (single slot, top wins): dataset-load error → session
  grace countdown → trial countdown.
- Account page "Devices & sessions" card: session list (this device
  marked, last-active), per-session sign-out, sign out other devices,
  sign out everywhere.
- Evicted device: reason notice (localized) on the auth surface, not a
  bare login screen.

## Known limits (accepted)

- A fully patched client that never heartbeats is invisible to the limit —
  and unreachable by ANY session scheme, since security rules cannot tell
  which session a Firestore/Storage read belongs to. This feature deters
  ordinary sharing; canaries/terms/registry handle the rest.
- Sessions only start after login; pending/verify accounts are tracked too
  (harmless — no exemptions to reason about).

## Test matrix (owner-specified)

multi-tab single-session · 3 browsers concurrent heartbeats → grace ·
natural drop to 2 during grace → cancel · grace expiry → LRU eviction
(caller survives) · mobile-sleep resume heartbeat · sign-out-others keeps
caller · sign-out-everywhere revokes refresh tokens · kill switch off →
no eviction · owner exemption · function-failure fail-open.
