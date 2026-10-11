import { useEffect, useRef, useState } from 'react';
import { ChevronFirst, ChevronLast, Circle, Film, Pause, Play, RotateCcw, SkipBack, SkipForward, Trash2, Undo2 } from 'lucide-react';
import { activeDoc, confirmDialog, getApp, setApp, toast, useApp } from '../state/store';
import { closeReplay, exportReplayVideo, openReplay, saveDoc } from '../state/actions';
import { fmtBytes, fmtTime } from '../engine/util';
import { canvasBus } from '../state/commands';
import { Btn, SectionTitle } from './ui';

const SPEEDS = [0.25, 0.5, 1, 2, 4, 8, 16, 32];

export function useReplayLoop() {
  const replay = useApp((s) => s.replay);
  const playing = replay?.playing;
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    let lastUi = 0;
    const loop = (now: number) => {
      const r = getApp().replay;
      if (!r || !r.playing) return;
      const dt = Math.min(100, now - last);
      last = now;
      const p = r.player;
      p.advanceTo(Math.min(p.duration, p.time + dt * r.speed));
      if (p.time >= p.duration && p.done) {
        setApp({ replay: { ...r, playing: false } });
        return;
      }
      canvasBus.dispatchEvent(new Event('view'));
      if (now - lastUi > 200) { lastUi = now; setApp({ tick: getApp().tick + 1 }); }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing]);
}

export default function ReplayPanel() {
  useApp((s) => s.tick);
  const replay = useApp((s) => s.replay);
  const doc = activeDoc();
  const [custom, setCustom] = useState('');
  const [video, setVideo] = useState<{ p: number; cancel: { cancelled: boolean } } | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  if (!doc) return <div className="text-[11px] text-neutral-500">No document open.</div>;
  const rec = doc.rec;
  const active = replay && replay.docId === doc.id ? replay : null;
  const p = active?.player;
  const strokes = rec.events.filter((e) => e.c?.k === 'stroke' || e.c?.k === 'inkAdd').length;

  const setR = (patch: Partial<NonNullable<typeof replay>>) => { const r = getApp().replay; if (r) setApp({ replay: { ...r, ...patch } }); };
  const seekFromPointer = (clientX: number) => {
    if (!p || !barRef.current) return;
    const r = barRef.current.getBoundingClientRect();
    p.seek(((clientX - r.left) / r.width) * p.duration);
    setApp({ tick: getApp().tick + 1 });
  };

  return (
    <div className="space-y-2 text-[11px]">
      <div className="flex items-center gap-2 rounded-md bg-white/[0.03] p-2">
        <span className={`flex items-center gap-1.5 font-medium ${rec.active ? 'text-red-400' : rec.enabled ? 'text-amber-300' : 'text-neutral-500'}`}>
          <Circle size={9} fill="currentColor" className={rec.active ? 'animate-pulse' : ''} />
          {rec.active ? 'Recording' : rec.enabled ? 'Paused' : 'Not recording'}
        </span>
        <span className="ml-auto text-neutral-500">{fmtBytes(rec.bytes)} · {rec.events.length} events</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {!rec.enabled && <Btn variant="primary" onClick={() => doc.startRecording()}><Circle size={10} fill="currentColor" /> Start recording</Btn>}
        {rec.enabled && rec.active && <Btn onClick={() => doc.pauseRecording()}><Pause size={11} /> Pause recording</Btn>}
        {rec.enabled && !rec.active && <Btn variant="primary" onClick={() => doc.resumeRecording()}><Circle size={10} fill="currentColor" /> Resume</Btn>}
        {!!rec.events.length && (
          <Btn title="Delete replay history for this document" onClick={async () => {
            const r = await confirmDialog('Delete replay history?', `This removes ${rec.events.length} recorded events (${fmtBytes(rec.bytes)}) from “${doc.name}”. The artwork itself is not affected.`, [{ label: 'Cancel', value: 'no' }, { label: 'Delete history', value: 'yes', variant: 'danger' }]);
            if (r === 'yes') { if (active) closeReplay(); doc.clearRecording(); toast('Replay history deleted'); }
          }}><Trash2 size={11} /></Btn>
        )}
      </div>
      <p className="text-[10px] leading-snug text-neutral-500">
        {strokes} strokes recorded. Recording is local only: strokes, timings, pressure and tilt are stored inside the .carbon file. Nothing is uploaded.
      </p>

      <SectionTitle>Playback</SectionTitle>
      {!active ? (
        <Btn variant="primary" className="w-full py-1.5" disabled={!rec.events.length} onClick={() => openReplay(doc)}><Play size={12} /> Watch drawing replay</Btn>
      ) : (
        <div className="space-y-2">
          <div
            ref={barRef}
            className="relative h-6 cursor-pointer touch-none rounded bg-neutral-800"
            onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); setR({ playing: false }); seekFromPointer(e.clientX); }}
            onPointerMove={(e) => e.buttons && seekFromPointer(e.clientX)}
          >
            <div className="absolute inset-y-0 left-0 rounded bg-[#E8913A]/40" style={{ width: `${(p!.time / Math.max(1, p!.duration)) * 100}%` }} />
            {p!.markers.map((m, i) => (
              <div key={i} title={m.label} className={`absolute top-0 h-2 w-px ${m.label === 'checkpoint' ? 'bg-sky-400' : m.label === 'undo' || m.label === 'redo' ? 'bg-neutral-400' : 'bg-white/70'}`} style={{ left: `${(m.t / Math.max(1, p!.duration)) * 100}%` }} />
            ))}
            <div className="absolute inset-y-0 w-0.5 bg-[#E8913A]" style={{ left: `${(p!.time / Math.max(1, p!.duration)) * 100}%` }} />
          </div>
          <div className="flex justify-between font-mono text-[10px] text-neutral-400">
            <span>{fmtTime(p!.time)}</span>
            <span>event {p!.idx}/{p!.events.length}</span>
            <span>{fmtTime(p!.duration)}</span>
          </div>
          <div className="flex items-center justify-center gap-1">
            <Btn title="Jump to beginning" onClick={() => { setR({ playing: false }); p!.seek(0); setApp({ tick: getApp().tick + 1 }); }}><ChevronFirst size={14} /></Btn>
            <Btn title="Previous event" onClick={() => { setR({ playing: false }); p!.stepEvent(-1); }}><SkipBack size={13} /></Btn>
            <Btn variant="primary" className="px-4" title={active.playing ? 'Pause' : 'Play / resume'} onClick={() => {
              if (!active.playing && p!.time >= p!.duration) p!.seek(0);
              setR({ playing: !active.playing });
            }}>{active.playing ? <Pause size={14} /> : <Play size={14} />}</Btn>
            <Btn title="Next event" onClick={() => { setR({ playing: false }); p!.stepEvent(1); }}><SkipForward size={13} /></Btn>
            <Btn title="Jump to end" onClick={() => { setR({ playing: false }); p!.seek(p!.duration); setApp({ tick: getApp().tick + 1 }); }}><ChevronLast size={14} /></Btn>
            <Btn title="Restart" onClick={() => { p!.seek(0); setR({ playing: true }); }}><RotateCcw size={13} /></Btn>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            {SPEEDS.map((s) => <Btn key={s} active={active.speed === s} onClick={() => setR({ speed: s })}>{s}×</Btn>)}
            <input
              value={custom} placeholder="custom" onKeyDown={(e) => e.stopPropagation()}
              onChange={(e) => { setCustom(e.target.value); const v = parseFloat(e.target.value); if (v > 0 && v <= 500) setR({ speed: v }); }}
              className="w-14 rounded border border-white/10 bg-neutral-900 px-1 py-0.5 text-[10px] text-neutral-200 outline-none"
            />
          </div>
          <div className="flex flex-wrap gap-1 border-t border-white/5 pt-2">
            <Btn variant="primary" onClick={closeReplay}><Undo2 size={11} /> Return to artwork</Btn>
            <Btn onClick={() => saveDoc(doc)}>Save project</Btn>
            {!video ? (
              <Btn title="Render the replay to a WebM video" onClick={async () => {
                const cancel = { cancelled: false };
                setVideo({ p: 0, cancel });
                try {
                  await exportReplayVideo(doc, active.speed, (x) => setVideo((v) => (v ? { ...v, p: x } : v)), cancel);
                } catch (e) {
                  toast('Video export failed: ' + (e instanceof Error ? e.message : e), 'error');
                }
                setVideo(null);
              }}><Film size={11} /> Export video</Btn>
            ) : (
              <Btn variant="danger" onClick={() => { video.cancel.cancelled = true; setVideo(null); }}>Cancel video {Math.round(video.p * 100)}%</Btn>
            )}
          </div>
          <p className="text-[10px] leading-snug text-neutral-500">The replay is rebuilt in an isolated copy from the recorded events. Your live document is not touched, and you can keep drawing as soon as you return.</p>
        </div>
      )}
    </div>
  );
}
