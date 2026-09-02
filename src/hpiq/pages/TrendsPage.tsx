/**
 * Market & Trends — the in-app view of the public /market-trends/ card feed.
 *
 * The cards (owner-shipped infographics + market-language articles) are
 * published as static pages for SEO and social landings; the app renders the
 * SAME feed natively from /market-trends/feed.json (written by
 * scripts/build-market-trends.mjs into the hosting build), so members read a
 * card without leaving the app. One content source, two surfaces — the feed
 * is market-language by design, so no i18n dictionary is involved beyond the
 * nav label.
 *
 * The dev server has no built feed file; the page then shows the roadmap-less
 * quiet state rather than an error — an empty feed and a missing feed look
 * the same to a member, and neither is a failure.
 */
import React, { useEffect, useState } from 'react';
import { HpApp } from '../appState';
import { tr } from '../i18n';
import { FD, SubTabs } from '../ui';

/** The article text in one language. The infographic is NOT part of this:
 *  the card image ships in the market language and is never translated
 *  (owner 2026-08-11) — only the description below it switches. */
interface TrendsText {
  title: string;
  excerpt: string;
  body: string[];
  sourceNote: string;
}

interface TrendsCard extends TrendsText {
  slug: string;
  date: string;      // YYYY-MM-DD
  image: string;     // root-relative WebP, market language
  en: TrendsText;    // falls back to the market-language text if untranslated
}

interface TrendsFeed {
  h1: string;
  sub: string;
  h1En: string;
  subEn: string;
  pill: string;
  pillEn: string;
  coming: string;
  roadmap: string[];
  items: TrendsCard[];
}

const PAGE: React.CSSProperties = {
  height: 'calc(100vh - 60px)', overflowY: 'auto', background: '#fff',
};

/** Page title, typed exactly as the News page types "Market intelligence." —
 *  same family, size and weight, so a page name reads as a page name and not
 *  as the first line of the article. (Do not fold these into the `font`
 *  shorthand: `font: 700 34px/1.15 inherit` is invalid CSS and the browser
 *  drops the whole declaration, which is how this page shipped looking like
 *  body text.) */
const PAGE_TITLE: React.CSSProperties = {
  fontFamily: FD, fontSize: 34, fontWeight: 600, letterSpacing: '-0.374px', color: '#1d1d1f',
};
const PILL: React.CSSProperties = {
  fontSize: 12.5, color: '#7a7a7a', border: '1px solid #e0e0e0', borderRadius: 999,
  padding: '4px 13px', whiteSpace: 'nowrap',
};

export const TrendsPage: React.FC<{ app: HpApp }> = ({ app }) => {
  const [feed, setFeed] = useState<TrendsFeed | null>(null);
  const [openSlug, setOpenSlug] = useState<string | null>(null);

  /** The nav's language toggle drives the article text. Keeping the OPEN card
   *  as a slug (not a snapshot) is what lets a switch mid-read re-render the
   *  same card in the other language instead of freezing the first one. */
  const en = app.lang === 'en';
  const textOf = (c: TrendsCard): TrendsText => (en && c.en ? c.en : c);
  /**
   * In the app the title is the PAGE NAME — the same words as the nav item —
   * so it reads as a destination, exactly like News. The long market headline
   * ("Wärmepumpen-Markt Deutschland: Zahlen & Trends") belongs to the public
   * page, where it is the SEO H1; repeating it here only buried the page name
   * in a two-line sentence.
   */
  const t = tr(app.lang);
  const pageName = t.nav.trends;
  const subhead = feed ? (en ? feed.subEn || feed.sub : feed.sub) : '';
  const pill = feed ? (en ? feed.pillEn || feed.pill : feed.pill) : '';

  useEffect(() => {
    let alive = true;
    fetch('/market-trends/feed.json')
      .then(r => (r.ok ? r.json() : null))
      .then(f => { if (alive && f) setFeed(f); })
      .catch(() => { /* dev server / offline — quiet state below */ });
    return () => { alive = false; };
  }, []);

  const fmtDate = (iso: string) => {
    try { return new Date(`${iso}T00:00:00`).toLocaleDateString(en ? 'en-GB' : undefined, { year: 'numeric', month: 'long', day: 'numeric' }); }
    catch { return iso; }
  };

  /* ── Card reader ── */
  const open = feed?.items.find(c => c.slug === openSlug) ?? null;
  if (open) {
    const v = textOf(open);
    return (
      <div style={PAGE}>
        <div style={{ maxWidth: 1160, width: '100%', margin: '0 auto', padding: '28px 48px 56px', boxSizing: 'border-box' }}>
          <SubTabs
            group="newsTrends"
            tabs={[{ id: 'news', label: t.nav.news }, { id: 'trends', label: t.nav.trends }]}
            active="trends"
            onSelect={id => app.go(id as 'news' | 'trends')}
            style={{ marginBottom: 18 }}
          />
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 22 }}>
            <span style={PAGE_TITLE}>{pageName}</span>
            {pill && <span style={PILL}>{pill}</span>}
          </div>
          <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 18, padding: '30px 40px 38px', maxWidth: 820 }}>
            <span
              className="hp-press"
              onClick={() => setOpenSlug(null)}
              style={{ color: '#0066cc', fontSize: 13.5, cursor: 'pointer', fontWeight: 500 }}
            >
              ← {pageName}
            </span>
            <h1 style={{ fontFamily: FD, fontSize: 28, fontWeight: 600, lineHeight: 1.25, letterSpacing: '-0.3px', margin: '14px 0 6px', color: '#1d1d1f' }}>
              {v.title}
            </h1>
            <div style={{ color: '#7a7a7a', fontSize: 13.5, marginBottom: 22 }}>
              {fmtDate(open.date)} · HeatPump DB
            </div>
            <img
              src={open.image}
              alt={v.title}
              style={{ width: '100%', borderRadius: 18, display: 'block', marginBottom: 26 }}
            />
            {v.body.map((p, i) => (
              <p key={i} style={{ fontSize: 16, lineHeight: 1.7, color: '#2a2a2c', margin: '0 0 15px' }}>{p}</p>
            ))}
            {v.sourceNote && (
              <p style={{ fontSize: 12.5, color: '#7a7a7a', borderTop: '1px solid #f0f0f0', paddingTop: 14, marginTop: 22 }}>
                {v.sourceNote}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* ── Feed grid ── */
  return (
    <div style={PAGE}>
      <div style={{ maxWidth: 1160, width: '100%', margin: '0 auto', padding: '28px 48px 56px', boxSizing: 'border-box' }}>
        <SubTabs
          group="newsTrends"
          tabs={[{ id: 'news', label: t.nav.news }, { id: 'trends', label: t.nav.trends }]}
          active="trends"
          onSelect={id => app.go(id as 'news' | 'trends')}
          style={{ marginBottom: 18 }}
        />
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
          <span style={PAGE_TITLE}>{pageName}</span>
          {pill && <span style={PILL}>{pill}</span>}
        </div>
        {subhead && <p style={{ color: '#6e6e73', fontSize: 15.5, margin: '10px 0 30px', maxWidth: 720 }}>{subhead}</p>}

        {feed && feed.items.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 24 }}>
            {feed.items.map(c => {
              const v = textOf(c);
              return (
                <div
                  key={c.slug}
                  className="hp-press"
                  onClick={() => { setOpenSlug(c.slug); }}
                  style={{ cursor: 'pointer', border: '1px solid #e8e8ed', borderRadius: 18, overflow: 'hidden', background: '#fff' }}
                >
                  <img src={c.image} alt={v.title} loading="lazy" style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block' }} />
                  <div style={{ padding: '14px 16px 18px' }}>
                    <div style={{ fontSize: 12.5, color: '#86868b', marginBottom: 5 }}>{fmtDate(c.date)}</div>
                    <div style={{ fontWeight: 650, fontSize: 16.5, color: '#1d1d1f', lineHeight: 1.3 }}>{v.title}</div>
                    {v.excerpt && <div style={{ fontSize: 13.5, color: '#6e6e73', marginTop: 6, lineHeight: 1.45 }}>{v.excerpt}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          feed && (
            <div style={{ border: '1px solid #e8e8ed', borderRadius: 18, padding: '26px 30px', maxWidth: 620 }}>
              <div style={{ fontWeight: 650, fontSize: 17, marginBottom: 12, color: '#1d1d1f' }}>{feed.coming}</div>
              <ul style={{ margin: 0, paddingLeft: 20, color: '#6e6e73', fontSize: 14.5, lineHeight: 2 }}>
                {feed.roadmap.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </div>
          )
        )}
      </div>
    </div>
  );
};
