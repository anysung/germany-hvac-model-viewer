import React, { useState, useEffect, useCallback } from 'react';
import { fetchHeatPumps } from '../services/geminiService';
import { logActivity } from '../services/authService';
import { HeatPump, Manufacturer, CapacityRange, UnitType, FetchState, User, Language, AppMode, HeatPumpDatabase } from '../types';
import { FilterBadge } from './FilterBadge';
import { ResultsTable } from './ResultsTable';
import { NewsView } from './NewsView';
import { PolicyView } from './PolicyView';
import { BAFAView } from './BAFAView';
import { ComparisonView } from './ComparisonView'; // New Import
import { translations } from '../translations';

interface HeatPumpAppProps {
  user: User;
  onLogout: () => void;
  dbData: HeatPumpDatabase | null; 
  lastUpdated: string | null;
  language: Language;
  appMode: AppMode;
}

// --- Helper Functions for Numeric Capacity Parsing ---

const getNumericBounds = (rangeLabel: string): { min: number, max: number } | null => {
  const numbers = rangeLabel.match(/(\d+(\.\d+)?)/g)?.map(Number);
  if (numbers && numbers.length >= 2) {
    return { min: numbers[0], max: numbers[1] };
  }
  return null;
};

const extractCapacityValue = (capacityString: string): number | null => {
  if (!capacityString) return null;
  const kwMatch = capacityString.match(/(\d+(\.\d+)?)\s*kW/i);
  if (kwMatch) return parseFloat(kwMatch[1]);
  const anyNumMatch = capacityString.match(/(\d+(\.\d+)?)/);
  if (anyNumMatch) return parseFloat(anyNumMatch[1]);
  return null;
};

type Tab = 'SEARCH' | 'COMPARISON' | 'NEWS' | 'POLICY' | 'BAFA';

export const HeatPumpApp: React.FC<HeatPumpAppProps> = ({ user, onLogout, dbData, lastUpdated, language, appMode }) => {
  // Navigation State
  const [activeTab, setActiveTab] = useState<Tab>('SEARCH');

  // Search Data State
  const [data, setData] = useState<HeatPump[]>(dbData?.products || []);
  const [status, setStatus] = useState<FetchState>('idle');
  
  // Comparison State
  const [selectedComparisonModels, setSelectedComparisonModels] = useState<HeatPump[]>([]);
  const [isComparing, setIsComparing] = useState(false);

  // Filters
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);
  const [selectedRange, setSelectedRange] = useState<string | null>(null);
  const [selectedUnitType, setSelectedUnitType] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [localSearchInput, setLocalSearchInput] = useState('');

  const t = translations[language];

  // Update data when DB loads or changes
  useEffect(() => {
    if (dbData?.products && appMode === 'DATABASE') {
      setData(dbData.products);
      setStatus('success');
    }
  }, [dbData, appMode]);

  // Live Search Logic
  const executeLiveSearch = useCallback(async () => {
    setStatus('loading');
    try {
      logActivity(user.id, 'SEARCH_API', `Query: ${searchQuery}, Brand: ${selectedBrand}, Lang: ${language}`);
      const results = await fetchHeatPumps(selectedBrand, selectedRange, selectedUnitType, searchQuery, language);
      setData(results);
      setStatus('success');
    } catch (error) {
      console.error(error);
      setStatus('error');
    }
  }, [selectedBrand, selectedRange, selectedUnitType, searchQuery, user.id, language]);

  // Database Filtering Logic
  const executeDbSearch = useCallback(() => {
    if (dbData?.products) {
      let filtered = [...dbData.products];
      if (selectedBrand) filtered = filtered.filter((item: HeatPump) => item.manufacturer === selectedBrand);
      
      if (selectedRange) {
        const bounds = getNumericBounds(selectedRange);
        if (bounds) {
          filtered = filtered.filter((item: HeatPump) => {
            const val = extractCapacityValue(item.capacityRange);
            if (val === null) return false;
            return val >= bounds.min && val <= bounds.max;
          });
        } else {
          filtered = filtered.filter((item: HeatPump) => item.capacityRange.includes(selectedRange));
        }
      }

      if (selectedUnitType) {
        filtered = filtered.filter((item: HeatPump) => item.unitType === (selectedUnitType === UnitType.IDU ? 'IDU' : 'ODU'));
      }

      if (searchQuery) {
        const lowerQ = searchQuery.toLowerCase();
        filtered = filtered.filter((item: HeatPump) => 
          item.model.toLowerCase().includes(lowerQ) || 
          item.manufacturer.toLowerCase().includes(lowerQ)
        );
      }
      
      if (searchQuery || selectedBrand || selectedRange) {
         logActivity(user.id, 'FILTER_DB', `Brand: ${selectedBrand}, Range: ${selectedRange}, Q: ${searchQuery}`);
      }

      setData(filtered);
      setStatus('success');
    } else {
      setData([]);
    }
  }, [dbData, selectedBrand, selectedRange, selectedUnitType, searchQuery, user.id]);

  // Trigger Search
  useEffect(() => {
    // Search triggers for both SEARCH and COMPARISON tabs (to populate list)
    if (activeTab === 'SEARCH' || activeTab === 'COMPARISON') {
      if (appMode === 'LIVE_API') {
        if (selectedBrand || selectedRange || selectedUnitType || searchQuery) executeLiveSearch();
      } else {
        executeDbSearch();
      }
    }
  }, [appMode, executeLiveSearch, executeDbSearch, selectedBrand, selectedRange, selectedUnitType, searchQuery, activeTab]);

  const onSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchQuery(localSearchInput);
  };

  // Toggle Selection for Comparison
  const toggleComparisonSelection = (model: HeatPump) => {
    if (selectedComparisonModels.some(m => m.model === model.model)) {
      // Remove
      setSelectedComparisonModels(prev => prev.filter(m => m.model !== model.model));
    } else {
      // Add
      if (selectedComparisonModels.length >= 3) {
        alert(t.compareErrorMax || "Maximum 3 models can be compared.");
        return;
      }
      setSelectedComparisonModels(prev => [...prev, model]);
    }
  };

  const startComparison = () => {
    if (selectedComparisonModels.length < 2) {
      alert(t.compareErrorMin || "Select at least 2 models.");
      return;
    }
    setIsComparing(true);
    logActivity(user.id, 'COMPARE_START', `Comparing ${selectedComparisonModels.length} items`);
  };

  const tabs: {id: Tab, label: string, icon: string}[] = [
    { id: 'SEARCH', label: t.searchPlaceholder?.includes('suche') ? 'Produktsuche' : 'Product Search', icon: '🔍' },
    { id: 'COMPARISON', label: t.tabComparison, icon: '⚖️' },
    { id: 'NEWS', label: t.searchPlaceholder?.includes('suche') ? 'Marktnachrichten' : 'Market News', icon: '📰' },
    { id: 'POLICY', label: t.searchPlaceholder?.includes('suche') ? 'Vorschriften' : 'Regulations', icon: '📜' },
    { id: 'BAFA', label: 'BAFA / KfW', icon: '💶' },
  ];

  return (
    <div className="flex flex-col h-full font-sans bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-[96%] mx-auto px-4 sm:px-6 lg:px-8 py-4 lg:pr-32">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-gray-900 flex items-center gap-2">
                <span className="text-3xl">🇩🇪</span>
                German Heat Pump Database
              </h1>
              <div className="flex items-center gap-2 mt-1">
                {appMode === 'DATABASE' ? (
                  dbData ? (
                    <div className="flex flex-col">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 w-fit">
                        ⚡ {t.dbMode} 
                      </span>
                      <span className="text-[10px] text-gray-400 mt-0.5">
                        Updated: {lastUpdated ? new Date(lastUpdated).toLocaleDateString() : 'Unknown'}
                      </span>
                    </div>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
                      ⚠️ Database Not Found
                    </span>
                  )
                ) : (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 animate-pulse">
                    📡 {t.liveMode}
                  </span>
                )}
              </div>
            </div>
            
            <div className="flex items-center gap-3 w-full md:w-auto">
              <form onSubmit={onSearchSubmit} className="flex-grow md:w-80 relative">
                <input
                  type="text"
                  placeholder={t.searchPlaceholder}
                  className="w-full pl-9 pr-4 py-2 rounded-lg border border-gray-300 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                  value={localSearchInput}
                  onChange={(e) => setLocalSearchInput(e.target.value)}
                />
                <svg className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </form>
              
              <div className="flex items-center gap-2 border-l pl-3 ml-1">
                 <div className="text-right hidden sm:block">
                    <div className="text-xs font-bold text-gray-700">{user.firstName} {user.lastName}</div>
                    <div className="text-xs text-gray-500">{user.companyType}</div>
                 </div>
                 <button onClick={onLogout} className="text-gray-500 hover:text-red-600 p-2 rounded-full hover:bg-gray-100 transition-colors">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                 </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-grow w-full bg-gray-50">
        {/* Navigation Bar */}
        <div className="bg-white border-b border-gray-200 shadow-sm sticky top-[73px] z-20">
          <div className="max-w-[96%] mx-auto px-4 sm:px-6 lg:px-8">
            <nav className="flex space-x-8 overflow-x-auto" aria-label="Tabs">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => { setActiveTab(tab.id); setIsComparing(false); }}
                  className={`
                    whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2 transition-colors duration-200
                    ${activeTab === tab.id
                      ? 'border-blue-600 text-blue-700'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}
                  `}
                >
                  <span className="text-lg">{tab.icon}</span>
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>
        </div>

        <div className="max-w-[96%] mx-auto px-4 sm:px-6 lg:px-8 py-6">
          
          {/* SHARED FILTERS (Visible on SEARCH and COMPARISON when not comparing) */}
          {(activeTab === 'SEARCH' || (activeTab === 'COMPARISON' && !isComparing)) && (
            <>
              {/* Selected Models Area (Comparison Tab Only) */}
              {activeTab === 'COMPARISON' && (
                <div className="mb-6 bg-indigo-50 border border-indigo-100 rounded-xl p-4 shadow-sm animate-fade-in">
                  <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                    <div className="flex-grow">
                      <h3 className="text-sm font-bold text-indigo-900 mb-2 flex items-center gap-2">
                        <span>⚖️</span> {t.selectedModels} ({selectedComparisonModels.length}/3)
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {selectedComparisonModels.length === 0 && <span className="text-sm text-gray-400 italic">Select models from the list below to compare.</span>}
                        {selectedComparisonModels.map((m, idx) => (
                          <div key={idx} className="bg-white border border-indigo-200 text-indigo-800 px-3 py-1.5 rounded-lg text-sm shadow-sm flex items-center gap-2">
                            <span className="font-semibold">{m.model}</span>
                            <button onClick={() => toggleComparisonSelection(m)} className="text-indigo-400 hover:text-red-500">×</button>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="flex-shrink-0 flex gap-2">
                      <button 
                        onClick={() => setSelectedComparisonModels([])} 
                        className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700"
                        disabled={selectedComparisonModels.length === 0}
                      >
                        {t.clearSelection}
                      </button>
                      <button 
                        onClick={startComparison}
                        disabled={selectedComparisonModels.length < 2}
                        className={`px-6 py-2 rounded-lg font-bold text-sm shadow-md transition-transform ${selectedComparisonModels.length >= 2 ? 'bg-indigo-600 text-white hover:bg-indigo-700 hover:scale-105' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}`}
                      >
                        {t.startComparison}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Filters */}
              <section className="mb-6 space-y-4">
                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">{t.filterManufacturer}</h3>
                  <div className="flex flex-wrap gap-2">
                    {(Object.values(Manufacturer) as string[]).map((brand) => (
                      <FilterBadge key={brand} label={brand} isActive={selectedBrand === brand} onClick={() => setSelectedBrand(selectedBrand === brand ? null : brand)} />
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">{t.filterCapacity}</h3>
                    <div className="flex flex-wrap gap-2">
                      {(Object.values(CapacityRange) as string[]).map((range) => (
                        <FilterBadge key={range} label={range} isActive={selectedRange === range} onClick={() => setSelectedRange(selectedRange === range ? null : range)} />
                      ))}
                    </div>
                  </div>
                  <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">{t.filterUnitType}</h3>
                    <div className="flex flex-wrap gap-2">
                      {(Object.values(UnitType) as string[]).map((type) => (
                        <FilterBadge key={type} label={type} isActive={selectedUnitType === type} onClick={() => setSelectedUnitType(selectedUnitType === type ? null : type)} />
                      ))}
                    </div>
                  </div>
                </div>
              </section>

              {/* Active Filters Display */}
              {(selectedBrand || selectedRange || selectedUnitType || searchQuery) && (
                <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-gray-600">
                  <span className="font-semibold text-gray-700">{t.activeFilters}:</span>
                  {searchQuery && <span className="bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded border border-yellow-200">"{searchQuery}"</span>}
                  {selectedBrand && <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded border border-blue-200">{selectedBrand}</span>}
                  <button onClick={() => { setSelectedBrand(null); setSelectedRange(null); setSelectedUnitType(null); setSearchQuery(''); setLocalSearchInput(''); }} className="ml-auto text-red-500 hover:text-red-700 text-xs font-medium hover:underline">{t.clearAll}</button>
                </div>
              )}

              {/* Results Table (with Selection if in Comparison Tab) */}
              <ResultsTable 
                data={data} 
                isLoading={status === 'loading'} 
                labels={t} 
                isSelectionMode={activeTab === 'COMPARISON'}
                selectedModels={selectedComparisonModels}
                onToggleSelection={toggleComparisonSelection}
              />
            </>
          )}

          {/* Comparison View (Only visible when isComparing is true) */}
          {activeTab === 'COMPARISON' && isComparing && (
            <ComparisonView 
              models={selectedComparisonModels} 
              labels={t} 
              onBack={() => setIsComparing(false)} 
            />
          )}

          {activeTab === 'NEWS' && <NewsView items={dbData?.newsFeed} />}
          {activeTab === 'POLICY' && <PolicyView items={dbData?.policySummary} />}
          {activeTab === 'BAFA' && <BAFAView items={dbData?.bafaListLinks} />}
        </div>
      </main>
      
      <footer className="bg-gray-50 border-t border-gray-200 py-6 px-4 text-center">
        <p className="text-[10px] text-gray-400 leading-relaxed max-w-4xl mx-auto">{t.legalDisclaimer}</p>
        <p className="text-[10px] text-gray-400 mt-2">© {new Date().getFullYear()} SYS Corporation. All Rights Reserved.</p>
      </footer>
    </div>
  );
};