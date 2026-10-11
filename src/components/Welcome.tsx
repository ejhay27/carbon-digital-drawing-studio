import { useEffect, useState } from 'react';
import { FilePlus2, FolderOpen, History, LifeBuoy, Trash2 } from 'lucide-react';
import { CarbonLockup } from './Brand';
import { CANVAS_PRESETS } from './Dialogs';
import { discardSession, listRecent, listSession, newDocument, openBytes, openFileDialog, openRecent, restoreSession } from '../state/actions';
import { idbDel } from '../engine/persist';
import { readThumbnail } from '../engine/fileFormat';
import { fmtBytes } from '../engine/util';
import { confirmDialog, setApp, toast, useApp } from '../state/store';
import { deleteProject, isNative, listProjects, readProject, storageLabel, type DeviceProject } from '../platform/native';
import { Smartphone } from 'lucide-react';
import { EDITION } from '../platform/edition';
import { LatestPatches } from '../win/Patches'; // Windows home screen only

interface RecentItem { key: string; name: string; savedAt: number; size: number; w: number; h: number; thumb: string | null }

export default function Welcome() {
  const [recent, setRecent] = useState<RecentItem[]>([]);
  const [session, setSession] = useState<{ key: string; name: string; savedAt: number }[]>([]);
  const restoring = useApp((s) => s.settings.restoreSession);
  const [device, setDevice] = useState<DeviceProject[]>([]);
  const native = isNative();
  const load = () => {
    if (native) listProjects().then(setDevice);
    listRecent().then((r) => setRecent(r.map((x) => ({ key: x.key, name: x.value.name, savedAt: x.value.savedAt, size: x.value.size, w: x.value.w, h: x.value.h, thumb: readThumbnail(x.value.bytes) }))));
    listSession().then((s) => setSession(s.map((x) => ({ key: x.key, name: x.value.name, savedAt: x.value.savedAt }))));
  };
  useEffect(load, []);
  return (
    <div className="absolute inset-0 overflow-y-auto bg-[radial-gradient(ellipse_at_top,#1f1f23,#121214_70%)]">
      <div className="mx-auto flex min-h-full max-w-4xl flex-col justify-center gap-10 px-8 py-12">
        <CarbonLockup />
        {session.length > 0 && !restoring && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-amber-200"><LifeBuoy size={16} /> Recover unsaved work</div>
            <p className="mt-1 text-xs text-amber-100/70">{session.length} document{session.length > 1 ? 's were' : ' was'} open last time: {session.map((s) => s.name).join(', ')}.</p>
            <div className="mt-3 flex gap-2">
              <button onClick={() => restoreSession()} className="rounded-md bg-amber-500 px-3 py-1.5 text-xs font-medium text-black hover:bg-amber-400">Recover</button>
              <button onClick={async () => { await discardSession(); load(); }} className="rounded-md bg-white/10 px-3 py-1.5 text-xs text-neutral-200 hover:bg-white/15">Discard</button>
            </div>
          </div>
        )}
        {EDITION.windows && <LatestPatches />}
        <div className="grid gap-8 md:grid-cols-[1fr_1fr]">
          <div>
            <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Start</h3>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setApp({ dialog: 'new' })} className="col-span-2 flex items-center gap-3 rounded-xl border border-[#E8913A]/40 bg-[#E8913A]/10 p-4 text-left hover:bg-[#E8913A]/20">
                <FilePlus2 className="text-[#E8913A]" size={22} />
                <div><div className="text-sm font-medium text-neutral-100">New canvas…</div><div className="text-[11px] text-neutral-400">Custom size, background and name</div></div>
              </button>
              {CANVAS_PRESETS.slice(0, 4).map((p) => (
                <button key={p.name} onClick={() => newDocument(p.w, p.h, 'Untitled')} className="rounded-lg border border-white/10 p-3 text-left hover:border-white/30 hover:bg-white/5">
                  <div className="text-xs text-neutral-200">{p.name}</div>
                  <div className="font-mono text-[10px] text-neutral-500">{p.w} × {p.h}</div>
                </button>
              ))}
              <button onClick={() => openFileDialog()} className="col-span-2 flex items-center gap-3 rounded-lg border border-white/10 p-3 text-left hover:border-white/30 hover:bg-white/5">
                <FolderOpen size={18} className="text-neutral-400" />
                <div><div className="text-xs text-neutral-200">Open .carbon project or image…</div><div className="text-[10px] text-neutral-500">Or drop a file anywhere in this window</div></div>
              </button>
            </div>
          </div>
          <div>
            <h3 className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-500"><History size={12} /> Recent</h3>
            {recent.length ? (
              <div className="space-y-1.5">
                {recent.slice(0, 7).map((r) => (
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
            ) : <p className="text-xs text-neutral-500">Documents you save or open will appear here. They are kept locally on this device.</p>}
          </div>
        </div>
        {native && (
          <div>
            <h3 className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-500"><Smartphone size={12} /> On this device · {storageLabel()}</h3>
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
                        const r = await confirmDialog('Delete project file?', `“${p.name}” will be permanently deleted from this device.`, [{ label: 'Cancel', value: 'no' }, { label: 'Delete', value: 'yes', variant: 'danger' }]);
                        if (r === 'yes') { await deleteProject(p.path).catch((e) => toast(String(e), 'error')); load(); }
                      }}
                    ><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
            ) : <p className="text-xs text-neutral-500">Projects you save are stored in the CARBON folder. Use “Open” to pick files from anywhere else, such as Downloads or Drive.</p>}
          </div>
        )}
        <p className="text-[11px] text-neutral-600">Works offline · no account · your artwork never leaves this device · Help → Run Diagnostics runs the built-in acceptance tests</p>
      </div>
    </div>
  );
}
