/**
 * Installation videos — official manufacturer install/commissioning videos for
 * this market (owner, 2026-09-02).
 *
 * CURATION CONTRACT (the page states it, this comment enforces it):
 *   - OFFICIAL manufacturer channels only. Third-party installer videos are
 *     not admitted: a listing here reads as vetted by us, and installation
 *     involves electrical work and F-gas-certified refrigerant handling.
 *   - Sourcing priority follows market share per market; DISPLAY is
 *     alphabetical by manufacturer, because a ranking would read as product
 *     endorsement (same neutrality rule as the catalogue).
 *   - The store is data_sources/install_videos/videos.json — committed, every
 *     entry oEmbed-verified, re-checked monthly by verify-install-videos.mjs.
 *
 * PRIVACY: click-to-load. The page renders YouTube's thumbnail (a static
 * image) and loads the player iframe — youtube-nocookie.com — only after the
 * user clicks. No YouTube cookies before an explicit interaction.
 *
 * COPYRIGHT: thumbnails come from YouTube's own CDN as part of the embed
 * facade; frames are never captured or re-hosted.
 */
import React, { useState } from 'react';
import { HpApp } from '../appState';
import { tr } from '../i18n';
import { FD, sectionLabel } from '../ui';
import { ACTIVE_COUNTRY } from '../../config/countryProfiles';
import store from '../../../data_sources/install_videos/videos.json';

type Video = {
  manufacturer: string; family: string; videoId: string; title: string;
  channel: string; audio: string; subs: string | null; scope: string; segment?: string;
  tier?: 'official' | 'third_party'; uploadYear?: number; captions?: string[];
};

const AUDIO_NAME: Record<string, string> = { de: 'Deutsch', en: 'English', fr: 'Français', pl: 'Polski', it: 'Italiano' };

const chip: React.CSSProperties = {
  border: '1px solid #e0e0e0', borderRadius: 999, padding: '2px 10px',
  fontSize: 10.5, background: '#fff', whiteSpace: 'nowrap',
};

/** Thumbnail facade → nocookie iframe on click. */
const VideoCard: React.FC<{ v: Video; t: ReturnType<typeof tr> }> = ({ v, t }) => {
  const [playing, setPlaying] = useState(false);
  return (
    <div style={{ border: '1px solid #e0e0e0', borderRadius: 16, overflow: 'hidden', background: '#fff', display: 'flex', flexDirection: 'column' }}>
      <div style={{ position: 'relative', aspectRatio: '16 / 9', background: '#000' }}>
        {playing ? (
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${v.videoId}?autoplay=1&rel=0`}
            title={v.title}
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
          />
        ) : (
          <div onClick={() => setPlaying(true)} style={{ position: 'absolute', inset: 0, cursor: 'pointer' }} data-testid="video-facade">
            <img
              src={`https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`}
              alt={v.title}
              loading="lazy"
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: 0.92 }}
            />
            <span style={{
              position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
              width: 58, height: 40, borderRadius: 12, background: 'rgba(0,0,0,.72)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="18" height="20" viewBox="0 0 18 20" aria-hidden><path d="M1 1.6v16.8c0 1.2 1.3 2 2.4 1.4l14-8.4c1-.6 1-2.2 0-2.8l-14-8.4C2.3-.4 1 .4 1 1.6z" fill="#fff" /></svg>
            </span>
          </div>
        )}
      </div>
      <div style={{ padding: '13px 16px 15px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.35 }}>{v.title}</span>
        <span style={{ fontSize: 11.5, color: '#7a7a7a' }}>{v.family} · {v.channel}</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          <span style={chip}>{AUDIO_NAME[v.audio] ?? v.audio.toUpperCase()}</span>
          <span style={chip}>{(t.install.scope as Record<string, string>)[v.scope] ?? v.scope}</span>
          {/* The refrigerant transition makes age part of the meaning — the
              year is always visible, exactly so a 2011 install reads as one. */}
          {v.uploadYear != null && <span style={chip}>{v.uploadYear}</span>}
          {/* CC badge ONLY for a detected creator-provided track (never
              auto-translate — house rule). */}
          {(v.captions ?? []).filter(c => c !== v.audio).map(c => (
            <span key={c} style={chip}>CC · {AUDIO_NAME[c] ?? c.toUpperCase()}</span>
          ))}
          {v.segment === 'commercial' && <span style={chip}>{t.products.commercial}</span>}
          {v.tier === 'third_party' && (
            <span style={{ ...chip, background: '#f0f0f2', color: '#6e6e73', borderColor: '#d8d8dd' }}>{t.install.thirdBadge}</span>
          )}
        </div>
        <a
          href={`https://www.youtube.com/watch?v=${v.videoId}`}
          target="_blank" rel="noopener noreferrer"
          style={{ fontSize: 12, color: '#0066cc', textDecoration: 'none' }}
        >
          {t.install.watchOn}
        </a>
      </div>
    </div>
  );
};

const Grid: React.FC<{ videos: Video[]; t: ReturnType<typeof tr> }> = ({ videos, t }) => {
  // Alphabetical by manufacturer — a listing order must not read as a ranking.
  const sorted = [...videos].sort((a, b) => a.manufacturer.localeCompare(b.manufacturer) || a.family.localeCompare(b.family));
  const byMfr = sorted.reduce<Record<string, Video[]>>((acc, v) => { (acc[v.manufacturer] ??= []).push(v); return acc; }, {});
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
      {Object.entries(byMfr).map(([mfr, vids]) => (
        <div key={mfr} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <span style={sectionLabel}>{mfr}</span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(300px, 100%), 1fr))', gap: 16 }}>
            {vids.map(v => <VideoCard key={v.videoId} v={v} t={t} />)}
          </div>
        </div>
      ))}
    </div>
  );
};

export const InstallPage: React.FC<{ app: HpApp }> = ({ app }) => {
  const t = tr(app.lang);
  const markets = (store as { markets: Record<string, (Video & { unavailableSince?: string })[]> }).markets;
  // The monthly health check stamps entries whose video has gone away; they
  // stay in the store (editorial removal is a human decision) but never render.
  const alive = (l: (Video & { unavailableSince?: string })[] = []) => l.filter(v => !v.unavailableSince);
  const mine = alive(markets[ACTIVE_COUNTRY.code]);
  const local = mine.filter(v => v.tier !== 'third_party');
  const third = mine.filter(v => v.tier === 'third_party');
  // GB's market list is already English — the EU section would duplicate its
  // sourcing tier, so it still renders (extra manufacturers), minus dupes.
  const seen = new Set(mine.map(v => v.videoId));
  const eu = alive(markets.EU).filter(v => !seen.has(v.videoId) && v.tier !== 'third_party');

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <div data-tour="install" style={{ background: '#f5f5f7', padding: 'clamp(20px, 4vw, 44px) clamp(16px, 4vw, 48px) clamp(18px, 3vw, 36px)', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={{ fontFamily: FD, fontSize: 'clamp(25px, 4vw, 34px)', fontWeight: 600, letterSpacing: '-0.374px' }}>{t.install.title}</span>
        <span style={{ fontSize: 17, color: '#7a7a7a', letterSpacing: '-0.374px', maxWidth: 680 }}>{t.install.sub}</span>
        <span style={{ fontSize: 12, color: '#7a7a7a', maxWidth: 680, lineHeight: 1.5 }}>{t.install.criteria}</span>
      </div>
      <div style={{ maxWidth: 1160, width: '100%', margin: '0 auto', padding: '24px clamp(16px, 4vw, 48px) 48px', display: 'flex', flexDirection: 'column', gap: 30, boxSizing: 'border-box' }}>
        {local.length > 0 && <Grid videos={local} t={t} />}
        {eu.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, borderTop: local.length ? '1px solid #ececf0' : undefined, paddingTop: local.length ? 26 : 0 }}>
            <span style={{ fontFamily: FD, fontSize: 19, fontWeight: 600 }}>{t.install.euTitle}</span>
            <Grid videos={eu} t={t} />
          </div>
        )}
        {third.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid #ececf0', paddingTop: 26 }} data-testid="third-party-videos">
            <span style={{ fontFamily: FD, fontSize: 19, fontWeight: 600 }}>{t.install.thirdTitle}</span>
            <span style={{ fontSize: 12, color: '#7a7a7a', lineHeight: 1.55, maxWidth: 760 }}>{t.install.thirdNote}</span>
            <div style={{ marginTop: 6 }}><Grid videos={third} t={t} /></div>
          </div>
        )}
        {/* The professional disclaimer — the one paragraph that must never be
            trimmed away: manuals and regulations outrank any video, and
            refrigerant work belongs to certified hands. */}
        <span style={{ fontSize: 11.5, color: '#7a7a7a', lineHeight: 1.6, borderTop: '1px solid #ececf0', paddingTop: 14 }}>
          {t.install.disclaimer}
        </span>
      </div>
    </div>
  );
};
