import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { zipSync } from 'fflate';
import jsQR from 'jsqr';
import QRCode from 'qrcode';
import { Box, Brush, Check, CloudDownload, Copy, Download, Eye, FilePlus2, HardDrive, Layers3, MessageSquare, Palette as PaletteIcon, Plus, QrCode, RefreshCw, RotateCcw, Search, ShieldCheck, Sparkles, Star, Trash2, Upload, Wand2, X } from 'lucide-react';
import { activeDoc, allBrushes, brushById, confirmDialog, getApp, selectBrush, setApp, setTool, toast, updateSettings, useApp } from '../state/store';
import { BrushStudio } from '../components/Brushes';
import { addDoc, closeDoc, pickFile } from '../state/actions';
import { DocEngine, pxToCanvas } from '../engine/document';
import { compositeDoc, DEFAULT_ADJUST } from '../engine/render';
import { FILTERS, fxById, runFx, scaleParams } from '../engine/filters';
import { LAYOUTS, layoutPanels, makePdf, PAGE_PRESETS } from '../engine/comic';
import { CATALOG, DEFAULT_MAX_BRUSH_PACK_BYTES, MAX_BRUSH_PACK_BYTES, exportPack, parsePack, type InstalledPack, type PackDef } from '../engine/brushPacks';
import { ENGINE_VERSION } from '../engine/brushes';
import { ensureStamp, missingStamps } from '../engine/tips';
import {
  configuredRemoteCatalogUrl, downloadRemoteBrushPack, fetchRemoteAssetCatalog, formatAssetSize,
  listStoredBrushPacks, measureBrushDefinitionBytes, measureBrushPackBytes, megabytesToBytes,
  removeStoredBrushPack, storeBrushPackAsset, type RemoteBrushPack, type StoredBrushPack,
} from '../engine/assetStore';
import { storageEstimate } from '../engine/persist';
import { MAX_BRUSH_QR_BYTES, makeBrushQrPayload, parseBrushQrPayload } from '../engine/brushQR';
import { brushPreview } from '../engine/strokeRenderer';
import { serializeComic, serializeDoc, deserializeDoc } from '../engine/fileFormat';
import { canvasToBlob, createCanvas, ctxOf, download, hexToRgb, isHex, normHex, rgbToHex, uid } from '../engine/util';
import type { AdjustParams, BalloonStyle, BrushParams, ComicBalloon, ComicFx, ComicFxKind, ComicObject, ComicPanel } from '../engine/types';
import { comicObjects, GRADIENT_PRESETS, liqCancel, liqCommit, liqReset, removeImportedBrushFromPack, setComicObjects, setWin, updateComicObject, useWin, type ComicMode, type Workspace } from './WinOverlay';
import { Btn, Modal, NumInput, SectionTitle, Select, Slider, Toggle } from '../components/ui';
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
        <Btn onClick={async () => { const n = await deserializeDoc(await serializeDoc(d)); n.comic = { ...cm, index: pages.length, pageName: cm.pageName + ' copy' }; n.meta.uuid = uid('cbn-'); n.meta.lineage = ''; n.name = d.name + ' copy'; n.dirty = true; addDoc(n); }}><Copy size={11} /></Btn>
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

type MarketTab = 'market' | 'library' | 'storage' | 'lab' | 'eraser';
type MarketCard = {
  id: string;
  installId: string;
  name: string;
  category: string;
  version: number;
  description: string;
  creator: string | null;
  license: string | null;
  featured: boolean;
  source: 'bundled' | 'remote';
  sizeBytes: number;
  brushes?: BrushParams[];
  remote?: RemoteBrushPack;
};

function errorText(error: unknown) { return error instanceof Error ? error.message : String(error); }

export function BrushMarket() {
  const s = useApp();
  const packs = useWin((x) => x.packs);
  const view = useWin((x) => x.libView);
  const [tab, setTab] = useState<MarketTab>('market');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('All');
  const [libCat, setLibCat] = useState('All');
  const [sort, setSort] = useState<'featured' | 'name' | 'brushes' | 'size'>('featured');
  const [limit, setLimit] = useState(60);
  const [assets, setAssets] = useState<StoredBrushPack[]>([]);
  const [storageEstimateInfo, setStorageEstimateInfo] = useState<{ usage: number; quota: number } | null>(null);
  const [storageError, setStorageError] = useState('');
  const [remoteEntries, setRemoteEntries] = useState<RemoteBrushPack[]>([]);
  const [remoteState, setRemoteState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [remoteError, setRemoteError] = useState('');
  const [downloadProgress, setDownloadProgress] = useState<Record<string, { loaded: number; total: number }>>({});
  const [downloadErrors, setDownloadErrors] = useState<Record<string, string>>({});
  const [qrBrush, setQrBrush] = useState<BrushParams | null>(null);
  const [qrImportOpen, setQrImportOpen] = useState(false);
  const catalogAbort = useRef<AbortController | null>(null);
  const downloadAborts = useRef(new Map<string, AbortController>());
  const remoteCatalogUrl = configuredRemoteCatalogUrl();
  const downloadLimitBytes = megabytesToBytes(s.settings.assetMaxDownloadMB);
  const installLimitBytes = megabytesToBytes(s.settings.assetMaxInstallMB);
  const installedBytes = assets.reduce((n, asset) => n + asset.sizeBytes, 0);
  const installedIds = new Set(packs.map((p) => p.id));
  const storedById = new Map(assets.map((a) => [a.packId, a]));

  const refreshAssetState = useCallback(async () => {
    try {
      const [items, estimate] = await Promise.all([listStoredBrushPacks(), storageEstimate()]);
      setAssets(items);
      setStorageEstimateInfo(estimate);
      setStorageError('');
    } catch (error) {
      setStorageError(errorText(error));
    }
  }, []);

  useEffect(() => {
    void refreshAssetState();
    const refresh = () => { void refreshAssetState(); };
    window.addEventListener('carbon-assets-changed', refresh);
    return () => {
      window.removeEventListener('carbon-assets-changed', refresh);
      catalogAbort.current?.abort();
      downloadAborts.current.forEach((controller) => controller.abort());
      downloadAborts.current.clear();
    };
  }, [refreshAssetState]);

  const bundledCards = useMemo<MarketCard[]>(() => CATALOG.map((def) => {
    const brushes = def.brushes();
    return {
      id: def.id, installId: def.id, name: def.name, category: def.category, version: def.version,
      description: def.description, creator: def.creator || null, license: def.license || null,
      featured: def.featured === true, source: 'bundled', sizeBytes: measureBrushPackBytes({ id: def.id, name: def.name, category: def.category, version: def.version, brushes }), brushes,
    };
  }), []);
  const remoteCards = useMemo<MarketCard[]>(() => remoteEntries.map((entry) => ({
    id: `remote:${entry.id}`, installId: `remote:${entry.id}`, name: entry.name, category: entry.category,
    version: entry.version, description: entry.description, creator: entry.creator, license: entry.license,
    featured: entry.featured, source: 'remote', sizeBytes: entry.sizeBytes, remote: entry,
  })), [remoteEntries]);
  const marketCards = [...bundledCards, ...remoteCards];
  const marketCategories = ['All', 'Featured', 'Installed', ...Array.from(new Set(marketCards.map((p) => p.category))).sort((a, b) => a.localeCompare(b))];
  const lib = allBrushes(s).map((b) => ({ ...b, ...(s.overrides[b.id] || {}) }));
  const libCategories = ['All', ...Array.from(new Set(lib.map((b) => b.category))).sort((a, b) => a.localeCompare(b))];
  const filteredLib = lib.filter((b) => (libCat === 'All' || b.category === libCat || b.category.includes(libCat)) && (!q || (b.name + ' ' + b.tags.join(' ') + ' ' + b.category + ' ' + b.description).toLowerCase().includes(q.toLowerCase())));
  const filteredCards = marketCards.filter((p) => {
    const inst = packs.find((x) => x.id === p.installId);
    const categoryMatch = cat === 'All' || (cat === 'Featured' ? p.featured : cat === 'Installed' ? !!inst : p.category === cat);
    const queryMatch = !q || (p.name + ' ' + p.description + ' ' + p.category + ' ' + (p.creator || '')).toLowerCase().includes(q.toLowerCase());
    return categoryMatch && queryMatch;
  }).sort((a, b) => {
    if (sort === 'featured' && a.featured !== b.featured) return a.featured ? -1 : 1;
    if (sort === 'size') return a.sizeBytes - b.sizeBytes || a.name.localeCompare(b.name);
    if (sort === 'brushes') {
      const count = (card: MarketCard) => packs.find((p) => p.id === card.installId)?.brushes?.length ?? card.brushes?.length ?? 0;
      return count(b) - count(a) || a.name.localeCompare(b.name);
    }
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });

  const refresh = async () => refreshAssetState();
  const checkCapacity = async (newSize: number, replaceId: string) => {
    let latest: StoredBrushPack[];
    let browserEstimate: { usage: number; quota: number } | null = null;
    try {
      const [items, estimate] = await Promise.all([listStoredBrushPacks(), storageEstimate()]);
      latest = items;
      browserEstimate = estimate;
      setAssets(items);
      setStorageEstimateInfo(estimate);
    } catch (error) { toast(`Asset storage is unavailable: ${errorText(error)}`, 'error'); return false; }
    const replacedSize = latest.find((asset) => asset.packId === replaceId)?.sizeBytes || 0;
    const otherBytes = latest.reduce((n, asset) => n + (asset.packId === replaceId ? 0 : asset.sizeBytes), 0);
    if (otherBytes + newSize > installLimitBytes) {
      toast(`Not installed: ${formatAssetSize(otherBytes)} is already used by other brush packs and this pack needs ${formatAssetSize(newSize)}; the configured limit is ${formatAssetSize(installLimitBytes)}.`, 'error');
      return false;
    }
    const estimate = browserEstimate;
    if (estimate && estimate.quota > 0 && Math.max(0, estimate.usage - replacedSize) + newSize > estimate.quota) {
      toast(`Not installed: the browser estimates this origin is near its ${formatAssetSize(estimate.quota)} storage quota. Export or remove unneeded data, or choose a smaller pack.`, 'error');
      return false;
    }
    return true;
  };

  const installBundled = async (def: PackDef, quiet = false) => {
    try {
      const current = useWin.getState().packs;
      const existing = current.find((p) => p.id === def.id);
      if (existing && existing.version >= def.version && !existing.missing) return true;
      const brushes = def.brushes();
      const size = measureBrushPackBytes({ id: def.id, name: def.name, category: def.category, version: def.version, brushes });
      if (!await checkCapacity(size, def.id)) return false;
      await storeBrushPackAsset({ id: def.id, name: def.name, category: def.category, version: def.version, source: 'catalog', brushes }, installLimitBytes);
      const next: InstalledPack = { id: def.id, name: def.name, version: def.version, source: 'catalog', category: def.category, brushes };
      setWin({ packs: [...useWin.getState().packs.filter((p) => p.id !== def.id), next] });
      await refresh();
      if (!quiet) toast(`Installed “${def.name}” · ${brushes.length} brushes · ${formatAssetSize(size)}`, 'success');
      return true;
    } catch (error) {
      if (!quiet) toast(`Install failed: ${errorText(error)}`, 'error');
      return false;
    }
  };

  const installAllBundled = async () => {
    const missing = CATALOG.filter((def) => !useWin.getState().packs.some((p) => p.id === def.id && p.version >= def.version && !p.missing));
    const estimate = missing.reduce((n, def) => n + measureBrushPackBytes({ id: def.id, name: def.name, category: def.category, version: def.version, brushes: def.brushes() }), 0);
    const answer = await confirmDialog('Install bundled brush packs?', `${missing.length} offline packs need about ${formatAssetSize(estimate)} of local storage. Existing user brushes and projects will not be changed.`, [
      { label: 'Cancel', value: 'n' }, { label: 'Install', value: 'y', variant: 'primary' },
    ]);
    if (answer !== 'y') return;
    let count = 0;
    for (const def of missing) if (await installBundled(def, true)) count++;
    toast(`${count} bundled packs installed or already current.`, count === missing.length ? 'success' : 'error');
  };

  const removePack = async (id: string) => {
    const current = useWin.getState().packs;
    const pack = current.find((p) => p.id === id);
    if (!pack) return;
    const answer = await confirmDialog(`Remove “${pack.name}”?`, 'Its brushes will stop appearing in the library; an active brush may fall back to the default. Strokes and settings already saved in existing artwork files are not edited. This does not remove custom brushes.', [
      { label: 'Keep pack', value: 'n' }, { label: 'Remove pack', value: 'y', variant: 'danger' },
    ]);
    if (answer !== 'y') return;
    try {
      await removeStoredBrushPack(id);
      setWin({ packs: useWin.getState().packs.filter((p) => p.id !== id) });
      await refresh();
      toast(`Removed “${pack.name}” from this device.`, 'success');
    } catch (error) { toast(`Could not remove pack: ${errorText(error)}`, 'error'); }
  };

  const importPack = async () => {
    const file = await pickFile('.carbonpack,.carbonbrush,.json');
    if (!file) return;
    if (file.size > downloadLimitBytes) {
      toast(`Import is ${formatAssetSize(file.size)}; the configured per-pack limit is ${formatAssetSize(downloadLimitBytes)}. Change it in Storage settings if you trust this file.`, 'error');
      return;
    }
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      const probe = parsePack(text, [], downloadLimitBytes);
      const existing = useWin.getState().packs.find((p) => p.id === probe.pack.id);
      const replacingBrushIds = new Set(existing?.brushes?.map((brush) => brush.id) || []);
      const { pack, duplicates, warnings } = parsePack(text, allBrushes(getApp()).filter((brush) => !replacingBrushIds.has(brush.id)), downloadLimitBytes);
      if (existing) {
        const answer = await confirmDialog(`Replace “${existing.name}”?`, 'A pack with this ID is already installed. Replacing it keeps other packs and all artwork files unchanged.', [
          { label: 'Cancel', value: 'n' }, { label: 'Replace pack', value: 'y', variant: 'primary' },
        ]);
        if (answer !== 'y') return;
      }
      const size = measureBrushPackBytes({ id: pack.id, name: pack.name, category: pack.category, version: pack.version, brushes: pack.brushes || [] });
      if (!await checkCapacity(size, pack.id)) return;
      await storeBrushPackAsset({ ...pack, source: 'import', brushes: pack.brushes || [], downloadBytes: file.size }, installLimitBytes);
      setWin({ packs: [...useWin.getState().packs.filter((p) => p.id !== pack.id), pack] });
      await refresh();
      toast(`Imported “${pack.name}”: ${pack.brushes!.length} brushes · ${formatAssetSize(size)} installed${duplicates ? ` · ${duplicates} duplicate brushes skipped` : ''}`, 'success');
      warnings.slice(0, 3).forEach((warning) => toast(warning, 'error'));
    } catch (error) { toast(`Import failed: ${errorText(error)}`, 'error'); }
  };

  const importQrPayload = async (payload: string): Promise<string | null> => {
    try {
      const probe = parseBrushQrPayload(payload, [], MAX_BRUSH_QR_BYTES);
      if (useWin.getState().packs.some((pack) => pack.id === probe.pack.id)) return 'A pack with this ID is already installed. Remove it in Marketplace first; QR import will not replace packs silently.';
      const { pack, duplicates, warnings } = parseBrushQrPayload(payload, allBrushes(getApp()), MAX_BRUSH_QR_BYTES);
      const size = measureBrushPackBytes({ id: pack.id, name: pack.name, category: pack.category, version: pack.version, brushes: pack.brushes || [] });
      if (!await checkCapacity(size, pack.id)) return 'The pack was not installed because a configured storage limit or browser quota was reached.';
      await storeBrushPackAsset({ ...pack, source: 'import', brushes: pack.brushes || [], downloadBytes: new TextEncoder().encode(payload).byteLength }, installLimitBytes);
      setWin({ packs: [...useWin.getState().packs.filter((item) => item.id !== pack.id), pack] });
      const firstImportedBrush = pack.brushes?.[0];
      if (firstImportedBrush) {
        if (getApp().tool === 'eraser') setTool('brush');
        selectBrush(firstImportedBrush.id);
      }
      await refresh();
      toast(`Imported and selected a brush from QR pack “${pack.name}” · ${pack.brushes?.length || 0} brushes${duplicates ? ` · ${duplicates} duplicates skipped` : ''}`, 'success');
      warnings.slice(0, 3).forEach((warning) => toast(warning, 'error'));
      return null;
    } catch (error) { return errorText(error); }
  };

  const loadRemoteCatalog = async () => {
    if (!remoteCatalogUrl) return;
    catalogAbort.current?.abort();
    const controller = new AbortController();
    catalogAbort.current = controller;
    setRemoteState('loading'); setRemoteError('');
    try {
      const entries = await fetchRemoteAssetCatalog(remoteCatalogUrl, { signal: controller.signal });
      setRemoteEntries(entries);
      setRemoteState('ready');
      toast(`Validated ${entries.length} remote catalog entries. Packs are not downloaded until you choose one.`, 'success');
    } catch (error) {
      if (controller.signal.aborted) { setRemoteState('idle'); return; }
      setRemoteError(errorText(error)); setRemoteState('error');
    }
  };

  const installRemote = async (entry: RemoteBrushPack, retry = false) => {
    const id = `remote:${entry.id}`;
    const controller = new AbortController();
    downloadAborts.current.set(id, controller);
    setDownloadErrors((state) => ({ ...state, [id]: '' }));
    setDownloadProgress((state) => ({ ...state, [id]: { loaded: 0, total: entry.sizeBytes } }));
    try {
      const rawBytes = await downloadRemoteBrushPack(entry, remoteCatalogUrl, downloadLimitBytes, {
        signal: controller.signal,
        onProgress: ({ loadedBytes }) => setDownloadProgress((state) => ({ ...state, [id]: { loaded: loadedBytes, total: entry.sizeBytes } })),
      });
      const text = new TextDecoder('utf-8', { fatal: true }).decode(rawBytes);
      const oldPack = useWin.getState().packs.find((pack) => pack.id === id);
      const replacingBrushIds = new Set(oldPack?.brushes?.map((brush) => brush.id) || []);
      const { pack: parsed, duplicates, warnings } = parsePack(text, allBrushes(getApp()).filter((brush) => !replacingBrushIds.has(brush.id)), downloadLimitBytes);
      if (parsed.name !== entry.name || parsed.category !== entry.category || parsed.version !== entry.version) {
        throw new Error('Downloaded pack metadata does not match the validated catalog entry.');
      }
      const pack: InstalledPack = { ...parsed, id, name: entry.name, category: entry.category, version: entry.version, source: 'remote' };
      const size = measureBrushPackBytes({ id, name: pack.name, category: pack.category, version: pack.version, brushes: pack.brushes || [] });
      if (!await checkCapacity(size, id)) return;
      await storeBrushPackAsset({ id, name: pack.name, category: pack.category, version: pack.version, source: 'remote', brushes: pack.brushes || [], downloadBytes: rawBytes.byteLength }, installLimitBytes);
      setWin({ packs: [...useWin.getState().packs.filter((p) => p.id !== id), pack] });
      setDownloadErrors((state) => ({ ...state, [id]: '' }));
      await refresh();
      toast(`Installed verified “${pack.name}” · ${pack.brushes?.length || 0} brushes · ${formatAssetSize(rawBytes.byteLength)} downloaded${duplicates ? ` · ${duplicates} duplicates skipped` : ''}`, 'success');
      warnings.slice(0, 3).forEach((warning) => toast(warning, 'error'));
    } catch (error) {
      if (controller.signal.aborted) toast(`Download ${retry ? 'retry ' : ''}canceled.`, 'info');
      else {
        const message = errorText(error);
        setDownloadErrors((state) => ({ ...state, [id]: message }));
        toast(`Remote pack install failed: ${message}`, 'error');
      }
    } finally {
      downloadAborts.current.delete(id);
      setDownloadProgress((state) => { const next = { ...state }; delete next[id]; return next; });
    }
  };

  const removeOrphan = async (asset: StoredBrushPack) => {
    const answer = await confirmDialog(`Remove stored “${asset.name}”?`, `This asset is not registered as installed. Its ${formatAssetSize(asset.sizeBytes)} stored bytes will be removed. User artwork and other assets are untouched.`, [
      { label: 'Cancel', value: 'n' }, { label: 'Remove bytes', value: 'y', variant: 'danger' },
    ]);
    if (answer !== 'y') return;
    try { await removeStoredBrushPack(asset.packId); await refresh(); toast('Orphaned asset removed.', 'success'); }
    catch (error) { toast(`Could not clean asset: ${errorText(error)}`, 'error'); }
  };

  return (
    <div className="absolute inset-0 overflow-y-auto bg-[#141416] p-6 text-neutral-200">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-lg font-semibold">Brushes & Assets</h1>
          <div className="flex gap-1">
            <Btn active={tab === 'market'} onClick={() => setTab('market')}>Marketplace</Btn>
            <Btn active={tab === 'library'} onClick={() => setTab('library')}>My library · {lib.length}</Btn>
            <Btn active={tab === 'storage'} onClick={() => setTab('storage')}><HardDrive size={11} /> Storage · {assets.length}</Btn>
            <Btn active={tab === 'lab'} onClick={() => setTab('lab')}><Brush size={11} /> Brush Lab</Btn>
            <Btn active={tab === 'eraser'} onClick={() => setTab('eraser')}><Trash2 size={11} /> Custom Erasers</Btn>
          </div>
          {tab !== 'storage' && tab !== 'lab' && tab !== 'eraser' && <div className="ml-auto flex items-center gap-1 rounded-md border border-white/10 bg-neutral-900 px-2"><Search size={12} className="text-neutral-500" /><input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.stopPropagation()} placeholder="Search…" className="w-48 bg-transparent py-1.5 text-xs outline-none" /></div>}
          {tab === 'library' && <Btn onClick={importPack}><Upload size={11} /> Import pack</Btn>}
          {tab === 'market' && <Btn onClick={importPack}><Upload size={11} /> Import pack</Btn>}
        </div>

        {tab === 'market' && (
          <>
            <div className="rounded-md border border-sky-500/20 bg-sky-500/5 px-3 py-2 text-[11px] text-sky-100">
              <div className="flex flex-wrap items-center gap-2"><ShieldCheck size={14} className="text-sky-300" /><strong>Local-first brush marketplace</strong><span className="text-sky-200/80">Bundled packs install offline. JSON imports are validated; imported data cannot execute code.</span></div>
              {remoteCatalogUrl ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="text-neutral-300">Optional remote source configured · HTTPS + same-origin assets + SHA-256 verification.</span>
                  <Btn disabled={remoteState === 'loading'} onClick={loadRemoteCatalog}><RefreshCw size={11} className={remoteState === 'loading' ? 'animate-spin' : ''} />{remoteState === 'loading' ? 'Checking…' : remoteState === 'ready' ? 'Refresh remote catalog' : 'Check remote catalog'}</Btn>
                  {remoteState === 'loading' && <Btn onClick={() => catalogAbort.current?.abort()}><X size={11} /> Cancel</Btn>}
                  {remoteState === 'ready' && <span className="text-emerald-300">{remoteEntries.length} validated entries; no assets downloaded yet.</span>}
                  {remoteState === 'error' && <span className="text-red-300">Remote catalog unavailable: {remoteError}</span>}
                </div>
              ) : <div className="mt-1 text-sky-200/80">No remote catalog is configured in this build. Online browsing/downloads are unavailable; there is no fake download or popularity data. Set <code>VITE_CARBON_ASSET_CATALOG_URL</code> only when a real HTTPS catalog and assets are hosted.</div>}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Btn variant="primary" onClick={installAllBundled}><Download size={11} /> Install all bundled packs</Btn>
              <span className="text-[11px] text-neutral-500">{CATALOG.length} offline packs · {bundledCards.reduce((n, p) => n + (p.brushes?.length || 0), 0)} generated brushes · engine v{ENGINE_VERSION}</span>
              <Select value={sort} onChange={(v) => setSort(v)} options={[{ value: 'featured', label: 'Featured first · curated' }, { value: 'name', label: 'Name' }, { value: 'brushes', label: 'Brush count' }, { value: 'size', label: 'Package size' }]} />
            </div>
            <div className="flex flex-wrap gap-1">{marketCategories.map((category) => <Btn key={category} active={cat === category} onClick={() => setCat(category)}>{category}</Btn>)}</div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredCards.map((card) => {
                const installed = packs.find((p) => p.id === card.installId);
                const existingAsset = storedById.get(card.installId);
                const previewBrushes = installed?.brushes?.length ? installed.brushes : card.brushes || [];
                const running = downloadProgress[card.installId];
                const downloadError = downloadErrors[card.installId];
                const currentSize = existingAsset?.sizeBytes ?? card.sizeBytes;
                return (
                  <div key={card.id} className="space-y-2 rounded-xl border border-white/10 bg-white/[0.02] p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0"><div className="flex flex-wrap items-center gap-1 text-sm font-medium">{card.name}{card.featured && <span className="rounded bg-amber-400/15 px-1 text-[9px] uppercase tracking-wide text-amber-200">Curated</span>}</div><div className="text-[10px] uppercase tracking-wide text-neutral-500">{card.category} · {previewBrushes.length || (card.remote ? 'preview after install' : 0)} brushes · v{card.version}</div></div>
                      {installed && !installed.missing ? <span className="flex shrink-0 items-center gap-1 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-300"><Check size={10} /> Installed v{installed.version}</span> : installed?.missing ? <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] text-red-300">Asset missing</span> : <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-neutral-400">Available</span>}
                    </div>
                    <p className="min-h-8 text-[11px] text-neutral-400">{card.description}</p>
                    <div className="text-[10px] text-neutral-500">{card.source === 'bundled' ? 'Bundled JSON package' : 'Remote download'} · {formatAssetSize(card.sizeBytes)} · free · brush engine v{ENGINE_VERSION}</div>
                    <div className="text-[10px] text-neutral-500">Creator: {card.creator || 'not provided'} · License: {card.license || 'not provided'}</div>
                    {previewBrushes.length ? <div className="grid grid-cols-3 gap-1">{previewBrushes.slice(0, 3).map((b) => <PackPreview key={b.id} b={b} />)}</div> : <div className="rounded bg-black/20 px-2 py-3 text-center text-[10px] text-neutral-500">No local preview asset yet; it will be shown only after the downloaded pack is validated and installed.</div>}
                    {installed && <div className="text-[10px] text-neutral-400">Installed payload: {formatAssetSize(currentSize)}{existingAsset?.downloadBytes !== null && existingAsset?.downloadBytes !== undefined ? ` · original transfer: ${formatAssetSize(existingAsset.downloadBytes)}` : ''}</div>}
                    {running && <div className="space-y-1"><div className="h-1.5 overflow-hidden rounded bg-white/10"><div className="h-full bg-[#E8913A]" style={{ width: `${Math.min(100, Math.max(0, running.loaded / Math.max(1, running.total) * 100))}%` }} /></div><div className="text-[10px] text-neutral-400">Downloading {formatAssetSize(running.loaded)} / {formatAssetSize(running.total)}</div></div>}
                    {downloadError && <div className="text-[10px] text-red-300">{downloadError}</div>}
                    <div className="flex flex-wrap gap-1">
                      {card.source === 'bundled' ? (
                        !installed || installed.missing || installed.version < card.version ? <Btn variant="primary" onClick={() => { const def = CATALOG.find((p) => p.id === card.installId); if (def) void installBundled(def); }}><Download size={11} /> {installed ? 'Repair / update' : 'Install offline'}</Btn> : <Btn onClick={() => setTab('library')}>Browse brushes</Btn>
                      ) : running ? <Btn onClick={() => downloadAborts.current.get(card.installId)?.abort()}><X size={11} /> Cancel download</Btn> : installed && !installed.missing && installed.version >= card.version ? <Btn onClick={() => setTab('library')}>Browse installed</Btn> : <Btn variant="primary" disabled={!remoteCatalogUrl || remoteState !== 'ready'} onClick={() => card.remote && void installRemote(card.remote, !!downloadError)}><CloudDownload size={11} />{downloadError ? 'Retry download' : 'Download & verify'}</Btn>}
                      {installed && <Btn variant="danger" onClick={() => void removePack(installed.id)}><Trash2 size={11} /> Remove</Btn>}
                    </div>
                  </div>
                );
              })}
            </div>
            {packs.filter((p) => p.source !== 'catalog').length > 0 && <div className="space-y-1"><SectionTitle>Installed imports and remote packs</SectionTitle>
              {packs.filter((p) => p.source !== 'catalog').map((pack) => {
                const stored = storedById.get(pack.id);
                return <div key={pack.id} className="flex flex-wrap items-center gap-2 rounded border border-white/10 px-3 py-2 text-xs"><span className="min-w-0 flex-1 truncate">{pack.name} <span className="text-neutral-500">· {pack.source} · {pack.brushes?.length || 0} brushes · v{pack.version} · {formatAssetSize(stored?.sizeBytes || 0)}</span></span>
                  <Btn onClick={() => download(new Blob([exportPack(pack.name, pack.brushes || [], pack.id, pack.category, pack.version)], { type: 'application/json' }), pack.name + '.carbonpack')}><Download size={11} /> Export</Btn>
                  <Btn onClick={() => { setTab('library'); setLibCat(pack.category); }}>Browse</Btn><Btn variant="danger" onClick={() => void removePack(pack.id)}><Trash2 size={11} /> Remove</Btn></div>;
              })}
            </div>}
          </>
        )}

        {tab === 'library' && (
          <>
            <div className="rounded-md border border-white/10 bg-white/[0.02] px-3 py-2 text-[10px] text-neutral-400">Brush definition sizes below are exact UTF-8 JSON byte counts for the exported definition, not compressed image sizes. Pack files and project artwork are stored separately.</div>
            <div className="flex flex-wrap items-center gap-2">
              <Btn active={view === 'grid'} onClick={() => setWin({ libView: 'grid' })}>Grid</Btn><Btn active={view === 'list'} onClick={() => setWin({ libView: 'list' })}>List</Btn>
              <span className="text-[11px] text-neutral-500">{filteredLib.length} brushes</span>
              <div className="min-w-[150px] flex-1"><Select value={libCat} onChange={setLibCat} options={libCategories.map((category) => ({ value: category, label: category }))} /></div>
              <Btn onClick={() => setQrImportOpen(true)}><QrCode size={11} /> Import QR</Btn>
              <Btn className="ml-auto" onClick={() => setApp({ dialog: 'fusion' })}><Sparkles size={11} /> Brush Fusion…</Btn>
              <Btn onClick={() => download(new Blob([exportPack('My CARBON brushes', s.customBrushes, 'my-carbon-brushes', 'Custom', 1)], { type: 'application/json' }), 'my-carbon-brushes.carbonpack')}><Download size={11} /> Export brushes</Btn>
              <Btn onClick={() => download(new Blob([exportPack('My CARBON eraser tips', s.customErasers, 'my-carbon-eraser-tips', 'Erasers', 1)], { type: 'application/json' }), 'my-carbon-eraser-tips.carbonpack')}><Download size={11} /> Export erasers</Btn>
            </div>
            <div className={view === 'grid' ? 'grid gap-2 sm:grid-cols-3 lg:grid-cols-5' : 'space-y-1'}>
              {filteredLib.slice(0, limit).map((b) => <LibItem key={b.id} b={b} grid={view === 'grid'} active={b.id === (s.tool === 'eraser' ? s.eraserBrushId : s.brushId)} fav={s.favorites.includes(b.id)} modified={!!s.overrides[b.id]} onQr={setQrBrush} />)}
            </div>
            {filteredLib.length > limit && <Btn onClick={() => setLimit(limit + 90)}>Show more ({filteredLib.length - limit} remaining)</Btn>}
          </>
        )}

        {tab === 'lab' && <BrushLab kind="brush" />}
        {tab === 'eraser' && <BrushLab kind="eraser" />}

        {tab === 'storage' && (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4"><div className="flex items-center gap-2 text-xs text-neutral-300"><HardDrive size={14} /> Installed brush packs</div><div className="mt-2 text-xl font-semibold">{formatAssetSize(installedBytes)}</div><div className="text-[10px] text-neutral-500">{assets.length} validated pack assets · exact stored JSON bytes</div></div>
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4"><div className="text-xs text-neutral-300">Browser origin storage</div><div className="mt-2 text-xl font-semibold">{storageEstimateInfo ? `${formatAssetSize(storageEstimateInfo.usage)} / ${formatAssetSize(storageEstimateInfo.quota)}` : 'Unavailable'}</div><div className="text-[10px] text-neutral-500">Browser-reported origin usage/quota; includes project data and settings, not OS free disk space.</div></div>
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4"><div className="text-xs text-neutral-300">Remote availability</div><div className="mt-2 text-sm font-semibold">{remoteCatalogUrl ? 'Optional endpoint configured' : 'No catalog configured'}</div><div className="text-[10px] text-neutral-500">{remoteCatalogUrl ? 'Nothing is fetched until you choose Check remote catalog.' : 'Bundled packs remain offline and available.'}</div></div>
            </div>
            {storageError && <div className="rounded border border-red-500/30 bg-red-500/5 p-2 text-xs text-red-200">Could not read the asset store: {storageError}</div>}
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
              <SectionTitle>Safety limits · apply to new imports/downloads</SectionTitle>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="text-[11px] text-neutral-300">Maximum per-pack import/download (MB)
                  <NumInput value={s.settings.assetMaxDownloadMB} min={1} max={MAX_BRUSH_PACK_BYTES / (1024 * 1024)} onChange={(value) => updateSettings({ assetMaxDownloadMB: Math.max(1, Math.min(MAX_BRUSH_PACK_BYTES / (1024 * 1024), Math.round(value || 1))) })} />
                  <span className="text-[10px] text-neutral-500">Default {DEFAULT_MAX_BRUSH_PACK_BYTES / (1024 * 1024)} MB · hard safety ceiling {MAX_BRUSH_PACK_BYTES / (1024 * 1024)} MB.</span>
                </label>
                <label className="text-[11px] text-neutral-300">Maximum installed brush-pack storage (MB)
                  <NumInput value={s.settings.assetMaxInstallMB} min={1} max={4096} onChange={(value) => updateSettings({ assetMaxInstallMB: Math.max(1, Math.min(4096, Math.round(value || 1))) })} />
                  <span className="text-[10px] text-neutral-500">Default 500 MB · existing assets are never silently removed if the limit is lowered.</span>
                </label>
              </div>
            </div>
            <div className="flex items-center justify-between"><div><SectionTitle>Installed assets</SectionTitle><div className="text-[10px] text-neutral-500">Downloads/import source bytes and installed normalized bytes are reported separately where known.</div></div><Btn onClick={() => void refreshAssetState()}><RefreshCw size={11} /> Refresh</Btn></div>
            {assets.length === 0 ? <p className="rounded border border-white/10 p-4 text-xs text-neutral-500">No brush packs are installed yet. Bundled assets are generated locally; install a pack from Marketplace to add it here.</p> : <div className="space-y-1">
              {assets.map((asset) => {
                const registered = packs.some((p) => p.id === asset.packId);
                let brushCount = packs.find((p) => p.id === asset.packId)?.brushes?.length;
                if (brushCount === undefined && asset.source === 'catalog') brushCount = CATALOG.find((p) => p.id === asset.packId)?.brushes().length;
                return <div key={asset.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
                  <div className="min-w-0 flex-1"><div className="truncate text-xs font-medium">{asset.name}{!registered && <span className="ml-2 text-amber-300">Unregistered stored asset</span>}</div><div className="text-[10px] text-neutral-500">{asset.category} · {brushCount ?? 'unknown'} brushes · {asset.source} · pack v{asset.version} · engine v{asset.engineVersion}</div></div>
                  <div className="text-right text-[10px] text-neutral-400">Installed {formatAssetSize(asset.sizeBytes)}{asset.downloadBytes !== null ? <div>Input/download {formatAssetSize(asset.downloadBytes)}</div> : <div>Bundled locally · no download</div>}</div>
                  <Btn onClick={() => download(new Blob([asset.bytes.slice().buffer as ArrayBuffer], { type: 'application/json' }), asset.name + '.carbonpack')}><Download size={11} /> Export</Btn>
                  {registered ? <Btn variant="danger" onClick={() => void removePack(asset.packId)}><Trash2 size={11} /> Remove</Btn> : <Btn variant="danger" onClick={() => void removeOrphan(asset)}><Trash2 size={11} /> Clean orphan</Btn>}
                </div>;
              })}
            </div>}
            <div className="text-[10px] text-neutral-500">Asset bytes are local to this installation. Removing a pack requires confirmation and does not rewrite artwork files; clearing browser/app storage outside CARBON can still remove local data.</div>
          </div>
        )}

        {installedIds.size === 0 && tab === 'market' && <p className="text-[11px] text-neutral-500">No packs installed yet. Built-in application brushes remain available; install any bundled pack offline to expand the library.</p>}
      </div>
      {qrBrush && <BrushQrDialog brush={qrBrush} onClose={() => setQrBrush(null)} />}
      {qrImportOpen && <BrushQrImportDialog onClose={() => setQrImportOpen(false)} onImport={importQrPayload} />}
    </div>
  );
}

function BrushLab({ kind = 'brush' }: { kind?: 'brush' | 'eraser' }) {
  const s = useApp();
  const isEraser = kind === 'eraser';
  const library = allBrushes(s).map((brush) => ({ ...brush, ...(s.overrides[brush.id] || {}) }));
  const initialId = isEraser ? s.eraserBrushId : s.brushId;
  const initial = brushById(initialId, s) || library[0];
  const savedPresets = isEraser ? s.customErasers : s.customBrushes;
  const [baseId, setBaseId] = useState(initial?.id || 'pencil-hb');
  const [draft, setDraft] = useState<BrushParams>(() => ({
    ...(initial || library[0]),
    id: uid('lab-'),
    name: `${initial?.name || 'Brush'} ${kind === 'eraser' ? 'Eraser' : 'Lab'}`,
    builtin: false,
    tags: [...(initial?.tags || ['custom'])],
  }));
  const [tagsText, setTagsText] = useState((initial?.tags || ['custom']).join(', '));
  const [collectionId, setCollectionId] = useState('');
  const [folderName, setFolderName] = useState('');
  const [query, setQuery] = useState('');
  const [savedId, setSavedId] = useState('');
  const visibleBases = library.filter((brush) => !query || `${brush.name} ${brush.category} ${brush.tags.join(' ')}`.toLowerCase().includes(query.toLowerCase())).slice(0, 80);
  const updateDraft = (patch: Partial<BrushParams>) => { setSavedId(''); setDraft((current) => ({ ...current, ...patch, builtin: false })); };

  const chooseBase = (id: string) => {
    const source = library.find((brush) => brush.id === id);
    if (!source) return;
    setBaseId(id);
    setDraft({ ...source, id: uid('lab-'), name: `${source.name} ${isEraser ? 'Eraser' : 'Lab'}`, builtin: false, tags: [...source.tags] });
    setTagsText(source.tags.join(', '));
    setSavedId('');
  };

  const createCollection = () => {
    const name = folderName.trim().slice(0, 40);
    if (!name) return toast('Enter a folder name first.', 'error');
    if (s.collections.some((item) => item.name.toLowerCase() === name.toLowerCase())) return toast('A folder with that name already exists.', 'error');
    const id = uid('col-');
    setApp({ collections: [...getApp().collections, { id, name, ids: [] }] });
    setCollectionId(id);
    setFolderName('');
    toast(`Created brush folder “${name}”.`, 'success');
  };

  const saveBrush = async () => {
    const name = draft.name.trim().slice(0, 60);
    const category = draft.category.trim().slice(0, 40) || 'Custom';
    const description = draft.description.trim().slice(0, 300);
    if (!name) return toast('Give this brush a name before saving.', 'error');
    const tags = [...new Set(tagsText.split(',').map((tag) => tag.trim().slice(0, 40)).filter(Boolean))].slice(0, 12);
    const current = getApp();
    const targetPresets = isEraser ? current.customErasers : current.customBrushes;
    const existing = savedId ? targetPresets.find((item) => item.id === savedId) : undefined;
    const brush: BrushParams = { ...draft, id: existing?.id || uid(isEraser ? 'ce-' : 'cb-'), name, category, description, tags, builtin: false, version: ENGINE_VERSION };
    if (brush.stamp && brush.stamp.length > 400_000) return toast('This stamp is too large for the current custom-brush storage format; use a smaller image.', 'error');
    if (brush.stamp) {
      await ensureStamp(brush.stamp);
      if (missingStamps.has(brush.stamp)) return toast('The brush stamp could not be decoded; it was not saved.', 'error');
    }
    const collections = current.collections.map((item) => {
      const ids = item.ids.filter((id) => id !== brush.id);
      return item.id === collectionId ? { ...item, ids: [...ids, brush.id] } : { ...item, ids };
    });
    const nextPresets = existing ? targetPresets.map((item) => item.id === existing.id ? brush : item) : [...targetPresets, brush];
    if (isEraser) setApp({ customErasers: nextPresets, collections });
    else setApp({ customBrushes: nextPresets, collections });
    setSavedId(brush.id);
    if (isEraser) { setTool('eraser'); selectBrush(brush.id); }
    toast(`Saved “${brush.name}” as a local custom ${isEraser ? 'eraser tip' : 'brush'} · ${formatAssetSize(measureBrushDefinitionBytes(brush))}`, 'success');
  };

  const forkSaved = (brush: BrushParams) => {
    setBaseId(brush.id);
    setDraft({ ...brush, id: uid('lab-'), name: `${brush.name} Variant`, tags: [...brush.tags], builtin: false });
    setTagsText(brush.tags.join(', '));
    setSavedId('');
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-base font-semibold">{isEraser ? 'Custom Eraser Studio' : 'Brush Lab'}</h2><p className="mt-1 max-w-2xl text-[11px] text-neutral-400">Edit an isolated draft with the actual Carbon brush engine and live preview, then save a separate local {isEraser ? 'eraser tip' : 'brush preset'}. The source asset is not changed.</p></div><Btn variant="primary" onClick={() => void saveBrush()}><Check size={12} /> {savedId ? `Update ${isEraser ? 'eraser tip' : 'brush'}` : `Save ${isEraser ? 'eraser tip' : 'custom brush'}`}</Btn></div>
      <div className="grid items-start gap-4 xl:grid-cols-[250px_minmax(360px,1fr)_260px]">
        <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.02] p-3">
          <SectionTitle>Start from a brush</SectionTitle>
          <input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.stopPropagation()} placeholder="Search brushes…" className="w-full rounded border border-white/10 bg-neutral-900 px-2 py-1.5 text-xs text-white outline-none" />
          <Select label="Base" value={baseId} onChange={chooseBase} options={visibleBases.map((brush) => ({ value: brush.id, label: `${brush.name} · ${brush.category}` }))} />
          <div className="text-[10px] text-neutral-500">Showing up to 80 matching brushes. Choosing a base copies its current parameters into an isolated draft.</div>
          <SectionTitle>Preset details</SectionTitle>
          <label className="block text-[10px] text-neutral-400">Category<input value={draft.category} maxLength={40} onChange={(event) => updateDraft({ category: event.target.value })} className="mt-1 w-full rounded border border-white/10 bg-neutral-900 px-2 py-1.5 text-xs text-white outline-none" /></label>
          <label className="block text-[10px] text-neutral-400">Description<textarea value={draft.description} maxLength={300} onChange={(event) => updateDraft({ description: event.target.value })} rows={4} className="mt-1 w-full resize-y rounded border border-white/10 bg-neutral-900 px-2 py-1.5 text-xs text-white outline-none" /></label>
          <label className="block text-[10px] text-neutral-400">Tags · comma separated<input value={tagsText} onChange={(event) => { setTagsText(event.target.value); updateDraft({ tags: event.target.value.split(',').map((tag) => tag.trim().slice(0, 40)).filter(Boolean).slice(0, 12) }); }} className="mt-1 w-full rounded border border-white/10 bg-neutral-900 px-2 py-1.5 text-xs text-white outline-none" /></label>
          <Select label="Folder" value={collectionId} onChange={setCollectionId} options={[{ value: '', label: 'No folder' }, ...s.collections.map((item) => ({ value: item.id, label: item.name }))]} />
          <div className="flex gap-1"><input value={folderName} maxLength={40} onChange={(event) => setFolderName(event.target.value)} onKeyDown={(event) => { event.stopPropagation(); if (event.key === 'Enter') createCollection(); }} placeholder="New folder name" className="min-w-0 flex-1 rounded border border-white/10 bg-neutral-900 px-2 py-1 text-[10px] text-white outline-none" /><Btn onClick={createCollection}><Plus size={11} /> Folder</Btn></div>
          <div className="rounded bg-black/20 p-2 text-[10px] text-neutral-500">Draft JSON definition: {formatAssetSize(measureBrushDefinitionBytes(draft))} · Brush engine v{ENGINE_VERSION}</div>
          {savedId && <div className="rounded border border-emerald-500/20 bg-emerald-500/5 p-2 text-[10px] text-emerald-300">Saved locally. Continue editing this draft or fork the saved brush from My custom brushes.</div>}
        </div>
        <div className="min-w-0 rounded-xl border border-white/10 bg-white/[0.02] p-3"><BrushStudio draft={draft} onDraftChange={updateDraft} /></div>
        <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.02] p-3">
          <SectionTitle>{isEraser ? 'My custom eraser tips' : 'My custom brushes'} · {savedPresets.length}</SectionTitle>
          {!savedPresets.length && <p className="text-[10px] text-neutral-500">Saved {isEraser ? 'eraser tips' : 'presets'} will appear here.</p>}
          <div className="max-h-[70vh] space-y-1 overflow-y-auto">{[...savedPresets].reverse().map((brush) => <div key={brush.id} className="flex items-center gap-1 rounded border border-white/5 px-2 py-1.5"><button onClick={() => { if (isEraser) { setTool('eraser'); selectBrush(brush.id); } else selectBrush(brush.id); }} title={isEraser ? 'Use eraser tip' : 'Use brush'} className="min-w-0 flex-1 truncate text-left text-[10px] text-neutral-200">{brush.name}<span className="block truncate text-[9px] text-neutral-500">{brush.category} · {formatAssetSize(measureBrushDefinitionBytes(brush))}</span></button><Btn title="Edit a new variant; original stays unchanged" onClick={() => forkSaved(brush)}><Copy size={10} /> Fork</Btn></div>)}</div>
        </div>
      </div>
    </div>
  );
}

function BrushQrDialog({ brush, onClose }: { brush: BrushParams; onClose: () => void }) {
  const [imageUrl, setImageUrl] = useState('');
  const [payload, setPayload] = useState('');
  const [error, setError] = useState('');
  const [shareBusy, setShareBusy] = useState(false);

  useEffect(() => {
    let live = true;
    try {
      const text = makeBrushQrPayload({ id: `share-${brush.id}`, name: brush.name, category: brush.category, brushes: [brush], version: 1 });
      setPayload(text);
      void QRCode.toDataURL(text, { errorCorrectionLevel: 'M', margin: 3, width: 384, color: { dark: '#151515FF', light: '#FFFFFFFF' } })
        .then((url) => { if (live) { setImageUrl(url); setError(''); } })
        .catch((reason: unknown) => { if (live) setError(errorText(reason)); });
    } catch (reason) {
      setImageUrl(''); setPayload(''); setError(errorText(reason));
    }
    return () => { live = false; };
  }, [brush]);

  const savePng = () => {
    try {
      const encoded = imageUrl.split(',')[1];
      if (!encoded) throw new Error('QR image is not ready.');
      const bytes = Uint8Array.from(atob(encoded), (value) => value.charCodeAt(0));
      download(new Blob([bytes.buffer as ArrayBuffer], { type: 'image/png' }), `${brush.name.replace(/[^a-z0-9_-]+/gi, '-').slice(0, 50) || 'carbon-brush'}.png`);
    } catch (reason) { toast(`Could not save QR image: ${errorText(reason)}`, 'error'); }
  };

  const copyPayload = async () => {
    try { await navigator.clipboard.writeText(payload); toast('QR payload copied locally.', 'success'); }
    catch (reason) { toast(`Clipboard unavailable: ${errorText(reason)}`, 'error'); }
  };

  const sharePayload = async () => {
    if (!navigator.share) { toast('Device text sharing is not available here; save the QR PNG instead.', 'info'); return; }
    setShareBusy(true);
    try { await navigator.share({ title: `Carbon brush: ${brush.name}`, text: payload }); }
    catch (reason) { if (!(reason instanceof DOMException && reason.name === 'AbortError')) toast(`Share chooser failed: ${errorText(reason)}`, 'error'); }
    finally { setShareBusy(false); }
  };

  return (
    <Modal title={`Share brush as QR · ${brush.name}`} width={560} onClose={onClose} footer={<Btn onClick={onClose}>Close</Btn>}>
      <div className="space-y-3">
        {error ? <div className="rounded border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-200">{error}<p className="mt-2 text-neutral-400">Brushes containing stamp images or payloads over {MAX_BRUSH_QR_BYTES} bytes should be shared as a validated .carbonpack file.</p></div> : imageUrl ? <div className="flex justify-center rounded-lg bg-white p-3"><img src={imageUrl} width={320} height={320} alt={`Local QR code for brush ${brush.name}`} /></div> : <div className="p-8 text-center text-xs text-neutral-500">Preparing QR locally…</div>}
        {payload && <div className="text-[10px] text-neutral-500">Carbon brush QR v1 · {new TextEncoder().encode(payload).byteLength} bytes · contains brush parameters only · no network request.</div>}
        <p className="text-xs text-neutral-400">The PNG can be scanned or chosen as an image on another Carbon installation. Share opens the operating-system chooser; Carbon does not upload the brush. Only choose a destination you trust.</p>
        <div className="flex flex-wrap gap-2"><Btn disabled={!imageUrl} variant="primary" onClick={savePng}><Download size={12} /> Save QR PNG</Btn><Btn disabled={!payload} onClick={() => void copyPayload()}>Copy payload</Btn><Btn disabled={!payload || shareBusy} onClick={() => void sharePayload()}>Share text…</Btn></div>
      </div>
    </Modal>
  );
}

function BrushQrImportDialog({ onClose, onImport }: { onClose: () => void; onImport: (payload: string) => Promise<string | null> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const processingRef = useRef(false);
  const onImportRef = useRef(onImport);
  onImportRef.current = onImport;

  const consumePayload = async (payload: string) => {
    if (processingRef.current) return;
    processingRef.current = true;
    setBusy(true); setError('');
    try {
      const reason = await onImportRef.current(payload);
      if (reason) setError(reason);
      else onClose();
    } catch (reason) { setError(errorText(reason)); }
    finally { setBusy(false); processingRef.current = false; }
  };

  const chooseQrImage = async () => {
    const file = await pickFile('image/png,image/jpeg,image/webp');
    if (!file) return;
    if (file.size > 16 * 1024 * 1024) { setError('QR image exceeds the 16 MB input safety limit.'); return; }
    setBusy(true); setError('');
    let bitmap: ImageBitmap | null = null;
    try {
      bitmap = await createImageBitmap(file);
      if (bitmap.width * bitmap.height > 40_000_000) throw new Error('Image dimensions exceed the QR scan safety limit.');
      const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('Image decoder is unavailable.');
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      const decoded = jsQR(pixels.data, pixels.width, pixels.height, { inversionAttempts: 'attemptBoth' });
      if (!decoded) throw new Error('No readable QR code was found in that image.');
      await consumePayload(decoded.data);
    } catch (reason) { setError(errorText(reason)); }
    finally { bitmap?.close(); setBusy(false); }
  };

  return (
    <Modal title="Import a Carbon brush QR" width={560} onClose={onClose} footer={<Btn onClick={onClose} disabled={busy}>Close</Btn>}>
      <div className="space-y-3">
        <p className="text-xs text-neutral-400">No camera is used. Choose a PNG, JPEG or WebP image containing a Carbon brush QR code; it is scanned locally and the brush is added to your Imported section. Arbitrary URLs are never opened.</p>
        <div className="flex flex-wrap gap-2"><Btn disabled={busy} variant="primary" onClick={() => void chooseQrImage()}><QrCode size={12} /> Scan QR image</Btn></div>
        {busy && <div className="text-xs text-neutral-400">Validating brush data…</div>}
        {error && <div role="alert" className="rounded border border-red-500/30 bg-red-500/5 p-2 text-xs text-red-200">{error}</div>}
        <div className="text-[10px] text-neutral-500">QR payloads are limited to {MAX_BRUSH_QR_BYTES} UTF-8 bytes. Packs containing stamp images or larger brush sets should use .carbonpack files. The selected image is decoded locally and is not sent to a server.</div>
      </div>
    </Modal>
  );
}

function LibItem({ b, grid, active, fav, modified, onQr }: { b: BrushParams; grid: boolean; active: boolean; fav: boolean; modified: boolean; onQr?: (brush: BrushParams) => void }) {
  const [edit, setEdit] = useState(false);
  const custom = !b.builtin;
  const st = getApp();
  const customEraser = st.customErasers.some((brush) => brush.id === b.id);
  const importedPack = useWin.getState().packs.find((pack) => pack.source !== 'catalog' && pack.brushes?.some((brush) => brush.id === b.id));
  return (
    <div className={cn('group rounded-lg border p-2 text-[11px]', active ? 'border-[#E8913A]/60 bg-[#E8913A]/10' : 'border-white/10 hover:border-white/25', !grid && 'flex items-center gap-3')}>
      <div className={grid ? '' : 'w-40 shrink-0'} onClick={() => selectBrush(b.id)}><PackPreview b={b} /></div>
      <div className="min-w-0 flex-1">
        {edit && custom ? (
          <input autoFocus defaultValue={b.name} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} onBlur={(e) => { setApp({ customBrushes: st.customBrushes.map((x) => (x.id === b.id ? { ...x, name: e.target.value || x.name } : x)), customErasers: st.customErasers.map((x) => (x.id === b.id ? { ...x, name: e.target.value || x.name } : x)) }); setEdit(false); }} className="w-full rounded bg-neutral-900 px-1 text-white outline-none ring-1 ring-[#E8913A]/50" />
        ) : <div className="truncate pt-1 text-neutral-200" title={b.description}>{b.name}</div>}
        <div className="truncate text-[9px] uppercase tracking-wide text-neutral-500">{customEraser ? 'Custom Eraser' : importedPack ? 'Imported' : custom ? 'Custom' : b.category} · {b.mode} · engine v{b.version}{modified ? ' · modified' : ''}</div>
        <div className="text-[9px] text-neutral-600">{formatAssetSize(measureBrushDefinitionBytes(b))} JSON definition</div>
      </div>
      <div className="mt-1 flex gap-1">
        <button title="Use" onClick={() => selectBrush(b.id)} className="text-neutral-400 hover:text-white"><Brush size={12} /></button>
        <button title="Favorite" onClick={() => setApp({ favorites: fav ? st.favorites.filter((x) => x !== b.id) : [...st.favorites, b.id] })} className={fav ? 'text-[#E8913A]' : 'text-neutral-500 hover:text-white'}><Star size={12} fill={fav ? 'currentColor' : 'none'} /></button>
        {onQr && !customEraser && <button title="Create a local QR brush share" onClick={() => onQr(b)} className="text-neutral-500 hover:text-white"><QrCode size={12} /></button>}
        <button title={customEraser ? 'Duplicate as custom eraser tip' : 'Duplicate as custom preset'} onClick={() => { const nb = { ...brushById(b.id)!, id: uid(customEraser ? 'ce-' : 'cb-'), name: b.name + ' Copy', builtin: false }; if (customEraser) setApp({ customErasers: [...st.customErasers, nb] }); else setApp({ customBrushes: [...st.customBrushes, nb] }); toast(`Created “${nb.name}”`, 'success'); }} className="text-neutral-500 hover:text-white"><Copy size={12} /></button>
        {custom && <button title="Rename" onClick={() => setEdit(true)} className="text-neutral-500 hover:text-white"><PaletteIcon size={12} /></button>}
        {modified && <button title="Reset to defaults" onClick={() => { const o = { ...st.overrides }; delete o[b.id]; setApp({ overrides: o }); }} className="text-neutral-500 hover:text-white"><RotateCcw size={12} /></button>}
        {custom && <button title={importedPack ? 'Remove brush from imported pack' : customEraser ? 'Delete custom eraser tip' : 'Delete custom brush'} onClick={async () => {
          const answer = await confirmDialog(`Delete “${b.name}”?`, importedPack
            ? `Only this brush will be removed from “${importedPack.name}”; its other brushes and existing artwork remain unchanged.`
            : 'The custom preset will be removed from this device. Existing artwork strokes are not changed.', [
            { label: 'Keep', value: 'n' }, { label: 'Delete', value: 'y', variant: 'danger' },
          ]);
          if (answer !== 'y') return;
          try {
            if (importedPack) await removeImportedBrushFromPack(b.id);
            else {
              const latest = getApp();
              const overrides = { ...latest.overrides }; delete overrides[b.id];
              setApp({ customBrushes: latest.customBrushes.filter((x) => x.id !== b.id), customErasers: latest.customErasers.filter((x) => x.id !== b.id), overrides, favorites: latest.favorites.filter((x) => x !== b.id), recentBrushes: latest.recentBrushes.filter((x) => x !== b.id), collections: latest.collections.map((collection) => ({ ...collection, ids: collection.ids.filter((x) => x !== b.id) })), brushId: latest.brushId === b.id ? 'pencil-hb' : latest.brushId, eraserBrushId: latest.eraserBrushId === b.id ? 'eraser-hard' : latest.eraserBrushId });
            }
            toast(`Deleted “${b.name}”`, 'success');
          } catch (error) { toast(`Could not remove brush: ${errorText(error)}`, 'error'); }
        }} className="text-neutral-500 hover:text-red-400"><Trash2 size={12} /></button>}
      </div>
    </div>
  );
}
