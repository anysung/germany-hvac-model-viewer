/** EU energy label — EPREL-style records with always-on label inspector.
 *  Lists the FULL downloaded catalog (residential + commercial) via app.allStore,
 *  with a Products-style filter rail: class, EPREL status, manufacturer,
 *  refrigerant and capacity. */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { HpApp } from '../appState';
import { HpVM } from '../model';
import { FD, CheckBox, KwRangeSlider, pillPrimary, pillSecondary, sectionLabel } from '../ui';
import { ManufacturerFacet } from '../MfrFacet';
import { tr } from '../i18n';

const GRID = '2.2fr 1fr 0.8fr 0.8fr 0.9fr';
const PAGE_SIZE = 100;

export const LabelPage: React.FC<{ app: HpApp }> = ({ app }) => {
  const t = tr(app.lang);
  const store = app.allStore;
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [mfrFilter, setMfrFilter] = useState<string[]>([]);
  const [refFilter, setRefFilter] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Capacity range over the full catalog's kW bounds; null = untouched.
  const bounds = store?.kwBounds ?? null;
  const [capRange, setCapRange] = useState<[number, number] | null>(null);
  useEffect(() => { setCapRange(null); }, [store]);
  const capLo = capRange?.[0] ?? bounds?.min ?? 0;
  const capHi = capRange?.[1] ?? bounds?.max ?? 0;
  const capNarrowed = !!bounds && !!capRange && (capRange[0] > bounds.min || capRange[1] < bounds.max);

  const records = useMemo(() => {
    let list = store ? store.labelRecords(app.classFilter) : [];
    if (refFilter) list = list.filter(v => v.ref.includes(refFilter));
    if (mfrFilter.length) {
      const set = new Set(mfrFilter);
      list = list.filter(v => set.has(v.mfr));
    }
    if (capNarrowed) {
      list = list.filter(v => v.ratedKwNum != null && v.ratedKwNum >= capLo && v.ratedKwNum <= capHi);
    }
    return list;
  }, [store, app.classFilter, refFilter, mfrFilter, capNarrowed, capLo, capHi]);
  const rows = records.slice(0, visible);

  const hasFilters = !!app.classFilter || !!refFilter || mfrFilter.length > 0 || capNarrowed;
  const clearAll = () => {
    app.setClassFilter(null);
    setRefFilter(null);
    setMfrFilter([]);
    setCapRange(null);
  };

  useEffect(() => {
    setVisible(PAGE_SIZE);
    scrollerRef.current?.scrollTo({ top: 0 });
  }, [records]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || visible >= records.length) return;
    const io = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) setVisible(v => v + PAGE_SIZE);
    }, { root: scrollerRef.current, rootMargin: '600px' });
    io.observe(sentinel);
    return () => io.disconnect();
  }, [visible, records.length]);

  const lsel: HpVM | null = (app.labelSelId && store ? store.byId.get(app.labelSelId) : null) ?? records[0] ?? null;

  return (
    <div style={{ flex: 'none', display: 'flex', flexDirection: 'column', minHeight: 0, height: 'calc(100vh - 60px)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 28px', borderBottom: '1px solid rgba(0,0,0,.08)', flex: 'none' }}>
        <span style={{ fontFamily: FD, fontSize: 19, fontWeight: 600, letterSpacing: '-0.2px' }}>{t.label.title}</span>
        <span style={{ fontSize: 12, color: '#7a7a7a', border: '1px solid #e0e0e0', borderRadius: 999, padding: '5px 13px' }}>{t.label.pill}</span>
        <span style={{ marginLeft: 'auto', fontSize: 13, color: '#7a7a7a' }}>
          {t.label.countLine(records.length.toLocaleString('en-US'), (store?.total ?? 0).toLocaleString('en-US'))}
        </span>
      </div>
      <div style={{ flex: 1, overflowX: 'auto', minHeight: 0 }}>
        <div style={{ display: 'flex', alignItems: 'stretch', minWidth: 1240, height: '100%', boxSizing: 'border-box' }}>

          {/* label filter rail */}
          <div style={{ flex: '0 0 248px', boxSizing: 'content-box', borderRight: '1px solid rgba(0,0,0,.08)', padding: 20, display: 'flex', flexDirection: 'column', gap: 22, overflowY: 'auto' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <span style={sectionLabel}>{t.label.energyClass}</span>
                {hasFilters && (
                  <span onClick={clearAll} style={{ fontSize: 12, color: '#0066cc', cursor: 'pointer' }}>{t.label.clearAll}</span>
                )}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {['A+++', 'A++', 'A+'].map(c => {
                  const on = app.classFilter === c;
                  return (
                    <span
                      key={c}
                      className="hp-press"
                      onClick={() => app.setClassFilter(on ? null : c)}
                      style={{
                        borderRadius: 999, padding: '5px 13px', fontSize: 12.5, cursor: 'pointer',
                        ...(on ? { background: '#0066cc', color: '#fff' } : { border: '1px solid #e0e0e0', color: '#1d1d1f' }),
                      }}
                    >
                      {c}
                    </span>
                  );
                })}
              </div>
            </div>
            {/* Same manufacturer facet as the Products page (shared component):
                selection-or-top-5 collapsed view + searchable A–Z full panel. */}
            <ManufacturerFacet
              title={t.label.manufacturer}
              counts={store?.mfrCounts ?? []}
              selected={mfrFilter}
              onChange={setMfrFilter}
              labels={{
                showAll: t.products.showAll,
                searchPh: t.products.mfrSearchPh,
                done: t.products.mfrDone,
                selectedCount: t.products.selectedCount,
              }}
            />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <span style={sectionLabel}>{t.label.refrigerant}</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {['R290', 'R32', 'R410A'].map(r => {
                  const on = refFilter === r;
                  return (
                    <span
                      key={r}
                      className="hp-press"
                      onClick={() => setRefFilter(on ? null : r)}
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
              <span style={sectionLabel}>{t.label.capacity}</span>
              {bounds ? (
                <KwRangeSlider bounds={bounds} lo={capLo} hi={capHi} onChange={setCapRange} />
              ) : (
                <span style={{ fontSize: 12, color: '#7a7a7a' }}>{t.label.noCapacityData}</span>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={sectionLabel}>{t.label.about}</span>
              <span style={{ fontSize: 12, color: '#7a7a7a', lineHeight: 1.5 }}>
                {t.label.aboutText}
              </span>
              <span style={{ fontSize: 13.5, borderTop: '1px solid #f0f0f0', paddingTop: 10 }}>
                {t.label.updated} <span style={{ fontWeight: 600 }}>{app.eprelSyncDate}</span>
              </span>
            </div>
          </div>

          {/* label table */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, borderRight: '1px solid rgba(0,0,0,.08)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: '0 12px', padding: '10px 20px', borderBottom: '1px solid rgba(0,0,0,.08)', fontSize: 10.5, fontWeight: 600, letterSpacing: '.05em', color: '#7a7a7a', flex: 'none' }}>
              <span>{t.label.th.model}</span><span>{t.label.th.mfr}</span><span>{t.label.th.w35}</span><span>{t.label.th.w55}</span><span>{t.label.th.noise}</span>
            </div>
            <div ref={scrollerRef} style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
              {rows.map(lr => {
                const isSel = lsel?.id === lr.id;
                return (
                  <div
                    key={lr.id}
                    className="hp-row"
                    onClick={() => app.setLabelSelId(lr.id)}
                    style={{
                      display: 'grid', gridTemplateColumns: GRID, gap: '0 12px', alignItems: 'center',
                      padding: '12px 20px', borderBottom: '1px solid #f0f0f0', fontSize: 13, cursor: 'pointer',
                      ...(isSel ? { background: '#f5f5f7', boxShadow: 'inset 2px 0 0 #0066cc' } : { background: '#fff' }),
                    }}
                  >
                    <span style={{ minWidth: 0 }}>
                      <span style={{ fontWeight: 600, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{lr.model}</span>
                      <span style={{ fontSize: 11, color: '#7a7a7a' }}>ODU {lr.odu}</span>
                    </span>
                    <span>{lr.mfr}</span>
                    <span style={{ fontWeight: 600 }}>{lr.label}</span>
                    <span>{lr.labelMed}</span>
                    <span>{lr.noise === '—' ? '—' : `${lr.noise} dB(A)`}</span>
                  </div>
                );
              })}
              {visible < records.length && <div ref={sentinelRef} style={{ height: 1 }} />}
              <div style={{ padding: '11px 20px', fontSize: 12, color: '#7a7a7a' }}>
                {t.label.hint}
              </div>
            </div>
          </div>

          {/* label inspector — always visible */}
          {lsel && (
            <div style={{ flex: '0 0 400px', display: 'flex', flexDirection: 'column', background: '#f5f5f7', overflow: 'auto' }}>
              <div style={{ padding: '20px 24px 0', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 12, color: '#7a7a7a' }}>{lsel.mfr} · {lsel.eprelId}</span>
                <span style={{ fontFamily: FD, fontSize: 21, fontWeight: 600, letterSpacing: '-0.28px', lineHeight: 1.18 }}>{lsel.model}</span>
              </div>
              <div style={{ padding: '18px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 18, padding: 20, display: 'flex', gap: 18, alignItems: 'center' }}>
                  <div style={{ flex: '0 0 96px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, border: '1px solid #e0e0e0', borderRadius: 8, padding: '14px 10px' }}>
                    <span style={{ fontSize: 9, letterSpacing: '.08em', color: '#7a7a7a' }}>{t.label.energy}</span>
                    <span style={{ fontFamily: FD, fontSize: 30, fontWeight: 700, letterSpacing: '-0.5px' }}>{lsel.label}</span>
                    <span style={{ fontSize: 9, color: '#7a7a7a' }}>{t.label.spaceHeatingW35}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13, minWidth: 0 }}>
                    <span><span style={{ color: '#7a7a7a' }}>{t.label.w35}</span> <strong style={{ fontWeight: 600 }}>{lsel.label}</strong> · <span style={{ color: '#7a7a7a' }}>{t.label.w55}</span> <strong style={{ fontWeight: 600 }}>{lsel.labelMed}</strong></span>
                    <span><span style={{ color: '#7a7a7a' }}>{t.label.ratedOutput}</span> <strong style={{ fontWeight: 600 }}>{lsel.ratedKw === '—' ? '—' : `${lsel.ratedKw} kW`}</strong></span>
                    <span><span style={{ color: '#7a7a7a' }}>{t.label.soundPower}</span> <strong style={{ fontWeight: 600 }}>{lsel.noise === '—' ? '—' : `${lsel.noise} dB(A)`}</strong></span>
                    <span><span style={{ color: '#7a7a7a' }}>{t.label.refrigerantRow}</span> <strong style={{ fontWeight: 600 }}>{lsel.refKg === '—' ? lsel.ref : `${lsel.ref} · ${lsel.refKg} kg`}</strong></span>
                  </div>
                </div>
                <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 18, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5 }}>
                  <span style={{ ...sectionLabel, fontSize: 10.5 }}>{t.label.sourceVerification}</span>
                  <span style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#7a7a7a' }}>{t.label.registration}</span><span style={{ fontWeight: 600 }}>{lsel.eprelId}</span></span>
                  <span style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#7a7a7a' }}>{t.label.completeness}</span><span style={{ fontWeight: 600 }}>{lsel.completeness}</span></span>
                  <span style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#7a7a7a' }}>{t.label.infoSheet}</span><span style={{ fontWeight: 600 }}>{lsel.eprel ? t.label.available : '—'}</span></span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span className="hp-press" onClick={() => app.openDataSheet(lsel.id, 'label')} style={pillPrimary}>{t.label.labelSheetBtn}</span>
                  <span className="hp-press" onClick={() => app.openProduct(lsel.id)} style={pillSecondary}>{t.label.openProfile}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
