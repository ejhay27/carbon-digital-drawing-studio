/** Windows-only local project Library. Stored in its own IndexedDB database so Android's
 * scoped-storage/document-provider workflow and its existing database schema are untouched. */
export type LibraryKind = 'draw' | 'infinite' | '3d' | 'comic';

export interface LibraryProject {
  id: string;
  kind: LibraryKind;
  name: string;
  bytes: Uint8Array;
  thumbnail: Uint8Array;
  width: number;
  height: number;
  pages: number;
  size: number;
  createdAt: number;
  modifiedAt: number;
  savedAt: number;
}

const DB_NAME = 'carbon-prime-project-library';
const DB_VERSION = 1;
const STORE = 'projects';
let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      dbPromise = null;
      reject(new Error('The local project Library is unavailable in this environment.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); dbPromise = null; };
      resolve(db);
    };
    request.onerror = () => { dbPromise = null; reject(request.error || new Error('Could not open the local project Library.')); };
    request.onblocked = () => { dbPromise = null; reject(new Error('The local project Library is busy in another Carbon window.')); };
  });
  return dbPromise;
}

function validProject(value: unknown): value is LibraryProject {
  if (!value || typeof value !== 'object') return false;
  const p = value as Partial<LibraryProject>;
  return typeof p.id === 'string' && p.id.length > 0 &&
    (p.kind === 'draw' || p.kind === 'infinite' || p.kind === '3d' || p.kind === 'comic') &&
    typeof p.name === 'string' && p.name.length > 0 &&
    p.bytes instanceof Uint8Array && p.thumbnail instanceof Uint8Array &&
    Number.isFinite(p.width) && Number.isFinite(p.height) && Number.isFinite(p.savedAt);
}

export async function putLibraryProject(project: LibraryProject): Promise<void> {
  if (!validProject(project)) throw new Error('Invalid project data; the Library was not changed.');
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(project, project.id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Could not save the project to the Library.'));
    tx.onabort = () => reject(tx.error || new Error('Library save was aborted (storage quota may be full).'));
  });
}

export async function getLibraryProject(id: string): Promise<LibraryProject | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve(validProject(req.result) ? req.result : null);
    req.onerror = () => reject(req.error || new Error('Could not read the project from the Library.'));
  });
}

export async function listLibraryProjects(): Promise<LibraryProject[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const projects: LibraryProject[] = [];
    const tx = db.transaction(STORE, 'readonly');
    const cursor = tx.objectStore(STORE).openCursor();
    cursor.onsuccess = () => {
      const item = cursor.result;
      if (!item) return;
      if (validProject(item.value)) projects.push(item.value);
      item.continue();
    };
    tx.oncomplete = () => resolve(projects.sort((a, b) => b.savedAt - a.savedAt || a.name.localeCompare(b.name)));
    tx.onerror = () => reject(tx.error || new Error('Could not list the local projects.'));
  });
}

export async function deleteLibraryProject(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Could not delete the project from the Library.'));
    tx.onabort = () => reject(tx.error || new Error('Library delete was aborted.'));
  });
}
