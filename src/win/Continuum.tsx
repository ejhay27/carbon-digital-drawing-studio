// Carbon Continuum: links between 2D documents, layers, 3D scenes and comic panels (Windows edition).
// A link is stored on the rendered layer (layer.link) and identifies the scene document by its stable
// meta.uuid, so it survives save/reopen. Missing scenes are detected and reported, never guessed.
import { useEffect, useState } from 'react';
import { AlertTriangle, Box, Camera, CheckCircle2, ExternalLink, LayoutDashboard, Link2, RefreshCw } from 'lucide-react';
import type { CamView, ComicPanel, Layer } from '../engine/types';
import type { DocEngine } from '../engine/document';
import { loadImage, uid } from '../engine/util';
import { activeDoc, getApp, setApp, toast, useApp } from '../state/store';
import { objBounds } from '../engine/comic';
import { Btn, Select } from '../components/ui';
import { docsWithScenes, findDoc, renderSceneImage, sceneOf, useNav, type Scene3D } from './sceneRender';
import { setWin, useWin } from './WinOverlay';

export interface CaptureOpts {
  target: DocEngine; sceneDoc: DocEngine; view: CamView; viewName?: string;
  rect: { x: number; y: number; w: number; h: number }; name: string; transparent: boolean;
  panelId?: string; replaceLayerId?: string;
}

/** Render a scene view and place it into a raster layer of `target` with a persistent link. Returns the layer id. */
export async function captureToLayer(o: CaptureOpts): Promise<string | null> {
  const scene = sceneOf(o.sceneDoc.scene3d);
  const url = await renderSceneImage(scene, o.view, o.rect.w, o.rect.h, { transparent: o.transparent, assets: o.sceneDoc.assetImgs });
  const img = await loadImage(url);
  const asset = uid('asset-');
  o.target.assets[asset] = url;
  o.target.assetImgs.set(asset, img);
  const link = { kind: 'scene' as const, doc: o.sceneDoc.meta.uuid, docName: o.sceneDoc.name, view: o.view, viewName: o.viewName, at: Date.now() };
  const r = o.rect;
  if (o.replaceLayerId && o.target.layer(o.replaceLayerId)) {
    const ok = o.target.exec({ k: 'imagePixels', layerId: o.replaceLayerId, asset, x: r.x, y: r.y, w: r.w, h: r.h, props: { link } });
    return ok ? o.replaceLayerId : null;
  }
  const id = uid('L');
  const index = o.target.layers.findIndex((l) => l.id === o.target.activeLayerId) + 1;
  const ok = o.target.exec({ k: 'image', layerId: id, name: o.name, asset, x: r.x, y: r.y, w: r.w, h: r.h, index: index > 0 ? index : o.target.layers.length, props: { link, ...(o.panelId ? { panelId: o.panelId } : {}) } });
  if (!ok) { toast('Could not add a layer (the 64-layer limit may have been reached).', 'error'); return null; }
  return id;
}

export type LinkStatus = { ok: true; scene: DocEngine } | { ok: false; reason: string };
export function linkStatus(L: Layer): LinkStatus {
  if (!L.link) return { ok: false, reason: 'Not linked' };
  const d = findDoc(L.link.doc);
  if (!d) return { ok: false, reason: `Scene document “${L.link.docName}” is not open. Open that .carbon file to recapture or return to it.` };
  const s = d.scene3d as Scene3D | null;
  if (!s || !Array.isArray(s.objects)) return { ok: false, reason: `“${d.name}” no longer contains a 3D scene.` };
  return { ok: true, scene: d };
}

/** Switch to the scene's document, open 3D Studio and (optionally) restore a camera view. */
export function openScene(uuid: string, view?: CamView) {
  const d = findDoc(uuid);
  if (!d) { toast('That scene document is not open. Open its .carbon file first.', 'error'); return false; }
  if (view) useNav.setState({ applyView: { doc: uuid, view } });
  setApp({ activeId: d.id });
  setWin({ workspace: '3d' });
  return true;
}

export async function recaptureLayer(doc: DocEngine, L: Layer) {
  const st = linkStatus(L);
  if (!st.ok) return toast(st.reason, 'error');
  const panel = L.panelId ? panelById(doc, L.panelId) : null;
  const rect = panel ? panelRect(panel) : { x: 0, y: 0, w: doc.width, h: doc.height };
  try {
    await captureToLayer({ target: doc, sceneDoc: st.scene, view: L.link!.view, viewName: L.link!.viewName, rect, name: L.name, transparent: true, replaceLayerId: L.id, panelId: L.panelId });
    toast('Recaptured from the current scene', 'success');
  } catch (e) { toast('Recapture failed: ' + (e instanceof Error ? e.message : e), 'error'); }
}

// ---------------------------------------------------------------- Orbit-to-Comic
export function panelById(doc: DocEngine, id: string): ComicPanel | null {
  for (const L of doc.layers) if (L.type === 'comic') for (const o of L.comic || []) if (o.type === 'panel' && o.id === id) return o;
  return null;
}
export function panelRect(p: ComicPanel) {
  const b = objBounds(p);
  return { x: Math.floor(b.x), y: Math.floor(b.y), w: Math.max(16, Math.ceil(b.w)), h: Math.max(16, Math.ceil(b.h)) };
}

/** Called from 3D Studio's banner: write the camera into the panel's capture layer and re-render it. */
export async function finishPanelEdit(view: CamView) {
  const pe = useNav.getState().panelEdit;
  if (!pe) return;
  const page = findDoc(pe.pageDoc), sceneDoc = findDoc(pe.sceneDoc);
  if (!page || !sceneDoc) throw new Error('The comic page or scene document is no longer open.');
  const panel = panelById(page, pe.panelId);
  if (!panel) throw new Error('That panel no longer exists on the page.');
  const existing = page.layer(pe.layerId);
  await captureToLayer({ target: page, sceneDoc, view, rect: panelRect(panel), name: existing?.name || 'Panel capture', transparent: false, panelId: panel.id, replaceLayerId: existing ? existing.id : undefined });
  useNav.setState({ panelEdit: null });
  setApp({ activeId: page.id });
  setWin({ workspace: 'comic', comic: { ...useWin.getState().comic, selected: panel.id, mode: 'select' } });
  toast('Panel camera saved and recaptured. Other panels are unchanged.', 'success');
}

/** Panel editor section (Comic Studio): capture a 3D view into this panel, with its own camera. */
export function PanelCapture({ panel }: { panel: ComicPanel }) {
  useApp((s) => s.tick);
  const page = activeDoc()!;
  const scenes = docsWithScenes();
  const cap = page.layers.find((l) => l.panelId === panel.id && l.link);
  const [src, setSrc] = useState<string>(cap?.link?.doc || scenes.find((d) => d.id === page.id)?.meta.uuid || scenes[0]?.meta.uuid || '');
  const [vid, setVid] = useState<string>('__live');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (cap?.link) setSrc(cap.link.doc); }, [cap?.link?.doc]); // eslint-disable-line react-hooks/exhaustive-deps
  const srcDoc = findDoc(src);
  const scene = srcDoc ? sceneOf(srcDoc.scene3d) : null;
  const status = cap ? linkStatus(cap) : null;
  const pickView = (): { view: CamView; name?: string } | null => {
    if (!scene) return null;
    if (vid !== '__live') { const v = scene.views.find((x) => x.id === vid); if (v) return { view: v.view, name: v.name }; }
    return scene.camera ? { view: scene.camera, name: 'Scene camera' } : null;
  };
  const capture = async () => {
    const v = pickView();
    if (!srcDoc || !v) return toast('Choose a scene. Open it in 3D Studio once so it has a camera, or save a named view.', 'error');
    setBusy(true);
    try {
      const n = page.layers.filter((l) => l.panelId).length + 1;
      await captureToLayer({ target: page, sceneDoc: srcDoc, view: v.view, viewName: v.name, rect: panelRect(panel), name: cap?.name || `Panel ${n} · ${v.name || '3D'}`, transparent: false, panelId: panel.id, replaceLayerId: cap?.id });
      toast('3D view captured into the panel', 'success');
    } catch (e) { toast('Capture failed: ' + (e instanceof Error ? e.message : e), 'error'); }
    setBusy(false);
  };
  const frameIn3D = () => {
    if (!srcDoc) return;
    const r = panelRect(panel);
    const capLayer = cap || null;
    useNav.setState({ panelEdit: { pageDoc: page.meta.uuid, panelId: panel.id, layerId: capLayer?.id || '', sceneDoc: srcDoc.meta.uuid, aspect: r.w / r.h } });
    openScene(srcDoc.meta.uuid, capLayer?.link?.view || pickView()?.view);
  };
  return (
    <div className="space-y-1 rounded-md border border-white/5 bg-white/[0.02] p-2">
      <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-500"><Camera size={11} /> 3D capture (Orbit-to-Comic)</div>
      {!scenes.length ? (
        <p className="text-[10px] text-neutral-500">No open document has a 3D scene yet. Open 3D Studio, draw or build a scene and save a camera view, then come back here.</p>
      ) : (
        <>
          <Select label="Scene" value={src} onChange={(v) => { setSrc(v); setVid('__live'); }} options={scenes.map((d) => ({ value: d.meta.uuid, label: d.id === page.id ? `${d.name} (this page)` : d.name }))} />
          {scene && <Select label="Camera" value={vid} onChange={setVid} options={[{ value: '__live', label: 'Scene camera (last used)' }, ...scene.views.map((v) => ({ value: v.id, label: v.name }))]} />}
          <div className="flex flex-wrap gap-1">
            <Btn variant="primary" disabled={busy || !srcDoc} onClick={capture}>{busy ? 'Capturing…' : cap ? 'Recapture with this camera' : 'Capture into panel'}</Btn>
            <Btn disabled={!srcDoc} onClick={frameIn3D} title="Open the scene with this panel's camera, adjust it, then save back to this panel only">Frame in 3D…</Btn>
          </div>
        </>
      )}
      {cap && (
        <div className="text-[10px] leading-snug">
          {status?.ok ? <span className="flex items-center gap-1 text-emerald-300"><CheckCircle2 size={10} /> Linked to “{cap.link!.docName}”{cap.link!.viewName ? ` · ${cap.link!.viewName}` : ''}</span> : <span className="flex items-start gap-1 text-amber-300"><AlertTriangle size={10} className="mt-px shrink-0" /> {status && !status.ok ? status.reason : ''}</span>}
          <div className="mt-1 flex gap-1">
            <Btn onClick={() => { page.setActive(cap.id); }}>Select layer</Btn>
            {status?.ok && <Btn onClick={() => openScene(cap.link!.doc, cap.link!.view)}><ExternalLink size={10} /> Open scene</Btn>}
          </div>
        </div>
      )}
      <p className="text-[10px] text-neutral-500">Each panel keeps its own copy of the camera, so changing one panel never moves another. The capture is a normal raster layer clipped to this panel. You can paint over it and recapture at any time.</p>
    </div>
  );
}

/** Layers panel section for a linked (rendered-from-3D) layer. */
export function LayerLinkTools({ doc, L }: { doc: DocEngine; L: Layer }) {
  const st = linkStatus(L);
  return (
    <div className="space-y-1 rounded bg-sky-500/5 p-1.5 text-[10px] ring-1 ring-sky-400/20">
      <div className="flex items-center gap-1 text-sky-300"><Link2 size={10} /> Rendered from 3D scene “{L.link!.docName}”{L.link!.viewName ? ` · ${L.link!.viewName}` : ''}</div>
      {!st.ok && <div className="flex items-start gap-1 text-amber-300"><AlertTriangle size={10} className="mt-px shrink-0" />{st.reason}</div>}
      <div className="flex flex-wrap gap-1">
        <Btn disabled={!st.ok} onClick={() => openScene(L.link!.doc, L.link!.view)}><Box size={10} /> Return to scene</Btn>
        <Btn disabled={!st.ok} onClick={() => recaptureLayer(doc, L)}><RefreshCw size={10} /> Recapture</Btn>
        <Btn onClick={() => doc.exec({ k: 'layerProp', layerId: L.id, props: { link: undefined } })} title="Keep the pixels, forget the scene link">Unlink</Btn>
      </div>
      <div className="text-neutral-500">Captured {new Date(L.link!.at).toLocaleString()}</div>
    </div>
  );
}

// ---------------------------------------------------------------- project panel
export function ContinuumPanel() {
  useApp((s) => s.tick);
  const d = activeDoc();
  if (!d) return <div className="text-[11px] text-neutral-500">No document open.</div>;
  const scene = d.scene3d ? sceneOf(d.scene3d) : null;
  const strokes = scene?.objects.filter((o) => o.kind === 'curve').length || 0;
  const linked = d.layers.filter((l) => l.link);
  const others = getApp().docs.filter((x) => x.id !== d.id && x.layers.some((l) => l.link?.doc === d.meta.uuid));
  const pages = d.comic ? getApp().docs.filter((x) => x.comic?.id === d.comic!.id).sort((a, b) => a.comic!.index - b.comic!.index) : [];
  const board = d.board as { items?: unknown[] } | null;
  const pm = d.paletteMemory as { snapshots?: unknown[] } | null;
  const row = (icon: React.ReactNode, label: string, value: React.ReactNode, action?: React.ReactNode) => (
    <div className="flex items-center gap-2 rounded px-1 py-1 hover:bg-white/[0.03]"><span className="text-neutral-500">{icon}</span><span className="flex-1 text-neutral-300">{label}</span><span className="text-neutral-500">{value}</span>{action}</div>
  );
  return (
    <div className="space-y-2 text-[11px]">
      <p className="text-[10px] leading-snug text-neutral-500">A Carbon project is this .carbon document: 2D layers, its 3D scene, Orbit Board, palette memory and comic page all live inside it. Rendered layers link to scenes by document ID, so the links survive saving and reopening.</p>
      <div className="rounded border border-white/5">
        {row(<Box size={12} />, '3D scene', scene ? `${scene.objects.length} objects · ${strokes} strokes · ${scene.views.length} views` : 'none', <Btn onClick={() => setWin({ workspace: '3d' })}>Open</Btn>)}
        {row(<LayoutDashboard size={12} />, 'Orbit Board', board?.items ? `${board.items.length} items` : 'empty', <Btn onClick={() => setWin({ workspace: 'board' })}>Open</Btn>)}
        {row(<span className="text-[10px]">🎨</span>, 'Palette memory', pm?.snapshots ? `${pm.snapshots.length} snapshots` : 'none')}
        {d.comic && row(<span className="text-[10px]">▦</span>, `Comic “${d.comic.name}”`, `${pages.length} open pages`, <Btn onClick={() => setWin({ workspace: 'comic' })}>Open</Btn>)}
      </div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Linked layers ({linked.length})</div>
      {linked.length ? linked.map((L) => {
        const s = linkStatus(L);
        return (
          <div key={L.id} className="rounded border border-white/5 p-1.5">
            <div className="flex items-center gap-1">
              {s.ok ? <CheckCircle2 size={11} className="text-emerald-400" /> : <AlertTriangle size={11} className="text-amber-400" />}
              <button className="flex-1 truncate text-left text-neutral-200 hover:underline" onClick={() => { d.setActive(L.id); setWin({ workspace: d.comic ? 'comic' : 'draw' }); }}>{L.name}</button>
            </div>
            <div className="truncate text-[10px] text-neutral-500">{L.panelId ? 'Comic panel · ' : ''}{L.link!.docName}{L.link!.viewName ? ` · ${L.link!.viewName}` : ''}</div>
            {!s.ok && <div className="text-[10px] text-amber-300">{s.reason}</div>}
            <div className="mt-1 flex gap-1"><Btn disabled={!s.ok} onClick={() => openScene(L.link!.doc, L.link!.view)}>Scene</Btn><Btn disabled={!s.ok} onClick={() => recaptureLayer(d, L)}>Recapture</Btn></div>
          </div>
        );
      }) : <p className="text-[10px] text-neutral-500">None yet. In 3D Studio use “Render view to linked 2D layer”, or capture into a comic panel.</p>}
      {others.length > 0 && (
        <>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Open documents using this scene</div>
          {others.map((o) => <button key={o.id} className="block w-full truncate rounded px-1 py-0.5 text-left text-neutral-300 hover:bg-white/5" onClick={() => setApp({ activeId: o.id })}>{o.name} · {o.layers.filter((l) => l.link?.doc === d.meta.uuid).length} linked layer(s)</button>)}
        </>
      )}
      <div className="text-[10px] text-neutral-600">Document ID {d.meta.uuid}{d.meta.branch ? ` · branch “${d.meta.branch}”` : ''}</div>
    </div>
  );
}
