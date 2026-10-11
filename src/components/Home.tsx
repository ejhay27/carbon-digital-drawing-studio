import { useEffect, useRef, useState } from 'react';
import {
  BookOpen, Box, Brush, Clock, Command, FilePlus2, FolderOpen, History, ImageDown, LifeBuoy, MessageSquare, Settings, Sparkles,
} from 'lucide-react';
import { PrimeLockup } from './Brand';
import Ocean from './Ocean';
import { CANVAS_PRESETS } from './Dialogs';
import { LatestPatches } from '../win/Patches';
import { switchWorkspace } from '../win/WinPanels';
import { setWin, type Workspace } from '../win/WinOverlay';
import {
  discardSession, listRecent, listSession, newDocument, openFileDialog, openImageAsDoc, restoreSession,
} from '../state/actions';
import { pickFile } from '../state/actions';
import { activeDoc, setApp, toast, updateLayout, useApp } from '../state/store';
import { readThumbnail } from '../engine/fileFormat';
import ProjectFinder, { type RecentProjectItem } from './ProjectFinder';
import QuickStartNudge from './QuickStartNudge';
import { isNative, listProjects, storageLabel, type DeviceProject } from '../platform/native';
import { APP_VERSION } from '../version';

/**
 * Carbon: Prime home screen (Windows/desktop edition).
 *
 * A cinematic animated ocean welcome over a fully working launch pad: every tile navigates to
 * its real implementation — nothing here is decorative. The ocean pauses when hidden, respects
 * reduced motion, and falls back to a static gradient; the actions are usable the moment the
 * screen renders.
 */
export default function Home() {
  const [recent, setRecent] = useState<RecentProjectItem[]>([]);
  const [session, setSession] = useState<{ key: string; name: string; savedAt: number }[]>([]);
  const [device, setDevice] = useState<DeviceProject[]>([]);
  const restoring = useApp((s) => s.settings.restoreSession);
  const homeSceneEnabled = useApp((s) => s.settings.homeSceneEnabled);
  const homeSceneMotion = useApp((s) => s.settings.homeSceneMotion);
  const recentRef = useRef<HTMLDivElement>(null);
  const native = isNative();

  const load = () => {
    if (native) listProjects().then(setDevice);
    listRecent().then((r) => setRecent(r.map((x) => ({ key: x.key, name: x.value.name, savedAt: x.value.savedAt, size: x.value.size, w: x.value.w, h: x.value.h, thumb: readThumbnail(x.value.bytes) }))));
    listSession().then((s) => setSession(s.map((x) => ({ key: x.key, name: x.value.name, savedAt: x.value.savedAt }))));
  };
  useEffect(load, []);

  /** Create (or reuse) a working canvas so studio destinations always land somewhere real. */
  const ensureDoc = () => activeDoc() || newDocument(CANVAS_PRESETS[5].w, CANVAS_PRESETS[5].h, 'Untitled');
  const openStudio = (ws: Workspace) => {
    const d = ensureDoc();
    if (!d) return;
    switchWorkspace(ws);
  };
  /** Bring a dock panel to the front of the studio (used by Brush Studio). */
  const focusPanel = (id: 'brushStudio') => {
    const l = useApp.getState().layout;
    updateLayout({
      dockOpen: true,
      hidden: l.hidden.filter((x) => x !== id),
      collapsed: l.collapsed.filter((x) => x !== id),
    });
  };
  const openBrushStudio = () => {
    const d = ensureDoc();
    if (!d) return;
    setWin({ workspace: 'draw' });
    focusPanel('brushStudio');
  };
  const importArtwork = async () => {
    const f = await pickFile('image/png,image/jpeg,image/webp');
    if (!f) return;
    try { await openImageAsDoc(f); } catch (e) { toast('Could not import that image: ' + (e instanceof Error ? e.message : e), 'error'); }
  };
  const scrollToRecent = () => {
    const reduceMotion = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    recentRef.current?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  };

  const tiles: { id: string; label: string; sub: string; icon: typeof Brush; run: () => void; primary?: boolean }[] = [
    { id: 'new', label: 'New Drawing', sub: 'Custom size, presets & background', icon: FilePlus2, run: () => setApp({ dialog: 'new' }), primary: true },
    { id: 'open', label: 'Open Project', sub: '.carbon projects & images', icon: FolderOpen, run: () => void openFileDialog() },
    { id: 'recent', label: 'Recent Projects', sub: `${recent.length} saved on this device`, icon: Clock, run: scrollToRecent },
    { id: 'import', label: 'Import Artwork', sub: 'Open an image as a new document', icon: ImageDown, run: () => void importArtwork() },
    { id: 'brush', label: 'Brush Studio', sub: 'Tune, duplicate & organise brushes', icon: Brush, run: openBrushStudio },
    { id: '3d', label: '3D Studio', sub: 'Spatial strokes on the white ground', icon: Box, run: () => openStudio('3d') },
    { id: 'comic', label: 'Comics Studio', sub: 'Pages, panels, balloons & lettering', icon: MessageSquare, run: () => openStudio('comic') },
    { id: 'library', label: 'Carbon Library', sub: 'Local brush packs & palettes', icon: Sparkles, run: () => setWin({ workspace: 'library' }) },
    { id: 'patches', label: 'Latest Patches', sub: `What changed in ${APP_VERSION}`, icon: History, run: () => setApp({ dialog: 'patches' }) },
    { id: 'palette', label: 'Command Palette', sub: 'Search actions, tools & recent files · Ctrl+K', icon: Command, run: () => setApp({ dialog: 'commandPalette' }) },
    { id: 'quickStart', label: 'Quick Start Guide', sub: 'Offline tour & editable sample project', icon: BookOpen, run: () => setApp({ dialog: 'quickStart' }) },
    { id: 'settings', label: 'Settings', sub: 'Themes, shortcuts, autosave & input', icon: Settings, run: () => setApp({ dialog: 'settings' }) },
    { id: 'about', label: 'Help & About', sub: 'Guides, diagnostics & version info', icon: LifeBuoy, run: () => setApp({ dialog: 'about' }) },
  ];

  return (
    <div className="absolute inset-0 overflow-y-auto bg-[#141416]">
      {/* ---------------------------------------------------------- ocean hero */}
      <section className="relative flex min-h-[380px] flex-col items-center justify-center gap-7 overflow-hidden px-6 py-16" style={{ minHeight: 'clamp(380px, 52vh, 620px)' }}>
        <Ocean className="absolute inset-0" enabled={homeSceneEnabled} motion={homeSceneMotion} />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-[#141416]" />
        <div className="relative z-10 flex flex-col items-center gap-6 text-center">
          <PrimeLockup version={APP_VERSION} light />
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={() => setApp({ dialog: 'new' })}
              className="rounded-lg bg-[#E8913A] px-6 py-2.5 text-sm font-semibold text-neutral-950 shadow-lg transition hover:bg-[#f3a254]"
            >
              New Drawing
            </button>
            <button
              onClick={() => void openFileDialog()}
              className="rounded-lg border border-white/30 bg-black/30 px-6 py-2.5 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-black/45"
            >
              Open Project…
            </button>
          </div>
          <p className="text-[11px] tracking-wide text-white/85" style={{ textShadow: '0 1px 8px rgba(0,20,40,0.65)' }}>
            Local Storage ({APP_VERSION}) · works offline · your artwork never leaves this device
          </p>
        </div>
      </section>

      {/* ---------------------------------------------------------- body */}
      <div className="mx-auto flex max-w-5xl flex-col gap-10 px-6 py-10">
        {session.length > 0 && !restoring && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-amber-200"><LifeBuoy size={16} /> Recover unsaved work</div>
            <p className="mt-1 text-xs text-amber-100/70">{session.length} document{session.length > 1 ? 's were' : ' was'} open last time: {session.map((x) => x.name).join(', ')}.</p>
            <div className="mt-3 flex gap-2">
              <button onClick={() => restoreSession()} className="rounded-md bg-amber-500 px-3 py-1.5 text-xs font-medium text-black hover:bg-amber-400">Recover</button>
              <button onClick={async () => { await discardSession(); load(); }} className="rounded-md bg-white/10 px-3 py-1.5 text-xs text-neutral-200 hover:bg-white/15">Discard</button>
            </div>
          </div>
        )}

        <QuickStartNudge />

        <section aria-label="Studio destinations">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {tiles.map((t) => (
              <button
                key={t.id}
                onClick={t.run}
                className={
                  'group flex items-start gap-3 rounded-xl border p-4 text-left transition ' +
                  (t.primary
                    ? 'border-[#E8913A]/50 bg-[#E8913A]/10 hover:bg-[#E8913A]/20 sm:col-span-2 lg:col-span-1'
                    : 'border-white/10 bg-white/[0.03] hover:border-white/25 hover:bg-white/[0.07]')
                }
              >
                <t.icon size={20} className={t.primary ? 'mt-0.5 text-[#E8913A]' : 'mt-0.5 text-neutral-400 group-hover:text-neutral-200'} />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-neutral-100">{t.label}</span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-neutral-500">{t.sub}</span>
                </span>
              </button>
            ))}
          </div>
        </section>

        <LatestPatches />

        <div ref={recentRef} className="scroll-mt-4">
          <ProjectFinder recent={recent} device={device} native={native} storage={storageLabel()} reload={load} />
        </div>

        <p className="text-[11px] text-neutral-600">
          Carbon: Prime · Where all starts begin. · Works offline, no account, no cloud — artwork, brushes and settings live in local storage on this device. Help → Run Diagnostics runs the built-in acceptance tests.
        </p>
      </div>
    </div>
  );
}
