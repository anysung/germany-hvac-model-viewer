import React from 'react';

interface FilterBadgeProps {
  label: string;
  isActive: boolean;
  onClick: () => void;
}

export const FilterBadge: React.FC<FilterBadgeProps> = ({ label, isActive, onClick }) => {
  return (
    <button
      onClick={onClick}
      className={`
        px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 border
        ${isActive 
          ? 'bg-blue-600 text-white border-blue-600 shadow-md transform scale-105' 
          : 'bg-white text-gray-600 border-gray-200 hover:border-blue-400 hover:text-blue-500'
        }
      `}
    >
      {label}
    </button>
  );
};