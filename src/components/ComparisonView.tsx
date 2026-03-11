
import React from 'react';
import { HeatPump } from '../types';

interface ComparisonViewProps {
  models: HeatPump[];
  labels: any;
  onBack: () => void;
}

export const ComparisonView: React.FC<ComparisonViewProps> = ({ models, labels, onBack }) => {
  // Config for fields to display
  const fields = [
    { key: 'manufacturer', label: labels.colManufacturer },
    { key: 'unitType', label: labels.colUnitType },
    { key: 'model', label: labels.colModel, isHeader: true },
    { key: 'capacityRange', label: labels.colCapacity },
    { key: 'refrigerant', label: labels.colRefrigerant },
    { key: 'dimensions', label: labels.colDim },
    { key: 'cop', label: 'COP', highlight: 'blue' },
    { key: 'scop', label: 'SCOP', highlight: 'blue' },
    { key: 'noiseLevel', label: labels.colNoise, highlight: 'blue' },
    { key: 'description', label: 'Description' },
    { key: 'others', label: labels.colOther },
    { key: 'marketPrice', label: labels.colPrice, highlight: 'green' },
  ];

  const gridCols = models.length === 2 ? 'grid-cols-3' : 'grid-cols-4'; // 1 for label + models

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
              <div className="text-sm text-gray-500">{m.manufacturer}</div>
            </div>
          ))}

          {/* Data Rows */}
          {fields.map((field) => {
            if (field.key === 'model') return null; // Already shown in header
            
            return (
              <React.Fragment key={field.key}>
                {/* Label Column */}
                <div className="py-3 pr-4 font-semibold text-gray-600 text-sm border-b border-gray-100 flex items-center">
                  {field.label}
                </div>
                
                {/* Model Data Columns */}
                {models.map((m, i) => {
                  const val = m[field.key as keyof HeatPump];
                  const bgColor = field.highlight === 'blue' ? 'bg-blue-50/50' : field.highlight === 'green' ? 'bg-green-50/50' : '';
                  const textColor = field.highlight === 'green' ? 'text-green-700 font-bold' : 'text-gray-800';
                  
                  return (
                    <div key={i} className={`py-3 px-2 text-sm ${bgColor} ${textColor} border-b border-gray-100 break-words`}>
                      {val || '-'}
                    </div>
                  );
                })}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
};
