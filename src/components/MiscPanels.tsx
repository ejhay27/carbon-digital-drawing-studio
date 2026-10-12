import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Maximize, Pipette, Scan, Trash2, X } from 'lucide-react';
import { activeDoc, currentBrush, getApp, setApp, setColor, toast, updateBrush, updateSettings, updateToolOpts, useApp } from '../state/store';
import { emitCanvas, fitView, rotateView, setZoom, viewport } from '../state/commands';
import { compositeDoc } from '../engine/render';
import { blobToDataURL, fmtBytes, fmtTime, invM, mapPt, rgbToHex, uid, viewMatrix } from '../engine/util';
import { idbAll, idbDel, idbPut, storageEstimate, type RefEntry } from '../engine/persist';
import { pickFile } from '../state/actions';
import { Btn, NumInput, SectionTitle, Select, Slider, Toggle } from './ui';
import { cn } from '../utils/cn';

export function HistoryPanel() {
  useApp((s) => s.tick);
  const doc = activeDoc();
  if (!doc) return <div className="text-[11px] text-neutral-500">No document open.</div>;
  const u = doc.undoStack, r = doc.redoStack;
  const go = (target: number) => {
    let guard = 500;
    while (doc.undoStack.length > target && guard--) doc.undo();
    while (doc.undoStack.length < target && doc.redoStack.length && guard--) doc.redo();
  };
  return (
    <div className="max-h-[260px] space-y-px overflow-y-auto text-[11px]">
      <button onClick={() => go(0)} className={cn('w-full rounded px-2 py-1 text-left', u.length === 0 ? 'bg-white/10 text-white' : 'text-neutral-400 hover:bg-white/5')}>Start of history</button>
      {u.map((x, i) => (
        <button key={'u' + i} onClick={() => go(i + 1)} className={cn('w-full truncate rounded px-2 py-1 text-left', i === u.length - 1 ? 'bg-[#E8913A]/15 text-white' : 'text-neutral-300 hover:bg-white/5')}>{x.label}</button>
      ))}
      {[...r].reverse().map((x, i) => (
        <button key={'r' + i} onClick={() => go(u.length + i + 1)} className="w-full truncate rounded px-2 py-1 text-left italic text-neutral-600 hover:bg-white/5">{x.label}</button>
      ))}
      <div className="px-2 pt-1 text-[10px] text-neutral-600">Keeps up to {doc.undoLimit} steps; older steps are released to save memory.</div>
    </div>
  );
}

export function Navigator() {
  useApp((s) => s.tick);
  const doc = activeDoc();
  const ref = useRef<HTMLCanvasElement>(null);
  const [thumb, setThumb] = useState<HTMLCanvasElement | null>(null);
  const rev = doc?.rev;
  useEffect(() => {
    if (!doc) return;
    const t = setTimeout(() => setThumb(compositeDoc(doc, Math.min(1, 256 / Math.max(doc.width, doc.height)))), 350);
    return () => clearTimeout(t);
  }, [doc, rev]);
  useEffect(() => {
    const c = ref.current;
    if (!c || !doc || !thumb) return;
    c.width = thumb.width; c.height = thumb.height;
    const x = c.getContext('2d')!;
    x.drawImage(thumb, 0, 0);
    const k = thumb.width / doc.width;
    const im = invM(viewMatrix(doc.view, doc.width, doc.height));
    const pts = [[0, 0], [viewport.w, 0], [viewport.w, viewport.h], [0, viewport.h]].map(([a, b]) => mapPt(im, a, b));
    x.strokeStyle = '#E8913A';
    x.lineWidth = 2;
    x.beginPath();
    pts.forEach(([a, b], i) => (i ? x.lineTo(a * k, b * k) : x.moveTo(a * k, b * k)));
    x.closePath();
    x.stroke();
  });
  if (!doc) return <div className="text-[11px] text-neutral-500">No document open.</div>;
  const nav = (e: React.PointerEvent) => {
    const c = ref.current!;
    const r = c.getBoundingClientRect();
    const dx = ((e.clientX - r.left) / r.width) * doc.width, dy = ((e.clientY - r.top) / r.height) * doc.height;
    const [sx, sy] = mapPt(viewMatrix(doc.view, doc.width, doc.height), dx, dy);
    doc.view = { ...doc.view, panX: doc.view.panX + viewport.w / 2 - sx, panY: doc.view.panY + viewport.h / 2 - sy };
    doc.emit();
  };
  return (
    <div className="space-y-2">
      <canvas ref={ref} className="mx-auto block max-h-48 max-w-full cursor-crosshair touch-none rounded border border-white/10" onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); nav(e); }} onPointerMove={(e) => e.buttons && nav(e)} />
      <Slider label="Zoom" value={Math.log2(doc.view.zoom)} min={-5} max={6} step={0.01} fmt={() => Math.round(doc.view.zoom * 100) + '%'} onChange={(v) => setZoom(doc, Math.pow(2, v))} />
      <Slider label="Rotation" value={doc.view.rot} min={-180} max={180} step={1} fmt={(v) => Math.round(v) + '°'} onChange={(v) => rotateView(doc, v, true)} />
      <div className="flex flex-wrap gap-1">
        <Btn onClick={() => fitView(doc, 'fit')}><Maximize size={11} /> Fit</Btn>
        <Btn onClick={() => fitView(doc, 'width')}>Fit width</Btn>
        <Btn onClick={() => fitView(doc, 'actual')}>100%</Btn>
        <Btn active={doc.view.flip} onClick={() => { doc.view = { ...doc.view, flip: !doc.view.flip }; doc.emit(); }}>Mirror view</Btn>
      </div>
    </div>
  );
}

export function DocInfo() {
  useApp((s) => s.tick);
  const doc = activeDoc();
  const [est, setEst] = useState<{ usage: number; quota: number } | null>(null);
  useEffect(() => { storageEstimate().then(setEst); }, []);
  if (!doc) return <div className="text-[11px] text-neutral-500">No document open.</div>;
  const raster = doc.layers.filter((l) => l.type === 'raster').length;
  const ink = doc.layers.length - raster;
  const inkStrokes = doc.layers.reduce((a, l) => a + (l.strokes?.length || 0), 0);
  const mem = raster * doc.width * doc.height * 4;
  const undoMem = doc.undoStack.reduce((a, r) => a + r.bytes, 0);
  const dur = doc.rec.events.length ? doc.rec.lastEnd : 0;
  const rows: [string, string][] = [
    ['Name', doc.name], ['File', doc.fileName || 'not saved yet'], ['Canvas', `${doc.width} × ${doc.height} px (${((doc.width * doc.height) / 1e6).toFixed(2)} MP)`],
    ['Background', doc.background || 'transparent'], ['Layers', `${doc.layers.length} (${raster} raster, ${ink} Crisp Ink)`], ['Crisp Ink paths', String(inkStrokes)],
    ['Layer memory', fmtBytes(mem)], ['Undo memory', `${fmtBytes(undoMem)} · ${doc.undoStack.length} steps`],
    ['Replay history', doc.rec.events.length ? `Yes · ${doc.rec.events.length} events · ${fmtTime(dur)}` : 'None'],
    ['Replay memory', fmtBytes(doc.rec.bytes) + ' (estimate)'], ['Recording', doc.rec.active ? 'Active' : doc.rec.enabled ? 'Paused' : 'Off'],
    ['Created', new Date(doc.meta.created).toLocaleString()], ['Modified', new Date(doc.meta.modified).toLocaleString()],
    ['Format', '.carbon v1 (zip container)'], ['Unsaved changes', doc.dirty ? 'Yes' : 'No'],
    ['Local storage', est ? `${fmtBytes(est.usage)} of ${fmtBytes(est.quota)}` : 'n/a'],
  ];
  return (
    <div className="space-y-2">
      <table className="w-full text-[11px]">
        <tbody>{rows.map(([k, v]) => <tr key={k}><td className="py-0.5 pr-2 align-top text-neutral-500">{k}</td><td className="break-all py-0.5 text-neutral-200">{v}</td></tr>)}</tbody>
      </table>
      <label className="block text-[11px] text-neutral-500">Author
        <input defaultValue={doc.meta.author} onKeyDown={(e) => e.stopPropagation()} onBlur={(e) => { doc.meta.author = e.target.value; doc.touch(); }} className="mt-1 w-full rounded bg-neutral-900 px-2 py-1 text-neutral-200 outline-none ring-1 ring-white/10" />
      </label>
    </div>
  );
}

export function ReferenceBoard() {
  const [refs, setRefs] = useState<{ key: string; value: RefEntry }[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [picking, setPicking] = useState(true);
  const imgRef = useRef<HTMLImageElement>(null);
  const load = () => idbAll<RefEntry>('refs').then((r) => setRefs(r.sort((a, b) => a.value.addedAt - b.value.addedAt))).catch(() => {});
  useEffect(() => { load(); }, []);
  const add = async () => {
    const f = await pickFile('image/*');
    if (!f) return;
    if (f.size > 25 * 1024 * 1024) return toast('Reference image too large (max 25 MB)', 'error');
    await idbPut('refs', uid('ref-'), { name: f.name, url: await blobToDataURL(f), addedAt: Date.now() });
    load();
  };
  const pick = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!picking) return;
    const im = imgRef.current!;
    const r = im.getBoundingClientRect();
    const c = document.createElement('canvas');
    c.width = 1; c.height = 1;
    const x = c.getContext('2d', { willReadFrequently: true })!;
    x.drawImage(im, ((e.clientX - r.left) / r.width) * im.naturalWidth, ((e.clientY - r.top) / r.height) * im.naturalHeight, 1, 1, 0, 0, 1, 1);
    const d = x.getImageData(0, 0, 1, 1).data;
    setColor(rgbToHex(d[0], d[1], d[2]));
  };
  const cur = refs.find((r) => r.key === open);
  return (
    <div className="space-y-2">
      {cur ? (
        <div className="space-y-1">
          <div className="flex items-center gap-1">
            <span className="flex-1 truncate text-[11px] text-neutral-300">{cur.value.name}</span>
            <Btn active={picking} title="Click the image to sample colors" onClick={() => setPicking(!picking)}><Pipette size={11} /></Btn>
            <Btn onClick={() => setOpen(null)}><X size={11} /></Btn>
          </div>
          <img ref={imgRef} src={cur.value.url} alt={cur.value.name} onClick={pick} className={cn('max-h-72 w-full rounded object-contain', picking && 'cursor-crosshair')} />
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-1">
          {refs.map((r) => (
            <div key={r.key} className="group relative">
              <img src={r.value.url} alt={r.value.name} onClick={() => setOpen(r.key)} className="aspect-square w-full cursor-pointer rounded object-cover ring-white/30 hover:ring-2" />
              <button title="Remove" onClick={async () => { await idbDel('refs', r.key); load(); }} className="absolute right-0.5 top-0.5 hidden rounded bg-black/70 p-0.5 text-neutral-300 group-hover:block"><Trash2 size={10} /></button>
            </div>
          ))}
          <button onClick={add} className="flex aspect-square items-center justify-center rounded border border-dashed border-white/20 text-neutral-500 hover:text-white" title="Add reference image"><ImagePlus size={16} /></button>
        </div>
      )}
      <p className="text-[10px] text-neutral-500">References are stored locally on this device and are not part of the project file.</p>
    </div>
  );
}

export function ToolOptions() {
  const s = useApp();
  const o = s.toolOpts;
  const d = activeDoc();
  const t = s.tool;
  const brushTool = ['brush', 'eraser', 'line', 'rect', 'ellipse'].includes(t);
  const b = currentBrush(t === 'eraser', s);
  return (
    <div className="space-y-1 text-[11px]">
      <div className="mb-1 font-medium capitalize text-neutral-200">{t === 'inkedit' ? 'Crisp Ink Edit' : t}</div>
      {brushTool && (
        <>
          <div className="truncate text-neutral-500">{b.name}</div>
          <Slider label="Size" value={b.size} min={0.5} max={b.maxSize} step={0.5} fmt={(v) => v.toFixed(1) + 'px'} onChange={(v) => updateBrush(b.id, { size: v })} />
          <Slider label="Opacity" value={b.opacity} min={0.01} max={1} onChange={(v) => updateBrush(b.id, { opacity: v })} />
          <Slider label="Stabilization" value={b.smoothing} min={0} max={1} onChange={(v) => updateBrush(b.id, { smoothing: v })} />
        </>
      )}
      {(t === 'brush' || t === 'eraser') && (
        <>
          <Toggle label="Shift-click draws straight line" checked={o.lineAssist} onChange={(v) => updateToolOpts({ lineAssist: v })} />
          {d?.active?.type === 'ink' && t === 'eraser' && (
            <Select label="Crisp Ink erase" value={o.inkErase} onChange={(v) => updateToolOpts({ inkErase: v })} options={[{ value: 'partial', label: 'Partial (split paths)' }, { value: 'whole', label: 'Whole stroke' }]} />
          )}
          {d?.active?.type === 'ink' && t === 'brush' && <p className="text-[10px] text-sky-300/80">Drawing on a Crisp Ink layer makes editable paths.</p>}
        </>
      )}
      {(t === 'rect' || t === 'ellipse') && <Toggle label="Fill shape (raster)" checked={o.shapeFill} onChange={(v) => updateToolOpts({ shapeFill: v })} />}
      {['line', 'rect', 'ellipse'].includes(t) && <p className="text-[10px] text-neutral-500">Strokes the shape with the current brush. Hold Shift to constrain. On Crisp Ink layers you get editable paths.</p>}
      {t === 'fill' && (
        <>
          <Slider label="Tolerance" value={o.fillTol} min={0} max={1} onChange={(v) => updateToolOpts({ fillTol: v })} />
          <Slider label="Expand" value={o.fillExpand} min={0} max={4} step={1} fmt={(v) => v + 'px'} onChange={(v) => updateToolOpts({ fillExpand: v })} />
          <Toggle label="Sample all layers" checked={o.fillAll} onChange={(v) => updateToolOpts({ fillAll: v })} />
        </>
      )}
      {t === 'picker' && <Toggle label="Sample current layer only" checked={o.pickerLayer} onChange={(v) => updateToolOpts({ pickerLayer: v })} />}
      {t === 'select' && (
        <>
          <div className="flex gap-1">{(['rect', 'ellipse', 'lasso'] as const).map((m) => <Btn key={m} active={o.selMode === m} onClick={() => updateToolOpts({ selMode: m })}>{m === 'rect' ? 'Rectangle' : m === 'ellipse' ? 'Ellipse' : 'Freehand'}</Btn>)}</div>
          <div className="flex flex-wrap gap-1 pt-1">
            <Btn onClick={() => d && d.exec({ k: 'select', sel: { pts: [0, 0, d.width, 0, d.width, d.height, 0, d.height], inverted: false } })}>All</Btn>
            <Btn disabled={!d?.selection} onClick={() => d?.selection && d.exec({ k: 'select', sel: { ...d.selection, inverted: !d.selection.inverted } })}>Invert</Btn>
            <Btn disabled={!d?.selection} onClick={() => d?.exec({ k: 'select', sel: null })}>Deselect</Btn>
            <Btn disabled={!d?.selection} onClick={() => d?.exec({ k: 'fillSel', layerId: d.activeLayerId, color: s.fg })}>Fill</Btn>
            <Btn disabled={!d?.selection} onClick={() => d?.exec({ k: 'clearSel', layerId: d.activeLayerId })}>Clear</Btn>
          </div>
          <p className="text-[10px] text-neutral-500">Painting, fills and filters are clipped to the selection.</p>
        </>
      )}
      {(t === 'transform' || t === 'move') && (
        <>
          <Toggle label="Only selected area" checked={o.transformSel} onChange={(v) => updateToolOpts({ transformSel: v })} />
          {t === 'transform' && (
            <div className="flex flex-wrap gap-1">
              <Btn onClick={() => emitCanvas('flip-tf-h')}>Flip H</Btn>
              <Btn onClick={() => emitCanvas('flip-tf-v')}>Flip V</Btn>
              <Btn onClick={() => { emitCanvas('cancel-transform'); setApp({ tool: 'brush' }); }}>Cancel</Btn>
              <Btn variant="primary" onClick={() => { emitCanvas('commit-transform'); setApp({ tool: 'brush' }); }}>Apply</Btn>
            </div>
          )}
          <p className="text-[10px] text-neutral-500">{t === 'transform' ? 'Drag a corner to scale (Shift for free aspect), an edge to stretch, the round handle to rotate (Shift snaps 15°).' : 'Drag to move the layer content.'}</p>
        </>
      )}
      {t === 'text' && (
        <>
          <Select label="Font" value={o.textFont} onChange={(v) => updateToolOpts({ textFont: v })} options={[
            { value: 'Inter, system-ui, sans-serif', label: 'Sans' }, { value: 'Georgia, serif', label: 'Serif' }, { value: 'ui-monospace, monospace', label: 'Mono' },
            { value: '"Comic Sans MS", "Chalkboard SE", cursive', label: 'Hand' }, { value: 'Impact, "Arial Black", sans-serif', label: 'Display' },
          ]} />
          <Slider label="Size" value={o.textSize} min={6} max={400} step={1} fmt={(v) => v + 'px'} onChange={(v) => updateToolOpts({ textSize: v })} />
          <div className="flex gap-1"><Btn active={o.textBold} onClick={() => updateToolOpts({ textBold: !o.textBold })}>Bold</Btn><Btn active={o.textItalic} onClick={() => updateToolOpts({ textItalic: !o.textItalic })}>Italic</Btn></div>
          <p className="text-[10px] text-neutral-500">Click on the canvas to place text, then press Ctrl+Enter.</p>
        </>
      )}
      {t === 'symmetry' || o.sym.mode !== 'off' ? (
        <>
          <SectionTitle>Symmetry</SectionTitle>
          <div className="flex flex-wrap gap-1">
            {(['off', 'vertical', 'horizontal', 'quad', 'radial'] as const).map((m) => <Btn key={m} active={o.sym.mode === m} onClick={() => updateToolOpts({ sym: { ...o.sym, mode: m } })}>{m[0].toUpperCase() + m.slice(1)}</Btn>)}
          </div>
          {o.sym.mode === 'radial' && <Slider label="Segments" value={o.sym.count} min={2} max={24} step={1} fmt={(v) => String(v)} onChange={(v) => updateToolOpts({ sym: { ...o.sym, count: v } })} />}
          <div className="grid grid-cols-2 gap-1">
            <label className="text-neutral-500">Center X %<NumInput value={Math.round(o.sym.cx * 100)} min={0} max={100} onChange={(v) => updateToolOpts({ sym: { ...o.sym, cx: Math.max(0, Math.min(1, v / 100)) } })} /></label>
            <label className="text-neutral-500">Center Y %<NumInput value={Math.round(o.sym.cy * 100)} min={0} max={100} onChange={(v) => updateToolOpts({ sym: { ...o.sym, cy: Math.max(0, Math.min(1, v / 100)) } })} /></label>
          </div>
          {t === 'symmetry' && <p className="text-[10px] text-neutral-500">Click the canvas to place the symmetry center. Brush strokes mirror while symmetry is on.</p>}
        </>
      ) : null}
      {t === 'inkedit' && (
        <>
          <p className="text-[10px] text-neutral-500">Click a path to select it (Shift adds), drag to move it, drag its white control points to reshape, press Delete to remove.</p>
          {d?.active?.type === 'ink' && s.inkSelection.length > 0 && (
            <div className="space-y-1">
              <div className="text-neutral-400">{s.inkSelection.length} path(s) selected</div>
              <div className="flex flex-wrap gap-1">
                <Btn onClick={() => {
                  const ids = new Set(s.inkSelection);
                  d.exec({ k: 'inkSet', layerId: d.activeLayerId, strokes: (d.active!.strokes || []).map((x) => (ids.has(x.id) ? { ...x, color: s.fg } : x)), label: 'Recolor paths' });
                }}><span className="h-3 w-3 rounded-sm" style={{ background: s.fg }} /> Apply color</Btn>
                <Btn onClick={() => {
                  const ids = new Set(s.inkSelection);
                  d.exec({ k: 'inkSet', layerId: d.activeLayerId, strokes: (d.active!.strokes || []).map((x) => (ids.has(x.id) ? { ...x, size: Math.max(0.5, x.size * 1.2) } : x)), label: 'Thicken paths' });
                }}>Thicker</Btn>
                <Btn onClick={() => {
                  const ids = new Set(s.inkSelection);
                  d.exec({ k: 'inkSet', layerId: d.activeLayerId, strokes: (d.active!.strokes || []).map((x) => (ids.has(x.id) ? { ...x, size: Math.max(0.5, x.size / 1.2) } : x)), label: 'Thin paths' });
                }}>Thinner</Btn>
                <Btn onClick={() => setApp({ inkSelection: (d.active!.strokes || []).map((x) => x.id) })}>Select all</Btn>
              </div>
              {(() => {
                const st = d.active!.strokes?.find((x) => x.id === s.inkSelection[0]);
                if (!st) return null;
                const set = (p: Partial<typeof st>) => { const ids = new Set(s.inkSelection); d.exec({ k: 'inkSet', layerId: d.activeLayerId, strokes: (d.active!.strokes || []).map((x) => (ids.has(x.id) ? { ...x, ...p } : x)), label: 'Edit path' }); };
                return (
                  <>
                    <Slider label="Opacity" value={st.opacity} min={0.05} max={1} onChange={() => {}} onCommit={(v) => set({ opacity: v })} />
                    <Slider label="Taper start" value={st.taperStart} min={0} max={2} step={0.05} fmt={(v) => v.toFixed(2)} onChange={() => {}} onCommit={(v) => set({ taperStart: v })} />
                    <Slider label="Taper end" value={st.taperEnd} min={0} max={2} step={0.05} fmt={(v) => v.toFixed(2)} onChange={() => {}} onCommit={(v) => set({ taperEnd: v })} />
                  </>
                );
              })()}
            </div>
          )}
        </>
      )}
      {(t === 'zoom' || t === 'hand' || t === 'rotate') && d && (
        <div className="flex flex-wrap gap-1">
          <Btn onClick={() => fitView(d, 'fit')}><Scan size={11} /> Fit</Btn>
          <Btn onClick={() => fitView(d, 'actual')}>100%</Btn>
          <Btn onClick={() => rotateView(d, 0, true)}>Reset rotation</Btn>
          <p className="w-full text-[10px] text-neutral-500">{t === 'zoom' ? 'Click to zoom in, Alt-click to zoom out, drag to scrub.' : t === 'rotate' ? 'Drag around the center to rotate the view (Shift snaps).' : 'Drag to pan. Space works with any tool.'}</p>
        </div>
      )}
      {t !== 'select' && (
        <div className="border-t border-white/5 pt-1">
          <Toggle label="Brush outline cursor" checked={s.settings.brushOutline} onChange={(v) => updateSettings({ brushOutline: v })} />
        </div>
      )}
    </div>
  );
}

export { getApp }; // re-exported for panel consumers
