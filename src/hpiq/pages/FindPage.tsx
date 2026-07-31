/** Find product — fast model lookup (search-first page). */
import React, { useRef } from 'react';
import { HpApp } from '../appState';
import { tr } from '../i18n';
import { LOCAL_LISTING_SOURCE } from '../listing';
import { ListingChip } from '../ListingChip';
import { FD, C, SearchIcon, Check } from '../ui';

export const FindPage: React.FC<{ app: HpApp }> = ({ app }) => {
  const t = tr(app.lang);
  const { store } = app;
  const inputRef = useRef<HTMLInputElement>(null);
  const q = app.query.trim().toLowerCase();
  const { items: matches, total } = store ? store.search(app.query) : { items: [], total: 0 };
  const empty = q.length < 2;
  const noMatch = q.length >= 2 && total === 0;
  const totalText = app.totalListed ? app.totalListed.toLocaleString(t.locale) : '—';

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      {/* hero */}
      <div style={{ background: '#f5f5f7', padding: '64px 48px 44px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 9 }}>
          <span style={{ fontFamily: FD, fontSize: 40, fontWeight: 600, letterSpacing: '-0.374px', lineHeight: 1.1 }}>{t.find.heroTitle}</span>
          <span style={{ fontSize: 17, color: '#7a7a7a', letterSpacing: '-0.374px' }}>{t.find.heroSub(totalText)}</span>
        </div>
        <div data-tour="search" style={{ width: 660, maxWidth: '90%', display: 'flex', alignItems: 'center', gap: 11, background: '#fff', border: '1px solid #e0e0e0', borderRadius: 999, padding: '6px 8px 6px 22px' }}>
          <SearchIcon size={16} style={{ flex: 'none' }} />
          <input
            ref={inputRef}
            value={app.query}
            onChange={e => app.setQuery(e.target.value)}
            placeholder={t.find.placeholder}
            style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 16, fontFamily: 'inherit', color: '#1d1d1f', padding: '9px 0' }}
          />
          <span
            className="hp-press"
            onClick={() => {
              // Search is live-as-you-type; the button focuses the field and nudges short queries.
              inputRef.current?.focus();
              if (q.length < 2) app.notify(t.find.shortQuery);
            }}
            style={{ background: '#0066cc', color: '#fff', borderRadius: 999, padding: '9px 20px', fontSize: 14, cursor: 'pointer' }}
          >
            {t.find.searchBtn}
          </span>
        </div>
        <span style={{ fontSize: 12.5, color: '#7a7a7a' }}>{t.find.hint}</span>
      </div>

      {/* empty state */}
      {empty && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '72px 48px', color: '#7a7a7a' }}>
          <SearchIcon size={30} stroke="#d2d2d7" strokeWidth={1.3} />
          <span style={{ fontSize: 15, color: '#1d1d1f' }}>{t.find.emptyTitle}</span>
          <span style={{ fontSize: 13 }}>{t.find.emptySub}</span>
        </div>
      )}

      {/* no match */}
      {noMatch && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '64px 48px', color: '#7a7a7a' }}>
          <span style={{ fontSize: 15, color: '#1d1d1f' }}>{t.find.noMatch(app.query)}</span>
          <span style={{ fontSize: 13 }}>{t.find.noMatchSub}</span>
        </div>
      )}

      {/* results */}
      {total > 0 && (
        <>
          <div style={{ padding: '24px 48px 8px', fontSize: 13, color: '#7a7a7a' }}>
            {t.find.matches(total, app.query)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 20, padding: '0 48px 40px' }}>
            {matches.map(p => {
              const inCmp = app.compare.includes(p.id);
              return (
                <div key={p.id} style={{ border: '1px solid #e0e0e0', borderRadius: 18, padding: 24, display: 'flex', flexDirection: 'column', gap: 13, background: '#fff' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <span style={{ fontSize: 12.5, color: '#7a7a7a' }}>{p.mfr}</span>
                      <span style={{ fontFamily: FD, fontSize: 19, fontWeight: 600, letterSpacing: '-0.2px', lineHeight: 1.22 }}>{p.model}</span>
                      <span style={{ fontSize: 12, color: '#7a7a7a' }}>{t.find.outdoorUnit} {p.odu}</span>
                    </div>
                    <span
                      onClick={() => app.toggleCompare(p.id)}
                      title="Add to compare"
                      style={{
                        flex: 'none', width: 18, height: 18, borderRadius: 5, display: 'inline-flex', alignItems: 'center',
                        justifyContent: 'center', cursor: 'pointer', marginTop: 2, boxSizing: 'border-box',
                        ...(inCmp ? { background: '#0066cc' } : { background: '#fff', border: `1px solid ${C.chip}` }),
                      }}
                    >
                      <Check size={11} visible={inCmp} strokeWidth={3.2} />
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <ListingChip raw={p.raw} t={t} style={{ padding: '3px 11px', fontSize: 11.5 }} />
                    {p.eprel
                      ? <span style={{ border: '1px solid #e0e0e0', borderRadius: 999, padding: '3px 11px', fontSize: 11.5 }}>{t.find.euLabel(p.label)}</span>
                      : <span style={{ border: '1px solid #e0e0e0', borderRadius: 999, padding: '3px 11px', fontSize: 11.5, color: '#7a7a7a' }}>{t.find.eprelNotMatched}</span>}
                    <span style={{ border: '1px solid #e0e0e0', borderRadius: 999, padding: '3px 11px', fontSize: 11.5 }}>{p.ref}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '11px 16px', borderTop: '1px solid #f0f0f0', paddingTop: 13 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontSize: 11, color: '#7a7a7a' }}>{t.find.capacity55}</span>
                      <span style={{ fontSize: 16, fontWeight: 600 }}>{p.ratedKw === '—' ? '—' : `${p.ratedKw} kW`}</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontSize: 11, color: '#7a7a7a' }}>{t.find.energyClass}</span>
                      <span style={{ fontSize: 16, fontWeight: 600 }}>{p.label}</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontSize: 11, color: '#7a7a7a' }}>{t.find.scop}</span>
                      <span style={{ fontSize: 16, fontWeight: 600 }}>{p.scop}</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontSize: 11, color: '#7a7a7a' }}>{t.find.soundPower}</span>
                      <span style={{ fontSize: 16, fontWeight: 600 }}>{p.noise === '—' ? '—' : `${p.noise} dB(A)`}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 2 }}>
                    <span className="hp-press" data-tour="result-open" onClick={() => app.openProduct(p.id)} style={{ background: '#0066cc', color: '#fff', borderRadius: 999, padding: '8px 18px', fontSize: 13.5, cursor: 'pointer' }}>{t.find.viewDetails}</span>
                    <span onClick={() => app.openDataSheet(p.id, 'product')} style={{ color: '#0066cc', fontSize: 13.5, cursor: 'pointer' }}>{t.find.dataSheet}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};
