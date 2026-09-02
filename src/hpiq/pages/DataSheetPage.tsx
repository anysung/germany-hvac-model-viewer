/** Data sheet studio — two modes, model picker, section toggles, live preview. */
import React, { useMemo, useState } from 'react';
import { HpApp, DsSectionKey } from '../appState';
import { longDate, crossRefId } from '../model';
import { FD, SearchIcon, Watermark, pillPrimary, pillSecondary, sectionLabel } from '../ui';
import { tr } from '../i18n';
import { localListingStatus, localListingId, LOCAL_LISTING_SOURCE } from '../listing';
import { IS_GB, IS_PL, IS_IT, SOURCE_ID_ABBR } from '../market';
import { BrandLogo, WavingFlag } from '../../components/BrandLogo';

const PICKER_LIMIT = 60;

const MONO = 'ui-monospace, Menlo, monospace';

/** Two-column spec cell: label above value — fills the sheet width without
 *  the empty middle a justify-between row leaves. */
/** The [n] marker's column width — the label starts after it, and the value is
 *  indented to the LABEL, not to the number (owner, 2026-09-02: values lined
 *  up under the markers read as a second column of numbers). */
const NOTE_W = 27;
const FieldCell: React.FC<{ label: string; value: string; note?: number; span?: boolean }> = ({ label, value, note, span }) => (
  <div className="ds-cell" style={{ gridColumn: span ? '1 / -1' : undefined, display: 'flex', flexDirection: 'column', gap: 4, padding: '11px 0 10px', borderBottom: '1px solid #ececf0', breakInside: 'avoid' }}>
    <span className="ds-cell-label" style={{ display: 'flex', fontSize: 10.5, letterSpacing: '.05em', textTransform: 'uppercase', color: '#7a7a7a' }}>
      {note != null && <span style={{ fontFamily: MONO, fontSize: 9.5, color: '#b6b6bc', flex: `0 0 ${NOTE_W}px` }}>[{note}]</span>}
      <span style={{ minWidth: 0 }}>{label}</span>
    </span>
    <span className="ds-cell-value" style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.1px', paddingLeft: note != null ? NOTE_W : 0 }}>{value}</span>
  </div>
);

const SectionGrid: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 36 }}>{children}</div>
);

/** Official EU energy label arrow scale (space heaters, A+++…D) with the
 *  product's W35 class marked. Colors follow the EU label design CI. */
const EU_SCALE: [string, string, string][] = [
  ['A+++', '#009036', '#fff'],
  ['A++',  '#52ae32', '#fff'],
  ['A+',   '#c8d400', '#1d1d1f'],
  ['A',    '#ffed00', '#1d1d1f'],
  ['B',    '#fbba00', '#1d1d1f'],
  ['C',    '#eb6909', '#fff'],
  ['D',    '#e2001a', '#fff'],
];

const EnergyScale: React.FC<{ current: string; caption?: string }> = ({ current, caption }) => (
  <div style={{ flex: '0 0 230px', display: 'flex', flexDirection: 'column', gap: 4 }}>
    {EU_SCALE.map(([cls, bg, fg], i) => {
      const active = cls === current;
      return (
        <div key={cls} style={{ display: 'flex', alignItems: 'center', gap: 10, height: 20 }}>
          <span style={{
            width: `${42 + i * 8}%`, height: '100%', background: bg, color: fg,
            clipPath: 'polygon(0 0, calc(100% - 9px) 0, 100% 50%, calc(100% - 9px) 100%, 0 100%)',
            display: 'inline-flex', alignItems: 'center', paddingLeft: 8,
            fontSize: 11.5, fontWeight: 700, letterSpacing: '.02em', boxSizing: 'border-box',
          }}>
            {cls}
          </span>
          {active && (
            <span style={{
              background: '#1d1d1f', color: '#fff', height: '100%', padding: '0 10px 0 16px',
              clipPath: 'polygon(9px 0, 100% 0, 100% 100%, 9px 100%, 0 50%)',
              display: 'inline-flex', alignItems: 'center', fontSize: 11, fontWeight: 700,
            }}>
              {cls}
            </span>
          )}
        </div>
      );
    })}
    {caption && (
      <span style={{ fontSize: 11, color: '#7a7a7a', lineHeight: 1.55, marginTop: 6 }}>
        {caption}
      </span>
    )}
  </div>
);

const SectionHead: React.FC<{ title: string; muted?: boolean }> = ({ title, muted }) => (
  <span className="ds-section-head" style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.08em', color: muted ? '#7a7a7a' : '#0066cc', borderBottom: '2px solid #1d1d1f', paddingBottom: 8 }}>{title}</span>
);

/**
 * The printable data-sheet document (`.hpiq-print-doc`) — single source of
 * truth for the desktop studio preview AND the mobile data-sheet screen, and
 * the exact DOM `@media print` targets. Self-contained: derives the selected
 * product + footnote numbering from `app`.
 */
export const DataSheetDoc: React.FC<{ app: HpApp }> = ({ app }) => {
  const t = tr(app.lang);
  const { store } = app;
  const isLabelMode = app.dsMode === 'label';
  const dsp = (app.dsId && store ? store.byId.get(app.dsId) : null) ?? store?.all[0] ?? null;
  if (!dsp) return null;

  const noteOrder: string[] = [];
  const n = (key: string): number => {
    let i = noteOrder.indexOf(key);
    if (i === -1) { noteOrder.push(key); i = noteOrder.length - 1; }
    return i + 1;
  };
  const typeLine = `${dsp.raw.type ?? '—'}${dsp.installType !== '—' ? ` · ${dsp.installType}` : ''}`;
  // GSE-native records (IT only): the catalogue's declared operating points,
  // rendered verbatim. Labels come from ds.notes (IT dictionaries); the code
  // fallbacks keep other dictionaries type-stable.
  const gn = (k: string, fb: string): string => (t.ds.notes as Record<string, string>)[k] ?? fb;
  const gseRows = dsp.raw.performance_source === 'GSE_CATALOGUE' && Array.isArray(dsp.raw.gse_ratings) && dsp.raw.gse_ratings.length
    ? dsp.raw.gse_ratings : null;
  const gsePointValue = (r: { kw: number | null; etas: number | null; scop: number | null }): string =>
    [r.kw != null ? `${r.kw} kW` : null, r.etas != null ? `\u03b7s ${r.etas} %` : null, r.scop != null ? `SCOP/COP ${r.scop}` : null]
      .filter(Boolean).join(' \u00b7 ') || '—';

  return (
    <div className="hpiq-print-doc" style={{ position: 'relative', width: 680, maxWidth: '100%', background: '#fff', border: '1px solid #e0e0e0', borderRadius: 8, padding: '44px 48px', display: 'flex', flexDirection: 'column', gap: 0, height: 'fit-content', boxSizing: 'content-box', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
              <div className="ds-doc-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: 20 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {/* The same shared BrandLogo as the header — animated on screen.
                      Print/PDF freeze it: @media print stops the spin at 0deg, and
                      the generated PDF rasterizes the static SVG, so paper output
                      is always the canonical orientation. */}
                  <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <BrandLogo height={34} theme="light" />
                    <WavingFlag height={29} onLight />
                  </span>
                  <span style={{ fontSize: 11.5, letterSpacing: '.08em', color: '#7a7a7a' }}>
                    {isLabelMode ? t.ds.docKindLabel : t.ds.docKindProduct}
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, textAlign: 'right', fontSize: 11.5, color: '#7a7a7a' }}>
                  <span>{t.ds.generated} {longDate(new Date().toISOString())}</span>
                  <span>{isLabelMode ? t.ds.bafaRef : SOURCE_ID_ABBR} {dsp.sourceId}{dsp.eprel ? ` · ${dsp.eprelId}` : ''}</span>
                </div>
              </div>

              {/* title card + key stats */}
              <div className="ds-title-card" style={{ background: '#1d1d1f', color: '#fff', borderRadius: 10, padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span className="ds-title-model" style={{ fontFamily: FD, fontSize: 22, fontWeight: 600, letterSpacing: '-0.24px' }}>{dsp.model}</span>
                <span style={{ fontSize: 13.5, color: '#ccc' }}>{dsp.mfr} · {IS_GB || IS_PL || IS_IT ? (dsp.raw.type ?? '—').toLowerCase() : t.ds.airWater}{dsp.installType !== '—' ? ` · ${dsp.installType.toLowerCase()}` : ''}</span>
              </div>
              <div className="ds-stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginTop: 12 }}>
                {([
                  [dsp.kw, t.ds.stat.kw],
                  [dsp.scop, t.ds.stat.scop],
                  [dsp.cop7, t.ds.stat.cop],
                  [dsp.label, t.ds.stat.cls],
                ] as [string, string][]).map(([v, l]) => (
                  <div key={l} className="ds-stat" style={{ background: '#f5f5f7', borderRadius: 8, padding: '13px 14px', display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'center', textAlign: 'center', breakInside: 'avoid' }}>
                    <span className="ds-stat-value" style={{ fontFamily: FD, fontSize: 21, fontWeight: 700, letterSpacing: '-0.3px' }}>{v}</span>
                    <span style={{ fontSize: 10, letterSpacing: '.06em', color: '#7a7a7a', textTransform: 'uppercase' }}>{l}</span>
                  </div>
                ))}
              </div>

              {app.dsSections.identity && (
                <div className="ds-section" style={{ display: 'flex', flexDirection: 'column', paddingTop: 24 }}>
                  <SectionHead title={t.ds.headIdentity} />
                  <SectionGrid>
                    <FieldCell label={t.ds.f.manufacturer} value={dsp.mfr} note={n('manufacturer')} />
                    <FieldCell label={t.ds.f.odu} value={dsp.odu} note={n('odu')} />
                    {/* GSE-native split systems: the catalogue's own indoor-unit identifier. */}
                    {gseRows && dsp.raw.idu_model && (
                      <FieldCell label={gn('gseIduLabel', 'Indoor unit (IDU)')} value={dsp.raw.idu_model} note={n('gseIdu')} />
                    )}
                    <FieldCell label={t.ds.f.type} value={typeLine} note={n('type')} />
                    <FieldCell label={t.ds.f.bafaId} value={dsp.sourceId} note={n('bafaId')} />
                    {/* NF PAC reference — only present on confident matches (FR policy). */}
                    {dsp.raw.nf_pac_reference && (
                      <FieldCell label={t.ds.f.nfPac} value={dsp.raw.nf_pac_reference} note={n('nfPac')} />
                    )}
                  </SectionGrid>
                </div>
              )}

              {isLabelMode && (
                <div className="ds-section" style={{ display: 'flex', flexDirection: 'column', paddingTop: 24 }}>
                  <SectionHead title={t.ds.headEuLabel} />
                  <div className="ds-eu-row" style={{ display: 'flex', gap: 22, alignItems: 'center', padding: '16px 0', borderBottom: '1px solid #ececf0' }}>
                    <div style={{ flex: '0 0 96px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, border: '1px solid #e0e0e0', borderRadius: 10, padding: '15px 10px' }}>
                      <span style={{ fontSize: 9.5, letterSpacing: '.08em', color: '#7a7a7a' }}>ENERGY</span>
                      <span style={{ fontFamily: FD, fontSize: 32, fontWeight: 700 }}>{dsp.label}</span>
                      <span style={{ fontSize: 9.5, color: '#7a7a7a' }}>W35</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13.5 }}>
                      {/* Hanging indent: the marker owns a fixed column, so a
                          localized label that wraps (Polish easily does) folds
                          under ITS OWN first word — not under the number. */}
                      {([
                        [n('classW35'), t.ds.f.clsW35, dsp.label],
                        [n('classW55'), t.ds.f.clsW55, dsp.labelMed],
                        [n('eprelReg'), t.ds.f.eprelReg, dsp.eprel ? dsp.eprelId : t.ds.f.eprelNone],
                        [null, t.ds.f.infoSheet, dsp.eprel ? t.ds.f.available : '—'],
                      ] as [number | null, string, string][]).map(([num, label, value], i) => (
                        <span key={i} style={{ display: 'flex' }}>
                          <span style={{ fontFamily: MONO, fontSize: 10, color: '#b6b6bc', flex: `0 0 ${NOTE_W}px` }}>{num != null ? `[${num}]` : ''}</span>
                          <span style={{ minWidth: 0 }}>
                            <span style={{ color: '#7a7a7a' }}>{label}</span> <strong style={{ fontWeight: 600 }}>{value}</strong>
                          </span>
                        </span>
                      ))}
                    </div>
                    <EnergyScale current={dsp.label} />
                  </div>
                  <span style={{ fontSize: 10.5, color: '#7a7a7a', lineHeight: 1.55, paddingTop: 10 }}>
                    {t.ds.labelDerivation}
                  </span>
                </div>
              )}

              {app.dsSections.performance && !gseRows && (
                <div className="ds-section" style={{ display: 'flex', flexDirection: 'column', paddingTop: 24 }}>
                  <SectionHead title={t.ds.headPerf} />
                  <SectionGrid>
                    <FieldCell label={t.ds.f.kw55} value={dsp.kw === '—' ? '—' : `${dsp.kw} kW`} note={n('kw55')} />
                    <FieldCell label={t.ds.f.scop} value={dsp.scop} note={n('scop')} />
                    <FieldCell label={t.ds.f.cop7} value={dsp.cop7} note={n('cop7')} />
                    <FieldCell label={t.ds.f.cop2} value={dsp.cop2} note={n('cop2')} />
                    <FieldCell label={t.ds.f.copm7} value={dsp.copm7} note={n('copm7')} />
                  </SectionGrid>
                  {crossRefId(dsp.raw) != null && (
                    <span style={{ fontSize: 10.5, color: '#7a7a7a', lineHeight: 1.55, paddingTop: 10 }}>
                      {t.ds.perfCrossRefNote(crossRefId(dsp.raw) ?? '—')}
                    </span>
                  )}
                </div>
              )}

              {app.dsSections.performance && gseRows
                && (dsp.raw.power_35C_kw != null || dsp.raw.power_55C_kw != null || dsp.raw.scop != null) && (
                <div className="ds-section" style={{ display: 'flex', flexDirection: 'column', paddingTop: 24 }}>
                  <SectionHead title={t.ds.headPerf} />
                  <SectionGrid>
                    {dsp.raw.power_35C_kw != null && (
                      <FieldCell label={gn('gseKw35Label', 'Heat output (35\u00a0\u00b0C)')} value={`${dsp.raw.power_35C_kw} kW`} note={n('gsePoints')} />
                    )}
                    {dsp.raw.power_55C_kw != null && (
                      <FieldCell label={t.ds.f.kw55} value={`${dsp.raw.power_55C_kw} kW`} note={n('kw55')} />
                    )}
                    {dsp.raw.scop != null && (
                      <FieldCell label={t.ds.f.scop} value={dsp.scop} note={n('scop')} />
                    )}
                  </SectionGrid>
                </div>
              )}

              {!isLabelMode && gseRows && (
                <div className="ds-section" style={{ display: 'flex', flexDirection: 'column', paddingTop: 24 }}>
                  <SectionHead title={gn('gseHead', 'Values declared in the GSE catalogue')} />
                  <SectionGrid>
                    {gseRows.map((r, i) => (
                      <FieldCell key={i} label={`${gn('gsePointLabel', 'Declared operating point')} ${gseRows.length > 1 ? i + 1 : ''}`.trim()} value={gsePointValue(r)} note={n('gsePoints')} />
                    ))}
                  </SectionGrid>
                  <span style={{ fontSize: 10.5, color: '#7a7a7a', lineHeight: 1.55, paddingTop: 10 }}>
                    {gn('gseProvenance', 'Source: GSE Conto Termico 3.0 catalogue of pre-qualified appliances (catalogue III.A)')}
                    {dsp.raw.gse_snapshot ? ` \u00b7 ${dsp.raw.gse_snapshot}` : ''}
                  </span>
                </div>
              )}

              {app.dsSections.env && gseRows && dsp.ref !== '—' && (
                <div className="ds-section" style={{ display: 'flex', flexDirection: 'column', paddingTop: 24 }}>
                  <SectionHead title={t.ds.headEnv} />
                  <SectionGrid>
                    <FieldCell label={t.ds.f.ref} value={dsp.ref} note={n('ref')} />
                  </SectionGrid>
                </div>
              )}

              {app.dsSections.env && !gseRows && (
                <div className="ds-section" style={{ display: 'flex', flexDirection: 'column', paddingTop: 24 }}>
                  <SectionHead title={t.ds.headEnv} />
                  <SectionGrid>
                    <FieldCell label={t.ds.f.ref} value={dsp.ref} note={n('ref')} />
                    <FieldCell label={t.ds.f.refKg} value={dsp.refKg === '—' ? '—' : `${dsp.refKg} kg`} note={n('refKg')} />
                    <FieldCell label={t.ds.f.noise} value={dsp.noise === '—' ? '—' : `${dsp.noise} dB(A)`} note={n('noise')} />
                    {/* GB: SG-Ready is not recorded on the PEL — unknown, not "No". */}
                    <FieldCell label={t.ds.f.grid} value={IS_GB || dsp.raw.grid_ready == null ? '—' : dsp.raw.grid_ready ? t.ds.f.yes : t.ds.f.no} note={n('grid')} />
                  </SectionGrid>
                </div>
              )}

              {app.dsSections.bafa && !isLabelMode && (
                <div className="ds-section" style={{ display: 'flex', flexDirection: 'column', paddingTop: 24 }}>
                  <SectionHead title={t.ds.headBafa} />
                  <SectionGrid>
                    {/* Listing status only where this market has a national list of its own. */}
                    {LOCAL_LISTING_SOURCE && (
                    <FieldCell
                      label={t.ds.f.bafaStatus}
                      value={(() => {
                        const st = localListingStatus(dsp.raw);
                        return st === 'listed' ? t.ds.f.listed
                          : st === 'not_listed' ? t.ds.f.notListed
                            : t.ds.f.verifyRequired;
                      })()}
                      note={n('bafaStatus')}
                    />
                    )}
                    {/* The registry's own id — only ever on a confirmed listing. */}
                    {localListingId(dsp.raw) && (
                      <FieldCell label={t.ds.f.localListingId} value={localListingId(dsp.raw)!} note={n('localListingId')} />
                    )}
                    <FieldCell label={t.ds.f.begRel} value={t.ds.f.begVerify} note={n('begRel')} />
                  </SectionGrid>
                </div>
              )}

              {/* (SOURCE & VERIFICATION removed 2026-07-12 — the legal disclaimer
                  below already covers provenance; it was duplicate wording.) */}

              {/* ── Technical explanations — always printed ── */}
              <div className="ds-notes" style={{ borderTop: '1px solid #e0e0e0', marginTop: 24, paddingTop: 20, display: 'flex', gap: 28, alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 0 }}>
                  <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.08em', color: '#7a7a7a', paddingBottom: 9 }}>{t.ds.techExplanations}</span>
                  {noteOrder.map((key, i) => (
                    <span key={key} className="ds-note-row" style={{ display: 'flex', gap: 8, fontSize: 11, color: '#7a7a7a', lineHeight: 1.55, padding: '2.5px 0' }}>
                      <span style={{ fontFamily: MONO, fontSize: 10, color: '#b6b6bc', flex: 'none', paddingTop: 1 }}>[{i + 1}]</span>
                      <span>{t.ds.notes[key]}</span>
                    </span>
                  ))}
                </div>
              </div>

              {/* ── Legal disclaimer — always printed ── */}
              <div className="ds-disclaimer" style={{ borderTop: '1px solid #e0e0e0', marginTop: 18, paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.08em', color: '#7a7a7a' }}>{t.ds.disclaimerTitle}</span>
                <span style={{ fontSize: 10, color: '#9a9aa0', lineHeight: 1.6, textAlign: 'justify' }}>
                  {t.ds.disclaimer}
                </span>
              </div>

              {/* ── Copyright watermark: screen (preview) + per-page on print ── */}
              <Watermark />
              <Watermark print />
            </div>
  );
};

export const DataSheetPage: React.FC<{ app: HpApp }> = ({ app }) => {
  const t = tr(app.lang);
  const { store } = app;
  const [pickerQuery, setPickerQuery] = useState('');

  const isLabelMode = app.dsMode === 'label';
  const dsp = (app.dsId && store ? store.byId.get(app.dsId) : null) ?? store?.all[0] ?? null;

  const pickerRows = useMemo(() => {
    if (!store) return [];
    const q = pickerQuery.trim().toLowerCase();
    const list = q.length >= 2
      ? store.all.filter(p => `${p.model} ${p.mfr} ${p.sourceId}`.toLowerCase().includes(q))
      : store.all;
    return list.slice(0, PICKER_LIMIT);
  }, [store, pickerQuery]);

  const sectionDefs: [DsSectionKey, string][] = isLabelMode
    ? [['identity', t.ds.sections.identityL], ['performance', t.ds.sections.perfL], ['env', t.ds.sections.envL]]
    : [['identity', t.ds.sections.identityP], ['performance', t.ds.sections.perfP], ['env', t.ds.sections.envP], ['bafa', t.ds.sections.bafa]];

  // (Footnote numbering + the printable document now live in <DataSheetDoc>.)
  // Equal-width halves, same reasoning as SubTabs: two modes of equal standing.
  const segStyle = (on: boolean): React.CSSProperties => ({
    padding: '6px 18px', fontSize: 12.5, cursor: 'pointer', textAlign: 'center', whiteSpace: 'nowrap',
    ...(on ? { background: '#1d1d1f', color: '#fff', fontWeight: 600 } : { color: '#1d1d1f' }),
  });

  return (
    <div style={{ flex: 'none', display: 'flex', flexDirection: 'column', minHeight: 0, height: 'calc(100vh - 60px)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '13px 28px', borderBottom: '1px solid rgba(0,0,0,.08)', flex: 'none' }}>
        <span style={{ fontFamily: FD, fontSize: 19, fontWeight: 600, letterSpacing: '-0.2px' }}>{t.ds.title}</span>
        <div data-tour="ds-mode" style={{ display: 'inline-grid', gridAutoFlow: 'column', gridAutoColumns: '1fr', border: '1px solid #e0e0e0', borderRadius: 999, overflow: 'hidden', fontSize: 12.5 }}>
          <span onClick={() => app.setDsMode('product')} style={segStyle(!isLabelMode)}>{t.ds.modeProduct}</span>
          <span onClick={() => app.setDsMode('label')} style={segStyle(isLabelMode)}>{t.ds.modeLabel}</span>
        </div>
      </div>
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>

        {/* picker + sections */}
        <div style={{ flex: '0 0 348px', borderRight: '1px solid rgba(0,0,0,.08)', display: 'flex', flexDirection: 'column', gap: 0, overflow: 'auto' }}>
          <div style={{ padding: '18px 20px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span style={sectionLabel}>{t.ds.step1}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid #e0e0e0', borderRadius: 999, padding: '7px 14px', color: '#7a7a7a', fontSize: 12.5 }}>
              <SearchIcon size={12} stroke="currentColor" />
              <input
                value={pickerQuery}
                onChange={e => setPickerQuery(e.target.value)}
                placeholder={t.ds.searchPlaceholder}
                style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 12.5, fontFamily: 'inherit', color: '#1d1d1f', padding: 0 }}
              />
            </div>
          </div>
          {/* Real catalog is 5,000+ models — the picker list scrolls in place so
              steps 2 · SECTIONS and 3 · EXPORT stay visible (3-step flow). */}
          <div style={{ display: 'flex', flexDirection: 'column', flex: 'none', maxHeight: 336, overflowY: 'auto' }}>
            {pickerRows.map(d => {
              const on = dsp?.id === d.id;
              return (
                <span
                  key={d.id}
                  onClick={() => app.setDsId(d.id)}
                  style={{
                    display: 'flex', alignItems: 'center', padding: '10px 20px', borderBottom: '1px solid #f0f0f0', cursor: 'pointer',
                    ...(on ? { background: '#f5f5f7', boxShadow: 'inset 2px 0 0 #0066cc' } : {}),
                  }}
                >
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
                    <span style={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.model}</span>
                    <span style={{ fontSize: 11, color: '#7a7a7a' }}>{d.mfr} · {d.ratedKw} kW · {d.label}</span>
                  </span>
                </span>
              );
            })}
          </div>
          <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 11, borderTop: '1px solid rgba(0,0,0,.08)', marginTop: 8 }}>
            <span style={sectionLabel}>{t.ds.step2}</span>
            {sectionDefs.map(([key, label]) => {
              const on = app.dsSections[key];
              return (
                <span key={key} onClick={() => app.toggleDsSection(key)} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, cursor: 'pointer' }}>
                  <span style={{ flex: 'none', width: 32, height: 19, borderRadius: 999, position: 'relative', display: 'inline-block', transition: 'background .18s', background: on ? '#0066cc' : '#d2d2d7' }}>
                    <span style={{ position: 'absolute', top: 2, width: 15, height: 15, borderRadius: '50%', background: '#fff', transition: 'left .18s', left: on ? 15 : 2 }} />
                  </span>
                  {label}
                </span>
              );
            })}
          </div>
          <div style={{ padding: '14px 20px 22px', display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid rgba(0,0,0,.08)' }}>
            <span style={sectionLabel}>{t.ds.step3}</span>
            {/* Equal-width buttons: flex:1 so they size to the row, not to their
                labels; border-box so the outlined one isn't 2px wider. */}
            <div style={{ display: 'flex', gap: 9 }}>
              <span className="hp-press" onClick={app.printSheet} style={{ ...pillPrimary, flex: 1, textAlign: 'center', padding: '10px 0', boxSizing: 'border-box', border: '1px solid transparent' }}>{t.ds.printBtn}</span>
              <span className="hp-press" onClick={app.downloadSheetPdf} style={{ ...pillSecondary, flex: 1, textAlign: 'center', padding: '10px 0', boxSizing: 'border-box' }}>{t.ds.pdfBtn}</span>
            </div>
            <span style={{ fontSize: 11.5, color: '#7a7a7a', lineHeight: 1.5 }}>{t.ds.exportNote}</span>
          </div>
        </div>

        {/* preview */}
        <div style={{ flex: 1, background: '#f5f5f7', padding: 28, display: 'flex', justifyContent: 'center', overflow: 'auto' }}>
          {dsp && <DataSheetDoc app={app} />}
        </div>
      </div>
    </div>
  );
};
