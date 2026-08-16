/**
 * newsModel — shared logic for the press-format News experience.
 *
 * One home for what desktop (pages/NewsPage.tsx), mobile (mobile/MobileApp.tsx)
 * and the article PDF (pdf/newsArticlePdf.ts) all need: stored-translation
 * lookup, category resolution, the "CATEGORY • COUNTRY" eyebrow, deep links,
 * the mailto composer and the article-PDF builder input.
 */
import { NewsItem, Language } from '../types';
import { HpStrings } from './i18n';
import { MARKET_WEB_DOMAIN } from './market';
import { shortDate } from './model';
import { buildNewsArticlePdf, newsPdfFileName } from './pdf/newsArticlePdf';
import type { jsPDF } from 'jspdf';

/** Newspaper serif stack for headlines/body — system fonts only, no webfonts. */
export const NEWS_SERIF = "Georgia, 'Times New Roman', Times, serif";

/** Editorial category — explicit category field first, keyword fallback. */
export function categoryOf(item: NewsItem): string {
  if (item.category) return item.category;
  const text = `${item.title} ${item.summary}`.toLowerCase();
  if (/(bafa|kfw|beg|subsidy|funding|grant|zuschuss|förder|dotacj|dofinansow|czyste powietrze|nfośigw|ulga)/.test(text)) return 'FUNDING';
  if (/(r290|r32|refrigerant|cop|scop|efficiency|innovation|technology|technolog|czynnik)/.test(text)) return 'TECHNOLOGY';
  if (/(install|montage|handwerk|technician|instalator)/.test(text)) return 'INSTALLER INSIGHT';
  if (/(rynek|sprzedaż)/.test(text)) return 'MARKET';
  return 'MARKET';
}

/** Pick the stored translation of an article for the active language.
 *  Articles are generated bilingually (title/summary/body + *_de/_fr/_pl/_it
 *  fields per market); falls back to English when a translation is missing. */
export function localizedNews(item: NewsItem, lang: Language): { title: string; summary: string; body: string } {
  if (lang === 'de') return { title: item.title_de ?? item.title, summary: item.summary_de ?? item.summary, body: item.body_de ?? item.body ?? '' };
  if (lang === 'fr') return { title: item.title_fr ?? item.title, summary: item.summary_fr ?? item.summary, body: item.body_fr ?? item.body ?? '' };
  if (lang === 'pl') return { title: item.title_pl ?? item.title, summary: item.summary_pl ?? item.summary, body: item.body_pl ?? item.body ?? '' };
  if (lang === 'it') return { title: item.title_it ?? item.title, summary: item.summary_it ?? item.summary, body: item.body_it ?? item.body ?? '' };
  return { title: item.title, summary: item.summary, body: item.body ?? '' };
}

/** The call-to-action an article can carry — used by the Special Report
 *  pieces, which exist to send the reader to the report itself. Returns null
 *  for ordinary articles, so the reader renders unchanged for them. */
export function localizedCta(item: NewsItem, lang: Language): { url: string; label: string } | null {
  if (!item.ctaUrl) return null;
  const label = (lang === 'de' ? item.ctaLabel_de
    : lang === 'fr' ? item.ctaLabel_fr
      : lang === 'pl' ? item.ctaLabel_pl
        : lang === 'it' ? item.ctaLabel_it
          : undefined) ?? item.ctaLabel;
  return label ? { url: item.ctaUrl, label } : null;
}

/** "MARKET • GERMANY" — localized category label + the edition's country name. */
export const newsEyebrow = (t: HpStrings, item: NewsItem): string =>
  `${t.news.categories[categoryOf(item)] ?? categoryOf(item)} • ${t.news.marketCountry.toLocaleUpperCase()}`;

/** Share/deep link on the CURRENT origin (works on preview hosts too). */
export const articleDeepLink = (id: string): string =>
  `${window.location.origin}/?article=${encodeURIComponent(id)}`;

/** Canonical public link — printed in the PDF footer. */
export const articleCanonicalUrl = (id: string): string =>
  `https://${MARKET_WEB_DOMAIN}/?article=${encodeURIComponent(id)}`;

/** mailto: composer — subject = headline, body = dek + deep link. */
export const emailArticleHref = (title: string, summary: string, link: string): string =>
  `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(`${summary}\n\n${link}`)}`;

/** The generated A4 article PDF + filename for one article. */
export function makeArticlePdf(item: NewsItem, t: HpStrings, lang: Language): { doc: jsPDF; filename: string } {
  const loc = localizedNews(item, lang);
  return {
    doc: buildNewsArticlePdf({
      eyebrow: newsEyebrow(t, item),
      title: loc.title,
      dek: loc.summary,
      body: loc.body,
      byline: `${t.news.by} ${t.news.editorialTeam(t.news.marketCountry)}`,
      dateLine: `${t.news.updated} ${shortDate(item.date, t.locale)}`,
      sources: item.sources ?? [],
      sourcesLabel: t.news.sources,
      editorialNote: t.news.editorialNote,
      link: articleCanonicalUrl(item.id),
      copyright: t.footer.copyright(new Date().getFullYear()),
    }),
    filename: newsPdfFileName(loc.title),
  };
}
