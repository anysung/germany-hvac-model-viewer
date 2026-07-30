/**
 * updateCheck — keeps the installed home-screen app current (owner report
 * 2026-07-31: "the installed web app never gets updates").
 *
 * WHY THIS EXISTS. The app ships as an installable PWA (manifest, standalone)
 * but deliberately has NO service worker — a SW is another cache layer and the
 * classic cause of exactly this staleness bug. Without one, updates ride on
 * plain HTTP caching, and iOS standalone apps resume their FROZEN page
 * instance on reopen: index.html may simply never be re-requested, so even
 * correct no-cache headers (firebase.json) cannot help until a reload happens.
 * This module is what makes that reload happen.
 *
 * HOW. Every build embeds __BUILD_ID__ and deploys /version.json with the same
 * value (vite.config, served no-cache). When the app RESUMES after being
 * hidden for a while, we fetch the beacon; a different id means a newer deploy
 * exists, and we reload once — at the exact moment the user has just come
 * back and has not started doing anything yet.
 *
 * WHY IT DOES NOT DISTURB ANYONE:
 * - Only fires on the hidden→visible transition after ≥5 minutes away — a
 *   quick app-switch (reply to a message, copy a number) never reloads, so
 *   in-progress work is never thrown away mid-task.
 * - Skips the reload if a text field is focused, as a second guard.
 * - One reload per detection; the reloaded page IS the new build, so the
 *   comparison converges immediately.
 * - Datasets reappear instantly after reload (IndexedDB cache, md5-validated);
 *   the Firebase session survives reloads by design.
 * - Network failures do nothing — an offline resume must never break the app.
 */
const MIN_HIDDEN_MS = 5 * 60 * 1000;

let hiddenAt = 0;

function typingNow(): boolean {
  const el = document.activeElement;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || (el as HTMLElement).isContentEditable);
}

async function checkAndReload(): Promise<void> {
  try {
    const r = await fetch('/version.json', { cache: 'no-store' });
    if (!r.ok) return;
    const { build } = await r.json();
    if (typeof build === 'string' && build !== __BUILD_ID__ && !typingNow()) {
      location.reload();
    }
  } catch { /* offline / captive portal — never disturb the session */ }
}

export function startUpdateCheck(): void {
  // Dev server has no version.json and hot-reloads anyway.
  if (!import.meta.env.PROD) return;

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now();
    } else if (hiddenAt && Date.now() - hiddenAt >= MIN_HIDDEN_MS) {
      void checkAndReload();
    }
  });

  // iOS restores from the back-forward cache with a `pageshow(persisted)`
  // instead of a visibilitychange in some resume paths — cover both.
  window.addEventListener('pageshow', e => {
    if ((e as PageTransitionEvent).persisted && hiddenAt && Date.now() - hiddenAt >= MIN_HIDDEN_MS) {
      void checkAndReload();
    }
  });
}
