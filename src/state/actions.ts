import { checkDims, DocEngine, MAX_AREA, MAX_SIDE } from '../engine/document';
import { isNative, shareProjectFile, writeProject } from '../platform/native';
import { deserializeDoc, MIME, serializeDoc, verifyBytes } from '../engine/fileFormat';
import { compositeDoc, renderDoc } from '../engine/render';
import { ReplayPlayer } from '../engine/replay';
import { idbAll, idbDel, idbGet, idbPut, type RecentEntry, type SessionEntry } from '../engine/persist';
import { blobToDataURL, canvasToBlob, createCanvas, ctxOf, download, loadImage, uid } from '../engine/util';
import { activeDoc, bump, confirmDialog, getApp, promptDialog, setApp, showPanel, toast } from './store';

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
  setApp({ docs: [...getApp().docs, doc], activeId: doc.id, replay: null });
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
  if (/\.carboncomic$/i.test(file.name)) return openComicFile(file);
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
        types: [{ description: 'CARBON project or image', accept: { 'application/x-carbon': ['.carbon'], 'image/*': ['.png', '.jpg', '.jpeg', '.webp'] } }],
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
export async function openComicFile(file: File) {
  try {
    const { deserializeComic } = await import('../engine/fileFormat');
    const { name, pages } = await deserializeComic(new Uint8Array(await file.arrayBuffer()));
    const cid = pages[0].comic?.id || uid('comic-');
    pages.forEach((p, i) => {
      p.comic = { ...(p.comic || { bleed: 0, safe: 0, pageName: `Page ${i + 1}` }), id: cid, name, index: i } as NonNullable<DocEngine['comic']>;
      p.dirty = false;
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

export async function saveDoc(doc: DocEngine, mode: 'save' | 'saveAs' | 'copy' = 'save'): Promise<boolean> {
  try {
    const bytes = await serializeDoc(doc);
    verifyBytes(bytes); // never write an archive that fails validation
    const suggested = safeName(doc.name) + (mode === 'copy' ? ' copy' : '') + '.carbon';
    if (isNative()) return await saveNative(doc, bytes, mode, suggested);
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
    if (mode !== 'copy') {
      doc.dirty = false;
      doc.emit();
    }
    await addRecent(doc, bytes).catch(() => {});
    await idbPut('backup', doc.id, { name: doc.name, bytes, savedAt: Date.now() }).catch(() => {});
    toast(`${mode === 'copy' ? 'Saved a copy of' : 'Saved'} “${doc.name}” (${(bytes.length / 1024 / 1024).toFixed(2)} MB)`, 'success');
    return true;
  } catch (e) {
    toast(`Save failed: ${e instanceof Error ? e.message : e}. Your previous file was not modified.`, 'error');
    return false;
  }
}

interface NativeHandle { native: true; name: string }

/** Android: projects are written (via temp file + verify + replace) to Documents/CARBON. */
async function saveNative(doc: DocEngine, bytes: Uint8Array, mode: 'save' | 'saveAs' | 'copy', suggested: string): Promise<boolean> {
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
    doc.dirty = false;
    doc.emit();
  }
  await addRecent(doc, bytes).catch(() => {});
  await idbPut('backup', doc.id, { name: doc.name, bytes, savedAt: Date.now() }).catch(() => {});
  toast(`Saved ${path} (${(bytes.length / 1024 / 1024).toFixed(2)} MB)`, 'success');
  return true;
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

export async function closeDoc(id: string, force = false) {
  const s = getApp();
  const doc = s.docs.find((d) => d.id === id);
  if (!doc) return true;
  if (doc.dirty && !force) {
    const r = await confirmDialog('Save changes?', `“${doc.name}” has unsaved changes. Save before closing?`, [
      { label: 'Cancel', value: 'cancel' },
      { label: "Don't save", value: 'discard', variant: 'danger' },
      { label: 'Save', value: 'save', variant: 'primary' },
    ]);
    if (r === 'cancel') return false;
    if (r === 'save' && !(await saveDoc(doc))) return false;
  }
  unsubs.get(id)?.();
  unsubs.delete(id);
  const docs = getApp().docs.filter((d) => d.id !== id);
  const idx = s.docs.findIndex((d) => d.id === id);
  setApp({ docs, activeId: s.activeId === id ? docs[Math.min(idx, docs.length - 1)]?.id || null : s.activeId, replay: s.replay?.docId === id ? null : s.replay });
  idbDel('session', id).catch(() => {});
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

export async function exportImage(doc: DocEngine, type: 'image/png' | 'image/jpeg' | 'image/webp', quality: number, scale: number, transparent: boolean) {
  try {
    let c = compositeDoc(doc, scale, !transparent || type === 'image/jpeg');
    if (type === 'image/jpeg' && !doc.background) {
      const w = createCanvas(c.width, c.height);
      const x = ctxOf(w);
      x.fillStyle = '#ffffff';
      x.fillRect(0, 0, w.width, w.height);
      x.drawImage(c, 0, 0);
      c = w;
    }
    const blob = await canvasToBlob(c, type, quality);
    if (blob.type !== type) toast(`This platform cannot encode ${type.split('/')[1].toUpperCase()}; exported as ${blob.type.split('/')[1].toUpperCase()}.`, 'error');
    const ext = blob.type.split('/')[1].replace('jpeg', 'jpg');
    download(blob, `${safeName(doc.name)}.${ext}`);
    toast(`Exported ${c.width}×${c.height} ${ext.toUpperCase()}`, 'success');
  } catch (e) {
    toast('Export failed: ' + (e instanceof Error ? e.message : e), 'error');
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
  try {
    const docs = getApp().docs.slice();
    for (const d of docs) {
      const revision = d.rev;
      if (!force && autosavedRev.get(d) === revision) continue;
      const bytes = await serializeDoc(d);
      const order = getApp().docs.indexOf(d);
      if (order < 0) continue;
      await idbPut('session', d.id, { name: d.name, bytes, savedAt: Date.now(), fileName: d.fileName, order, dirty: d.dirty } as SessionEntry & { dirty: boolean });
      // Mark only the revision we serialized; a newer edit during PNG/ZIP encoding gets another pass.
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

export async function exportReplayVideo(doc: DocEngine, speed: number, onProgress: (p: number) => void, cancel: { cancelled: boolean }) {
  if (typeof MediaRecorder === 'undefined') throw new Error('Video recording is not supported on this platform.');
  const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'].find((m) => MediaRecorder.isTypeSupported(m));
  if (!mime) throw new Error('No supported WebM or MP4 video codec.');
  const player = new ReplayPlayer(doc);
  await player.prepare();
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
    const ext = actualMime === 'video/mp4' ? 'mp4' : 'webm';
    download(new Blob(chunks, { type: actualMime }), `${safeName(doc.name)}-replay.${ext}`);
    toast(`Replay ${ext.toUpperCase()} video exported`, 'success');
  } finally {
    stream.getTracks().forEach((track) => track.stop());
  }
}
