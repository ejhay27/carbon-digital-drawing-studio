// Liquify: a dense displacement field (inverse mapping) + bilinear resampling of the original pixels.
// Ops are recorded as flat 7-tuples [mode, x, y, dx, dy, radius, strength] so the result is replayable.
import { createCanvas, ctxOf } from './util';

export const LIQ_MODES = ['push', 'pull', 'expand', 'shrink', 'twirl-cw', 'twirl-ccw', 'reconstruct'] as const;
export type LiqMode = (typeof LIQ_MODES)[number];
export const OP_SIZE = 7;

export class LiquifySession {
  readonly w: number;
  readonly h: number;
  readonly fx: Float32Array;
  readonly fy: Float32Array;
  readonly src: Uint8ClampedArray;
  readonly out: HTMLCanvasElement;
  private img: ImageData;
  ops: number[] = [];

  constructor(source: HTMLCanvasElement) {
    this.w = source.width;
    this.h = source.height;
    this.fx = new Float32Array(this.w * this.h);
    this.fy = new Float32Array(this.w * this.h);
    this.src = source.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, this.w, this.h).data;
    this.out = createCanvas(this.w, this.h);
    this.img = new ImageData(new Uint8ClampedArray(this.src), this.w, this.h);
    ctxOf(this.out).putImageData(this.img, 0, 0);
  }

  /** Apply one op to the field; returns the affected rectangle. */
  apply(mode: number, x: number, y: number, dx: number, dy: number, r: number, s: number, record = true) {
    if (record) this.ops.push(mode, round2(x), round2(y), round2(dx), round2(dy), round2(r), round2(s));
    if (record) { x = round2(x); y = round2(y); dx = round2(dx); dy = round2(dy); r = round2(r); s = round2(s); }
    const { w, h, fx, fy } = this;
    const x0 = Math.max(0, Math.floor(x - r)), x1 = Math.min(w - 1, Math.ceil(x + r));
    const y0 = Math.max(0, Math.floor(y - r)), y1 = Math.min(h - 1, Math.ceil(y + r));
    const r2 = r * r;
    for (let py = y0; py <= y1; py++) {
      for (let px = x0; px <= x1; px++) {
        const ox = px - x, oy = py - y, d2 = ox * ox + oy * oy;
        if (d2 >= r2) continue;
        const t = 1 - d2 / r2;
        const f = t * t * s;
        const i = py * w + px;
        switch (mode) {
          case 0: fx[i] -= dx * f; fy[i] -= dy * f; break; // push: content follows the brush
          case 1: fx[i] += dx * f; fy[i] += dy * f; break; // pull: content drawn against the stroke
          case 2: fx[i] -= ox * f * 0.08; fy[i] -= oy * f * 0.08; break; // expand (bloat)
          case 3: fx[i] += ox * f * 0.08; fy[i] += oy * f * 0.08; break; // shrink (pucker)
          case 4: case 5: {
            const a = (mode === 4 ? -1 : 1) * 0.12 * f;
            const c = Math.cos(a), sn = Math.sin(a);
            fx[i] += ox * c - oy * sn - ox; fy[i] += ox * sn + oy * c - oy;
            break;
          }
          case 6: fx[i] *= 1 - Math.min(1, f * 0.6); fy[i] *= 1 - Math.min(1, f * 0.6); break; // reconstruct
        }
      }
    }
    return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }

  render(rect = { x: 0, y: 0, w: this.w, h: this.h }) {
    const { w, h, fx, fy, src } = this;
    const d = this.img.data;
    for (let py = rect.y; py < rect.y + rect.h; py++) {
      for (let px = rect.x; px < rect.x + rect.w; px++) {
        const i = py * w + px;
        let sx = px + fx[i], sy = py + fy[i];
        sx = sx < 0 ? 0 : sx > w - 1 ? w - 1 : sx;
        sy = sy < 0 ? 0 : sy > h - 1 ? h - 1 : sy;
        const x0 = Math.floor(sx), y0 = Math.floor(sy), x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1);
        const ax = sx - x0, ay = sy - y0;
        const i00 = (y0 * w + x0) * 4, i10 = (y0 * w + x1) * 4, i01 = (y1 * w + x0) * 4, i11 = (y1 * w + x1) * 4;
        // premultiplied bilinear sampling (no dark fringes at transparent edges)
        const w00 = (1 - ax) * (1 - ay) * src[i00 + 3], w10 = ax * (1 - ay) * src[i10 + 3], w01 = (1 - ax) * ay * src[i01 + 3], w11 = ax * ay * src[i11 + 3];
        const A = w00 + w10 + w01 + w11;
        const o = i * 4;
        if (A > 0) {
          d[o] = (src[i00] * w00 + src[i10] * w10 + src[i01] * w01 + src[i11] * w11) / A;
          d[o + 1] = (src[i00 + 1] * w00 + src[i10 + 1] * w10 + src[i01 + 1] * w01 + src[i11 + 1] * w11) / A;
          d[o + 2] = (src[i00 + 2] * w00 + src[i10 + 2] * w10 + src[i01 + 2] * w01 + src[i11 + 2] * w11) / A;
        }
        d[o + 3] = A;
      }
    }
    ctxOf(this.out).putImageData(this.img, 0, 0, rect.x, rect.y, rect.w, rect.h);
  }

  reset() {
    this.fx.fill(0);
    this.fy.fill(0);
    this.ops = [];
    this.render();
  }
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/** Deterministic reconstruction used by command application and Drawing Replay. */
export function applyLiquifyOps(source: HTMLCanvasElement, ops: number[]): HTMLCanvasElement {
  const s = new LiquifySession(source);
  for (let i = 0; i + OP_SIZE <= ops.length; i += OP_SIZE) s.apply(ops[i], ops[i + 1], ops[i + 2], ops[i + 3], ops[i + 4], ops[i + 5], ops[i + 6], false);
  s.render();
  return s.out;
}
