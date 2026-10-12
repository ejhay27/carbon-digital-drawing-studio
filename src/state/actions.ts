import { checkDims, DocEngine, MAX_AREA, MAX_SIDE } from '../engine/document';
import { isNative, shareProjectFile, writeProject } from '../platform/native';
import { COMIC_MIME, deserializeComic, deserializeDoc, isComicArchive, MIME, serializeComic, serializeDoc, verifyBytes } from '../engine/fileFormat';
import { compositeDoc, renderDoc } from '../engine/render';
import { ReplayPlayer } from '../engine/replay';
import { idbAll, idbDel, idbGet, idbPut, type RecentEntry, type SessionEntry } from '../engine/persist';
import { blobToDataURL, canvasToBlob, createCanvas, ctxOf, download, loadImage, uid } from '../engine/util';
import { activeDoc, bump, confirmDialog, getApp, promptDialog, setApp, showPanel, toast } from './store';
import { DEFAULT_VIEW, defaultScene, renderSceneImage, sceneOf } from '../win/sceneRender';
import { EDITION } from '../platform/edition';
import { deleteLibraryProject as deleteStoredLibraryProject, getLibraryProject, listLibraryProjects, putLibraryProject, type LibraryKind, type LibraryProject } from '../platform/windowsLibrary';

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
  try {
    const { deserializeComic } = await import('../engine/fileFormat');
    const { name, pages } = await deserializeComic(new Uint8Array(await file.arrayBuffer()));
    const cid = pages[0].comic?.id || uid('comic-');
    pages.forEach((p, i) => {
      p.comic = { ...(p.comic || { bleed: 0, safe: 0, pageName: `Page ${i + 1}` }), id: cid, name, index: i } as NonNullable<DocEngine['comic']>;
      p.dirty = false;
      if (i === 0) { p.fileHandle = handle; p.fileName = file.name; }
      addDoc(p);
    });
    setApp({ activeId: pages[0].id });
    toast(`Opened comic “${name}” (${pages.length} pages)`, 'success');
    return pages[0];
  } catch (e) {
    toast(`Could not open ${file.name}: ${e instanceof Error ? e.message : e}`, 'error');
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
  opts: { id?: string; name?: string; pages?: number; thumbnail?: Uint8Array } = {},
): Promise<LibraryProject> {
  const id = opts.id || libraryIdOf(doc);
  const existing = await getLibraryProject(id).catch(() => null);
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
    createdAt: existing?.createdAt || doc.meta.created || savedAt,
    modifiedAt: doc.meta.modified || savedAt,
    savedAt,
  };
  await putLibraryProject(entry);
  doc.libraryId = id;
  doc.libraryOptOut = false;
  return entry;
}

async function saveDocToLibrary(doc: DocEngine, quiet = false): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const revision = doc.rev;
    const bytes = await serializeDoc(doc);
    verifyBytes(bytes);
    if (doc.rev !== revision) continue;
    const thumbnail = await projectThumbnail(doc);
    if (doc.rev !== revision) continue;
    await writeLibraryEntry(doc, bytes, { thumbnail });
    if (doc.rev !== revision) { scheduleAutosave(250); continue; }
    doc.dirty = false;
    bump();
    if (!quiet) toast(`Saved “${doc.name}” to the Carbon Library`, 'success');
    return true;
  }
  throw new Error('The document kept changing while the Library save was prepared. Try Save again.');
}

async function saveComicToLibrary(doc: DocEngine, quiet = false): Promise<boolean> {
  if (!doc.comic) return false;
  const pages = getApp().docs.filter((page) => page.comic?.id === doc.comic!.id).sort((a, b) => a.comic!.index - b.comic!.index);
  if (!pages.length) return false;
  const name = pages[0].comic!.name || 'Comic';
  for (let attempt = 0; attempt < 3; attempt++) {
    const revisions = pages.map((page) => page.rev);
    const bytes = await serializeComic(name, pages);
    if (!isComicArchive(bytes)) throw new Error('The comic archive did not pass its integrity check.');
    if (pages.some((page, i) => page.rev !== revisions[i])) continue;
    const thumbnail = await projectThumbnail(pages[0]);
    if (pages.some((page, i) => page.rev !== revisions[i])) continue;
    await writeLibraryEntry(pages[0], bytes, { id: pages[0].comic!.id, name, pages: pages.length, thumbnail });
    if (pages.some((page, i) => page.rev !== revisions[i])) { scheduleAutosave(250); continue; }
    pages.forEach((page) => { page.dirty = false; page.libraryId = pages[0].comic!.id; page.libraryOptOut = false; });
    bump();
    if (!quiet) toast(`Saved “${name}” (${pages.length} pages) to the Carbon Library`, 'success');
    return true;
  }
  throw new Error('The comic changed while the Library save was prepared. Try Save again.');
}

/** Save or refresh an editable project in the Windows-only local Library. */
export async function saveProjectToLibrary(doc: DocEngine | null = activeDoc(), quiet = false): Promise<boolean> {
  if (!doc) return false;
  try { return doc.comic ? await saveComicToLibrary(doc, quiet) : await saveDocToLibrary(doc, quiet); }
  catch (e) { toast(`Library save failed: ${e instanceof Error ? e.message : e}. Your open artwork is still available.`, 'error'); return false; }
}

export async function saveDoc(doc: DocEngine, mode: 'save' | 'saveAs' | 'copy' = 'save'): Promise<boolean> {
  if (EDITION.windows && mode === 'save' && !doc.fileHandle) return saveDocToLibrary(doc);
  try {
    const revision = doc.rev;
    const bytes = await serializeDoc(doc);
    verifyBytes(bytes); // never write an archive that fails validation
    if (doc.rev !== revision) throw new Error('The document changed while the save was being prepared. Save again to include the latest edits.');
    const suggested = safeName(doc.name) + (mode === 'copy' ? ' copy' : '') + '.carbon';
    if (isNative()) return await saveNative(doc, bytes, mode, suggested, revision);
    let handle: Handle | null = mode === 'save' ? (doc.fileHandle as Handle | null) : null;
    const w = window as unknown as { showSaveFilePicker?: (o: unknown) => Promise<Handle> };
    if (!handle && w.showSaveFilePicker) {
      try {
        handle = await w.showSaveFilePicker({ suggestedName: suggested, types: [{ description: 'CARBON Project', accept: { [MIME]: ['.carbon'] } }] });
      } catch (e) {
        if ((e as Error).name === 'AbortError') return false;
        handle = null; // picker unavailable (e.g. sandboxed) → fall back to download
      }
    }
    if (handle) {
      const ws = await handle.createWritable(); // data goes to a swap file; original replaced only on close()
      try {
        await ws.write(bytes);
        await ws.close();
      } catch (e) {
        try { await ws.abort?.(); } catch { /* ignore */ }
        throw e;
      }
      if (mode !== 'copy') {
        doc.fileHandle = handle;
        doc.fileName = handle.name;
        doc.name = handle.name.replace(/\.carbon$/i, '');
      }
    } else {
      download(new Blob([bytes as BlobPart], { type: MIME }), suggested);
      if (mode !== 'copy') doc.fileName = suggested;
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
    if (EDITION.windows && mode !== 'copy') {
      try { await writeLibraryEntry(doc, bytes); }
      catch (e) { toast(`The .carbon file was saved, but its Library copy could not be refreshed: ${e instanceof Error ? e.message : e}`, 'error'); }
    }
    toast(`${mode === 'copy' ? 'Saved a copy of' : 'Saved'} “${doc.name}” (${(bytes.length / 1024 / 1024).toFixed(2)} MB)`, 'success');
    return true;
  } catch (e) {
    toast(`Save failed: ${e instanceof Error ? e.message : e}. Your previous file was not modified.`, 'error');
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
export async function saveComicProject(doc: DocEngine, mode: 'save' | 'saveAs' | 'copy' = 'save'): Promise<boolean> {
  if (!doc.comic) return false;
  const pages = getApp().docs.filter((page) => page.comic?.id === doc.comic!.id).sort((a, b) => a.comic!.index - b.comic!.index);
  if (!pages.length) return false;
  const title = pages[0].comic!.name || 'Comic';
  const root = pages[0];
  if (EDITION.windows && mode === 'save' && !root.fileHandle) return saveComicToLibrary(doc);
  const suggested = safeName(title) + (mode === 'copy' ? ' copy' : '') + '.carboncomic';
  const revisions = pages.map((page) => [page, page.rev] as const);
  try {
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
        if (EDITION.windows) {
          try { await writeLibraryEntry(root, bytes, { id: root.comic!.id, name: title, pages: pages.length }); }
          catch (e) { toast(`The comic file was saved, but its Library copy could not be refreshed: ${e instanceof Error ? e.message : e}`, 'error'); }
        }
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
        if ((e as Error).name === 'AbortError') return false;
        handle = null;
      }
    }
    if (handle) {
      const writable = await handle.createWritable();
      try { await writable.write(bytes); await writable.close(); }
      catch (e) { try { await writable.abort?.(); } catch { /* ignore */ } throw e; }
      if (mode !== 'copy') {
        root.fileHandle = handle;
        pages.forEach((page) => { page.fileName = handle!.name; });
      }
    } else {
      download(new Blob([bytes as BlobPart], { type: COMIC_MIME }), suggested);
      if (mode !== 'copy') pages.forEach((page) => { page.fileName = suggested; });
    }
    if (revisions.some(([page, rev]) => page.rev !== rev)) {
      toast('The comic file was saved, but a page changed during the write. Your open pages remain marked unsaved.', 'error');
      return false;
    }
    if (mode !== 'copy') pages.forEach((page) => { page.dirty = false; page.emit(); });
    if (mode !== 'copy') {
      await addRecent(root, bytes).catch(() => {});
      await idbPut('backup', root.id, { name: title, bytes, savedAt: Date.now() }).catch(() => {});
      if (EDITION.windows) {
        try { await writeLibraryEntry(root, bytes, { id: root.comic!.id, name: title, pages: pages.length }); }
        catch (e) { toast(`The comic file was saved, but its Library copy could not be refreshed: ${e instanceof Error ? e.message : e}`, 'error'); }
      }
    }
    toast(`${mode === 'copy' ? 'Saved a copy of' : 'Saved'} comic “${title}” (${pages.length} pages, ${(bytes.length / 1048576).toFixed(2)} MB)`, 'success');
    return true;
  } catch (e) {
    toast(`Comic save failed: ${e instanceof Error ? e.message : e}. Your previous file was not modified.`, 'error');
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
        page.fileName = null; page.fileHandle = null;
        page.libraryId = id; page.libraryOptOut = false; page.dirty = false;
      });
      pages.forEach((page) => addDoc(page));
      setApp({ activeId: pages[0].id, homeScreen: false, canvasOnly: false });
      return pages[0];
    }
    const doc = await deserializeDoc(entry.bytes);
    doc.name = entry.name;
    doc.fileName = null; doc.fileHandle = null;
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
        page.libraryId = newId; page.fileName = null; page.fileHandle = null; page.dirty = false;
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
      doc.fileName = null; doc.fileHandle = null; doc.dirty = false;
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
    await deleteStoredLibraryProject(id);
    getApp().docs.filter((d) => d.libraryId === id || d.comic?.id === id).forEach((doc) => {
      doc.libraryId = null;
      doc.libraryOptOut = true;
    });
    toast(`Removed “${entry.name}” from the Carbon Library. Open copies remain available.`, 'success');
    return true;
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

export async function exportImage(doc: DocEngine, type: 'image/png' | 'image/jpeg' | 'image/webp', quality: number, scale: number, transparent: boolean) {
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
    download(blob, `${safeName(doc.name)}.${ext}`);
    toast(`Exported ${canvas.width}×${canvas.height} ${ext.toUpperCase()}`, 'success');
  } catch (e) {
    toast('Export failed: ' + (e instanceof Error ? e.message : e), 'error');
  } finally {
    if (canvas) { canvas.width = 0; canvas.height = 0; }
  }
}

/** SVG wrapper with an embedded lossless rendering; exact appearance is preserved, layers remain in .carbon. */
export async function exportSVG(doc: DocEngine, scale: number, transparent: boolean) {
  let canvas: HTMLCanvasElement | null = null;
  try {
    canvas = await projectExportCanvas(doc, scale, !transparent);
    const png = await canvasToBlob(canvas, 'image/png');
    const dataUrl = await blobToDataURL(png);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}" viewBox="0 0 ${canvas.width} ${canvas.height}"><image x="0" y="0" width="${canvas.width}" height="${canvas.height}" preserveAspectRatio="none" href="${dataUrl}"/></svg>`;
    download(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), `${safeName(doc.name)}.svg`);
    toast(`SVG exported at ${canvas.width}×${canvas.height} with embedded PNG artwork`, 'success');
  } catch (e) {
    toast('SVG export failed: ' + (e instanceof Error ? e.message : e), 'error');
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
      const revision = d.rev;
      if (!force && autosavedRev.get(d) === revision) continue;
      const bytes = await serializeDoc(d);
      const order = getApp().docs.indexOf(d);
      if (order < 0) continue;

      // Windows keeps an editable, independent Library copy in addition to the crash-recovery session.
      if (EDITION.windows && !d.libraryOptOut && d.rev === revision) {
        try {
          if (d.comic) {
            if (!savedComics.has(d.comic.id)) {
              savedComics.add(d.comic.id);
              if (!(await saveComicToLibrary(d, true))) throw new Error('The comic could not be serialized.');
            }
          } else {
            const thumbnail = await projectThumbnail(d);
            if (d.rev === revision) {
              await writeLibraryEntry(d, bytes, { thumbnail });
              if (d.rev === revision) d.dirty = false;
            }
          }
        } catch (e) {
          toast(`Library autosave failed for “${d.name}”: ${e instanceof Error ? e.message : e}. Session recovery remains available.`, 'error');
        }
      }
      await idbPut('session', d.id, { name: d.name, bytes, savedAt: Date.now(), fileName: d.fileName, order, dirty: d.dirty } as SessionEntry & { dirty: boolean });
      // Mark only the revision we serialized; a newer edit during encoding or thumbnail capture gets another pass.
      autosavedRev.set(d, revision);
      if (d.rev !== revision) autosaveRequested = true;
    }
  } catch (e) {
    failed = true;
    console.warn('autosave failed', e);
    toast('Autosave failed: ' + (e instanceof Error ? e.message : e), 'error');
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

export async function exportReplayVideo(doc: DocEngine, speed: number, onProgress: (p: number) => void, cancel: { cancelled: boolean }, requested: 'auto' | 'mp4' = 'auto') {
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
  if (cancel.cancelled) return;
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
    if (cancel.cancelled) return;
    const actualMime = (chunks.find((chunk) => chunk.type)?.type || outputMime).split(';')[0].toLowerCase();
    if (actualMime !== 'video/webm' && actualMime !== 'video/mp4') throw new Error(`The encoder returned an unsupported video type: ${actualMime || 'unknown'}.`);
    if (requested === 'mp4' && actualMime !== 'video/mp4') throw new Error('The recorder returned WebM instead of MP4; no mislabeled file was written.');
    const ext = actualMime === 'video/mp4' ? 'mp4' : 'webm';
    download(new Blob(chunks, { type: actualMime }), `${safeName(doc.name)}-replay.${ext}`);
    toast(`Replay ${ext.toUpperCase()} video exported`, 'success');
  } finally {
    stream.getTracks().forEach((track) => track.stop());
  }
}
