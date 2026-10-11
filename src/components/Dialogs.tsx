import { useEffect, useState } from 'react';
import { CheckCircle2, FolderOpen, Loader2, XCircle } from 'lucide-react';
import { activeDoc, ALL_TOOLS, DEFAULT_SHORTCUTS, getApp, SHORTCUT_LABELS, setApp, toast, updateSettings, useApp } from '../state/store';
import { configureDoc, exportImage, newDocument } from '../state/actions';
import { comboFromEvent, prettyCombo } from '../state/commands';
import { checkDims, MAX_AREA, MAX_SIDE } from '../engine/document';
import { runDiagnostics, type TestResult } from '../engine/selftest';
import { Btn, Modal, NumInput, SectionTitle, Select, Slider, Toggle } from './ui';
import { CarbonAppIcon, CarbonLockup, CarbonMark } from './Brand';
import { cn } from '../utils/cn';
import { isNative, storageLabel } from '../platform/native';
import { EDITION } from '../platform/edition';
import { APP_LABEL, APP_VERSION } from '../version';
import { ColorDockSettings } from '../win/ColorDock';
import { PatchesDialog } from '../win/Patches';
import { BrushFusionDialog } from '../win/BrushFusion';
import { ABOUT_CREATOR, ABOUT_PROJECT_COPY } from './aboutCopy';
import CommandPalette from './CommandPalette';
import QuickStartDialog from './QuickStartDialog';
import MyIllustrationsDialog from './MyIllustrationsDialog';

const close = () => setApp({ dialog: null }); // closes any open dialog

export const CANVAS_PRESETS = [
  { name: 'Screen HD', w: 1920, h: 1080 }, { name: 'Square', w: 2048, h: 2048 }, { name: 'A4 @ 300 dpi', w: 2480, h: 3508 },
  { name: 'A5 @ 300 dpi', w: 1748, h: 2480 }, { name: 'Comic page', w: 1988, h: 3056 }, { name: 'Sketch', w: 1600, h: 1200 },
  { name: '4K UHD', w: 3840, h: 2160 }, { name: 'Phone wallpaper', w: 1290, h: 2796 },
];

function NewCanvas() {
  const [w, setW] = useState(2048);
  const [h, setH] = useState(1536);
  const [name, setName] = useState('Untitled');
  const [bg, setBg] = useState<'white' | 'transparent' | 'color'>('white');
  const [color, setColor] = useState('#f4efe6');
  const err = checkDims(w, h);
  const create = () => {
    if (err) return;
    newDocument(w, h, name.trim() || 'Untitled', bg === 'white' ? '#ffffff' : bg === 'transparent' ? null : color);
    close();
  };
  return (
    <Modal title="New Canvas" onClose={close} width={520} footer={<><Btn onClick={close}>Cancel</Btn><Btn variant="primary" disabled={!!err} onClick={create} className="px-4">Create</Btn></>}>
      <div className="grid grid-cols-4 gap-2">
        {CANVAS_PRESETS.map((p) => (
          <button key={p.name} onClick={() => { setW(p.w); setH(p.h); }} className={cn('rounded-lg border p-2 text-left text-[11px]', w === p.w && h === p.h ? 'border-[#E8913A] bg-[#E8913A]/10' : 'border-white/10 hover:border-white/30')}>
            <div className="text-neutral-200">{p.name}</div>
            <div className="font-mono text-[10px] text-neutral-500">{p.w}×{p.h}</div>
          </button>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3 text-xs">
        <label className="col-span-3">Name<input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded border border-white/10 bg-neutral-900 px-2 py-1 text-neutral-100 outline-none" /></label>
        <label>Width (px)<NumInput value={w} min={16} max={MAX_SIDE} onChange={setW} className="mt-1" /></label>
        <label>Height (px)<NumInput value={h} min={16} max={MAX_SIDE} onChange={setH} className="mt-1" /></label>
        <div className="flex items-end"><Btn onClick={() => { setW(h); setH(w); }}>⇄ Swap</Btn></div>
      </div>
      <div className="mt-3 flex items-center gap-2 text-xs">
        <span className="text-neutral-400">Background</span>
        {(['white', 'transparent', 'color'] as const).map((b) => <Btn key={b} active={bg === b} onClick={() => setBg(b)}>{b[0].toUpperCase() + b.slice(1)}</Btn>)}
        {bg === 'color' && <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-6 w-8 cursor-pointer rounded border-0 bg-transparent" />}
      </div>
      <p className={cn('mt-3 text-[11px]', err ? 'text-red-400' : 'text-neutral-500')}>{err || `≈ ${((w * h * 4) / 1024 / 1024).toFixed(0)} MB per raster layer. Limits: ${MAX_SIDE}px per side, ${MAX_AREA / 1e6} MP.`}</p>
    </Modal>
  );
}

function ExportDialog() {
  const d = activeDoc();
  const [type, setType] = useState<'image/png' | 'image/jpeg' | 'image/webp'>('image/png');
  const [q, setQ] = useState(0.92);
  const [scale, setScale] = useState(1);
  const [transparent, setTransparent] = useState(true);
  if (!d) return null;
  const tooBig = checkDims(Math.round(d.width * scale), Math.round(d.height * scale));
  return (
    <Modal title="Export Image" onClose={close} width={420} footer={<><Btn onClick={close}>Cancel</Btn><Btn variant="primary" disabled={!!tooBig} className="px-4" onClick={() => { exportImage(d, type, q, scale, transparent); close(); }}>Export</Btn></>}>
      <div className="space-y-3 text-xs">
        <div className="flex gap-1">{(['image/png', 'image/jpeg', 'image/webp'] as const).map((t) => <Btn key={t} active={type === t} onClick={() => setType(t)} className="px-3">{t.split('/')[1].toUpperCase()}</Btn>)}</div>
        {type !== 'image/png' && <Slider label="Quality" value={q} min={0.3} max={1} onChange={setQ} />}
        <Select label="Scale" value={String(scale)} onChange={(v) => setScale(Number(v))} options={[0.25, 0.5, 1, 2, 3].map((s) => ({ value: String(s), label: `${s}× (${Math.round(d.width * s)}×${Math.round(d.height * s)})` }))} />
        {type !== 'image/jpeg' && <Toggle label="Keep transparency (omit transparent background)" checked={transparent} onChange={setTransparent} />}
        <p className="text-[11px] text-neutral-500">This flattens the visible artwork to PNG, JPEG or WebP; it does not contain editable layers or replay events. Save a .carbon project for editable artwork and Drawing Replay. Crisp Ink stays sharp when upscaled. {tooBig && <span className="text-red-400">{tooBig}</span>}</p>
      </div>
    </Modal>
  );
}

function SizeDialog({ mode }: { mode: 'canvas' | 'image' }) {
  const d = activeDoc();
  const [w, setW] = useState(d?.width || 100);
  const [h, setH] = useState(d?.height || 100);
  const [lock, setLock] = useState(true);
  const [anchor, setAnchor] = useState([0.5, 0.5]);
  if (!d) return null;
  const err = checkDims(w, h);
  const apply = () => {
    try {
      d.exec(mode === 'canvas' ? { k: 'resize', w, h, ax: anchor[0], ay: anchor[1] } : { k: 'scale', w, h });
      close();
    } catch (e) { toast(e instanceof Error ? e.message : String(e), 'error'); }
  };
  return (
    <Modal title={mode === 'canvas' ? 'Canvas Size' : 'Image Size'} onClose={close} width={400} footer={<><Btn onClick={close}>Cancel</Btn><Btn variant="primary" disabled={!!err} onClick={apply} className="px-4">Apply</Btn></>}>
      <div className="grid grid-cols-2 gap-3 text-xs">
        <label>Width<NumInput value={w} onChange={(v) => { setW(v); if (lock && mode === 'image') setH(Math.round((v * d.height) / d.width)); }} className="mt-1" /></label>
        <label>Height<NumInput value={h} onChange={(v) => { setH(v); if (lock && mode === 'image') setW(Math.round((v * d.width) / d.height)); }} className="mt-1" /></label>
      </div>
      {mode === 'image' && <Toggle label="Keep proportions" checked={lock} onChange={setLock} />}
      {mode === 'canvas' && (
        <div className="mt-3 flex items-center gap-3 text-xs text-neutral-400">
          Anchor
          <div className="grid grid-cols-3 gap-1">
            {[0, 0.5, 1].flatMap((y) => [0, 0.5, 1].map((x) => (
              <button key={x + '-' + y} onClick={() => setAnchor([x, y])} className={cn('h-5 w-5 rounded-sm border', anchor[0] === x && anchor[1] === y ? 'border-[#E8913A] bg-[#E8913A]' : 'border-white/20 hover:border-white/50')} />
            )))}
          </div>
        </div>
      )}
      <p className={cn('mt-3 text-[11px]', err ? 'text-red-400' : 'text-neutral-500')}>{err || `Current: ${d.width}×${d.height}. This is undoable. Crisp Ink paths are transformed losslessly.`}</p>
    </Modal>
  );
}

function ShortcutEditor() {
  const shortcuts = useApp((s) => s.settings.shortcuts);
  const [capture, setCapture] = useState<string | null>(null);
  useEffect(() => {
    if (!capture) return;
    const h = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') return setCapture(null);
      const c = comboFromEvent(e);
      if (!c) return;
      const conflict = Object.entries(getApp().settings.shortcuts).find(([k, v]) => v === c && k !== capture);
      const next = { ...getApp().settings.shortcuts, [capture]: c };
      if (conflict) { next[conflict[0]] = ''; toast(`Removed ${prettyCombo(c)} from “${SHORTCUT_LABELS[conflict[0]] || conflict[0]}”`); }
      updateSettings({ shortcuts: next });
      setCapture(null);
    };
    window.addEventListener('keydown', h, true);
    return () => window.removeEventListener('keydown', h, true);
  }, [capture]);
  return (
    <div className="space-y-1">
      <div className="max-h-[46vh] overflow-y-auto rounded border border-white/5">
        {Object.keys(DEFAULT_SHORTCUTS).map((id) => (
          <div key={id} className="flex items-center justify-between border-b border-white/5 px-2 py-1 text-[11px] last:border-0">
            <span className="text-neutral-300">{SHORTCUT_LABELS[id] || id}</span>
            <button onClick={() => setCapture(id)} className={cn('min-w-[90px] rounded px-2 py-0.5 font-mono text-[10px]', capture === id ? 'bg-[#E8913A] text-black' : 'bg-white/5 text-neutral-300 hover:bg-white/10')}>
              {capture === id ? 'press keys…' : shortcuts[id] ? prettyCombo(shortcuts[id]) : '—'}
            </button>
          </div>
        ))}
      </div>
      <Btn onClick={() => updateSettings({ shortcuts: { ...DEFAULT_SHORTCUTS } })}>Restore defaults</Btn>
    </div>
  );
}

function SettingsDialog({ initialTab = 'interface' }: { initialTab?: string }) {
  const s = useApp((x) => x.settings);
  const [tab, setTab] = useState(initialTab);
  const apply = (p: Partial<typeof s>) => { updateSettings(p); getApp().docs.forEach(configureDoc); };
  return (
    <Modal title="Preferences" onClose={close} width={620}>
      <div className="flex gap-4">
        <div className="flex w-32 shrink-0 flex-col gap-1">
          {[['interface', 'Interface'], ...(EDITION.windows ? [['home', 'Home scene']] : []), ['input', 'Input & Gestures'], ['replay', 'Replay & Storage'], ...(isNative() ? [['android', 'Android']] : []), ...(EDITION.windows ? [['workspace', 'Canvas & Workspace']] : []), ['rail', 'Tool Rail'], ['shortcuts', 'Shortcuts']].map(([k, l]) => <Btn key={k} active={tab === k} onClick={() => setTab(k)} className="justify-start">{l}</Btn>)}
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          {tab === 'interface' && <>
            <Select label="Interface mode" value={s.uiMode} onChange={(v) => apply({ uiMode: v })} options={[{ value: 'auto', label: 'Automatic (detect touch tablets)' }, { value: 'desktop', label: 'Desktop' }, { value: 'tablet', label: 'Tablet' }]} />
            <Slider label="Interface scale" value={s.uiScale} min={0.8} max={1.5} step={0.05} fmt={(v) => Math.round(v * 100) + '%'} onChange={(v) => apply({ uiScale: v })} />
            <Toggle label="Brush outline cursor" checked={s.brushOutline} onChange={(v) => apply({ brushOutline: v })} />
            <Slider label="Grid size" value={s.gridSize} min={8} max={512} step={8} fmt={(v) => v + 'px'} onChange={(v) => apply({ gridSize: v })} />
            <Toggle label="Restore previous session on launch" checked={s.restoreSession} onChange={(v) => apply({ restoreSession: v })} />
            <Slider label="Recovery sweep interval" value={s.autosaveSec} min={10} max={300} step={5} fmt={(v) => v + 's'} onChange={(v) => apply({ autosaveSec: v })} />
            <p className="text-[10px] leading-relaxed text-neutral-500">Committed document edits also schedule a local IndexedDB recovery save after a short quiet period; this interval is the periodic fallback sweep.</p>
            <Slider label="Undo steps" value={s.undoLimit} min={10} max={200} step={5} fmt={(v) => String(v)} onChange={(v) => apply({ undoLimit: v })} />
          </>}
          {tab === 'home' && EDITION.windows && <>
            <Toggle label="Show the Philippine coast scene on the home screen" checked={s.homeSceneEnabled} onChange={(v) => apply({ homeSceneEnabled: v })} />
            <Toggle label="Animate waves and subtle camera drift" checked={s.homeSceneMotion} onChange={(v) => apply({ homeSceneMotion: v })} />
            <p className="pt-2 text-[11px] leading-relaxed text-neutral-500">The coastal image is packaged locally and works offline. Disabling animation keeps a still frame; system reduced-motion preferences also disable movement. Turning the scene off leaves the home layout and actions in place.</p>
          </>}
          {tab === 'input' && <>
            <Toggle label="Stylus-only drawing (fingers pan / zoom)" checked={s.stylusOnly} onChange={(v) => apply({ stylusOnly: v })} />
            <Toggle label="Automatic palm rejection (after a stylus is used, fingers pan)" checked={s.palmAuto} onChange={(v) => apply({ palmAuto: v })} />
            <Toggle label="Mouse uses medium pressure (enables pressure dynamics)" checked={s.mousePressure} onChange={(v) => apply({ mousePressure: v })} />
            <Select label="Two-finger tap" value={s.twoFingerTap} onChange={(v) => apply({ twoFingerTap: v })} options={[{ value: 'undo', label: 'Undo' }, { value: 'none', label: 'Nothing' }]} />
            <Select label="Three-finger tap" value={s.threeFingerTap} onChange={(v) => apply({ threeFingerTap: v })} options={[{ value: 'redo', label: 'Redo' }, { value: 'none', label: 'Nothing' }]} />
            <p className="pt-2 text-[11px] leading-relaxed text-neutral-500">Two-finger drag pans, pinch zooms, twist rotates. Pressure and tilt are read from Pointer Events when the device and OS provide them. Palm rejection relies on the OS. Turn on stylus-only mode to ignore touch drawing completely.</p>
          </>}
          {tab === 'replay' && <>
            <Toggle label="Automatically record new drawings and opened projects without replay" checked={s.recordByDefault} onChange={(v) => apply({ recordByDefault: v })} />
            <Slider label="Replay memory limit / project" value={s.replayLimitMB} min={20} max={1000} step={10} fmt={(v) => v + ' MB'} onChange={(v) => apply({ replayLimitMB: v })} />
            <Toggle label="Shorten long pauses in Drawing Replay" checked={s.compressReplayPauses} onChange={(v) => apply({ compressReplayPauses: v })} />
            {s.compressReplayPauses && <Slider label="Maximum replay pause" value={s.idleCapSec} min={0.5} max={10} step={0.5} fmt={(v) => v + 's'} onChange={(v) => apply({ idleCapSec: v })} />}
            <p className="pt-2 text-[11px] leading-relaxed text-neutral-500">By default, Drawing Replay keeps the real time between drawing operations. Optional pause shortening is off until you turn it on. No idle frames, cursor or hand movement, menus, screen, microphone or camera are recorded. When the estimated replay memory limit is reached, recording pauses automatically; artwork is unaffected. Replay data stays local and is stored with its project.</p>
          </>}
          {tab === 'workspace' && EDITION.windows && <ColorDockSettings />}
          {tab === 'android' && <>
            <Toggle label="Open the share sheet after exporting" checked={s.shareExports} onChange={(v) => apply({ shareExports: v })} />
            <Toggle label="Hide system bars in canvas-only mode" checked={s.immersive} onChange={(v) => apply({ immersive: v })} />
            <p className="pt-2 text-[11px] leading-relaxed text-neutral-500">
              Projects are saved to <b className="text-neutral-300">{storageLabel()}</b>. Exports also keep a copy in CARBON/Exports.
              The Android back button closes dialogs, transform, replay and panels in that order, then minimises CARBON. Open work is autosaved and restored the next time you launch.
              On Android 11 and later, CARBON can only list files it created itself. Use File → Open to pick any other .carbon file.
            </p>
          </>}
          {tab === 'rail' && <>
            <SectionTitle>Tools shown in the left rail</SectionTitle>
            <div className="grid grid-cols-2 gap-1">
              {ALL_TOOLS.map((t) => (
                <label key={t.id} className="flex items-center gap-2 text-[11px] text-neutral-300">
                  <input type="checkbox" checked={s.railTools.includes(t.id)} onChange={() => apply({ railTools: s.railTools.includes(t.id) ? s.railTools.filter((x) => x !== t.id) : [...s.railTools, t.id] })} />
                  {t.label}
                </label>
              ))}
            </div>
          </>}
          {tab === 'shortcuts' && <ShortcutEditor />}
        </div>
      </div>
    </Modal>
  );
}

function Diagnostics() {
  const [res, setRes] = useState<TestResult[]>([]);
  const [running, setRunning] = useState(false);
  const run = async () => {
    setRunning(true);
    setRes([]);
    try { await runDiagnostics(setRes); } catch (e) { toast('Diagnostics crashed: ' + e, 'error'); }
    setRunning(false);
  };
  useEffect(() => { run(); }, []);
  const passed = res.filter((r) => r.pass).length;
  return (
    <Modal title="Diagnostics: automated acceptance tests" onClose={close} width={640} footer={<><Btn onClick={run} disabled={running}>Run again</Btn><Btn variant="primary" onClick={close}>Close</Btn></>}>
      <p className="mb-3 text-[11px] text-neutral-500">These tests run in isolated documents and never touch your open artwork. They cover the stroke engine, undo/redo, Drawing Replay reconstruction and seeking, save/reopen round trips, rejection of corrupt saves, the brush library, and recording overhead.</p>
      <div className="space-y-1">
        {res.map((r, i) => (
          <div key={i} className="flex items-start gap-2 rounded bg-white/[0.03] px-2 py-1.5 text-[11px]">
            {r.pass ? <CheckCircle2 size={14} className="mt-px shrink-0 text-emerald-400" /> : <XCircle size={14} className="mt-px shrink-0 text-red-400" />}
            <div className="min-w-0 flex-1"><div className="text-neutral-200">{r.name}</div><div className={r.pass ? 'text-neutral-500' : 'text-red-300'}>{r.detail}</div></div>
            <span className="font-mono text-[10px] text-neutral-600">{r.ms.toFixed(0)}ms</span>
          </div>
        ))}
        {running && <div className="flex items-center gap-2 py-2 text-[11px] text-neutral-400"><Loader2 size={14} className="animate-spin" /> running…</div>}
      </div>
      {!running && res.length > 0 && <div className={cn('mt-3 text-xs font-medium', passed === res.length ? 'text-emerald-400' : 'text-amber-300')}>{passed}/{res.length} passed</div>}
    </Modal>
  );
}

function Docs() {
  return (
    <Modal title="Architecture & native file format" onClose={close} width={720}>
      <div className="space-y-3 text-[12px] leading-relaxed text-neutral-300">
        <SectionTitle>Engine</SectionTitle>
        <p><b>Document engine:</b> every edit is a serialisable <i>command</i> (stroke, fill, ink path, transform, layer op, and so on) applied by one deterministic function. The live editor, Drawing Replay and the diagnostics all use that same function, so a replayed document matches the saved one.</p>
        <p><b>Brush engine:</b> a seeded, deterministic dab renderer with spacing, stabilisation, pressure/tilt/speed dynamics, scatter, colour dynamics and document-anchored paper grain. Its five engines are dry build-up, watercolour wash (wet-edge darkening, granulation, blooms), paint mixing (colour pickup from the canvas), smudge/blend (premultiplied lerp), and Crisp Ink.</p>
        <p><b>Crisp Ink:</b> paths are stored as control points with pressure (Catmull-Rom splines) plus width, opacity and tapers. Outlines are rebuilt at the current view resolution, so they stay sharp at any zoom and export scale. Supported operations: select, move, control-point editing, recolouring, whole or partial (splitting) erasing, transforms, and rasterising.</p>
        <p><b>Undo:</b> region-based pixel snapshots for paint operations, structural snapshots for layer operations, and immutable path arrays for Crisp Ink. Undo history has a step limit and a memory budget.</p>
        <p><b>Rendering:</b> GPU-accelerated 2D canvas compositing with blend modes. Stroke post-processing only touches the dirty region, and the view redraws on demand.</p>
        <SectionTitle>Drawing Replay</SectionTitle>
        <p>Each document has an ordered event log. An event is a command with timing and full input samples (x, y, pressure, tiltX, tiltY, t), an undo/redo marker, an informational marker (tool, brush or colour change) or a <i>checkpoint</i> (a full state snapshot). Checkpoints are written when recording starts or resumes, and when undo reaches history recorded before a gap. That keeps reconstruction exact. Playback rebuilds the document in an isolated engine and takes in-memory checkpoints for fast seeking. Brush parameters and random seeds are stored with every stroke.</p>
        <SectionTitle>.carbon v1 (zip container)</SectionTitle>
        <pre className="overflow-x-auto rounded bg-black/40 p-3 font-mono text-[10px] text-neutral-400">{`mimetype                 application/x-carbon (stored)
manifest.json            { format:"carbon", version:1, width, height, background,
                           layers:[{id,name,type,visible,locked,opacity,blend,alphaLock,
                                    file? | strokes?}], selection, meta, assets,
                           replay:{file,enabled,paused,epoch}, extensions:{} }
layers/<id>.png          lossless raster layer pixels
assets/<id>              embedded imported images
replay/events.json       { brushes:[…deduplicated…], events:[{t,c|u|m|cp}] }
replay/cp/<n>/<id>.png   checkpoint layer pixels
thumbnail.png            preview`}</pre>
        <p><b>Safe save:</b> the archive is fully serialised and verified before anything is written. Where the File System Access API is available, writes go to a swap file that replaces the original only when it closes successfully. Otherwise a new file is downloaded. A local backup copy is also kept. Changed documents are autosaved to IndexedDB shortly after committed edits, with periodic and app-lifecycle recovery sweeps.</p>
        <SectionTitle>Platform note</SectionTitle>
        <p><b>Android:</b> the same build ships as an APK in a Capacitor 8 shell (see docs/ANDROID.md). It saves projects natively to Documents/CARBON, exports through the share sheet, handles the back button, autosaves in the background and has automatic palm rejection. {isNative() ? 'You are running the Android edition.' : ''}</p>
        <p>{APP_LABEL} is a local-first application. It runs offline in desktop browsers on Windows and on Android tablets (Chrome), and no account is required. The engine sits behind platform adapters (file access, input, storage), which leaves room for future native packaging.</p>
      </div>
    </Modal>
  );
}

function Space() {
  return (
    <Modal title="CARBON Space: future 3D workspace (planned)" onClose={close} width={600}>
      <div className="space-y-3 text-[12px] leading-relaxed text-neutral-300">
        <p className="rounded bg-amber-500/10 px-3 py-2 text-amber-200">CARBON Space is <b>not part of CARBON 1.0</b>. Nothing in this release depends on it. This page records the planned direction only.</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>A dedicated spatial workspace built around the 3D canvas, not the 2D UI with extra buttons.</li>
          <li>Drawing on 3D planes and surfaces, with perspective-aware strokes and spatial sketching.</li>
          <li>Orbit, pan and dolly camera navigation, plus a dedicated 3D tool palette.</li>
          <li>3D reference objects, scene organisation and object visibility.</li>
          <li>Hybrid 2D/3D compositions, reusing CARBON's command log and Drawing Replay.</li>
        </ul>
        <p>The .carbon manifest reserves an <code className="text-[#E8913A]">extensions</code> object so that future scene data can be added without breaking 1.0 files. Animation (timelines, keyframes, onion skinning) is explicitly out of scope.</p>
      </div>
    </Modal>
  );
}

function About() {
  return (
    <Modal title="About Carbon: Prime" onClose={close} width={460}>
      <div className="flex flex-col items-center gap-4 py-2 text-center">
        <CarbonLockup />
        <div className="flex items-end gap-4 text-neutral-500">
          <CarbonAppIcon size={56} />
          <CarbonMark size={36} />
          <CarbonMark size={36} mono className="text-neutral-300" />
          <CarbonMark size={18} />
        </div>
        <p className="text-xs text-neutral-400">{APP_LABEL} · {EDITION.windows ? 'Windows edition · drawing, painting, comic, 3D & illustration studio' : 'Professional 2D drawing & illustration studio'}</p>
        {EDITION.windows && (
          <div className="flex gap-2">
            <span className="rounded bg-white/5 px-2 py-0.5 font-mono text-[10px] text-neutral-400">version {APP_VERSION}</span>
            <button onClick={() => setApp({ dialog: 'patches' })} className="text-[11px] text-[#E8913A] hover:underline">What's new</button>
          </div>
        )}
        <p className="text-[11px] leading-relaxed text-neutral-500">Works fully offline. Your artwork, recordings and settings stay on this device. There is no telemetry, no account and no cloud dependency.</p>
        <div className="flex items-center justify-center gap-2">
          <p className="text-[11px] text-neutral-400">{ABOUT_CREATOR}</p>
          <button
            type="button"
            onClick={() => setApp({ dialog: 'projectInfo' })}
            className="rounded-md p-1.5 text-neutral-400 transition hover:bg-white/10 hover:text-white"
            title="Open About / Project Information"
            aria-label="Open About / Project Information"
          >
            <FolderOpen size={15} />
          </button>
        </div>
      </div>
    </Modal>
  );
}

function ProjectInformation() {
  return (
    <Modal title="About / Project Information" onClose={close} width={640}>
      <p className="whitespace-pre-wrap text-left text-[13px] leading-relaxed text-neutral-200">{ABOUT_PROJECT_COPY}</p>
    </Modal>
  );
}

export default function Dialogs() {
  const dialog = useApp((s) => s.dialog);
  switch (dialog) {
    case 'new': return <NewCanvas />;
    case 'export': return <ExportDialog />;
    case 'canvasSize': return <SizeDialog mode="canvas" />;
    case 'imageSize': return <SizeDialog mode="image" />;
    case 'settings': return <SettingsDialog />;
    case 'settingsHome': return EDITION.windows ? <SettingsDialog initialTab="home" /> : <SettingsDialog />;
    case 'shortcuts': return <SettingsDialog initialTab="shortcuts" />;
    case 'commandPalette': return <CommandPalette />;
    case 'quickStart': return <QuickStartDialog />;
    case 'projects': return <MyIllustrationsDialog />;
    case 'colorDock': return EDITION.windows ? <SettingsDialog initialTab="workspace" /> : null;
    case 'patches': return EDITION.windows ? <PatchesDialog /> : null;
    case 'fusion': return EDITION.windows ? <BrushFusionDialog /> : null;
    case 'diagnostics': return <Diagnostics />;
    case 'docs': return <Docs />;
    case 'space': return <Space />;
    case 'about': return <About />;
    case 'projectInfo': return <ProjectInformation />;
    default: return null;
  }
}
