import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Copy, Eye, EyeOff, Layers as LayersIcon, Lock, LockOpen, Merge, PenTool, Plus, Trash2, Eraser, Grid2x2 } from 'lucide-react';
import type { BlendMode, Layer } from '../engine/types';
import type { DocEngine } from '../engine/document';
import { drawInkStroke } from '../engine/crispInk';
import { canvasHash, uid } from '../engine/util';
import { activeDoc, confirmDialog, toast, useApp } from '../state/store';
import { addLayer } from '../state/commands';
import { Btn, Select, Slider } from './ui';
import { cn } from '../utils/cn';

export const BLEND_MODES: { value: BlendMode; label: string }[] = [
  { value: 'source-over', label: 'Normal' }, { value: 'multiply', label: 'Multiply' }, { value: 'screen', label: 'Screen' },
  { value: 'overlay', label: 'Overlay' }, { value: 'darken', label: 'Darken' }, { value: 'lighten', label: 'Lighten' },
  { value: 'color-dodge', label: 'Color Dodge' }, { value: 'color-burn', label: 'Color Burn' }, { value: 'hard-light', label: 'Hard Light' },
  { value: 'soft-light', label: 'Soft Light' }, { value: 'difference', label: 'Difference' }, { value: 'exclusion', label: 'Exclusion' },
  { value: 'hue', label: 'Hue' }, { value: 'saturation', label: 'Saturation' }, { value: 'color', label: 'Color' }, { value: 'luminosity', label: 'Luminosity' },
];

function Thumb({ doc, layer, rev }: { doc: DocEngine; layer: Layer; rev: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      const c = ref.current;
      if (!c) return;
      const x = c.getContext('2d')!;
      const W = 44, H = 32;
      c.width = W * 2; c.height = H * 2;
      const s = Math.min((W * 2) / doc.width, (H * 2) / doc.height);
      x.clearRect(0, 0, c.width, c.height);
      x.save();
      x.translate((c.width - doc.width * s) / 2, (c.height - doc.height * s) / 2);
      x.scale(s, s);
      if (layer.type === 'raster' && layer.canvas) x.drawImage(layer.canvas, 0, 0);
      else for (const st of layer.strokes || []) drawInkStroke(x, st);
      x.restore();
    }, 120);
    return () => clearTimeout(t);
  }, [doc, layer, rev]);
  return <canvas ref={ref} className="h-8 w-11 shrink-0 rounded-sm border border-white/10 bg-[repeating-conic-gradient(#555_0_25%,#777_0_50%)] bg-[length:8px_8px]" />;
}

function isEmpty(L: Layer) {
  if (L.type === 'ink') return !(L.strokes || []).length;
  const c = L.canvas!;
  const blank = document.createElement('canvas');
  blank.width = c.width; blank.height = c.height;
  return canvasHash(c) === canvasHash(blank);
}

export default function LayersPanel() {
  useApp((s) => s.tick);
  const doc = activeDoc();
  const [editing, setEditing] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const bgOrig = useRef<string | null | undefined>(undefined);
  if (!doc) return <div className="text-[11px] text-neutral-500">No document open.</div>;
  const A = doc.active;
  const list = [...doc.layers].reverse();
  const ai = doc.layers.findIndex((l) => l.id === doc.activeLayerId);
  const prop = (L: Layer, props: Partial<Layer>) => doc.exec({ k: 'layerProp', layerId: L.id, props });
  const del = async () => {
    if (!A) return;
    if (doc.layers.length <= 1) return toast('A document needs at least one layer.', 'error');
    if (!isEmpty(A)) {
      const r = await confirmDialog('Delete layer?', `“${A.name}” contains artwork. You can undo this deletion.`, [{ label: 'Cancel', value: 'no' }, { label: 'Delete', value: 'yes', variant: 'danger' }]);
      if (r !== 'yes') return;
    }
    doc.exec({ k: 'layerDel', layerId: A.id });
  };
  const eff = doc.propPreview && A && doc.propPreview.layerId === A.id ? { ...A, ...doc.propPreview.props } : A;

  return (
    <div className="space-y-2">
      {A && eff && (
        <div className="space-y-1 rounded-md bg-white/[0.03] p-2">
          <Slider
            label="Opacity" value={eff.opacity} min={0} max={1}
            onChange={(v) => { doc.propPreview = { layerId: A.id, props: { opacity: v } }; doc.emit(); }}
            onCommit={(v) => { doc.propPreview = null; prop(A, { opacity: v }); }}
          />
          <Select label="Blend" value={A.blend} options={BLEND_MODES} onChange={(v) => prop(A, { blend: v })} />
        </div>
      )}
      <div className="max-h-[340px] space-y-0.5 overflow-y-auto pr-0.5">
        {list.map((L) => (
          <div
            key={L.id}
            draggable={editing !== L.id}
            onDragStart={() => setDragId(L.id)}
            onDragOver={(e) => { e.preventDefault(); setOverId(L.id); }}
            onDragLeave={() => setOverId(null)}
            onDrop={() => {
              if (dragId && dragId !== L.id) doc.exec({ k: 'layerMove', layerId: dragId, index: doc.layers.findIndex((l) => l.id === L.id) });
              setDragId(null); setOverId(null);
            }}
            onClick={() => doc.setActive(L.id)}
            className={cn(
              'group flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-[11px]',
              L.id === doc.activeLayerId ? 'bg-[#E8913A]/15 ring-1 ring-[#E8913A]/40' : 'hover:bg-white/5',
              overId === L.id && dragId !== L.id && 'ring-1 ring-sky-400',
            )}
          >
            <button title={L.visible ? 'Hide layer' : 'Show layer'} onClick={(e) => { e.stopPropagation(); prop(L, { visible: !L.visible }); }} className="text-neutral-400 hover:text-white">
              {L.visible ? <Eye size={13} /> : <EyeOff size={13} className="opacity-50" />}
            </button>
            <Thumb doc={doc} layer={L} rev={doc.rev} />
            <div className="min-w-0 flex-1">
              {editing === L.id ? (
                <input
                  autoFocus defaultValue={L.name}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditing(null); }}
                  onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== L.name) prop(L, { name: v.slice(0, 60) }); setEditing(null); }}
                  className="w-full rounded bg-neutral-900 px-1 text-[11px] text-white outline-none ring-1 ring-[#E8913A]/50"
                />
              ) : (
                <div className={cn('truncate', L.visible ? 'text-neutral-200' : 'text-neutral-500')} onDoubleClick={(e) => { e.stopPropagation(); setEditing(L.id); }} title="Double-click to rename">{L.name}</div>
              )}
              <div className="flex items-center gap-1 text-[9px] uppercase tracking-wide text-neutral-500">
                {L.type === 'ink' ? <><PenTool size={9} /> Crisp Ink · {(L.strokes || []).length}</> : 'Raster'}
                {L.opacity < 1 && <span>· {Math.round(L.opacity * 100)}%</span>}
                {L.blend !== 'source-over' && <span>· {BLEND_MODES.find((b) => b.value === L.blend)?.label}</span>}
              </div>
            </div>
            {L.type === 'raster' && (
              <button title={L.alphaLock ? 'Alpha lock on' : 'Alpha lock (preserve transparency)'} onClick={(e) => { e.stopPropagation(); prop(L, { alphaLock: !L.alphaLock }); }} className={cn('opacity-0 group-hover:opacity-100', L.alphaLock ? 'text-[#E8913A] opacity-100' : 'text-neutral-500 hover:text-white')}>
                <Grid2x2 size={12} />
              </button>
            )}
            <button title={L.locked ? 'Unlock layer' : 'Lock layer'} onClick={(e) => { e.stopPropagation(); prop(L, { locked: !L.locked }); }} className={cn(L.locked ? 'text-[#E8913A]' : 'text-neutral-500 opacity-0 hover:text-white group-hover:opacity-100')}>
              {L.locked ? <Lock size={12} /> : <LockOpen size={12} />}
            </button>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-1">
        <Btn title="New raster layer (Ctrl+Shift+N)" onClick={() => addLayer('raster')}><Plus size={12} /><LayersIcon size={12} /></Btn>
        <Btn title="New Crisp Ink layer (Ctrl+Shift+K)" onClick={() => addLayer('ink')}><Plus size={12} /><PenTool size={12} /></Btn>
        <Btn title="Duplicate layer" onClick={() => A && doc.exec({ k: 'layerDup', layerId: A.id, newId: uid('L') })}><Copy size={12} /></Btn>
        <Btn title="Move up" disabled={ai >= doc.layers.length - 1} onClick={() => A && doc.exec({ k: 'layerMove', layerId: A.id, index: ai + 1 })}><ArrowUp size={12} /></Btn>
        <Btn title="Move down" disabled={ai <= 0} onClick={() => A && doc.exec({ k: 'layerMove', layerId: A.id, index: ai - 1 })}><ArrowDown size={12} /></Btn>
        <Btn title="Merge down" disabled={ai <= 0} onClick={() => A && doc.exec({ k: 'mergeDown', layerId: A.id })}><Merge size={12} /></Btn>
        <Btn title="Clear layer" onClick={() => A && doc.exec({ k: 'layerClear', layerId: A.id })}><Eraser size={12} /></Btn>
        <Btn title="Delete layer" onClick={del}><Trash2 size={12} /></Btn>
        {A?.type === 'ink' && <Btn title="Convert Crisp Ink to raster pixels" onClick={() => doc.exec({ k: 'rasterize', layerId: A.id })}>Rasterize</Btn>}
      </div>
      <div className="flex items-center justify-between border-t border-white/5 pt-2 text-[11px] text-neutral-400">
        <span>Background</span>
        <div className="flex items-center gap-1">
          <button title="Transparent" onClick={() => doc.exec({ k: 'bg', color: null })} className={cn('h-5 w-5 rounded-sm border bg-[repeating-conic-gradient(#555_0_25%,#888_0_50%)] bg-[length:8px_8px]', !doc.background ? 'border-[#E8913A]' : 'border-white/20')} />
          <label title="Background color" className={cn('relative h-5 w-5 cursor-pointer overflow-hidden rounded-sm border', doc.background ? 'border-[#E8913A]' : 'border-white/20')} style={{ background: doc.background || '#fff' }}>
            <input
              type="color" className="absolute inset-0 cursor-pointer opacity-0" value={doc.background || '#ffffff'}
              onFocus={() => { bgOrig.current = doc.background; }}
              onChange={(e) => { if (bgOrig.current === undefined) bgOrig.current = doc.background; doc.background = e.target.value; doc.emit(); }}
              onBlur={(e) => {
                const v = e.target.value;
                if (bgOrig.current !== undefined && bgOrig.current !== v) { doc.background = bgOrig.current; doc.exec({ k: 'bg', color: v }); }
                bgOrig.current = undefined;
              }}
            />
          </label>
        </div>
      </div>
      {EDITION.windows && <WinLayerTools />}
    </div>
  );
}

import { EDITION } from '../platform/edition';
import { WinLayerTools } from '../win/WinPanels';
