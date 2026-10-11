// Palette Memory (Windows edition): named global palettes (Carbon's existing palette system), palettes generated
// from images, and project palette snapshots stored in the .carbon file (manifest.extensions.paletteMemory).
import { useState } from 'react';
import { Camera, Clipboard, Copy, ImagePlus, RotateCcw, Trash2 } from 'lucide-react';
import { compositeDoc } from '../engine/render';
import { blobToDataURL, hexToRgb, loadImage, rgbToHex, uid } from '../engine/util';
import { activeDoc, confirmDialog, getApp, promptDialog, setApp, setColor, toast, useApp } from '../state/store';
import { pickFile } from '../state/actions';
import { Btn, Select, Slider } from '../components/ui';

export interface PMSnap { id: string; name: string; at: number; note: string; palette: { name: string; colors: string[]; names: string[] } }
export interface PMData { version: 1; snapshots: PMSnap[] }
export const pmOf = (raw: unknown): PMData => { const p = raw as PMData | null; return p && Array.isArray(p.snapshots) ? p : { version: 1, snapshots: [] }; };

/** Median-cut palette extraction (ignores mostly-transparent pixels). Returns up to k colors, most common first. */
export function extractPalette(src: HTMLCanvasElement | HTMLImageElement, k: number): string[] {
  const s = Math.min(1, 128 / Math.max(src.width, src.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(src.width * s));
  c.height = Math.max(1, Math.round(src.height * s));
  const x = c.getContext('2d', { willReadFrequently: true })!;
  x.imageSmoothingEnabled = false;
  x.drawImage(src, 0, 0, c.width, c.height);
  const d = x.getImageData(0, 0, c.width, c.height).data;
  const px: number[][] = [];
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] >= 128) px.push([d[i], d[i + 1], d[i + 2]]);
  if (!px.length) return [];
  let boxes: number[][][] = [px];
  while (boxes.length < k) {
    let bi = -1, best = 0, ch = 0;
    boxes.forEach((b, i) => {
      if (b.length < 2) return;
      for (let c2 = 0; c2 < 3; c2++) {
        let mn = 255, mx = 0;
        for (const p of b) { if (p[c2] < mn) mn = p[c2]; if (p[c2] > mx) mx = p[c2]; }
        if (mx - mn > best) { best = mx - mn; bi = i; ch = c2; }
      }
    });
    if (bi < 0 || best === 0) break;
    const b = boxes[bi].slice().sort((p, q) => p[ch] - q[ch]);
    const mid = b.length >> 1;
    boxes.splice(bi, 1, b.slice(0, mid), b.slice(mid));
  }
  boxes = boxes.sort((a, b) => b.length - a.length);
  const out: string[] = [];
  for (const b of boxes) {
    const avg = [0, 1, 2].map((ci) => b.reduce((a, p) => a + p[ci], 0) / b.length);
    const hex = rgbToHex(avg[0], avg[1], avg[2]);
    if (!out.includes(hex)) out.push(hex);
  }
  return out;
}

export async function copyText(t: string) {
  try { await navigator.clipboard.writeText(t); toast(`Copied ${t.length > 40 ? 'colors' : t}`, 'success'); }
  catch {
    const ta = document.createElement('textarea');
    ta.value = t; document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy'); ta.remove();
    toast(ok ? 'Copied' : 'Clipboard is unavailable in this environment', ok ? 'success' : 'error');
  }
}

export function PaletteMemoryPanel() {
  useApp((s) => s.tick);
  const palettes = useApp((s) => s.palettes);
  const active = useApp((s) => s.activePalette);
  const [k, setK] = useState(8);
  const d = activeDoc();
  const pal = palettes.find((p) => p.id === active) || palettes[0];
  const pm = pmOf(d?.paletteMemory);

  const generate = async (fromCanvas: boolean) => {
    let src: HTMLCanvasElement | HTMLImageElement;
    let name: string;
    if (fromCanvas) {
      if (!d) return;
      src = compositeDoc(d, Math.min(1, 512 / Math.max(d.width, d.height)));
      name = `${d.name} palette`;
    } else {
      const f = await pickFile('image/png,image/jpeg,image/webp,image/gif');
      if (!f) return;
      if (f.size > 25 * 1024 * 1024) return toast('Image is larger than 25 MB.', 'error');
      try { src = await loadImage(await blobToDataURL(f)); } catch { return toast('That file could not be decoded as an image.', 'error'); }
      name = f.name.replace(/\.[^.]+$/, '') + ' palette';
    }
    const colors = extractPalette(src, k);
    if (!colors.length) return toast('No opaque pixels found to sample.', 'error');
    const id = uid('pal-');
    setApp({ palettes: [...getApp().palettes, { id, name, colors, names: colors.map(() => '') }], activePalette: id });
    toast(`Created “${name}” with ${colors.length} colors`, 'success');
  };
  const snapshot = async () => {
    if (!d || !pal) return;
    const n = await promptDialog('Palette snapshot', 'Name this project milestone (e.g. “Color script v2”):', `${pal.name}, ${new Date().toLocaleDateString()}`);
    if (n === null) return;
    const snap: PMSnap = { id: uid('pm'), name: n.slice(0, 80), at: Date.now(), note: '', palette: { name: pal.name, colors: [...pal.colors], names: pal.colors.map((_, i) => pal.names?.[i] || '') } };
    d.paletteMemory = { version: 1, snapshots: [snap, ...pm.snapshots] };
    d.dirty = true; d.emit();
    toast('Palette snapshot saved in this project', 'success');
  };
  const restore = (s: PMSnap) => {
    const id = uid('pal-');
    setApp({ palettes: [...getApp().palettes, { id, name: `${s.palette.name} (${s.name})`, colors: [...s.palette.colors], names: [...s.palette.names] }], activePalette: id });
    toast('Snapshot restored as a new global palette. Exact values are preserved.', 'success');
  };

  return (
    <div className="space-y-2 text-[11px]">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Palettes</div>
      <Select value={pal?.id || ''} onChange={(id) => setApp({ activePalette: id })} options={palettes.map((p) => ({ value: p.id, label: `${p.name} (${p.colors.length})` }))} />
      {pal && (
        <div className="max-h-56 space-y-px overflow-y-auto rounded border border-white/5 p-1">
          {pal.colors.map((c, i) => (
            <div key={c + i} className="flex items-center gap-2 rounded px-1 py-0.5 hover:bg-white/5">
              <button title="Use as foreground" onClick={() => setColor(c)} className="h-5 w-5 shrink-0 rounded border border-black/40" style={{ background: c }} />
              <span className="w-14 truncate text-neutral-400">{pal.names?.[i] || ''}</span>
              <button className="font-mono text-neutral-200 hover:underline" title="Copy HEX" onClick={() => copyText(c.toUpperCase())}>{c.toUpperCase()}</button>
              <button className="ml-auto font-mono text-[10px] text-neutral-500 hover:text-neutral-200" title="Copy RGB" onClick={() => copyText(`rgb(${hexToRgb(c).join(', ')})`)}>{hexToRgb(c).join(', ')}</button>
            </div>
          ))}
          {!pal.colors.length && <div className="p-1 text-neutral-500">Empty palette.</div>}
        </div>
      )}
      {pal && <Btn onClick={() => copyText(pal.colors.map((c, i) => `${pal.names?.[i] ? pal.names[i] + ' ' : ''}${c.toUpperCase()}  rgb(${hexToRgb(c).join(', ')})`).join('\n'))}><Clipboard size={11} /> Copy all values</Btn>}

      <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Generate from image</div>
      <Slider label="Colors" value={k} min={3} max={16} step={1} fmt={(v) => String(v)} onChange={setK} />
      <div className="flex flex-wrap gap-1"><Btn onClick={() => generate(false)}><ImagePlus size={11} /> From image file…</Btn><Btn disabled={!d} onClick={() => generate(true)}><Camera size={11} /> From current artwork</Btn></div>

      <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Project snapshots{d ? ` · ${d.name}` : ''}</div>
      <Btn disabled={!d || !pal} onClick={snapshot}><Copy size={11} /> Snapshot current palette into project</Btn>
      {pm.snapshots.map((s) => (
        <div key={s.id} className="rounded border border-white/5 p-1.5">
          <div className="flex items-center gap-1"><span className="flex-1 truncate text-neutral-200">{s.name}</span><span className="text-[10px] text-neutral-500">{new Date(s.at).toLocaleDateString()}</span></div>
          <div className="my-1 flex flex-wrap gap-0.5">{s.palette.colors.map((c, i) => <button key={c + i} title={`${c.toUpperCase()} · rgb(${hexToRgb(c).join(', ')})`} onClick={() => setColor(c)} className="h-4 w-4 rounded-sm border border-black/40" style={{ background: c }} />)}</div>
          <div className="flex gap-1">
            <Btn onClick={() => restore(s)}><RotateCcw size={10} /> Restore as palette</Btn>
            <Btn onClick={() => copyText(s.palette.colors.map((c) => c.toUpperCase()).join(', '))}><Clipboard size={10} /></Btn>
            <Btn onClick={async () => { if (!d) return; if ((await confirmDialog('Delete snapshot?', `Remove “${s.name}” from this project?`, [{ label: 'Cancel', value: 'n' }, { label: 'Delete', value: 'y', variant: 'danger' }])) === 'y') { d.paletteMemory = { version: 1, snapshots: pm.snapshots.filter((x) => x.id !== s.id) }; d.dirty = true; d.emit(); } }}><Trash2 size={10} /></Btn>
          </div>
        </div>
      ))}
      {d && !pm.snapshots.length && <p className="text-[10px] text-neutral-500">Snapshots record a palette at a project milestone and are saved inside the .carbon file. Values are stored exactly as HEX.</p>}
    </div>
  );
}
