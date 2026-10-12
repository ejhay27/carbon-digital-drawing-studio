import { checkDims, DocEngine, MAX_AREA, MAX_SIDE } from '../engine/document';
import { isNative, shareProjectFile, writeProject } from '../platform/native';
import { COMIC_MIME, deserializeComic, deserializeDoc, isComicArchive, MIME, serializeComic, serializeDoc, verifyBytes } from '../engine/fileFormat';
import { compositeDoc, renderDoc } from '../engine/render';
import { ReplayPlayer } from '../engine/replay';
import { idbAll, idbDel, idbGet, idbPut, type RecentEntry, type SessionEntry } from '../engine/persist';
import { blobToDataURL, canvasToBlob, createCanvas, ctxOf, download, loadImage, uid } from '../engine/util';
import { activeDoc, bump, confirmDialog, getApp, promptDialog, setApp, showPanel, toast } from './store';
import { DEFAULT_VIEW, defaultScene, renderSceneImage, sceneOf } from '../win/sceneRender';
import { buildDocumentSvg, svgFromRasterCanvas } from '../engine/svgExport';
import { EDITION } from '../platform/edition';
import { desktopBridge, fromArrayBuffer, toArrayBuffer } from '../platform/electronBridge';
import { deleteLibraryProject as deleteStoredLibraryProject, getLibraryProject, listLibraryProjects, putLibraryProject, type LibraryKind, type LibraryProject } from '../platform/windowsLibrary';
import { runSaveSerial } from './saveQueue';

const autosavedRev = new WeakMap<DocEngine, number>(); // last autosaved revision per document
const unsubs = new Map<string, () => void>();
let autosaving = false;
let autosaveRequested = false;
let autosaveTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleAutosave(delay = 1200) {
  if (autosaveTimer) clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    autosaveTimer = null;
    void autosaveAll();
  }, delay);
}

const projectSaveKey = (doc: DocEngine) => doc.comic?.id
  ? `comic:${doc.comic.id}`
  : `project:${doc.libraryId || doc.meta.uuid || doc.id}`;

function setSaveState(doc: DocEngine, state: DocEngine['saveState'], error: string | null = null, revision?: number) {
  doc.saveState = state;
  doc.saveError = error;
  doc.savingRevision = state === 'saving' ? revision ?? doc.rev : null;
  bump();
}

function beginProjectSave(doc: DocEngine, revision: number) {
  setSaveState(doc, 'saving', null, revision);
}

function markProjectSaved(doc: DocEngine, revision: number, clearLibraryPending = true) {
  if (doc.rev !== revision) {
    doc.dirty = true;
    setSaveState(doc, 'unsaved');
    return false;
  }
  doc.dirty = false;
  if (clearLibraryPending) doc.librarySyncPending = false;
  setSaveState(doc, 'saved');
  doc.emit();
  autosavedRev.set(doc, doc.rev);
  return true;
}

function markProjectFailed(doc: DocEngine, error: unknown, revision?: number) {
  const text = error instanceof Error ? error.message : String(error);
  if (revision !== undefined && doc.rev !== revision) {
    doc.dirty = true;
    setSaveState(doc, 'unsaved');
  } else {
    doc.dirty = true;
    setSaveState(doc, 'failed', text);
  }
}

export function configureDoc(doc: DocEngine) {
  const s = getApp().settings;
  doc.undoLimit = s.undoLimit;
  doc.undoBytes = isNative() ? 320 * 1024 * 1024 : 900 * 1024 * 1024; // mobile WebView memory budget
  doc.rec.idleCap = s.compressReplayPauses ? s.idleCapSec * 1000 : Number.MAX_SAFE_INTEGER;
  doc.rec.limitBytes = s.replayLimitMB * 1024 * 1024;
  doc.rec.onLimit = () => toast(`Estimated replay memory limit (${s.replayLimitMB} MB) reached for "${doc.name}". Recording paused.`, 'error');
}

export function addDoc(doc: DocEngine, record?: boolean) {
  configureDoc(doc);
  if ((record ?? getApp().settings.recordByDefault) && !doc.rec.events.length) doc.startRecording();
  unsubs.set(doc.id, doc.subscribe(() => { bump(); scheduleAutosave(); }));
  setApp({ docs: [...getApp().docs, doc], activeId: doc.id, replay: null, homeScreen: false });
  scheduleAutosave();
}

export function newDocument(w: number, h: number, name = 'Untitled', background: string | null = '#ffffff') {
  const err = checkDims(w, h);
  if (err) {
    toast(err, 'error');
    return null;
  }
  const n = getApp().docs.length + 1;
  const doc = new DocEngine(w, h, { name: name === 'Untitled' ? `Untitled ${n}` : name, background });
  addDoc(doc);
  return doc;
}

/** Create an independent 3D document; its scene extension is never attached to a Draw tab by accident. */
export function new3DDocument(name = 'Untitled 3D') {
  const doc = newDocument(1600, 1200, name);
  if (!doc) return null;
  doc.scene3d = defaultScene();
  doc.dirty = true;
  doc.emit();
  return doc;
}

/** Create a distinct editable document in the Infinite Painter-inspired canvas-first workspace. */
export function newInfinitePainterDocument(w: number, h: number, name = 'Infinite Painter', background: string | null = '#ffffff') {
  const doc = newDocument(w, h, name, background);
  if (!doc) return null;
  doc.infinitePainter = true;
  doc.dirty = true;
  doc.emit();
  return doc;
}

export async function openBytes(bytes: Uint8Array, fileName: string, handle: unknown = null) {
  try {
    const doc = await deserializeDoc(bytes);
    doc.fileName = fileName;
    doc.fileHandle = handle;
    doc.filePath = handle && typeof handle === 'object' && 'path' in handle ? String((handle as { path?: unknown }).path || '') || null : null;
    doc.name = fileName.replace(/\.carbon$/i, '') || doc.name;
    addDoc(doc);
    await addRecent(doc, bytes);
    toast(`Opened ${fileName}${doc.rec.events.length ? ` · replay: ${doc.rec.events.length} events` : ''}`, 'success');
    return doc;
  } catch (e) {
    toast(`Could not open ${fileName}: ${e instanceof Error ? e.message : e}`, 'error');
    return null;
  }
}

async function handleOpenedFile(file: File, handle: unknown = null) {
  if (/\.carboncomic$/i.test(file.name)) return openComicFile(file, handle);
  if (/\.carbon$/i.test(file.name) || file.type === MIME) {
    return openBytes(new Uint8Array(await file.arrayBuffer()), file.name, handle);
  }
  if (file.type.startsWith('image/')) return openImageAsDoc(file);
  toast(`Unsupported file type: ${file.name}`, 'error');
  return null;
}

export async function openFileDialog() {
  const desktop = EDITION.electron ? desktopBridge() : null;
  if (desktop) {
    try {
      const result = await desktop.openProject();
      if (result.canceled) return null;
      const handle = { electron: true, fileId: result.fileId, name: result.name, path: result.path };
      const bytes = fromArrayBuffer(result.bytes);
      return result.extension === 'carboncomic'
        ? await openComicBytes(bytes, result.name, handle)
        : await openBytes(bytes, result.name, handle);
    } catch (error) {
      toast(`Could not open the project: ${error instanceof Error ? error.message : error}`, 'error');
      return null;
    }
  }
  const w = window as unknown as { showOpenFilePicker?: (o: unknown) => Promise<{ getFile: () => Promise<File> }[]> };
  if (w.showOpenFilePicker) {
    try {
      const [h] = await w.showOpenFilePicker({
        types: [{ description: 'CARBON project, comic or image', accept: { [MIME]: ['.carbon'], [COMIC_MIME]: ['.carboncomic'], 'image/*': ['.png', '.jpg', '.jpeg', '.webp'] } }],
      });
      const f = await h.getFile();
      return handleOpenedFile(f, /\.carbon$/i.test(f.name) ? h : null);
    } catch (e) {
      if ((e as Error).name === 'AbortError') return null;
    }
  }
  const f = await pickFile('.carbon,.carboncomic,image/png,image/jpeg,image/webp');
  if (f) return handleOpenedFile(f);
  return null;
}

/** Open a multi-page Comic Studio project (.carboncomic). Each page becomes an editable document. */
export async function openComicFile(file: File, handle: unknown = null) {
  return openComicBytes(new Uint8Array(await file.arrayBuffer()), file.name, handle);
}

async function openComicBytes(bytes: Uint8Array, fileName: string, handle: unknown = null) {
  try {
    const { deserializeComic } = await import('../engine/fileFormat');
    const { name, pages } = await deserializeComic(bytes);
    const cid = pages[0].comic?.id || uid('comic-');
    pages.forEach((p, i) => {
      p.comic = { ...(p.comic || { bleed: 0, safe: 0, pageName: `Page ${i + 1}` }), id: cid, name, index: i } as NonNullable<DocEngine['comic']>;
      p.dirty = false;
      if (i === 0) {
        p.fileHandle = handle;
        p.fileName = fileName;
        p.filePath = handle && typeof handle === 'object' && 'path' in handle ? String((handle as { path?: unknown }).path || '') || null : null;
      }
      addDoc(p);
    });
    setApp({ activeId: pages[0].id });
    toast(`Opened comic “${name}” (${pages.length} pages)`, 'success');
    return pages[0];
  } catch (e) {
    toast(`Could not open ${fileName}: ${e instanceof Error ? e.message : e}`, 'error');
    return null;
  }
}

export function pickFile(accept: string): Promise<File | null> {
  return new Promise((res) => {
    const i = document.createElement('input');
    i.type = 'file';
    i.accept = accept;
    i.onchange = () => res(i.files?.[0] || null);
    i.click();
  });
}

const safeName = (n: string) => (n || 'Untitled').replace(/[\\/:*?"<>|]+/g, '_');

type Handle = { name: string; createWritable: () => Promise<{ write: (b: Uint8Array) => Promise<void>; close: () => Promise<void>; abort?: () => Promise<void> }> };

const libraryIdOf = (doc: DocEngine) => doc.comic?.id || doc.meta.uuid;
const libraryKindOf = (doc: DocEngine): LibraryKind => doc.comic ? 'comic' : doc.scene3d ? '3d' : doc.infinitePainter ? 'infinite' : 'draw';

async function projectThumbnail(doc: DocEngine): Promise<Uint8Array> {
  if (doc.scene3d) {
    try {
      const scene = sceneOf(doc.scene3d);
      const view = scene.camera || DEFAULT_VIEW;
      const dataUrl = await renderSceneImage(scene, view, 320, 220, { transparent: false, assets: doc.assetImgs });
      const blob = await (await fetch(dataUrl)).blob();
      return new Uint8Array(await blob.arrayBuffer());
    } catch { /* WebGL may be unavailable; retain a useful canvas preview as a fallback. */ }
  }
  const scale = Math.min(1, 320 / Math.max(doc.width, doc.height));
  const canvas = compositeDoc(doc, scale, true);
  try { return new Uint8Array(await (await canvasToBlob(canvas, 'image/png')).arrayBuffer()); }
  finally { canvas.width = 0; canvas.height = 0; }
}

async function writeLibraryEntry(
  doc: DocEngine,
  bytes: Uint8Array,
  opts: { id?: string; name?: string; pages?: number; thumbnail?: Uint8Array; hasReplay?: boolean } = {},
): Promise<LibraryProject> {
  const id = opts.id || libraryIdOf(doc);
  const existing = await getLibraryProject(id);
  const thumbnail = opts.thumbnail || await projectThumbnail(doc);
  const savedAt = Date.now();
  const entry: LibraryProject = {
    id,
    kind: libraryKindOf(doc),
    name: (opts.name || doc.comic?.name || doc.name || 'Untitled').trim().slice(0, 120) || 'Untitled',
    bytes,
    thumbnail,
    width: doc.width,
    height: doc.height,
    pages: Math.max(1, Math.round(opts.pages || 1)),
    size: bytes.byteLength,
    hasReplay: opts.hasReplay ?? doc.rec.events.length > 0,
    createdAt: existing?.createdAt || doc.meta.created || savedAt,
    modifiedAt: doc.meta.modified || savedAt,
    savedAt,
  };
  await putLibraryProject(entry);
  doc.libraryId = id;
  doc.libraryOptOut = false;
  return entry;
}

async function saveDocToLibraryUnlocked(doc: DocEngine, quiet = false): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const revision = doc.rev;
    beginProjectSave(doc, revision);
    const bytes = await serializeDoc(doc);
    verifyBytes(bytes);
    if (doc.rev !== revision) continue;
    const thumbnail = await projectThumbnail(doc);
    if (doc.rev !== revision) continue;
    await writeLibraryEntry(doc, bytes, { thumbnail });
    if (!markProjectSaved(doc, revision)) { scheduleAutosave(250); continue; }
    if (!quiet) toast(`Saved “${doc.name}” to the Carbon Library`, 'success');
    return true;
  }
  throw new Error('The document kept changing while the Library save was prepared. Try Save again.');
}

async function saveComicToLibraryUnlocked(doc: DocEngine, quiet = false): Promise<boolean> {
  if (!doc.comic) return false;
  const pages = getApp().docs.filter((page) => page.comic?.id === doc.comic!.id).sort((a, b) => a.comic!.index - b.comic!.index);
  if (!pages.length) return false;
  const name = pages[0].comic!.name || 'Comic';
  for (let attempt = 0; attempt < 3; attempt++) {
    const revisions = pages.map((page) => page.rev);
    pages.forEach((page, i) => beginProjectSave(page, revisions[i]));
    const bytes = await serializeComic(name, pages);
    if (!isComicArchive(bytes)) throw new Error('The comic archive did not pass its integrity check.');
    if (pages.some((page, i) => page.rev !== revisions[i])) continue;
    const thumbnail = await projectThumbnail(pages[0]);
    if (pages.some((page, i) => page.rev !== revisions[i])) continue;
    await writeLibraryEntry(pages[0], bytes, { id: pages[0].comic!.id, name, pages: pages.length, thumbnail, hasReplay: pages.some((page) => page.rec.events.length > 0) });
    if (pages.some((page, i) => page.rev !== revisions[i])) { scheduleAutosave(250); continue; }
    pages.forEach((page, i) => {
      page.libraryId = pages[0].comic!.id;
      page.libraryOptOut = false;
      markProjectSaved(page, revisions[i]);
    });
    if (!quiet) toast(`Saved “${name}” (${pages.length} pages) to the Carbon Library`, 'success');
    return true;
  }
  throw new Error('The comic changed while the Library save was prepared. Try Save again.');
}

/** Save or refresh an editable project in the Windows-only local Library. */
export async function saveProjectToLibrary(doc: DocEngine | null = activeDoc(), quiet = false): Promise<boolean> {
  if (!doc) return false;
  return runSaveSerial(projectSaveKey(doc), async () => {
    try { return doc.comic ? await saveComicToLibraryUnlocked(doc, quiet) : await saveDocToLibraryUnlocked(doc, quiet); }
    catch (e) {
      const group = doc.comic ? getApp().docs.filter((page) => page.comic?.id === doc.comic!.id) : [doc];
      group.forEach((page) => markProjectFailed(page, e));
      toast(`Library save failed for “${doc.name}”: ${e instanceof Error ? e.message : e}. Your open artwork remains available.`, 'error');
      return false;
    }
  });
}

export function saveDoc(doc: DocEngine, mode: 'save' | 'saveAs' | 'copy' = 'save'): Promise<boolean> {
  return EDITION.windows ? runSaveSerial(projectSaveKey(doc), () => saveDocUnlocked(doc, mode)) : saveDocUnlocked(doc, mode);
}

async function saveDocUnlocked(doc: DocEngine, mode: 'save' | 'saveAs' | 'copy'): Promise<boolean> {
  if (EDITION.windows && mode === 'save' && !doc.fileHandle) return saveDocToLibraryUnlocked(doc);
  let revision = doc.rev;
  if (EDITION.windows && mode !== 'copy') beginProjectSave(doc, revision);
  try {
    const suggested = safeName(doc.name) + (mode === 'copy' ? ' copy' : '') + '.carbon';
    if (isNative()) {
      const bytes = await serializeDoc(doc);
      verifyBytes(bytes);
      if (doc.rev !== revision) throw new Error('The document changed while the save was being prepared. Save again to include the latest edits.');
      return await saveNative(doc, bytes, mode, suggested, revision);
    }

    const desktop = EDITION.electron ? desktopBridge() : null;
    if (desktop) {
      let electronHandle = mode === 'save' ? doc.fileHandle as { electron?: boolean; fileId?: string; name?: string; path?: string } | null : null;
      for (let attempt = 0; attempt < 3; attempt++) {
        revision = doc.rev;
        if (EDITION.windows && mode !== 'copy') beginProjectSave(doc, revision);
        const bytes = await serializeDoc(doc);
        verifyBytes(bytes);
        if (doc.rev !== revision) continue;
        const result = await desktop.saveProject({
          fileId: electronHandle?.electron ? electronHandle.fileId : undefined,
          name: suggested,
          extension: 'carbon',
          bytes: toArrayBuffer(bytes),
        });
        if (result.canceled) {
          if (EDITION.windows && mode !== 'copy') setSaveState(doc, doc.dirty ? 'unsaved' : 'saved');
          return false;
        }
        if (mode === 'copy') {
          await addRecent(doc, bytes).catch(() => {});
          toast(`Saved a copy of “${doc.name}” (${(bytes.length / 1048576).toFixed(2)} MB)`, 'success');
          return true;
        }
        const savedHandle = { electron: true, fileId: result.fileId, name: result.name, path: result.path };
        doc.fileHandle = savedHandle;
        doc.fileName = result.name || suggested;
        doc.filePath = result.path || null;
        doc.name = doc.fileName.replace(/\.carbon$/i, '');
        electronHandle = savedHandle;
        if (doc.rev !== revision) continue;
        const thumbnail = await projectThumbnail(doc);
        if (doc.rev !== revision) continue;
        let libraryFailed = false;
        try { await writeLibraryEntry(doc, bytes, { thumbnail }); }
        catch (error) {
          libraryFailed = true;
          doc.librarySyncPending = true;
          toast(`The .carbon file was saved, but the Library mirror could not be refreshed: ${error instanceof Error ? error.message : error}. It will retry during autosave.`, 'error');
        }
        if (!markProjectSaved(doc, revision, !libraryFailed)) continue;
        await addRecent(doc, bytes).catch(() => {});
        await idbPut('backup', doc.id, { name: doc.name, bytes, savedAt: Date.now() }).catch(() => {});
        toast(`Saved “${doc.name}” (${(bytes.length / 1024 / 1024).toFixed(2)} MB) · ${result.path}`, 'success');
        return true;
      }
      throw new Error('The document kept changing during save. No older revision was marked as saved; try Save again.');
    }

    let handle: Handle | null = mode === 'save' ? (doc.fileHandle as Handle | null) : null;
    const w = window as unknown as { showSaveFilePicker?: (o: unknown) => Promise<Handle> };
    if (!handle && w.showSaveFilePicker) {
      try {
        handle = await w.showSaveFilePicker({ suggestedName: suggested, types: [{ description: 'CARBON Project', accept: { [MIME]: ['.carbon'] } }] });
      } catch (e) {
        if ((e as Error).name === 'AbortError') { if (EDITION.windows && mode !== 'copy') setSaveState(doc, doc.dirty ? 'unsaved' : 'saved'); return false; }
        handle = null;
      }
    }

    let bytes: Uint8Array | null = null;
    let savedRevision = -1;
    if (handle) {
      for (let attempt = 0; attempt < 3; attempt++) {
        savedRevision = doc.rev;
        if (EDITION.windows && mode !== 'copy') beginProjectSave(doc, savedRevision);
        bytes = await serializeDoc(doc);
        verifyBytes(bytes);
        if (doc.rev !== savedRevision) continue;
        const writable = await handle.createWritable();
        try { await writable.write(bytes); await writable.close(); }
        catch (error) { try { await writable.abort?.(); } catch { /* keep the original write failure */ } throw error; }
        if (mode !== 'copy') { doc.fileHandle = handle; doc.fileName = handle.name; doc.filePath = null; doc.name = handle.name.replace(/\.carbon$/i, ''); }
        if (doc.rev === savedRevision) break;
      }
      if (!bytes || doc.rev !== savedRevision) throw new Error('The document kept changing during save. The latest edits remain unsaved; try again.');
    } else {
      bytes = await serializeDoc(doc);
      verifyBytes(bytes);
      if (doc.rev !== revision) throw new Error('The document changed while the save was being prepared. Save again to include the latest edits.');
      const downloadStarted = await download(new Blob([bytes as BlobPart], { type: MIME }), suggested);
      if (!downloadStarted) { if (EDITION.windows && mode !== 'copy') setSaveState(doc, 'unsaved'); return false; }
      if (mode !== 'copy') {
        doc.fileName = suggested;
        if (EDITION.windows) setSaveState(doc, 'unsaved');
        toast('The project download was started. Keep the document open until the browser confirms it; use the local Project Library for automatic saving.', 'info');
        return false;
      }
    }

    if (mode !== 'copy') {
      const thumbnail = await projectThumbnail(doc);
      if (doc.rev !== savedRevision) {
        doc.dirty = true;
        setSaveState(doc, 'unsaved');
        toast('The project file contains the saved revision, but newer edits remain unsaved.', 'error');
        return false;
      }
      let libraryFailed = false;
      if (EDITION.windows) {
        try { await writeLibraryEntry(doc, bytes, { thumbnail }); }
        catch (error) {
          libraryFailed = true;
          doc.librarySyncPending = true;
          toast(`The project file was saved, but the Library mirror could not be refreshed: ${error instanceof Error ? error.message : error}.`, 'error');
        }
      }
      markProjectSaved(doc, savedRevision, !libraryFailed);
    }
    await addRecent(doc, bytes).catch(() => {});
    await idbPut('backup', doc.id, { name: doc.name, bytes, savedAt: Date.now() }).catch(() => {});
    toast(`${mode === 'copy' ? 'Saved a copy of' : 'Saved'} “${doc.name}” (${(bytes.length / 1024 / 1024).toFixed(2)} MB)`, 'success');
    return true;
  } catch (error) {
    if (EDITION.windows && mode !== 'copy') markProjectFailed(doc, error, revision);
    toast(`Save failed: ${error instanceof Error ? error.message : error}. The last verified project file was left intact; your open artwork remains available.`, 'error');
    return false;
  }
}

interface NativeHandle { native: true; name: string }

/** Android: projects are written (via temp file + verify + replace) to Documents/CARBON. */
async function saveNative(doc: DocEngine, bytes: Uint8Array, mode: 'save' | 'saveAs' | 'copy', suggested: string, revision: number): Promise<boolean> {
  const existing = doc.fileHandle as NativeHandle | null;
  let name = mode === 'save' && existing?.native ? existing.name : null;
  if (!name) {
    const entered = await promptDialog(mode === 'copy' ? 'Save a copy' : 'Save project', 'File name (saved to the CARBON folder on this device):', suggested.replace(/\.carbon$/i, ''));
    if (entered === null) return false;
    name = safeName(entered).replace(/(\.carbon)?$/i, '.carbon');
  }
  const { path } = await writeProject(name, bytes);
  if (mode !== 'copy') {
    doc.fileHandle = { native: true, name } as NativeHandle;
    doc.fileName = name;
    doc.name = name.replace(/\.carbon$/i, '');
  }
  if (mode !== 'copy' && doc.rev !== revision) {
    toast('The project file was saved, but newer edits arrived during the write. Your document remains unsaved.', 'error');
    return false;
  }
  if (mode !== 'copy') {
    doc.dirty = false;
    doc.emit();
  }
  await addRecent(doc, bytes).catch(() => {});
  await idbPut('backup', doc.id, { name: doc.name, bytes, savedAt: Date.now() }).catch(() => {});
  toast(`Saved ${path} (${(bytes.length / 1024 / 1024).toFixed(2)} MB)`, 'success');
  return true;
}

/** Save every page of a Comic Studio project as one validated .carboncomic file. */
export function saveComicProject(doc: DocEngine, mode: 'save' | 'saveAs' | 'copy' = 'save'): Promise<boolean> {
  if (!doc.comic) return Promise.resolve(false);
  return EDITION.windows
    ? runSaveSerial(projectSaveKey(doc), () => saveComicProjectUnlocked(doc, mode))
    : saveComicProjectUnlocked(doc, mode);
}

async function saveComicProjectUnlocked(doc: DocEngine, mode: 'save' | 'saveAs' | 'copy'): Promise<boolean> {
  if (!doc.comic) return false;
  const pages = getApp().docs.filter((page) => page.comic?.id === doc.comic!.id).sort((a, b) => a.comic!.index - b.comic!.index);
  if (!pages.length) return false;
  const title = pages[0].comic!.name || 'Comic';
  const root = pages[0];
  if (EDITION.windows && mode === 'save' && !root.fileHandle) return saveComicToLibraryUnlocked(doc);
  const suggested = safeName(title) + (mode === 'copy' ? ' copy' : '') + '.carboncomic';
  if (EDITION.windows && mode !== 'copy') pages.forEach((page) => beginProjectSave(page, page.rev));
  try {
    const desktop = EDITION.electron ? desktopBridge() : null;
    if (desktop) {
      let electronHandle = mode === 'save' ? root.fileHandle as { electron?: boolean; fileId?: string } | null : null;
      for (let attempt = 0; attempt < 3; attempt++) {
        const revisions = pages.map((page) => page.rev);
        const bytes = await serializeComic(title, pages);
        if (!isComicArchive(bytes)) throw new Error('The comic archive did not pass its integrity check.');
        if (pages.some((page, i) => page.rev !== revisions[i])) continue;
        const result = await desktop.saveProject({
          fileId: electronHandle?.electron ? electronHandle.fileId : undefined,
          name: suggested,
          extension: 'carboncomic',
          bytes: toArrayBuffer(bytes),
        });
        if (result.canceled) {
          if (mode !== 'copy') pages.forEach((page) => setSaveState(page, page.dirty ? 'unsaved' : 'saved'));
          return false;
        }
        if (mode === 'copy') {
          await addRecent(root, bytes).catch(() => {});
          toast(`Saved a copy of comic “${title}” (${pages.length} pages)`, 'success');
          return true;
        }
        const handle = { electron: true, fileId: result.fileId, name: result.name, path: result.path };
        root.fileHandle = handle;
        pages.forEach((page) => { page.fileName = result.name; page.filePath = result.path; });
        electronHandle = handle;
        if (pages.some((page, i) => page.rev !== revisions[i])) continue;
        const thumbnail = await projectThumbnail(root);
        if (pages.some((page, i) => page.rev !== revisions[i])) continue;
        let libraryFailed = false;
        try {
          await writeLibraryEntry(root, bytes, { id: root.comic!.id, name: title, pages: pages.length, thumbnail, hasReplay: pages.some((page) => page.rec.events.length > 0) });
        } catch (error) {
          libraryFailed = true;
          pages.forEach((page) => { page.librarySyncPending = true; });
          toast(`The comic file was saved, but the Library mirror could not be refreshed: ${error instanceof Error ? error.message : error}.`, 'error');
        }
        pages.forEach((page, i) => { page.libraryId = root.comic!.id; page.libraryOptOut = false; markProjectSaved(page, revisions[i], !libraryFailed); });
        await addRecent(root, bytes).catch(() => {});
        await idbPut('backup', root.id, { name: title, bytes, savedAt: Date.now() }).catch(() => {});
        toast(`Saved comic “${title}” (${pages.length} pages, ${(bytes.length / 1048576).toFixed(2)} MB) · ${result.path}`, 'success');
        return true;
      }
      throw new Error('The comic kept changing during save; the latest revisions remain unsaved. Try again.');
    }

    const revisions = pages.map((page) => [page, page.rev] as const);
    const bytes = await serializeComic(title, pages);
    if (!isComicArchive(bytes)) throw new Error('The comic archive did not pass its integrity check.');
    if (revisions.some(([page, rev]) => page.rev !== rev)) throw new Error('A page changed while the comic was being prepared. Save again to include the latest edits.');

    if (isNative()) {
      const existing = root.fileHandle as NativeHandle | null;
      let name = mode === 'save' && existing?.native ? existing.name : null;
      if (!name) {
        const entered = await promptDialog(mode === 'copy' ? 'Save a comic copy' : 'Save comic project', 'File name (saved to the CARBON folder on this device):', suggested.replace(/\.carboncomic$/i, ''));
        if (entered === null) return false;
        name = safeName(entered).replace(/(\.carboncomic)?$/i, '.carboncomic');
      }
      const { path } = await writeProject(name, bytes);
      if (mode !== 'copy') {
        root.fileHandle = { native: true, name } as NativeHandle;
        pages.forEach((page) => { page.fileName = name!; });
      }
      if (revisions.some(([page, rev]) => page.rev !== rev)) {
        toast('The comic file was saved, but a page changed during the write. Your open pages remain marked unsaved.', 'error');
        return false;
      }
      if (mode !== 'copy') pages.forEach((page) => { page.dirty = false; page.emit(); });
      if (mode !== 'copy') {
        await addRecent(root, bytes).catch(() => {});
        await idbPut('backup', root.id, { name: title, bytes, savedAt: Date.now() }).catch(() => {});
      }
      toast(`Saved ${path} (${pages.length} pages, ${(bytes.length / 1048576).toFixed(2)} MB)`, 'success');
      return true;
    }

    let handle: Handle | null = mode === 'save' ? (root.fileHandle as Handle | null) : null;
    const w = window as unknown as { showSaveFilePicker?: (o: unknown) => Promise<Handle> };
    if (!handle && w.showSaveFilePicker) {
      try {
        handle = await w.showSaveFilePicker({ suggestedName: suggested, types: [{ description: 'CARBON Comic Project', accept: { [COMIC_MIME]: ['.carboncomic'] } }] });
      } catch (e) {
        if ((e as Error).name === 'AbortError') { if (EDITION.windows) pages.forEach((page) => setSaveState(page, page.dirty ? 'unsaved' : 'saved')); return false; }
        handle = null;
      }
    }
    if (handle) {
      const writable = await handle.createWritable();
      try { await writable.write(bytes); await writable.close(); }
      catch (e) { try { await writable.abort?.(); } catch { /* preserve original write failure */ } throw e; }
      if (mode !== 'copy') {
        root.fileHandle = handle;
        pages.forEach((page) => { page.fileName = handle!.name; page.filePath = null; });
      }
    } else {
      const downloadStarted = await download(new Blob([bytes as BlobPart], { type: COMIC_MIME }), suggested);
      if (!downloadStarted) return false;
      if (mode !== 'copy') {
        pages.forEach((page) => { page.fileName = suggested; });
        if (EDITION.windows) {
          pages.forEach((page) => setSaveState(page, 'unsaved'));
          toast('The comic download was started, but the browser cannot verify its destination. Keep the open project until a local Library save completes.', 'info');
          return false;
        }
      }
    }
    if (revisions.some(([page, rev]) => page.rev !== rev)) {
      toast('The comic file was saved, but a page changed during the write. Your open pages remain marked unsaved.', 'error');
      return false;
    }
    if (mode !== 'copy') {
      if (EDITION.windows) pages.forEach((page, i) => markProjectSaved(page, revisions[i][1]));
      else pages.forEach((page) => { page.dirty = false; page.emit(); });
      await addRecent(root, bytes).catch(() => {});
      await idbPut('backup', root.id, { name: title, bytes, savedAt: Date.now() }).catch(() => {});
      if (EDITION.windows) {
        try { await writeLibraryEntry(root, bytes, { id: root.comic!.id, name: title, pages: pages.length, hasReplay: pages.some((page) => page.rec.events.length > 0) }); }
        catch (error) { pages.forEach((page) => { page.librarySyncPending = true; }); toast(`The comic file was saved, but its Library copy could not be refreshed: ${error instanceof Error ? error.message : error}`, 'error'); }
      }
    }
    toast(`${mode === 'copy' ? 'Saved a copy of' : 'Saved'} comic “${title}” (${pages.length} pages, ${(bytes.length / 1048576).toFixed(2)} MB)`, 'success');
    return true;
  } catch (error) {
    if (EDITION.windows && mode !== 'copy') pages.forEach((page) => markProjectFailed(page, error));
    toast(`Comic save failed: ${error instanceof Error ? error.message : error}. Your previous file was not modified.`, 'error');
    return false;
  }
}

/** Route Save/Save As to the correct project container for the active document type. */
export async function saveActiveDocument(mode: 'save' | 'saveAs' | 'copy' = 'save'): Promise<boolean> {
  const doc = activeDoc();
  if (!doc) return false;
  return doc.comic ? saveComicProject(doc, mode) : saveDoc(doc, mode);
}

let homeNavigationInFlight = false;
/** Save dirty work first; cancellation or failure leaves the editor and every open document intact. */
export async function navigateHomeSafely(saveCurrent: () => Promise<boolean> = () => saveActiveDocument('save')) {
  if (homeNavigationInFlight || getApp().homeSaving) return false;
  const doc = activeDoc();
  if (!doc) { setApp({ homeScreen: true, canvasOnly: false }); return true; }
  const dirty = doc.comic
    ? getApp().docs.some((page) => page.comic?.id === doc.comic!.id && page.dirty)
    : doc.dirty;
  if (!dirty && !EDITION.windows) { setApp({ homeScreen: true, canvasOnly: false, dialog: null }); return true; }

  homeNavigationInFlight = true;
  setApp({ homeSaving: true });
  try {
    const saved = await saveCurrent();
    if (!saved) {
      toast('Home was not opened; the save was canceled or did not finish. Your artwork is still open.', 'info');
      return false;
    }
    setApp({ homeScreen: true, canvasOnly: false, dialog: null });
    return true;
  } finally {
    homeNavigationInFlight = false;
    setApp({ homeSaving: false });
  }
}

export async function shareProject(doc: DocEngine) {
  try {
    const bytes = await serializeDoc(doc);
    verifyBytes(bytes);
    await shareProjectFile(safeName(doc.name) + '.carbon', bytes);
  } catch (e) {
    toast('Share failed: ' + (e instanceof Error ? e.message : e), 'error');
  }
}

export async function listProjectLibrary() {
  return listLibraryProjects();
}

export async function openProjectFromLibrary(id: string): Promise<DocEngine | null> {
  try {
    const entry = await getLibraryProject(id);
    if (!entry) { toast('That Library project is no longer available.', 'error'); return null; }
    const existing = getApp().docs.find((d) => d.libraryId === id || d.comic?.id === id);
    if (existing) {
      setApp({ activeId: existing.id, homeScreen: false, canvasOnly: false });
      return existing;
    }
    if (entry.kind === 'comic') {
      const { pages } = await deserializeComic(entry.bytes);
      if (!pages.length) throw new Error('The comic project contains no pages.');
      pages.forEach((page, i) => {
        const cm = page.comic;
        if (cm) page.comic = { ...cm, name: entry.name };
        page.name = `${entry.name} – p${i + 1}`;
        page.fileName = null; page.filePath = null; page.fileHandle = null;
        page.libraryId = id; page.libraryOptOut = false; page.dirty = false;
      });
      pages.forEach((page) => addDoc(page));
      setApp({ activeId: pages[0].id, homeScreen: false, canvasOnly: false });
      return pages[0];
    }
    const doc = await deserializeDoc(entry.bytes);
    doc.name = entry.name;
    doc.fileName = null; doc.filePath = null; doc.fileHandle = null;
    doc.libraryId = id; doc.libraryOptOut = false; doc.dirty = false;
    addDoc(doc);
    return doc;
  } catch (e) {
    toast(`Could not open Library project: ${e instanceof Error ? e.message : e}`, 'error');
    return null;
  }
}

export async function renameProjectInLibrary(id: string, rawName: string): Promise<boolean> {
  const name = rawName.trim().slice(0, 120);
  if (!name) { toast('Project name cannot be empty.', 'error'); return false; }
  try {
    const entry = await getLibraryProject(id);
    if (!entry) throw new Error('The project could not be found.');
    const open = getApp().docs.filter((d) => d.libraryId === id || d.comic?.id === id);
    if (open.length) {
      if (open[0].comic) {
        open.filter((page) => page.comic?.id === open[0].comic!.id).forEach((page) => {
          if (page.comic) page.comic = { ...page.comic, name };
          page.name = `${name} – p${(page.comic?.index ?? 0) + 1}`;
          page.touch();
        });
      } else {
        open[0].name = name;
        open[0].touch();
      }
      const saved = await saveProjectToLibrary(open[0], true);
      if (!saved) return false;
      toast(`Renamed Library project to “${name}”`, 'success');
      return true;
    }

    let bytes: Uint8Array;
    if (entry.kind === 'comic') {
      const { pages } = await deserializeComic(entry.bytes);
      if (!pages.length) throw new Error('The comic project contains no pages.');
      pages.forEach((page, i) => {
        if (page.comic) page.comic = { ...page.comic, name };
        page.name = `${name} – p${i + 1}`;
        page.meta.modified = Date.now();
      });
      bytes = await serializeComic(name, pages);
    } else {
      const doc = await deserializeDoc(entry.bytes);
      doc.name = name;
      doc.meta.modified = Date.now();
      bytes = await serializeDoc(doc);
    }
    await putLibraryProject({ ...entry, name, bytes, size: bytes.byteLength, modifiedAt: Date.now(), savedAt: Date.now() });
    toast(`Renamed Library project to “${name}”`, 'success');
    return true;
  } catch (e) {
    toast(`Could not rename project: ${e instanceof Error ? e.message : e}`, 'error');
    return false;
  }
}

export async function duplicateLibraryProject(id: string): Promise<boolean> {
  try {
    const entry = await getLibraryProject(id);
    if (!entry) throw new Error('The project could not be found.');
    const name = `${entry.name} copy`;
    const now = Date.now();
    if (entry.kind === 'comic') {
      const { pages } = await deserializeComic(entry.bytes);
      const newId = uid('comic-');
      pages.forEach((page, i) => {
        if (page.comic) page.comic = { ...page.comic, id: newId, name, index: i };
        page.name = `${name} – p${i + 1}`;
        page.meta.uuid = uid('cbn-'); page.meta.lineage = ''; page.meta.branch = '';
        page.meta.created = now; page.meta.modified = now;
        page.libraryId = newId; page.fileName = null; page.filePath = null; page.fileHandle = null; page.dirty = false;
      });
      const bytes = await serializeComic(name, pages);
      const thumbnail = await projectThumbnail(pages[0]);
      await putLibraryProject({ ...entry, id: newId, name, bytes, thumbnail, size: bytes.byteLength, createdAt: now, modifiedAt: now, savedAt: now, pages: pages.length });
    } else {
      const doc = await deserializeDoc(entry.bytes);
      doc.name = name;
      doc.meta.uuid = uid('cbn-'); doc.meta.lineage = ''; doc.meta.branch = '';
      doc.meta.created = now; doc.meta.modified = now;
      doc.libraryId = doc.meta.uuid; doc.libraryOptOut = false;
      doc.fileName = null; doc.filePath = null; doc.fileHandle = null; doc.dirty = false;
      const bytes = await serializeDoc(doc);
      const thumbnail = await projectThumbnail(doc);
      await putLibraryProject({ ...entry, id: doc.meta.uuid, kind: libraryKindOf(doc), name, bytes, thumbnail, size: bytes.byteLength, createdAt: now, modifiedAt: now, savedAt: now, pages: 1 });
    }
    toast(`Created an independent Library copy of “${entry.name}”`, 'success');
    return true;
  } catch (e) {
    toast(`Could not duplicate project: ${e instanceof Error ? e.message : e}`, 'error');
    return false;
  }
}

export async function removeProjectFromLibrary(id: string): Promise<boolean> {
  try {
    const entry = await getLibraryProject(id);
    if (!entry) throw new Error('The project could not be found.');
    const open = getApp().docs.filter((doc) => doc.libraryId === id || doc.comic?.id === id);
    const queueKey = open[0] ? projectSaveKey(open[0]) : `project:${id}`;
    return await runSaveSerial(queueKey, async () => {
      const priorOptOut = open.map((doc) => [doc, doc.libraryOptOut] as const);
      open.forEach((doc) => { doc.libraryId = null; doc.libraryOptOut = true; });
      try { await deleteStoredLibraryProject(id); }
      catch (error) {
        priorOptOut.forEach(([doc, optOut]) => { doc.libraryId = id; doc.libraryOptOut = optOut; });
        throw error;
      }
      toast(`Removed “${entry.name}” from the Carbon Library. Open copies remain available.`, 'success');
      return true;
    });
  } catch (e) {
    toast(`Could not remove project from the Library: ${e instanceof Error ? e.message : e}`, 'error');
    return false;
  }
}

export async function closeDoc(id: string, force = false) {
  const s = getApp();
  const doc = s.docs.find((d) => d.id === id);
  if (!doc) return true;
  // A Comic Studio project is one multi-page file; closing one tab closes the project group.
  // The explicit Delete Page action passes force=true and removes only that confirmed page.
  const comicPages = doc.comic ? s.docs.filter((page) => page.comic?.id === doc.comic!.id).sort((a, b) => a.comic!.index - b.comic!.index) : [];
  const group = !force && doc.comic ? comicPages : [doc];
  if (force && doc.comic && comicPages[0]?.id === doc.id && comicPages[1]) {
    comicPages[1].fileHandle = doc.fileHandle;
    comicPages[1].fileName = doc.fileName;
  }
  if (!force && group.some((page) => page.dirty)) {
    const isComic = !!doc.comic;
    const r = await confirmDialog(isComic ? 'Save comic changes?' : 'Save changes?', isComic
      ? `Comic “${doc.comic!.name}” has unsaved changes across ${group.length} page${group.length === 1 ? '' : 's'}. Save the complete .carboncomic project before closing?`
      : `“${doc.name}” has unsaved changes. Save before closing?`, [
      { label: 'Cancel', value: 'cancel' },
      { label: "Don't save", value: 'discard', variant: 'danger' },
      { label: 'Save', value: 'save', variant: 'primary' },
    ]);
    if (r === 'cancel') return false;
    if (r === 'save' && !(await (isComic ? saveComicProject(doc, 'save') : saveDoc(doc)))) return false;
  }
  const ids = new Set(group.map((page) => page.id));
  ids.forEach((docId) => { unsubs.get(docId)?.(); unsubs.delete(docId); });
  const docs = s.docs.filter((page) => !ids.has(page.id));
  const activeRemoved = s.activeId !== null && ids.has(s.activeId);
  const activeIndex = s.docs.findIndex((page) => page.id === s.activeId);
  const fallback = activeRemoved ? docs[Math.min(Math.max(activeIndex, 0), docs.length - 1)]?.id || null : s.activeId;
  setApp({ docs, activeId: fallback, replay: s.replay && ids.has(s.replay.docId) ? null : s.replay, homeScreen: docs.length === 0 ? false : s.homeScreen });
  ids.forEach((docId) => { idbDel('session', docId).catch(() => {}); });
  return true;
}

export async function duplicateDoc(doc: DocEngine) {
  const bytes = await serializeDoc(doc);
  const d = await deserializeDoc(bytes);
  d.name = doc.name + ' (duplicate)';
  d.meta.uuid = uid('cbn-'); // a duplicate is a new project: own identity, own Time Machine history
  d.meta.lineage = '';
  d.meta.branch = '';
  d.dirty = true;
  addDoc(d);
}

async function projectExportCanvas(doc: DocEngine, scale: number, opaque: boolean): Promise<HTMLCanvasElement> {
  const width = Math.max(16, Math.round(doc.width * scale));
  const height = Math.max(16, Math.round(doc.height * scale));
  if (doc.scene3d) {
    const scene = sceneOf(doc.scene3d);
    const dataUrl = await renderSceneImage(scene, scene.camera || DEFAULT_VIEW, width, height, { transparent: !opaque, assets: doc.assetImgs });
    const image = await loadImage(dataUrl);
    const canvas = createCanvas(width, height);
    ctxOf(canvas).drawImage(image, 0, 0, width, height);
    return canvas;
  }
  return compositeDoc(doc, scale, opaque);
}

export async function exportImage(doc: DocEngine, type: 'image/png' | 'image/jpeg' | 'image/webp', quality: number, scale: number, transparent: boolean): Promise<boolean> {
  let canvas: HTMLCanvasElement | null = null;
  try {
    canvas = await projectExportCanvas(doc, scale, !transparent || type === 'image/jpeg');
    if (type === 'image/jpeg' && !doc.scene3d && !doc.background) {
      const white = createCanvas(canvas.width, canvas.height);
      const ctx = ctxOf(white);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, white.width, white.height); ctx.drawImage(canvas, 0, 0);
      canvas.width = 0; canvas.height = 0;
      canvas = white;
    }
    const blob = await canvasToBlob(canvas, type, quality);
    if (blob.type !== type) toast(`This platform cannot encode ${type.split('/')[1].toUpperCase()}; exported as ${blob.type.split('/')[1].toUpperCase()}.`, 'error');
    const ext = blob.type.split('/')[1].replace('jpeg', 'jpg');
    const delivered = await download(blob, `${safeName(doc.name)}.${ext}`);
    if (!delivered) return false;
    if (!EDITION.electron) toast(`Exported ${canvas.width}×${canvas.height} ${ext.toUpperCase()}`, 'success');
    return true;
  } catch (e) {
    toast('Export failed: ' + (e instanceof Error ? e.message : e), 'error');
    return false;
  } finally {
    if (canvas) { canvas.width = 0; canvas.height = 0; }
  }
}

/** Vectorise supported 2D Crisp Ink paths and embed raster layers when SVG can preserve them faithfully. */
export async function exportSVG(doc: DocEngine, scale: number, transparent: boolean): Promise<boolean> {
  let canvas: HTMLCanvasElement | null = null;
  try {
    if (doc.scene3d) {
      canvas = await projectExportCanvas(doc, scale, !transparent);
      const svg = svgFromRasterCanvas(canvas);
      const delivered = await download(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), `${safeName(doc.name)}.svg`);
      if (!delivered) return false;
      if (!EDITION.electron) toast('SVG exported with the current 3D camera render embedded as PNG; 3D geometry remains editable in the .carbon project.', 'success');
      return true;
    }
    const result = buildDocumentSvg(doc, scale, transparent);
    const delivered = await download(new Blob([result.markup], { type: 'image/svg+xml;charset=utf-8' }), `${safeName(doc.name)}.svg`);
    if (!delivered) return false;
    if (!EDITION.electron) {
      const scaleLabel = `${Math.max(1, Math.round(doc.width * scale))}×${Math.max(1, Math.round(doc.height * scale))}`;
      if (result.flattened) toast(`SVG exported at ${scaleLabel}; advanced compositing was accurately flattened to an embedded PNG.`, 'success');
      else if (result.vectorPaths && result.rasterLayers) toast(`SVG exported at ${scaleLabel} with ${result.vectorPaths} vector ink paths and ${result.rasterLayers} raster layer${result.rasterLayers === 1 ? '' : 's'}.`, 'success');
      else if (result.vectorPaths) toast(`SVG exported at ${scaleLabel} with ${result.vectorPaths} editable Crisp Ink vector paths.`, 'success');
      else toast(`SVG exported at ${scaleLabel} with ${result.rasterLayers} raster layer${result.rasterLayers === 1 ? '' : 's'} embedded.`, 'success');
    }
    return true;
  } catch (e) {
    toast('SVG export failed: ' + (e instanceof Error ? e.message : e), 'error');
    return false;
  } finally {
    if (canvas) { canvas.width = 0; canvas.height = 0; }
  }
}

export async function importImageFile(doc: DocEngine, file: File) {
  try {
    const url = await blobToDataURL(file);
    const img = await loadImage(url);
    const id = uid('asset-');
    doc.assets[id] = url;
    doc.assetImgs.set(id, img);
    const s = Math.min(1, doc.width / img.width, doc.height / img.height);
    const w = img.width * s, h = img.height * s;
    const index = doc.layers.findIndex((l) => l.id === doc.activeLayerId) + 1;
    const ok = doc.exec({ k: 'image', layerId: uid('L'), name: file.name.replace(/\.[^.]+$/, '').slice(0, 40), asset: id, x: (doc.width - w) / 2, y: (doc.height - h) / 2, w, h, index });
    if (!ok) toast('Could not import image (layer limit reached?)', 'error');
  } catch (e) {
    toast('Import failed: ' + (e instanceof Error ? e.message : e), 'error');
  }
}

export async function openImageAsDoc(file: File) {
  try {
    const img = await loadImage(await blobToDataURL(file));
    let w = img.width, h = img.height;
    const k = Math.min(1, MAX_SIDE / Math.max(w, h), Math.sqrt(MAX_AREA / (w * h)));
    w = Math.max(16, Math.round(w * k));
    h = Math.max(16, Math.round(h * k));
    const doc = newDocument(w, h, file.name.replace(/\.[^.]+$/, ''), null);
    if (doc) {
      await importImageFile(doc, file);
      doc.dirty = true;
    }
    return doc;
  } catch (e) {
    toast('Could not open image: ' + (e instanceof Error ? e.message : e), 'error');
    return null;
  }
}

// ---------- recent / session ----------
export async function addRecent(doc: DocEngine, bytes: Uint8Array) {
  if (bytes.length > 60 * 1024 * 1024) return;
  const key = doc.fileName || doc.name;
  await idbPut('recent', key, { name: doc.name, bytes, savedAt: Date.now(), size: bytes.length, w: doc.width, h: doc.height } as RecentEntry);
  const all = await idbAll<RecentEntry>('recent');
  all.sort((a, b) => b.value.savedAt - a.value.savedAt);
  for (const e of all.slice(12)) await idbDel('recent', e.key);
}
export async function listRecent() {
  const all = await idbAll<RecentEntry>('recent').catch(() => []);
  return all.sort((a, b) => b.value.savedAt - a.value.savedAt);
}
export async function openRecent(key: string): Promise<DocEngine | null> {
  const e = await idbGet<RecentEntry>('recent', key);
  if (!e) { toast('Recent document is no longer available.', 'error'); return null; }
  const existing = getApp().docs.find((d) => (d.fileName || d.name) === key);
  if (existing) { setApp({ activeId: existing.id }); return existing; }
  return openBytes(e.bytes, key);
}

export async function autosaveAll(force = false) {
  if (autosaving) { autosaveRequested = true; return; }
  autosaving = true;
  let failed = false;
  const savedComics = new Set<string>();
  try {
    const docs = getApp().docs.slice();
    for (const d of docs) {
      const saveOne = async () => {
        let revision = d.rev;
        if (!force && autosavedRev.get(d) === revision) return;
        if (getApp().docs.indexOf(d) < 0) return;
        if (EDITION.windows && !d.libraryOptOut) {
          const group = d.comic ? getApp().docs.filter((page) => page.comic?.id === d.comic!.id) : [d];
          group.forEach((page) => beginProjectSave(page, page.rev));
        }
        let bytes: Uint8Array;
        try {
          bytes = await serializeDoc(d);
          verifyBytes(bytes);
        } catch (error) {
          failed = true;
          if (EDITION.windows) markProjectFailed(d, error, revision);
          toast(`Autosave failed for “${d.name}”: ${error instanceof Error ? error.message : error}. Your open artwork is still available.`, 'error');
          return;
        }
        if (d.rev !== revision) { autosaveRequested = true; return; }

        let projectCommitted = false;
        if (EDITION.windows && !d.libraryOptOut) {
          try {
            if (d.comic) {
              if (!savedComics.has(d.comic.id)) {
                savedComics.add(d.comic.id);
                const saved = await saveComicToLibraryUnlocked(d, true);
                if (!saved) throw new Error('The comic could not be serialized.');
                projectCommitted = true;
              } else projectCommitted = !d.dirty;
            } else {
              const thumbnail = await projectThumbnail(d);
              if (d.rev === revision) {
                await writeLibraryEntry(d, bytes, { thumbnail });
                projectCommitted = markProjectSaved(d, revision);
              } else autosaveRequested = true;
            }
          } catch (error) {
            failed = true;
            const group = d.comic ? getApp().docs.filter((page) => page.comic?.id === d.comic!.id) : [d];
            group.forEach((page) => markProjectFailed(page, error));
            toast(`Library autosave failed for “${d.name}”: ${error instanceof Error ? error.message : error}. Session recovery remains available.`, 'error');
          }
        }

        let sessionBytes = bytes;
        let sessionRevision = d.rev;
        // If edits arrived during encoding, retry the session snapshot instead of replacing a newer
        // recovery record with a stale snapshot. A successful Library commit only changes the view rev.
        if (projectCommitted && !d.dirty) {
          sessionRevision = d.rev;
        } else {
          for (let attempt = 0; attempt < 3 && d.rev !== revision; attempt++) {
            sessionRevision = d.rev;
            sessionBytes = await serializeDoc(d);
            verifyBytes(sessionBytes);
            if (d.rev === sessionRevision) break;
          }
        }
        if (d.rev !== sessionRevision) {
          autosaveRequested = true;
          return;
        }
        const order = getApp().docs.indexOf(d);
        if (order < 0) return;
        try {
          await idbPut('session', d.id, { name: d.name, bytes: sessionBytes, savedAt: Date.now(), fileName: d.fileName, order, dirty: d.dirty } as SessionEntry & { dirty: boolean });
          autosavedRev.set(d, sessionRevision);
        } catch (error) {
          failed = true;
          console.warn('session recovery write failed', error);
          toast(`Session recovery could not be updated for “${d.name}”: ${error instanceof Error ? error.message : error}.`, 'error');
        }
        if (d.rev !== sessionRevision) autosaveRequested = true;
      };
      try {
        if (EDITION.windows) await runSaveSerial(projectSaveKey(d), saveOne);
        else await saveOne();
      } catch (error) {
        failed = true;
        if (EDITION.windows) markProjectFailed(d, error);
        console.warn('autosave failed', error);
      }
    }
  } finally {
    autosaving = false;
    if (autosaveRequested) {
      autosaveRequested = false;
      if (!failed) scheduleAutosave(500);
    }
  }
}

export async function listSession() {
  const all = await idbAll<SessionEntry & { dirty?: boolean }>('session').catch(() => []);
  return all.sort((a, b) => a.value.order - b.value.order);
}
export async function restoreSession() {
  const entries = await listSession();
  let n = 0;
  for (const e of entries) {
    if (getApp().docs.find((d) => d.id === e.key)) continue;
    try {
      const doc = await deserializeDoc(e.value.bytes);
      doc.id = e.key;
      doc.name = e.value.name;
      doc.fileName = e.value.fileName;
      doc.dirty = !!e.value.dirty;
      addDoc(doc);
      n++;
    } catch (err) {
      toast(`Could not recover “${e.value.name}”: ${err instanceof Error ? err.message : err}`, 'error');
    }
  }
  if (n) toast(`Restored ${n} document${n > 1 ? 's' : ''} from your last session`, 'success');
  return n;
}
export async function discardSession() {
  for (const e of await listSession()) await idbDel('session', e.key);
}

// ---------- replay ----------
export async function openReplay(doc: DocEngine | null = activeDoc()) {
  if (!doc) return;
  if (!doc.rec.events.length) {
    showPanel('replay');
    return toast('This document has no recorded history yet. Start recording in the Drawing Replay panel.', 'info');
  }
  doc.preview = null;
  const player = new ReplayPlayer(doc);
  await player.prepare();
  setApp({ replay: { docId: doc.id, player, playing: false, speed: getApp().replay?.speed || 4 }, tool: getApp().tool === 'transform' ? 'brush' : getApp().tool });
  showPanel('replay');
}
export function closeReplay() {
  setApp({ replay: null });
  bump();
}

export async function exportReplayVideo(doc: DocEngine, speed: number, onProgress: (p: number) => void, cancel: { cancelled: boolean }, requested: 'auto' | 'mp4' = 'auto'): Promise<boolean> {
  if (doc.scene3d) throw new Error('3D scene edits are not part of Drawing Replay yet; video export is unavailable for this 3D document.');
  if (!doc.rec.events.length) throw new Error('This document has no Drawing Replay events to export. A still image will not be substituted.');
  if (typeof MediaRecorder === 'undefined') throw new Error('Video recording is not supported on this platform.');
  const candidates = requested === 'mp4'
    ? ['video/mp4;codecs=avc1.42E01E', 'video/mp4']
    : ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
  const mime = candidates.find((m) => MediaRecorder.isTypeSupported(m));
  if (!mime) throw new Error(requested === 'mp4' ? 'This browser or WebView does not provide an MP4 video encoder. No WebM conversion or still-image fallback was made.' : 'No supported WebM or MP4 video codec.');
  const player = new ReplayPlayer(doc);
  await player.prepare();
  if (cancel.cancelled) return false;
  const sc = Math.min(1, 1280 / Math.max(doc.width, doc.height));
  const W = Math.round((doc.width * sc) / 2) * 2, H = Math.round((doc.height * sc) / 2) * 2;
  const c = createCanvas(W, H);
  const ctx = ctxOf(c);
  const eff = Math.max(speed, player.duration / 90000);
  if (typeof c.captureStream !== 'function') throw new Error('Canvas video capture is not supported on this platform.');
  const stream = c.captureStream(30);
  try {
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
    const outputMime = (rec.mimeType || mime).split(';')[0].toLowerCase();
    if (outputMime !== 'video/webm' && outputMime !== 'video/mp4') throw new Error(`Unsupported video output type: ${outputMime || 'unknown'}.`);
    if (requested === 'mp4' && outputMime !== 'video/mp4') throw new Error('The encoder did not provide MP4 output; no substitute format was written.');
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    let encoderError: Error | null = null;
    const done = new Promise<void>((resolve) => {
      rec.onstop = () => resolve();
      rec.onerror = (event) => {
        encoderError = (event as Event & { error?: DOMException }).error || new Error('The video encoder failed.');
        try { if (rec.state !== 'inactive') rec.stop(); } catch { resolve(); }
      };
    });
    const draw = () => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, W, H);
      const g = player.engine;
      renderDoc(ctx, g, [W / g.width, 0, 0, H / g.height, 0, 0], W, H, { bg: true });
    };
    draw();
    rec.start(250);
    const t0 = performance.now();
    await new Promise<void>((resolve) => {
      const step = () => {
        if (cancel.cancelled || encoderError) return resolve();
        const t = (performance.now() - t0) * eff;
        player.seek(Math.min(t, player.duration));
        draw();
        onProgress(Math.min(1, t / Math.max(1, player.duration)));
        if (t >= player.duration) setTimeout(resolve, 1500);
        else setTimeout(step, 1000 / 30);
      };
      step();
    });
    if (rec.state !== 'inactive') rec.stop();
    await done;
    if (encoderError) throw encoderError;
    if (cancel.cancelled) return false;
    const actualMime = (chunks.find((chunk) => chunk.type)?.type || outputMime).split(';')[0].toLowerCase();
    if (actualMime !== 'video/webm' && actualMime !== 'video/mp4') throw new Error(`The encoder returned an unsupported video type: ${actualMime || 'unknown'}.`);
    if (requested === 'mp4' && actualMime !== 'video/mp4') throw new Error('The recorder returned WebM instead of MP4; no mislabeled file was written.');
    const ext = actualMime === 'video/mp4' ? 'mp4' : 'webm';
    const delivered = await download(new Blob(chunks, { type: actualMime }), `${safeName(doc.name)}-replay.${ext}`);
    if (!delivered) return false;
    if (!EDITION.electron) toast(`Replay ${ext.toUpperCase()} video exported`, 'success');
    return true;
  } finally {
    stream.getTracks().forEach((track) => track.stop());
  }
}
