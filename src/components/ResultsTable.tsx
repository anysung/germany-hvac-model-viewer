/**
 * ResultsTable — Display Rules (v4)
 *
 * STICKY HEADER : thead row stays fixed on vertical scroll (top-0 z-30)
 * STICKY COLS   : Manufacturer + Type + Model fixed on horizontal scroll (z-20/z-40)
 * SCROLL BAR    : Horizontal progress bar + arrow buttons at table top-right
 *
 * Column order: Manufacturer | Type | Model | Capacity | Refrigerant |
 *               Refrig. Amt (residential only) | COP | SCOP | Noise |
 *               Weight | Dimensions | Price | [Commercial cols] | Grid Ready
 *
 * MODEL TRUNCATION : max MODEL_MAX_CHARS (25) chars, full name on hover (title attribute)
 */

import React, { useRef, useState, useEffect, useCallback, useLayoutEffect } from 'react';
import { HeatPump } from '../types';
import { getDisplayName, getInstallationTypeDisplay, fmtGridReady, getDisplayPrice } from '../utils/displayHelpers';

interface ResultsTableProps {
  data: HeatPump[];
  isLoading: boolean;
  labels: any;
  isSelectionMode?: boolean;
  selectedModels?: HeatPump[];
  onToggleSelection?: (model: HeatPump) => void;
  segment?: 'residential' | 'commercial';
}

// ─── Constants ───────────────────────────────────────────────────────────────

/** Max visible characters for model name before truncation (spaces count). */
const MODEL_MAX_CHARS = 25;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Format a numeric kW value for display */
function fmtKw(v: number | null): string {
  if (v == null) return '—';
  return Number.isInteger(v) ? `${v} kW` : `${v.toFixed(1)} kW`;
}

/** Format a COP/SCOP number */
function fmtCop(v: number | null): string {
  if (v == null) return '—';
  return v.toFixed(2);
}

/** Format noise dB */
function fmtDb(v: number | null): string {
  if (v == null) return '—';
  return `${v} dB(A)`;
}

/** Format weight */
function fmtWeight(v: number | null): string {
  if (v == null) return '—';
  return `${v} kg`;
}

/** Format refrigerant amount in kg */
function fmtRefrigerantAmt(v: number | null): string {
  if (v == null) return '—';
  return `${v} kg`;
}

/** Format dimensions from mm fields */
function fmtDimensions(w: number | null, h: number | null, d: number | null): string {
  if (w == null && h == null && d == null) return '—';
  const wStr = w != null ? `${w}` : '?';
  const hStr = h != null ? `${h}` : '?';
  const dStr = d != null ? `${d}` : '?';
  return `${wStr} × ${hStr} × ${dStr} mm`;
}

/** Format price using canonical display fields from dataset, with fallback to raw fields */
function fmtPrice(m: HeatPump): [string, string | null] {
  const dp = getDisplayPrice(
    m.equipment_price_low_eur, m.equipment_price_typical_eur, m.equipment_price_high_eur,
    m.equipment_price_display_eur, m.equipment_price_display_low_eur, m.equipment_price_display_high_eur,
  );
  return [dp.main, dp.range];
}

/** Two-line cell component */
const TwoLine: React.FC<{ l1: React.ReactNode; l2?: string | null; l1Cls?: string }> = ({ l1, l2, l1Cls = '' }) => (
  <div className="text-center leading-tight">
    <div className={l1Cls}>{l1}</div>
    {l2 && <div className="text-[11px] text-gray-400 mt-0.5">{l2}</div>}
  </div>
);

// ─── Component ────────────────────────────────────────────────────────────────

/** Format market segment for display */
function fmtSegment(raw: string | null): string {
  if (!raw) return '—';
  if (raw === 'light_commercial') return 'Light';
  if (raw === 'commercial_project') return 'Project & Commercial';
  if (raw === 'residential_core') return 'Residential';
  return raw.replace(/_/g, ' ');
}

/** Format power control for display */
function fmtPowerControl(raw: string | null): string {
  if (!raw) return '—';
  const map: Record<string, string> = {
    DREHZAHLREGELUNG: 'Inverter',
    LEISTUNGSSTUFEN: 'Staged',
    DIGITAL_SCROLL: 'Digital Scroll',
    INVERTER: 'Inverter',
    KEINE: '—',
    SONSTIGE: 'Other',
  };
  return map[raw] || raw;
}

export const ResultsTable: React.FC<ResultsTableProps> = ({
  data, isLoading, labels,
  isSelectionMode = false,
  selectedModels = [],
  onToggleSelection,
  segment = 'residential',
}) => {
  const isCommercial = segment === 'commercial';
  const scrollRef = useRef<HTMLDivElement>(null);
  const mfrThRef  = useRef<HTMLTableCellElement>(null);
  const typeThRef = useRef<HTMLTableCellElement>(null);

  const [canScrollLeft,  setCanScrollLeft]  = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [scrollPct,      setScrollPct]      = useState(0);
  const [typeLeft,  setTypeLeft]  = useState(0);
  const [modelLeft, setModelLeft] = useState(0);

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft < max - 4);
    setScrollPct(max > 0 ? (el.scrollLeft / max) * 100 : 0);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    checkScroll();
    el.addEventListener('scroll', checkScroll, { passive: true });
    const ro = new ResizeObserver(checkScroll);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', checkScroll); ro.disconnect(); };
  }, [checkScroll, data]);

  useLayoutEffect(() => {
    const mfr  = mfrThRef.current;
    const type = typeThRef.current;
    if (mfr && type) {
      setTypeLeft(mfr.offsetWidth);
      setModelLeft(mfr.offsetWidth + type.offsetWidth);
    }
  }, [data]);

  const scroll = (dir: 'left' | 'right') => {
    scrollRef.current?.scrollBy({ left: dir === 'left' ? -280 : 280, behavior: 'smooth' });
  };

  if (isLoading) return (
    <div className="w-full h-64 flex flex-col items-center justify-center text-gray-500 animate-pulse">
      <svg className="w-10 h-10 mb-3 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
      </svg>
      <p className="text-sm font-medium">{labels.loading}</p>
    </div>
  );

  if (data.length === 0) return (
    <div className="w-full h-64 flex flex-col items-center justify-center text-gray-400 border-2 border-dashed border-gray-200 rounded-lg bg-gray-50">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-10 h-10 mb-2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"/>
      </svg>
      <p>{labels.noResults}</p>
    </div>
  );

  // Shared styles
  const TH_BASE = 'px-2 py-1.5 text-center text-[12px] font-bold uppercase tracking-wide whitespace-nowrap bg-gray-50';
  const TD_BASE = 'px-2 py-1 text-[13px] text-center align-middle';

  return (
    <div className="relative rounded-lg border border-gray-200 shadow-sm bg-white overflow-hidden">

      {/* ── Scroll Control Bar ──────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-3 py-1 bg-gray-100 border-b border-gray-200 select-none">
        <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-400 rounded-full transition-all duration-150"
            style={{ width: `${scrollPct}%` }}
          />
        </div>
        <button
          onClick={() => scroll('left')}
          disabled={!canScrollLeft}
          className={`flex items-center justify-center w-6 h-6 rounded transition-colors ${canScrollLeft ? 'text-blue-600 hover:bg-blue-100' : 'text-gray-300 cursor-default'}`}
          aria-label="Scroll left"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7"/>
          </svg>
        </button>
        <button
          onClick={() => scroll('right')}
          disabled={!canScrollRight}
          className={`flex items-center justify-center gap-0.5 h-6 px-2 rounded text-[10px] font-semibold transition-colors ${
            canScrollRight
              ? 'text-white bg-blue-500 hover:bg-blue-600 shadow-sm'
              : 'text-gray-300 bg-gray-100 cursor-default'
          }`}
          aria-label="Scroll right"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7"/>
          </svg>
          {canScrollRight && <span>more</span>}
        </button>
      </div>

      {/* Right-edge fade gradient */}
      {canScrollRight && (
        <div className="pointer-events-none absolute right-0 top-[32px] bottom-0 w-12 bg-gradient-to-l from-white/70 to-transparent z-10" />
      )}

      {/* ── Table ───────────────────────────────────────────────────── */}
      <div ref={scrollRef} className="overflow-x-auto custom-scrollbar overflow-y-auto max-h-[70vh]">
        <table className="min-w-full divide-y divide-gray-100" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>

          {/* ── STICKY HEADER ─────────────────────────────────────── */}
          <thead>
            <tr className="border-b border-gray-200">
              {isSelectionMode && (
                <th className={`${TH_BASE} w-8 sticky top-0 left-0 z-40`}>{labels.colSelect || ''}</th>
              )}
              {/* Manufacturer — sticky top + left */}
              <th ref={mfrThRef}
                className={`${TH_BASE} text-center text-gray-600 sticky top-0 left-0 z-40 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]`}>
                {labels.colManufacturer}
              </th>
              {/* Type — sticky top + left */}
              <th ref={typeThRef}
                style={{ left: typeLeft }}
                className={`${TH_BASE} text-gray-500 sticky top-0 z-40 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)]`}>
                {labels.colInstallType || 'Type'}
              </th>
              {/* Model — sticky top + left */}
              <th style={{ left: modelLeft, maxWidth: '200px' }}
                className={`${TH_BASE} text-gray-500 text-left pl-3 sticky top-0 z-40 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.05)]`}>
                {labels.colModel}
              </th>
              {/* Scrollable columns */}
              <th className={`${TH_BASE} text-gray-500 sticky top-0 z-30`}>{labels.colCapacity}</th>
              <th className={`${TH_BASE} text-gray-500 sticky top-0 z-30`}>{labels.colRefrigerant}</th>
              {!isCommercial && (
                <th className={`${TH_BASE} text-gray-500 sticky top-0 z-30`}>{labels.colRefrigerantAmt || 'Refrig. Amt'}</th>
              )}
              <th className={`${TH_BASE} text-blue-600 bg-blue-50 sticky top-0 z-30`}>COP</th>
              <th className={`${TH_BASE} text-blue-600 bg-blue-50 sticky top-0 z-30`}>SCOP</th>
              <th className={`${TH_BASE} text-blue-600 bg-blue-50 sticky top-0 z-30`}>{labels.colNoise}</th>
              <th className={`${TH_BASE} text-purple-600 bg-purple-50 sticky top-0 z-30`}>{labels.colWeight || 'Weight'}</th>
              <th className={`${TH_BASE} text-gray-500 sticky top-0 z-30`}>{labels.colDim}</th>
              <th className={`${TH_BASE} text-green-700 bg-green-50 sticky top-0 z-30`}>{labels.colPrice}</th>
              {isCommercial && (
                <>
                  <th className={`${TH_BASE} text-orange-600 bg-orange-50 sticky top-0 z-30`}>{labels.colMarketSegment || 'Segment'}</th>
                  <th className={`${TH_BASE} text-gray-500 sticky top-0 z-30`}>{labels.colPowerControl || 'Drive'}</th>
                  <th className={`${TH_BASE} text-gray-500 sticky top-0 z-30`}>{labels.colNumCompressors || 'Compr.'}</th>
                </>
              )}
              <th className={`${TH_BASE} text-teal-600 bg-teal-50 sticky top-0 z-30 px-1`}>{labels.colGridReady || 'Grid Ready'}</th>
            </tr>
          </thead>

          {/* ── BODY ──────────────────────────────────────────────── */}
          <tbody className="bg-white divide-y divide-gray-100">
            {data.map((item, index) => {
              const isSelected = selectedModels.some(m => m.model === item.model && m.manufacturer === item.manufacturer);
              const rowBg = isSelected ? 'bg-blue-50' : index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50';

              const modelStr = item.model || '';
              const modelTxt = modelStr.length > MODEL_MAX_CHARS ? modelStr.slice(0, MODEL_MAX_CHARS) + '…' : modelStr;

              // Format fields
              const capacity = fmtKw(item.power_35C_kw);
              const capacity2 = item.power_55C_kw ? `(55°C: ${fmtKw(item.power_55C_kw)})` : null;
              const cop = fmtCop(item.cop_A7W35);
              const cop2 = item.cop_A2W35 ? `A2/W35: ${fmtCop(item.cop_A2W35)}` : null;
              const scop = fmtCop(item.scop);
              const noise = fmtDb(item.noise_outdoor_dB);
              const noise2 = item.noise_indoor_dB ? `Indoor: ${fmtDb(item.noise_indoor_dB)}` : null;
              const weight = fmtWeight(item.weight_kg);
              const dims = fmtDimensions(item.width_mm, item.height_mm, item.depth_mm);
              const [price1, price2] = fmtPrice(item);
              const gridReady = fmtGridReady(item.grid_ready, item.grid_ready_type);

              // Installation type badge — Monoblock / Split
              const typeLabel = getInstallationTypeDisplay(item);
              const typeBadgeCls = typeLabel === 'Monoblock'
                ? 'bg-orange-100 text-orange-800'
                : typeLabel === 'Split'
                  ? 'bg-purple-100 text-purple-800'
                  : 'bg-gray-100 text-gray-600';

              const stickyBg = 'bg-white';

              return (
                <tr key={`${item.bafa_id}-${index}`} className={`hover:bg-blue-50/60 transition-colors ${rowBg}`}>
                  {isSelectionMode && (
                    <td className={`${TD_BASE} sticky left-0 z-20 ${stickyBg} border-r border-gray-100`}>
                      <input type="checkbox" checked={isSelected}
                        onChange={() => onToggleSelection && onToggleSelection(item)}
                        className="w-3.5 h-3.5 text-blue-600 border-gray-300 rounded cursor-pointer"/>
                    </td>
                  )}

                  {/* Manufacturer — sticky */}
                  <td className={`px-2 py-1 text-[13px] font-semibold text-gray-900 text-center whitespace-nowrap sticky left-0 z-20 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)] ${stickyBg}`}>
                    {getDisplayName(item)}
                  </td>

                  {/* Type — sticky */}
                  <td style={{ left: typeLeft }}
                    className={`${TD_BASE} whitespace-nowrap sticky z-20 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.04)] ${stickyBg}`}>
                    <span className={`px-1.5 py-0.5 inline-flex text-[11px] leading-4 font-bold rounded-full ${typeBadgeCls}`}>
                      {typeLabel}
                    </span>
                  </td>

                  {/* Model — sticky */}
                  <td style={{ left: modelLeft, maxWidth: '200px' }}
                    className={`pl-3 pr-2 py-1 text-left align-middle sticky z-20 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.03)] ${stickyBg}`}>
                    <div className="text-[13px] text-blue-600 font-semibold whitespace-nowrap overflow-hidden text-ellipsis" title={item.model}>
                      {modelTxt}
                    </div>
                  </td>

                  {/* Capacity */}
                  <td className={TD_BASE}>
                    <TwoLine
                      l1={<span className="bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded text-[12px] font-medium whitespace-nowrap">{capacity}</span>}
                      l2={capacity2}
                    />
                  </td>

                  {/* Refrigerant */}
                  <td className={`${TD_BASE} whitespace-nowrap`}>
                    {(item.refrigerant || '').includes('R290')
                      ? <span className="text-green-600 font-bold text-[11px]">🌿 {item.refrigerant}</span>
                      : <span className="text-gray-600">{item.refrigerant || '—'}</span>}
                  </td>

                  {/* Refrigerant Amount — residential only */}
                  {!isCommercial && (
                    <td className={`${TD_BASE} whitespace-nowrap`}>
                      <span className="text-[12px] text-gray-600">{fmtRefrigerantAmt(item.refrigerant_amount_kg)}</span>
                    </td>
                  )}

                  {/* COP */}
                  <td className={`${TD_BASE} bg-blue-50/30`}>
                    <TwoLine l1={cop} l2={cop2} l1Cls="font-medium text-gray-700" />
                  </td>

                  {/* SCOP */}
                  <td className={`${TD_BASE} bg-blue-50/30`}>
                    <span className="font-medium text-gray-700">{scop}</span>
                  </td>

                  {/* Noise */}
                  <td className={`${TD_BASE} bg-blue-50/30`}>
                    <TwoLine l1={noise} l2={noise2} l1Cls="font-medium text-gray-700" />
                  </td>

                  {/* Weight */}
                  <td className={`${TD_BASE} bg-purple-50/30`}>
                    <span className="text-[13px] font-medium text-purple-700 whitespace-nowrap">{weight}</span>
                  </td>

                  {/* Dimensions (moved right of Weight) */}
                  <td className={TD_BASE}>
                    <span className="text-gray-600 whitespace-nowrap text-[12px]">{dims}</span>
                  </td>

                  {/* Price */}
                  <td className={`${TD_BASE} bg-green-50/30`}>
                    <TwoLine l1={price1} l2={price2} l1Cls="font-bold text-green-700 whitespace-nowrap" />
                  </td>

                  {/* Commercial-only columns */}
                  {isCommercial && (
                    <>
                      {/* Market Segment */}
                      <td className={`${TD_BASE} bg-orange-50/30`}>
                        <span className={`px-1.5 py-0.5 inline-flex text-[11px] leading-4 font-bold rounded-full ${
                          item.market_segment === 'commercial_project'
                            ? 'bg-orange-100 text-orange-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}>
                          {fmtSegment(item.market_segment)}
                        </span>
                      </td>
                      {/* Power Control */}
                      <td className={TD_BASE}>
                        <span className="text-[12px] text-gray-600">{fmtPowerControl((item as any).power_control)}</span>
                      </td>
                      {/* Compressors */}
                      <td className={TD_BASE}>
                        <span className="text-[12px] text-gray-600">{(item as any).num_compressors ?? '—'}</span>
                      </td>
                    </>
                  )}

                  {/* Grid Ready */}
                  <td className={`${TD_BASE} bg-teal-50/30 px-1`}>
                    <span className={`text-[11px] font-medium whitespace-nowrap ${item.grid_ready ? 'text-teal-700' : 'text-gray-400'}`}>
                      {gridReady}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
