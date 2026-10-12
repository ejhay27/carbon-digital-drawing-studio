/** Windows-only local project Library. Electron stores the canonical archives and thumbnails in
 * its application profile; browser/portable builds retain the local IndexedDB implementation. */
import { desktopBridge, fromArrayBuffer, toArrayBuffer, type DesktopLibraryEntry, type DesktopLibrarySummary } from './electronBridge';

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
  hasReplay?: boolean;
}

export type LibraryProjectSummary = Omit<LibraryProject, 'bytes'>;

const DB_NAME = 'carbon-prime-project-library';
const DB_VERSION = 1;
const STORE = 'projects';
let dbPromise: Promise<IDBDatabase> | null = null;
let desktopMigration: Promise<void> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      dbPromise = null;
      reject(new Error('The local project Library is unavailable in this environment.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    let settled = false;
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => {
      if (settled) { request.result.close(); return; }
      settled = true;
      const db = request.result;
      db.onversionchange = () => { db.close(); dbPromise = null; };
      resolve(db);
    };
    request.onerror = () => {
      if (settled) return;
      settled = true; dbPromise = null;
      reject(request.error || new Error('Could not open the local project Library.'));
    };
    request.onblocked = () => {
      if (settled) return;
      settled = true; dbPromise = null;
      reject(new Error('The local project Library is busy in another Carbon window.'));
    };
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

async function idbPut(project: LibraryProject): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(project, project.id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Could not save the project to the Library cache.'));
    tx.onabort = () => reject(tx.error || new Error('Library cache save was aborted (storage quota may be full).'));
  });
}

async function idbGet(id: string): Promise<LibraryProject | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve(validProject(req.result) ? req.result : null);
    req.onerror = () => reject(req.error || new Error('Could not read the project from the Library cache.'));
  });
}

async function idbAll(): Promise<LibraryProject[]> {
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
    tx.oncomplete = () => resolve(projects);
    tx.onerror = () => reject(tx.error || new Error('Could not list cached Library projects.'));
  });
}

async function idbDelete(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Could not delete the Library cache entry.'));
    tx.onabort = () => reject(tx.error || new Error('Library cache delete was aborted.'));
  });
}

function desktopPayload(project: LibraryProject) {
  return {
    ...project,
    bytes: toArrayBuffer(project.bytes),
    thumbnail: toArrayBuffer(project.thumbnail),
    hasReplay: !!project.hasReplay,
  };
}

function summaryFromDesktop(item: DesktopLibrarySummary): LibraryProjectSummary {
  return {
    id: item.id, kind: item.kind, name: item.name,
    thumbnail: fromArrayBuffer(item.thumbnail),
    width: item.width, height: item.height, pages: item.pages, size: item.size,
    createdAt: item.createdAt, modifiedAt: item.modifiedAt, savedAt: item.savedAt, hasReplay: !!item.hasReplay,
  };
}

function projectFromDesktop(item: DesktopLibraryEntry | null): LibraryProject | null {
  if (!item) return null;
  return {
    id: item.id, kind: item.kind, name: item.name,
    bytes: fromArrayBuffer(item.bytes), thumbnail: fromArrayBuffer(item.thumbnail),
    width: item.width, height: item.height, pages: item.pages, size: item.size,
    createdAt: item.createdAt, modifiedAt: item.modifiedAt, savedAt: item.savedAt, hasReplay: !!item.hasReplay,
  };
}

/** Copy pre-Electron IndexedDB entries to the durable desktop project directory once per process. */
async function ensureDesktopMigration() {
  const bridge = desktopBridge();
  if (!bridge) return;
  if (!desktopMigration) {
    desktopMigration = (async () => {
      const disk = await bridge.listLibraryProjects();
      const known = new Set([...disk.entries.map((item) => item.id), ...disk.deletedIds]);
      const cached = await idbAll().catch(() => []);
      for (const project of cached) {
        if (known.has(project.id)) continue;
        try { await bridge.putLibraryProject(desktopPayload(project)); known.add(project.id); }
        catch (error) { console.warn('[CARBON] Existing Library project could not be copied to the desktop store:', project.name, error); }
      }
    })().catch((error) => { desktopMigration = null; throw error; });
  }
  await desktopMigration;
}

export async function putLibraryProject(project: LibraryProject): Promise<void> {
  if (!validProject(project)) throw new Error('Invalid project data; the Library was not changed.');
  const bridge = desktopBridge();
  if (bridge) {
    await ensureDesktopMigration();
    await bridge.putLibraryProject(desktopPayload(project));
    // The filesystem copy is canonical in Electron. IndexedDB is a recovery/cache mirror and a
    // quota failure must not turn a verified file save into a reported artwork-save failure.
    await idbPut(project).catch((error) => console.warn('[CARBON] Library file saved; IndexedDB mirror was unavailable:', error));
    return;
  }
  await idbPut(project);
}

export async function getLibraryProject(id: string): Promise<LibraryProject | null> {
  const bridge = desktopBridge();
  if (bridge) {
    await ensureDesktopMigration();
    return projectFromDesktop(await bridge.getLibraryProject(id));
  }
  return idbGet(id);
}

export async function listLibraryProjects(): Promise<LibraryProjectSummary[]> {
  const bridge = desktopBridge();
  if (bridge) {
    await ensureDesktopMigration();
    const result = await bridge.listLibraryProjects();
    return result.entries.map(summaryFromDesktop).sort((a, b) => b.savedAt - a.savedAt || a.name.localeCompare(b.name));
  }
  return (await idbAll()).sort((a, b) => b.savedAt - a.savedAt || a.name.localeCompare(b.name)).map(({ bytes: _bytes, ...summary }) => summary);
}

export async function deleteLibraryProject(id: string): Promise<void> {
  const bridge = desktopBridge();
  if (bridge) {
    await ensureDesktopMigration();
    await bridge.deleteLibraryProject(id);
    // A tombstone in the desktop store prevents a stale IDB cache from resurrecting a deleted item.
    await idbDelete(id).catch((error) => console.warn('[CARBON] Project was removed from disk; cache cleanup failed:', error));
    return;
  }
  await idbDelete(id);
}
