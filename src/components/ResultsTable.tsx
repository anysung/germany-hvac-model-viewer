
import React from 'react';
import { HeatPump } from '../types';

interface ResultsTableProps {
  data: HeatPump[];
  isLoading: boolean;
  labels: any; // Dictionary for translated labels
  isSelectionMode?: boolean;
  selectedModels?: HeatPump[];
  onToggleSelection?: (model: HeatPump) => void;
}

export const ResultsTable: React.FC<ResultsTableProps> = ({ 
  data, 
  isLoading, 
  labels, 
  isSelectionMode = false,
  selectedModels = [],
  onToggleSelection
}) => {
  if (isLoading) {
    return (
      <div className="w-full h-64 flex flex-col items-center justify-center text-gray-500 animate-pulse">
        <svg className="w-10 h-10 mb-3 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <p className="text-sm font-medium">{labels.loading}</p>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="w-full h-64 flex flex-col items-center justify-center text-gray-400 border-2 border-dashed border-gray-200 rounded-lg bg-gray-50">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-10 h-10 mb-2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
        <p>{labels.noResults}</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 shadow-sm bg-white">
      <div className="overflow-x-auto custom-scrollbar">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {isSelectionMode && (
                <th scope="col" className="px-2 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap w-12 sticky left-0 bg-gray-50 z-10">
                  {labels.colSelect || "Select"}
                </th>
              )}
              <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">{labels.colManufacturer}</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">{labels.colUnitType}</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">{labels.colModel}</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">{labels.colCapacity}</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">{labels.colRefrigerant}</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">{labels.colDim}</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-blue-600 uppercase tracking-wider whitespace-nowrap bg-blue-50">COP</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-blue-600 uppercase tracking-wider whitespace-nowrap bg-blue-50">SCOP</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-blue-600 uppercase tracking-wider whitespace-nowrap bg-blue-50">{labels.colNoise}</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">{labels.colOther}</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-green-700 uppercase tracking-wider whitespace-nowrap bg-green-50">{labels.colPrice}</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {data.map((item, index) => {
              const isSelected = selectedModels.some(m => m.model === item.model);
              return (
                <tr key={index} className={`hover:bg-blue-50 transition-colors ${isSelected ? 'bg-blue-50' : ''}`}>
                  {isSelectionMode && (
                    <td className="px-2 py-4 whitespace-nowrap text-center sticky left-0 bg-inherit z-10 border-r border-gray-100">
                      <input 
                        type="checkbox" 
                        checked={isSelected}
                        onChange={() => onToggleSelection && onToggleSelection(item)}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
                      />
                    </td>
                  )}
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="text-sm font-medium text-gray-900">{item.manufacturer}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${item.unitType === 'IDU' ? 'bg-purple-100 text-purple-800' : 'bg-orange-100 text-orange-800'}`}>
                      {item.unitType}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-blue-600 font-semibold">{item.model}</div>
                    <div className="text-xs text-gray-500 mt-1 max-w-[200px] truncate">{item.description}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                    <span className="bg-gray-100 text-gray-800 px-2 py-1 rounded text-xs font-medium">
                      {item.capacityRange}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                    {item.refrigerant === 'R290' ? (
                      <span className="text-green-600 font-bold flex items-center gap-1">
                        🌿 {item.refrigerant}
                      </span>
                    ) : (
                      <span>{item.refrigerant}</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {item.dimensions}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-700 bg-blue-50/30">
                    {item.cop}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-700 bg-blue-50/30">
                    {item.scop}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-700 bg-blue-50/30">
                    {item.noiseLevel}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 min-w-[200px]">
                    {item.others}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-green-700 bg-green-50/30">
                    {item.marketPrice}
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
