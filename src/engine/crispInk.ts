import type { BrushParams, InkStroke } from './types';
import { clamp, uid } from './util';
import { SAMPLE_STRIDE } from './strokeRenderer';

interface Geo {
  path: Path2D;
  center: number[]; // x, y, width triples
  bounds: { x: number; y: number; w: number; h: number };
}
const geoCache = new WeakMap<InkStroke, Geo>();

/** Catmull-Rom densification of control points: returns x,y,p triples. */
export function densify(pts: number[], step = 2): number[] {
  const n = pts.length / 3;
  if (n < 2) return pts.slice();
  const out: number[] = [];
  const P = (i: number) => {
    const k = clamp(i, 0, n - 1) * 3;
    return [pts[k], pts[k + 1], pts[k + 2]];
  };
  for (let i = 0; i < n - 1; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const steps = clamp(Math.ceil(len / step), 1, 64);
    for (let s = 0; s < steps; s++) {
      const t = s / steps, t2 = t * t, t3 = t2 * t;
      const cr = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push(cr(p0[0], p1[0], p2[0], p3[0]), cr(p0[1], p1[1], p2[1], p3[1]), p1[2] + (p2[2] - p1[2]) * t);
    }
  }
  const l = P(n - 1);
  out.push(l[0], l[1], l[2]);
  return out;
}

export function inkGeometry(st: InkStroke): Geo {
  const hit = geoCache.get(st);
  if (hit) return hit;
  const d = densify(st.pts, 1.5);
  const n = d.length / 3;
  const path = new Path2D();
  const center: number[] = [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const cum: number[] = [0];
  for (let i = 1; i < n; i++) cum.push(cum[i - 1] + Math.hypot(d[i * 3] - d[i * 3 - 3], d[i * 3 + 1] - d[i * 3 - 2]));
  const L = cum[n - 1] || 0;
  const tS = st.taperStart * Math.min(L * 0.45, st.size * 12);
  const tE = st.taperEnd * Math.min(L * 0.45, st.size * 12);
  const widths: number[] = [];
  for (let i = 0; i < n; i++) {
    let w = st.size * d[i * 3 + 2];
    const s = cum[i];
    if (tS > 0 && s < tS) w *= Math.max(0.06, Math.sqrt(s / tS));
    if (tE > 0 && L - s < tE) w *= Math.max(0.06, Math.sqrt((L - s) / tE));
    widths.push(Math.max(0.25, w));
  }
  if (n === 1 || L < 0.5) {
    const r = widths[0] / 2;
    path.arc(d[0], d[1], r, 0, Math.PI * 2);
    center.push(d[0], d[1], widths[0]);
    const g = { path, center, bounds: { x: d[0] - r, y: d[1] - r, w: r * 2, h: r * 2 } };
    geoCache.set(st, g);
    return g;
  }
  const left: number[] = [], right: number[] = [], angs: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
    let tx = d[b * 3] - d[a * 3], ty = d[b * 3 + 1] - d[a * 3 + 1];
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl; ty /= tl;
    const nx = -ty, ny = tx;
    const r = widths[i] / 2;
    const x = d[i * 3], y = d[i * 3 + 1];
    left.push(x + nx * r, y + ny * r);
    right.push(x - nx * r, y - ny * r);
    angs.push(Math.atan2(ny, nx));
    center.push(x, y, widths[i]);
    minX = Math.min(minX, x - r); minY = Math.min(minY, y - r);
    maxX = Math.max(maxX, x + r); maxY = Math.max(maxY, y + r);
  }
  path.moveTo(left[0], left[1]);
  for (let i = 1; i < n; i++) path.lineTo(left[i * 2], left[i * 2 + 1]);
  const e = n - 1;
  path.arc(d[e * 3], d[e * 3 + 1], widths[e] / 2, angs[e], angs[e] - Math.PI, true);
  for (let i = n - 1; i >= 0; i--) path.lineTo(right[i * 2], right[i * 2 + 1]);
  path.arc(d[0], d[1], widths[0] / 2, angs[0] + Math.PI, angs[0], true);
  path.closePath();
  const g = { path, center, bounds: { x: minX, y: minY, w: maxX - minX, h: maxY - minY } };
  geoCache.set(st, g);
  return g;
}

/** Export Crisp Ink's pressure/taper outline as a real SVG vector path. */
export function inkStrokeSvgPath(st: InkStroke): string {
  const d = densify(st.pts, 1.5);
  const n = Math.floor(d.length / 3);
  if (!n) return '';
  let length = 0;
  const cumulative = [0];
  for (let i = 1; i < n; i++) {
    length += Math.hypot(d[i * 3] - d[i * 3 - 3], d[i * 3 + 1] - d[i * 3 - 2]);
    cumulative.push(length);
  }
  const taperStart = st.taperStart * Math.min(length * 0.45, st.size * 12);
  const taperEnd = st.taperEnd * Math.min(length * 0.45, st.size * 12);
  const widths: number[] = [];
  for (let i = 0; i < n; i++) {
    let width = st.size * d[i * 3 + 2];
    if (taperStart > 0 && cumulative[i] < taperStart) width *= Math.max(0.06, Math.sqrt(cumulative[i] / taperStart));
    if (taperEnd > 0 && length - cumulative[i] < taperEnd) width *= Math.max(0.06, Math.sqrt((length - cumulative[i]) / taperEnd));
    widths.push(Math.max(0.25, width));
  }
  const fmt = (v: number) => (Math.round(v * 1000) / 1000).toString();
  if (n === 1 || length < 0.5) {
    const x = d[0], y = d[1], r = widths[0] / 2;
    return `M${fmt(x + r)} ${fmt(y)}A${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(x - r)} ${fmt(y)}A${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(x + r)} ${fmt(y)}Z`;
  }
  const left: number[] = [], right: number[] = [], angle: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
    let tx = d[b * 3] - d[a * 3], ty = d[b * 3 + 1] - d[a * 3 + 1];
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl; ty /= tl;
    const nx = -ty, ny = tx, r = widths[i] / 2, x = d[i * 3], y = d[i * 3 + 1];
    left.push(x + nx * r, y + ny * r);
    right.push(x - nx * r, y - ny * r);
    angle.push(Math.atan2(ny, nx));
  }
  const outline: number[] = [left[0], left[1]];
  for (let i = 1; i < n; i++) outline.push(left[i * 2], left[i * 2 + 1]);
  const end = n - 1, capSteps = 12;
  for (let i = 1; i <= capSteps; i++) {
    const a = angle[end] - Math.PI * i / capSteps, r = widths[end] / 2;
    outline.push(d[end * 3] + Math.cos(a) * r, d[end * 3 + 1] + Math.sin(a) * r);
  }
  for (let i = n - 2; i >= 0; i--) outline.push(right[i * 2], right[i * 2 + 1]);
  for (let i = 1; i <= capSteps; i++) {
    const a = angle[0] + Math.PI - Math.PI * i / capSteps, r = widths[0] / 2;
    outline.push(d[0] + Math.cos(a) * r, d[1] + Math.sin(a) * r);
  }
  return `M${fmt(outline[0])} ${fmt(outline[1])}${outline.slice(2).reduce((path, value, i) => i % 2 ? `${path} ${fmt(value)}` : `${path}L${fmt(value)}`, '')}Z`;
}

export function drawInkStroke(ctx: CanvasRenderingContext2D, st: InkStroke) {
  const g = inkGeometry(st);
  ctx.globalAlpha = st.opacity;
  ctx.fillStyle = st.color;
  ctx.fill(g.path, 'nonzero');
  ctx.globalAlpha = 1;
}

/** Ramer–Douglas–Peucker simplification on x,y,p triples. */
export function simplify(pts: number[], eps: number): number[] {
  const n = pts.length / 3;
  if (n <= 2) return pts.slice();
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const stack: [number, number][] = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const ax = pts[a * 3], ay = pts[a * 3 + 1], bx = pts[b * 3], by = pts[b * 3 + 1];
    let best = -1, bd = 0;
    for (let i = a + 1; i < b; i++) {
      const dd = segDist(pts[i * 3], pts[i * 3 + 1], ax, ay, bx, by) + Math.abs(pts[i * 3 + 2] - (pts[a * 3 + 2] + pts[b * 3 + 2]) / 2) * 2;
      if (dd > bd) { bd = dd; best = i; }
    }
    if (best >= 0 && bd > eps) {
      keep[best] = 1;
      stack.push([a, best], [best, b]);
    }
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]);
  return out;
}

export function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax, dy = by - ay;
  const l = dx * dx + dy * dy;
  let t = l ? ((px - ax) * dx + (py - ay) * dy) / l : 0;
  t = clamp(t, 0, 1);
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Convert raw pointer samples into an editable Crisp Ink stroke. */
export function makeInkStroke(samples: number[], brush: BrushParams, color: string, pressureFromMouse: boolean): InkStroke {
  const n = Math.floor(samples.length / SAMPLE_STRIDE);
  const pts: number[] = [];
  const k = 1 - brush.smoothing * 0.85;
  let sx = samples[0], sy = samples[1];
  for (let i = 0; i < n; i++) {
    const j = i * SAMPLE_STRIDE;
    sx += (samples[j] - sx) * k;
    sy += (samples[j + 1] - sy) * k;
    let p = samples[j + 2];
    p = brush.pressureSize > 0 ? 1 - brush.pressureSize * (1 - (brush.minSize + (1 - brush.minSize) * p)) : 1;
    if (pressureFromMouse) p = 1;
    pts.push(sx, sy, p);
  }
  if (n > 1) {
    const j = (n - 1) * SAMPLE_STRIDE;
    pts.push(samples[j], samples[j + 1], pts[pts.length - 1]);
  }
  return {
    id: uid('ink-'),
    pts: simplify(pts, 0.6).map((v) => Math.round(v * 100) / 100),
    color,
    size: brush.size,
    opacity: brush.opacity,
    taperStart: brush.taperStart,
    taperEnd: brush.taperEnd,
  };
}

export function hitInk(strokes: InkStroke[], x: number, y: number, tol: number): InkStroke | null {
  for (let i = strokes.length - 1; i >= 0; i--) {
    const g = inkGeometry(strokes[i]);
    const b = g.bounds;
    if (x < b.x - tol || y < b.y - tol || x > b.x + b.w + tol || y > b.y + b.h + tol) continue;
    const c = g.center;
    for (let j = 0; j < c.length / 3 - 1; j++) {
      const w = Math.max(c[j * 3 + 2], c[j * 3 + 5]) / 2;
      if (segDist(x, y, c[j * 3], c[j * 3 + 1], c[j * 3 + 3], c[j * 3 + 4]) <= w + tol) return strokes[i];
    }
    if (c.length === 3 && Math.hypot(x - c[0], y - c[1]) <= c[2] / 2 + tol) return strokes[i];
  }
  return null;
}

/** Erase Crisp Ink along an eraser path. whole=true removes touched strokes; otherwise splits them. */
export function eraseInk(strokes: InkStroke[], path: number[], radius: number, whole: boolean): InkStroke[] | null {
  let changed = false;
  const out: InkStroke[] = [];
  const near = (x: number, y: number, extra: number) => {
    for (let i = 0; i < path.length; i += 2) {
      if (i + 2 < path.length) {
        if (segDist(x, y, path[i], path[i + 1], path[i + 2], path[i + 3]) <= radius + extra) return true;
      } else if (Math.hypot(x - path[i], y - path[i + 1]) <= radius + extra) return true;
    }
    return false;
  };
  for (const st of strokes) {
    const g = inkGeometry(st);
    const b = g.bounds;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < path.length; i += 2) {
      minX = Math.min(minX, path[i]); maxX = Math.max(maxX, path[i]);
      minY = Math.min(minY, path[i + 1]); maxY = Math.max(maxY, path[i + 1]);
    }
    if (maxX + radius < b.x || minX - radius > b.x + b.w || maxY + radius < b.y || minY - radius > b.y + b.h) {
      out.push(st);
      continue;
    }
    if (whole) {
      const c = g.center;
      let hit = false;
      for (let j = 0; j < c.length; j += 3) if (near(c[j], c[j + 1], c[j + 2] / 2)) { hit = true; break; }
      if (hit) changed = true;
      else out.push(st);
      continue;
    }
    const dense = densify(st.pts, 1.5);
    const runs: number[][] = [];
    let cur: number[] = [];
    let cut = false;
    for (let j = 0; j < dense.length; j += 3) {
      if (near(dense[j], dense[j + 1], 0)) {
        cut = true;
        if (cur.length >= 6) runs.push(cur);
        cur = [];
      } else cur.push(dense[j], dense[j + 1], dense[j + 2]);
    }
    if (cur.length >= 6) runs.push(cur);
    if (!cut) {
      out.push(st);
      continue;
    }
    changed = true;
    runs.forEach((r, i) => {
      out.push({
        ...st,
        id: uid('ink-'),
        pts: simplify(r, 0.4).map((v) => Math.round(v * 100) / 100),
        taperStart: i === 0 && r[0] === dense[0] && r[1] === dense[1] ? st.taperStart : 0,
        taperEnd: i === runs.length - 1 && r[r.length - 3] === dense[dense.length - 3] ? st.taperEnd : 0,
      });
    });
  }
  return changed ? out : null;
}

export function transformInk(st: InkStroke, m: number[]): InkStroke {
  const pts = st.pts.slice();
  for (let i = 0; i < pts.length; i += 3) {
    const x = pts[i], y = pts[i + 1];
    pts[i] = m[0] * x + m[2] * y + m[4];
    pts[i + 1] = m[1] * x + m[3] * y + m[5];
  }
  const sc = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
  return { ...st, pts, size: st.size * sc };
}

export function inkBounds(strokes: InkStroke[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of strokes) {
    const b = inkGeometry(s).bounds;
    minX = Math.min(minX, b.x); minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w); maxY = Math.max(maxY, b.y + b.h);
  }
  if (minX === Infinity) return null;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
