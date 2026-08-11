# Market & Trends cards — content store

One JSON per market (`DE.json`, `GB.json`, `FR.json`, `PL.json`, `IT.json`),
each an array of card entries, newest first:

```json
[{
  "slug": "2026-07-beg-reform",          // URL: /market-trends/<slug>.html
  "date": "2026-07-21",
  "title": "<market-language title>",
  "image": "de-2026-07-beg-reform.png",  // file in ./images/
  "excerpt": "<1-2 sentences, market language>",
  "body": ["<paragraph>", "<paragraph>"],
  "sourceNote": "<optional: sources / disclaimer suffix>",

  "titleEn": "<English twin of the article — see below>",
  "excerptEn": "…", "bodyEn": ["…"], "sourceNoteEn": "…"
}]
```

THE INFOGRAPHIC IS NEVER TRANSLATED (owner 2026-08-11). The card image ships in
the market language on every surface; only the article text has an English
twin. Two reasons it exists: the LinkedIn audience these cards are written for
reads English, and each market app carries an EN toggle (`<xx>|EN`) whose
readers would otherwise hit a wall of German. The `*En` fields are optional —
without them both surfaces fall back to the market-language text, so an
untranslated card still renders. GB needs none (its market language is English).

Where the English shows up: `/market-trends/<slug>.en.html` (public, with
reciprocal hreflang and a language pill) and `feed.json` → the in-app
Market & Trends page, which follows the nav's language toggle.

WORKFLOW (owner → Claude Code, 2026-08-11): the owner drops the card PNG into
the marketing bridge (`HeatPump DB Marketing/market-trends-cards/<CC>/`) with a
Korean explanation in chat; Claude Code writes the market-language article
(content rules apply: no eligibility promises, no "not listed" wording, BAFA
only on DE), copies the image here, adds the entry, rebuilds, shows a preview,
and deploys on approval — then prepares the LinkedIn package pointing at the
card page with ?ref=li.

Images are copied into each market's dist by the builder — a market ships only
its own cards.
