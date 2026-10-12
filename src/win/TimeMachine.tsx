// Creative Time Machine (Windows edition): persistent named snapshots, comparison, branches and safe restore.
// Snapshots are complete .carbon archives (without Drawing Replay data) kept in a dedicated IndexedDB database,
// separate from undo history, autosave and the user's project files.
import { useEffect, useState } from 'react';
import { GitBranch, History, RotateCcw, Scale, Trash2 } from 'lucide-react';
import { DocEngine, replaceContents } from '../engine/document';
import { compositeDoc } from '../engine/render';
import { deserializeDoc, serializeDoc } from '../engine/fileFormat';
import { createCanvas, ctxOf, fmtBytes, uid } from '../engine/util';
import { activeDoc, confirmDialog, getApp, promptDialog, toast, useApp } from '../state/store';
import { addDoc } from '../state/actions';
import { Btn, Modal } from '../components/ui';
import { cn } from '../utils/cn';
import { sceneOf } from './sceneRender';

export interface SnapMeta { id: string; lineage: string; docUuid: string; branch: string; name: string; desc: string; at: number; auto: boolean; size: number; thumb: string; w: number; h: number; layers: number; objects3d: number }

const DB = 'carbon-timemachine';
let dbp: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => {
      const m = r.result.createObjectStore('meta', { keyPath: 'id' });
      m.createIndex('lineage', 'lineage');
      r.result.createObjectStore('blobs');
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}
function tx<T>(stores: string[], mode: IDBTransactionMode, fn: (t: IDBTransaction) => IDBRequest<T> | void): Promise<T> {
  return db().then((d) => new Promise<T>((res, rej) => {
    const t = d.transaction(stores, mode);
    const req = fn(t);
    t.oncomplete = () => res(req ? (req.result as T) : (undefined as T));
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error || new Error('Storage full or unavailable: snapshot not saved.'));
  }));
}

export const lineageOf = (d: DocEngine) => d.meta.lineage || d.meta.uuid;
export const keepAuto = () => Math.max(1, Number(localStorage.getItem('carbon-tm-keep-auto')) || 10);

export async function listSnapshots(lineage: string): Promise<SnapMeta[]> {
  const all = await tx<SnapMeta[]>(['meta'], 'readonly', (t) => t.objectStore('meta').index('lineage').getAll(lineage));
  return (all || []).sort((a, b) => b.at - a.at);
}
export const loadSnapshotBytes = (id: string) => tx<Uint8Array>(['blobs'], 'readonly', (t) => t.objectStore('blobs').get(id) as IDBRequest<Uint8Array>);
export const deleteSnapshot = (id: string) => tx(['meta', 'blobs'], 'readwrite', (t) => { t.objectStore('meta').delete(id); t.objectStore('blobs').delete(id); });

export async function createSnapshot(doc: DocEngine, name: string, desc = '', auto = false): Promise<SnapMeta> {
  const bytes = await serializeDoc(doc, false);
  const th = compositeDoc(doc, Math.min(1, 240 / Math.max(doc.width, doc.height)));
  const meta: SnapMeta = {
    id: uid('snap-'), lineage: lineageOf(doc), docUuid: doc.meta.uuid, branch: doc.meta.branch || 'main', name: name.slice(0, 100), desc: desc.slice(0, 500),
    at: Date.now(), auto, size: bytes.length, thumb: th.toDataURL('image/jpeg', 0.8), w: doc.width, h: doc.height, layers: doc.layers.length,
    objects3d: doc.scene3d ? sceneOf(doc.scene3d).objects.length : 0,
  };
  await tx(['meta', 'blobs'], 'readwrite', (t) => { t.objectStore('blobs').put(bytes, meta.id); t.objectStore('meta').put(meta); });
  // only automatic snapshots are pruned; named snapshots are never deleted without the user asking
  if (auto) {
    const autos = (await listSnapshots(meta.lineage)).filter((s) => s.auto);
    for (const s of autos.slice(keepAuto())) await deleteSnapshot(s.id);
  }
  return meta;
}

/** Restore a snapshot into `doc`. The current state is snapshotted first, so the restore itself can be undone. */
export async function restoreSnapshot(doc: DocEngine, s: SnapMeta): Promise<SnapMeta> {
  const bytes = await loadSnapshotBytes(s.id);
  if (!bytes) throw new Error('Snapshot data is missing from local storage.');
  const restored = await deserializeDoc(bytes); // validates before anything is replaced
  const before = await createSnapshot(doc, `Before restoring “${s.name}”`, 'Automatic safety snapshot', true);
  replaceContents(doc, restored);
  return before;
}

export async function branchFrom(doc: DocEngine, s: SnapMeta | null, name: string): Promise<DocEngine> {
  await createSnapshot(doc, `Branch point → ${name}`, s ? `Branch created from snapshot “${s.name}”` : 'Branch created from the current state', true);
  const bytes = s ? await loadSnapshotBytes(s.id) : await serializeDoc(doc, false);
  const d = await deserializeDoc(bytes);
  d.meta.lineage = lineageOf(doc);
  d.meta.uuid = uid('cbn-'); // a branch is its own document (links to it stay distinct)
  d.meta.branch = name;
  d.name = `${doc.name} [${name}]`;
  d.fileName = null;
  d.comic = null;
  d.dirty = true;
  addDoc(d);
  return d;
}

export interface Diff { a: string; b: string; heat: string; changedPct: number; dims: string; added: string[]; removed: string[]; renamed: string[]; objects3d: [number, number]; board: [number, number] }
export function compareDocs(A: DocEngine, B: DocEngine): Diff {
  const W = 360, s = Math.min(1, W / Math.max(A.width, A.height, B.width, B.height));
  const w = Math.max(1, Math.round(Math.max(A.width, B.width) * s)), h = Math.max(1, Math.round(Math.max(A.height, B.height) * s));
  const ca = createCanvas(w, h, true), cb = createCanvas(w, h, true), hm = createCanvas(w, h);
  ctxOf(ca).drawImage(compositeDoc(A, s), 0, 0);
  ctxOf(cb).drawImage(compositeDoc(B, s), 0, 0);
  const da = ctxOf(ca).getImageData(0, 0, w, h).data, dbb = ctxOf(cb).getImageData(0, 0, w, h).data;
  const hx = ctxOf(hm), hi = hx.createImageData(w, h);
  let changed = 0;
  for (let i = 0; i < da.length; i += 4) {
    const diff = Math.max(Math.abs(da[i] - dbb[i]), Math.abs(da[i + 1] - dbb[i + 1]), Math.abs(da[i + 2] - dbb[i + 2]), Math.abs(da[i + 3] - dbb[i + 3]));
    const g = (dbb[i] + dbb[i + 1] + dbb[i + 2]) / 3 * 0.35;
    if (diff > 10) { changed++; hi.data[i] = 255; hi.data[i + 1] = 60; hi.data[i + 2] = 60; } else { hi.data[i] = hi.data[i + 1] = hi.data[i + 2] = g; }
    hi.data[i + 3] = 255;
  }
  hx.putImageData(hi, 0, 0);
  const la = new Map(A.layers.map((l) => [l.id, l.name])), lb = new Map(B.layers.map((l) => [l.id, l.name]));
  const cnt = (d: DocEngine) => ((d.board as { items?: unknown[] } | null)?.items || []).length;
  return {
    a: ca.toDataURL(), b: cb.toDataURL(), heat: hm.toDataURL(), changedPct: (changed / (w * h)) * 100,
    dims: A.width === B.width && A.height === B.height ? `${A.width}×${A.height}` : `${A.width}×${A.height} → ${B.width}×${B.height}`,
    added: [...lb].filter(([id]) => !la.has(id)).map(([, n]) => n), removed: [...la].filter(([id]) => !lb.has(id)).map(([, n]) => n),
    renamed: [...lb].filter(([id, n]) => la.has(id) && la.get(id) !== n).map(([id, n]) => `${la.get(id)} → ${n}`),
    objects3d: [A.scene3d ? sceneOf(A.scene3d).objects.length : 0, B.scene3d ? sceneOf(B.scene3d).objects.length : 0], board: [cnt(A), cnt(B)],
  };
}

function CompareModal({ doc, a, b, onClose }: { doc: DocEngine; a: SnapMeta; b: SnapMeta | null; onClose: () => void }) {
  const [diff, setDiff] = useState<Diff | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    (async () => {
      try {
        const A = await deserializeDoc(await loadSnapshotBytes(a.id));
        const B = b ? await deserializeDoc(await loadSnapshotBytes(b.id)) : doc;
        setDiff(compareDocs(A, B));
      } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    })();
  }, [a, b, doc]);
  return (
    <Modal title={`Compare: “${a.name}” → ${b ? `“${b.name}”` : 'current state'}`} onClose={onClose} width={900}>
      {err ? <p className="text-red-300">{err}</p> : !diff ? <p className="text-neutral-400">Comparing…</p> : (
        <div className="space-y-3 text-[12px]">
          <div className="grid grid-cols-3 gap-3">
            {[['Before', diff.a], ['After', diff.b], ['Changed pixels (red)', diff.heat]].map(([l, u]) => (
              <figure key={l} className="space-y-1"><img src={u} alt={l} className="w-full rounded border border-white/10 bg-[repeating-conic-gradient(#444_0_25%,#666_0_50%)] bg-[length:12px_12px]" /><figcaption className="text-center text-[11px] text-neutral-400">{l}</figcaption></figure>
            ))}
          </div>
          <table className="w-full text-[12px]"><tbody>
            <tr><td className="py-0.5 pr-3 text-neutral-500">Visible change</td><td className="text-neutral-200">{diff.changedPct.toFixed(1)}% of the composite</td></tr>
            <tr><td className="py-0.5 pr-3 text-neutral-500">Canvas</td><td className="text-neutral-200">{diff.dims}</td></tr>
            <tr><td className="py-0.5 pr-3 text-neutral-500">Layers added</td><td className="text-emerald-300">{diff.added.join(', ') || '—'}</td></tr>
            <tr><td className="py-0.5 pr-3 text-neutral-500">Layers removed</td><td className="text-red-300">{diff.removed.join(', ') || '—'}</td></tr>
            <tr><td className="py-0.5 pr-3 text-neutral-500">Layers renamed</td><td className="text-neutral-200">{diff.renamed.join(', ') || '—'}</td></tr>
            <tr><td className="py-0.5 pr-3 text-neutral-500">3D objects &amp; strokes</td><td className="text-neutral-200">{diff.objects3d[0]} → {diff.objects3d[1]}</td></tr>
            <tr><td className="py-0.5 pr-3 text-neutral-500">Orbit Board items</td><td className="text-neutral-200">{diff.board[0]} → {diff.board[1]}</td></tr>
          </tbody></table>
        </div>
      )}
    </Modal>
  );
}

export function TimeMachinePanel() {
  useApp((s) => s.tick);
  const d = activeDoc();
  const [list, setList] = useState<SnapMeta[]>([]);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState<string[]>([]);
  const [cmp, setCmp] = useState<{ a: SnapMeta; b: SnapMeta | null } | null>(null);
  const [keep, setKeep] = useState(keepAuto());
  const lineage = d ? lineageOf(d) : '';
  const reload = () => { if (lineage) listSnapshots(lineage).then(setList).catch((e) => toast('Time Machine storage error: ' + e, 'error')); };
  useEffect(reload, [lineage]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!d) return <div className="text-[11px] text-neutral-500">No document open.</div>;
  const total = list.reduce((a, s) => a + s.size, 0);

  const snap = async () => {
    setBusy(true);
    try { await createSnapshot(d, name.trim() || `Snapshot ${list.filter((s) => !s.auto).length + 1}`, desc.trim()); setName(''); setDesc(''); toast('Snapshot saved', 'success'); reload(); }
    catch (e) { toast('Snapshot failed: ' + (e instanceof Error ? e.message : e), 'error'); }
    setBusy(false);
  };
  const restore = async (s: SnapMeta) => {
    const r = await confirmDialog(`Restore “${s.name}”?`,
      `This replaces this document's canvas size, all layers (raster, Crisp Ink, comic, masks, groups), 3D scene, Orbit Board, palette memory and project Color Dock with the snapshot from ${new Date(s.at).toLocaleString()}. ` +
      'Global settings, brushes and global palettes are not affected. Undo history is cleared, but your current state is saved first as an automatic “Before restoring…” snapshot, so you can always go back.',
      [{ label: 'Cancel', value: 'n' }, { label: 'Restore', value: 'y', variant: 'primary' }]);
    if (r !== 'y') return;
    setBusy(true);
    try { await restoreSnapshot(d, s); toast(`Restored “${s.name}”. The previous state was saved as a snapshot.`, 'success'); reload(); }
    catch (e) { toast('Restore failed, nothing was changed: ' + (e instanceof Error ? e.message : e), 'error'); }
    setBusy(false);
  };
  const branch = async (s: SnapMeta | null) => {
    const n = await promptDialog('New branch', 'Name the alternative branch (it opens as a separate document and shares this history):', 'experiment');
    if (!n) return;
    setBusy(true);
    try { await branchFrom(d, s, n.slice(0, 40)); toast(`Branch “${n}” opened in a new tab`, 'success'); reload(); }
    catch (e) { toast('Branch failed: ' + (e instanceof Error ? e.message : e), 'error'); }
    setBusy(false);
  };
  const del = async (s: SnapMeta) => {
    if ((await confirmDialog('Delete snapshot?', `“${s.name}” (${fmtBytes(s.size)}) will be permanently removed from this computer.`, [{ label: 'Cancel', value: 'n' }, { label: 'Delete', value: 'y', variant: 'danger' }])) !== 'y') return;
    await deleteSnapshot(s.id);
    setPick(pick.filter((x) => x !== s.id));
    reload();
  };

  return (
    <div className="space-y-2 text-[11px]">
      <div className="flex items-center gap-1 text-neutral-400"><GitBranch size={11} /> Branch <b className="text-neutral-200">{d.meta.branch || 'main'}</b><span className="ml-auto">{list.length} snapshots · {fmtBytes(total)}</span></div>
      <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') snap(); }} placeholder="Snapshot name (e.g. Inks done)" className="w-full rounded bg-neutral-900 px-2 py-1 text-neutral-100 outline-none ring-1 ring-white/10" />
      <input value={desc} onChange={(e) => setDesc(e.target.value)} onKeyDown={(e) => e.stopPropagation()} placeholder="Optional description" className="w-full rounded bg-neutral-900 px-2 py-1 text-neutral-200 outline-none ring-1 ring-white/10" />
      <div className="flex flex-wrap gap-1">
        <Btn variant="primary" disabled={busy} onClick={snap}><History size={11} /> {busy ? 'Working…' : 'Create snapshot'}</Btn>
        <Btn disabled={busy} onClick={() => branch(null)}><GitBranch size={11} /> Branch from current</Btn>
        <Btn disabled={pick.length !== 2} onClick={() => { const [x, y] = pick.map((id) => list.find((s) => s.id === id)!).sort((p, q) => p.at - q.at); setCmp({ a: x, b: y }); }}><Scale size={11} /> Compare 2</Btn>
      </div>
      <div className="max-h-[360px] space-y-1 overflow-y-auto pr-0.5">
        {list.map((s) => (
          <div key={s.id} className={cn('flex gap-2 rounded border p-1.5', pick.includes(s.id) ? 'border-[#E8913A]/60 bg-[#E8913A]/5' : 'border-white/5')}>
            <label className="flex shrink-0 flex-col items-center gap-1">
              <img src={s.thumb} alt="" className="h-12 w-16 rounded bg-neutral-800 object-contain" />
              <input type="checkbox" checked={pick.includes(s.id)} onChange={() => setPick(pick.includes(s.id) ? pick.filter((x) => x !== s.id) : [...pick.slice(-1), s.id])} title="Select for comparison" />
            </label>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1"><span className="truncate text-neutral-200">{s.name}</span>{s.auto && <span className="rounded bg-white/10 px-1 text-[9px] text-neutral-400">auto</span>}</div>
              <div className="text-[10px] text-neutral-500">{new Date(s.at).toLocaleString()} · {s.branch} · {s.w}×{s.h} · {s.layers} layers{s.objects3d ? ` · ${s.objects3d} 3D` : ''} · {fmtBytes(s.size)}</div>
              {s.desc && <div className="text-[10px] text-neutral-400">{s.desc}</div>}
              <div className="mt-1 flex flex-wrap gap-1">
                <Btn onClick={() => setCmp({ a: s, b: null })}>Compare with current</Btn>
                <Btn disabled={busy} onClick={() => restore(s)}><RotateCcw size={10} /> Restore…</Btn>
                <Btn disabled={busy} onClick={() => branch(s)}><GitBranch size={10} /></Btn>
                <Btn onClick={() => del(s)}><Trash2 size={10} /></Btn>
              </div>
            </div>
          </div>
        ))}
        {!list.length && <p className="text-[10px] text-neutral-500">No snapshots yet. A snapshot records the whole project (2D layers, 3D scene, board, palettes) separately from undo history and from your saved files.</p>}
      </div>
      <div className="flex items-center gap-2 border-t border-white/5 pt-2 text-[10px] text-neutral-500">
        Keep automatic snapshots
        <input type="number" min={1} max={100} value={keep} onKeyDown={(e) => e.stopPropagation()} onChange={(e) => { const v = Math.max(1, Math.min(100, Number(e.target.value) || 10)); setKeep(v); localStorage.setItem('carbon-tm-keep-auto', String(v)); }} className="w-12 rounded bg-neutral-900 px-1 text-neutral-200 outline-none ring-1 ring-white/10" />
        <span>(named snapshots are never pruned)</span>
      </div>
      {list.length > 0 && <Btn onClick={async () => { if ((await confirmDialog('Delete all snapshots?', `Permanently delete all ${list.length} snapshots (${fmtBytes(total)}) of this project's history from this computer? Your document is not affected.`, [{ label: 'Cancel', value: 'n' }, { label: 'Delete all', value: 'y', variant: 'danger' }])) === 'y') { for (const s of list) await deleteSnapshot(s.id); reload(); } }}>Delete all history…</Btn>}
      {cmp && <CompareModal doc={d} a={cmp.a} b={cmp.b} onClose={() => setCmp(null)} />}
      <p className="text-[10px] leading-snug text-neutral-600">Stored locally in this browser profile (IndexedDB “{DB}”), not inside the .carbon file. Drawing Replay data isn't included in snapshots.</p>
    </div>
  );
}

export { getApp };
