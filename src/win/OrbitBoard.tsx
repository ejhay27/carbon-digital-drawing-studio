// Orbit Board: project reference workspace (Windows edition). Data lives in doc.board (manifest.extensions.board);
// images are de-duplicated doc assets (saved under assets/ in the .carbon archive), never re-embedded per item.
import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Box, ExternalLink, FileImage, Frame, Image as ImageIcon, Layers as LayersIcon, Link2, Maximize, Palette, StickyNote, Trash2 } from 'lucide-react';
import type { DocEngine } from '../engine/document';
import { compositeDoc } from '../engine/render';
import { blobToDataURL, hashString, loadImage, uid } from '../engine/util';
import { activeDoc, getApp, setApp, setColor, toast, useApp } from '../state/store';
import { pickFile } from '../state/actions';
import { Btn, Select } from '../components/ui';
import { cn } from '../utils/cn';
import { findDoc, sceneOf } from './sceneRender';
import { openScene, panelById } from './Continuum';
import { setWin, useWin } from './WinOverlay';

export type BoardTag = 'characters' | 'environments' | 'props' | 'scenes' | 'palettes' | 'other';
export interface BoardLink { kind: 'layer' | 'scene' | 'page' | 'panel'; doc: string; docName: string; layerId?: string; viewId?: string; panelId?: string; label: string }
export interface BoardItem { id: string; type: 'image' | 'sketch' | 'note' | 'palette' | 'link' | 'group'; x: number; y: number; w: number; h: number; title: string; text?: string; asset?: string; colors?: string[]; link?: BoardLink; color?: string; tag?: BoardTag }
export interface BoardData { version: 1; items: BoardItem[]; view: { x: number; y: number; z: number } }
const TAGS: BoardTag[] = ['characters', 'environments', 'props', 'scenes', 'palettes', 'other'];
const MAX_REF = 25 * 1024 * 1024; // per reference image

export function boardOf(d: DocEngine | null): BoardData {
  const b = d?.board as BoardData | null;
  return b && Array.isArray(b.items) ? { version: 1, items: b.items, view: b.view || { x: 40, y: 40, z: 1 } } : { version: 1, items: [], view: { x: 40, y: 40, z: 1 } };
}

/** null = healthy; otherwise a human-readable reason (missing document, layer, panel, view or image). */
export function itemHealth(it: BoardItem, d: DocEngine): string | null {
  if ((it.type === 'image' || it.type === 'sketch') && (!it.asset || !d.assets[it.asset])) return 'Image file is missing from this project.';
  if (it.type !== 'link' || !it.link) return null;
  const t = findDoc(it.link.doc);
  if (!t) return `“${it.link.docName}” is not open. Open that .carbon file to follow this link.`;
  if (it.link.kind === 'layer' && !t.layer(it.link.layerId || '')) return 'The linked layer was deleted.';
  if (it.link.kind === 'panel' && !panelById(t, it.link.panelId || '')) return 'The linked comic panel was deleted.';
  if (it.link.kind === 'scene') {
    if (!t.scene3d) return `“${t.name}” no longer has a 3D scene.`;
    if (it.link.viewId && !sceneOf(t.scene3d).views.some((v) => v.id === it.link!.viewId)) return 'The saved camera view was deleted (opens the scene camera instead).';
  }
  return null;
}

export function followLink(l: BoardLink) {
  const t = findDoc(l.doc);
  if (!t) return toast(`“${l.docName}” is not open.`, 'error');
  if (l.kind === 'scene') { const v = l.viewId ? sceneOf(t.scene3d).views.find((x) => x.id === l.viewId)?.view : undefined; openScene(l.doc, v); return; }
  setApp({ activeId: t.id });
  if (l.kind === 'layer' && l.layerId && t.layer(l.layerId)) { t.setActive(l.layerId); setWin({ workspace: t.comic ? 'comic' : 'draw' }); }
  else if (l.kind === 'panel') setWin({ workspace: 'comic', comic: { ...useWin.getState().comic, selected: l.panelId || null, mode: 'select' } });
  else setWin({ workspace: t.comic ? 'comic' : 'draw' });
}

/** Store an image as a de-duplicated project asset (validates size and decodability). */
async function assetFrom(d: DocEngine, url: string): Promise<{ id: string; img: HTMLImageElement }> {
  const id = `ref-${hashString(url.slice(0, 262144))}-${url.length}`;
  const img = d.assetImgs.get(id) || (await loadImage(url));
  if (!d.assets[id]) { d.assets[id] = url; d.assetImgs.set(id, img); }
  return { id, img };
}

/** Controls inside cards must receive their own clicks/typing instead of starting a board drag. */
const interactive = (t: EventTarget | null) => !!(t as HTMLElement | null)?.closest?.('button, textarea, input, select, a');

const boardHist = new Map<string, { undo: string[]; redo: string[] }>();
function commitBoard(d: DocEngine, b: BoardData, record = true) {
  if (record) {
    const h = boardHist.get(d.id) || { undo: [], redo: [] };
    h.undo.push(JSON.stringify(boardOf(d)));
    if (h.undo.length > 60) h.undo.shift();
    h.redo = [];
    boardHist.set(d.id, h);
  }
  d.board = b;
  d.dirty = true;
  d.meta.modified = Date.now();
  d.emit();
}

export async function boardAddFiles(files: File[], at?: { x: number; y: number }) {
  const d = activeDoc();
  if (!d) return;
  const b = boardOf(d);
  let x = at?.x ?? 60, y = at?.y ?? 60, added = 0;
  const items = [...b.items];
  for (const f of files) {
    if (!f.type.startsWith('image/')) { toast(`${f.name}: only image files can be added to the board.`, 'error'); continue; }
    if (f.size > MAX_REF) { toast(`${f.name} is larger than 25 MB.`, 'error'); continue; }
    try {
      const { id, img } = await assetFrom(d, await blobToDataURL(f));
      const s = Math.min(1, 360 / Math.max(img.width, img.height));
      items.push({ id: uid('bi'), type: 'image', x, y, w: Math.round(img.width * s), h: Math.round(img.height * s) + 26, title: f.name.replace(/\.[^.]+$/, '').slice(0, 60), asset: id, tag: 'other' });
      x += 30; y += 30; added++;
    } catch { toast(`${f.name} could not be decoded as an image.`, 'error'); }
  }
  if (added) { commitBoard(d, { ...b, items }); toast(`Added ${added} reference${added > 1 ? 's' : ''} to the board`, 'success'); }
}

type Drag = { k: 'pan'; sx: number; sy: number; vx: number; vy: number } | { k: 'move'; id: string; sx: number; sy: number; orig: BoardItem[]; moved: boolean } | { k: 'resize'; id: string; sx: number; sy: number; orig: BoardItem[] };

export default function OrbitBoard() {
  useApp((s) => s.tick);
  const d = activeDoc();
  const ref = useRef<HTMLDivElement>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [filter, setFilter] = useState<BoardTag | 'all'>('all');
  const [local, setLocal] = useState<BoardData | null>(null); // live state during drags
  const [linkSel, setLinkSel] = useState('');
  const drag = useRef<Drag | null>(null);
  const space = useRef(false);
  const b = local || boardOf(d);
  const bRef = useRef(b);
  bRef.current = b;

  useEffect(() => { setSel(null); setLocal(null); }, [d?.id]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const dd = activeDoc();
      if (!dd) return;
      const cur = boardOf(dd), r = el.getBoundingClientRect();
      if (e.shiftKey && !e.ctrlKey) { dd.board = { ...cur, view: { ...cur.view, x: cur.view.x - e.deltaY, y: cur.view.y } }; dd.emit(); return; }
      const z = Math.max(0.1, Math.min(4, cur.view.z * Math.pow(1.0015, -e.deltaY)));
      const mx = e.clientX - r.left, my = e.clientY - r.top, k = z / cur.view.z;
      dd.board = { ...cur, view: { z, x: mx - (mx - cur.view.x) * k, y: my - (my - cur.view.y) * k } };
      dd.emit();
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, [d?.id]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      if (getApp().dialog || getApp().confirmReq) return;
      const dd = activeDoc();
      if (!dd) return;
      const ctrl = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
      const h = boardHist.get(dd.id) || { undo: [], redo: [] };
      let handled = true;
      if (e.code === 'Space') { space.current = true; handled = false; }
      else if (ctrl && k === 'z' && !e.shiftKey) { const u = h.undo.pop(); if (u) { h.redo.push(JSON.stringify(boardOf(dd))); commitBoard(dd, JSON.parse(u), false); } else toast('Nothing to undo on the board'); boardHist.set(dd.id, h); }
      else if (ctrl && (k === 'y' || (k === 'z' && e.shiftKey))) { const r = h.redo.pop(); if (r) { h.undo.push(JSON.stringify(boardOf(dd))); commitBoard(dd, JSON.parse(r), false); } boardHist.set(dd.id, h); }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && selRef.current) { const cur = boardOf(dd); commitBoard(dd, { ...cur, items: cur.items.filter((i) => i.id !== selRef.current) }); setSel(null); }
      else if (ctrl) handled = false;
      else if (e.key === 'Escape') setSel(null);
      else handled = false;
      if (handled) { e.preventDefault(); e.stopPropagation(); }
    };
    const ku = (e: KeyboardEvent) => { if (e.code === 'Space') space.current = false; };
    window.addEventListener('keydown', key, true);
    window.addEventListener('keyup', ku);
    return () => { window.removeEventListener('keydown', key, true); window.removeEventListener('keyup', ku); };
  }, []);
  const selRef = useRef(sel);
  selRef.current = sel;

  if (!d) return <div className="flex h-full items-center justify-center text-sm text-neutral-500">Open or create a document. Its Orbit Board is saved inside the project.</div>;
  const v = b.view;
  const toBoard = (cx: number, cy: number) => { const r = ref.current!.getBoundingClientRect(); return { x: (cx - r.left - v.x) / v.z, y: (cy - r.top - v.y) / v.z }; };
  const center = () => { const r = ref.current!.getBoundingClientRect(); return toBoard(r.left + r.width / 2 - 120, r.top + r.height / 2 - 90); };
  const addItem = (it: Omit<BoardItem, 'id' | 'x' | 'y'> & Partial<Pick<BoardItem, 'x' | 'y'>>) => {
    const c = center();
    const item = { id: uid('bi'), x: Math.round(c.x), y: Math.round(c.y), ...it } as BoardItem;
    commitBoard(d, { ...b, items: it.type === 'group' ? [item, ...b.items] : [...b.items, item] });
    setSel(item.id);
  };
  const up = (id: string, p: Partial<BoardItem>, record = true) => commitBoard(d, { ...b, items: b.items.map((i) => (i.id === id ? { ...i, ...p } : i)) }, record);
  const contains = (g: BoardItem, i: BoardItem) => i.id !== g.id && i.type !== 'group' && i.x + i.w / 2 > g.x && i.x + i.w / 2 < g.x + g.w && i.y + i.h / 2 > g.y && i.y + i.h / 2 < g.y + g.h;

  const onDown = (e: React.PointerEvent, id: string | null, mode: 'move' | 'resize' = 'move') => {
    if (e.button === 1 || space.current || (!id && e.button === 0)) {
      drag.current = { k: 'pan', sx: e.clientX, sy: e.clientY, vx: v.x, vy: v.y };
      if (!id) setSel(null);
    } else if (id && e.button === 0) {
      drag.current = mode === 'resize' ? { k: 'resize', id, sx: e.clientX, sy: e.clientY, orig: b.items } : { k: 'move', id, sx: e.clientX, sy: e.clientY, orig: b.items, moved: false };
      setSel(id);
    } else return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.stopPropagation();
  };
  const onMove = (e: React.PointerEvent) => {
    const g = drag.current;
    if (!g) return;
    if (g.k === 'pan') { setLocal({ ...bRef.current, view: { ...v, x: g.vx + e.clientX - g.sx, y: g.vy + e.clientY - g.sy } }); return; }
    const dx = (e.clientX - g.sx) / v.z, dy = (e.clientY - g.sy) / v.z;
    const target = g.orig.find((i) => i.id === g.id)!;
    let items: BoardItem[];
    if (g.k === 'resize') items = g.orig.map((i) => (i.id === g.id ? { ...i, w: Math.max(80, Math.round(i.w + dx)), h: Math.max(50, Math.round(i.h + dy)) } : i));
    else {
      if (Math.hypot(dx, dy) > 2) g.moved = true;
      const carry = target.type === 'group' ? new Set(g.orig.filter((i) => contains(target, i)).map((i) => i.id)) : new Set<string>();
      items = g.orig.map((i) => (i.id === g.id || carry.has(i.id) ? { ...i, x: Math.round(i.x + dx), y: Math.round(i.y + dy) } : i));
    }
    setLocal({ ...bRef.current, items });
  };
  const onUp = () => {
    const g = drag.current;
    drag.current = null;
    if (!g || !local) { setLocal(null); return; }
    if (g.k === 'pan') { d.board = { ...boardOf(d), view: local.view }; d.emit(); }
    else if (g.k === 'resize' || g.moved) commitBoard(d, { ...boardOf(d), items: local.items });
    setLocal(null);
  };
  const fit = () => {
    if (!b.items.length || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const minX = Math.min(...b.items.map((i) => i.x)), minY = Math.min(...b.items.map((i) => i.y));
    const maxX = Math.max(...b.items.map((i) => i.x + i.w)), maxY = Math.max(...b.items.map((i) => i.y + i.h));
    const z = Math.max(0.1, Math.min(2, Math.min((r.width - 80) / (maxX - minX), (r.height - 80) / (maxY - minY))));
    d.board = { ...b, view: { z, x: 40 - minX * z + (r.width - 80 - (maxX - minX) * z) / 2, y: 40 - minY * z } };
    d.emit();
  };

  // link targets from open documents
  const targets: { value: string; label: string; link: BoardLink }[] = [];
  for (const L of d.layers) if (L.type !== 'group') targets.push({ value: `layer:${L.id}`, label: `Layer · ${L.name}`, link: { kind: 'layer', doc: d.meta.uuid, docName: d.name, layerId: L.id, label: L.name } });
  for (const x of getApp().docs) {
    if (x.scene3d) {
      const s = sceneOf(x.scene3d);
      targets.push({ value: `scene:${x.id}`, label: `3D scene · ${x.name}`, link: { kind: 'scene', doc: x.meta.uuid, docName: x.name, label: `${x.name} (scene)` } });
      for (const vw of s.views) targets.push({ value: `view:${x.id}:${vw.id}`, label: `3D view · ${x.name} › ${vw.name}`, link: { kind: 'scene', doc: x.meta.uuid, docName: x.name, viewId: vw.id, label: vw.name } });
    }
    if (x.comic) {
      targets.push({ value: `page:${x.id}`, label: `Comic page · ${x.comic.name} › ${x.comic.pageName}`, link: { kind: 'page', doc: x.meta.uuid, docName: x.name, label: x.comic.pageName } });
      let n = 0;
      for (const L of x.layers) if (L.type === 'comic') for (const o of L.comic || []) if (o.type === 'panel') { n++; targets.push({ value: `panel:${x.id}:${o.id}`, label: `Panel · ${x.comic.pageName} › panel ${n}`, link: { kind: 'panel', doc: x.meta.uuid, docName: x.name, panelId: o.id, label: `${x.comic.pageName}, panel ${n}` } }); }
    }
  }
  const selItem = b.items.find((i) => i.id === sel);
  const broken = b.items.filter((i) => itemHealth(i, d)).length;
  const pal = getApp().palettes.find((p) => p.id === getApp().activePalette) || getApp().palettes[0];
  const ordered = [...b.items.filter((i) => i.type === 'group'), ...b.items.filter((i) => i.type !== 'group')];

  return (
    <div className="absolute inset-0 flex flex-col bg-[#121214]">
      <div className="flex flex-wrap items-center gap-1 border-b border-black/60 bg-[#18181b] px-2 py-1.5 text-[11px]">
        <span className="mr-1 font-semibold uppercase tracking-wider text-[#E8913A]">Orbit Board</span>
        <Btn onClick={async () => { const f = await pickFile('image/png,image/jpeg,image/webp,image/gif'); if (f) boardAddFiles([f], center()); }}><ImageIcon size={11} /> Image…</Btn>
        <Select value="" onChange={async (id) => { const x = getApp().docs.find((q) => q.id === id); if (!x) return; const c = compositeDoc(x, Math.min(1, 720 / Math.max(x.width, x.height))); const { id: a } = await assetFrom(d, c.toDataURL('image/png')); addItem({ type: 'sketch', w: c.width / 2, h: c.height / 2 + 26, title: `${x.name} (snapshot ${new Date().toLocaleDateString()})`, asset: a, tag: 'other' }); }} options={[{ value: '', label: '+ Artwork snapshot…' }, ...getApp().docs.map((x) => ({ value: x.id, label: x.name }))]} />
        <Btn onClick={() => addItem({ type: 'note', w: 220, h: 150, title: 'Note', text: '', color: '#3a3320', tag: 'other' })}><StickyNote size={11} /> Note</Btn>
        <Btn onClick={() => pal && addItem({ type: 'palette', w: 260, h: 110, title: pal.name, colors: [...pal.colors], tag: 'palettes' })}><Palette size={11} /> Palette</Btn>
        <Select value={linkSel} onChange={(val) => { const t = targets.find((x) => x.value === val); setLinkSel(''); if (t) addItem({ type: 'link', w: 230, h: 90, title: t.link.label, link: t.link, tag: t.link.kind === 'scene' ? 'scenes' : 'other' }); }} options={[{ value: '', label: '+ Link to…' }, ...targets.map((t) => ({ value: t.value, label: t.label }))]} />
        <Btn onClick={() => addItem({ type: 'group', w: 520, h: 360, title: 'Group', color: '#E8913A', tag: 'other' })}><Frame size={11} /> Group</Btn>
        <div className="mx-1 h-4 w-px bg-white/10" />
        <Select value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All tags' }, ...TAGS.map((t) => ({ value: t, label: t[0].toUpperCase() + t.slice(1) }))]} />
        <Btn onClick={fit}><Maximize size={11} /> Fit</Btn>
        <Btn onClick={() => { d.board = { ...b, view: { ...v, z: 1 } }; d.emit(); }}>100%</Btn>
        <span className="ml-auto text-neutral-500">{b.items.length} items{broken ? <span className="ml-2 text-amber-300">· {broken} broken reference{broken > 1 ? 's' : ''}</span> : null} · {Math.round(v.z * 100)}%</span>
      </div>
      <div className="relative min-h-0 flex-1">
        <div
          ref={ref}
          className="absolute inset-0 overflow-hidden"
          style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.07) 1px, transparent 1px)', backgroundSize: `${24 * v.z}px ${24 * v.z}px`, backgroundPosition: `${v.x}px ${v.y}px`, cursor: drag.current?.k === 'pan' ? 'grabbing' : 'default' }}
          onPointerDown={(e) => { if (!interactive(e.target)) onDown(e, null); }} onPointerMove={onMove} onPointerUp={onUp}
          onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); e.stopPropagation(); } }}
          onDrop={(e) => { e.preventDefault(); e.stopPropagation(); boardAddFiles(Array.from(e.dataTransfer.files), toBoard(e.clientX, e.clientY)); }}
        >
          <div className="absolute left-0 top-0 origin-top-left" style={{ transform: `translate(${v.x}px, ${v.y}px) scale(${v.z})` }}>
            {ordered.map((it) => {
              const bad = itemHealth(it, d);
              const dim = filter !== 'all' && it.tag !== filter;
              const isSel = it.id === sel;
              if (it.type === 'group') return (
                <div key={it.id} className={cn('absolute rounded-xl border-2 border-dashed', isSel && 'ring-2 ring-white/40', dim && 'opacity-25')} style={{ left: it.x, top: it.y, width: it.w, height: it.h, borderColor: it.color, background: (it.color || '#E8913A') + '0d' }}>
                  <div className="cursor-move px-3 py-1 text-[13px] font-semibold" style={{ color: it.color }} onPointerDown={(e) => onDown(e, it.id)}>{it.title}</div>
                  <div className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize" onPointerDown={(e) => onDown(e, it.id, 'resize')} />
                </div>
              );
              return (
                <div key={it.id} onPointerDown={(e) => { if (interactive(e.target)) { e.stopPropagation(); setSel(it.id); } else onDown(e, it.id); }} className={cn('absolute flex flex-col overflow-hidden rounded-lg border bg-[#1e1e21] shadow-xl', isSel ? 'border-[#E8913A]' : bad ? 'border-amber-500/60' : 'border-white/10', dim && 'opacity-25')} style={{ left: it.x, top: it.y, width: it.w, height: it.h, background: it.type === 'note' ? it.color : undefined }}>
                  <div className="flex h-[26px] shrink-0 cursor-move items-center gap-1 border-b border-black/30 bg-black/25 px-2 text-[11px] text-neutral-200" onPointerDown={(e) => onDown(e, it.id)}>
                    {it.type === 'link' ? <Link2 size={11} className="text-sky-300" /> : it.type === 'palette' ? <Palette size={11} /> : it.type === 'note' ? <StickyNote size={11} /> : it.type === 'sketch' ? <LayersIcon size={11} /> : <FileImage size={11} />}
                    <span className="truncate">{it.title}</span>
                    {it.tag && it.tag !== 'other' && <span className="ml-auto rounded bg-white/10 px-1 text-[9px] uppercase text-neutral-400">{it.tag}</span>}
                    {bad && <span title={bad}><AlertTriangle size={11} className="ml-1 text-amber-400" /></span>}
                  </div>
                  <div className="min-h-0 flex-1" onPointerDown={(e) => { if (it.type === 'image' || it.type === 'sketch') onDown(e, it.id); }}>
                    {(it.type === 'image' || it.type === 'sketch') && (it.asset && d.assets[it.asset] ? <img src={d.assets[it.asset]} alt={it.title} draggable={false} className="h-full w-full object-contain" /> : <div className="flex h-full items-center justify-center p-2 text-center text-[11px] text-amber-300">{bad}</div>)}
                    {it.type === 'note' && <textarea defaultValue={it.text} key={it.text} placeholder="Write a note…" onKeyDown={(e) => e.stopPropagation()} onBlur={(e) => e.target.value !== (it.text || '') && up(it.id, { text: e.target.value })} className="h-full w-full resize-none bg-transparent p-2 text-[12px] leading-snug text-neutral-100 outline-none" />}
                    {it.type === 'palette' && <div className="flex flex-wrap gap-1 p-2">{(it.colors || []).map((c, i) => <button key={c + i} title={`${c.toUpperCase()}: click to use`} onClick={() => setColor(c)} className="h-6 w-6 rounded border border-black/40 hover:ring-2 hover:ring-white/50" style={{ background: c }} />)}</div>}
                    {it.type === 'link' && it.link && (
                      <div className="space-y-1 p-2 text-[11px]">
                        <div className="flex items-center gap-1 text-neutral-400">{it.link.kind === 'scene' ? <Box size={11} /> : <LayersIcon size={11} />} {it.link.kind} in “{it.link.docName}”</div>
                        {bad ? <div className="text-amber-300">{bad}</div> : <Btn onClick={() => followLink(it.link!)}><ExternalLink size={10} /> Open</Btn>}
                      </div>
                    )}
                  </div>
                  {it.text && it.type !== 'note' && <div className="shrink-0 border-t border-white/5 px-2 py-1 text-[10px] text-neutral-400">{it.text}</div>}
                  <div className="absolute bottom-0 right-0 h-3 w-3 cursor-nwse-resize" style={{ background: 'linear-gradient(135deg, transparent 50%, rgba(255,255,255,0.3) 50%)' }} onPointerDown={(e) => onDown(e, it.id, 'resize')} />
                </div>
              );
            })}
          </div>
          {!b.items.length && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="max-w-md text-center text-[12px] leading-relaxed text-neutral-500">
                <div className="mb-2 text-sm text-neutral-300">An empty board for this project</div>
                Drop reference images here, or add artwork snapshots, notes, palettes and links to layers, 3D views and comic panels. Use groups to sort characters, environments and props.
                <div className="mt-2 text-[11px]">Wheel to zoom · drag empty space or middle-drag to pan · Delete removes · Ctrl+Z undoes</div>
              </div>
            </div>
          )}
        </div>
        {selItem && (
          <div className="absolute right-3 top-3 w-64 space-y-1.5 rounded-lg border border-white/10 bg-[#1c1c1f]/95 p-2.5 text-[11px] shadow-2xl backdrop-blur" onPointerDown={(e) => e.stopPropagation()}>
            <input value={selItem.title} onChange={(e) => up(selItem.id, { title: e.target.value.slice(0, 80) }, false)} onKeyDown={(e) => e.stopPropagation()} className="w-full rounded bg-neutral-900 px-2 py-1 text-neutral-100 outline-none ring-1 ring-white/10" aria-label="Title" />
            {selItem.type !== 'note' && selItem.type !== 'group' && <textarea defaultValue={selItem.text} key={selItem.id} placeholder="Label or description…" rows={2} onKeyDown={(e) => e.stopPropagation()} onBlur={(e) => up(selItem.id, { text: e.target.value.slice(0, 500) })} className="w-full rounded bg-neutral-900 px-2 py-1 text-neutral-200 outline-none ring-1 ring-white/10" />}
            <Select label="Tag" value={selItem.tag || 'other'} onChange={(t) => up(selItem.id, { tag: t })} options={TAGS.map((t) => ({ value: t, label: t }))} />
            {(selItem.type === 'group' || selItem.type === 'note') && <div className="flex items-center gap-2 text-neutral-500">Color<input type="color" value={selItem.color || '#E8913A'} onChange={(e) => up(selItem.id, { color: e.target.value }, false)} /></div>}
            {(selItem.type === 'image' || selItem.type === 'sketch') && selItem.asset && d.assets[selItem.asset] && (
              <div className="flex flex-wrap gap-1">
                <Btn onClick={async () => { try { const img = d.assetImgs.get(selItem.asset!)!; const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; c.getContext('2d')!.drawImage(img, 0, 0); const { extractPalette } = await import('./PaletteMemory'); const cols = extractPalette(c, 8); addItem({ type: 'palette', w: 260, h: 110, title: `${selItem.title} palette`, colors: cols, tag: 'palettes' }); } catch (e) { toast(String(e), 'error'); } }}>Extract palette</Btn>
              </div>
            )}
            {selItem.type === 'link' && selItem.link && !itemHealth(selItem, d) && <Btn onClick={() => followLink(selItem.link!)}><ExternalLink size={10} /> Open linked item</Btn>}
            <Btn variant="danger" onClick={() => { commitBoard(d, { ...b, items: b.items.filter((i) => i.id !== selItem.id) }); setSel(null); }}><Trash2 size={11} /> Remove from board</Btn>
            {selItem.type === 'group' && <p className="text-[10px] text-neutral-500">Items whose centers sit inside the frame move with it.</p>}
          </div>
        )}
      </div>
    </div>
  );
}
