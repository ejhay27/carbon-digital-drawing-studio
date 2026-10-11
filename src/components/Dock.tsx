import { useRef, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, ChevronUp, PanelRightClose, PictureInPicture2, SquareArrowDownRight, X } from 'lucide-react';
import { PANEL_TITLES, getApp, updateLayout, useApp, type PanelId } from '../state/store';
import ColorStudio from './ColorStudio';
import LayersPanel from './LayersPanel';
import { BrushLibrary, BrushStudio } from './Brushes';
import ReplayPanel from './ReplayPanel';
import { DocInfo, HistoryPanel, Navigator, ReferenceBoard, ToolOptions } from './MiscPanels';
import { cn } from '../utils/cn';

const PANELS: Record<PanelId, () => ReactNode> = {
  layers: () => <LayersPanel />, brushes: () => <BrushLibrary />, brushStudio: () => <BrushStudio />, color: () => <ColorStudio />,
  history: () => <HistoryPanel />, replay: () => <ReplayPanel />, navigator: () => <Navigator />, toolOptions: () => <ToolOptions />,
  reference: () => <ReferenceBoard />, docInfo: () => <DocInfo />,
  // Windows edition panels (only ever added to the Windows layout; see App one-time init)
  continuum: () => <ContinuumPanel />, timemachine: () => <TimeMachinePanel />, palmem: () => <PaletteMemoryPanel />,
};
import { ContinuumPanel } from '../win/Continuum';
import { TimeMachinePanel } from '../win/TimeMachine';
import { PaletteMemoryPanel } from '../win/PaletteMemory';

function PanelHeader({ id, floating, onDragStart }: { id: PanelId; floating?: boolean; onDragStart?: (e: React.PointerEvent) => void }) {
  const l = useApp((s) => s.layout);
  const collapsed = l.collapsed.includes(id);
  const move = (dir: -1 | 1) => {
    const o = [...l.order];
    const i = o.indexOf(id);
    const docked = o.filter((p) => !l.hidden.includes(p) && !l.floating[p]);
    const di = docked.indexOf(id);
    const target = docked[di + dir];
    if (!target) return;
    const j = o.indexOf(target);
    [o[i], o[j]] = [o[j], o[i]];
    updateLayout({ order: o });
  };
  return (
    <div className={cn('flex h-7 select-none items-center gap-1 px-2 text-[11px] font-medium text-neutral-300', floating && 'cursor-move')} onPointerDown={onDragStart}>
      <button onPointerDown={(e) => e.stopPropagation()} onClick={() => updateLayout({ collapsed: collapsed ? l.collapsed.filter((x) => x !== id) : [...l.collapsed, id] })} className="flex flex-1 items-center gap-1 text-left hover:text-white" title={collapsed ? 'Expand' : 'Collapse'}>
        {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
        {PANEL_TITLES[id]}
      </button>
      <div className="flex items-center gap-0.5 text-neutral-500" onPointerDown={(e) => e.stopPropagation()}>
        {!floating && <>
          <button title="Move up" onClick={() => move(-1)} className="rounded p-0.5 hover:bg-white/10 hover:text-white"><ChevronUp size={12} /></button>
          <button title="Move down" onClick={() => move(1)} className="rounded p-0.5 hover:bg-white/10 hover:text-white"><ChevronDown size={12} /></button>
        </>}
        <button
          title={floating ? 'Dock panel' : 'Float panel'}
          onClick={() => {
            const f = { ...l.floating };
            if (floating) delete f[id];
            else f[id] = { x: Math.max(80, window.innerWidth - l.dockWidth - 380), y: 90, w: 300, h: 420 };
            updateLayout({ floating: f });
          }}
          className="rounded p-0.5 hover:bg-white/10 hover:text-white"
        >{floating ? <SquareArrowDownRight size={12} /> : <PictureInPicture2 size={12} />}</button>
        <button title="Close panel (reopen from Window menu)" onClick={() => updateLayout({ hidden: [...l.hidden, id] })} className="rounded p-0.5 hover:bg-white/10 hover:text-white"><X size={12} /></button>
      </div>
    </div>
  );
}

function DockedPanel({ id }: { id: PanelId }) {
  const l = useApp((s) => s.layout);
  const collapsed = l.collapsed.includes(id);
  const h = l.heights[id];
  const startResize = (e: React.PointerEvent) => {
    const el = (e.currentTarget.previousSibling as HTMLElement);
    const y0 = e.clientY, h0 = el.getBoundingClientRect().height;
    const mv = (ev: PointerEvent) => updateLayout({ heights: { ...getApp().layout.heights, [id]: Math.max(60, Math.min(900, h0 + ev.clientY - y0)) } });
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  };
  return (
    <section className="border-b border-black/40 bg-[#1b1b1e]">
      <PanelHeader id={id} />
      {!collapsed && (
        <>
          <div className="overflow-y-auto px-3 pb-3 pt-1" style={h ? { height: h } : { maxHeight: 640 }}>{PANELS[id]()}</div>
          <div onPointerDown={startResize} className="h-1 cursor-ns-resize bg-transparent hover:bg-[#E8913A]/40" title="Drag to resize" />
        </>
      )}
    </section>
  );
}

function FloatingPanel({ id }: { id: PanelId }) {
  const l = useApp((s) => s.layout);
  const f = l.floating[id]!;
  const collapsed = l.collapsed.includes(id);
  const ref = useRef<HTMLDivElement>(null);
  const set = (p: Partial<typeof f>) => updateLayout({ floating: { ...getApp().layout.floating, [id]: { ...getApp().layout.floating[id]!, ...p } } });
  const drag = (e: React.PointerEvent) => {
    const x0 = e.clientX - f.x, y0 = e.clientY - f.y;
    const mv = (ev: PointerEvent) => set({ x: Math.max(0, Math.min(window.innerWidth - 80, ev.clientX - x0)), y: Math.max(0, Math.min(window.innerHeight - 30, ev.clientY - y0)) });
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  };
  const resize = (e: React.PointerEvent) => {
    e.stopPropagation();
    const x0 = e.clientX, y0 = e.clientY, w0 = f.w, h0 = f.h;
    const mv = (ev: PointerEvent) => set({ w: Math.max(220, w0 + ev.clientX - x0), h: Math.max(120, h0 + ev.clientY - y0) });
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  };
  return (
    <div ref={ref} className="fixed z-40 flex flex-col overflow-hidden rounded-lg border border-white/10 bg-[#1b1b1e]/98 shadow-2xl" style={{ left: f.x, top: f.y, width: f.w, height: collapsed ? 28 : f.h }}>
      <PanelHeader id={id} floating onDragStart={drag} />
      {!collapsed && <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3 pt-1">{PANELS[id]()}</div>}
      {!collapsed && <div onPointerDown={resize} className="absolute bottom-0 right-0 h-3 w-3 cursor-nwse-resize" style={{ background: 'linear-gradient(135deg, transparent 50%, rgba(255,255,255,0.25) 50%)' }} />}
    </div>
  );
}

export function FloatingPanels() {
  const l = useApp((s) => s.layout);
  return <>{(Object.keys(l.floating) as PanelId[]).filter((id) => !l.hidden.includes(id) && l.floating[id]).map((id) => <FloatingPanel key={id} id={id} />)}</>;
}

export default function Dock({ tablet }: { tablet: boolean }) {
  const l = useApp((s) => s.layout);
  const docked = l.order.filter((id) => !l.hidden.includes(id) && !l.floating[id]);
  const startResize = (e: React.PointerEvent) => {
    const x0 = e.clientX, w0 = l.dockWidth;
    const mv = (ev: PointerEvent) => updateLayout({ dockWidth: Math.max(240, Math.min(560, w0 - (ev.clientX - x0))) });
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  };
  if (tablet && !l.dockOpen) return null;
  return (
    <aside
      className={cn('relative flex shrink-0 flex-col border-l border-black/50 bg-[#161618]', tablet && 'absolute bottom-0 right-0 top-0 z-30 shadow-2xl')}
      style={{ width: tablet ? Math.min(l.dockWidth + 40, window.innerWidth - 80) : l.dockWidth }}
    >
      <div onPointerDown={startResize} className="absolute -left-1 top-0 z-10 h-full w-2 cursor-ew-resize hover:bg-[#E8913A]/30" title="Drag to resize the panel dock" />
      {tablet && (
        <div className="flex h-10 items-center justify-between border-b border-black/40 px-3 text-xs text-neutral-300">
          <span>Studio panels</span>
          <button onClick={() => updateLayout({ dockOpen: false })} className="rounded p-1.5 hover:bg-white/10" title="Close drawer"><PanelRightClose size={18} /></button>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {docked.map((id) => <DockedPanel key={id} id={id} />)}
        {!docked.length && <div className="p-4 text-center text-[11px] text-neutral-500">All panels are hidden or floating. Use the Window menu to show panels.</div>}
      </div>
    </aside>
  );
}
