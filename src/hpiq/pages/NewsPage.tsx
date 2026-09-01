/** News — professional press-publication format (Jul 2026 redesign).
 *
 *  Feed: featured top story + press-style list rows (eyebrow, serif headline,
 *  dek, dateline, thumbnail) + searchable archive of every past article.
 *  Article: full-page reader with newspaper masthead (BrandLogo + WavingFlag),
 *  category eyebrow, serif headline, dek, byline (country icon + editorial
 *  team), WSJ-style action bar (PDF · Print · Email · Share), hero image,
 *  serif body, sources. `/?article=<id>` deep links are preserved.
 *
 *  PDF + Print never touch window.print(): both go through the generated A4
 *  PDF (pdf/newsArticlePdf.ts) delivered via pdf/deliverPdf.ts.
 */
import React, { useEffect, useRef, useState } from 'react';
import { HpApp } from '../appState';
import { NewsItem } from '../../types';
import { shortDate } from '../model';
import { tr } from '../i18n';
import { FD } from '../ui';
import { BrandLogo, WavingFlag } from '../../components/BrandLogo';
import { MARKET_ICON_32 } from '../market';
import { NewsGallery, galleryOf } from '../NewsGallery';
import {
  NEWS_SERIF, categoryOf, localizedNews, localizedCta, newsEyebrow,
  articleDeepLink, emailArticleHref, makeArticlePdf,
} from '../newsModel';
import { downloadPdf, openPdfForPrint, printPdfViaShareSheet } from '../pdf/deliverPdf';
import { isIos } from '../pwaInstall';

function readTime(item: NewsItem, unit: string): string {
  const words = `${item.title} ${item.summary} ${item.body ?? ''}`.split(/\s+/).length;
  return `${Math.max(3, Math.min(8, Math.round(words / 120) + 2))} ${unit}`;
}

const EYEBROW: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, letterSpacing: '.14em', color: '#0066cc', textTransform: 'uppercase',
};

const clamp = (lines: number): React.CSSProperties => ({
  display: '-webkit-box', WebkitLineClamp: lines, WebkitBoxOrient: 'vertical', overflow: 'hidden',
});

/* ── Action-bar icon buttons (16px stroke icons, no icon library) ────────── */
const ActionIcon: React.FC<{ d: string }> = ({ d }) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);
const AI = {
  pdf: 'M12 3v10m0 0l-4-4m4 4l4-4M5 17v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2',
  print: 'M6 9V3h12v6M6 14H5a2 2 0 0 1-2-2v-1a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v1a2 2 0 0 1-2 2h-1M7 13h10v8H7z',
  email: 'M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM3.5 6.5L12 13l8.5-6.5',
  share: 'M7 11l5-5 5 5M12 6v11M5 20h14',
};

const ActionButton: React.FC<{ icon: keyof typeof AI; label: string; onClick: () => void }> = ({ icon, label, onClick }) => (
  <span
    className="hp-press"
    onClick={onClick}
    title={label}
    style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 600, color: '#1d1d1f', cursor: 'pointer', padding: '4px 2px' }}
  >
    <ActionIcon d={AI[icon]} />
    {label}
  </span>
);

export const NewsPage: React.FC<{ app: HpApp }> = ({ app }) => {
  const t = tr(app.lang);
  const feed = app.news;
  const featured = feed[0] ?? null;
  const rows = feed.slice(1, 4);
  const archive = feed.slice(4);
  const [reader, setReader] = useState<NewsItem | null>(null);
  const [query, setQuery] = useState('');
  const topRef = useRef<HTMLDivElement>(null);

  // ?article=<id> deep link (shared article URLs) — open once data is ready.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('article');
    if (!id || !feed.length) return;
    const item = feed.find(n => n.id === id);
    if (item?.body) setReader(item);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feed.length]);

  // Article view starts at the masthead, not wherever the feed was scrolled to.
  useEffect(() => {
    if (reader) topRef.current?.scrollIntoView({ block: 'start' });
  }, [reader]);

  useEffect(() => {
    if (!reader) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setReader(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [reader]);

  const shareArticle = (item: NewsItem) => {
    const url = articleDeepLink(item.id);
    const title = localizedNews(item, app.lang).title;
    if (navigator.share) {
      navigator.share({ title, url }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(url)
        .then(() => app.notify(t.news.linkCopied))
        .catch(() => app.notify(t.account.copyFailed));
    }
  };

  /** PDF download — always just saves the generated file. */
  const pdfArticle = (item: NewsItem) => {
    try { const made = makeArticlePdf(item, t, app.lang); downloadPdf(made.doc, made.filename); }
    catch { app.notify(t.ds.pdfFailed); }
  };

  /** Print — the SAME generated PDF; iOS via share sheet, desktop in a viewer tab. */
  const printArticle = (item: NewsItem) => {
    try {
      const made = makeArticlePdf(item, t, app.lang);
      if (isIos()) { printPdfViaShareSheet(made.doc, made.filename).catch(() => app.notify(t.ds.pdfFailed)); }
      else openPdfForPrint(made.doc, made.filename);
    } catch { app.notify(t.ds.pdfFailed); }
  };

  const emailArticle = (item: NewsItem) => {
    const loc = localizedNews(item, app.lang);
    window.location.href = emailArticleHref(loc.title, loc.summary, articleDeepLink(item.id));
  };

  const q = query.trim().toLowerCase();
  const archiveFiltered = (q
    ? feed.filter(n => {
        const loc = localizedNews(n, app.lang);
        return `${loc.title} ${loc.summary}`.toLowerCase().includes(q);
      })
    : archive);

  const openArticle = (item?: NewsItem | null) => {
    if (!item) { app.notify(t.news.notPublished); return; }
    if (item.body) { setReader(item); return; }               // original article → in-app reader
    if (item.sourceUrl) { window.open(item.sourceUrl, '_blank', 'noopener'); return; }
    app.notify(t.news.noLink);
  };

  /* ── Article view (full-page press layout) ─────────────────────────────── */
  if (reader) {
    const loc = localizedNews(reader, app.lang);
    return (
      <div ref={topRef} style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#fff' }}>
        <div style={{ maxWidth: 860, width: '100%', margin: '0 auto', padding: '22px 48px 72px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>

          {/* top chrome: back + close */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span onClick={() => setReader(null)} style={{ fontSize: 13.5, color: '#0066cc', cursor: 'pointer' }}>‹ {t.news.archiveTitle}</span>
            <span
              className="hp-press"
              onClick={() => setReader(null)}
              style={{ marginLeft: 'auto', fontSize: 13, color: '#7a7a7a', border: '1px solid #d2d2d7', borderRadius: 999, padding: '6px 15px', cursor: 'pointer', background: '#fff' }}
            >
              {t.news.close}
            </span>
          </div>

          {/* masthead — the market's own logo + waving flag, like a nameplate */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, padding: '20px 0 14px' }}>
            <BrandLogo height={34} theme="light" />
            <WavingFlag height={28} onLight className="waving-flag" />
          </div>
          <div style={{ height: 2, background: '#1d1d1f' }} />
          <div style={{ height: 1, background: '#e0e0e0', marginTop: 2 }} />

          {/* eyebrow · headline · dek */}
          <span style={{ ...EYEBROW, marginTop: 30 }}>{newsEyebrow(t, reader)}</span>
          <h1 style={{ fontFamily: NEWS_SERIF, fontSize: 42, fontWeight: 700, lineHeight: 1.12, letterSpacing: '-0.01em', color: '#1d1d1f', margin: '12px 0 0' }}>
            {loc.title}
          </h1>
          <p style={{ fontSize: 19, color: '#6e6e73', lineHeight: 1.5, margin: '16px 0 0', fontWeight: 400 }}>
            {loc.summary}
          </p>

          {/* byline row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 20, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13.5, color: '#555' }}>{t.news.by}</span>
            <img src={MARKET_ICON_32} alt="" width={19} height={19} style={{ borderRadius: '50%', display: 'block' }} />
            <span style={{ fontSize: 13.5, fontWeight: 600, color: '#1d1d1f' }}>{t.news.editorialTeam(t.news.marketCountry)}</span>
            <span style={{ fontSize: 13, color: '#b6b6bc' }}>·</span>
            <span style={{ fontSize: 13, color: '#7a7a7a' }}>{t.news.updated} {shortDate(reader.date, t.locale)}</span>
          </div>

          {/* action bar ABOVE the hero — PDF · Print · Email · Share */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 22, marginTop: 14, padding: '9px 0', borderTop: '1px solid #e0e0e0', borderBottom: '1px solid #e0e0e0' }}>
            <ActionButton icon="pdf" label={t.news.actionPdf} onClick={() => pdfArticle(reader)} />
            <ActionButton icon="print" label={t.news.actionPrint} onClick={() => printArticle(reader)} />
            <ActionButton icon="email" label={t.news.actionEmail} onClick={() => emailArticle(reader)} />
            <ActionButton icon="share" label={t.news.share} onClick={() => shareArticle(reader)} />
          </div>

          {/* hero image */}
          <NewsGallery images={galleryOf(reader)} />

          {/* body — comfortable serif measure */}
          <div style={{ maxWidth: 700, width: '100%', margin: '30px auto 0', display: 'flex', flexDirection: 'column', gap: 22 }}>
            {loc.body.split(/\n\s*\n/).map((para, i) => (
              <p key={i} style={{ fontFamily: NEWS_SERIF, fontSize: 17.5, lineHeight: 1.75, color: '#1d1d1f', margin: 0 }}>{para}</p>
            ))}

            {/* Destination button — only the Special Report pieces carry a
                ctaUrl, and they exist to hand the reader the report itself.
                The body renders as plain text, so a URL typed into it would
                not be clickable; this is the article's one real link. */}
            {(() => {
              const cta = localizedCta(reader, app.lang);
              return cta ? (
                <a
                  href={cta.url}
                  target="_blank"
                  rel="noopener"
                  style={{
                    alignSelf: 'flex-start', background: '#1d1d1f', color: '#fff',
                    borderRadius: 999, padding: '12px 26px', fontSize: 14.5,
                    fontWeight: 600, textDecoration: 'none',
                  }}
                >
                  {cta.label} →
                </a>
              ) : null;
            })()}

            {!!reader.sources?.length && (
              <div style={{ borderTop: '1px solid #e0e0e0', paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', color: '#7a7a7a' }}>{t.news.sources}</span>
                {reader.sources.map(s => (
                  <span
                    key={s.url}
                    onClick={() => window.open(s.url, '_blank', 'noopener')}
                    style={{ fontSize: 13.5, color: '#0066cc', cursor: 'pointer' }}
                  >
                    {s.title} ›
                  </span>
                ))}
              </div>
            )}

            <span style={{ fontSize: 11.5, color: '#7a7a7a', lineHeight: 1.55, borderTop: '1px solid #f0f0f0', paddingTop: 14 }}>
              {t.news.editorialNote}
            </span>
          </div>
        </div>
      </div>
    );
  }

  /* ── Feed view (press front page) ──────────────────────────────────────── */
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <div style={{ maxWidth: 1160, width: '100%', margin: '0 auto', padding: '40px 48px 48px', display: 'flex', flexDirection: 'column', gap: 26, boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
          <span style={{ fontFamily: FD, fontSize: 34, fontWeight: 600, letterSpacing: '-0.374px' }}>{t.news.title}</span>
          <span style={{ fontSize: 12.5, color: '#7a7a7a', border: '1px solid #e0e0e0', borderRadius: 999, padding: '4px 13px' }}>{t.news.pill}</span>
        </div>

        {/* front page: featured + list rows on one white sheet */}
        <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 18, padding: '30px 36px 8px' }}>

          {/* featured top story */}
          {featured ? (
            <div
              onClick={() => openArticle(featured)}
              className="hp-row"
              style={{ display: 'grid', gridTemplateColumns: featured.imageUrl ? '1.25fr 1fr' : '1fr', gap: 30, alignItems: 'start', paddingBottom: 26, borderBottom: '2px solid #1d1d1f', cursor: 'pointer' }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                <span style={EYEBROW}>{newsEyebrow(t, featured)}</span>
                <span style={{ fontFamily: NEWS_SERIF, fontSize: 32, fontWeight: 700, lineHeight: 1.15, letterSpacing: '-0.01em', color: '#1d1d1f' }}>
                  {localizedNews(featured, app.lang).title}
                </span>
                <span style={{ fontSize: 15, color: '#6e6e73', lineHeight: 1.55, ...clamp(3) }}>
                  {localizedNews(featured, app.lang).summary}
                </span>
                <span style={{ fontSize: 12.5, color: '#7a7a7a' }}>
                  {shortDate(featured.date, t.locale)} · {readTime(featured, t.news.minRead)}
                </span>
              </div>
              {featured.imageUrl && (
                <img src={featured.imageUrl} alt="" style={{ width: '100%', height: 210, objectFit: 'cover', display: 'block', borderRadius: 3 }} />
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11, paddingBottom: 26, borderBottom: '2px solid #1d1d1f' }}>
              <span style={EYEBROW}>{(t.news.categories[t.news.fallbackFeatured.badge] ?? t.news.fallbackFeatured.badge)} • {t.news.marketCountry.toLocaleUpperCase()}</span>
              <span style={{ fontFamily: NEWS_SERIF, fontSize: 32, fontWeight: 700, lineHeight: 1.15, color: '#1d1d1f' }}>{t.news.fallbackFeatured.title}</span>
              <span style={{ fontSize: 15, color: '#6e6e73', lineHeight: 1.55 }}>{t.news.fallbackFeatured.dek}</span>
              <span style={{ fontSize: 12.5, color: '#7a7a7a' }}>{t.news.fallbackFeatured.kicker}</span>
            </div>
          )}

          {/* following stories — press list rows with thumbnail left */}
          {(rows.length ? rows : null)?.map((item, i) => (
            <div
              key={item.id}
              onClick={() => openArticle(item)}
              className="hp-row"
              style={{ display: 'grid', gridTemplateColumns: item.imageUrl ? '176px 1fr' : '1fr', gap: 24, alignItems: 'start', padding: '22px 0', borderBottom: i < rows.length - 1 ? '1px solid #e0e0e0' : undefined, cursor: 'pointer' }}
            >
              {item.imageUrl && (
                <img src={item.imageUrl} alt="" style={{ width: '100%', height: 108, objectFit: 'cover', display: 'block', borderRadius: 3 }} />
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7, minWidth: 0 }}>
                <span style={EYEBROW}>{newsEyebrow(t, item)}</span>
                <span style={{ fontFamily: NEWS_SERIF, fontSize: 21, fontWeight: 700, lineHeight: 1.25, color: '#1d1d1f' }}>
                  {localizedNews(item, app.lang).title}
                </span>
                <span style={{ fontSize: 13.5, color: '#6e6e73', lineHeight: 1.55, ...clamp(2) }}>
                  {localizedNews(item, app.lang).summary}
                </span>
                <span style={{ fontSize: 12, color: '#7a7a7a' }}>
                  {shortDate(item.date, t.locale)} · {readTime(item, t.news.minRead)}
                </span>
              </div>
            </div>
          )) ?? t.news.fallbackCards.map((card, i) => (
            <div key={card.title} style={{ display: 'flex', flexDirection: 'column', gap: 7, padding: '22px 0', borderBottom: i < t.news.fallbackCards.length - 1 ? '1px solid #e0e0e0' : undefined }}>
              <span style={EYEBROW}>{(t.news.categories[card.badge] ?? card.badge)} • {t.news.marketCountry.toLocaleUpperCase()}</span>
              <span style={{ fontFamily: NEWS_SERIF, fontSize: 21, fontWeight: 700, lineHeight: 1.25, color: '#1d1d1f' }}>{card.title}</span>
              <span style={{ fontSize: 13.5, color: '#6e6e73', lineHeight: 1.55 }}>{card.dek}</span>
              <span style={{ fontSize: 12, color: '#7a7a7a' }}>{card.meta}</span>
            </div>
          ))}
        </div>

        {/* ── Archive: every past article stays searchable ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ fontFamily: FD, fontSize: 21, fontWeight: 600, letterSpacing: '-0.2px' }}>{t.news.archiveTitle}</span>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={t.news.searchPlaceholder}
              style={{ marginLeft: 'auto', border: '1px solid #d2d2d7', borderRadius: 999, padding: '8px 16px', fontSize: 13, fontFamily: 'inherit', width: 260, outline: 'none' }}
            />
          </div>
          {archiveFiltered.length === 0 ? (
            <span style={{ fontSize: 13, color: '#7a7a7a', padding: '6px 2px' }}>{q ? t.news.noArchiveMatch : '—'}</span>
          ) : (
            <div style={{ border: '1px solid #e0e0e0', borderRadius: 18, overflow: 'hidden', background: '#fff' }}>
              {archiveFiltered.map((item, i) => (
                <div
                  key={item.id}
                  onClick={() => openArticle(item)}
                  className="hp-row"
                  style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 20px', borderBottom: i < archiveFiltered.length - 1 ? '1px solid #f0f0f0' : undefined, cursor: 'pointer' }}
                >
                  <span style={{ flex: 'none', fontSize: 12, color: '#7a7a7a', width: 92 }}>{shortDate(item.date, t.locale)}</span>
                  {/* Fixed-width chip: category names vary wildly in length
                      (AIDES vs TECHNOLOGIE), and as bare inline text they
                      pushed every headline to a different x. One width, small
                      type, wrapping inside the box — headlines line up. */}
                  <span style={{
                    flex: 'none', width: 100, boxSizing: 'border-box',
                    border: '1px solid #e0e0e0', borderRadius: 8, padding: '3px 6px',
                    fontSize: 9, fontWeight: 700, letterSpacing: '.06em', lineHeight: 1.3,
                    color: '#7a7a7a', textAlign: 'center', overflowWrap: 'break-word',
                  }}>{t.news.categories[categoryOf(item)] ?? categoryOf(item)}</span>
                  <span style={{ fontFamily: NEWS_SERIF, fontSize: 15, fontWeight: 700, lineHeight: 1.35, minWidth: 0, color: '#1d1d1f' }}>{localizedNews(item, app.lang).title}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* No newsletter sign-up here on purpose (owner, 2026-08-05). The button
            used to promise a briefing we had no way to send: the project has no
            mail infrastructure at all, and adding one is not a small task — an
            EU list needs double opt-in, one-click unsubscribe and consent
            records, and a badly-run send damages the domain reputation that
            billing and team invitations also depend on. Revisit when the public
            archive is actually drawing readers. */}
      </div>
    </div>
  );
};
