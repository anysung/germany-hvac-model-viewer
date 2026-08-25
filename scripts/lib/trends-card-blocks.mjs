/**
 * trends-card-blocks — the block vocabulary a Market & Trends card is built from.
 *
 * WHY BLOCKS
 * The card FRAME is fixed brand furniture (market-tinted ground, side rail with
 * the domain, flag badge, month, title, footer lockup) so every market's cards
 * are recognisably the same product. What sits inside is not: a market-data
 * story wants bars, a rules change wants before/after, a phased reform wants a
 * timeline, a closing window wants a this-year/next-year comparison. Forcing
 * all five into one table layout is how infographics become wallpaper nobody
 * reads. Each spec therefore composes its own sections from these blocks.
 *
 * Every block returns HTML and reads its colours from the market theme, so a
 * new market inherits the whole vocabulary by adding one palette entry.
 */

/** Landing-page palettes, market for market (src/components/auth/AuthShell.tsx
 *  MARKET_BG). The card ground is the same hue family the visitor already saw
 *  on that market's landing page — the card should look like it came from the
 *  site it links to. */
export const THEMES = {
  DE: { base: '#0a1712', mid: '#0e2019', deep: '#071009', a: '#34d399', b: '#22d3ee' },
  GB: { base: '#081322', mid: '#0c1a2e', deep: '#050c18', a: '#38bdf8', b: '#818cf8' },
  FR: { base: '#0b1128', mid: '#111a38', deep: '#070b1c', a: '#60a5fa', b: '#fb7185' },
  PL: { base: '#1c0a11', mid: '#2a1019', deep: '#12060b', a: '#fb7185', b: '#f9a8d4' },
  IT: { base: '#0a1a0f', mid: '#10241a', deep: '#061109', a: '#4ade80', b: '#f87171' },
};

export const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');

/** Line icons, stroked in whatever colour the caller passes. */
export const IC = (name, color, size = 44) => {
  const P = {
    'euro-hand': `<circle cx="14" cy="7" r="4.6"/><path d="M12.2 5.9h3.6M12.2 8.1h3.6M15.8 4.7c-1.9-.8-3.7.6-3.7 2.3s1.8 3.1 3.7 2.3"/><path d="M6 16.8c1.8-1.3 3.6-1.5 5.8-.8l3.2 1c1.3.4 1.1 2.1-.4 2.1h-4.4"/><rect x="2.8" y="15.2" width="2.4" height="5.6" rx=".8"/>`,
    scales: `<path d="M12 4v14M6.5 6.5h11M12 18h4M8 18h4"/><path d="M6.5 6.5 4 12h5L6.5 6.5zM17.5 6.5 15 12h5l-2.5-5.5z"/><path d="M4 12c0 1.4 1.1 2.4 2.5 2.4S9 13.4 9 12M15 12c0 1.4 1.1 2.4 2.5 2.4S20 13.4 20 12"/>`,
    people: `<circle cx="8" cy="8" r="2.6"/><circle cx="16" cy="8" r="2.6"/><path d="M3.5 18c.5-3 2.2-4.5 4.5-4.5S12 15 12.5 18M11.5 18c.5-3 2.2-4.5 4.5-4.5s4 1.5 4.5 4.5"/>`,
    person: `<circle cx="12" cy="8" r="3"/><path d="M6 19c.6-3.4 2.8-5.2 6-5.2s5.4 1.8 6 5.2"/>`,
    gift: `<rect x="4" y="10" width="16" height="10" rx="1.4"/><path d="M12 10v10M4 13.5h16M12 10c-2 0-4.5-.7-4.5-2.8C7.5 5.6 9 5 10 5.4c1.4.6 2 2.6 2 4.6zm0 0c2 0 4.5-.7 4.5-2.8C16.5 5.6 15 5 14 5.4c-1.4.6-2 2.6-2 4.6z"/>`,
    bulb: `<path d="M12 3.5a5.5 5.5 0 0 1 3.2 10c-.7.5-1.2 1.2-1.2 2v.5h-4v-.5c0-.8-.5-1.5-1.2-2A5.5 5.5 0 0 1 12 3.5z"/><path d="M10 18.5h4M10.7 20.5h2.6"/>`,
    'hp-unit': `<rect x="2.5" y="7" width="14" height="10" rx="1.5"/><circle cx="8" cy="12" r="3.1"/><path d="M8 10v4M6.3 11l3.4 2M9.7 11l-3.4 2"/><path d="M18.5 9.5h3M18.5 12h3M18.5 14.5h3"/><path d="M5 17v1.6M14 17v1.6"/>`,
    house: `<path d="M4 11.5 12 5l8 6.5M6 10v9h12v-9"/><rect x="10" y="13.5" width="4" height="5.5"/>`,
    leaf: `<path d="M6 18C6 10 11 6 19 5.5c.6 8-3.5 13-11 12.5-.7 0-2-.5-2 0z"/><path d="M6.5 17.5C9 13 12 10.5 16 8.5"/>`,
    chart: `<path d="M4 19V5M4 19h16"/><rect x="7" y="12" width="3" height="7"/><rect x="12" y="8.5" width="3" height="10.5"/><rect x="17" y="5.5" width="3" height="13.5"/>`,
    trend: `<path d="M4 17l5-5 3.5 3.5L20 8"/><path d="M15 8h5v5"/>`,
    sound: `<path d="M4 9.5v5h3.5L12 19V5L7.5 9.5H4z"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6M18 6.5a7.8 7.8 0 0 1 0 11"/>`,
    ruler: `<rect x="2.5" y="8" width="19" height="8" rx="1.4"/><path d="M7 8v3M11 8v4M15 8v3M19 8v4"/>`,
    shield: `<path d="M12 3.5l7 2.6v5.4c0 4.3-2.9 7.7-7 9-4.1-1.3-7-4.7-7-9V6.1l7-2.6z"/><path d="m8.8 12 2.2 2.2 4.2-4.4"/>`,
    stamp: `<path d="M9 3.5h6a2 2 0 0 1 2 2.2l-.5 4.3h-9L7 5.7a2 2 0 0 1 2-2.2z"/><rect x="4" y="14" width="16" height="3" rx="1"/><path d="M5 17v3.5h14V17"/>`,
    clock: `<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5.4l3.4 2"/>`,
    calendar: `<rect x="4" y="6" width="16" height="14" rx="1.6"/><path d="M4 10.5h16M8.5 4v4M15.5 4v4"/>`,
    check: `<circle cx="12" cy="12" r="8.5"/><path d="m8 12.5 2.6 2.6L16 9.5"/>`,
    cross: `<circle cx="12" cy="12" r="8.5"/><path d="m9 9 6 6M15 9l-6 6"/>`,
    doc: `<path d="M6 3.5h7.5L18.5 8v12.5h-13z"/><path d="M13.5 3.5V8h5"/><path d="M8.5 12.5h7M8.5 15.5h7"/>`,
    coins: `<ellipse cx="12" cy="6.5" rx="6.5" ry="2.6"/><path d="M5.5 6.5v5c0 1.4 2.9 2.6 6.5 2.6s6.5-1.2 6.5-2.6v-5"/><path d="M5.5 11.5v5c0 1.4 2.9 2.6 6.5 2.6s6.5-1.2 6.5-2.6v-5"/>`,
    window: `<rect x="4" y="4" width="16" height="16" rx="1.4"/><path d="M12 4v16M4 12h16"/>`,
    key: `<circle cx="8" cy="12" r="4"/><path d="M12 12h9M17.5 12v3.5M20 12v2.5"/>`,
    factory: `<path d="M3 20V11l5 3V11l5 3V6.5h3.5L18 14l3 1.5V20z"/><path d="M3 20h18"/>`,
    snow: `<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9"/><path d="m10 5 2-2 2 2M10 19l2 2 2-2M4.9 9.9 4.2 7.5 6.6 6.8M17.4 17.2l2.4-.7-.7-2.4M6.6 17.2l-2.4-.7.7-2.4M19.1 9.9l.7-2.4-2.4-.7"/>`,
    percent: `<circle cx="8" cy="8.5" r="2.6"/><circle cx="16" cy="15.5" r="2.6"/><path d="M17.5 6 6.5 18"/>`,
    plug: `<path d="M9 3v5M15 3v5"/><path d="M6.5 8h11v3a5.5 5.5 0 0 1-11 0z"/><path d="M12 16.5V21"/>`,
  }[name] ?? `<circle cx="12" cy="12" r="8"/>`;
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${P}</svg>`;
};

/* ── Blocks ───────────────────────────────────────────────────────────────
   Each takes (block, theme) and returns HTML. `flex` lets a block state how
   much of a side-by-side row it should take. */

const panel = (inner, T, extra = '') =>
  `<div class="pnl" style="${extra}">${inner}</div>`;

const head = (icon, title, T) =>
  `<div class="ph">${icon ? IC(icon, T.a, 40) : ''}<b>${esc(title)}</b></div>`;

/** hero — one number that carries the whole card. */
const hero = (b, T) => `
  <div class="hero">
    ${b.icon ? `<span class="hico">${IC(b.icon, T.a, 92)}</span><span class="hsep"></span>` : ''}
    <div>
      <div class="hbig">${esc(b.pre ?? '')} <b>${esc(b.big)}</b> ${esc(b.post ?? '')}</div>
      ${b.caption ? `<div class="hcap">${b.caption.map(esc).join('<br>')}</div>` : ''}
    </div>
    ${b.side ? `<div class="hside"><span>${esc(b.side.value)}</span><small>${esc(b.side.label)}</small></div>` : ''}
  </div>`;

/** stats — a row of equal tiles: value over label. */
const stats = (b, T) => `
  <div class="stats">
    ${b.items.map((s) => `
      <div class="stat">
        <span class="sv" style="color:${s.accent === 2 ? T.b : T.a}">${esc(s.value)}</span>
        <span class="sl">${esc(s.label)}</span>
        ${s.note ? `<span class="sn">${esc(s.note)}</span>` : ''}
      </div>`).join('')}
  </div>`;

/** bars — a small column chart; the highlighted bar carries the story. */
const bars = (b, T) => {
  const max = Math.max(...b.items.map((i) => i.v));
  return panel(`
    ${head(b.icon, b.title, T)}
    <div class="bars">
      ${b.items.map((i) => {
        const h = Math.round((i.v / max) * 100);
        const c = i.hi ? T.a : 'rgba(255,255,255,.22)';
        return `<div class="bar">
          <span class="bv" style="color:${i.hi ? T.a : 'rgba(255,255,255,.7)'}">${esc(i.value)}</span>
          <span class="bcol" style="height:${h}%;background:${c}${i.dashed ? ';border:1.5px dashed ' + T.a + ';background:transparent' : ''}"></span>
          <span class="bl">${esc(i.label)}</span>
        </div>`;
      }).join('')}
    </div>
    ${b.foot ? `<div class="bfoot">${esc(b.foot)}</div>` : ''}`, T);
};

/**
 * series — years on the x-axis, each column the market total with the heat
 * pump portion filled inside it, and the share printed under the year.
 * One column carries both numbers because the story IS the ratio: two separate
 * charts make the reader do the division themselves.
 * A `provisional` year is drawn hollow — a figure that may still move should
 * not look as settled as one that cannot.
 */
const series = (b, T) => {
  const max = Math.max(...b.items.map((i) => i.total ?? 0));
  return panel(`
    ${head(b.icon, b.title, T)}
    ${b.legend ? `<div class="lgnd">
      <span><i style="background:${T.a}"></i>${esc(b.legend.hp)}</span>
      <span><i style="background:rgba(255,255,255,.2)"></i>${esc(b.legend.total)}</span>
    </div>` : ''}
    <div class="sbars">
      ${b.items.map((i) => {
        const th = max ? Math.round((i.total / max) * 100) : 0;
        const hh = i.total ? Math.round((i.hp / i.total) * 100) : 0;
        return `<div class="sbar">
          <span class="sv">${esc(i.totalLabel ?? '')}</span>
          <span class="scol" style="height:${th}%;${i.provisional ? `border:1.5px dashed rgba(255,255,255,.35);background:transparent` : ''}">
            <span class="shp" style="height:${hh}%;background:${T.a}${i.provisional ? ';opacity:.55' : ''}"></span>
          </span>
          <span class="sl">${esc(i.label)}${i.provisional ? '*' : ''}</span>
          <span class="ss" style="color:${T.a}">${esc(i.shareLabel ?? '')}</span>
        </div>`;
      }).join('')}
    </div>
    ${b.foot ? `<div class="bfoot">${esc(b.foot)}</div>` : ''}`, T);
};

/** table — before → after rows. */
const table = (b, T) => panel(`
  ${head(b.icon, b.title, T)}
  ${b.colFrom || b.colTo ? `<div class="cols"><span class="c1">${esc(b.colFrom ?? '')}</span><span class="c2" style="color:${T.a}">${esc(b.colTo ?? '')}</span></div>` : ''}
  ${b.rows.map((r) => `
    <div class="trow"><span class="tl">${esc(r.label)}</span>
      <span class="tf">${esc(r.from)}</span><span class="arr" style="color:${T.a}">→</span>
      <span class="tt" style="color:${r.bad ? T.b : T.a}">${esc(r.to)}</span></div>`).join('')}`, T);

/** list — icon · label · value rows, optional footer note. */
const list = (b, T) => panel(`
  ${head(b.icon, b.title, T)}
  ${b.rows.map((r) => `
    <div class="rrow">
      ${r.icon ? `<span class="ric" style="border-color:${T.a}">${IC(r.icon, T.a, 36)}</span>` : ''}
      <span class="rl">${esc(r.label)}</span>
      ${r.value ? `<span class="rv" style="color:${T.a}">${esc(r.value)}</span>` : ''}
    </div>`).join('')}
  ${b.note ? `<div class="rnote"><span class="ric" style="border-color:${T.b}">${IC(b.note.icon ?? 'gift', T.b, 34)}</span>
    <div class="rnt"><b>${esc(b.note.title)}</b><span style="color:${T.b}">${esc(b.note.text)} <i>${esc(b.note.suffix ?? '')}</i></span></div></div>` : ''}`, T);

/** checklist — plain ticked/crossed statements. */
const checks = (b, T) => panel(`
  ${head(b.icon, b.title, T)}
  <div class="checks">
  ${b.rows.map((r) => `
    <div class="crow">
      <span class="cic">${IC(r.no ? 'cross' : 'check', r.no ? T.b : T.a, 26)}</span>
      <span class="cl">${esc(r.label)}${r.value ? ` <b style="color:${T.a}">${esc(r.value)}</b>` : ''}</span>
    </div>`).join('')}
  </div>`, T);

/** timeline — dated phases along a rail. */
const timeline = (b, T) => panel(`
  ${head(b.icon, b.title, T)}
  <div class="tline">
    ${b.steps.map((s, i) => `
      <div class="tstep">
        <span class="tdot" style="background:${s.future ? 'transparent' : T.a};border:2px solid ${T.a}"></span>
        ${i < b.steps.length - 1 ? `<span class="trail" style="background:linear-gradient(90deg,${T.a},${T.a}44)"></span>` : ''}
        <div class="ttx"><b style="color:${T.a}">${esc(s.date)}</b><span>${esc(s.text)}</span></div>
      </div>`).join('')}
  </div>`, T);

/** compare — two labelled columns (this year vs next year, etc.). */
const compare = (b, T) => panel(`
  ${head(b.icon, b.title, T)}
  <div class="cmp">
    ${b.columns.map((c, i) => `
      <div class="cmpc" style="${i === 0 ? `border-color:${T.a}55` : ''}">
        <span class="cmph" style="color:${i === 0 ? T.a : T.b}">${esc(c.head)}</span>
        ${c.rows.map((r) => `<div class="cmpr"><span>${esc(r.label)}</span><b style="color:${i === 0 ? T.a : T.b}">${esc(r.value)}</b></div>`).join('')}
      </div>`).join('')}
  </div>
  ${b.foot ? `<div class="bfoot">${esc(b.foot)}</div>` : ''}`, T);

/** fazit — the closing takeaway. */
const fazit = (b, T) => `
  <div class="fazit">
    <span class="fico" style="border-color:${T.a}">${IC('bulb', T.a, 42)}</span>
    <div class="ftxt"><b>${esc(b.title)}</b><p>${b.lines.map(esc).join('<br>')}</p></div>
    ${b.icon ? `<span class="fmotif">${IC(b.icon, T.a, 108)}</span>` : ''}
  </div>`;

const RENDER = { hero, stats, bars, series, table, list, checks, timeline, compare, fazit };

/** Render one section: either a single block or a row of blocks side by side. */
export function renderSection(section, T) {
  if (Array.isArray(section)) {
    return `<div class="row">${section.map((b) => `<div class="cell" style="flex:${b.flex ?? 1}">${renderBlock(b, T)}</div>`).join('')}</div>`;
  }
  return renderBlock(section, T);
}

export function renderBlock(b, T) {
  const fn = RENDER[b.type];
  if (!fn) throw new Error(`unknown block type: ${b.type}`);
  return fn(b, T);
}
