import type { DocEngine } from './document';
import type { AdjustParams, Layer, Selection } from './types';
import { drawInkStroke } from './crispInk';
import { drawComicObjects, panelPathMap, panelsClipPath } from './comic';
import { createCanvas, ctxOf } from './util';

const scratch = new Map<string, HTMLCanvasElement>();
function getScratch(key: string, w: number, h: number) {
  let c = scratch.get(key);
  if (!c || c.width !== w || c.height !== h) {
    c = createCanvas(w, h);
    scratch.set(key, c);
  }
  return c;
}
function fresh(c: HTMLCanvasElement) {
  const x = ctxOf(c);
  x.setTransform(1, 0, 0, 1, 0, 0);
  x.globalAlpha = 1;
  x.globalCompositeOperation = 'source-over';
  x.filter = 'none';
  x.clearRect(0, 0, c.width, c.height);
  return x;
}

export function selPath(sel: Selection, w: number, h: number) {
  const p = new Path2D();
  if (sel.inverted) p.rect(0, 0, w, h);
  const pts = sel.pts;
  if (pts.length >= 6) {
    p.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) p.lineTo(pts[i], pts[i + 1]);
    p.closePath();
  }
  return p;
}

export function applyClip(ctx: CanvasRenderingContext2D, sel: Selection | null, w: number, h: number) {
  if (!sel) return;
  ctx.clip(selPath(sel, w, h), sel.inverted ? 'evenodd' : 'nonzero');
}

export function selBounds(sel: Selection | null, w: number, h: number) {
  if (!sel || sel.inverted) return { x: 0, y: 0, w, h };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < sel.pts.length; i += 2) {
    minX = Math.min(minX, sel.pts[i]); maxX = Math.max(maxX, sel.pts[i]);
    minY = Math.min(minY, sel.pts[i + 1]); maxY = Math.max(maxY, sel.pts[i + 1]);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function effectiveProps(doc: DocEngine, L: Layer) {
  const pp = doc.propPreview;
  return pp && pp.layerId === L.id ? { ...L, ...pp.props } : L;
}

export const DEFAULT_ADJUST: AdjustParams = { hue: 0, sat: 1, bright: 1, contrast: 1, invert: 0, gray: 0, sepia: 0, blur: 0 };
export function adjustFilter(a?: AdjustParams) {
  const p = { ...DEFAULT_ADJUST, ...(a || {}) };
  return `hue-rotate(${p.hue}deg) saturate(${p.sat}) brightness(${p.bright}) contrast(${p.contrast}) invert(${p.invert}) grayscale(${p.gray}) sepia(${p.sepia})${p.blur ? ` blur(${p.blur}px)` : ''}`;
}

// ---------------------------------------------------------------- layer tree
const isGroup = (doc: { layers: Layer[] }, id: string | null | undefined) => !!id && doc.layers.some((g) => g.id === id && g.type === 'group');
export function topLevel(doc: { layers: Layer[] }) {
  return doc.layers.filter((l) => !isGroup(doc, l.parent));
}
export function childrenOf(doc: { layers: Layer[] }, gid: string) {
  return doc.layers.filter((l) => l.parent === gid);
}

/** Raster pixels (and mask) to composite for a layer, including any live preview. */
function layerPixels(doc: DocEngine, L: Layer): { pix: HTMLCanvasElement; mask: HTMLCanvasElement | null } {
  const pv = doc.preview;
  let pix = L.canvas!;
  let mask = L.mask && L.maskEnabled !== false ? L.mask : null;
  if (!pv || pv.layerId !== L.id) return { pix, mask };
  const W = doc.width, H = doc.height;
  if (pv.kind === 'buffer' && pv.target === 'mask') {
    if (!L.mask) return { pix, mask };
    const s = getScratch('maskpv', W, H);
    const c = fresh(s);
    c.drawImage(L.mask, 0, 0);
    c.globalCompositeOperation = pv.op === 'destination-out' ? 'destination-out' : 'source-over';
    c.globalAlpha = pv.alpha;
    c.save();
    applyClip(c, doc.selection, W, H);
    c.drawImage(pv.canvas, 0, 0);
    c.restore();
    return { pix, mask: L.maskEnabled !== false ? s : null };
  }
  const s = getScratch('layerpv', W, H);
  const c = fresh(s);
  c.globalCompositeOperation = 'copy';
  if (pv.kind === 'buffer') {
    c.drawImage(L.canvas!, 0, 0);
    c.globalCompositeOperation = pv.op;
    c.globalAlpha = pv.alpha;
    c.save();
    applyClip(c, doc.selection, W, H);
    c.drawImage(pv.canvas, 0, 0);
    c.restore();
  } else if (pv.kind === 'replace') {
    if (!doc.selection) return { pix: pv.canvas, mask };
    c.drawImage(L.canvas!, 0, 0);
    c.globalCompositeOperation = 'source-over';
    c.save();
    applyClip(c, doc.selection, W, H);
    c.clearRect(0, 0, W, H);
    c.drawImage(pv.canvas, 0, 0);
    c.restore();
  } else if (pv.kind === 'transform') {
    c.clearRect(0, 0, W, H);
    c.globalCompositeOperation = 'source-over';
    if (pv.base) c.drawImage(pv.base, 0, 0);
    if (pv.content) {
      const m = pv.m;
      c.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
      c.imageSmoothingQuality = 'high';
      c.drawImage(pv.content, 0, 0);
      c.setTransform(1, 0, 0, 1, 0, 0);
    }
  } else return { pix, mask };
  pix = s;
  return { pix, mask };
}

interface RCtx {
  doc: DocEngine;
  m: number[];
  W: number;
  H: number;
  smooth: boolean;
  panels: Path2D | null;
  panelPaths?: Map<string, Path2D> | null;
}

/** Draw a layer's own content (no opacity / blend) into x. */
function paintContent(x: CanvasRenderingContext2D, r: RCtx, L: Layer) {
  const { doc, m } = r;
  x.save();
  x.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
  if (L.panelId) {
    const own = (r.panelPaths || (r.panelPaths = panelPathMap(doc.layers))).get(L.panelId);
    if (own) x.clip(own);
  } else if (L.panelClip && r.panels) x.clip(r.panels);
  if (L.type === 'raster' && L.canvas) {
    x.imageSmoothingEnabled = r.smooth;
    x.imageSmoothingQuality = 'high';
    x.drawImage(layerPixels(doc, L).pix, 0, 0);
  } else if (L.type === 'ink') {
    const pv = doc.preview;
    const tp = pv && pv.kind === 'transform' && pv.layerId === L.id ? pv : null;
    const ids = tp?.ids ? new Set(tp.ids) : null;
    for (const st of L.strokes || []) {
      if (tp && (!ids || ids.has(st.id))) {
        x.save();
        x.transform(tp.m[0], tp.m[1], tp.m[2], tp.m[3], tp.m[4], tp.m[5]);
        drawInkStroke(x, st);
        x.restore();
      } else drawInkStroke(x, st);
    }
    if (pv && pv.kind === 'ink' && pv.layerId === L.id) drawInkStroke(x, pv.stroke);
  } else if (L.type === 'comic') {
    drawComicObjects(x, L.comic || []);
  }
  x.restore();
}

function applyMask(x: CanvasRenderingContext2D, r: RCtx, mask: HTMLCanvasElement) {
  x.save();
  x.globalCompositeOperation = 'destination-in';
  x.setTransform(r.m[0], r.m[1], r.m[2], r.m[3], r.m[4], r.m[5]);
  x.imageSmoothingEnabled = r.smooth;
  x.drawImage(mask, 0, 0);
  x.restore();
}

function clipDoc(t: CanvasRenderingContext2D, r: RCtx) {
  t.setTransform(r.m[0], r.m[1], r.m[2], r.m[3], r.m[4], r.m[5]);
  t.beginPath();
  t.rect(0, 0, r.doc.width, r.doc.height);
  t.clip();
  t.setTransform(1, 0, 0, 1, 0, 0);
}

/** Composite an out-space canvas onto the target with a CARBON blend mode. */
function blendOnto(t: CanvasRenderingContext2D, r: RCtx, src: HTMLCanvasElement, alpha: number, blend: Layer['blend']) {
  t.save();
  t.setTransform(1, 0, 0, 1, 0, 0);
  if (blend === 'linear-burn') {
    // linear burn = 1 - ((1-dst) + (1-src)·α), built from difference/add passes
    clipDoc(t, r);
    const inv = getScratch('lbinv', r.W, r.H);
    const ix = fresh(inv);
    ix.drawImage(src, 0, 0);
    ix.globalCompositeOperation = 'difference';
    ix.fillStyle = '#ffffff';
    ix.fillRect(0, 0, r.W, r.H);
    ix.globalCompositeOperation = 'destination-in';
    ix.drawImage(src, 0, 0);
    t.globalCompositeOperation = 'difference';
    t.fillStyle = '#ffffff';
    t.fillRect(0, 0, r.W, r.H);
    t.globalCompositeOperation = 'lighter';
    t.globalAlpha = alpha;
    t.drawImage(inv, 0, 0);
    t.globalAlpha = 1;
    t.globalCompositeOperation = 'difference';
    t.fillRect(0, 0, r.W, r.H);
  } else {
    t.globalAlpha = alpha;
    t.globalCompositeOperation = blend;
    t.drawImage(src, 0, 0);
  }
  t.restore();
}

function applyAdjust(t: CanvasRenderingContext2D, r: RCtx, L: Layer, depth: number) {
  const copy = getScratch('adj' + depth, r.W, r.H);
  const cx = fresh(copy);
  cx.drawImage(t.canvas, 0, 0);
  t.save();
  t.setTransform(1, 0, 0, 1, 0, 0);
  clipDoc(t, r);
  t.globalCompositeOperation = 'source-over';
  t.clearRect(0, 0, r.W, r.H);
  t.globalAlpha = 1 - L.opacity;
  t.drawImage(copy, 0, 0);
  t.globalCompositeOperation = 'lighter';
  t.globalAlpha = L.opacity;
  t.filter = adjustFilter(L.adjust);
  t.drawImage(copy, 0, 0);
  t.restore();
}

/** Render the layer's content (incl. its mask, or a whole group) into a fresh scratch. */
function renderIsolated(r: RCtx, L: Layer, key: string, depth: number) {
  const s = getScratch(key, r.W, r.H);
  const x = fresh(s);
  if (L.type === 'group') renderList(x, r, childrenOf(r.doc, L.id), depth + 1);
  else paintContent(x, r, L);
  if (L.type !== 'group' && L.mask && L.maskEnabled !== false) {
    const mk = L.type === 'raster' ? layerPixels(r.doc, L).mask : L.mask;
    if (mk) applyMask(x, r, mk);
  } else if (L.type === 'raster' && r.doc.preview?.layerId === L.id && r.doc.preview.kind === 'buffer' && r.doc.preview.target === 'mask') {
    const mk = layerPixels(r.doc, L).mask;
    if (mk) applyMask(x, r, mk);
  }
  return s;
}

function renderList(t: CanvasRenderingContext2D, r: RCtx, list: Layer[], depth: number) {
  for (let i = 0; i < list.length; i++) {
    const L0 = list[i];
    const L = effectiveProps(r.doc, L0);
    const clipped: Layer[] = [];
    let j = i + 1;
    while (j < list.length && list[j].clip && list[j].type !== 'group' && list[j].type !== 'adjust') clipped.push(list[j++]);
    if (!L.visible) { i = j - 1; continue; }
    if (L.type === 'adjust') { applyAdjust(t, r, L, depth); i = j - 1; continue; }
    const visClipped = clipped.map((c) => effectiveProps(r.doc, c)).filter((c) => c.visible);
    const hasMask = !!L0.mask && L.maskEnabled !== false;
    const maskPv = r.doc.preview?.layerId === L0.id && r.doc.preview.kind === 'buffer' && r.doc.preview.target === 'mask';
    if (!visClipped.length && L.type === 'raster' && !hasMask && !maskPv && L.blend !== 'linear-burn') {
      t.save();
      t.globalAlpha = L.opacity;
      t.globalCompositeOperation = L.blend;
      paintContent(t, r, L0);
      t.restore();
    } else {
      const base = renderIsolated(r, L0, 'base' + depth, depth);
      if (visClipped.length) {
        const bx = ctxOf(base);
        for (const C of visClipped) {
          const cs = getScratch('clip' + depth, r.W, r.H);
          const cx = fresh(cs);
          paintContent(cx, r, C);
          if (C.mask && C.maskEnabled !== false) applyMask(cx, r, C.mask);
          cx.globalCompositeOperation = 'destination-in';
          cx.drawImage(base, 0, 0);
          bx.save();
          bx.setTransform(1, 0, 0, 1, 0, 0);
          bx.globalAlpha = C.opacity;
          bx.globalCompositeOperation = C.blend === 'linear-burn' ? 'multiply' : C.blend;
          bx.drawImage(cs, 0, 0);
          bx.restore();
        }
      }
      blendOnto(t, r, base, L.opacity, L.blend);
    }
    i = j - 1;
  }
}

export interface RenderOpts {
  bg: boolean;
  checker?: CanvasPattern | null;
  /** 'auto' picks pixel-exact sampling when magnifying and high-quality filtering when reducing. */
  smoothing?: boolean | 'auto' | 'export';
}

/**
 * Composite a document into ctx. m maps document coordinates to target pixels.
 * Vector content (Crisp Ink, comic panels / balloons / effects) is rasterised directly at target resolution.
 */
export function renderDoc(ctx: CanvasRenderingContext2D, doc: DocEngine, m0: number[], outW: number, outH: number, o: RenderOpts) {
  const m = m0.slice();
  const scale = Math.hypot(m[0], m[1]);
  const axis = Math.abs(m[1]) < 1e-9 && Math.abs(m[2]) < 1e-9;
  if (axis && o.smoothing !== 'export') {
    // snap to whole device pixels: removes the half-pixel resampling blur at 100% / integer zooms
    m[4] = Math.round(m[4]);
    m[5] = Math.round(m[5]);
  }
  let smooth: boolean;
  if (o.smoothing === 'export' || o.smoothing === true) smooth = true;
  else if (o.smoothing === false) smooth = false;
  else if (!axis) smooth = scale < 3; // rotated view: filter until pixels are large
  else if (scale < 0.999) smooth = true; // reduction: filtered
  else if (Math.abs(scale - Math.round(scale)) < 0.01) smooth = false; // 100%, 200%, 300%…: exact pixels
  else smooth = scale < 2; // fractional magnification (e.g. 125%/150% Windows scaling): avoid uneven pixel widths
  ctx.save();
  ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
  if (o.bg) {
    if (doc.background) {
      ctx.fillStyle = doc.background;
      ctx.fillRect(0, 0, doc.width, doc.height);
    } else if (o.checker) {
      ctx.fillStyle = o.checker;
      ctx.fillRect(0, 0, doc.width, doc.height);
    }
  }
  ctx.restore();
  const r: RCtx = { doc, m, W: outW, H: outH, smooth, panels: doc.layers.some((l) => l.panelClip) ? panelsClipPath(doc.layers) : null };
  ctx.save();
  renderList(ctx, r, topLevel(doc), 0);
  ctx.restore();
}

/** Full-resolution composite of the document. */
export function compositeDoc(doc: DocEngine, scale = 1, bg = true) {
  const w = Math.max(1, Math.round(doc.width * scale)), h = Math.max(1, Math.round(doc.height * scale));
  const c = createCanvas(w, h, true);
  renderDoc(ctxOf(c), doc, [scale, 0, 0, scale, 0, 0], w, h, { bg, smoothing: scale === 1 ? false : 'export' });
  return c;
}

/** Render a single layer's content (vector rasterised, groups flattened, mask applied) at document resolution, ignoring opacity/blend. */
export function rasterOf(doc: DocEngine | { width: number; height: number; layers?: Layer[] }, L: Layer) {
  const c = createCanvas(doc.width, doc.height);
  const ctx = ctxOf(c);
  if (L.type === 'raster' && L.canvas) ctx.drawImage(L.canvas, 0, 0);
  else if (L.type === 'ink') for (const st of L.strokes || []) drawInkStroke(ctx, st);
  else if (L.type === 'comic') drawComicObjects(ctx, L.comic || []);
  else if (L.type === 'group' && 'preview' in doc) {
    const r: RCtx = { doc: doc as DocEngine, m: [1, 0, 0, 1, 0, 0], W: doc.width, H: doc.height, smooth: false, panels: panelsClipPath((doc as DocEngine).layers) };
    renderList(ctx, r, childrenOf(doc as DocEngine, L.id), 1);
  }
  if (L.mask && L.maskEnabled !== false && L.type !== 'group') {
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(L.mask, 0, 0);
  }
  return c;
}

export function samplePixel(doc: DocEngine, x: number, y: number, layerOnly?: Layer): [number, number, number, number] {
  const d = sampleRegion(doc, x, y, 0, layerOnly).data;
  return [d[0], d[1], d[2], d[3]];
}

/** (2r+1)² pixels of the visible composite (or one layer) centred on a document pixel. */
export function sampleRegion(doc: DocEngine, x: number, y: number, rad: number, layerOnly?: Layer): ImageData {
  const n = rad * 2 + 1;
  const c = getScratch('pick' + n, n, n);
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, n, n);
  const ox = Math.floor(x) - rad, oy = Math.floor(y) - rad;
  if (layerOnly) ctx.drawImage(rasterOf(doc, layerOnly), -ox, -oy);
  else renderDoc(ctx, doc, [1, 0, 0, 1, -ox, -oy], n, n, { bg: true, smoothing: false });
  return ctx.getImageData(0, 0, n, n);
}
