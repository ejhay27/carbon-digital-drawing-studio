import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import type { BrushParams, Command, DocSnap, InkStroke, Layer, RecEvent } from './types';
import { checkDims, DocEngine } from './document';
import { compositeDoc } from './render';
import { blobToDataURL, canvasToBlob, createCanvas, ctxOf, loadImage } from './util';

export const FORMAT_VERSION = 1; // bump on breaking changes; readers reject newer versions
export const MIME = 'application/x-carbon';

import type { ComicObject, LayerLink } from './types';
import { uid } from './util';
import type { ComicPageMeta } from './comic';
import { DEFAULT_ADJUST } from './render';
import { APP_LABEL } from '../version'; // "CARBON PRIME 7.1.1+ls" on Windows; Android keeps its legacy label

const BLENDS = ['lighter', 'linear-burn', 'source-over', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity'];

async function png(c: HTMLCanvasElement) {
  return new Uint8Array(await (await canvasToBlob(c, 'image/png')).arrayBuffer());
}
async function decodePng(bytes: Uint8Array, w: number, h: number, what: string) {
  try {
    const bmp = await createImageBitmap(new Blob([bytes as BlobPart], { type: 'image/png' }));
    const c = createCanvas(w, h);
    ctxOf(c).drawImage(bmp, 0, 0);
    bmp.close?.();
    return c;
  } catch {
    throw new Error(`Corrupt image data for ${what}.`);
  }
}

const layerMeta = (L: Layer) => ({
  id: L.id, name: L.name, type: L.type, visible: L.visible, locked: L.locked, opacity: L.opacity, blend: L.blend, alphaLock: L.alphaLock,
  // v1-compatible optional extensions (older readers ignore unknown keys)
  ...(L.clip ? { clip: true } : {}), ...(L.reference ? { reference: true } : {}), ...(L.parent ? { parent: L.parent } : {}),
  ...(L.panelClip ? { panelClip: true } : {}), ...(L.adjust ? { adjust: L.adjust } : {}), ...(L.mask ? { maskEnabled: L.maskEnabled !== false } : {}),
  ...(L.collapsed ? { collapsed: true } : {}),
  ...(L.link ? { link: L.link } : {}), ...(L.panelId ? { panelId: L.panelId } : {}),
});

/** Serialise one layer (pixels, mask, vector data) under dir. */
async function writeLayer(files: Zippable, dir: string, L: Layer) {
  const meta: Record<string, unknown> = layerMeta(L);
  if (L.type === 'raster' && L.canvas) {
    meta.file = `${dir}${L.id}.png`;
    files[meta.file as string] = [await png(L.canvas), { level: 0 }];
  } else if (L.type === 'ink') meta.strokes = L.strokes || [];
  else if (L.type === 'comic') meta.comic = L.comic || [];
  if (L.mask) {
    meta.mask = `${dir}${L.id}.mask.png`;
    files[meta.mask as string] = [await png(L.mask), { level: 0 }];
  }
  return meta;
}

export async function serializeDoc(doc: DocEngine, includeReplay = true): Promise<Uint8Array> {
  const files: Zippable = {};
  files['mimetype'] = [strToU8(MIME), { level: 0 }];
  const layers: unknown[] = [];
  for (const L of doc.layers) layers.push(await writeLayer(files, 'layers/', L));
  const assets: { id: string; file: string; mime: string }[] = [];
  for (const [id, url] of Object.entries(doc.assets)) {
    const blob = await (await fetch(url)).blob();
    const f = `assets/${id}`;
    files[f] = [new Uint8Array(await blob.arrayBuffer()), { level: 0 }];
    assets.push({ id, file: f, mime: blob.type || 'image/png' });
  }
  let replay: unknown = null;
  if (includeReplay && doc.rec.events.length) {
    const brushes: BrushParams[] = [];
    const bIndex = new Map<string, number>();
    const events: unknown[] = [];
    let cpN = 0;
    for (const e of doc.rec.events) {
      const o: Record<string, unknown> = { t: e.t };
      if (e.u) o.u = e.u;
      if (e.m) o.m = e.m;
      if (e.c) {
        if (e.c.k === 'stroke') {
          const key = JSON.stringify(e.c.brush);
          let bi = bIndex.get(key);
          if (bi === undefined) { bi = brushes.length; brushes.push(e.c.brush); bIndex.set(key, bi); }
          const { brush: _b, ...rest } = e.c;
          o.c = { ...rest, s: e.c.s.map((v) => Math.round(v * 100) / 100), brush: bi };
        } else o.c = e.c;
      }
      if (e.cp) {
        const dir = `replay/cp/${cpN++}/`;
        const ls: unknown[] = [];
        for (const L of e.cp.layers) ls.push(await writeLayer(files, dir, L));
        o.cp = { w: e.cp.w, h: e.cp.h, background: e.cp.background, activeLayerId: e.cp.activeLayerId, selection: e.cp.selection, layers: ls };
      }
      events.push(o);
    }
    files['replay/events.json'] = strToU8(JSON.stringify({ brushes, events }));
    replay = { file: 'replay/events.json', count: events.length, enabled: doc.rec.enabled, paused: doc.rec.paused, epoch: doc.rec.epoch, idleCap: doc.rec.idleCap };
  }
  const scale = Math.min(1, 320 / Math.max(doc.width, doc.height));
  files['thumbnail.png'] = [await png(compositeDoc(doc, scale)), { level: 0 }];
  const manifest = {
    format: 'carbon', version: FORMAT_VERSION, app: APP_LABEL, name: doc.name,
    width: doc.width, height: doc.height, background: doc.background, activeLayerId: doc.activeLayerId,
    selection: doc.selection, meta: doc.meta, layers, assets, replay,
    // optional module data; older CARBON versions ignore it and still open the 2D artwork
    extensions: {
      ...(doc.comic ? { comic: doc.comic } : {}), ...(doc.scene3d ? { scene3d: doc.scene3d } : {}), ...(doc.colorDock ? { colorDock: doc.colorDock } : {}),
      ...(doc.board ? { board: doc.board } : {}), ...(doc.paletteMemory ? { paletteMemory: doc.paletteMemory } : {}),
    },
  };
  files['manifest.json'] = strToU8(JSON.stringify(manifest, null, 1));
  return zipSync(files, { level: 6 });
}

interface Manifest {
  format: string; version: number; name: string; width: number; height: number; background: string | null;
  activeLayerId: string; selection: DocEngine['selection']; meta?: DocEngine['meta'];
  layers: (ReturnType<typeof layerMeta> & { file?: string; strokes?: InkStroke[]; comic?: ComicObject[]; mask?: string })[];
  assets?: { id: string; file: string; mime: string }[];
  replay?: { file: string; enabled: boolean; paused: boolean; epoch: number; idleCap?: number } | null;
  extensions?: { comic?: ComicPageMeta; scene3d?: unknown; colorDock?: { name?: unknown; colors?: unknown; names?: unknown }; board?: unknown; paletteMemory?: unknown };
}

function readManifest(files: Record<string, Uint8Array>): Manifest {
  const raw = files['manifest.json'];
  if (!raw) throw new Error('Not a CARBON project: manifest.json is missing.');
  let m: Manifest;
  try { m = JSON.parse(strFromU8(raw)); } catch { throw new Error('Project manifest is corrupt (invalid JSON).'); }
  if (m.format !== 'carbon') throw new Error('Not a CARBON project (unknown format tag).');
  if (typeof m.version !== 'number') throw new Error('Project version is missing.');
  if (m.version > FORMAT_VERSION) throw new Error(`This project was created by a newer CARBON (format v${m.version}). Please update.`);
  const dimErr = checkDims(m.width, m.height);
  if (dimErr) throw new Error('Invalid canvas size in project: ' + dimErr);
  if (!Array.isArray(m.layers) || !m.layers.length) throw new Error('Project contains no layers.');
  for (const L of m.layers) {
    if (L.type === 'raster' && (!L.file || !files[L.file])) throw new Error(`Layer "${L.name}" pixel data is missing.`);
    if (L.type === 'ink' && !Array.isArray(L.strokes)) throw new Error(`Crisp Ink layer "${L.name}" is corrupt.`);
    if (L.mask !== undefined && (!L.mask || !files[L.mask])) throw new Error(`Layer mask data for "${L.name}" is missing.`);
  }
  if (m.assets !== undefined && !Array.isArray(m.assets)) throw new Error('Project asset list is corrupt.');
  for (const asset of m.assets || []) {
    if (!asset || typeof asset.id !== 'string' || !asset.id || typeof asset.file !== 'string' || !asset.file || !files[asset.file]) {
      throw new Error(`Project asset data is missing${asset?.id ? ` for "${asset.id}"` : ''}.`);
    }
  }
  if (m.replay && (typeof m.replay.file !== 'string' || !m.replay.file || !files[m.replay.file])) {
    throw new Error('Replay data missing from archive.');
  }
  return m;
}

/** Structural verification used before committing a save, and in tests. */
export function verifyBytes(bytes: Uint8Array) {
  let files: Record<string, Uint8Array>;
  try { files = unzipSync(bytes); } catch { throw new Error('Archive could not be read.'); }
  return readManifest(files);
}

function inkValid(s: InkStroke): InkStroke {
  return {
    id: String(s.id), pts: Array.isArray(s.pts) ? s.pts.map(Number) : [], color: String(s.color || '#000000'),
    size: Number(s.size) || 4, opacity: Number(s.opacity ?? 1), taperStart: Number(s.taperStart) || 0, taperEnd: Number(s.taperEnd) || 0,
  };
}

async function readLayers(files: Record<string, Uint8Array>, list: Manifest['layers'], w: number, h: number): Promise<Layer[]> {
  const out: Layer[] = [];
  for (const L of list) {
    const type = (['ink', 'group', 'adjust', 'comic'].includes(L.type) ? L.type : 'raster') as Layer['type'];
    if (type === 'raster' && (!L.file || !files[L.file])) throw new Error(`Layer "${L.name}" pixel data is missing.`);
    if (L.mask !== undefined && (!L.mask || !files[L.mask])) throw new Error(`Layer mask data for "${L.name}" is missing.`);
    if (type === 'ink' && !Array.isArray(L.strokes)) throw new Error(`Crisp Ink layer "${L.name}" is corrupt.`);
    const base = {
      id: String(L.id), name: String(L.name || 'Layer'), type,
      visible: L.visible !== false, locked: !!L.locked, opacity: Math.max(0, Math.min(1, Number(L.opacity ?? 1))),
      blend: (BLENDS.includes(L.blend) ? L.blend : 'source-over') as Layer['blend'], alphaLock: !!L.alphaLock,
    } as Layer;
    if (L.clip) base.clip = true;
    if (L.reference) base.reference = true;
    if (L.parent) base.parent = String(L.parent);
    if (L.panelClip) base.panelClip = true;
    if (L.collapsed) base.collapsed = true;
    if (L.panelId) base.panelId = String(L.panelId);
    const lk = L.link as LayerLink | undefined;
    if (lk && lk.kind === 'scene' && typeof lk.doc === 'string' && lk.view && Array.isArray(lk.view.pos) && Array.isArray(lk.view.target)) base.link = lk;
    if (L.adjust && typeof L.adjust === 'object') base.adjust = { ...DEFAULT_ADJUST, ...L.adjust };
    if (type === 'raster') base.canvas = await decodePng(files[L.file!], w, h, `layer "${base.name}"`);
    else if (type === 'ink') base.strokes = (L.strokes || []).map(inkValid);
    else if (type === 'comic') base.comic = Array.isArray(L.comic) ? L.comic : [];
    if (L.mask) {
      base.mask = await decodePng(files[L.mask], w, h, `mask of "${base.name}"`);
      base.maskEnabled = L.maskEnabled !== false;
    }
    out.push(base);
  }
  return out;
}

export async function deserializeDoc(bytes: Uint8Array): Promise<DocEngine> {
  let files: Record<string, Uint8Array>;
  try { files = unzipSync(bytes); } catch { throw new Error('The file is damaged or is not a CARBON project.'); }
  const m = readManifest(files);
  const doc = new DocEngine(m.width, m.height, { blank: true, name: m.name || 'Untitled', background: m.background ?? null });
  doc.layers = await readLayers(files, m.layers, m.width, m.height);
  doc.activeLayerId = doc.layers.find((l) => l.id === m.activeLayerId)?.id || doc.layers[doc.layers.length - 1].id;
  doc.selection = m.selection && Array.isArray(m.selection.pts) ? m.selection : null;
  if (m.meta) doc.meta = { ...doc.meta, ...m.meta };
  if (m.extensions?.comic && typeof m.extensions.comic === 'object') doc.comic = { ...m.extensions.comic };
  if (m.extensions?.scene3d && typeof m.extensions.scene3d === 'object') doc.scene3d = m.extensions.scene3d;
  const bd = m.extensions?.board as { version?: number; items?: unknown[] } | undefined;
  if (bd && typeof bd === 'object' && Array.isArray(bd.items)) doc.board = bd;
  const pm = m.extensions?.paletteMemory as { snapshots?: unknown[] } | undefined;
  if (pm && typeof pm === 'object' && Array.isArray(pm.snapshots)) doc.paletteMemory = pm;
  if (!doc.meta.uuid) doc.meta.uuid = uid('cbn-'); // files saved before 2.2.0 get a stable identity on first save
  const cd = m.extensions?.colorDock;
  if (cd && Array.isArray(cd.colors)) {
    const colors = (cd.colors as unknown[]).filter((c): c is string => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c)).slice(0, 512);
    const names = Array.isArray(cd.names) ? (cd.names as unknown[]).map((n) => String(n ?? '').slice(0, 40)) : [];
    doc.colorDock = { name: String(cd.name || 'Project colors').slice(0, 60), colors, names: colors.map((_, i) => names[i] || '') };
  }
  for (const a of m.assets || []) {
    const b = files[a.file];
    if (!b) { console.warn('missing asset', a.id); continue; }
    const url = await blobToDataURL(new Blob([b as BlobPart], { type: a.mime }));
    doc.assets[a.id] = url;
    try { doc.assetImgs.set(a.id, await loadImage(url)); } catch { /* reported by replay */ }
  }
  if (m.replay && files[m.replay.file]) {
    let data: { brushes: BrushParams[]; events: Record<string, unknown>[] };
    try { data = JSON.parse(strFromU8(files[m.replay.file])); } catch { throw new Error('Replay data is corrupt.'); }
    const events: RecEvent[] = [];
    for (const o of data.events) {
      const e: RecEvent = { t: Number(o.t) || 0 };
      if (o.u) e.u = o.u as 'undo' | 'redo';
      if (o.m) e.m = String(o.m);
      if (o.c) {
        const c = o.c as Command & { brush?: unknown };
        if (c.k === 'stroke') e.c = { ...(c as object), brush: data.brushes[c.brush as unknown as number] } as Command;
        else e.c = c;
      }
      if (o.cp) {
        const cp = o.cp as DocSnap & { layers: Manifest['layers'] };
        e.cp = { w: cp.w, h: cp.h, background: cp.background, activeLayerId: cp.activeLayerId, selection: cp.selection, layers: await readLayers(files, cp.layers, cp.w, cp.h) };
      }
      events.push(e);
    }
    doc.rec.events = events;
    doc.rec.enabled = !!m.replay.enabled;
    doc.rec.paused = !!m.replay.paused;
    doc.rec.epoch = (m.replay.epoch || 0) + 1;
    if (m.replay.idleCap) doc.rec.idleCap = m.replay.idleCap;
    doc.rec.recalc(doc.width, doc.height);
  }
  doc.dirty = false;
  return doc;
}

// ---------------------------------------------------------------- .carboncomic (multi-page container)
export const COMIC_MIME = 'application/x-carbon-comic';

/** A comic project is a zip of complete .carbon pages plus a small index (pages stay individually valid). */
export async function serializeComic(name: string, pages: DocEngine[]): Promise<Uint8Array> {
  const files: Zippable = { mimetype: [strToU8(COMIC_MIME), { level: 0 }] };
  const index: { file: string; name: string }[] = [];
  for (let i = 0; i < pages.length; i++) {
    const f = `pages/${String(i + 1).padStart(3, '0')}.carbon`;
    files[f] = [await serializeDoc(pages[i]), { level: 0 }];
    index.push({ file: f, name: pages[i].comic?.pageName || `Page ${i + 1}` });
  }
  files['comic.json'] = strToU8(JSON.stringify({ format: 'carbon-comic', version: 1, name, pages: index }, null, 1));
  return zipSync(files, { level: 0 });
}

export function isComicArchive(bytes: Uint8Array) {
  try { return !!unzipSync(bytes, { filter: (x) => x.name === 'comic.json' })['comic.json']; } catch { return false; }
}

export async function deserializeComic(bytes: Uint8Array): Promise<{ name: string; pages: DocEngine[] }> {
  let files: Record<string, Uint8Array>;
  try { files = unzipSync(bytes); } catch { throw new Error('The comic file is damaged.'); }
  let idx: { format: string; version: number; name: string; pages: { file: string; name: string }[] };
  try { idx = JSON.parse(strFromU8(files['comic.json'])); } catch { throw new Error('comic.json is missing or corrupt.'); }
  if (idx.format !== 'carbon-comic') throw new Error('Not a CARBON comic project.');
  if (idx.version > 1) throw new Error('This comic was created by a newer CARBON.');
  if (!Array.isArray(idx.pages) || !idx.pages.length) throw new Error('The comic contains no pages.');
  const pages: DocEngine[] = [];
  for (const p of idx.pages) {
    if (!files[p.file]) throw new Error(`Page “${p.name}” is missing from the archive.`);
    pages.push(await deserializeDoc(files[p.file]));
  }
  return { name: String(idx.name || 'Comic'), pages };
}

export function readThumbnail(bytes: Uint8Array): string | null {
  try {
    const f = unzipSync(bytes, { filter: (x) => x.name === 'thumbnail.png' });
    const t = f['thumbnail.png'];
    if (!t) return null;
    return URL.createObjectURL(new Blob([t as BlobPart], { type: 'image/png' }));
  } catch {
    return null;
  }
}
