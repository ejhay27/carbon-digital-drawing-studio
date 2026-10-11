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
import * as THREE from 'three';
import { DocEngine } from '../src/engine/document';
import { ABOUT_CREATOR, ABOUT_PROJECT_COPY } from '../src/components/aboutCopy';
import { replaceProjectFile, type ProjectFileSystem } from '../src/platform/safeProjectWrite';
import { createTouchGestureGate } from '../src/win/touchGestureGate';
import {
  DEFAULT_VIEW, applyMat, colorLuminance, curvePath, defaultScene, localizeSurfaceNormal, localizeSurfaceStroke, makeGrid, persistSceneCamera, projectSurfaceSymmetryPaths, remapSurfaceNormals, sceneOf, simplify3, smooth3, surfaceHit, symMatrices,
} from '../src/win/sceneRender';
import { buildPresets } from '../src/engine/brushes';
import { brushFingerprint } from '../src/engine/brushes';
import { MIME, FORMAT_VERSION, isComicArchive, verifyBytes } from '../src/engine/fileFormat';
import { zipSync, strToU8 } from 'fflate';
import { LAYOUTS, PAGE_PRESETS, layoutPanels } from '../src/engine/comic';
import { clamp, hexToRgb, hexToHsv, hsvToHex, isHex, normHex, rgbToHex, rgbToHsv, hsvToRgb } from '../src/engine/util';
import { findProjects, recentPinId, togglePinnedId } from '../src/state/projectFinder';
import { firstPaletteSelection, nextPaletteSelection, searchPaletteItems } from '../src/state/commandPalette';
import { DEFAULT_SETTINGS, DEFAULT_SHORTCUTS, mergeSettings } from '../src/state/store';
import { buildQuickStartSample } from '../src/state/quickStartSample';

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
async function rejects(fn: () => Promise<unknown>, msg: string) {
  try { await fn(); failures.push(msg + ' (did not reject)'); } catch { pass++; }
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
ok(compareSemver('7.1.0', '7.2.0') < 0, 'compareSemver orders minor versions');
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

// ---------------------------------------------------------------- 2. Home project finder, preferences & command palette
section('Home project finder, pinning, sorting and command palette search');
const finderEntries = [
  { id: recentPinId('z'), name: 'Zebra Study', savedAt: 100, size: 50, searchText: '1600 1200' },
  { id: recentPinId('a'), name: 'Apple Coast', savedAt: 50, size: 200, searchText: '1200 900' },
  { id: 'device:/CARBON/Lighthouse.carbon', name: 'Lighthouse', savedAt: 300, size: 120, searchText: '/CARBON/Lighthouse.carbon 1600 900' },
];
eq(findProjects(finderEntries, '', [recentPinId('a')], 'recent').map((p) => p.id), [recentPinId('a'), 'device:/CARBON/Lighthouse.carbon', recentPinId('z')], 'pinned projects stay ahead of recency sort');
eq(findProjects(finderEntries, 'coast 1200', [], 'name').map((p) => p.id), [recentPinId('a')], 'project finder applies every search term to name/metadata');
eq(findProjects(finderEntries, '', [], 'name').map((p) => p.name), ['Apple Coast', 'Lighthouse', 'Zebra Study'], 'project finder sorts names naturally');
eq(findProjects(finderEntries, '', [], 'size').map((p) => p.size), [200, 120, 50], 'project finder sorts by file size');
eq(togglePinnedId([recentPinId('a')], recentPinId('z')), [recentPinId('a'), recentPinId('z')], 'pinning adds without losing other projects');
eq(togglePinnedId([recentPinId('a'), recentPinId('z')], recentPinId('a')), [recentPinId('z')], 'unpinning removes only that project');
const paletteEntries = [
  { id: 'surface', title: 'Surface symmetry', category: 'Workspaces', keywords: '3D mirrored radial mesh' },
  { id: 'save', title: 'Save current project', category: 'Actions', keywords: 'local carbon' },
  { id: 'disabled', title: '3D surface options', category: 'Workspaces', keywords: 'mesh', disabled: true },
];
eq(searchPaletteItems(paletteEntries, '3d mesh').map((p) => p.id), ['surface', 'disabled'], 'palette searches actions across label, category and aliases');
eq(firstPaletteSelection(paletteEntries), 0, 'palette initially selects the first enabled result');
eq(nextPaletteSelection(paletteEntries, 0, 1), 1, 'ArrowDown skips disabled commands');
eq(nextPaletteSelection(paletteEntries, 1, 1), 0, 'keyboard selection wraps to the first enabled command');
eq(nextPaletteSelection(paletteEntries, 0, -1), 1, 'ArrowUp wraps to the last enabled command');
eq(DEFAULT_SHORTCUTS['app.commandPalette'], 'ctrl+k', 'command palette has a configurable Ctrl+K shortcut');
const migratedSettings = mergeSettings({ homeSceneEnabled: false, pinnedProjects: ['recent:a', 'recent:a'], homeProjectSort: 'name', quickStartSeen: true, shortcuts: { 'file.save': 'ctrl+alt+s' } });
ok(!migratedSettings.homeSceneEnabled && migratedSettings.quickStartSeen, 'new preferences preserve existing settings values');
eq(migratedSettings.pinnedProjects, ['recent:a'], 'persisted project pins are de-duplicated');
eq(migratedSettings.homeProjectSort, 'name', 'project sort persists in preferences');
eq(migratedSettings.shortcuts['file.save'], 'ctrl+alt+s', 'custom shortcuts are retained');
eq(mergeSettings({}).shortcuts['app.commandPalette'], 'ctrl+k', 'older preference records gain the default palette shortcut');
ok(DEFAULT_SETTINGS.quickStartSeen === false && DEFAULT_SETTINGS.pinnedProjects.length === 0, 'first-run guide and pins start safely for new installs');

// ---------------------------------------------------------------- 3. About identity and supplied copy
section('About / Project Information copy');
eq(ABOUT_CREATOR, '© Ejhay Claus B. Predonio', 'creator credit is exact');
eq(ABOUT_PROJECT_COPY, `This Project lasted 5 years to create. If you're reading this, it might be the final updated version, or I'll fix it if there's any bugs, or more features to add in the future.

I'm a solo Developer who created Carbon: Prime. It has been distributed to Android devices such as tablets and etc., Windows support, and more in the future.

About the Carbon${'  '}
This app was created in Scratch, with 0 Budget, and with only a small compiler, and of course an Acer Laptop.

Performance${'  '}
The performance of Carbon is based on your Hardware's performance.

Android version${'  '}
On Android version (Tablets) it supports all features, and of course based on its hardware performance.

Windows version${'  '}
It supports all Features in Windows, and also based on the hardware (Windows) performance.

Other Projects Created${'  '}
O.R.V.Y.N, Folian, Carbon: Flux, Purge, Basalt, MyClassmate, and more.

© Ejhay Claus B. Predonio`, 'About copy keeps the supplied wording, headings and paragraph breaks exactly');

section('Offline quick-start sample safety and editability');
const untouchedDoc = new DocEngine(48, 48, { name: 'User work - preserve me' });
const untouchedLayerIds = untouchedDoc.layers.map((layer) => layer.id);
const sampleOne = buildQuickStartSample();
const sampleTwo = buildQuickStartSample();
ok(sampleOne !== sampleTwo && sampleOne.id !== sampleTwo.id, 'each sample launch constructs a fresh document');
eq(sampleOne.name, 'CARBON Quick Start Sample', 'sample has a clear identifying project name');
eq([sampleOne.width, sampleOne.height], [1200, 900], 'sample uses a modest canvas size');
eq(sampleOne.layers.map((layer) => layer.type), ['raster', 'raster', 'ink'], 'sample separates paint and editable ink into three layers');
eq(sampleOne.layers.map((layer) => layer.name), ['Sky and turquoise water', 'Island, lighthouse and palms', 'Crisp Ink details'], 'sample layers are named for practice');
ok((sampleOne.layers[2].strokes?.length || 0) >= 8, 'sample contains editable Crisp Ink strokes');
ok(!sampleOne.dirty && sampleOne.fileName === null && sampleOne.fileHandle === null, 'sample starts unsaved without targeting or overwriting a file');
eq(untouchedDoc.name, 'User work - preserve me', 'building the sample never renames an existing document');
eq(untouchedDoc.layers.map((layer) => layer.id), untouchedLayerIds, 'building the sample never mutates existing user layers');

// ---------------------------------------------------------------- 3. White Ground defaults & migration
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

section('3D camera persistence and input ownership');
const cameraDoc = new DocEngine(16, 16);
const cameraScene = defaultScene();
const cameraRevision = cameraDoc.rev;
const cameraView = { pos: [3, 2, 4] as [number, number, number], target: [0, 0.5, 0] as [number, number, number], ortho: true, zoom: 1.4, fov: 52 };
persistSceneCamera(cameraDoc, cameraScene, cameraView);
eq(cameraDoc.scene3d, cameraScene, 'camera update is attached to the active document');
eq(cameraScene.camera, cameraView, 'camera pose and projection are stored in scene data');
ok(cameraDoc.dirty && cameraDoc.rev === cameraRevision + 1, 'camera-only edit marks the project dirty and advances autosave revision');
eq(cameraScene.ortho, true, 'orthographic state is persisted with the camera');

const touchGate = createTouchGestureGate();
ok(!touchGate.down(10), 'first touch remains eligible to draw in a drawing tool');
ok(touchGate.down(11) && touchGate.isNavigationOnly, 'second touch latches the complete gesture to navigation');
ok(touchGate.up(10) && touchGate.isNavigationOnly, 'lifting one finger does not re-enable drawing mid-gesture');
ok(touchGate.up(11) && !touchGate.isNavigationOnly, 'drawing is re-enabled only after every finger is lifted');
ok(!touchGate.down(12), 'a later one-finger gesture can draw normally');
touchGate.up(12);

section('3D surface ray hit and local-space stroke path');
const surface = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
surface.userData.surface = true;
surface.userData.objId = 'surface-box';
surface.position.set(0.2, 0.1, -0.1);
surface.rotation.set(0.08, 0.22, -0.04);
surface.scale.set(1.3, 0.9, 1.1);
surface.updateMatrixWorld(true);
const surfaceCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
surfaceCamera.position.set(0.2, 0.1, 5);
surfaceCamera.lookAt(0.2, 0.1, -0.1);
surfaceCamera.updateMatrixWorld(true);
const surfacePoints: number[] = [];
for (const x of [-0.16, 0.16]) {
  const ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2(x, 0), surfaceCamera);
  const rawHit = ray.intersectObject(surface, false)[0];
  const hit = surfaceHit(ray, [surface], 0.02);
  ok(!!hit && hit.object === surface, `surface drawing ray at x=${x} intersects the editable mesh`);
  if (hit && rawHit?.face) {
    const expectedNormal = rawHit.face.normal.clone().applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(surface.matrixWorld));
    ok(hit.normal.distanceTo(expectedNormal) < 1e-9, `surface hit normal is correct under non-uniform object scale at x=${x}`);
    const displacement = hit.point.clone().sub(rawHit.point);
    ok(Math.abs(displacement.dot(expectedNormal) - (0.02 * 0.6 + 0.003)) < 1e-9, `surface stroke offset follows the transformed face normal at x=${x}`);
    surfacePoints.push(hit.point.x, hit.point.y, hit.point.z);
  }
}
const localized = localizeSurfaceStroke(surfacePoints, surface);
const roundTripPoints = applyMat(localized.points, surface.matrixWorld);
const pointError = Math.max(...roundTripPoints.map((v, i) => Math.abs(v - surfacePoints[i])));
ok(pointError < 1e-6, `surface stroke returns to the actual hit positions (max error ${pointError})`);
ok(localized.averageWorldScale > 0 && localized.points.every(Number.isFinite), 'surface stroke width and local points remain valid');
const movedWorld = applyMat(localized.points, new THREE.Matrix4().makeTranslation(1, 0, 0).multiply(surface.matrixWorld));
eq(movedWorld[0] - roundTripPoints[0], 1, 'surface stroke local coordinates follow its target object');
const sourceNormal: [number, number, number] = [0.3, 0.1, Math.sqrt(0.9)];
const localSurfaceNormal = localizeSurfaceNormal(sourceNormal, surface);
const restoredNormal = new THREE.Vector3(...localSurfaceNormal).applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(surface.matrixWorld)).normalize();
ok(restoredNormal.distanceTo(new THREE.Vector3(...sourceNormal).normalize()) < 1e-6, 'surface stroke geometry normal converts correctly through a rotated non-uniform target');
const remappedNormal = remapSurfaceNormals([0, 0, 0, 1, 0, 0], [0, 1, 0, 0, 0, 1], [0.5, 0, 0]);
ok(remappedNormal.length === 3 && Math.abs(new THREE.Vector3(...remappedNormal).length() - 1) < 1e-9, 'simplified surface paths retain interpolated unit normals');

const sphereGeo = new THREE.SphereGeometry(1, 64, 32);
const leftSphere = new THREE.Mesh(sphereGeo, new THREE.MeshBasicMaterial());
leftSphere.position.x = -1.5; leftSphere.userData.surface = true; leftSphere.userData.objId = 'left-sphere'; leftSphere.updateMatrixWorld(true);
const rightSphere = new THREE.Mesh(sphereGeo, new THREE.MeshBasicMaterial());
rightSphere.position.x = 1.5; rightSphere.userData.surface = true; rightSphere.userData.objId = 'right-sphere'; rightSphere.updateMatrixWorld(true);
const sampleSurfacePoints: number[] = [], sampleSurfaceNormals: number[] = [];
for (const x of [0.24, 0.37, 0.48]) {
  const normal = new THREE.Vector3(x, 0.08, Math.sqrt(1 - x * x - 0.08 * 0.08)).normalize();
  const point = rightSphere.position.clone().add(normal).addScaledVector(normal, 0.02 * 0.6 + 0.003);
  sampleSurfacePoints.push(point.x, point.y, point.z); sampleSurfaceNormals.push(normal.x, normal.y, normal.z);
}
const xMirror = symMatrices({ mirror: { x: true, y: false, z: false }, radial: 1, axis: 'y', center: [0, 0, 0] });
const surfaceCopies = projectSurfaceSymmetryPaths(sampleSurfacePoints, sampleSurfaceNormals, xMirror, [leftSphere, rightSphere], 0.02, rightSphere);
eq(surfaceCopies.length, 2, 'surface mirror keeps its source and creates a projected counterpart');
ok(surfaceCopies[1]?.target === leftSphere, 'mirrored surface path attaches to the matching second sphere mesh');
if (surfaceCopies[1]) {
  let maxRadiusError = 0;
  for (let i = 0; i < surfaceCopies[1].points.length; i += 3) {
    const point = new THREE.Vector3(surfaceCopies[1].points[i], surfaceCopies[1].points[i + 1], surfaceCopies[1].points[i + 2]);
    maxRadiusError = Math.max(maxRadiusError, Math.abs(point.distanceTo(leftSphere.position) - (1 + 0.02 * 0.6 + 0.003)));
  }
  ok(maxRadiusError < 0.01, `mirrored path vertices are offset from actual sphere surface (max radius error ${maxRadiusError})`);
  const mirrorLocal = localizeSurfaceStroke(surfaceCopies[1].points, leftSphere);
  const mirrorWorld = applyMat(mirrorLocal.points, leftSphere.matrixWorld);
  ok(Math.max(...mirrorWorld.map((v, i) => Math.abs(v - surfaceCopies[1].points[i]))) < 1e-6, 'projected symmetry copy remains editable in target-local coordinates');
}
const missingSurface = projectSurfaceSymmetryPaths(sampleSurfacePoints, sampleSurfaceNormals, xMirror, [rightSphere], 0.02, rightSphere);
eq(missingSurface.length, 1, 'a symmetry copy without a matching mesh is omitted instead of floating in space');
sphereGeo.dispose();

// ---------------------------------------------------------------- 4. curve & symmetry math
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

// ---------------------------------------------------------------- 8. Android project replacement integrity
section('Android verified project replacement and rollback');
class MemoryProjectFs implements ProjectFileSystem {
  files = new Map<string, string>();
  failWritePaths = new Set<string>();
  partialWritePaths = new Set<string>();
  failRename: ((from: string, to: string) => boolean) | null = null;
  async writeFile({ path, data }: Parameters<ProjectFileSystem['writeFile']>[0]) {
    if (this.partialWritePaths.has(path)) { this.files.set(path, data.slice(0, 4)); throw new Error('simulated interrupted storage write'); }
    if (this.failWritePaths.has(path)) throw new Error('simulated storage write failure');
    this.files.set(path, data);
  }
  async readFile({ path }: Parameters<ProjectFileSystem['readFile']>[0]) {
    const data = this.files.get(path);
    if (data === undefined) throw Object.assign(new Error('File not found'), { code: 'ENOENT' });
    return { data };
  }
  async stat({ path }: Parameters<ProjectFileSystem['stat']>[0]) {
    const data = this.files.get(path);
    if (data === undefined) throw Object.assign(new Error('File not found'), { code: 'ENOENT' });
    return { size: Uint8Array.from(atob(data), (c) => c.charCodeAt(0)).length };
  }
  async rename({ from, to }: Parameters<ProjectFileSystem['rename']>[0]) {
    if (this.failRename?.(from, to)) throw new Error('simulated rename failure');
    const data = this.files.get(from);
    if (data === undefined) throw Object.assign(new Error('File not found'), { code: 'ENOENT' });
    if (this.files.has(to)) throw new Error('Destination already exists');
    this.files.set(to, data);
    this.files.delete(from);
  }
  async deleteFile({ path }: Parameters<ProjectFileSystem['deleteFile']>[0]) {
    if (!this.files.delete(path)) throw Object.assign(new Error('File not found'), { code: 'ENOENT' });
  }
}
const writePaths = { directory: 'Documents/CARBON', path: 'Documents/CARBON/Sketch.carbon', temporaryPath: 'Documents/CARBON/.Sketch.tmp', backupPath: 'Documents/CARBON/.Sketch.bak' };
const newProjectData = btoa('new verified drawing');
const newProjectSize = new TextEncoder().encode('new verified drawing').length;
const oldProjectData = btoa('previous safe drawing');
const oldProjectText = 'previous safe drawing';

const atomicFs = new MemoryProjectFs();
atomicFs.files.set(writePaths.path, oldProjectData);
await replaceProjectFile(atomicFs, { ...writePaths, data: newProjectData, expectedSize: newProjectSize });
eq(atob(atomicFs.files.get(writePaths.path)!), 'new verified drawing', 'successful replacement installs the verified new bytes');
ok(!atomicFs.files.has(writePaths.temporaryPath) && !atomicFs.files.has(writePaths.backupPath), 'successful replacement cleans staging and backup files');

const partialStageFs = new MemoryProjectFs();
partialStageFs.files.set(writePaths.path, oldProjectData);
partialStageFs.partialWritePaths.add(writePaths.temporaryPath);
await rejects(() => replaceProjectFile(partialStageFs, { ...writePaths, data: newProjectData, expectedSize: newProjectSize }), 'interrupted staging write reports failure');
eq(atob(partialStageFs.files.get(writePaths.path)!), oldProjectText, 'failed staging does not touch the existing project');
ok(!partialStageFs.files.has(writePaths.temporaryPath) && !partialStageFs.files.has(writePaths.backupPath), 'partial staging file is cleaned after write failure');

const fallbackFs = new MemoryProjectFs();
fallbackFs.files.set(writePaths.path, oldProjectData);
fallbackFs.failRename = () => true;
await replaceProjectFile(fallbackFs, { ...writePaths, data: newProjectData, expectedSize: newProjectSize });
eq(atob(fallbackFs.files.get(writePaths.path)!), 'new verified drawing', 'rename-limited storage uses a verified rollback copy before direct write');
ok(!fallbackFs.files.has(writePaths.backupPath), 'verified fallback removes its recovery copy only after final verification');

const rollbackFs = new MemoryProjectFs();
rollbackFs.files.set(writePaths.path, oldProjectData);
rollbackFs.failRename = (from) => from === writePaths.temporaryPath;
rollbackFs.failWritePaths.add(writePaths.path);
await rejects(() => replaceProjectFile(rollbackFs, { ...writePaths, data: newProjectData, expectedSize: newProjectSize }), 'failed installation reports failure');
eq(atob(rollbackFs.files.get(writePaths.path)!), oldProjectText, 'failed installation restores the previous project instead of deleting it');
ok(!rollbackFs.files.has(writePaths.backupPath), 'rollback restores the existing project to its original path');

// ---------------------------------------------------------------- 9. .carbon archive guards
section('.carbon file guards');
eq(MIME, 'application/x-carbon', 'format MIME');
eq(FORMAT_VERSION, 1, 'format version');
throws(() => verifyBytes(new Uint8Array([1, 2, 3, 4])), 'verifyBytes rejects non-archive bytes');
throws(() => verifyBytes(new TextEncoder().encode('not a zip at all')), 'verifyBytes rejects text bytes');
ok(!isComicArchive(new Uint8Array(64)), 'isComicArchive rejects empty bytes');
const archiveManifest = {
  format: 'carbon', version: FORMAT_VERSION, name: 'guard-test', width: 16, height: 16, background: '#ffffff',
  activeLayerId: 'L1', layers: [{ id: 'L1', name: 'Paint', type: 'raster', file: 'layers/L1.png' }], assets: [], replay: null,
};
const makeGuardArchive = (manifest: object, extra: Record<string, Uint8Array> = {}) => zipSync({
  'mimetype': strToU8(MIME), 'manifest.json': strToU8(JSON.stringify(manifest)), 'layers/L1.png': new Uint8Array([1, 2, 3]), ...extra,
});
eq(verifyBytes(makeGuardArchive(archiveManifest)).name, 'guard-test', 'well-formed archive references are accepted');
throws(() => verifyBytes(makeGuardArchive({
  ...archiveManifest, layers: [{ ...archiveManifest.layers[0], mask: 'layers/L1.mask.png' }],
})), 'verifyBytes rejects a missing layer-mask file instead of silently dropping it');
throws(() => verifyBytes(makeGuardArchive({
  ...archiveManifest, assets: [{ id: 'ref-1', file: 'assets/ref-1.png', mime: 'image/png' }],
})), 'verifyBytes rejects a missing declared project asset');
throws(() => verifyBytes(makeGuardArchive({
  ...archiveManifest, replay: { file: 'replay/events.json', enabled: true, paused: false, epoch: 0 },
})), 'verifyBytes rejects missing replay data');

// ---------------------------------------------------------------- done
console.log(`\n${pass} assertions passed, ${failures.length} failed`);
if (failures.length) {
  console.error('\nFailures:');
  for (const f of failures) console.error('  ✗ ' + f);
  process.exit(1);
}
console.log('Carbon: Prime — Node unit suite OK');

void DEFAULT_VIEW;
