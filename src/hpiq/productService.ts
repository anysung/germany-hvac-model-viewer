/**
 * Cursor-paginated product access for the streamed Products list.
 *
 * The residential catalog is served today from the static dataset loaded by
 * dbService.getProducts() (there is no Firestore `products` collection yet —
 * see docs data-lineage notes). This service exposes a Firestore-shaped
 * cursor API — getPage({ filters, cursor, limit }) → { items, nextCursor } —
 * so the UI consumes pages exactly as it would consume
 * query(collection, orderBy('cop_A2W35','desc'), startAfter(cursor), limit(n));
 * migrating storage to Firestore later only changes this file.
 */
import { HeatPump } from '../types';
import { localListingStatus } from './listing';
import { HpVM, toVM } from './model';

export type ProductSort = 'cop2' | 'scop' | 'kwDesc' | 'kwAsc' | 'noise' | 'model';

export const SORT_LABELS: Record<ProductSort, string> = {
  cop2: 'COP A2/W35',
  scop: 'SCOP',
  kwDesc: 'Capacity — high to low',
  kwAsc: 'Capacity — low to high',
  noise: 'Sound power — quietest',
  model: 'Model name A–Z',
};

export interface ProductFilters {
  refrigerant: string | null;      // contains-match, e.g. 'R290'
  manufacturers: string[];         // manufacturer_short exact set
  bafaListedOnly: boolean;
  /** Rated-capacity range in kW — null bound = unbounded. Records with no rated capacity pass only when both bounds are null. */
  capMin: number | null;
  capMax: number | null;
  sort: ProductSort;
  /** Live text query over the search() haystack. Under 2 chars = off. */
  text: string;
}

export interface ProductPage {
  items: HpVM[];
  /** Opaque cursor (last item id) — pass back to fetch the next page. */
  nextCursor: string | null;
  filteredTotal: number;
}

export class ProductStore {
  readonly all: HpVM[];
  readonly total: number;
  readonly byId: Map<string, HpVM>;
  readonly mfrCounts: { name: string; count: number }[];
  readonly bafaSnapshotDate: string | null;
  readonly sourceSnapshotDate: string | null;
  /** Whole-kW rated-capacity bounds across the catalog, or null if no record publishes one. */
  readonly kwBounds: { min: number; max: number } | null;

  constructor(products: HeatPump[]) {
    // Sorted by COP A2/W35 descending, nulls last — the list's fixed sort.
    this.all = products
      .map(toVM)
      .sort((a, b) => (b.cop2Num ?? -Infinity) - (a.cop2Num ?? -Infinity));
    this.total = this.all.length;
    this.byId = new Map(this.all.map(v => [v.id, v]));

    const counts = new Map<string, number>();
    for (const v of this.all) counts.set(v.mfr, (counts.get(v.mfr) || 0) + 1);
    this.mfrCounts = [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    // Latest (max) timestamps across records — mixed dates are expected now
    // that delisted products keep the fetched_at of their last snapshot.
    // GB records carry pel_snapshot_fetched_at instead of the BAFA field.
    let maxFetched: string | null = null;
    let maxGenerated: string | null = null;
    for (const p of products) {
      const fetched = p.bafa_snapshot_fetched_at ?? p.pel_snapshot_fetched_at ?? null;
      if (fetched && (!maxFetched || fetched > maxFetched)) maxFetched = fetched;
      if (p.source_snapshot_generated_at && (!maxGenerated || p.source_snapshot_generated_at > maxGenerated)) maxGenerated = p.source_snapshot_generated_at;
    }
    this.bafaSnapshotDate = maxFetched;
    this.sourceSnapshotDate = maxGenerated;

    const kws = this.all.map(v => v.ratedKwNum).filter((n): n is number => n != null);
    this.kwBounds = kws.length
      ? { min: Math.floor(Math.min(...kws)), max: Math.ceil(Math.max(...kws)) }
      : null;
  }

  /** The one substring haystack — shared by search() and the text filter. */
  private static hay(v: HpVM): string {
    return `${v.model} ${v.mfr} ${v.odu} ${v.raw.idu_model ?? ''} ${v.sourceId}`.toLowerCase();
  }

  private applyFilters(filters: ProductFilters): HpVM[] {
    let list = this.all;
    const needle = (filters.text ?? '').trim().toLowerCase();
    if (needle.length >= 2) {
      list = list.filter(v => ProductStore.hay(v).includes(needle));
    }
    if (filters.refrigerant) {
      const r = filters.refrigerant;
      list = list.filter(v => v.ref.includes(r));
    }
    if (filters.manufacturers.length) {
      const set = new Set(filters.manufacturers);
      list = list.filter(v => set.has(v.mfr));
    }
    if (filters.bafaListedOnly) {
      // Reads the market's OWN list via the resolver — a German registry listing is
      // never treated as a UK or French listing (see hpiq/listing.ts).
      list = list.filter(v => localListingStatus(v.raw) === 'listed');
    }
    if (filters.capMin != null || filters.capMax != null) {
      list = list.filter(v =>
        v.ratedKwNum != null
        && (filters.capMin == null || v.ratedKwNum >= filters.capMin)
        && (filters.capMax == null || v.ratedKwNum <= filters.capMax));
    }
    return this.applySort(list, filters.sort);
  }

  /** Sort a filtered list; 'cop2' is the pre-sorted base order (no work). Nulls always sort last. */
  private applySort(list: HpVM[], sort: ProductSort): HpVM[] {
    if (!sort || sort === 'cop2') return list;
    const sorted = [...list];
    switch (sort) {
      case 'scop':
        sorted.sort((a, b) => (b.raw.scop ?? -Infinity) - (a.raw.scop ?? -Infinity)); break;
      case 'kwDesc':
        sorted.sort((a, b) => (b.ratedKwNum ?? -Infinity) - (a.ratedKwNum ?? -Infinity)); break;
      case 'kwAsc':
        sorted.sort((a, b) => (a.ratedKwNum ?? Infinity) - (b.ratedKwNum ?? Infinity)); break;
      case 'noise':
        sorted.sort((a, b) => (a.raw.noise_outdoor_dB ?? Infinity) - (b.raw.noise_outdoor_dB ?? Infinity)); break;
      case 'model':
        sorted.sort((a, b) => a.model.localeCompare(b.model)); break;
    }
    return sorted;
  }

  /**
   * The complete filtered + sorted list. Pages are derived from this by slicing,
   * so the visible list can be a pure `useMemo` of (store, filters) — no effect,
   * no copy of the list in React state, and therefore no render where the UI
   * still shows the previous filter's result.
   *
   * The returned array is never the canonical `all` array unless no filter and
   * no sort are active, and callers only ever slice it — nothing mutates it.
   */
  list(filters: ProductFilters): HpVM[] {
    return this.applyFilters(filters);
  }

  /** Fetch one page after the given cursor (null = first page). */
  getPage(filters: ProductFilters, cursor: string | null, pageSize: number): ProductPage {
    const list = this.applyFilters(filters);
    let start = 0;
    if (cursor) {
      const idx = list.findIndex(v => v.id === cursor);
      start = idx >= 0 ? idx + 1 : 0;
    }
    const items = list.slice(start, start + pageSize);
    const last = items[items.length - 1];
    return {
      items,
      nextCursor: start + pageSize < list.length && last ? last.id : null,
      filteredTotal: list.length,
    };
  }

  /** Live substring search over model / manufacturer / ODU / registry id. */
  search(q: string, max = 60): { items: HpVM[]; total: number } {
    const needle = q.trim().toLowerCase();
    if (needle.length < 2) return { items: [], total: 0 };
    const items: HpVM[] = [];
    let total = 0;
    for (const v of this.all) {
      if (ProductStore.hay(v).includes(needle)) {
        total++;
        if (items.length < max) items.push(v);
      }
    }
    return { items, total };
  }

  /** Label records filtered by derived W35 class. */
  labelRecords(classFilter: string | null): HpVM[] {
    return classFilter ? this.all.filter(v => v.label === classFilter) : this.all;
  }
}
