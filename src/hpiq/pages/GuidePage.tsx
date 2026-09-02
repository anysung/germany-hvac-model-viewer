/** Funding guide — educational, homeowner/installer tabs. */
import React from 'react';
import { HpApp } from '../appState';
import { tr } from '../i18n';
import { FD, Check, SubTabs, VideoExplainer, sectionLabel } from '../ui';
import { GUIDE_VIDEO_ID } from '../market';

export const GuidePage: React.FC<{ app: HpApp }> = ({ app }) => {
  const t = tr(app.lang);
  const isPro = app.guideTab === 'pro';
  const steps = isPro ? t.guide.stepsPro : t.guide.stepsHome;
  const checklist = isPro ? t.guide.checkPro : t.guide.checkHome;

  // Opens a minimal print document of the current checklist — the browser's
  // print dialog offers "Save as PDF" on every platform.
  const downloadChecklist = () => {
    const w = window.open('', '_blank', 'width=720,height=900');
    if (!w) { app.notify(t.guide.popupNote); return; }
    const title = isPro ? t.guide.pdfTitlePro : t.guide.pdfTitleHome;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
      <style>
        body{font-family:-apple-system,'Segoe UE',Roboto,sans-serif;color:#1d1d1f;max-width:640px;margin:48px auto;padding:0 24px}
        h1{font-size:22px;letter-spacing:-.02em} p.sub{color:#7a7a7a;font-size:13px;margin-top:-8px}
        li{margin:14px 0;font-size:15px;line-height:1.5;list-style:none;position:relative;padding-left:30px}
        li:before{content:'';position:absolute;left:0;top:2px;width:16px;height:16px;border:1.5px solid #1d1d1f;border-radius:4px}
        footer{margin-top:40px;font-size:11.5px;color:#7a7a7a;border-top:1px solid #e0e0e0;padding-top:12px;line-height:1.5}
      </style></head><body>
      <h1>${title}</h1>
      <p class="sub">${t.guide.pdfSub}</p>
      <ul>${checklist.map(item => `<li>${item}</li>`).join('')}</ul>
      <footer>${t.guide.pdfFooter}</footer>
      </body></html>`);
    w.document.close();
    w.focus();
    w.print();
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <div style={{ background: '#272729', color: '#fff', padding: '52px 48px 44px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <SubTabs
          group="funding"
          tabs={[{ id: 'bafa', label: t.nav.bafa }, { id: 'guide', label: t.nav.guide }]}
          active="guide"
          onSelect={id => app.go(id as 'bafa' | 'guide')}
          tone="dark"
          style={{ marginBottom: 12 }}
        />
        <span style={{ fontFamily: FD, fontSize: 34, fontWeight: 600, letterSpacing: '-0.374px' }}>{t.guide.heroTitle}</span>
        <span style={{ fontSize: 17, color: '#ccc', letterSpacing: '-0.374px', maxWidth: 640 }}>
          {t.guide.heroSub}
        </span>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          {([['home', t.guide.tabHome], ['pro', t.guide.tabPro]] as ['home' | 'pro', string][]).map(([id, label]) => {
            const on = app.guideTab === id;
            return (
              <span
                key={id}
                className="hp-press"
                onClick={() => { app.setGuideTab(id); app.setFaqOpen(0); /* the FAQ list swaps with the tab — a stale open index would expand a random answer */ }}
                style={{
                  borderRadius: 999, padding: '7px 17px', fontSize: 13, cursor: 'pointer',
                  ...(on ? { background: '#fff', color: '#1d1d1f', fontWeight: 600 } : { border: '1px solid rgba(255,255,255,.35)', color: '#fff' }),
                }}
              >
                {label}
              </span>
            );
          })}
        </div>
      </div>
      <div style={{ maxWidth: 1160, width: '100%', margin: '0 auto', padding: '32px 48px 48px', display: 'flex', flexDirection: 'column', gap: 28, boxSizing: 'border-box' }}>

        {/* journey */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <span style={{ fontFamily: FD, fontSize: 21, fontWeight: 600, letterSpacing: '-0.2px' }}>
            {isPro ? t.guide.journeyPro : t.guide.journeyHome}
          </span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 0 }}>
            {steps.map(([n, title, text]) => (
              <div key={n} style={{ display: 'flex', flexDirection: 'column', gap: 9, padding: '0 18px 0 0', position: 'relative' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ flex: 'none', width: 26, height: 26, borderRadius: '50%', background: '#0066cc', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600 }}>{n}</span>
                  <span style={{ flex: 1, height: 1, background: '#e0e0e0' }} />
                </div>
                <span style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.3 }}>{title}</span>
                <span style={{ fontSize: 12.5, color: '#7a7a7a', lineHeight: 1.5 }}>{text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* checklist + video */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 20 }}>
          <div style={{ border: '1px solid #e0e0e0', borderRadius: 18, padding: '24px 26px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: FD, fontSize: 19, fontWeight: 600, letterSpacing: '-0.2px' }}>{t.guide.checklistTitle}</span>
              <span onClick={downloadChecklist} style={{ fontSize: 12.5, color: '#0066cc', cursor: 'pointer' }}>{t.guide.downloadPdf}</span>
            </div>
            {checklist.map((text, i) => {
              const key = (isPro ? 'pro' : 'home') + i;
              const on = !!app.checked[key];
              return (
                <span key={key} onClick={() => app.toggleChecked(key)} style={{ display: 'flex', alignItems: 'flex-start', gap: 11, fontSize: 14, lineHeight: 1.5, cursor: 'pointer', padding: '2px 0' }}>
                  <span style={{ flex: 'none', width: 17, height: 17, borderRadius: 5, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginTop: 2, boxSizing: 'border-box', ...(on ? { background: '#0066cc' } : { border: '1px solid #d2d2d7' }) }}>
                    <Check size={10} visible={on} strokeWidth={3.2} />
                  </span>
                  <span style={on ? { color: '#7a7a7a', textDecoration: 'line-through' } : undefined}>{text}</span>
                </span>
              );
            })}
            <span style={{ fontSize: 11.5, color: '#7a7a7a', marginTop: 4 }}>
              {t.guide.checklistNote}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#f5f5f7', borderRadius: 18, padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <span style={sectionLabel}>{t.guide.explainer}</span>
              <VideoExplainer videoId={GUIDE_VIDEO_ID} onUnavailable={() => app.notify(t.guide.videoSoon)} />
              <span style={{ fontSize: 13.5, lineHeight: 1.5 }}>{t.guide.explainerText}</span>
            </div>
            <div style={{ border: '1px solid #e0e0e0', borderRadius: 18, padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 7 }}>
              <span style={sectionLabel}>{t.guide.goodToKnow}</span>
              <span style={{ fontSize: 13.5, lineHeight: 1.6 }}>
                {t.guide.goodToKnowText}
              </span>
              <span onClick={app.goProductsR290} style={{ fontSize: 13, color: '#0066cc', cursor: 'pointer' }}>{t.guide.showR290}</span>
            </div>
          </div>
        </div>

        {/* FAQ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <span style={{ fontFamily: FD, fontSize: 21, fontWeight: 600, letterSpacing: '-0.2px' }}>{t.guide.faqTitle}</span>
          <div style={{ border: '1px solid #e0e0e0', borderRadius: 18, overflow: 'hidden' }}>
            {/* Audience-split FAQ (owner request 2026-07-31): installers are the
                app's primary subscribers — their set is operational (their role
                in the funding process, sales-relevant mechanics); the homeowner
                set is lighter reference material. Follows the page's existing
                For homeowners | For installers tab. */}
            {(isPro ? t.guide.faqsPro : t.guide.faqsHome).map(([q, a], i) => {
              const open = app.faqOpen === i;
              return (
                <div key={q} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <span
                    onClick={() => app.setFaqOpen(open ? -1 : i)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '17px 24px', fontSize: 14.5, fontWeight: 600, cursor: 'pointer' }}
                  >
                    {q}
                    <span style={{ color: '#7a7a7a', fontSize: 17, transition: 'transform .18s', transform: `rotate(${open ? '90deg' : '0deg'})` }}>›</span>
                  </span>
                  {open && (
                    <span style={{ display: 'block', padding: '0 24px 17px', fontSize: 14, color: '#333', lineHeight: 1.6, maxWidth: 760 }}>{a}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
