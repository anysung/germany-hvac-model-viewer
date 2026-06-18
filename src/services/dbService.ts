import { collection, getDocs, getDoc, doc, query, limit, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { HeatPump, NewsItem, PolicyItem, BAFAItem } from '../types';
import { ACTIVE_COUNTRY } from '../config/countryProfiles';

// Firestore collection paths — derived from the active country profile so that
// all country-specific routing is driven by ACTIVE_COUNTRY, not hardcoded strings.
const NEWS_REF   = `${ACTIVE_COUNTRY.firestoreRoot}/news`;
const POLICY_REF = `${ACTIVE_COUNTRY.firestoreRoot}/policies`;
const BAFA_REF   = `${ACTIVE_COUNTRY.firestoreRoot}/bafa`;

/**
 * Load products from a static JSON dataset.
 * Accepts a path so both residential and commercial datasets use the same loader.
 */
const loadProductsFromJson = async (path: string): Promise<HeatPump[]> => {
  try {
    const resp = await fetch(path);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    return (data.items || []) as HeatPump[];
  } catch (error) {
    console.error(`Error fetching products from ${path}:`, error);
    return [];
  }
};

/** Load residential products (static JSON, path from active country profile). */
export const getProducts = (): Promise<HeatPump[]> =>
  loadProductsFromJson(ACTIVE_COUNTRY.datasetPaths.products);

/** Load commercial products (static JSON, path from active country profile). */
export const getCommercialProducts = (): Promise<HeatPump[]> =>
  loadProductsFromJson(ACTIVE_COUNTRY.datasetPaths.commercialProducts);

export const getNews = async (): Promise<NewsItem[]> => {
  try {
    const newsCollection = collection(db, NEWS_REF);
    const q = query(newsCollection, limit(20)); 
    const snapshot = await getDocs(q);
    
    const news = snapshot.docs.map(doc => doc.data() as NewsItem);
    return news.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
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

export const getBAFA = async (): Promise<BAFAItem[]> => {
  try {
    const snapshot = await getDocs(collection(db, BAFA_REF));
    return snapshot.docs.map(d => d.data() as BAFAItem);
  } catch (error) {
    console.error("Error fetching BAFA:", error);
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