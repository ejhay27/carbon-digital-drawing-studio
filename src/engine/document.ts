import type { Command, DocSnap, Layer, LayerProps, Preview, RecEvent, Rect, Selection, UndoRec, ViewState } from './types';
import { clamp, clipRect, cloneCanvas, copyRegion, createCanvas, ctxOf, hexToRgb, mapPt, uid } from './util';
import { renderStroke, SAMPLE_STRIDE } from './strokeRenderer';
import { applyClip, compositeDoc, rasterOf, selBounds, selPath } from './render';
import { transformInk } from './crispInk';
import { runFx, type Px } from './filters';
import { applyLiquifyOps } from './liquify';
import { transformComic } from './comic';
import type { GradStop, LayerType } from './types';
import type { ComicPageMeta } from './comic';

export let MAX_SIDE = 8192;
export let MAX_AREA = 40_000_000;
/** Mobile WebViews have smaller canvas/memory budgets; the Android adapter lowers these. */
export function setCanvasLimits(side: number, area: number) {
  MAX_SIDE = side;
  MAX_AREA = area;
}
export const MAX_LAYERS = 64; // practical limit; clear errors are shown when reached

export function checkDims(w: number, h: number) {
  if (!Number.isFinite(w) || !Number.isFinite(h) || w < 16 || h < 16) return 'Canvas must be at least 16×16 px.';
  if (w > MAX_SIDE || h > MAX_SIDE) return `Maximum side length is ${MAX_SIDE} px.`;
  if (w * h > MAX_AREA) return `Canvas area exceeds the ${Math.round(MAX_AREA / 1e6)} MP limit for reliable performance.`;
  return null;
}

// ---------------- recorder ----------------
export class Recorder {
  enabled = false;
  paused = false;
  events: RecEvent[] = [];
  time = 0;
  lastWall: number | null = null;
  epoch = 0;
  /** Maximum wall-clock gap retained between recorded edits; the default preserves the full pause. */
  idleCap = Number.MAX_SAFE_INTEGER;
  limitBytes = 250 * 1024 * 1024;
  bytes = 0;
  lastEnd = 0;
  onLimit: (() => void) | null = null;

  get active() {
    return this.enabled && !this.paused;
  }
  clockAt(wallNow: number) {
    if (this.lastWall !== null) this.time += Math.min(Math.max(0, wallNow - this.lastWall), this.idleCap);
    this.lastWall = wallNow;
    return Math.round(this.time);
  }
  clock() {
    return this.clockAt(performance.now());
  }
  push(ev: RecEvent, dur = 0, bytes = 120) {
    ev.t = Math.max(this.lastEnd, ev.t);
    this.events.push(ev);
    this.lastEnd = ev.t + dur;
    this.bytes += bytes;
    if (this.bytes > this.limitBytes && this.enabled && !this.paused) {
      this.paused = true;
      this.onLimit?.();
    }
  }
  /** recompute derived state after loading */
  recalc(w: number, h: number) {
    this.bytes = 0;
    this.lastEnd = 0;
    for (const e of this.events) {
      this.bytes += eventBytes(e, w, h);
      this.lastEnd = Math.max(this.lastEnd, e.t + eventDuration(e));
    }
    this.time = this.lastEnd;
  }
}

export function eventDuration(e: RecEvent) {
  if (e.c && e.c.k === 'stroke') {
    const s = e.c.s;
    const n = Math.floor(s.length / SAMPLE_STRIDE);
    return n ? s[(n - 1) * SAMPLE_STRIDE + 5] : 0;
  }
  return 0;
}
export function eventBytes(e: RecEvent, w: number, h: number) {
  if (e.cp) {
    // Checkpoints retain full canvas clones in memory. Estimate raw RGBA memory, not compressed PNG size.
    let bytes = 400 + JSON.stringify({ w: e.cp.w, h: e.cp.h, background: e.cp.background, activeLayerId: e.cp.activeLayerId, selection: e.cp.selection }).length * 2;
    for (const layer of e.cp.layers) {
      const { canvas, mask, strokes, comic, ...data } = layer;
      bytes += canvas ? canvas.width * canvas.height * 4 : layer.type === 'raster' ? w * h * 4 : 0;
      if (mask) bytes += mask.width * mask.height * 4;
      bytes += Math.max(128, JSON.stringify(data).length * 2);
      if (strokes) bytes += strokes.reduce((sum, stroke) => sum + stroke.pts.length * 16 + 160, 0);
      if (comic) bytes += JSON.stringify(comic).length * 2;
    }
    return Math.ceil(bytes);
  }
  if (e.c?.k === 'stroke') return Math.ceil(e.c.s.length * 16 + JSON.stringify(e.c.brush).length * 2 + 256);
  if (e.c?.k === 'inkSet') return Math.ceil(JSON.stringify(e.c.strokes).length * 2 + 128);
  if (e.c?.k === 'inkAdd') return Math.ceil(JSON.stringify(e.c.stroke).length * 2 + 128);
  return Math.max(100, Math.ceil(JSON.stringify(e.c || e).length * 2));
}

// ---------------- snapshots ----------------
export function takeDocSnap(doc: DocEngine): DocSnap {
  return {
    w: doc.width, h: doc.height, background: doc.background,
    layers: doc.layers.map((l) => ({ ...l })), activeLayerId: doc.activeLayerId,
    selection: doc.selection,
  };
}
function restoreDocSnap(doc: DocEngine, s: DocSnap) {
  doc.width = s.w;
  doc.height = s.h;
  doc.background = s.background;
  doc.layers = s.layers.map((l) => ({ ...l }));
  doc.selection = s.selection;
  if (!doc.layers.find((l) => l.id === doc.activeLayerId)) doc.activeLayerId = s.activeLayerId;
  if (!doc.layers.find((l) => l.id === doc.activeLayerId)) doc.activeLayerId = doc.layers[doc.layers.length - 1]?.id || '';
}
/** Deep snapshot: private canvas clones (for checkpoints) */
export function deepSnap(doc: { width: number; height: number; background: string | null; layers: Layer[]; activeLayerId: string; selection: Selection | null }, map?: Map<HTMLCanvasElement, HTMLCanvasElement>): DocSnap {
  const cl = (c?: HTMLCanvasElement) => {
    if (!c) return c;
    if (map) {
      let k = map.get(c);
      if (!k) { k = cloneCanvas(c); map.set(c, k); }
      return k;
    }
    return cloneCanvas(c);
  };
  return {
    w: doc.width, h: doc.height, background: doc.background,
    layers: doc.layers.map((l) => ({ ...l, canvas: cl(l.canvas) })),
    activeLayerId: doc.activeLayerId, selection: doc.selection,
  };
}
export function restoreDeep(doc: DocEngine, s: DocSnap) {
  const d = deepSnap({ width: s.w, height: s.h, background: s.background, layers: s.layers, activeLayerId: s.activeLayerId, selection: s.selection });
  restoreDocSnap(doc, d);
  doc.activeLayerId = s.activeLayerId;
}

/** Clone the entire mutable state of an engine (layers + undo/redo) with consistent canvas identity. */
export function cloneEngineState(doc: DocEngine) {
  const map = new Map<HTMLCanvasElement, HTMLCanvasElement>();
  const snap = deepSnap(doc, map);
  const cloneRec = (r: UndoRec): UndoRec =>
    r.t === 'doc' ? { ...r, before: deepSnap(snapAsDoc(r.before), map), after: deepSnap(snapAsDoc(r.after), map) } : r;
  return { snap, undo: doc.undoStack.map(cloneRec), redo: doc.redoStack.map(cloneRec) };
}
const snapAsDoc = (s: DocSnap) => ({ width: s.w, height: s.h, background: s.background, layers: s.layers, activeLayerId: s.activeLayerId, selection: s.selection });
export function restoreEngineState(doc: DocEngine, st: ReturnType<typeof cloneEngineState>) {
  const fake = new DocEngine(st.snap.w, st.snap.h, { blank: true });
  fake.layers = st.snap.layers; fake.background = st.snap.background; fake.activeLayerId = st.snap.activeLayerId; fake.selection = st.snap.selection;
  fake.undoStack = st.undo; fake.redoStack = st.redo;
  const c = cloneEngineState(fake);
  restoreDocSnap(doc, c.snap);
  doc.activeLayerId = c.snap.activeLayerId;
  doc.undoStack = c.undo;
  doc.redoStack = c.redo;
}

// ---------------- flood fill ----------------
export function floodFill(data: ImageData, sx: number, sy: number, tol: number): Uint8Array | null {
  const { width: w, height: h, data: d } = data;
  sx = Math.floor(sx); sy = Math.floor(sy);
  if (sx < 0 || sy < 0 || sx >= w || sy >= h) return null;
  const mask = new Uint8Array(w * h);
  const i0 = (sy * w + sx) * 4;
  const r0 = d[i0], g0 = d[i0 + 1], b0 = d[i0 + 2], a0 = d[i0 + 3];
  const t = tol * 255;
  const match = (p: number) => {
    const i = p * 4;
    if (a0 === 0 && d[i + 3] <= t) return true;
    return Math.abs(d[i] - r0) <= t && Math.abs(d[i + 1] - g0) <= t && Math.abs(d[i + 2] - b0) <= t && Math.abs(d[i + 3] - a0) <= t;
  };
  const stack = [sx, sy];
  while (stack.length) {
    const y = stack.pop()!, x0 = stack.pop()!;
    let x = x0;
    while (x >= 0 && !mask[y * w + x] && match(y * w + x)) x--;
    x++;
    let up = false, down = false;
    while (x < w && !mask[y * w + x] && match(y * w + x)) {
      mask[y * w + x] = 1;
      if (y > 0) {
        const m = !mask[(y - 1) * w + x] && match((y - 1) * w + x);
        if (m && !up) { stack.push(x, y - 1); up = true; } else if (!m) up = false;
      }
      if (y < h - 1) {
        const m = !mask[(y + 1) * w + x] && match((y + 1) * w + x);
        if (m && !down) { stack.push(x, y + 1); down = true; } else if (!m) down = false;
      }
      x++;
    }
  }
  return mask;
}
function dilate(mask: Uint8Array, w: number, h: number, n: number) {
  let m = mask;
  for (let k = 0; k < n; k++) {
    const o = new Uint8Array(m);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        if (m[y * w + x]) continue;
        if ((x > 0 && m[y * w + x - 1]) || (x < w - 1 && m[y * w + x + 1]) || (y > 0 && m[(y - 1) * w + x]) || (y < h - 1 && m[(y + 1) * w + x])) o[y * w + x] = 1;
      }
    m = o;
  }
  return m;
}

// ---------------- engine ----------------
export interface PreRendered {
  canvas: HTMLCanvasElement;
  rect: Rect | null;
}

export class DocEngine {
  id = uid('doc-');
  name: string;
  fileName: string | null = null;
  filePath: string | null = null;
  fileHandle: unknown = null;
  width: number;
  height: number;
  background: string | null;
  layers: Layer[] = [];
  activeLayerId = '';
  selection: Selection | null = null;
  assets: Record<string, string> = {};
  assetImgs = new Map<string, HTMLImageElement>();
  /** uuid: stable identity across save/reopen (Continuum links, Orbit Board, Time Machine).
   *  lineage: history key shared by branches; branch: Time Machine branch label. */
  meta = { created: Date.now(), modified: Date.now(), author: '', format: 1, uuid: uid('cbn-'), lineage: '', branch: '' };
  /** Orbit Board reference layout (Windows). Stored in manifest.extensions.board. */
  board: unknown = null;
  /** Palette Memory snapshots for this project (Windows). Stored in manifest.extensions.paletteMemory. */
  paletteMemory: unknown = null;
  undoStack: UndoRec[] = [];
  redoStack: UndoRec[] = [];
  undoLimit = 80;
  undoBytes = 900 * 1024 * 1024;
  dirty = false;
  rev = 0;
  /** UI-facing persistence state; never serialized into artwork content. */
  saveState: 'saved' | 'saving' | 'unsaved' | 'failed' = 'saved';
  saveError: string | null = null;
  savingRevision: number | null = null;
  /** True when a filesystem save succeeded but the local Library mirror still needs retrying. */
  librarySyncPending = false;
  preview: Preview | null = null;
  propPreview: { layerId: string; props: Partial<LayerProps> } | null = null;
  view: ViewState = { zoom: 1, panX: 0, panY: 0, rot: 0, flip: false };
  viewInit = false;
  rec = new Recorder();
  isReplay = false;
  /** Comic Studio page membership (Windows edition). Stored in manifest.extensions.comic. */
  comic: ComicPageMeta | null = null;
  /** CARBON 3D Studio scene (Windows edition). Stored in manifest.extensions.scene3d. */
  scene3d: unknown = null;
  /** Infinite Painter-inspired canvas mode; the editable content remains the normal .carbon document. */
  infinitePainter = false;
  /** Stable internal Library id (not a filesystem path); kept in memory only. */
  libraryId: string | null = null;
  /** A deliberate Library deletion must not be undone by the current open session's next autosave. */
  libraryOptOut = false;
  /** Project-specific Color Dock swatches (Windows edition). UI data only: never rendered into artwork. */
  colorDock: { name: string; colors: string[]; names: string[] } | null = null;
  private listeners = new Set<() => void>();

  constructor(w: number, h: number, o: { name?: string; background?: string | null; blank?: boolean } = {}) {
    this.width = Math.round(w);
    this.height = Math.round(h);
    this.name = o.name || 'Untitled';
    this.background = o.background === undefined ? '#ffffff' : o.background;
    if (!o.blank) {
      const L = this.makeLayer('raster', 'Layer 1');
      this.layers.push(L);
      this.activeLayerId = L.id;
    }
  }

  makeLayer(type: LayerType, name: string, id = uid('L')): Layer {
    return {
      id, name, type, visible: true, locked: false, opacity: 1, blend: 'source-over', alphaLock: false,
      canvas: type === 'raster' ? createCanvas(this.width, this.height) : undefined,
      strokes: type === 'ink' ? [] : undefined,
      comic: type === 'comic' ? [] : undefined,
    };
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }
  emit() {
    this.rev++;
    if (this.dirty) {
      if (this.savingRevision !== null && this.rev > this.savingRevision) {
        this.saveState = 'unsaved';
        this.saveError = null;
      } else if (this.saveState !== 'saving') {
        this.saveState = 'unsaved';
        this.saveError = null;
      }
    }
    this.listeners.forEach((f) => f());
  }
  touch(dirty = true) {
    if (dirty && !this.isReplay) {
      this.dirty = true;
      this.saveState = 'unsaved';
      this.saveError = null;
      this.meta.modified = Date.now();
    }
    this.emit();
  }
  get active(): Layer | undefined {
    return this.layers.find((l) => l.id === this.activeLayerId);
  }
  layer(id: string) {
    return this.layers.find((l) => l.id === id);
  }
  setActive(id: string) {
    if (this.layer(id)) {
      this.activeLayerId = id;
      this.emit();
    }
  }

  exec(cmd: Command, pre?: PreRendered): boolean {
    let rec: UndoRec | null;
    try {
      rec = applyCommand(this, cmd, pre);
    } catch (e) {
      console.error('[CARBON] command failed', cmd.k, e);
      throw e;
    }
    if (!rec) return false;
    rec.epoch = this.rec.epoch;
    this.pushUndo(rec);
    this.redoStack = [];
    if (this.rec.active) {
      const dur = eventDuration({ t: 0, c: cmd });
      this.rec.push({ t: this.rec.clock() - dur, c: cmd }, dur, eventBytes({ t: 0, c: cmd }, this.width, this.height));
    }
    this.touch();
    return true;
  }

  private pushUndo(r: UndoRec) {
    this.undoStack.push(r);
    let bytes = this.undoStack.reduce((a, b) => a + b.bytes, 0);
    while (this.undoStack.length > this.undoLimit || (bytes > this.undoBytes && this.undoStack.length > 1)) {
      const x = this.undoStack.shift()!;
      bytes -= x.bytes;
    }
  }

  undo() {
    const r = this.undoStack.pop();
    if (!r) return false;
    revert(this, r, true);
    this.redoStack.push(r);
    this.afterHistory(r, 'undo');
    return true;
  }
  redo() {
    const r = this.redoStack.pop();
    if (!r) return false;
    revert(this, r, false);
    this.undoStack.push(r);
    this.afterHistory(r, 'redo');
    return true;
  }
  private afterHistory(r: UndoRec, u: 'undo' | 'redo') {
    if (this.rec.active) {
      if (r.epoch === this.rec.epoch) this.rec.push({ t: this.rec.clock(), u });
      else this.recordCheckpoint();
    }
    this.touch();
  }

  // ----- recording -----
  startRecording() {
    this.rec.enabled = true;
    this.rec.paused = false;
    this.rec.lastWall = null;
    this.recordCheckpoint();
    this.emit();
  }
  pauseRecording() {
    this.rec.paused = true;
    this.emit();
  }
  resumeRecording() {
    if (!this.rec.enabled) return this.startRecording();
    this.rec.paused = false;
    this.rec.lastWall = null;
    this.recordCheckpoint();
    this.emit();
  }
  /** Stop future capture without deleting the document's existing replay history. */
  stopRecording() {
    this.rec.enabled = false;
    this.rec.paused = false;
    this.rec.lastWall = null;
    this.emit();
  }
  clearRecording() {
    this.rec.events = [];
    this.rec.bytes = 0;
    this.rec.time = 0;
    this.rec.lastEnd = 0;
    this.rec.lastWall = null;
    this.rec.enabled = false;
    this.rec.paused = false;
    this.dirty = true;
    this.emit();
  }
  recordCheckpoint() {
    this.rec.epoch++;
    const cp = deepSnap(this);
    this.rec.push({ t: this.rec.clock(), cp }, 0, eventBytes({ t: 0, cp }, this.width, this.height));
  }
  mark(label: string) {
    if (this.rec.active) {
      this.rec.push({ t: this.rec.clock(), m: label }, 0, 40);
      this.emit(); // keep marker-only changes visible and included in session autosave
    }
  }
}

function revert(doc: DocEngine, r: UndoRec, undo: boolean) {
  switch (r.t) {
    case 'px': {
      const L = doc.layer(r.layerId);
      const C = r.target === 'mask' ? L?.mask : L?.canvas;
      if (!C) return;
      const ctx = ctxOf(C);
      ctx.clearRect(r.x, r.y, r.w, r.h);
      ctx.drawImage(undo ? r.before : r.after, r.x, r.y);
      return;
    }
    case 'ink': {
      const i = doc.layers.findIndex((l) => l.id === r.layerId);
      if (i >= 0) doc.layers[i] = { ...doc.layers[i], strokes: undo ? r.before : r.after };
      return;
    }
    case 'doc':
      restoreDocSnap(doc, undo ? r.before : r.after);
      return;
    case 'sel':
      doc.selection = undo ? r.before : r.after;
      return;
  }
}

// ---------------- command application ----------------
function pxOp(doc: DocEngine, L: Layer, rect: Rect, label: string, fn: (ctx: CanvasRenderingContext2D, r: Rect) => void, target?: 'mask'): UndoRec | null {
  const r = clipRect(rect, doc.width, doc.height);
  const C = target === 'mask' ? L.mask : L.canvas;
  if (!r || !C) return null;
  const before = copyRegion(C, r);
  const ctx = ctxOf(C);
  ctx.save();
  fn(ctx, r);
  ctx.restore();
  const after = copyRegion(C, r);
  return { t: 'px', label, layerId: L.id, ...r, before, after, bytes: r.w * r.h * 8, epoch: 0, target };
}

/** Replace a raster layer's pixels with a processed version (respects the selection). Undoable as a region op. */
function replacePixels(doc: DocEngine, L: Layer, result: HTMLCanvasElement, label: string): UndoRec | null {
  const b = doc.selection ? selBounds(doc.selection, doc.width, doc.height) : { x: 0, y: 0, w: doc.width, h: doc.height };
  return pxOp(doc, L, { x: b.x - 1, y: b.y - 1, w: b.w + 2, h: b.h + 2 }, label, (ctx) => {
    applyClip(ctx, doc.selection, doc.width, doc.height);
    ctx.clearRect(0, 0, doc.width, doc.height);
    ctx.drawImage(result, 0, 0);
  });
}

function canvasPx(c: HTMLCanvasElement): Px {
  const d = c.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, c.width, c.height);
  return { data: d.data, w: c.width, h: c.height };
}
export function pxToCanvas(p: Px) {
  const c = createCanvas(p.w, p.h);
  ctxOf(c).putImageData(new ImageData(new Uint8ClampedArray(p.data), p.w, p.h), 0, 0);
  return c;
}
export function runFxOnCanvas(c: HTMLCanvasElement, id: string, params: Record<string, number>, seed: number) {
  return pxToCanvas(runFx(id, canvasPx(c), params, seed));
}
function docOp(doc: DocEngine, label: string, newCanvases: number, fn: () => boolean | void): UndoRec | null {
  const before = takeDocSnap(doc);
  if (fn() === false) return null;
  const after = takeDocSnap(doc);
  return { t: 'doc', label, before, after, bytes: newCanvases * doc.width * doc.height * 4 + 2000, epoch: 0 };
}
const idx = (doc: DocEngine, id: string) => doc.layers.findIndex((l) => l.id === id);

export function splitForTransform(doc: DocEngine, L: Layer, useSel: boolean) {
  const src = L.canvas!;
  if (useSel && doc.selection) {
    const content = createCanvas(doc.width, doc.height);
    const cc = ctxOf(content);
    cc.save();
    applyClip(cc, doc.selection, doc.width, doc.height);
    cc.drawImage(src, 0, 0);
    cc.restore();
    const base = cloneCanvas(src);
    const bc = ctxOf(base);
    bc.save();
    applyClip(bc, doc.selection, doc.width, doc.height);
    bc.clearRect(0, 0, doc.width, doc.height);
    bc.restore();
    return { base, content };
  }
  return { base: null as HTMLCanvasElement | null, content: src };
}

function pixelFilter(c: HTMLCanvasElement, f: string, amount: number) {
  const ctx = c.getContext('2d')!;
  if (f === 'blur') {
    const t = cloneCanvas(c);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.filter = `blur(${amount}px)`;
    ctx.drawImage(t, 0, 0);
    ctx.filter = 'none';
    return;
  }
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i], g = d[i + 1], b = d[i + 2];
    if (f === 'invert') { r = 255 - r; g = 255 - g; b = 255 - b; }
    else if (f === 'grayscale') { const l = 0.2126 * r + 0.7152 * g + 0.0722 * b; r = g = b = l; }
    else if (f === 'sepia') { const nr = r * 0.393 + g * 0.769 + b * 0.189, ng = r * 0.349 + g * 0.686 + b * 0.168, nb = r * 0.272 + g * 0.534 + b * 0.131; r = nr; g = ng; b = nb; }
    else if (f === 'brightness') { r *= amount; g *= amount; b *= amount; }
    else if (f === 'contrast') { r = (r - 128) * amount + 128; g = (g - 128) * amount + 128; b = (b - 128) * amount + 128; }
    d[i] = clamp(r, 0, 255); d[i + 1] = clamp(g, 0, 255); d[i + 2] = clamp(b, 0, 255);
  }
  ctx.putImageData(img, 0, 0);
}

function transformedSel(sel: Selection | null, m: number[]): Selection | null {
  if (!sel) return null;
  const pts = sel.pts.slice();
  for (let i = 0; i < pts.length; i += 2) {
    const [x, y] = mapPt(m, pts[i], pts[i + 1]);
    pts[i] = x; pts[i + 1] = y;
  }
  return { pts, inverted: sel.inverted };
}

export function applyCommand(doc: DocEngine, cmd: Command, pre?: PreRendered): UndoRec | null {
  const W = doc.width, H = doc.height;
  switch (cmd.k) {
    case 'stroke': {
      const L = doc.layer(cmd.layerId);
      if (!L || L.type !== 'raster' || L.locked || !L.canvas) return null;
      const onMask = cmd.target === 'mask';
      if (onMask && !L.mask) return null;
      const direct = (cmd.brush.mode === 'smudge' || cmd.brush.mode === 'mix') && !cmd.eraser && !onMask;
      let out: PreRendered = pre as PreRendered;
      if (!out) {
        const r = renderStroke({ brush: cmd.brush, color: cmd.color, eraser: cmd.eraser, seed: cmd.seed, sym: cmd.sym, w: W, h: H, layer: onMask ? undefined : L.canvas }, cmd.s);
        out = { canvas: r.out, rect: r.dirty };
      }
      if (!out.rect) return null;
      if (onMask) {
        return pxOp(doc, L, out.rect, cmd.eraser ? 'Hide (mask)' : 'Reveal (mask)', (ctx, r) => {
          applyClip(ctx, doc.selection, W, H);
          ctx.globalAlpha = cmd.brush.opacity;
          ctx.globalCompositeOperation = cmd.eraser ? 'destination-out' : 'source-over';
          ctx.drawImage(out.canvas, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);
        }, 'mask');
      }
      return pxOp(doc, L, out.rect, cmd.eraser ? 'Erase' : cmd.brush.name, (ctx, r) => {
        applyClip(ctx, doc.selection, W, H);
        if (direct) {
          ctx.clearRect(r.x, r.y, r.w, r.h);
          ctx.drawImage(out.canvas, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);
        } else {
          ctx.globalAlpha = cmd.brush.opacity;
          ctx.globalCompositeOperation = cmd.eraser ? 'destination-out' : L.alphaLock ? 'source-atop' : cmd.brush.composite;
          ctx.drawImage(out.canvas, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);
        }
      });
    }
    case 'fill': {
      const L = doc.layer(cmd.layerId);
      if (!L || L.type !== 'raster' || L.locked || !L.canvas) return null;
      const refs = doc.layers.filter((l) => l.reference && l.visible && l.id !== L.id);
      let srcC: HTMLCanvasElement;
      if (cmd.all) srcC = compositeDoc(doc, 1, false);
      else if (refs.length) {
        // reference layers: fill regions are found from the line art, paint lands on the active layer
        srcC = cloneCanvas(L.canvas, true);
        const rc = ctxOf(srcC);
        for (const R of refs) rc.drawImage(rasterOf(doc, R), 0, 0);
      } else srcC = cloneCanvas(L.canvas, true);
      const data = srcC.getContext('2d')!.getImageData(0, 0, W, H);
      let mask = floodFill(data, cmd.x, cmd.y, cmd.tol);
      if (!mask) return null;
      if (cmd.expand > 0) mask = dilate(mask, W, H, Math.min(4, cmd.expand));
      if (doc.selection) {
        const sc = createCanvas(W, H, true);
        const sx = sc.getContext('2d', { willReadFrequently: true })!;
        sx.fillStyle = '#000';
        sx.fill(selPath(doc.selection, W, H), doc.selection.inverted ? 'evenodd' : 'nonzero');
        const sd = sx.getImageData(0, 0, W, H).data;
        for (let i = 0; i < mask.length; i++) if (sd[i * 4 + 3] < 128) mask[i] = 0;
      }
      let minX = W, minY = H, maxX = -1, maxY = -1;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (mask[y * W + x]) {
        if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
      if (maxX < 0) return null;
      const bw = maxX - minX + 1, bh = maxY - minY + 1;
      const tmp = createCanvas(bw, bh);
      const tc = ctxOf(tmp);
      const img = tc.createImageData(bw, bh);
      const [r, g, b] = hexToRgb(cmd.color);
      for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
        if (!mask[(y + minY) * W + x + minX]) continue;
        const i = (y * bw + x) * 4;
        img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255;
      }
      tc.putImageData(img, 0, 0);
      return pxOp(doc, L, { x: minX, y: minY, w: bw, h: bh }, 'Fill', (ctx) => {
        ctx.globalCompositeOperation = L.alphaLock ? 'source-atop' : 'source-over';
        ctx.drawImage(tmp, minX, minY);
      });
    }
    case 'fillSel':
    case 'clearSel': {
      const L = doc.layer(cmd.layerId);
      if (!L || L.locked) return null;
      if (L.type === 'ink') {
        if (cmd.k === 'fillSel') return null;
        const before = L.strokes || [];
        return applyInkSet(doc, L, before.filter((s) => {
          if (!doc.selection) return false;
          const c = createCanvas(1, 1).getContext('2d')!;
          const inside = c.isPointInPath(selPath(doc.selection, W, H), s.pts[0], s.pts[1], doc.selection.inverted ? 'evenodd' : 'nonzero');
          return !inside;
        }), 'Clear selection');
      }
      const b = selBounds(doc.selection, W, H);
      return pxOp(doc, L, b, cmd.k === 'fillSel' ? 'Fill selection' : 'Clear', (ctx) => {
        applyClip(ctx, doc.selection, W, H);
        if (cmd.k === 'fillSel') {
          ctx.globalCompositeOperation = L.alphaLock ? 'source-atop' : 'source-over';
          ctx.fillStyle = cmd.color;
          ctx.fillRect(0, 0, W, H);
        } else ctx.clearRect(0, 0, W, H);
      });
    }
    case 'poly': {
      const L = doc.layer(cmd.layerId);
      if (!L || L.type !== 'raster' || L.locked) return null;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (let i = 0; i < cmd.pts.length; i += 2) {
        minX = Math.min(minX, cmd.pts[i]); maxX = Math.max(maxX, cmd.pts[i]);
        minY = Math.min(minY, cmd.pts[i + 1]); maxY = Math.max(maxY, cmd.pts[i + 1]);
      }
      return pxOp(doc, L, { x: minX - 2, y: minY - 2, w: maxX - minX + 4, h: maxY - minY + 4 }, 'Shape fill', (ctx) => {
        applyClip(ctx, doc.selection, W, H);
        ctx.globalAlpha = cmd.opacity;
        ctx.globalCompositeOperation = L.alphaLock ? 'source-atop' : 'source-over';
        ctx.fillStyle = cmd.color;
        ctx.beginPath();
        for (let i = 0; i < cmd.pts.length; i += 2) ctx.lineTo(cmd.pts[i], cmd.pts[i + 1]);
        ctx.closePath();
        ctx.fill();
      });
    }
    case 'text': {
      const L = doc.layer(cmd.layerId);
      if (!L || L.type !== 'raster' || L.locked) return null;
      const font = `${cmd.italic ? 'italic ' : ''}${cmd.bold ? 'bold ' : ''}${cmd.size}px ${cmd.font}`;
      const lines = cmd.text.split('\n');
      const m = createCanvas(1, 1).getContext('2d')!;
      m.font = font;
      const tw = Math.max(...lines.map((l) => m.measureText(l).width));
      const lh = cmd.size * 1.25;
      return pxOp(doc, L, { x: cmd.x - 4, y: cmd.y - 4, w: tw + cmd.size + 8, h: lh * lines.length + cmd.size * 0.5 + 8 }, 'Text', (ctx) => {
        applyClip(ctx, doc.selection, W, H);
        ctx.font = font;
        ctx.textBaseline = 'top';
        ctx.fillStyle = cmd.color;
        ctx.globalCompositeOperation = L.alphaLock ? 'source-atop' : 'source-over';
        lines.forEach((l, i) => ctx.fillText(l, cmd.x, cmd.y + i * lh));
      });
    }
    case 'image': {
      const img = doc.assetImgs.get(cmd.asset);
      if (!img || doc.layers.length >= MAX_LAYERS) return null;
      return docOp(doc, cmd.props?.link ? '3D capture' : 'Import image', 1, () => {
        const L = doc.makeLayer('raster', cmd.name, cmd.layerId);
        if (cmd.props) Object.assign(L, cmd.props);
        const ctx = ctxOf(L.canvas!);
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, cmd.x, cmd.y, cmd.w, cmd.h);
        doc.layers.splice(clamp(cmd.index, 0, doc.layers.length), 0, L);
        doc.activeLayerId = L.id;
      });
    }
    case 'inkAdd': {
      const L = doc.layer(cmd.layerId);
      if (!L || L.type !== 'ink' || L.locked) return null;
      return applyInkSet(doc, L, [...(L.strokes || []), cmd.stroke], 'Crisp Ink');
    }
    case 'inkSet': {
      const L = doc.layer(cmd.layerId);
      if (!L || L.type !== 'ink' || L.locked) return null;
      return applyInkSet(doc, L, cmd.strokes, cmd.label);
    }
    case 'transform': {
      const L = doc.layer(cmd.layerId);
      if (!L || L.locked) return null;
      const m = cmd.m;
      if (L.type === 'ink') {
        const ids = cmd.ids ? new Set(cmd.ids) : null;
        return applyInkSet(doc, L, (L.strokes || []).map((s) => (!ids || ids.has(s.id) ? transformInk(s, m) : s)), 'Transform');
      }
      return docOp(doc, 'Transform', 1, () => {
        const useSel = cmd.sel && !!doc.selection;
        const { base, content } = splitForTransform(doc, L, useSel);
        const nc = createCanvas(W, H);
        const ctx = ctxOf(nc);
        if (base) ctx.drawImage(base, 0, 0);
        ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(content, 0, 0);
        doc.layers[idx(doc, L.id)] = { ...L, canvas: nc };
        if (useSel) doc.selection = transformedSel(doc.selection, m);
      });
    }
    case 'layerAdd': {
      if (doc.layers.length >= MAX_LAYERS) return null;
      return docOp(doc, cmd.type === 'ink' ? 'New Crisp Ink layer' : 'New layer', 0, () => {
        const L = doc.makeLayer(cmd.type, cmd.name, cmd.id);
        doc.layers.splice(clamp(cmd.index, 0, doc.layers.length), 0, L);
        doc.activeLayerId = L.id;
      });
    }
    case 'layerDel': {
      const i = idx(doc, cmd.layerId);
      if (i < 0 || doc.layers.length <= 1) return null;
      const doomed = new Set([cmd.layerId, ...doc.layers.filter((l) => l.parent === cmd.layerId).map((l) => l.id)]);
      if (doomed.size >= doc.layers.length) return null;
      return docOp(doc, 'Delete layer', 0, () => {
        doc.layers = doc.layers.filter((l) => !doomed.has(l.id));
        if (doomed.has(doc.activeLayerId)) doc.activeLayerId = doc.layers[Math.max(0, Math.min(doc.layers.length - 1, i - 1))].id;
      });
    }
    case 'layerDup': {
      const i = idx(doc, cmd.layerId);
      if (i < 0 || doc.layers.length >= MAX_LAYERS) return null;
      return docOp(doc, 'Duplicate layer', 1, () => {
        const L = doc.layers[i];
        const N: Layer = { ...L, id: cmd.newId, name: L.name + ' copy', canvas: L.canvas ? cloneCanvas(L.canvas) : undefined, mask: L.mask ? cloneCanvas(L.mask) : undefined };
        doc.layers.splice(i + 1, 0, N);
        doc.activeLayerId = N.id;
      });
    }
    case 'layerMove': {
      const i = idx(doc, cmd.layerId);
      const to = clamp(cmd.index, 0, doc.layers.length - 1);
      if (i < 0 || i === to) return null;
      return docOp(doc, 'Reorder layer', 0, () => {
        const [L] = doc.layers.splice(i, 1);
        doc.layers.splice(to, 0, L);
      });
    }
    case 'layerProp': {
      const i = idx(doc, cmd.layerId);
      if (i < 0) return null;
      const keys = Object.keys(cmd.props);
      const label = keys.includes('name') ? 'Rename layer' : keys.includes('visible') ? 'Layer visibility' : keys.includes('opacity') ? 'Layer opacity' : keys.includes('blend') ? 'Blend mode' : 'Layer properties';
      return docOp(doc, label, 0, () => {
        doc.layers[i] = { ...doc.layers[i], ...cmd.props };
      });
    }
    case 'mergeDown': {
      const i = idx(doc, cmd.layerId);
      if (i <= 0) return null;
      const U = doc.layers[i], B = doc.layers[i - 1];
      if (B.locked || ['group', 'adjust'].includes(U.type) || ['group', 'adjust'].includes(B.type)) return null;
      return docOp(doc, 'Merge down', 1, () => {
        if (U.type === 'ink' && B.type === 'ink' && U.opacity === B.opacity && U.blend === 'source-over') {
          doc.layers[i - 1] = { ...B, strokes: [...(B.strokes || []), ...(U.strokes || [])] };
        } else {
          const nc = createCanvas(W, H);
          const ctx = ctxOf(nc);
          ctx.globalAlpha = B.type === 'ink' ? B.opacity : 1;
          ctx.drawImage(rasterOf(doc, B), 0, 0);
          if (U.visible) {
            ctx.globalAlpha = U.opacity;
            ctx.globalCompositeOperation = U.blend === 'linear-burn' ? 'multiply' : U.blend;
            ctx.drawImage(rasterOf(doc, U), 0, 0);
          }
          doc.layers[i - 1] = { ...B, type: 'raster', canvas: nc, strokes: undefined, opacity: B.type === 'ink' ? 1 : B.opacity };
        }
        doc.layers.splice(i, 1);
        doc.activeLayerId = doc.layers[i - 1].id;
      });
    }
    case 'rasterize': {
      const i = idx(doc, cmd.layerId);
      if (i < 0 || (doc.layers[i].type !== 'ink' && doc.layers[i].type !== 'comic')) return null;
      return docOp(doc, 'Rasterize layer', 1, () => {
        const L = doc.layers[i];
        doc.layers[i] = { ...L, type: 'raster', canvas: rasterOf(doc, { ...L, mask: undefined }), strokes: undefined, comic: undefined };
      });
    }
    // ---------------- Windows edition: gradients, filters, liquify, masks, groups, comics
    case 'gradient': {
      const L = doc.layer(cmd.layerId);
      if (!L || L.type !== 'raster' || L.locked) return null;
      return pxOp(doc, L, selBounds(doc.selection, W, H), 'Gradient', (ctx) => {
        applyClip(ctx, doc.selection, W, H);
        ctx.globalCompositeOperation = L.alphaLock ? 'source-atop' : 'source-over';
        ctx.fillStyle = makeGradient(ctx, cmd.kind, cmd.x0, cmd.y0, cmd.x1, cmd.y1, cmd.stops);
        ctx.fillRect(0, 0, W, H);
      });
    }
    case 'fx': {
      const L = doc.layer(cmd.layerId);
      if (!L || L.type !== 'raster' || L.locked || !L.canvas) return null;
      const res = pre?.canvas || runFxOnCanvas(L.canvas, cmd.id, cmd.params, cmd.seed);
      return replacePixels(doc, L, res, 'Filter: ' + cmd.id);
    }
    case 'liquify': {
      const L = doc.layer(cmd.layerId);
      if (!L || L.type !== 'raster' || L.locked || !L.canvas || !cmd.ops.length) return null;
      const res = pre?.canvas || applyLiquifyOps(L.canvas, cmd.ops);
      return replacePixels(doc, L, res, 'Liquify');
    }
    case 'maskAdd': {
      const i = idx(doc, cmd.layerId);
      const L = doc.layers[i];
      if (!L || L.mask || L.type === 'group' || L.type === 'adjust') return null;
      return docOp(doc, 'Add layer mask', 1, () => {
        const m = createCanvas(W, H);
        const c = ctxOf(m);
        c.fillStyle = '#ffffff';
        if (cmd.fromSel && doc.selection) c.fill(selPath(doc.selection, W, H), doc.selection.inverted ? 'evenodd' : 'nonzero');
        else c.fillRect(0, 0, W, H);
        doc.layers[i] = { ...L, mask: m, maskEnabled: true };
      });
    }
    case 'maskDel': {
      const i = idx(doc, cmd.layerId);
      const L = doc.layers[i];
      if (!L || !L.mask) return null;
      return docOp(doc, cmd.apply ? 'Apply layer mask' : 'Delete layer mask', 1, () => {
        if (cmd.apply && L.type === 'raster' && L.canvas) {
          const nc = cloneCanvas(L.canvas);
          const c = ctxOf(nc);
          c.globalCompositeOperation = 'destination-in';
          c.drawImage(L.mask!, 0, 0);
          doc.layers[i] = { ...L, canvas: nc, mask: undefined, maskEnabled: undefined };
        } else doc.layers[i] = { ...L, mask: undefined, maskEnabled: undefined };
      });
    }
    case 'group': {
      const members = cmd.ids.map((id) => doc.layer(id)).filter((l): l is Layer => !!l && l.type !== 'group');
      if (!members.length) return null;
      return docOp(doc, 'Group layers', 0, () => {
        const topIdx = Math.max(...members.map((m) => idx(doc, m.id)));
        const parent = members[0].parent || null;
        const g: Layer = { ...doc.makeLayer('group', cmd.name, cmd.groupId), parent };
        // keep members contiguous directly below the group entry
        const ids = new Set(members.map((m) => m.id));
        const ordered = doc.layers.filter((l) => ids.has(l.id)).map((l) => ({ ...l, parent: cmd.groupId }));
        const rest = doc.layers.filter((l) => !ids.has(l.id));
        const insertAt = rest.findIndex((l) => idx(doc, l.id) > topIdx);
        const at = insertAt < 0 ? rest.length : insertAt;
        doc.layers = [...rest.slice(0, at), ...ordered, g, ...rest.slice(at)];
        doc.activeLayerId = g.id;
      });
    }
    case 'ungroup': {
      const g = doc.layer(cmd.groupId);
      if (!g || g.type !== 'group') return null;
      return docOp(doc, 'Ungroup', 0, () => {
        doc.layers = doc.layers.filter((l) => l.id !== g.id).map((l) => (l.parent === g.id ? { ...l, parent: g.parent || null, opacity: l.opacity * g.opacity, visible: l.visible && g.visible } : l));
        doc.activeLayerId = doc.layers[doc.layers.length - 1].id;
      });
    }
    case 'mergeVisible': {
      if (doc.layers.length < 2) return null;
      return docOp(doc, 'Merge visible', 1, () => {
        const flat = compositeDoc(doc, 1, false);
        const keep = doc.layers.filter((l) => !l.visible && l.type !== 'group');
        const L = { ...doc.makeLayer('raster', 'Merged'), canvas: flat };
        doc.layers = [...keep.map((l) => ({ ...l, parent: null })), L];
        doc.activeLayerId = L.id;
      });
    }
    case 'flattenCopy': {
      if (doc.layers.length >= MAX_LAYERS) return null;
      return docOp(doc, 'Flatten a copy', 1, () => {
        const L = { ...doc.makeLayer('raster', 'Flattened copy', cmd.newId), canvas: compositeDoc(doc, 1, false) };
        doc.layers.push(L);
        doc.activeLayerId = L.id;
      });
    }
    case 'adjustAdd': {
      if (doc.layers.length >= MAX_LAYERS) return null;
      return docOp(doc, 'New adjustment layer', 0, () => {
        const L: Layer = { ...doc.makeLayer('adjust', cmd.name, cmd.id), adjust: { ...cmd.adjust } };
        doc.layers.splice(clamp(cmd.index, 0, doc.layers.length), 0, L);
        doc.activeLayerId = L.id;
      });
    }
    case 'imagePixels': {
      // Continuum / Orbit-to-Comic recapture: replace a linked layer's pixels with a fresh render (undoable, replayable)
      const i = idx(doc, cmd.layerId);
      const L = doc.layers[i];
      const img = doc.assetImgs.get(cmd.asset);
      if (!L || L.type !== 'raster' || L.locked || !L.canvas || !img) return null;
      return docOp(doc, 'Recapture 3D view', 1, () => {
        const nc = createCanvas(W, H);
        const c = ctxOf(nc);
        c.imageSmoothingQuality = 'high';
        c.drawImage(img, cmd.x, cmd.y, cmd.w, cmd.h);
        doc.layers[i] = { ...L, ...(cmd.props || {}), canvas: nc };
      });
    }
    case 'comicSet': {
      const i = idx(doc, cmd.layerId);
      const L = doc.layers[i];
      if (!L || L.type !== 'comic' || L.locked) return null;
      return docOp(doc, cmd.label, 0, () => {
        doc.layers[i] = { ...L, comic: cmd.objects };
      });
    }
    case 'layerClear': {
      const i = idx(doc, cmd.layerId);
      if (i < 0 || doc.layers[i].locked) return null;
      return docOp(doc, 'Clear layer', 0, () => {
        const L = doc.layers[i];
        doc.layers[i] = L.type === 'ink' ? { ...L, strokes: [] } : L.type === 'comic' ? { ...L, comic: [] } : L.type === 'raster' ? { ...L, canvas: createCanvas(W, H) } : L;
      });
    }
    case 'resize':
    case 'scale': {
      const err = checkDims(cmd.w, cmd.h);
      if (err) throw new Error(err);
      const nw = Math.round(cmd.w), nh = Math.round(cmd.h);
      const m = cmd.k === 'resize'
        ? [1, 0, 0, 1, Math.round((nw - W) * cmd.ax), Math.round((nh - H) * cmd.ay)]
        : [nw / W, 0, 0, nh / H, 0, 0];
      return docOp(doc, cmd.k === 'resize' ? 'Canvas size' : 'Image size', doc.layers.length, () => reframe(doc, nw, nh, m, cmd.k === 'resize'));
    }
    case 'flip': {
      const m = cmd.axis === 'h' ? [-1, 0, 0, 1, W, 0] : [1, 0, 0, -1, 0, H];
      return docOp(doc, cmd.axis === 'h' ? 'Flip horizontal' : 'Flip vertical', doc.layers.length, () => reframe(doc, W, H, m, false));
    }
    case 'rotate': {
      const m = cmd.dir === 1 ? [0, 1, -1, 0, H, 0] : [0, -1, 1, 0, 0, W];
      return docOp(doc, 'Rotate canvas', doc.layers.length, () => reframe(doc, H, W, m, false));
    }
    case 'select': {
      const before = doc.selection;
      doc.selection = cmd.sel;
      return { t: 'sel', label: cmd.sel ? 'Select' : 'Deselect', before, after: cmd.sel, bytes: 200, epoch: 0 };
    }
    case 'bg':
      return docOp(doc, 'Background', 0, () => { doc.background = cmd.color; });
    case 'filter': {
      const i = idx(doc, cmd.layerId);
      const L = doc.layers[i];
      if (!L || L.type !== 'raster' || L.locked || !L.canvas) return null;
      return docOp(doc, 'Filter: ' + cmd.f, 1, () => {
        const f = cloneCanvas(L.canvas!, true);
        pixelFilter(f, cmd.f, cmd.amount);
        let nc = f;
        if (doc.selection) {
          nc = cloneCanvas(L.canvas!);
          const ctx = ctxOf(nc);
          ctx.save();
          applyClip(ctx, doc.selection, W, H);
          ctx.clearRect(0, 0, W, H);
          ctx.drawImage(f, 0, 0);
          ctx.restore();
        }
        doc.layers[i] = { ...L, canvas: nc };
      });
    }
  }
  return null;
}

function applyInkSet(doc: DocEngine, L: Layer, strokes: typeof L.strokes, label: string): UndoRec {
  const before = L.strokes || [];
  const after = strokes || [];
  doc.layers[idx(doc, L.id)] = { ...L, strokes: after };
  return { t: 'ink', label, layerId: L.id, before, after, bytes: 64 * (after.length + 1), epoch: 0 };
}

/**
 * Time Machine restore: replace a document's contents with another document's (deserialized snapshot).
 * Identity (uuid / lineage / file handle / name) and the Drawing Replay log are kept; undo history is cleared
 * because it refers to the replaced state. Callers must snapshot the current state first.
 */
export function replaceContents(target: DocEngine, src: DocEngine) {
  target.preview = null;
  target.propPreview = null;
  target.width = src.width;
  target.height = src.height;
  target.background = src.background;
  target.layers = src.layers;
  target.activeLayerId = src.activeLayerId;
  target.selection = src.selection;
  target.assets = { ...target.assets, ...src.assets };
  src.assetImgs.forEach((v, k) => target.assetImgs.set(k, v));
  target.comic = src.comic ? { ...src.comic, id: target.comic?.id || src.comic.id, index: target.comic?.index ?? src.comic.index } : target.comic;
  target.scene3d = src.scene3d;
  target.colorDock = src.colorDock;
  target.board = src.board;
  target.paletteMemory = src.paletteMemory;
  target.undoStack = [];
  target.redoStack = [];
  if (target.rec.enabled && !target.isReplay) target.recordCheckpoint(); // keeps replay consistent from here on
  target.dirty = true;
  target.meta.modified = Date.now();
  target.emit();
}

export function makeGradient(ctx: CanvasRenderingContext2D, kind: 'linear' | 'radial', x0: number, y0: number, x1: number, y1: number, stops: GradStop[]) {
  const g = kind === 'radial' ? ctx.createRadialGradient(x0, y0, 0, x0, y0, Math.max(1, Math.hypot(x1 - x0, y1 - y0))) : ctx.createLinearGradient(x0, y0, x1, y1);
  for (const s of [...stops].sort((a, b) => a.o - b.o)) {
    const h = s.c.replace('#', '');
    const r = parseInt(h.slice(0, 2), 16), gg = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    g.addColorStop(clamp(s.o, 0, 1), `rgba(${r},${gg},${b},${clamp(s.a, 0, 1)})`);
  }
  return g;
}

function reframe(doc: DocEngine, nw: number, nh: number, m: number[], clearSel: boolean) {
  const warp = (c: HTMLCanvasElement) => {
    const nc = createCanvas(nw, nh);
    const ctx = ctxOf(nc);
    ctx.imageSmoothingQuality = 'high';
    ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
    ctx.drawImage(c, 0, 0);
    return nc;
  };
  doc.layers = doc.layers.map((L0) => {
    const L = L0.mask ? { ...L0, mask: warp(L0.mask) } : L0;
    if (L.type === 'ink') return { ...L, strokes: (L.strokes || []).map((s) => transformInk(s, m)) };
    if (L.type === 'comic') return { ...L, comic: transformComic(L.comic || [], m) };
    if (!L.canvas) return L;
    return { ...L, canvas: warp(L.canvas) };
  });
  doc.width = nw;
  doc.height = nh;
  doc.selection = clearSel ? null : transformedSel(doc.selection, m);
}
