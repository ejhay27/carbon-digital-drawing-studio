// CARBON filter kernels: pure functions on RGBA pixel buffers.
// Used by the live preview (worker / proxy), the committed command and Drawing Replay.
import { mulberry32 } from './util';

export interface Px { data: Uint8ClampedArray; w: number; h: number }
export interface FxParam { key: string; label: string; min: number; max: number; step: number; def: number; px?: boolean; unit?: string }
export interface FxDef { id: string; name: string; group: 'Blur' | 'Detail' | 'Adjust' | 'Artistic'; params: FxParam[]; run: (src: Px, p: Record<string, number>, seed: number) => Px }

const clamp8 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);
const blank = (w: number, h: number): Px => ({ data: new Uint8ClampedArray(w * h * 4), w, h });

// premultiplied float buffers avoid dark halos around transparent pixels when blurring
function premul(s: Px) {
  const f = new Float32Array(s.data.length);
  for (let i = 0; i < f.length; i += 4) {
    const a = s.data[i + 3] / 255;
    f[i] = s.data[i] * a; f[i + 1] = s.data[i + 1] * a; f[i + 2] = s.data[i + 2] * a; f[i + 3] = s.data[i + 3];
  }
  return f;
}
function unpremul(f: Float32Array, w: number, h: number): Px {
  const o = blank(w, h);
  for (let i = 0; i < f.length; i += 4) {
    const a = f[i + 3];
    if (a > 0.01) { const k = 255 / a; o.data[i] = f[i] * k; o.data[i + 1] = f[i + 1] * k; o.data[i + 2] = f[i + 2] * k; }
    o.data[i + 3] = a;
  }
  return o;
}

function boxPass(src: Float32Array, dst: Float32Array, w: number, h: number, r: number, horiz: boolean) {
  const n = horiz ? w : h, lines = horiz ? h : w;
  const inv = 1 / (r * 2 + 1);
  for (let l = 0; l < lines; l++) {
    const idx = (k: number) => { const kk = k < 0 ? 0 : k >= n ? n - 1 : k; return (horiz ? l * w + kk : kk * w + l) * 4; };
    let s0 = 0, s1 = 0, s2 = 0, s3 = 0;
    for (let k = -r; k <= r; k++) { const i = idx(k); s0 += src[i]; s1 += src[i + 1]; s2 += src[i + 2]; s3 += src[i + 3]; }
    for (let k = 0; k < n; k++) {
      const o = idx(k);
      dst[o] = s0 * inv; dst[o + 1] = s1 * inv; dst[o + 2] = s2 * inv; dst[o + 3] = s3 * inv;
      const a = idx(k - r), b = idx(k + r + 1);
      s0 += src[b] - src[a]; s1 += src[b + 1] - src[a + 1]; s2 += src[b + 2] - src[a + 2]; s3 += src[b + 3] - src[a + 3];
    }
  }
}
function gaussF(f: Float32Array, w: number, h: number, radius: number) {
  if (radius < 0.5) return f;
  // three box passes ≈ gaussian
  const sigma = radius / 2;
  const r = Math.max(1, Math.round(Math.sqrt((12 * sigma * sigma) / 3 + 1) / 2));
  const t = new Float32Array(f.length);
  let a = f.slice(), b = t;
  for (let p = 0; p < 3; p++) { boxPass(a, b, w, h, r, true); boxPass(b, a, w, h, r, false); }
  b = a;
  return b;
}
export function gaussian(s: Px, radius: number): Px { return unpremul(gaussF(premul(s), s.w, s.h, radius), s.w, s.h); }

function sampleBil(f: Float32Array, w: number, h: number, x: number, y: number, out: number[]) {
  x = x < 0 ? 0 : x > w - 1 ? w - 1 : x;
  y = y < 0 ? 0 : y > h - 1 ? h - 1 : y;
  const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1);
  const fx = x - x0, fy = y - y0;
  const i00 = (y0 * w + x0) * 4, i10 = (y0 * w + x1) * 4, i01 = (y1 * w + x0) * 4, i11 = (y1 * w + x1) * 4;
  for (let c = 0; c < 4; c++) {
    const a = f[i00 + c] + (f[i10 + c] - f[i00 + c]) * fx, b = f[i01 + c] + (f[i11 + c] - f[i01 + c]) * fx;
    out[c] = a + (b - a) * fy;
  }
}

/** Generic multi-sample blur: offsets(x, y) yields sample positions relative to (x, y). */
function multiSample(s: Px, samples: number, at: (x: number, y: number, t: number) => [number, number]): Px {
  const f = premul(s), o = new Float32Array(f.length), tmp = [0, 0, 0, 0];
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
    let a0 = 0, a1 = 0, a2 = 0, a3 = 0;
    for (let k = 0; k < samples; k++) {
      const t = samples === 1 ? 0 : k / (samples - 1);
      const [sx, sy] = at(x, y, t);
      sampleBil(f, s.w, s.h, sx, sy, tmp);
      a0 += tmp[0]; a1 += tmp[1]; a2 += tmp[2]; a3 += tmp[3];
    }
    const i = (y * s.w + x) * 4;
    o[i] = a0 / samples; o[i + 1] = a1 / samples; o[i + 2] = a2 / samples; o[i + 3] = a3 / samples;
  }
  return unpremul(o, s.w, s.h);
}

function mapPixels(s: Px, fn: (r: number, g: number, b: number, a: number, i: number) => [number, number, number] | void): Px {
  const o = blank(s.w, s.h);
  const d = s.data, od = o.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = fn(d[i], d[i + 1], d[i + 2], d[i + 3], i);
    if (r) { od[i] = clamp8(r[0]); od[i + 1] = clamp8(r[1]); od[i + 2] = clamp8(r[2]); }
    else { od[i] = d[i]; od[i + 1] = d[i + 1]; od[i + 2] = d[i + 2]; }
    od[i + 3] = d[i + 3];
  }
  return o;
}

function convolve3(s: Px, k: number[], amount = 1): Px {
  const o = blank(s.w, s.h);
  const { w, h, data: d } = s;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    for (let c = 0; c < 3; c++) {
      let acc = 0;
      for (let ky = -1; ky <= 1; ky++) for (let kx = -1; kx <= 1; kx++) {
        const xx = Math.min(w - 1, Math.max(0, x + kx)), yy = Math.min(h - 1, Math.max(0, y + ky));
        acc += d[(yy * w + xx) * 4 + c] * k[(ky + 1) * 3 + kx + 1];
      }
      o.data[i + c] = clamp8(d[i + c] + (acc - d[i + c]) * amount);
    }
    o.data[i + 3] = d[i + 3];
  }
  return o;
}

function rgb2hsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h /= 6;
  return [h, s, l];
}
function hsl2rgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t: number) => { t = ((t % 1) + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}
const lum = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

export const FILTERS: FxDef[] = [
  // ---------------- Blur
  { id: 'gaussian', name: 'Gaussian Blur', group: 'Blur', params: [{ key: 'radius', label: 'Radius', min: 0, max: 100, step: 0.5, def: 6, px: true, unit: 'px' }], run: (s, p) => gaussian(s, p.radius) },
  {
    id: 'motion', name: 'Motion Blur', group: 'Blur', params: [{ key: 'angle', label: 'Angle', min: -180, max: 180, step: 1, def: 0, unit: '°' }, { key: 'distance', label: 'Distance', min: 1, max: 200, step: 1, def: 24, px: true, unit: 'px' }],
    run: (s, p) => { const a = (p.angle * Math.PI) / 180, dx = Math.cos(a) * p.distance, dy = Math.sin(a) * p.distance; return multiSample(s, Math.min(64, Math.max(3, Math.ceil(p.distance / 1.5))), (x, y, t) => [x + dx * (t - 0.5), y + dy * (t - 0.5)]); },
  },
  {
    id: 'directional', name: 'Directional Blur', group: 'Blur', params: [{ key: 'angle', label: 'Angle', min: -180, max: 180, step: 1, def: 0, unit: '°' }, { key: 'distance', label: 'Distance', min: 1, max: 200, step: 1, def: 30, px: true, unit: 'px' }],
    run: (s, p) => { const a = (p.angle * Math.PI) / 180, dx = Math.cos(a) * p.distance, dy = Math.sin(a) * p.distance; return multiSample(s, Math.min(64, Math.max(3, Math.ceil(p.distance / 1.5))), (x, y, t) => [x - dx * t, y - dy * t]); },
  },
  {
    id: 'zoom', name: 'Zoom Blur', group: 'Blur', params: [{ key: 'amount', label: 'Amount', min: 0, max: 0.6, step: 0.01, def: 0.15 }, { key: 'cx', label: 'Center X', min: 0, max: 1, step: 0.01, def: 0.5 }, { key: 'cy', label: 'Center Y', min: 0, max: 1, step: 0.01, def: 0.5 }],
    run: (s, p) => { const cx = p.cx * s.w, cy = p.cy * s.h; return multiSample(s, 24, (x, y, t) => { const k = 1 - p.amount * t; return [cx + (x - cx) * k, cy + (y - cy) * k]; }); },
  },
  {
    id: 'radial', name: 'Radial (Spin) Blur', group: 'Blur', params: [{ key: 'angle', label: 'Angle', min: 0, max: 45, step: 0.5, def: 8, unit: '°' }, { key: 'cx', label: 'Center X', min: 0, max: 1, step: 0.01, def: 0.5 }, { key: 'cy', label: 'Center Y', min: 0, max: 1, step: 0.01, def: 0.5 }],
    run: (s, p) => { const cx = p.cx * s.w, cy = p.cy * s.h, A = (p.angle * Math.PI) / 180; return multiSample(s, 24, (x, y, t) => { const a = A * (t - 0.5), c = Math.cos(a), sn = Math.sin(a); const dx = x - cx, dy = y - cy; return [cx + dx * c - dy * sn, cy + dx * sn + dy * c]; }); },
  },
  {
    id: 'lens', name: 'Lens Blur', group: 'Blur', params: [{ key: 'radius', label: 'Radius', min: 1, max: 40, step: 0.5, def: 8, px: true, unit: 'px' }, { key: 'bright', label: 'Highlight bloom', min: 0, max: 1, step: 0.01, def: 0.4 }],
    run: (s, p) => {
      // disk kernel with highlight weighting (bokeh-style)
      const pts: [number, number][] = [];
      const N = 36;
      for (let i = 0; i < N; i++) { const r = Math.sqrt((i + 0.5) / N) * p.radius, a = i * 2.39996; pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
      const f = premul(s), o = new Float32Array(f.length), tmp = [0, 0, 0, 0];
      for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
        let a0 = 0, a1 = 0, a2 = 0, a3 = 0, ws = 0;
        for (const [ox, oy] of pts) {
          sampleBil(f, s.w, s.h, x + ox, y + oy, tmp);
          const wgt = 1 + p.bright * 4 * Math.pow(lum(tmp[0], tmp[1], tmp[2]) / 255, 4);
          a0 += tmp[0] * wgt; a1 += tmp[1] * wgt; a2 += tmp[2] * wgt; a3 += tmp[3] * wgt; ws += wgt;
        }
        const i = (y * s.w + x) * 4;
        o[i] = a0 / ws; o[i + 1] = a1 / ws; o[i + 2] = a2 / ws; o[i + 3] = a3 / ws;
      }
      return unpremul(o, s.w, s.h);
    },
  },
  // ---------------- Detail
  { id: 'sharpen', name: 'Sharpen', group: 'Detail', params: [{ key: 'amount', label: 'Amount', min: 0, max: 3, step: 0.05, def: 1 }], run: (s, p) => convolve3(s, [0, -1, 0, -1, 5, -1, 0, -1, 0], p.amount) },
  {
    id: 'unsharp', name: 'Unsharp Mask', group: 'Detail', params: [{ key: 'radius', label: 'Radius', min: 0.5, max: 30, step: 0.5, def: 3, px: true, unit: 'px' }, { key: 'amount', label: 'Amount', min: 0, max: 4, step: 0.05, def: 1.2 }, { key: 'threshold', label: 'Threshold', min: 0, max: 64, step: 1, def: 2 }],
    run: (s, p) => { const b = gaussian(s, p.radius); return mapPixels(s, (r, g, bl, _a, i) => { const d = [r - b.data[i], g - b.data[i + 1], bl - b.data[i + 2]]; if (Math.abs(lum(d[0], d[1], d[2])) < p.threshold) return; return [r + d[0] * p.amount, g + d[1] * p.amount, bl + d[2] * p.amount]; }); },
  },
  {
    id: 'denoise', name: 'Noise Reduction', group: 'Detail', params: [{ key: 'strength', label: 'Strength', min: 0, max: 1, step: 0.01, def: 0.7 }],
    run: (s, p) => {
      const o = blank(s.w, s.h), { w, h, data: d } = s, win: number[] = [];
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        for (let c = 0; c < 3; c++) {
          win.length = 0;
          for (let ky = -1; ky <= 1; ky++) for (let kx = -1; kx <= 1; kx++) win.push(d[(Math.min(h - 1, Math.max(0, y + ky)) * w + Math.min(w - 1, Math.max(0, x + kx))) * 4 + c]);
          win.sort((a, b) => a - b);
          o.data[i + c] = d[i + c] + (win[4] - d[i + c]) * p.strength;
        }
        o.data[i + 3] = d[i + 3];
      }
      return o;
    },
  },
  // ---------------- Adjust
  { id: 'brightcontrast', name: 'Brightness / Contrast', group: 'Adjust', params: [{ key: 'bright', label: 'Brightness', min: -100, max: 100, step: 1, def: 0 }, { key: 'contrast', label: 'Contrast', min: -100, max: 100, step: 1, def: 0 }], run: (s, p) => { const c = Math.pow((p.contrast + 100) / 100, 2); return mapPixels(s, (r, g, b) => [(r - 128) * c + 128 + p.bright * 1.28, (g - 128) * c + 128 + p.bright * 1.28, (b - 128) * c + 128 + p.bright * 1.28]); } },
  { id: 'huesat', name: 'Hue / Saturation', group: 'Adjust', params: [{ key: 'hue', label: 'Hue', min: -180, max: 180, step: 1, def: 0, unit: '°' }, { key: 'sat', label: 'Saturation', min: -100, max: 100, step: 1, def: 0 }, { key: 'light', label: 'Lightness', min: -100, max: 100, step: 1, def: 0 }], run: (s, p) => mapPixels(s, (r, g, b) => { let [h, sa, l] = rgb2hsl(r, g, b); h += p.hue / 360; sa = Math.max(0, Math.min(1, sa * (1 + p.sat / 100))); l = Math.max(0, Math.min(1, l + (p.light / 100) * (p.light > 0 ? 1 - l : l))); return hsl2rgb(h, sa, l); }) },
  {
    id: 'levels', name: 'Levels', group: 'Adjust', params: [{ key: 'inB', label: 'Input black', min: 0, max: 254, step: 1, def: 0 }, { key: 'inW', label: 'Input white', min: 1, max: 255, step: 1, def: 255 }, { key: 'gamma', label: 'Gamma', min: 0.1, max: 3, step: 0.01, def: 1 }, { key: 'outB', label: 'Output black', min: 0, max: 255, step: 1, def: 0 }, { key: 'outW', label: 'Output white', min: 0, max: 255, step: 1, def: 255 }],
    run: (s, p) => { const lut = new Float32Array(256); for (let v = 0; v < 256; v++) { const t = Math.max(0, Math.min(1, (v - p.inB) / Math.max(1, p.inW - p.inB))); lut[v] = p.outB + Math.pow(t, 1 / p.gamma) * (p.outW - p.outB); } return mapPixels(s, (r, g, b) => [lut[r], lut[g], lut[b]]); },
  },
  {
    id: 'colorbalance', name: 'Color Balance', group: 'Adjust', params: [{ key: 'cr', label: 'Cyan ↔ Red', min: -100, max: 100, step: 1, def: 0 }, { key: 'mg', label: 'Magenta ↔ Green', min: -100, max: 100, step: 1, def: 0 }, { key: 'yb', label: 'Yellow ↔ Blue', min: -100, max: 100, step: 1, def: 0 }],
    run: (s, p) => mapPixels(s, (r, g, b) => { const l = lum(r, g, b) / 255; const mid = 1 - Math.abs(l - 0.5) * 2; const k = 0.6 * (0.35 + mid * 0.65); return [r + p.cr * k, g + p.mg * k, b + p.yb * k]; }),
  },
  { id: 'grayscale', name: 'Grayscale', group: 'Adjust', params: [{ key: 'amount', label: 'Amount', min: 0, max: 1, step: 0.01, def: 1 }], run: (s, p) => mapPixels(s, (r, g, b) => { const l = lum(r, g, b); return [r + (l - r) * p.amount, g + (l - g) * p.amount, b + (l - b) * p.amount]; }) },
  { id: 'invert', name: 'Invert', group: 'Adjust', params: [], run: (s) => mapPixels(s, (r, g, b) => [255 - r, 255 - g, 255 - b]) },
  { id: 'posterize', name: 'Posterize', group: 'Adjust', params: [{ key: 'levels', label: 'Levels', min: 2, max: 32, step: 1, def: 5 }], run: (s, p) => { const n = p.levels - 1; return mapPixels(s, (r, g, b) => [Math.round((r / 255) * n) * (255 / n), Math.round((g / 255) * n) * (255 / n), Math.round((b / 255) * n) * (255 / n)]); } },
  { id: 'threshold', name: 'Threshold', group: 'Adjust', params: [{ key: 'level', label: 'Level', min: 0, max: 255, step: 1, def: 128 }], run: (s, p) => mapPixels(s, (r, g, b) => { const v = lum(r, g, b) >= p.level ? 255 : 0; return [v, v, v]; }) },
  // ---------------- Artistic
  {
    id: 'pixelate', name: 'Pixelate', group: 'Artistic', params: [{ key: 'size', label: 'Cell size', min: 2, max: 128, step: 1, def: 12, px: true, unit: 'px' }],
    run: (s, p) => {
      const n = Math.max(1, Math.round(p.size)), o = blank(s.w, s.h), { w, h, data: d } = s;
      for (let cy = 0; cy < h; cy += n) for (let cx = 0; cx < w; cx += n) {
        let a0 = 0, a1 = 0, a2 = 0, a3 = 0, c = 0;
        for (let y = cy; y < Math.min(h, cy + n); y++) for (let x = cx; x < Math.min(w, cx + n); x++) { const i = (y * w + x) * 4, a = d[i + 3]; a0 += d[i] * a; a1 += d[i + 1] * a; a2 += d[i + 2] * a; a3 += a; c++; }
        const A = a3 / c;
        for (let y = cy; y < Math.min(h, cy + n); y++) for (let x = cx; x < Math.min(w, cx + n); x++) { const i = (y * w + x) * 4; if (a3) { o.data[i] = a0 / a3; o.data[i + 1] = a1 / a3; o.data[i + 2] = a2 / a3; } o.data[i + 3] = A; }
      }
      return o;
    },
  },
  {
    id: 'halftone', name: 'Halftone (manga dots)', group: 'Artistic', params: [{ key: 'cell', label: 'Cell size', min: 3, max: 48, step: 1, def: 8, px: true, unit: 'px' }, { key: 'angle', label: 'Angle', min: 0, max: 90, step: 1, def: 45, unit: '°' }, { key: 'color', label: 'Keep color (0/1)', min: 0, max: 1, step: 1, def: 0 }],
    run: (s, p) => {
      const o = blank(s.w, s.h), { w, h, data: d } = s, a = (p.angle * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a), n = p.cell;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const u = x * ca + y * sa, v = -x * sa + y * ca;
        const cu = (Math.floor(u / n) + 0.5) * n, cv = (Math.floor(v / n) + 0.5) * n;
        const sx = Math.round(cu * ca - cv * sa), sy = Math.round(cu * sa + cv * ca);
        const si = (Math.min(h - 1, Math.max(0, sy)) * w + Math.min(w - 1, Math.max(0, sx))) * 4;
        const L = lum(d[si], d[si + 1], d[si + 2]) / 255;
        const rad = Math.sqrt(1 - L) * n * 0.72;
        const ink = Math.hypot(u - cu, v - cv) < rad;
        const i = (y * w + x) * 4;
        if (p.color >= 0.5) { const k = ink ? 0.55 : 1; o.data[i] = ink ? d[si] * k : 255; o.data[i + 1] = ink ? d[si + 1] * k : 255; o.data[i + 2] = ink ? d[si + 2] * k : 255; }
        else { const vv = ink ? 0 : 255; o.data[i] = o.data[i + 1] = o.data[i + 2] = vv; }
        o.data[i + 3] = d[i + 3];
      }
      return o;
    },
  },
  {
    id: 'edges', name: 'Edge Detection', group: 'Artistic', params: [{ key: 'strength', label: 'Strength', min: 0.2, max: 4, step: 0.05, def: 1.5 }, { key: 'invert', label: 'Ink on paper (0/1)', min: 0, max: 1, step: 1, def: 1 }],
    run: (s, p) => {
      const o = blank(s.w, s.h), { w, h, data: d } = s;
      const L = (x: number, y: number) => { const i = (Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))) * 4; return lum(d[i], d[i + 1], d[i + 2]); };
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const gx = -L(x - 1, y - 1) - 2 * L(x - 1, y) - L(x - 1, y + 1) + L(x + 1, y - 1) + 2 * L(x + 1, y) + L(x + 1, y + 1);
        const gy = -L(x - 1, y - 1) - 2 * L(x, y - 1) - L(x + 1, y - 1) + L(x - 1, y + 1) + 2 * L(x, y + 1) + L(x + 1, y + 1);
        let v = Math.min(255, Math.hypot(gx, gy) * p.strength * 0.25);
        if (p.invert >= 0.5) v = 255 - v;
        const i = (y * w + x) * 4;
        o.data[i] = o.data[i + 1] = o.data[i + 2] = v;
        o.data[i + 3] = d[i + 3];
      }
      return o;
    },
  },
  {
    id: 'glow', name: 'Glow', group: 'Artistic', params: [{ key: 'radius', label: 'Radius', min: 1, max: 80, step: 1, def: 16, px: true, unit: 'px' }, { key: 'intensity', label: 'Intensity', min: 0, max: 2, step: 0.01, def: 0.8 }, { key: 'threshold', label: 'Threshold', min: 0, max: 255, step: 1, def: 160 }],
    run: (s, p) => {
      const bright = mapPixels(s, (r, g, b) => (lum(r, g, b) >= p.threshold ? [r, g, b] : [0, 0, 0]));
      const b = gaussian(bright, p.radius);
      return mapPixels(s, (r, g, bl, _a, i) => [255 - ((255 - r) * (255 - b.data[i] * p.intensity)) / 255, 255 - ((255 - g) * (255 - b.data[i + 1] * p.intensity)) / 255, 255 - ((255 - bl) * (255 - b.data[i + 2] * p.intensity)) / 255]);
    },
  },
  {
    id: 'vignette', name: 'Vignette', group: 'Artistic', params: [{ key: 'amount', label: 'Amount', min: 0, max: 1, step: 0.01, def: 0.5 }, { key: 'size', label: 'Size', min: 0.1, max: 1.5, step: 0.01, def: 0.75 }, { key: 'soft', label: 'Softness', min: 0.05, max: 1, step: 0.01, def: 0.5 }],
    run: (s, p) => { const cx = s.w / 2, cy = s.h / 2, R = Math.hypot(cx, cy); return mapPixels(s, (r, g, b, _a, i) => { const px = (i / 4) % s.w, py = Math.floor(i / 4 / s.w); const d = Math.hypot(px - cx, py - cy) / R; const t = Math.max(0, Math.min(1, (d - p.size * (1 - p.soft)) / Math.max(0.01, p.soft))); const k = 1 - p.amount * t * t * (3 - 2 * t); return [r * k, g * k, b * k]; }); },
  },
  {
    id: 'grain', name: 'Film Grain', group: 'Artistic', params: [{ key: 'amount', label: 'Amount', min: 0, max: 100, step: 1, def: 20 }, { key: 'size', label: 'Grain size', min: 0, max: 3, step: 0.1, def: 0.6, px: true }],
    run: (s, p, seed) => {
      const rnd = mulberry32(seed), n: Px = blank(s.w, s.h);
      for (let i = 0; i < n.data.length; i += 4) { const v = 128 + (rnd() - 0.5) * 255; n.data[i] = n.data[i + 1] = n.data[i + 2] = v; n.data[i + 3] = 255; }
      const g = p.size > 0.2 ? gaussian(n, p.size) : n;
      return mapPixels(s, (r, gg, b, _a, i) => { const d = ((g.data[i] - 128) * p.amount) / 50; return [r + d, gg + d, b + d]; });
    },
  },
  { id: 'colornoise', name: 'Color Noise', group: 'Artistic', params: [{ key: 'amount', label: 'Amount', min: 0, max: 100, step: 1, def: 18 }], run: (s, p, seed) => { const rnd = mulberry32(seed); return mapPixels(s, (r, g, b) => [r + (rnd() - 0.5) * p.amount * 2.55, g + (rnd() - 0.5) * p.amount * 2.55, b + (rnd() - 0.5) * p.amount * 2.55]); } },
  {
    id: 'chromatic', name: 'Chromatic Aberration', group: 'Artistic', params: [{ key: 'shift', label: 'Shift', min: 0, max: 30, step: 0.5, def: 4, px: true, unit: 'px' }],
    run: (s, p) => {
      const o = blank(s.w, s.h), { w, h, data: d } = s, cx = w / 2, cy = h / 2, R = Math.hypot(cx, cy);
      const at = (x: number, y: number, c: number) => d[(Math.min(h - 1, Math.max(0, Math.round(y))) * w + Math.min(w - 1, Math.max(0, Math.round(x)))) * 4 + c];
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const dx = x - cx, dy = y - cy, k = (p.shift * Math.hypot(dx, dy)) / R / Math.max(1, Math.hypot(dx, dy));
        const i = (y * w + x) * 4;
        o.data[i] = at(x + dx * k, y + dy * k, 0); o.data[i + 1] = d[i + 1]; o.data[i + 2] = at(x - dx * k, y - dy * k, 2); o.data[i + 3] = d[i + 3];
      }
      return o;
    },
  },
];

export const fxById = (id: string) => FILTERS.find((f) => f.id === id);

/** Scale pixel-unit parameters (used when previewing on a reduced proxy). */
export function scaleParams(def: FxDef, p: Record<string, number>, k: number) {
  const o = { ...p };
  for (const q of def.params) if (q.px) o[q.key] = p[q.key] * k;
  return o;
}

export function runFx(id: string, src: Px, params: Record<string, number>, seed: number): Px {
  const def = fxById(id);
  if (!def) throw new Error('Unknown filter: ' + id);
  const p: Record<string, number> = {};
  for (const q of def.params) p[q.key] = params[q.key] ?? q.def;
  return def.run(src, p, seed);
}
