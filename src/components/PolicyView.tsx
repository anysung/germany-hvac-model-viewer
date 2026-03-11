import React from 'react';
import { PolicyItem } from '../types';

interface PolicyViewProps { items?: PolicyItem[]; }

export const PolicyView: React.FC<PolicyViewProps> = ({ items = [] }) => {
  if (!items || items.length === 0) return <div className="p-8 text-center text-gray-400 bg-white rounded-lg border">No policy documents available.</div>;

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      {items.map((policy) => (
        <div key={policy.id} className="bg-white rounded-lg shadow-sm border-l-4 border-indigo-500 p-6 hover:bg-gray-50 transition-colors">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
            <div className="flex-grow">
              <div className="flex items-center gap-3 mb-2">
                <span className="px-2 py-1 bg-indigo-100 text-indigo-800 text-xs font-bold rounded uppercase tracking-wide">{policy.category}</span>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">{policy.title}</h3>
              <p className="text-gray-600 text-sm leading-relaxed">{policy.summary}</p>
            </div>
            <a href={policy.sourceUrl} target="_blank" className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50">View Source</a>
          </div>
        </div>
      ))}
    </div>
  );
};