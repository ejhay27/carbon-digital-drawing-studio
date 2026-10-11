import { useMemo, useState } from 'react';
import { Clock, Search, Smartphone, Star, Trash2, X } from 'lucide-react';
import { fmtBytes } from '../engine/util';
import { idbDel } from '../engine/persist';
import { readProject, deleteProject, type DeviceProject } from '../platform/native';
import { openBytes, openRecent } from '../state/actions';
import { confirmDialog, toast, updateSettings, useApp } from '../state/store';
import { devicePinId, findProjects, recentPinId, togglePinnedId, type ProjectSort } from '../state/projectFinder';

export interface RecentProjectItem {
  key: string;
  name: string;
  savedAt: number;
  size: number;
  w: number;
  h: number;
  thumb: string | null;
}

interface Props {
  recent: RecentProjectItem[];
  device: DeviceProject[];
  native: boolean;
  storage: string;
  reload: () => void;
}

export default function ProjectFinder({ recent, device, native, storage, reload }: Props) {
  const pinnedProjects = useApp((s) => s.settings.pinnedProjects);
  const sort = useApp((s) => s.settings.homeProjectSort);
  const [query, setQuery] = useState('');

  const recentRows = useMemo(() => findProjects(
    recent.map((p) => ({ ...p, id: recentPinId(p.key), searchText: `${p.w} ${p.h} ${p.w}x${p.h}` })),
    query, pinnedProjects, sort,
  ), [recent, query, pinnedProjects, sort]);
  const deviceRows = useMemo(() => findProjects(
    device.map((p) => ({ ...p, id: devicePinId(p.path), savedAt: p.mtime, searchText: p.path })),
    query, pinnedProjects, sort,
  ), [device, query, pinnedProjects, sort]);

  const togglePin = (id: string) => updateSettings({ pinnedProjects: togglePinnedId(pinnedProjects, id) });
  const removeRecent = async (key: string) => {
    await idbDel('recent', key);
    updateSettings({ pinnedProjects: pinnedProjects.filter((id) => id !== recentPinId(key)) });
    reload();
  };
  const openDevice = async (project: DeviceProject) => {
    try { await openBytes(await readProject(project.path), project.name, { native: true, name: project.name }); }
    catch (e) { toast('Could not read file: ' + (e instanceof Error ? e.message : e), 'error'); }
  };
  const removeDevice = async (project: DeviceProject) => {
    const answer = await confirmDialog(
      'Delete project file?',
      `“${project.name}” will be permanently deleted from this device.`,
      [{ label: 'Cancel', value: 'no' }, { label: 'Delete', value: 'yes', variant: 'danger' }],
    );
    if (answer !== 'yes') return;
    try {
      await deleteProject(project.path);
      updateSettings({ pinnedProjects: pinnedProjects.filter((id) => id !== devicePinId(project.path)) });
      reload();
    } catch (e) { toast(String(e), 'error'); }
  };

  const noMatches = !!query.trim();
  return (
    <section aria-label="Project finder" className="space-y-5">
      <header className="flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1">
          <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Find a project</h3>
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search recent projects and device files…"
              aria-label="Search projects"
              className="w-full rounded-lg border border-white/10 bg-white/[0.03] py-2 pl-9 pr-9 text-xs text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-[#E8913A]/60"
            />
            {query && <button aria-label="Clear project search" onClick={() => setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-neutral-500 hover:text-white"><X size={13} /></button>}
          </div>
        </div>
        <label className="flex items-center gap-2 text-[11px] text-neutral-500">
          Sort
          <select
            aria-label="Sort projects"
            value={sort}
            onChange={(e) => updateSettings({ homeProjectSort: e.target.value as ProjectSort })}
            className="rounded-md border border-white/10 bg-neutral-900 px-2 py-2 text-xs text-neutral-200 outline-none focus:border-[#E8913A]/60"
          >
            <option value="recent">Recently used</option>
            <option value="name">Name A–Z</option>
            <option value="size">Largest first</option>
          </select>
        </label>
      </header>

      <section aria-label="Browser-local recent projects">
        <h4 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
          <Clock size={12} /> Browser-local recents <span className="font-normal normal-case tracking-normal text-neutral-600">· stored in this app</span>
        </h4>
        {recentRows.length ? (
          <div className="grid gap-1.5 sm:grid-cols-2">
            {recentRows.map((p) => {
              const pinned = pinnedProjects.includes(p.id);
              const original = recent.find((r) => recentPinId(r.key) === p.id)!;
              return (
                <div key={p.id} className="group flex min-w-0 items-center gap-2 rounded-lg border border-white/5 p-2 hover:border-white/20 hover:bg-white/5">
                  <button onClick={() => void openRecent(original.key)} aria-label={`Open recent project ${original.name}`} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                    <div className="h-10 w-14 shrink-0 overflow-hidden rounded bg-neutral-800">{original.thumb && <img src={original.thumb} alt="" className="h-full w-full object-contain" />}</div>
                    <div className="min-w-0">
                      <div className="truncate text-xs text-neutral-200">{original.name}</div>
                      <div className="text-[10px] text-neutral-500">{original.w}×{original.h} · {fmtBytes(original.size)} · {new Date(original.savedAt).toLocaleDateString()}</div>
                    </div>
                  </button>
                  <button
                    type="button" title={pinned ? 'Unpin project' : 'Pin project'} aria-label={`${pinned ? 'Unpin' : 'Pin'} recent project ${original.name}`} aria-pressed={pinned}
                    onClick={() => togglePin(p.id)} className={'rounded p-1.5 transition ' + (pinned ? 'text-amber-300' : 'text-neutral-600 hover:text-amber-300')}
                  ><Star size={14} fill={pinned ? 'currentColor' : 'none'} /></button>
                  <button type="button" title="Remove from browser-local recents" aria-label={`Remove ${original.name} from recents`} onClick={() => void removeRecent(original.key)} className="rounded p-1.5 text-neutral-600 hover:text-red-400"><Trash2 size={13} /></button>
                </div>
              );
            })}
          </div>
        ) : <p className="text-xs text-neutral-500">{noMatches ? 'No browser-local recent projects match this search.' : 'Projects you save or open will appear here. This list is separate from files stored in Android device folders.'}</p>}
      </section>

      {native && (
        <section aria-label="Android device project files">
          <h4 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
            <Smartphone size={12} /> Android device files <span className="font-normal normal-case tracking-normal text-neutral-600">· {storage}</span>
          </h4>
          {deviceRows.length ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {deviceRows.map((project) => {
                const pinned = pinnedProjects.includes(project.id);
                const original = device.find((p) => devicePinId(p.path) === project.id)!;
                return (
                  <div key={project.id} className="flex min-w-0 items-center gap-2 rounded-lg border border-white/10 p-3">
                    <button className="min-w-0 flex-1 text-left" onClick={() => void openDevice(original)} aria-label={`Open Android device file ${original.name}`}>
                      <div className="truncate text-sm text-neutral-200">{original.name.replace(/\.carbon$/i, '')}</div>
                      <div className="text-[11px] text-neutral-500">{fmtBytes(original.size)}{original.mtime ? ' · ' + new Date(original.mtime).toLocaleString() : ''}</div>
                    </button>
                    <button
                      type="button" title={pinned ? 'Unpin device file' : 'Pin device file'} aria-label={`${pinned ? 'Unpin' : 'Pin'} Android file ${original.name}`} aria-pressed={pinned}
                      onClick={() => togglePin(project.id)} className={'rounded p-1.5 transition ' + (pinned ? 'text-amber-300' : 'text-neutral-600 hover:text-amber-300')}
                    ><Star size={14} fill={pinned ? 'currentColor' : 'none'} /></button>
                    <button type="button" title="Delete device file" aria-label={`Delete Android device file ${original.name}`} className="rounded p-2 text-neutral-500 hover:bg-white/5 hover:text-red-400" onClick={() => void removeDevice(original)}><Trash2 size={14} /></button>
                  </div>
                );
              })}
            </div>
          ) : <p className="text-xs text-neutral-500">{noMatches ? 'No Android device files match this search.' : 'Projects saved in the Android CARBON folder appear here. Other device locations can be opened with “Open Project”.'}</p>}
        </section>
      )}
    </section>
  );
}
