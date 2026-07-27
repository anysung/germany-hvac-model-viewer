/** Products — main catalog: filter rail + dense table + inspector + compare tray. */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { HpApp } from '../appState';
import { HpVM } from '../model';
import { ProductFilters, ProductSort, SORT_LABELS } from '../productService';
import { tr } from '../i18n';
import { localListingStatus, localListingId, LOCAL_LISTING_SOURCE } from '../listing';
import { ListingChip } from '../ListingChip';
import { SOURCE_ID_ABBR, REGISTRY_VERIFY_URL } from '../market';
import { FD, CheckBox, ChevronDown, KwRangeSlider, Watermark, frosted, pillPrimary, pillSecondary, sectionLabel } from '../ui';

// Every row is its OWN grid (rows stream in), so tracks must resolve
// identically regardless of row content: bare `fr` means minmax(auto, fr) and
// lets a wide status pill ("ZUM verification required") widen ITS row's last
// column, misaligning the numeric columns row-by-row. minmax(0, fr) pins the
// division to the container width alone; the status floor keeps pills legible
// on narrow screens (same floor in every row → still aligned).
const GRID = '34px minmax(0, 2.2fr) minmax(0, 1fr) minmax(0, 0.9fr) minmax(0, 0.8fr) minmax(0, 0.7fr) minmax(0, 0.7fr) minmax(150px, 1.2fr)';
const PAGE_SIZE = 100;

const SkeletonRow: React.FC<{ widths: string[]; dim?: boolean }> = ({ widths, dim }) => (
  <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: '0 12px', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid #f0f0f0', opacity: dim ? 0.5 : 1 }}>
    <span />
    {widths.map((w, i) => <span key={i} style={{ height: 10, borderRadius: 6, background: '#f0f0f0', width: w }} />)}
  </div>
);

const SK1 = ['78%', '70%', '50%', '55%', '50%', '55%', '65%'];
const SK2 = ['66%', '75%', '45%', '60%', '55%', '50%', '70%'];

export const ProductsPage: React.FC<{ app: HpApp }> = ({ app }) => {
  const t = tr(app.lang);
  const { store } = app;
  // Manufacturer facet: the sidebar shows top-5 (or the current selection);
  // "Show All" opens an inline searchable A–Z panel over the FULL list —
  // the old view capped the list at a hard-coded 25 of 200+ manufacturers.
  const [mfrPanelOpen, setMfrPanelOpen] = useState(false);
  const [mfrSearch, setMfrSearch] = useState('');
  const [sort, setSort] = useState<ProductSort>('cop2');
  const [sortOpen, setSortOpen] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const pendingScrollRef = useRef<string | null>(null);

  // Compare tray responsiveness: below this measured width the chips collapse
  // into a count badge + popover (minimal mode) — the tray NEVER wraps messily.
  const trayRef = useRef<HTMLDivElement>(null);
  const [trayW, setTrayW] = useState(Infinity);
  const [trayPop, setTrayPop] = useState(false);
  useEffect(() => {
    const el = trayRef.current;
    if (!el) return;
    const ro = new ResizeObserver(es => setTrayW(es[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Capacity range — [lo, hi] in whole kW over the store's bounds; null = untouched (full range).
  const bounds = store?.kwBounds ?? null;
  const [capRange, setCapRange] = useState<[number, number] | null>(null);
  useEffect(() => { setCapRange(null); }, [store]);   // dataset switch resets the slider
  const capLo = capRange?.[0] ?? bounds?.min ?? 0;
  const capHi = capRange?.[1] ?? bounds?.max ?? 0;
  const capNarrowed = !!bounds && !!capRange && (capRange[0] > bounds.min || capRange[1] < bounds.max);

  const filters: ProductFilters = useMemo(() => ({
    refrigerant: app.refFilter,
    manufacturers: app.mfrFilter,
    bafaListedOnly: app.bafaOnly,
    capMin: capNarrowed ? capLo : null,
    capMax: capNarrowed ? capHi : null,
    sort,
    // Shared with the Find page (same app.query), AND-combined with the facets.
    text: app.query,
  }), [app.refFilter, app.mfrFilter, app.bafaOnly, capNarrowed, capLo, capHi, sort, app.query]);


  /**
   * The visible list is DERIVED, never stored.
   *
   * It used to live in React state, refilled by a useEffect that ran AFTER the
   * render: changing a filter or the sort order painted one frame with the old
   * result before the effect caught up. Deriving it means a filter change and
   * its result land in the same render — no lag, no second interaction, and no
   * stale "0 results" flash.
   */
  const filtered = useMemo(() => (store ? store.list(filters) : []), [store, filters]);
  const filteredTotal = filtered.length;

  // How many rows are revealed (infinite scroll). Reset during render whenever
  // the dataset or the filters change — an effect would lag by a frame again.
  const resetKey = `${store?.total ?? 0}|${JSON.stringify(filters)}`;
  const [reveal, setReveal] = useState({ key: resetKey, count: PAGE_SIZE });
  const revealed = reveal.key === resetKey ? reveal.count : PAGE_SIZE;

  // A preselected row (Find → "View details") must be inside the slice so it can
  // be scrolled to — reveal whole pages up to it.
  const items = useMemo(() => {
    let n = revealed;
    if (app.selectedId) {
      const idx = filtered.findIndex(v => v.id === app.selectedId);
      if (idx >= 0) n = Math.max(n, Math.ceil((idx + 1) / PAGE_SIZE) * PAGE_SIZE);
    }
    return filtered.slice(0, n);
  }, [filtered, revealed, app.selectedId]);
  const nextCursor = items.length < filtered.length ? items[items.length - 1]?.id ?? null : null;

  useEffect(() => {
    pendingScrollRef.current = app.selectedId ?? '__top__';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, filters]);

  // After the reset render, bring the preselected row (or the top) into view.
  useEffect(() => {
    const pending = pendingScrollRef.current;
    if (!pending) return;
    pendingScrollRef.current = null;
    if (pending === '__top__') { scrollerRef.current?.scrollTo({ top: 0 }); return; }
    const target = scrollerRef.current?.querySelector(`[data-row-id="${CSS.escape(pending)}"]`);
    if (target) target.scrollIntoView({ block: 'center' });
  }, [items]);

  // Stream further rows as the sentinel scrolls into view.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !store || !nextCursor) return;
    const io = new IntersectionObserver(entries => {
      if (!entries.some(e => e.isIntersecting)) return;
      setReveal(r => ({ key: resetKey, count: (r.key === resetKey ? r.count : PAGE_SIZE) + PAGE_SIZE }));
    }, { root: scrollerRef.current, rootMargin: '600px' });
    io.observe(sentinel);
    return () => io.disconnect();
  }, [store, resetKey, nextCursor]);

  const sel = app.selectedId && store ? store.byId.get(app.selectedId) ?? null : null;
  const compareItems = app.compare.map(id => store?.byId.get(id)).filter(Boolean) as HpVM[];
  const compareCount = compareItems.length;
  const canCompare = compareCount >= 2;
  // Tray display rules: chip text is the first two words (CSS ellipsis caps the
  // rest; hover shows the full name), 1–2 selections stay on one line, 3+ drop
  // to a smaller two-column chip grid, and under 560px of tray width the chips
  // collapse to a count badge + popover. The compare button NEVER reflows.
  const trayMini = trayW < 560;
  const chipName = (model: string) => model.split(' ').slice(0, 2).join(' ');
  const showModal = app.showCompare && canCompare;

  // Comparison opens as a modal — close on Escape.
  useEffect(() => {
    if (!showModal) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') app.setShowCompare(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showModal]);

  const appliedChips: { label: string; onRemove: () => void }[] = [];
  if (app.query.trim().length >= 2) appliedChips.push({ label: `“${app.query.trim()}”`, onRemove: () => app.setQuery('') });
  if (app.refFilter) appliedChips.push({ label: app.refFilter, onRemove: () => app.setRefFilter(null) });
  app.mfrFilter.forEach(m => appliedChips.push({ label: m, onRemove: () => app.setMfrFilter(app.mfrFilter.filter(x => x !== m)) }));
  if (capNarrowed) appliedChips.push({ label: `${capLo}–${capHi} kW`, onRemove: () => setCapRange(null) });

  // Sidebar shows the SELECTION when one exists (readability after choosing),
  // otherwise the top-5 by product count. The full A–Z list lives in the panel.
  const mfrCounts = store?.mfrCounts ?? [];
  const mfrCountByName = useMemo(() => new Map(mfrCounts.map(m => [m.name, m.count])), [mfrCounts]);
  const mfrList = app.mfrFilter.length
    ? app.mfrFilter.map(name => ({ name, count: mfrCountByName.get(name) ?? 0 }))
    : mfrCounts.slice(0, 5);
  const mfrAlpha = useMemo(() => {
    const q = mfrSearch.trim().toLowerCase();
    return [...mfrCounts]
      .sort((a, b) => a.name.localeCompare(b.name))
      .filter(m => !q || m.name.toLowerCase().includes(q));
  }, [mfrCounts, mfrSearch]);

  const fmtInt = (n: number) => n.toLocaleString(t.locale);

  return (
    <div style={{ flex: 'none', display: 'flex', flexDirection: 'column', minHeight: 0, height: 'calc(100vh - 60px)' }}>

      {/* toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 28px', borderBottom: '1px solid rgba(0,0,0,.08)', background: 'rgba(255,255,255,.9)', ...frosted, flex: 'none' }}>
        <span style={{ fontFamily: FD, fontSize: 19, fontWeight: 600, letterSpacing: '-0.2px' }}>{t.products.title}</span>
        <div style={{ display: 'flex', border: '1px solid #e0e0e0', borderRadius: 999, overflow: 'hidden', fontSize: 12.5 }}>
          {(['residential', 'commercial'] as const).map(s => {
            const on = app.segment === s;
            return (
              <span
                key={s}
                onClick={() => app.setSegment(s)}
                style={{
                  padding: '6px 16px', cursor: on ? 'default' : 'pointer',
                  ...(on ? { background: '#1d1d1f', color: '#fff', fontWeight: 600 } : { color: '#1d1d1f' }),
                }}
              >
                {s === 'residential' ? t.products.residential : t.products.commercial}
              </span>
            );
          })}
        </div>
        {/* The site's own segmentation rule — small, secondary, always visible. */}
        <span style={{ fontSize: 11.5, color: '#7a7a7a', lineHeight: 1.4 }} data-testid="segment-note">
          {t.products.segmentNote}
        </span>
        {app.unclassifiedCount > 0 && (
          <span style={{ fontSize: 11.5, color: '#9a6b00', lineHeight: 1.4 }} data-testid="unclassified-note">
            {t.products.unclassifiedNote(app.unclassifiedCount.toLocaleString(t.locale))}
          </span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 13, color: '#7a7a7a', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
          <span>{t.products.countLine(fmtInt(filteredTotal), fmtInt(store?.total ?? 0), app.segment)}</span>
          {/* IT: the catalogue mixes two sources — say so instead of one undifferentiated count. */}
          {LOCAL_LISTING_SOURCE === 'GSE' && store && store.all.some(v => v.raw.gse_match_method === 'gse_native') && (
            <span style={{ fontSize: 11 }} data-testid="source-mix-note">
              {t.products.countGse(
                fmtInt(store.all.filter(v => v.raw.gse_match_method === 'gse_native').length),
                fmtInt(store.all.filter(v => v.raw.gse_match_method !== 'gse_native').length),
              )}
            </span>
          )}
        </span>
        <div style={{ position: 'relative' }}>
          <span onClick={() => setSortOpen(o => !o)} data-testid="sort-trigger" style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            {t.products.sortPrefix} {t.products.sortLabels[sort]} <ChevronDown />
          </span>
          {sortOpen && (
            <>
              <div onClick={() => setSortOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 60 }} />
              <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 8px)', zIndex: 61, background: '#fff', border: '1px solid #e0e0e0', borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,.12)', padding: '6px 0', minWidth: 210 }}>
                {(Object.keys(SORT_LABELS) as ProductSort[]).map(key => (
                  <span
                    key={key}
                    onClick={() => { setSort(key); setSortOpen(false); }}
                    className="hp-row"
                    data-testid="sort-option"
                    style={{ display: 'block', padding: '8px 16px', fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap', ...(key === sort ? { fontWeight: 600, color: '#0066cc' } : {}) }}
                  >
                    {t.products.sortLabels[key]}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div style={{ flex: 1, overflowX: 'auto', minHeight: 0 }}>
        <div style={{ display: 'flex', alignItems: 'stretch', minWidth: 1240, height: '100%', boxSizing: 'border-box' }}>

          {/* filter rail */}
          <div style={{ flex: '0 0 248px', boxSizing: 'content-box', borderRight: '1px solid rgba(0,0,0,.08)', padding: '20px 20px 24px', display: 'flex', flexDirection: 'column', gap: 22, background: '#fff', overflowY: 'auto' }}>
            {/* Model search — same engine as the Find page (shared app.query),
                AND-combined with the facets; results render in the main list. */}
            <div style={{ position: 'relative' }}>
              <input
                value={app.query}
                onChange={e => app.setQuery(e.target.value)}
                placeholder={t.find.placeholder}
                data-testid="products-search"
                style={{
                  width: '100%', boxSizing: 'border-box', border: '1px solid #d2d2d7', borderRadius: 10,
                  padding: '9px 30px 9px 12px', fontSize: 13, outline: 'none', background: '#fff',
                }}
              />
              {app.query && (
                <span
                  onClick={() => app.setQuery('')}
                  style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: '#7a7a7a', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}
                  data-testid="products-search-clear"
                >
                  ×
                </span>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <span style={sectionLabel}>{t.products.applied}</span>
                <span onClick={() => { app.setQuery(''); app.setRefFilter(null); app.setMfrFilter([]); setCapRange(null); }} style={{ fontSize: 12, color: '#0066cc', cursor: 'pointer' }}>{t.products.clearAll}</span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {appliedChips.map(chip => (
                  <span key={chip.label} onClick={chip.onRemove} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#1d1d1f', color: '#fff', borderRadius: 999, padding: '5px 12px', fontSize: 12, cursor: 'pointer' }}>
                    {chip.label} <span style={{ opacity: 0.6 }}>×</span>
                  </span>
                ))}
                {appliedChips.length === 0 && <span style={{ fontSize: 12, color: '#7a7a7a' }}>{t.products.noFilters}</span>}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <span style={sectionLabel}>{t.products.refrigerant}</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {['R290', 'R32', 'R410A'].map(r => {
                  const on = app.refFilter === r;
                  return (
                    <span
                      key={r}
                      className="hp-press"
                      data-testid="ref-option"
                      onClick={() => app.setRefFilter(on ? null : r)}
                      style={{
                        borderRadius: 999, padding: '5px 13px', fontSize: 12.5, cursor: 'pointer',
                        ...(on ? { background: '#0066cc', color: '#fff' } : { border: '1px solid #e0e0e0', color: '#1d1d1f' }),
                      }}
                    >
                      {r}
                    </span>
                  );
                })}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <span style={sectionLabel}>{t.products.manufacturer}</span>
              {mfrPanelOpen ? (
                /* Full catalogue: searchable, A–Z, multi-select — every
                   manufacturer, not a top-N cut. */
                <div style={{ border: '1px solid #e0e0e0', borderRadius: 12, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }} data-testid="mfr-panel">
                  <input
                    value={mfrSearch}
                    onChange={e => setMfrSearch(e.target.value)}
                    placeholder={t.products.mfrSearchPh}
                    autoFocus
                    style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #d2d2d7', borderRadius: 8, padding: '7px 10px', fontSize: 12.5, outline: 'none' }}
                    data-testid="mfr-panel-search"
                  />
                  <div style={{ maxHeight: 250, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 7, fontSize: 13 }}>
                    {mfrAlpha.map(m => {
                      const on = app.mfrFilter.includes(m.name);
                      return (
                        <span
                          key={m.name}
                          data-testid="mfr-option"
                          onClick={() => app.setMfrFilter(on ? app.mfrFilter.filter(x => x !== m.name) : [...app.mfrFilter, m.name])}
                          style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer' }}
                        >
                          <CheckBox on={on} size={15} radius={4} />
                          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</span>
                          <span style={{ marginLeft: 'auto', color: '#7a7a7a', fontSize: 12 }}>{m.count}</span>
                        </span>
                      );
                    })}
                  </div>
                  <span
                    className="hp-press"
                    onClick={() => { setMfrPanelOpen(false); setMfrSearch(''); }}
                    style={{ alignSelf: 'flex-end', background: '#0066cc', color: '#fff', borderRadius: 999, padding: '6px 16px', fontSize: 12.5, cursor: 'pointer' }}
                    data-testid="mfr-panel-done"
                  >
                    {t.products.mfrDone}{app.mfrFilter.length ? ` · ${t.products.selectedCount(app.mfrFilter.length)}` : ''}
                  </span>
                </div>
              ) : (
                /* Collapsed: the current selection only (readability), or the
                   top-5 by product count when nothing is selected yet. */
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7, fontSize: 13.5 }}>
                  {mfrList.map(m => {
                    const on = app.mfrFilter.includes(m.name);
                    return (
                      <span
                        key={m.name}
                        data-testid="mfr-option"
                        onClick={() => app.setMfrFilter(on ? app.mfrFilter.filter(x => x !== m.name) : [...app.mfrFilter, m.name])}
                        style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer' }}
                      >
                        <CheckBox on={on} size={15} radius={4} />
                        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</span>
                        <span style={{ marginLeft: 'auto', color: '#7a7a7a', fontSize: 12 }}>{m.count}</span>
                      </span>
                    );
                  })}
                  <span onClick={() => setMfrPanelOpen(true)} style={{ color: '#0066cc', fontSize: 12.5, cursor: 'pointer' }} data-testid="mfr-show-all">{t.products.showAll}</span>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <span style={sectionLabel}>{t.products.capacity}</span>
              {bounds ? (
                <KwRangeSlider bounds={bounds} lo={capLo} hi={capHi} onChange={setCapRange} />
              ) : (
                <span style={{ fontSize: 12, color: '#7a7a7a' }}>{t.products.noCapacityData}</span>
              )}
            </div>

            {app.listingFilterOffered && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <span style={sectionLabel}>{t.products.funding}</span>
                <span
                  onClick={() => app.setBafaOnly(!app.bafaOnly)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13.5, cursor: 'pointer', userSelect: 'none' }}
                  data-testid="listed-only-toggle"
                >
                  <span style={{ width: 34, height: 20, borderRadius: 999, background: app.bafaOnly ? '#0066cc' : '#d2d2d7', position: 'relative', display: 'inline-block', transition: 'background .18s ease' }}>
                    <span style={{ position: 'absolute', top: 2, left: app.bafaOnly ? 16 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left .18s ease' }} />
                  </span>
                  {t.products.bafaListedOnly}
                </span>
                <span style={{ fontSize: 11.5, color: '#7a7a7a', lineHeight: 1.45 }}>{t.products.begNote}</span>
                <span style={{ fontSize: 11, color: '#7a7a7a', lineHeight: 1.5, borderTop: '1px solid #f0f0f0', paddingTop: 8 }}>
                  {t.products.listDisclaimer}
                </span>
                <span style={{ fontSize: 13.5 }}>
                  {t.products.bafaUpdated} <span style={{ fontWeight: 600 }}>{app.bafaSnapshotDate}</span>
                </span>
              </div>
            )}
          </div>

          {/* table */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, borderRight: '1px solid rgba(0,0,0,.08)' }}>

            {/* compare tray — docked ABOVE the list (2026-07-27 redesign).
                zIndex lifts the tray's stacking context (frosted = backdrop-filter
                creates one) above the later-painted table rows — without it the
                mini-mode popover and the chip tooltips render BEHIND the list. */}
            <div ref={trayRef} style={{ position: 'relative', zIndex: 40, display: 'flex', alignItems: 'center', gap: 12, padding: '11px 20px', borderBottom: '1px solid rgba(0,0,0,.08)', background: 'rgba(245,245,247,.92)', ...frosted, flex: 'none' }}>
              <span style={{ ...sectionLabel, flex: 'none' } as React.CSSProperties}>{t.products.compare}</span>

              {trayMini ? (
                compareCount > 0 && (
                  <span
                    className="hp-press"
                    onClick={() => setTrayPop(v => !v)}
                    style={{ border: '1px solid #d2d2d7', background: '#fff', borderRadius: 999, padding: '6px 14px', fontSize: 12.5, cursor: 'pointer', whiteSpace: 'nowrap', flex: 'none' }}
                    data-testid="tray-mini-badge"
                  >
                    {t.products.selectedCount(compareCount)} ▾
                  </span>
                )
              ) : (
                <div
                  style={compareCount >= 3
                    ? { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 220px))', gap: 6, minWidth: 0 }
                    : { display: 'flex', gap: 8, minWidth: 0 }}
                >
                  {compareItems.map(c => (
                    <span
                      key={c.id}
                      className="hp-cmp-chip"
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 7, background: '#fff',
                        border: '1px solid #e0e0e0', borderRadius: 999, minWidth: 0, whiteSpace: 'nowrap',
                        padding: compareCount >= 3 ? '4px 11px' : '6px 14px',
                        fontSize: compareCount >= 3 ? 11.5 : 12.5,
                      }}
                    >
                      <span style={{ minWidth: 0, maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis' }}>{chipName(c.model)}</span>
                      <span onClick={() => app.toggleCompare(c.id)} style={{ color: '#7a7a7a', cursor: 'pointer', flex: 'none' }}>×</span>
                      {/* full name on hover — never truncated */}
                      <span className="hp-cmp-tip">{c.mfr} · {c.model}</span>
                    </span>
                  ))}
                </div>
              )}

              <span style={{ fontSize: 12, color: '#7a7a7a', whiteSpace: 'nowrap', flex: 'none' }}>
                {compareCount >= 4 ? t.products.trayFull : t.products.moreSlots(4 - compareCount)}
              </span>
              <span
                className="hp-press"
                onClick={() => {
                  if (canCompare) app.setShowCompare(true);
                  else app.notify(t.products.compareGuide(compareCount));
                }}
                style={{
                  marginLeft: 'auto', flex: 'none', whiteSpace: 'nowrap',
                  borderRadius: 999, padding: '9px 22px', fontSize: 13.5, cursor: 'pointer',
                  ...(canCompare ? { background: '#0066cc', color: '#fff' } : { background: '#d2d2d7', color: '#fff' }),
                }}
              >
                {t.products.compareBtn(compareCount)}
              </span>

              {/* minimal-mode popover: the selection list, with per-item remove */}
              {trayMini && trayPop && compareCount > 0 && (
                <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 20, zIndex: 70, background: '#fff', border: '1px solid #e0e0e0', borderRadius: 12, boxShadow: '0 12px 32px rgba(0,0,0,.16)', padding: 12, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 240, maxWidth: 320 }} data-testid="tray-popover">
                  {compareItems.map(c => (
                    <span key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5 }}>
                      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={`${c.mfr} · ${c.model}`}>{c.model}</span>
                      <span onClick={() => app.toggleCompare(c.id)} style={{ marginLeft: 'auto', color: '#0066cc', cursor: 'pointer', flex: 'none' }}>×</span>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: '0 12px', alignItems: 'center', padding: '10px 20px', borderBottom: '1px solid rgba(0,0,0,.08)', fontSize: 10.5, fontWeight: 600, letterSpacing: '.05em', color: '#7a7a7a', flex: 'none' }}>
              <span /><span>{t.products.th.model}</span><span>{t.products.manufacturer}</span>
              <span style={sort === 'kwAsc' || sort === 'kwDesc' ? { color: '#1d1d1f' } : undefined}>{t.products.th.kw}{sort === 'kwDesc' ? ' ↓' : sort === 'kwAsc' ? ' ↑' : ''}</span>
              <span style={sort === 'cop2' ? { color: '#1d1d1f' } : undefined}>{t.products.th.cop2}{sort === 'cop2' ? ' ↓' : ''}</span>
              <span style={sort === 'scop' ? { color: '#1d1d1f' } : undefined}>{t.products.th.scop}{sort === 'scop' ? ' ↓' : ''}</span>
              <span style={sort === 'noise' ? { color: '#1d1d1f' } : undefined}>{t.products.th.noise}{sort === 'noise' ? ' ↑' : ''}</span>
              <span>{t.products.th.status}</span>
            </div>

            <div ref={scrollerRef} style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
              {items.map(r => {
                const inCmp = app.compare.includes(r.id);
                const isSel = app.selectedId === r.id;
                return (
                  <div
                    key={r.id}
                    data-row-id={r.id}
                    className="hp-row"
                    onClick={() => app.setSelectedId(r.id)}
                    style={{
                      display: 'grid', gridTemplateColumns: GRID, gap: '0 12px', alignItems: 'center',
                      padding: '12px 20px', borderBottom: '1px solid #f0f0f0', fontSize: 13, cursor: 'pointer',
                      ...(isSel ? { background: '#f5f5f7', boxShadow: 'inset 2px 0 0 #0066cc' } : { background: '#fff' }),
                    }}
                  >
                    <span data-testid="compare-toggle" style={{ display: 'inline-flex' }}>
                      <CheckBox on={inCmp} size={16} radius={4} onClick={e => { e.stopPropagation(); app.toggleCompare(r.id); }} />
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ fontWeight: 600, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.model}</span>
                      <span style={{ fontSize: 11, color: '#7a7a7a' }}>{SOURCE_ID_ABBR} {r.sourceId}</span>
                    </span>
                    <span style={{ minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.mfr}</span>
                    <span data-testid="row-kw">{r.ratedKw}</span>
                    <span style={{ fontWeight: 600 }}>{r.cop2}</span>
                    <span>{r.scop}</span>
                    <span>{r.noise === '—' ? '—' : `${r.noise} dB`}</span>
                    <span style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                      {/* No national list in this market → say nothing about listing. */}
                      <ListingChip raw={r.raw} t={t} />
                      {r.eprel && <span style={{ border: '1px solid #e0e0e0', borderRadius: 999, padding: '2px 9px', fontSize: 10.5, background: '#fff' }}>{r.label}</span>}
                      <span style={{ border: '1px solid #e0e0e0', borderRadius: 999, padding: '2px 9px', fontSize: 10.5, background: '#fff' }}>{t.products.chipSheet}</span>
                    </span>
                  </div>
                );
              })}

              {/* skeleton rows — perceived-speed pattern while more rows stream in */}
              {(!store || nextCursor) && (
                <div ref={sentinelRef}>
                  <SkeletonRow widths={SK1} />
                  <SkeletonRow widths={SK2} dim />
                </div>
              )}
              <div style={{ padding: '11px 20px', fontSize: 12, color: '#7a7a7a' }}>
                {t.products.streamNote}
              </div>

            </div>

          </div>

          {/* inspector */}
          {sel && (
            <div style={{ flex: '0 0 400px', display: 'flex', flexDirection: 'column', background: '#f5f5f7', minWidth: 0, overflow: 'auto' }}>
              <div style={{ padding: '20px 24px 0', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, color: '#7a7a7a' }}>{sel.mfr} · {SOURCE_ID_ABBR} {sel.sourceId}</span>
                  <span onClick={() => app.setSelectedId(null)} style={{ fontSize: 13, color: '#7a7a7a', cursor: 'pointer' }}>×</span>
                </div>
                <span style={{ fontFamily: FD, fontSize: 21, fontWeight: 600, letterSpacing: '-0.28px', lineHeight: 1.18 }}>{sel.model}</span>
              </div>
              <div style={{ padding: '18px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 18, padding: '18px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px 12px' }}>
                  {([
                    [t.products.inspSpecs.cap, sel.kw === '—' ? '—' : `${sel.kw} kW`],
                    [t.products.inspSpecs.scop, sel.scop],
                    [t.products.inspSpecs.cls, sel.label],
                    [t.products.inspSpecs.cop7, sel.cop7],
                    [t.products.inspSpecs.cop2, sel.cop2],
                    [t.products.inspSpecs.copm7, sel.copm7],
                    [t.products.inspSpecs.ref, sel.refKg === '—' ? sel.ref : `${sel.ref} · ${sel.refKg} kg`],
                    [t.products.inspSpecs.noise, sel.noise === '—' ? '—' : `${sel.noise} dB(A)`],
                    [t.products.inspSpecs.type, sel.installType],
                  ] as [string, string][]).map(([label, value]) => (
                    <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontSize: 10.5, color: '#7a7a7a' }}>{label}</span>
                      <span style={{ fontSize: 16, fontWeight: 600 }}>{value}</span>
                    </div>
                  ))}
                </div>
                <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 18, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 9 }}>
                  <span style={{ ...sectionLabel, fontSize: 10.5 }}>{t.products.inspFunding}</span>
                  {LOCAL_LISTING_SOURCE && (() => {
                    const status = localListingStatus(sel.raw);
                    const id = localListingId(sel.raw);
                    return (
                      <>
                        <span style={{ fontSize: 13.5, lineHeight: 1.5 }} data-testid="local-listing-status">
                          {status === 'listed' ? t.products.inspListed
                            : status === 'not_listed' ? t.products.inspDelisted
                              : t.products.inspVerifyRequired}
                        </span>
                        {/* The registry's own id — only ever shown on a confirmed listing. */}
                        {id && (
                          <span style={{ fontSize: 12.5, color: '#1d1d1f' }} data-testid="local-listing-id">
                            {t.products.localListingIdLabel}: {id}
                          </span>
                        )}
                      </>
                    );
                  })()}
                  <span style={{ fontSize: 12, color: '#7a7a7a' }}>
                    {t.products.inspVerify}{' '}
                    <span onClick={() => window.open(REGISTRY_VERIFY_URL, '_blank', 'noopener')} style={{ color: '#0066cc', cursor: 'pointer' }}>{t.products.openBafa}</span>
                  </span>
                </div>
                <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 18, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 9 }}>
                  <span style={{ ...sectionLabel, fontSize: 10.5 }}>{t.products.inspEuLabel}</span>
                  {sel.eprel ? (
                    <>
                      <span style={{ fontSize: 13.5 }}>{t.products.inspEprelMatched(sel.label, sel.labelMed)}</span>
                      <span onClick={() => app.openLabelRecord(sel.id)} style={{ fontSize: 12.5, color: '#0066cc', cursor: 'pointer' }}>{t.products.openLabelRecord}</span>
                    </>
                  ) : (
                    <span style={{ fontSize: 13.5, color: '#7a7a7a' }}>{t.products.noEprel}</span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className="hp-press" onClick={() => app.toggleCompare(sel.id)} style={pillSecondary}>
                    {app.compare.includes(sel.id) ? t.products.removeCompare : t.products.addCompare}
                  </span>
                  <span className="hp-press" onClick={() => app.openDataSheet(sel.id, 'product')} style={pillPrimary}>{t.products.dataSheetBtn}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Comparison modal ── */}
      {showModal && (
        <div
          onClick={() => app.setShowCompare(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ position: 'relative', background: '#fff', borderRadius: 18, width: 'min(1560px, 96vw)', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,.28)' }}
          >
            <Watermark />
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 28px', borderBottom: '1px solid #e0e0e0', flex: 'none' }}>
              <span style={{ fontFamily: FD, fontSize: 21, fontWeight: 600, letterSpacing: '-0.28px' }}>{t.products.comparison}</span>
              <span style={{ fontSize: 12.5, color: '#7a7a7a' }}>{t.products.comparisonCount(compareCount)}</span>
              <span
                className="hp-press"
                onClick={() => app.setShowCompare(false)}
                style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 8, background: '#1d1d1f', color: '#fff', borderRadius: 999, padding: '10px 22px', fontSize: 14.5, fontWeight: 600, cursor: 'pointer' }}
              >
                {t.products.close}
              </span>
            </div>
            <div style={{ overflow: 'auto', padding: '22px 28px 28px' }}>
              {/* One CSS grid = every row's height syncs across all columns, so a
                  three-line model name can never overlap the first data row. */}
              {(() => {
                const num = (s: string) => { const n = parseFloat(String(s).replace(',', '.')); return Number.isFinite(n) ? n : null; };
                const L = t.products.cmpRows;
                const rows: { label: string; value: (c: HpVM) => string; metric?: (c: HpVM) => number | null; dir?: 1 | -1; strong?: boolean; dim?: boolean }[] = [
                  { label: L[0], value: c => `${c.kw} kW`, strong: true },
                  { label: L[1], value: c => c.cop7, metric: c => num(c.cop7), dir: 1 },
                  { label: L[2], value: c => c.cop2, metric: c => num(c.cop2), dir: 1 },
                  { label: L[3], value: c => c.scop, metric: c => num(c.scop), dir: 1 },
                  { label: L[4], value: c => (c.noise === '—' ? '—' : `${c.noise} dB(A)`), metric: c => num(c.noise), dir: -1 },
                  { label: L[5], value: c => (c.refKg === '—' ? c.ref : `${c.ref} · ${c.refKg} kg`) },
                  { label: L[6], value: c => c.label },
                  { label: L[7], value: c => c.sourceId, dim: true },
                ];
                return (
                  <div style={{ display: 'grid', gridTemplateColumns: `190px repeat(${compareCount}, minmax(0, 1fr))`, border: '1px solid #e0e0e0', borderRadius: 18, overflow: 'hidden', fontSize: 14.5 }}>
                    {/* header row — product identity */}
                    <div style={{ background: '#f5f5f7', borderBottom: '2px solid #e0e0e0' }} />
                    {compareItems.map(c => (
                      <div key={`h-${c.id}`} style={{ background: '#f5f5f7', borderBottom: '2px solid #e0e0e0', borderLeft: '1px solid #e0e0e0', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
                        <span style={{ fontWeight: 650, fontSize: 15.5, lineHeight: 1.3, overflowWrap: 'anywhere' }}>{c.model}</span>
                        <span style={{ fontSize: 12, color: '#7a7a7a', overflowWrap: 'anywhere' }}>
                          {c.mfr} · <span onClick={() => app.toggleCompare(c.id)} style={{ color: '#0066cc', cursor: 'pointer', whiteSpace: 'nowrap' }}>{t.products.remove}</span>
                        </span>
                      </div>
                    ))}
                    {/* metric rows — zebra striping; the best value per row is highlighted */}
                    {rows.map((row, ri) => {
                      const vals = row.metric ? compareItems.map(row.metric) : [];
                      const usable = vals.filter((v): v is number => v != null);
                      const best = row.metric && usable.length >= 2 && new Set(usable).size > 1
                        ? (row.dir === -1 ? Math.min(...usable) : Math.max(...usable))
                        : null;
                      const bg = ri % 2 ? '#fafafa' : '#fff';
                      return (
                        <React.Fragment key={row.label}>
                          <div style={{ padding: '13px 20px', background: bg, borderTop: '1px solid #ececec', fontSize: 12.5, color: '#7a7a7a', display: 'flex', alignItems: 'center' }}>{row.label}</div>
                          {compareItems.map(c => {
                            const isBest = best != null && row.metric!(c) === best;
                            return (
                              <div
                                key={`${row.label}-${c.id}`}
                                style={{
                                  padding: '13px 20px', background: bg, borderTop: '1px solid #ececec', borderLeft: '1px solid #ececec',
                                  minWidth: 0, overflowWrap: 'anywhere', display: 'flex', alignItems: 'center', gap: 8,
                                  ...(row.strong ? { fontWeight: 600 } : {}),
                                  ...(row.dim ? { fontSize: 12.5, color: '#7a7a7a' } : {}),
                                  ...(isBest ? { color: '#0a7a43', fontWeight: 650 } : {}),
                                }}
                              >
                                {row.value(c)}
                                {isBest && <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.05em', background: '#e7f6ee', color: '#0a7a43', borderRadius: 999, padding: '2px 8px' }}>{t.products.bestBadge}</span>}
                              </div>
                            );
                          })}
                        </React.Fragment>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
