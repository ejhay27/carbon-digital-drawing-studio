// Windows-edition acceptance tests (appended to Help → Run Diagnostics). Isolated documents only.
import { DocEngine } from './document';
import { compositeDoc } from './render';
import { deserializeComic, deserializeDoc, serializeComic, serializeDoc } from './fileFormat';
import { FILTERS, runFx } from './filters';
import { applyLiquifyOps, LiquifySession } from './liquify';
import { brushFingerprint, buildPresets } from './brushes';
import { CATALOG, winCorePresets } from './brushPacks';
import { makePdf, newBalloon, newFx, layoutPanels } from './comic';
import { ReplayPlayer } from './replay';
import { sampleCurve } from './strokeRenderer';
import { canvasDiff, canvasToBlob, ctxOf, mulberry32 } from './util';
import type { BlendMode } from './types';
import { APP_LABEL, APP_VERSION, compareSemver, LS_SUFFIX, SEMVER, WINDOWS_VERSION } from '../version';
import { RELEASES } from '../release/releases';
import { renderDoc } from './render';
import { renderStroke } from './strokeRenderer';
import { loadImage } from './util';
import { getApp } from '../state/store';
import { applyMat, colorLuminance, defaultScene, makeGrid, renderSceneImage, sceneOf, simplify3, smooth3, symMatrices, webglAvailable } from '../win/sceneRender';
import { fuseBrush } from '../win/BrushFusion';
import { extractPalette } from '../win/PaletteMemory';
import { boardOf, itemHealth } from '../win/OrbitBoard';
import { createSnapshot, deleteSnapshot, listSnapshots, restoreSnapshot } from '../win/TimeMachine';
import { addColor, duplicateSwatch, moveSwatch, norm, parseColorInput, removeSwatch, renameSwatch, replaceSwatch, updateDock, useDock } from '../win/dockModel';

type T = (name: string, fn: () => Promise<string> | string) => Promise<void>; // test runner
type A = (c: unknown, msg: string) => void; // assertion helper
const px = (c: HTMLCanvasElement, x: number, y: number) => c.getContext('2d')!.getImageData(x, y, 1, 1).data;
const OFF = { mode: 'off' as const, count: 2, cx: 0.5, cy: 0.5 };

export async function winTests(test: T, assert: A) {
  const P = new Map(buildPresets().map((b) => [b.id, b]));

  await test('[Win] Brush ecosystem: 500+ genuinely distinct presets', () => {
    const all = [...buildPresets(), ...winCorePresets(), ...CATALOG.flatMap((p) => p.brushes())];
    const fps = new Set(all.map(brushFingerprint));
    assert(fps.size >= 500, `only ${fps.size} distinct presets`);
    return `${fps.size} distinct parameter sets (${all.length} presets, ${CATALOG.length} catalog packs)`;
  });

  await test('[Win] All filters run deterministically', () => {
    const w = 24, h = 24, rnd = mulberry32(5), data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < data.length; i++) data[i] = i % 4 === 3 ? 255 : Math.floor(rnd() * 255);
    let changed = 0;
    for (const f of FILTERS) {
      const a = runFx(f.id, { data, w, h }, {}, 9), b = runFx(f.id, { data, w, h }, {}, 9);
      for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) throw new Error(`${f.name} is not deterministic`);
      if (a.data.some((v, i) => Math.abs(v - data[i]) > 1)) changed++;
    }
    assert(changed >= FILTERS.length - 3, `only ${changed}/${FILTERS.length} filters changed the pixels with default settings`);
    return `${FILTERS.length} filters, ${changed} visibly change pixels at defaults`;
  });

  await test('[Win] Liquify: live session equals replayed ops; reconstruct restores', () => {
    const c = document.createElement('canvas');
    c.width = 80; c.height = 60;
    const x = ctxOf(c);
    for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? '#c0392b' : '#2980b9'; x.fillRect(i * 10, 0, 10, 60); }
    const s = new LiquifySession(c);
    for (let i = 0; i < 12; i++) s.render(s.apply(i % 6, 20 + i * 3, 30, 4, 1.5, 18, 0.6));
    const replayed = applyLiquifyOps(c, s.ops);
    assert(canvasDiff(s.out, replayed, 0) === 0, 'live and replayed liquify differ');
    assert(canvasDiff(s.out, c, 2) > 50, 'liquify did not deform the image');
    for (let k = 0; k < 60; k++) s.apply(6, 40, 30, 0, 0, 80, 1);
    s.render();
    const rest = canvasDiff(s.out, c, 6);
    assert(rest < 40, `reconstruct left ${rest} pixels deformed`);
    return `${s.ops.length / 7} ops, deterministic; reconstruct residual ${rest}px`;
  });

  await test('[Win] Clipping mask, layer mask and group opacity composite correctly', () => {
    const d = new DocEngine(40, 40, { background: null });
    ctxOf(d.layers[0].canvas!).fillRect(10, 10, 20, 20);
    d.exec({ k: 'layerAdd', id: 'red', name: 'red', type: 'raster', index: 1 });
    const rc = ctxOf(d.layer('red')!.canvas!); rc.fillStyle = '#ff0000'; rc.fillRect(0, 0, 40, 40);
    d.exec({ k: 'layerProp', layerId: 'red', props: { clip: true } });
    let c = compositeDoc(d, 1, false);
    assert(px(c, 5, 5)[3] === 0, 'clipped layer leaked outside its base');
    assert(px(c, 20, 20)[0] > 250 && px(c, 20, 20)[1] < 5, 'clipped layer not visible inside base');
    const m = new DocEngine(40, 40);
    ctxOf(m.layers[0].canvas!).fillRect(0, 0, 40, 40);
    m.exec({ k: 'maskAdd', layerId: m.layers[0].id, fromSel: false });
    ctxOf(m.layers[0].mask!).clearRect(0, 0, 20, 40);
    c = compositeDoc(m);
    assert(px(c, 5, 5)[0] === 255 && px(c, 30, 5)[0] === 0, 'layer mask did not hide / reveal');
    const g = new DocEngine(20, 20);
    ctxOf(g.layers[0].canvas!).fillRect(0, 0, 20, 20);
    g.exec({ k: 'group', ids: [g.layers[0].id], groupId: 'G', name: 'G' });
    g.exec({ k: 'layerProp', layerId: 'G', props: { opacity: 0.5 } });
    const v = px(compositeDoc(g), 10, 10)[0];
    assert(Math.abs(v - 128) <= 3, `group opacity gave ${v}, expected ≈128`);
    return 'clip, mask and group isolation verified by pixel probes';
  });

  await test('[Win] Blend modes produce distinct composites (incl. Linear Burn / Add)', () => {
    const modes: BlendMode[] = ['source-over', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity', 'lighter', 'linear-burn'];
    const vals = new Set<string>();
    for (const b of modes) {
      const d = new DocEngine(8, 8);
      const a = ctxOf(d.layers[0].canvas!); a.fillStyle = '#a06040'; a.fillRect(0, 0, 8, 8);
      d.exec({ k: 'layerAdd', id: 't', name: 't', type: 'raster', index: 1 });
      const t = ctxOf(d.layer('t')!.canvas!); t.fillStyle = '#4080c0'; t.fillRect(0, 0, 8, 8);
      d.exec({ k: 'layerProp', layerId: 't', props: { blend: b } });
      vals.add(Array.from(px(compositeDoc(d), 4, 4)).slice(0, 3).join(','));
    }
    const lb = (() => { const d = new DocEngine(4, 4); const a = ctxOf(d.layers[0].canvas!); a.fillStyle = '#c0c0c0'; a.fillRect(0, 0, 4, 4); d.exec({ k: 'layerAdd', id: 't', name: 't', type: 'raster', index: 1 }); const t = ctxOf(d.layer('t')!.canvas!); t.fillStyle = '#c0c0c0'; t.fillRect(0, 0, 4, 4); d.exec({ k: 'layerProp', layerId: 't', props: { blend: 'linear-burn' } }); return px(compositeDoc(d), 2, 2)[0]; })();
    assert(Math.abs(lb - 129) <= 3, `linear burn 192+192 gave ${lb}, expected ≈129`);
    assert(vals.size >= 15, `only ${vals.size} distinct results for ${modes.length} modes`);
    return `${vals.size}/${modes.length} distinct; Linear Burn math verified (${lb})`;
  });

  await test('[Win] Drawing Replay reproduces filters, liquify, gradients, masks, comics, groups', async () => {
    const d = new DocEngine(120, 90, { name: 'win-replay' });
    d.startRecording();
    const L0 = d.activeLayerId;
    d.exec({ k: 'gradient', layerId: L0, kind: 'linear', x0: 0, y0: 0, x1: 120, y1: 90, stops: [{ o: 0, c: '#ff8800', a: 1 }, { o: 1, c: '#2244aa', a: 1 }] });
    d.exec({ k: 'stroke', layerId: L0, brush: P.get('ink-brushpen')!, color: '#111111', eraser: false, seed: 4, s: sampleCurve(120, 90), sym: OFF });
    d.exec({ k: 'fx', layerId: L0, id: 'motion', params: { angle: 20, distance: 8 }, seed: 1 });
    const ls = new LiquifySession(d.layer(L0)!.canvas!);
    ls.apply(0, 60, 45, 10, 4, 25, 0.7); ls.apply(4, 40, 40, 0, 0, 20, 0.8);
    d.exec({ k: 'liquify', layerId: L0, ops: ls.ops });
    d.exec({ k: 'maskAdd', layerId: L0, fromSel: false });
    d.exec({ k: 'stroke', layerId: L0, brush: P.get('eraser-hard')!, color: '#ffffff', eraser: true, seed: 2, s: sampleCurve(120, 90, 30, 0.3), sym: OFF, target: 'mask' });
    d.exec({ k: 'layerAdd', id: 'cm', name: 'Comic', type: 'comic', index: 1 });
    d.exec({ k: 'comicSet', layerId: 'cm', objects: [...layoutPanels('4koma', { w: 120, h: 90, bleed: 4, safe: 4 }, 4, 2), newFx('tone', 10, 10, 50, 40), { ...newBalloon('speech', 60, 10, 50, 30), id: 'b1' }], label: 'Comic' });
    d.exec({ k: 'group', ids: [L0], groupId: 'G1', name: 'Art' });
    d.exec({ k: 'layerProp', layerId: 'G1', props: { opacity: 0.8 } });
    d.exec({ k: 'adjustAdd', id: 'adj', name: 'Adj', index: d.layers.length, adjust: { hue: 30, sat: 1.2, bright: 1, contrast: 1.1, invert: 0, gray: 0, sepia: 0, blur: 0 } });
    d.undo(); d.redo();
    const live = compositeDoc(d);
    const rp = new ReplayPlayer(d);
    await rp.prepare();
    rp.seek(rp.duration);
    const diff = canvasDiff(live, compositeDoc(rp.engine), 2);
    assert(diff === 0, `${diff} pixels differ after replay`);
    rp.seek(rp.duration / 3); rp.seek(rp.duration);
    const diff2 = canvasDiff(live, compositeDoc(rp.engine), 2);
    assert(diff2 === 0, `${diff2} pixels differ after seeking`);
    return `${rp.events.length} events replayed pixel-identically (incl. seek)`;
  });

  await test('[Win] Comic project save/reopen + multi-page PDF', async () => {
    const mk = (i: number) => {
      const p = new DocEngine(200, 280, { name: 'pg' + i });
      p.comic = { id: 'c1', name: 'Test Comic', index: i, bleed: 6, safe: 10, pageName: 'Page ' + (i + 1) };
      const C = p.makeLayer('comic', 'Panels');
      C.comic = [...layoutPanels('6panel', { w: 200, h: 280, bleed: 6, safe: 10 }, 8), newBalloon('shout', 20, 20, 80, 50), newFx('speed', 0, 100, 200, 60)];
      p.layers.push(C);
      return p;
    };
    const pages = [mk(0), mk(1)];
    const back = await deserializeComic(await serializeComic('Test Comic', pages));
    assert(back.pages.length === 2 && back.name === 'Test Comic', 'page count / name');
    assert(JSON.stringify(back.pages[1].layers[1].comic) === JSON.stringify(pages[1].layers[1].comic), 'comic objects changed');
    assert(back.pages[0].comic?.pageName === 'Page 1' && back.pages[0].comic?.bleed === 6, 'comic page metadata lost');
    const diff = canvasDiff(compositeDoc(pages[0]), compositeDoc(back.pages[0]), 3);
    assert(diff < 20, `page render differs by ${diff}px after reopen`);
    const jpgs = await Promise.all(pages.map(async (p) => { const c = compositeDoc(p); return { jpeg: new Uint8Array(await (await canvasToBlob(c, 'image/jpeg', 0.9)).arrayBuffer()), w: c.width, h: c.height, wPt: 48, hPt: 67.2 }; }));
    const pdf = new TextDecoder('latin1').decode(makePdf(jpgs));
    assert(pdf.startsWith('%PDF-1.4') && pdf.includes('/Count 2') && pdf.trimEnd().endsWith('%%EOF'), 'PDF structure invalid');
    return `2 pages round-tripped; PDF ${(pdf.length / 1024).toFixed(1)} KB with 2 pages`;
  });

  await test('[Win] Version metadata is consistent (semver, release notes, file metadata)', async () => {
    assert(SEMVER.test(WINDOWS_VERSION), `WINDOWS_VERSION “${WINDOWS_VERSION}” is not MAJOR.MINOR.PATCH`);
    assert(APP_VERSION === WINDOWS_VERSION + LS_SUFFIX && APP_LABEL === `CARBON PRIME ${WINDOWS_VERSION}${LS_SUFFIX}`, 'running edition does not report the PRIME WINDOWS_VERSION+ls identity');
    assert(LS_SUFFIX === '+ls', 'release suffix must stay +ls (Local Storage)');
    assert(RELEASES.length > 0 && RELEASES[0].version === WINDOWS_VERSION && RELEASES[0].suffix === LS_SUFFIX, `release notes start at ${RELEASES[0]?.version}${RELEASES[0]?.suffix || ''}, build is ${WINDOWS_VERSION}${LS_SUFFIX}`);
    const seen = new Set<string>();
    RELEASES.forEach((r, i) => {
      assert(SEMVER.test(r.version), `bad version ${r.version}`);
      assert(!seen.has(r.version), `duplicate release ${r.version}`);
      seen.add(r.version);
      assert(['major', 'feature', 'patch'].includes(r.category), `${r.version}: bad category`);
      assert(r.title && r.summary && r.features.length + r.improvements.length + r.fixes.length > 0, `${r.version}: empty notes`);
      assert(r.date === null || /^\d{4}-\d{2}-\d{2}$/.test(r.date), `${r.version}: date must be YYYY-MM-DD or null`);
      if (i) {
        const prev = RELEASES[i - 1];
        assert(compareSemver(prev.version, r.version) > 0, `${prev.version} must be newer than ${r.version}`);
        const [pM, pm] = prev.version.split('.').map(Number), [M, m] = r.version.split('.').map(Number);
        const expect = pM > M ? 'major' : pm > m ? 'feature' : 'patch';
        assert(prev.category === expect, `${prev.version} should be categorised “${expect}”`);
      }
    });
    assert(RELEASES.some((r) => r.version === '2.0.0' && r.category === 'major' && /3D/.test(r.title)), '2.0.0 must be the major 3D Studio release');
    const bytes = await serializeDoc(new DocEngine(32, 32));
    const { unzipSync, strFromU8 } = await import('fflate');
    const app = JSON.parse(strFromU8(unzipSync(bytes)['manifest.json'])).app;
    assert(app === APP_LABEL, `saved files say “${app}”`);
    return `${WINDOWS_VERSION} · ${RELEASES.length} releases ordered & categorised · manifest “${app}”`;
  });

  await test('[Win] Color Dock: add, select-safe ops, reorder, rename, replace, duplicate, delete', () => {
    let s = norm({ name: 'T' });
    s = addColor(s, '#FF0000').s; s = addColor(s, 'f80', 'Orange').s; s = addColor(s, '#0000ff').s;
    assert(!addColor(s, '#ff0000').added, 'duplicate add should be refused');
    assert(s.colors.join() === '#ff0000,#ff8800,#0000ff' && s.names[1] === 'Orange', 'add / normalise');
    s = moveSwatch(s, 0, 2);
    assert(s.colors.join() === '#ff8800,#0000ff,#ff0000' && s.names[0] === 'Orange', 'reorder keeps names aligned');
    s = renameSwatch(s, 1, 'Blue'); s = replaceSwatch(s, 2, '#00ff00'); s = duplicateSwatch(s, 1);
    assert(s.colors.join() === '#ff8800,#0000ff,#0000ff,#00ff00' && s.names[2] === 'Blue copy', 'rename / replace / duplicate');
    s = removeSwatch(s, 0);
    assert(s.colors.length === 3 && s.names[0] === 'Blue', 'delete');
    const cases: [string, string | null][] = [['#1e90ff', '#1e90ff'], ['1E90FF', '#1e90ff'], ['#abc', '#aabbcc'], ['30, 144, 255', '#1e90ff'], ['rgb(30,144,255)', '#1e90ff'], ['30 144 255', '#1e90ff'], ['300,0,0', null], ['blue', null]];
    for (const [i, o] of cases) assert(parseColorInput(i) === o, `parse “${i}” → ${parseColorInput(i)}`);
    return 'all swatch operations and HEX/RGB parsing verified';
  });

  await test('[Win] Project Color Dock persists in .carbon and never touches artwork or exports', async () => {
    const d = new DocEngine(48, 48);
    d.exec({ k: 'stroke', layerId: d.activeLayerId, brush: P.get('paint-round')!, color: '#336699', eraser: false, seed: 3, s: sampleCurve(48, 48), sym: OFF });
    const before = compositeDoc(d);
    const layersBefore = d.layers.length;
    d.colorDock = { name: 'Skin', colors: ['#f1c27d', '#8d5524'], names: ['Light', 'Deep'] };
    assert(canvasDiff(before, compositeDoc(d), 0) === 0 && d.layers.length === layersBefore, 'dock changed the rendered artwork');
    const r = await deserializeDoc(await serializeDoc(d));
    assert(JSON.stringify(r.colorDock) === JSON.stringify(d.colorDock), 'project dock lost on reopen');
    assert(canvasDiff(compositeDoc(r), before, 3) === 0, 'reopened artwork differs');
    const plain = await deserializeDoc(await serializeDoc(new DocEngine(16, 16)));
    assert(plain.colorDock === null, 'documents without a dock must not gain one');
    return 'project dock round-trips; composite / export pixels identical with and without the dock';
  });

  await test('[Win] Color Dock settings persist across restarts', () => {
    const orig = useDock.getState().cfg;
    updateDock({ size: orig.size === 33 ? 34 : 33, labels: !orig.labels });
    const saved = JSON.parse(localStorage.getItem('carbon-colordock-v1') || '{}');
    const ok = saved?.state?.cfg?.size === useDock.getState().cfg.size && saved.state.cfg.labels === useDock.getState().cfg.labels;
    updateDock(orig);
    assert(ok, 'dock settings were not written to persistent storage');
    const prefs = JSON.parse(localStorage.getItem('carbon-prefs-v1') || '{}');
    assert(Array.isArray(prefs?.state?.palettes), 'global swatch sets (palettes) are not persisted');
    return 'dock config and global sets are written to local storage';
  });

  await test('[Win 2.2] Canvas sampling: exact pixels at integer zoom, filtered at fractional zoom', () => {
    const d = new DocEngine(16, 16, { background: '#000000' });
    const c0 = ctxOf(d.layers[0].canvas!);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if ((x + y) % 2) { c0.fillStyle = '#ffffff'; c0.fillRect(x, y, 1, 1); }
    const render = (k: number) => { const n = Math.round(16 * k); const c = document.createElement('canvas'); c.width = c.height = n; renderDoc(ctxOf(c), d, [k, 0, 0, k, 0, 0], n, n, { bg: true, smoothing: 'auto' }); return c.getContext('2d')!.getImageData(0, 0, n, n).data; };
    const mid = (a: Uint8ClampedArray) => { let m = 0; for (let i = 0; i < a.length; i += 4) if (a[i] > 20 && a[i] < 235) m++; return m; };
    const m2 = mid(render(2)), m15 = mid(render(1.5));
    assert(m2 === 0, `200% zoom produced ${m2} resampled (blurred) pixels`);
    assert(m15 > 0, '150% zoom was not filtered (uneven nearest-neighbour pixels)');
    return `200%: 0 blended pixels · 150%: ${m15} filtered pixels`;
  });

  await test('[Win 2.2] Spatial curves: symmetry, simplify, smoothing, legacy scene migration', () => {
    const mats = symMatrices({ mirror: { x: true, y: false, z: false }, radial: 3, axis: 'y', center: [0, 0, 0] });
    assert(mats.length === 6, `mirror X × radial 3 gave ${mats.length} copies, expected 6`);
    const m = applyMat([1, 2, 3], mats[1]);
    assert(Math.abs(m[0] + 1) < 1e-9 && Math.abs(m[1] - 2) < 1e-9 && Math.abs(m[2] - 3) < 1e-9, `mirror X mapped (1,2,3) to (${m.map((v) => v.toFixed(2))})`);
    const line: number[] = [];
    for (let i = 0; i <= 50; i++) line.push(i / 50, 0, 0);
    const simp = simplify3(line, 0.01);
    assert(simp.length === 6 && simp[0] === 0 && simp[3] === 1, `straight 51-point line simplified to ${simp.length / 3} points`);
    const zig = [0, 0, 0, 1, 1, 0, 2, 0, 0];
    const sm = smooth3(zig, 1, 0.5);
    assert(sm[4] < 1 && sm[0] === 0 && sm[6] === 2, 'smoothing should pull the middle point and keep the endpoints');
    const legacy = sceneOf({ version: 1, bg: '#000', ambient: 1, lights: [], objects: [], grid: true, axes: true, plane: 'xy', planeOffset: 0.5, symmetry: true, snap: false, gridSize: 0.25, ortho: false });
    assert(legacy.draw.mode === 'xy' && legacy.draw.offset === 0.5 && legacy.sym.mirror.x && Array.isArray(legacy.views), 'legacy 2.1 scene settings not migrated');
    return '6 symmetric copies, exact mirror, RDP 51→2 points, 2.1 scene migrated';
  });

  await test('[Win 7] Prime White Ground: default environment, migration and grid', () => {
    const d = defaultScene();
    assert(d.ground === true && d.groundColor === '#ffffff', 'new scenes must start on a pure-white ground plane');
    assert(d.objects.length === 0, 'new scenes must not contain a decorative starter cube');
    assert(d.grid && colorLuminance(d.bg) > 0.8, 'default background must be bright and neutral for the white ground');
    const legacy = sceneOf({ version: 1, bg: '#26262b', ambient: 0.5, lights: [], objects: [{ id: 'k', kind: 'cube', pos: [0, 0.5, 0] }], grid: true, axes: true, gridSize: 0.25, snap: false, ortho: false, draw: { mode: 'xz', offset: 0, pos: [0, 0, 0], rot: [0, 0, 0] }, sym: { mirror: { x: false, y: false, z: false }, radial: 1, axis: 'y', center: [0, 0, 0] }, views: [] });
    assert(legacy.ground === true && legacy.objects.length === 1 && legacy.objects[0].pos[0] === 0, 'legacy scenes migrate to the white ground without touching their objects');
    const verts = (makeGrid(d).geometry.getAttribute('position') as { count: number }).count;
    assert(verts > 0 && verts % 4 === 0, 'perspective grid builds from the scene spacing');
    return `white-ground default, no starter cube, legacy migration safe, grid ${verts / 4} line pairs`;
  });

  await test('[Win 2.2] Spatial strokes, views and surface strokes persist in .carbon', async () => {
    const d = new DocEngine(32, 32);
    const s = sceneOf(null);
    s.objects.push({ id: 'st1', name: 'Stroke', kind: 'curve', pos: [0.5, 0, 0], rot: [0, 0.3, 0], scale: [1, 1, 1], visible: true, mat: { color: '#ff0000', roughness: 0.5, metalness: 0, opacity: 0.8 }, curve: { pts: [0, 0, 0, 0.5, 1, -0.25, 1, 0.5, 0.75], type: 'catmull', closed: false, geo: 'tube', thickness: 0.02, width: 0.08, segments: 40, radial: 10, normal: [0, 0, 1], taper: 0.5 } });
    s.objects.push({ id: 'st2', name: 'Surface stroke', kind: 'curve', parent: s.objects[0].id, pos: [0, 0, 0], rot: [0, 0, 0], scale: [1, 1, 1], visible: true, mat: { color: '#00ff00', roughness: 0.5, metalness: 0, opacity: 1 }, curve: { pts: [0, 0.5, 0.1, 0.2, 0.5, 0.1], type: 'poly', closed: false, geo: 'line', thickness: 0.01, width: 0.04, segments: 8, radial: 6, normal: [0, 1, 0] } });
    s.views.push({ id: 'v1', name: 'Hero', view: { pos: [1, 2, 3], target: [0, 0.5, 0], ortho: true, zoom: 1.5, fov: 40 } });
    s.draw = { mode: 'custom', offset: 0.2, pos: [0, 1, 0], rot: [30, 0, 0] };
    d.scene3d = s;
    const r = await deserializeDoc(await serializeDoc(d));
    assert(JSON.stringify(r.scene3d) === JSON.stringify(s), 'spatial scene changed after save/reopen');
    assert(r.meta.uuid === d.meta.uuid, 'document identity (uuid) not preserved');
    return `${s.objects.length} spatial objects, 1 view, custom plane preserved; uuid stable`;
  });

  await test('[Win 2.2] 3D capture pipeline (offscreen WebGL render)', async () => {
    if (!webglAvailable()) return 'SKIPPED: WebGL is unavailable in this environment (3D Studio cannot run here either)';
    const s = sceneOf(null);
    s.objects = [{ id: 'c', name: 'Cube', kind: 'cube', pos: [0, 0, 0], rot: [0, 0, 0], scale: [1, 1, 1], visible: true, mat: { color: '#ff0000', roughness: 1, metalness: 0, opacity: 1 } }];
    s.ambient = 3;
    const url = await renderSceneImage(s, { pos: [0, 0, 3], target: [0, 0, 0], ortho: false, zoom: 1, fov: 45 }, 64, 64, { transparent: true, assets: new Map() });
    const img = await loadImage(url);
    const c = document.createElement('canvas'); c.width = c.height = 64; ctxOf(c).drawImage(img, 0, 0);
    const center = px(c, 32, 32), corner = px(c, 1, 1);
    assert(center[3] === 255 && center[0] > 100 && center[0] > center[1] * 2, `centre pixel ${Array.from(center)} is not the red cube`);
    assert(corner[3] === 0, 'transparent background was not transparent');
    return `rendered 64×64: centre rgba(${Array.from(center).join(',')}), corner transparent`;
  });

  await test('[Win 2.2] Linked layers: link persists, recapture is undoable and replayable, panel clipping', async () => {
    const d = new DocEngine(60, 40, { background: null });
    d.startRecording();
    const mk = async (color: string) => { const c = document.createElement('canvas'); c.width = 60; c.height = 40; const x = ctxOf(c); x.fillStyle = color; x.fillRect(0, 0, 60, 40); const url = c.toDataURL(); const id = 'asset-' + color.slice(1); d.assets[id] = url; d.assetImgs.set(id, await loadImage(url)); return id; };
    const a1 = await mk('#ff0000'), a2 = await mk('#0000ff');
    d.exec({ k: 'layerAdd', id: 'cm', name: 'Panels', type: 'comic', index: 1 });
    d.exec({ k: 'comicSet', layerId: 'cm', objects: [{ id: 'p1', type: 'panel', pts: [10, 10, 30, 10, 30, 30, 10, 30], border: 0, color: '#000000', radius: 0, fill: null }], label: 'panel' });
    const link = { kind: 'scene' as const, doc: d.meta.uuid, docName: d.name, view: { pos: [1, 1, 1] as [number, number, number], target: [0, 0, 0] as [number, number, number], ortho: false, zoom: 1, fov: 45 }, viewName: 'Hero', at: 1 };
    d.exec({ k: 'image', layerId: 'cap', name: 'Capture', asset: a1, x: 0, y: 0, w: 60, h: 40, index: 1, props: { link, panelId: 'p1' } });
    let comp = compositeDoc(d, 1, false);
    assert(px(comp, 20, 20)[0] === 255 && px(comp, 50, 35)[3] === 0, 'capture was not clipped to its panel');
    d.exec({ k: 'imagePixels', layerId: 'cap', asset: a2, x: 0, y: 0, w: 60, h: 40, props: { link: { ...link, at: 2 } } });
    comp = compositeDoc(d, 1, false);
    assert(px(comp, 20, 20)[2] === 255, 'recapture did not replace the pixels');
    d.undo();
    assert(px(compositeDoc(d, 1, false), 20, 20)[0] === 255 && d.layer('cap')!.link!.at === 1, 'undo did not restore the previous capture and link');
    d.redo();
    const live = compositeDoc(d, 1, false);
    const rp = new ReplayPlayer(d); await rp.prepare(); rp.seek(rp.duration);
    assert(canvasDiff(live, compositeDoc(rp.engine, 1, false), 2) === 0, 'Drawing Replay did not reproduce the captures');
    const r = await deserializeDoc(await serializeDoc(d));
    const L = r.layer('cap')!;
    assert(L.panelId === 'p1' && L.link?.viewName === 'Hero' && L.link.doc === d.meta.uuid && L.link.at === 2, 'layer link / panel id lost after reopen');
    return 'clip to panel, recapture, undo/redo, replay and reopen verified';
  });

  await test('[Win 2.2] Brush Fusion produces real engine behaviour', () => {
    const base = P.get('pencil-hb')!, paper = P.get('tex-paper')!, splat = P.get('tex-splatter')!, crisp = P.get('crisp-liner')!;
    const f = fuseBrush(base, [{ brush: paper, aspect: 'texture', strength: 1 }, { brush: splat, aspect: 'overlay', strength: 0.8 }]);
    assert(Math.abs(f.brush.grain - paper.grain) < 1e-9 && f.brush.grainType === paper.grainType, 'texture aspect not applied');
    assert(!!f.brush.layer2 && f.brush.layer2.tip === 'splatter', 'overlay aspect did not create a secondary stamp pass');
    const opts = (b: typeof base) => ({ brush: { ...b, size: 14 }, color: '#202020', eraser: false, seed: 5, sym: OFF, w: 160, h: 60 });
    const r1 = renderStroke(opts(f.brush), sampleCurve(160, 60)), r2 = renderStroke(opts(f.brush), sampleCurve(160, 60)), r0 = renderStroke(opts(base), sampleCurve(160, 60));
    assert(canvasDiff(r1.out, r2.out, 0) === 0, 'fused brush is not deterministic (replay would drift)');
    const dd = canvasDiff(r1.out, r0.out, 2);
    assert(dd > 50, `fused brush renders like its base (${dd} px differ)`);
    const w = fuseBrush(crisp, [{ brush: paper, aspect: 'texture', strength: 1 }]).warnings;
    assert(w.some((x) => /vector/i.test(x)), 'Crisp Ink incompatibility was not reported');
    return `deterministic, ${dd} px differ from base, incompatibility reported`;
  });

  await test('[Win 2.2] Palette Memory extraction', () => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = ctxOf(c);
    [['#ff0000', 0, 0], ['#00ff00', 32, 0], ['#0000ff', 0, 32], ['#ffffff', 32, 32]].forEach(([col, a, b]) => { x.fillStyle = col as string; x.fillRect(a as number, b as number, 32, 32); });
    const pal = extractPalette(c, 4).sort();
    assert(JSON.stringify(pal) === JSON.stringify(['#0000ff', '#00ff00', '#ff0000', '#ffffff']), `extracted ${pal.join(', ')}`);
    return pal.join(', ');
  });

  await test('[Win 2.2] Orbit Board persists and reports broken references', async () => {
    const d = new DocEngine(20, 20);
    d.board = { version: 1, view: { x: 1, y: 2, z: 0.5 }, items: [
      { id: 'n', type: 'note', x: 0, y: 0, w: 100, h: 80, title: 'Note', text: 'hi', tag: 'characters' },
      { id: 'ok', type: 'link', x: 0, y: 0, w: 100, h: 80, title: 'Layer', link: { kind: 'layer', doc: d.meta.uuid, docName: d.name, layerId: d.layers[0].id, label: 'L' } },
      { id: 'bad', type: 'link', x: 0, y: 0, w: 100, h: 80, title: 'Gone', link: { kind: 'layer', doc: d.meta.uuid, docName: d.name, layerId: 'nope', label: 'x' } },
      { id: 'img', type: 'image', x: 0, y: 0, w: 100, h: 80, title: 'Missing', asset: 'ref-missing' },
    ] };
    const items = boardOf(d).items;
    const open = getApp().docs.includes(d);
    const health = items.map((i) => itemHealth(i, d));
    assert(health[0] === null && health[2] !== null && health[3] !== null, 'broken references were not detected');
    if (open) assert(health[1] === null, 'healthy link reported as broken');
    const r = await deserializeDoc(await serializeDoc(d));
    assert(JSON.stringify(r.board) === JSON.stringify(d.board), 'board changed after save/reopen');
    return `round-trip OK; missing layer and missing image flagged${open ? '' : ' (doc not open: link checks report “not open” as expected)'}`;
  });

  await test('[Win 2.2] Time Machine: snapshot, restore, and recover the pre-restore state', async () => {
    const d = new DocEngine(40, 30, { name: 'tm-test' });
    d.exec({ k: 'stroke', layerId: d.activeLayerId, brush: P.get('paint-round')!, color: '#aa3300', eraser: false, seed: 9, s: sampleCurve(40, 30), sym: OFF });
    const original = compositeDoc(d);
    const s1 = await createSnapshot(d, 'Original');
    d.exec({ k: 'layerAdd', id: 'x', name: 'Extra', type: 'raster', index: 1 });
    d.exec({ k: 'fill', layerId: 'x', x: 1, y: 1, color: '#00ff00', tol: 0.1, all: false, expand: 0 });
    const modified = compositeDoc(d);
    const before = await restoreSnapshot(d, s1);
    try {
      assert(canvasDiff(compositeDoc(d), original, 2) === 0 && d.layers.length === 1, 'restore did not reproduce the snapshot');
      assert(before.auto && /Before restoring/.test(before.name), 'no automatic pre-restore snapshot');
      await restoreSnapshot(d, before);
      assert(canvasDiff(compositeDoc(d), modified, 2) === 0 && d.layers.length === 2, 'pre-restore state could not be recovered');
      const list = await listSnapshots(d.meta.uuid);
      assert(list.some((s) => s.name === 'Original'), 'snapshot not listed after restore');
      return `${list.length} snapshots; restore and recovery pixel-identical`;
    } finally {
      for (const s of await listSnapshots(d.meta.uuid)) await deleteSnapshot(s.id);
    }
  });

  await test('[Win] 3D scene, masks and new layer types persist in .carbon', async () => {
    const d = new DocEngine(64, 64);
    d.scene3d = { version: 1, bg: '#222222', objects: [{ id: 'o1', kind: 'sphere', pos: [1, 2, 3] }], lights: [] };
    d.exec({ k: 'maskAdd', layerId: d.layers[0].id, fromSel: false });
    d.exec({ k: 'adjustAdd', id: 'a1', name: 'Adj', index: 1, adjust: { hue: 10, sat: 1, bright: 1, contrast: 1, invert: 0, gray: 0, sepia: 0, blur: 0 } });
    d.exec({ k: 'layerProp', layerId: d.layers[0].id, props: { clip: false, reference: true } });
    const r = await deserializeDoc(await serializeDoc(d));
    assert(JSON.stringify(r.scene3d) === JSON.stringify(d.scene3d), '3D scene changed');
    assert(!!r.layers[0].mask && r.layers[0].reference, 'mask / reference flag lost');
    assert(r.layers[1].type === 'adjust' && r.layers[1].adjust?.hue === 10, 'adjustment layer lost');
    return 'scene3d, masks, reference and adjustment layers preserved';
  });
}
