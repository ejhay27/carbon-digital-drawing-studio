// CARBON Comic engine: editable vector panels, balloons, lettering and manga effects.
// Everything renders procedurally in document space, so it stays sharp at any zoom and exports correctly.
import type { ComicBalloon, ComicFx, ComicObject, ComicPanel, Layer } from './types';
import { mapPt, mulberry32, uid } from './util';

// ---------------------------------------------------------------- page presets & templates
export const PAGE_PRESETS = [
  { id: 'manga-b5', name: 'Manga (B5, 300 dpi)', w: 2150, h: 3035 },
  { id: 'western', name: 'Western comic (6.625×10.25 in)', w: 1988, h: 3075 },
  { id: 'a4', name: 'A4 (300 dpi)', w: 2480, h: 3508 },
  { id: 'webcomic', name: 'Webcomic page (800×1280)', w: 800, h: 1280 },
  { id: 'webtoon', name: 'Vertical webtoon strip (800×3200)', w: 800, h: 3200 },
  { id: 'square', name: 'Square / social (2048)', w: 2048, h: 2048 },
  { id: 'landscape', name: 'Landscape strip (3508×1240)', w: 3508, h: 1240 },
];

export const LAYOUTS: { id: string; name: string; rows: number[][] }[] = [
  // each row: relative widths; rows share height equally unless weighted with negative first value
  { id: 'manga', name: 'Manga page (5 panels)', rows: [[1], [1.4, 1], [1, 1.6]] },
  { id: 'western', name: 'Western (6 panels)', rows: [[1, 1], [1, 1], [1, 1]] },
  { id: '4koma', name: 'Four-panel (4-koma)', rows: [[1], [1], [1], [1]] },
  { id: '6panel', name: 'Six-panel grid', rows: [[1, 1, 1], [1, 1, 1]] },
  { id: '9panel', name: 'Nine-panel grid', rows: [[1, 1, 1], [1, 1, 1], [1, 1, 1]] },
  { id: 'splash', name: 'Splash page', rows: [[1]] },
  { id: 'webcomic', name: 'Webcomic (3 stacked)', rows: [[1], [1], [1]] },
  { id: 'feature', name: 'Feature + strip', rows: [[1], [1], [1, 1, 1]] },
  { id: 'blank', name: 'Blank (no panels)', rows: [] },
];

export interface PageGeom { w: number; h: number; bleed: number; safe: number }

export function layoutPanels(layoutId: string, g: PageGeom, gutter: number, border = 6): ComicPanel[] {
  const L = LAYOUTS.find((l) => l.id === layoutId) || LAYOUTS[0];
  const inset = g.bleed + g.safe * 0.5;
  const x0 = inset, y0 = inset, W = g.w - inset * 2, H = g.h - inset * 2;
  const out: ComicPanel[] = [];
  const nRows = L.rows.length;
  if (!nRows) return out;
  // first row of the "feature" layout is taller
  const weights = L.rows.map((_, i) => (layoutId === 'feature' && i === 0 ? 1.8 : layoutId === 'manga' && i === 0 ? 0.8 : 1));
  const wsum = weights.reduce((a, b) => a + b, 0);
  let y = y0;
  L.rows.forEach((row, ri) => {
    const rh = ((H - gutter * (nRows - 1)) * weights[ri]) / wsum;
    const sum = row.reduce((a, b) => a + b, 0);
    let x = x0;
    row.forEach((wr) => {
      const pw = ((W - gutter * (row.length - 1)) * wr) / sum;
      out.push({ id: uid('pn-'), type: 'panel', pts: [x, y, x + pw, y, x + pw, y + rh, x, y + rh].map((v) => Math.round(v)), border, color: '#111111', radius: 0, fill: null });
      x += pw + gutter;
    });
    y += rh + gutter;
  });
  return out;
}

// ---------------------------------------------------------------- object factories
export function newBalloon(style: ComicBalloon['style'], x: number, y: number, w: number, h: number): ComicBalloon {
  return {
    id: uid('bl-'), type: 'balloon', style, x, y, w: Math.max(40, w), h: Math.max(30, h),
    tail: style === 'narration' ? null : { x: x + w * 0.3, y: y + h + Math.max(40, h * 0.5) }, tailW: 0.22,
    text: style === 'narration' ? 'Meanwhile…' : style === 'shout' ? 'WHAT?!' : style === 'thought' ? 'Hmm…' : 'Hello!',
    font: '"Comic Neue", "Comic Sans MS", "Chalkboard SE", "Segoe Print", sans-serif', size: Math.max(18, Math.round(h * 0.22)),
    bold: style === 'shout', italic: style === 'whisper', align: 'center', lineH: 1.2, letterSp: 0, pad: 14, vertical: false,
    fill: '#ffffff', stroke: '#111111', strokeW: 3, color: '#111111', link: null,
  };
}

export function newFx(kind: ComicFx['kind'], x: number, y: number, w: number, h: number): ComicFx {
  const d: Partial<ComicFx> = {
    speed: { density: 0.5, scale: 1.5, angle: 0 }, focus: { density: 0.6, scale: 2 }, impact: { density: 0.6, scale: 2 }, burst: { density: 0.5, scale: 2 },
    tone: { density: 0.35, scale: 1, angle: 45, contrast: 0 }, gradient: { density: 0.55, scale: 1, angle: 90, contrast: 1 },
    hatch: { density: 0.4, scale: 1, angle: 45 }, cross: { density: 0.4, scale: 1, angle: 45 }, sweat: { density: 0.4, scale: 1 },
    shock: { density: 0.5, scale: 1.5 }, emphasis: { density: 0.5, scale: 1.5 },
  }[kind] as Partial<ComicFx>;
  return { id: uid('fx-'), type: 'fx', kind, x, y, w: Math.max(20, w), h: Math.max(20, h), angle: 0, density: 0.5, scale: 1, opacity: 1, color: '#111111', seed: Math.floor(Math.random() * 1e9), contrast: 0, ...d };
}

// ---------------------------------------------------------------- geometry helpers
export function objBounds(o: ComicObject) {
  if (o.type === 'panel') {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < o.pts.length; i += 2) {
      minX = Math.min(minX, o.pts[i]); maxX = Math.max(maxX, o.pts[i]);
      minY = Math.min(minY, o.pts[i + 1]); maxY = Math.max(maxY, o.pts[i + 1]);
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }
  return { x: o.x, y: o.y, w: o.w, h: o.h };
}

function polyPath(p: Path2D | CanvasRenderingContext2D, pts: number[], radius: number) {
  const n = pts.length / 2;
  if (n < 3) return;
  if (radius <= 0) {
    p.moveTo(pts[0], pts[1]);
    for (let i = 1; i < n; i++) p.lineTo(pts[i * 2], pts[i * 2 + 1]);
    p.closePath();
    return;
  }
  const P = (i: number) => [pts[((i + n) % n) * 2], pts[((i + n) % n) * 2 + 1]];
  const [sx, sy] = P(0), [lx, ly] = P(-1);
  p.moveTo((sx + lx) / 2, (sy + ly) / 2);
  for (let i = 0; i < n; i++) {
    const [ax, ay] = P(i), [bx, by] = P(i + 1);
    p.arcTo(ax, ay, (ax + bx) / 2, (ay + by) / 2, radius);
  }
  p.closePath();
}

export function panelPath(o: ComicPanel) {
  const p = new Path2D();
  polyPath(p, o.pts, o.radius);
  return p;
}

/** Individual panel paths by id (Orbit-to-Comic captures clip to exactly one panel). */
export function panelPathMap(layers: Layer[]): Map<string, Path2D> {
  const m = new Map<string, Path2D>();
  for (const L of layers) if (L.type === 'comic') for (const o of L.comic || []) if (o.type === 'panel') m.set(o.id, panelPath(o));
  return m;
}

/** Union of all panel interiors on the page (used to clip artwork layers). */
export function panelsClipPath(layers: Layer[]): Path2D | null {
  let p: Path2D | null = null;
  for (const L of layers) {
    if (L.type !== 'comic' || !L.visible) continue;
    for (const o of L.comic || []) {
      if (o.type !== 'panel') continue;
      p = p || new Path2D();
      polyPath(p, o.pts, o.radius);
    }
  }
  return p;
}

function pointInPoly(x: number, y: number, pts: number[]) {
  let inside = false;
  for (let i = 0, j = pts.length / 2 - 1; i < pts.length / 2; j = i++) {
    const xi = pts[i * 2], yi = pts[i * 2 + 1], xj = pts[j * 2], yj = pts[j * 2 + 1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Top-most object under a point. Panels are hit on their border unless `interior` is set. */
export function hitComic(objs: ComicObject[], x: number, y: number, tol: number): ComicObject | null {
  const order = sortForDraw(objs).reverse();
  for (const o of order) {
    if (o.type === 'panel') {
      const n = o.pts.length / 2;
      for (let i = 0; i < n; i++) {
        const ax = o.pts[i * 2], ay = o.pts[i * 2 + 1], bx = o.pts[((i + 1) % n) * 2], by = o.pts[((i + 1) % n) * 2 + 1];
        const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy;
        const t = l ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l)) : 0;
        if (Math.hypot(x - (ax + t * dx), y - (ay + t * dy)) <= tol + o.border) return o;
      }
    } else {
      if (x >= o.x - tol && y >= o.y - tol && x <= o.x + o.w + tol && y <= o.y + o.h + tol) return o;
      if (o.type === 'balloon' && o.tail && Math.hypot(x - o.tail.x, y - o.tail.y) <= tol * 2) return o;
    }
  }
  // second pass: panel interiors
  for (const o of order) if (o.type === 'panel' && pointInPoly(x, y, o.pts)) return o;
  return null;
}

const RANK = { fx: 0, panel: 1, balloon: 2 } as const;
export const sortForDraw = (objs: ComicObject[]) => objs.map((o, i) => [o, i] as const).sort((a, b) => RANK[a[0].type] - RANK[b[0].type] || a[1] - b[1]).map((x) => x[0]);

export function transformComic(objs: ComicObject[], m: number[]): ComicObject[] {
  const sx = Math.hypot(m[0], m[1]), sy = Math.hypot(m[2], m[3]);
  const swap = Math.abs(m[0]) < 1e-6; // 90° rotation
  return objs.map((o) => {
    if (o.type === 'panel') {
      const pts = o.pts.slice();
      for (let i = 0; i < pts.length; i += 2) { const [a, b] = mapPt(m, pts[i], pts[i + 1]); pts[i] = a; pts[i + 1] = b; }
      return { ...o, pts, border: o.border * Math.sqrt(sx * sy) };
    }
    const [cx, cy] = mapPt(m, o.x + o.w / 2, o.y + o.h / 2);
    const w = (swap ? o.h : o.w) * sx, h = (swap ? o.w : o.h) * sy;
    const base = { ...o, x: cx - w / 2, y: cy - h / 2, w, h };
    if (o.type === 'balloon') {
      const t = o.tail ? mapPt(m, o.tail.x, o.tail.y) : null;
      return { ...(base as ComicBalloon), tail: t ? { x: t[0], y: t[1] } : null, size: o.size * Math.sqrt(sx * sy) };
    }
    return base as ComicFx;
  });
}

// ---------------------------------------------------------------- balloons
function balloonOutline(b: ComicBalloon, rnd: () => number): Path2D {
  const p = new Path2D();
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2, rx = b.w / 2, ry = b.h / 2;
  switch (b.style) {
    case 'narration':
      p.rect(b.x, b.y, b.w, b.h);
      break;
    case 'angular': {
      const c = Math.min(b.w, b.h) * 0.18;
      polyPath(p, [b.x + c, b.y, b.x + b.w - c, b.y, b.x + b.w, b.y + c, b.x + b.w, b.y + b.h - c, b.x + b.w - c, b.y + b.h, b.x + c, b.y + b.h, b.x, b.y + b.h - c, b.x, b.y + c], 0);
      break;
    }
    case 'shout': {
      const n = Math.max(14, Math.round((rx + ry) / 14));
      for (let i = 0; i < n * 2; i++) {
        const a = (i / (n * 2)) * Math.PI * 2;
        const k = i % 2 ? 1 : 1.18 + rnd() * 0.22;
        const x = cx + Math.cos(a) * rx * k, y = cy + Math.sin(a) * ry * k;
        if (i) p.lineTo(x, y); else p.moveTo(x, y);
      }
      p.closePath();
      break;
    }
    case 'thought': {
      const n = Math.max(8, Math.round((rx + ry) / 22));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const bx = cx + Math.cos(a) * rx * 0.86, by = cy + Math.sin(a) * ry * 0.86;
        const r = ((rx + ry) / n) * (0.95 + rnd() * 0.3);
        p.moveTo(bx + r, by);
        p.arc(bx, by, r, 0, Math.PI * 2);
      }
      p.moveTo(cx + rx * 0.86, cy);
      p.ellipse(cx, cy, rx * 0.86, ry * 0.86, 0, 0, Math.PI * 2);
      break;
    }
    default:
      p.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  }
  return p;
}

function tailPath(b: ComicBalloon): Path2D | null {
  if (!b.tail || b.style === 'thought') return null;
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  const a = Math.atan2(b.tail.y - cy, b.tail.x - cx);
  const half = Math.min(b.w, b.h) * b.tailW;
  const bx = cx + Math.cos(a) * b.w * 0.3, by = cy + Math.sin(a) * b.h * 0.3;
  const p = new Path2D();
  p.moveTo(bx + Math.cos(a + Math.PI / 2) * half, by + Math.sin(a + Math.PI / 2) * half);
  p.quadraticCurveTo((bx + b.tail.x) / 2, (by + b.tail.y) / 2, b.tail.x, b.tail.y);
  p.quadraticCurveTo((bx + b.tail.x) / 2 + Math.cos(a - Math.PI / 2) * half * 0.3, (by + b.tail.y) / 2 + Math.sin(a - Math.PI / 2) * half * 0.3, bx + Math.cos(a - Math.PI / 2) * half, by + Math.sin(a - Math.PI / 2) * half);
  p.closePath();
  return p;
}

export function fontOf(b: ComicBalloon) {
  return `${b.italic ? 'italic ' : ''}${b.bold ? 'bold ' : ''}${b.size}px ${b.font}`;
}

export function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    const words = para.split(/\s+/);
    let line = '';
    for (const w of words) {
      const t = line ? line + ' ' + w : w;
      if (ctx.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t;
    }
    out.push(line);
  }
  return out;
}

function drawBalloonText(ctx: CanvasRenderingContext2D, b: ComicBalloon) {
  ctx.save();
  ctx.font = fontOf(b);
  ctx.fillStyle = b.color;
  const c2 = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
  if ('letterSpacing' in c2) c2.letterSpacing = b.letterSp + 'px';
  const inset = b.style === 'narration' || b.style === 'angular' ? b.pad : b.pad + Math.min(b.w, b.h) * 0.08;
  const lh = b.size * b.lineH;
  ctx.beginPath();
  ctx.rect(b.x, b.y, b.w, b.h);
  ctx.clip();
  if (b.vertical) {
    // vertical lettering: columns right → left, characters top → bottom
    const cols = b.text.split('\n');
    const colW = lh;
    const totalW = cols.length * colW;
    let x = b.x + b.w / 2 + totalW / 2 - colW / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const col of cols) {
      const chars = [...col];
      const totalH = chars.length * b.size * 1.05;
      let y = b.y + b.h / 2 - totalH / 2 + b.size / 2;
      for (const ch of chars) { ctx.fillText(ch, x, y); y += b.size * 1.05; }
      x -= colW;
    }
  } else {
    const lines = wrapLines(ctx, b.text, Math.max(10, b.w - inset * 2));
    const total = lines.length * lh;
    let y = b.y + b.h / 2 - total / 2 + lh / 2;
    ctx.textBaseline = 'middle';
    ctx.textAlign = b.align;
    const x = b.align === 'left' ? b.x + inset : b.align === 'right' ? b.x + b.w - inset : b.x + b.w / 2;
    for (const l of lines) { ctx.fillText(l, x, y); y += lh; }
  }
  ctx.restore();
}

function drawBalloon(ctx: CanvasRenderingContext2D, b: ComicBalloon, byId: Map<string, ComicObject>) {
  const rnd = mulberry32(parseInt(b.id.replace(/\D/g, '').slice(0, 8) || '7', 10));
  const body = balloonOutline(b, rnd);
  const tail = tailPath(b);
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineWidth = b.strokeW;
  ctx.strokeStyle = b.stroke;
  ctx.fillStyle = b.fill;
  if (b.style === 'whisper') ctx.setLineDash([b.strokeW * 3, b.strokeW * 2.5]);
  // connected dialogue: a band between linked balloons
  const other = b.link ? byId.get(b.link) : null;
  let band: Path2D | null = null;
  if (other && other.type === 'balloon') {
    const ax = b.x + b.w / 2, ay = b.y + b.h / 2, bx = other.x + other.w / 2, by = other.y + other.h / 2;
    const a = Math.atan2(by - ay, bx - ax), hw = Math.min(b.h, other.h) * 0.16;
    band = new Path2D();
    band.moveTo(ax + Math.cos(a + Math.PI / 2) * hw, ay + Math.sin(a + Math.PI / 2) * hw);
    band.lineTo(bx + Math.cos(a + Math.PI / 2) * hw, by + Math.sin(a + Math.PI / 2) * hw);
    band.lineTo(bx + Math.cos(a - Math.PI / 2) * hw, by + Math.sin(a - Math.PI / 2) * hw);
    band.lineTo(ax + Math.cos(a - Math.PI / 2) * hw, ay + Math.sin(a - Math.PI / 2) * hw);
    band.closePath();
  }
  if (tail) ctx.stroke(tail);
  if (band) ctx.stroke(band);
  ctx.stroke(body);
  if (tail) ctx.fill(tail);
  if (band) ctx.fill(band);
  ctx.fill(body);
  if (b.style === 'thought' && b.tail) {
    // trailing thought bubbles
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    for (let i = 1; i <= 3; i++) {
      const t = 0.45 + i * 0.18;
      const x = cx + (b.tail.x - cx) * t, y = cy + (b.tail.y - cy) * t;
      const r = Math.min(b.w, b.h) * (0.1 - i * 0.022);
      ctx.beginPath(); ctx.arc(x, y, Math.max(3, r), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
  }
  ctx.restore();
  drawBalloonText(ctx, b);
}

// ---------------------------------------------------------------- manga effects
function clipFx(ctx: CanvasRenderingContext2D, f: ComicFx) {
  ctx.beginPath();
  if (f.pts && f.pts.length >= 6) polyPath(ctx, f.pts, 0);
  else ctx.rect(f.x, f.y, f.w, f.h);
  ctx.clip();
}

function drawTone(ctx: CanvasRenderingContext2D, f: ComicFx, fade: number) {
  const cell = 4 + f.scale * 6;
  const a = (f.angle * Math.PI) / 180;
  const cx = f.x + f.w / 2, cy = f.y + f.h / 2;
  const R = Math.hypot(f.w, f.h) / 2 + cell;
  const ca = Math.cos(a), sa = Math.sin(a);
  ctx.fillStyle = f.color;
  ctx.beginPath();
  for (let v = -R; v <= R; v += cell) {
    for (let u = -R; u <= R; u += cell) {
      const x = cx + u * ca - v * sa, y = cy + u * sa + v * ca;
      if (x < f.x - cell || y < f.y - cell || x > f.x + f.w + cell || y > f.y + f.h + cell) continue;
      // gradient along the rotated v-axis (top → bottom)
      const t = (v + R) / (2 * R);
      const k = fade > 0 ? Math.max(0, 1 - t * fade * 1.15) : 1;
      const r = Math.sqrt(f.density) * cell * 0.62 * k;
      if (r < 0.25) continue;
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, Math.PI * 2);
    }
  }
  ctx.fill();
}

function drawHatch(ctx: CanvasRenderingContext2D, f: ComicFx, angles: number[]) {
  const sp = Math.max(2, (1.15 - f.density) * 18 * f.scale);
  const R = Math.hypot(f.w, f.h);
  const cx = f.x + f.w / 2, cy = f.y + f.h / 2;
  ctx.strokeStyle = f.color;
  ctx.lineWidth = Math.max(0.6, f.scale * (0.6 + f.density));
  const rnd = mulberry32(f.seed);
  ctx.beginPath();
  for (const deg of angles) {
    const a = (deg * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
    for (let v = -R; v <= R; v += sp) {
      const j = (rnd() - 0.5) * sp * 0.25;
      ctx.moveTo(cx - R * ca - (v + j) * sa, cy - R * sa + (v + j) * ca);
      ctx.lineTo(cx + R * ca - (v + j) * sa, cy + R * sa + (v + j) * ca);
    }
  }
  ctx.stroke();
}

function wedge(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, w0: number, w1: number) {
  const a = Math.atan2(y1 - y0, x1 - x0), nx = -Math.sin(a), ny = Math.cos(a);
  ctx.moveTo(x0 + nx * w0, y0 + ny * w0);
  ctx.lineTo(x1 + nx * w1, y1 + ny * w1);
  ctx.lineTo(x1 - nx * w1, y1 - ny * w1);
  ctx.lineTo(x0 - nx * w0, y0 - ny * w0);
  ctx.closePath();
}

function drawFx(ctx: CanvasRenderingContext2D, f: ComicFx) {
  const rnd = mulberry32(f.seed);
  const cx = f.x + f.w / 2, cy = f.y + f.h / 2;
  ctx.save();
  ctx.globalAlpha *= f.opacity;
  ctx.fillStyle = f.color;
  ctx.strokeStyle = f.color;
  switch (f.kind) {
    case 'speed': {
      clipFx(ctx, f);
      const a = (f.angle * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
      const R = Math.hypot(f.w, f.h) / 2;
      const n = Math.round(10 + f.density * 140);
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const v = (rnd() * 2 - 1) * R;
        const len = R * (0.4 + rnd() * 1.2);
        const u = (rnd() * 2 - 1) * R;
        const w = f.scale * (0.4 + rnd() * 1.8);
        const x0 = cx + (u - len / 2) * ca - v * sa, y0 = cy + (u - len / 2) * sa + v * ca;
        const x1 = cx + (u + len / 2) * ca - v * sa, y1 = cy + (u + len / 2) * sa + v * ca;
        const xm = (x0 + x1) / 2, ym = (y0 + y1) / 2;
        wedge(ctx, x0, y0, xm, ym, 0.05, w);
        wedge(ctx, xm, ym, x1, y1, w, 0.05);
      }
      ctx.fill();
      break;
    }
    case 'focus':
    case 'impact': {
      clipFx(ctx, f);
      const R = Math.hypot(f.w, f.h);
      const n = Math.round(40 + f.density * 260);
      const inner = f.kind === 'focus' ? 0.32 + (1 - f.density) * 0.25 : 0.05;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const a = rnd() * Math.PI * 2;
        const ri = inner * (0.85 + rnd() * 0.5);
        const w = f.scale * (1 + rnd() * 4);
        const x0 = cx + Math.cos(a) * R, y0 = cy + Math.sin(a) * R;
        const x1 = cx + (Math.cos(a) * f.w * ri) / 1, y1 = cy + (Math.sin(a) * f.h * ri) / 1;
        if (f.kind === 'focus') wedge(ctx, x0, y0, x1, y1, w, 0.05);
        else wedge(ctx, x1, y1, x0, y0, 0.05, w * 1.6);
      }
      ctx.fill();
      break;
    }
    case 'burst': {
      const n = Math.round(10 + f.density * 22);
      ctx.beginPath();
      for (let i = 0; i < n * 2; i++) {
        const a = (i / (n * 2)) * Math.PI * 2;
        const k = i % 2 ? 0.55 + rnd() * 0.1 : 0.9 + rnd() * 0.12;
        const x = cx + (Math.cos(a) * f.w * k) / 2, y = cy + (Math.sin(a) * f.h * k) / 2;
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.closePath();
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.lineWidth = f.scale * 2;
      ctx.lineJoin = 'miter';
      ctx.stroke();
      break;
    }
    case 'tone':
      clipFx(ctx, f);
      drawTone(ctx, f, f.contrast);
      break;
    case 'gradient':
      clipFx(ctx, f);
      drawTone(ctx, f, Math.max(0.6, f.contrast));
      break;
    case 'hatch':
      clipFx(ctx, f);
      drawHatch(ctx, f, [f.angle]);
      break;
    case 'cross':
      clipFx(ctx, f);
      drawHatch(ctx, f, [f.angle, f.angle + 90]);
      break;
    case 'sweat': {
      const n = 1 + Math.round(f.density * 3);
      ctx.lineWidth = Math.max(1, f.scale * 1.6);
      for (let i = 0; i < n; i++) {
        const s = Math.min(f.w, f.h) * (0.35 + rnd() * 0.25) * (i ? 0.7 : 1);
        const x = f.x + f.w * (0.25 + rnd() * 0.5), y = f.y + f.h * (0.2 + rnd() * 0.55);
        ctx.beginPath();
        ctx.moveTo(x, y - s * 0.6);
        ctx.bezierCurveTo(x + s * 0.55, y + s * 0.05, x + s * 0.35, y + s * 0.5, x, y + s * 0.5);
        ctx.bezierCurveTo(x - s * 0.35, y + s * 0.5, x - s * 0.55, y + s * 0.05, x, y - s * 0.6);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x - s * 0.12, y + s * 0.18, s * 0.08, 0, Math.PI * 2);
        ctx.fillStyle = f.color;
        ctx.fill();
      }
      break;
    }
    case 'shock': {
      const n = 2 + Math.round(f.density * 4);
      ctx.lineWidth = f.scale * 2;
      ctx.lineJoin = 'miter';
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (i - (n - 1) / 2) * 0.35;
        const len = Math.min(f.w, f.h) * (0.35 + rnd() * 0.15);
        ctx.beginPath();
        let x = cx + Math.cos(a) * len * 0.35, y = cy + f.h * 0.25 + Math.sin(a) * len * 0.35;
        ctx.moveTo(x, y);
        for (let k = 0; k < 4; k++) {
          const s = len / 4, side = k % 2 ? 1 : -1;
          x += Math.cos(a) * s + Math.cos(a + Math.PI / 2) * s * 0.35 * side;
          y += Math.sin(a) * s + Math.sin(a + Math.PI / 2) * s * 0.35 * side;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      break;
    }
    case 'emphasis': {
      const n = 6 + Math.round(f.density * 10);
      ctx.lineCap = 'round';
      ctx.lineWidth = f.scale * 2;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rnd() * 0.2;
        const r0 = Math.min(f.w, f.h) * 0.3, r1 = r0 + Math.min(f.w, f.h) * (0.12 + rnd() * 0.08);
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
        ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
        ctx.stroke();
      }
      // sparkle
      const s = Math.min(f.w, f.h) * 0.16;
      ctx.beginPath();
      ctx.moveTo(cx, cy - s); ctx.quadraticCurveTo(cx, cy, cx + s, cy); ctx.quadraticCurveTo(cx, cy, cx, cy + s);
      ctx.quadraticCurveTo(cx, cy, cx - s, cy); ctx.quadraticCurveTo(cx, cy, cx, cy - s);
      ctx.fill();
      break;
    }
  }
  ctx.restore();
}

function drawPanel(ctx: CanvasRenderingContext2D, o: ComicPanel) {
  const p = panelPath(o);
  ctx.save();
  if (o.fill) { ctx.fillStyle = o.fill; ctx.fill(p); }
  if (o.border > 0) {
    ctx.lineWidth = o.border;
    ctx.strokeStyle = o.color;
    ctx.lineJoin = o.radius > 0 ? 'round' : 'miter';
    ctx.stroke(p);
  }
  ctx.restore();
}

export function drawComicObjects(ctx: CanvasRenderingContext2D, objs: ComicObject[]) {
  if (!objs.length) return;
  const byId = new Map(objs.map((o) => [o.id, o]));
  for (const o of sortForDraw(objs)) {
    if (o.type === 'fx') drawFx(ctx, o);
    else if (o.type === 'panel') drawPanel(ctx, o);
    else drawBalloon(ctx, o, byId);
  }
}

// ---------------------------------------------------------------- PDF export (multi-page, JPEG images)
export function makePdf(pages: { jpeg: Uint8Array; w: number; h: number; wPt: number; hPt: number }[]): Uint8Array {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let pos = 0;
  const push = (b: Uint8Array | string) => { const u = typeof b === 'string' ? enc.encode(b) : b; chunks.push(u); pos += u.length; };
  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  const n = pages.length;
  // object ids: 1 catalog, 2 pages, then per page: page, content, image
  const pageId = (i: number) => 3 + i * 3;
  const obj = (id: number, body: () => void) => { offsets[id] = pos; push(`${id} 0 obj\n`); body(); push('\nendobj\n'); };
  obj(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'));
  obj(2, () => push(`<< /Type /Pages /Count ${n} /Kids [${pages.map((_, i) => `${pageId(i)} 0 R`).join(' ')}] >>`));
  pages.forEach((p, i) => {
    const pid = pageId(i), cid = pid + 1, iid = pid + 2;
    obj(pid, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${p.wPt.toFixed(2)} ${p.hPt.toFixed(2)}] /Resources << /XObject << /Im${i} ${iid} 0 R >> >> /Contents ${cid} 0 R >>`));
    const content = `q ${p.wPt.toFixed(2)} 0 0 ${p.hPt.toFixed(2)} 0 0 cm /Im${i} Do Q`;
    obj(cid, () => push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`));
    obj(iid, () => {
      push(`<< /Type /XObject /Subtype /Image /Width ${p.w} /Height ${p.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`);
      push(p.jpeg);
      push('\nendstream');
    });
  });
  const total = 3 + n * 3;
  const xref = pos;
  let x = `xref\n0 ${total}\n0000000000 65535 f \n`;
  for (let i = 1; i < total; i++) x += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
  push(x);
  push(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const out = new Uint8Array(pos);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

export interface ComicPageMeta { id: string; name: string; index: number; bleed: number; safe: number; pageName: string }
