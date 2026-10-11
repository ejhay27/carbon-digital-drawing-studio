import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Copy, Pencil, Pipette, Plus, Replace, Trash2 } from 'lucide-react';
import { activeDoc, confirmDialog, getApp, promptDialog, setApp, setColor, toast, useApp } from '../state/store';
import { uid } from '../engine/util';
import { Select, Slider, Toggle } from '../components/ui';
import { cn } from '../utils/cn';
import {
  addToDock, duplicateSwatch, globalSetId, moveSwatch, norm, parseColorInput, readDock, removeSwatch, renameSwatch, replaceSwatch, rgbLabel,
  startDockPick, updateDock, useDock, writeDock, type DockCfg, type DockScope, type Swatches,
} from './dockModel';

function useWindowSize() {
  const [s, set] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const f = () => set({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', f);
    return () => window.removeEventListener('resize', f);
  }, []);
  return s;
}

/** Effective layout after adapting to the available workspace (keeps the canvas usable). */
export function effectiveDock(cfg: DockCfg, win: { w: number; h: number }) {
  let placement = cfg.placement, layout = cfg.layout;
  if (placement !== 'bottom' && win.w < 900) placement = 'bottom'; // narrow window: side dock would squeeze the canvas
  if (placement === 'bottom' && win.h < 560) layout = 'compact';
  if (placement !== 'bottom' && layout === 'expanded' && win.w < 1200) layout = 'compact';
  return { placement, layout, adapted: placement !== cfg.placement || layout !== cfg.layout };
}

interface Menu { idx: number; x: number; y: number } // swatch context menu position

export default function ColorDock({ side }: { side: 'start' | 'end' }) {
  const cfg = useDock((s) => s.cfg);
  const picking = useDock((s) => !!s.pick);
  useApp((s) => s.tick);
  const fg = useApp((s) => s.fg);
  const palettes = useApp((s) => s.palettes);
  const win = useWindowSize();
  const eff = effectiveDock(cfg, win);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [input, setInput] = useState('');
  const [showInput, setShowInput] = useState(false);
  const [over, setOver] = useState<number | null>(null);
  const drag = useRef<{ idx: number; x: number; y: number; moved: boolean; timer: number | null; long: boolean } | null>(null);
  const suppress = useRef(false);
  const doc = activeDoc();
  const want = eff.placement === 'left' ? 'start' : 'end';
  if (!cfg.enabled || side !== want) return null;

  const scope = cfg.scope;
  const sw = readDock(scope);
  const write = (s: Swatches) => writeDock(scope, s);
  const bottom = eff.placement === 'bottom';
  const expanded = eff.layout === 'expanded';
  const S = cfg.size;

  // ---------------- swatch pointer handling (mouse, touch and stylus): tap selects, drag reorders, long-press opens the menu
  const onDown = (e: React.PointerEvent, idx: number) => {
    e.stopPropagation();
    if (e.button === 2) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    suppress.current = false;
    const d = { idx, x: e.clientX, y: e.clientY, moved: false, timer: null as number | null, long: false };
    if (e.pointerType !== 'mouse') d.timer = window.setTimeout(() => { d.long = true; suppress.current = true; setMenu({ idx, x: e.clientX, y: e.clientY }); }, 520);
    drag.current = d;
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) { d.moved = true; if (d.timer) clearTimeout(d.timer); }
    if (d.moved) {
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-dock-idx]') as HTMLElement | null;
      setOver(el ? Number(el.dataset.dockIdx) : null);
    }
  };
  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.timer) clearTimeout(d.timer);
    if (d.moved) {
      suppress.current = true;
      if (sw && over !== null && over !== d.idx) write(moveSwatch(sw, d.idx, over));
    }
    setOver(null);
  };
  const select = (hex: string) => {
    if (suppress.current) { suppress.current = false; return; }
    setColor(hex);
  };
  const onKey = (e: React.KeyboardEvent, idx: number) => {
    if (!sw) return;
    e.stopPropagation();
    if (e.key === 'Delete' || e.key === 'Backspace') { write(removeSwatch(sw, idx)); e.preventDefault(); }
    else if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowUp')) { write(moveSwatch(sw, idx, idx - 1)); e.preventDefault(); }
    else if (e.altKey && (e.key === 'ArrowRight' || e.key === 'ArrowDown')) { write(moveSwatch(sw, idx, idx + 1)); e.preventDefault(); }
    else if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) { const r = (e.target as HTMLElement).getBoundingClientRect(); setMenu({ idx, x: r.left, y: r.bottom }); e.preventDefault(); }
  };

  const addTyped = () => {
    const hex = parseColorInput(input);
    if (!hex) return toast('Enter a HEX value (#1E90FF) or R,G,B (30, 144, 255)', 'error');
    if (addToDock(hex, scope)) setInput('');
  };

  const menuAction = async (a: 'select' | 'rename' | 'replace' | 'duplicate' | 'delete') => {
    const m = menu;
    setMenu(null);
    if (!m || !sw) return;
    const hex = sw.colors[m.idx];
    if (a === 'select') setColor(hex);
    if (a === 'rename') { const n = await promptDialog('Rename swatch', `Label for ${hex.toUpperCase()}:`, sw.names[m.idx] || ''); if (n !== null) write(renameSwatch(readDock(scope) || sw, m.idx, n)); }
    if (a === 'replace') write(replaceSwatch(sw, m.idx, getApp().fg));
    if (a === 'duplicate') write(duplicateSwatch(sw, m.idx));
    if (a === 'delete') write(removeSwatch(sw, m.idx));
  };

  const header = (
    <div className={cn('flex shrink-0 items-center gap-1', bottom ? 'flex-row' : expanded ? 'flex-row flex-wrap' : 'flex-col')}>
      <button title="Add current foreground color" onClick={() => addToDock(fg, scope)} className="flex h-6 w-6 items-center justify-center rounded border border-white/15 hover:border-white/40" style={{ background: fg }}>
        <Plus size={12} className="mix-blend-difference text-white" />
      </button>
      <button title="Sample a color from the canvas into the dock" onClick={startDockPick} className={cn('flex h-6 w-6 items-center justify-center rounded', picking ? 'bg-[#E8913A] text-black' : 'text-neutral-400 hover:bg-white/10 hover:text-white')}><Pipette size={13} /></button>
      <button title="Add by HEX or RGB" onClick={() => setShowInput(!showInput)} className={cn('flex h-6 w-6 items-center justify-center rounded text-[10px] font-semibold', showInput ? 'bg-white/15 text-white' : 'text-neutral-400 hover:bg-white/10')}>#</button>
      <div className={cn('flex rounded bg-black/30 p-0.5 text-[9px]', !bottom && !expanded && 'flex-col')}>
        {(['global', 'project'] as DockScope[]).map((sc) => (
          <button key={sc} title={sc === 'global' ? 'Global swatch set (all documents)' : 'Project dock (saved in this .carbon file)'} onClick={() => updateDock({ scope: sc })}
            className={cn('rounded px-1 py-0.5 uppercase', scope === sc ? 'bg-[#E8913A] text-black' : 'text-neutral-400 hover:text-white')}>{sc === 'global' ? 'G' : 'P'}</button>
        ))}
      </div>
      {SetMenu({ scope, sw, compact: !bottom && !expanded })}
    </div>
  );

  const inputRow = showInput && (
    <div className={cn('flex gap-1', !bottom && !expanded && 'flex-col')}>
      <input autoFocus value={input} onChange={(e) => setInput(e.target.value)} placeholder="#hex or r,g,b"
        onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') addTyped(); if (e.key === 'Escape') setShowInput(false); }}
        className={cn('rounded bg-neutral-900 px-1.5 py-1 text-[11px] text-neutral-100 outline-none ring-1 ring-white/10 focus:ring-[#E8913A]/60', bottom ? 'w-28' : 'w-full')} aria-label="Color value" />
      <button onClick={addTyped} className="rounded bg-white/10 px-1.5 text-[10px] text-neutral-200 hover:bg-white/20">Add</button>
    </div>
  );

  const swatches = sw && sw.colors.length ? (
    <div
      className={cn('min-h-0 min-w-0', bottom ? (expanded ? 'flex flex-1 flex-wrap content-start gap-1.5 overflow-y-auto' : 'flex flex-1 items-start gap-1.5 overflow-x-auto overflow-y-hidden pb-0.5') : expanded ? 'flex flex-1 flex-col gap-1 overflow-y-auto' : 'flex flex-1 flex-col items-center gap-1.5 overflow-y-auto')}
      role="listbox" aria-label="Color Dock swatches"
    >
      {sw.colors.map((c, i) => {
        const name = sw.names[i];
        const active = c.toLowerCase() === fg.toLowerCase();
        const row = !bottom && expanded;
        return (
          <div key={c + i} data-dock-idx={i} className={cn('relative shrink-0', row ? 'flex items-center gap-2 rounded px-1 py-0.5 hover:bg-white/5' : 'flex flex-col items-center', over === i && drag.current?.idx !== i && (bottom ? 'border-l-2 border-[#E8913A] pl-0.5' : 'border-t-2 border-[#E8913A] pt-0.5'))}>
            <button
              role="option" aria-selected={active} aria-label={`${name || c.toUpperCase()}, RGB ${rgbLabel(c)}`}
              title={`${name ? name + ' · ' : ''}${c.toUpperCase()} · RGB ${rgbLabel(c)}\nClick: use · Drag: reorder · Right-click / long-press: options`}
              onPointerDown={(e) => onDown(e, i)} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => { if (drag.current?.timer) clearTimeout(drag.current.timer); drag.current = null; setOver(null); }}
              onClick={() => select(c)} onKeyDown={(e) => onKey(e, i)}
              onContextMenu={(e) => { e.preventDefault(); setMenu({ idx: i, x: e.clientX, y: e.clientY }); }}
              className={cn('touch-none rounded-md border transition-shadow', active ? 'border-white ring-2 ring-[#E8913A]' : 'border-black/50 hover:ring-2 hover:ring-white/40')}
              style={{ width: S, height: S, background: c }}
            />
            {row ? (
              <div className="min-w-0 flex-1 leading-tight">
                <div className="truncate text-[11px] text-neutral-200">{name || '—'}</div>
                <div className="font-mono text-[9px] text-neutral-500">{c.toUpperCase()}</div>
              </div>
            ) : (cfg.labels || expanded) && (
              <div className="mt-0.5 truncate text-center text-[9px] leading-tight text-neutral-400" style={{ maxWidth: Math.max(S, 44) }}>{name || c.toUpperCase()}</div>
            )}
            {row && <button title="Options" onClick={(e) => setMenu({ idx: i, x: e.clientX, y: e.clientY })} className="px-1 text-neutral-500 hover:text-white"><ChevronDown size={12} /></button>}
          </div>
        );
      })}
    </div>
  ) : (
    <div className={cn('flex-1 text-[10px] leading-snug text-neutral-500', bottom ? 'self-center' : 'px-1 text-center')}>
      {scope === 'project' && !doc?.colorDock ? (
        <span>No project dock yet. <button className="text-[#E8913A] underline" onClick={() => writeDock('project', norm({ name: (doc?.name || 'Project') + ' colors' }))}>Create</button>{' · '}<button className="text-[#E8913A] underline" onClick={() => { const g = readDock('global'); writeDock('project', norm({ ...(g || {}), name: (doc?.name || 'Project') + ' colors' })); }}>Copy global set</button></span>
      ) : bottom || expanded ? 'Empty. Add the current color with +, type a value with #, or sample from the canvas.' : 'Empty'}
    </div>
  );

  const thickness = bottom ? undefined : expanded ? 196 : Math.max(44, S + 18);
  return (
    <>
      <aside
        aria-label="Color Dock"
        onPointerDown={(e) => e.stopPropagation()}
        onWheel={(e) => e.stopPropagation()}
        className={cn('relative z-[6] flex shrink-0 select-none gap-2 bg-[#18181b] p-1.5', bottom ? 'flex-row items-start border-t border-black/60' : 'flex-col border-black/60', eff.placement === 'left' && 'border-r', eff.placement === 'right' && 'border-l')}
        style={bottom ? { maxHeight: expanded ? S * 2 + 70 : undefined } : { width: thickness }}
      >
        <div className={cn('flex gap-1', bottom ? 'flex-col' : 'flex-col')}>
          {header}
          {inputRow}
        </div>
        {swatches}
        {eff.adapted && <span className="absolute right-1 top-0.5 text-[8px] text-neutral-600" title="Layout adapted to the window size">auto</span>}
      </aside>
      {menu && sw && (
        <div className="fixed inset-0 z-[95]" onPointerDown={() => setMenu(null)} onContextMenu={(e) => { e.preventDefault(); setMenu(null); }}>
          <div
            className="absolute min-w-[190px] rounded-lg border border-white/10 bg-[#1e1e21] py-1 text-[12px] shadow-2xl"
            style={{ left: Math.min(menu.x, window.innerWidth - 200), top: Math.min(menu.y, window.innerHeight - 190) }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-white/5 px-3 pb-1.5 pt-1">
              <span className="h-4 w-4 rounded border border-white/20" style={{ background: sw.colors[menu.idx] }} />
              <span className="truncate text-neutral-300">{sw.names[menu.idx] || sw.colors[menu.idx].toUpperCase()}</span>
            </div>
            {([['select', 'Use as foreground', null], ['rename', 'Rename…', Pencil], ['replace', 'Replace with current color', Replace], ['duplicate', 'Duplicate', Copy], ['delete', 'Delete', Trash2]] as const).map(([a, l, I]) => (
              <button key={a} onClick={() => menuAction(a)} className={cn('flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-[#E8913A]/20', a === 'delete' ? 'text-red-300' : 'text-neutral-200')}>
                <span className="w-3">{I && <I size={12} />}</span>{l}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );

  function SetMenu({ scope: sc, sw: cur, compact }: { scope: DockScope; sw: Swatches | null; compact: boolean }) {
    if (sc === 'project') {
      if (!cur) return null;
      return (
        <button title="Rename project dock" onClick={async () => { const n = await promptDialog('Rename project dock', 'Name:', cur.name); if (n) writeDock('project', { ...cur, name: n }); }}
          className={cn('truncate rounded px-1 text-[10px] text-neutral-400 hover:bg-white/10 hover:text-white', compact ? 'max-w-[40px]' : 'max-w-[120px]')}>{cur.name}</button>
      );
    }
    const gid = globalSetId();
    return (
      <div className={cn('flex items-center gap-0.5', compact && 'flex-col')}>
        <select
          value={gid} aria-label="Swatch set"
          onChange={async (e) => {
            const v = e.target.value;
            if (v === '__new') { const n = await promptDialog('New swatch set', 'Name:', `Set ${palettes.length + 1}`); if (n) { const id = uid('pal-'); setApp({ palettes: [...getApp().palettes, { id, name: n, colors: [], names: [] }] }); updateDock({ setId: id }); } }
            else if (v === '__rename') { const p = palettes.find((x) => x.id === gid); const n = await promptDialog('Rename swatch set', 'Name:', p?.name || ''); if (n && cur) writeDock('global', { ...cur, name: n }); }
            else if (v === '__delete') {
              if (palettes.length <= 1) return toast('Keep at least one swatch set', 'error');
              const p = palettes.find((x) => x.id === gid);
              const r = await confirmDialog('Delete swatch set?', `“${p?.name}” and its ${p?.colors.length || 0} colors will be removed (also from Color Studio palettes).`, [{ label: 'Cancel', value: 'n' }, { label: 'Delete', value: 'y', variant: 'danger' }]);
              if (r === 'y') { const rest = getApp().palettes.filter((x) => x.id !== gid); setApp({ palettes: rest, activePalette: rest[0].id }); updateDock({ setId: rest[0].id }); }
            } else updateDock({ setId: v });
          }}
          className={cn('rounded border border-white/10 bg-neutral-900 py-0.5 text-[10px] text-neutral-200 outline-none', compact ? 'w-[40px]' : 'max-w-[130px]')}
        >
          {palettes.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.colors.length})</option>)}
          <option value="__new">＋ New set…</option>
          <option value="__rename">Rename set…</option>
          <option value="__delete">Delete set…</option>
        </select>
      </div>
    );
  }
}

/** Settings → Canvas & Workspace → Color Dock */
export function ColorDockSettings() {
  const cfg = useDock((s) => s.cfg);
  const win = useWindowSize();
  const eff = effectiveDock(cfg, win);
  return (
    <div className="space-y-1">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Color Dock</div>
      <Toggle label="Enable Color Dock" checked={cfg.enabled} onChange={(v) => updateDock({ enabled: v })} />
      <Select label="Placement" value={cfg.placement} onChange={(v) => updateDock({ placement: v })} options={[{ value: 'bottom', label: 'Below the canvas' }, { value: 'left', label: 'Left of the canvas' }, { value: 'right', label: 'Right of the canvas' }]} />
      <Select label="Layout" value={cfg.layout} onChange={(v) => updateDock({ layout: v })} options={[{ value: 'compact', label: 'Compact' }, { value: 'expanded', label: 'Expanded (names and values)' }]} />
      <Slider label="Swatch size" value={cfg.size} min={16} max={56} step={1} fmt={(v) => v + 'px'} onChange={(v) => updateDock({ size: v })} />
      <Toggle label="Show color labels" checked={cfg.labels} onChange={(v) => updateDock({ labels: v })} />
      <Select label="Default set" value={cfg.scope} onChange={(v) => updateDock({ scope: v })} options={[{ value: 'global', label: 'Global set (all documents)' }, { value: 'project', label: 'Project dock (saved in the .carbon file)' }]} />
      {eff.adapted && <p className="text-[11px] text-amber-300/80">The window is too small for this layout right now, so the dock is shown {eff.placement === 'bottom' ? 'below the canvas' : 'beside the canvas'} in the {eff.layout} layout.</p>}
      <p className="pt-2 text-[11px] leading-relaxed text-neutral-500">
        The dock sits outside the artwork and is never drawn into exports. Global sets are your Color Studio palettes. Project docks are stored inside the document.
        When the dock is turned off, its colors and settings are kept. Tap or click a swatch to use it, drag to reorder, and right-click or long-press for rename, replace, duplicate and delete.
        Side placement switches to below the canvas when the window is narrower than 900 px.
      </p>
    </div>
  );
}

export { getApp };
