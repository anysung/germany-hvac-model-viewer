/** Funding page — curated market funding updates (BAFA/KfW for DE, BUS/MCS for GB). */
import React from 'react';
import { HpApp } from '../appState';
import { tr } from '../i18n';
import { FUNDING_SOURCE_LINKS } from '../market';
import { FD, SubTabs, sectionLabel } from '../ui';

// Official source links — titles/subs come from the i18n dictionary (zipped by index).
const SOURCES = FUNDING_SOURCE_LINKS;

export const BafaPage: React.FC<{ app: HpApp }> = ({ app }) => {
  const t = tr(app.lang);
  const totalText = app.totalListed ? app.totalListed.toLocaleString('en-US') : '—';
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <div style={{ background: '#f5f5f7', padding: '44px 48px 36px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <SubTabs
          group="funding"
          tabs={[{ id: 'bafa', label: t.nav.bafa }, { id: 'guide', label: t.nav.guide }]}
          active="bafa"
          onSelect={id => app.go(id as 'bafa' | 'guide')}
          style={{ marginBottom: 12 }}
        />
        <span style={{ fontFamily: FD, fontSize: 34, fontWeight: 600, letterSpacing: '-0.374px' }}>{t.bafa.heroTitle}</span>
        <span style={{ fontSize: 17, color: '#7a7a7a', letterSpacing: '-0.374px', maxWidth: 640 }}>
          {t.bafa.heroSub}
        </span>
      </div>
      <div style={{ maxWidth: 1160, width: '100%', margin: '0 auto', padding: '28px 48px 48px', display: 'flex', flexDirection: 'column', gap: 24, boxSizing: 'border-box' }}>

        {/* status summary */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
          <div style={{ border: '1px solid #e0e0e0', borderRadius: 18, padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={sectionLabel}>{t.bafa.card1Title}</span>
            <span style={{ fontFamily: FD, fontSize: 21, fontWeight: 600, letterSpacing: '-0.2px' }}>{t.bafa.card1Head}</span>
            <span style={{ fontSize: 12.5, color: '#7a7a7a', lineHeight: 1.5 }}>{t.bafa.card1Text}</span>
          </div>
          <div style={{ border: '1px solid #e0e0e0', borderRadius: 18, padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={sectionLabel}>{t.bafa.card2Title}</span>
            <span style={{ fontFamily: FD, fontSize: 21, fontWeight: 600, letterSpacing: '-0.2px' }}>{t.bafa.card2Head}</span>
            <span style={{ fontSize: 12.5, color: '#7a7a7a', lineHeight: 1.5 }}>{t.bafa.card2Text}</span>
          </div>
          <div style={{ border: '1px solid #e0e0e0', borderRadius: 18, padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={sectionLabel}>{t.bafa.card3Title}</span>
            <span style={{ fontFamily: FD, fontSize: 21, fontWeight: 600, letterSpacing: '-0.2px' }}>{t.bafa.card3Head(totalText)}</span>
            <span style={{ fontSize: 12.5, color: '#7a7a7a', lineHeight: 1.5 }}>{t.bafa.card3Text}</span>
          </div>
        </div>

        {/* recent changes */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <span data-tour="funding" style={{ fontFamily: FD, fontSize: 21, fontWeight: 600, letterSpacing: '-0.2px' }}>{t.bafa.recentChanges}</span>
          <div style={{ border: '1px solid #e0e0e0', borderRadius: 18, overflow: 'hidden' }}>
            {t.bafa.timeline.map((entry, i) => (
              <div key={entry.date + entry.strong} style={{ display: 'flex', gap: 18, padding: '18px 24px', borderBottom: i < t.bafa.timeline.length - 1 ? '1px solid #f0f0f0' : undefined, alignItems: 'baseline' }}>
                <span style={{ flex: '0 0 92px', fontSize: 12, color: '#7a7a7a' }}>{entry.date}</span>
                <span style={{ flex: '0 0 88px', fontSize: 10.5, fontWeight: 600, letterSpacing: '.05em', border: '1px solid #e0e0e0', borderRadius: 999, padding: '3px 10px', textAlign: 'center', ...(entry.badge === 'GUIDANCE' ? { color: '#7a7a7a' } : {}) }}>{entry.badge === 'GUIDANCE' ? t.bafa.guidance : t.bafa.confirmed}</span>
                <span style={{ fontSize: 14, lineHeight: 1.5 }}><strong style={{ fontWeight: 600 }}>{entry.strong}</strong>{entry.rest}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Current programmes & regulations — LIVE list from countries/<cc>/policies,
            refreshed monthly by the news pipeline (same run as the news cycle,
            owner request 2026-07-30). The curated cards/timeline above stay
            editorial; this list is the always-current programme inventory.
            Renders nothing while empty (load failure / pre-login) — the page
            must never show an empty shell section. */}
        {app.policies.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <span style={{ fontFamily: FD, fontSize: 21, fontWeight: 600, letterSpacing: '-0.2px' }}>{t.bafa.programsTitle}</span>
            <div style={{ border: '1px solid #e0e0e0', borderRadius: 18, overflow: 'hidden' }}>
              {app.policies.map((p, i) => (
                <div key={p.id ?? p.title} style={{ display: 'flex', gap: 18, padding: '18px 24px', borderBottom: i < app.policies.length - 1 ? '1px solid #f0f0f0' : undefined, alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <span style={{ flex: '0 0 88px', fontSize: 10.5, fontWeight: 600, letterSpacing: '.05em', border: '1px solid #e0e0e0', borderRadius: 999, padding: '3px 10px', textAlign: 'center', color: '#7a7a7a', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{p.category}</span>
                  <div style={{ flex: 1, minWidth: 260, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: 14.5, fontWeight: 600 }}>{p.title}</span>
                    <span style={{ fontSize: 13, lineHeight: 1.55, color: '#4a4a4e' }}>{p.summary}</span>
                    {/^https?:\/\//.test(p.sourceUrl ?? '') && (
                      <span onClick={() => window.open(p.sourceUrl, '_blank', 'noopener')} style={{ fontSize: 12.5, color: '#0066cc', cursor: 'pointer' }}>{t.bafa.programsOpen}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <span style={{ fontSize: 11.5, color: '#7a7a7a' }}>{t.bafa.programsNote}</span>
          </div>
        )}

        {/* two audiences */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div style={{ background: '#272729', color: '#fff', borderRadius: 18, padding: '26px 28px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span style={{ ...sectionLabel, color: '#ccc' }}>{t.bafa.installerTitle}</span>
            <span style={{ fontSize: 14.5, lineHeight: 1.6, color: '#fff' }}>
              {t.bafa.installerText}
            </span>
            <span onClick={() => { app.setGuideTab('pro'); app.go('guide'); }} style={{ fontSize: 13, color: '#2997ff', cursor: 'pointer' }}>{t.bafa.installerLink}</span>
          </div>
          <div style={{ border: '1px solid #e0e0e0', borderRadius: 18, padding: '26px 28px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span style={sectionLabel}>{t.bafa.homeownerTitle}</span>
            <span style={{ fontSize: 14.5, lineHeight: 1.6 }}>
              {t.bafa.homeownerText}
            </span>
            <span onClick={() => { app.setGuideTab('home'); app.go('guide'); }} style={{ fontSize: 13, color: '#0066cc', cursor: 'pointer' }}>{t.bafa.homeownerLink}</span>
          </div>
        </div>

        {/* official sources — exactly bafa.de / kfw.de / bmwk.de, no deep links */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <span style={{ fontFamily: FD, fontSize: 21, fontWeight: 600, letterSpacing: '-0.2px' }}>{t.bafa.sourcesTitle}</span>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
            {SOURCES.map((s, i) => (
              <div key={s.href} style={{ border: '1px solid #e0e0e0', borderRadius: 18, padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{t.bafa.sources[i].title}</span>
                <span style={{ fontSize: 12, color: '#7a7a7a' }}>{t.bafa.sources[i].sub}</span>
                <span onClick={() => window.open(s.href, '_blank', 'noopener')} style={{ fontSize: 12.5, color: '#0066cc', marginTop: 4, cursor: 'pointer' }}>{s.link}</span>
              </div>
            ))}
          </div>
          <span style={{ fontSize: 11.5, color: '#7a7a7a' }}>{t.bafa.sourcesNote}</span>
        </div>
      </div>
    </div>
  );
};
