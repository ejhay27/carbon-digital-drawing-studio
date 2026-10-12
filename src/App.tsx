import { useEffect, useRef, useState } from 'react';
import { deliverFile, initNative, isNative, setImmersive } from './platform/native';
import { setDownloadImpl } from './engine/util';
import { setCanvasLimits } from './engine/document';
import { Minimize2, PanelRight } from 'lucide-react';
import MenuBar from './components/MenuBar';
import { ConfirmHost, DocTabs, StatusBar, Toasts, ToolRail } from './components/Chrome';
import CanvasView from './components/CanvasView';
import FloatingPalette from './components/FloatingPalette';
import Dock, { FloatingPanels } from './components/Dock';
import Dialogs from './components/Dialogs';
import Welcome from './components/Welcome';
import Home from './components/Home';
import { useReplayLoop } from './components/ReplayPanel';
import { EDITION } from './platform/edition';
import WinOverlay, { setWin, useWin } from './win/WinOverlay';
import { documentWorkspace } from './win/workspaceModel';
import { BrushMarket, ComicPanel, EffectsPanel, WorkspaceBar } from './win/WinPanels';
import Studio3D from './win/Studio3D';
import ColorDock, { effectiveDock } from './win/ColorDock';
import { useDock } from './win/dockModel';
import OrbitBoard, { boardAddFiles } from './win/OrbitBoard';
import { WIN_PANELS } from './state/store';
import { openComicFile } from './state/actions';
import { activeDoc, getApp, setApp, toast, updateLayout, useApp } from './state/store';
import { autosaveAll, closeReplay, importImageFile, openBytes, openImageAsDoc, restoreSession } from './state/actions';
import { comboFromEvent, emitCanvas, runAction } from './state/commands';

function useTabletMode() {
  const mode = useApp((s) => s.settings.uiMode);
  const [auto, setAuto] = useState(false);
  useEffect(() => {
    const q = () => setAuto(isNative() || (matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches) || window.innerWidth < 900);
    q();
    window.addEventListener('resize', q);
    return () => window.removeEventListener('resize', q);
  }, []);
  return mode === 'tablet' || (mode === 'auto' && auto);
}

export default function App() {
  const docs = useApp((s) => s.docs);
  const activeId = useApp((s) => s.activeId);
  const homeScreen = useApp((s) => s.homeScreen);
  const canvasOnly = useApp((s) => s.canvasOnly);
  const layout = useApp((s) => s.layout);
  const uiScale = useApp((s) => s.settings.uiScale);
  const autosaveSec = useApp((s) => s.settings.autosaveSec);
  const tablet = useTabletMode();
  const workspace = useWin((s) => s.workspace);
  const dockCfg = useDock((s) => s.cfg); // Color Dock settings (Windows)
  // A document tab owns its studio type; switching tabs never reuses a Comic/3D document as a Draw canvas.
  useEffect(() => {
    const doc = getApp().docs.find((item) => item.id === activeId);
    if (!doc) return;
    const target = documentWorkspace(doc);
    if (target !== 'comic' && getApp().tool === 'comic') setApp({ tool: 'brush' });
    if (useWin.getState().workspace !== target) setWin({ workspace: target });
  }, [activeId]);
  // Windows 2.2.0: add the new panels to an existing saved layout once (collapsed); never runs on Android
  useEffect(() => {
    if (!EDITION.windows || localStorage.getItem('carbon-win-panels-220')) return;
    const l = getApp().layout;
    const add = WIN_PANELS.filter((p) => !l.order.includes(p));
    updateLayout({ order: [...l.order, ...add], collapsed: [...l.collapsed, ...add.filter((p) => !l.collapsed.includes(p))] });
    localStorage.setItem('carbon-win-panels-220', '1');
  }, []);
  const [{ w: winW, h: winH }, setWinSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const f = () => setWinSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', f);
    return () => window.removeEventListener('resize', f);
  }, []);
  const [dragOver, setDragOver] = useState(false);
  useReplayLoop();
  const zoom = uiScale * (tablet ? 1.12 : 1);

  const tabletRef = useRef(tablet);
  tabletRef.current = tablet;

  // restore previous session + Android platform integration
  useEffect(() => {
    if (isNative()) {
      setCanvasLimits(6144, 25_000_000);
      setDownloadImpl((blob, name) => {
        deliverFile(blob, name, getApp().settings.shareExports)
          .then((path) => toast(`Exported to ${path}`, 'success'))
          .catch((e) => toast('Export failed: ' + (e instanceof Error ? e.message : e), 'error'));
      });
      initNative({
        onPause: () => { autosaveAll(true); },
        onBack: () => {
          const s = getApp();
          if (s.confirmReq) { const r = s.confirmReq; setApp({ confirmReq: null }); r.resolve(r.actions[0].value); return true; }
          if (s.dialog) { setApp({ dialog: null }); return true; }
          if (s.textEdit) { setApp({ textEdit: null }); return true; }
          if (s.transformActive) { emitCanvas('cancel-transform'); setApp({ tool: 'brush' }); return true; }
          if (s.canvasOnly) { setApp({ canvasOnly: false }); return true; }
          if (s.replay) { closeReplay(); return true; }
          if (tabletRef.current && s.layout.dockOpen) { updateLayout({ dockOpen: false }); return true; }
          autosaveAll(true);
          return false; // minimise; work is autosaved and restored on next launch
        },
      });
    }
    if (getApp().settings.restoreSession) restoreSession();
  }, []);

  const immersive = useApp((s) => s.settings.immersive);
  useEffect(() => { setImmersive(canvasOnly && immersive); }, [canvasOnly, immersive]);

  // autosave + crash recovery
  useEffect(() => {
    const id = setInterval(() => autosaveAll(), autosaveSec * 1000);
    const vis = () => document.visibilityState === 'hidden' && autosaveAll();
    const before = (e: BeforeUnloadEvent) => {
      autosaveAll();
      if (getApp().docs.some((d) => d.dirty)) { e.preventDefault(); e.returnValue = ''; }
    };
    document.addEventListener('visibilitychange', vis);
    window.addEventListener('beforeunload', before);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', vis); window.removeEventListener('beforeunload', before); };
  }, [autosaveSec]);

  // global keyboard shortcuts
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (getApp().dialog || getApp().confirmReq) return;
      const c = comboFromEvent(e);
      if (!c) return;
      const sc = getApp().settings.shortcuts;
      const action = Object.keys(sc).find((k) => sc[k] === c);
      if (action) {
        e.preventDefault();
        runAction(action);
      } else if (c === 'escape' && getApp().canvasOnly) setApp({ canvasOnly: false });
      else if (c === 'ctrl+s' || c === 'ctrl+o') e.preventDefault();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  // drag & drop files
  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (EDITION.windows && workspace === 'board' && files.every((f) => f.type.startsWith('image/'))) { await boardAddFiles(files); return; }
    for (const f of files) {
      if (/\.carbon$/i.test(f.name)) await openBytes(new Uint8Array(await f.arrayBuffer()), f.name);
      else if (/\.carboncomic$/i.test(f.name)) await openComicFile(f);
      else if (f.type.startsWith('image/')) {
        const d = activeDoc();
        if (d && !getApp().replay) await importImageFile(d, f);
        else await openImageAsDoc(f);
      }
    }
  };

  const homeVisible = docs.length === 0 || homeScreen;
  const showChrome = !canvasOnly && !homeVisible;
  // Color Dock (Windows): only where a 2D canvas is visible; lives beside/below <main>, never over the artwork
  const showDock = EDITION.windows && showChrome && docs.length > 0 && dockCfg.enabled && (workspace === 'draw' || workspace === 'comic' || workspace === 'effects');
  const dockCol = showDock && effectiveDock(dockCfg, { w: winW, h: winH }).placement === 'bottom';
  return (
    <div
      className="flex h-screen w-screen flex-col overflow-hidden bg-[#141416] text-neutral-200 antialiased"
      onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragOver(true); } }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragOver(false); }}
      onDrop={onDrop}
    >
      {showChrome && (
        <div style={{ zoom }}>
          <MenuBar />
          {EDITION.windows ? (
            <div className="flex items-center gap-2 border-b border-black/60 bg-[#111113] pr-2">
              <div className="min-w-0 flex-1"><DocTabs /></div>
              <WorkspaceBar />
            </div>
          ) : <DocTabs />}
        </div>
      )}
      <div className="relative flex min-h-0 flex-1">
        {showChrome && layout.railVisible && docs.length > 0 && !(EDITION.windows && (workspace === '3d' || workspace === 'library' || workspace === 'board')) && <div className="flex" style={{ zoom }}><ToolRail tablet={tablet} /></div>}
        <div className={dockCol ? 'flex min-h-0 min-w-0 flex-1 flex-col' : 'flex min-h-0 min-w-0 flex-1 flex-row'}>
        {showDock && <ColorDock side="start" />}
        <main className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
          {homeVisible ? (EDITION.windows ? <Home /> : <Welcome />) : EDITION.windows && workspace === 'library' ? <BrushMarket /> : EDITION.windows && workspace === '3d' && docs.length > 0 ? <Studio3D /> : EDITION.windows && workspace === 'board' && docs.length > 0 ? <OrbitBoard /> : docs.length > 0 ? (
            <>
              <CanvasView />
              {EDITION.windows && <WinOverlay />}
              <FloatingPalette />
              {tablet && showChrome && !layout.dockOpen && (
                <button onClick={() => updateLayout({ dockOpen: true })} className="absolute right-3 top-3 z-20 rounded-full border border-white/10 bg-neutral-900/90 p-2.5 text-neutral-200 shadow-xl" title="Open studio panels">
                  <PanelRight size={20} />
                </button>
              )}
            </>
          ) : null}
          {canvasOnly && (
            <button onClick={() => setApp({ canvasOnly: false })} className="absolute right-3 top-3 z-30 flex items-center gap-1 rounded-full border border-white/10 bg-neutral-900/80 px-3 py-1.5 text-[11px] text-neutral-300 backdrop-blur hover:text-white" title="Exit canvas-only mode (Tab / Esc)">
              <Minimize2 size={12} /> Exit focus
            </button>
          )}
        </main>
        {showDock && <ColorDock side="end" />}
        </div>
        {showChrome && EDITION.windows && docs.length > 0 && (workspace === 'comic' || workspace === 'effects') && (
          <aside className="w-[300px] shrink-0 overflow-y-auto border-l border-black/50 bg-[#1b1b1e] p-3" style={{ zoom }} aria-label={workspace === 'comic' ? 'Comic Studio' : 'Effects'}>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[#E8913A]">{workspace === 'comic' ? 'Comic Studio' : 'Effects'}</div>
            {workspace === 'comic' ? <ComicPanel /> : <EffectsPanel />}
          </aside>
        )}
        {showChrome && docs.length > 0 && !(EDITION.windows && (workspace === '3d' || workspace === 'library' || workspace === 'board')) && <div className="flex" style={{ zoom }}><Dock tablet={tablet} /></div>}
      </div>
      {showChrome && <div style={{ zoom }}><StatusBar tablet={tablet} /></div>}
      {showChrome && <FloatingPanels />}
      <Dialogs />
      <ConfirmHost />
      <Toasts />
      {dragOver && (
        <div className="pointer-events-none fixed inset-0 z-[140] flex items-center justify-center border-4 border-dashed border-[#E8913A]/70 bg-black/50 text-sm text-neutral-100">
          Drop a .carbon project to open it, or an image to import it as a layer
        </div>
      )}
    </div>
  );
}
