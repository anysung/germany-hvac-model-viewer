/**
 * datasetCache — IndexedDB cache for the product dataset files (2026-07-27).
 *
 * Purpose: repeat visits render instantly from cache while a background
 * revalidation (Storage object md5) fetches updates for the NEXT visit. The
 * datasets change about once a month, so the cache is almost always current;
 * we deliberately never swap data mid-session (no UI surprises).
 *
 * FAIL-OPEN BY DESIGN: every function here resolves harmlessly (null / no-op)
 * on any error — private browsing without IndexedDB, quota pressure, corrupt
 * records. The caller then simply takes the normal network path, exactly as
 * before this cache existed. This module must never be able to break loading.
 */

const DB_NAME = 'hpdb-dataset-cache';
const STORE = 'files';

export interface CachedFile {
  /** Storage object path, e.g. datasets/DE/products.json */
  key: string;
  text: string;
  /** Storage object md5Hash at download time ('' = unknown → always refresh). */
  md5: string;
  cachedAt: number;
}

function openDb(): Promise<IDBDatabase | null> {
  return new Promise(resolve => {
    try {
      if (typeof indexedDB === 'undefined') { resolve(null); return; }
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) {
          req.result.createObjectStore(STORE, { keyPath: 'key' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function cacheGet(key: string): Promise<CachedFile | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise(resolve => {
    try {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => { resolve((req.result as CachedFile) ?? null); db.close(); };
      req.onerror = () => { resolve(null); db.close(); };
    } catch {
      resolve(null);
      db.close();
    }
  });
}

export async function cachePut(rec: CachedFile): Promise<void> {
  const db = await openDb();
  if (!db) return;
  return new Promise(resolve => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(rec);
      tx.oncomplete = () => { resolve(); db.close(); };
      tx.onerror = () => { resolve(); db.close(); };
      tx.onabort = () => { resolve(); db.close(); };
    } catch {
      resolve();
      db.close();
    }
  });
}
