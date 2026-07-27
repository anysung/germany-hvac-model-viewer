/**
 * Compact-device catalog surfaces: search-first Find, card-list Products with
 * a bottom-sheet filter, and the shared product Detail (full-screen sheet on
 * phone, persistent side panel on tablet).
 *
 * Pattern rationale (benchmarked against spec-comparison apps — idealo /
 * Geizhals — and current mobile conventions): card lists instead of dense
 * tables, filters in a bottom sheet, fact-sheet style detail, skeleton-free
 * instant local pagination.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { HpApp } from '../appState';
import { HpVM, crossRefId } from '../model';
import { ProductFilters, ProductSort, SORT_LABELS } from '../productService';
import { tr } from '../i18n';
import { localListingStatus, localListingId, LOCAL_LISTING_SOURCE } from '../listing';
import { ListingChip } from '../ListingChip';
import { SOURCE_ID_ABBR, REGISTRY_VERIFY_URL } from '../market';
import { FD, CheckBox, SearchIcon, sectionLabel } from '../ui';
import type { Viewport } from '../useViewport';

const PAGE_SIZE = 40;

/* ── Shared bits ─────────────────────────────────────────────────────────── */

const chipStyle: React.CSSProperties = {
  border: '1px solid #e0e0e0', borderRadius: 999, padding: '2px 9px', fontSize: 10.5, background: '#fff',
};

const ListedChips: React.FC<{ v: HpVM; t: ReturnType<typeof tr> }> = ({ v, t }) => (
  <span style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
    <ListingChip raw={v.raw} t={t} />
    {v.eprel && <span style={chipStyle}>{v.label}</span>}
  </span>
);

/** Card used by both Find results and the Products list. */
const ProductCard: React.FC<{ v: HpVM; t: ReturnType<typeof tr>; onOpen: () => void; selected?: boolean }> = ({ v, t, onOpen, selected }) => (
  <div
    onClick={onOpen}
    style={{
      background: '#fff', border: '1px solid #e0e0e0', borderRadius: 14, padding: '13px 15px',
      display: 'flex', flexDirection: 'column', gap: 7, cursor: 'pointer',
      ...(selected ? { boxShadow: 'inset 0 0 0 2px #0066cc' } : {}),
    }}
  >
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
      <span style={{ fontWeight: 600, fontSize: 14.5, lineHeight: 1.25, minWidth: 0, flex: 1, overflowWrap: 'anywhere' }}>{v.model}</span>
      <span style={{ fontSize: 12, color: '#7a7a7a', flex: 'none', maxWidth: '38%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.mfr}</span>
    </div>
    <div style={{ display: 'flex', gap: '6px 14px', fontSize: 12.5, color: '#333', flexWrap: 'wrap' }}>
      <span style={{ whiteSpace: 'nowrap' }}><strong style={{ fontWeight: 600 }}>{v.ratedKw}</strong> {v.ratedKw === '—' ? '' : 'kW'}</span>
      <span>COP A2 <strong style={{ fontWeight: 600 }}>{v.cop2}</strong></span>
      <span>SCOP <strong style={{ fontWeight: 600 }}>{v.scop}</strong></span>
    </div>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <ListedChips v={v} t={t} />
      <span style={{ fontSize: 10.5, color: '#b6b6bc' }}>{SOURCE_ID_ABBR} {v.sourceId}</span>
    </div>
  </div>
);

/* ── Detail (phone: full-screen sheet · tablet: side panel body) ─────────── */

export const MobileDetail: React.FC<{ app: HpApp; v: HpVM; viewport: Viewport; onClose: () => void }> = ({ app, v, viewport, onClose }) => {
  const t = tr(app.lang);
  const specs: [string, string][] = [
    [t.products.inspSpecs.cap, v.kw === '—' ? '—' : `${v.kw} kW`],
    [t.products.inspSpecs.scop, v.scop],
    [t.products.inspSpecs.cls, v.label],
    [t.products.inspSpecs.cop7, v.cop7],
    [t.products.inspSpecs.cop2, v.cop2],
    [t.products.inspSpecs.copm7, v.copm7],
    [t.products.inspSpecs.ref, v.refKg === '—' ? v.ref : `${v.ref} · ${v.refKg} kg`],
    [t.products.inspSpecs.noise, v.noise === '—' ? '—' : `${v.noise} dB(A)`],
    [t.products.inspSpecs.type, v.installType],
  ];
  const listingStatus = localListingStatus(v.raw);
  const listingId = localListingId(v.raw);

  const body = (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0, flex: 1 }}>
          <span style={{ fontFamily: FD, fontSize: 19, fontWeight: 600, letterSpacing: '-0.24px', lineHeight: 1.2 }}>{v.model}</span>
          <span style={{ fontSize: 12, color: '#7a7a7a' }}>{v.mfr} · {SOURCE_ID_ABBR} {v.sourceId}</span>
        </div>
        <span onClick={onClose} style={{ flex: 'none', width: 30, height: 30, borderRadius: '50%', background: '#f0f0f2', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: '#555', cursor: 'pointer' }}>✕</span>
      </div>

      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
        <ListedChips v={v} t={t} />
        {v.eprel && <span style={chipStyle}>{v.eprelId}</span>}
        {v.raw.nf_pac_reference && <span style={chipStyle}>NF PAC {v.raw.nf_pac_reference}</span>}
      </div>

      <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 14, padding: '15px 16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 1fr))', gap: '13px 10px' }}>
        {specs.map(([label, value]) => (
          <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <span style={{ fontSize: 10, color: '#7a7a7a' }}>{label}</span>
            <span style={{ fontSize: 14.5, fontWeight: 600, overflowWrap: 'anywhere' }}>{value}</span>
          </div>
        ))}
      </div>

      {/* Primary CTA — the mobile journey's endpoint: open the printable /
          downloadable data sheet for this product. */}
      <span
        className="hp-press"
        onClick={() => { app.openDataSheet(v.id, 'product'); onClose(); }}
        style={{ background: '#0066cc', color: '#fff', borderRadius: 12, padding: '13px 0', fontSize: 14.5, fontWeight: 600, textAlign: 'center', cursor: 'pointer' }}
      >
        {t.products.dataSheetBtn}
      </span>

      <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 14, padding: '13px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={{ ...sectionLabel, fontSize: 10 }}>{t.products.inspFunding}</span>
        <span style={{ fontSize: 12.5, lineHeight: 1.5 }} data-testid="local-listing-status">
          {listingStatus === 'listed' ? t.products.inspListed
            : listingStatus === 'not_listed' ? t.products.inspDelisted
              : t.products.inspVerifyRequired}
        </span>
        {listingId && (
          <span style={{ fontSize: 12.5 }} data-testid="local-listing-id">{t.products.localListingIdLabel}: {listingId}</span>
        )}
        <span style={{ fontSize: 11.5, color: '#7a7a7a' }}>
          {t.products.inspVerify}{' '}
          <span onClick={() => window.open(REGISTRY_VERIFY_URL, '_blank', 'noopener')} style={{ color: '#0066cc', cursor: 'pointer' }}>{t.products.openBafa}</span>
        </span>
      </div>

      {crossRefId(v.raw) != null && (
        <span style={{ fontSize: 10.5, color: '#7a7a7a', lineHeight: 1.5, padding: '0 2px' }}>
          {t.ds.perfCrossRefNote(crossRefId(v.raw) ?? '—')}
        </span>
      )}

      <span style={{ fontSize: 10.5, color: '#b6b6bc', lineHeight: 1.5, padding: '0 2px' }}>{t.m.mDetailNote}</span>
    </>
  );

  if (viewport === 'tablet') {
    return <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{body}</div>;
  }
  // Phone: full-screen sheet with its own app bar (back affordance beats a tiny ✕).
  return (
    <div className="hp-sheet-in" style={{ position: 'fixed', inset: 0, zIndex: 80, background: '#f5f5f7', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 10, padding: 'calc(8px + env(safe-area-inset-top)) 12px 8px', background: 'rgba(245,245,247,.94)', backdropFilter: 'blur(10px)', borderBottom: '1px solid rgba(0,0,0,.07)' }}>
        <span onClick={onClose} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 14.5, color: '#0066cc', cursor: 'pointer', padding: '6px 8px 6px 2px' }}>‹ {t.products.title}</span>
        <span style={{ marginLeft: 'auto', fontSize: 11.5, color: '#9a9aa0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '48%' }}>{v.mfr}</span>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px calc(24px + env(safe-area-inset-bottom))', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {body}
      </div>
    </div>
  );
};

/* ── Find (search-first home) ────────────────────────────────────────────── */

export const MobileFind: React.FC<{ app: HpApp; viewport: Viewport; onOpen: (id: string) => void }> = ({ app, viewport, onOpen }) => {
  const t = tr(app.lang);
  const store = app.store;
  const q = app.query;
  const res = useMemo(() => (store && q.trim().length >= 2 ? store.search(q, 40) : null), [store, q]);
  const cols = viewport === 'tablet' ? '1fr 1fr' : '1fr';

  return (
    <div style={{ padding: '18px 16px 24px', display: 'flex', flexDirection: 'column', gap: 13 }}>
      <span style={{ fontFamily: FD, fontSize: 'clamp(22px, 6.5vw, 26px)', fontWeight: 600, letterSpacing: '-0.3px' }}>{t.find.heroTitle}</span>
      <div style={{ position: 'sticky', top: 0, zIndex: 20, margin: '0 -16px', padding: '6px 16px 8px', background: 'rgba(245,245,247,.94)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, border: '1px solid #d2d2d7', background: '#fff', borderRadius: 999, padding: '12px 16px', boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
        <SearchIcon size={15} />
        <input
          value={q}
          onChange={e => app.setQuery(e.target.value)}
          placeholder={t.find.placeholder}
          style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 15, fontFamily: 'inherit', color: '#1d1d1f', padding: 0, outline: 'none' }}
        />
        {q && <span onClick={() => app.setQuery('')} style={{ color: '#b6b6bc', cursor: 'pointer', fontSize: 15, padding: '2px 4px' }}>✕</span>}
      </div>
      </div>

      {!res && (
        <div style={{ padding: '28px 8px', display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center', textAlign: 'center' }}>
          <span style={{ fontSize: 14.5, fontWeight: 600 }}>{t.find.emptyTitle}</span>
          <span style={{ fontSize: 12.5, color: '#7a7a7a' }}>{q.trim().length === 1 ? t.find.shortQuery : t.find.emptySub}</span>
        </div>
      )}
      {res && res.items.length === 0 && (
        <div style={{ padding: '28px 8px', display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center', textAlign: 'center' }}>
          <span style={{ fontSize: 14.5, fontWeight: 600 }}>{t.find.noMatch(q.trim())}</span>
          <span style={{ fontSize: 12.5, color: '#7a7a7a' }}>{t.find.noMatchSub}</span>
        </div>
      )}
      {res && res.items.length > 0 && (
        <>
          <span style={{ fontSize: 12, color: '#7a7a7a' }}>{t.find.matches(res.total, q.trim())}</span>
          <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 10 }}>
            {res.items.map(v => <ProductCard key={v.id} v={v} t={t} onOpen={() => onOpen(v.id)} />)}
          </div>
        </>
      )}
    </div>
  );
};

/* ── Products (card list + bottom-sheet filters) ─────────────────────────── */

export const MobileProducts: React.FC<{ app: HpApp; viewport: Viewport; onOpen: (id: string) => void }> = ({ app, viewport, onOpen }) => {
  const t = tr(app.lang);
  const store = app.store;
  const [sort, setSort] = useState<ProductSort>('cop2');
  const [sheet, setSheet] = useState<null | 'filters' | 'sort'>(null);
  const [count, setCount] = useState<{ key: string; n: number }>({ key: '', n: PAGE_SIZE });
  const sentinelRef = useRef<HTMLDivElement>(null);

  const filters: ProductFilters = useMemo(() => ({
    refrigerant: app.refFilter,
    manufacturers: app.mfrFilter,
    bafaListedOnly: app.bafaOnly,
    capMin: null, capMax: null,
    sort,
    text: '',   // the mobile shell has its own search surface
  }), [app.refFilter, app.mfrFilter, app.bafaOnly, sort]);

  // Derived, never stored — a filter or sort change lands in the same render.
  const filtered = useMemo(() => (store ? store.list(filters) : []), [store, filters]);
  const filteredTotal = filtered.length;
  // Reveal count resets during render when the dataset/filters change (an effect
  // would lag a frame and briefly show the previous result).
  const resetKey = `${store?.total ?? 0}|${JSON.stringify(filters)}`;
  const revealed = count.key === resetKey ? count.n : PAGE_SIZE;
  const list = useMemo(() => filtered.slice(0, revealed), [filtered, revealed]);

  useEffect(() => {
    const s = sentinelRef.current;
    if (!s || list.length >= filteredTotal) return;
    const io = new IntersectionObserver(es => {
      if (es.some(e => e.isIntersecting)) setCount(c => ({ key: resetKey, n: (c.key === resetKey ? c.n : PAGE_SIZE) + PAGE_SIZE }));
    }, { rootMargin: '400px' });
    io.observe(s);
    return () => io.disconnect();
  }, [list.length, filteredTotal, resetKey]);

  const appliedCount = (app.refFilter ? 1 : 0) + app.mfrFilter.length;
  const fmtInt = (n: number) => n.toLocaleString(t.locale);
  const cols = viewport === 'tablet' ? '1fr 1fr' : '1fr';
  const sel = viewport === 'tablet' && app.selectedId && store ? store.byId.get(app.selectedId) ?? null : null;

  const toolbarChip = (label: string, onClick: () => void, active?: boolean): React.ReactNode => (
    <span
      onClick={onClick}
      style={{
        border: '1px solid #d2d2d7', borderRadius: 999, padding: '7px 14px', fontSize: 12.5, cursor: 'pointer',
        whiteSpace: 'nowrap', background: active ? '#1d1d1f' : '#fff', color: active ? '#fff' : '#1d1d1f',
      }}
    >
      {label}
    </span>
  );

  return (
    <div style={{ display: 'flex', minHeight: 0, flex: 1 }}>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {/* toolbar (sticky while the card list scrolls) */}
        <div style={{ padding: '12px 16px 10px', display: 'flex', flexDirection: 'column', gap: 10, flex: 'none', background: 'rgba(245,245,247,.94)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', borderBottom: '1px solid rgba(0,0,0,.05)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span style={{ fontFamily: FD, fontSize: 21, fontWeight: 600 }}>{t.products.title}</span>
            <span style={{ fontSize: 11.5, color: '#7a7a7a' }}>{t.products.countLine(fmtInt(filteredTotal), fmtInt(store?.total ?? 0), app.segment)}</span>
          </div>
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 }}>
            <div style={{ display: 'flex', border: '1px solid #d2d2d7', borderRadius: 999, overflow: 'hidden', flex: 'none', fontSize: 12.5 }}>
              {(['residential', 'commercial'] as const).map(s => (
                <span key={s} onClick={() => app.setSegment(s)} style={{ padding: '7px 13px', cursor: 'pointer', ...(app.segment === s ? { background: '#1d1d1f', color: '#fff', fontWeight: 600 } : {}) }}>
                  {s === 'residential' ? t.products.residential : t.products.commercial}
                </span>
              ))}
            </div>
            {toolbarChip(`${t.m.filters}${appliedCount ? ` · ${appliedCount}` : ''}`, () => setSheet('filters'), appliedCount > 0)}
            {toolbarChip(`${t.products.sortPrefix} ${t.products.sortLabels[sort]}`, () => setSheet('sort'))}
          </div>
          {/* Same segmentation disclosure as desktop — one shared translation key. */}
          <span style={{ fontSize: 11, color: '#7a7a7a', lineHeight: 1.4 }} data-testid="segment-note">
            {t.products.segmentNote}
          </span>
        </div>

        {/* card list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '2px 16px 24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 10 }}>
            {list.map(v => (
              <ProductCard key={v.id} v={v} t={t} selected={viewport === 'tablet' && app.selectedId === v.id} onOpen={() => onOpen(v.id)} />
            ))}
          </div>
          {list.length < filteredTotal && <div ref={sentinelRef} style={{ height: 40 }} />}
          <div style={{ paddingTop: 14, fontSize: 11, color: '#b6b6bc', textAlign: 'center' }}>{t.products.listDisclaimer}</div>
        </div>
      </div>

      {/* tablet side detail panel */}
      {sel && (
        <div style={{ flex: '0 0 350px', borderLeft: '1px solid rgba(0,0,0,.08)', overflowY: 'auto', padding: '16px 16px 24px', background: '#f5f5f7' }}>
          <MobileDetail app={app} v={sel} viewport="tablet" onClose={() => app.setSelectedId(null)} />
        </div>
      )}

      {/* bottom sheets */}
      {sheet && (
        <div onClick={() => setSheet(null)} style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: '18px 18px 0 0', width: 'min(560px, 100%)', maxHeight: '75vh', overflowY: 'auto', padding: '18px 20px calc(20px + env(safe-area-inset-bottom))', display: 'flex', flexDirection: 'column', gap: 16 }}
          >
            {sheet === 'sort' && (
              <>
                <span style={{ fontFamily: FD, fontSize: 17, fontWeight: 600 }}>{t.products.sortPrefix.replace(':', '')}</span>
                {(Object.keys(SORT_LABELS) as ProductSort[]).map(key => (
                  <span key={key} onClick={() => { setSort(key); setSheet(null); }} style={{ fontSize: 14.5, padding: '4px 0', cursor: 'pointer', ...(key === sort ? { fontWeight: 600, color: '#0066cc' } : {}) }}>
                    {t.products.sortLabels[key]}
                  </span>
                ))}
              </>
            )}
            {sheet === 'filters' && (
              <>
                <span style={{ fontFamily: FD, fontSize: 17, fontWeight: 600 }}>{t.m.filters}</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                  <span style={sectionLabel}>{t.products.refrigerant}</span>
                  <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                    {['R290', 'R32', 'R410A'].map(r => {
                      const on = app.refFilter === r;
                      return (
                        <span key={r} onClick={() => app.setRefFilter(on ? null : r)} style={{ borderRadius: 999, padding: '7px 15px', fontSize: 13, cursor: 'pointer', ...(on ? { background: '#0066cc', color: '#fff' } : { border: '1px solid #d2d2d7' }) }}>
                          {r}
                        </span>
                      );
                    })}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                  <span style={sectionLabel}>{t.products.manufacturer}</span>
                  {(app.store?.mfrCounts ?? []).slice(0, 10).map(mf => {
                    const on = app.mfrFilter.includes(mf.name);
                    return (
                      <span key={mf.name} onClick={() => app.setMfrFilter(on ? app.mfrFilter.filter(x => x !== mf.name) : [...app.mfrFilter, mf.name])} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, cursor: 'pointer' }}>
                        <CheckBox on={on} size={16} radius={4} />
                        {mf.name} <span style={{ marginLeft: 'auto', color: '#7a7a7a', fontSize: 12 }}>{mf.count}</span>
                      </span>
                    );
                  })}
                </div>
                {app.listingFilterOffered && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                    <span style={sectionLabel}>{t.products.funding}</span>
                    <span onClick={() => app.setBafaOnly(!app.bafaOnly)} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, cursor: 'pointer' }} data-testid="listed-only-toggle">
                      <CheckBox on={app.bafaOnly} size={16} radius={4} />
                      {t.products.bafaListedOnly}
                    </span>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
                  <span onClick={() => { app.setRefFilter(null); app.setMfrFilter([]); }} style={{ flex: 1, textAlign: 'center', border: '1px solid #d2d2d7', borderRadius: 999, padding: '11px 0', fontSize: 14, cursor: 'pointer' }}>{t.products.clearAll}</span>
                  <span onClick={() => setSheet(null)} style={{ flex: 1, textAlign: 'center', background: '#0066cc', color: '#fff', borderRadius: 999, padding: '11px 0', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>{t.m.apply}</span>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
