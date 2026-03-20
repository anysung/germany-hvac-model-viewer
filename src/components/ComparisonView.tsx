
import React from 'react';
import { HeatPump } from '../types';

interface ComparisonViewProps {
  models: HeatPump[];
  labels: any;
  onBack: () => void;
}

/** Format helpers (same logic as ResultsTable) */
const fmt = {
  kw: (v: number | null) => v == null ? '—' : Number.isInteger(v) ? `${v} kW` : `${v.toFixed(1)} kW`,
  cop: (v: number | null) => v == null ? '—' : v.toFixed(2),
  db: (v: number | null) => v == null ? '—' : `${v} dB(A)`,
  kg: (v: number | null) => v == null ? '—' : `${v} kg`,
  dims: (w: number | null, h: number | null, d: number | null) => {
    if (w == null && h == null && d == null) return '—';
    return `${w ?? '?'} × ${h ?? '?'} × ${d ?? '?'} mm`;
  },
  price: (m: HeatPump) => {
    if (m.equipment_price_typical_eur) return `€${m.equipment_price_typical_eur.toLocaleString('de-DE')}`;
    if (m.equipment_price_low_eur && m.equipment_price_high_eur) return `€${m.equipment_price_low_eur.toLocaleString('de-DE')} – €${m.equipment_price_high_eur.toLocaleString('de-DE')}`;
    return '—';
  },
  sgReady: (m: HeatPump) => {
    if (!m.grid_ready) return '—';
    if (m.grid_ready_type) return m.grid_ready_type.replace(/_/g, ' ');
    return 'Yes';
  },
};

export const ComparisonView: React.FC<ComparisonViewProps> = ({ models, labels, onBack }) => {
  const fields: { label: string; getValue: (m: HeatPump) => string; highlight?: string }[] = [
    { label: labels.colManufacturer, getValue: m => m.manufacturer_short || m.manufacturer },
    { label: labels.colInstallType || 'Install Type', getValue: m => m.installation_type || '—' },
    { label: labels.colCapacity, getValue: m => fmt.kw(m.power_35C_kw) },
    { label: labels.colRefrigerant, getValue: m => m.refrigerant || '—' },
    { label: 'COP (A7/W35)', getValue: m => fmt.cop(m.cop_A7W35), highlight: 'blue' },
    { label: 'COP (A2/W35)', getValue: m => fmt.cop(m.cop_A2W35), highlight: 'blue' },
    { label: 'SCOP', getValue: m => fmt.cop(m.scop), highlight: 'blue' },
    { label: labels.colNoise, getValue: m => fmt.db(m.noise_outdoor_dB), highlight: 'blue' },
    { label: labels.colWeight || 'Weight', getValue: m => fmt.kg(m.weight_kg) },
    { label: labels.colDim, getValue: m => fmt.dims(m.width_mm, m.height_mm, m.depth_mm) },
    { label: labels.colPrice, getValue: m => fmt.price(m), highlight: 'green' },
    { label: labels.colSGReady || 'SG Ready', getValue: m => fmt.sgReady(m) },
  ];

  const gridCols = models.length === 2 ? 'grid-cols-3' : 'grid-cols-4';

  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between sticky top-0 z-20">
        <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
          <span>📊</span> {labels.tabComparison}
        </h2>
        <button
          onClick={onBack}
          className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-100 transition-colors shadow-sm"
        >
          ← {labels.backToSelection}
        </button>
      </div>

      {/* Comparison Grid */}
      <div className="overflow-y-auto custom-scrollbar p-6">
        <div className={`grid ${gridCols} gap-4 w-full`}>
          {/* Header Row (Model Names) */}
          <div className="font-bold text-gray-400 uppercase text-xs tracking-wider self-end pb-2 border-b-2 border-gray-200">
            Feature
          </div>
          {models.map((m, i) => (
            <div key={i} className="pb-2 border-b-2 border-blue-500 text-center">
              <div className="text-lg font-bold text-gray-900 break-words">{m.model}</div>
              <div className="text-sm text-gray-500">{m.manufacturer_short || m.manufacturer}</div>
            </div>
          ))}

          {/* Data Rows */}
          {fields.map((field, fi) => (
            <React.Fragment key={fi}>
              <div className="py-3 pr-4 font-semibold text-gray-600 text-sm border-b border-gray-100 flex items-center">
                {field.label}
              </div>
              {models.map((m, i) => {
                const val = field.getValue(m);
                const bgColor = field.highlight === 'blue' ? 'bg-blue-50/50' : field.highlight === 'green' ? 'bg-green-50/50' : '';
                const textColor = field.highlight === 'green' ? 'text-green-700 font-bold' : 'text-gray-800';
                return (
                  <div key={i} className={`py-3 px-2 text-sm ${bgColor} ${textColor} border-b border-gray-100 break-words`}>
                    {val}
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
};
