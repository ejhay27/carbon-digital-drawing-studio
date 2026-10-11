import type { Rect } from './types';

export const uid = (p = '') =>
  p + Math.random().toString(36).slice(2, 9) + (Date.now() % 1e6).toString(36);

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function hashString(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function createCanvas(w: number, h: number, willRead = false) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  c.getContext('2d', { willReadFrequently: willRead });
  return c;
}

export const ctxOf = (c: HTMLCanvasElement) => c.getContext('2d') as CanvasRenderingContext2D;

export function cloneCanvas(src: HTMLCanvasElement, willRead = false) {
  const c = createCanvas(src.width, src.height, willRead);
  ctxOf(c).drawImage(src, 0, 0);
  return c;
}

export function copyRegion(src: HTMLCanvasElement, r: Rect) {
  const c = createCanvas(r.w, r.h);
  ctxOf(c).drawImage(src, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
  return c;
}

export function clipRect(r: Rect, w: number, h: number): Rect | null {
  const x0 = Math.max(0, Math.floor(r.x));
  const y0 = Math.max(0, Math.floor(r.y));
  const x1 = Math.min(w, Math.ceil(r.x + r.w));
  const y1 = Math.min(h, Math.ceil(r.y + r.h));
  if (x1 <= x0 || y1 <= y0) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function unionRect(a: Rect | null, b: Rect | null): Rect | null {
  if (!a) return b;
  if (!b) return a;
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

// ---------- colour ----------
export function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  if (isNaN(n)) return [0, 0, 0];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function rgbToHex(r: number, g: number, b: number) {
  const f = (v: number) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0');
  return '#' + f(r) + f(g) + f(b);
}
export function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max ? d / max : 0, max];
}
export function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  h = ((h % 360) + 360) % 360;
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}
export const hexToHsv = (hex: string) => rgbToHsv(...hexToRgb(hex));
export const hsvToHex = (h: number, s: number, v: number) => rgbToHex(...hsvToRgb(h, s, v));

export function isHex(s: string) {
  return /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.test(s.trim());
}
export function normHex(s: string) {
  let h = s.trim().replace('#', '').toLowerCase();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return '#' + h;
}

export function fmtBytes(n: number) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1024 / 1024).toFixed(1) + ' MB';
}
export function fmtTime(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

export function canvasHash(c: HTMLCanvasElement) {
  const d = c.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, c.width, c.height).data;
  let h = 0x811c9dc5;
  for (let i = 0; i < d.length; i += 1) {
    h ^= d[i];
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Count pixels whose channels differ more than tol. */
export function canvasDiff(a: HTMLCanvasElement, b: HTMLCanvasElement, tol = 2) {
  if (a.width !== b.width || a.height !== b.height) return Infinity;
  const da = a.getContext('2d')!.getImageData(0, 0, a.width, a.height).data;
  const db = b.getContext('2d')!.getImageData(0, 0, b.width, b.height).data;
  let n = 0;
  for (let i = 0; i < da.length; i += 4) {
    if (
      Math.abs(da[i] - db[i]) > tol || Math.abs(da[i + 1] - db[i + 1]) > tol ||
      Math.abs(da[i + 2] - db[i + 2]) > tol || Math.abs(da[i + 3] - db[i + 3]) > tol
    ) n++;
  }
  return n;
}

type DownloadImpl = (blob: Blob, name: string) => void;
let downloadImpl: DownloadImpl | null = null;
/** Platform adapters (e.g. Android) replace browser downloads with native file delivery. */
export function setDownloadImpl(f: DownloadImpl | null) {
  downloadImpl = f;
}

export function download(blob: Blob, name: string) {
  if (downloadImpl) return downloadImpl(blob, name);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 1500);
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error('Could not decode image'));
    im.src = src;
  });
}

export function blobToDataURL(b: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(b);
  });
}

export function canvasToBlob(c: HTMLCanvasElement, type = 'image/png', q?: number): Promise<Blob> {
  return new Promise((res, rej) =>
    c.toBlob((b) => (b ? res(b) : rej(new Error('Encoding failed (' + type + ')'))), type, q),
  );
}

/** Document → screen matrix for a view (pan is the screen position of the document centre). */
export function viewMatrix(v: { zoom: number; panX: number; panY: number; rot: number; flip: boolean }, w: number, h: number): number[] {
  const r = (v.rot * Math.PI) / 180;
  const fx = v.flip ? -1 : 1;
  const a = Math.cos(r) * v.zoom * fx, b = Math.sin(r) * v.zoom * fx, c = -Math.sin(r) * v.zoom, d = Math.cos(r) * v.zoom;
  return [a, b, c, d, v.panX - (a * w) / 2 - (c * h) / 2, v.panY - (b * w) / 2 - (d * h) / 2];
}

/** Apply 2x3 matrix [a,b,c,d,e,f] to a point */
export function mapPt(m: number[], x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}
export function mulM(m1: number[], m2: number[]) {
  // m1 * m2
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}
export function invM(m: number[]) {
  const det = m[0] * m[3] - m[1] * m[2] || 1e-9;
  return [
    m[3] / det, -m[1] / det, -m[2] / det, m[0] / det,
    (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det,
  ];
}
