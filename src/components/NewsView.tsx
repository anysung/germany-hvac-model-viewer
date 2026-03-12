import React from 'react';
import { NewsItem } from '../types';

interface NewsViewProps { items?: NewsItem[]; }

// Curated open-source images (Unsplash) — mirrors the Cloud Function keyword rules.
// Rule: always show an image per article; never leave the image slot empty.
const NEWS_IMAGES: Record<string, string> = {
  heatpump:     'https://images.unsplash.com/photo-1621905251189-08b1059efa82?auto=format&fit=crop&q=80&w=600',
  subsidy:      'https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&q=80&w=600',
  house:        'https://images.unsplash.com/photo-1570129477492-45c003edd2be?auto=format&fit=crop&q=80&w=600',
  government:   'https://images.unsplash.com/photo-1555900234-35b55afe19df?auto=format&fit=crop&q=80&w=600',
  solar:        'https://images.unsplash.com/photo-1509391366360-2e959784a276?auto=format&fit=crop&q=80&w=600',
  technology:   'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&q=80&w=600',
  installation: 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&q=80&w=600',
  market:       'https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&q=80&w=600',
  energy:       'https://images.unsplash.com/photo-1473341304170-971dccb5ac1e?auto=format&fit=crop&q=80&w=600',
};

const NEWS_IMAGE_RULES: { key: string; keywords: string[] }[] = [
  { key: 'subsidy',      keywords: ['bafa', 'beg', 'subsidy', 'funding', 'grant', 'zuschuss', 'kfw', 'förder', 'förderung'] },
  { key: 'government',   keywords: ['parliament', 'bundestag', 'bundesrat', 'minister', 'government', 'geg', 'regulation', 'gesetz', 'policy', 'law', 'legislation'] },
  { key: 'solar',        keywords: ['solar', 'photovoltaic', 'pv', 'renewable', 'wind', 'erneuerbar', 'green energy'] },
  { key: 'technology',   keywords: ['r290', 'r32', 'refrigerant', 'cop', 'scop', 'efficiency', 'innovation', 'technology', 'inverter', 'compressor'] },
  { key: 'installation', keywords: ['install', 'installer', 'montage', 'handwerk', 'technician', 'fachmann', 'workforce'] },
  { key: 'market',       keywords: ['market', 'sales', 'statistics', 'stat', 'trend', 'bwp', 'report', 'record', 'growth', 'demand', 'forecast'] },
  { key: 'energy',       keywords: ['energy', 'electricity', 'power', 'grid', 'strom', 'energie', 'tariff', 'price hike'] },
  { key: 'house',        keywords: ['house', 'home', 'building', 'residential', 'gebäude', 'renovation', 'refurb', 'retrofit'] },
  { key: 'heatpump',     keywords: ['heat pump', 'heatpump', 'wärmepumpe', 'outdoor unit', 'odu', 'idu', 'hvac', 'heating', 'viessmann', 'vaillant', 'stiebel', 'bosch', 'daikin', 'nibe', 'wolf', 'panasonic'] },
];

function selectNewsImage(title: string, summary: string): string {
  const text = `${title} ${summary}`.toLowerCase();
  for (const rule of NEWS_IMAGE_RULES) {
    if (rule.keywords.some(kw => text.includes(kw))) {
      return NEWS_IMAGES[rule.key];
    }
  }
  return NEWS_IMAGES.heatpump;
}

export const NewsView: React.FC<NewsViewProps> = ({ items = [] }) => {
  if (!items || items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-400 bg-white rounded-lg shadow-sm border border-gray-100 p-8">
        <p>No market news available at the moment.</p>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {items.map((news) => {
        const fallbackImg = selectNewsImage(news.title, news.summary ?? '');
        const imgSrc = news.imageUrl || fallbackImg;
        return (
          <article key={news.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow flex flex-col h-full">
            <div className="h-40 w-full overflow-hidden bg-gray-100">
              <img
                src={imgSrc}
                alt={news.title}
                className="w-full h-full object-cover"
                onError={(e) => { (e.currentTarget as HTMLImageElement).src = fallbackImg; }}
              />
            </div>
            <div className="p-6 flex flex-col flex-grow">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-1 rounded">News</span>
                <span className="text-xs text-gray-400">{new Date(news.date).toLocaleDateString()}</span>
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2 line-clamp-2"><a href={news.sourceUrl} target="_blank" className="hover:text-blue-600">{news.title}</a></h3>
              <p className="text-sm text-gray-600 mb-4 line-clamp-3 flex-grow">{news.summary}</p>
              <a href={news.sourceUrl} target="_blank" className="text-sm font-medium text-blue-600 hover:text-blue-800 flex items-center gap-1 mt-auto pt-4 border-t border-gray-50">Read full story</a>
            </div>
          </article>
        );
      })}
    </div>
  );
};