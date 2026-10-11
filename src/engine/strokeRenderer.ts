import type { BrushParams, Rect, Symmetry } from './types';
import { getGrain, getMask, getTintedTip } from './tips';
import { clamp, clipRect, cloneCanvas, createCanvas, ctxOf, hexToHsv, hexToRgb, hsvToHex, lerp, mulberry32, rgbToHex, unionRect } from './util';

export const SAMPLE_STRIDE = 6; // x, y, pressure, tiltX, tiltY, t(ms)

export function symTransforms(sym: Symmetry, w: number, h: number): number[][] {
  const I = [1, 0, 0, 1, 0, 0];
  const cx = sym.cx * w, cy = sym.cy * h;
  switch (sym.mode) {
    case 'vertical': return [I, [-1, 0, 0, 1, 2 * cx, 0]];
    case 'horizontal': return [I, [1, 0, 0, -1, 0, 2 * cy]];
    case 'quad': return [I, [-1, 0, 0, 1, 2 * cx, 0], [1, 0, 0, -1, 0, 2 * cy], [-1, 0, 0, -1, 2 * cx, 2 * cy]];
    case 'radial': {
      const n = clamp(Math.round(sym.count), 2, 24);
      const out: number[][] = [];
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
        out.push([c, s, -s, c, cx - c * cx + s * cy, cy - s * cx - c * cy]);
      }
      return out;
    }
    default: return [I];
  }
}

export interface RenderOpts {
  brush: BrushParams;
  color: string;
  eraser: boolean;
  seed: number;
  sym: Symmetry;
  w: number;
  h: number;
  layer?: HTMLCanvasElement; // required for direct (smudge / mix) modes
}

const hasFilter = typeof CanvasRenderingContext2D !== 'undefined' && 'filter' in CanvasRenderingContext2D.prototype;

/**
 * Deterministic stroke renderer. The same sample list, brush, colour and seed always
 * produce the same pixels — whether fed incrementally (live drawing, replay) or at once.
 */
export class StrokeRenderer {
  readonly b: BrushParams;
  readonly direct: boolean;
  readonly out: HTMLCanvasElement;
  private raw: HTMLCanvasElement | null = null;
  private octx: CanvasRenderingContext2D;
  private rctx: CanvasRenderingContext2D | null = null;
  private rng: () => number;
  private T: number[][];
  private color: string;
  private w: number;
  private h: number;
  n = 0;
  private started = false;
  private sx = 0; private sy = 0; private sp = 0;
  private lx = 0; private ly = 0; private lp = 0;
  private tx = 0; private ty = 0;
  private rawX = 0; private rawY = 0; private rawP = 0;
  private nextDab = 0;
  private dist = 0;
  private lastT = 0;
  private speed = 0;
  private dir = 0;
  private lastSize = 1;
  private dabIndex = 0;
  private pending: Rect | null = null;
  dirty: Rect | null = null;
  private carry: HTMLCanvasElement | null = null;
  private tmp: HTMLCanvasElement | null = null;
  private mix: [number, number, number];
  private base: [number, number, number];
  private grainPat: CanvasPattern | null = null;
  finished = false;

  constructor(o: RenderOpts) {
    this.b = o.brush;
    this.color = o.color;
    this.w = o.w;
    this.h = o.h;
    this.rng = mulberry32(o.seed);
    this.T = symTransforms(o.sym, o.w, o.h);
    this.direct = (o.brush.mode === 'smudge' || o.brush.mode === 'mix') && !o.eraser && !!o.layer;
    if (this.direct) {
      this.out = cloneCanvas(o.layer!, o.brush.mode === 'mix');
    } else {
      this.raw = createCanvas(o.w, o.h);
      this.rctx = ctxOf(this.raw);
      this.out = createCanvas(o.w, o.h);
    }
    this.octx = ctxOf(this.out);
    this.base = hexToRgb(o.color);
    this.mix = [...this.base];
    if (this.b.grain > 0) {
      this.grainPat = this.octx.createPattern(getGrain(this.b.grainType), 'repeat');
      const s = this.b.grainScale || 1;
      this.grainPat?.setTransform(new DOMMatrix().scale(s, s));
    }
  }

  feed(s: number[], upto: number) {
    const max = Math.min(upto, Math.floor(s.length / SAMPLE_STRIDE));
    for (; this.n < max; this.n++) {
      const i = this.n * SAMPLE_STRIDE;
      this.input(s[i], s[i + 1], s[i + 2], s[i + 3], s[i + 4], s[i + 5]);
    }
  }

  private input(x: number, y: number, p: number, tx: number, ty: number, t: number) {
    this.rawX = x; this.rawY = y; this.rawP = p;
    this.tx = tx; this.ty = ty;
    if (!this.started) {
      this.started = true;
      this.sx = this.lx = x; this.sy = this.ly = y; this.sp = this.lp = p;
      this.lastT = t;
      this.dab(x, y, p);
      this.nextDab = Math.max(0.4, this.lastSize * this.b.spacing);
      return;
    }
    const k = 1 - this.b.smoothing * 0.9;
    this.sx += (x - this.sx) * k;
    this.sy += (y - this.sy) * k;
    this.sp += (p - this.sp) * Math.min(1, k * 1.5);
    const dt = Math.max(1, t - this.lastT);
    this.lastT = t;
    const d = Math.hypot(this.sx - this.lx, this.sy - this.ly);
    this.speed = this.speed * 0.7 + (d / dt) * 0.3;
    this.segment(this.sx, this.sy, this.sp);
  }

  private segment(x1: number, y1: number, p1: number) {
    const x0 = this.lx, y0 = this.ly, p0 = this.lp;
    const d = Math.hypot(x1 - x0, y1 - y0);
    if (d < 0.0001) return;
    this.dir = Math.atan2(y1 - y0, x1 - x0);
    let travelled = 0;
    let guard = 0;
    while (guard++ < 100000) {
      if (travelled + this.nextDab > d) {
        this.nextDab -= d - travelled;
        break;
      }
      travelled += this.nextDab;
      this.dist += this.nextDab;
      const f = travelled / d;
      this.dab(lerp(x0, x1, f), lerp(y0, y1, f), lerp(p0, p1, f));
      this.nextDab = Math.max(0.4, this.lastSize * this.b.spacing);
    }
    this.lx = x1; this.ly = y1; this.lp = p1;
  }

  private sizeAt(p: number) {
    const b = this.b;
    let f = 1;
    if (b.pressureSize > 0) f *= lerp(1, lerp(b.minSize, 1, p), b.pressureSize);
    if (b.speedSize) f *= clamp(1 - b.speedSize * clamp(this.speed / 2.5, 0, 1) * 0.7, 0.15, 1.6);
    if (b.taperStart > 0) {
      const L = b.taperStart * b.size * 6;
      if (this.dist < L) f *= 0.15 + 0.85 * Math.sqrt(this.dist / L);
    }
    const tilt = Math.hypot(this.tx, this.ty);
    if (b.tiltSize > 0 && tilt > 0) f *= 1 + b.tiltSize * Math.min(1, tilt / 60) * 0.8;
    return Math.max(0.3, b.size * f);
  }

  private dab(x: number, y: number, p: number) {
    const b = this.b, r = this.rng;
    const size = this.sizeAt(p);
    this.lastSize = size;
    const alpha = b.flow * (b.pressureOpacity ? lerp(1 - b.pressureOpacity, 1, p) : 1);
    const tilt = Math.hypot(this.tx, this.ty);
    const count = Math.max(1, Math.round(b.count));
    const jitterCol = b.hueJitter > 0 || b.satJitter > 0 || b.valJitter > 0;
    for (let c = 0; c < count; c++) {
      const r1 = r(), r2 = r(), r3 = r(), r4 = r(), r5 = r(), r6 = r(), r7 = r(), r8 = r();
      const s = size * (1 - b.sizeJitter * r1 * 0.8);
      const a = (b.angle * Math.PI) / 180 + (b.followDirection ? this.dir : 0) +
        (b.tiltAngle && tilt > 0 ? Math.atan2(this.ty, this.tx) : 0) + (r2 - 0.5) * Math.PI * 2 * b.angleJitter;
      const sr = b.scatter * size * Math.sqrt(r3), sa = r4 * Math.PI * 2;
      const px = x + Math.cos(sa) * sr, py = y + Math.sin(sa) * sr;
      const al = alpha * (1 - b.opacityJitter * r5);
      let col = this.color;
      if (jitterCol) {
        const [h, sat, v] = hexToHsv(this.color);
        col = hsvToHex(
          Math.round((h + (r6 - 0.5) * 2 * b.hueJitter * 360) / 2) * 2,
          clamp(Math.round((sat + (r7 - 0.5) * 2 * b.satJitter) * 50) / 50, 0, 1),
          clamp(Math.round((v + (r8 - 0.5) * 2 * b.valJitter) * 50) / 50, 0, 1),
        );
      }
      if (this.direct && b.mode === 'smudge') this.smudgeDab(px, py, s, al);
      else if (this.direct && b.mode === 'mix') this.mixDab(px, py, s, a, al);
      else this.stamp(this.rctx!, getTintedTip(b.tip, b.hardness, col, b.stamp), px, py, s, a, al);
      this.dabIndex++;
    }
    // Brush Fusion overlay: a secondary stamp pass (speckles, foliage, grain flecks…) layered on each dab.
    // Only runs for brushes that define layer2, so classic brushes and their replays are unaffected.
    const L2 = b.layer2;
    if (L2 && !this.direct && L2.count > 0 && L2.flow > 0) {
      const tip2 = getTintedTip(L2.tip, 0.85, this.color);
      const n = Math.max(1, Math.round(L2.count));
      for (let k = 0; k < n; k++) {
        const q1 = r(), q2 = r(), q3 = r(), q4 = r();
        const s2 = Math.max(0.3, size * L2.sizeK * (0.5 + q1 * 0.5));
        const rad = size * L2.scatter * Math.sqrt(q2), ang = q3 * Math.PI * 2;
        this.stamp(this.rctx!, tip2, x + Math.cos(ang) * rad, y + Math.sin(ang) * rad, s2, (q4 - 0.5) * Math.PI * 2 * L2.angleJitter, alpha * L2.flow);
      }
    }
  }

  private stamp(ctx: CanvasRenderingContext2D, tip: HTMLCanvasElement, x: number, y: number, s: number, a: number, alpha: number) {
    const rd = this.b.roundness;
    ctx.globalAlpha = clamp(alpha, 0, 1);
    for (const T of this.T) {
      ctx.setTransform(T[0], T[1], T[2], T[3], T[4], T[5]);
      ctx.translate(x, y);
      if (a) ctx.rotate(a);
      if (rd < 1) ctx.scale(1, Math.max(0.05, rd));
      ctx.drawImage(tip, -s / 2, -s / 2, s, s);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    this.mark(x, y, s);
  }

  private mark(x: number, y: number, s: number) {
    const pad = s * 0.75 + 2;
    for (const T of this.T) {
      const mx = T[0] * x + T[2] * y + T[4], my = T[1] * x + T[3] * y + T[5];
      const r = { x: mx - pad, y: my - pad, w: pad * 2, h: pad * 2 };
      this.pending = unionRect(this.pending, r);
      this.dirty = unionRect(this.dirty, r);
    }
  }

  private mixDab(x: number, y: number, s: number, a: number, alpha: number) {
    const b = this.b;
    if (this.dabIndex % 2 === 0) {
      const ix = Math.round(x), iy = Math.round(y);
      if (ix >= 0 && iy >= 0 && ix < this.w && iy < this.h) {
        const d = this.octx.getImageData(ix, iy, 1, 1).data;
        if (d[3] > 8) {
          const k = b.pickup * (d[3] / 255);
          for (let i = 0; i < 3; i++) this.mix[i] = this.mix[i] * (1 - k) + d[i] * k;
        }
      }
    }
    for (let i = 0; i < 3; i++) this.mix[i] += (this.base[i] - this.mix[i]) * (1 - b.wetness) * 0.2;
    const q = (v: number) => Math.round(v / 3) * 3;
    const col = rgbToHex(q(this.mix[0]), q(this.mix[1]), q(this.mix[2]));
    let tip = getTintedTip(b.tip, b.hardness, col, b.stamp);
    if (b.grain > 0 && this.grainPat) tip = this.grainedTip(tip, x, y, s);
    this.stamp(this.octx, tip, x, y, s, a, alpha);
  }

  /** Apply document-anchored paper grain to a single dab (direct modes). */
  private grainedTip(tip: HTMLCanvasElement, x: number, y: number, s: number) {
    const S = tip.width;
    if (!this.tmp || this.tmp.width !== S) this.tmp = createCanvas(S, S);
    const t = ctxOf(this.tmp);
    t.globalCompositeOperation = 'copy';
    t.globalAlpha = 1;
    t.drawImage(tip, 0, 0);
    t.globalCompositeOperation = 'destination-out';
    t.globalAlpha = this.b.grain;
    const k = S / s;
    const pat = t.createPattern(getGrain(this.b.grainType), 'repeat');
    if (pat) {
      const gs = this.b.grainScale || 1;
      pat.setTransform(new DOMMatrix().scale(k, k).translate(-(x - s / 2), -(y - s / 2)).scale(gs, gs));
      t.fillStyle = pat;
      t.fillRect(0, 0, S, S);
    }
    t.globalCompositeOperation = 'source-over';
    t.globalAlpha = 1;
    return this.tmp;
  }

  private smudgeDab(x: number, y: number, s: number, alpha: number) {
    const b = this.b;
    const C = Math.max(4, Math.ceil(b.size));
    if (!this.carry) {
      this.carry = createCanvas(C, C);
      this.tmp = createCanvas(C, C);
      ctxOf(this.carry).drawImage(this.out, x - s / 2, y - s / 2, s, s, 0, 0, C, C);
      this.mark(x, y, s);
      return;
    }
    const { mask } = getMask(b.tip, b.hardness, b.stamp);
    const t = ctxOf(this.tmp!);
    t.globalCompositeOperation = 'copy';
    t.drawImage(this.carry, 0, 0);
    t.globalCompositeOperation = 'destination-in';
    t.drawImage(mask, 0, 0, C, C);
    const k = clamp(b.pickup * alpha * 1.4, 0, 1);
    const o = this.octx;
    // out = out * (1 - mask*k) + carry*mask*k  (premultiplied lerp)
    o.globalAlpha = k;
    o.globalCompositeOperation = 'destination-out';
    o.drawImage(mask, x - s / 2, y - s / 2, s, s);
    o.globalCompositeOperation = 'lighter';
    o.drawImage(this.tmp!, x - s / 2, y - s / 2, s, s);
    o.globalCompositeOperation = 'source-over';
    o.globalAlpha = 1;
    // carry = carry * wet + under * (1 - wet)
    const cc = ctxOf(this.carry);
    const w = clamp(b.wetness, 0, 0.98);
    cc.globalCompositeOperation = 'destination-out';
    cc.globalAlpha = 1 - w;
    cc.fillRect(0, 0, C, C);
    cc.globalCompositeOperation = 'lighter';
    cc.drawImage(this.out, x - s / 2, y - s / 2, s, s, 0, 0, C, C);
    cc.globalCompositeOperation = 'source-over';
    cc.globalAlpha = 1;
    this.mark(x, y, s);
  }

  /** Bring the processed output in sync with the raw dab buffer. */
  sync(): Rect | null {
    const p = this.pending;
    this.pending = null;
    if (!p || this.direct) return p;
    const r = clipRect(p, this.w, this.h);
    if (!r) return null;
    const o = this.octx;
    o.clearRect(r.x, r.y, r.w, r.h);
    o.drawImage(this.raw!, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);
    if (this.grainPat && this.b.grain > 0) {
      o.globalCompositeOperation = 'destination-out';
      o.globalAlpha = this.b.grain;
      o.fillStyle = this.grainPat;
      o.fillRect(r.x, r.y, r.w, r.h);
      o.globalCompositeOperation = 'source-over';
      o.globalAlpha = 1;
    }
    return r;
  }

  finish() {
    if (this.finished) return;
    if (this.started) {
      // catch the stabiliser up to the final input point
      this.segment(this.rawX, this.rawY, this.rawP);
    }
    this.sync();
    if (this.b.mode === 'wash' && !this.direct) this.postWash();
    this.finished = true;
  }

  private postWash() {
    const b = this.b;
    const r = this.dirty && clipRect(this.dirty, this.w, this.h);
    if (!r) return;
    const o = this.octx;
    const rng = this.rng;
    if (b.bloom > 0) {
      const n = Math.min(40, Math.round(b.bloom * 4 + (r.w * r.h) / (b.size * b.size * 6) * b.bloom));
      o.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < n; i++) {
        const x = r.x + rng() * r.w, y = r.y + rng() * r.h, rad = b.size * (0.25 + rng() * 0.5);
        const g = o.createRadialGradient(x, y, 0, x, y, rad);
        g.addColorStop(0, `rgba(0,0,0,${0.45 * b.bloom})`);
        g.addColorStop(0.7, `rgba(0,0,0,${0.25 * b.bloom})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        o.fillStyle = g;
        o.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
    }
    if (b.granulation > 0) {
      const pat = o.createPattern(getGrain('paper'), 'repeat');
      const pat2 = o.createPattern(getGrain('rough'), 'repeat');
      o.globalCompositeOperation = 'destination-out';
      if (pat) { o.globalAlpha = b.granulation * 0.9; o.fillStyle = pat; o.fillRect(r.x, r.y, r.w, r.h); }
      if (pat2) { pat2.setTransform(new DOMMatrix().scale(0.5, 0.5)); o.globalAlpha = b.granulation * 0.5; o.fillStyle = pat2; o.fillRect(r.x, r.y, r.w, r.h); }
    }
    o.globalAlpha = 1;
    o.globalCompositeOperation = 'source-over';
    if (b.wetEdges > 0 && hasFilter) {
      const blur = clamp(b.size * 0.1, 2, 12);
      const pad = Math.ceil(blur * 2);
      const rr = clipRect({ x: r.x - pad, y: r.y - pad, w: r.w + pad * 2, h: r.h + pad * 2 }, this.w, this.h)!;
      const e = createCanvas(rr.w, rr.h);
      const ec = ctxOf(e);
      ec.drawImage(this.out, rr.x, rr.y, rr.w, rr.h, 0, 0, rr.w, rr.h);
      ec.globalCompositeOperation = 'destination-out';
      ec.filter = `blur(${blur}px)`;
      ec.drawImage(this.out, rr.x, rr.y, rr.w, rr.h, 0, 0, rr.w, rr.h);
      ec.filter = 'none';
      o.globalAlpha = clamp(b.wetEdges * 1.2, 0, 1);
      o.drawImage(e, rr.x, rr.y);
      o.globalAlpha = 1;
    }
  }
}

/** Render a full stroke at once (used by replay / reconstruction when no live buffer exists). */
export function renderStroke(o: RenderOpts, samples: number[]) {
  const r = new StrokeRenderer(o);
  r.feed(samples, Infinity);
  r.finish();
  return r;
}

/** Build a synthetic S-curve sample list for previews and tests. */
export function sampleCurve(w: number, h: number, n = 60, pad = 0.12) {
  const s: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const x = w * pad + t * w * (1 - pad * 2);
    const y = h / 2 + Math.sin(t * Math.PI * 2) * h * 0.26;
    const p = Math.sin(t * Math.PI) * 0.85 + 0.15;
    s.push(x, y, p, 0, 0, i * 12);
  }
  return s;
}

const previewCache = new Map<string, string>();
export function brushPreview(b: BrushParams, w = 200, h = 56, color = '#e8e6e1'): string {
  const key = b.id + ':' + b.size + ':' + b.opacity + ':' + b.flow + ':' + b.tip + ':' + b.mode + ':' + b.hardness + ':' + b.spacing + ':' + color;
  const hit = previewCache.get(key);
  if (hit) return hit;
  const pb: BrushParams = { ...b, size: Math.min(b.size, h * (b.scatter > 1 ? 0.15 : 0.5)), smoothing: 0 };
  if (b.mode === 'crisp') pb.mode = 'normal';
  let layer: HTMLCanvasElement | undefined;
  if (pb.mode === 'smudge' || pb.mode === 'mix') {
    layer = createCanvas(w, h);
    const c = ctxOf(layer);
    const g = c.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, '#c2410c'); g.addColorStop(0.5, '#1d4ed8'); g.addColorStop(1, '#15803d');
    c.fillStyle = g;
    c.fillRect(0, h * 0.25, w, h * 0.5);
  }
  const r = renderStroke({ brush: pb, color, eraser: false, seed: 7, sym: { mode: 'off', count: 2, cx: 0.5, cy: 0.5 }, w, h, layer }, sampleCurve(w, h));
  const c = createCanvas(w, h);
  const ctx = ctxOf(c);
  if (r.direct) ctx.drawImage(r.out, 0, 0);
  else {
    ctx.globalAlpha = pb.opacity;
    ctx.globalCompositeOperation = pb.composite === 'multiply' ? 'source-over' : pb.composite;
    ctx.drawImage(r.out, 0, 0);
  }
  const url = c.toDataURL();
  previewCache.set(key, url);
  return url;
}
