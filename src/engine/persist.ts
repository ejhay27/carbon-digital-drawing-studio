// Local-only persistence. Nothing here ever leaves the device.
const DB_NAME = 'carbon-studio';
// v2 adds an asset registry without touching existing project/session stores.
const DB_VERSION = 2;
const STORES = ['session', 'recent', 'refs', 'backup', 'assets'] as const;
type StoreName = (typeof STORES)[number];

let dbp: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, DB_VERSION);
    r.onupgradeneeded = () => {
      for (const s of STORES) if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s);
    };
    r.onsuccess = () => {
      const opened = r.result;
      opened.onversionchange = () => {
        opened.close();
        dbp = null;
      };
      res(opened);
    };
    r.onerror = () => {
      dbp = null;
      rej(r.error);
    };
  });
  return dbp;
}

async function tx<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T> {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction(store, mode);
    const s = t.objectStore(store);
    const req = fn(s);
    t.oncomplete = () => res(req ? (req.result as T) : (undefined as T));
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error || new Error('Storage transaction aborted (quota?)'));
  });
}

export const idbPut = (store: StoreName, key: string, val: unknown) => tx(store, 'readwrite', (s) => s.put(val, key));
export const idbGet = <T>(store: StoreName, key: string) => tx<T>(store, 'readonly', (s) => s.get(key) as IDBRequest<T>);
export const idbDel = (store: StoreName, key: string) => tx(store, 'readwrite', (s) => s.delete(key));
export async function idbAll<T>(store: StoreName): Promise<{ key: string; value: T }[]> {
  const d = await db();
  return new Promise((res, rej) => {
    const out: { key: string; value: T }[] = [];
    const t = d.transaction(store, 'readonly');
    const c = t.objectStore(store).openCursor();
    c.onsuccess = () => {
      const cur = c.result;
      if (cur) {
        out.push({ key: String(cur.key), value: cur.value as T });
        cur.continue();
      }
    };
    t.oncomplete = () => res(out);
    t.onerror = () => rej(t.error);
  });
}

export interface SessionEntry {
  name: string;
  bytes: Uint8Array;
  savedAt: number;
  fileName: string | null;
  order: number;
}
export interface RecentEntry {
  name: string;
  bytes: Uint8Array;
  savedAt: number;
  size: number;
  w: number;
  h: number;
}
export interface RefEntry {
  name: string;
  url: string;
  addedAt: number;
}

export async function storageEstimate() {
  try {
    const e = await navigator.storage?.estimate?.();
    return e ? { usage: e.usage || 0, quota: e.quota || 0 } : null;
  } catch {
    return null;
  }
}
