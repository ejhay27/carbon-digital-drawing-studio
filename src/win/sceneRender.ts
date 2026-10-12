// Spatial Ink Lab / Continuum shared 3D core (Windows edition).
// Pure scene data (JSON, saved in manifest.extensions.scene3d) → three.js objects, plus a headless renderer
// used for "render to layer", Orbit-to-Comic panel captures and the automated tests.
import * as THREE from 'three';
import { create } from 'zustand';
import type { CamView } from '../engine/types';
import type { DocEngine } from '../engine/document';
import { loadImage, uid } from '../engine/util';
import { getApp } from '../state/store';
import { readThemeToken } from '../theme/themeTokens';

export type V3 = [number, number, number];
export type Kind = 'cube' | 'sphere' | 'cylinder' | 'cone' | 'plane' | 'torus' | 'curve' | 'image';
export type Geo = 'line' | 'tube' | 'ribbon' | 'sweep' | 'surface';
export interface Mat { color: string; roughness: number; metalness: number; opacity: number }
export interface Curve {
  pts: number[]; type: 'catmull' | 'bezier' | 'poly'; closed: boolean; geo: Geo; thickness: number; width: number; segments: number; radial: number; normal: V3; taper?: number;
  /** Optional 2D-brush snapshot metadata for variable-width, textured 3D ribbons. */
  pressures?: number[]; pressureSize?: number; minSize?: number; brushAsset?: string; brushId?: string; brushName?: string;
}
export interface Obj {
  id: string; name: string; kind: Kind; pos: V3; rot: V3; scale: V3; mat: Mat; visible: boolean;
  paint?: string; curve?: Curve;
  parent?: string; // surface strokes live in their target object's local space
  guideId?: string; // drawing strokes are local to their immutable creation-time guide
  asset?: string; aspect?: number; source?: 'canvas' | 'file'; // reference image planes (doc.assets id)
}
export interface Light { id: string; type: 'dir' | 'point'; color: string; intensity: number; pos: V3; shadow: boolean }
export type PlaneMode = 'xz' | 'xy' | 'yz' | 'view' | 'custom';
/** Legacy drawing plane settings retained only for old-project migration. */
export interface DrawPlane { mode: PlaneMode; offset: number; pos: V3; rot: V3 }
export interface DrawingGuide {
  id: string; name: string; origin: V3; normal: V3; up: V3; size: [number, number]; visible: boolean;
}
export interface Sym { mirror: { x: boolean; y: boolean; z: boolean }; radial: number; axis: 'x' | 'y' | 'z'; center: V3 }
export interface SavedView { id: string; name: string; view: CamView }
export interface Scene3D {
  version: 1; bg: string; ambient: number; lights: Light[]; objects: Obj[]; grid: boolean; axes: boolean;
  gridSize: number; snap: boolean; ortho: boolean;
  /** Fixed, reusable world-space drawing surfaces. Missing guide fields are migrated from legacy draw settings. */
  guides?: DrawingGuide[]; activeGuideId?: string | null;
  /** Deprecated environment preferences accepted for old project compatibility; no ground mesh is rendered. */
  ground?: boolean; groundColor?: string; groundShadow?: boolean;
  draw: DrawPlane; sym: Sym; views: SavedView[]; camera?: CamView;
  // legacy 2.0/2.1 fields (read for migration)
  plane?: 'xz' | 'xy' | 'yz'; planeOffset?: number; symmetry?: boolean;
}

export const MAT_PRESETS: Record<string, Mat> = {
  Clay: { color: '#d8c3a5', roughness: 0.9, metalness: 0, opacity: 1 }, Plastic: { color: '#3d8bfd', roughness: 0.35, metalness: 0, opacity: 1 },
  Metal: { color: '#b8bcc4', roughness: 0.25, metalness: 1, opacity: 1 }, Gold: { color: '#e5b94e', roughness: 0.2, metalness: 1, opacity: 1 },
  Rubber: { color: '#222222', roughness: 1, metalness: 0, opacity: 1 }, Glass: { color: '#cfe8ff', roughness: 0.05, metalness: 0, opacity: 0.35 },
  Chalk: { color: '#f4f1ea', roughness: 1, metalness: 0, opacity: 1 }, Ink: { color: '#111111', roughness: 0.6, metalness: 0, opacity: 1 },
};

export const DEFAULT_VIEW: CamView = { pos: [4, 3.5, 5], target: [0, 0.5, 0], ortho: false, zoom: 1, fov: 45 };

export function defaultScene(): Scene3D {
  return {
    version: 1, bg: '#c5c9cf', ambient: 0.75, grid: false, axes: false, gridSize: 0.25, snap: false, ortho: false,
    // The neutral scene backdrop is independent of the reusable drawing surfaces below.
    ground: false, groundColor: '#c5c9cf', groundShadow: false,
    lights: [{ id: uid('lt'), type: 'dir', color: '#ffffff', intensity: 2.2, pos: [4, 7, 5], shadow: false }],
    objects: [], guides: [], activeGuideId: null,
    // Retained for migration and legacy symmetry. New strokes bind to a DrawingGuide instead.
    draw: { mode: 'xz', offset: 0, pos: [0, 0, 0], rot: [0, 0, 0] },
    sym: { mirror: { x: false, y: false, z: false }, radial: 1, axis: 'y', center: [0, 0, 0] },
    views: [],
  };
}

const isV3 = (value: unknown): value is V3 => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);

/** Orthonormal frame used by guides: local +Z is the guide normal and local +Y is its up. */
export function guideFrame(guide: Pick<DrawingGuide, 'normal' | 'up'>) {
  const normal = new THREE.Vector3(...(isV3(guide.normal) ? guide.normal : [0, 0, 1])).normalize();
  if (normal.lengthSq() < 1e-12) normal.set(0, 0, 1);
  const up = new THREE.Vector3(...(isV3(guide.up) ? guide.up : [0, 1, 0]));
  up.addScaledVector(normal, -up.dot(normal));
  if (up.lengthSq() < 1e-8) {
    up.set(0, 1, 0);
    if (Math.abs(up.dot(normal)) > 0.98) up.set(1, 0, 0);
    up.addScaledVector(normal, -up.dot(normal));
  }
  up.normalize();
  const right = new THREE.Vector3().crossVectors(up, normal).normalize();
  up.crossVectors(normal, right).normalize();
  return { right, up, normal };
}

export function normalizeDrawingGuide(value: unknown, index = 0): DrawingGuide | null {
  if (!value || typeof value !== 'object') return null;
  const g = value as Partial<DrawingGuide>;
  if (typeof g.id !== 'string' || !g.id || !isV3(g.origin)) return null;
  const fallback = guideFrame({ normal: isV3(g.normal) ? g.normal : [0, 0, 1], up: isV3(g.up) ? g.up : [0, 1, 0] });
  const frame = guideFrame({ normal: fallback.normal.toArray() as V3, up: fallback.up.toArray() as V3 });
  const width = Array.isArray(g.size) && Number.isFinite(g.size[0]) ? Math.max(0.25, Math.min(1000, g.size[0])) : 8;
  const height = Array.isArray(g.size) && Number.isFinite(g.size[1]) ? Math.max(0.25, Math.min(1000, g.size[1])) : 6;
  return {
    id: g.id.slice(0, 128), name: typeof g.name === 'string' ? g.name.slice(0, 80) : `Guide ${index + 1}`,
    origin: g.origin.map(Number) as V3, normal: frame.normal.toArray() as V3, up: frame.up.toArray() as V3,
    size: [width, height], visible: g.visible !== false,
  };
}

export function guidePlane(guide: DrawingGuide): THREE.Plane {
  const frame = guideFrame(guide);
  return new THREE.Plane().setFromNormalAndCoplanarPoint(frame.normal, new THREE.Vector3(...guide.origin));
}

/** Create a guide whose origin and basis are frozen from the camera when the action occurs. */
export function createViewGuide(camera: THREE.Camera, target: THREE.Vector3 | V3, name = 'View guide', id = uid('guide')): DrawingGuide {
  camera.updateWorldMatrix(true, false);
  const origin = target instanceof THREE.Vector3 ? target.clone() : new THREE.Vector3(...target);
  const normal = camera.getWorldDirection(new THREE.Vector3()).negate().normalize();
  const worldUp = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.getWorldQuaternion(new THREE.Quaternion()));
  const frame = guideFrame({ normal: normal.toArray() as V3, up: worldUp.toArray() as V3 });
  return { id, name, origin: origin.toArray() as V3, normal: frame.normal.toArray() as V3, up: frame.up.toArray() as V3, size: [8, 6], visible: true };
}

export function guideLocalPoint(guide: DrawingGuide, world: THREE.Vector3 | V3): V3 {
  const point = world instanceof THREE.Vector3 ? world : new THREE.Vector3(...world);
  const frame = guideFrame(guide);
  const delta = point.clone().sub(new THREE.Vector3(...guide.origin));
  return [delta.dot(frame.right), delta.dot(frame.up), delta.dot(frame.normal)];
}

export function guideWorldPoint(guide: DrawingGuide, local: THREE.Vector3 | V3): V3 {
  const point = local instanceof THREE.Vector3 ? local : new THREE.Vector3(...local);
  const frame = guideFrame(guide);
  const world = new THREE.Vector3(...guide.origin)
    .addScaledVector(frame.right, point.x).addScaledVector(frame.up, point.y).addScaledVector(frame.normal, point.z);
  return world.toArray() as V3;
}

/** Build local-coordinate stroke points from pointer samples captured in world space. */
export function localizeGuideStroke(guide: DrawingGuide, worldPoints: number[]): number[] {
  if (worldPoints.length % 3 !== 0) throw new Error('Guide stroke coordinates must be XYZ triples.');
  const out: number[] = [];
  for (let i = 0; i < worldPoints.length; i += 3) out.push(...guideLocalPoint(guide, [worldPoints[i], worldPoints[i + 1], worldPoints[i + 2]]));
  return out;
}

/** Convert a legacy fixed plane into an explicit guide without moving existing world-space objects. */
export function guideFromLegacyPlane(draw: DrawPlane, view: CamView = DEFAULT_VIEW, id = uid('guide')): DrawingGuide {
  const camera = makeCamera(view, 1);
  let point = new THREE.Vector3(...draw.pos);
  let normal = new THREE.Vector3(0, 0, 1), up = new THREE.Vector3(0, 1, 0);
  if (draw.mode === 'xz') { normal.set(0, 1, 0); up.set(0, 0, -1); point.set(0, draw.offset, 0); }
  else if (draw.mode === 'xy') { normal.set(0, 0, 1); up.set(0, 1, 0); point.set(0, 0, draw.offset); }
  else if (draw.mode === 'yz') { normal.set(1, 0, 0); up.set(0, 1, 0); point.set(draw.offset, 0, 0); }
  else if (draw.mode === 'view') {
    camera.updateWorldMatrix(true, false);
    normal = camera.getWorldDirection(new THREE.Vector3()).negate().normalize();
    up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.getWorldQuaternion(new THREE.Quaternion()));
    point = new THREE.Vector3(...view.target).addScaledVector(normal, -draw.offset);
  } else {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...draw.rot));
    normal.set(0, 1, 0).applyQuaternion(q);
    up.set(0, 0, 1).applyQuaternion(q);
    point.addScaledVector(normal, draw.offset);
  }
  const frame = guideFrame({ normal: normal.toArray() as V3, up: up.toArray() as V3 });
  return { id, name: 'Migrated drawing guide', origin: point.toArray() as V3, normal: frame.normal.toArray() as V3, up: frame.up.toArray() as V3, size: [8, 6], visible: true };
}

/** Normalise / migrate scene JSON from any Carbon version (2.0, 2.1, 2.2, 7.x). */
export function sceneOf(raw: unknown): Scene3D {
  const s = raw as Partial<Scene3D> | null;
  if (!s || s.version !== 1 || !Array.isArray(s.objects)) return defaultScene();
  const d = defaultScene();
  const draw = s.draw && typeof s.draw === 'object' ? { ...d.draw, ...s.draw } : { ...d.draw, mode: s.plane || 'xz', offset: s.planeOffset || 0 };
  const guides = Array.isArray(s.guides)
    ? s.guides.map((guide, i) => normalizeDrawingGuide(guide, i)).filter((guide): guide is DrawingGuide => !!guide).slice(0, 128)
    : [guideFromLegacyPlane(draw, s.camera || DEFAULT_VIEW)].filter((guide): guide is DrawingGuide => !!guide);
  const activeGuideId = s.activeGuideId === null ? null
    : typeof s.activeGuideId === 'string' && guides.some((guide) => guide.id === s.activeGuideId) ? s.activeGuideId
      : guides[0]?.id || null;
  return {
    ...d, ...s,
    lights: Array.isArray(s.lights) ? s.lights : d.lights,
    objects: s.objects.filter((o) => !!o && typeof o === 'object').map((o) => {
      const curve = o.curve;
      if (!curve || typeof curve !== 'object' || !Array.isArray(curve.pts)) return o;
      const controlCount = Math.floor(curve.pts.length / 3);
      const pressures = Array.isArray(curve.pressures) && curve.pressures.length === controlCount && controlCount <= 100_000
        ? curve.pressures.map((pressure) => Number.isFinite(pressure) ? Math.max(0, Math.min(1, pressure)) : 1)
        : undefined;
      const brushAsset = typeof curve.brushAsset === 'string' && /^3d-brush-[a-zA-Z0-9_-]{1,32}$/.test(curve.brushAsset) ? curve.brushAsset : undefined;
      return {
        ...o,
        guideId: typeof o.guideId === 'string' ? o.guideId.slice(0, 128) : undefined,
        curve: {
          ...curve,
          pressures,
          pressureSize: Number.isFinite(curve.pressureSize) ? Math.max(0, Math.min(1, curve.pressureSize!)) : 0,
          minSize: Number.isFinite(curve.minSize) ? Math.max(0.02, Math.min(1, curve.minSize!)) : 0.08,
          brushAsset,
          brushId: typeof curve.brushId === 'string' ? curve.brushId.slice(0, 128) : undefined,
          brushName: typeof curve.brushName === 'string' ? curve.brushName.slice(0, 80) : undefined,
        },
      };
    }),
    guides, activeGuideId,
    draw,
    sym: s.sym && typeof s.sym === 'object' ? { ...d.sym, ...s.sym, mirror: { ...d.sym.mirror, ...(s.sym.mirror || {}) } } : { ...d.sym, mirror: { x: !!s.symmetry, y: false, z: false } },
    views: Array.isArray(s.views) ? s.views : [],
    // Legacy environment settings remain readable but no floor mesh is generated from them.
    ground: false,
    groundColor: typeof s.groundColor === 'string' ? s.groundColor : d.groundColor,
    groundShadow: false,
  } as Scene3D;
}



// ---------------------------------------------------------------- curve math
const v3 = (a: number[], i: number) => new THREE.Vector3(a[i * 3], a[i * 3 + 1], a[i * 3 + 2]);

export function curvePath(c: Curve): THREE.Curve<THREE.Vector3> {
  const v: THREE.Vector3[] = [];
  for (let i = 0; i + 2 < c.pts.length; i += 3) v.push(new THREE.Vector3(c.pts[i], c.pts[i + 1], c.pts[i + 2]));
  if (v.length === 0) v.push(new THREE.Vector3());
  if (v.length < 2) v.push(v[0].clone().add(new THREE.Vector3(0.001, 0, 0)));
  if (c.type === 'bezier' && v.length >= 4) {
    const p = new THREE.CurvePath<THREE.Vector3>();
    for (let i = 0; i + 3 < v.length; i += 3) p.add(new THREE.CubicBezierCurve3(v[i], v[i + 1], v[i + 2], v[i + 3]));
    return p;
  }
  if (c.type === 'poly') {
    const p = new THREE.CurvePath<THREE.Vector3>();
    for (let i = 0; i + 1 < v.length; i++) p.add(new THREE.LineCurve3(v[i], v[i + 1]));
    if (c.closed) p.add(new THREE.LineCurve3(v[v.length - 1], v[0]));
    return p;
  }
  return new THREE.CatmullRomCurve3(v, c.closed, 'centripetal');
}

/** 3D Ramer–Douglas–Peucker. Keeps endpoints; pts are flat x,y,z triples. */
export function simplify3(pts: number[], tol: number): number[] {
  const n = pts.length / 3;
  if (n <= 2) return pts.slice();
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const stack: [number, number][] = [[0, n - 1]];
  const seg = new THREE.Line3(), q = new THREE.Vector3(), cl = new THREE.Vector3();
  while (stack.length) {
    const [a, b] = stack.pop()!;
    seg.set(v3(pts, a), v3(pts, b));
    let best = -1, bd = 0;
    for (let i = a + 1; i < b; i++) {
      q.set(pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]);
      seg.closestPointToPoint(q, true, cl);
      const d = cl.distanceTo(q);
      if (d > bd) { bd = d; best = i; }
    }
    if (best >= 0 && bd > tol) { keep[best] = 1; stack.push([a, best], [best, b]); }
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]);
  return out;
}

/** Simplify stroke points and carry their corresponding stylus pressure samples with them. */
export function simplify3WithPressures(pts: number[], pressures: number[], tol: number): { pts: number[]; pressures: number[] } {
  const n = Math.floor(pts.length / 3);
  if (n <= 2) return { pts: pts.slice(0, n * 3), pressures: Array.from({ length: n }, (_, i) => Number.isFinite(pressures[i]) ? pressures[i] : 1) };
  const values = pressures.length === n ? pressures : Array.from({ length: n }, (_, i) => {
    if (!pressures.length) return 1;
    const at = n <= 1 ? 0 : (i / (n - 1)) * (pressures.length - 1);
    const left = Math.floor(at), right = Math.min(pressures.length - 1, left + 1);
    const a = Number.isFinite(pressures[left]) ? pressures[left] : 1;
    const b = Number.isFinite(pressures[right]) ? pressures[right] : a;
    return a + (b - a) * (at - left);
  });
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const stack: [number, number][] = [[0, n - 1]];
  const seg = new THREE.Line3(), q = new THREE.Vector3(), cl = new THREE.Vector3();
  while (stack.length) {
    const [a, b] = stack.pop()!;
    seg.set(v3(pts, a), v3(pts, b));
    let best = -1, bd = 0;
    for (let i = a + 1; i < b; i++) {
      q.set(pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]);
      seg.closestPointToPoint(q, true, cl);
      const d = cl.distanceTo(q);
      if (d > bd) { bd = d; best = i; }
    }
    if (best >= 0 && bd > tol) { keep[best] = 1; stack.push([a, best], [best, b]); }
  }
  const out: number[] = [], keptPressure: number[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) { out.push(pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]); keptPressure.push(Math.max(0, Math.min(1, values[i]))); }
  return { pts: out, pressures: keptPressure };
}

/** Laplacian smoothing (endpoints fixed unless closed). */
export function smooth3(pts: number[], iterations = 1, k = 0.5, closed = false): number[] {
  let p = pts.slice();
  const n = p.length / 3;
  for (let it = 0; it < iterations; it++) {
    const o = p.slice();
    for (let i = 0; i < n; i++) {
      if (!closed && (i === 0 || i === n - 1)) continue;
      const a = (i - 1 + n) % n, b = (i + 1) % n;
      for (let c = 0; c < 3; c++) o[i * 3 + c] = p[i * 3 + c] + k * ((p[a * 3 + c] + p[b * 3 + c]) / 2 - p[i * 3 + c]);
    }
    p = o;
  }
  return p;
}

export const round3 = (a: number[]) => a.map((v) => Math.round(v * 10000) / 10000);

/** Normalize native PointerEvent pressure without inventing pressure for a mouse. */
export function pressureFromPointer(pointerType: string, pressure: number): number {
  if (pointerType === 'pen') return Math.max(0.04, Math.min(1, Number.isFinite(pressure) && pressure > 0 ? pressure : 0.08));
  if (pointerType === 'touch' && Number.isFinite(pressure) && pressure > 0) return Math.max(0, Math.min(1, pressure));
  return 1;
}

/** Make a stable closed spline by removing a duplicate seam point; the curve path closes itself. */
export function close3DStroke(pts: number[], pressures: number[]): { pts: number[]; pressures: number[]; closed: boolean } {
  const n = Math.floor(pts.length / 3);
  const out = pts.slice(0, n * 3);
  const p = Array.from({ length: n }, (_, i) => Number.isFinite(pressures[i]) ? Math.max(0, Math.min(1, pressures[i])) : 1);
  if (n < 3) return { pts: out, pressures: p, closed: false };
  const first = new THREE.Vector3(out[0], out[1], out[2]);
  const last = new THREE.Vector3(out[(n - 1) * 3], out[(n - 1) * 3 + 1], out[(n - 1) * 3 + 2]);
  if (last.distanceTo(first) < 1e-7) { out.length -= 3; p.pop(); }
  return out.length >= 9 ? { pts: out, pressures: p, closed: true } : { pts: out, pressures: p, closed: false };
}

/** Flat editable loop in the plane normal, used for single-click brush dabs. */
export function planarLoop(center: V3, normal: V3, radius: number, segments = 16): number[] {
  const n = new THREE.Vector3(...normal).normalize();
  const seed = Math.abs(n.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const u = new THREE.Vector3().crossVectors(seed, n).normalize();
  const v = new THREE.Vector3().crossVectors(n, u).normalize();
  const count = Math.max(8, Math.min(128, Math.round(segments)));
  const pts: number[] = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const point = new THREE.Vector3(...center).addScaledVector(u, Math.cos(a) * radius).addScaledVector(v, Math.sin(a) * radius);
    pts.push(point.x, point.y, point.z);
  }
  return pts;
}

// ---------------------------------------------------------------- symmetry
/** World-space transforms produced by the symmetry settings (identity first). */
export function symMatrices(sym: Sym): THREE.Matrix4[] {
  const c = new THREE.Vector3(...sym.center);
  const toC = new THREE.Matrix4().makeTranslation(c.x, c.y, c.z), fromC = new THREE.Matrix4().makeTranslation(-c.x, -c.y, -c.z);
  let list: THREE.Matrix4[] = [new THREE.Matrix4()];
  (['x', 'y', 'z'] as const).forEach((ax) => {
    if (!sym.mirror[ax]) return;
    const s = new THREE.Matrix4().makeScale(ax === 'x' ? -1 : 1, ax === 'y' ? -1 : 1, ax === 'z' ? -1 : 1);
    const m = toC.clone().multiply(s).multiply(fromC);
    list = list.concat(list.map((l) => m.clone().multiply(l)));
  });
  const n = Math.max(1, Math.min(32, Math.round(sym.radial || 1)));
  if (n > 1) {
    const axis = new THREE.Vector3(sym.axis === 'x' ? 1 : 0, sym.axis === 'y' ? 1 : 0, sym.axis === 'z' ? 1 : 0);
    const out: THREE.Matrix4[] = [];
    for (let k = 0; k < n; k++) {
      const r = toC.clone().multiply(new THREE.Matrix4().makeRotationAxis(axis, (k / n) * Math.PI * 2)).multiply(fromC);
      for (const l of list) out.push(r.clone().multiply(l));
    }
    list = out;
  }
  return list;
}
export function applyMat(pts: number[], m: THREE.Matrix4): number[] {
  const out = pts.slice(), v = new THREE.Vector3();
  for (let i = 0; i < out.length; i += 3) { v.set(out[i], out[i + 1], out[i + 2]).applyMatrix4(m); out[i] = v.x; out[i + 1] = v.y; out[i + 2] = v.z; }
  return out;
}

/** Intersect a camera ray with the fixed drawing plane; parallel rays have no unique hit. */
export function intersectDrawPlane(ray: THREE.Ray, plane: THREE.Plane, out = new THREE.Vector3()) {
  if (Math.abs(plane.normal.dot(ray.direction)) < 1e-8) return null;
  return ray.intersectPlane(plane, out) || null;
}

/** A world-space ray hit used by both the interactive surface tool and its acceptance test. */
export function surfaceHit(ray: THREE.Raycaster, surfaces: THREE.Object3D[], thickness: number) {
  surfaces.forEach((surface) => surface.updateWorldMatrix(true, false));
  const hit = ray.intersectObjects(surfaces, false)[0];
  if (!hit?.face) return null;
  const normal = hit.face.normal.clone().applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld));
  return { point: hit.point.clone().addScaledVector(normal, thickness * 0.6 + 0.003), normal, object: hit.object };
}

/** Convert a world-space surface stroke to the target object's local space. */
export function localizeSurfaceStroke(worldPoints: number[], target: THREE.Object3D) {
  if (worldPoints.length < 6 || worldPoints.length % 3 !== 0) throw new Error('A surface stroke needs at least two 3D points.');
  target.updateWorldMatrix(true, false);
  const inverse = target.matrixWorld.clone().invert();
  const scale = new THREE.Vector3();
  target.getWorldScale(scale);
  const averageWorldScale = (Math.abs(scale.x) + Math.abs(scale.y) + Math.abs(scale.z)) / 3 || 1;
  return { points: applyMat(worldPoints, inverse), averageWorldScale };
}

/** Convert a world-space normal into the local normal space of a parented surface stroke. */
export function localizeSurfaceNormal(worldNormal: V3, target: THREE.Object3D): V3 {
  target.updateWorldMatrix(true, false);
  const inverse = target.matrixWorld.clone().invert();
  const local = new THREE.Vector3(...worldNormal).applyMatrix3(new THREE.Matrix3().getNormalMatrix(inverse)).normalize();
  return local.toArray() as V3;
}

export interface SurfaceSymmetryPath {
  points: number[];
  normals: number[];
  target: THREE.Object3D;
  symmetryIndex: number;
}

/** Match smoothed/simplified path vertices back to interpolated source surface normals. */
export function remapSurfaceNormals(sourcePoints: number[], sourceNormals: number[], targetPoints: number[]): number[] {
  if (sourcePoints.length < 3 || sourcePoints.length % 3 || sourceNormals.length !== sourcePoints.length) return [];
  const n = sourcePoints.length / 3;
  const src = Array.from({ length: n }, (_, i) => new THREE.Vector3(sourcePoints[i * 3], sourcePoints[i * 3 + 1], sourcePoints[i * 3 + 2]));
  const ns = Array.from({ length: n }, (_, i) => new THREE.Vector3(sourceNormals[i * 3], sourceNormals[i * 3 + 1], sourceNormals[i * 3 + 2]).normalize());
  const out: number[] = [];
  for (let i = 0; i < targetPoints.length; i += 3) {
    const p = new THREE.Vector3(targetPoints[i], targetPoints[i + 1], targetPoints[i + 2]);
    let bestD = Infinity, best = ns[0].clone();
    if (n === 1) bestD = p.distanceToSquared(src[0]);
    for (let j = 0; j < n - 1; j++) {
      const ab = src[j + 1].clone().sub(src[j]);
      const t = ab.lengthSq() ? THREE.MathUtils.clamp(p.clone().sub(src[j]).dot(ab) / ab.lengthSq(), 0, 1) : 0;
      const nearest = src[j].clone().addScaledVector(ab, t);
      const d = p.distanceToSquared(nearest);
      if (d < bestD) { bestD = d; best = ns[j].clone().lerp(ns[j + 1], t).normalize(); }
    }
    out.push(best.x, best.y, best.z);
  }
  return out;
}

function worldSurfaceNormal(hit: THREE.Intersection): THREE.Vector3 | null {
  if (!hit.face) return null;
  return hit.face.normal.clone().applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld)).normalize();
}

function projectPointNearSurface(
  point: THREE.Vector3, normal: THREE.Vector3, surfaces: THREE.Object3D[], thickness: number,
): { point: THREE.Vector3; normal: THREE.Vector3; target: THREE.Object3D; error: number } | null {
  if (!surfaces.length) return null;
  const offset = thickness * 0.6 + 0.003;
  let size = 0;
  for (const surface of surfaces) {
    surface.updateWorldMatrix(true, false);
    const box = new THREE.Box3().setFromObject(surface);
    if (!box.isEmpty()) size = Math.max(size, box.getSize(new THREE.Vector3()).length());
  }
  // A bounded tolerance accepts ordinary smoothing/projection error, not detached floating copies.
  const tolerance = Math.max(0.06, Math.min(2, size * 0.12), offset * 2);
  const startPad = Math.max(0.02, offset * 0.2);
  const bestHits: { point: THREE.Vector3; normal: THREE.Vector3; target: THREE.Object3D; error: number }[] = [];
  for (const sign of [1, -1]) {
    const ray = new THREE.Raycaster(
      point.clone().addScaledVector(normal, sign * startPad),
      normal.clone().multiplyScalar(-sign).normalize(),
      0,
      tolerance + offset + startPad,
    );
    const hits = ray.intersectObjects(surfaces, false);
    for (const hit of hits) {
      const n = worldSurfaceNormal(hit);
      if (!n) continue;
      const error = hit.point.distanceTo(point);
      if (error > tolerance + offset) continue;
      // Keep the projected stroke outside the mesh even on a double-sided plane hit from behind.
      if (n.dot(normal) < 0) n.negate();
      bestHits.push({ point: hit.point.clone().addScaledVector(n, offset), normal: n, target: hit.object, error });
    }
    if (bestHits.length) break;
  }
  bestHits.sort((a, b) => a.error - b.error);
  return bestHits[0] || null;
}

/**
 * Mirror/repeat a surface path in world space, then ray-project each copy onto real visible meshes.
 * A transformed copy is omitted unless every vertex lands on one consistent target surface.
 */
export function projectSurfaceSymmetryPaths(
  worldPoints: number[], worldNormals: number[], matrices: THREE.Matrix4[], surfaces: THREE.Object3D[], thickness: number, sourceTarget: THREE.Object3D,
): SurfaceSymmetryPath[] {
  if (worldPoints.length < 6 || worldPoints.length % 3 || worldNormals.length !== worldPoints.length) return [];
  const basePoints: number[] = [], baseNormals: number[] = [];
  for (let i = 0; i < worldPoints.length; i += 3) {
    const point = new THREE.Vector3(worldPoints[i], worldPoints[i + 1], worldPoints[i + 2]);
    const normal = new THREE.Vector3(worldNormals[i], worldNormals[i + 1], worldNormals[i + 2]).normalize();
    const projected = projectPointNearSurface(point, normal, [sourceTarget], thickness);
    if (!projected) return [];
    basePoints.push(projected.point.x, projected.point.y, projected.point.z);
    baseNormals.push(projected.normal.x, projected.normal.y, projected.normal.z);
  }
  const paths: SurfaceSymmetryPath[] = [{ points: basePoints, normals: baseNormals, target: sourceTarget, symmetryIndex: 0 }];
  for (let index = 1; index < matrices.length; index++) {
    const matrix = matrices[index];
    const transformed = applyMat(basePoints, matrix);
    const normalMatrix = new THREE.Matrix3().setFromMatrix4(matrix);
    const transformedNormals: number[] = [];
    for (let i = 0; i < baseNormals.length; i += 3) {
      const n = new THREE.Vector3(baseNormals[i], baseNormals[i + 1], baseNormals[i + 2]).applyMatrix3(normalMatrix).normalize();
      transformedNormals.push(n.x, n.y, n.z);
    }
    const firstPoint = new THREE.Vector3(transformed[0], transformed[1], transformed[2]);
    const firstNormal = new THREE.Vector3(transformedNormals[0], transformedNormals[1], transformedNormals[2]);
    const first = projectPointNearSurface(firstPoint, firstNormal, surfaces, thickness);
    if (!first) continue;
    const points = [first.point.x, first.point.y, first.point.z];
    const normals = [first.normal.x, first.normal.y, first.normal.z];
    let valid = true;
    for (let i = 3; i < transformed.length; i += 3) {
      const point = new THREE.Vector3(transformed[i], transformed[i + 1], transformed[i + 2]);
      const normal = new THREE.Vector3(transformedNormals[i], transformedNormals[i + 1], transformedNormals[i + 2]);
      const projected = projectPointNearSurface(point, normal, [first.target], thickness);
      if (!projected) { valid = false; break; }
      points.push(projected.point.x, projected.point.y, projected.point.z);
      normals.push(projected.normal.x, projected.normal.y, projected.normal.z);
    }
    if (!valid || points.length !== transformed.length) continue;
    const duplicate = paths.some((path) => path.target === first.target && path.points.length === points.length && points.every((v, i) => Math.abs(v - path.points[i]) < 1e-4));
    if (!duplicate) paths.push({ points, normals, target: first.target, symmetryIndex: index });
  }
  return paths;
}

/** Store a camera edit on the document and advance its autosave/dirty revision. */
export function persistSceneCamera(doc: Pick<DocEngine, 'scene3d' | 'touch'>, scene: Scene3D, view: CamView) {
  const saved: CamView = { ...view, pos: [...view.pos] as V3, target: [...view.target] as V3 };
  scene.camera = saved;
  scene.ortho = saved.ortho;
  doc.scene3d = scene;
  doc.touch();
  return scene;
}

// ---------------------------------------------------------------- geometry
function taperTube(path: THREE.Curve<THREE.Vector3>, seg: number, radius: number, radial: number, closed: boolean, taper: number) {
  const fr = path.computeFrenetFrames(seg, closed);
  const pos: number[] = [], idx: number[] = [];
  const p = new THREE.Vector3(), nrm = new THREE.Vector3();
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    path.getPointAt(Math.min(1, t), p);
    let r = radius;
    if (taper > 0 && !closed) r *= Math.max(0.06, Math.sqrt(Math.min(1, Math.min(t, 1 - t) / (0.5 * taper))));
    const N = fr.normals[i], B = fr.binormals[i];
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      nrm.set(0, 0, 0).addScaledVector(N, -Math.cos(a)).addScaledVector(B, Math.sin(a)).normalize();
      pos.push(p.x + nrm.x * r, p.y + nrm.y * r, p.z + nrm.z * r);
    }
  }
  for (let i = 0; i < seg; i++) for (let j = 0; j < radial; j++) {
    const a = i * (radial + 1) + j, b = (i + 1) * (radial + 1) + j;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function curveGeometry(c: Curve): THREE.BufferGeometry {
  const path = curvePath(c);
  const seg = Math.max(8, Math.min(2000, Math.round(c.segments)));
  if (c.geo === 'tube') return taperTube(path, seg, Math.max(0.0015, c.thickness), Math.max(3, Math.round(c.radial)), c.closed, c.taper || 0);
  if (c.geo === 'sweep') {
    const sh = new THREE.Shape(), r = Math.max(0.005, c.thickness);
    sh.moveTo(-r, -r * 0.5); sh.lineTo(r, -r * 0.5); sh.lineTo(r * 0.6, r); sh.lineTo(-r * 0.6, r); sh.closePath();
    return new THREE.ExtrudeGeometry(sh, { steps: seg, bevelEnabled: false, extrudePath: path });
  }
  const pts = path.getSpacedPoints(seg);
  if (c.geo === 'ribbon') {
    const n = new THREE.Vector3(...c.normal).normalize();
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    const controls = Math.max(0, Math.floor((c.pts?.length || 0) / 3) - 1);
    const pressureValues = Array.isArray(c.pressures) ? c.pressures : [];
    const pressureSize = Math.max(0, Math.min(1, Number.isFinite(c.pressureSize) ? c.pressureSize! : 0));
    const minSize = Math.max(0.02, Math.min(1, Number.isFinite(c.minSize) ? c.minSize! : 0.08));
    const taper = Math.max(0, Math.min(1, Number.isFinite(c.taper) ? c.taper! : 0));
    const controlCount = Math.floor(c.pts.length / 3);
    const pressureDistances = [0];
    for (let i = 1; i < controlCount; i++) {
      const a = v3(c.pts, i - 1), b = v3(c.pts, i);
      pressureDistances.push(pressureDistances[i - 1] + a.distanceTo(b));
    }
    const openLength = pressureDistances[pressureDistances.length - 1] || 0;
    const closingLength = c.closed && controlCount > 1 ? v3(c.pts, controlCount - 1).distanceTo(v3(c.pts, 0)) : 0;
    const pressureLength = openLength + closingLength || 1;
    const pressureAt = (t: number) => {
      if (!pressureValues.length) return 1;
      if (pressureValues.length !== controlCount || controlCount < 2) {
        const at = t * Math.max(0, pressureValues.length - 1);
        const left = Math.floor(at), right = Math.min(pressureValues.length - 1, left + 1);
        const a = Number.isFinite(pressureValues[left]) ? pressureValues[left] : 1;
        const b = Number.isFinite(pressureValues[right]) ? pressureValues[right] : a;
        return Math.max(0, Math.min(1, a + (b - a) * (at - left)));
      }
      const distance = t * pressureLength;
      if (c.closed && distance >= openLength && closingLength > 1e-8) {
        const alpha = Math.max(0, Math.min(1, (distance - openLength) / closingLength));
        const a = Number.isFinite(pressureValues[controlCount - 1]) ? pressureValues[controlCount - 1] : 1;
        const b = Number.isFinite(pressureValues[0]) ? pressureValues[0] : 1;
        return Math.max(0, Math.min(1, a + (b - a) * alpha));
      }
      let right = 1;
      while (right < pressureDistances.length - 1 && pressureDistances[right] < distance) right++;
      const left = right - 1;
      const span = pressureDistances[right] - pressureDistances[left];
      const alpha = span > 1e-8 ? Math.max(0, Math.min(1, (distance - pressureDistances[left]) / span)) : 0;
      const a = Number.isFinite(pressureValues[left]) ? pressureValues[left] : 1;
      const b = Number.isFinite(pressureValues[right]) ? pressureValues[right] : a;
      return Math.max(0, Math.min(1, a + (b - a) * alpha));
    };
    pts.forEach((p, i) => {
      const t = i / Math.max(1, pts.length - 1);
      const tangent = pts[Math.min(pts.length - 1, i + 1)].clone().sub(pts[Math.max(0, i - 1)]).normalize();
      const side = new THREE.Vector3().crossVectors(tangent, n);
      if (side.lengthSq() < 1e-8) side.set(1, 0, 0);
      const pressure = pressureAt(t);
      let widthScale = Math.max(minSize, 1 - pressureSize + pressureSize * pressure);
      if (taper > 0 && !c.closed && controls > 0) {
        const endDistance = Math.min(t, 1 - t);
        widthScale *= Math.max(0.06, Math.sqrt(Math.min(1, endDistance / (0.5 * taper))));
      }
      side.normalize().multiplyScalar(Math.max(0.0025, c.width * widthScale) / 2);
      pos.push(p.x + side.x, p.y + side.y, p.z + side.z, p.x - side.x, p.y - side.y, p.z - side.z);
      uv.push(t, 1, t, 0);
      if (i) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }
  if (c.geo === 'surface') {
    const ctr = pts.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / pts.length);
    const pos = [ctr.x, ctr.y, ctr.z], idx: number[] = [];
    pts.forEach((p, i) => { pos.push(p.x, p.y, p.z); if (i) idx.push(0, i, i + 1); });
    idx.push(0, pts.length, 1);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }
  return new THREE.BufferGeometry().setFromPoints(pts);
}

export function primGeometry(k: Kind, aspect = 1): THREE.BufferGeometry {
  switch (k) {
    case 'sphere': return new THREE.SphereGeometry(0.5, 48, 32);
    case 'cylinder': return new THREE.CylinderGeometry(0.5, 0.5, 1, 48);
    case 'cone': return new THREE.ConeGeometry(0.5, 1, 48);
    case 'plane': return new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    case 'torus': return new THREE.TorusGeometry(0.4, 0.15, 24, 64);
    case 'image': return new THREE.PlaneGeometry(aspect, 1);
    default: return new THREE.BoxGeometry(1, 1, 1);
  }
}

export interface BuildCtx { assets: Map<string, HTMLImageElement>; paint: (o: Obj) => HTMLCanvasElement | null }

/** Build one scene object (without children). userData.objId identifies it. */
export function buildObject(o: Obj, ctx: BuildCtx): THREE.Object3D {
  let obj: THREE.Object3D;
  if (o.kind === 'curve' && o.curve!.geo === 'line') {
    obj = new THREE.Line(curveGeometry(o.curve!), new THREE.LineBasicMaterial({ color: o.mat.color, transparent: o.mat.opacity < 1, opacity: o.mat.opacity }));
  } else if (o.kind === 'image') {
    const img = o.asset ? ctx.assets.get(o.asset) : undefined;
    const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, transparent: true, opacity: o.mat.opacity, color: img ? '#ffffff' : '#ff3366', wireframe: !img });
    if (img) { const t = new THREE.Texture(img); t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; mat.map = t; }
    obj = new THREE.Mesh(primGeometry('image', o.aspect || 1), mat);
    obj.userData.surface = true;
    obj.userData.missing = !img;
  } else {
    const geom = o.kind === 'curve' ? curveGeometry(o.curve!) : primGeometry(o.kind);
    const brushImage = o.kind === 'curve' && o.curve?.geo === 'ribbon' && o.curve.brushAsset ? ctx.assets.get(o.curve.brushAsset) : undefined;
    const mat = new THREE.MeshStandardMaterial({ color: o.mat.color, roughness: o.mat.roughness, metalness: o.mat.metalness, transparent: o.mat.opacity < 1 || !!brushImage, opacity: o.mat.opacity, side: o.kind === 'curve' || o.kind === 'plane' ? THREE.DoubleSide : THREE.FrontSide });
    if (brushImage) {
      const texture = new THREE.Texture(brushImage);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.needsUpdate = true;
      mat.map = texture;
      mat.alphaTest = 0.015;
      mat.depthWrite = false;
    }
    const pc = o.kind !== 'curve' ? ctx.paint(o) : null;
    if (pc) { const t = new THREE.CanvasTexture(pc); t.colorSpace = THREE.SRGBColorSpace; mat.map = t; mat.color.set('#ffffff'); }
    const mesh = new THREE.Mesh(geom, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if (o.kind !== 'curve') mesh.userData.surface = true;
    obj = mesh;
  }
  obj.position.set(...o.pos);
  obj.rotation.set(...o.rot);
  obj.scale.set(...o.scale);
  obj.visible = o.visible;
  obj.userData.objId = o.id;
  return obj;
}

/** Build all objects; surface strokes are parented to their target objects. */
export function buildObjects(objects: Obj[], ctx: BuildCtx): Map<string, THREE.Object3D> {
  const map = new Map<string, THREE.Object3D>();
  for (const o of objects) map.set(o.id, buildObject(o, ctx));
  return map;
}

/** World-space guide groups are created once per scene rebuild; attached stroke geometry is guide-local. */
export function buildGuideGroups(guides: DrawingGuide[], activeGuideId: string | null | undefined, visuals = true): Map<string, THREE.Group> {
  const result = new Map<string, THREE.Group>();
  for (const guide of guides) {
    const group = new THREE.Group();
    group.name = `guide:${guide.id}`;
    group.position.set(...guide.origin);
    const frame = guideFrame(guide);
    group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(frame.right, frame.up, frame.normal));
    group.visible = true; // strokes stay visible when the guide surface itself is hidden
    group.userData.guideId = guide.id;
    if (visuals) {
      const helper = new THREE.Group();
      helper.name = `guide-visual:${guide.id}`;
      helper.visible = guide.visible;
      helper.userData.helper = true;
      const width = guide.size[0], height = guide.size[1];
      const surfaceColor = readThemeToken('text', '#e9edf2');
      const borderToken = guide.id === activeGuideId ? 'focus' : 'muted';
      const borderFallback = guide.id === activeGuideId ? '#d99658' : '#7c8793';
      const borderColor = readThemeToken(borderToken, borderFallback);
      const surface = new THREE.Mesh(
        new THREE.PlaneGeometry(width, height),
        new THREE.MeshBasicMaterial({ color: surfaceColor, transparent: true, opacity: guide.id === activeGuideId ? 0.055 : 0.025, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }),
      );
      surface.position.z = -0.004;
      surface.renderOrder = -2;
      surface.userData.helper = true;
      surface.userData.themeToken = 'text';
      surface.userData.themeFallback = '#e9edf2';
      helper.add(surface);
      const border = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(-width / 2, -height / 2, -0.002), new THREE.Vector3(width / 2, -height / 2, -0.002),
          new THREE.Vector3(width / 2, height / 2, -0.002), new THREE.Vector3(-width / 2, height / 2, -0.002),
        ]),
        new THREE.LineBasicMaterial({ color: borderColor, transparent: true, opacity: guide.id === activeGuideId ? 0.48 : 0.2, depthWrite: false, toneMapped: false }),
      );
      border.renderOrder = -1;
      border.userData.helper = true;
      border.userData.themeToken = borderToken;
      border.userData.themeFallback = borderFallback;
      helper.add(border);
      group.add(helper);
    }
    result.set(guide.id, group);
  }
  return result;
}

export function attachHierarchy(
  objects: Obj[], map: Map<string, THREE.Object3D>, root: THREE.Object3D, guides: Map<string, THREE.Group> = new Map(),
) {
  for (const o of objects) {
    const ob = map.get(o.id)!;
    const par = o.parent ? map.get(o.parent) : null;
    const guide = !par && o.guideId ? guides.get(o.guideId) : null;
    (par || guide || root).add(ob);
  }
}

export function buildLights(scene: Scene3D, group: THREE.Group, helpers: boolean, map?: Map<string, THREE.Object3D>) {
  group.clear();
  for (const L of scene.lights) {
    const l = L.type === 'dir' ? new THREE.DirectionalLight(L.color, L.intensity) : new THREE.PointLight(L.color, L.intensity, 0, 1.5);
    l.position.set(...L.pos);
    l.castShadow = L.shadow;
    if (l instanceof THREE.DirectionalLight) { l.shadow.mapSize.set(2048, 2048); const c = l.shadow.camera; c.left = -8; c.right = 8; c.top = 8; c.bottom = -8; }
    group.add(l);
    if (helpers) {
      const h = new THREE.Mesh(new THREE.SphereGeometry(0.08), new THREE.MeshBasicMaterial({ color: L.color }));
      h.position.copy(l.position);
      h.userData.lightId = L.id;
      group.add(h);
      map?.set(L.id, h);
    }
  }
}

// ---------------------------------------------------------------- cameras
export function orthoHalfHeight(v: CamView) {
  const d = new THREE.Vector3(...v.pos).distanceTo(new THREE.Vector3(...v.target));
  return Math.max(0.05, d * Math.tan(((v.fov || 45) * Math.PI) / 360));
}
export function makeCamera(v: CamView, aspect: number): THREE.Camera {
  let cam: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  if (v.ortho) {
    const h = orthoHalfHeight(v);
    cam = new THREE.OrthographicCamera(-h * aspect, h * aspect, h, -h, -500, 500);
    cam.zoom = v.zoom || 1;
  } else cam = new THREE.PerspectiveCamera(v.fov || 45, aspect, 0.01, 500);
  cam.position.set(...v.pos);
  cam.lookAt(new THREE.Vector3(...v.target));
  cam.updateProjectionMatrix();
  return cam;
}
export const viewEq = (a: CamView, b: CamView) => JSON.stringify(a) === JSON.stringify(b);

// ---------------------------------------------------------------- paint textures (shared by viewport + headless)
export const paintCanvases = new Map<string, HTMLCanvasElement>();
export const texBus = new EventTarget();
export function paintCanvasFor(o: Obj, create: boolean): HTMLCanvasElement | null {
  let c = paintCanvases.get(o.id);
  if (c) return c;
  if (!o.paint && !create) return null;
  c = document.createElement('canvas');
  c.width = c.height = 1024;
  const x = c.getContext('2d')!;
  x.fillStyle = '#ffffff';
  x.fillRect(0, 0, 1024, 1024);
  paintCanvases.set(o.id, c);
  if (o.paint) loadImage(o.paint).then((im) => { x.drawImage(im, 0, 0, 1024, 1024); texBus.dispatchEvent(new Event('tex')); }).catch(() => {});
  return c;
}

// ---------------------------------------------------------------- headless render
let headless: THREE.WebGLRenderer | null = null;
export function webglAvailable() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
}

/** Render scene data from a camera view into a PNG data URL (helpers, grid and guides excluded). */
export async function renderSceneImage(scene: Scene3D, view: CamView, w: number, h: number, o: { transparent: boolean; assets: Map<string, HTMLImageElement> }): Promise<string> {
  if (!webglAvailable()) throw new Error('WebGL is not available on this system.');
  w = Math.max(16, Math.min(4096, Math.round(w)));
  h = Math.max(16, Math.min(4096, Math.round(h)));
  // make sure painted textures are decoded before rendering
  const paints = new Map<string, HTMLCanvasElement>();
  for (const ob of scene.objects) {
    if (!ob.paint || paintCanvases.has(ob.id)) continue;
    const c = document.createElement('canvas');
    c.width = c.height = 1024;
    try { c.getContext('2d')!.drawImage(await loadImage(ob.paint), 0, 0, 1024, 1024); paints.set(ob.id, c); } catch { /* missing paint → plain material */ }
  }
  if (!headless) {
    headless = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    headless.shadowMap.enabled = true;
    headless.shadowMap.type = THREE.PCFSoftShadowMap;
    headless.outputColorSpace = THREE.SRGBColorSpace;
  }
  const r = headless;
  r.setPixelRatio(1);
  r.setSize(w, h, false);
  const sc = new THREE.Scene();
  sc.background = o.transparent ? null : new THREE.Color(scene.bg);
  sc.add(new THREE.AmbientLight(0xffffff, scene.ambient));
  const lights = new THREE.Group();
  buildLights(scene, lights, false);
  sc.add(lights);
  const ctx: BuildCtx = { assets: o.assets, paint: (ob) => paintCanvases.get(ob.id) || paints.get(ob.id) || null };
  const map = buildObjects(scene.objects, ctx);
  const guideGroups = buildGuideGroups(scene.guides || [], scene.activeGuideId, false);
  guideGroups.forEach((group) => sc.add(group));
  attachHierarchy(scene.objects, map, sc, guideGroups);
  // The backdrop is a scene clear color; guide visuals and editor aids are excluded from exports.
  r.setClearColor(0x000000, 0);
  r.render(sc, makeCamera(view, w / h));
  const url = r.domElement.toDataURL('image/png');
  sc.traverse((x) => {
    const m = x as THREE.Mesh;
    m.geometry?.dispose();
    const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
    mats.forEach((mm) => { (mm as THREE.MeshStandardMaterial).map?.dispose(); mm.dispose(); });
  });
  return url;
}

// ---------------------------------------------------------------- cross-workspace navigation
export interface PanelEdit { pageDoc: string; panelId: string; layerId: string; sceneDoc: string; aspect: number }
export const useNav = create<{ applyView: { doc: string; view: CamView } | null; panelEdit: PanelEdit | null }>(() => ({ applyView: null, panelEdit: null }));

export const findDoc = (uuid: string): DocEngine | undefined => getApp().docs.find((d) => d.meta.uuid === uuid);
export const docsWithScenes = () => getApp().docs.filter((d) => !!d.scene3d && Array.isArray((d.scene3d as Scene3D).objects));
