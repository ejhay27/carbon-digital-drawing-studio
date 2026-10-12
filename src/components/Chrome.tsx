import { useEffect, useState } from 'react';
import { Circle, PanelRight, Plus, X } from 'lucide-react';
import { activeDoc, ALL_TOOLS, currentBrush, getApp, setApp, setTool, updateLayout, useApp, usePointer } from '../state/store';
import { closeDoc, openReplay } from '../state/actions';
import { fitView, prettyCombo, setZoom } from '../state/commands';
import { EDITION } from '../platform/edition';
import { setWin } from '../win/WinOverlay';
import { documentWorkspace } from '../win/workspaceModel';
import { TOOL_ICONS } from './Brand';
import { Btn } from './ui';
import { cn } from '../utils/cn';

export function DocTabs() {
  const docs = useApp((s) => s.docs);
  const activeId = useApp((s) => s.activeId);
  useApp((s) => s.tick);
  return (
    <div className="flex h-8 shrink-0 items-end gap-px overflow-x-auto border-b border-black/60 bg-[#111113] px-1">
      {docs.map((d) => (
        <div
          key={d.id}
          onClick={() => { const target = documentWorkspace(d); setApp({ activeId: d.id, replay: getApp().replay?.docId === d.id ? getApp().replay : null, inkSelection: [], homeScreen: false, ...(target !== 'comic' && getApp().tool === 'comic' ? { tool: 'brush' as const } : {}) }); setWin({ workspace: target }); }}
          onAuxClick={(e) => e.button === 1 && closeDoc(d.id)}
          className={cn('group flex h-7 max-w-[220px] cursor-pointer items-center gap-2 rounded-t-md px-3 text-[11px]', d.id === activeId ? 'bg-[#1b1b1e] text-neutral-100' : 'text-neutral-500 hover:bg-white/5 hover:text-neutral-300')}
          title={`${d.name} — ${d.width}×${d.height}${d.fileName ? ' — ' + d.fileName : ''}`}
        >
          {d.rec.active && <Circle size={6} fill="currentColor" className="shrink-0 text-red-500" aria-label="recording" />}
          <span className="truncate">{d.name}</span>
          {d.dirty && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#E8913A]" title="Unsaved changes" />}
          <button onClick={(e) => { e.stopPropagation(); closeDoc(d.id); }} className="shrink-0 rounded p-0.5 text-neutral-500 opacity-60 hover:bg-white/10 hover:text-white group-hover:opacity-100" title="Close"><X size={11} /></button>
        </div>
      ))}
      <button onClick={() => setApp({ dialog: EDITION.windows ? 'create' : 'new' })} className="mb-0.5 ml-1 rounded p-1 text-neutral-500 hover:bg-white/10 hover:text-white" title={EDITION.windows ? 'Create a workspace' : 'New canvas'}><Plus size={14} /></button>
    </div>
  );
}

export function ToolRail({ tablet }: { tablet: boolean }) {
  const tool = useApp((s) => s.tool);
  const rail = useApp((s) => s.settings.railTools);
  const shortcuts = useApp((s) => s.settings.shortcuts);
  const fg = useApp((s) => s.fg);
  const bg = useApp((s) => s.bg);
  const sz = tablet ? 44 : 34;
  const groups: string[][] = [['brush', 'eraser', 'picker', 'fill'], ['select', 'transform', 'move'], ['line', 'rect', 'ellipse', 'text', 'inkedit'], ['hand', 'zoom', 'rotate', 'symmetry']];
  return (
    <nav className="flex shrink-0 flex-col items-center gap-0.5 overflow-y-auto border-r border-black/50 bg-[#161618] py-2" style={{ width: sz + 12 }} aria-label="Tools">
      {groups.map((g, gi) => {
        const items = g.filter((t) => rail.includes(t as never));
        if (!items.length) return null;
        return (
          <div key={gi} className="flex flex-col items-center gap-0.5 border-b border-white/5 pb-1.5 last:border-0">
            {items.map((t) => {
              const Icon = TOOL_ICONS[t as keyof typeof TOOL_ICONS];
              const meta = ALL_TOOLS.find((x) => x.id === t)!;
              const k = shortcuts['tool.' + t];
              return (
                <button
                  key={t}
                  onClick={() => setTool(meta.id)}
                  title={`${meta.label}${k ? ` (${prettyCombo(k)})` : ''}`}
                  className={cn('flex items-center justify-center rounded-md transition-colors', tool === t ? 'bg-[#E8913A] text-neutral-950' : 'text-neutral-400 hover:bg-white/10 hover:text-white')}
                  style={{ width: sz, height: sz }}
                  aria-pressed={tool === t}
                >
                  <Icon size={tablet ? 20 : 16} />
                </button>
              );
            })}
          </div>
        );
      })}
      <div className="relative mt-2 shrink-0" style={{ width: sz, height: sz }}>
        <button title="Background color: click to swap" onClick={() => setApp({ fg: bg, bg: fg })} className="absolute bottom-0 right-0 h-1/2 w-1/2 rounded-sm border border-white/30" style={{ background: bg }} />
        <button title="Foreground color: opens Color Studio" onClick={() => { const l = getApp().layout; updateLayout({ hidden: l.hidden.filter((x) => x !== 'color'), collapsed: l.collapsed.filter((x) => x !== 'color'), dockOpen: true }); }} className="absolute left-0 top-0 h-2/3 w-2/3 rounded-sm border border-white/50 shadow" style={{ background: fg }} />
      </div>
    </nav>
  );
}

export function StatusBar({ tablet }: { tablet: boolean }) {
  useApp((s) => s.tick);
  const pointer = usePointer((s) => s.p);
  const tool = useApp((s) => s.tool);
  const replay = useApp((s) => s.replay);
  const s = useApp();
  const d = activeDoc();
  const b = currentBrush(tool === 'eraser', s);
  return (
    <div className="flex h-6 shrink-0 items-center gap-3 border-t border-black/60 bg-[#111113] px-3 font-mono text-[10px] text-neutral-500">
      {d ? (
        <>
          <span className="flex items-center gap-1">
            <button className="hover:text-white" onClick={() => setZoom(d, d.view.zoom / 1.25)}>−</button>
            <button className="min-w-[44px] text-neutral-300 hover:text-white" title="Fit to screen" onClick={() => fitView(d)}>{Math.round(d.view.zoom * 100)}%</button>
            <button className="hover:text-white" onClick={() => setZoom(d, d.view.zoom * 1.25)}>+</button>
          </span>
          {d.view.rot !== 0 && <span>{Math.round(d.view.rot)}°</span>}
          {d.view.flip && <span className="text-sky-400">mirrored</span>}
          <span>{d.width}×{d.height}</span>
          {pointer && <span className="hidden sm:inline">x {pointer.x} y {pointer.y}</span>}
          <span className="truncate text-neutral-400">{d.active?.name}{d.active?.type === 'ink' ? ' · Crisp Ink' : ''}{d.active?.locked ? ' · locked' : ''}</span>
          {['brush', 'eraser', 'line', 'rect', 'ellipse'].includes(tool) && <span className="hidden truncate md:inline">{b.name} · {b.size.toFixed(1)}px · {Math.round(b.opacity * 100)}%</span>}
          {d.selection && <span className="text-sky-400">selection</span>}
          <div className="flex-1" />
          {replay?.docId === d.id && <span className="text-amber-300">REPLAY {replay.playing ? '▶' : '❚❚'} {replay.speed}×</span>}
          <button
            onClick={() => (d.rec.active ? d.pauseRecording() : d.rec.enabled ? d.resumeRecording() : d.startRecording())}
            className={cn('flex items-center gap-1 rounded px-1.5 hover:bg-white/10', d.rec.active ? 'text-red-400' : 'text-neutral-500')}
            title={d.rec.active ? 'Drawing Replay is recording (click to pause)' : 'Drawing Replay recording is off/paused (click to record)'}
          >
            <Circle size={7} fill="currentColor" className={d.rec.active ? 'animate-pulse' : ''} /> {d.rec.active ? 'REC' : d.rec.enabled ? 'REC paused' : 'REC off'}
          </button>
          {!!d.rec.events.length && !replay && <button onClick={() => openReplay(d)} className="hover:text-white">▶ replay</button>}
          <span className={d.dirty ? 'text-[#E8913A]' : 'text-emerald-500/80'}>{d.dirty ? 'unsaved' : 'saved'}</span>
        </>
      ) : <span>No document</span>}
      {tablet && (
        <button className="ml-1 rounded p-0.5 text-neutral-400 hover:text-white" onClick={() => updateLayout({ dockOpen: !getApp().layout.dockOpen })} title="Panels"><PanelRight size={13} /></button>
      )}
    </div>
  );
}

export function Toasts() {
  const toasts = useApp((s) => s.toasts);
  return (
    <div className="pointer-events-none fixed bottom-10 left-1/2 z-[120] flex -translate-x-1/2 flex-col items-center gap-2">
      {toasts.map((t) => (
        <div key={t.id} role="status" className={cn('pointer-events-auto max-w-md rounded-lg border px-3 py-2 text-xs shadow-xl backdrop-blur', t.kind === 'error' ? 'border-red-500/40 bg-red-950/90 text-red-100' : t.kind === 'success' ? 'border-emerald-500/30 bg-emerald-950/90 text-emerald-100' : 'border-white/10 bg-neutral-900/95 text-neutral-200')}>
          {t.msg}
        </div>
      ))}
    </div>
  );
}

export function ConfirmHost() {
  const req = useApp((s) => s.confirmReq);
  const [text, setText] = useState('');
  useEffect(() => { if (req?.input !== undefined) setText(req.input); }, [req]);
  if (!req) return null;
  const done = (v: string) => { setApp({ confirmReq: null }); req.resolve(req.input !== undefined ? v + text : v); };
  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-xl border border-white/10 bg-[#1c1c1f] p-5 shadow-2xl">
        <h2 className="text-sm font-semibold text-white">{req.title}</h2>
        <p className="mt-2 text-xs leading-relaxed text-neutral-400">{req.message}</p>
        {req.input !== undefined && (
          <input
            autoFocus value={text} onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') done(req.actions[req.actions.length - 1].value); if (e.key === 'Escape') done(req.actions[0].value); }}
            className="mt-3 w-full rounded-md border border-white/10 bg-neutral-900 px-3 py-2 text-sm text-white outline-none focus:border-[#E8913A]/60"
          />
        )}
        <div className="mt-5 flex justify-end gap-2">
          {req.actions.map((a) => <Btn key={a.value} variant={a.variant} className="px-3 py-1.5" onClick={() => done(a.value)}>{a.label}</Btn>)}
        </div>
      </div>
    </div>
  );
}
