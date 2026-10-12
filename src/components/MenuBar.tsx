import { useEffect, useRef, useState } from 'react';
import { Check, Home as HomeIcon } from 'lucide-react';
import { activeDoc, getApp, PANEL_TITLES, resetLayout, setApp, setTool, togglePanel, toast, updatePalette, updateSettings, updateToolOpts, useApp, type PanelId } from '../state/store';
import { closeDoc, duplicateDoc, importImageFile, listRecent, navigateHomeSafely, openRecent, pickFile, saveActiveDocument, shareProject } from '../state/actions';
import { isNative } from '../platform/native';
import { EDITION } from '../platform/edition';
import { updateDock, useDock } from '../win/dockModel';
import { WIN_PANELS } from '../state/store';
import { addLayer, fitView, prettyCombo, rotateView, runAction } from '../state/commands';
import { duplicateCurrent, exportBrushList, importBrushPack } from './Brushes';
import { uid } from '../engine/util';
import { cn } from '../utils/cn';

type Item = { label: string; action?: () => void; sc?: string; disabled?: boolean; checked?: boolean; header?: boolean } | 'sep';

export default function MenuBar() {
  const [open, setOpen] = useState<string | null>(null);
  const [recent, setRecent] = useState<{ key: string; name: string }[]>([]);
  const ref = useRef<HTMLDivElement>(null);
  const s = useApp();
  useApp((x) => x.tick);
  const d = activeDoc();
  const sc = (id: string) => (s.settings.shortcuts[id] ? prettyCombo(s.settings.shortcuts[id]) : undefined);
  const A = d?.active;
  const noDoc = !d;
  const replayOn = !!s.replay;
  const dockOn = useDock((x) => x.cfg.enabled); // Window › Color Dock menu toggle

  useEffect(() => {
    if (open === 'File') listRecent().then((r) => setRecent(r.map((x) => ({ key: x.key, name: x.value.name }))));
    const h = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(null); };
    window.addEventListener('pointerdown', h);
    return () => window.removeEventListener('pointerdown', h);
  }, [open]);

  const filt = (f: 'invert' | 'grayscale' | 'blur' | 'sepia' | 'brightness' | 'contrast', amount = 1) => () => {
    if (!d || !A) return;
    if (A.type !== 'raster') return toast('Filters apply to raster layers', 'error');
    d.exec({ k: 'filter', layerId: A.id, f, amount });
  };

  const menus: Record<string, Item[]> = {
    File: [
      { label: EDITION.windows ? 'Create / New…' : 'New Canvas…', action: () => runAction('file.new'), sc: sc('file.new') },
      { label: 'Open…', action: () => runAction('file.open'), sc: sc('file.open') },
      { label: 'My Illustrations…', action: () => setApp({ dialog: 'projects' }) },
      'sep',
      { label: 'Open Recent', header: true },
      ...(recent.length ? recent.slice(0, 8).map((r) => ({ label: '   ' + r.name, action: () => openRecent(r.key) })) : [{ label: '   (no recent documents)', disabled: true }]),
      'sep',
      { label: 'Save', action: () => runAction('file.save'), sc: sc('file.save'), disabled: noDoc },
      { label: 'Save As…', action: () => runAction('file.saveAs'), sc: sc('file.saveAs'), disabled: noDoc },
      { label: 'Save a Copy…', action: () => d && saveActiveDocument('copy'), disabled: noDoc },
      { label: 'Duplicate Document', action: () => d && duplicateDoc(d), disabled: noDoc },
      ...(isNative() ? [{ label: 'Share Project…', action: () => d && shareProject(d), disabled: noDoc }] : []),
      'sep',
      { label: 'Import Image as Layer…', disabled: noDoc || replayOn, action: async () => { const f = await pickFile('image/png,image/jpeg,image/webp,image/gif'); if (f && d) importImageFile(d, f); } },
      { label: 'Export Image…', action: () => runAction('file.export'), sc: sc('file.export'), disabled: noDoc },
      { label: 'Export Replay Video…', action: () => runAction('replay.toggle'), disabled: noDoc },
      'sep',
      { label: 'Document Information', action: () => togglePanel('docInfo'), disabled: noDoc },
      { label: 'Close Document', action: () => d && closeDoc(d.id), disabled: noDoc },
    ],
    Edit: [
      { label: `Undo ${d?.undoStack[d.undoStack.length - 1]?.label || ''}`, action: () => runAction('edit.undo'), sc: sc('edit.undo'), disabled: !d?.undoStack.length },
      { label: `Redo ${d?.redoStack[d.redoStack.length - 1]?.label || ''}`, action: () => runAction('edit.redo'), sc: sc('edit.redo'), disabled: !d?.redoStack.length },
      'sep',
      { label: 'Clear', action: () => runAction('edit.clear'), sc: sc('edit.clear'), disabled: noDoc },
      { label: 'Fill with Foreground Color', action: () => runAction('edit.fillSel'), disabled: noDoc || A?.type !== 'raster' },
      { label: 'Transform', action: () => setTool('transform'), sc: sc('tool.transform'), disabled: noDoc },
      'sep',
      { label: 'Preferences…', action: () => setApp({ dialog: 'settings' }) },
    ],
    Canvas: [
      { label: 'Canvas Size…', action: () => setApp({ dialog: 'canvasSize' }), disabled: noDoc },
      { label: 'Image Size…', action: () => setApp({ dialog: 'imageSize' }), disabled: noDoc },
      'sep',
      { label: 'Flip Canvas Horizontal', action: () => d?.exec({ k: 'flip', axis: 'h' }), disabled: noDoc },
      { label: 'Flip Canvas Vertical', action: () => d?.exec({ k: 'flip', axis: 'v' }), disabled: noDoc },
      { label: 'Rotate 90° Clockwise', action: () => d?.exec({ k: 'rotate', dir: 1 }), disabled: noDoc },
      { label: 'Rotate 90° Counter-clockwise', action: () => d?.exec({ k: 'rotate', dir: -1 }), disabled: noDoc },
      'sep',
      { label: 'Background: White', action: () => d?.exec({ k: 'bg', color: '#ffffff' }), checked: d?.background === '#ffffff', disabled: noDoc },
      { label: 'Background: Transparent', action: () => d?.exec({ k: 'bg', color: null }), checked: !!d && !d.background, disabled: noDoc },
      { label: 'Background: Foreground Color', action: () => d?.exec({ k: 'bg', color: s.fg }), disabled: noDoc },
    ],
    Layer: [
      { label: 'New Raster Layer', action: () => addLayer('raster'), sc: sc('layer.new'), disabled: noDoc },
      { label: 'New Crisp Ink Layer', action: () => addLayer('ink'), sc: sc('layer.newInk'), disabled: noDoc },
      { label: 'Duplicate Layer', action: () => A && d?.exec({ k: 'layerDup', layerId: A.id, newId: uid('L') }), disabled: !A },
      { label: 'Delete Layer', action: () => A && d?.exec({ k: 'layerDel', layerId: A.id }), disabled: !A || (d?.layers.length || 0) <= 1 },
      { label: 'Merge Down', action: () => A && d?.exec({ k: 'mergeDown', layerId: A.id }), disabled: !A || d?.layers[0].id === A.id },
      { label: 'Rasterize Crisp Ink', action: () => A && d?.exec({ k: 'rasterize', layerId: A.id }), disabled: A?.type !== 'ink' },
      { label: 'Clear Layer', action: () => A && d?.exec({ k: 'layerClear', layerId: A.id }), disabled: !A },
      'sep',
      { label: 'Visible', checked: A?.visible, action: () => A && d?.exec({ k: 'layerProp', layerId: A.id, props: { visible: !A.visible } }), disabled: !A },
      { label: 'Locked', checked: A?.locked, action: () => A && d?.exec({ k: 'layerProp', layerId: A.id, props: { locked: !A.locked } }), disabled: !A },
      { label: 'Alpha Lock', checked: A?.alphaLock, action: () => A && d?.exec({ k: 'layerProp', layerId: A.id, props: { alphaLock: !A.alphaLock } }), disabled: A?.type !== 'raster' },
      'sep',
      { label: 'Filter: Invert', action: filt('invert'), disabled: !A },
      { label: 'Filter: Grayscale', action: filt('grayscale'), disabled: !A },
      { label: 'Filter: Sepia', action: filt('sepia'), disabled: !A },
      { label: 'Filter: Gaussian Blur (4px)', action: filt('blur', 4), disabled: !A },
      { label: 'Filter: Brighten', action: filt('brightness', 1.15), disabled: !A },
      { label: 'Filter: Increase Contrast', action: filt('contrast', 1.2), disabled: !A },
    ],
    Select: [
      { label: 'Select All', action: () => runAction('select.all'), sc: sc('select.all'), disabled: noDoc },
      { label: 'Deselect', action: () => runAction('select.none'), sc: sc('select.none'), disabled: !d?.selection },
      { label: 'Invert Selection', action: () => runAction('select.invert'), sc: sc('select.invert'), disabled: !d?.selection },
      'sep',
      { label: 'Rectangle Selection', checked: s.tool === 'select' && s.toolOpts.selMode === 'rect', action: () => { updateToolOpts({ selMode: 'rect' }); setTool('select'); } },
      { label: 'Ellipse Selection', checked: s.tool === 'select' && s.toolOpts.selMode === 'ellipse', action: () => { updateToolOpts({ selMode: 'ellipse' }); setTool('select'); } },
      { label: 'Freehand Selection', checked: s.tool === 'select' && s.toolOpts.selMode === 'lasso', action: () => { updateToolOpts({ selMode: 'lasso' }); setTool('select'); } },
    ],
    View: [
      { label: 'Zoom In', action: () => runAction('view.zoomIn'), sc: sc('view.zoomIn'), disabled: noDoc },
      { label: 'Zoom Out', action: () => runAction('view.zoomOut'), sc: sc('view.zoomOut'), disabled: noDoc },
      { label: 'Fit to Screen', action: () => runAction('view.fit'), sc: sc('view.fit'), disabled: noDoc },
      { label: 'Fit to Width', action: () => d && fitView(d, 'width'), disabled: noDoc },
      { label: 'Actual Size', action: () => runAction('view.actual'), sc: sc('view.actual'), disabled: noDoc },
      'sep',
      { label: 'Rotate View Left 15°', action: () => d && rotateView(d, -15), disabled: noDoc },
      { label: 'Rotate View Right 15°', action: () => d && rotateView(d, 15), disabled: noDoc },
      { label: 'Reset Rotation', action: () => runAction('view.resetRotation'), sc: sc('view.resetRotation'), disabled: noDoc },
      { label: 'Mirror View', checked: d?.view.flip, action: () => { if (d) { d.view = { ...d.view, flip: !d.view.flip }; d.emit(); } }, disabled: noDoc },
      'sep',
      { label: 'Grid', checked: s.settings.showGrid, action: () => updateSettings({ showGrid: !s.settings.showGrid }) },
      { label: 'Rulers (click ruler to add guide)', checked: s.settings.showRulers, action: () => updateSettings({ showRulers: !s.settings.showRulers }) },
      { label: 'Guides', checked: s.settings.showGuides, action: () => updateSettings({ showGuides: !s.settings.showGuides }) },
      { label: 'Clear Guides', action: () => d && setApp({ guides: { ...s.guides, [d.id]: { v: [], h: [] } } }), disabled: !d || !s.guides[d.id] },
      { label: 'Perspective Guide (2-point)', checked: s.settings.perspective, action: () => updateSettings({ perspective: !s.settings.perspective }) },
      'sep',
      { label: 'Canvas-only Mode', checked: s.canvasOnly, action: () => runAction('view.canvasOnly'), sc: sc('view.canvasOnly') },
    ],
    Brush: [
      { label: 'Brush Library', action: () => togglePanel('brushes'), checked: !s.layout.hidden.includes('brushes') },
      { label: 'Brush Studio', action: () => togglePanel('brushStudio'), checked: !s.layout.hidden.includes('brushStudio') },
      'sep',
      { label: 'Increase Size', action: () => runAction('brush.larger'), sc: sc('brush.larger') },
      { label: 'Decrease Size', action: () => runAction('brush.smaller'), sc: sc('brush.smaller') },
      'sep',
      { label: 'Duplicate Current Brush', action: duplicateCurrent },
      ...(EDITION.windows ? [{ label: 'Brush Fusion…', action: () => setApp({ dialog: 'fusion' }) }] : []),
      { label: 'Import Brush Pack…', action: importBrushPack },
      { label: 'Export Custom Brushes…', action: () => exportBrushList(s.customBrushes, 'carbon-custom-brushes') },
    ],
    Window: [
      ...(Object.keys(PANEL_TITLES) as PanelId[]).filter((id) => EDITION.windows || !WIN_PANELS.includes(id)).map((id) => ({ label: PANEL_TITLES[id], checked: !s.layout.hidden.includes(id), action: () => togglePanel(id) })),
      'sep',
      { label: 'Floating Tool Palette', checked: s.palette.visible, action: () => updatePalette({ visible: !s.palette.visible, collapsed: false }) },
      ...(EDITION.windows ? [{ label: 'Color Dock', checked: dockOn, action: () => updateDock({ enabled: !dockOn }) }] : []),
      { label: 'Tool Rail', checked: s.layout.railVisible, action: () => setApp({ layout: { ...s.layout, railVisible: !s.layout.railVisible } }) },
      { label: 'Panel Dock', checked: s.layout.dockOpen, action: () => setApp({ layout: { ...s.layout, dockOpen: !s.layout.dockOpen } }) },
      'sep',
      { label: 'Reset Workspace Layout', action: () => { resetLayout(); toast('Workspace reset'); } },
    ],
    Settings: [
      { label: 'Preferences…', action: () => setApp({ dialog: 'settings' }) },
      { label: 'Keyboard Shortcuts…', action: () => setApp({ dialog: 'shortcuts' }) },
      ...(EDITION.windows ? [{ label: 'Canvas & Workspace › Color Dock…', action: () => setApp({ dialog: 'colorDock' }) }] : []),
      'sep',
      { label: 'Interface: Automatic', checked: s.settings.uiMode === 'auto', action: () => updateSettings({ uiMode: 'auto' }) },
      { label: 'Interface: Desktop', checked: s.settings.uiMode === 'desktop', action: () => updateSettings({ uiMode: 'desktop' }) },
      { label: 'Interface: Tablet', checked: s.settings.uiMode === 'tablet', action: () => updateSettings({ uiMode: 'tablet' }) },
      'sep',
      { label: 'Stylus-only Drawing (touch pans)', checked: s.settings.stylusOnly, action: () => updateSettings({ stylusOnly: !s.settings.stylusOnly }) },
      { label: 'Record New Documents by Default', checked: s.settings.recordByDefault, action: () => updateSettings({ recordByDefault: !s.settings.recordByDefault }) },
    ],
    Help: [
      { label: 'Command Palette…', action: () => setApp({ dialog: 'commandPalette' }), sc: sc('app.commandPalette') },
      { label: 'Offline Quick Start…', action: () => setApp({ dialog: 'quickStart' }) },
      { label: 'Keyboard Shortcuts', action: () => setApp({ dialog: 'shortcuts' }) },
      ...(EDITION.windows ? [{ label: "Latest Patches / What's New", action: () => setApp({ dialog: 'patches' }) }] : []),
      { label: 'Run Diagnostics (acceptance tests)', action: () => setApp({ dialog: 'diagnostics' }) },
      { label: 'Architecture & File Format', action: () => setApp({ dialog: 'docs' }) },
      { label: 'CARBON Space: 3D Roadmap', action: () => setApp({ dialog: 'space' }) },
      'sep',
      { label: 'About CARBON', action: () => setApp({ dialog: 'about' }) },
    ],
  };

  return (
    <div ref={ref} className="carbon-ui-toolbar flex h-8 shrink-0 items-center gap-0.5 border-b border-black/60 bg-[#111113] px-2 text-[12px] text-neutral-300">
      <button disabled={s.homeSaving} onClick={() => { setOpen(null); void navigateHomeSafely(); }} className="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-neutral-300 hover:bg-white/5 hover:text-white disabled:opacity-50" title="Save unsaved work before returning Home">
        <HomeIcon size={13} /> {s.homeSaving ? 'Saving…' : 'Home'}
      </button>
      {Object.entries(menus).map(([name, items]) => (
        <div key={name} className="relative">
          <button
            className={cn('rounded px-2 py-1', open === name ? 'bg-white/10 text-white' : 'hover:bg-white/5')}
            onClick={() => setOpen(open === name ? null : name)}
            onPointerEnter={() => open && setOpen(name)}
          >{name}</button>
          {open === name && (
            <div className="carbon-ui-popover absolute left-0 top-full z-[90] mt-0.5 min-w-[240px] rounded-lg border border-white/10 bg-[#1e1e21] py-1 shadow-2xl">
              {items.map((it, i) => it === 'sep' ? <div key={i} className="carbon-ui-divider my-1 h-px bg-white/5" /> : it.header ? (
                <div key={i} className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">{it.label}</div>
              ) : (
                <button
                  key={i}
                  disabled={it.disabled}
                  onClick={() => { setOpen(null); it.action?.(); }}
                  className="flex w-full items-center gap-2 px-3 py-1 text-left text-[12px] text-neutral-200 hover:bg-[#E8913A]/20 disabled:cursor-default disabled:text-neutral-600 disabled:hover:bg-transparent"
                >
                  <span className="w-3">{it.checked && <Check size={11} />}</span>
                  <span className="flex-1 truncate">{it.label}</span>
                  {it.sc && <span className="font-mono text-[10px] text-neutral-500">{it.sc}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
      <div className="flex-1" />
      <button onClick={() => getApp().set({ canvasOnly: true })} className="rounded px-2 py-0.5 text-[11px] text-neutral-500 hover:bg-white/5 hover:text-white" title="Canvas-only mode (Tab)">Focus</button>
    </div>
  );
}
