import { collection, getDocs, getDoc, doc, query, limit, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { HeatPump, NewsItem, PolicyItem, BAFAItem } from '../types';

// Collection References
const COUNTRY_CODE = 'DE';
const NEWS_REF = `countries/${COUNTRY_CODE}/news`;
const POLICY_REF = `countries/${COUNTRY_CODE}/policies`;
const BAFA_REF = `countries/${COUNTRY_CODE}/bafa`;

/**
 * Load products from the new enriched residential dataset (static JSON).
 * Replaces the old Firestore-based product loading.
 */
export const getProducts = async (): Promise<HeatPump[]> => {
  try {
    const resp = await fetch('/data/products.json');
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    return (data.items || []) as HeatPump[];
  } catch (error) {
    console.error("Error fetching products:", error);
    return [];
  }
};

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
    const snap = await getDoc(doc(db, 'countries', COUNTRY_CODE));
    if (snap.exists()) return snap.data() as DbMetadata;
    return { lastUpdated: null, productCount: 0, newsCount: 0 };
  } catch (error) {
    console.error("Error fetching metadata:", error);
    return { lastUpdated: null, productCount: 0, newsCount: 0 };
  }
};