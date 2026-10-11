// Built-in automated acceptance tests (Help → Run Diagnostics).
import { DocEngine } from './document';
import { ReplayPlayer } from './replay';
import { buildPresets, brushFingerprint, exportBrushes, parseBrushImport, searchBrushes } from './brushes';
import { renderStroke, sampleCurve, StrokeRenderer, SAMPLE_STRIDE } from './strokeRenderer';
import { compositeDoc } from './render';
import { deserializeDoc, serializeDoc, verifyBytes } from './fileFormat';
import { makeInkStroke } from './crispInk';
import { canvasDiff, canvasHash, invM, mapPt, viewMatrix } from './util';
import type { BrushParams, Symmetry } from './types';

export interface TestResult {
  name: string;
  pass: boolean;
  detail: string;
  ms: number;
}

const OFF: Symmetry = { mode: 'off', count: 2, cx: 0.5, cy: 0.5 }; // symmetry disabled
const wait = () => new Promise((r) => setTimeout(r, 0));

function strokeSamples(x0: number, y0: number, x1: number, y1: number, n = 30) {
  const s: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    s.push(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t + Math.sin(t * 6) * 10, 0.3 + 0.7 * Math.sin(t * Math.PI), 0, 0, i * 16);
  }
  return s;
}

function buildSession(P: Map<string, BrushParams>) {
  const d = new DocEngine(320, 240, { name: 'Diagnostics' });
  d.startRecording();
  const L0 = d.activeLayerId;
  const st = (id: string, color: string, s: number[], eraser = false, sym = OFF) =>
    d.exec({ k: 'stroke', layerId: d.activeLayerId, brush: P.get(id)!, color, eraser, seed: Math.floor(Math.random() * 1e9), s, sym });
  st('pencil-hb', '#222222', strokeSamples(20, 40, 300, 60));
  st('wc-transparent', '#2b6cb0', strokeSamples(30, 120, 290, 110));
  st('oil-paint', '#c53030', strokeSamples(40, 100, 280, 140));
  st('blend-smudge', '#000000', strokeSamples(60, 90, 260, 150));
  st('tex-foliage', '#2f855a', strokeSamples(20, 200, 300, 190), false, { mode: 'vertical', count: 2, cx: 0.5, cy: 0.5 });
  d.exec({ k: 'fill', layerId: L0, x: 5, y: 230, color: '#f6e05e', tol: 0.1, all: false, expand: 1 });
  st('eraser-soft', '#000000', strokeSamples(100, 30, 200, 220), true);
  d.exec({ k: 'layerAdd', id: 'ink1', name: 'Ink', type: 'ink', index: 1 });
  d.exec({ k: 'inkAdd', layerId: 'ink1', stroke: makeInkStroke(strokeSamples(30, 30, 290, 210), P.get('crisp-taper')!, '#111111', false) });
  d.exec({ k: 'layerAdd', id: 'r2', name: 'Paint 2', type: 'raster', index: 2 });
  st('marker-alcohol', '#805ad5', strokeSamples(50, 60, 250, 180));
  d.exec({ k: 'transform', layerId: 'r2', m: [0.9, 0.1, -0.1, 0.9, 20, 5], sel: false });
  d.exec({ k: 'layerProp', layerId: 'r2', props: { opacity: 0.7, blend: 'multiply' } });
  d.undo();
  d.redo();
  d.exec({ k: 'select', sel: { pts: [100, 100, 220, 100, 220, 200, 100, 200], inverted: false } });
  d.exec({ k: 'fillSel', layerId: 'r2', color: '#38b2ac' });
  d.exec({ k: 'select', sel: null });
  d.pauseRecording();
  d.exec({ k: 'layerProp', layerId: 'ink1', props: { name: 'Line art' } });
  d.resumeRecording();
  st('air-soft', '#ed8936', strokeSamples(10, 10, 310, 230));
  d.undo();
  d.undo(); // crosses into an earlier epoch → checkpoint
  st('ink-brushpen', '#1a202c', strokeSamples(40, 220, 280, 20));
  return d;
}

export async function runDiagnostics(onProgress?: (r: TestResult[]) => void): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const presets = buildPresets();
  const P = new Map(presets.map((p) => [p.id, p]));
  const test = async (name: string, fn: () => Promise<string> | string) => {
    const t0 = performance.now();
    try {
      const detail = await fn();
      results.push({ name, pass: true, detail, ms: performance.now() - t0 });
    } catch (e) {
      results.push({ name, pass: false, detail: e instanceof Error ? e.message : String(e), ms: performance.now() - t0 });
    }
    onProgress?.([...results]);
    await wait();
  };
  const assert = (c: unknown, msg: string) => { if (!c) throw new Error(msg); };

  await test('View transform keeps document coordinates (zoom/pan/rotate/flip)', () => {
    let worst = 0;
    for (const v of [{ zoom: 0.13, panX: 10, panY: 900, rot: 0, flip: false }, { zoom: 3.7, panX: -200, panY: 40, rot: 33, flip: true }, { zoom: 16, panX: 500, panY: 500, rot: -170, flip: false }]) {
      const m = viewMatrix(v, 2000, 1500), im = invM(m);
      for (const [x, y] of [[0, 0], [1234.5, 77.25], [2000, 1500]]) {
        const [sx, sy] = mapPt(m, x, y);
        const [bx, by] = mapPt(im, sx, sy);
        worst = Math.max(worst, Math.hypot(bx - x, by - y));
      }
    }
    assert(worst < 1e-6, 'round-trip error ' + worst);
    return `max error ${worst.toExponential(1)} px`;
  });

  await test('Incremental stroke rendering equals one-shot rendering', () => {
    const s = sampleCurve(300, 120, 80);
    let checked = 0;
    for (const id of ['pencil-hb', 'wc-wet', 'paint-bristle', 'tex-foliage', 'air-fine']) {
      const o = { brush: P.get(id)!, color: '#336699', eraser: false, seed: 42, sym: OFF, w: 300, h: 120 };
      const a = renderStroke(o, s);
      const b = new StrokeRenderer(o);
      for (let n = 1; n <= s.length / SAMPLE_STRIDE; n += 7) { b.feed(s, n); b.sync(); }
      b.feed(s, Infinity);
      b.finish();
      const diff = canvasDiff(a.out, b.out, 1);
      assert(diff === 0, `${id}: ${diff} pixels differ`);
      checked++;
    }
    return `${checked} brush engines verified`;
  });

  await test('Undo / redo restores exact pixels', () => {
    const d = new DocEngine(200, 120);
    const L = d.active!;
    const h0 = canvasHash(L.canvas!);
    d.exec({ k: 'stroke', layerId: L.id, brush: P.get('paint-round')!, color: '#ff0000', eraser: false, seed: 1, s: sampleCurve(200, 120), sym: OFF });
    const h1 = canvasHash(d.active!.canvas!);
    assert(h1 !== h0, 'stroke had no effect');
    d.undo();
    assert(canvasHash(d.active!.canvas!) === h0, 'undo mismatch');
    d.redo();
    assert(canvasHash(d.active!.canvas!) === h1, 'redo mismatch');
    return 'hash-verified';
  });

  let session: DocEngine | null = null;
  await test('Drawing Replay reconstructs the final document', async () => {
    session = buildSession(P);
    const live = compositeDoc(session);
    const rp = new ReplayPlayer(session);
    await rp.prepare();
    rp.seek(rp.duration);
    const diff = canvasDiff(live, compositeDoc(rp.engine), 2);
    assert(diff === 0, `${diff} pixels differ after replay`);
    return `${rp.events.length} events, ${(rp.duration / 1000).toFixed(1)} s timeline, pixel-identical`;
  });

  await test('Replay seeking (backward / forward) stays deterministic', async () => {
    const d = session!;
    const live = compositeDoc(d);
    const rp = new ReplayPlayer(d);
    await rp.prepare();
    rp.seek(rp.duration * 0.6);
    rp.seek(rp.duration * 0.2);
    rp.seek(rp.duration * 0.9);
    rp.seek(rp.duration * 0.1);
    rp.seek(rp.duration);
    const diff = canvasDiff(live, compositeDoc(rp.engine), 2);
    assert(diff === 0, `${diff} pixels differ after seeking`);
    return 'checkpoint restore verified';
  });

  await test('Playback never modifies the original artwork', async () => {
    const d = session!;
    const before = d.layers.map((l) => (l.canvas ? canvasHash(l.canvas) : JSON.stringify(l.strokes)).toString()).join();
    const rp = new ReplayPlayer(d);
    await rp.prepare();
    rp.seek(rp.duration / 2);
    rp.seek(rp.duration);
    const after = d.layers.map((l) => (l.canvas ? canvasHash(l.canvas) : JSON.stringify(l.strokes)).toString()).join();
    assert(before === after, 'source document changed');
    return 'source hashes unchanged';
  });

  await test('Save → reopen preserves layers, Crisp Ink and replay history', async () => {
    const d = session!;
    const bytes = await serializeDoc(d);
    verifyBytes(bytes);
    const r = await deserializeDoc(bytes);
    assert(r.layers.length === d.layers.length, 'layer count');
    r.layers.forEach((l, i) => {
      const o = d.layers[i];
      assert(l.id === o.id && l.name === o.name && l.visible === o.visible && Math.abs(l.opacity - o.opacity) < 1e-6 && l.blend === o.blend, 'layer props ' + o.name);
      if (o.type === 'ink') assert(JSON.stringify(l.strokes) === JSON.stringify(o.strokes), 'ink paths');
    });
    const diff = canvasDiff(compositeDoc(d), compositeDoc(r), 3);
    assert(diff < 25, `${diff} pixels differ`);
    assert(r.rec.events.length === d.rec.events.length, 'replay events');
    const rp = new ReplayPlayer(r);
    await rp.prepare();
    rp.seek(rp.duration);
    const d2 = canvasDiff(compositeDoc(r), compositeDoc(rp.engine), 3);
    assert(d2 < 25, `reopened replay differs by ${d2} px`);
    return `${(bytes.length / 1024).toFixed(1)} KB archive, ${r.rec.events.length} events restored`;
  });

  await test('Corrupt or truncated saves are rejected before commit', async () => {
    const d = new DocEngine(64, 64);
    const bytes = await serializeDoc(d);
    let rejected = 0;
    for (const bad of [bytes.slice(0, bytes.length >> 1), new Uint8Array(100), new TextEncoder().encode('{"format":"x"}')]) {
      try { verifyBytes(bad); } catch { rejected++; }
    }
    assert(rejected === 3, 'some corrupt archives accepted');
    return '3/3 corrupt archives rejected; existing file stays untouched';
  });

  await test('Brush library: every preset is distinct and renders', () => {
    const fps = new Set(presets.map(brushFingerprint));
    assert(fps.size === presets.length, `${presets.length - fps.size} duplicate presets`);
    let empty = 0;
    for (const b of presets) {
      const layer = document.createElement('canvas');
      layer.width = 120; layer.height = 50;
      const lc = layer.getContext('2d')!;
      const grad = lc.createLinearGradient(0, 0, 120, 50);
      grad.addColorStop(0, '#c2410c'); grad.addColorStop(0.5, '#1d4ed8'); grad.addColorStop(1, '#15803d');
      lc.fillStyle = grad; lc.fillRect(0, 8, 120, 34);
      const r = renderStroke({ brush: { ...b, size: Math.min(b.size, 20) }, color: '#202020', eraser: false, seed: 3, sym: OFF, w: 120, h: 50, layer }, sampleCurve(120, 50, 30));
      const before = canvasHash(layer);
      if (canvasHash(r.out) === before && r.direct) empty++;
      else if (!r.direct) {
        const d = r.out.getContext('2d')!.getImageData(0, 0, 120, 50).data;
        let any = false;
        for (let i = 3; i < d.length; i += 4) if (d[i] > 0) { any = true; break; }
        if (!any) empty++;
      }
    }
    assert(empty === 0, `${empty} presets produced no paint`);
    return `${presets.length} distinct presets`;
  });

  await test('Brush search, export and duplicate-aware import', () => {
    assert(searchBrushes(presets, 'watercolor').length >= 8, 'watercolor search');
    assert(searchBrushes(presets, 'crisp').every((b) => b.mode === 'crisp' || b.tags.includes('crisp')), 'crisp search');
    const json = exportBrushes(presets.slice(0, 10));
    const imp = parseBrushImport(json, presets);
    assert(imp.duplicates === 10 && imp.added.length === 0, 'duplicates not detected');
    const imp2 = parseBrushImport(json, []);
    assert(imp2.added.length === 10, 'import failed');
    return 'search, export, import, duplicate detection OK';
  });

  await test('Recording overhead per stroke event', () => {
    const d = new DocEngine(64, 64, { blank: true });
    d.rec.enabled = true;
    const s = strokeSamples(0, 0, 60, 60, 200);
    const t0 = performance.now();
    for (let i = 0; i < 5000; i++) d.rec.push({ t: d.rec.clock(), c: { k: 'stroke', layerId: 'x', brush: presets[0], color: '#000', eraser: false, seed: i, s, sym: OFF } }, 100, s.length * 6);
    const us = ((performance.now() - t0) / 5000) * 1000;
    assert(us < 200, `${us.toFixed(1)} µs per event`);
    return `${us.toFixed(2)} µs per recorded stroke`;
  });

  if (EDITION.windows) await winTests(test, assert);
  return results;
}

import { winTests } from './selftest2';
import { EDITION } from '../platform/edition';
