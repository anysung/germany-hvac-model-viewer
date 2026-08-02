# Handoff: HeatpumpIQ — Germany-first heat pump product intelligence web app

## Overview
HeatpumpIQ is a subscription-based product intelligence platform for the German heat pump market. Users (installers, HVAC professionals, technical buyers, semi-technical consumers) search, filter, compare, and document heat pump products from a large database (BAFA list, EPREL/energy-label data, technical specs, data-sheet generation).

This package contains the approved UI/UX prototype for the full app shell and all pages. The goal for the implementing developer: **recreate these screens in the existing app codebase** (currently developed in VS Code with Claude Code), replacing the current UI while keeping existing data/backend logic.

## About the design files
The `.dc.html` files in this bundle are **design references created in HTML** — interactive prototypes showing intended look and behavior. They are NOT production code and depend on a proprietary runtime (`support.js`) that is not included; do not try to run or copy them directly. Instead:

- Read the markup inside `<x-dc>…</x-dc>` — it is plain HTML with inline styles; every color, size, spacing and font value is literal and authoritative.
- Read the `class Component` script at the bottom of the prototype file — it contains all mock data, page routing, filter/compare/inspector state logic, and computed styles for interactive states (selected rows, active chips, toggles). Treat it as a behavioral spec.
- `{{ name }}` placeholders are template holes bound to values returned by `renderVals()` in that script; `sc-if` / `sc-for` are conditionals/loops.
- Recreate everything in the target codebase's framework and conventions (React or whatever the existing app uses).

## Fidelity
**High-fidelity.** Colors, typography, spacing, radii, copy and interaction states are final design intent. Recreate pixel-perfectly, adapting only to the codebase's component conventions. Mock data (9 products) is illustrative — wire to the real database.

## Design language (applies everywhere)
A restrained, professional "product intelligence" aesthetic:

- **One accent color**: Action Blue `#0066cc` for every interactive element (buttons, links, active filters, selection markers, focus). No second accent.
- **Ink**: `#1d1d1f` (never pure black for text on light). Muted text `#7a7a7a`, softer body `#333`.
- **Surfaces**: white `#ffffff`, parchment `#f5f5f7` (panels, inspector, alternating bands), near-black `#272729` (dark tiles: funding-guide hero, news featured card, installer card), pure black `#000000` (global nav only).
- **Hairlines**: `#e0e0e0` card borders, `#f0f0f0` row dividers, `rgba(0,0,0,.08)` structural separators. **No shadows anywhere.**
- **Radii grammar** (never interpolate): pill `999px` = all actions/chips/search; `18px` = cards; `8px` = compact utility (doc banner, code block, label thumbnails); `4–6px` = checkboxes/small chips.
- **Typography**: SF Pro (Apple platforms) / Inter fallback. Headlines weight 600 with negative tracking (`-0.2 … -0.374px`); weights used: 400/600/700 only (no 500). Page titles 34px, panel titles 19–21px, body 13–14px in dense UI, table meta 10.5–12px. Sentence case everywhere; no emoji; trailing `›` chevron on links.
- **Motion**: press state `transform: scale(0.95)` on buttons; 0.18s opacity/color fades; no bounces.
- **On dark surfaces**: inline links use Sky Link Blue `#2997ff`; muted text `#ccc`.

Exact token definitions are in `tokens/*.css` (CSS custom properties — reuse them if convenient).

## App shell
- **Global nav**: black `#000`, height 46px, sticky. Left → right: wordmark "HeatpumpIQ" (15px, 600) + **Germany chip** (white rounded chip, 10.5px 600 ink text, with a 3px black/`#dd0000`/`#ffcc00` tricolor bar under the word — subtle national identity, no flags elsewhere); nav items (12.5px, active = white 600 on `rgba(255,255,255,.12)` pill, inactive = `rgba(255,255,255,.65)`); right side: "Data status: <date>", **DE|EN language toggle** (pill segmented, active = white bg + ink text), **account avatar** (23px circle, initials; navigates to Account; white when Account page active), **Sign out** pill button (bordered, logout icon + label).
- **Nav order**: Find product · Products · EU energy label · Data sheet · BAFA / KfW · Funding guide · News. Account is reached via the avatar only.
- **Footer**: parchment band, brand + "Germany edition · data snapshot <date>" + disclaimer "Product data is informational — verify BAFA, KfW and EPREL sources before contractual use."

## Screens

### 1. Find product (fast model lookup)
- Parchment hero: "Find a product." (40px display), subtitle, 660px pill search bar with inline blue "Search" button, helper line with example queries.
- **Empty state**: centered muted search icon + "Start typing to look up a model." Search is live (min 2 chars), matching model/manufacturer/ODU/BAFA-ID substrings. **No-match state** with suggestion to browse Products.
- **Results**: 3-column card grid. Card (18px radius, hairline): manufacturer eyebrow, model name (19px display 600), "Outdoor unit: <odu>", compare checkbox top-right (18px, blue when checked), badge row (BAFA listed / EU label <class> or "EPREL not matched" / refrigerant), 2×2 spec grid (Capacity 55°C, Energy class, SCOP, Sound power — 11px label / 16px 600 value), actions: blue pill "View details ›" (→ Products with row selected) + text link "Data sheet ›" (→ Data sheet with model preselected).

### 2. Products (main catalog — filter rail + table + inspector + compare tray)
Workspace has a **1240px min-width with horizontal scroll** on narrower viewports.
- **Toolbar**: "Products" title, Residential/Commercial segmented pill (Residential active, dark fill), BAFA-snapshot notice chip, right: "<n> of 5,017 residential products", sort indicator "Sort: COP A2/W35".
- **Left filter rail (248px)**: APPLIED chips (dark `#1d1d1f` pills with ×, removable; "Clear all" link; "No filters applied" fallback) · REFRIGERANT chips (R290/R32/R410A, toggle; active = blue fill) · MANUFACTURER checkboxes with counts (functional multi-select) · CAPACITY dual-handle slider (visual) · FÖRDERUNG · FUNDING section: "BAFA-listed only" toggle + **mandatory disclaimer** (11px muted, hairline-separated): *"Between regular updates, list entries may change at a manufacturer's request or by decision of the issuing authority. All data is for reference only — final verification against the official sources is the user's responsibility."*
- **Table**: grid columns `34px 2.2fr 1fr 0.9fr 0.8fr 0.7fr 0.7fr 1.2fr` (checkbox, MODEL+BAFA-ID, MANUFACTURER, KW(55°), COP A2 (sorted, bold), SCOP, NOISE, STATUS badges: BAFA / energy class / "Sheet ready"). Row: 12px padding, `#f0f0f0` divider; selected row = parchment bg + `inset 2px 0 0 #0066cc`. Row click opens inspector; checkbox click toggles compare (stopPropagation). Two **skeleton rows** (gray `#f0f0f0` rounded bars, second at 50% opacity) below data + streaming hint text — perceived-speed pattern.
- **Compare tray** (docked bottom, frosted parchment `rgba(245,245,247,.92)` + backdrop blur): "COMPARE" label, chip per selected product (white pill, short name, ×), remaining-slots text, right-aligned CTA "Compare n ›" (blue when ≥2 selected, `#d2d2d7` disabled otherwise). Max 4 products. CTA expands an **inline comparison panel**: label column (Capacity 55°C, COP A7/W35, COP A2/W35, SCOP, Sound power, Refrigerant, Energy class, BAFA ID) + one column per product with remove links. There is deliberately **no separate Comparison page**.
- **Right inspector (400px, parchment)**: manufacturer + BAFA ID eyebrow, model title (21px), close ×; white cards: 3×3 KPI grid (Capacity/SCOP/Class/COP A7/COP A2/COP −7/Refrigerant+kg/Sound/Type); FÖRDERSTATUS · FUNDING card (BAFA snapshot status, BEG EM note, "verify before quoting", "Open BAFA entry ›"); EU ENERGY LABEL card (matched: classes W35/W55 + "Open label record ›"; unmatched: muted pending note); actions: blue pill "Data sheet ›", secondary "Add to/Remove from compare".

### 3. EU energy label (EPREL-style records)
Same workspace pattern as Products (1240px min-width): toolbar with "EPREL-style records" chip + record count; left rail with ENERGY CLASS chips (A+++/A++/A+, functional filter), EPREL STATUS checkboxes, "About this data" note; table columns `2.2fr 1fr 0.8fr 0.8fr 0.9fr 1.1fr` (MODEL+ODU, MANUFACTURER, CLASS W35 bold, CLASS W55, SOUND POWER, EPREL matched/not matched); always-visible **label inspector**: monochrome energy-class placard (bordered card, "ENERGY" microcopy, 30px class letter, "space heating W35"), key figures, SOURCE & VERIFICATION card (EPREL status, registration ID `EPREL-<digits>`, last updated, data completeness %, info-sheet availability), actions "Energy label sheet ›" (→ Data sheet in label mode) and "Open product profile".

### 4. Data sheet studio (key USP)
- Toolbar: "Data sheet studio" + segmented control **Product data sheet | EU energy label sheet** (active = dark fill), right: "Prints this month: 2 / 20".
- **Left column (348px)**, 3-step flow: 1·SELECT MODEL (search field + selectable model list, selected = parchment + blue inset bar) → 2·INCLUDED SECTIONS (toggle switches, 32×19px pill, blue when on; section set differs per mode) → 3·EXPORT (blue "Print ›", secondary "Download PDF", trust note).
- **Preview (parchment canvas, centered 680px white document)**: header "HeatpumpIQ" + doc-type line (`TECHNICAL PRODUCT DATA SHEET — RESIDENTIAL` or `EU ENERGY LABEL INFORMATION SHEET — RESIDENTIAL`), right meta (generated date, BAFA ID + EPREL ID, source snapshot); dark ink banner with model + manufacturer; sections as label/value rows with hairline dividers, section headers 11px 600 letterspaced in Action Blue: PRODUCT IDENTIFICATION · (label mode: EU ENERGY LABEL with class placard) · PERFORMANCE DATA · ENVIRONMENTAL & ACOUSTIC · BAFA / FUNDING STATUS (product mode only) · SOURCE & VERIFICATION (muted legal note: generated documentation, not an official certificate). Sections show/hide live with the toggles.

### 5. BAFA / KfW (Germany page)
Parchment hero "BAFA / KfW." + subtitle; content max-width 1160px:
- 3 status cards: BEG EM (Up to 40%), KfW 458 (Open), BAFA list snapshot (date + count).
- "Recent changes." timeline card: date + CONFIRMED/GUIDANCE bordered badge + one-line entry (guidance rows muted) — confirmed info visually separated from guidance.
- Two audience cards: dark tile "WHAT INSTALLERS SHOULD KNOW" (Sky Link Blue link) + light "WHAT HOMEOWNERS SHOULD KNOW".
- **"Official sources."**: exactly three cards — **BAFA agency homepage (bafa.de)**, **KfW grant 458 (kfw.de)**, **BMWK ministry (bmwk.de)**. Deliberately NO deep links to the BAFA heat pump list or EPREL database (competitive protection). Closing disclaimer line.

### 6. Funding guide (educational)
Dark hero "Funding, step by step." with **For homeowners | For installers** pill tabs (content of steps + checklist switches per audience). Content: 5-step numbered journey (blue numbered circles + connector hairline); interactive **preparation checklist** (checkbox toggles, checked = blue + strikethrough muted text; "Download PDF ›"; legal-care note); video placeholder card (16:9 dark block + play circle) + "Good to know" card with cross-link "Show R290 products ›" (navigates to Products with R290 filter applied); FAQ accordion (chevron rotates 90°, one open by default). Careful language throughout — guide/prepare/verify, never legal advice.

### 7. News (curated, low-frequency)
"Market intelligence." + "Curated · updated 2–3× monthly" chip; dark featured card (category badge, 28px headline, dek, Sky Link Blue "Read the briefing ›"); 3 article cards (category badge, 18px headline, dek, date + read time); parchment newsletter band with blue "Subscribe ›".

### 8. Account (via avatar)

> **Superseded, 2026-08-02 — read this before following the card list below.**
> This section was written when app-store distribution was still planned. **It
> no longer is: HeatPump DB is web-only and billed through Paddle (merchant of
> record).** The original text is kept for design provenance, but the
> app-store clauses are void:
> * **No "Restore purchases" button.** It was a store requirement; there is no
>   store. Do not reintroduce it.
> * Plan changes and cancellation happen **in-app / via the Paddle billing
>   portal**, never "in Google Play / App Store". Plan, term and seats are
>   fixed for a paid period and change at the next renewal
>   (`subscriptionChangeRequests`).
> * The delete-account note must reference an **active subscription under
>   Billing**, not a store subscription.
> * **No "Use on the web" card** and no `/enter` route — the web *is* the
>   product. (`MARKET_ENTER_URL` was removed on 2026-08-02.)
> * Pricing/trial wording here is stale: see `src/config/subscriptionPlans.ts`
>   (Professional / Team 3 / Team 5 × monthly / 6-month / annual). Checkout
>   charges immediately; the free first week is granted at signup, not by a
>   plan.
> The live implementation is `src/hpiq/pages/AccountPage.tsx` +
> `accountParts.tsx`; where the two disagree, the implementation wins.

Parchment header "Account." Content max-width 1160px:
- **Subscription card**: plan badge + status, renewal date and price, "Manage plan ›", side panel of included features.
- **Profile card**: email / display name / company / role rows + "Edit profile ›".
- **App language card**: segmented control (market's own languages; see `src/hpiq/market.ts`).
- **Sign-in methods card**: email & password / Google / Apple, connect + disconnect (added 2026-08-02).
- **Email & password card**: secure setup link by email.
- **Support card**: 1–3 business days reply, "Contact support & view replies ›".
- **Terms & policies card**: Privacy policy › / Terms of use › / **Impressum ›** (German legal requirement).
- **Delete account card**: permanence warning, note that an active subscription must be cancelled separately under Billing, bordered "Delete account" button (kept quiet/ink — no red accent in this design system).

## Interactions & state (summary)
State: `page`, `query`, `compare[]` (max 4), `selectedId`, `labelSelId`, `showCompare`, `dsMode`, `dsId`, `dsSections{}`, `refFilter`, `classFilter`, `mfrFilter[]`, `guideTab`, `checked{}`, `faqOpen`, `lang`. All cross-page links preserve context (e.g. Find→Products selects the row; label inspector→Data sheet switches to label mode with the model preselected). Selection/compare updates are optimistic (instant). Loading is expressed via skeleton rows, never spinners or blocking screens.

## Perceived-performance requirements
Skeleton rows + streamed/virtualized lists (target 60fps at 5,000+ rows), no pagination, inline inspector instead of page navigation, sticky filter rail, frosted sticky bars (`backdrop-filter: blur(20px) saturate(180%)`), persistent compare tray.

## Assets
No raster assets. All icons are inline SVG, monoline 1.3–1.5px stroke, `currentColor` (search, chevron, check, play, sign-out). Energy-class placards are typographic (monochrome), not the colored EU label graphic — attach official labels separately for legal use.

## Screenshots
Reference captures of each page (as rendered in the prototype) are in `screenshots/`:
`01-find-product.png` · `02-products.png` (with inspector + compare tray) · `03-eu-energy-label.png` · `04-data-sheet.png` · `05-bafa-kfw.png` · `06-funding-guide.png` · `07-news.png` · `08-account.png`

## Files in this bundle
- `HeatpumpIQ Prototype.dc.html` — the full approved prototype (markup = visual spec; bottom `class Component` script = data model + behavior spec).
- `HeatpumpIQ Concepts.dc.html` — earlier concept exploration (A/B/C); background context only.
- `tokens/colors.css`, `tokens/typography.css`, `tokens/spacing.css`, `tokens/shapes.css` — design-token definitions as CSS custom properties.
