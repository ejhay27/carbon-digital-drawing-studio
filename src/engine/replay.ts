import type { RecEvent } from './types';
import { cloneEngineState, DocEngine, eventDuration, restoreDeep, restoreEngineState } from './document';
import { SAMPLE_STRIDE, StrokeRenderer } from './strokeRenderer';
import { ensureStamp } from './tips';

interface Checkpoint {
  idx: number;
  time: number;
  state: ReturnType<typeof cloneEngineState>;
}

/**
 * Reconstructs a document from its recorded event log inside an isolated engine.
 * The source document is never touched.
 */
export class ReplayPlayer {
  readonly events: RecEvent[];
  readonly engine: DocEngine;
  readonly starts: number[] = [];
  readonly ends: number[] = [];
  readonly duration: number;
  idx = 0;
  time = 0;
  private active: { i: number; r: StrokeRenderer } | null = null;
  private cps: Checkpoint[] = [];
  private cpEvery: number;
  markers: { t: number; label: string }[] = [];

  constructor(src: DocEngine) {
    this.events = src.rec.events.slice();
    const first = this.events.find((e) => e.cp)?.cp;
    this.engine = new DocEngine(first?.w || src.width, first?.h || src.height, { blank: true, name: src.name + ' (replay)' });
    this.engine.isReplay = true;
    this.engine.undoLimit = src.undoLimit;
    this.engine.undoBytes = src.undoBytes;
    this.engine.assets = src.assets;
    this.engine.assetImgs = src.assetImgs;
    let end = 0;
    for (const e of this.events) {
      this.starts.push(e.t);
      end = e.t + eventDuration(e);
      this.ends.push(end);
      if (e.c && ['image', 'fill', 'layerAdd', 'layerDel', 'transform', 'resize', 'scale', 'flip', 'rotate', 'mergeDown', 'filter'].includes(e.c.k))
        this.markers.push({ t: e.t, label: e.c.k });
      else if (e.cp && e.t > 0) this.markers.push({ t: e.t, label: 'checkpoint' });
      else if (e.u) this.markers.push({ t: e.t, label: e.u });
    }
    this.duration = Math.max(0, ...this.ends);
    this.cpEvery = Math.max(12, Math.ceil(this.events.length / 40));
  }

  async prepare() {
    const stamps = new Set<string>();
    for (const e of this.events) if (e.c?.k === 'stroke' && e.c.brush.stamp) stamps.add(e.c.brush.stamp);
    await Promise.all([...stamps].map(ensureStamp));
    this.reset();
  }

  get strokeCount() {
    return this.events.filter((e) => e.c?.k === 'stroke' || e.c?.k === 'inkAdd').length;
  }

  reset() {
    this.idx = 0;
    this.time = 0;
    this.active = null;
    this.engine.preview = null;
    this.engine.layers = [];
    this.engine.undoStack = [];
    this.engine.redoStack = [];
    this.advanceTo(0);
  }

  private apply(e: RecEvent) {
    const g = this.engine;
    if (e.cp) {
      restoreDeep(g, e.cp);
      g.undoStack = [];
      g.redoStack = [];
    } else if (e.u === 'undo') g.undo();
    else if (e.u === 'redo') g.redo();
    else if (e.c) {
      if (e.c.k !== 'stroke') {
        try { g.exec(e.c); } catch (err) { console.warn('[replay] skipped event', e.c.k, err); }
      }
    }
  }

  advanceTo(T: number) {
    const g = this.engine;
    while (this.idx < this.events.length) {
      const i = this.idx;
      const e = this.events[i];
      if (e.t > T) break;
      if (e.c?.k === 'stroke') {
        const c = e.c;
        const L = g.layer(c.layerId);
        if (!L || !L.canvas) { this.idx++; continue; }
        if (!this.active || this.active.i !== i) {
          this.active = { i, r: new StrokeRenderer({ brush: c.brush, color: c.color, eraser: c.eraser, seed: c.seed, sym: c.sym, w: g.width, h: g.height, layer: L.canvas }) };
        }
        const r = this.active.r;
        if (this.ends[i] <= T) {
          r.feed(c.s, Infinity);
          r.finish();
          g.preview = null;
          g.exec(c, { canvas: r.out, rect: r.dirty });
          this.active = null;
          this.idx++;
          this.maybeCheckpoint();
          continue;
        }
        const rel = T - e.t;
        let n = r.n;
        const total = Math.floor(c.s.length / SAMPLE_STRIDE);
        while (n < total && c.s[n * SAMPLE_STRIDE + 5] <= rel) n++;
        r.feed(c.s, n);
        r.sync();
        g.preview = r.direct
          ? { kind: 'replace', layerId: L.id, canvas: r.out }
          : { kind: 'buffer', layerId: L.id, canvas: r.out, alpha: c.brush.opacity, op: c.eraser ? 'destination-out' : L.alphaLock ? 'source-atop' : c.brush.composite };
        break;
      }
      this.apply(e);
      this.idx++;
      this.maybeCheckpoint();
    }
    this.time = Math.min(T, this.duration);
    g.emit();
  }

  private maybeCheckpoint() {
    if (this.idx % this.cpEvery !== 0) return;
    if (this.cps.find((c) => c.idx === this.idx)) return;
    this.cps.push({ idx: this.idx, time: this.ends[this.idx - 1] ?? 0, state: cloneEngineState(this.engine) });
  }

  seek(T: number) {
    T = Math.max(0, Math.min(T, this.duration));
    if (T < this.time || (this.active && T < this.starts[this.active.i])) {
      const cp = [...this.cps].reverse().find((c) => c.time <= T);
      this.active = null;
      this.engine.preview = null;
      if (cp) {
        restoreEngineState(this.engine, cp.state);
        this.idx = cp.idx;
        this.time = cp.time;
      } else {
        this.idx = 0;
        this.time = 0;
        this.engine.layers = [];
        this.engine.undoStack = [];
        this.engine.redoStack = [];
      }
    }
    this.advanceTo(T);
  }

  /** Jump to the next / previous event boundary. */
  stepEvent(dir: 1 | -1) {
    if (dir > 0) {
      const next = this.starts.find((s, i) => s > this.time || (s === this.time && i >= this.idx && this.ends[i] > this.time));
      this.seek(next !== undefined ? Math.max(next, this.ends[this.starts.indexOf(next)]) : this.duration);
    } else {
      let prev = 0;
      for (let i = 0; i < this.ends.length; i++) if (this.ends[i] < this.time - 1) prev = this.ends[i];
      this.seek(prev);
    }
  }

  get done() {
    return this.idx >= this.events.length;
  }
}
