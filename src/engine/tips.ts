import type { GrainType, TipShape } from './types';
import { createCanvas, ctxOf, hashString, mulberry32 } from './util';

const TIP = 128;
const maskCache = new Map<string, HTMLCanvasElement>();
const tintCache = new Map<string, HTMLCanvasElement>();
const stampImages = new Map<string, HTMLImageElement>();
export const missingStamps = new Set<string>();

/** Pre-decode a custom stamp so tip generation stays synchronous. */
export function ensureStamp(dataUrl: string): Promise<void> {
  if (stampImages.has(dataUrl)) return Promise.resolve();
  return new Promise((res) => {
    const im = new Image();
    im.onload = () => {
      stampImages.set(dataUrl, im);
      missingStamps.delete(dataUrl);
      res();
    };
    im.onerror = () => {
      missingStamps.add(dataUrl);
      res();
    };
    im.src = dataUrl;
  });
}

function pixelMask(fn: (x: number, y: number, r: number, rnd: () => number) => number, seed: string) {
  const c = createCanvas(TIP, TIP);
  const ctx = ctxOf(c);
  const img = ctx.createImageData(TIP, TIP);
  const rnd = mulberry32(hashString(seed));
  for (let y = 0; y < TIP; y++) {
    for (let x = 0; x < TIP; x++) {
      const dx = (x + 0.5) / (TIP / 2) - 1;
      const dy = (y + 0.5) / (TIP / 2) - 1;
      const a = fn(dx, dy, Math.hypot(dx, dy), rnd);
      const i = (y * TIP + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.max(0, Math.min(255, a * 255));
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

function buildMask(shape: TipShape, hard: number, stamp?: string): HTMLCanvasElement {
  const c = createCanvas(TIP, TIP);
  const ctx = ctxOf(c);
  const R = TIP / 2;
  const rnd = mulberry32(hashString(shape + hard));
  const edge = (r: number) => 1 - smooth(Math.min(0.985, hard), 1, r);
  ctx.fillStyle = '#fff';
  switch (shape) {
    case 'round': {
      if (hard >= 0.99) {
        ctx.beginPath();
        ctx.arc(R, R, R - 1, 0, Math.PI * 2);
        ctx.fill();
        return c;
      }
      const g = ctx.createRadialGradient(R, R, 0, R, R, R);
      const steps = 8;
      for (let i = 0; i <= steps; i++) {
        const r = i / steps;
        g.addColorStop(r, `rgba(255,255,255,${edge(r)})`);
      }
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, TIP, TIP);
      return c;
    }
    case 'square':
      return pixelMask((x, y) => (1 - smooth(Math.min(0.97, hard), 1, Math.max(Math.abs(x), Math.abs(y)))), 'sq' + hard);
    case 'grain':
      return pixelMask((_x, _y, r, n) => edge(r) * (0.35 + 0.65 * n()), 'grain' + hard);
    case 'pencil':
      return pixelMask((_x, _y, r, n) => (r < 0.95 ? (n() > 0.42 ? 0.55 + n() * 0.45 : 0.05) * edge(r) : 0), 'pencil' + hard);
    case 'chalk':
      return pixelMask((x, y, r, n) => {
        const ang = Math.atan2(y, x);
        const rr = 0.78 + 0.14 * Math.sin(ang * 5 + 1.3) + 0.08 * Math.sin(ang * 11);
        return r < rr ? (n() > 0.5 ? 0.9 : n() * 0.4) : 0;
      }, 'chalk');
    case 'charcoal':
      return pixelMask((x, y, _r, n) => {
        const e = Math.hypot(x * 0.55, y * 1.5);
        return e < 0.95 ? (n() > 0.35 ? 0.4 + 0.6 * n() : 0) * (1 - smooth(0.6, 0.95, e)) : 0;
      }, 'charcoal');
    case 'sponge':
      return pixelMask((x, y, r, n) => {
        const v = Math.sin(x * 9 + n() * 0.6) * Math.cos(y * 8) + n() * 0.9;
        return r < 0.95 && v > 0.45 ? 0.8 * edge(r) : 0;
      }, 'sponge');
    case 'bristle': {
      for (let i = 0; i < 46; i++) {
        const a = rnd() * Math.PI * 2;
        const d = Math.sqrt(rnd()) * (R - 8);
        const rr = 2 + rnd() * 5;
        ctx.globalAlpha = 0.35 + rnd() * 0.65;
        ctx.beginPath();
        ctx.arc(R + Math.cos(a) * d, R + Math.sin(a) * d, rr, 0, Math.PI * 2);
        ctx.fill();
      }
      return c;
    }
    case 'flat': {
      if (hard >= 0.95) {
        ctx.fillRect(R - R * 0.95, R - R * 0.22, R * 1.9, R * 0.44);
        return c;
      }
      return pixelMask((x, y) => {
        const e = Math.max(Math.abs(x) / 0.95, Math.abs(y) / 0.24);
        return 1 - smooth(Math.min(0.95, hard), 1, e);
      }, 'flat' + hard);
    }
    case 'splatter': {
      for (let i = 0; i < 40; i++) {
        const a = rnd() * Math.PI * 2;
        const d = Math.pow(rnd(), 0.7) * (R - 10);
        const rr = 1 + Math.pow(rnd(), 3) * 10;
        ctx.globalAlpha = 0.6 + rnd() * 0.4;
        ctx.beginPath();
        ctx.arc(R + Math.cos(a) * d, R + Math.sin(a) * d, rr, 0, Math.PI * 2);
        ctx.fill();
      }
      return c;
    }
    case 'star': {
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const rr = i % 2 ? R * 0.4 : R * 0.95;
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        ctx.lineTo(R + Math.cos(a) * rr, R + Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fill();
      return c;
    }
    case 'leaf': {
      ctx.beginPath();
      ctx.moveTo(R, 4);
      ctx.quadraticCurveTo(TIP - 10, R, R, TIP - 4);
      ctx.quadraticCurveTo(10, R, R, 4);
      ctx.fill();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(R, 10);
      ctx.lineTo(R, TIP - 10);
      ctx.stroke();
      return c;
    }
    case 'cloud': {
      for (let i = 0; i < 9; i++) {
        const a = rnd() * Math.PI * 2;
        const d = rnd() * R * 0.45;
        const rr = R * (0.25 + rnd() * 0.3);
        const x = R + Math.cos(a) * d, y = R + Math.sin(a) * d;
        const g = ctx.createRadialGradient(x, y, 0, x, y, rr);
        g.addColorStop(0, 'rgba(255,255,255,0.55)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, TIP, TIP);
      }
      return c;
    }
    case 'fabric':
      return pixelMask((x, y, r) => {
        const wv = (Math.sin(x * 40) > 0) !== (Math.sin(y * 40) > 0) ? 0.85 : 0.35;
        return edge(r) * wv;
      }, 'fabric' + hard);
    case 'dots':
      return pixelMask((x, y, r) => {
        const gx = ((x + 1) * 4) % 1 - 0.5, gy = ((y + 1) * 4) % 1 - 0.5;
        return r < 0.97 && Math.hypot(gx, gy) < 0.3 ? 1 : 0;
      }, 'dots');
    case 'hatch':
      return pixelMask((x, y, r) => (r < 0.95 && Math.abs(((x + y) * 6) % 1) < 0.3 ? 0.9 : 0), 'hatch');
    case 'grass': {
      ctx.lineCap = 'round';
      for (let i = 0; i < 14; i++) {
        const x = R + (rnd() - 0.5) * TIP * 0.7, h = TIP * (0.45 + rnd() * 0.5), lean = (rnd() - 0.5) * 40;
        ctx.globalAlpha = 0.55 + rnd() * 0.45;
        ctx.beginPath();
        ctx.moveTo(x - 3, TIP - 2);
        ctx.quadraticCurveTo(x + lean * 0.3, TIP - h * 0.6, x + lean, TIP - h);
        ctx.quadraticCurveTo(x + lean * 0.3 + 2, TIP - h * 0.6, x + 3, TIP - 2);
        ctx.fill();
      }
      return c;
    }
    case 'hair':
    case 'scratch': {
      ctx.strokeStyle = '#fff';
      const n = shape === 'hair' ? 28 : 10;
      for (let i = 0; i < n; i++) {
        ctx.globalAlpha = 0.35 + rnd() * 0.65;
        ctx.lineWidth = shape === 'hair' ? 0.8 + rnd() * 1.4 : 1 + rnd() * 2.5;
        const y = R + (rnd() - 0.5) * TIP * (shape === 'hair' ? 0.5 : 0.8);
        ctx.beginPath();
        ctx.moveTo(4 + rnd() * 10, y);
        ctx.bezierCurveTo(R * 0.7, y + (rnd() - 0.5) * 14, R * 1.3, y + (rnd() - 0.5) * 14, TIP - 4 - rnd() * 10, y + (rnd() - 0.5) * 10);
        ctx.stroke();
      }
      return c;
    }
    case 'flower': {
      const petals = 5 + Math.floor(rnd() * 3);
      for (let i = 0; i < petals; i++) {
        const a = (i / petals) * Math.PI * 2;
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.ellipse(R + Math.cos(a) * R * 0.45, R + Math.sin(a) * R * 0.45, R * 0.42, R * 0.22, a, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'destination-out';
      ctx.globalAlpha = 0.6;
      ctx.beginPath(); ctx.arc(R, R, R * 0.16, 0, Math.PI * 2); ctx.fill();
      return c;
    }
    case 'drop':
      ctx.beginPath();
      ctx.moveTo(R, 6);
      ctx.bezierCurveTo(R + R * 0.18, R * 0.9, R + R * 0.14, TIP - 12, R, TIP - 6);
      ctx.bezierCurveTo(R - R * 0.14, TIP - 12, R - R * 0.18, R * 0.9, R, 6);
      ctx.fill();
      return c;
    case 'snow': {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2, ex = R + Math.cos(a) * R * 0.88, ey = R + Math.sin(a) * R * 0.88;
        ctx.beginPath(); ctx.moveTo(R, R); ctx.lineTo(ex, ey); ctx.stroke();
        for (const s of [-1, 1]) {
          const mx = R + Math.cos(a) * R * 0.55, my = R + Math.sin(a) * R * 0.55;
          ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(mx + Math.cos(a + s * 0.8) * R * 0.25, my + Math.sin(a + s * 0.8) * R * 0.25); ctx.stroke();
        }
      }
      return c;
    }
    case 'flame': {
      const g = ctx.createRadialGradient(R, TIP * 0.7, 2, R, TIP * 0.6, R);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(R, 4);
      ctx.bezierCurveTo(R + R * 0.2, R * 0.6, TIP - 12, R, R + R * 0.4, TIP - 8);
      ctx.quadraticCurveTo(R, TIP + 4, R - R * 0.4, TIP - 8);
      ctx.bezierCurveTo(12, R, R - R * 0.2, R * 0.6, R, 4);
      ctx.fill();
      return c;
    }
    case 'brick': {
      const bh = TIP / 6;
      for (let r = 0; r < 6; r++) for (let k = -1; k < 4; k++) {
        const x = k * (TIP / 3) + (r % 2 ? TIP / 6 : 0);
        ctx.globalAlpha = 0.65 + rnd() * 0.35;
        ctx.fillRect(x + 2, r * bh + 2, TIP / 3 - 4, bh - 4);
      }
      return c;
    }
    case 'wood':
      return pixelMask((x, y, r, n) => {
        const v = Math.sin((y * 14 + Math.sin(x * 3) * 1.4) + n() * 0.4);
        return r < 0.97 ? (v > 0.55 ? 0.85 : 0.18 + n() * 0.15) * (1 - smooth(0.85, 0.97, r)) : 0;
      }, 'wood');
    case 'rock':
      return pixelMask((x, y, r, n) => {
        const cell = Math.abs(Math.sin(x * 7.1 + Math.sin(y * 5.3) * 2) * Math.cos(y * 6.7 + Math.sin(x * 4.1)));
        return r < 0.95 ? (0.35 + cell * 0.55 + n() * 0.15) * (1 - smooth(0.8, 0.95, r)) : 0;
      }, 'rock');
    case 'window': {
      ctx.globalAlpha = 0.25;
      ctx.fillRect(10, 6, TIP - 20, TIP - 12);
      ctx.globalAlpha = 1;
      for (let r = 0; r < 4; r++) for (let k = 0; k < 3; k++) {
        ctx.globalAlpha = rnd() > 0.3 ? 1 : 0.5;
        ctx.fillRect(18 + k * 32, 14 + r * 27, 22, 18);
      }
      return c;
    }
    case 'ornament': {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 5;
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        ctx.beginPath();
        ctx.arc(R + Math.cos(a) * R * 0.35, R + Math.sin(a) * R * 0.35, R * 0.32, a + Math.PI * 0.6, a + Math.PI * 1.4, true);
        ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(R, R, R * 0.14, 0, Math.PI * 2); ctx.fill();
      return c;
    }
    case 'stamp': {
      const im = stamp ? stampImages.get(stamp) : undefined;
      if (!im) return buildMask('round', 0.8);
      const s = Math.min(TIP / im.width, TIP / im.height);
      const w = im.width * s, h = im.height * s;
      ctx.drawImage(im, (TIP - w) / 2, (TIP - h) / 2, w, h);
      // convert luminance+alpha into a mask (dark = paint)
      const d = ctx.getImageData(0, 0, TIP, TIP);
      for (let i = 0; i < d.data.length; i += 4) {
        const lum = (d.data[i] + d.data[i + 1] + d.data[i + 2]) / 765;
        d.data[i + 3] = d.data[i + 3] * (1 - lum * 0.85);
        d.data[i] = d.data[i + 1] = d.data[i + 2] = 255;
      }
      ctx.putImageData(d, 0, 0);
      return c;
    }
  }
  return c;
}

export function getMask(shape: TipShape, hardness: number, stamp?: string) {
  const h = Math.round(hardness * 20) / 20;
  const key = shape + ':' + h + (shape === 'stamp' ? ':' + (stamp ? hashString(stamp) : 0) + (stamp && stampImages.has(stamp) ? 'L' : 'M') : '');
  let m = maskCache.get(key);
  if (!m) {
    m = buildMask(shape, h, stamp);
    maskCache.set(key, m);
  }
  return { mask: m, key };
}

export function getTintedTip(shape: TipShape, hardness: number, color: string, stamp?: string) {
  const { mask, key } = getMask(shape, hardness, stamp);
  const k = key + '|' + color;
  let t = tintCache.get(k);
  if (t) {
    tintCache.delete(k);
    tintCache.set(k, t);
    return t;
  }
  t = createCanvas(TIP, TIP);
  const ctx = ctxOf(t);
  ctx.drawImage(mask, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, TIP, TIP);
  tintCache.set(k, t);
  if (tintCache.size > 160) tintCache.delete(tintCache.keys().next().value as string);
  return t;
}

// ---------- paper grains (tileable value noise) ----------
const grainCache = new Map<string, HTMLCanvasElement>();
const G = 256;

function valueNoise(rnd: () => number, cells: number) {
  const grid: number[] = [];
  for (let i = 0; i < cells * cells; i++) grid.push(rnd());
  return (x: number, y: number) => {
    const fx = (x / G) * cells, fy = (y / G) * cells;
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = fx - x0, ty = fy - y0;
    const g = (a: number, b: number) => grid[(((b % cells) + cells) % cells) * cells + (((a % cells) + cells) % cells)];
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const a = g(x0, y0) + (g(x0 + 1, y0) - g(x0, y0)) * sx;
    const b = g(x0, y0 + 1) + (g(x0 + 1, y0 + 1) - g(x0, y0 + 1)) * sx;
    return a + (b - a) * sy;
  };
}

export function getGrain(type: GrainType) {
  let c = grainCache.get(type);
  if (c) return c;
  c = createCanvas(G, G);
  const ctx = ctxOf(c);
  const img = ctx.createImageData(G, G);
  const rnd = mulberry32(hashString('grain-' + type));
  const n1 = valueNoise(rnd, 64), n2 = valueNoise(rnd, 32), n3 = valueNoise(rnd, 16), n4 = valueNoise(rnd, 128);
  for (let y = 0; y < G; y++) {
    for (let x = 0; x < G; x++) {
      let v = 0;
      switch (type) {
        case 'paper': v = n4(x, y) * 0.45 + n1(x, y) * 0.35 + n2(x, y) * 0.2; v = Math.pow(v, 1.6); break;
        case 'rough': v = n3(x, y) * 0.5 + n1(x, y) * 0.3 + n4(x, y) * 0.2; v = v > 0.5 ? (v - 0.5) * 2 : 0; break;
        case 'canvas': {
          const w = (Math.sin((x / G) * Math.PI * 64) * Math.sin((y / G) * Math.PI * 64) + 1) / 2;
          v = w * 0.6 + n4(x, y) * 0.4; v = Math.pow(v, 1.4); break;
        }
        case 'fabric': {
          const a = Math.abs(Math.sin(((x + y) / G) * Math.PI * 48)), b = Math.abs(Math.sin(((x - y) / G) * Math.PI * 48));
          v = Math.min(a, b) * 0.7 + n4(x, y) * 0.3; break;
        }
        case 'noise': v = rnd(); break;
      }
      const i = (y * G + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 0;
      img.data[i + 3] = Math.max(0, Math.min(255, v * 255));
    }
  }
  ctx.putImageData(img, 0, 0);
  grainCache.set(type, c);
  return c;
}
