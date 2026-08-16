/**
 * special-report-store — one place that knows the Special Report content
 * layout, so the page builder, the sitemap, the hub promo and the market
 * footers all read the same editions instead of each re-deriving the folder
 * convention.
 *
 * Layout: data_sources/special_report/<YYYY-MM>/
 *           article.json   published copy, one object per UI language
 *           report.html    the owner's self-contained interactive report
 *           img/           cover renders, one per report language
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Every edition with a published article, newest first. */
export function editions(root) {
  const store = join(root, 'data_sources', 'special_report');
  if (!existsSync(store)) return [];
  return readdirSync(store)
    .filter((d) => /^\d{4}-\d{2}$/.test(d)
      && statSync(join(store, d)).isDirectory()
      && existsSync(join(store, d, 'article.json')))
    .sort().reverse()
    .map((id) => ({
      id,
      dir: join(store, id),
      meta: JSON.parse(readFileSync(join(store, id, 'article.json'), 'utf8')),
    }));
}

/** The newest edition, or null when nothing is published yet. */
export const newestEdition = (root) => editions(root)[0] ?? null;

/** Copy for a language, falling back to English so a not-yet-translated
 *  edition still renders complete rather than empty. */
export const copyOf = (edition, lang) => edition.meta.copy[lang] ?? edition.meta.copy.en;
