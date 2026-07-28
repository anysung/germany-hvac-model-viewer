/**
 * sessionService — concurrent-session tracking client (docs/CONCURRENT_SESSIONS.md).
 *
 * ADVISORY LAYER, FAIL-OPEN BY DESIGN: every network call here is
 * fire-and-forget with swallowed errors. If the function is down, CORS is
 * broken or Firestore hiccups, login and app use are completely unaffected —
 * session tracking just goes stale. The ONLY action this module ever takes
 * against the local device is signing it out after the SERVER wrote
 * revokedAt to this session's document (which we merely subscribe to).
 *
 * All session STATE is server-written (rules deny client writes): this file
 * only transports a heartbeat and renders what the server decided.
 */
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { OPS_FN_URL } from './opsService';

const SID_KEY = 'hpdb-session-id';

/** One session per browser profile; multiple tabs share it by design. */
export function getSessionId(): string {
  try {
    let sid = localStorage.getItem(SID_KEY);
    if (!sid || !/^[A-Za-z0-9_-]{8,64}$/.test(sid)) {
      sid = (crypto?.randomUUID?.() ?? `s-${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9_-]/g, '');
      localStorage.setItem(SID_KEY, sid);
    }
    return sid;
  } catch {
    return 'no-storage-session';   // storage-less context: still a valid id
  }
}

/** Best-effort device description for the Account device list. */
function deviceInfo(): { deviceName: string; browser: string; os: string } {
  const ua = navigator.userAgent;
  const os =
    /Windows/.test(ua) ? 'Windows' :
    /Mac OS X|Macintosh/.test(ua) ? 'macOS' :
    /iPhone|iPad/.test(ua) ? 'iOS' :
    /Android/.test(ua) ? 'Android' :
    /Linux/.test(ua) ? 'Linux' : 'Other';
  const browser =
    /Edg\//.test(ua) ? 'Edge' :
    /OPR\//.test(ua) ? 'Opera' :
    /Chrome\//.test(ua) ? 'Chrome' :
    /Safari\//.test(ua) ? 'Safari' :
    /Firefox\//.test(ua) ? 'Firefox' : 'Browser';
  return { deviceName: `${browser} · ${os}`, browser, os };
}

async function post(path: string, body: Record<string, unknown>): Promise<any> {
  const user = auth.currentUser;
  if (!user) throw new Error('unauthenticated');
  const token = await user.getIdToken();
  const res = await fetch(`${OPS_FN_URL}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  return res.json().catch(() => ({ ok: res.ok }));
}

export interface SessionState {
  /** Over-limit grace deadline (epoch ms), or null when within limits. */
  graceUntilMs: number | null;
  activeCount: number;
  limit: number | null;
}

const HEARTBEAT_MS = 4 * 60_000;

/**
 * Start tracking for the signed-in user. Returns a stop function.
 * onState fires after each successful heartbeat; onRevoked fires exactly once
 * when the SERVER revokes this session (auto-limit / manual / everywhere).
 */
export function startSessionTracking(
  uid: string,
  handlers: { onState?: (s: SessionState) => void; onRevoked?: (reason: string) => void },
): () => void {
  const sid = getSessionId();
  let stopped = false;
  let revokedFired = false;

  const beat = async () => {
    if (stopped) return;
    try {
      const r = await post('sessionHeartbeat', { sessionId: sid, ...deviceInfo() });
      if (!stopped && r?.ok) {
        handlers.onState?.({
          graceUntilMs: typeof r.graceUntil === 'number' ? r.graceUntil : null,
          activeCount: r.activeCount ?? 0,
          limit: r.limit ?? null,
        });
      }
    } catch { /* fail-open: tracking pauses, the app does not */ }
  };

  void beat();
  const timer = setInterval(beat, HEARTBEAT_MS);
  // Mobile sleep / tab restore: an immediate beat on visibility resume keeps
  // this device's lastSeenAt honest instead of waiting out the interval.
  const onVis = () => { if (document.visibilityState === 'visible') void beat(); };
  document.addEventListener('visibilitychange', onVis);

  // The one enforcement hook: our OWN session doc says revoked → local sign-out.
  const unsub = onSnapshot(
    doc(db, 'users', uid, 'sessions', sid),
    snap => {
      const d = snap.data();
      if (d?.revokedAt && !revokedFired) {
        revokedFired = true;
        handlers.onRevoked?.(String(d.revokeReason ?? 'revoked'));
      }
    },
    () => { /* subscription failure = no enforcement, never a lockout */ },
  );

  return () => {
    stopped = true;
    clearInterval(timer);
    document.removeEventListener('visibilitychange', onVis);
    unsub();
  };
}

/** Sign out ONE of my sessions (Account device list). */
export const revokeSessionFn = (sessionId: string): Promise<{ ok: boolean }> =>
  post('revokeSession', { sessionId });

/** Sign out every other device — the current one survives (no token revocation). */
export const revokeOtherSessionsFn = (): Promise<{ ok: boolean; revoked?: number }> =>
  post('revokeOtherSessions', { keepSessionId: getSessionId() });

/** Hard sign-out everywhere: all sessions + refresh tokens (incl. this device). */
export const signOutEverywhereFn = (): Promise<{ ok: boolean }> =>
  post('signOutEverywhere', {});
