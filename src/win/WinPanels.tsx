import { useEffect, useMemo, useRef, useState } from 'react';
import { zipSync } from 'fflate';
import { Box, Brush, Check, Copy, Download, Eye, FilePlus2, Layers3, MessageSquare, Palette as PaletteIcon, Plus, RotateCcw, Search, Sparkles, Star, Trash2, Upload, Wand2 } from 'lucide-react';
import { activeDoc, allBrushes, brushById, confirmDialog, getApp, selectBrush, setApp, setTool, toast, useApp } from '../state/store';
import { addDoc, closeDoc, pickFile } from '../state/actions';
import { DocEngine, pxToCanvas } from '../engine/document';
import { compositeDoc, DEFAULT_ADJUST } from '../engine/render';
import { FILTERS, fxById, runFx, scaleParams } from '../engine/filters';
import { LAYOUTS, layoutPanels, makePdf, PAGE_PRESETS } from '../engine/comic';
import { CATALOG, exportPack, parsePack } from '../engine/brushPacks';
import { brushPreview } from '../engine/strokeRenderer';
import { serializeComic, serializeDoc, deserializeDoc } from '../engine/fileFormat';
import { canvasToBlob, createCanvas, ctxOf, download, hexToRgb, isHex, normHex, rgbToHex, uid } from '../engine/util';
import type { AdjustParams, BalloonStyle, BrushParams, ComicBalloon, ComicFx, ComicFxKind, ComicObject, ComicPanel } from '../engine/types';
import { comicObjects, GRADIENT_PRESETS, liqCancel, liqCommit, liqReset, setComicObjects, setWin, updateComicObject, useWin, type ComicMode, type Workspace } from './WinOverlay';
import { Btn, NumInput, SectionTitle, Select, Slider, Toggle } from '../components/ui';
import { LayoutDashboard } from 'lucide-react';
import { LayerLinkTools, PanelCapture } from './Continuum';
import { cn } from '../utils/cn';

// ================================================================ workspaces
const WS: { id: Workspace; label: string; icon: typeof Brush }[] = [
  { id: 'draw', label: 'Draw', icon: Brush }, { id: 'comic', label: 'Comic Studio', icon: MessageSquare }, { id: '3d', label: '3D Studio', icon: Box },
  { id: 'effects', label: 'Effects', icon: Wand2 }, { id: 'board', label: 'Orbit Board', icon: LayoutDashboard }, { id: 'library', label: 'Brush Library', icon: Sparkles },
];
export function switchWorkspace(w: Workspace) {
  const prev = useWin.getState().workspace;
  if (prev === 'effects' && w !== 'effects') { liqCommit(); clearFxPreview(); }
  setWin({ workspace: w });
  if (w === 'comic') setTool('comic');
  else if (prev === 'comic' && getApp().tool === 'comic') setTool('brush');
  if (w !== 'effects' && getApp().tool === 'liquify') setTool('brush');
}
export function WorkspaceBar() {
  const ws = useWin((s) => s.workspace);
  return (
    <div className="flex items-center gap-0.5 rounded-md bg-black/30 p-0.5" role="tablist" aria-label="Workspaces">
      {WS.map((w) => (
        <button key={w.id} role="tab" aria-selected={ws === w.id} title={w.label} onClick={() => switchWorkspace(w.id)}
          className={cn('flex items-center gap-1 rounded px-2 py-0.5 text-[11px]', ws === w.id ? 'bg-[#E8913A] text-neutral-950' : 'text-neutral-400 hover:bg-white/10 hover:text-white')}>
          <w.icon size={12} /> <span className="hidden lg:inline">{w.label}</span>
        </button>
      ))}
    </div>
  );
}

// ================================================================ effects
let fxPreviewDoc: DocEngine | null = null;
function clearFxPreview() {
  if (fxPreviewDoc) { fxPreviewDoc.preview = null; fxPreviewDoc.emit(); fxPreviewDoc = null; }
}

export function EffectsPanel() {
  const tool = useApp((s) => s.tool);
  const liq = useWin((s) => s.liq);
  const grad = useWin((s) => s.grad);
  const [fid, setFid] = useState('gaussian');
  const def = fxById(fid)!;
  const [params, setParams] = useState<Record<string, number>>({});
  const [preview, setPreview] = useState(true);
  const [busy, setBusy] = useState(false);
  const seed = useRef(Math.floor(Math.random() * 1e9));
  const p = useMemo(() => Object.fromEntries(def.params.map((q) => [q.key, params[q.key] ?? q.def])), [def, params]);
  const doc = activeDoc();
  const L = doc?.active;
  const ok = !!L && L.type === 'raster' && !L.locked;

  // live preview on a reduced proxy (fast), shown through the non-destructive preview channel
  useEffect(() => {
    if (!preview || !doc || !ok || tool === 'liquify') { clearFxPreview(); return; }
    const t = setTimeout(() => {
      const src = L!.canvas!;
      const k = Math.min(1, 720 / Math.max(src.width, src.height));
      const pw = Math.max(1, Math.round(src.width * k)), ph = Math.max(1, Math.round(src.height * k));
      const proxy = createCanvas(pw, ph, true);
      ctxOf(proxy).drawImage(src, 0, 0, pw, ph);
      const id = proxy.getContext('2d')!.getImageData(0, 0, pw, ph);
      const res = pxToCanvas(runFx(fid, { data: id.data, w: pw, h: ph }, scaleParams(def, p, k), seed.current));
      const full = createCanvas(src.width, src.height);
      const fc = ctxOf(full);
      fc.imageSmoothingQuality = 'high';
      fc.drawImage(res, 0, 0, src.width, src.height);
      if (fxPreviewDoc && fxPreviewDoc !== doc) clearFxPreview();
      doc.preview = { kind: 'replace', layerId: L!.id, canvas: full };
      fxPreviewDoc = doc;
      doc.emit();
    }, 120);
    return () => clearTimeout(t);
  }, [fid, p, preview, doc, L, ok, def, tool]);
  useEffect(() => () => clearFxPreview(), []);

  const apply = () => {
    if (!doc || !L || !ok) return;
    clearFxPreview();
    setBusy(true);
    setTimeout(() => {
      try {
        const t0 = performance.now();
        doc.exec({ k: 'fx', layerId: L.id, id: fid, params: p, seed: seed.current });
        seed.current = Math.floor(Math.random() * 1e9);
        toast(`${def.name} applied (${Math.round(performance.now() - t0)} ms). Undo with Ctrl+Z.`, 'success');
      } catch (e) { toast('Filter failed: ' + (e instanceof Error ? e.message : e), 'error'); }
      setBusy(false);
    }, 30);
  };

  return (
    <div className="space-y-2 text-[11px]">
      <SectionTitle>Filters</SectionTitle>
      {!ok && <div className="rounded bg-amber-500/10 px-2 py-1 text-amber-200">Select an unlocked raster layer to filter.</div>}
      <Select value={fid} onChange={(v) => { setFid(v); setParams({}); }} options={FILTERS.map((f) => ({ value: f.id, label: `${f.group} · ${f.name}` }))} />
      {def.params.map((q) => (
        <Slider key={q.key} label={q.label} value={p[q.key]} min={q.min} max={q.max} step={q.step} fmt={(v) => (q.step < 1 ? v.toFixed(2) : String(Math.round(v))) + (q.unit || '')} onChange={(v) => setParams({ ...params, [q.key]: v })} />
      ))}
      <Toggle label="Live preview (reduced resolution)" checked={preview} onChange={setPreview} />
      <div className="flex gap-1">
        <Btn variant="primary" disabled={!ok || busy} onClick={apply}>{busy ? 'Processing…' : 'Apply'}</Btn>
        <Btn onClick={() => { setParams({}); clearFxPreview(); setPreview(false); }}>Cancel</Btn>
        <Btn onClick={() => setParams({})}><RotateCcw size={11} /> Defaults</Btn>
      </div>
      <p className="text-[10px] text-neutral-500">The original stays untouched until you apply. Applied filters are undoable, respect the selection and are recorded in Drawing Replay.</p>

      <SectionTitle>Liquify</SectionTitle>
      <div className="grid grid-cols-4 gap-1">
        {['Push', 'Pull', 'Expand', 'Shrink', 'Twirl ↻', 'Twirl ↺', 'Reconstruct'].map((n, i) => (
          <Btn key={n} active={liq.mode === i} onClick={() => { setWin({ liq: { ...liq, mode: i } }); setTool('liquify'); }}>{n}</Btn>
        ))}
      </div>
      <Slider label="Radius" value={liq.radius} min={5} max={400} step={1} fmt={(v) => v + 'px'} onChange={(v) => setWin({ liq: { ...liq, radius: v } })} />
      <Slider label="Strength" value={liq.strength} min={0.02} max={1} onChange={(v) => setWin({ liq: { ...liq, strength: v } })} />
      <Toggle label="Stylus pressure controls strength" checked={liq.pressure} onChange={(v) => setWin({ liq: { ...liq, pressure: v } })} />
      <div className="flex flex-wrap gap-1">
        <Btn active={tool === 'liquify'} onClick={() => setTool('liquify')}>Liquify tool</Btn>
        <Btn onClick={liqReset}>Reset</Btn>
        <Btn variant="primary" onClick={() => { liqCommit(); setTool('brush'); }}>Apply</Btn>
        <Btn onClick={() => { liqCancel(); setTool('brush'); }}>Cancel</Btn>
      </div>
      <p className="text-[10px] text-neutral-500">Deforms the real pixels of the active layer through a displacement field. The preview is non-destructive until you press Apply or switch tools.</p>

      <SectionTitle>Gradient</SectionTitle>
      <GradientEditor />
      <div className="flex gap-1">
        <Btn active={tool === 'gradient'} onClick={() => setTool('gradient')}>Gradient tool</Btn>
        <Btn active={grad.kind === 'linear'} onClick={() => setWin({ grad: { ...grad, kind: 'linear' } })}>Linear</Btn>
        <Btn active={grad.kind === 'radial'} onClick={() => setWin({ grad: { ...grad, kind: 'radial' } })}>Radial</Btn>
      </div>
    </div>
  );
}

export function GradientEditor() {
  const grad = useWin((s) => s.grad);
  const fg = useApp((s) => s.fg);
  const css = `linear-gradient(90deg, ${[...grad.stops].sort((a, b) => a.o - b.o).map((s) => { const [r, g, b] = hexToRgb(s.c); return `rgba(${r},${g},${b},${s.a}) ${s.o * 100}%`; }).join(',')})`;
  const set = (stops: typeof grad.stops) => setWin({ grad: { ...grad, stops } });
  return (
    <div className="space-y-1">
      <div className="h-5 rounded border border-white/10 bg-[repeating-conic-gradient(#666_0_25%,#999_0_50%)] bg-[length:10px_10px]"><div className="h-full w-full rounded" style={{ background: css }} /></div>
      {grad.stops.map((s, i) => (
        <div key={i} className="flex items-center gap-1">
          <input type="color" value={s.c} onChange={(e) => set(grad.stops.map((x, j) => (j === i ? { ...x, c: e.target.value } : x)))} className="h-5 w-6 cursor-pointer bg-transparent" aria-label="Stop color" />
          <input type="range" className="carbon-range flex-1" min={0} max={1} step={0.01} value={s.o} onChange={(e) => set(grad.stops.map((x, j) => (j === i ? { ...x, o: +e.target.value } : x)))} title="Position" />
          <input type="range" className="carbon-range w-14" min={0} max={1} step={0.01} value={s.a} onChange={(e) => set(grad.stops.map((x, j) => (j === i ? { ...x, a: +e.target.value } : x)))} title="Alpha" />
          <button disabled={grad.stops.length <= 2} onClick={() => set(grad.stops.filter((_, j) => j !== i))} className="text-neutral-500 hover:text-red-400 disabled:opacity-30"><Trash2 size={11} /></button>
        </div>
      ))}
      <div className="flex flex-wrap gap-1">
        <Btn onClick={() => set([...grad.stops, { o: 0.5, c: fg, a: 1 }])}><Plus size={11} /> Stop</Btn>
        <Select value="" onChange={(v) => { const p = GRADIENT_PRESETS.find((x) => x.name === v); if (p) set(p.stops.map((s) => ({ ...s }))); }} options={[{ value: '', label: 'Presets…' }, ...GRADIENT_PRESETS.map((g) => ({ value: g.name, label: g.name }))]} />
      </div>
    </div>
  );
}

// ================================================================ colour extras
const CURATED: { name: string; colors: string[] }[] = [
  { name: 'Oil painting', colors: ['#f4f0e6', '#e3c16f', '#c8553d', '#8c2f39', '#5b3a29', '#2f4858', '#336b87', '#90a955', '#4f772d', '#1b1b1e', '#d4a373', '#7d5a50'] },
  { name: 'Watercolor', colors: ['#f9e0ae', '#fc8621', '#c24914', '#682c0e', '#a2d5f2', '#07689f', '#40a8c4', '#bcdbdf', '#c6d57e', '#557571', '#e7b2a5', '#7c3c21'] },
  { name: 'Colored pencils', colors: ['#e63946', '#f1a208', '#ffd60a', '#80b918', '#007f5f', '#0077b6', '#023e8a', '#7209b7', '#f72585', '#6d4c41', '#adb5bd', '#212529'] },
  { name: 'Watercolor pencils', colors: ['#ffadad', '#ffd6a5', '#fdffb6', '#caffbf', '#9bf6ff', '#a0c4ff', '#bdb2ff', '#ffc6ff', '#8d6e63', '#607d8b'] },
  { name: 'Pastels', colors: ['#fbe7c6', '#b4f8c8', '#a0e7e5', '#ffaebc', '#cdb4db', '#ffc8dd', '#bde0fe', '#a2d2ff', '#fde2e4', '#e2ece9'] },
  { name: 'Portraits & skin', colors: ['#ffe0cc', '#f8d0b0', '#f1c27d', '#e0ac69', '#c68642', '#a1665e', '#8d5524', '#6b3e26', '#4a2c20', '#2d1b14', '#e8a598', '#c97b84'] },
  { name: 'Manga & comics', colors: ['#000000', '#1a1a1a', '#4d4d4d', '#808080', '#b3b3b3', '#e6e6e6', '#ffffff', '#e83030', '#2f6fdb', '#f2c230'] },
  { name: 'Landscapes', colors: ['#87ceeb', '#4a90c2', '#f6e7cb', '#c9a66b', '#6b8e23', '#556b2f', '#2e4a2e', '#8b7d6b', '#5d4037', '#b0bec5', '#e9c46a', '#264653'] },
  { name: 'Night scenes', colors: ['#03045e', '#023e8a', '#0b132b', '#1c2541', '#3a506b', '#5bc0be', '#ffd166', '#f4a261', '#9d4edd', '#10002b'] },
  { name: 'Fantasy', colors: ['#3c096c', '#7b2cbf', '#c77dff', '#00b4d8', '#48cae4', '#06d6a0', '#ffd60a', '#ef476f', '#ff9e00', '#14213d'] },
  { name: 'Limited (Zorn)', colors: ['#f2ede4', '#d9a066', '#b04632', '#1c1c1c', '#8a6a52', '#c98e72'] },
];

function rgb2hsl(r: number, g: number, b: number) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function hsl2hex(h: number, s: number, l: number) {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

export function WinColorExtras() {
  const fg = useApp((s) => s.fg);
  const palettes = useApp((s) => s.palettes);
  const [cur, setCur] = useState(CURATED[0].name);
  const [h, s, l] = rgb2hsl(...hexToRgb(fg));
  const setC = (hex: string) => { const st = getApp(); setApp({ fg: hex, recentColors: [hex, ...st.recentColors.filter((c) => c !== hex)].slice(0, 18) }); };
  const pal = CURATED.find((p) => p.name === cur)!;
  return (
    <div className="space-y-1 border-t border-white/5 pt-2">
      <SectionTitle>HSL</SectionTitle>
      <Slider label="Hue" value={h} min={0} max={359} step={1} fmt={(v) => Math.round(v) + '°'} onChange={(v) => setC(hsl2hex(v, s, l))} />
      <Slider label="Saturation" value={s} min={0} max={1} onChange={(v) => setC(hsl2hex(h, v, l))} />
      <Slider label="Lightness" value={l} min={0} max={1} onChange={(v) => setC(hsl2hex(h, s, v))} />
      <div className="flex items-center gap-1 text-[10px] text-neutral-500">
        hsl({Math.round(h)}, {Math.round(s * 100)}%, {Math.round(l * 100)}%)
        <input placeholder="#hex or r,g,b" onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key !== 'Enter') return;
          const v = (e.target as HTMLInputElement).value.trim();
          const m = v.match(/^(\d+)\s*,\s*(\d+)\s*,\s*(\d+)$/);
          if (m) setC(rgbToHex(+m[1], +m[2], +m[3]));
          else if (isHex(v)) setC(normHex(v));
          else toast('Enter #RRGGBB or R,G,B', 'error');
        }} className="ml-auto w-24 rounded bg-neutral-900 px-1 py-0.5 text-neutral-200 outline-none ring-1 ring-white/10" />
      </div>
      <SectionTitle>Curated palettes</SectionTitle>
      <Select value={cur} onChange={setCur} options={CURATED.map((c) => ({ value: c.name, label: c.name }))} />
      <div className="flex flex-wrap gap-1">{pal.colors.map((c) => <button key={c} title={c} onClick={() => setC(c)} className="h-5 w-5 rounded-sm border border-black/40 hover:ring-2 hover:ring-white/40" style={{ background: c }} />)}</div>
      <Btn onClick={() => { const id = uid('pal-'); setApp({ palettes: [...palettes, { id, name: pal.name, colors: [...pal.colors] }], activePalette: id }); toast(`“${pal.name}” copied to your palettes. You can rename and edit it there.`, 'success'); }}><Copy size={11} /> Copy to my palettes</Btn>
    </div>
  );
}

// ================================================================ advanced layers
export function WinLayerTools() {
  useApp((s) => s.tick);
  const maskEdit = useWin((s) => s.maskEdit);
  const [sel, setSel] = useState<string[]>([]);
  const [showSel, setShowSel] = useState(false);
  const d = activeDoc();
  if (!d) return null;
  const A = d.active;
  const prop = (p: Record<string, unknown>) => A && d.exec({ k: 'layerProp', layerId: A.id, props: p });
  const adj = A?.type === 'adjust' ? { ...DEFAULT_ADJUST, ...(A.adjust || {}) } : null;
  const setAdj = (k: keyof AdjustParams, v: number) => { if (!A || !adj) return; d.propPreview = { layerId: A.id, props: { adjust: { ...adj, [k]: v } } }; d.emit(); };
  const commitAdj = () => { const pp = d.propPreview; if (A && pp?.props.adjust) { d.propPreview = null; d.exec({ k: 'layerProp', layerId: A.id, props: { adjust: pp.props.adjust } }); } };
  const eff = A && d.propPreview?.layerId === A.id && d.propPreview.props.adjust ? d.propPreview.props.adjust : adj;
  return (
    <div className="space-y-1 rounded-md border border-white/5 bg-white/[0.02] p-2 text-[11px]">
      <div className="flex flex-wrap gap-1">
        <Btn title="Clip to the layer below (clipping mask)" active={!!A?.clip} disabled={!A || A.type === 'group' || A.type === 'adjust'} onClick={() => prop({ clip: !A!.clip })}>Clip</Btn>
        <Btn title="Reference layer: Fill finds regions from this layer's line art" active={!!A?.reference} disabled={!A} onClick={() => prop({ reference: !A!.reference })}>Reference</Btn>
        {d.comic && <Btn title="Clip this artwork to the comic panels" active={!!A?.panelClip} disabled={!A || A.type !== 'raster'} onClick={() => prop({ panelClip: !A!.panelClip })}>Panel clip</Btn>}
        {A?.type === 'group' ? <Btn onClick={() => d.exec({ k: 'ungroup', groupId: A.id })}>Ungroup</Btn> : <Btn onClick={() => setShowSel(!showSel)} active={showSel}><Layers3 size={11} /> Group…</Btn>}
      </div>
      {showSel && (
        <div className="space-y-0.5 rounded bg-black/20 p-1">
          {[...d.layers].reverse().filter((l) => l.type !== 'group').map((l) => (
            <label key={l.id} className="flex items-center gap-1 text-neutral-300"><input type="checkbox" checked={sel.includes(l.id)} onChange={() => setSel(sel.includes(l.id) ? sel.filter((x) => x !== l.id) : [...sel, l.id])} />{l.name}</label>
          ))}
          <div className="flex gap-1 pt-1">
            <Btn variant="primary" disabled={!sel.length} onClick={() => { d.exec({ k: 'group', ids: sel, groupId: uid('G'), name: 'Group ' + (d.layers.filter((l) => l.type === 'group').length + 1) }); setSel([]); setShowSel(false); }}>Group {sel.length}</Btn>
            <Btn onClick={() => { setSel([]); setShowSel(false); }}>Cancel</Btn>
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-neutral-500">Mask</span>
        {!A?.mask ? (
          <Btn disabled={!A || A.type === 'group' || A.type === 'adjust'} onClick={() => A && d.exec({ k: 'maskAdd', layerId: A.id, fromSel: !!d.selection })}>{d.selection ? 'Add from selection' : 'Add'}</Btn>
        ) : (
          <>
            <Btn active={maskEdit === A.id} disabled={A.type !== 'raster'} title="Paint the mask: Brush reveals, Eraser hides" onClick={() => { setWin({ maskEdit: maskEdit === A.id ? null : A.id }); if (getApp().tool !== 'eraser') setTool('brush'); }}>{maskEdit === A.id ? 'Editing mask' : 'Edit mask'}</Btn>
            <Btn active={A.maskEnabled !== false} onClick={() => prop({ maskEnabled: A.maskEnabled === false })}><Eye size={11} /></Btn>
            <Btn disabled={A.type !== 'raster'} onClick={() => { d.exec({ k: 'maskDel', layerId: A.id, apply: true }); setWin({ maskEdit: null }); }}>Apply</Btn>
            <Btn onClick={() => { d.exec({ k: 'maskDel', layerId: A.id, apply: false }); setWin({ maskEdit: null }); }}><Trash2 size={11} /></Btn>
          </>
        )}
      </div>
      {maskEdit === A?.id && <div className="rounded bg-fuchsia-500/10 px-2 py-1 text-[10px] text-fuchsia-200">Mask painting: Brush = reveal, Eraser = hide. Pick any brush.</div>}
      <div className="flex flex-wrap gap-1">
        <Btn title="Adjustment layer: affects all layers below" onClick={() => d.exec({ k: 'adjustAdd', id: uid('L'), name: 'Adjustment', index: d.layers.findIndex((l) => l.id === d.activeLayerId) + 1, adjust: { ...DEFAULT_ADJUST } })}><Plus size={11} /> Adjustment</Btn>
        {A?.link && <div className="w-full"><LayerLinkTools doc={d} L={A} /></div>}
        <Btn onClick={() => d.exec({ k: 'mergeVisible' })}>Merge visible</Btn>
        <Btn onClick={() => d.exec({ k: 'flattenCopy', newId: uid('L') })}>Flatten a copy</Btn>
      </div>
      {eff && (
        <div className="pt-1">
          {([['hue', 'Hue', -180, 180, 1], ['sat', 'Saturation', 0, 3, 0.01], ['bright', 'Brightness', 0, 3, 0.01], ['contrast', 'Contrast', 0, 3, 0.01], ['invert', 'Invert', 0, 1, 0.01], ['gray', 'Grayscale', 0, 1, 0.01], ['sepia', 'Sepia', 0, 1, 0.01], ['blur', 'Blur', 0, 30, 0.5]] as [keyof AdjustParams, string, number, number, number][]).map(([k, lab, mn, mx, st]) => (
            <div key={k} onPointerUp={commitAdj} onKeyUp={commitAdj}>
              <Slider label={lab} value={eff[k]} min={mn} max={mx} step={st} fmt={(v) => (st < 1 ? v.toFixed(2) : String(Math.round(v)))} onChange={(v) => setAdj(k, v)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ================================================================ comic studio
const STYLES: BalloonStyle[] = ['speech', 'thought', 'narration', 'shout', 'whisper', 'angular'];
const FXK: ComicFxKind[] = ['speed', 'focus', 'impact', 'burst', 'tone', 'gradient', 'hatch', 'cross', 'sweat', 'shock', 'emphasis'];
const FXL: Record<ComicFxKind, string> = { speed: 'Speed / motion lines', focus: 'Focus lines', impact: 'Radial impact', burst: 'Impact burst', tone: 'Screen tone', gradient: 'Manga gradient', hatch: 'Hatching', cross: 'Crosshatching', sweat: 'Sweat drops', shock: 'Shock marks', emphasis: 'Emphasis / sparkle' };

function comicPages(id: string) {
  return getApp().docs.filter((x) => x.comic?.id === id).sort((a, b) => a.comic!.index - b.comic!.index);
}
function makePage(name: string, cid: string, index: number, w: number, h: number, bleed: number, safe: number, layout: string, gutter: number) {
  const doc = new DocEngine(w, h, { name: `${name} – p${index + 1}` });
  doc.comic = { id: cid, name, index, bleed, safe, pageName: `Page ${index + 1}` };
  doc.layers[0] = { ...doc.layers[0], name: 'Art', panelClip: true };
  const C = doc.makeLayer('comic', 'Panels & Lettering');
  C.comic = layoutPanels(layout, { w, h, bleed, safe }, gutter);
  doc.layers.push(C);
  doc.activeLayerId = doc.layers[0].id;
  return doc;
}

export async function saveComic(cid: string) {
  const pages = comicPages(cid);
  if (!pages.length) return;
  try {
    const bytes = await serializeComic(pages[0].comic!.name, pages);
    download(new Blob([bytes as BlobPart], { type: 'application/x-carbon-comic' }), pages[0].comic!.name.replace(/[\\/:*?"<>|]+/g, '_') + '.carboncomic');
    pages.forEach((p) => { p.dirty = false; p.emit(); });
    toast(`Comic saved (${pages.length} pages, ${(bytes.length / 1048576).toFixed(1)} MB)`, 'success');
  } catch (e) { toast('Comic save failed: ' + (e instanceof Error ? e.message : e), 'error'); }
}

async function exportComic(cid: string, fmt: 'png' | 'zip' | 'pdf', scale: number, trim: boolean, only?: DocEngine) {
  const pages = only ? [only] : comicPages(cid);
  const name = pages[0].comic!.name.replace(/[\\/:*?"<>|]+/g, '_');
  const render = (p: DocEngine) => {
    const full = compositeDoc(p, scale, true);
    if (!trim) return full;
    const b = Math.round(p.comic!.bleed * scale);
    const c = createCanvas(full.width - b * 2, full.height - b * 2);
    ctxOf(c).drawImage(full, -b, -b);
    return c;
  };
  try {
    if (fmt === 'png') {
      const c = render(pages[0]);
      download(await canvasToBlob(c, 'image/png'), `${name}-${pages[0].comic!.pageName}.png`);
    } else if (fmt === 'zip') {
      const files: Record<string, Uint8Array> = {};
      for (let i = 0; i < pages.length; i++) files[`${name}-${String(i + 1).padStart(3, '0')}.png`] = new Uint8Array(await (await canvasToBlob(render(pages[i]), 'image/png')).arrayBuffer());
      download(new Blob([zipSync(files, { level: 0 }) as BlobPart], { type: 'application/zip' }), `${name}-pages.zip`);
    } else {
      const out = [];
      for (const p of pages) {
        const c = render(p);
        const jpeg = new Uint8Array(await (await canvasToBlob(c, 'image/jpeg', 0.92)).arrayBuffer());
        const dpi = 300 * scale;
        out.push({ jpeg, w: c.width, h: c.height, wPt: (c.width / dpi) * 72, hPt: (c.height / dpi) * 72 });
      }
      download(new Blob([makePdf(out) as BlobPart], { type: 'application/pdf' }), `${name}.pdf`);
    }
    toast(`Exported ${pages.length} page${pages.length > 1 ? 's' : ''} as ${fmt.toUpperCase()}`, 'success');
  } catch (e) { toast('Export failed: ' + (e instanceof Error ? e.message : e), 'error'); }
}

function PageThumb({ d }: { d: DocEngine }) {
  const [url, setUrl] = useState('');
  useEffect(() => { const t = setTimeout(() => setUrl(compositeDoc(d, Math.min(1, 90 / d.height)).toDataURL()), 250); return () => clearTimeout(t); }, [d, d.rev]);
  return <div className="flex h-[90px] w-16 items-center justify-center bg-neutral-800">{url && <img src={url} alt="" className="max-h-full max-w-full" />}</div>;
}

function NewComicForm() {
  const [name, setName] = useState('My Comic');
  const [preset, setPreset] = useState(PAGE_PRESETS[0].id);
  const [layout, setLayout] = useState('manga');
  const [pages, setPages] = useState(4);
  const [bleed, setBleed] = useState(38);
  const [safe, setSafe] = useState(75);
  const [gutter, setGutter] = useState(30);
  const [landscape, setLandscape] = useState(false);
  const create = () => {
    const p = PAGE_PRESETS.find((x) => x.id === preset)!;
    const w = landscape ? p.h : p.w, h = landscape ? p.w : p.h;
    const cid = uid('comic-');
    let first: DocEngine | null = null;
    for (let i = 0; i < Math.max(1, Math.min(200, pages)); i++) {
      const d = makePage(name, cid, i, w, h, bleed, safe, layout, gutter);
      d.dirty = true;
      addDoc(d);
      first = first || d;
    }
    if (first) setApp({ activeId: first.id });
    setTool('comic');
    toast(`Created “${name}” with ${pages} pages`, 'success');
  };
  return (
    <div className="space-y-1 text-[11px]">
      <label className="block text-neutral-400">Title<input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.stopPropagation()} className="mt-0.5 w-full rounded bg-neutral-900 px-2 py-1 text-neutral-100 outline-none ring-1 ring-white/10" /></label>
      <Select label="Page" value={preset} onChange={setPreset} options={PAGE_PRESETS.map((p) => ({ value: p.id, label: `${p.name}` }))} />
      <Select label="Template" value={layout} onChange={setLayout} options={LAYOUTS.map((l) => ({ value: l.id, label: l.name }))} />
      <div className="grid grid-cols-2 gap-1">
        <label className="text-neutral-500">Pages<NumInput value={pages} min={1} max={200} onChange={setPages} /></label>
        <label className="text-neutral-500">Gutter px<NumInput value={gutter} min={0} max={200} onChange={setGutter} /></label>
        <label className="text-neutral-500">Bleed px<NumInput value={bleed} min={0} max={300} onChange={setBleed} /></label>
        <label className="text-neutral-500">Safe px<NumInput value={safe} min={0} max={400} onChange={setSafe} /></label>
      </div>
      <Toggle label="Landscape pages" checked={landscape} onChange={setLandscape} />
      <Btn variant="primary" className="w-full py-1.5" onClick={create}><FilePlus2 size={12} /> Create comic project</Btn>
    </div>
  );
}

function ObjectEditor({ o }: { o: ComicObject }) {
  const up = (p: Partial<ComicObject>) => updateComicObject(o.id, p);
  const d = activeDoc()!;
  const all = comicObjects(d);
  if (o.type === 'panel') {
    const pnl = o as ComicPanel;
    return (
      <div className="space-y-1">
        <PanelCapture panel={pnl} />
        <Slider label="Border" value={pnl.border} min={0} max={40} step={0.5} fmt={(v) => v + 'px'} onChange={(v) => up({ border: v })} />
        <Slider label="Corner radius" value={pnl.radius} min={0} max={120} step={1} fmt={(v) => v + 'px'} onChange={(v) => up({ radius: v })} />
        <div className="flex items-center gap-2"><span className="text-neutral-500">Border color</span><input type="color" value={pnl.color} onChange={(e) => up({ color: e.target.value })} /><Toggle label="Fill" checked={!!pnl.fill} onChange={(v) => up({ fill: v ? '#ffffff' : null })} /></div>
      </div>
    );
  }
  if (o.type === 'balloon') {
    const b = o as ComicBalloon;
    return (
      <div className="space-y-1">
        <textarea value={b.text} onChange={(e) => up({ text: e.target.value })} onKeyDown={(e) => e.stopPropagation()} rows={3} className="w-full rounded bg-neutral-900 p-1.5 text-[12px] text-neutral-100 outline-none ring-1 ring-white/10" aria-label="Balloon text" />
        <div className="grid grid-cols-3 gap-1">{STYLES.map((s) => <Btn key={s} active={b.style === s} onClick={() => up({ style: s, tail: s === 'narration' ? null : b.tail || { x: b.x + b.w * 0.3, y: b.y + b.h * 1.4 } })}>{s}</Btn>)}</div>
        <Select label="Font" value={b.font} onChange={(v) => up({ font: v })} options={[
          { value: '"Comic Neue", "Comic Sans MS", "Chalkboard SE", "Segoe Print", sans-serif', label: 'Comic hand' },
          { value: '"Anime Ace", "Bangers", Impact, "Arial Black", sans-serif', label: 'Display / SFX' },
          { value: '"Segoe UI", Inter, system-ui, sans-serif', label: 'Clean sans' },
          { value: 'Georgia, "Times New Roman", serif', label: 'Serif (narration)' },
          { value: '"Yu Gothic", "Meiryo", "MS Gothic", "Noto Sans JP", sans-serif', label: 'Japanese gothic' },
        ]} />
        <Slider label="Size" value={b.size} min={8} max={200} step={1} fmt={(v) => v + 'px'} onChange={(v) => up({ size: v })} />
        <Slider label="Line spacing" value={b.lineH} min={0.8} max={2.5} step={0.05} fmt={(v) => v.toFixed(2)} onChange={(v) => up({ lineH: v })} />
        <Slider label="Letter spacing" value={b.letterSp} min={-4} max={20} step={0.5} fmt={(v) => v + 'px'} onChange={(v) => up({ letterSp: v })} />
        <Slider label="Padding" value={b.pad} min={0} max={80} step={1} fmt={(v) => v + 'px'} onChange={(v) => up({ pad: v })} />
        <Slider label="Outline" value={b.strokeW} min={0} max={14} step={0.5} fmt={(v) => v + 'px'} onChange={(v) => up({ strokeW: v })} />
        <div className="flex flex-wrap gap-1">
          {(['left', 'center', 'right'] as const).map((a) => <Btn key={a} active={b.align === a} onClick={() => up({ align: a })}>{a}</Btn>)}
          <Btn active={b.bold} onClick={() => up({ bold: !b.bold })}>B</Btn>
          <Btn active={b.italic} onClick={() => up({ italic: !b.italic })}>I</Btn>
          <Btn active={b.vertical} onClick={() => up({ vertical: !b.vertical })}>Vertical</Btn>
          <Btn active={!!b.tail} onClick={() => up({ tail: b.tail ? null : { x: b.x + b.w * 0.3, y: b.y + b.h * 1.4 } })}>Tail</Btn>
        </div>
        <div className="flex items-center gap-2 text-neutral-500">Fill<input type="color" value={b.fill} onChange={(e) => up({ fill: e.target.value })} />Line<input type="color" value={b.stroke} onChange={(e) => up({ stroke: e.target.value })} />Text<input type="color" value={b.color} onChange={(e) => up({ color: e.target.value })} /></div>
        <Select label="Connect to" value={b.link || ''} onChange={(v) => up({ link: v || null })} options={[{ value: '', label: 'None' }, ...all.filter((x) => x.type === 'balloon' && x.id !== b.id).map((x) => ({ value: x.id, label: '“' + (x as ComicBalloon).text.slice(0, 18) + '”' }))]} />
      </div>
    );
  }
  const f = o as ComicFx;
  return (
    <div className="space-y-1">
      <Select label="Effect" value={f.kind} onChange={(v) => up({ kind: v })} options={FXK.map((k) => ({ value: k, label: FXL[k] }))} />
      <Slider label="Density" value={f.density} min={0.02} max={1} onChange={(v) => up({ density: v })} />
      <Slider label="Scale" value={f.scale} min={0.2} max={8} step={0.1} fmt={(v) => v.toFixed(1)} onChange={(v) => up({ scale: v })} />
      <Slider label="Angle" value={f.angle} min={-180} max={180} step={1} fmt={(v) => v + '°'} onChange={(v) => up({ angle: v })} />
      <Slider label="Contrast / fade" value={f.contrast} min={0} max={1} onChange={(v) => up({ contrast: v })} />
      <Slider label="Opacity" value={f.opacity} min={0.05} max={1} onChange={(v) => up({ opacity: v })} />
      <div className="flex items-center gap-2 text-neutral-500">Color<input type="color" value={f.color} onChange={(e) => up({ color: e.target.value })} /><Btn onClick={() => up({ seed: Math.floor(Math.random() * 1e9) })}>Re-roll</Btn></div>
    </div>
  );
}

export function ComicPanel() {
  useApp((s) => s.tick);
  const c = useWin((s) => s.comic);
  const d = activeDoc();
  const [scale, setScale] = useState(1);
  const [trim, setTrim] = useState(false);
  const [layout, setLayout] = useState('6panel');
  if (!d?.comic) {
    return (
      <div className="space-y-2 text-[11px]">
        <p className="text-neutral-400">Create a multi-page comic project. Each page has its own layers, panels, balloons and manga effects, all editable.</p>
        <NewComicForm />
      </div>
    );
  }
  const cm = d.comic;
  const pages = comicPages(cm.id);
  const objs = comicObjects(d);
  const sel = objs.find((o) => o.id === c.selected);
  const setMode = (mode: ComicMode) => { setWin({ comic: { ...c, mode } }); setTool('comic'); };
  const reindex = (list: DocEngine[]) => list.forEach((p, i) => { if (p.comic!.index !== i) { p.comic = { ...p.comic!, index: i }; p.dirty = true; p.emit(); } });
  return (
    <div className="space-y-2 text-[11px]">
      <div className="flex items-center justify-between"><span className="font-medium text-neutral-200">{cm.name}</span><span className="text-neutral-500">{pages.length} pages · {d.width}×{d.height}</span></div>
      <div className="flex gap-1 overflow-x-auto pb-1">
        {pages.map((p) => (
          <button key={p.id} onClick={() => setApp({ activeId: p.id })} className={cn('shrink-0 rounded border p-0.5 text-center', p.id === d.id ? 'border-[#E8913A]' : 'border-white/10 hover:border-white/30')}>
            <PageThumb d={p} />
            <div className="w-16 truncate text-[9px] text-neutral-400">{p.comic!.pageName}{p.dirty ? ' •' : ''}</div>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1">
        <Select value={layout} onChange={setLayout} options={LAYOUTS.map((l) => ({ value: l.id, label: l.name }))} />
        <Btn onClick={() => { const np = makePage(cm.name, cm.id, pages.length, d.width, d.height, cm.bleed, cm.safe, layout, c.gutter); np.dirty = true; addDoc(np); }}><Plus size={11} /> Page</Btn>
        <Btn onClick={async () => { const n = await deserializeDoc(await serializeDoc(d)); n.comic = { ...cm, index: pages.length, pageName: cm.pageName + ' copy' }; n.meta.uuid = uid('cbn-'); n.meta.lineage = ''; n.name = d.name + ' copy'; n.dirty = true; addDoc(n, false); }}><Copy size={11} /></Btn>
        <Btn disabled={pages.indexOf(d) <= 0} onClick={() => { const l = [...pages]; const i = l.indexOf(d); [l[i - 1], l[i]] = [l[i], l[i - 1]]; reindex(l); setApp({ tick: getApp().tick + 1 }); }}>◀</Btn>
        <Btn disabled={pages.indexOf(d) >= pages.length - 1} onClick={() => { const l = [...pages]; const i = l.indexOf(d); [l[i + 1], l[i]] = [l[i], l[i + 1]]; reindex(l); setApp({ tick: getApp().tick + 1 }); }}>▶</Btn>
        <Btn disabled={pages.length <= 1} onClick={async () => { const r = await confirmDialog('Delete page?', `“${cm.pageName}” and its artwork will be removed from the project.`, [{ label: 'Cancel', value: 'n' }, { label: 'Delete', value: 'y', variant: 'danger' }]); if (r === 'y') { await closeDoc(d.id, true); reindex(comicPages(cm.id)); } }}><Trash2 size={11} /></Btn>
      </div>
      <input value={cm.pageName} onChange={(e) => { d.comic = { ...cm, pageName: e.target.value }; d.dirty = true; d.emit(); }} onKeyDown={(e) => e.stopPropagation()} className="w-full rounded bg-neutral-900 px-2 py-1 text-neutral-200 outline-none ring-1 ring-white/10" aria-label="Page name" />
      <Btn onClick={async () => { const r = await confirmDialog('Replace panels?', 'Apply the selected template to this page? Existing panels are replaced (undoable). Balloons and effects stay.', [{ label: 'Cancel', value: 'n' }, { label: 'Apply', value: 'y', variant: 'primary' }]); if (r === 'y') setComicObjects(d, [...objs.filter((o) => o.type !== 'panel'), ...layoutPanels(layout, { w: d.width, h: d.height, bleed: cm.bleed, safe: cm.safe }, c.gutter, c.border)], 'Apply panel template'); }}>Apply template to page</Btn>

      <SectionTitle>Tools</SectionTitle>
      <div className="grid grid-cols-3 gap-1">
        {([['select', 'Select / edit'], ['panel-rect', 'Rect panel'], ['panel-poly', 'Polygon panel'], ['panel-free', 'Freeform panel'], ['balloon', 'Balloon'], ['fx', 'Effect']] as [ComicMode, string][]).map(([m, l]) => <Btn key={m} active={c.mode === m} onClick={() => setMode(m)}>{l}</Btn>)}
      </div>
      {c.mode === 'balloon' && <Select label="Style" value={c.style} onChange={(v) => setWin({ comic: { ...c, style: v } })} options={STYLES.map((s) => ({ value: s, label: s }))} />}
      {c.mode === 'fx' && <Select label="Effect" value={c.fx} onChange={(v) => setWin({ comic: { ...c, fx: v } })} options={FXK.map((k) => ({ value: k, label: FXL[k] }))} />}
      <div className="grid grid-cols-2 gap-1">
        <label className="text-neutral-500">Gutter<NumInput value={c.gutter} min={0} max={200} onChange={(v) => setWin({ comic: { ...c, gutter: v } })} /></label>
        <label className="text-neutral-500">Border<NumInput value={c.border} min={0} max={40} onChange={(v) => setWin({ comic: { ...c, border: v } })} /></label>
      </div>
      <p className="text-[10px] text-neutral-500">{c.mode === 'panel-poly' ? 'Click vertices; click the first point or double-click to close.' : c.mode === 'select' ? 'Click to select, drag to move, drag handles to resize. The tail and vertex handles reshape. Delete removes.' : 'Drag on the page to create.'}</p>

      {sel && (
        <>
          <SectionTitle>Selected {sel.type === 'fx' ? 'effect' : sel.type}</SectionTitle>
          <ObjectEditor o={sel} />
          <div className="flex flex-wrap gap-1">
            <Btn onClick={() => { const cp = { ...sel, id: uid('cx-') } as ComicObject; const moved = cp.type === 'panel' ? { ...cp, pts: cp.pts.map((v) => v + 30) } : { ...cp, x: cp.x + 30, y: cp.y + 30 }; setComicObjects(d, [...objs, moved as ComicObject], 'Duplicate'); }}><Copy size={11} /> Duplicate</Btn>
            <Btn onClick={() => setComicObjects(d, [...objs.filter((o) => o.id !== sel.id), sel], 'Bring to front')}>Front</Btn>
            <Btn onClick={() => setComicObjects(d, [sel, ...objs.filter((o) => o.id !== sel.id)], 'Send to back')}>Back</Btn>
            <Btn onClick={() => { setComicObjects(d, objs.filter((o) => o.id !== sel.id), 'Delete'); setWin({ comic: { ...c, selected: null } }); }}><Trash2 size={11} /></Btn>
          </div>
        </>
      )}

      <SectionTitle>Save &amp; export</SectionTitle>
      <div className="flex flex-wrap gap-1">
        <Btn variant="primary" onClick={() => saveComic(cm.id)}><Download size={11} /> Save .carboncomic</Btn>
        <Btn onClick={() => exportComic(cm.id, 'png', scale, trim, d)}>Page PNG</Btn>
        <Btn onClick={() => exportComic(cm.id, 'zip', scale, trim)}>All pages (ZIP)</Btn>
        <Btn onClick={() => exportComic(cm.id, 'pdf', scale, trim)}>PDF</Btn>
      </div>
      <Select label="Resolution" value={String(scale)} onChange={(v) => setScale(+v)} options={[0.5, 1, 1.5, 2].map((s) => ({ value: String(s), label: `${s}× (${Math.round(d.width * s)}×${Math.round(d.height * s)})` }))} />
      <Toggle label="Trim bleed on export" checked={trim} onChange={setTrim} />
    </div>
  );
}

// ================================================================ brush market & library manager
function PackPreview({ b }: { b: BrushParams }) {
  const [u, setU] = useState('');
  useEffect(() => { const id = setTimeout(() => setU(brushPreview(b, 160, 40)), 30); return () => clearTimeout(id); }, [b]);
  return <div className="h-10 w-full overflow-hidden rounded bg-neutral-950/70">{u && <img src={u} alt="" className="h-full w-full object-cover" />}</div>;
}

export function BrushMarket() {
  const s = useApp();
  const packs = useWin((x) => x.packs);
  const view = useWin((x) => x.libView);
  const [tab, setTab] = useState<'market' | 'library'>('market');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('All');
  const [limit, setLimit] = useState(60);
  const installedIds = new Set(packs.map((p) => p.id));
  const cats = ['All', ...Array.from(new Set(CATALOG.map((p) => p.category)))];
  const install = (id: string) => { const d = CATALOG.find((p) => p.id === id)!; setWin({ packs: [...packs.filter((p) => p.id !== id), { id, name: d.name, version: d.version, source: 'catalog', category: d.category }] }); toast(`Installed “${d.name}” (${d.brushes().length} brushes)`, 'success'); };
  const uninstall = (id: string) => { setWin({ packs: packs.filter((p) => p.id !== id) }); toast('Pack uninstalled'); };
  const lib = allBrushes(s).map((b) => ({ ...b, ...(s.overrides[b.id] || {}) }));
  const filteredLib = lib.filter((b) => (cat === 'All' || b.category === cat || b.category.includes(cat)) && (!q || (b.name + ' ' + b.tags.join(' ') + ' ' + b.category).toLowerCase().includes(q.toLowerCase())));
  const importPack = async () => {
    const f = await pickFile('.carbonpack,.carbonbrush,.json');
    if (!f) return;
    try {
      const { pack, duplicates, warnings } = parsePack(await f.text(), allBrushes(getApp()));
      setWin({ packs: [...packs.filter((p) => p.id !== pack.id), pack] });
      toast(`Imported “${pack.name}”: ${pack.brushes!.length} brushes${duplicates ? `, ${duplicates} duplicates skipped` : ''}`, 'success');
      warnings.slice(0, 3).forEach((w) => toast(w, 'error'));
    } catch (e) { toast('Import failed: ' + (e instanceof Error ? e.message : e), 'error'); }
  };
  return (
    <div className="absolute inset-0 overflow-y-auto bg-[#141416] p-6 text-neutral-200">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-lg font-semibold">Brush Library</h1>
          <div className="flex gap-1"><Btn active={tab === 'market'} onClick={() => setTab('market')}>Market (local catalog)</Btn><Btn active={tab === 'library'} onClick={() => setTab('library')}>My library · {lib.length}</Btn></div>
          <div className="ml-auto flex items-center gap-1 rounded-md border border-white/10 bg-neutral-900 px-2"><Search size={12} className="text-neutral-500" /><input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.stopPropagation()} placeholder="Search…" className="w-48 bg-transparent py-1.5 text-xs outline-none" /></div>
          <Btn onClick={importPack}><Upload size={11} /> Import pack</Btn>
        </div>
        <div className="rounded-md border border-sky-500/20 bg-sky-500/5 px-3 py-2 text-[11px] text-sky-200">This catalog ships with CARBON and installs offline. No online brush service is connected, so nothing is downloaded. Packs are plain JSON brush data: they can't run code and are validated on import.</div>
        <div className="flex flex-wrap gap-1">{cats.map((c) => <Btn key={c} active={cat === c} onClick={() => setCat(c)}>{c}</Btn>)}</div>
        {tab === 'market' ? (
          <>
            <div className="flex gap-2"><Btn variant="primary" onClick={() => setWin({ packs: [...packs.filter((p) => p.source === 'import'), ...CATALOG.map((d) => ({ id: d.id, name: d.name, version: d.version, source: 'catalog' as const, category: d.category }))] })}>Install all packs</Btn><span className="self-center text-[11px] text-neutral-500">{CATALOG.reduce((a, p) => a + p.brushes().length, 0)} catalog brushes · {lib.length} in your library</span></div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {CATALOG.filter((p) => (cat === 'All' || p.category === cat) && (!q || (p.name + p.description + p.category).toLowerCase().includes(q.toLowerCase()))).map((p) => {
                const inst = packs.find((x) => x.id === p.id);
                const br = p.brushes();
                return (
                  <div key={p.id} className="space-y-2 rounded-xl border border-white/10 bg-white/[0.02] p-3">
                    <div className="flex items-start justify-between gap-2"><div><div className="text-sm font-medium">{p.name}</div><div className="text-[10px] uppercase tracking-wide text-neutral-500">{p.category} · {br.length} brushes · v{p.version}</div></div>
                      {inst ? <span className="flex items-center gap-1 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-300"><Check size={10} /> Installed v{inst.version}</span> : <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-neutral-400">Not installed</span>}</div>
                    <p className="text-[11px] text-neutral-400">{p.description}</p>
                    <div className="grid grid-cols-3 gap-1">{br.slice(0, 3).map((b) => <PackPreview key={b.id} b={b} />)}</div>
                    <div className="flex gap-1">
                      {!inst ? <Btn variant="primary" onClick={() => install(p.id)}><Download size={11} /> Install</Btn> : <>
                        {inst.version < p.version && <Btn variant="primary" onClick={() => install(p.id)}>Update</Btn>}
                        <Btn onClick={() => uninstall(p.id)}><Trash2 size={11} /> Uninstall</Btn>
                        <Btn onClick={() => { setTab('library'); setCat(p.category); }}>Browse</Btn>
                      </>}
                    </div>
                  </div>
                );
              })}
            </div>
            {packs.filter((p) => p.source === 'import').length > 0 && (
              <div className="space-y-1"><SectionTitle>Imported packs</SectionTitle>
                {packs.filter((p) => p.source === 'import').map((p) => (
                  <div key={p.id} className="flex items-center gap-2 rounded border border-white/10 px-3 py-2 text-xs"><span className="flex-1">{p.name} <span className="text-neutral-500">· {p.brushes?.length} brushes · v{p.version}</span></span>
                    <Btn onClick={() => download(new Blob([exportPack(p.name, p.brushes || [])], { type: 'application/json' }), p.name + '.carbonpack')}><Download size={11} /></Btn>
                    <Btn onClick={() => uninstall(p.id)}><Trash2 size={11} /> Uninstall</Btn></div>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <Btn active={view === 'grid'} onClick={() => setWin({ libView: 'grid' })}>Grid</Btn><Btn active={view === 'list'} onClick={() => setWin({ libView: 'list' })}>List</Btn>
              <span className="text-[11px] text-neutral-500">{filteredLib.length} brushes</span>
              <Btn className="ml-auto" onClick={() => setApp({ dialog: 'fusion' })}><Sparkles size={11} /> Brush Fusion…</Btn>
              <Btn onClick={() => download(new Blob([exportPack('My CARBON brushes', s.customBrushes)], { type: 'application/json' }), 'my-carbon-brushes.carbonpack')}><Download size={11} /> Export my presets</Btn>
            </div>
            <div className={view === 'grid' ? 'grid gap-2 sm:grid-cols-3 lg:grid-cols-5' : 'space-y-1'}>
              {filteredLib.slice(0, limit).map((b) => <LibItem key={b.id} b={b} grid={view === 'grid'} active={b.id === s.brushId} fav={s.favorites.includes(b.id)} modified={!!s.overrides[b.id]} />)}
            </div>
            {filteredLib.length > limit && <Btn onClick={() => setLimit(limit + 90)}>Show more ({filteredLib.length - limit} remaining)</Btn>}
          </>
        )}
        {installedIds.size === 0 && tab === 'market' && <p className="text-[11px] text-neutral-500">Tip: install packs to grow your library past 500 distinct brushes.</p>}
      </div>
    </div>
  );
}

function LibItem({ b, grid, active, fav, modified }: { b: BrushParams; grid: boolean; active: boolean; fav: boolean; modified: boolean }) {
  const [edit, setEdit] = useState(false);
  const custom = !b.builtin;
  const st = getApp();
  return (
    <div className={cn('group rounded-lg border p-2 text-[11px]', active ? 'border-[#E8913A]/60 bg-[#E8913A]/10' : 'border-white/10 hover:border-white/25', !grid && 'flex items-center gap-3')}>
      <div className={grid ? '' : 'w-40 shrink-0'} onClick={() => selectBrush(b.id)}><PackPreview b={b} /></div>
      <div className="min-w-0 flex-1">
        {edit && custom ? (
          <input autoFocus defaultValue={b.name} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} onBlur={(e) => { setApp({ customBrushes: st.customBrushes.map((x) => (x.id === b.id ? { ...x, name: e.target.value || x.name } : x)) }); setEdit(false); }} className="w-full rounded bg-neutral-900 px-1 text-white outline-none ring-1 ring-[#E8913A]/50" />
        ) : <div className="truncate pt-1 text-neutral-200" title={b.description}>{b.name}</div>}
        <div className="truncate text-[9px] uppercase tracking-wide text-neutral-500">{custom ? 'Custom' : b.category} · {b.mode} · engine v{b.version}{modified ? ' · modified' : ''}</div>
      </div>
      <div className="mt-1 flex gap-1">
        <button title="Use" onClick={() => selectBrush(b.id)} className="text-neutral-400 hover:text-white"><Brush size={12} /></button>
        <button title="Favorite" onClick={() => setApp({ favorites: fav ? st.favorites.filter((x) => x !== b.id) : [...st.favorites, b.id] })} className={fav ? 'text-[#E8913A]' : 'text-neutral-500 hover:text-white'}><Star size={12} fill={fav ? 'currentColor' : 'none'} /></button>
        <button title="Duplicate as custom preset" onClick={() => { const nb = { ...brushById(b.id)!, id: uid('cb-'), name: b.name + ' Copy', builtin: false }; setApp({ customBrushes: [...st.customBrushes, nb] }); toast(`Created “${nb.name}”`, 'success'); }} className="text-neutral-500 hover:text-white"><Copy size={12} /></button>
        {custom && <button title="Rename" onClick={() => setEdit(true)} className="text-neutral-500 hover:text-white"><PaletteIcon size={12} /></button>}
        {modified && <button title="Reset to defaults" onClick={() => { const o = { ...st.overrides }; delete o[b.id]; setApp({ overrides: o }); }} className="text-neutral-500 hover:text-white"><RotateCcw size={12} /></button>}
        {custom && <button title="Delete" onClick={() => setApp({ customBrushes: st.customBrushes.filter((x) => x.id !== b.id) })} className="text-neutral-500 hover:text-red-400"><Trash2 size={12} /></button>}
      </div>
    </div>
  );
}
