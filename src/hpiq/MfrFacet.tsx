/**
 * ManufacturerFacet — the shared manufacturer filter rail section
 * (ProductsPage + LabelPage, 2026-07-27).
 *
 * Collapsed: the current SELECTION (readability after choosing), or the top-5
 * by product count when nothing is selected. "Show All" opens an inline
 * searchable A–Z panel over the FULL manufacturer list (the pre-redesign view
 * hard-capped the list at 25 of 200+), with multi-select and a Done button.
 */
import React, { useMemo, useState } from 'react';
import { CheckBox, sectionLabel } from './ui';

export interface MfrFacetLabels {
  showAll: string;
  searchPh: string;
  done: string;
  selectedCount: (n: number) => string;
}

export const ManufacturerFacet: React.FC<{
  title: string;
  counts: { name: string; count: number }[];
  selected: string[];
  onChange: (next: string[]) => void;
  labels: MfrFacetLabels;
}> = ({ title, counts, selected, onChange, labels }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const countByName = useMemo(() => new Map(counts.map(m => [m.name, m.count])), [counts]);
  const collapsed = selected.length
    ? selected.map(name => ({ name, count: countByName.get(name) ?? 0 }))
    : counts.slice(0, 5);
  const alpha = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...counts]
      .sort((a, b) => a.name.localeCompare(b.name))
      .filter(m => !q || m.name.toLowerCase().includes(q));
  }, [counts, search]);

  const toggle = (name: string) =>
    onChange(selected.includes(name) ? selected.filter(x => x !== name) : [...selected, name]);

  const row = (m: { name: string; count: number }) => {
    const on = selected.includes(m.name);
    return (
      <span
        key={m.name}
        data-testid="mfr-option"
        onClick={() => toggle(m.name)}
        style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer' }}
      >
        <CheckBox on={on} size={15} radius={4} />
        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</span>
        <span style={{ marginLeft: 'auto', color: '#7a7a7a', fontSize: 12 }}>{m.count}</span>
      </span>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <span style={sectionLabel}>{title}</span>
      {open ? (
        <div style={{ border: '1px solid #e0e0e0', borderRadius: 12, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }} data-testid="mfr-panel">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={labels.searchPh}
            autoFocus
            style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #d2d2d7', borderRadius: 8, padding: '7px 10px', fontSize: 12.5, outline: 'none' }}
            data-testid="mfr-panel-search"
          />
          <div style={{ maxHeight: 250, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 7, fontSize: 13 }}>
            {alpha.map(row)}
          </div>
          <span
            className="hp-press"
            onClick={() => { setOpen(false); setSearch(''); }}
            style={{ alignSelf: 'flex-end', background: '#0066cc', color: '#fff', borderRadius: 999, padding: '6px 16px', fontSize: 12.5, cursor: 'pointer' }}
            data-testid="mfr-panel-done"
          >
            {labels.done}{selected.length ? ` · ${labels.selectedCount(selected.length)}` : ''}
          </span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, fontSize: 13.5 }}>
          {collapsed.map(row)}
          <span onClick={() => setOpen(true)} style={{ color: '#0066cc', fontSize: 12.5, cursor: 'pointer' }} data-testid="mfr-show-all">{labels.showAll}</span>
        </div>
      )}
    </div>
  );
};
