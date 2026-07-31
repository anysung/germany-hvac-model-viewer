/**
 * OnboardingTour — the invited feature tour (owner request 2026-07-31).
 *
 * Two layers, both dialogs (never a forced takeover):
 *   1. INVITATION — small centered card: Start / Maybe later / Not today /
 *      Don't show again. Shown on login while onboarding.shouldInvite() says
 *      so (≤5 sessions, not done, not snoozed today).
 *   2. TOUR — six UVP step cards with progress dots, Back/Next, skip anytime,
 *      and a per-step "Try it now" deep link into the real page. Step content
 *      lives in i18n (t.tour.steps) so every market tells its own story
 *      (ZUM/GSE wording etc.).
 *
 * Responsive: one component serves desktop and the phone/tablet shell — the
 * card is width-capped and the layout is single-column, so no per-shell fork.
 * Replayable forever from Account ("App tour"), which is what makes the
 * 5-session invitation ceiling safe.
 */
import React, { useEffect, useState } from 'react';
import { HpApp, HpPage } from './appState';
import { tr } from './i18n';
import { FD } from './ui';
import { markDone, markShown, shouldInvite, snoozeToday } from './onboarding';

/** Per-step deep link (matches t.tour.steps order). null = no jump button. */
const STEP_PAGES: (HpPage | null)[] = [null, 'find', 'products', 'datasheet', 'bafa', 'news'];

/** Simple stroke icons per step (24px viewBox paths, desktop icon style). */
const STEP_ICONS = [
  'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 3v18M3 12h18',                          // database/globe
  'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',                            // search
  'M4 6h16M4 12h10M4 18h6M18 15l3 3-3 3',                                            // filters
  'M6 2h9l5 5v15H6zM15 2v5h5M9 12h8M9 16h8',                                         // sheet
  'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v10M9.5 9.5h3.8a1.8 1.8 0 0 1 0 3.6H9.5', // funding
  'M4 4h13v16H4zM17 8h3v12H6M7.5 8h6M7.5 12h6',                                      // news
];

export const OnboardingTour: React.FC<{ app: HpApp }> = ({ app }) => {
  const t = tr(app.lang);
  const uid = app.user.id;
  // 'idle' → nothing; 'invite' → invitation card; number → tour step index.
  const [view, setView] = useState<'idle' | 'invite' | number>('idle');

  useEffect(() => {
    // Preview/e2e sessions must never meet a modal (?tour=1 forces it for QA).
    const forced = new URLSearchParams(window.location.search).get('tour') === '1';
    if (uid === 'preview' && !forced) return;
    if (forced || shouldInvite(uid)) {
      if (!forced) markShown(uid);
      setView('invite');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  // Account replay hook — Account cards dispatch this to reopen the tour.
  useEffect(() => {
    const open = () => setView(0);
    window.addEventListener('hpdb-tour-open', open);
    return () => window.removeEventListener('hpdb-tour-open', open);
  }, []);

  if (view === 'idle') return null;

  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,.45)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '20px 16px calc(20px + env(safe-area-inset-bottom))',
  };
  const cardBase: React.CSSProperties = {
    background: '#fff', borderRadius: 20, width: '100%', maxWidth: 480,
    boxShadow: '0 24px 64px rgba(0,0,0,.28)', display: 'flex', flexDirection: 'column',
    maxHeight: '86dvh', overflowY: 'auto',
  };
  const primaryBtn: React.CSSProperties = {
    display: 'block', textAlign: 'center', background: '#0066cc', color: '#fff',
    borderRadius: 999, padding: '12px 0', fontSize: 14.5, fontWeight: 600, cursor: 'pointer',
  };
  const ghostBtn: React.CSSProperties = {
    display: 'block', textAlign: 'center', borderRadius: 999, padding: '11px 0',
    fontSize: 13.5, color: '#1d1d1f', border: '1px solid #d2d2d7', cursor: 'pointer', background: '#fff',
  };
  const quietLink: React.CSSProperties = { fontSize: 12.5, color: '#7a7a7a', cursor: 'pointer', textAlign: 'center' };

  /* ── Invitation ── */
  if (view === 'invite') {
    return (
      <div style={overlay} data-testid="tour-invite">
        <div style={{ ...cardBase, padding: '26px 24px 20px', gap: 12 }}>
          <span style={{ fontFamily: FD, fontSize: 20, fontWeight: 600, letterSpacing: '-0.2px' }}>{t.tour.inviteTitle}</span>
          <span style={{ fontSize: 13.5, color: '#555', lineHeight: 1.55 }}>{t.tour.inviteBody}</span>
          <span className="hp-press" onClick={() => setView(0)} style={{ ...primaryBtn, marginTop: 4 }} data-testid="tour-start">{t.tour.inviteStart}</span>
          <span className="hp-press" onClick={() => setView('idle')} style={ghostBtn}>{t.tour.inviteLater}</span>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 22, marginTop: 2 }}>
            <span className="hp-press" onClick={() => { snoozeToday(uid); setView('idle'); }} style={quietLink} data-testid="tour-today">{t.tour.inviteToday}</span>
            <span className="hp-press" onClick={() => { markDone(uid); setView('idle'); }} style={quietLink}>{t.tour.inviteNever}</span>
          </div>
        </div>
      </div>
    );
  }

  /* ── Tour steps ── */
  const i = view as number;
  const steps = t.tour.steps;
  const step = steps[i];
  const last = i === steps.length - 1;
  const finish = () => { markDone(uid); setView('idle'); };
  const jump = STEP_PAGES[i];

  return (
    <div style={overlay} data-testid="tour-step">
      <div style={{ ...cardBase, padding: '24px 24px 18px', gap: 13 }}>
        {/* icon + progress */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ width: 46, height: 46, borderRadius: 14, background: '#eef4fc', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#0066cc" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={STEP_ICONS[i]} /></svg>
          </span>
          <span className="hp-press" onClick={finish} style={{ fontSize: 12.5, color: '#9a9aa0', cursor: 'pointer' }} data-testid="tour-skip">{t.tour.skip}</span>
        </div>
        <span style={{ fontFamily: FD, fontSize: 19, fontWeight: 600, letterSpacing: '-0.2px', lineHeight: 1.3 }}>{step.title}</span>
        <span style={{ fontSize: 13.5, color: '#555', lineHeight: 1.6 }}>{step.body}</span>
        {jump && (
          <span
            className="hp-press"
            onClick={() => { finish(); app.go(jump); }}
            style={{ fontSize: 13, color: '#0066cc', cursor: 'pointer', width: 'fit-content' }}
            data-testid="tour-jump"
          >
            {t.tour.open}
          </span>
        )}
        {/* progress dots */}
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', margin: '4px 0 2px' }}>
          {steps.map((_, d) => (
            <span key={d} onClick={() => setView(d)} style={{ width: d === i ? 18 : 7, height: 7, borderRadius: 999, background: d === i ? '#0066cc' : '#d8d8dc', cursor: 'pointer', transition: 'width .18s' }} />
          ))}
        </div>
        <div style={{ display: 'flex', gap: 9 }}>
          {i > 0 && <span className="hp-press" onClick={() => setView(i - 1)} style={{ ...ghostBtn, flex: 1 }}>{t.tour.back}</span>}
          <span
            className="hp-press"
            onClick={() => (last ? finish() : setView(i + 1))}
            style={{ ...primaryBtn, flex: 2 }}
            data-testid="tour-next"
          >
            {last ? t.tour.done : t.tour.next}
          </span>
        </div>
      </div>
    </div>
  );
};
