/**
 * OnboardingTour — INTERACTIVE spotlight tour (owner request 2026-07-31 v2:
 * "not a popup slideshow — guided clicks on the real screen").
 *
 * HOW IT WORKS
 *   • Steps target real elements via [data-tour="…"] attributes placed in both
 *     the desktop pages and the phone shell. The engine navigates to the
 *     step's page (app.go), scrolls the target into view, cuts a spotlight
 *     hole around it (box-shadow overlay + pulsing halo) and shows a small
 *     tooltip card beside it.
 *   • Steps advance three ways:
 *       'click' — the user performs the REAL action (the hole is
 *                 click-through; the target's own handler runs and the tour
 *                 moves on). A bouncing hint chip marks the spot; a subtle
 *                 secondary "Next" remains so nobody can get stuck.
 *       'type'  — the search step: the engine types the demo query into the
 *                 real store letter by letter (typewriter effect), results
 *                 appear live behind the overlay, then it auto-advances.
 *       'next'  — plain explain-and-continue.
 *   • The flow is the BEST-PRACTICE journey, not page order: search →
 *     open a model → compare (desktop) / detail sheet (phone) → data sheet
 *     with the EU-label switch → funding workflow → monthly news → done.
 *   • Exit anytime: Skip on every card, Esc, or clicking the dimmed area.
 *     A tutor icon in both headers reopens the tour forever (which is what
 *     makes the 5-session invitation ceiling safe).
 *
 * SAFETY: if a target cannot be found (layout change, empty state), the step
 * falls back to a centered card — the tour can never hard-block the app. The
 * engine is absent for preview/e2e sessions (uid 'preview', ?tour=1 forces).
 */
import React, { useEffect, useRef, useState } from 'react';
import { HpApp, HpPage } from './appState';
import { tr } from './i18n';
import { FD } from './ui';
import { markDone, markShown, shouldInvite, snoozeToday } from './onboarding';

interface Rect { top: number; left: number; width: number; height: number }

interface StepDef {
  /** Page the step lives on (engine navigates there). */
  page: HpPage;
  /** [data-tour] target id; null = centered card (no spotlight). */
  target: string | null;
  advance: 'click' | 'type' | 'next';
  /** Index into t.tour.steps for title/body. */
  copy: number;
  /** Viewports the step applies to. */
  when: 'both' | 'desktop' | 'phone';
}

/* Best-practice flow. copy indexes map to t.tour.steps (i18n).
   Phone rides the app's own natural chain: search → tap a result (detail
   sheet opens) → tap its Data-sheet button (the app itself navigates) —
   every transition is the user's real gesture. Desktop inserts the
   compare-tray stop; its detail-less openProduct goes straight to Products. */
const STEPS: StepDef[] = [
  { page: 'find',      target: 'search',       advance: 'type',  copy: 0, when: 'both' },
  { page: 'find',      target: 'result-open',  advance: 'click', copy: 1, when: 'both' },
  { page: 'products',  target: 'compare-tray', advance: 'next',  copy: 2, when: 'desktop' },
  { page: 'find',      target: 'detail-sheet', advance: 'click', copy: 6, when: 'phone' },
  { page: 'datasheet', target: 'ds-mode',      advance: 'next',  copy: 3, when: 'both' },
  { page: 'bafa',      target: 'funding',      advance: 'next',  copy: 4, when: 'both' },
  { page: 'install',   target: 'install',      advance: 'next',  copy: 7, when: 'both' },
  { page: 'news',      target: 'news',         advance: 'next',  copy: 5, when: 'both' },
];

const DEMO_QUERY = 'Vitocal';
const TYPE_START_MS = 800;
const TYPE_CHAR_MS = 115;
const TYPE_TAIL_MS = 1700;

/** `hold`: the onboarding sheet (three profile questions) is on screen. A new
 *  account triggers BOTH first-run surfaces at once, and until 2026-09-03 they
 *  simply stacked — the tour card painted over the half-visible sheet. The
 *  sheet goes first (it is account data, asked once); the invite waits here
 *  and fires when `hold` drops. `?tour=1` still forces through. */
export const OnboardingTour: React.FC<{ app: HpApp; viewport: 'desktop' | 'phone'; hold?: boolean }> = ({ app, viewport, hold }) => {
  const t = tr(app.lang);
  const uid = app.user.id;
  const steps = STEPS.filter(s => s.when === 'both' || s.when === viewport);

  // 'idle' | 'invite' | 'finish' | step index
  const [view, setView] = useState<'idle' | 'invite' | 'finish' | number>('idle');
  const [rect, setRect] = useState<Rect | null>(null);
  const typeTimer = useRef<number[]>([]);
  const appRef = useRef(app);
  appRef.current = app;

  /* ── Entry: invitation on login (≤5 sessions), header icon, Account replay ── */
  useEffect(() => {
    const forced = new URLSearchParams(window.location.search).get('tour') === '1';
    if (uid === 'preview' && !forced) return;
    if (hold && !forced) return;            // the onboarding sheet has the stage
    if (forced || shouldInvite(uid)) {
      if (!forced) markShown(uid);
      setView('invite');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, hold]);
  useEffect(() => {
    const open = () => setView('invite');
    window.addEventListener('hpdb-tour-open', open);
    return () => window.removeEventListener('hpdb-tour-open', open);
  }, []);

  const clearTimers = () => { typeTimer.current.forEach(clearTimeout); typeTimer.current = []; };
  const finish = (completed: boolean) => {
    clearTimers();
    markDone(uid);
    setView(completed ? 'finish' : 'idle');
  };

  const stepIdx = typeof view === 'number' ? view : -1;
  const step = stepIdx >= 0 ? steps[stepIdx] : null;
  const goNext = () => {
    clearTimers();
    if (stepIdx + 1 >= steps.length) finish(true);
    else setView(stepIdx + 1);
  };
  const goNextRef = useRef(goNext);
  goNextRef.current = goNext;

  /* ── Step lifecycle: navigate → find target → measure → wire advancement ── */
  useEffect(() => {
    if (!step) { setRect(null); return; }
    let dead = false;
    const a = appRef.current;
    if (a.page !== step.page) a.go(step.page);

    // The search step demos the real search with a typewriter.
    if (step.advance === 'type') {
      a.setQuery('');
      DEMO_QUERY.split('').forEach((_, i) => {
        typeTimer.current.push(window.setTimeout(() => appRef.current.setQuery(DEMO_QUERY.slice(0, i + 1)), TYPE_START_MS + i * TYPE_CHAR_MS));
      });
      typeTimer.current.push(window.setTimeout(() => { if (!dead) goNextRef.current(); }, TYPE_START_MS + DEMO_QUERY.length * TYPE_CHAR_MS + TYPE_TAIL_MS));
    }

    let el: Element | null = null;
    let clickHandler: (() => void) | null = null;
    const started = Date.now();
    const tick = () => {
      if (dead) return;
      const found = step.target ? document.querySelector(`[data-tour="${step.target}"]`) : null;
      if (found && found !== el) {
        el = found;
        (el as HTMLElement).scrollIntoView({ block: 'center', behavior: 'smooth' });
        if (step.advance === 'click') {
          clickHandler = () => { window.setTimeout(() => goNextRef.current(), 250); };
          el.addEventListener('click', clickHandler, { once: true });
        }
      }
      if (el && el.isConnected) {
        const r = el.getBoundingClientRect();
        setRect({ top: r.top - 6, left: r.left - 6, width: r.width + 12, height: r.height + 12 });
      } else if (Date.now() - started > 2500) {
        setRect(null);   // fallback: centered card, never blocks
      }
    };
    tick();
    const iv = window.setInterval(tick, 220);
    return () => {
      dead = true;
      window.clearInterval(iv);
      if (el && clickHandler) el.removeEventListener('click', clickHandler);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIdx]);

  /* ── Esc exits ── */
  useEffect(() => {
    if (view === 'idle') return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') finish(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  if (view === 'idle') return null;

  const FDcard: React.CSSProperties = {
    background: '#fff', borderRadius: 18, boxShadow: '0 20px 56px rgba(0,0,0,.3)',
    padding: '20px 20px 16px', display: 'flex', flexDirection: 'column', gap: 10,
  };
  const primaryBtn: React.CSSProperties = {
    display: 'block', textAlign: 'center', background: '#0066cc', color: '#fff',
    borderRadius: 999, padding: '11px 0', fontSize: 14, fontWeight: 600, cursor: 'pointer',
  };
  const ghostBtn: React.CSSProperties = {
    display: 'block', textAlign: 'center', borderRadius: 999, padding: '10px 0',
    fontSize: 13, color: '#1d1d1f', border: '1px solid #d2d2d7', cursor: 'pointer', background: '#fff',
  };

  /* ── Invitation ── */
  if (view === 'invite') {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} data-testid="tour-invite">
        <div className="hp-tour-tip" style={{ ...FDcard, width: '100%', maxWidth: 460, padding: '26px 24px 20px', gap: 12 }}>
          <span style={{ fontFamily: FD, fontSize: 20, fontWeight: 600, letterSpacing: '-0.2px' }}>{t.tour.inviteTitle}</span>
          <span style={{ fontSize: 13.5, color: '#555', lineHeight: 1.55 }}>{t.tour.inviteBody}</span>
          <span className="hp-press" onClick={() => setView(0)} style={{ ...primaryBtn, marginTop: 4, padding: '12px 0' }} data-testid="tour-start">{t.tour.inviteStart}</span>
          <span className="hp-press" onClick={() => setView('idle')} style={ghostBtn}>{t.tour.inviteLater}</span>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 22, marginTop: 2 }}>
            <span className="hp-press" onClick={() => { snoozeToday(uid); setView('idle'); }} style={{ fontSize: 12.5, color: '#7a7a7a', cursor: 'pointer' }} data-testid="tour-today">{t.tour.inviteToday}</span>
            <span className="hp-press" onClick={() => { markDone(uid); setView('idle'); }} style={{ fontSize: 12.5, color: '#7a7a7a', cursor: 'pointer' }}>{t.tour.inviteNever}</span>
          </div>
        </div>
      </div>
    );
  }

  /* ── Finish celebration ── */
  if (view === 'finish') {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} data-testid="tour-finish">
        <div className="hp-tour-tip" style={{ ...FDcard, width: '100%', maxWidth: 420, alignItems: 'center', textAlign: 'center', padding: '30px 24px 22px', gap: 12 }}>
          <span className="hp-tour-check" style={{ width: 58, height: 58, borderRadius: '50%', background: '#e7f6ee', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#0a7a43" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 12.5l5 5L19.5 7" /></svg>
          </span>
          <span style={{ fontFamily: FD, fontSize: 19, fontWeight: 600 }}>{t.tour.finishTitle}</span>
          <span style={{ fontSize: 13.5, color: '#555', lineHeight: 1.55 }}>{t.tour.finishBody}</span>
          <span className="hp-press" onClick={() => { setView('idle'); appRef.current.go('find'); }} style={{ ...primaryBtn, width: '100%' }} data-testid="tour-done">{t.tour.done}</span>
        </div>
      </div>
    );
  }

  /* ── Active step: spotlight + blockers + tooltip ── */
  if (!step) return null;
  const copy = t.tour.steps[step.copy];
  const clickThrough = step.advance === 'click';
  const vw = window.innerWidth, vh = window.innerHeight;

  // Tooltip placement: below the hole if there is room, else above; centered fallback.
  const tipW = Math.min(340, vw - 24);
  let tipStyle: React.CSSProperties;
  if (rect) {
    const below = rect.top + rect.height + 16;
    const spaceBelow = vh - below;
    const top = spaceBelow > 220 ? below : Math.max(12, rect.top - 16 - 210);
    const left = Math.min(Math.max(12, rect.left + rect.width / 2 - tipW / 2), vw - tipW - 12);
    tipStyle = { position: 'fixed', top, left, width: tipW, zIndex: 204 };
  } else {
    tipStyle = { position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: tipW, zIndex: 204 };
  }

  const blockers: Rect[] = rect ? [
    { top: 0, left: 0, width: vw, height: Math.max(0, rect.top) },
    { top: rect.top + rect.height, left: 0, width: vw, height: Math.max(0, vh - rect.top - rect.height) },
    { top: rect.top, left: 0, width: Math.max(0, rect.left), height: rect.height },
    { top: rect.top, left: rect.left + rect.width, width: Math.max(0, vw - rect.left - rect.width), height: rect.height },
  ] : [{ top: 0, left: 0, width: vw, height: vh }];

  return (
    <div data-testid="tour-step">
      {/* spotlight frame (visual only) */}
      {rect ? (
        <div className="hp-tour-spot" style={{ position: 'fixed', top: rect.top, left: rect.left, width: rect.width, height: rect.height, borderRadius: 12, zIndex: 201, pointerEvents: 'none' }} />
      ) : (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,15,18,.55)', zIndex: 201, pointerEvents: 'none' }} />
      )}
      {/* click blockers around the hole (dimmed area exits nothing; it just blocks) */}
      {blockers.map((b, i) => (
        <div key={i} style={{ position: 'fixed', top: b.top, left: b.left, width: b.width, height: b.height, zIndex: 202 }} />
      ))}
      {/* non-click steps: cover the hole too, so the page cannot shift under the tour */}
      {rect && !clickThrough && step.advance !== 'type' && (
        <div style={{ position: 'fixed', top: rect.top, left: rect.left, width: rect.width, height: rect.height, zIndex: 202 }} />
      )}
      {/* guided-click nudge chip */}
      {rect && clickThrough && (
        <span className="hp-tour-nudge" style={{ position: 'fixed', top: Math.max(8, rect.top - 34), left: rect.left + rect.width / 2, transform: 'translateX(-50%)', zIndex: 204, background: '#0066cc', color: '#fff', fontSize: 12, fontWeight: 600, borderRadius: 999, padding: '5px 13px', whiteSpace: 'nowrap', pointerEvents: 'none' }}>
          {t.tour.clickHint}
        </span>
      )}

      {/* tooltip card */}
      <div key={stepIdx} className="hp-tour-tip" style={{ ...FDcard, ...tipStyle }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 5 }}>
            {steps.map((_, d) => (
              <span key={d} style={{ width: d === stepIdx ? 16 : 6, height: 6, borderRadius: 999, background: d === stepIdx ? '#0066cc' : '#d8d8dc', transition: 'width .18s' }} />
            ))}
          </div>
          <span className="hp-press" onClick={() => finish(false)} style={{ fontSize: 12, color: '#9a9aa0', cursor: 'pointer' }} data-testid="tour-skip">{t.tour.skip}</span>
        </div>
        <span style={{ fontFamily: FD, fontSize: 16.5, fontWeight: 600, lineHeight: 1.35 }}>{copy.title}</span>
        <span style={{ fontSize: 13, color: '#555', lineHeight: 1.55 }}>{copy.body}</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {stepIdx > 0 && step.advance !== 'type' && (
            <span className="hp-press" onClick={() => { clearTimers(); setView(stepIdx - 1); }} style={{ ...ghostBtn, flex: 1 }}>{t.tour.back}</span>
          )}
          {step.advance !== 'type' && (
            <span className="hp-press" onClick={goNext} style={{ ...(clickThrough ? ghostBtn : primaryBtn), flex: 2 }} data-testid="tour-next">
              {stepIdx + 1 >= steps.length ? t.tour.done : t.tour.next}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
