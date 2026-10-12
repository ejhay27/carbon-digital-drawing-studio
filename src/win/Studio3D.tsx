import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { Brush, Camera, Copy, Eye, EyeOff, Home as HomeIcon, Image as ImageIcon, MousePointer2, Orbit, PenLine, Redo2, Slash, Spline, Trash2, Undo2 } from 'lucide-react';
import type { BrushParams, CamView } from '../engine/types';
import type { DocEngine } from '../engine/document';
import { activeDoc, allBrushes, brushById, confirmDialog, currentBrush, getApp, promptDialog, setColor, toast, useApp } from '../state/store';
import { compositeDoc } from '../engine/render';
import { blobToDataURL, createCanvas, ctxOf, hashString, loadImage, uid } from '../engine/util';
import { ensureStamp } from '../engine/tips';
import { renderStroke } from '../engine/strokeRenderer';
import { navigateHomeSafely, pickFile } from '../state/actions';
import { Btn, Select, Slider, Toggle } from '../components/ui';
import { cn } from '../utils/cn';
import {
  applyMat, attachHierarchy, buildEnvironment, buildLights, buildObjects, centerGroundOnTarget, close3DStroke, curveGeometry, DEFAULT_VIEW, intersectDrawPlane, localizeSurfaceNormal, localizeSurfaceStroke, MAT_PRESETS, orthoHalfHeight, paintCanvases, paintCanvasFor, persistSceneCamera, planarLoop, pressureFromPointer, projectSurfaceSymmetryPaths, remapSurfaceNormals, round3,
  sceneOf, simplify3, simplify3WithPressures, smooth3, surfaceHit, symMatrices, texBus, useNav, webglAvailable, type Geo, type Kind, type Obj, type PlaneMode, type Scene3D, type V3,
} from './sceneRender';
import { createTouchGestureGate } from './touchGestureGate';
import { captureToLayer, finishPanelEdit } from './Continuum';

type Tool3 = 'camera' | 'select' | 'draw' | 'bezier' | 'line' | 'paint';
/** Tools in which a pointer drag navigates instead of drawing. */
const isNavTool = (t: Tool3) => t === 'camera' || t === 'select';
type Target = 'plane' | 'surface';
interface Rig {
  renderer: THREE.WebGLRenderer; scene: THREE.Scene; persp: THREE.PerspectiveCamera; ortho: THREE.OrthographicCamera; orbit: OrbitControls; tc: TransformControls;
  content: THREE.Group; lights: THREE.Group; preview: THREE.Group; env: THREE.Group; ambient: THREE.AmbientLight;
  meshes: Map<string, THREE.Object3D>; handles: THREE.Mesh[]; flushPanPersist: (() => void) | null;
}
const rnd = (v: number) => Math.round(v * 1000) / 1000; // stored coordinates are rounded to 1/1000 unit
const objMatrix = (o: Obj) => new THREE.Matrix4().compose(new THREE.Vector3(...o.pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...o.rot)), new THREE.Vector3(...o.scale));
const PLANE_LABEL: Record<PlaneMode, string> = { view: 'Depth plane (faces camera)', xz: 'Ground plane (XZ)', xy: 'Front plane (XY)', yz: 'Side plane (YZ)', custom: 'Custom plane' };

/** Render the selected Carbon brush to one de-duplicated alpha texture for a world-space ribbon. */
async function brushTextureAsset(doc: DocEngine, brush: BrushParams): Promise<string> {
  const appearance = {
    id: brush.id, tip: brush.tip, stamp: brush.stamp ? hashString(brush.stamp) : '', mode: brush.mode,
    hardness: brush.hardness, flow: brush.flow, spacing: brush.spacing, roundness: brush.roundness,
    angle: brush.angle, followDirection: brush.followDirection, scatter: brush.scatter, count: brush.count,
    sizeJitter: brush.sizeJitter, angleJitter: brush.angleJitter, opacityJitter: brush.opacityJitter,
    grain: brush.grain, grainType: brush.grainType, grainScale: brush.grainScale,
    wetEdges: brush.wetEdges, granulation: brush.granulation, bloom: brush.bloom,
    layer2: brush.layer2,
  };
  const id = `3d-brush-${hashString(JSON.stringify(appearance))}`;
  if (doc.assets[id] && doc.assetImgs.has(id)) return id;
  if (brush.stamp) await ensureStamp(brush.stamp);
  const w = 384, h = 64;
  const mode = brush.mode === 'mix' || brush.mode === 'smudge' || brush.mode === 'crisp' ? 'normal' : brush.mode;
  const mask: BrushParams = {
    ...brush, id: `${brush.id}-3d-mask`, mode, size: h * 0.78, maxSize: Math.max(brush.maxSize, h), minSize: 1,
    opacity: 1, pressureSize: 0, pressureOpacity: 0, speedSize: 0, smoothing: 0,
    hueJitter: 0, satJitter: 0, valJitter: 0, taperStart: 0, taperEnd: 0, composite: 'source-over',
  };
  const samples: number[] = [];
  const steps = 128;
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    samples.push(8 + t * (w - 16), h / 2, 1, 0, 0, i * 10);
  }
  const rendered = renderStroke({ brush: mask, color: '#ffffff', eraser: false, seed: hashString(id), sym: { mode: 'off', count: 2, cx: 0.5, cy: 0.5 }, w, h }, samples);
  const canvas = createCanvas(w, h);
  ctxOf(canvas).drawImage(rendered.out, 0, 0);
  const url = canvas.toDataURL('image/png');
  const image = await loadImage(url);
  doc.assets[id] = url;
  doc.assetImgs.set(id, image);
  return id;
}

function disposeTree(o: THREE.Object3D) {
  o.traverse((x) => {
    const m = x as THREE.Mesh;
    m.geometry?.dispose();
    const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
    mats.forEach((mm) => { const mp = (mm as THREE.MeshStandardMaterial).map; if (mp && !(mp instanceof THREE.CanvasTexture)) mp.dispose(); mm.dispose(); });
  });
}

export default function Studio3D() {
  const host = useRef<HTMLDivElement>(null);
  const doc = activeDoc();
  const fg = useApp((s) => s.fg);
  const brushId = useApp((s) => s.brushId);
  const [spatialBrushId, setSpatialBrushId] = useState(brushId);
  const customBrushes = useApp((s) => s.customBrushes);
  const customErasers = useApp((s) => s.customErasers);
  const brushOverrides = useApp((s) => s.overrides);
  const homeSaving = useApp((s) => s.homeSaving);
  const activeBrush = brushById(spatialBrushId) || currentBrush(false);
  const brushAppearanceKey = JSON.stringify(activeBrush);
  const [previewBrushAsset, setPreviewBrushAsset] = useState<string>();
  const brushOptions = useMemo(() => {
    const erasers = new Set(customErasers.map((brush) => brush.id));
    return allBrushes(getApp()).filter((brush) => !erasers.has(brush.id)).map((brush) => ({ value: brush.id, label: `${brush.category} · ${brush.name}` }));
  }, [spatialBrushId, customBrushes, customErasers, brushOverrides]);
  const panelEdit = useNav((s) => s.panelEdit);
  const [scene, setSceneState] = useState<Scene3D>(() => sceneOf(doc?.scene3d));
  const [selId, setSel] = useState<string | null>(null);
  const [selPt, setSelPt] = useState<number | null>(null);
  const [tool, setTool3] = useState<Tool3>('draw');
  const [target, setTarget] = useState<Target>('plane');
  const [tmode, setTmode] = useState<'translate' | 'rotate' | 'scale'>('translate');
  const [geo, setGeo] = useState<Geo>('ribbon');
  const [brushScale, setBrushScale] = useState(1);
  const [opacity, setOpacity] = useState(1);
  const [taper, setTaper] = useState(0.35);
  const [smoothing, setSmoothing] = useState(() => activeBrush.smoothing);
  const thick = Math.max(0.004, Math.min(2, activeBrush.size / 50 * brushScale));
  const [simpTol, setSimpTol] = useState(0.02);
  const [paintSize, setPaintSize] = useState(18);
  const [transparentRender, setTransparentRender] = useState(true);
  const [busy, setBusy] = useState(false);
  const [webgl] = useState(webglAvailable);
  const [touchDevice] = useState(() => typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches);
  const [, force] = useState(0);
  const hist = useRef<{ undo: string[]; redo: string[] }>({ undo: [], redo: [] });
  const R = useRef<Rig | null>(null);
  const sceneRef = useRef(scene);
  sceneRef.current = scene;
  const st = useRef({ tool, target, selId, selPt, geo, thick, opacity, taper, smoothing, fg, paintSize, tmode, brush: activeBrush, brushScale, previewBrushAsset });
  st.current = { tool, target, selId, selPt, geo, thick, opacity, taper, smoothing, fg, paintSize, tmode, brush: activeBrush, brushScale, previewBrushAsset };
  const bez = useRef<number[]>([]);
  useEffect(() => { setSmoothing(activeBrush.smoothing); }, [activeBrush.id, activeBrush.smoothing]);
  useEffect(() => {
    let live = true;
    setPreviewBrushAsset(undefined);
    if (doc) void brushTextureAsset(doc, activeBrush).then((id) => { if (live) setPreviewBrushAsset(id); }).catch(() => {});
    return () => { live = false; };
  }, [doc?.id, brushAppearanceKey]);

  // ---------------- scene state + 3D undo (separate from 2D history)
  const commit = (next: Scene3D, record = true) => {
    if (record) { hist.current.undo.push(JSON.stringify(sceneRef.current)); if (hist.current.undo.length > 80) hist.current.undo.shift(); hist.current.redo = []; }
    sceneRef.current = next;
    setSceneState(next);
    const d = activeDoc();
    if (d) { d.scene3d = next; d.dirty = true; d.meta.modified = Date.now(); d.emit(); }
  };
  const update = (fn: (s: Scene3D) => Scene3D | void, record = true) => { const c = structuredClone(sceneRef.current); const r = fn(c); commit(r || c, record); };
  const undo = () => { const u = hist.current.undo.pop(); if (!u) return toast('Nothing to undo in 3D'); hist.current.redo.push(JSON.stringify(sceneRef.current)); commit(JSON.parse(u), false); setSelPt(null); };
  const redo = () => { const r = hist.current.redo.pop(); if (!r) return toast('Nothing to redo in 3D'); hist.current.undo.push(JSON.stringify(sceneRef.current)); commit(JSON.parse(r), false); };
  const objOf = (s: Scene3D, id: string | null) => s.objects.find((o) => o.id === id);

  useEffect(() => {
    const s = sceneOf(doc?.scene3d);
    sceneRef.current = s;
    setSceneState(s);
    setSel(null);
    setSelPt(null);
    hist.current = { undo: [], redo: [] };
    if (R.current) applyView({ ...(s.camera || DEFAULT_VIEW), ortho: s.ortho });
  }, [doc?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const cam = () => (sceneRef.current.ortho ? R.current!.ortho : R.current!.persp);
  const getViewFor = (ortho: boolean): CamView => {
    const r = R.current!, c = ortho ? r.ortho : r.persp, t = r.orbit.target;
    return { pos: [rnd(c.position.x), rnd(c.position.y), rnd(c.position.z)], target: [rnd(t.x), rnd(t.y), rnd(t.z)], ortho, zoom: ortho ? rnd(r.ortho.zoom) : 1, fov: r.persp.fov };
  };
  const getView = (): CamView => getViewFor(sceneRef.current.ortho);
  const fitOrtho = (r: Rig, v: CamView) => { const h = orthoHalfHeight(v), a = r.persp.aspect; r.ortho.left = -h * a; r.ortho.right = h * a; r.ortho.top = h; r.ortho.bottom = -h; r.ortho.zoom = v.zoom || 1; r.ortho.updateProjectionMatrix(); };
  function applyView(v: CamView, persist = false) {
    const r = R.current;
    if (!r) return;
    r.flushPanPersist?.();
    r.orbit.target.set(...v.target);
    r.persp.position.set(...v.pos); r.persp.fov = v.fov || 45; r.persp.updateProjectionMatrix();
    r.ortho.position.set(...v.pos);
    if (v.ortho) fitOrtho(r, v);
    if (persist || v.ortho !== sceneRef.current.ortho) {
      update((s) => { s.ortho = v.ortho; if (persist) s.camera = { ...v, pos: [...v.pos] as V3, target: [...v.target] as V3 }; }, false);
    }
    r.orbit.update();
  }
  const setOrtho = (on: boolean) => {
    const r = R.current;
    if (!r) return;
    r.flushPanPersist?.();
    if (on) { r.ortho.position.copy(r.persp.position); fitOrtho(r, { ...getView(), ortho: true, zoom: 1 }); }
    else r.persp.position.copy(r.ortho.position);
    const view = getViewFor(on);
    update((s) => { s.ortho = on; s.camera = view; }, false);
  };

  // ---------------- three.js rig (once)
  useEffect(() => {
    const el = host.current;
    if (!el || !webgl) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); }
    catch { toast('WebGL could not start: 3D Studio is unavailable on this system.', 'error'); return; }
    renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);
    renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
    const sc = new THREE.Scene();
    const persp = new THREE.PerspectiveCamera(45, 1, 0.01, 500);
    const ortho = new THREE.OrthographicCamera(-4, 4, 3, -3, -500, 500);
    const orbit = new OrbitControls(persp, renderer.domElement);
    orbit.enableDamping = true;
    orbit.dampingFactor = 0.12;
    const tc = new TransformControls(persp, renderer.domElement);
    sc.add(tc.getHelper());
    const env = new THREE.Group(); // A small camera-following patch over an unbounded mathematical draw plane
    const content = new THREE.Group(), lights = new THREE.Group(), preview = new THREE.Group();
    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    sc.add(env, content, lights, ambient, preview);
    const r: Rig = { renderer, scene: sc, persp, ortho, orbit, tc, content, lights, preview, env, ambient, meshes: new Map(), handles: [], flushPanPersist: null };
    R.current = r;
    applyView({ ...(sceneRef.current.camera || DEFAULT_VIEW), ortho: sceneRef.current.ortho });
    tc.addEventListener('dragging-changed', (e) => { const v = (e as unknown as { value: boolean }).value; orbit.enabled = !v; if (!v) syncFromTC(); });
    tc.addEventListener('objectChange', liveHandle);
    orbit.addEventListener('start', () => R.current?.flushPanPersist?.());
    orbit.addEventListener('end', () => R.current?.flushPanPersist?.());
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth, h = el.clientHeight;
      renderer.setSize(w, h);
      persp.aspect = w / Math.max(1, h);
      persp.updateProjectionMatrix();
      const k = (ortho.top - ortho.bottom) / 2;
      ortho.left = -k * persp.aspect; ortho.right = k * persp.aspect; ortho.updateProjectionMatrix();
      force((n) => n + 1);
    });
    ro.observe(el);
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      orbit.update();
      centerGroundOnTarget(env, orbit.target);
      renderer.render(sc, sceneRef.current.ortho ? ortho : persp);
    };
    loop();
    const texUp = () => r.meshes.forEach((m) => { const mat = (m as THREE.Mesh).material as THREE.MeshStandardMaterial; if (mat?.map) mat.map.needsUpdate = true; });
    texBus.addEventListener('tex', texUp);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); texBus.removeEventListener('tex', texUp); disposeTree(content); tc.dispose(); orbit.dispose(); renderer.dispose(); el.removeChild(renderer.domElement); R.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** The plane strokes are drawn on (point + normal), from the scene's draw settings and the camera. */
  function activePlane() {
    const r = R.current!, d = sceneRef.current.draw;
    let normal = new THREE.Vector3(0, 1, 0), point = new THREE.Vector3();
    if (d.mode === 'view') {
      const dir = r.orbit.target.clone().sub(cam().position).normalize();
      normal = dir.clone().negate();
      point = r.orbit.target.clone().addScaledVector(dir, d.offset);
    } else if (d.mode === 'xz') point.set(0, d.offset, 0);
    else if (d.mode === 'xy') { normal.set(0, 0, 1); point.set(0, 0, d.offset); }
    else if (d.mode === 'yz') { normal.set(1, 0, 0); point.set(d.offset, 0, 0); }
    else {
      normal.applyEuler(new THREE.Euler(...(d.rot.map((v) => (v * Math.PI) / 180) as V3))).normalize();
      point.set(...d.pos).addScaledVector(normal, d.offset);
    }
    return { normal, point, plane: new THREE.Plane().setFromNormalAndCoplanarPoint(normal, point) };
  }

  function syncFromTC() {
    const r = R.current, ob = r?.tc.object;
    if (!r || !ob) return;
    if (ob.userData.handleIdx !== undefined) {
      const { curveId, handleIdx } = ob.userData as { curveId: string; handleIdx: number };
      update((s) => { const o = objOf(s, curveId); if (o?.curve) { o.curve.pts[handleIdx * 3] = rnd(ob.position.x); o.curve.pts[handleIdx * 3 + 1] = rnd(ob.position.y); o.curve.pts[handleIdx * 3 + 2] = rnd(ob.position.z); } });
      return;
    }
    const id = (ob.userData.objId || ob.userData.lightId) as string | undefined;
    if (!id) return;
    update((s) => {
      const o = objOf(s, id);
      if (o) { o.pos = ob.position.toArray().map(rnd) as V3; o.rot = [rnd(ob.rotation.x), rnd(ob.rotation.y), rnd(ob.rotation.z)]; o.scale = ob.scale.toArray().map(rnd) as V3; }
      const l = s.lights.find((x) => x.id === id);
      if (l) l.pos = ob.position.toArray().map(rnd) as V3;
    });
  }
  function liveHandle() {
    const ob = R.current?.tc.object;
    if (!ob || ob.userData.handleIdx === undefined) return;
    const o = objOf(sceneRef.current, ob.userData.curveId);
    if (!o?.curve) return;
    const pts = o.curve.pts.slice(), i = ob.userData.handleIdx as number;
    pts[i * 3] = ob.position.x; pts[i * 3 + 1] = ob.position.y; pts[i * 3 + 2] = ob.position.z;
    const m = ob.parent as THREE.Mesh;
    m.geometry.dispose();
    m.geometry = curveGeometry({ ...o.curve, pts });
  }

  // ---------------- rebuild the scene graph from data
  useEffect(() => {
    const r = R.current;
    if (!r) return;
    const s = scene;
    r.scene.background = new THREE.Color(s.bg);
    r.ambient.intensity = s.ambient;
    // Ground stays a single low-cost patch, recentered every frame while the draw plane remains infinite.
    disposeTree(r.env);
    r.env.clear();
    if (s.ground !== false) r.env.add(buildEnvironment(s));
    r.env.visible = s.ground !== false;
    const c = s.ortho ? r.ortho : r.persp;
    r.orbit.object = c;
    r.tc.camera = c;
    r.tc.detach();
    disposeTree(r.content);
    r.content.clear();
    r.meshes.clear();
    buildLights(s, r.lights, false);
    const map = buildObjects(s.objects, { assets: doc?.assetImgs || new Map(), paint: (o) => paintCanvasFor(o, false) });
    attachHierarchy(s.objects, map, r.content);
    map.forEach((v, k) => r.meshes.set(k, v));
    r.handles = [];
    const sel = objOf(s, selId);
    if (sel?.curve && tool === 'select') {
      const ob = map.get(sel.id)!;
      const sz = 0.03 / Math.max(0.05, Math.max(...sel.scale.map(Math.abs)));
      for (let i = 0; i < sel.curve.pts.length / 3; i++) {
        const isCtl = sel.curve.type === 'bezier' && i % 3 !== 0;
        const hm = new THREE.Mesh(new THREE.SphereGeometry(i === selPt ? sz * 1.5 : sz, 12, 8), new THREE.MeshBasicMaterial({ color: i === selPt ? 0xe8913a : isCtl ? 0x4da3ff : 0xffffff, depthTest: false }));
        hm.position.set(sel.curve.pts[i * 3], sel.curve.pts[i * 3 + 1], sel.curve.pts[i * 3 + 2]);
        hm.renderOrder = 10;
        hm.userData = { handleIdx: i, curveId: sel.id };
        ob.add(hm);
        r.handles.push(hm);
      }
    }
    if (tool === 'select') {
      if (sel?.curve && selPt !== null && r.handles[selPt]) { r.tc.attach(r.handles[selPt]); r.tc.setMode('translate'); }
      else if (selId && r.meshes.get(selId)) { r.tc.attach(r.meshes.get(selId)!); r.tc.setMode(s.lights.some((l) => l.id === selId) ? 'translate' : tmode); }
    }
    // Input separation: navigation tools drive the camera; draw tools own the pointer.
    // Touch: one finger orbits only in navigation tools; two fingers always pan/pinch.
    const navTool = isNavTool(tool);
    const mb = r.orbit.mouseButtons as Record<string, THREE.MOUSE | null>;
    mb.LEFT = navTool ? THREE.MOUSE.ROTATE : null;
    mb.MIDDLE = tool === 'camera' ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE; // Shift + middle = pan (OrbitControls modifier)
    mb.RIGHT = THREE.MOUSE.PAN;
    const th = r.orbit.touches as unknown as Record<string, number | null>;
    th.ONE = navTool ? THREE.TOUCH.ROTATE : null;
    th.TWO = THREE.TOUCH.DOLLY_PAN;
  }, [scene, selId, selPt, tool, tmode, doc]);

  // ---------------- apply navigation requests (Return to scene, panel camera editing)
  const nav = useNav((s) => s.applyView);
  useEffect(() => {
    if (nav && doc && nav.doc === doc.meta.uuid && R.current) { applyView(nav.view, true); useNav.setState({ applyView: null }); }
  }, [nav, doc]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------- pointer: select, draw, paint
  useEffect(() => {
    const r = R.current;
    if (!r) return;
    const el = r.renderer.domElement;
    const ray = new THREE.Raycaster();
    ray.params.Line = { threshold: 0.04 };
    const ndc = new THREE.Vector2();
    const eventPressure = (e: PointerEvent) => pressureFromPointer(e.pointerType, e.pressure);
    let stroke: { pts: number[]; pressures: number[]; normals: number[]; plane: THREE.Plane | null; normal: THREE.Vector3; targetObj: THREE.Object3D | null; targetId: string | null } | null = null;
    let painting = false;
    let capturedPointer: number | null = null;
    let downAt: { x: number; y: number } | null = null;
    let altHeld = false;
    let panPersistTimer = 0;
    let pendingPan: { doc: ReturnType<typeof activeDoc>; scene: Scene3D; view: CamView } | null = null;
    const touchGate = createTouchGestureGate();
    const setRay = (e: PointerEvent) => { const b = el.getBoundingClientRect(); ndc.set(((e.clientX - b.left) / b.width) * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1); ray.setFromCamera(ndc, cam()); };
    const surfaces = () => {
      const out: THREE.Object3D[] = [];
      r.content.traverse((x) => {
        let visible = true;
        for (let p: THREE.Object3D | null = x; p && p !== r.content; p = p.parent) if (!p.visible) { visible = false; break; }
        if (x.userData.surface && visible) out.push(x);
      });
      return out;
    };
    const objIdOf = (x: THREE.Object3D | null): string | null => { while (x) { if (x.userData.objId) return x.userData.objId; if (x.userData.lightId) return x.userData.lightId; x = x.parent; } return null; };
    const snap = (p: THREE.Vector3) => { const s = sceneRef.current; if (s.snap) { const g = s.gridSize; p.set(Math.round(p.x / g) * g, Math.round(p.y / g) * g, Math.round(p.z / g) * g); } return p; };
    const planePoint = (e: PointerEvent, plane: THREE.Plane) => { setRay(e); const p = intersectDrawPlane(ray.ray, plane); return p ? snap(p) : null; };
    const surfacePoint = (e: PointerEvent, only: THREE.Object3D | null) => {
      setRay(e);
      // A ribbon's centerline should sit almost on the mesh so pressure-thin portions do not float away.
      const lift = st.current.geo === 'ribbon' ? 0 : st.current.thick;
      const hit = surfaceHit(ray, only ? [only] : surfaces(), lift);
      return hit ? { p: hit.point, normal: hit.normal, obj: hit.object } : null;
    };
    const mkStroke = (pts: number[], type: 'catmull' | 'bezier' | 'poly', normal: V3, pressures: number[], brushAsset: string | undefined, extra: Partial<Obj> = {}, style = st.current, closed = false): Obj => {
      const s = style;
      return {
        id: uid('o'), name: type === 'bezier' ? 'Bézier curve' : type === 'poly' ? 'Guide line' : 'Spatial brush stroke', kind: 'curve', pos: [0, 0, 0], rot: [0, 0, 0], scale: [1, 1, 1], visible: true,
        mat: { color: s.fg, roughness: 0.7, metalness: 0, opacity: Math.max(0.01, Math.min(1, s.brush.opacity * s.opacity)) },
        curve: {
          pts: round3(pts), type, closed, geo: type === 'poly' ? 'line' : s.geo, thickness: s.thick, width: s.thick,
          segments: Math.max(32, Math.min(800, (pts.length / 3) * 6)), radial: 10, normal, taper: s.taper,
          ...(pressures.length ? { pressures: pressures.map((p) => Math.max(0, Math.min(1, Number.isFinite(p) ? p : 1))) } : {}),
          pressureSize: s.brush.pressureSize, minSize: s.brush.minSize, brushAsset, brushId: s.brush.id, brushName: s.brush.name,
        },
        ...extra,
      };
    };
    const showPreview = (pts: number[], normals: number[] = []) => {
      r.preview.children.forEach(disposeTree);
      r.preview.clear();
      if (pts.length < 3) return;
      const matrices = symMatrices(sceneRef.current.sym);
      const current = st.current;
      const surfaceTarget = stroke?.targetObj;
      const sourcePressure = stroke?.pressures || Array.from({ length: Math.floor(pts.length / 3) }, () => 1);
      const sourceNormal = (stroke?.normal || activePlane().normal).toArray().map(rnd) as V3;
      const type = current.tool === 'line' ? 'poly' : 'catmull';
      if (pts.length === 3) {
        if (current.tool === 'draw') {
          const pressure = sourcePressure[0] ?? 1;
          const width = current.thick * Math.max(current.brush.minSize, 1 - current.brush.pressureSize + current.brush.pressureSize * pressure);
          const center = pts.slice(0, 3) as V3;
          const loop = planarLoop(center, sourceNormal, width / 2, 20);
          const dab = mkStroke(loop, 'catmull', sourceNormal, new Array(loop.length / 3).fill(pressure), undefined, {}, current, true);
          dab.curve!.geo = 'surface'; dab.curve!.segments = 32; dab.curve!.taper = 0;
          r.preview.add(new THREE.Mesh(curveGeometry(dab.curve!), new THREE.MeshBasicMaterial({ color: current.fg, transparent: true, opacity: current.brush.opacity * current.opacity, side: THREE.DoubleSide, depthTest: false, depthWrite: false })));
        }
        return;
      }
      const count = Math.floor(pts.length / 3);
      const stride = Math.max(1, Math.ceil(count / 256));
      const indices = Array.from({ length: count }, (_, i) => i).filter((i) => i === 0 || i === count - 1 || i % stride === 0);
      const previewPts = indices.flatMap((i) => pts.slice(i * 3, i * 3 + 3));
      const previewPressure = indices.map((i) => sourcePressure[i] ?? 1);
      const previewNormals = normals.length === pts.length ? indices.flatMap((i) => normals.slice(i * 3, i * 3 + 3)) : [];
      const previewClosed = type === 'catmull' && closesGesture(previewPts);
      const addPreviewPath = (pathPts: number[], pathNormals: number[], pressure: number[], normal: V3, mirrorIndex: number, closed = false) => {
        if (pathPts.length < 6) return;
        const mirrored = mirrorIndex !== 0;
        const style = mirrored ? { ...current, fg: '#9a7cff', opacity: current.opacity * 0.7 } : current;
        const obj = mkStroke(pathPts, type, normal, pressure, closed ? undefined : current.previewBrushAsset, {}, style, closed);
        const c = obj.curve!;
        c.segments = Math.max(12, Math.min(480, Math.floor(pathPts.length / 3) * 4));
        if (c.geo === 'line') {
          r.preview.add(new THREE.Line(curveGeometry(c), new THREE.LineBasicMaterial({ color: style.fg, transparent: true, opacity: style.opacity, depthTest: false })));
          return;
        }
        const material = new THREE.MeshBasicMaterial({ color: style.fg, transparent: true, opacity: Math.max(0.05, style.brush.opacity * style.opacity), side: THREE.DoubleSide, depthTest: false, depthWrite: false });
        if (c.geo === 'ribbon' && current.previewBrushAsset) {
          const image = activeDoc()?.assetImgs.get(current.previewBrushAsset);
          if (image) {
            const texture = new THREE.Texture(image);
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.needsUpdate = true;
            material.map = texture;
            material.alphaTest = 0.015;
          }
        }
        const mesh = new THREE.Mesh(curveGeometry(c), material);
        mesh.renderOrder = 20;
        r.preview.add(mesh);
        void pathNormals;
      };
      if (surfaceTarget && previewNormals.length === previewPts.length) {
        const lift = current.geo === 'ribbon' ? 0 : current.thick;
        const paths = projectSurfaceSymmetryPaths(previewPts, previewNormals, matrices, surfaces(), lift, surfaceTarget);
        paths.forEach((path) => addPreviewPath(path.points, path.normals, previewPressure, path.normals.slice(0, 3) as V3, path.symmetryIndex, previewClosed));
        return;
      }
      matrices.forEach((matrix, i) => {
        const p = applyMat(previewPts, matrix);
        const n = new THREE.Vector3(...sourceNormal).transformDirection(matrix).toArray().map(rnd) as V3;
        addPreviewPath(p, [], previewPressure, n, i, previewClosed);
      });
    };
    const addStrokes = (objs: Obj[]) => {
      if (!objs.length) return toast('No complete surface stroke could be projected onto a visible mesh. The scene was left unchanged.', 'error');
      update((s) => { s.objects.push(...objs); });
      setSel(objs[0].id); setSelPt(null);
    };
    const closesGesture = (pts: number[]) => {
      if (pts.length < 12) return false;
      const rect = el.getBoundingClientRect();
      const first = new THREE.Vector3(pts[0], pts[1], pts[2]).project(cam());
      const lastAt = pts.length - 3;
      const last = new THREE.Vector3(pts[lastAt], pts[lastAt + 1], pts[lastAt + 2]).project(cam());
      return Math.hypot((first.x - last.x) * rect.width / 2, (first.y - last.y) * rect.height / 2) <= 18;
    };
    const addDot = (k: NonNullable<typeof stroke>, style: typeof st.current) => {
      const pressure = k.pressures[0] ?? 1;
      const pressureWidth = Math.max(style.brush.minSize, 1 - style.brush.pressureSize + style.brush.pressureSize * pressure);
      const center = new THREE.Vector3(k.pts[0], k.pts[1], k.pts[2]);
      let loop: number[], normal: V3, extra: Partial<Obj> = {};
      let width = style.thick * pressureWidth;
      if (k.targetObj && k.targetId) {
        const target = k.targetObj;
        target.updateWorldMatrix(true, false);
        const scale = new THREE.Vector3(); target.getWorldScale(scale);
        const averageWorldScale = (Math.abs(scale.x) + Math.abs(scale.y) + Math.abs(scale.z)) / 3 || 1;
        center.applyMatrix4(target.matrixWorld.clone().invert());
        normal = localizeSurfaceNormal(k.normal.toArray() as V3, target);
        width /= averageWorldScale;
        loop = planarLoop(center.toArray() as V3, normal, width / 2, 20);
        extra = { parent: k.targetId, name: 'Surface brush dab' };
      } else {
        normal = k.normal.toArray().map(rnd) as V3;
        loop = planarLoop(center.toArray() as V3, normal, width / 2, 20);
      }
      const dot = mkStroke(loop, 'catmull', normal, new Array(loop.length / 3).fill(pressure), undefined, extra, style, true);
      dot.curve!.geo = 'surface';
      dot.curve!.segments = 32;
      dot.curve!.taper = 0;
      dot.curve!.thickness = width;
      dot.curve!.width = width;
      addStrokes([dot]);
    };
    const finishStroke = async () => {
      const k = stroke;
      stroke = null;
      showPreview([]);
      if (!k) return;
      const s = st.current;
      if (k.pts.length < 6) { addDot(k, s); return; }
      const docAtStart = activeDoc();
      const sourcePoints = k.pts.slice();
      const sourceNormals = k.normals.slice();
      let pts = k.pts.slice();
      let pressures = k.pressures.slice();
      const type = s.tool === 'line' ? 'poly' : 'catmull';
      const closedGesture = type === 'catmull' && closesGesture(pts);
      const it = Math.round(s.smoothing * 6);
      if (it) pts = smooth3(pts, it, 0.5, closedGesture);
      const dist = cam().position.distanceTo(r.orbit.target);
      const tol = k.targetObj
        ? Math.max(0.0002, Math.min(0.01, dist * 0.0003 * (0.4 + s.smoothing)))
        : Math.max(0.0015, dist * 0.0015 * (0.4 + s.smoothing));
      if (type === 'poly') {
        pts = [...pts.slice(0, 3), ...pts.slice(-3)];
        pressures = [pressures[0] ?? 1, pressures[pressures.length - 1] ?? 1];
      } else {
        const simplified = simplify3WithPressures(pts, pressures, tol);
        pts = simplified.pts;
        pressures = simplified.pressures;
      }
      let closed = false;
      if (closedGesture) {
        const path = close3DStroke(pts, pressures);
        pts = path.pts; pressures = path.pressures; closed = path.closed;
      }
      let brushAsset: string | undefined;
      // A cyclic ribbon uses a solid ink mask at the seam: the ordinary brush strip's transparent
      // start/end caps would otherwise make a deliberately closed circle look disconnected.
      if (type !== 'poly' && s.geo === 'ribbon' && !closed && docAtStart) {
        try { brushAsset = await brushTextureAsset(docAtStart, s.brush); }
        catch (e) { toast(`The stroke was kept, but its brush texture could not be prepared: ${e instanceof Error ? e.message : e}`, 'error'); }
      }
      if (docAtStart && activeDoc()?.id !== docAtStart.id) {
        toast('The active 3D document changed while the brush was being prepared. The stroke was not committed; draw it again.', 'error');
        return;
      }
      const n = k.normal.toArray().map(rnd) as V3;
      if (k.targetObj && k.targetId) {
        // Store every copy on its projected target mesh in that mesh's local coordinates.
        const normals = remapSurfaceNormals(sourcePoints, sourceNormals, pts);
        const matrices = symMatrices(sceneRef.current.sym);
        const lift = s.geo === 'ribbon' ? 0 : s.thick;
        const paths = projectSurfaceSymmetryPaths(pts, normals, matrices, surfaces(), lift, k.targetObj);
        const objs = paths.map((path) => {
          const local = localizeSurfaceStroke(path.points, path.target);
          const worldNormal = path.normals.slice(0, 3) as V3;
          const localNormal = localizeSurfaceNormal(worldNormal, path.target);
          const targetId = objIdOf(path.target);
          const mirrored = path.symmetryIndex !== 0;
          const o = mkStroke(local.points, type, localNormal, pressures, brushAsset, { parent: targetId || k.targetId!, name: mirrored ? `Surface stroke (symmetry ${path.symmetryIndex})` : 'Surface brush stroke' }, s, closed);
          o.curve!.thickness = s.thick / local.averageWorldScale;
          o.curve!.width = s.thick / local.averageWorldScale;
          return o;
        });
        addStrokes(objs);
        return;
      }
      const mats = symMatrices(sceneRef.current.sym);
      addStrokes(mats.map((m, i) => { const o = mkStroke(applyMat(pts, m), type, n, pressures, brushAsset, {}, s, closed); if (i) o.name += ` (symmetry ${i})`; return o; }));
    };
    const finishBezier = async () => {
      const a = bez.current;
      bez.current = [];
      showPreview([]);
      force((x) => x + 1);
      if (a.length < 6) return;
      const s = st.current;
      const docAtStart = activeDoc();
      const P = (i: number) => { const j = Math.max(0, Math.min(a.length / 3 - 1, i)); return new THREE.Vector3(a[j * 3], a[j * 3 + 1], a[j * 3 + 2]); };
      const out: number[] = [];
      for (let i = 0; i < a.length / 3 - 1; i++) {
        const p0 = P(i), p1 = P(i + 1);
        const c1 = p0.clone().add(P(i + 1).sub(P(i - 1)).multiplyScalar(1 / 6)), c2 = p1.clone().sub(P(i + 2).sub(P(i)).multiplyScalar(1 / 6));
        if (!i) out.push(p0.x, p0.y, p0.z);
        out.push(c1.x, c1.y, c1.z, c2.x, c2.y, c2.z, p1.x, p1.y, p1.z);
      }
      let brushAsset: string | undefined;
      if (s.geo === 'ribbon' && docAtStart) {
        try { brushAsset = await brushTextureAsset(docAtStart, s.brush); }
        catch (e) { toast(`The curve was kept, but its brush texture could not be prepared: ${e instanceof Error ? e.message : e}`, 'error'); }
      }
      if (docAtStart && activeDoc()?.id !== docAtStart.id) {
        toast('The active 3D document changed while the brush was being prepared. The curve was not committed.', 'error');
        return;
      }
      const n = activePlane().normal.toArray().map(rnd) as V3;
      const pressures = new Array(out.length / 3).fill(1);
      addStrokes(symMatrices(sceneRef.current.sym).map((m) => mkStroke(applyMat(out, m), 'bezier', n, pressures, brushAsset, {}, s)));
    };
    const paintAt = (e: PointerEvent) => {
      setRay(e);
      const hit = ray.intersectObjects(surfaces(), false)[0];
      if (!hit || !hit.uv) return;
      const id = hit.object.userData.objId as string;
      const o = objOf(sceneRef.current, id);
      if (!o || o.kind === 'curve' || o.kind === 'image') return;
      const c = paintCanvasFor(o, true)!;
      const x = c.getContext('2d')!;
      x.fillStyle = st.current.fg;
      x.globalAlpha = e.pointerType === 'pen' ? Math.max(0.15, e.pressure) : 0.9;
      x.beginPath(); x.arc(hit.uv.x * 1024, (1 - hit.uv.y) * 1024, st.current.paintSize, 0, Math.PI * 2); x.fill();
      const mat = (hit.object as THREE.Mesh).material as THREE.MeshStandardMaterial;
      if (!mat.map) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; mat.map = t; mat.color.set('#ffffff'); mat.needsUpdate = true; }
      mat.map.needsUpdate = true;
    };
    const down = (e: PointerEvent) => {
      if (e.pointerType === 'touch' && touchGate.down(e.pointerId)) {
        cancelStroke(); // latch the complete two-finger gesture to camera navigation
        return;
      }
      if (e.button !== 0 || e.altKey) return;
      const s = st.current;
      if (s.tool === 'camera') return; // dedicated navigation tool: OrbitControls owns every drag
      downAt = { x: e.clientX, y: e.clientY };
      if (s.tool === 'select') {
        if (r.tc.dragging || r.tc.axis) return;
        setRay(e);
        const hh = ray.intersectObjects(r.handles, false)[0];
        if (hh) { setSelPt(hh.object.userData.handleIdx as number); downAt = null; return; }
        const hit = ray.intersectObjects(r.content.children, true).find((h) => !h.object.userData.handleIdx && h.object.userData.handleIdx !== 0);
        if (hit) { const id = objIdOf(hit.object); if (id !== st.current.selId) setSelPt(null); setSel(id); downAt = null; }
        return;
      }
      try { el.setPointerCapture(e.pointerId); capturedPointer = e.pointerId; } catch { capturedPointer = null; }
      if (s.tool === 'paint') { painting = true; paintAt(e); return; }
      if (s.target === 'surface' && (s.tool === 'draw' || s.tool === 'line')) {
        const h = surfacePoint(e, null);
        if (!h) { toast('Start a surface stroke on an object (cube, sphere, cylinder, cone, plane, torus or reference image).'); return; }
        stroke = { pts: [h.p.x, h.p.y, h.p.z], pressures: [eventPressure(e)], normals: h.normal.toArray(), plane: null, normal: h.normal, targetObj: h.obj, targetId: objIdOf(h.obj) };
        showPreview(stroke.pts, stroke.normals);
        return;
      }
      if (s.target === 'surface' && s.tool === 'bezier') { toast('Bézier anchors use a drawing plane. Choose Plane / depth for Bézier curves.'); return; }
      const pl = activePlane();
      const p = planePoint(e, pl.plane);
      if (!p) return;
      if (s.tool === 'bezier') {
        if (e.detail >= 2 && bez.current.length >= 6) { void finishBezier().catch((error) => toast('Bézier curve failed: ' + (error instanceof Error ? error.message : error), 'error')); return; }
        bez.current.push(p.x, p.y, p.z);
        showPreview(bez.current);
        force((x) => x + 1);
        return;
      }
      stroke = { pts: [p.x, p.y, p.z], pressures: [eventPressure(e)], normals: [], plane: pl.plane, normal: pl.normal, targetObj: null, targetId: null };
      showPreview(stroke.pts, stroke.normals);
    };
    const move = (e: PointerEvent) => {
      const coalesced = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
      const samples = coalesced.length ? [...coalesced, e] : [e];
      if (painting) { samples.forEach(paintAt); return; }
      if (!stroke) return;
      let changed = false;
      for (const sample of samples) {
        let p: THREE.Vector3 | null = null;
        let hitNormal: THREE.Vector3 | null = null;
        if (stroke.plane) p = planePoint(sample, stroke.plane);
        else {
          const h = surfacePoint(sample, stroke.targetObj);
          p = h ? h.p : null;
          hitNormal = h?.normal || null;
        }
        if (!p) continue;
        if (st.current.tool === 'line') {
          stroke.pts = [stroke.pts[0], stroke.pts[1], stroke.pts[2], p.x, p.y, p.z];
          stroke.pressures = [stroke.pressures[0] ?? 1, eventPressure(sample)];
          if (stroke.targetObj && hitNormal) stroke.normals = [...stroke.normals.slice(0, 3), ...hitNormal.toArray()];
          changed = true;
          continue;
        }
        const n = stroke.pts.length;
        const distance = cam().position.distanceTo(r.orbit.target);
        // Surface strokes keep a tighter world-space sampling interval so the smoothed ribbon hugs curved meshes.
        const minStep = stroke.targetObj ? Math.max(0.0002, Math.min(0.01, distance * 0.0005)) : Math.max(0.0001, distance * 0.002);
        if (Math.hypot(p.x - stroke.pts[n - 3], p.y - stroke.pts[n - 2], p.z - stroke.pts[n - 1]) > minStep) {
          stroke.pts.push(p.x, p.y, p.z);
          stroke.pressures.push(eventPressure(sample));
          if (stroke.targetObj && hitNormal) stroke.normals.push(...hitNormal.toArray());
          changed = true;
        }
      }
      if (changed) showPreview(stroke.pts, stroke.normals);
    };
    const up = (e: PointerEvent) => {
      if (e.pointerType === 'touch' && touchGate.up(e.pointerId)) { downAt = null; return; }
      if (painting) {
        paintAt(e);
        painting = false; capturedPointer = null;
        update((s) => { for (const o of s.objects) { const c = paintCanvases.get(o.id); if (c) o.paint = c.toDataURL('image/png'); } });
        return;
      }
      if (stroke) { move(e); capturedPointer = null; void finishStroke().catch((error) => toast('3D stroke failed: ' + (error instanceof Error ? error.message : error), 'error')); return; }
      // a click (not an orbit drag) on empty space clears the selection
      if (st.current.tool === 'select' && downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 4) { setSel(null); setSelPt(null); }
      downAt = null;
      capturedPointer = null;
    };
    const cancelStroke = () => {
      stroke = null; bez.current = []; painting = false; showPreview([]); force((x) => x + 1);
      if (capturedPointer !== null) {
        try { if (el.hasPointerCapture(capturedPointer)) el.releasePointerCapture(capturedPointer); } catch { /* capture can already be lost on pointercancel */ }
        capturedPointer = null;
      }
    };
    const flushPanPersist = (updateUI = true) => {
      window.clearTimeout(panPersistTimer);
      panPersistTimer = 0;
      const pending = pendingPan;
      pendingPan = null;
      if (!pending?.doc) return;
      const targetScene = pending.doc === activeDoc()
        ? sceneRef.current
        : pending.doc.scene3d ? sceneOf(pending.doc.scene3d) : pending.scene;
      persistSceneCamera(pending.doc, targetScene, pending.view);
      if (pending.doc === activeDoc()) {
        sceneRef.current = targetScene;
        if (updateUI) setSceneState(targetScene);
      }
    };
    r.flushPanPersist = flushPanPersist;
    const scheduleCameraPersist = () => {
      pendingPan = { doc: activeDoc(), scene: sceneRef.current, view: getView() };
      window.clearTimeout(panPersistTimer);
      panPersistTimer = window.setTimeout(flushPanPersist, 140);
    };
    r.orbit.addEventListener('change', scheduleCameraPersist);
    // Shift + wheel pans (trackpad-friendly). OrbitControls owns plain wheel = zoom / pinch = zoom.
    const wheel = (e: WheelEvent) => {
      if (!e.shiftKey || e.ctrlKey) return;
      e.preventDefault(); e.stopPropagation();
      cam().updateMatrixWorld(true);
      const k = cam().position.distanceTo(r.orbit.target) * 0.0012;
      const right = new THREE.Vector3().setFromMatrixColumn(cam().matrix, 0);
      const upv = new THREE.Vector3().setFromMatrixColumn(cam().matrix, 1);
      const dx = (e.deltaX || 0) * k, dy = (e.deltaY || 0) * k;
      r.orbit.target.addScaledVector(right, dx).addScaledVector(upv, -dy);
      cam().position.addScaledVector(right, dx).addScaledVector(upv, -dy);
      // This custom trackpad-pan path bypasses OrbitControls' start/end events; persist once
      // the wheel burst settles, or flush before any later camera gesture/view change.
      scheduleCameraPersist();
    };
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (getApp().dialog || getApp().confirmReq) return;
      const k = e.key.toLowerCase(), ctrl = e.ctrlKey || e.metaKey;
      let handled = true;
      if (e.key === 'Alt') { if (!altHeld) { altHeld = true; (r.orbit.mouseButtons as Record<string, THREE.MOUSE | null>).LEFT = THREE.MOUSE.ROTATE; } handled = false; }
      else if (ctrl && k === 'z' && !e.shiftKey) undo();
      else if (ctrl && (k === 'y' || (k === 'z' && e.shiftKey))) redo();
      else if (ctrl) handled = false;
      else if (e.key === 'Escape') { if (stroke || bez.current.length) cancelStroke(); else { setSel(null); setSelPt(null); } }
      else if (e.key === 'Enter' && st.current.tool === 'bezier') void finishBezier().catch((error) => toast('Bézier curve failed: ' + (error instanceof Error ? error.message : error), 'error'));
      else if (e.key === 'Delete' || e.key === 'Backspace') deleteSelection();
      else if (k === '[' || k === ']') update((s) => { s.draw.offset = rnd(s.draw.offset + (k === ']' ? 0.1 : -0.1)); }, false);
      else if (k === 'w') setTmode('translate');
      else if (k === 'e') setTmode('rotate');
      else if (k === 'r') setTmode('scale');
      else if (k === 'f') view('focus');
      else if (k === 'v') setTool3('select');
      else if (k === 'b') setTool3('draw');
      else if (k === 'c') setTool3('camera');
      else handled = false;
      if (handled) { e.preventDefault(); e.stopPropagation(); }
    };
    const keyUp = (e: KeyboardEvent) => { if (e.key === 'Alt') { altHeld = false; (r.orbit.mouseButtons as Record<string, THREE.MOUSE | null>).LEFT = isNavTool(st.current.tool) ? THREE.MOUSE.ROTATE : null; } };
    const cancelled = (e: PointerEvent) => { if (e.pointerType === 'touch') touchGate.up(e.pointerId); cancelStroke(); };
    const lostCapture = (e: PointerEvent) => {
      if (capturedPointer !== e.pointerId) return;
      capturedPointer = null;
      if (stroke || painting) cancelStroke();
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', cancelled);
    el.addEventListener('lostpointercapture', lostCapture);
    el.parentElement?.addEventListener('wheel', wheel, { passive: false, capture: true });
    window.addEventListener('keydown', key, true); // capture: 3D undo/redo must not reach the 2D shortcut handler
    window.addEventListener('keyup', keyUp);
    return () => { flushPanPersist(false); r.orbit.removeEventListener('change', scheduleCameraPersist); if (r.flushPanPersist === flushPanPersist) r.flushPanPersist = null; el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', cancelled); el.removeEventListener('lostpointercapture', lostCapture); el.parentElement?.removeEventListener('wheel', wheel, { capture: true }); window.removeEventListener('keydown', key, true); window.removeEventListener('keyup', keyUp); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webgl]);

  // ---------------- actions
  const sel = objOf(scene, selId);
  const editPts = (fn: (pts: number[]) => number[], label = 'edit') => { if (!sel?.curve) return; update((s) => { const o = objOf(s, sel.id)!; o.curve!.pts = round3(fn(o.curve!.pts)); }); void label; };
  function deleteSelection() {
    const s = sceneRef.current, id = st.current.selId, pi = st.current.selPt;
    const o = objOf(s, id);
    if (o?.curve && pi !== null) {
      if (o.curve.type === 'bezier') return toast('Convert the Bézier curve to a spline before deleting points.');
      if (o.curve.pts.length / 3 <= 2) return toast('A stroke needs at least two points.');
      update((x) => { const c = objOf(x, o.id)!.curve!; c.pts.splice(pi * 3, 3); });
      setSelPt(null);
      return;
    }
    if (o) {
      const kids = s.objects.filter((x) => x.parent === o.id);
      update((x) => ({ ...x, objects: x.objects.filter((y) => y.id !== o.id && y.parent !== o.id) }));
      paintCanvases.delete(o.id);
      setSel(null);
      if (kids.length) toast(`Deleted “${o.name}” and ${kids.length} surface stroke${kids.length > 1 ? 's' : ''} attached to it (Ctrl+Z restores).`);
      return;
    }
    if (s.lights.some((l) => l.id === id)) { update((x) => ({ ...x, lights: x.lights.filter((l) => l.id !== id) })); setSel(null); }
  }
  const add = (kind: Kind) => {
    const target = R.current?.orbit.target || new THREE.Vector3();
    const o: Obj = { id: uid('o'), name: kind[0].toUpperCase() + kind.slice(1), kind, pos: [rnd(target.x), rnd(Math.max(0.5, target.y + 0.5)), rnd(target.z)], rot: [0, 0, 0], scale: [1, 1, 1], mat: { ...MAT_PRESETS.Clay }, visible: true };
    update((s) => { s.objects.push(o); });
    setSel(o.id); setSelPt(null); setTool3('select');
  };
  const addImagePlane = async (fromCanvas: boolean) => {
    const d = activeDoc();
    if (!d) return;
    let url: string;
    if (fromCanvas) url = compositeDoc(d, Math.min(1, 2048 / Math.max(d.width, d.height))).toDataURL('image/png');
    else {
      const f = await pickFile('image/png,image/jpeg,image/webp');
      if (!f) return;
      if (f.size > 25 * 1024 * 1024) return toast('Image is larger than 25 MB.', 'error');
      url = await blobToDataURL(f);
    }
    try {
      const img = await loadImage(url);
      const id = uid('asset-');
      d.assets[id] = url; d.assetImgs.set(id, img);
      const o: Obj = { id: uid('o'), name: fromCanvas ? `Canvas: ${d.name}` : 'Reference image', kind: 'image', asset: id, aspect: img.width / img.height, source: fromCanvas ? 'canvas' : 'file', pos: [0, 1, 0], rot: [0, 0, 0], scale: [2, 2, 2], mat: { color: '#ffffff', roughness: 1, metalness: 0, opacity: 1 }, visible: true };
      update((s) => { s.objects.push(o); });
      setSel(o.id); setTool3('select');
      toast('Reference plane added. You can draw on it with Surface target.', 'success');
    } catch { toast('That image could not be decoded.', 'error'); }
  };
  const refreshCanvasPlane = async () => {
    const d = activeDoc();
    if (!d || !sel || sel.kind !== 'image') return;
    const url = compositeDoc(d, Math.min(1, 2048 / Math.max(d.width, d.height))).toDataURL('image/png');
    const img = await loadImage(url);
    const id = uid('asset-');
    d.assets[id] = url; d.assetImgs.set(id, img);
    update((s) => { const o = objOf(s, sel.id)!; o.asset = id; o.aspect = img.width / img.height; });
  };
  function view(v: 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom' | 'iso' | 'reset' | 'focus') {
    const r = R.current;
    if (!r) return;
    if (v === 'focus') {
      const m = selId ? r.meshes.get(selId) : null;
      if (!m) return toast('Select an object or stroke to focus.');
      const b = new THREE.Box3().setFromObject(m), c = b.getCenter(new THREE.Vector3()), rad = b.getSize(new THREE.Vector3()).length() || 1;
      const dir = cam().position.clone().sub(r.orbit.target).normalize();
      return applyView({ ...getView(), target: c.toArray() as V3, pos: c.clone().addScaledVector(dir, rad * 1.6 + 0.5).toArray() as V3 }, true);
    }
    const t = r.orbit.target.clone(), d = Math.max(4, cam().position.distanceTo(t));
    const dirs: Record<string, V3> = { front: [0, 0, 1], back: [0, 0, -1], left: [-1, 0, 0], right: [1, 0, 0], top: [0, 1, 0.0001], bottom: [0, -1, 0.0001], iso: [0.577, 0.577, 0.577] };
    if (v === 'reset') return applyView({ ...DEFAULT_VIEW, ortho: sceneRef.current.ortho }, true);
    const p = t.clone().addScaledVector(new THREE.Vector3(...dirs[v]).normalize(), d);
    applyView({ ...getView(), pos: p.toArray() as V3, target: t.toArray() as V3 }, true);
  }
  const saveView = async () => {
    const n = await promptDialog('Save camera view', 'Name (e.g. “Hero close-up”, “Street wide”):', `View ${sceneRef.current.views.length + 1}`);
    if (n === null) return;
    update((s) => { s.views.push({ id: uid('vw'), name: n.slice(0, 60), view: getView() }); });
    toast(`Saved view “${n}”`, 'success');
  };
  const renderToLayer = async () => {
    const d = activeDoc();
    if (!d) return;
    setBusy(true);
    try {
      const v = getView();
      const named = sceneRef.current.views.find((x) => JSON.stringify(x.view) === JSON.stringify(v));
      const id = await captureToLayer({ target: d, sceneDoc: d, view: v, viewName: named?.name, rect: { x: 0, y: 0, w: d.width, h: d.height }, name: '3D render' + (named ? ` · ${named.name}` : ''), transparent: transparentRender });
      if (id) toast('Rendered to a new 2D layer, linked to this scene. The scene stays editable, and Layers → “Return to scene” brings you back.', 'success');
    } catch (e) { toast('Render failed: ' + (e instanceof Error ? e.message : e), 'error'); }
    setBusy(false);
  };
  const setDraw = (p: Partial<Scene3D['draw']>, record = false) => update((s) => { s.draw = { ...s.draw, ...p }; }, record);
  /** Camera perspective strength (field of view); saved with the scene like position and target. */
  const setFov = (fov: number) => {
    const r = R.current;
    if (!r) return;
    r.persp.fov = fov;
    r.persp.updateProjectionMatrix();
    update((s) => {
      const base = s.camera || getViewFor(s.ortho);
      s.camera = { ...base, fov, ortho: s.ortho };
    }, false);
  };
  const setSym = (p: Partial<Scene3D['sym']>) => update((s) => { s.sym = { ...s.sym, ...p }; }, false);
  const symCount = symMatrices(scene.sym).length;

  const T = (id: Tool3, Icon: typeof Brush, label: string) => (
    <button title={label} aria-pressed={tool === id} onClick={() => { setTool3(id); bez.current = []; setSelPt(null); }} className={cn('flex h-9 w-9 items-center justify-center rounded-md', tool === id ? 'bg-[#E8913A] text-neutral-950' : 'text-neutral-300 hover:bg-white/10')}><Icon size={17} /></button>
  );
  const S3 = ({ children }: { children: React.ReactNode }) => <div className="pt-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">{children}</div>;

  if (!doc) return <div className="flex h-full items-center justify-center text-sm text-neutral-500">Open or create a document to use 3D Studio.</div>;
  if (!webgl) return <div className="flex h-full items-center justify-center p-8 text-center text-sm text-neutral-400">WebGL isn't available on this system or browser, so 3D Studio can't start.<br />Your 2D tools and saved 3D scene data are unaffected.</div>;
  const hostRect = host.current?.getBoundingClientRect();
  const frame = panelEdit && hostRect ? { h: hostRect.height, w: hostRect.height * panelEdit.aspect } : null;
  const drawingTool = tool === 'draw' || tool === 'bezier' || tool === 'line';

  return (
    <div className="absolute inset-0 flex">
      <div className="flex w-12 flex-col items-center gap-1 border-r border-black/50 bg-[#161618] py-2" aria-label="3D drawing tools">
        {T('camera', Orbit, 'Camera / navigate (C): drag to orbit · wheel zoom · Shift+wheel or right-drag pan · touch: 1 finger orbit, 2 fingers pan & pinch')}
        {T('select', MousePointer2, 'Select & edit (V): click objects, strokes or control points. W/E/R = move/rotate/scale, F = focus, Delete = remove')}
        {T('draw', PenLine, 'Freehand stroke in space (B): draws on the active plane or on surfaces. [ / ] move the depth plane')}
        {T('bezier', Spline, 'Bézier curve: click anchors, then Enter or double-click to finish')}
        {T('line', Slash, 'Straight guide line')}
        {T('paint', Brush, 'Paint on object surfaces (UV texture)')}
        <div className="my-1 h-px w-8 bg-white/10" />
        <button title="Undo 3D (Ctrl+Z)" onClick={undo} className="rounded p-2 text-neutral-400 hover:bg-white/10"><Undo2 size={15} /></button>
        <button title="Redo 3D (Ctrl+Y)" onClick={redo} className="rounded p-2 text-neutral-400 hover:bg-white/10"><Redo2 size={15} /></button>
      </div>
      <div className="relative min-w-0 flex-1">
        <div ref={host} className="absolute inset-0" />
        <div className="pointer-events-none absolute left-3 top-3 max-w-[70%] rounded bg-black/55 px-2 py-1 text-[11px] text-neutral-200">
          <b className={tool === 'camera' ? 'text-sky-300' : 'text-[#E8913A]'}>{tool === 'camera' ? 'Camera · navigate' : tool === 'select' ? 'Select' : tool === 'paint' ? 'Paint' : tool === 'bezier' ? 'Bézier' : tool === 'line' ? 'Line' : 'Freehand'}</b>
          {drawingTool && <> · {target === 'surface' ? (tool === 'bezier' ? 'Bézier needs a drawing plane' : 'on object surfaces') : `${PLANE_LABEL[scene.draw.mode]}, depth ${scene.draw.offset.toFixed(2)}`}{symCount > 1 && !(target === 'surface' && tool === 'bezier') ? ` · ${target === 'surface' ? 'surface symmetry' : 'symmetry'} ×${symCount}` : ''}</>}
          {tool === 'bezier' && bez.current.length > 0 && ` · ${bez.current.length / 3} anchors`}
          {drawingTool && scene.ground !== false && target === 'plane' && scene.draw.mode === 'xz' && scene.draw.offset === 0 && ' · on the white ground'}
          <span className="ml-2 text-neutral-400">
            {touchDevice
              ? (drawingTool && target === 'plane'
                ? '1 finger draws · 2 fingers pan & pinch zoom · use the Camera tool to orbit with 1 finger'
                : '1 finger orbits (Camera / Select) · 2 fingers pan & pinch zoom')
              : tool === 'camera'
                ? 'Drag orbit · Middle or right-drag pan · Wheel zoom · Shift+wheel pan'
                : `Middle-drag orbit · Shift+middle pan · Right-drag pan · Wheel zoom${tool !== 'select' ? ' · Alt+left orbit' : ' · Left-drag empty space orbits'}`}
          </span>
        </div>
        {panelEdit && panelEdit.sceneDoc === doc.meta.uuid && (
          <>
            {frame && <div className="pointer-events-none absolute top-0 h-full border-2 border-dashed border-[#E8913A]/80" style={{ width: frame.w, left: `calc(50% - ${frame.w / 2}px)` }} />}
            <div className="absolute left-1/2 top-12 z-10 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-[#E8913A]/50 bg-neutral-900/95 px-3 py-2 text-[12px] text-neutral-200 shadow-xl">
              <Camera size={14} className="text-[#E8913A]" /> Framing a comic panel. The dashed frame shows the panel's width.
              <Btn variant="primary" onClick={async () => { setBusy(true); try { await finishPanelEdit(getView()); } catch (e) { toast('Capture failed: ' + (e instanceof Error ? e.message : e), 'error'); } setBusy(false); }}>{busy ? 'Capturing…' : 'Save camera to panel & recapture'}</Btn>
              <Btn onClick={() => useNav.setState({ panelEdit: null })}>Cancel</Btn>
            </div>
          </>
        )}
        <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 flex-wrap justify-center gap-1 rounded-lg bg-black/60 p-1">
          {(['front', 'top', 'iso', 'focus', 'reset'] as const).map((v) => <Btn key={v} onClick={() => view(v)} title={v === 'focus' ? 'Focus selection (F)' : v === 'reset' ? 'Reset camera' : `${v} view`}>{v === 'reset' ? 'Reset' : v}</Btn>)}
          <Btn active={scene.ortho} onClick={() => setOrtho(!scene.ortho)}>{scene.ortho ? 'Ortho' : 'Perspective'}</Btn>
        </div>
      </div>
      <aside className="w-[270px] max-w-[38vw] shrink-0 space-y-1.5 overflow-y-auto border-l border-black/50 bg-[#1b1b1e] p-2.5 text-[11px]" aria-label="3D Drawing Workspace">
        <div className="sticky top-0 z-10 -mx-2.5 -mt-2.5 flex items-center justify-between border-b border-white/10 bg-[#1b1b1e]/95 px-2.5 py-2 backdrop-blur">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#E8913A]">3D Drawing</div>
            <div className="truncate text-[10px] text-neutral-400">Carbon brush · {activeBrush.name}</div>
          </div>
          <button disabled={homeSaving} onClick={() => void navigateHomeSafely()} title="Save the current project before returning Home" className="flex shrink-0 items-center gap-1 rounded border border-white/10 px-2 py-1 text-[10px] text-neutral-200 hover:bg-white/10 disabled:opacity-50"><HomeIcon size={12} />{homeSaving ? 'Saving…' : 'Home'}</button>
        </div>
        <S3>Brush · Carbon 2D</S3>
        <Select label="Tip" value={activeBrush.id} onChange={setSpatialBrushId} options={brushOptions} />
        <div className="flex items-center justify-between py-0.5 text-[10px] text-neutral-400"><span>Ink color</span><input aria-label="3D stroke color" type="color" value={fg} onChange={(e) => setColor(e.target.value)} className="h-6 w-9 cursor-pointer rounded border border-white/10 bg-neutral-900 p-0.5" /></div>
        <Slider label="Stroke width" value={brushScale} min={0.1} max={5} step={0.05} fmt={(v) => `${Math.max(0.004, Math.min(2, activeBrush.size / 50 * v)).toFixed(3)} u`} onChange={setBrushScale} />
        <Slider label="Opacity" value={opacity} min={0.05} max={1} onChange={setOpacity} />
        <Slider label="Taper" value={taper} min={0} max={1} onChange={setTaper} />
        <Slider label="Smoothing" value={smoothing} min={0} max={1} onChange={setSmoothing} />
        <p className="text-[10px] leading-snug text-neutral-500">The selected 2D tip becomes a textured ribbon. Pen pressure follows that brush’s pressure-size setting; choose a pressure-sensitive brush for variable width. Mouse input draws at full pressure.</p>
        <details className="rounded border border-white/5 bg-black/10 px-2 py-1">
          <summary className="cursor-pointer py-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">Advanced geometry</summary>
          <Select label="Form" value={geo} onChange={setGeo} options={[{ value: 'ribbon', label: 'Textured ribbon (2D brush)' }, { value: 'tube', label: 'Tube' }, { value: 'sweep', label: 'Swept profile' }, { value: 'line', label: 'Thin line' }, { value: 'surface', label: 'Surface loop' }]} />
          <div className="text-[10px] text-neutral-500">Ribbon is the default drawing form. Tube and swept forms create solid geometry.</div>
        </details>
        <S3>Drawing target</S3>
        <div className="flex gap-1"><Btn active={target === 'plane'} onClick={() => setTarget('plane')}>Plane / depth</Btn><Btn active={target === 'surface'} onClick={() => setTarget('surface')}>Object surfaces</Btn></div>
        {target === 'plane' ? (
          <>
            <Select label="Plane" value={scene.draw.mode} onChange={(v) => setDraw({ mode: v }, true)} options={(Object.keys(PLANE_LABEL) as PlaneMode[]).map((k) => ({ value: k, label: PLANE_LABEL[k] }))} />
            <Slider label="Depth / offset" value={scene.draw.offset} min={-6} max={6} step={0.01} fmt={(v) => v.toFixed(2)} onChange={(v) => setDraw({ offset: v })} />
            {scene.draw.mode === 'custom' && (
              <>
                {(['x', 'y', 'z'] as const).map((a, i) => <Slider key={a} label={`Tilt ${a.toUpperCase()}`} value={scene.draw.rot[i]} min={-180} max={180} step={1} fmt={(v) => v + '°'} onChange={(v) => { const rot = [...scene.draw.rot] as V3; rot[i] = v; setDraw({ rot }); }} />)}
                {(['x', 'y', 'z'] as const).map((a, i) => <Slider key={'p' + a} label={`Origin ${a.toUpperCase()}`} value={scene.draw.pos[i]} min={-6} max={6} step={0.05} fmt={(v) => v.toFixed(2)} onChange={(v) => { const pos = [...scene.draw.pos] as V3; pos[i] = v; setDraw({ pos }); }} />)}
                {sel && sel.kind !== 'curve' && <Btn onClick={() => setDraw({ pos: [...sel.pos], rot: sel.rot.map((r) => Math.round((r * 180) / Math.PI)) as V3, offset: 0 }, true)}>Align plane to selected object</Btn>}
              </>
            )}
            <Toggle label="Snap to coordinate increments" checked={scene.snap} onChange={(v) => update((s) => { s.snap = v; })} />
            {scene.snap && <Slider label="Snap step" value={scene.gridSize} min={0.05} max={1} step={0.05} fmt={(v) => v.toFixed(2)} onChange={(v) => update((s) => { s.gridSize = v; }, false)} />}
            <p className="text-[10px] text-neutral-500">The plane is mathematical and has no drawing edge; the camera-following ground patch is only a visual surface. Press [ and ] to shift plane depth, or choose Depth plane to draw facing the camera.</p>
          </>
        ) : <p className="text-[10px] text-neutral-500">Freehand and straight-line strokes stick to the surface you start on and follow that object when it moves. Mirror and radial copies are ray-projected onto visible meshes and parented to the surface they hit; a copy is skipped if its full path cannot stay on one matching surface. Every copy is a separate editable curve. Bézier anchors require Plane / depth. Supported surfaces: cube, sphere, cylinder, cone, plane, torus and reference images.</p>}

        <S3>Symmetry {symCount > 1 && <span className="text-[#9a7cff]">×{symCount}</span>}</S3>
        <div className="flex gap-1">{(['x', 'y', 'z'] as const).map((a) => <Btn key={a} active={scene.sym.mirror[a]} onClick={() => setSym({ mirror: { ...scene.sym.mirror, [a]: !scene.sym.mirror[a] } })}>Mirror {a.toUpperCase()}</Btn>)}</div>
        <Slider label="Radial copies" value={scene.sym.radial} min={1} max={16} step={1} fmt={(v) => String(v)} onChange={(v) => setSym({ radial: v })} />
        {scene.sym.radial > 1 && <Select label="Axis" value={scene.sym.axis} onChange={(v) => setSym({ axis: v })} options={[{ value: 'y', label: 'Y (vertical)' }, { value: 'x', label: 'X' }, { value: 'z', label: 'Z' }]} />}
        <div className="grid grid-cols-3 gap-1">{(['x', 'y', 'z'] as const).map((a, i) => <label key={a} className="text-[10px] text-neutral-500">Center {a}<input type="number" step={0.1} value={scene.sym.center[i]} onKeyDown={(e) => e.stopPropagation()} onChange={(e) => { const c = [...scene.sym.center] as V3; c[i] = Number(e.target.value) || 0; setSym({ center: c }); }} className="w-full rounded bg-neutral-900 px-1 py-0.5 text-neutral-200 outline-none ring-1 ring-white/10" /></label>)}</div>
        <p className="text-[10px] text-neutral-500">Purple preview lines show editable copies; on object surfaces they are projected to real visible meshes, never left as floating transformed geometry.</p>

        {sel && (
          <div className="space-y-1 border-t border-white/5 pt-2">
            <input value={sel.name} onChange={(e) => update((s) => { objOf(s, sel.id)!.name = e.target.value; }, false)} onKeyDown={(e) => e.stopPropagation()} className="w-full rounded bg-neutral-900 px-2 py-1 text-neutral-100 outline-none ring-1 ring-white/10" aria-label="Name" />
            {sel.parent && <div className="text-[10px] text-sky-300">Attached to “{objOf(scene, sel.parent)?.name || 'missing object'}”</div>}
            <div className="flex gap-1">{(['translate', 'rotate', 'scale'] as const).map((m, i) => <Btn key={m} active={tmode === m && selPt === null} onClick={() => { setTmode(m); setSelPt(null); setTool3('select'); }} title={'WER'[i]}>{m}</Btn>)}</div>
            {sel.curve ? (
              <>
                <S3>Control points · {sel.curve.pts.length / 3}{selPt !== null ? ` · point ${selPt + 1} selected` : ''}</S3>
                <div className="flex flex-wrap gap-1">
                  <Btn disabled={sel.curve.type === 'bezier'} title="Insert a point after the selected one (or at the end)" onClick={() => editPts((p) => { const n = p.length / 3, i = selPt ?? n - 1; const a = i * 3, b = Math.min(n - 1, i + 1) * 3; const m = i < n - 1 ? [(p[a] + p[b]) / 2, (p[a + 1] + p[b + 1]) / 2, (p[a + 2] + p[b + 2]) / 2] : [p[a] * 2 - p[a - 3], p[a + 1] * 2 - p[a - 2], p[a + 2] * 2 - p[a - 1]]; const o = p.slice(); o.splice((i + 1) * 3, 0, ...m); return o; })}>+ Point</Btn>
                  <Btn disabled={selPt === null} onClick={deleteSelection}>− Point</Btn>
                  <Btn disabled={sel.curve.type === 'bezier'} onClick={() => editPts((p) => smooth3(p, 2, 0.5, sel.curve!.closed))}>Smooth</Btn>
                  <Btn disabled={sel.curve.type === 'bezier'} onClick={() => editPts((p) => simplify3(p, simpTol))}>Simplify</Btn>
                  {sel.curve.type === 'bezier' && <Btn onClick={() => update((s) => { const c = objOf(s, sel.id)!.curve!; const a: number[] = []; for (let i = 0; i < c.pts.length; i += 9) a.push(c.pts[i], c.pts[i + 1], c.pts[i + 2]); const L = c.pts.length; a.push(c.pts[L - 3], c.pts[L - 2], c.pts[L - 1]); c.pts = round3(a); c.type = 'catmull'; })}>To editable spline</Btn>}
                </div>
                <Slider label="Simplify tol." value={simpTol} min={0.002} max={0.2} step={0.002} fmt={(v) => v.toFixed(3)} onChange={setSimpTol} />
                <details className="rounded border border-white/5 px-2 py-1">
                  <summary className="cursor-pointer py-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">Advanced curve shape</summary>
                  <div className="mt-1 space-y-1">
                <Select label="Geometry" value={sel.curve.geo} onChange={(v) => update((s) => { objOf(s, sel.id)!.curve!.geo = v; })} options={[{ value: 'tube', label: 'Tube' }, { value: 'ribbon', label: 'Ribbon' }, { value: 'sweep', label: 'Swept profile' }, { value: 'line', label: 'Line' }, { value: 'surface', label: 'Surface' }]} />
                <Slider label="Thickness" value={sel.curve.thickness} min={0.002} max={0.5} step={0.001} fmt={(v) => v.toFixed(3)} onChange={(v) => update((s) => { objOf(s, sel.id)!.curve!.thickness = v; }, false)} />
                <Slider label="Taper" value={sel.curve.taper || 0} min={0} max={1} onChange={(v) => update((s) => { objOf(s, sel.id)!.curve!.taper = v; }, false)} />
                {sel.curve.geo === 'ribbon' && <Slider label="Ribbon width" value={sel.curve.width} min={0.005} max={2} step={0.005} fmt={(v) => v.toFixed(3)} onChange={(v) => update((s) => { objOf(s, sel.id)!.curve!.width = v; }, false)} />}
                <Slider label="Resolution" value={sel.curve.segments} min={8} max={800} step={1} fmt={(v) => String(v)} onChange={(v) => update((s) => { objOf(s, sel.id)!.curve!.segments = v; }, false)} />
                <Toggle label="Closed loop" checked={sel.curve.closed} onChange={(v) => update((s) => { objOf(s, sel.id)!.curve!.closed = v; })} />
                <div className="flex flex-wrap gap-1">
                  {(['x', 'y', 'z'] as const).map((a) => (
                    <Btn key={a} disabled={!!sel.parent} title="Duplicate mirrored through the symmetry center" onClick={() => update((s) => {
                      const o = structuredClone(objOf(s, sel.id)!);
                      const c = new THREE.Vector3(...s.sym.center);
                      const m = new THREE.Matrix4().makeTranslation(c.x, c.y, c.z).multiply(new THREE.Matrix4().makeScale(a === 'x' ? -1 : 1, a === 'y' ? -1 : 1, a === 'z' ? -1 : 1)).multiply(new THREE.Matrix4().makeTranslation(-c.x, -c.y, -c.z));
                      o.curve!.pts = round3(applyMat(applyMat(o.curve!.pts, objMatrix(o)), m));
                      o.id = uid('o'); o.name += ` (mirror ${a.toUpperCase()})`; o.pos = [0, 0, 0]; o.rot = [0, 0, 0]; o.scale = [1, 1, 1];
                      s.objects.push(o);
                    })}>Mirror {a.toUpperCase()}</Btn>
                  ))}
                </div>
                    <p className="text-[10px] text-neutral-500">Click a white point to select it, then drag the handle. Geometry remains editable through its source points.</p>
                  </div>
                </details>
              </>
            ) : null}
            {sel.kind !== 'curve' && sel.kind !== 'image' && <div className="flex items-center gap-2 text-neutral-500">Surface color<input type="color" value={sel.mat.color} onChange={(e) => update((s) => { objOf(s, sel.id)!.mat.color = e.target.value; })} /><Btn onClick={() => update((s) => { objOf(s, sel.id)!.mat.color = fg; })}>Use ink</Btn></div>}
            {sel.kind !== 'curve' && <Slider label="Surface opacity" value={sel.mat.opacity} min={0.05} max={1} onChange={(v) => update((s) => { objOf(s, sel.id)!.mat.opacity = v; }, false)} />}
            {sel.kind === 'curve' && <p className="text-[10px] text-neutral-500">Stroke color and width are set by the Carbon brush used to draw this path.</p>}
            {sel.kind === 'image' && sel.source === 'canvas' && <Btn onClick={refreshCanvasPlane}>Refresh from 2D canvas</Btn>}
            <div className="flex gap-1">
              <Btn onClick={() => update((s) => { const o = structuredClone(objOf(s, sel.id)!); o.id = uid('o'); o.name += ' copy'; o.pos = [o.pos[0] + 0.3, o.pos[1], o.pos[2] + 0.3]; s.objects.push(o); })}><Copy size={11} /> Duplicate</Btn>
              <Btn onClick={deleteSelection}><Trash2 size={11} /> Delete</Btn>
            </div>
          </div>
        )}

        <details className="border-t border-white/5 pt-2">
          <summary className="cursor-pointer py-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">Reference surfaces · {scene.objects.length}</summary>
          <div className="mt-1 space-y-1">
            <div className="grid grid-cols-3 gap-1">{(['cube', 'sphere', 'cylinder', 'cone', 'plane', 'torus'] as Kind[]).map((k) => <Btn key={k} onClick={() => add(k)}>{k}</Btn>)}</div>
          <div className="flex gap-1"><Btn onClick={() => addImagePlane(true)}><ImageIcon size={11} /> 2D canvas as plane</Btn><Btn onClick={() => addImagePlane(false)}>Image plane…</Btn></div>
          <div className="max-h-40 space-y-px overflow-y-auto rounded border border-white/5 p-1">
            {scene.objects.filter((o) => !o.parent).map((o) => (
              <div key={o.id}>
                {[o, ...scene.objects.filter((c) => c.parent === o.id)].map((x, i) => (
                  <div key={x.id} className={cn('flex items-center gap-1 rounded px-1', selId === x.id ? 'bg-[#E8913A]/15' : 'hover:bg-white/5', i && 'ml-3')}>
                    <button className="flex-1 truncate py-0.5 text-left text-neutral-300" onClick={() => { setSel(x.id); setSelPt(null); setTool3('select'); }}>{x.name}</button>
                    <button title={x.visible ? 'Hide' : 'Show'} onClick={() => update((s) => { const y = objOf(s, x.id)!; y.visible = !y.visible; })} className="text-neutral-500 hover:text-white">{x.visible ? <Eye size={11} /> : <EyeOff size={11} />}</button>
                  </div>
                ))}
              </div>
            ))}
            {!scene.objects.length && <div className="p-1 text-neutral-500">Empty scene. Draw a stroke or add an object.</div>}
          </div>
            {tool === 'paint' && <Slider label="Paint size" value={paintSize} min={2} max={120} step={1} fmt={(v) => v + 'px'} onChange={setPaintSize} />}
          </div>
        </details>

        <details className="border-t border-white/5 pt-2">
          <summary className="cursor-pointer py-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">Saved camera views</summary>
          <div className="mt-1 space-y-1">
            <Btn onClick={saveView}><Camera size={11} /> Save current view</Btn>
            {scene.views.map((v) => (
              <div key={v.id} className="flex items-center gap-1">
                <button className="flex-1 truncate rounded bg-white/5 px-2 py-1 text-left text-neutral-300 hover:bg-white/10" onClick={() => applyView(v.view, true)}>{v.name}</button>
                <button title="Update to current camera" className="text-neutral-500 hover:text-white" onClick={() => update((s) => { s.views.find((x) => x.id === v.id)!.view = getView(); })}>⟳</button>
                <button title="Rename" className="text-neutral-500 hover:text-white" onClick={async () => { const n = await promptDialog('Rename view', 'Name:', v.name); if (n) update((s) => { s.views.find((x) => x.id === v.id)!.name = n; }); }}>✎</button>
                <button title="Delete" className="text-neutral-500 hover:text-red-400" onClick={async () => { if ((await confirmDialog('Delete view?', `Remove the saved view “${v.name}”? Panels already captured keep their own copy of the camera.`, [{ label: 'Cancel', value: 'n' }, { label: 'Delete', value: 'y', variant: 'danger' }])) === 'y') update((s) => { s.views = s.views.filter((x) => x.id !== v.id); }); }}><Trash2 size={11} /></button>
              </div>
            ))}
          </div>
        </details>

        <div className="space-y-1 border-t border-white/5 pt-2">
          <S3>Workspace surface</S3>
          <Toggle label="Show camera-following white ground" checked={scene.ground !== false} onChange={(v) => update((s) => { s.ground = v; })} />
          <p className="text-[10px] leading-snug text-neutral-500">The ground is a lightweight two-triangle patch that follows the camera target. Drawing rays still use an unbounded mathematical plane; there is no edge to reach.</p>
        </div>

        <details className="border-t border-white/5 pt-2">
          <summary className="cursor-pointer py-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">Background & rendering</summary>
          <div className="mt-1 space-y-1">
            <div className="flex items-center gap-2 text-neutral-500">Background<input type="color" value={scene.bg} onChange={(e) => update((s) => { s.bg = e.target.value; }, false)} /></div>
            <Slider label="Ambient light" value={scene.ambient} min={0} max={3} onChange={(v) => update((s) => { s.ambient = v; }, false)} />
            <Slider label="Perspective strength" value={scene.camera?.fov || 45} min={18} max={95} step={1} fmt={(v) => v + '°'} onChange={setFov} />
          </div>
        </details>

        <details className="border-t border-white/5 pt-2">
          <summary className="cursor-pointer py-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">Render into 2D artwork</summary>
          <div className="mt-1 space-y-1">
            <Toggle label="Transparent render background" checked={transparentRender} onChange={setTransparentRender} />
            <Btn variant="primary" className="w-full" disabled={busy} onClick={renderToLayer}><ImageIcon size={11} /> {busy ? 'Rendering…' : 'Render view to linked 2D layer'}</Btn>
            <p className="text-[10px] leading-snug text-neutral-500">The editable scene, strokes, camera views and reference planes are saved in this .carbon project. The rendered layer keeps a link to its scene and view.</p>
          </div>
        </details>
      </aside>
    </div>
  );
}
