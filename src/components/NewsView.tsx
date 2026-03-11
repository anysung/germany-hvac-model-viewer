import React from 'react';
import { NewsItem } from '../types';

interface NewsViewProps { items?: NewsItem[]; }

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
      {items.map((news) => (
        <article key={news.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow flex flex-col h-full">
          {news.imageUrl && <div className="h-40 w-full overflow-hidden"><img src={news.imageUrl} alt={news.title} className="w-full h-full object-cover" /></div>}
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
      ))}
    </div>
  );
};