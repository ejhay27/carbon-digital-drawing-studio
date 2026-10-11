import { useEffect, useRef, useState } from 'react';
import {
  Box, Brush, Clock, FilePlus2, FolderOpen, History, ImageDown, LifeBuoy, MessageSquare, Settings, Sparkles, Trash2,
} from 'lucide-react';
import { PrimeLockup } from './Brand';
import Ocean from './Ocean';
import { CANVAS_PRESETS } from './Dialogs';
import { LatestPatches } from '../win/Patches';
import { switchWorkspace } from '../win/WinPanels';
import { setWin, type Workspace } from '../win/WinOverlay';
import {
  discardSession, listRecent, listSession, newDocument, openBytes, openFileDialog, openImageAsDoc, openRecent, restoreSession,
} from '../state/actions';
import { pickFile } from '../state/actions';
import { activeDoc, confirmDialog, setApp, toast, updateLayout, useApp } from '../state/store';
import { idbDel } from '../engine/persist';
import { readThumbnail } from '../engine/fileFormat';
import { fmtBytes } from '../engine/util';
import { deleteProject, isNative, listProjects, readProject, storageLabel, type DeviceProject } from '../platform/native';
import { APP_VERSION } from '../version';

interface RecentItem { key: string; name: string; savedAt: number; size: number; w: number; h: number; thumb: string | null }

/**
 * Carbon: Prime home screen (Windows/desktop edition).
 *
 * A cinematic animated ocean welcome over a fully working launch pad: every tile navigates to
 * its real implementation — nothing here is decorative. The ocean pauses when hidden, respects
 * reduced motion, and falls back to a static gradient; the actions are usable the moment the
 * screen renders.
 */
export default function Home() {
  const [recent, setRecent] = useState<RecentItem[]>([]);
  const [session, setSession] = useState<{ key: string; name: string; savedAt: number }[]>([]);
  const [device, setDevice] = useState<DeviceProject[]>([]);
  const restoring = useApp((s) => s.settings.restoreSession);
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
  const scrollToRecent = () => recentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

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
    { id: 'settings', label: 'Settings', sub: 'Themes, shortcuts, autosave & input', icon: Settings, run: () => setApp({ dialog: 'settings' }) },
    { id: 'about', label: 'Help & About', sub: 'Guides, diagnostics & version info', icon: LifeBuoy, run: () => setApp({ dialog: 'about' }) },
  ];

  return (
    <div className="absolute inset-0 overflow-y-auto bg-[#141416]">
      {/* ---------------------------------------------------------- ocean hero */}
      <section className="relative flex min-h-[380px] flex-col items-center justify-center gap-7 overflow-hidden px-6 py-16" style={{ minHeight: 'max(380px, 44vh)' }}>
        <Ocean className="absolute inset-0" />
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

        <section ref={recentRef} aria-label="Recent projects" className="scroll-mt-4">
          <h3 className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-500"><Clock size={12} /> Recent Projects</h3>
          {recent.length ? (
            <div className="grid gap-1.5 sm:grid-cols-2">
              {recent.slice(0, 8).map((r) => (
                <div key={r.key} className="group flex items-center gap-3 rounded-lg border border-white/5 p-2 hover:border-white/20 hover:bg-white/5">
                  <button onClick={() => openRecent(r.key)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                    <div className="h-10 w-14 shrink-0 overflow-hidden rounded bg-neutral-800">{r.thumb && <img src={r.thumb} alt="" className="h-full w-full object-contain" />}</div>
                    <div className="min-w-0">
                      <div className="truncate text-xs text-neutral-200">{r.name}</div>
                      <div className="text-[10px] text-neutral-500">{r.w}×{r.h} · {fmtBytes(r.size)} · {new Date(r.savedAt).toLocaleDateString()}</div>
                    </div>
                  </button>
                  <button title="Remove from recent" onClick={async () => { await idbDel('recent', r.key); load(); }} className="text-neutral-600 opacity-0 hover:text-red-400 group-hover:opacity-100"><Trash2 size={12} /></button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-neutral-500">Documents you save or open will appear here. They are kept locally on this device.</p>
          )}
        </section>

        {native && (
          <section aria-label="Projects on this device">
            <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">On this device · {storageLabel()}</h3>
            {device.length ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {device.map((p) => (
                  <div key={p.path} className="flex items-center gap-3 rounded-lg border border-white/10 p-3">
                    <button
                      className="min-w-0 flex-1 text-left"
                      onClick={async () => {
                        try { await openBytes(await readProject(p.path), p.name, { native: true, name: p.name }); }
                        catch (e) { toast('Could not read file: ' + (e instanceof Error ? e.message : e), 'error'); }
                      }}
                    >
                      <div className="truncate text-sm text-neutral-200">{p.name.replace(/\.carbon$/i, '')}</div>
                      <div className="text-[11px] text-neutral-500">{fmtBytes(p.size)}{p.mtime ? ' · ' + new Date(p.mtime).toLocaleString() : ''}</div>
                    </button>
                    <button
                      title="Delete file"
                      className="rounded p-2 text-neutral-500 hover:bg-white/5 hover:text-red-400"
                      onClick={async () => {
                        const a = await confirmDialog('Delete project file?', `“${p.name}” will be permanently deleted from this device.`, [{ label: 'Cancel', value: 'no' }, { label: 'Delete', value: 'yes', variant: 'danger' }]);
                        if (a === 'yes') { await deleteProject(p.path).catch((e) => toast(String(e), 'error')); load(); }
                      }}
                    ><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-neutral-500">Projects you save are stored in the CARBON folder. Use “Open Project” to pick files from anywhere else.</p>
            )}
          </section>
        )}

        <p className="text-[11px] text-neutral-600">
          Carbon: Prime · Where all starts begin. · Works offline, no account, no cloud — artwork, brushes and settings live in local storage on this device. Help → Run Diagnostics runs the built-in acceptance tests.
        </p>
      </div>
    </div>
  );
}
