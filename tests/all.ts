/**
 * Carbon: Prime — unit tests for the DOM-free engine core (run via `npm test`).
 * These import the real modules; nothing here is a copy of engine code.
 * Canvas-dependent acceptance tests live in src/engine/selftest*.ts and run in-app
 * (Help → Run Diagnostics).
 */
import {
  APP_LABEL, APP_VERSION, LS_SUFFIX, PRODUCT_NAME, PRODUCT_TAGLINE, SEMVER, WINDOWS_VERSION, compareSemver,
} from '../src/version';
import { RELEASES } from '../src/release/releases';
import {
  DEFAULT_VIEW, applyMat, colorLuminance, curvePath, defaultScene, makeGrid, sceneOf, simplify3, smooth3, symMatrices,
} from '../src/win/sceneRender';
import { buildPresets } from '../src/engine/brushes';
import { brushFingerprint } from '../src/engine/brushes';
import { MIME, FORMAT_VERSION, isComicArchive, verifyBytes } from '../src/engine/fileFormat';
import { LAYOUTS, PAGE_PRESETS, layoutPanels } from '../src/engine/comic';
import { clamp, hexToRgb, hexToHsv, hsvToHex, isHex, normHex, rgbToHex, rgbToHsv, hsvToRgb } from '../src/engine/util';

// ---------------------------------------------------------------- tiny harness
let pass = 0;
const failures: string[] = [];
function ok(cond: unknown, msg: string) {
  if (cond) pass++;
  else failures.push(msg);
}
function eq<T>(a: T, b: T, msg: string) {
  ok(JSON.stringify(a) === JSON.stringify(b), `${msg} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`);
}
function throws(fn: () => unknown, msg: string) {
  try { fn(); failures.push(msg + ' (did not throw)'); } catch { pass++; }
}
function section(name: string) {
  console.log(`\n▶ ${name}`);
}

// ---------------------------------------------------------------- 1. version identity
section('Release identity (Carbon: Prime 7.x+ls)');
ok(SEMVER.test(WINDOWS_VERSION), `WINDOWS_VERSION ${WINDOWS_VERSION} must be MAJOR.MINOR.PATCH`);
eq(APP_VERSION, WINDOWS_VERSION + LS_SUFFIX, 'APP_VERSION = WINDOWS_VERSION + "+ls"');
eq(APP_LABEL, `CARBON PRIME ${WINDOWS_VERSION}${LS_SUFFIX}`, 'APP_LABEL uses the PRIME +ls identity');
eq(LS_SUFFIX, '+ls', 'release suffix is "+ls" (Local Storage)');
eq(PRODUCT_NAME, 'Carbon: Prime', 'product name');
eq(PRODUCT_TAGLINE, 'Where all starts begin.', 'tagline preserved');
ok(compareSemver(WINDOWS_VERSION, '2.2.0') > 0, '7.x is newer than 2.2.0');
ok(compareSemver('7.0.0', '7.1.0') < 0, 'compareSemver orders minor versions');
ok(WINDOWS_VERSION.startsWith('7.'), 'release stays on the 7.x line (never Carbon 8)');

const first = RELEASES[0];
ok(!!first, 'release notes are bundled');
if (first) {
  eq(first.version, WINDOWS_VERSION, 'release notes start at the running version');
  eq(first.suffix, LS_SUFFIX, 'current release carries the +ls suffix');
  ok(first.date === null || /^\d{4}-\d{2}-\d{2}$/.test(first.date), 'release date is ISO or null');
  ok(first.features.length + first.improvements.length + first.fixes.length > 0, 'release notes list actual changes');
}
const seen = new Set<string>();
for (let i = 0; i < RELEASES.length; i++) {
  const r = RELEASES[i];
  ok(SEMVER.test(r.version), `${r.version} is bare semver`);
  ok(!seen.has(r.version), `no duplicate release ${r.version}`);
  seen.add(r.version);
  if (i) ok(compareSemver(RELEASES[i - 1].version, r.version) > 0, 'releases are ordered newest first');
}
ok(RELEASES.some((r) => r.version === '2.0.0' && /3D/i.test(r.title)), '2.0.0 remains the 3D Studio major release');

// ---------------------------------------------------------------- 2. White Ground defaults & migration
section('3D White Ground defaults & scene migration');
const fresh = defaultScene();
eq(fresh.ground, true, 'new scenes have the ground enabled');
eq(fresh.groundColor, '#ffffff', 'default ground is pure white');
eq(fresh.objects.length, 0, 'new scenes are empty (no decorative starter cube)');
eq(fresh.grid, true, 'perspective grid is on');
ok(colorLuminance(fresh.bg) > 0.8, `default background is near-white (${fresh.bg})`);
ok(colorLuminance('#ffffff') === 1 && colorLuminance('#000000') === 0, 'colorLuminance anchors');

const legacy = sceneOf({
  version: 1, bg: '#26262b', ambient: 0.5,
  lights: [], grid: true, axes: true, gridSize: 0.25, snap: false, ortho: false,
  objects: [{ id: 'o1', kind: 'sphere', pos: [1, 2, 3] }], draw: { mode: 'xz', offset: 0.5, pos: [0, 0, 0], rot: [0, 0, 0] },
  sym: { mirror: { x: true, y: false, z: false }, radial: 1, axis: 'y', center: [0, 0, 0] }, views: [],
} as never);
eq(legacy.objects.length, 1, 'legacy scene keeps its objects');
eq(legacy.objects[0].pos, [1, 2, 3], 'legacy stroke coordinates untouched');
eq(legacy.ground, true, 'legacy scene migrates to the White Ground environment');
eq(legacy.bg, '#26262b', 'legacy background preserved');
eq(legacy.draw.offset, 0.5, 'legacy draw plane preserved');

const v20 = sceneOf({ version: 1, bg: '#111', ambient: 1, lights: [], objects: [], grid: true, axes: true, plane: 'xy', planeOffset: 0.5, symmetry: true, snap: false, gridSize: 0.25, ortho: false } as never);
eq(v20.draw.mode, 'xy', '2.0 plane field migrates into draw.mode');
eq(v20.sym.mirror.x, true, '2.0 symmetry field migrates');
eq(sceneOf(null).objects.length, 0, 'null scene data falls back to the default scene');

const grid = makeGrid(fresh);
const vcount = (grid as unknown as { geometry: { getAttribute: (k: string) => { count: number } } }).geometry.getAttribute('position').count;
console.log('  · grid vertex count for spacing 0.25:', vcount);
ok(vcount > 0 && vcount % 4 === 0, 'grid geometry is line pairs');
const gridClamped = makeGrid({ ...fresh, gridSize: 0 } as never);
ok(!!gridClamped, 'grid clamps out-of-range spacing instead of failing');

// ---------------------------------------------------------------- 3. curve & symmetry math
section('3D curve math & symmetry');
const noisy: number[] = [];
for (let i = 0; i < 50; i++) noisy.push(i, Math.sin(i * 0.2) * 0.01, 0);
noisy.push(49, 0.005, 0);
const simp = simplify3(noisy, 0.02);
ok(simp[0] === noisy[0] && simp[1] === noisy[1], 'simplify keeps the first point');
const n = simp.length / 3;
ok(simp[(n - 1) * 3] === noisy[(noisy.length / 3 - 1) * 3], 'simplify keeps the last point');
ok(simp.length < noisy.length, 'simplify reduces collinear/noise points');
eq(simplify3([0, 0, 0, 1, 1, 1], 1), [0, 0, 0, 1, 1, 1], 'simplify keeps 2-point strokes');

const smooth = smooth3([0, 0, 0, 1, 5, 0, 2, 0, 0], 3, 0.5);
eq([smooth[0], smooth[1], smooth[2]], [0, 0, 0], 'smoothing fixes the first endpoint');
eq([smooth[6], smooth[7], smooth[8]], [2, 0, 0], 'smoothing fixes the last endpoint');

const path = curvePath({ pts: [0, 0, 0, 1, 1, 0, 2, 0, 0], type: 'catmull', closed: false, geo: 'tube', thickness: 0.02, width: 0.08, segments: 32, radial: 8, normal: [0, 1, 0] });
ok(Number.isFinite(path.getPointAt(0.5).x), 'curvePath evaluates finite points');

eq(symMatrices({ mirror: { x: false, y: false, z: false }, radial: 1, axis: 'y', center: [0, 0, 0] }).length, 1, 'no symmetry = identity only');
eq(symMatrices({ mirror: { x: true, y: false, z: false }, radial: 1, axis: 'y', center: [0, 0, 0] }).length, 2, 'mirror X doubles');
eq(symMatrices({ mirror: { x: true, y: true, z: true }, radial: 1, axis: 'y', center: [0, 0, 0] }).length, 8, '3 mirrors = 8 copies');
eq(symMatrices({ mirror: { x: false, y: false, z: false }, radial: 6, axis: 'y', center: [0, 0, 0] }).length, 6, 'radial 6 = 6 copies');
eq(symMatrices({ mirror: { x: true, y: false, z: false }, radial: 4, axis: 'y', center: [0, 0, 0] }).length, 8, 'mirror × radial 4 = 8 copies');
const mirrored = applyMat([3, 0, 0], symMatrices({ mirror: { x: true, y: false, z: false }, radial: 1, axis: 'y', center: [0, 0, 0] })[1]);
eq(mirrored, [-3, 0, 0], 'mirror X negates world X through the center');

// ---------------------------------------------------------------- 4. brush library
section('Brush engine presets');
const presets = buildPresets();
ok(presets.length >= 100, `brush library is large (${presets.length} presets)`);
ok(new Set(presets.map((p) => p.id)).size === presets.length, 'preset ids are unique');
ok(new Set(presets.map(brushFingerprint)).size === presets.length, 'every preset is visually distinct (fingerprint)');
const cats = new Set(presets.map((p) => p.category));
for (const need of ['Graphite', 'Ink', 'Watercolor', 'Pastel', 'Marker', 'Paint', 'Airbrush', 'Texture', 'Blending', 'Eraser']) {
  ok([...cats].some((c) => c.toLowerCase().includes(need.toLowerCase())), `category covers ${need}`);
}
for (const want of ['pencil-hb', 'pencil-2b', 'ink-fine', 'wc-transparent', 'oil-paint', 'crisp-liner']) {
  if (presets.some((p) => p.id === want)) pass++; else console.log(`  · optional preset ${want} renamed/absent (informational)`);
}
ok(presets.every((p) => p.size > 0 && p.opacity > 0 && p.flow > 0), 'preset basics are in range');

// ---------------------------------------------------------------- 5. color math
section('Color system math');
eq(hexToRgb('#ff8000'), [255, 128, 0], 'hexToRgb');
eq(rgbToHex(255, 128, 0), '#ff8000', 'rgbToHex');
ok(isHex('#ff8000') && isHex('f80') && !isHex('#ff80'), 'isHex accepts 3/6-digit and rejects others');
eq(normHex('#FF8000'), '#ff8000', 'normHex lowercases');
eq(normHex('f80'), '#ff8800', 'normHex expands 3-digit');
eq(rgbToHsv(255, 0, 0), [0, 1, 1], 'pure red HSV');
eq(hsvToRgb(0, 1, 1), [255, 0, 0], 'HSV → RGB pure red');
for (const hex of ['#1d1d1f', '#e8913a', '#3f9db8', '#12506e', '#ffffff']) {
  const [h, s, v] = hexToHsv(hex);
  eq(hsvToHex(h, s, v), normHex(hex), `HSV round-trip ${hex}`);
}
eq(clamp(5, 0, 1), 1, 'clamp upper');
eq(clamp(-5, 0, 1), 0, 'clamp lower');

// ---------------------------------------------------------------- 6. comic layout
section('Comic page model');
const page = { w: 1988, h: 3056, bleed: 38, safe: 75 };
for (const l of LAYOUTS) {
  const panels = layoutPanels(l.id, page, 30);
  if (l.id !== 'blank') ok(panels.length >= 1, `layout ${l.id} produces panels`); // 'blank' is intentionally empty (freeform)
  else ok(panels.length === 0, 'blank layout starts empty');
  for (const p of panels) {
    // panels are quads: pts = [x0,y0, x1,y0, x1,y1, x0,y1]
    const xs = p.pts.filter((_, i) => i % 2 === 0), ys = p.pts.filter((_, i) => i % 2 === 1);
    ok(Math.min(...xs) >= 0 && Math.min(...ys) >= 0 && Math.max(...xs) <= page.w && Math.max(...ys) <= page.h, `layout ${l.id} panel stays inside the page`);
    ok(p.pts.length === 8 && p.type === 'panel', `layout ${l.id} panel is an editable quad`);
  }
}
ok(PAGE_PRESETS.every((p) => p.w > 0 && p.h > 0), 'page presets have dimensions');

// ---------------------------------------------------------------- 7. .carbon archive guards
section('.carbon file guards');
eq(MIME, 'application/x-carbon', 'format MIME');
eq(FORMAT_VERSION, 1, 'format version');
throws(() => verifyBytes(new Uint8Array([1, 2, 3, 4])), 'verifyBytes rejects non-archive bytes');
throws(() => verifyBytes(new TextEncoder().encode('not a zip at all')), 'verifyBytes rejects text bytes');
ok(!isComicArchive(new Uint8Array(64)), 'isComicArchive rejects empty bytes');

// ---------------------------------------------------------------- done
console.log(`\n${pass} assertions passed, ${failures.length} failed`);
if (failures.length) {
  console.error('\nFailures:');
  for (const f of failures) console.error('  ✗ ' + f);
  process.exit(1);
}
console.log('Carbon: Prime — Node unit suite OK');

void DEFAULT_VIEW;
