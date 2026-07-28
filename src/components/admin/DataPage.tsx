/**
 * DataPage — read-only data status for the active market.
 * Replaces the legacy DataOps page (AI-scan machinery is gone): the product
 * dataset is rebuilt by the local pipeline and shipped with each deploy, and
 * news is written monthly by the separately-deployed Cloud Function.
 */
import React, { useEffect, useState } from 'react';
import { getNews, getNewsFor } from '../../services/dbService';
import { HeatPump, NewsItem } from '../../types';
import { ACTIVE_COUNTRY, COUNTRY_PROFILES } from '../../config/countryProfiles';
import { COUNTRY_SITES } from '../../hpiq/market';
import { StatCard, SectionCard, PageHeader } from './shared';
import { AdminLang } from './adminI18n';

/**
 * All-markets grid — the unified console view. Dataset counts are injected at
 * build time (__ALL_MARKET_STATS__); news freshness is read live per market.
 * New countries appear automatically once added to COUNTRY_PROFILES +
 * the vite stats map.
 */
const MarketsGrid: React.FC<{ ko: boolean; locale: string }> = ({ ko, locale }) => {
  const [newsByCode, setNewsByCode] = useState<Record<string, NewsItem[]>>({});
  useEffect(() => {
    Object.keys(COUNTRY_PROFILES).forEach(code => {
      getNewsFor(code).then(n => setNewsByCode(prev => ({ ...prev, [code]: n })));
    });
  }, []);

  const fmtD = (iso: string | null | undefined) =>
    iso ? new Date(iso).toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
      {Object.values(COUNTRY_PROFILES).map(p => {
        const stats = __ALL_MARKET_STATS__[p.code] ?? { res: 0, com: 0, mfr: 0 };
        const news = newsByCode[p.code];
        const latest = news && news.length ? news.map(n => n.date).sort().reverse()[0] : null;
        return (
          <div key={p.code} className="bg-white rounded-xl border border-gray-200 p-5 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-gray-800">{p.name} ({p.code})</span>
              <span className="text-[10px] font-semibold tracking-wide text-gray-400 uppercase">{p.primaryRegistry}</span>
            </div>
            <div className="text-sm text-gray-600 space-y-1">
              <div className="flex justify-between"><span>{ko ? '모델 수' : 'Models'}</span><span className="font-medium text-gray-900">{(stats.res + stats.com).toLocaleString()}</span></div>
              <div className="flex justify-between"><span>{ko ? '주거용 / 상업용' : 'Residential / Commercial'}</span><span className="font-medium text-gray-900">{stats.res.toLocaleString()} / {stats.com.toLocaleString()}</span></div>
              <div className="flex justify-between"><span>{ko ? '제조사' : 'Manufacturers'}</span><span className="font-medium text-gray-900">{stats.mfr}</span></div>
              <div className="flex justify-between"><span>{ko ? '뉴스 기사' : 'News articles'}</span><span className="font-medium text-gray-900">{news ? news.length : '…'}</span></div>
              <div className="flex justify-between"><span>{ko ? '최신 기사' : 'Latest article'}</span><span className="font-medium text-gray-900">{news ? fmtD(latest) : '…'}</span></div>
            </div>
            {/* ONE source for public site URLs (market.ts COUNTRY_SITES) — the
                old local map here silently missed PL/IT when they launched. */}
            <a href={COUNTRY_SITES[p.code]?.url ?? '#'} target="_blank" rel="noopener noreferrer" className="inline-block text-xs text-blue-600 hover:underline pt-1">
              {COUNTRY_SITES[p.code]?.url.replace('https://', '') ?? '—'} ↗
            </a>
          </div>
        );
      })}
    </div>
  );
};

interface DataPageProps {
  al: AdminLang;
  /** Combined residential + commercial items loaded by the app shell. */
  products: HeatPump[] | null;
  lastUpdated?: string | null;
}

const maxDate = (items: HeatPump[], key: 'bafa_snapshot_fetched_at' | 'source_snapshot_generated_at'): string | null =>
  items.reduce<string | null>((acc, p) => {
    const v = p[key];
    return v && (!acc || v > acc) ? v : acc;
  }, null);

const fmt = (iso: string | null | undefined, locale: string) =>
  iso ? new Date(iso).toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

export const DataPage: React.FC<DataPageProps> = ({ al, products, lastUpdated }) => {
  const ko = al === 'ko';
  const locale = ko ? 'ko-KR' : 'en-GB';
  const [news, setNews] = useState<NewsItem[] | null>(null);

  useEffect(() => { getNews().then(setNews).catch(() => setNews([])); }, []);

  const items = products ?? [];
  const residential = items.filter(p => (p.power_35C_kw ?? p.power_55C_kw ?? 0) <= 20.99).length;
  const commercial = items.length - residential;
  const bafaSnapshot = maxDate(items, 'bafa_snapshot_fetched_at');
  const generatedAt = maxDate(items, 'source_snapshot_generated_at');
  const latestNews = news && news.length > 0
    ? news.map(n => n.date).sort().reverse()[0]
    : null;

  return (
    <div>
      <PageHeader
        title={ko ? '데이터' : 'Data'}
        subtitle={ko
          ? '전체 마켓 데이터셋 현황 · 아래는 활성 마켓 상세'
          : 'Dataset status across all markets · active-market detail below'}
      />

      {/* All markets — unified console view */}
      <MarketsGrid ko={ko} locale={locale} />

      <div className="mb-2 text-xs font-semibold tracking-wide text-gray-400 uppercase">
        {ko ? `활성 마켓: ${ACTIVE_COUNTRY.name}` : `Active market: ${ACTIVE_COUNTRY.name}`}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label={ko ? '전체 제품' : 'Total products'} value={items.length.toLocaleString()} color="blue" icon="🗄️" />
        <StatCard label={ko ? '주거용' : 'Residential'} value={residential.toLocaleString()} color="green" icon="🏠" />
        <StatCard label={ko ? '상업용' : 'Commercial'} value={commercial.toLocaleString()} color="yellow" icon="🏢" />
        <StatCard label={ko ? '뉴스' : 'News items'} value={news === null ? '…' : news.length} color="gray" icon="📰" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SectionCard title={ko ? '제품 데이터셋' : 'Product dataset'} icon="🔧">
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">{ko ? '마켓' : 'Market'}</span>
              <span className="font-medium">{ACTIVE_COUNTRY.name} ({ACTIVE_COUNTRY.code}) · {ACTIVE_COUNTRY.primaryRegistry}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">{ko ? '레지스트리 스냅샷' : 'Registry snapshot'}</span>
              <span className="font-medium">{fmt(bafaSnapshot, locale)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">{ko ? '데이터셋 생성일' : 'Dataset generated'}</span>
              <span className="font-medium">{fmt(generatedAt, locale)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">{ko ? '앱 로드 시각' : 'Loaded in app'}</span>
              <span className="font-medium">{fmt(lastUpdated, locale)}</span>
            </div>
            <p className="text-xs text-gray-400 pt-2 border-t border-gray-100 leading-relaxed">
              {ko
                ? '제품 데이터셋은 로컬 파이프라인(scripts/bafa)이 생성해 호스팅 배포 시 정적 JSON으로 함께 배포됩니다. 파이프라인 실행 + 배포 후에 여기 반영됩니다.'
                : 'The product dataset is produced by the local pipeline (scripts/bafa) and shipped as static JSON with each hosting deploy. Changes appear here after a pipeline run + deploy.'}
            </p>
          </div>
        </SectionCard>

        <SectionCard title={ko ? '뉴스 파이프라인' : 'News pipeline'} icon="📰">
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">{ko ? '전체 기사' : 'Total articles'}</span>
              <span className="font-medium">{news === null ? '…' : news.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">{ko ? '최신 기사' : 'Latest article'}</span>
              <span className="font-medium">{fmt(latestNews, locale)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">{ko ? '출처' : 'Source'}</span>
              <span className="font-medium">Cloud Function ({ko ? '매월' : 'monthly'})</span>
            </div>
            <p className="text-xs text-gray-400 pt-2 border-t border-gray-100 leading-relaxed">
              {ko
                ? '마켓 뉴스는 별도로 배포되는 Cloud Function(google_cloud_function/, 자체 deploy.sh)이 생성해 countries/' + ACTIVE_COUNTRY.code + '에 기록합니다.'
                : 'Market news is generated by the separately deployed Cloud Function (google_cloud_function/, its own deploy.sh) and written to countries/' + ACTIVE_COUNTRY.code + '.'}
            </p>
          </div>
        </SectionCard>
      </div>
    </div>
  );
};
