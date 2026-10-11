import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowLeftRight, ArrowUp, GripVertical, Minimize2, Redo2, Settings2, Undo2, Layers, Save, Trash2 } from 'lucide-react';
import { ALL_TOOLS, getApp, setApp, setTool, toast, updatePalette, useApp, type PaletteCfg } from '../state/store';
import { redo, undo, viewport } from '../state/commands';
import { CarbonMark, TOOL_ICONS } from './Brand';
import { CompactColor } from './ColorStudio';
import { Btn, Select, Slider } from './ui';
import { cn } from '../utils/cn';
import type { ToolId } from '../engine/types';

const EXTRA: { id: string; label: string }[] = [
  { id: 'color', label: 'Color' }, { id: 'undo', label: 'Undo' }, { id: 'redo', label: 'Redo' }, { id: 'swap', label: 'Swap colors' }, { id: 'layers', label: 'Toggle panels' },
];
// display label for a palette item
const LABEL = (id: string) => ALL_TOOLS.find((t) => t.id === id)?.label || EXTRA.find((e) => e.id === id)?.label || id;

export default function FloatingPalette() {
  const cfg = useApp((s) => s.palette);
  const tool = useApp((s) => s.tool);
  const fg = useApp((s) => s.fg);
  const presets = useApp((s) => s.palettePresets);
  const [popover, setPopover] = useState<'color' | 'settings' | null>(null);
  const [presetName, setPresetName] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  // keep palette inside the canvas area
  useEffect(() => {
    const fix = () => {
      const c = getApp().palette;
      const x = Math.max(4, Math.min(viewport.w - 48, c.x)), y = Math.max(4, Math.min(viewport.h - 48, c.y));
      if (x !== c.x || y !== c.y) updatePalette({ x, y });
    };
    fix();
    window.addEventListener('resize', fix);
    return () => window.removeEventListener('resize', fix);
  }, []);

  if (!cfg.visible) return null;
  const startDrag = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const x0 = e.clientX - cfg.x, y0 = e.clientY - cfg.y;
    let moved = false;
    const mv = (ev: PointerEvent) => {
      moved = true;
      updatePalette({ x: Math.max(4, Math.min(viewport.w - 48, ev.clientX - x0)), y: Math.max(4, Math.min(viewport.h - 48, ev.clientY - y0)) });
    };
    const up = () => {
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
      if (!moved && cfg.collapsed) updatePalette({ collapsed: false });
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  };

  if (cfg.collapsed) {
    return (
      <div
        className="absolute z-20 flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-white/15 bg-neutral-900/90 shadow-xl backdrop-blur hover:border-[#E8913A]/60"
        style={{ left: cfg.x, top: cfg.y }}
        onPointerDown={startDrag}
        title="Floating tool palette (click to expand, drag to move)"
      >
        <CarbonMark size={22} />
      </div>
    );
  }

  const S = cfg.iconSize;
  const item = (id: string) => {
    const common = 'flex shrink-0 items-center justify-center rounded-lg transition-colors';
    const st = { width: S, height: S };
    if (id === 'color') {
      return (
        <button key={id} title="Color" style={st} className={common} onClick={() => setPopover(popover === 'color' ? null : 'color')}>
          <span className="rounded-full border-2 border-white/80 shadow" style={{ width: S * 0.62, height: S * 0.62, background: fg }} />
        </button>
      );
    }
    const Icon = id === 'undo' ? Undo2 : id === 'redo' ? Redo2 : id === 'swap' ? ArrowLeftRight : id === 'layers' ? Layers : TOOL_ICONS[id as ToolId];
    if (!Icon) return null;
    const active = tool === id;
    return (
      <button
        key={id}
        title={LABEL(id)}
        style={st}
        className={cn(common, active ? 'bg-[#E8913A] text-neutral-950' : 'text-neutral-200 hover:bg-white/10')}
        onClick={() => {
          if (id === 'undo') return undo();
          if (id === 'redo') return redo();
          if (id === 'swap') return setApp({ fg: getApp().bg, bg: getApp().fg });
          if (id === 'layers') { const l = getApp().layout; return setApp({ layout: { ...l, dockOpen: !l.dockOpen } }); }
          setTool(id as ToolId);
        }}
      >
        <Icon size={Math.round(S * 0.5)} />
      </button>
    );
  };

  const items = cfg.items;
  let body: React.ReactNode;
  if (cfg.layout === 'radial') {
    const n = items.length;
    const R = Math.max(S * 1.1, (n * (S + cfg.spacing)) / (2 * Math.PI));
    const D = R * 2 + S;
    body = (
      <div className="relative" style={{ width: D, height: D }}>
        {items.map((id, i) => {
          const a = (i / n) * Math.PI * 2 - Math.PI / 2;
          return <div key={id} className="absolute" style={{ left: D / 2 + Math.cos(a) * R - S / 2, top: D / 2 + Math.sin(a) * R - S / 2 }}>{item(id)}</div>;
        })}
        <div onPointerDown={startDrag} className="absolute flex cursor-move items-center justify-center rounded-full bg-white/5 text-neutral-500 hover:text-white" style={{ left: D / 2 - S * 0.45, top: D / 2 - S * 0.45, width: S * 0.9, height: S * 0.9 }} title="Drag to move">
          <GripVertical size={14} />
        </div>
      </div>
    );
  } else {
    body = (
      <div
        className={cn(cfg.layout === 'grid' ? 'grid' : 'flex', cfg.layout === 'vertical' && 'flex-col', cfg.layout === 'horizontal' && 'flex-row')}
        style={{ gap: cfg.spacing, gridTemplateColumns: cfg.layout === 'grid' ? `repeat(${cfg.columns}, ${S}px)` : undefined }}
      >
        {items.map(item)}
      </div>
    );
  }
  const horiz = cfg.layout === 'horizontal';

  return (
    <div
      ref={ref}
      className="absolute z-20 select-none"
      style={{ left: cfg.x, top: cfg.y }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="rounded-2xl border border-white/10 p-1.5 shadow-2xl backdrop-blur" style={{ background: `rgba(24,24,27,${cfg.opacity})` }}>
        <div className={cn('flex items-center', horiz ? 'flex-row gap-1' : 'flex-col gap-1')}>
          {cfg.layout !== 'radial' && (
            <div className={cn('flex items-center text-neutral-500', horiz ? 'flex-col gap-1' : 'w-full flex-row justify-between gap-1')}>
              <div onPointerDown={startDrag} className="cursor-move rounded p-0.5 hover:bg-white/10 hover:text-white" title="Drag to move"><GripVertical size={13} className={horiz ? '' : 'rotate-90'} /></div>
              <div className={cn('flex', horiz ? 'flex-col' : 'flex-row')}>
                <button title="Palette settings" onClick={() => setPopover(popover === 'settings' ? null : 'settings')} className="rounded p-0.5 hover:bg-white/10 hover:text-white"><Settings2 size={12} /></button>
                <button title="Collapse" onClick={() => { setPopover(null); updatePalette({ collapsed: true }); }} className="rounded p-0.5 hover:bg-white/10 hover:text-white"><Minimize2 size={12} /></button>
              </div>
            </div>
          )}
          {body}
          {cfg.layout === 'radial' && (
            <div className="flex gap-1 text-neutral-500">
              <button title="Palette settings" onClick={() => setPopover(popover === 'settings' ? null : 'settings')} className="rounded p-0.5 hover:bg-white/10 hover:text-white"><Settings2 size={12} /></button>
              <button title="Collapse" onClick={() => updatePalette({ collapsed: true })} className="rounded p-0.5 hover:bg-white/10 hover:text-white"><Minimize2 size={12} /></button>
            </div>
          )}
        </div>
      </div>
      {popover && (
        <div
          className="absolute z-30 rounded-xl border border-white/10 bg-[#1c1c1f] p-3 shadow-2xl"
          style={cfg.x > viewport.w / 2 ? { right: '100%', top: 0, marginRight: 8 } : { left: '100%', top: 0, marginLeft: 8 }}
        >
          {popover === 'color' ? <CompactColor /> : (
            <div className="w-64 space-y-2 text-[11px]">
              <div className="font-medium text-neutral-200">Palette settings</div>
              <Select label="Layout" value={cfg.layout} onChange={(v) => updatePalette({ layout: v })} options={[{ value: 'vertical', label: 'Vertical' }, { value: 'horizontal', label: 'Horizontal' }, { value: 'grid', label: 'Grid' }, { value: 'radial', label: 'Radial' }]} />
              {cfg.layout === 'grid' && <Slider label="Columns" value={cfg.columns} min={2} max={6} step={1} fmt={(v) => String(v)} onChange={(v) => updatePalette({ columns: v })} />}
              <Slider label="Icon size" value={cfg.iconSize} min={26} max={64} step={1} fmt={(v) => v + 'px'} onChange={(v) => updatePalette({ iconSize: v })} />
              <Slider label="Spacing" value={cfg.spacing} min={0} max={16} step={1} fmt={(v) => v + 'px'} onChange={(v) => updatePalette({ spacing: v })} />
              <Slider label="Background" value={cfg.opacity} min={0.2} max={1} onChange={(v) => updatePalette({ opacity: v })} />
              <div className="max-h-48 space-y-px overflow-y-auto rounded border border-white/5 p-1">
                {[...ALL_TOOLS.map((t) => t.id as string), ...EXTRA.map((e) => e.id)].sort((a, b) => {
                  const ia = items.indexOf(a), ib = items.indexOf(b);
                  return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
                }).map((id) => {
                  const on = items.includes(id);
                  const i = items.indexOf(id);
                  return (
                    <div key={id} className="flex items-center gap-1 rounded px-1 py-0.5 hover:bg-white/5">
                      <input type="checkbox" checked={on} onChange={() => updatePalette({ items: on ? items.filter((x) => x !== id) : [...items, id] })} />
                      <span className={cn('flex-1', on ? 'text-neutral-200' : 'text-neutral-500')}>{LABEL(id)}</span>
                      {on && <>
                        <button disabled={i === 0} onClick={() => { const a = [...items]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; updatePalette({ items: a }); }} className="text-neutral-500 hover:text-white disabled:opacity-30"><ArrowUp size={11} /></button>
                        <button disabled={i === items.length - 1} onClick={() => { const a = [...items]; [a[i + 1], a[i]] = [a[i], a[i + 1]]; updatePalette({ items: a }); }} className="text-neutral-500 hover:text-white disabled:opacity-30"><ArrowDown size={11} /></button>
                      </>}
                    </div>
                  );
                })}
              </div>
              <div className="font-medium text-neutral-200">Presets</div>
              <div className="space-y-1">
                {presets.map((p, i) => (
                  <div key={i} className="flex items-center gap-1">
                    <button className="flex-1 truncate rounded bg-white/5 px-2 py-1 text-left text-neutral-300 hover:bg-white/10" onClick={() => updatePalette({ ...p.cfg, x: cfg.x, y: cfg.y, visible: true, collapsed: false })}>{p.name}</button>
                    <button title="Delete preset" onClick={() => setApp({ palettePresets: presets.filter((_, j) => j !== i) })} className="text-neutral-500 hover:text-red-400"><Trash2 size={11} /></button>
                  </div>
                ))}
                <div className="flex gap-1">
                  <input value={presetName} onChange={(e) => setPresetName(e.target.value)} onKeyDown={(e) => e.stopPropagation()} placeholder="Preset name" className="min-w-0 flex-1 rounded bg-neutral-900 px-2 py-1 text-neutral-200 outline-none ring-1 ring-white/10" />
                  <Btn onClick={() => {
                    const name = presetName.trim() || `Preset ${presets.length + 1}`;
                    setApp({ palettePresets: [...presets, { name, cfg: { ...cfg } as PaletteCfg }] });
                    setPresetName('');
                    toast(`Saved palette preset “${name}”`, 'success');
                  }}><Save size={11} /></Btn>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
