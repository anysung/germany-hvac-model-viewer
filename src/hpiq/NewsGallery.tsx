import React, { useCallback, useEffect, useRef, useState } from 'react';

/**
 * NewsGallery — the standard way an article shows more than one picture.
 *
 * WHY A COMPONENT AND NOT MARKUP IN EACH PAGE
 * Desktop NewsPage, the mobile reader and the generated public page all show
 * the same article. Three hand-rolled carousels drift: one gets the dots, one
 * forgets the keyboard, and an article that reads correctly on a laptop loses
 * two of its four panels on a phone. One component, one behaviour.
 *
 * WHY SCROLL-SNAP RATHER THAN A TRANSFORM CAROUSEL
 * The track is a real horizontally scrolling element with snap points, so the
 * touch swipe, the trackpad gesture and the arrow buttons are all the same
 * mechanism — nothing to re-implement per input. The dots read the scroll
 * position rather than owning it, which means they cannot disagree with what
 * is on screen after a flick.
 *
 * DEGRADES TO EXACTLY WHAT IT REPLACED: one image renders as a plain <img>,
 * with no arrows and no dots. An article that has always had a single picture
 * looks untouched.
 */
export function NewsGallery({ images, alt = '', rounded = 3, marginTop = 22 }: {
  images: string[];
  alt?: string;
  rounded?: number;
  marginTop?: number;
}) {
  const list = (images ?? []).filter(Boolean);
  const track = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState(0);

  /* The scroll position is the source of truth — read it, never assume it. */
  const sync = useCallback(() => {
    const el = track.current;
    if (!el) return;
    const w = el.clientWidth || 1;
    setAt(Math.max(0, Math.min(list.length - 1, Math.round(el.scrollLeft / w))));
  }, [list.length]);

  const go = useCallback((i: number) => {
    const el = track.current;
    if (!el) return;
    const next = Math.max(0, Math.min(list.length - 1, i));
    el.scrollTo({ left: next * el.clientWidth, behavior: 'smooth' });
    setAt(next);
  }, [list.length]);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    el.addEventListener('scroll', sync, { passive: true });
    return () => el.removeEventListener('scroll', sync);
  }, [sync]);

  if (!list.length) return null;
  if (list.length === 1) {
    return <img src={list[0]} alt={alt} style={{ width: '100%', height: 'auto', display: 'block', borderRadius: rounded, marginTop }} />;
  }

  const arrow: React.CSSProperties = {
    position: 'absolute', top: '50%', transform: 'translateY(-50%)',
    width: 44, height: 44, borderRadius: '50%', border: 'none',
    background: 'rgba(12,26,45,.62)', color: '#fff', fontSize: 22, lineHeight: '42px',
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
    backdropFilter: 'blur(2px)', padding: 0,
  };

  return (
    <div style={{ marginTop }}>
      <div
        style={{ position: 'relative' }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') { e.preventDefault(); go(at + 1); }
          if (e.key === 'ArrowLeft') { e.preventDefault(); go(at - 1); }
        }}
        tabIndex={0}
        role="group"
        aria-roledescription="carousel"
        aria-label={`${list.length} images`}
      >
        <div
          ref={track}
          style={{
            display: 'flex', overflowX: 'auto', scrollSnapType: 'x mandatory',
            borderRadius: rounded, scrollbarWidth: 'none',
          }}
        >
          {list.map((src, i) => (
            <img
              key={src}
              src={src}
              alt={alt ? `${alt} (${i + 1}/${list.length})` : ''}
              /* Off-screen panels stay out of the first paint; the lead image
                 does not, because it is what the reader is waiting for. */
              loading={i === 0 ? 'eager' : 'lazy'}
              style={{ width: '100%', flex: '0 0 100%', height: 'auto', display: 'block', scrollSnapAlign: 'start' }}
            />
          ))}
        </div>

        {at > 0 && (
          <button type="button" aria-label="Previous image" onClick={() => go(at - 1)} style={{ ...arrow, left: 10 }}>‹</button>
        )}
        {at < list.length - 1 && (
          <button type="button" aria-label="Next image" onClick={() => go(at + 1)} style={{ ...arrow, right: 10 }}>›</button>
        )}
      </div>

      {/* The visible dot stays small; the BUTTON is 44px so a thumb can hit it.
          An 8px tap target is a control only a mouse can use. */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 2, marginTop: 2 }}>
        {list.map((src, i) => (
          <button
            key={src}
            type="button"
            aria-label={`Image ${i + 1} of ${list.length}`}
            aria-current={i === at}
            onClick={() => go(i)}
            style={{
              width: 44, height: 44, padding: 0, border: 'none', background: 'none',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <span style={{
              display: 'block', width: i === at ? 22 : 9, height: 9, borderRadius: i === at ? 5 : '50%',
              background: i === at ? '#1d1d1f' : '#c9ccd1',
              transition: 'width .18s ease, background .18s ease',
            }} />
          </button>
        ))}
      </div>
    </div>
  );
}

/** The ordered picture set for an article: the explicit list when the article
 *  carries one, otherwise the single lead image it has always had. */
export const galleryOf = (item: { images?: string[]; imageUrl?: string }): string[] =>
  (item.images?.length ? item.images : item.imageUrl ? [item.imageUrl] : []);
