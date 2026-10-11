import { useEffect, useRef } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { BalloonStyle, BrushParams, ComicFxKind, ComicObject, GradStop, Symmetry } from '../engine/types';
import type { DocEngine } from '../engine/document';
import { LiquifySession } from '../engine/liquify';
import { StrokeRenderer } from '../engine/strokeRenderer';
import { sampleRegion } from '../engine/render';
import { hitComic, newBalloon, newFx, objBounds } from '../engine/comic';
import { setInstalledPacks, type InstalledPack } from '../engine/brushPacks';
import { invM, mapPt, rgbToHex, uid, viewMatrix } from '../engine/util';
import { activeDoc, currentBrush, getApp, setApp, setColor, toast, useApp } from '../state/store';
import { canvasBus, viewChanged, zoomAt } from '../state/commands';
import { cancelDockPick, finishDockPick, useDock } from './dockModel';

export type Workspace = 'draw' | 'comic' | '3d' | 'effects' | 'library' | 'board';
export type ComicMode = 'select' | 'panel-rect' | 'panel-poly' | 'panel-free' | 'balloon' | 'fx';

interface WinState {
  workspace: Workspace;
  packs: InstalledPack[];
  liq: { mode: number; radius: number; strength: number; pressure: boolean };
  grad: { kind: 'linear' | 'radial'; stops: GradStop[] };
  comic: { mode: ComicMode; style: BalloonStyle; fx: ComicFxKind; selected: string | null; gutter: number; border: number };
  maskEdit: string | null;
  libView: 'grid' | 'list';
}

export const GRADIENT_PRESETS: { name: string; stops: GradStop[] }[] = [
  { name: 'Foreground → Transparent', stops: [{ o: 0, c: '#1d1d1f', a: 1 }, { o: 1, c: '#1d1d1f', a: 0 }] },
  { name: 'Sunset', stops: [{ o: 0, c: '#2b1055', a: 1 }, { o: 0.5, c: '#d53369', a: 1 }, { o: 1, c: '#ffb36b', a: 1 }] },
  { name: 'Daylight sky', stops: [{ o: 0, c: '#3a7bd5', a: 1 }, { o: 1, c: '#d6ecff', a: 1 }] },
  { name: 'Night sky', stops: [{ o: 0, c: '#020111', a: 1 }, { o: 0.6, c: '#191970', a: 1 }, { o: 1, c: '#3d4a8c', a: 1 }] },
  { name: 'Ocean depth', stops: [{ o: 0, c: '#5fd3e0', a: 1 }, { o: 1, c: '#03254c', a: 1 }] },
  { name: 'Fire', stops: [{ o: 0, c: '#fff3b0', a: 1 }, { o: 0.4, c: '#ff8c1a', a: 1 }, { o: 1, c: '#7a0b0b', a: 1 }] },
  { name: 'Skin light → shadow', stops: [{ o: 0, c: '#f6d5c3', a: 1 }, { o: 1, c: '#a0614a', a: 1 }] },
  { name: 'Manga gray', stops: [{ o: 0, c: '#000000', a: 0.6 }, { o: 1, c: '#000000', a: 0 }] },
  { name: 'Rainbow', stops: [{ o: 0, c: '#ff0000', a: 1 }, { o: 0.2, c: '#ffbf00', a: 1 }, { o: 0.4, c: '#33cc33', a: 1 }, { o: 0.6, c: '#00bfff', a: 1 }, { o: 0.8, c: '#4b0082', a: 1 }, { o: 1, c: '#ee82ee', a: 1 }] },
];

export const useWin = create<WinState>()(
  persist(
    (): WinState => ({
      workspace: 'draw' as Workspace,
      packs: [] as InstalledPack[],
      liq: { mode: 0, radius: 60, strength: 0.5, pressure: true },
      grad: { kind: 'linear' as const, stops: GRADIENT_PRESETS[1].stops },
      comic: { mode: 'select' as ComicMode, style: 'speech' as BalloonStyle, fx: 'speed' as ComicFxKind, selected: null, gutter: 30, border: 6 },
      maskEdit: null,
      libView: 'grid' as const,
    }),
    {
      name: 'carbon-win-v1',
      partialize: (s) => ({ workspace: s.workspace === 'library' ? 'draw' : s.workspace, packs: s.packs, liq: s.liq, grad: s.grad, comic: { ...s.comic, selected: null }, libView: s.libView }),
    },
  ),
);
export const setWin = (p: Partial<WinState>) => useWin.setState(p);
setInstalledPacks(useWin.getState().packs);
useWin.subscribe((s, prev) => { if (s.packs !== prev.packs) { setInstalledPacks(s.packs); setApp({ tick: getApp().tick + 1 }); } });

// ---------------------------------------------------------------- comic helpers
export function comicLayer(doc: DocEngine, createIfMissing: boolean) {
  const a = doc.active;
  if (a?.type === 'comic') return a;
  const found = [...doc.layers].reverse().find((l) => l.type === 'comic');
  if (found || !createIfMissing) return found || null;
  const id = uid('L');
  doc.exec({ k: 'layerAdd', id, name: 'Panels & Lettering', type: 'comic', index: doc.layers.length });
  return doc.layer(id) || null;
}
export function comicObjects(doc: DocEngine | null) {
  if (!doc) return [];
  return comicLayer(doc, false)?.comic || [];
}
export function setComicObjects(doc: DocEngine, objs: ComicObject[], label: string) {
  const L = comicLayer(doc, true);
  if (!L) return;
  if (L.locked) return toast('The comic layer is locked', 'error');
  doc.exec({ k: 'comicSet', layerId: L.id, objects: objs, label });
}
export function updateComicObject(id: string, patch: Partial<ComicObject>, label = 'Edit comic object') {
  const d = activeDoc();
  if (!d) return;
  setComicObjects(d, comicObjects(d).map((o) => (o.id === id ? ({ ...o, ...patch } as ComicObject) : o)), label);
}

// ---------------------------------------------------------------- liquify session
let liq: { session: LiquifySession; layerId: string; doc: DocEngine } | null = null;
export const liquifyActive = () => !!liq;
function liqEnsure(doc: DocEngine) {
  const L = doc.active;
  if (!L || L.type !== 'raster' || !L.canvas) { toast('Liquify works on raster layers', 'error'); return null; }
  if (L.locked) { toast('Layer is locked', 'error'); return null; }
  if (liq && (liq.doc !== doc || liq.layerId !== L.id)) liqCommit();
  if (!liq) liq = { session: new LiquifySession(L.canvas), layerId: L.id, doc };
  doc.preview = { kind: 'replace', layerId: L.id, canvas: liq.session.out };
  return liq;
}
export function liqCommit() {
  const l = liq;
  liq = null;
  if (!l) return;
  l.doc.preview = null;
  if (l.session.ops.length) l.doc.exec({ k: 'liquify', layerId: l.layerId, ops: l.session.ops.slice() }, { canvas: l.session.out, rect: null });
  else l.doc.emit();
}
export function liqCancel() {
  if (!liq) return;
  liq.doc.preview = null;
  liq.doc.emit();
  liq = null;
}
export function liqReset() {
  if (!liq) return;
  liq.session.reset();
  liq.doc.emit();
}
useApp.subscribe((s, prev) => {
  if (prev.tool === 'liquify' && s.tool !== 'liquify') liqCommit();
  if (prev.activeId !== s.activeId) { liqCommit(); setWin({ maskEdit: null }); }
});

// ---------------------------------------------------------------- overlay component
type Drag =
  | { k: 'pick'; orig: string }
  | { k: 'grad'; x0: number; y0: number; x1: number; y1: number }
  | { k: 'liq'; lx: number; ly: number }
  | { k: 'mask'; r: StrokeRenderer; s: number[]; t0: number; brush: BrushParams; eraser: boolean; seed: number; layerId: string }
  | { k: 'comicMove'; id: string; x0: number; y0: number; orig: ComicObject[]; handle: string | null }
  | { k: 'comicRect'; x0: number; y0: number; x1: number; y1: number }
  | { k: 'comicFree'; pts: number[] }
  | { k: 'pan'; sx: number; sy: number; px: number; py: number };

const OFF: Symmetry = { mode: 'off', count: 2, cx: 0.5, cy: 0.5 };
const r2 = (v: number) => Math.round(v * 100) / 100;

export default function WinOverlay() {
  const ref = useRef<HTMLCanvasElement>(null);
  const drag = useRef<Drag | null>(null);
  const hover = useRef<{ sx: number; sy: number; x: number; y: number; touch: boolean } | null>(null);
  const poly = useRef<number[]>([]);
  const dirty = useRef(true);
  const space = useRef(false);
  const tool = useApp((s) => s.tool);
  const replay = useApp((s) => s.replay);
  const maskEdit = useWin((s) => s.maskEdit);
  const comicMode = useWin((s) => s.comic.mode);
  useApp((s) => s.tick);
  useWin((s) => s.comic.selected);
  const doc = activeDoc();
  const maskActive = !!maskEdit && doc?.activeLayerId === maskEdit && (tool === 'brush' || tool === 'eraser');
  const interactive = !replay && !!doc && (['picker', 'gradient', 'liquify', 'comic'].includes(tool) || maskActive);
  dirty.current = true;

  const toDoc = (sx: number, sy: number): [number, number] => {
    const d = activeDoc()!;
    return mapPt(invM(viewMatrix(d.view, d.width, d.height)), sx, sy);
  };
  const local = (e: { clientX: number; clientY: number }) => {
    const r = ref.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };

  useEffect(() => {
    const inv = () => { dirty.current = true; };
    canvasBus.addEventListener('view', inv);
    const kd = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
      if (e.code === 'Space') space.current = true;
      if (e.key === 'Escape') {
        if (useDock.getState().pick && getApp().tool === 'picker') cancelDockPick();
        const dr = drag.current;
        if (dr?.k === 'pick') { setColor(dr.orig, false); toast('Sampling cancelled'); }
        drag.current = null;
        poly.current = [];
        dirty.current = true;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && getApp().tool === 'comic') {
        const id = useWin.getState().comic.selected, d = activeDoc();
        if (id && d) { setComicObjects(d, comicObjects(d).filter((o) => o.id !== id), 'Delete comic object'); setWin({ comic: { ...useWin.getState().comic, selected: null } }); e.stopPropagation(); }
      }
    };
    const ku = (e: KeyboardEvent) => { if (e.code === 'Space') space.current = false; };
    window.addEventListener('keydown', kd, true);
    window.addEventListener('keyup', ku);
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (!dirty.current) return;
      dirty.current = false;
      draw();
    };
    raf = requestAnimationFrame(loop);
    const ro = new ResizeObserver(() => {
      const c = ref.current!, r = c.parentElement!.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
      c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr);
      c.style.width = r.width + 'px'; c.style.height = r.height + 'px';
      dirty.current = true;
    });
    ro.observe(ref.current!.parentElement!);
    // follow Windows display-scale changes (devicePixelRatio) without a layout resize
    let mq: MediaQueryList | null = null;
    const onDpr = () => { const p = ref.current?.parentElement; if (p) { ro.unobserve(p); ro.observe(p); } watch(); };
    const watch = () => { mq?.removeEventListener('change', onDpr); mq = matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`); mq.addEventListener('change', onDpr); };
    watch();
    // React wheel listeners are passive: without this, Ctrl+wheel over the overlay zoomed the whole UI
    const cv = ref.current!;
    const wheel = (e: WheelEvent) => e.preventDefault();
    cv.addEventListener('wheel', wheel, { passive: false });
    return () => { cancelAnimationFrame(raf); ro.disconnect(); mq?.removeEventListener('change', onDpr); cv.removeEventListener('wheel', wheel); canvasBus.removeEventListener('view', inv); window.removeEventListener('keydown', kd, true); window.removeEventListener('keyup', ku); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function draw() {
    const c = ref.current;
    if (!c) return;
    const x = c.getContext('2d')!;
    const dpr = window.devicePixelRatio || 1;
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.clearRect(0, 0, c.width, c.height);
    const d = activeDoc();
    if (!d || getApp().replay) return;
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    const m = viewMatrix(d.view, d.width, d.height);
    const S = (a: number, b: number) => mapPt(m, a, b);
    const rect = (rx: number, ry: number, rw: number, rh: number) => {
      const p = [S(rx, ry), S(rx + rw, ry), S(rx + rw, ry + rh), S(rx, ry + rh)];
      x.beginPath(); p.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b))); x.closePath();
    };
    // comic page guides: bleed (red), trim (cyan), safe area (dashed)
    if (d.comic) {
      const { bleed, safe } = d.comic;
      x.lineWidth = 1;
      x.strokeStyle = 'rgba(255,70,70,0.7)'; rect(0, 0, d.width, d.height); x.stroke();
      x.strokeStyle = 'rgba(0,200,255,0.85)'; rect(bleed, bleed, d.width - bleed * 2, d.height - bleed * 2); x.stroke();
      x.setLineDash([6, 5]); x.strokeStyle = 'rgba(0,200,255,0.5)'; rect(bleed + safe, bleed + safe, d.width - (bleed + safe) * 2, d.height - (bleed + safe) * 2); x.stroke(); x.setLineDash([]);
    }
    const st = getApp(), w = useWin.getState();
    // comic selection handles
    if (st.tool === 'comic') {
      const sel = comicObjects(d).find((o) => o.id === w.comic.selected);
      if (sel) {
        const b = objBounds(sel);
        x.strokeStyle = '#4da3ff'; x.lineWidth = 1.5; rect(b.x, b.y, b.w, b.h); x.stroke();
        x.fillStyle = '#fff';
        for (const [hx, hy] of handlePts(sel)) { const [a, bb] = S(hx, hy); x.fillRect(a - 5, bb - 5, 10, 10); x.strokeRect(a - 5, bb - 5, 10, 10); }
      }
      const dr = drag.current;
      if (dr?.k === 'comicRect') { x.setLineDash([5, 4]); x.strokeStyle = '#E8913A'; rect(Math.min(dr.x0, dr.x1), Math.min(dr.y0, dr.y1), Math.abs(dr.x1 - dr.x0), Math.abs(dr.y1 - dr.y0)); x.stroke(); x.setLineDash([]); }
      const pts = dr?.k === 'comicFree' ? dr.pts : poly.current;
      if (pts.length >= 2) {
        x.strokeStyle = '#E8913A'; x.lineWidth = 2; x.beginPath();
        for (let i = 0; i < pts.length; i += 2) { const [a, b] = S(pts[i], pts[i + 1]); if (i) x.lineTo(a, b); else x.moveTo(a, b); }
        if (hover.current && poly.current.length) { const [a, b] = S(hover.current.x, hover.current.y); x.lineTo(a, b); }
        x.stroke();
      }
    }
    const dr = drag.current;
    if (dr?.k === 'grad') {
      const [a, b] = S(dr.x0, dr.y0), [e2, f] = S(dr.x1, dr.y1);
      x.strokeStyle = '#fff'; x.lineWidth = 2; x.beginPath(); x.moveTo(a, b); x.lineTo(e2, f); x.stroke();
      x.fillStyle = '#E8913A'; x.beginPath(); x.arc(a, b, 5, 0, Math.PI * 2); x.arc(e2, f, 5, 0, Math.PI * 2); x.fill();
    }
    const h = hover.current;
    if (h && st.tool === 'liquify') {
      const r = w.liq.radius * d.view.zoom;
      x.strokeStyle = 'rgba(0,0,0,0.7)'; x.beginPath(); x.arc(h.sx, h.sy, r + 0.5, 0, Math.PI * 2); x.stroke();
      x.strokeStyle = '#fff'; x.beginPath(); x.arc(h.sx, h.sy, Math.max(1, r - 0.5), 0, Math.PI * 2); x.stroke();
    }
    if (h && maskActiveNow()) {
      const r = (currentBrush(st.tool === 'eraser').size / 2) * d.view.zoom;
      x.strokeStyle = '#ff5ad1'; x.beginPath(); x.arc(h.sx, h.sy, Math.max(1.5, r), 0, Math.PI * 2); x.stroke();
    }
    // eyedropper loupe: floats above the finger / stylus so the sampled pixels stay visible
    if (h && st.tool === 'picker') drawLoupe(x, d, h);
  }

  function maskActiveNow() {
    const d = activeDoc(), w = useWin.getState(), t = getApp().tool;
    return !!w.maskEdit && d?.activeLayerId === w.maskEdit && (t === 'brush' || t === 'eraser');
  }

  function drawLoupe(x: CanvasRenderingContext2D, d: DocEngine, h: { sx: number; sy: number; x: number; y: number; touch: boolean }) {
    const N = 11, cell = 10, R = 5;
    const img = sampleRegion(d, h.x, h.y, R, getApp().toolOpts.pickerLayer ? d.active : undefined);
    const size = N * cell;
    const W = (x.canvas.width / (window.devicePixelRatio || 1));
    const off = h.touch ? 130 : 85;
    let lx = h.sx - size / 2, ly = h.sy - off - size;
    if (ly < 8) ly = h.sy + off; // flip below when near the top edge
    lx = Math.max(8, Math.min(W - size - 8, lx));
    x.save();
    x.shadowColor = 'rgba(0,0,0,0.6)'; x.shadowBlur = 14;
    x.fillStyle = '#1c1c1f';
    x.beginPath(); x.roundRect(lx - 6, ly - 6, size + 12, size + 52, 10); x.fill();
    x.restore();
    x.save();
    x.beginPath(); x.roundRect(lx, ly, size, size, 6); x.clip();
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const k = (j * N + i) * 4, a = img.data[k + 3] / 255;
      x.fillStyle = (i + j) % 2 ? '#d0d0d0' : '#f0f0f0';
      x.fillRect(lx + i * cell, ly + j * cell, cell, cell);
      x.fillStyle = `rgba(${img.data[k]},${img.data[k + 1]},${img.data[k + 2]},${a})`;
      x.fillRect(lx + i * cell, ly + j * cell, cell, cell);
    }
    x.restore();
    x.lineWidth = 2; x.strokeStyle = '#000'; x.strokeRect(lx + R * cell, ly + R * cell, cell, cell);
    x.lineWidth = 1; x.strokeStyle = '#fff'; x.strokeRect(lx + R * cell - 1.5, ly + R * cell - 1.5, cell + 3, cell + 3);
    const k = (R * N + R) * 4;
    const hex = rgbToHex(img.data[k], img.data[k + 1], img.data[k + 2]);
    x.fillStyle = img.data[k + 3] > 8 ? hex : 'transparent';
    x.fillRect(lx, ly + size + 6, 34, 34);
    x.strokeStyle = '#fff'; x.strokeRect(lx, ly + size + 6, 34, 34);
    x.fillStyle = '#eee'; x.font = '600 12px ui-monospace, monospace';
    x.fillText(img.data[k + 3] > 8 ? hex.toUpperCase() : 'transparent', lx + 42, ly + size + 20);
    x.fillStyle = '#999'; x.font = '10px ui-monospace, monospace';
    x.fillText(`R${img.data[k]} G${img.data[k + 1]} B${img.data[k + 2]} A${img.data[k + 3]}`, lx + 42, ly + size + 35);
    // connector to the sample point
    x.strokeStyle = 'rgba(255,255,255,0.6)'; x.beginPath(); x.moveTo(h.sx, h.sy); x.lineTo(Math.max(lx, Math.min(lx + size, h.sx)), ly > h.sy ? ly - 6 : ly + size + 46); x.stroke();
    x.strokeStyle = '#fff'; x.beginPath(); x.arc(h.sx, h.sy, 4, 0, Math.PI * 2); x.stroke();
  }

  function handlePts(o: ComicObject): number[][] {
    if (o.type === 'panel') { const p: number[][] = []; for (let i = 0; i < o.pts.length; i += 2) p.push([o.pts[i], o.pts[i + 1]]); return p; }
    const h = [[o.x, o.y], [o.x + o.w, o.y], [o.x + o.w, o.y + o.h], [o.x, o.y + o.h]];
    if (o.type === 'balloon' && o.tail) h.push([o.tail.x, o.tail.y]);
    return h;
  }

  const sample = (x: number, y: number) => {
    const d = activeDoc()!;
    const im = sampleRegion(d, x, y, 0, getApp().toolOpts.pickerLayer ? d.active : undefined).data;
    if (im[3] >= 8) setColor(rgbToHex(im[0], im[1], im[2]), false);
  };

  const finishPoly = (pts: number[]) => {
    const d = activeDoc();
    if (!d || pts.length < 6) return;
    const w = useWin.getState();
    const o: ComicObject = { id: uid('pn-'), type: 'panel', pts: pts.map(Math.round), border: w.comic.border, color: '#111111', radius: 0, fill: null };
    setComicObjects(d, [...comicObjects(d), o], 'Add panel');
    setWin({ comic: { ...w.comic, selected: o.id, mode: 'select' } });
  };

  const onDown = (e: React.PointerEvent) => {
    const d = activeDoc();
    if (!d) return;
    const [sx, sy] = local(e);
    const [x, y] = toDoc(sx, sy);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    hover.current = { sx, sy, x, y, touch: e.pointerType === 'touch' };
    if (e.button === 1 || space.current) { drag.current = { k: 'pan', sx, sy, px: d.view.panX, py: d.view.panY }; return; }
    const t = getApp().tool, w = useWin.getState();
    if (t === 'picker') { drag.current = { k: 'pick', orig: getApp().fg }; sample(x, y); }
    else if (t === 'gradient') {
      const L = d.active;
      if (!L || L.type !== 'raster' || L.locked) return toast('Gradients are applied to an unlocked raster layer', 'error');
      drag.current = { k: 'grad', x0: x, y0: y, x1: x, y1: y };
    } else if (t === 'liquify') {
      if (liqEnsure(d)) drag.current = { k: 'liq', lx: x, ly: y };
    } else if (maskActiveNow()) {
      const L = d.active!;
      const eraser = t === 'eraser';
      const b0 = currentBrush(eraser);
      const brush: BrushParams = { ...b0, mode: b0.mode === 'smudge' || b0.mode === 'mix' || b0.mode === 'crisp' ? 'normal' : b0.mode };
      const seed = Math.floor(Math.random() * 2 ** 31);
      const r = new StrokeRenderer({ brush, color: '#ffffff', eraser, seed, sym: OFF, w: d.width, h: d.height });
      const s = [r2(x), r2(y), e.pointerType === 'pen' ? r2(e.pressure || 0.5) : 1, Math.round(e.tiltX || 0), Math.round(e.tiltY || 0), 0];
      r.feed(s, 1);
      drag.current = { k: 'mask', r, s, t0: e.timeStamp, brush, eraser, seed, layerId: L.id };
      d.preview = { kind: 'buffer', layerId: L.id, canvas: r.out, alpha: brush.opacity, op: eraser ? 'destination-out' : 'source-over', target: 'mask' };
    } else if (t === 'comic') {
      const mode = w.comic.mode;
      const tol = 8 / d.view.zoom;
      if (mode === 'select') {
        const objs = comicObjects(d);
        const sel = objs.find((o) => o.id === w.comic.selected);
        if (sel) {
          const hp = handlePts(sel);
          const hi = hp.findIndex(([hx, hy]) => Math.hypot(hx - x, hy - y) < tol * 1.3);
          if (hi >= 0) { drag.current = { k: 'comicMove', id: sel.id, x0: x, y0: y, orig: objs, handle: (sel.type === 'panel' ? 'v' : hi === 4 ? 't' : 'c') + hi }; return; }
        }
        const hit = hitComic(objs, x, y, tol);
        setWin({ comic: { ...w.comic, selected: hit?.id || null } });
        if (hit) drag.current = { k: 'comicMove', id: hit.id, x0: x, y0: y, orig: objs, handle: null };
      } else if (mode === 'panel-poly') {
        const p = poly.current;
        if (p.length >= 6 && (Math.hypot(p[0] - x, p[1] - y) < tol * 1.5 || e.detail >= 2)) { finishPoly(p); poly.current = []; }
        else poly.current = [...p, x, y];
      } else if (mode === 'panel-free') drag.current = { k: 'comicFree', pts: [x, y] };
      else drag.current = { k: 'comicRect', x0: x, y0: y, x1: x, y1: y };
    }
    dirty.current = true;
  };

  const onMove = (e: React.PointerEvent) => {
    const d = activeDoc();
    if (!d) return;
    const [sx, sy] = local(e);
    const [x, y] = toDoc(sx, sy);
    hover.current = { sx, sy, x, y, touch: e.pointerType === 'touch' };
    dirty.current = true;
    const dr = drag.current;
    if (!dr) return;
    switch (dr.k) {
      case 'pan': d.view = { ...d.view, panX: dr.px + sx - dr.sx, panY: dr.py + sy - dr.sy }; viewChanged(d); break;
      case 'pick': sample(x, y); break;
      case 'grad': dr.x1 = x; dr.y1 = y; if (e.shiftKey) { const a = Math.round(Math.atan2(y - dr.y0, x - dr.x0) / (Math.PI / 4)) * (Math.PI / 4), l = Math.hypot(x - dr.x0, y - dr.y0); dr.x1 = dr.x0 + Math.cos(a) * l; dr.y1 = dr.y0 + Math.sin(a) * l; } break;
      case 'liq': {
        if (!liq) break;
        const w = useWin.getState().liq;
        const dist = Math.hypot(x - dr.lx, y - dr.ly);
        const step = Math.max(1, w.radius * 0.12);
        if (dist < step && w.mode < 2) break;
        const p = w.pressure && e.pointerType === 'pen' ? Math.max(0.1, e.pressure) : 1;
        const rect = liq.session.apply(w.mode, x, y, x - dr.lx, y - dr.ly, w.radius, w.strength * p);
        liq.session.render(rect);
        dr.lx = x; dr.ly = y;
        canvasBus.dispatchEvent(new Event('view'));
        break;
      }
      case 'mask': {
        const evs = typeof e.nativeEvent.getCoalescedEvents === 'function' ? e.nativeEvent.getCoalescedEvents() : [];
        for (const ce of evs.length ? evs : [e.nativeEvent]) {
          const [cx, cy] = toDoc(...(local(ce) as [number, number]));
          dr.s.push(r2(cx), r2(cy), ce.pointerType === 'pen' ? r2(ce.pressure || 0.5) : 1, Math.round(ce.tiltX || 0), Math.round(ce.tiltY || 0), Math.max(dr.s[dr.s.length - 1], Math.round(ce.timeStamp - dr.t0)));
        }
        dr.r.feed(dr.s, Infinity);
        dr.r.sync();
        canvasBus.dispatchEvent(new Event('view'));
        break;
      }
      case 'comicMove': {
        const L = comicLayer(d, false);
        if (!L) break;
        const dx = x - dr.x0, dy = y - dr.y0;
        L.comic = dr.orig.map((o) => {
          if (o.id !== dr.id) return o;
          if (!dr.handle) {
            if (o.type === 'panel') return { ...o, pts: o.pts.map((v, i) => v + (i % 2 ? dy : dx)) };
            return { ...o, x: o.x + dx, y: o.y + dy, ...(o.type === 'balloon' && o.tail ? { tail: { x: o.tail.x + dx, y: o.tail.y + dy } } : {}) } as ComicObject;
          }
          const hi = Number(dr.handle.slice(1));
          if (dr.handle[0] === 'v' && o.type === 'panel') { const pts = o.pts.slice(); pts[hi * 2] += dx; pts[hi * 2 + 1] += dy; return { ...o, pts }; }
          if (dr.handle[0] === 't' && o.type === 'balloon' && o.tail) return { ...o, tail: { x: o.tail.x + dx, y: o.tail.y + dy } };
          if (o.type !== 'panel') {
            let { x: ox, y: oy, w: ow, h: oh } = o;
            if (hi === 0 || hi === 3) { ox += dx; ow -= dx; } else ow += dx;
            if (hi === 0 || hi === 1) { oy += dy; oh -= dy; } else oh += dy;
            return { ...o, x: ow < 0 ? ox + ow : ox, y: oh < 0 ? oy + oh : oy, w: Math.max(10, Math.abs(ow)), h: Math.max(10, Math.abs(oh)) } as ComicObject;
          }
          return o;
        });
        d.emit();
        break;
      }
      case 'comicRect': dr.x1 = x; dr.y1 = y; break;
      case 'comicFree': { const n = dr.pts.length; if (Math.hypot(dr.pts[n - 2] - x, dr.pts[n - 1] - y) * d.view.zoom > 10) dr.pts.push(x, y); break; }
    }
  };

  const onUp = () => {
    const d = activeDoc();
    const dr = drag.current;
    drag.current = null;
    dirty.current = true;
    if (!d || !dr) return;
    const w = useWin.getState();
    switch (dr.k) {
      case 'pick': {
        const c = getApp().fg;
        if (useDock.getState().pick) {
          // eyedropper started from the Color Dock: the sample goes into the dock, the foreground colour is restored
          setColor(dr.orig, false);
          finishDockPick(c);
          break;
        }
        setColor(c, true);
        if (c !== dr.orig) toast(`Picked ${c.toUpperCase()}`, 'success');
        break;
      }
      case 'grad':
        if (Math.hypot(dr.x1 - dr.x0, dr.y1 - dr.y0) * d.view.zoom < 3) break;
        d.exec({ k: 'gradient', layerId: d.activeLayerId, kind: w.grad.kind, x0: r2(dr.x0), y0: r2(dr.y0), x1: r2(dr.x1), y1: r2(dr.y1), stops: w.grad.stops });
        break;
      case 'mask':
        dr.r.feed(dr.s, Infinity);
        dr.r.finish();
        d.preview = null;
        if (dr.r.dirty) d.exec({ k: 'stroke', layerId: dr.layerId, brush: dr.brush, color: '#ffffff', eraser: dr.eraser, seed: dr.seed, s: dr.s, sym: OFF, target: 'mask' }, { canvas: dr.r.out, rect: dr.r.dirty });
        else d.emit();
        break;
      case 'comicMove': {
        const L = comicLayer(d, false);
        if (!L) break;
        const fin = L.comic || [];
        L.comic = dr.orig;
        if (fin !== dr.orig && JSON.stringify(fin) !== JSON.stringify(dr.orig)) d.exec({ k: 'comicSet', layerId: L.id, objects: fin, label: dr.handle ? 'Reshape' : 'Move' });
        else d.emit();
        break;
      }
      case 'comicRect': {
        const x = Math.min(dr.x0, dr.x1), y = Math.min(dr.y0, dr.y1), ww = Math.abs(dr.x1 - dr.x0), hh = Math.abs(dr.y1 - dr.y0);
        if (ww * d.view.zoom < 6 || hh * d.view.zoom < 6) break;
        let o: ComicObject;
        if (w.comic.mode === 'panel-rect') o = { id: uid('pn-'), type: 'panel', pts: [x, y, x + ww, y, x + ww, y + hh, x, y + hh].map(Math.round), border: w.comic.border, color: '#111111', radius: 0, fill: null };
        else if (w.comic.mode === 'balloon') o = newBalloon(w.comic.style, x, y, ww, hh);
        else o = newFx(w.comic.fx, x, y, ww, hh);
        setComicObjects(d, [...comicObjects(d), o], 'Add ' + (o.type === 'fx' ? o.kind : o.type));
        setWin({ comic: { ...w.comic, selected: o.id, mode: 'select' } });
        break;
      }
      case 'comicFree': finishPoly(dr.pts); break;
    }
  };

  return (
    <canvas
      ref={ref}
      className="absolute inset-0 z-[5] touch-none"
      style={{ pointerEvents: interactive ? 'auto' : 'none', cursor: tool === 'picker' ? 'crosshair' : tool === 'comic' && comicMode !== 'select' ? 'crosshair' : maskActive || tool === 'liquify' ? 'none' : 'default' }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={() => { const dr = drag.current; if (dr?.k === 'pick') setColor(dr.orig, false); if (dr?.k === 'mask') { const d = activeDoc(); if (d) { d.preview = null; d.emit(); } } drag.current = null; dirty.current = true; }}
      onPointerLeave={() => { if (!drag.current) { hover.current = null; dirty.current = true; } }}
      onDoubleClick={() => { if (poly.current.length >= 6) { finishPoly(poly.current); poly.current = []; } }}
      onWheel={(e) => { const d = activeDoc(); if (!d) return; const [sx, sy] = local(e); if (e.ctrlKey || e.metaKey) zoomAt(d, Math.pow(1.0018, -e.deltaY), sx, sy); else { d.view = { ...d.view, panX: d.view.panX - e.deltaX, panY: d.view.panY - e.deltaY }; viewChanged(d); } }}
    />
  );
}
