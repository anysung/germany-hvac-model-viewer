import { collection, getDocs, getDoc, doc, query, limit } from 'firebase/firestore';
import { ref, getBlob, getMetadata as getStorageMetadata, type StorageReference } from 'firebase/storage';
import { db, datasetStorage } from '../firebase';
import { HeatPump, NewsItem, PolicyItem } from '../types';
import { ACTIVE_COUNTRY } from '../config/countryProfiles';
import { cacheGet, cachePut } from './datasetCache';

// Firestore collection paths — derived from the active country profile so that
// all country-specific routing is driven by ACTIVE_COUNTRY, not hardcoded strings.
const NEWS_REF   = `${ACTIVE_COUNTRY.firestoreRoot}/news`;
const POLICY_REF = `${ACTIVE_COUNTRY.firestoreRoot}/policies`;

/**
 * Load a product dataset.
 *
 * Production: downloaded through the Firebase Storage SDK from the
 * auth-protected datasets bucket (gs://heatpumpdb-datasets/datasets/<CC>/…) —
 * storage.rules only admit approved accounts, so the catalogue is no longer
 * one anonymous HTTP GET away (anti-scraping, 2026-07-12).
 *
 * Dev server: reads the local file from public/data (vite serves it), so the
 * pipeline/preview workflow keeps working without a Storage round-trip.
 */
/**
 * Anti-scraping honeytoken filter — ALL markets. The served dataset files carry
 * one fictitious canary record each (scripts/upload-datasets.mjs; ids reserved
 * in the 1699xxxx block, scripts/canary/canary-records.json). The canary's job
 * is to prove FILE exfiltration — it must stay in the served bytes — but it is
 * not a real product: the app excludes it from every catalogue, count, search,
 * comparison, PDF and export path by filtering the reserved id block here, in
 * the one place all product data enters the app.
 */
const isHoneytokenRecord = (p: HeatPump): boolean =>
  [p.source_id, p.bafa_id, p.european_reference_id]
    .some(id => id != null && /^1699\d{4}$/.test(String(id)));

// Errors propagate to the caller (App.tsx loadData): a failed dataset download
// must surface as a visible error + retry, never as a silently empty catalogue
// (the 2026-07-18 PL incident hid an access-layer failure behind "0 products").

/**
 * Background revalidation for a cached dataset: one cheap metadata call (md5)
 * decides whether to refresh the cache for the NEXT visit. Data is never
 * swapped mid-session, and every failure here is silent — the session already
 * rendered from cache, so nothing user-visible can go wrong.
 */
const revalidateDataset = (storageRef: StorageReference, key: string, cachedMd5: string): void => {
  getStorageMetadata(storageRef)
    .then(async meta => {
      const md5 = meta.md5Hash ?? '';
      if (md5 && md5 === cachedMd5) return;   // cache is current — nothing to do
      const blob = await getBlob(storageRef);
      const text = await blob.text();
      // Validate BEFORE caching: a bad published file must never poison the
      // cache (it would otherwise replace known-good data on the next visit).
      // The current session is unaffected either way — it rendered from cache.
      const fresh = JSON.parse(text);         // throws → catch below, cache kept
      if (!Array.isArray(fresh?.items) || fresh.items.length < 100) return;
      await cachePut({ key, text, md5, cachedAt: Date.now() });
    })
    .catch(() => { /* offline / transient / invalid download — keep the cache */ });
};

const loadProductsFromJson = async (path: string): Promise<HeatPump[]> => {
  let data: any;
  if (import.meta.env.DEV) {
    const resp = await fetch(path);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    data = await resp.json();
  } else {
    const file = path.split('/').pop()!;
    const key = `datasets/${ACTIVE_COUNTRY.code}/${file}`;
    const storageRef = ref(datasetStorage, key);

    // Cache-first with background revalidation (stale-while-revalidate).
    // Any cache problem — missing, unreadable, corrupt JSON — falls through
    // to the plain network path below, exactly as before the cache existed.
    const cached = await cacheGet(key);
    if (cached) {
      try {
        data = JSON.parse(cached.text);
        revalidateDataset(storageRef, key, cached.md5);
      } catch {
        data = null;   // corrupt cache record → network below overwrites it
      }
    }

    if (!data) {
      const blob = await getBlob(storageRef);
      const text = await blob.text();
      data = JSON.parse(text);
      // Store for next visit (best effort, off the critical path). The md5 is
      // fetched separately; '' means "unknown" and forces a refresh next time.
      getStorageMetadata(storageRef)
        .then(meta => cachePut({ key, text, md5: meta.md5Hash ?? '', cachedAt: Date.now() }))
        .catch(() => cachePut({ key, text, md5: '', cachedAt: Date.now() }));
    }
  }
  return ((data.items || []) as HeatPump[]).filter(p => !isHoneytokenRecord(p));
};

/** Load residential products (static JSON, path from active country profile). */
export const getProducts = (): Promise<HeatPump[]> =>
  loadProductsFromJson(ACTIVE_COUNTRY.datasetPaths.products);

/** Load commercial products (static JSON, path from active country profile). */
export const getCommercialProducts = (): Promise<HeatPump[]> =>
  loadProductsFromJson(ACTIVE_COUNTRY.datasetPaths.commercialProducts);

/** News for an arbitrary market — used by the unified admin console. */
export const getNewsFor = async (countryCode: string): Promise<NewsItem[]> => {
  try {
    const snapshot = await getDocs(query(collection(db, `countries/${countryCode}/news`), limit(20)));
    return snapshot.docs.map(d => d.data() as NewsItem)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  } catch {
    return [];
  }
};

export const getNews = async (): Promise<NewsItem[]> => {
  try {
    const newsCollection = collection(db, NEWS_REF);
    const q = query(newsCollection, limit(200)); 
    const snapshot = await getDocs(q);
    
    const news = snapshot.docs.map(doc => doc.data() as NewsItem);
    // Pinned articles lead the feed (the monthly Special Report holds the top
    // slot until the next edition); everything else stays newest-first.
    return news.sort((a, b) =>
      Number(b.pinned ?? false) - Number(a.pinned ?? false)
      || new Date(b.date).getTime() - new Date(a.date).getTime());
  } catch (error) {
    console.error("Error fetching news:", error);
    return [];
  }
};

export const getPolicies = async (): Promise<PolicyItem[]> => {
  try {
    const snapshot = await getDocs(collection(db, POLICY_REF));
    return snapshot.docs.map(doc => doc.data() as PolicyItem);
  } catch (error) {
    console.error("Error fetching policies:", error);
    return [];
  }
};

export interface DbMetadata {
  lastUpdated: string | null;
  productCount: number;
  newsCount: number;
  policyCount?: number;
  lastUpdateStats?: {
    productsAdded: number;
    productsUpdated: number;
    budget: {
      costUsd: number;
      limitUsd: number;
      inputTokens: number;
      outputTokens: number;
      groundingRequests: number;
    };
  };
  source?: string;
}

export const getMetadata = async (): Promise<DbMetadata> => {
  try {
    const snap = await getDoc(doc(db, 'countries', ACTIVE_COUNTRY.code));
    if (snap.exists()) return snap.data() as DbMetadata;
    return { lastUpdated: null, productCount: 0, newsCount: 0 };
  } catch (error) {
    console.error("Error fetching metadata:", error);
    return { lastUpdated: null, productCount: 0, newsCount: 0 };
  }
};