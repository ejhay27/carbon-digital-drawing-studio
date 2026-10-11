import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Copy, Download, FolderPlus, RotateCcw, Save, Search, Star, Trash2, Upload } from 'lucide-react';
import type { BrushParams, GrainType, TipShape } from '../engine/types';
import { CATEGORIES, exportBrushes, parseBrushImport, searchBrushes } from '../engine/brushes';
import { brushPreview, renderStroke, sampleCurve } from '../engine/strokeRenderer';
import { ensureStamp, missingStamps } from '../engine/tips';
import { blobToDataURL, download, uid } from '../engine/util';
import { allBrushes, brushById, confirmDialog, currentBrush, getApp, selectBrush, setApp, toast, updateBrush, useApp } from '../state/store';
import { pickFile } from '../state/actions';
import { Btn, SectionTitle, Select, Slider, Toggle } from './ui';
import { cn } from '../utils/cn';

export async function importBrushPack() {
  const f = await pickFile('.carbonbrush,.json');
  if (!f) return;
  try {
    const s = getApp();
    const { added, duplicates, warnings } = parseBrushImport(await f.text(), allBrushes(s));
    await Promise.all(added.filter((b) => b.stamp).map((b) => ensureStamp(b.stamp!)));
    setApp({ customBrushes: [...s.customBrushes, ...added] });
    toast(`Imported ${added.length} brush${added.length === 1 ? '' : 'es'}${duplicates ? ` · ${duplicates} duplicate${duplicates > 1 ? 's' : ''} skipped` : ''}`, 'success');
    warnings.slice(0, 3).forEach((w) => toast(w, 'error'));
  } catch (e) {
    toast('Brush import failed: ' + (e instanceof Error ? e.message : e), 'error');
  }
}
export function exportBrushList(list: BrushParams[], name: string) {
  if (!list.length) return toast('No brushes to export', 'error');
  download(new Blob([exportBrushes(list)], { type: 'application/json' }), name + '.carbonbrush');
}
export function duplicateCurrent() {
  const s = getApp();
  const eraser = s.tool === 'eraser';
  const b = currentBrush(eraser, s);
  const nb: BrushParams = { ...b, id: uid(eraser ? 'ce-' : 'cb-'), name: b.name + ' Copy', builtin: false, category: b.category };
  if (eraser) setApp({ customErasers: [...s.customErasers, nb] });
  else setApp({ customBrushes: [...s.customBrushes, nb] });
  selectBrush(nb.id);
  toast(`Created “${nb.name}”${eraser ? ' eraser tip' : ''}`, 'success');
}

function BrushRow({ b, active, fav }: { b: BrushParams; active: boolean; fav: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    const el = ref.current!;
    let cancelled = false;
    const io = new IntersectionObserver((ents) => {
      if (ents[0].isIntersecting) {
        io.disconnect();
        const run = () => !cancelled && setSrc(brushPreview(b, 168, 34));
        const ric = (window as unknown as { requestIdleCallback?: (f: () => void) => void }).requestIdleCallback;
        if (b.stamp) ensureStamp(b.stamp).then(() => (ric ? ric(run) : setTimeout(run, 0)));
        else if (ric) ric(run);
        else setTimeout(run, 0);
      }
    }, { rootMargin: '120px' });
    io.observe(el);
    return () => { cancelled = true; io.disconnect(); };
  }, [b]);
  const missing = b.tip === 'stamp' && (!b.stamp || missingStamps.has(b.stamp));
  return (
    <div
      ref={ref}
      onClick={() => selectBrush(b.id)}
      title={b.description}
      className={cn('group flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1', active ? 'bg-[#E8913A]/15 ring-1 ring-[#E8913A]/40' : 'hover:bg-white/5')}
    >
      <div className="h-[34px] w-[84px] shrink-0 overflow-hidden rounded bg-neutral-950/60">
        {src && <img src={src} alt="" className="h-full w-[168px] max-w-none -translate-x-[42px] object-cover" draggable={false} />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1 truncate text-[11px] text-neutral-200">
          {b.name}
          {missing && <AlertTriangle size={11} className="text-amber-400" aria-label="Missing stamp asset" />}
        </div>
        <div className="truncate text-[9px] uppercase tracking-wide text-neutral-500">{b.builtin ? b.category : 'Custom · ' + b.category} · {b.mode === 'crisp' ? 'Crisp Ink' : b.mode}</div>
      </div>
      <button
        title={fav ? 'Remove from favorites' : 'Add to favorites'}
        onClick={(e) => { e.stopPropagation(); const f = getApp().favorites; setApp({ favorites: fav ? f.filter((x) => x !== b.id) : [...f, b.id] }); }}
        className={cn(fav ? 'text-[#E8913A]' : 'text-neutral-600 opacity-0 hover:text-white group-hover:opacity-100')}
      >
        <Star size={12} fill={fav ? 'currentColor' : 'none'} />
      </button>
    </div>
  );
}

export function BrushLibrary() {
  const s = useApp();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<string>('all');
  const [cat, setCat] = useState<string>('All');
  const eraser = s.tool === 'eraser';
  const activeId = eraser ? s.eraserBrushId : s.brushId;
  let list = allBrushes(s).map((b) => ({ ...b, ...(s.overrides[b.id] || {}) }));
  if (filter === 'fav') list = list.filter((b) => s.favorites.includes(b.id));
  else if (filter === 'recent') list = s.recentBrushes.map((id) => list.find((b) => b.id === id)).filter(Boolean) as BrushParams[];
  else if (filter === 'custom') list = list.filter((b) => !b.builtin);
  else if (filter.startsWith('col-')) {
    const c = s.collections.find((x) => x.id === filter);
    list = list.filter((b) => c?.ids.includes(b.id));
  }
  if (cat !== 'All') list = list.filter((b) => b.category === cat);
  list = searchBrushes(list, q);
  const cats = ['All', ...CATEGORIES, ...Array.from(new Set([...s.customBrushes, ...s.customErasers].map((b) => b.category))).filter((c) => !(CATEGORIES as readonly string[]).includes(c))];
  const current = brushById(activeId);

  return (
    <div className="space-y-2">
      {eraser && <div className="rounded bg-sky-500/10 px-2 py-1 text-[10px] text-sky-300">Eraser tool active: choosing a brush sets the eraser tip.</div>}
      <div className="flex items-center gap-1 rounded-md border border-white/10 bg-neutral-900 px-2">
        <Search size={12} className="text-neutral-500" />
        <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.stopPropagation()} placeholder={`Search ${allBrushes(s).length} brushes…`} className="w-full bg-transparent py-1.5 text-[11px] text-neutral-100 outline-none" />
      </div>
      <div className="flex flex-wrap gap-1">
        {[['all', 'All'], ['fav', 'Favorites'], ['recent', 'Recent'], ['custom', 'Custom']].map(([k, l]) => <Btn key={k} active={filter === k} onClick={() => setFilter(k)}>{l}</Btn>)}
        {s.collections.map((c) => <Btn key={c.id} active={filter === c.id} onClick={() => setFilter(c.id)}>{c.name}</Btn>)}
      </div>
      <Select value={cat} onChange={setCat} options={cats.map((c) => ({ value: c, label: c }))} />
      <div className="max-h-[300px] space-y-0.5 overflow-y-auto pr-0.5">
        {list.map((b) => <BrushRow key={b.id + JSON.stringify(s.overrides[b.id] || {})} b={b} active={b.id === activeId} fav={s.favorites.includes(b.id)} />)}
        {!list.length && <div className="py-4 text-center text-[11px] text-neutral-500">No brushes match.</div>}
      </div>
      <div className="flex flex-wrap gap-1 border-t border-white/5 pt-2">
        <Btn title="Duplicate current brush as a custom preset" onClick={duplicateCurrent}><Copy size={11} /> Duplicate</Btn>
        {current && !current.builtin && (
          <Btn title="Delete custom brush or eraser" onClick={async () => {
            const answer = await confirmDialog(`Delete “${current.name}”?`, 'The custom brush/eraser will be removed from this device. Existing artwork is not changed.', [
              { label: 'Keep', value: 'n' }, { label: 'Delete', value: 'y', variant: 'danger' },
            ]);
            if (answer === 'y') {
              setApp({ customBrushes: s.customBrushes.filter((b) => b.id !== current.id), customErasers: s.customErasers.filter((b) => b.id !== current.id), favorites: s.favorites.filter((x) => x !== current.id), recentBrushes: s.recentBrushes.filter((x) => x !== current.id), collections: s.collections.map((collection) => ({ ...collection, ids: collection.ids.filter((x) => x !== current.id) })), brushId: eraser ? s.brushId : 'pencil-hb', eraserBrushId: eraser ? 'eraser-hard' : s.eraserBrushId });
              toast(`Deleted “${current.name}”`);
            }
          }}><Trash2 size={11} /></Btn>
        )}
        <Select value="" onChange={(v) => {
          if (!current) return;
          if (v === '__new') {
            const id = uid('col-');
            setApp({ collections: [...s.collections, { id, name: 'Collection ' + (s.collections.length + 1), ids: [current.id] }] });
            toast('Created collection');
          } else if (v) {
            setApp({ collections: s.collections.map((c) => (c.id === v ? { ...c, ids: c.ids.includes(current.id) ? c.ids.filter((x) => x !== current.id) : [...c.ids, current.id] } : c)) });
          }
        }} options={[{ value: '', label: '＋ Collection…' }, ...s.collections.map((c) => ({ value: c.id, label: (current && c.ids.includes(current.id) ? '✓ ' : '') + c.name })), { value: '__new', label: 'New collection' }]} />
      </div>
      <div className="flex flex-wrap gap-1">
        <Btn onClick={importBrushPack}><Upload size={11} /> Import pack</Btn>
        <Btn onClick={() => exportBrushList([...s.customBrushes, ...s.customErasers], 'carbon-custom-brushes-and-erasers')}><Download size={11} /> Export custom</Btn>
        <Btn onClick={() => current && exportBrushList([current], current.name.replace(/\s+/g, '-'))}><FolderPlus size={11} /> Export current</Btn>
      </div>
    </div>
  );
}

const TIPS: TipShape[] = ['round', 'square', 'grain', 'pencil', 'chalk', 'charcoal', 'bristle', 'flat', 'splatter', 'star', 'leaf', 'cloud', 'fabric', 'dots', 'sponge', 'hatch', 'stamp'];
const GRAINS: GrainType[] = ['paper', 'canvas', 'fabric', 'noise', 'rough']; // paper textures

function LivePreview({ b, color }: { b: BrushParams; color: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      const c = ref.current;
      if (!c) return;
      const W = 280, H = 80;
      c.width = W; c.height = H;
      const x = c.getContext('2d')!;
      x.fillStyle = '#f4f1ea';
      x.fillRect(0, 0, W, H);
      const pb = { ...b, size: Math.min(b.size, b.scatter > 1 ? 10 : 46), smoothing: 0, mode: b.mode === 'crisp' ? 'normal' as const : b.mode };
      let layer: HTMLCanvasElement | undefined;
      if (pb.mode === 'smudge' || pb.mode === 'mix') {
        layer = document.createElement('canvas');
        layer.width = W; layer.height = H;
        const l = layer.getContext('2d')!;
        const g = l.createLinearGradient(0, 0, W, 0);
        g.addColorStop(0, '#b45309'); g.addColorStop(0.5, '#1d4ed8'); g.addColorStop(1, '#047857');
        l.fillStyle = g;
        l.fillRect(0, H * 0.3, W, H * 0.4);
      }
      const r = renderStroke({ brush: pb, color, eraser: false, seed: 11, sym: { mode: 'off', count: 2, cx: 0.5, cy: 0.5 }, w: W, h: H, layer }, sampleCurve(W, H, 70));
      if (r.direct) x.drawImage(r.out, 0, 0);
      else {
        if (layer) x.drawImage(layer, 0, 0);
        x.globalAlpha = pb.opacity;
        x.globalCompositeOperation = pb.composite;
        x.drawImage(r.out, 0, 0);
      }
    }, 60);
    return () => clearTimeout(t);
  }, [b, color]);
  return <canvas ref={ref} className="h-20 w-full rounded-md border border-white/10" />;
}

export function BrushStudio({ draft, onDraftChange }: { draft?: BrushParams; onDraftChange?: (patch: Partial<BrushParams>) => void } = {}) {
  const s = useApp();
  const eraser = !draft && s.tool === 'eraser';
  const b = draft || currentBrush(eraser, s);
  const u = (p: Partial<BrushParams>) => draft ? onDraftChange?.(p) : updateBrush(b.id, p);
  const sl = (label: string, key: keyof BrushParams, min: number, max: number, step = 0.01, fmt?: (v: number) => string) => (
    <Slider label={label} value={Number(b[key])} min={min} max={max} step={step} fmt={fmt} onChange={(v) => u({ [key]: v } as Partial<BrushParams>)} />
  );
  const px = (v: number) => v.toFixed(v < 10 ? 1 : 0) + 'px';
  const raw = (v: number) => v.toFixed(2);
  return (
    <div className="space-y-1">
      <LivePreview b={b} color={eraser ? '#333333' : s.fg} />
      <div className="flex items-center gap-1">
        {b.builtin ? (
          <div className="flex-1 truncate text-[11px] text-neutral-300">{b.name} <span className="text-neutral-500">· {s.overrides[b.id] ? 'modified preset' : 'preset'}</span></div>
        ) : (
          <input value={b.name} onChange={(e) => u({ name: e.target.value })} onKeyDown={(e) => e.stopPropagation()} className="min-w-0 flex-1 rounded bg-neutral-900 px-2 py-1 text-[11px] text-white outline-none ring-1 ring-white/10" />
        )}
        {b.builtin && s.overrides[b.id] && <Btn title="Reset preset to factory settings" onClick={() => { const o = { ...s.overrides }; delete o[b.id]; setApp({ overrides: o }); }}><RotateCcw size={11} /></Btn>}
        {!draft && <Btn title="Save as new custom brush" onClick={duplicateCurrent}><Save size={11} /></Btn>}
      </div>
      <p className="text-[10px] leading-snug text-neutral-500">{b.description}</p>
      <SectionTitle>Stroke</SectionTitle>
      {sl('Size', 'size', 0.5, b.maxSize, 0.5, px)}
      {sl('Min size', 'minSize', 0, 1)}
      {sl('Opacity', 'opacity', 0.01, 1)}
      {sl('Flow', 'flow', 0.01, 1)}
      {sl('Spacing', 'spacing', 0.01, 2)}
      {sl('Stabilization', 'smoothing', 0, 1)}
      <SectionTitle>Tip</SectionTitle>
      <Select label="Shape" value={b.tip} options={TIPS.map((t) => ({ value: t, label: t[0].toUpperCase() + t.slice(1) }))} onChange={(v) => u({ tip: v })} />
      {b.tip === 'stamp' && (
        <Btn onClick={async () => {
          const f = await pickFile('image/png,image/jpeg,image/webp');
          if (!f) return;
          if (f.size > 300_000) return toast('Stamp image must be 300 KB or smaller for safe brush storage.', 'error');
          if (!['image/png', 'image/jpeg', 'image/webp'].includes(f.type)) return toast('Stamp must be a PNG, JPEG, or WebP image.', 'error');
          const url = await blobToDataURL(f);
          await ensureStamp(url);
          if (missingStamps.has(url)) return toast('Could not decode stamp image', 'error');
          u({ stamp: url });
        }}><Upload size={11} /> Load stamp image</Btn>
      )}
      {sl('Hardness', 'hardness', 0, 1)}
      {sl('Roundness', 'roundness', 0.05, 1)}
      {sl('Angle', 'angle', -180, 180, 1, (v) => Math.round(v) + '°')}
      <Toggle label="Follow stroke direction" checked={b.followDirection} onChange={(v) => u({ followDirection: v })} />
      <SectionTitle>Dynamics</SectionTitle>
      {sl('Pressure → size', 'pressureSize', 0, 1)}
      {sl('Pressure → opacity', 'pressureOpacity', 0, 1)}
      {sl('Speed thinning', 'speedSize', -1, 1, 0.05, raw)}
      {sl('Tilt → size', 'tiltSize', 0, 5, 0.1, raw)}
      <Toggle label="Tip follows stylus tilt" checked={b.tiltAngle} onChange={(v) => u({ tiltAngle: v })} />
      {sl('Taper start', 'taperStart', 0, 2, 0.05, raw)}
      {b.mode === 'crisp' && sl('Taper end', 'taperEnd', 0, 2, 0.05, raw)}
      <SectionTitle>Scatter &amp; jitter</SectionTitle>
      {sl('Scatter', 'scatter', 0, 12, 0.05, raw)}
      {sl('Count', 'count', 1, 16, 1, (v) => String(v))}
      {sl('Size jitter', 'sizeJitter', 0, 1)}
      {sl('Angle jitter', 'angleJitter', 0, 1)}
      {sl('Opacity jitter', 'opacityJitter', 0, 1)}
      <SectionTitle>Color dynamics</SectionTitle>
      {sl('Hue jitter', 'hueJitter', 0, 0.5)}
      {sl('Saturation jitter', 'satJitter', 0, 1)}
      {sl('Value jitter', 'valJitter', 0, 1)}
      <SectionTitle>Texture</SectionTitle>
      {sl('Grain', 'grain', 0, 1)}
      <Select label="Grain type" value={b.grainType} options={GRAINS.map((g) => ({ value: g, label: g[0].toUpperCase() + g.slice(1) }))} onChange={(v) => u({ grainType: v })} />
      {sl('Grain scale', 'grainScale', 0.25, 4, 0.05, (v) => v.toFixed(2) + '×')}
      <SectionTitle>Engine &amp; wet media</SectionTitle>
      <Select label="Engine" value={b.mode} onChange={(v) => u({ mode: v })} options={[
        { value: 'normal', label: 'Dry media (build-up)' }, { value: 'wash', label: 'Watercolor wash' }, { value: 'mix', label: 'Paint mixing' },
        { value: 'smudge', label: 'Smudge / blend' }, { value: 'crisp', label: 'Crisp Ink (editable)' },
      ]} />
      {b.mode === 'wash' && <>{sl('Wet edges', 'wetEdges', 0, 1)}{sl('Granulation', 'granulation', 0, 1)}{sl('Bloom', 'bloom', 0, 1)}</>}
      {(b.mode === 'mix' || b.mode === 'smudge') && <>{sl(b.mode === 'mix' ? 'Color pickup' : 'Strength', 'pickup', 0, 1)}{sl('Wetness', 'wetness', 0, 1)}</>}
      <Select label="Composite" value={b.composite} onChange={(v) => u({ composite: v })} options={[
        { value: 'source-over', label: 'Normal' }, { value: 'multiply', label: 'Multiply (markers)' }, { value: 'screen', label: 'Screen' },
        { value: 'lighter', label: 'Add (glow)' }, { value: 'darken', label: 'Darken' },
      ]} />
    </div>
  );
}
