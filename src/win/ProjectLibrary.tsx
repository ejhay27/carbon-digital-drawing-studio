import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Copy, Download, FilePlus2, FolderOpen, HardDrive, Image, Loader2, Pencil, RefreshCw, Search, Trash2 } from 'lucide-react';
import { Btn, Modal } from '../components/ui';
import {
  duplicateLibraryProject, listProjectLibrary, navigateHomeSafely, openProjectFromLibrary,
  removeProjectFromLibrary, renameProjectInLibrary, saveProjectToLibrary,
} from '../state/actions';
import { confirmDialog, setApp, toast } from '../state/store';
import { fmtBytes } from '../engine/util';
import type { LibraryKind, LibraryProject } from '../platform/windowsLibrary';

const KIND_LABEL: Record<LibraryKind, string> = { draw: 'Draw', infinite: 'Infinite Painter', '3d': '3D Studio', comic: 'Comic Studio' };
function Preview({ bytes, name }: { bytes: Uint8Array; name: string }) {
  const src = useMemo(() => URL.createObjectURL(new Blob([bytes.slice().buffer], { type: 'image/png' })), [bytes]);
  useEffect(() => () => URL.revokeObjectURL(src), [src]);
  return <img src={src} alt={`${name} preview`} className="h-full w-full object-contain" loading="lazy" />;
}

function ProjectCard({ entry, busy, onOpen, onSave, onRename, onDuplicate, onDelete, onExport }: {
  entry: LibraryProject; busy: boolean; onOpen: () => void; onSave: () => void; onRename: () => void;
  onDuplicate: () => void; onDelete: () => void; onExport: () => void;
}) {
  return (
    <article className="group overflow-hidden rounded-xl border border-white/10 bg-[#1d1d20] transition hover:border-[#E8913A]/60">
      <button onClick={onOpen} disabled={busy} className="block w-full text-left disabled:opacity-60" aria-label={`Open ${entry.name}`}>
        <div className="relative flex aspect-[16/10] items-center justify-center overflow-hidden bg-[#111113]">
          {entry.thumbnail.length ? <Preview bytes={entry.thumbnail} name={entry.name} /> : <Image size={36} className="text-neutral-700" />}
          <span className="absolute left-2 top-2 rounded bg-black/70 px-2 py-1 text-[10px] font-semibold text-neutral-200 backdrop-blur">{KIND_LABEL[entry.kind]}</span>
        </div>
        <div className="px-3 pb-1 pt-3">
          <div className="truncate text-sm font-semibold text-neutral-100" title={entry.name}>{entry.name}</div>
          <div className="mt-1 flex flex-wrap gap-x-2 text-[10px] text-neutral-500">
            <span>{entry.width} × {entry.height}</span>
            {entry.pages > 1 && <span>{entry.pages} pages</span>}
            <span>{fmtBytes(entry.size)}</span>
          </div>
          <div className="mt-1 text-[10px] text-neutral-600">Saved {new Date(entry.savedAt).toLocaleString()}</div>
        </div>
      </button>
      <div className="flex flex-wrap gap-1 border-t border-white/5 p-2">
        <button onClick={onOpen} disabled={busy} className="flex items-center gap-1 rounded bg-white/10 px-2 py-1.5 text-[10px] text-neutral-200 hover:bg-white/15 disabled:opacity-50"><FolderOpen size={12} /> Open / Continue</button>
        <button onClick={onExport} disabled={busy} className="flex items-center gap-1 rounded px-2 py-1.5 text-[10px] text-neutral-400 hover:bg-white/10 hover:text-white disabled:opacity-50" title="Export a PNG, JPEG, SVG, or supported MP4"><Download size={12} /> Export</button>
        <button onClick={onSave} disabled={busy} className="flex items-center gap-1 rounded px-2 py-1.5 text-[10px] text-neutral-400 hover:bg-white/10 hover:text-white disabled:opacity-50" title="Save the current open revision to the Library"><RefreshCw size={11} /> Save</button>
        <button onClick={onRename} disabled={busy} className="rounded p-1.5 text-neutral-500 hover:bg-white/10 hover:text-white disabled:opacity-50" title="Rename"><Pencil size={12} /></button>
        <button onClick={onDuplicate} disabled={busy} className="rounded p-1.5 text-neutral-500 hover:bg-white/10 hover:text-white disabled:opacity-50" title="Create independent duplicate"><Copy size={12} /></button>
        <button onClick={onDelete} disabled={busy} className="ml-auto rounded p-1.5 text-neutral-500 hover:bg-red-500/15 hover:text-red-300 disabled:opacity-50" title="Delete from Library"><Trash2 size={12} /></button>
      </div>
    </article>
  );
}

export default function ProjectLibrary() {
  const [items, setItems] = useState<LibraryProject[]>([]);
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [renameTarget, setRenameTarget] = useState<LibraryProject | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try { setItems(await listProjectLibrary()); }
    catch (e) { setLoadError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    return q ? items.filter((entry) => `${entry.name} ${KIND_LABEL[entry.kind]}`.toLocaleLowerCase().includes(q)) : items;
  }, [items, query]);

  const withBusy = async (id: string, fn: () => Promise<void>) => {
    setBusyId(id);
    try { await fn(); } catch (e) { toast(e instanceof Error ? e.message : String(e), 'error'); }
    finally { setBusyId(null); await refresh(); }
  };
  const open = (entry: LibraryProject) => withBusy(entry.id, async () => { await openProjectFromLibrary(entry.id); });
  const save = (entry: LibraryProject) => withBusy(entry.id, async () => {
    const doc = await openProjectFromLibrary(entry.id);
    if (doc) await saveProjectToLibrary(doc);
  });
  const exportProject = (entry: LibraryProject) => withBusy(entry.id, async () => {
    const doc = await openProjectFromLibrary(entry.id);
    if (doc) setApp({ dialog: 'export' });
  });
  const duplicate = (entry: LibraryProject) => withBusy(entry.id, async () => { await duplicateLibraryProject(entry.id); });
  const remove = async (entry: LibraryProject) => {
    const answer = await confirmDialog('Delete project from Library?', `“${entry.name}” will be removed from the local Project Library. Any open copy will stay open, but will not be added back unless you save it again. This cannot be undone.`, [
      { label: 'Cancel', value: 'cancel' },
      { label: 'Delete project', value: 'delete', variant: 'danger' },
    ]);
    if (answer !== 'delete') return;
    await withBusy(entry.id, async () => { await removeProjectFromLibrary(entry.id); });
  };
  const beginRename = (entry: LibraryProject) => { setRenameTarget(entry); setRenameValue(entry.name); };
  const finishRename = async () => {
    if (!renameTarget) return;
    const target = renameTarget;
    setRenameTarget(null);
    await withBusy(target.id, async () => { await renameProjectInLibrary(target.id, renameValue); });
  };

  return (
    <div className="absolute inset-0 overflow-y-auto bg-[#141416]">
      <div className="mx-auto max-w-7xl px-5 py-6 md:px-8">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button onClick={() => void navigateHomeSafely()} className="rounded-lg border border-white/10 p-2 text-neutral-400 hover:bg-white/5 hover:text-white" aria-label="Return Home safely" title="Save changes before returning Home"><ArrowLeft size={16} /></button>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#E8913A]/15 text-[#E8913A]"><HardDrive size={20} /></div>
            <div><h1 className="text-xl font-semibold text-white">Project Library</h1><p className="text-xs text-neutral-500">Local editable documents · separate from PNG, JPEG, SVG and video exports</p></div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => void refresh()} className="rounded-md border border-white/10 p-2 text-neutral-400 hover:text-white" title="Refresh Library"><RefreshCw size={14} /></button>
            <button onClick={() => setApp({ dialog: 'create', homeScreen: false })} className="flex items-center gap-2 rounded-md bg-[#E8913A] px-3 py-2 text-xs font-semibold text-black hover:bg-[#f1a153]"><FilePlus2 size={14} /> New project</button>
          </div>
        </header>

        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-neutral-500">{items.length} saved project{items.length === 1 ? '' : 's'} · stored locally in this Windows profile</div>
          <label className="flex w-full max-w-xs items-center gap-2 rounded-md border border-white/10 bg-[#1b1b1e] px-3 py-2 text-neutral-500 focus-within:border-[#E8913A]/60">
            <Search size={14} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search projects" className="min-w-0 flex-1 bg-transparent text-xs text-white outline-none" />
          </label>
        </div>

        {loading && <div className="flex items-center justify-center gap-2 py-16 text-sm text-neutral-500"><Loader2 size={16} className="animate-spin" /> Reading local projects…</div>}
        {!loading && loadError && <div className="rounded-xl border border-red-400/20 bg-red-400/5 p-4 text-sm text-red-200">Could not read the Project Library: {loadError}<button onClick={() => void refresh()} className="ml-3 underline">Try again</button></div>}
        {!loading && !loadError && filtered.length === 0 && (
          <div className="rounded-2xl border border-dashed border-white/15 px-6 py-16 text-center">
            <HardDrive size={30} className="mx-auto mb-3 text-neutral-600" />
            <div className="text-sm font-medium text-neutral-200">{query ? 'No projects match that search.' : 'Your Project Library is empty.'}</div>
            <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-neutral-500">New documents are saved here automatically as editable .carbon projects. Use Save from the editor to update a Library copy at any time.</p>
            <button onClick={() => setApp({ dialog: 'create', homeScreen: false })} className="mt-4 rounded-md bg-[#E8913A] px-4 py-2 text-xs font-semibold text-black hover:bg-[#f1a153]">Create a project</button>
          </div>
        )}
        {!loading && filtered.length > 0 && <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((entry) => <ProjectCard key={entry.id} entry={entry} busy={busyId === entry.id}
            onOpen={() => void open(entry)} onSave={() => void save(entry)} onRename={() => beginRename(entry)}
            onDuplicate={() => void duplicate(entry)} onDelete={() => void remove(entry)} onExport={() => void exportProject(entry)} />)}
        </div>}
      </div>
      {busyId && <div className="fixed bottom-5 right-5 z-30 flex items-center gap-2 rounded-lg border border-white/10 bg-neutral-900/95 px-3 py-2 text-xs text-neutral-200 shadow-xl"><Loader2 size={14} className="animate-spin" /> Updating project…</div>}
      {renameTarget && <Modal title="Rename project" onClose={() => setRenameTarget(null)} width={420} footer={<><Btn onClick={() => setRenameTarget(null)}>Cancel</Btn><Btn variant="primary" onClick={() => void finishRename()}>Rename</Btn></>}>
        <label className="block text-xs text-neutral-400">Project name<input autoFocus maxLength={120} value={renameValue} onChange={(e) => setRenameValue(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void finishRename(); }} className="mt-2 w-full rounded-md border border-white/10 bg-neutral-900 px-3 py-2 text-sm text-white outline-none focus:border-[#E8913A]" /></label>
        <p className="mt-2 text-[11px] text-neutral-600">The Library name and editable project metadata will be updated. External exports are not affected.</p>
      </Modal>}
    </div>
  );
}
