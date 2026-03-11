import React from 'react';
import { BAFAItem } from '../types';

interface BAFAViewProps { items?: BAFAItem[]; }

export const BAFAView: React.FC<BAFAViewProps> = ({ items = [] }) => {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden max-w-4xl mx-auto">
      <div className="p-6 border-b border-gray-200 bg-gray-50">
        <h3 className="text-lg font-bold text-gray-900">BAFA / KfW Eligible Equipment List</h3>
        <p className="text-sm text-gray-500 mt-1">Official subsidy lists for heat pumps (BEG).</p>
      </div>
      {(!items || items.length === 0) ? (
        <div className="p-8 text-center text-gray-400">No BAFA lists linked yet.</div>
      ) : (
        <ul className="divide-y divide-gray-200">
          {items.map((item) => (
            <li key={item.id} className="hover:bg-gray-50 transition-colors">
              <div className="px-6 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-blue-600">{item.title}</p>
                </div>
                <a href={item.downloadUrl} target="_blank" className="flex-shrink-0 flex items-center gap-1 text-sm font-semibold text-green-700 hover:text-green-900 bg-green-50 px-3 py-2 rounded-lg border border-green-200">Open / Download</a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};