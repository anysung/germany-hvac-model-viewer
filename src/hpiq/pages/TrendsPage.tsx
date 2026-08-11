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
  coming: string;
  roadmap: string[];
  items: TrendsCard[];
}

const PAGE: React.CSSProperties = {
  height: 'calc(100vh - 60px)', overflowY: 'auto', background: '#fff',
};

export const TrendsPage: React.FC<{ app: HpApp }> = ({ app }) => {
  const [feed, setFeed] = useState<TrendsFeed | null>(null);
  const [openSlug, setOpenSlug] = useState<string | null>(null);

  /** The nav's language toggle drives the article text. Keeping the OPEN card
   *  as a slug (not a snapshot) is what lets a switch mid-read re-render the
   *  same card in the other language instead of freezing the first one. */
  const en = app.lang === 'en';
  const textOf = (c: TrendsCard): TrendsText => (en && c.en ? c.en : c);
  const heading = feed ? (en ? feed.h1En || feed.h1 : feed.h1) : 'Market & Trends';
  const subhead = feed ? (en ? feed.subEn || feed.sub : feed.sub) : '';

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
        <div style={{ maxWidth: 760, margin: '0 auto', padding: '34px 22px 80px' }}>
          <span
            className="hp-press"
            onClick={() => setOpenSlug(null)}
            style={{ color: '#0066cc', fontSize: 14, cursor: 'pointer', fontWeight: 500 }}
          >
            ← {heading}
          </span>
          <h1 style={{ font: '700 32px/1.2 inherit', letterSpacing: '-.5px', margin: '18px 0 8px', color: '#1d1d1f' }}>
            {v.title}
          </h1>
          <div style={{ color: '#6e6e73', fontSize: 14, marginBottom: 22 }}>
            {fmtDate(open.date)} · HeatPump DB
          </div>
          <img
            src={open.image}
            alt={v.title}
            style={{ width: '100%', borderRadius: 18, display: 'block', marginBottom: 26 }}
          />
          {v.body.map((p, i) => (
            <p key={i} style={{ fontSize: 16.5, lineHeight: 1.7, color: '#2a2a2c', margin: '0 0 15px' }}>{p}</p>
          ))}
          {v.sourceNote && (
            <p style={{ fontSize: 13, color: '#86868b', borderTop: '1px solid #e8e8ed', paddingTop: 14, marginTop: 24 }}>
              {v.sourceNote}
            </p>
          )}
        </div>
      </div>
    );
  }

  /* ── Feed grid ── */
  return (
    <div style={PAGE}>
      <div style={{ maxWidth: 1060, margin: '0 auto', padding: '40px 22px 80px' }}>
        <h1 style={{ font: '700 34px/1.15 inherit', letterSpacing: '-.5px', margin: '0 0 8px', color: '#1d1d1f' }}>
          {heading}
        </h1>
        {subhead && <p style={{ color: '#6e6e73', fontSize: 16, margin: '0 0 34px', maxWidth: 680 }}>{subhead}</p>}

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
