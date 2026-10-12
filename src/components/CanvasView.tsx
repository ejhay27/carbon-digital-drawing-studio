import { useEffect, useRef, useState } from 'react';
import type { BrushParams, InkStroke, Rect, Symmetry } from '../engine/types';
import { StrokeRenderer } from '../engine/strokeRenderer';
import { appendRecordedSample } from '../engine/recording';
import { renderDoc, samplePixel } from '../engine/render';
import { splitForTransform, type DocEngine } from '../engine/document';
import { eraseInk, hitInk, inkBounds, makeInkStroke, transformInk } from '../engine/crispInk';
import { clamp, invM, mapPt, mulM, rgbToHex, uid, viewMatrix } from '../engine/util';
import { activeDoc, currentBrush, getApp, setApp, setColor, toast, updateToolOpts, useApp, usePointer } from '../state/store';
import { canvasBus, fitView, redo, rotateView, undo, viewChanged, viewport, zoomAt } from '../state/commands';
import { onThemeChange, readThemeToken } from '../theme/themeTokens';

type Inter =
  | { k: 'stroke'; r: StrokeRenderer; s: number[]; t0: number; layerId: string; brush: BrushParams; color: string; eraser: boolean; seed: number; sym: Symmetry }
  | { k: 'ink'; s: number[]; t0: number; layerId: string; brush: BrushParams; color: string; mouse: boolean }
  | { k: 'inkErase'; path: number[]; layerId: string; orig: InkStroke[]; radius: number; whole: boolean }
  | { k: 'pan'; sx: number; sy: number; px: number; py: number }
  | { k: 'zoomDrag'; sx: number; z0: number; ax: number; ay: number; moved: boolean; alt: boolean }
  | { k: 'rotate'; a0: number; r0: number }
  | { k: 'select'; mode: 'rect' | 'ellipse' | 'lasso'; pts: number[]; x0: number; y0: number; x1: number; y1: number }
  | { k: 'shape'; tool: 'line' | 'rect' | 'ellipse'; x0: number; y0: number; x1: number; y1: number }
  | { k: 'pick' }
  | { k: 'tf'; mode: 'move' | 'scale' | 'rotate'; handle: number; sx: number; sy: number; m0: number[] }
  | { k: 'move'; x0: number; y0: number }
  | { k: 'inkMove'; x0: number; y0: number; layerId: string; orig: InkStroke[]; ids: Set<string>; dx: number; dy: number }
  | { k: 'inkPoint'; layerId: string; orig: InkStroke[]; strokeId: string; pi: number }
  | { k: 'guide'; axis: 'v' | 'h'; index: number }
  | { k: 'vp'; which: 'x1' | 'x2' }
  | { k: 'gesture' };

interface TfSession {
  layerId: string;
  isInk: boolean;
  base: HTMLCanvasElement | null;
  content: HTMLCanvasElement | null;
  bounds: Rect;
  m: number[];
  ids?: string[];
  moveOnly?: boolean;
}

// samples are rounded at capture so live rendering and replay use identical numbers
const r2 = (v: number) => Math.round(v * 100) / 100;
const OFF: Symmetry = { mode: 'off', count: 2, cx: 0.5, cy: 0.5 };
const RULER = 18;

function alphaBounds(c: HTMLCanvasElement): Rect | null {
  const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
  let minX = c.width, minY = c.height, maxX = -1, maxY = -1;
  for (let y = 0; y < c.height; y++) {
    const row = y * c.width * 4;
    for (let x = 0; x < c.width; x++) {
      if (d[row + x * 4 + 3] > 2) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  return maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

function shapeSamples(tool: 'line' | 'rect' | 'ellipse', x0: number, y0: number, x1: number, y1: number): number[] {
  const pts: [number, number][] = [];
  if (tool === 'line') {
    const n = Math.max(2, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 3));
    for (let i = 0; i <= n; i++) pts.push([x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n]);
  } else if (tool === 'rect') {
    const c: [number, number][] = [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
    for (let k = 0; k < 4; k++) {
      const [ax, ay] = c[k], [bx, by] = c[k + 1];
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 3));
      for (let i = 0; i < n; i++) pts.push([ax + ((bx - ax) * i) / n, ay + ((by - ay) * i) / n]);
    }
    pts.push([x0, y0]);
  } else {
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rx = Math.abs(x1 - x0) / 2, ry = Math.abs(y1 - y0) / 2;
    const n = Math.max(24, Math.ceil((Math.PI * (rx + ry)) / 3));
    for (let i = 0; i <= n; i++) pts.push([cx + Math.cos((i / n) * Math.PI * 2) * rx, cy + Math.sin((i / n) * Math.PI * 2) * ry]);
  }
  const s: number[] = [];
  pts.forEach(([x, y], i) => s.push(r2(x), r2(y), 1, 0, 0, i * 4));
  return s;
}

function selectionPts(it: Extract<Inter, { k: 'select' }>): number[] {
  if (it.mode === 'lasso') return it.pts;
  const { x0, y0, x1, y1 } = it;
  if (it.mode === 'rect') return [x0, y0, x1, y0, x1, y1, x0, y1].map(r2);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rx = Math.abs(x1 - x0) / 2, ry = Math.abs(y1 - y0) / 2;
  const out: number[] = [];
  for (let i = 0; i < 72; i++) out.push(r2(cx + Math.cos((i / 72) * Math.PI * 2) * rx), r2(cy + Math.sin((i / 72) * Math.PI * 2) * ry));
  return out;
}

export default function CanvasView() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const cvRef = useRef<HTMLCanvasElement>(null);
  const inter = useRef<Inter | null>(null);
  const tf = useRef<TfSession | null>(null);
  const hover = useRef<{ x: number; y: number } | null>(null);
  const dirtyRef = useRef(true);
  const spaceHeld = useRef(false);
  const touches = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ d0: number; a0: number; mx: number; my: number; view: DocEngine['view']; t0: number; maxTouches: number; moved: boolean } | null>(null);
  const lastStrokeEnd = useRef<{ x: number; y: number } | null>(null);
  const lastPtrUpdate = useRef(0);
  // pointer that owns the current interaction (palm / multi-pointer rejection)
  const activePtr = useRef<{ id: number; type: string } | null>(null);
  const penSeen = useRef(false);
  const [, force] = useState(0);
  const rerender = () => force((x) => x + 1);

  const tool = useApp((s) => s.tool);
  const tick = useApp((s) => s.tick);
  const activeId = useApp((s) => s.activeId);
  const replay = useApp((s) => s.replay);
  const textEdit = useApp((s) => s.textEdit);
  const settings = useApp((s) => s.settings);
  const brushOutline = settings.brushOutline;

  const invalidate = () => { dirtyRef.current = true; };
  useEffect(invalidate, [tick, activeId, replay, tool, settings]);

  const renderTarget = (): DocEngine | null => {
    const d = activeDoc();
    const rp = getApp().replay;
    if (d && rp && rp.docId === d.id) return rp.player.engine;
    return d;
  };
  const toDoc = (sx: number, sy: number): [number, number] => {
    const d = activeDoc();
    if (!d) return [0, 0];
    const t = renderTarget()!;
    return mapPt(invM(viewMatrix(d.view, t.width, t.height)), sx, sy);
  };
  const toScreen = (x: number, y: number): [number, number] => {
    const d = activeDoc()!;
    const t = renderTarget()!;
    return mapPt(viewMatrix(d.view, t.width, t.height), x, y);
  };

  // ---------- transform session ----------
  const beginTransform = (moveOnly: boolean): boolean => {
    const d = activeDoc();
    const L = d?.active;
    if (!d || !L) return false;
    if (L.locked) { toast('Layer is locked', 'error'); return false; }
    const useSel = getApp().toolOpts.transformSel && !!d.selection;
    if (L.type === 'ink') {
      const selIds = getApp().inkSelection;
      const strokes = (L.strokes || []).filter((s) => !selIds.length || selIds.includes(s.id));
      const b = inkBounds(strokes);
      if (!b) { toast('Nothing to transform on this layer'); return false; }
      tf.current = { layerId: L.id, isInk: true, base: null, content: null, bounds: b, m: [1, 0, 0, 1, 0, 0], ids: selIds.length ? selIds : undefined, moveOnly };
    } else {
      const { base, content } = splitForTransform(d, L, useSel);
      const b = alphaBounds(content);
      if (!b) { toast('Nothing to transform on this layer'); return false; }
      tf.current = { layerId: L.id, isInk: false, base, content, bounds: b, m: [1, 0, 0, 1, 0, 0], moveOnly };
    }
    d.preview = { kind: 'transform', layerId: L.id, base: tf.current.base, content: tf.current.content, m: tf.current.m, ids: tf.current.ids };
    if (!moveOnly) setApp({ transformActive: true });
    invalidate();
    return true;
  };
  const setTfMatrix = (m: number[]) => {
    const d = activeDoc();
    if (!d || !tf.current) return;
    tf.current.m = m;
    if (d.preview?.kind === 'transform') d.preview = { ...d.preview, m };
    invalidate();
  };
  const commitTransform = () => {
    const d = activeDoc();
    const t = tf.current;
    tf.current = null;
    if (d) d.preview = null;
    setApp({ transformActive: false });
    if (!d || !t) return;
    const m = t.m;
    const identity = Math.abs(m[0] - 1) < 1e-9 && Math.abs(m[1]) < 1e-9 && Math.abs(m[2]) < 1e-9 && Math.abs(m[3] - 1) < 1e-9 && Math.abs(m[4]) < 1e-6 && Math.abs(m[5]) < 1e-6;
    if (!identity) d.exec({ k: 'transform', layerId: t.layerId, m: m.map((v) => Math.round(v * 1e6) / 1e6), sel: !t.isInk && getApp().toolOpts.transformSel && !!d.selection, ids: t.ids });
    invalidate();
    rerender();
  };
  const cancelTransform = () => {
    const d = activeDoc();
    tf.current = null;
    if (d) d.preview = null;
    setApp({ transformActive: false });
    invalidate();
    rerender();
  };
  const tfCorners = () => {
    const t = tf.current!;
    const b = t.bounds;
    const pts: [number, number][] = [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h], [b.x + b.w / 2, b.y], [b.x + b.w, b.y + b.h / 2], [b.x + b.w / 2, b.y + b.h], [b.x, b.y + b.h / 2]];
    return pts.map(([x, y]) => mapPt(t.m, x, y));
  };
  const flipTf = (axis: 'h' | 'v') => {
    const t = tf.current;
    if (!t) return;
    const b = t.bounds;
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    setTfMatrix(mulM(t.m, axis === 'h' ? [-1, 0, 0, 1, 2 * cx, 0] : [1, 0, 0, -1, 0, 2 * cy]));
  };

  useEffect(() => {
    const c = () => commitTransform();
    const x = () => cancelTransform();
    const fh = () => flipTf('h');
    const fv = () => flipTf('v');
    canvasBus.addEventListener('view', invalidate);
    const stopThemeListening = onThemeChange(invalidate);
    canvasBus.addEventListener('commit-transform', c);
    canvasBus.addEventListener('cancel-transform', x);
    canvasBus.addEventListener('flip-tf-h', fh);
    canvasBus.addEventListener('flip-tf-v', fv);
    return () => {
      canvasBus.removeEventListener('view', invalidate);
      stopThemeListening();
      canvasBus.removeEventListener('commit-transform', c);
      canvasBus.removeEventListener('cancel-transform', x);
      canvasBus.removeEventListener('flip-tf-h', fh);
      canvasBus.removeEventListener('flip-tf-v', fv);
    };
  });

  useEffect(() => {
    if (tool === 'transform' && !tf.current && !replay) {
      if (!beginTransform(false)) setApp({ tool: 'brush' });
    } else if (tool !== 'transform' && tf.current && !tf.current.moveOnly) commitTransform();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, activeId]);

  // ---------- overlays ----------
  function drawOverlays(ctx: CanvasRenderingContext2D, d: DocEngine, t: DocEngine, m: number[], dpr: number, ants: number) {
    const s = getApp();
    const S = (x: number, y: number) => mapPt(m, x, y);
    const z = d.view.zoom;
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const line = (pts: [number, number][], close = false) => {
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      if (close) ctx.closePath();
    };
    if (s.settings.showGrid && s.settings.gridSize * z >= 6) {
      const g = s.settings.gridSize;
      ctx.strokeStyle = 'rgba(80,140,255,0.28)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = g; x < t.width; x += g) { const a = S(x, 0), b = S(x, t.height); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
      for (let y = g; y < t.height; y += g) { const a = S(0, y), b = S(t.width, y); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
      ctx.stroke();
    }
    if (s.settings.perspective) {
      const { x1, x2, y } = s.vps;
      ctx.strokeStyle = 'rgba(255,140,60,0.35)';
      ctx.lineWidth = 1;
      line([S(-t.width, y * t.height), S(t.width * 2, y * t.height)]);
      ctx.stroke();
      for (const v of [[x1 * t.width, y * t.height], [x2 * t.width, y * t.height]]) {
        ctx.beginPath();
        for (let k = 0; k < 24; k++) {
          const a = (k / 24) * Math.PI * 2;
          const p0 = S(v[0], v[1]), p1 = S(v[0] + Math.cos(a) * t.width * 3, v[1] + Math.sin(a) * t.width * 3);
          ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]);
        }
        ctx.stroke();
        const p = S(v[0], v[1]);
        ctx.fillStyle = '#ff8c3c';
        ctx.beginPath(); ctx.arc(p[0], p[1], 6, 0, Math.PI * 2); ctx.fill();
      }
    }
    const gd = s.guides[d.id];
    if (gd && s.settings.showGuides) {
      ctx.strokeStyle = 'rgba(0,220,255,0.8)';
      ctx.lineWidth = 1;
      for (const gx of gd.v) { line([S(gx, -1e5), S(gx, 1e5)]); ctx.stroke(); }
      for (const gy of gd.h) { line([S(-1e5, gy), S(1e5, gy)]); ctx.stroke(); }
    }
    const sym = s.toolOpts.sym;
    if (sym.mode !== 'off' && ['brush', 'eraser', 'symmetry'].includes(s.tool)) {
      const cx = sym.cx * t.width, cy = sym.cy * t.height;
      ctx.strokeStyle = 'rgba(180,120,255,0.75)';
      ctx.setLineDash([6, 4]);
      ctx.lineWidth = 1;
      const R = Math.max(t.width, t.height) * 1.5;
      const axes: number[] = sym.mode === 'vertical' ? [Math.PI / 2] : sym.mode === 'horizontal' ? [0] : sym.mode === 'quad' ? [0, Math.PI / 2] : Array.from({ length: sym.count }, (_, k) => (k / sym.count) * Math.PI * 2);
      for (const a of axes) {
        const both = sym.mode !== 'radial';
        line([S(cx - (both ? Math.cos(a) * R : 0), cy - (both ? Math.sin(a) * R : 0)), S(cx + Math.cos(a) * R, cy + Math.sin(a) * R)]);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      const c = S(cx, cy);
      ctx.fillStyle = 'rgba(180,120,255,0.95)';
      ctx.beginPath(); ctx.arc(c[0], c[1], 4, 0, Math.PI * 2); ctx.fill();
    }
    const drawAnts = (pts: number[]) => {
      if (pts.length < 4) return;
      const sp: [number, number][] = [];
      for (let i = 0; i < pts.length; i += 2) sp.push(S(pts[i], pts[i + 1]));
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
      ctx.strokeStyle = '#000';
      line(sp, true); ctx.stroke();
      ctx.setLineDash([4, 4]);
      ctx.lineDashOffset = -ants;
      ctx.strokeStyle = '#fff';
      line(sp, true); ctx.stroke();
      ctx.setLineDash([]);
    };
    const it = inter.current;
    if (t.selection && it?.k !== 'select') {
      const sel = t.selection;
      if (tf.current && !tf.current.isInk) {
        const p = sel.pts.slice();
        for (let i = 0; i < p.length; i += 2) { const q = mapPt(tf.current.m, p[i], p[i + 1]); p[i] = q[0]; p[i + 1] = q[1]; }
        drawAnts(p);
      } else drawAnts(sel.pts);
      if (sel.inverted) drawAnts([0, 0, t.width, 0, t.width, t.height, 0, t.height]);
    }
    if (it?.k === 'select') drawAnts(selectionPts(it));
    if (it?.k === 'shape') {
      const b = currentBrush(false);
      ctx.strokeStyle = s.fg;
      ctx.globalAlpha = 0.8;
      ctx.lineWidth = Math.max(1, b.size * z);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const smp = shapeSamples(it.tool, it.x0, it.y0, it.x1, it.y1);
      const sp: [number, number][] = [];
      for (let i = 0; i < smp.length; i += 6) sp.push(S(smp[i], smp[i + 1]));
      line(sp);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (it?.k === 'inkErase') {
      ctx.strokeStyle = 'rgba(255,80,80,0.5)';
      ctx.lineWidth = it.radius * 2 * z;
      ctx.lineCap = 'round';
      const sp: [number, number][] = [];
      for (let i = 0; i < it.path.length; i += 2) sp.push(S(it.path[i], it.path[i + 1]));
      line(sp);
      ctx.stroke();
    }
    if (tf.current && !tf.current.moveOnly) {
      const c = tfCorners().map(([x, y]) => S(x, y));
      ctx.strokeStyle = readThemeToken('selection', '#4da3ff');
      ctx.lineWidth = 1.5;
      line(c.slice(0, 4), true);
      ctx.stroke();
      const top = c[4];
      const b = tf.current.bounds;
      const ctr = S(...mapPt(tf.current.m, b.x + b.w / 2, b.y + b.h / 2));
      const dx = top[0] - ctr[0], dy = top[1] - ctr[1], dl = Math.hypot(dx, dy) || 1;
      const rot: [number, number] = [top[0] + (dx / dl) * 28, top[1] + (dy / dl) * 28];
      line([top, rot]);
      ctx.stroke();
      ctx.fillStyle = readThemeToken('selectionText', '#fff');
      for (const [x, y] of c) { ctx.fillRect(x - 5, y - 5, 10, 10); ctx.strokeRect(x - 5, y - 5, 10, 10); }
      ctx.beginPath(); ctx.arc(rot[0], rot[1], 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    if (s.tool === 'inkedit' && d.active?.type === 'ink') {
      const sel = new Set(s.inkSelection);
      for (const st of d.active.strokes || []) {
        if (!sel.has(st.id)) continue;
        ctx.strokeStyle = readThemeToken('selection', '#4da3ff');
        ctx.lineWidth = 1;
        const sp: [number, number][] = [];
        for (let i = 0; i < st.pts.length; i += 3) sp.push(S(st.pts[i], st.pts[i + 1]));
        line(sp);
        ctx.stroke();
        ctx.fillStyle = readThemeToken('selectionText', '#fff');
        for (const [x, y] of sp) { ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
      }
    }
    const h = hover.current;
    if (h && brushOutline && !s.replay && ['brush', 'eraser'].includes(s.tool) && !spaceHeld.current) {
      const b = currentBrush(s.tool === 'eraser');
      const r = Math.max(1.5, (b.size / 2) * z);
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.beginPath(); ctx.arc(h.x, h.y, r + 0.5, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath(); ctx.arc(h.x, h.y, Math.max(0.5, r - 0.5), 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fillRect(h.x - 0.5, h.y - 0.5, 1.5, 1.5);
    }
    if (s.settings.showRulers) {
      ctx.fillStyle = 'rgba(28,28,31,0.94)';
      ctx.fillRect(0, 0, viewport.w, RULER);
      ctx.fillRect(0, 0, RULER, viewport.h);
      ctx.fillStyle = '#8a8a90';
      ctx.strokeStyle = '#55555b';
      ctx.font = '9px ui-monospace, monospace';
      const step = [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500].find((v) => v * z >= 50) || 5000;
      const [ox, oy] = S(0, 0);
      ctx.beginPath();
      for (let v = Math.floor(-ox / z / step) * step; v * z + ox < viewport.w; v += step) {
        const x = v * z + ox;
        ctx.moveTo(x, RULER - 8); ctx.lineTo(x, RULER);
        ctx.fillText(String(v), x + 2, 9);
      }
      for (let v = Math.floor(-oy / z / step) * step; v * z + oy < viewport.h; v += step) {
        const y = v * z + oy;
        ctx.moveTo(RULER - 8, y); ctx.lineTo(RULER, y);
        ctx.save(); ctx.translate(9, y + 2); ctx.rotate(-Math.PI / 2); ctx.fillText(String(v), 0, 0); ctx.restore();
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  // ---------- render loop ----------
  useEffect(() => {
    const cv = cvRef.current!;
    const ctx = cv.getContext('2d')!;
    let raf = 0;
    const checkerC = document.createElement('canvas');
    checkerC.width = checkerC.height = 24;
    const cc = checkerC.getContext('2d')!;
    cc.fillStyle = '#d6d6d6'; cc.fillRect(0, 0, 24, 24);
    cc.fillStyle = '#f2f2f2'; cc.fillRect(0, 0, 12, 12); cc.fillRect(12, 12, 12, 12);
    const checker = ctx.createPattern(checkerC, 'repeat');
    let ants = 0, lastAnts = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const d0 = activeDoc();
      const t = renderTarget();
      if ((t?.selection || inter.current?.k === 'select') && now - lastAnts > 120) { ants = (ants + 1) % 8; lastAnts = now; dirtyRef.current = true; }
      if (!dirtyRef.current) return;
      dirtyRef.current = false;
      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#141416';
      ctx.fillRect(0, 0, cv.width, cv.height);
      if (!d0 || !t) return;
      if (!d0.viewInit) fitView(d0);
      const it = inter.current;
      if (it?.k === 'stroke') it.r.sync();
      const m = viewMatrix(d0.view, t.width, t.height);
      const M = m.map((v) => v * dpr);
      ctx.save();
      ctx.setTransform(M[0], M[1], M[2], M[3], M[4], M[5]);
      ctx.shadowColor = 'rgba(0,0,0,0.55)';
      ctx.shadowBlur = 30 * dpr;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, t.width, t.height);
      ctx.restore();
      renderDoc(ctx, t, M, cv.width, cv.height, { bg: true, checker, smoothing: 'auto' });
      drawOverlays(ctx, d0, t, m, dpr, ants);
    };
    raf = requestAnimationFrame(loop);
    const ro = new ResizeObserver(() => {
      const r = wrapRef.current!.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const d = activeDoc();
      if (d && d.viewInit) d.view = { ...d.view, panX: d.view.panX + (r.width - viewport.w) / 2, panY: d.view.panY + (r.height - viewport.h) / 2 };
      viewport.w = r.width;
      viewport.h = r.height;
      cv.width = Math.max(1, Math.round(r.width * dpr));
      cv.height = Math.max(1, Math.round(r.height * dpr));
      cv.style.width = r.width + 'px';
      cv.style.height = r.height + 'px';
      dirtyRef.current = true;
    });
    ro.observe(wrapRef.current!);
    // Windows display-scale changes (or moving between monitors) change devicePixelRatio without resizing the
    // element; re-observing forces the backing store to be re-created at the new resolution.
    let mq: MediaQueryList | null = null;
    const onDpr = () => { const el = wrapRef.current; if (el) { ro.unobserve(el); ro.observe(el); } watchDpr(); };
    const watchDpr = () => { mq?.removeEventListener('change', onDpr); mq = matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`); mq.addEventListener('change', onDpr); };
    watchDpr();
    return () => { cancelAnimationFrame(raf); ro.disconnect(); mq?.removeEventListener('change', onDpr); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- input ----------
  const pressureOf = (e: PointerEvent) => {
    if (e.pointerType === 'pen') return e.pressure > 0 ? e.pressure : 0.5;
    if (e.pointerType === 'touch') return 0.75;
    return getApp().settings.mousePressure ? 0.5 : 1;
  };
  const sampleFrom = (e: PointerEvent, t0: number, rect: DOMRect): number[] => {
    const [x, y] = toDoc(e.clientX - rect.left, e.clientY - rect.top);
    return [r2(x), r2(y), r2(pressureOf(e)), Math.round(e.tiltX || 0), Math.round(e.tiltY || 0), Math.max(0, Math.round(e.timeStamp - t0))];
  };
  const captureTerminalSample = (it: Extract<Inter, { k: 'stroke' | 'ink' }>, e: PointerEvent) => {
    const cv = cvRef.current;
    if (!cv) return;
    const sample = sampleFrom(e, it.t0, cv.getBoundingClientRect());
    appendRecordedSample(it.s, sample, e.pointerType === 'pen' && e.pressure === 0);
  };

  const commitStroke = () => {
    const it = inter.current;
    const d = activeDoc();
    if (!d || !it) return;
    if (it.k === 'stroke') {
      it.r.feed(it.s, Infinity);
      it.r.finish();
      d.preview = null;
      if (it.r.dirty) {
        d.exec({ k: 'stroke', layerId: it.layerId, brush: it.brush, color: it.color, eraser: it.eraser, seed: it.seed, s: it.s, sym: it.sym }, { canvas: it.r.out, rect: it.r.dirty });
        lastStrokeEnd.current = { x: it.s[it.s.length - 6], y: it.s[it.s.length - 5] };
      }
    } else if (it.k === 'ink') {
      d.preview = null;
      if (it.s.length >= 6) {
        d.exec({ k: 'inkAdd', layerId: it.layerId, stroke: makeInkStroke(it.s, it.brush, it.color, it.mouse) });
        lastStrokeEnd.current = { x: it.s[it.s.length - 6], y: it.s[it.s.length - 5] };
      }
    }
    invalidate();
  };

  const finishInterruptedStroke = (terminal?: PointerEvent) => {
    const it = inter.current;
    if (!it || (it.k !== 'stroke' && it.k !== 'ink')) return false;
    if (terminal) captureTerminalSample(it, terminal);
    inter.current = it;
    commitStroke();
    inter.current = null;
    return true;
  };

  const abortInteraction = () => {
    const d = activeDoc();
    const it = inter.current;
    if (d && it) {
      if (it.k === 'stroke' || it.k === 'ink') d.preview = null;
      if ((it.k === 'inkErase' || it.k === 'inkMove' || it.k === 'inkPoint') && d.layer(it.layerId)) d.layer(it.layerId)!.strokes = it.orig;
      if (it.k === 'move' && tf.current?.moveOnly) { tf.current = null; d.preview = null; }
    }
    inter.current = null;
    invalidate();
  };

  const startStroke = (e: PointerEvent, rect: DOMRect, eraser: boolean) => {
    const d = activeDoc()!;
    let L = d.active;
    if (!L) return;
    if (L.locked) return toast('Layer is locked', 'error');
    if (!L.visible) return toast('Layer is hidden: show it to draw', 'error');
    const s = getApp();
    const brush = currentBrush(eraser);
    const t0 = e.timeStamp;
    const first = sampleFrom(e, t0, rect);
    const mouse = e.pointerType === 'mouse' && !s.settings.mousePressure;
    if (L.type === 'ink') {
      if (eraser) {
        inter.current = { k: 'inkErase', path: [first[0], first[1]], layerId: L.id, orig: L.strokes || [], radius: brush.size / 2, whole: s.toolOpts.inkErase === 'whole' };
        return;
      }
      inter.current = { k: 'ink', s: first, t0, layerId: L.id, brush, color: s.fg, mouse };
      d.preview = { kind: 'ink', layerId: L.id, stroke: makeInkStroke(first, brush, s.fg, mouse) };
      return;
    }
    if (brush.mode === 'crisp' && !eraser) {
      const i = d.layers.findIndex((l) => l.id === L!.id);
      if (!d.exec({ k: 'layerAdd', id: uid('L'), name: `Crisp Ink ${d.layers.filter((l) => l.type === 'ink').length + 1}`, type: 'ink', index: i + 1 })) return toast('Layer limit reached', 'error');
      toast('Crisp Ink draws editable paths, so a Crisp Ink layer was created');
      L = d.active!;
      inter.current = { k: 'ink', s: first, t0, layerId: L.id, brush, color: s.fg, mouse };
      return;
    }
    const seed = Math.floor(Math.random() * 2 ** 31);
    const sym = s.toolOpts.sym.mode === 'off' ? OFF : s.toolOpts.sym;
    if (e.shiftKey && s.toolOpts.lineAssist && lastStrokeEnd.current) {
      const a = lastStrokeEnd.current;
      const r = new StrokeRenderer({ brush, color: s.fg, eraser, seed, sym, w: d.width, h: d.height, layer: L.canvas });
      inter.current = { k: 'stroke', r, s: shapeSamples('line', a.x, a.y, first[0], first[1]), t0, layerId: L.id, brush, color: s.fg, eraser, seed, sym };
      commitStroke();
      inter.current = null;
      return;
    }
    const r = new StrokeRenderer({ brush, color: s.fg, eraser, seed, sym, w: d.width, h: d.height, layer: L.canvas });
    inter.current = { k: 'stroke', r, s: first, t0, layerId: L.id, brush, color: s.fg, eraser, seed, sym };
    r.feed(first, 1);
    d.preview = r.direct
      ? { kind: 'replace', layerId: L.id, canvas: r.out }
      : { kind: 'buffer', layerId: L.id, canvas: r.out, alpha: brush.opacity, op: eraser ? 'destination-out' : L.alphaLock ? 'source-atop' : brush.composite };
  };

  const pick = (x: number, y: number) => {
    const d = activeDoc();
    if (!d) return;
    const px = samplePixel(d, x, y, getApp().toolOpts.pickerLayer ? d.active : undefined);
    if (px[3] >= 8) setColor(rgbToHex(px[0], px[1], px[2]), false);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = activeDoc();
    if (!d) return;
    const cv = cvRef.current!;
    const rect = cv.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    const s = getApp();
    if (e.pointerType === 'pen') penSeen.current = true;
    // a stylus stroke owns the canvas: ignore palms / fingers / other pointers until it ends
    if (activePtr.current && activePtr.current.id !== e.pointerId && activePtr.current.type === 'pen' && inter.current) return;
    if (e.pointerType === 'touch') {
      touches.current.set(e.pointerId, { x: sx, y: sy });
      if (touches.current.size >= 2) {
        if (!finishInterruptedStroke()) abortInteraction();
        const [a, b] = [...touches.current.values()];
        gesture.current = {
          d0: Math.hypot(b.x - a.x, b.y - a.y) || 1, a0: Math.atan2(b.y - a.y, b.x - a.x), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2,
          view: { ...d.view }, t0: gesture.current?.t0 ?? performance.now(), maxTouches: Math.max(touches.current.size, gesture.current?.maxTouches || 0), moved: gesture.current?.moved || false,
        };
        inter.current = { k: 'gesture' };
        return;
      }
    }
    cv.setPointerCapture(e.pointerId);
    activePtr.current = { id: e.pointerId, type: e.pointerType };
    const [x, y] = toDoc(sx, sy);
    const touchPans = e.pointerType === 'touch' && (s.settings.stylusOnly || (s.settings.palmAuto && penSeen.current));
    if (e.button === 1 || spaceHeld.current || s.tool === 'hand' || touchPans || !!s.replay) {
      inter.current = { k: 'pan', sx, sy, px: d.view.panX, py: d.view.panY };
      return;
    }
    if (e.button === 2) return;
    if (s.settings.showRulers && (sx < RULER || sy < RULER)) {
      const g = s.guides[d.id] || { v: [], h: [] };
      const vert = sx < RULER;
      const ng = vert ? { ...g, v: [...g.v, Math.round(x)] } : { ...g, h: [...g.h, Math.round(y)] };
      setApp({ guides: { ...s.guides, [d.id]: ng }, settings: { ...s.settings, showGuides: true } });
      inter.current = { k: 'guide', axis: vert ? 'v' : 'h', index: (vert ? ng.v : ng.h).length - 1 };
      return;
    }
    const gd = s.guides[d.id];
    if (gd && s.settings.showGuides && ['move', 'hand', 'select'].includes(s.tool)) {
      const tol = 5 / d.view.zoom;
      const vi = gd.v.findIndex((g) => Math.abs(g - x) < tol);
      const hi = gd.h.findIndex((g) => Math.abs(g - y) < tol);
      if (vi >= 0 || hi >= 0) { inter.current = { k: 'guide', axis: vi >= 0 ? 'v' : 'h', index: vi >= 0 ? vi : hi }; return; }
    }
    if (s.settings.perspective) {
      for (const w of ['x1', 'x2'] as const) {
        const [px, py] = toScreen(s.vps[w] * d.width, s.vps.y * d.height);
        if (Math.hypot(px - sx, py - sy) < 10) { inter.current = { k: 'vp', which: w }; return; }
      }
    }
    if (e.altKey && (s.tool === 'brush' || s.tool === 'fill')) { inter.current = { k: 'pick' }; pick(x, y); return; }
    switch (s.tool) {
      case 'brush':
      case 'eraser':
        startStroke(e.nativeEvent, rect, s.tool === 'eraser');
        break;
      case 'picker':
        inter.current = { k: 'pick' };
        pick(x, y);
        break;
      case 'fill': {
        const L = d.active;
        if (!L || L.type !== 'raster') { toast('Fill works on raster layers', 'error'); break; }
        if (L.locked) { toast('Layer is locked', 'error'); break; }
        if (x < 0 || y < 0 || x >= d.width || y >= d.height) break;
        d.exec({ k: 'fill', layerId: L.id, x: Math.floor(x), y: Math.floor(y), color: s.fg, tol: s.toolOpts.fillTol, all: s.toolOpts.fillAll, expand: s.toolOpts.fillExpand });
        break;
      }
      case 'select':
        inter.current = { k: 'select', mode: s.toolOpts.selMode, pts: [r2(x), r2(y)], x0: x, y0: y, x1: x, y1: y };
        break;
      case 'transform': {
        if (!tf.current && !beginTransform(false)) break;
        const t = tf.current!;
        const c = tfCorners().map(([a, b]) => toScreen(a, b));
        const top = c[4];
        const ctr = toScreen(...mapPt(t.m, t.bounds.x + t.bounds.w / 2, t.bounds.y + t.bounds.h / 2));
        const dx = top[0] - ctr[0], dy = top[1] - ctr[1], dl = Math.hypot(dx, dy) || 1;
        if (Math.hypot(top[0] + (dx / dl) * 28 - sx, top[1] + (dy / dl) * 28 - sy) < 12) { inter.current = { k: 'tf', mode: 'rotate', handle: -1, sx: x, sy: y, m0: t.m }; break; }
        const hi = c.findIndex(([a, b]) => Math.hypot(a - sx, b - sy) < 10);
        inter.current = hi >= 0 ? { k: 'tf', mode: 'scale', handle: hi, sx: x, sy: y, m0: t.m } : { k: 'tf', mode: 'move', handle: -1, sx: x, sy: y, m0: t.m };
        break;
      }
      case 'move':
        if (beginTransform(true)) inter.current = { k: 'move', x0: x, y0: y };
        break;
      case 'line':
      case 'rect':
      case 'ellipse':
        if (!d.active || d.active.locked) { toast('Layer is locked', 'error'); break; }
        inter.current = { k: 'shape', tool: s.tool, x0: x, y0: y, x1: x, y1: y };
        break;
      case 'text':
        if (d.active?.type !== 'raster') { toast('Text is placed on raster layers. Select or add one.', 'error'); break; }
        setApp({ textEdit: { x, y } });
        break;
      case 'zoom':
        inter.current = { k: 'zoomDrag', sx, z0: d.view.zoom, ax: sx, ay: sy, moved: false, alt: e.altKey };
        break;
      case 'rotate':
        inter.current = { k: 'rotate', a0: Math.atan2(sy - viewport.h / 2, sx - viewport.w / 2), r0: d.view.rot };
        break;
      case 'symmetry': {
        const sym = s.toolOpts.sym;
        updateToolOpts({ sym: { ...sym, mode: sym.mode === 'off' ? 'vertical' : sym.mode, cx: clamp(x / d.width, 0, 1), cy: clamp(y / d.height, 0, 1) } });
        break;
      }
      case 'inkedit': {
        const L = d.active;
        if (!L || L.type !== 'ink') { toast('Select a Crisp Ink layer to edit paths', 'error'); break; }
        if (L.locked) { toast('Layer is locked', 'error'); break; }
        const tol = 6 / d.view.zoom;
        const sel = s.inkSelection;
        for (const st of L.strokes || []) {
          if (!sel.includes(st.id)) continue;
          for (let i = 0; i < st.pts.length; i += 3) {
            if (Math.hypot(st.pts[i] - x, st.pts[i + 1] - y) < tol) {
              inter.current = { k: 'inkPoint', layerId: L.id, orig: L.strokes || [], strokeId: st.id, pi: i };
              return;
            }
          }
        }
        const hit = hitInk(L.strokes || [], x, y, tol);
        if (!hit) { setApp({ inkSelection: [] }); break; }
        const ids = e.shiftKey ? (sel.includes(hit.id) ? sel.filter((i) => i !== hit.id) : [...sel, hit.id]) : sel.includes(hit.id) ? sel : [hit.id];
        setApp({ inkSelection: ids });
        inter.current = { k: 'inkMove', x0: x, y0: y, layerId: L.id, orig: L.strokes || [], ids: new Set(ids), dx: 0, dy: 0 };
        break;
      }
    }
    invalidate();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = activeDoc();
    if (!d) return;
    const rect = cvRef.current!.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    if (inter.current && inter.current.k !== 'gesture' && activePtr.current && e.pointerId !== activePtr.current.id) return;
    if (e.pointerType !== 'touch') hover.current = { x: sx, y: sy };
    const [x, y] = toDoc(sx, sy);
    const now = performance.now();
    if (now - lastPtrUpdate.current > 80) {
      lastPtrUpdate.current = now;
      usePointer.setState({ p: { x: Math.floor(x), y: Math.floor(y) } });
    }
    if (e.pointerType === 'touch' && touches.current.has(e.pointerId)) {
      touches.current.set(e.pointerId, { x: sx, y: sy });
      const g = gesture.current;
      if (g && touches.current.size >= 2) {
        const [a, b] = [...touches.current.values()];
        const dd = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const ang = Math.atan2(b.y - a.y, b.x - a.x);
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        const k = dd / g.d0;
        if (Math.abs(k - 1) > 0.04 || Math.hypot(mx - g.mx, my - g.my) > 8) g.moved = true;
        const v = g.view;
        const z = clamp(v.zoom * k, 0.02, 64);
        const da = ((ang - g.a0) * 180) / Math.PI;
        const rotOn = Math.abs(da) > 6;
        const rad = rotOn ? (da * Math.PI) / 180 : 0;
        const px = v.panX - g.mx, py = v.panY - g.my;
        const kk = z / v.zoom;
        const nx = (px * Math.cos(rad) - py * Math.sin(rad)) * kk, ny = (px * Math.sin(rad) + py * Math.cos(rad)) * kk;
        d.view = { ...v, zoom: z, rot: rotOn ? v.rot + da : v.rot, panX: mx + nx, panY: my + ny };
        viewChanged(d);
        return;
      }
    }
    const it = inter.current;
    if (!it) { if (['brush', 'eraser'].includes(getApp().tool)) invalidate(); return; }
    const ne = e.nativeEvent;
    switch (it.k) {
      case 'stroke':
      case 'ink': {
        const evs = typeof ne.getCoalescedEvents === 'function' ? ne.getCoalescedEvents() : [];
        for (const ce of evs.length ? evs : [ne]) {
          appendRecordedSample(it.s, sampleFrom(ce, it.t0, rect));
        }
        if (it.k === 'stroke') it.r.feed(it.s, Infinity);
        else d.preview = { kind: 'ink', layerId: it.layerId, stroke: makeInkStroke(it.s, it.brush, it.color, it.mouse) };
        break;
      }
      case 'inkErase': {
        it.path.push(r2(x), r2(y));
        const L = d.layer(it.layerId);
        if (L) {
          const res = eraseInk(L.strokes || [], it.path.slice(-4), it.radius, it.whole);
          if (res) L.strokes = res;
        }
        break;
      }
      case 'pan':
        d.view = { ...d.view, panX: it.px + sx - it.sx, panY: it.py + sy - it.sy };
        viewChanged(d);
        break;
      case 'zoomDrag':
        if (Math.abs(sx - it.sx) > 3) it.moved = true;
        if (it.moved) zoomAt(d, clamp(it.z0 * Math.pow(1.01, sx - it.sx), 0.02, 64) / d.view.zoom, it.ax, it.ay);
        break;
      case 'rotate': {
        let r = it.r0 + ((Math.atan2(sy - viewport.h / 2, sx - viewport.w / 2) - it.a0) * 180) / Math.PI;
        if (e.shiftKey) r = Math.round(r / 15) * 15;
        rotateView(d, r, true);
        break;
      }
      case 'select':
        it.x1 = x; it.y1 = y;
        if (e.shiftKey && it.mode !== 'lasso') {
          const sz = Math.max(Math.abs(x - it.x0), Math.abs(y - it.y0));
          it.x1 = it.x0 + Math.sign(x - it.x0 || 1) * sz;
          it.y1 = it.y0 + Math.sign(y - it.y0 || 1) * sz;
        }
        if (it.mode === 'lasso') {
          const n = it.pts.length;
          if (Math.hypot(it.pts[n - 2] - x, it.pts[n - 1] - y) * d.view.zoom > 2) it.pts.push(r2(x), r2(y));
        }
        break;
      case 'shape':
        it.x1 = x; it.y1 = y;
        if (e.shiftKey) {
          if (it.tool === 'line') {
            const a = Math.round(Math.atan2(y - it.y0, x - it.x0) / (Math.PI / 4)) * (Math.PI / 4);
            const l = Math.hypot(x - it.x0, y - it.y0);
            it.x1 = it.x0 + Math.cos(a) * l; it.y1 = it.y0 + Math.sin(a) * l;
          } else {
            const sz = Math.max(Math.abs(x - it.x0), Math.abs(y - it.y0));
            it.x1 = it.x0 + Math.sign(x - it.x0 || 1) * sz;
            it.y1 = it.y0 + Math.sign(y - it.y0 || 1) * sz;
          }
        }
        break;
      case 'pick':
        pick(x, y);
        break;
      case 'tf': {
        const t = tf.current;
        if (!t) break;
        const b = t.bounds;
        if (it.mode === 'move') setTfMatrix(mulM([1, 0, 0, 1, x - it.sx, y - it.sy], it.m0));
        else if (it.mode === 'rotate') {
          const [cx, cy] = mapPt(it.m0, b.x + b.w / 2, b.y + b.h / 2);
          let a = Math.atan2(y - cy, x - cx) - Math.atan2(it.sy - cy, it.sx - cx);
          if (e.shiftKey) a = Math.round(a / (Math.PI / 12)) * (Math.PI / 12);
          const c = Math.cos(a), s = Math.sin(a);
          setTfMatrix(mulM([c, s, -s, c, cx - c * cx + s * cy, cy - s * cx - c * cy], it.m0));
        } else {
          const inv = invM(it.m0);
          const [lx, ly] = mapPt(inv, x, y);
          const [slx, sly] = mapPt(inv, it.sx, it.sy);
          const P = [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h], [b.x + b.w / 2, b.y], [b.x + b.w, b.y + b.h / 2], [b.x + b.w / 2, b.y + b.h], [b.x, b.y + b.h / 2]];
          const [ax, ay] = P[[2, 3, 0, 1, 6, 7, 4, 5][it.handle]];
          let fx = slx - ax !== 0 ? (lx - ax) / (slx - ax) : 1;
          let fy = sly - ay !== 0 ? (ly - ay) / (sly - ay) : 1;
          if (it.handle >= 4) { if (it.handle % 2 === 0) fx = 1; else fy = 1; }
          else if (!e.shiftKey) { const u = (Math.abs(fx) + Math.abs(fy)) / 2; fx = Math.sign(fx || 1) * u; fy = Math.sign(fy || 1) * u; }
          if (Math.abs(fx) < 0.01) fx = 0.01 * Math.sign(fx || 1);
          if (Math.abs(fy) < 0.01) fy = 0.01 * Math.sign(fy || 1);
          setTfMatrix(mulM(it.m0, [fx, 0, 0, fy, ax - fx * ax, ay - fy * ay]));
        }
        break;
      }
      case 'move':
        setTfMatrix([1, 0, 0, 1, Math.round(x - it.x0), Math.round(y - it.y0)]);
        break;
      case 'inkMove': {
        const L = d.layer(it.layerId);
        if (!L) break;
        it.dx = x - it.x0; it.dy = y - it.y0;
        const m = [1, 0, 0, 1, it.dx, it.dy];
        L.strokes = it.orig.map((st) => (it.ids.has(st.id) ? transformInk(st, m) : st));
        break;
      }
      case 'inkPoint': {
        const L = d.layer(it.layerId);
        if (!L) break;
        L.strokes = it.orig.map((st) => {
          if (st.id !== it.strokeId) return st;
          const pts = st.pts.slice();
          pts[it.pi] = r2(x); pts[it.pi + 1] = r2(y);
          return { ...st, pts };
        });
        break;
      }
      case 'guide': {
        const s = getApp();
        const g = s.guides[d.id];
        if (!g) break;
        const arr = (it.axis === 'v' ? g.v : g.h).slice();
        arr[it.index] = Math.round(it.axis === 'v' ? x : y);
        setApp({ guides: { ...s.guides, [d.id]: it.axis === 'v' ? { ...g, v: arr } : { ...g, h: arr } } });
        break;
      }
      case 'vp':
        setApp({ vps: { ...getApp().vps, [it.which]: x / d.width, y: clamp(y / d.height, -1, 2) } });
        break;
    }
    invalidate();
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = activeDoc();
    if (activePtr.current && e.pointerId !== activePtr.current.id && !touches.current.has(e.pointerId)) return;
    if (activePtr.current?.id === e.pointerId) activePtr.current = null;
    if (e.pointerType === 'touch') {
      touches.current.delete(e.pointerId);
      const g = gesture.current;
      if (g) {
        if (touches.current.size === 0) {
          const s = getApp();
          if (!g.moved && performance.now() - g.t0 < 320) {
            if (g.maxTouches >= 3 && s.settings.threeFingerTap === 'redo') redo();
            else if (g.maxTouches === 2 && s.settings.twoFingerTap === 'undo') undo();
          }
          gesture.current = null;
          inter.current = null;
        }
        return;
      }
    }
    const it = inter.current;
    if (!d || !it) return;
    if (it.k === 'stroke' || it.k === 'ink') captureTerminalSample(it, e.nativeEvent);
    inter.current = null;
    switch (it.k) {
      case 'stroke':
      case 'ink':
        inter.current = it;
        commitStroke();
        inter.current = null;
        break;
      case 'inkErase': {
        const L = d.layer(it.layerId);
        if (L) {
          const final = L.strokes || [];
          L.strokes = it.orig;
          if (final !== it.orig) d.exec({ k: 'inkSet', layerId: L.id, strokes: final, label: 'Erase Crisp Ink' });
        }
        break;
      }
      case 'pick':
        setColor(getApp().fg, true);
        break;
      case 'select': {
        const pts = selectionPts(it);
        const tiny = it.mode === 'lasso' ? pts.length < 6 : Math.abs(it.x1 - it.x0) * d.view.zoom < 3 || Math.abs(it.y1 - it.y0) * d.view.zoom < 3;
        if (tiny) { if (d.selection) d.exec({ k: 'select', sel: null }); }
        else d.exec({ k: 'select', sel: { pts, inverted: false } });
        break;
      }
      case 'shape': {
        const L = d.active;
        if (!L || Math.hypot(it.x1 - it.x0, it.y1 - it.y0) * d.view.zoom < 3) break;
        const s = getApp();
        const smp = shapeSamples(it.tool, it.x0, it.y0, it.x1, it.y1);
        if (L.type === 'ink') {
          const b = currentBrush(false);
          const keep: number[] = [];
          if (it.tool === 'line') keep.push(smp[0], smp[1], 1, smp[smp.length - 6], smp[smp.length - 5], 1);
          else for (let i = 0; i < smp.length; i += 6) keep.push(smp[i], smp[i + 1], 1);
          d.exec({ k: 'inkAdd', layerId: L.id, stroke: { id: uid('ink-'), pts: keep, color: s.fg, size: b.size, opacity: b.opacity, taperStart: 0, taperEnd: 0 } });
        } else {
          if (s.toolOpts.shapeFill && it.tool !== 'line') {
            const pp: number[] = [];
            for (let i = 0; i < smp.length; i += 6) pp.push(smp[i], smp[i + 1]);
            d.exec({ k: 'poly', layerId: L.id, pts: pp, color: s.fg, opacity: 1 });
          }
          const brush: BrushParams = { ...currentBrush(false), smoothing: 0, taperStart: 0 };
          if (brush.mode === 'crisp') brush.mode = 'normal';
          const seed = Math.floor(Math.random() * 2 ** 31);
          const r = new StrokeRenderer({ brush, color: s.fg, eraser: false, seed, sym: OFF, w: d.width, h: d.height, layer: L.canvas });
          inter.current = { k: 'stroke', r, s: smp, t0: 0, layerId: L.id, brush, color: s.fg, eraser: false, seed, sym: OFF };
          commitStroke();
          inter.current = null;
        }
        break;
      }
      case 'zoomDrag':
        if (!it.moved) zoomAt(d, it.alt || e.altKey ? 0.5 : 2, it.ax, it.ay);
        break;
      case 'move': {
        const t = tf.current;
        tf.current = null;
        d.preview = null;
        if (t && (t.m[4] || t.m[5])) d.exec({ k: 'transform', layerId: t.layerId, m: t.m, sel: !t.isInk && getApp().toolOpts.transformSel && !!d.selection, ids: t.ids });
        break;
      }
      case 'inkMove': {
        const L = d.layer(it.layerId);
        if (!L) break;
        L.strokes = it.orig;
        if (Math.hypot(it.dx, it.dy) > 0.01) d.exec({ k: 'transform', layerId: L.id, m: [1, 0, 0, 1, r2(it.dx), r2(it.dy)], sel: false, ids: [...it.ids] });
        break;
      }
      case 'inkPoint': {
        const L = d.layer(it.layerId);
        if (!L) break;
        const final = L.strokes || [];
        L.strokes = it.orig;
        if (final !== it.orig) d.exec({ k: 'inkSet', layerId: L.id, strokes: final, label: 'Edit control point' });
        break;
      }
      case 'guide': {
        const s = getApp();
        const g = s.guides[d.id];
        const r = cvRef.current!.getBoundingClientRect();
        const sx = e.clientX - r.left, sy = e.clientY - r.top;
        if (g && s.settings.showRulers && ((it.axis === 'v' && sx < RULER) || (it.axis === 'h' && sy < RULER))) {
          const arr = (it.axis === 'v' ? g.v : g.h).filter((_, i) => i !== it.index);
          setApp({ guides: { ...s.guides, [d.id]: it.axis === 'v' ? { ...g, v: arr } : { ...g, h: arr } } });
        }
        break;
      }
    }
    invalidate();
  };

  const onWheel = (e: React.WheelEvent) => {
    const d = activeDoc();
    if (!d) return;
    const rect = cvRef.current!.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    if (e.ctrlKey || e.metaKey) zoomAt(d, Math.pow(1.0018, -e.deltaY * (e.deltaMode ? 30 : 1)), sx, sy);
    else if (e.altKey) rotateView(d, e.deltaY > 0 ? 5 : -5);
    else {
      const dx = e.shiftKey ? e.deltaY : e.deltaX, dy = e.shiftKey ? 0 : e.deltaY;
      d.view = { ...d.view, panX: d.view.panX - dx, panY: d.view.panY - dy };
      viewChanged(d);
    }
  };

  useEffect(() => {
    const el = wrapRef.current!;
    const h = (e: WheelEvent) => e.preventDefault();
    el.addEventListener('wheel', h, { passive: false });
    return () => el.removeEventListener('wheel', h);
  }, []);

  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.code === 'Space' && !spaceHeld.current) { spaceHeld.current = true; rerender(); e.preventDefault(); }
      if (e.key === 'Enter' && tf.current) { commitTransform(); setApp({ tool: 'brush' }); }
      if (e.key === 'Escape') {
        if (tf.current) { cancelTransform(); setApp({ tool: 'brush' }); }
        else if (inter.current) abortInteraction();
        else if (getApp().inkSelection.length) setApp({ inkSelection: [] });
      }
    };
    const ku = (e: KeyboardEvent) => { if (e.code === 'Space') { spaceHeld.current = false; rerender(); } };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    return () => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); };
  });

  const cursor = (() => {
    if (spaceHeld.current || tool === 'hand' || replay) return 'grab';
    if ((tool === 'brush' || tool === 'eraser') && brushOutline) return 'none';
    return ({ picker: 'crosshair', fill: 'cell', select: 'crosshair', transform: 'move', move: 'move', line: 'crosshair', rect: 'crosshair', ellipse: 'crosshair', text: 'text', zoom: 'zoom-in', rotate: 'alias', symmetry: 'crosshair', inkedit: 'default' } as Record<string, string>)[tool] || 'crosshair';
  })();

  const d = activeDoc();
  const textPos = textEdit && d ? toScreen(textEdit.x, textEdit.y) : null;

  return (
    <div ref={wrapRef} className="absolute inset-0 overflow-hidden" onContextMenu={(e) => e.preventDefault()}>
      <canvas
        ref={cvRef}
        className="block touch-none select-none"
        style={{ cursor }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={(e) => {
          if (activePtr.current && activePtr.current.id !== e.pointerId && !touches.current.has(e.pointerId)) return;
          touches.current.delete(e.pointerId);
          if (!touches.current.size) gesture.current = null;
          activePtr.current = null;
          if (!finishInterruptedStroke(e.nativeEvent)) abortInteraction();
        }}
        onPointerLeave={() => { hover.current = null; invalidate(); }}
        onWheel={onWheel}
      />
      {tf.current && !tf.current.moveOnly && <TransformBar />}
      {textPos && d && <TextEditor x={textPos[0]} y={textPos[1]} zoom={d.view.zoom} />}
      {replay && replay.docId === activeId && (
        <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full border border-amber-400/40 bg-amber-500/15 px-3 py-1 text-[11px] font-medium text-amber-200 backdrop-blur">
          Replay view: your artwork is not modified. Drag to pan.
        </div>
      )}
    </div>
  );
}

function TransformBar() {
  const fire = (n: string) => canvasBus.dispatchEvent(new Event(n));
  return (
    <div className="absolute left-1/2 top-3 z-10 flex -translate-x-1/2 items-center gap-1 rounded-lg border border-white/10 bg-neutral-900/95 p-1 text-xs text-neutral-200 shadow-xl">
      <span className="px-2 text-neutral-400">Transform</span>
      <button className="rounded px-2 py-1 hover:bg-white/10" onClick={() => fire('flip-tf-h')}>Flip H</button>
      <button className="rounded px-2 py-1 hover:bg-white/10" onClick={() => fire('flip-tf-v')}>Flip V</button>
      <button className="rounded px-2 py-1 hover:bg-white/10" onClick={() => { fire('cancel-transform'); setApp({ tool: 'brush' }); }}>Cancel</button>
      <button className="rounded bg-[#E8913A] px-3 py-1 font-medium text-neutral-950 hover:bg-[#f0a457]" onClick={() => { fire('commit-transform'); setApp({ tool: 'brush' }); }}>Apply</button>
    </div>
  );
}

function TextEditor({ x, y, zoom }: { x: number; y: number; zoom: number }) {
  const [text, setText] = useState('');
  const opts = useApp((s) => s.toolOpts);
  const fg = useApp((s) => s.fg);
  const te = useApp((s) => s.textEdit)!;
  const commit = () => {
    const d = activeDoc();
    if (d && text.trim()) d.exec({ k: 'text', layerId: d.activeLayerId, x: Math.round(te.x), y: Math.round(te.y), text, font: opts.textFont, size: opts.textSize, color: fg, bold: opts.textBold, italic: opts.textItalic });
    setApp({ textEdit: null });
  };
  return (
    <div className="absolute z-20" style={{ left: x, top: y }}>
      <textarea
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape') setApp({ textEdit: null });
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) commit();
        }}
        placeholder="Type text…"
        className="min-w-[160px] resize border border-dashed border-sky-400 bg-transparent p-0 outline-none"
        style={{ font: `${opts.textItalic ? 'italic ' : ''}${opts.textBold ? 'bold ' : ''}${opts.textSize * zoom}px ${opts.textFont}`, color: fg, lineHeight: 1.25 }}
        rows={Math.max(1, text.split('\n').length)}
      />
      <div className="mt-1 flex gap-1 text-[11px]">
        <button className="rounded bg-[#E8913A] px-2 py-0.5 text-neutral-950" onClick={commit}>Place (Ctrl+Enter)</button>
        <button className="rounded bg-neutral-800 px-2 py-0.5 text-neutral-200" onClick={() => setApp({ textEdit: null })}>Cancel</button>
      </div>
    </div>
  );
}
