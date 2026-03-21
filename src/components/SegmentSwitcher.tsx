/**
 * SegmentSwitcher — Shared Residential / Commercial tab switcher.
 *
 * Used across Product Search, Comparison, and Data Sheet pages
 * for consistent segment selection with clear active state.
 */

import React from 'react';

interface SegmentSwitcherProps {
  segment: 'residential' | 'commercial';
  onSwitch: (seg: 'residential' | 'commercial') => void;
  residentialLabel: string;
  commercialLabel: string;
  /** Optional product count to display on the right */
  productCount?: number;
  /** Optional count label suffix (e.g. "residential products") */
  countLabel?: string;
}

export const SegmentSwitcher: React.FC<SegmentSwitcherProps> = ({
  segment, onSwitch, residentialLabel, commercialLabel, productCount, countLabel,
}) => {
  const isResidential = segment === 'residential';

  return (
    <div className="mb-2 flex items-end gap-0">
      <button
        onClick={() => onSwitch('residential')}
        className={`
          px-5 py-2 rounded-t-lg text-sm font-bold transition-all duration-200 border border-b-0 relative
          ${isResidential
            ? 'bg-green-500 text-white border-green-500 shadow-md z-10'
            : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200 hover:text-gray-700'
          }
        `}
      >
        🏠 {residentialLabel}
      </button>
      <button
        onClick={() => onSwitch('commercial')}
        className={`
          px-5 py-2 rounded-t-lg text-sm font-bold transition-all duration-200 border border-b-0 relative
          ${!isResidential
            ? 'bg-orange-500 text-white border-orange-500 shadow-md z-10'
            : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200 hover:text-gray-700'
          }
        `}
      >
        🏢 {commercialLabel}
      </button>
      <div className="flex-1 border-b border-gray-200 self-end" />
      {productCount != null && countLabel && (
        <div className="self-end mb-0.5 text-[11px] text-gray-400 font-medium ml-2">
          {productCount.toLocaleString()} {countLabel}
        </div>
      )}
    </div>
  );
};
